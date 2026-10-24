/**
 * Кодер: файл -> бесконечная последовательность кадров.
 *
 * Кодер не хранит состояние сверх счётчика seq — кадр полностью определяется
 * номером, поэтому поток можно перематывать, дублировать и генерировать
 * порциями наперёд.
 */
import { encodeDataFrame, encodeMetaFrame } from './frames';
import { blockIndicesForSeq, DEFAULT_SCHEDULE, isMetaSlot, type ScheduleParams } from './schedule';
import { blockCountFor, type FileMeta } from './types';

export interface EncoderOptions {
  schedule?: ScheduleParams;
  /**
   * Отключает служебные кадры. Только для тестов: без META приёмнику неоткуда
   * узнать размер блока и хэш файла.
   */
  dataOnly?: boolean;
}

export interface EncodedFrame {
  bytes: Uint8Array;
  /** Номер кадра в потоке (позиция), включая META-кадры. */
  index: number;
  /** Номер кадра данных, или null для META. */
  seq: number | null;
  isMeta: boolean;
}

export class FountainEncoder {
  readonly meta: FileMeta;
  readonly session: number;

  private readonly blocks: Uint8Array;
  private readonly metaBytes: Uint8Array;
  private readonly dataOnly: boolean;
  private readonly schedule: ScheduleParams;
  private index = 0;
  private seq = 0;

  constructor(session: number, source: Uint8Array, meta: FileMeta, options: EncoderOptions = {}) {
    if (meta.size !== source.length) throw new Error('meta.size does not match source length');
    if (meta.blockCount !== blockCountFor(source.length, meta.blockSize)) {
      throw new Error('meta.blockCount does not match source length');
    }

    this.session = session;
    this.meta = meta;
    this.dataOnly = options.dataOnly ?? false;
    this.schedule = options.schedule ?? DEFAULT_SCHEDULE;

    // Последний блок дополняется нулями: длину файла знаем из META,
    // поэтому хвост просто отбрасывается при сборке.
    this.blocks = new Uint8Array(meta.blockCount * meta.blockSize);
    this.blocks.set(source);

    this.metaBytes = encodeMetaFrame(session, meta);
  }

  /** Сколько кадров данных нужно при идеальном приёме. */
  get systematicLength(): number {
    return this.meta.blockCount;
  }

  /** Следующий кадр потока. Поток бесконечен. */
  next(): EncodedFrame {
    const index = this.index++;
    if (!this.dataOnly && isMetaSlot(index)) {
      return { bytes: this.metaBytes, index, seq: null, isMeta: true };
    }
    const seq = this.seq++;
    return { bytes: this.encodeSeq(seq), index, seq, isMeta: false };
  }

  /** Кадр данных с конкретным номером — для тестов и предгенерации. */
  encodeSeq(seq: number): Uint8Array {
    const { blockSize, blockCount } = this.meta;
    const indices = blockIndicesForSeq(seq, blockCount, this.schedule);

    const payload = new Uint8Array(blockSize);
    payload.set(this.blocks.subarray(indices[0] * blockSize, (indices[0] + 1) * blockSize));
    for (let i = 1; i < indices.length; i++) {
      const offset = indices[i] * blockSize;
      for (let b = 0; b < blockSize; b++) payload[b] ^= this.blocks[offset + b];
    }

    return encodeDataFrame(this.session, seq, payload);
  }

  reset(): void {
    this.index = 0;
    this.seq = 0;
  }
}

/** Разбивает файл на блоки и считает SHA-256. */
export async function buildFileMeta(
  source: Uint8Array,
  name: string,
  mime: string,
  blockSize: number,
): Promise<FileMeta> {
  if (blockSize <= 0) throw new Error('blockSize must be positive');
  const digest = await crypto.subtle.digest('SHA-256', toArrayBuffer(source));
  return {
    name,
    mime,
    size: source.length,
    hash: new Uint8Array(digest),
    blockSize,
    blockCount: blockCountFor(source.length, blockSize),
  };
}

/** WebCrypto не принимает view с offset, поэтому нормализуем буфер. */
function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  if (bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return bytes.buffer as ArrayBuffer;
  }
  return bytes.slice().buffer as ArrayBuffer;
}
