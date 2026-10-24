import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatBytes, formatClock, formatDuration } from '../app/format';
import {
  DEFAULT_PRESET,
  estimate,
  MAX_FILE_BYTES,
  metaFitsPreset,
  PRESETS,
  type PresetId,
} from '../app/presets';
import { useBroadcast } from '../app/useBroadcast';
import { haptic } from '../platform/haptics';
import { isWakeLockSupported, keepScreenAwake, type WakeLockHandle } from '../platform/wakeLock';
import { buildFileMeta } from '../protocol/encoder';
import { truncateUtf8 } from '../protocol/frames';
import { IconAlert, IconFile, IconUpload } from './icons';
import { useI18n } from './i18n';
import { Button, Notice, Progress, ScreenHeader, Segmented, Stat, StateCard } from './kit';
import { QrStage } from './QrStage';

interface Picked {
  bytes: Uint8Array;
  name: string;
  mime: string;
}

export function SendScreen({ onBack }: { onBack: () => void }) {
  const { t, lang } = useI18n();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [presetId, setPresetId] = useState<PresetId>(DEFAULT_PRESET);
  const [tooBig, setTooBig] = useState(false);
  const [reading, setReading] = useState(false);
  const [dragging, setDragging] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wakeLockRef = useRef<WakeLockHandle | null>(null);
  const { state, start, stop } = useBroadcast(canvasRef);

  const preset = PRESETS[presetId];
  const forecast = useMemo(
    () => (picked ? estimate(picked.bytes.length, preset) : null),
    [picked, preset],
  );

  const accept = useCallback(async (file: File | undefined) => {
    if (!file) return;
    setTooBig(false);
    if (file.size > MAX_FILE_BYTES) {
      setPicked(null);
      setTooBig(true);
      haptic('warning');
      return;
    }

    setReading(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      setPicked({ bytes, name: file.name, mime: file.type });
    } finally {
      setReading(false);
    }
  }, []);

  const onPick = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      // Сбрасываем значение, иначе повторный выбор того же файла не даст события.
      event.target.value = '';
      void accept(file);
    },
    [accept],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      setDragging(false);
      void accept(event.dataTransfer.files?.[0]);
    },
    [accept],
  );

  const onStart = useCallback(async () => {
    if (!picked) return;

    const meta = await buildFileMeta(
      picked.bytes,
      fitName(picked.name, picked.mime, preset.blockSize),
      truncateUtf8(picked.mime, 64),
      preset.blockSize,
    );

    // Сессия отличает наш поток от чужого, если рядом передают что-то ещё.
    const session = (crypto.getRandomValues(new Uint16Array(1))[0] || 1) & 0xffff;

    wakeLockRef.current = keepScreenAwake();
    haptic('success');
    start(session, picked.bytes, meta, preset);
  }, [picked, preset, start]);

  const onStop = useCallback(() => {
    stop();
    wakeLockRef.current?.release();
    wakeLockRef.current = null;
  }, [stop]);

  useEffect(
    () => () => {
      wakeLockRef.current?.release();
    },
    [],
  );

  // Сбой вещания надо показать явно: отправитель не видит приёмник и по
  // умолчанию решит, что всё идёт как надо.
  if (state.error) {
    return (
      <div className="screen">
        <ScreenHeader title={t.send.title} onBack={onStop} />
        <StateCard
          tone="error"
          icon={<IconAlert size={32} />}
          title={t.send.failed}
          actions={<Button onClick={() => void onStart()}>{t.camera.retry}</Button>}
        >
          {t.send.failedHint}
        </StateCard>
      </div>
    );
  }

  if (state.running) {
    return (
      <div className="screen screen--broadcast">
        <ScreenHeader title={t.send.running} onBack={onStop} />

        <QrStage canvasRef={canvasRef} />

        <div className="stats stats--3">
          <Stat label={t.send.elapsed} value={formatClock(state.elapsed)} />
          <Stat label={t.send.pass} value={state.passes + 1} />
          <Stat label={t.send.framesShown} value={state.framesShown} />
        </div>

        <div className="block">
          <Progress value={state.passProgress} />
          <p className="hint">{t.send.passHint}</p>
        </div>

        <Notice>{t.send.blindNotice}</Notice>
        <ul className="tips">
          <li>{t.send.holdStill}</li>
          <li>{t.send.brightness}</li>
        </ul>
        {!isWakeLockSupported() && <Notice tone="warn">{t.send.wakeLockMissing}</Notice>}

        <div className="block">
          <Button variant="danger" onClick={onStop}>
            {t.send.stop}
          </Button>
          <p className="hint">{t.send.doneHint}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="screen">
      <ScreenHeader title={t.send.title} onBack={onBack} />

      <input ref={inputRef} type="file" hidden onChange={onPick} />

      {picked ? (
        <div className="file-card">
          <span className="file-card__icon">
            <IconFile />
          </span>
          <div className="file-card__text">
            <div className="file-card__name">{picked.name}</div>
            <div className="file-card__meta">{formatBytes(picked.bytes.length, lang)}</div>
          </div>
          <Button variant="ghost" onClick={() => inputRef.current?.click()} disabled={reading}>
            {t.send.pickAgain}
          </Button>
        </div>
      ) : (
        <div
          className={`dropzone${dragging ? ' dropzone--active' : ''}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <span className="dropzone__icon">
            <IconUpload size={28} />
          </span>
          <div className="dropzone__title">{reading ? t.send.reading : t.send.drop}</div>
          <div className="dropzone__or">{t.send.dropOr}</div>
          <Button onClick={() => inputRef.current?.click()} disabled={reading}>
            {t.send.pick}
          </Button>
          <div className="dropzone__limit">≤ {formatBytes(MAX_FILE_BYTES, lang)}</div>
        </div>
      )}

      {tooBig && <Notice tone="warn">{t.send.tooBig(formatBytes(MAX_FILE_BYTES, lang))}</Notice>}

      {picked && forecast && (
        <>
          <section className="section">
            <h2 className="section__title">{t.send.profile}</h2>
            <Segmented
              label={t.send.profile}
              value={presetId}
              onChange={setPresetId}
              options={(Object.keys(PRESETS) as PresetId[]).map((key) => ({
                value: key,
                label: t.send.profileNames[key],
              }))}
            />
            <p className="hint">{t.send.profileHints[presetId]}</p>
          </section>

          <div className="stats stats--3">
            <Stat label={t.send.blocksLabel} value={forecast.blocks} />
            <Stat label={t.send.frameLabel} value={formatBytes(preset.blockSize, lang)} />
            <Stat label={t.send.qrLabel} value={`${preset.modules}×${preset.modules}`} />
          </div>
          <div className="stats stats--2">
            <Stat label={t.send.bestCase} value={formatDuration(forecast.bestSeconds, lang)} />
            <Stat label={t.send.likelyCase} value={formatDuration(forecast.likelySeconds, lang)} />
          </div>

          <div className="block">
            <Button onClick={() => void onStart()}>{t.send.start}</Button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Имя файла едет в служебном кадре, а тот обязан помещаться в один QR-код.
 * Длинные имена подрезаются, но расширение сохраняется — по нему получатель
 * поймёт, что это за файл.
 */
function fitName(name: string, mime: string, blockSize: number): string {
  const preset = Object.values(PRESETS).find((item) => item.blockSize === blockSize);
  if (!preset) return truncateUtf8(name, 96);

  const mimeBytes = new TextEncoder().encode(truncateUtf8(mime, 64)).length;
  let limit = 96;
  while (limit > 8 && !metaFitsPreset(preset, limit, mimeBytes)) limit -= 8;

  if (new TextEncoder().encode(name).length <= limit) return name;

  const dot = name.lastIndexOf('.');
  const extension = dot > 0 ? name.slice(dot) : '';
  const head = truncateUtf8(name.slice(0, dot > 0 ? dot : undefined), Math.max(1, limit - extension.length - 1));
  return `${head}…${extension}`;
}
