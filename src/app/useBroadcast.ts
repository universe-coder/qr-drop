/**
 * Показ потока QR-кодов.
 *
 * Кадр живёт ровно целое число обновлений экрана, и это не педантизм:
 * если менять картинку по таймеру, смена рано или поздно попадёт внутрь
 * обновления экрана, и камера снимет половину старого кадра с половиной
 * нового. Такой снимок не распознается — а при устойчивом расхождении
 * частот он повторяется регулярно и выедает заметную долю потока.
 *
 * Поэтому частота обновления экрана измеряется на первых кадрах, из неё
 * считается целое число тиков на кадр, и дальше поток идёт по счётчику
 * тиков, а не по часам. Реальная частота показа может слегка отличаться от
 * заданной профилем — это осознанный размен в пользу чистых снимков.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  BroadcastFrame,
  BroadcastRequest,
  BroadcastResponse,
} from '../qr/broadcast.worker';
import type { FileMeta } from '../protocol/types';
import { fitCanvasToBox, paintMatrix } from '../qr/paint';
import type { Preset } from './presets';
import { slotsForDataFrames } from './presets';

/** Сколько готовых кадров держать наготове. */
const BUFFER_TARGET = 12;
const BUFFER_LOW = 5;

/** По скольким тикам измеряется частота обновления экрана. */
const CALIBRATION_TICKS = 12;

export interface BroadcastState {
  running: boolean;
  /** Показано кадров с начала передачи. */
  framesShown: number;
  /** Сколько раз поток прошёл систематический пролог целиком. */
  passes: number;
  /** Секунд с начала передачи. */
  elapsed: number;
  /** Позиция внутри текущего прохода, 0…1. */
  passProgress: number;
  error: string | null;
}

const INITIAL: BroadcastState = {
  running: false,
  framesShown: 0,
  passes: 0,
  elapsed: 0,
  passProgress: 0,
  error: null,
};

/**
 * Код всегда чёрный на белом, независимо от темы оформления.
 * Тёмная тема выглядела бы уместнее, но контраст и предсказуемость для
 * сканера здесь важнее: инвертированные коды читаются заметно хуже, а часть
 * декодеров (включая наш — с `inversionAttempts: 'dontInvert'`) их не берёт
 * вовсе.
 */
const QR_COLORS = { dark: '#000000', light: '#ffffff' } as const;

export function useBroadcast(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const [state, setState] = useState<BroadcastState>(INITIAL);

  const workerRef = useRef<Worker | null>(null);
  const queueRef = useRef<BroadcastFrame[]>([]);
  const rafRef = useRef<number | null>(null);
  const pendingPullRef = useRef(false);
  const blockCountRef = useRef(1);
  const startedAtRef = useRef(0);
  const shownRef = useRef(0);

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    workerRef.current?.postMessage({ type: 'stop' } satisfies BroadcastRequest);
    workerRef.current?.terminate();
    workerRef.current = null;
    queueRef.current = [];
    pendingPullRef.current = false;
    shownRef.current = 0;
    setState(INITIAL);
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(
    (session: number, source: Uint8Array, meta: FileMeta, preset: Preset) => {
      stop();

      const worker = new Worker(new URL('../qr/broadcast.worker.ts', import.meta.url), {
        type: 'module',
      });
      workerRef.current = worker;
      blockCountRef.current = meta.blockCount;
      startedAtRef.current = performance.now();

      const fail = (message: string) => {
        // Показывать белый квадрат и делать вид, что передача идёт, нельзя:
        // отправитель и так не видит приёмник, и молчаливый сбой здесь
        // выглядит ровно как рабочая передача.
        if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
        workerRef.current?.terminate();
        workerRef.current = null;
        queueRef.current = [];
        pendingPullRef.current = false;
        setState((prev) => ({ ...prev, running: false, error: message }));
      };

      worker.onerror = () => fail('worker-failed');

      worker.onmessage = (event: MessageEvent<BroadcastResponse>) => {
        const message = event.data;
        if (message.type === 'error') {
          fail(message.message);
          return;
        }
        if (message.type === 'frames') {
          pendingPullRef.current = false;
          queueRef.current.push(...message.frames);
        }
      };

      // Копия буфера: исходник остаётся у вызывающей стороны для повторного пуска.
      const copy = source.slice();
      worker.postMessage(
        {
          type: 'start',
          session,
          source: copy.buffer,
          meta,
          version: preset.version,
          level: preset.level,
        } satisfies BroadcastRequest,
        [copy.buffer],
      );
      pull(worker, BUFFER_TARGET);
      pendingPullRef.current = true;

      const targetInterval = 1000 / preset.fps;
      // До измерения считаем экран 60-герцевым — самый частый случай.
      let ticksPerFrame = Math.max(1, Math.round(targetInterval / 16.67));
      let ticksSincePaint = ticksPerFrame;
      let calibrationTicks = 0;
      let calibrationStart = 0;
      let calibrated = false;

      const tick = (now: number) => {
        rafRef.current = requestAnimationFrame(tick);

        // Калибровка: измеряем реальный шаг обновления по первым кадрам.
        if (!calibrated) {
          if (calibrationTicks === 0) calibrationStart = now;
          calibrationTicks++;
          if (calibrationTicks === CALIBRATION_TICKS) {
            const step = (now - calibrationStart) / (CALIBRATION_TICKS - 1);
            if (step > 1 && step < 100) {
              ticksPerFrame = Math.max(1, Math.round(targetInterval / step));
              calibrated = true;
            } else {
              // Замер испорчен — скорее всего вкладка уходила в фон и rAF
              // замирал. Начинаем заново, иначе на экране 90 или 120 Гц
              // навсегда останется предположение о 60.
              calibrationTicks = 0;
            }
          }
        }

        const queue = queueRef.current;
        if (queue.length < BUFFER_LOW && !pendingPullRef.current && workerRef.current) {
          pendingPullRef.current = true;
          pull(workerRef.current, BUFFER_TARGET - queue.length);
        }

        if (++ticksSincePaint < ticksPerFrame) return;
        const frame = queue.shift();
        // Кадр не готов — ждём следующего тика, счётчик не сбрасываем,
        // иначе задержка воркера растянет показ следующего кадра.
        if (!frame) return;
        ticksSincePaint = 0;

        const canvas = canvasRef.current;
        if (canvas) {
          fitCanvasToBox(canvas);
          paintMatrix(
            canvas,
            { size: frame.size, data: frame.data, version: preset.version },
            QR_COLORS,
          );
        }

        shownRef.current += 1;
        const shown = shownRef.current;
        const perPass = slotsForDataFrames(blockCountRef.current);
        setState({
          running: true,
          framesShown: shown,
          passes: Math.floor(shown / perPass),
          elapsed: (now - startedAtRef.current) / 1000,
          passProgress: (shown % perPass) / perPass,
          error: null,
        });
      };

      setState({ ...INITIAL, running: true });
      rafRef.current = requestAnimationFrame(tick);
    },
    [canvasRef, stop],
  );

  return { state, start, stop };
}

function pull(worker: Worker, count: number): void {
  if (count <= 0) return;
  worker.postMessage({ type: 'pull', count } satisfies BroadcastRequest);
}
