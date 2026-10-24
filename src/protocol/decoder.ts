/**
 * Инкрементальный LT-декодер (peeling / belief propagation).
 *
 * Пришедший кадр сразу «очищается» от уже известных блоков. Если после этого
 * остался ровно один неизвестный — блок восстановлен, и это может запустить
 * цепную реакцию по кадрам, которые его ждали. Стоимость обработки кадра —
 * O(степень + размер вызванной цепочки), а не O(K).
 */
import { blockIndicesForSeq, DEFAULT_SCHEDULE, type ScheduleParams } from './schedule';
import type { FileMeta } from './types';
import { xorInto } from './xor';

export const PushResult = {
  /** Кадр дал новую информацию. */
  Useful: 'useful',
  /** Такой номер уже приходил. */
  Duplicate: 'duplicate',
  /** Кадр корректен, но целиком выводится из уже известного. */
  Redundant: 'redundant',
} as const;

export type PushResult = (typeof PushResult)[keyof typeof PushResult];

interface Pending {
  data: Uint8Array;
  missing: Set<number>;
}

export interface DecoderOptions {
  schedule?: ScheduleParams;
  /**
   * Верхняя граница на число незакрытых кадров степени >= 2.
   * Защищает от роста памяти, если приёмник подключился к длинному фонтану
   * и накопил много кадров, которые пока не с чем свернуть.
   */
  maxPending?: number;
}

const DEFAULT_MAX_PENDING = 4096;

export class FountainDecoder {
  readonly meta: FileMeta;

  private readonly blocks: Array<Uint8Array | null>;
  private readonly pending = new Map<number, Pending>();
  private readonly byIndex = new Map<number, Set<number>>();
  private readonly schedule: ScheduleParams;
  private readonly maxPending: number;

  /** Битовая карта принятых систематических кадров (seq < K) — для прогресса. */
  private readonly systematicSeen: Uint8Array;
  private readonly fountainSeen = new Set<number>();

  private recoveredCount = 0;
  private usefulCount = 0;

  constructor(meta: FileMeta, options: DecoderOptions = {}) {
    this.meta = meta;
    this.schedule = options.schedule ?? DEFAULT_SCHEDULE;
    this.maxPending = Math.max(64, options.maxPending ?? DEFAULT_MAX_PENDING);
    this.blocks = new Array<Uint8Array | null>(meta.blockCount).fill(null);
    this.systematicSeen = new Uint8Array(Math.ceil(meta.blockCount / 8));
  }

  get blockCount(): number {
    return this.meta.blockCount;
  }

  get recovered(): number {
    return this.recoveredCount;
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  /** Полезных (продвинувших сборку) кадров принято. */
  get useful(): number {
    return this.usefulCount;
  }

  get isComplete(): boolean {
    return this.recoveredCount === this.meta.blockCount;
  }

  /** Доля собранного файла, 0…1. */
  get progress(): number {
    return this.recoveredCount / this.meta.blockCount;
  }

  hasSeen(seq: number): boolean {
    if (seq < this.meta.blockCount) {
      return (this.systematicSeen[seq >> 3] & (1 << (seq & 7))) !== 0;
    }
    return this.fountainSeen.has(seq);
  }

  private markSeen(seq: number): void {
    if (seq < this.meta.blockCount) {
      this.systematicSeen[seq >> 3] |= 1 << (seq & 7);
      return;
    }
    // Номера фонтанных кадров не переиспользуются, но поток бесконечен —
    // ограничиваем память, забывая самые старые.
    if (this.fountainSeen.size > 1 << 16) {
      const oldest = this.fountainSeen.values().next();
      if (!oldest.done) this.fountainSeen.delete(oldest.value);
    }
    this.fountainSeen.add(seq);
  }

  push(seq: number, payload: Uint8Array): PushResult {
    if (this.isComplete) return PushResult.Redundant;
    if (this.hasSeen(seq)) return PushResult.Duplicate;
    this.markSeen(seq);

    const indices = blockIndicesForSeq(seq, this.meta.blockCount, this.schedule);

    const data = payload.slice(0, this.meta.blockSize);
    const missing = new Set<number>();
    for (const index of indices) {
      const known = this.blocks[index];
      if (known) xorInto(data, known);
      // Индекс мог попасть в набор дважды только при ошибке PRNG; Set это гасит.
      else missing.add(index);
    }

    if (missing.size === 0) return PushResult.Redundant;

    this.usefulCount++;

    if (missing.size === 1) {
      this.solve(missing.values().next().value as number, data);
      return PushResult.Useful;
    }

    this.evictIfNeeded();
    this.pending.set(seq, { data, missing });
    for (const index of missing) {
      let bucket = this.byIndex.get(index);
      if (!bucket) {
        bucket = new Set<number>();
        this.byIndex.set(index, bucket);
      }
      bucket.add(seq);
    }
    return PushResult.Useful;
  }

  /** Восстанавливает блок и раскручивает цепочку зависимых кадров. */
  private solve(index: number, data: Uint8Array): void {
    const queue: Array<[number, Uint8Array]> = [[index, data]];

    while (queue.length > 0) {
      const [current, value] = queue.pop()!;
      if (this.blocks[current]) continue;

      this.blocks[current] = value;
      this.recoveredCount++;

      const bucket = this.byIndex.get(current);
      if (!bucket) continue;
      this.byIndex.delete(current);

      for (const seq of bucket) {
        const symbol = this.pending.get(seq);
        if (!symbol || !symbol.missing.has(current)) continue;

        xorInto(symbol.data, value);
        symbol.missing.delete(current);

        if (symbol.missing.size === 1) {
          const last = symbol.missing.values().next().value as number;
          this.pending.delete(seq);
          this.byIndex.get(last)?.delete(seq);
          queue.push([last, symbol.data]);
        }
      }
    }
  }

  private evictIfNeeded(): void {
    while (this.pending.size >= this.maxPending) {
      const oldest = this.pending.keys().next();
      if (oldest.done) return;
      const seq = oldest.value;
      const symbol = this.pending.get(seq)!;
      this.pending.delete(seq);
      for (const index of symbol.missing) this.byIndex.get(index)?.delete(seq);
    }
  }

  /** Индексы ещё не восстановленных блоков — для диагностики. */
  missingBlocks(): number[] {
    const result: number[] = [];
    for (let i = 0; i < this.blocks.length; i++) if (!this.blocks[i]) result.push(i);
    return result;
  }

  /** Собранный файл. Бросает, пока не восстановлены все блоки. */
  assemble(): Uint8Array {
    if (!this.isComplete) throw new Error('decoder is not complete');
    const out = new Uint8Array(this.meta.blockCount * this.meta.blockSize);
    for (let i = 0; i < this.blocks.length; i++) out.set(this.blocks[i]!, i * this.meta.blockSize);
    return out.subarray(0, this.meta.size);
  }
}
