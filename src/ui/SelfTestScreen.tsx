/**
 * Служебный экран самопроверки: убедиться, что весь конвейер жив, не доставая
 * второе устройство. Если передача не идёт, он за секунды отвечает на вопрос
 * «сломан конвейер или мешают условия съёмки».
 */
import { useCallback, useState } from 'react';
import { formatSpeed } from '../app/format';
import type { LoopbackProgress, LoopbackReport } from '../app/loopback';
import { PRESETS, type PresetId } from '../app/presets';
import { useI18n } from './i18n';
import { Button, Notice, ScreenHeader, Stat } from './kit';

interface Case {
  sizeBytes: number;
  presetId: PresetId;
  lossRate: number;
  pixelsPerModule: number;
}

/** Порядок совпадает с подписями `selftest.cases` в словаре. */
const CASES: Case[] = [
  { sizeBytes: 24_000, presetId: 'balanced', lossRate: 0, pixelsPerModule: 4 },
  { sizeBytes: 24_000, presetId: 'balanced', lossRate: 0.4, pixelsPerModule: 4 },
  { sizeBytes: 24_000, presetId: 'balanced', lossRate: 0.6, pixelsPerModule: 4 },
  { sizeBytes: 24_000, presetId: 'fast', lossRate: 0.3, pixelsPerModule: 3 },
  { sizeBytes: 12_000, presetId: 'reliable', lossRate: 0.3, pixelsPerModule: 6 },
  { sizeBytes: 200, presetId: 'balanced', lossRate: 0.5, pixelsPerModule: 4 },
];

export function SelfTestScreen({ onBack }: { onBack: () => void }) {
  const { t, lang } = useI18n();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<LoopbackProgress | null>(null);
  const [reports, setReports] = useState<Array<{ index: number; report: LoopbackReport }>>([]);
  const [failure, setFailure] = useState<string | null>(null);

  const run = useCallback(async () => {
    setRunning(true);
    setReports([]);
    setFailure(null);
    try {
      // Самопроверка тянет за собой декодер QR. Загружаем её по требованию,
      // чтобы он не попадал в основной бандл.
      const { runLoopback } = await import('../app/loopback');
      for (const [index, item] of CASES.entries()) {
        const report = await runLoopback({
          sizeBytes: item.sizeBytes,
          preset: PRESETS[item.presetId],
          lossRate: item.lossRate,
          pixelsPerModule: item.pixelsPerModule,
          onProgress: setProgress,
        });
        setReports((prev) => [...prev, { index, report }]);
      }
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
    } finally {
      // Без finally сорвавшийся импорт навсегда оставил бы кнопку
      // заблокированной и без единого слова о причине.
      setProgress(null);
      setRunning(false);
    }
  }, []);

  return (
    <div className="screen">
      <ScreenHeader title={t.selftest.title} onBack={onBack} />

      <p className="lead">{t.selftest.lead}</p>
      <div className="block">
        <Button onClick={() => void run()} disabled={running}>
          {running ? t.selftest.running : t.selftest.run}
        </Button>
      </div>

      {failure && <Notice tone="warn">{t.selftest.failed(failure)}</Notice>}
      {running && progress && (
        <p className="hint mono">
          {t.selftest.progress(
            progress.framesShown,
            progress.framesDecoded,
            progress.blocksRecovered,
            progress.blockCount,
          )}
        </p>
      )}

      {reports.length > 0 && (
        <section className="section">
          <h2 className="section__title">{t.selftest.results}</h2>
          <div className="reports">
            {reports.map(({ index, report }) => (
              <article key={index} className={`report${report.ok ? '' : ' report--failed'}`}>
                <div className="report__title">
                  <span className="report__mark">{report.ok ? '✓' : '✗'}</span>
                  {t.selftest.cases[index]}
                </div>
                <p className="hint">
                  {report.ok
                    ? t.selftest.summary(
                        report.framesShown,
                        report.metaShown,
                        report.framesDecoded,
                        report.framesUnreadable,
                        report.overhead.toFixed(2),
                      )
                    : (report.error ?? 'error')}
                </p>
                {report.ok && (
                  <div className="stats stats--3">
                    <Stat
                      label={t.selftest.time}
                      value={`${(report.elapsedMs / 1000).toFixed(1)} ${t.selftest.seconds}`}
                    />
                    <Stat label={t.selftest.speed} value={formatSpeed(report.bytesPerSecond, lang)} />
                    <Stat label={t.selftest.blocks} value={report.blockCount} />
                  </div>
                )}
              </article>
            ))}
          </div>
          <p className="hint">{t.selftest.note}</p>
        </section>
      )}
    </div>
  );
}
