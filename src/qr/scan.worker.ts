/// <reference lib="webworker" />
/**
 * Воркер-приёмник: распознаёт QR и сразу скармливает кадр сессии приёма.
 *
 * Разбор кадра живёт здесь же, а не в главном потоке: так по `postMessage`
 * ходит только маленькая сводка состояния, а не сотни байт на каждый кадр
 * при 15 попытках в секунду.
 *
 * Важно: используется `binaryData` из jsQR, а не строка `data`. Строка — это
 * попытка декодировать байты как текст, и на произвольном бинарном кадре она
 * бесполезна. По той же причине здесь не годится нативный `BarcodeDetector`:
 * он отдаёт только `rawValue`.
 */
import jsQR from 'jsqr';
import { createBitmapReader, type PixelSurface } from './bitmap';
import { ReceiverSession, type ReceiveOutcome, type ReceiveStats } from '../protocol/receiver';

export interface ScanFrameMessage {
  type: 'frame';
  /** Готовая картинка для распознавания; переносится без копирования. */
  bitmap?: ImageBitmap;
  /** Либо сырые пиксели, если ImageBitmap недоступен. */
  pixels?: ArrayBuffer;
  width: number;
  height: number;
}

export type ScanRequest = ScanFrameMessage | { type: 'reset' } | { type: 'finish' };

export type ScanResponse =
  | { type: 'idle' }
  | {
      type: 'result';
      outcome: ReceiveOutcome;
      stats: ReceiveStats;
      meta: { name: string; mime: string; size: number } | null;
    }
  | { type: 'file'; data: ArrayBuffer; name: string; mime: string }
  | { type: 'failed'; reason: 'hash-mismatch'; canRetry: boolean }
  | { type: 'error'; message: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;
const session = new ReceiverSession();

const pixelsFromBitmap = createBitmapReader({
  createSurface: (width, height) => new OffscreenCanvas(width, height) as unknown as PixelSurface,
});

scope.onmessage = async (event: MessageEvent<ScanRequest>) => {
  const message = event.data;

  try {
    if (message.type === 'reset') {
      session.reset();
      scope.postMessage({ type: 'idle' } satisfies ScanResponse);
      return;
    }

    if (message.type === 'finish') {
      const data = await session.finish();
      if (!data) {
        scope.postMessage({
          type: 'failed',
          reason: 'hash-mismatch',
          canRetry: session.canRetry,
        } satisfies ScanResponse);
        return;
      }
      const meta = session.meta!;
      const buffer = data.slice().buffer;
      scope.postMessage(
        { type: 'file', data: buffer, name: meta.name, mime: meta.mime } satisfies ScanResponse,
        [buffer],
      );
      return;
    }

    const image = message.bitmap
      ? pixelsFromBitmap(message.bitmap)
      : new ImageData(new Uint8ClampedArray(message.pixels!), message.width, message.height);

    const found = jsQR(image.data, image.width, image.height, {
      // Кадры показываются на экране: инверсия исключена, а её проверка
      // удваивает время распознавания.
      inversionAttempts: 'dontInvert',
    });

    if (!found || !found.binaryData?.length) {
      scope.postMessage({ type: 'idle' } satisfies ScanResponse);
      return;
    }

    const event_ = session.accept(Uint8Array.from(found.binaryData));
    const meta = session.meta;
    scope.postMessage({
      type: 'result',
      outcome: event_.outcome,
      stats: event_.stats,
      meta: meta ? { name: meta.name, mime: meta.mime, size: meta.size } : null,
    } satisfies ScanResponse);
  } catch (error) {
    scope.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    } satisfies ScanResponse);
  }
};
