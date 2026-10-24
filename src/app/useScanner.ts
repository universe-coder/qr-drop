/**
 * Приём: камера -> воркер -> сессия сборки.
 *
 * Кадры берутся не подряд, а «по готовности»: пока воркер разбирает один
 * снимок, следующий не запрашивается. Иначе очередь распознавания растёт
 * быстрее, чем разгребается, и приложение начинает показывать состояние
 * секундной давности.
 *
 * Распознаётся не весь кадр, а центральный квадрат под прицелом в интерфейсе:
 * это и втрое дешевле, и заодно избавляет от чужих QR-кодов по краям.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReceiveStats } from '../protocol/receiver';
import { ReceiveOutcome } from '../protocol/receiver';
import type { ScanRequest, ScanResponse } from '../qr/scan.worker';
import {
  CameraError,
  requestContinuousFocus,
  setTorch,
  startCamera,
  supportsTorch,
  type CameraHandle,
} from '../platform/camera';

/** Сторона квадрата, который отправляется на распознавание, в пикселях. */
const SCAN_SIZE = 512;
/** Верхний предел попыток распознавания в секунду. */
const MAX_SCANS_PER_SECOND = 20;
/**
 * Сколько ждать ответа воркера, прежде чем считать кадр потерянным.
 * Воркер может умереть молча — например, если браузер отобрал память на
 * многоминутной съёмке, — и без этого сторожа приём замер бы навсегда.
 */
const WORKER_REPLY_TIMEOUT_MS = 2500;

export const ScanPhase = {
  Idle: 'idle',
  Starting: 'starting',
  Searching: 'searching',
  Receiving: 'receiving',
  Done: 'done',
  Failed: 'failed',
} as const;

export type ScanPhase = (typeof ScanPhase)[keyof typeof ScanPhase];

export interface ReceivedFile {
  data: Uint8Array;
  name: string;
  mime: string;
}

export const ScanError = {
  /** Хэш не сошёлся, сборка сброшена, приём продолжается. */
  IntegrityRetry: 'integrity-retry',
  /** Хэш не сошёлся второй раз — дальше бессмысленно. */
  IntegrityFailed: 'integrity-failed',
  /** Отправитель на другой версии протокола. */
  Incompatible: 'incompatible',
  /** Воркер распознавания не запустился или упал. */
  WorkerFailed: 'worker-failed',
} as const;

export type ScanError = (typeof ScanError)[keyof typeof ScanError];

export interface ScannerState {
  phase: ScanPhase;
  stats: ReceiveStats;
  fileName: string | null;
  fileSize: number;
  /** Успешных распознаваний в секунду — показывает, ловится ли поток вообще. */
  captureRate: number;
  /** Секунд с последнего принятого кадра. */
  sinceLastFrame: number;
  torchAvailable: boolean;
  torchOn: boolean;
  cameraError: CameraError | null;
  error: ScanError | null;
}

const EMPTY_STATS: ReceiveStats = {
  framesAccepted: 0,
  framesCorrupt: 0,
  framesRedundant: 0,
  blocksRecovered: 0,
  blockCount: 0,
  bytesRecovered: 0,
  bytesTotal: 0,
};

const INITIAL: ScannerState = {
  phase: ScanPhase.Idle,
  stats: EMPTY_STATS,
  fileName: null,
  fileSize: 0,
  captureRate: 0,
  sinceLastFrame: 0,
  torchAvailable: false,
  torchOn: false,
  cameraError: null,
  error: null,
};

export function useScanner(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  onComplete: (file: ReceivedFile) => void,
) {
  const [state, setState] = useState<ScannerState>(INITIAL);

  const workerRef = useRef<Worker | null>(null);
  const cameraRef = useRef<CameraHandle | null>(null);
  const busyRef = useRef(false);
  const runningRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const fallbackCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const completeRef = useRef(onComplete);
  /** Номер запуска: всё, что относится к прошлому запуску, игнорируется. */
  const runIdRef = useRef(0);
  /** Когда был отправлен кадр, на который ещё не пришёл ответ. */
  const sentAtRef = useRef(0);

  /** Отметки времени принятых кадров за последнюю секунду. */
  const recentRef = useRef<number[]>([]);
  const lastFrameAtRef = useRef(0);

  useLayoutEffect(() => {
    completeRef.current = onComplete;
  }, [onComplete]);

  const stop = useCallback(() => {
    // Сдвигаем поколение: запуск, который сейчас ждёт разрешения на камеру,
    // увидит это и свернётся сам, вместо того чтобы ожить после остановки.
    runIdRef.current++;
    runningRef.current = false;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
    cameraRef.current?.stop();
    cameraRef.current = null;
    workerRef.current?.terminate();
    workerRef.current = null;
    busyRef.current = false;
    recentRef.current = [];
    setState(INITIAL);
  }, []);

  useEffect(() => stop, [stop]);

  const toggleTorch = useCallback(async () => {
    const track = cameraRef.current?.track;
    if (!track) return;
    const next = !state.torchOn;
    const ok = await setTorch(track, next);
    if (ok) setState((prev) => ({ ...prev, torchOn: next }));
  }, [state.torchOn]);

  const start = useCallback(async () => {
    stop();
    const runId = runIdRef.current;
    const cancelled = () => runIdRef.current !== runId;
    setState({ ...INITIAL, phase: ScanPhase.Starting });

    let camera: CameraHandle;
    try {
      camera = await startCamera();
    } catch (error) {
      if (cancelled()) return;
      setState({ ...INITIAL, phase: ScanPhase.Failed, cameraError: error as CameraError });
      return;
    }

    // Пока висел системный запрос доступа, пользователь мог уйти с экрана.
    if (cancelled()) {
      camera.stop();
      return;
    }
    cameraRef.current = camera;
    void requestContinuousFocus(camera.track);

    const video = videoRef.current;
    if (video) {
      video.srcObject = camera.stream;
      video.setAttribute('playsinline', 'true');
      video.muted = true;
      try {
        await video.play();
      } catch {
        // Автовоспроизведение может не стартовать до жеста — кадры всё равно
        // читаются из потока, а не из <video>, поэтому это не фатально.
      }
    }

    if (cancelled()) {
      camera.stop();
      cameraRef.current = null;
      return;
    }

    const worker = new Worker(new URL('../qr/scan.worker.ts', import.meta.url), { type: 'module' });
    workerRef.current = worker;

    worker.onerror = () => {
      if (cancelled()) return;
      runningRef.current = false;
      setState((prev) => ({ ...prev, phase: ScanPhase.Failed, error: ScanError.WorkerFailed }));
    };

    worker.onmessage = (event: MessageEvent<ScanResponse>) => {
      if (cancelled()) return;
      busyRef.current = false;
      const message = event.data;

      if (message.type === 'file') {
        runningRef.current = false;
        completeRef.current({
          data: new Uint8Array(message.data),
          name: message.name,
          mime: message.mime,
        });
        setState((prev) => ({ ...prev, phase: ScanPhase.Done }));
        return;
      }

      if (message.type === 'failed') {
        if (message.canRetry) {
          // Сборка обнулена, но фонтан идёт — просто продолжаем снимать.
          runningRef.current = true;
          setState((prev) => ({
            ...prev,
            phase: ScanPhase.Receiving,
            error: ScanError.IntegrityRetry,
          }));
          return;
        }
        setState((prev) => ({
          ...prev,
          phase: ScanPhase.Failed,
          error: ScanError.IntegrityFailed,
        }));
        return;
      }

      if (message.type === 'error') return;

      if (message.type !== 'result') return;

      if (message.outcome === ReceiveOutcome.Incompatible) {
        setState((prev) => ({ ...prev, error: ScanError.Incompatible }));
        return;
      }

      const now = performance.now();
      const useful =
        message.outcome === ReceiveOutcome.Progress ||
        message.outcome === ReceiveOutcome.Started ||
        message.outcome === ReceiveOutcome.Redundant ||
        message.outcome === ReceiveOutcome.Buffered ||
        message.outcome === ReceiveOutcome.Complete;

      if (useful) {
        lastFrameAtRef.current = now;
        recentRef.current.push(now);
        while (recentRef.current.length > 0 && now - recentRef.current[0] > 1000) {
          recentRef.current.shift();
        }
      }

      if (message.outcome === ReceiveOutcome.Complete) {
        runningRef.current = false;
        worker.postMessage({ type: 'finish' } satisfies ScanRequest);
      }

      setState((prev) => ({
        ...prev,
        phase:
          message.outcome === ReceiveOutcome.Complete
            ? ScanPhase.Receiving
            : message.stats.blockCount > 0
              ? ScanPhase.Receiving
              : ScanPhase.Searching,
        stats: message.stats,
        fileName: message.meta?.name ?? prev.fileName,
        fileSize: message.meta?.size ?? prev.fileSize,
        captureRate: recentRef.current.length,
      }));
    };

    runningRef.current = true;
    busyRef.current = false;
    lastFrameAtRef.current = performance.now();
    setState((prev) => ({
      ...prev,
      phase: ScanPhase.Searching,
      torchAvailable: supportsTorch(camera.track),
    }));

    const loop = () => {
      // Цепочка таймеров живёт, пока жив воркер, а не пока идёт приём:
      // после сброса по несошедшемуся хэшу съёмку надо возобновить, и
      // умерший цикл пришлось бы поднимать заново.
      if (cancelled() || !workerRef.current) return;
      timerRef.current = window.setTimeout(loop, 1000 / MAX_SCANS_PER_SECOND);

      // Сторож: ответа нет слишком долго — считаем кадр потерянным и
      // разрешаем следующий, иначе один молчаливый сбой останавливает всё.
      if (busyRef.current && performance.now() - sentAtRef.current > WORKER_REPLY_TIMEOUT_MS) {
        busyRef.current = false;
      }
      if (!runningRef.current || busyRef.current) return;

      const source = videoRef.current;
      if (!source || source.readyState < 2) return;

      // Флаг снимает ответ воркера. Значит, если кадр так и не ушёл —
      // ни успешно, ни с ошибкой — снимать его должны мы, иначе сканирование
      // замрёт навсегда и совершенно молча.
      busyRef.current = true;
      sentAtRef.current = performance.now();
      grabFrame(source, fallbackCanvasRef, worker)
        .then((posted) => {
          if (!posted) busyRef.current = false;
        })
        .catch(() => {
          busyRef.current = false;
        });

      const idle = (performance.now() - lastFrameAtRef.current) / 1000;
      setState((prev) =>
        Math.abs(prev.sinceLastFrame - idle) < 0.4 ? prev : { ...prev, sinceLastFrame: idle },
      );
    };
    loop();
  }, [stop, videoRef]);

  return { state, start, stop, toggleTorch };
}

/**
 * Вырезает центральный квадрат и отдаёт его воркеру.
 * Возвращает false, если кадр отправить не удалось — вызывающий обязан
 * знать об этом, чтобы снять флаг занятости.
 */
async function grabFrame(
  video: HTMLVideoElement,
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  worker: Worker,
): Promise<boolean> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) return false;

  const side = Math.min(width, height);
  const left = Math.floor((width - side) / 2);
  const top = Math.floor((height - side) / 2);

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(video, left, top, side, side, {
        resizeWidth: SCAN_SIZE,
        resizeHeight: SCAN_SIZE,
        resizeQuality: 'medium',
      });
      worker.postMessage(
        { type: 'frame', bitmap, width: SCAN_SIZE, height: SCAN_SIZE } satisfies ScanRequest,
        [bitmap],
      );
      return true;
    } catch {
      // Старые webview не умеют кадрировать в createImageBitmap — идём через canvas.
    }
  }

  let canvas = canvasRef.current;
  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.width = SCAN_SIZE;
    canvas.height = SCAN_SIZE;
    canvasRef.current = canvas;
  }
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return false;
  context.drawImage(video, left, top, side, side, 0, 0, SCAN_SIZE, SCAN_SIZE);
  const image = context.getImageData(0, 0, SCAN_SIZE, SCAN_SIZE);
  const buffer = image.data.buffer as ArrayBuffer;
  worker.postMessage(
    { type: 'frame', pixels: buffer, width: SCAN_SIZE, height: SCAN_SIZE } satisfies ScanRequest,
    [buffer],
  );
  return true;
}
