/**
 * Петлевая проверка: кодер -> настоящий QR на canvas -> jsQR -> сборка файла.
 *
 * Проверять протокол на двух телефонах долго и невоспроизводимо, а чисто
 * алгоритмические тесты не трогают самое хрупкое место — рисование и обратное
 * распознавание настоящих пикселей. Здесь проходит весь конвейер, кроме самой
 * камеры, и потери кадров имитируются явно.
 */
import jsQR from 'jsqr';
import { buildFileMeta, FountainEncoder } from '../protocol/encoder';
import { ReceiverSession } from '../protocol/receiver';
import { splitmix32 } from '../protocol/prng';
import { paintMatrix, QUIET_ZONE } from '../qr/paint';
import { encodeMatrix } from '../qr/encode';
import type { Preset } from './presets';

export interface LoopbackOptions {
  sizeBytes: number;
  preset: Preset;
  /** Доля кадров, которые «камера» не увидит. */
  lossRate: number;
  /** Пикселей на модуль при рисовании — грубая модель разрешения камеры. */
  pixelsPerModule: number;
  /** Ограничение на число показанных кадров, чтобы тест не завис. */
  maxFrames?: number;
  onProgress?: (progress: LoopbackProgress) => void;
}

export interface LoopbackProgress {
  framesShown: number;
  framesDecoded: number;
  blocksRecovered: number;
  blockCount: number;
}

export interface LoopbackReport {
  ok: boolean;
  framesShown: number;
  /** Кадров, которые jsQR смог прочитать. */
  framesDecoded: number;
  /** Кадров, потерянных при распознавании (не из-за имитации потерь). */
  framesUnreadable: number;
  blockCount: number;
  blocksRecovered: number;
  /** Принято кадров данных на один исходный блок. Служебные не в счёт. */
  overhead: number;
  /** Служебных кадров показано. */
  metaShown: number;
  elapsedMs: number;
  /** Байт полезных данных в секунду при этом прогоне. */
  bytesPerSecond: number;
  error: string | null;
}

export async function runLoopback(options: LoopbackOptions): Promise<LoopbackReport> {
  const { preset } = options;
  const started = performance.now();

  const rand = splitmix32(0x5eed);
  const source = new Uint8Array(options.sizeBytes);
  for (let i = 0; i < source.length; i++) source[i] = Math.floor(rand() * 256);

  const meta = await buildFileMeta(source, 'loopback.bin', 'application/octet-stream', preset.blockSize);
  const encoder = new FountainEncoder(1, source, meta);
  const receiver = new ReceiverSession();

  const side = (preset.modules + QUIET_ZONE * 2) * options.pixelsPerModule;
  const canvas = document.createElement('canvas');
  canvas.width = side;
  canvas.height = side;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    return failure('2d context is not available', started, meta.blockCount);
  }

  const drop = splitmix32(0xc0ffee);
  const maxFrames = options.maxFrames ?? meta.blockCount * 40 + 2000;

  let framesShown = 0;
  let framesDecoded = 0;
  let framesUnreadable = 0;
  let metaShown = 0;
  let dataAccepted = 0;

  while (!receiver.isComplete && framesShown < maxFrames) {
    const frame = encoder.next();
    framesShown++;
    if (frame.isMeta) metaShown++;

    if (drop() < options.lossRate) continue;

    paintMatrix(canvas, encodeMatrix(frame.bytes, preset.version, preset.level), {
      dark: '#000000',
      light: '#ffffff',
    });

    const image = context.getImageData(0, 0, side, side);
    const found = jsQR(image.data, side, side, { inversionAttempts: 'dontInvert' });
    if (!found?.binaryData?.length) {
      framesUnreadable++;
      continue;
    }

    framesDecoded++;
    if (!frame.isMeta) dataAccepted++;
    receiver.accept(Uint8Array.from(found.binaryData));

    if (framesShown % 25 === 0) {
      const stats = receiver.stats();
      options.onProgress?.({
        framesShown,
        framesDecoded,
        blocksRecovered: stats.blocksRecovered,
        blockCount: stats.blockCount,
      });
      // Отдаём поток интерфейсу, иначе страница замрёт на всё время прогона.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  const elapsedMs = performance.now() - started;

  if (!receiver.isComplete) {
    return {
      ...failure('не собралось за отведённое число кадров', started, meta.blockCount),
      framesShown,
      framesDecoded,
      framesUnreadable,
      metaShown,
      blocksRecovered: receiver.stats().blocksRecovered,
      elapsedMs,
    };
  }

  const assembled = await receiver.finish();
  const matches = assembled !== null && sameBytes(assembled, source);

  return {
    ok: matches,
    framesShown,
    framesDecoded,
    framesUnreadable,
    blockCount: meta.blockCount,
    blocksRecovered: meta.blockCount,
    metaShown,
    overhead: dataAccepted / meta.blockCount,
    elapsedMs,
    bytesPerSecond: (options.sizeBytes / (framesShown / preset.fps)) || 0,
    error: matches ? null : 'собранный файл не совпал с исходным',
  };
}

function failure(error: string, started: number, blockCount: number): LoopbackReport {
  return {
    ok: false,
    framesShown: 0,
    framesDecoded: 0,
    framesUnreadable: 0,
    blockCount,
    blocksRecovered: 0,
    overhead: 0,
    metaShown: 0,
    elapsedMs: performance.now() - started,
    bytesPerSecond: 0,
    error,
  };
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
