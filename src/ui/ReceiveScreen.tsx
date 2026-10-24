import { useCallback, useEffect, useRef, useState } from 'react';
import { formatBytes, formatDuration, formatPercent } from '../app/format';
import { ScanError, ScanPhase, useScanner, type ReceivedFile } from '../app/useScanner';
import { CameraError, isCameraSupported, isSecureContextOk } from '../platform/camera';
import { haptic } from '../platform/haptics';
import { isPreviewable, SaveMethod, saveFile, toFile } from '../platform/saveFile';
import { keepScreenAwake, type WakeLockHandle } from '../platform/wakeLock';
import { IconAlert, IconCamera, IconCheck, IconFlash } from './icons';
import { useI18n, type Dictionary } from './i18n';
import { Button, Notice, Progress, ScreenHeader, Stat, StateCard, Toast } from './kit';

export function ReceiveScreen({ onBack }: { onBack: () => void }) {
  const { t, lang } = useI18n();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const wakeLockRef = useRef<WakeLockHandle | null>(null);
  const [result, setResult] = useState<ReceivedFile | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const onComplete = useCallback((file: ReceivedFile) => {
    haptic('success');
    setResult(file);
    // Именно set, а не «поставить, если картинка»: иначе после картинки
    // следующий принятый PDF показался бы с превью от предыдущего файла.
    setPreviewUrl(
      isPreviewable(file.mime) ? URL.createObjectURL(toFile(file.data, file.name, file.mime)) : null,
    );
  }, []);

  const { state, start, stop, toggleTorch } = useScanner(videoRef, onComplete);

  const release = useCallback(() => {
    stop();
    wakeLockRef.current?.release();
    wakeLockRef.current = null;
  }, [stop]);

  useEffect(() => () => release(), [release]);

  // Файл собран — камера больше не нужна. Иначе она осталась бы включённой
  // (вместе с подсветкой) всё время, пока пользователь смотрит на результат.
  useEffect(() => {
    if (result) release();
  }, [result, release]);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const onStart = useCallback(() => {
    setResult(null);
    setPreviewUrl(null);
    // На экраны ошибок можно попасть без release(), и тогда прошлый захват
    // остался бы жив вместе со своим слушателем видимости — навсегда.
    wakeLockRef.current?.release();
    wakeLockRef.current = keepScreenAwake();
    void start();
  }, [start]);

  const onSave = useCallback(async () => {
    if (!result) return;
    const saved = await saveFile(toFile(result.data, result.name, result.mime));
    setToast(saveMessage(t, saved.method));
  }, [result, t]);

  const closeToast = useCallback(() => setToast(null), []);

  const header = (
    <ScreenHeader
      title={t.receive.title}
      onBack={() => {
        release();
        onBack();
      }}
    />
  );

  if (result) {
    return (
      <div className="screen">
        {header}
        <StateCard
          tone="success"
          icon={<IconCheck size={32} />}
          title={t.result.title}
          actions={
            <>
              <Button onClick={() => void onSave()}>{t.result.save}</Button>
              <Button variant="secondary" onClick={onStart}>
                {t.result.receiveMore}
              </Button>
            </>
          }
        >
          <div className="result-name">{result.name}</div>
          <div className="result-meta">
            {formatBytes(result.data.length, lang)} · {t.result.subtitle}
          </div>
        </StateCard>

        {previewUrl && <img className="result-preview" src={previewUrl} alt={result.name} />}

        {toast && <Toast message={toast} onClose={closeToast} />}
      </div>
    );
  }

  if (!isCameraSupported() || !isSecureContextOk()) {
    const secure = isSecureContextOk();
    return (
      <div className="screen">
        {header}
        <StateCard
          tone="error"
          icon={<IconAlert size={32} />}
          title={secure ? t.camera.unsupported : t.camera.insecure}
          actions={
            <Button variant="secondary" onClick={onBack}>
              {t.common.back}
            </Button>
          }
        >
          {secure ? t.camera.unsupportedHint : t.camera.insecureHint}
        </StateCard>
      </div>
    );
  }

  if (state.phase === ScanPhase.Failed && state.error === ScanError.IntegrityFailed) {
    return (
      <div className="screen">
        {header}
        <StateCard
          tone="error"
          icon={<IconAlert size={32} />}
          title={t.receive.integrityTitle}
          actions={<Button onClick={onStart}>{t.camera.retry}</Button>}
        >
          {t.receive.integrityFailed}
        </StateCard>
      </div>
    );
  }

  if (state.phase === ScanPhase.Failed && state.cameraError) {
    const text = cameraErrorText(t, state.cameraError);
    return (
      <div className="screen">
        {header}
        <StateCard
          tone="error"
          icon={<IconAlert size={32} />}
          title={text.title}
          actions={<Button onClick={onStart}>{t.camera.retry}</Button>}
        >
          {text.hint}
        </StateCard>
      </div>
    );
  }

  if (state.phase === ScanPhase.Idle) {
    return (
      <div className="screen">
        {header}
        <StateCard
          icon={<IconCamera size={32} />}
          title={t.receive.aim}
          actions={<Button onClick={onStart}>{t.receive.start}</Button>}
        >
          {t.receive.aimHint}
        </StateCard>
      </div>
    );
  }

  const receiving = state.stats.blockCount > 0;
  const progress = receiving ? state.stats.blocksRecovered / state.stats.blockCount : 0;
  const stalled = state.sinceLastFrame > 3;
  const remaining = estimateRemaining(
    state.stats.bytesTotal,
    state.captureRate,
    state.stats.blockCount,
    state.stats.blocksRecovered,
  );
  const locked = state.captureRate > 0;

  return (
    <div className="screen">
      {header}

      <div className={`viewfinder${locked ? ' viewfinder--locked' : ''}`}>
        <video ref={videoRef} className="viewfinder__video" playsInline muted />
        <div className="viewfinder__reticle">
          <i />
          <i />
          <i />
          <i />
        </div>
        {receiving && (
          <div className="viewfinder__fill" style={{ transform: `scaleX(${progress})` }} />
        )}
        <div className="viewfinder__badge">{t.receive.framesPerSecond(state.captureRate)}</div>
      </div>

      <div className="block">
        <Progress value={progress} done={progress >= 1} />
        <div className="receive-title">
          {receiving ? (
            <>
              <span className="receive-title__percent">{formatPercent(progress)}</span>
              <span className="receive-title__name">{state.fileName ?? ''}</span>
            </>
          ) : state.phase === ScanPhase.Starting ? (
            t.receive.starting
          ) : (
            t.receive.searching
          )}
        </div>
        <p className="hint">
          {receiving
            ? t.receive.blocks(state.stats.blocksRecovered, state.stats.blockCount)
            : t.receive.searchingHint}
        </p>
      </div>

      {receiving && (
        <div className="stats stats--2">
          <Stat
            label={t.receive.received}
            value={`${formatBytes(state.stats.bytesRecovered, lang)} / ${formatBytes(state.stats.bytesTotal, lang)}`}
          />
          <Stat
            label={t.receive.remaining}
            value={remaining === null ? '—' : formatDuration(remaining, lang)}
          />
        </div>
      )}

      {stalled && <Notice tone="warn">{t.receive.stalled}</Notice>}
      {state.error === ScanError.IntegrityRetry && <Notice tone="warn">{t.receive.integrityRetry}</Notice>}
      {state.error === ScanError.Incompatible && <Notice tone="warn">{t.receive.incompatible}</Notice>}

      <div className="button-row">
        {state.torchAvailable && (
          <Button
            variant={state.torchOn ? 'primary' : 'secondary'}
            icon={<IconFlash size={20} />}
            onClick={() => void toggleTorch()}
          >
            {t.receive.torch}
          </Button>
        )}
        <Button variant="danger" onClick={release}>
          {t.receive.stop}
        </Button>
      </div>
    </div>
  );
}

function saveMessage(t: Dictionary, method: SaveMethod): string {
  switch (method) {
    case SaveMethod.Share:
      return t.result.savedShare;
    case SaveMethod.Download:
      return t.result.savedDownload;
    case SaveMethod.NewTab:
      return t.result.savedTab;
    default:
      return t.result.saveFailed;
  }
}

function cameraErrorText(t: Dictionary, error: CameraError): { title: string; hint: string } {
  switch (error) {
    case CameraError.Denied:
      return { title: t.camera.denied, hint: t.camera.deniedHint };
    case CameraError.NotFound:
      return { title: t.camera.notFound, hint: t.camera.notFoundHint };
    case CameraError.Busy:
      return { title: t.camera.busy, hint: t.camera.busyHint };
    case CameraError.Unsupported:
      return { title: t.camera.unsupported, hint: t.camera.unsupportedHint };
    default:
      return { title: t.camera.unknown, hint: t.camera.unknownHint };
  }
}

/**
 * Оценка остатка по фактической скорости приёма.
 *
 * Считаем по блокам, а не по байтам: полезность кадра неравномерна — в
 * фонтанной фазе один кадр может закрыть сразу несколько блоков цепочкой.
 */
function estimateRemaining(
  bytesTotal: number,
  framesPerSecond: number,
  blockCount: number,
  blocksRecovered: number,
): number | null {
  if (!bytesTotal || framesPerSecond <= 0 || blocksRecovered === 0) return null;
  const left = blockCount - blocksRecovered;
  if (left <= 0) return 0;
  // Ближе к концу растёт доля повторов, поэтому закладываем запас.
  return (left / framesPerSecond) * 1.25;
}
