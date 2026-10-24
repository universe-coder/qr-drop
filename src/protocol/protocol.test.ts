import { describe, expect, it } from 'vitest';
import { crc32c } from './crc32';
import { FountainDecoder } from './decoder';
import { buildFileMeta, FountainEncoder } from './encoder';
import { encodeDataFrame, encodeMetaFrame, parseFrame, truncateUtf8 } from './frames';
import { pickDistinct, splitmix32 } from './prng';
import { ReceiverSession, ReceiveOutcome } from './receiver';
import { blockIndicesForSeq } from './schedule';
import { degreeSampler } from './soliton';
import { FrameType, ParseError, type FileMeta } from './types';
import { xorInto } from './xor';

const BLOCK_SIZE = 916; // соответствует QR версии 21, уровень L

function randomBytes(length: number, seed = 1): Uint8Array {
  const rand = splitmix32(seed);
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) bytes[i] = Math.floor(rand() * 256);
  return bytes;
}

async function metaFor(source: Uint8Array, blockSize = BLOCK_SIZE): Promise<FileMeta> {
  return buildFileMeta(source, 'photo.jpg', 'image/jpeg', blockSize);
}

describe('crc32c', () => {
  it('соответствует эталонному вектору Castagnoli', () => {
    expect(crc32c(new TextEncoder().encode('123456789'))).toBe(0xe3069283);
  });

  it('реагирует на изменение любого байта', () => {
    const bytes = randomBytes(256);
    const base = crc32c(bytes);
    for (const index of [0, 17, 128, 255]) {
      const mutated = bytes.slice();
      mutated[index] ^= 0x01;
      expect(crc32c(mutated)).not.toBe(base);
    }
  });
});

describe('prng', () => {
  it('детерминирован для одного seed', () => {
    const a = splitmix32(12345);
    const b = splitmix32(12345);
    for (let i = 0; i < 100; i++) expect(a()).toBe(b());
  });

  it('различает соседние seed', () => {
    const a = splitmix32(7)();
    const b = splitmix32(8)();
    expect(a).not.toBe(b);
  });

  it('выдаёт значения в [0, 1)', () => {
    const rand = splitmix32(99);
    for (let i = 0; i < 10000; i++) {
      const value = rand();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('pickDistinct не повторяет индексы и держится в диапазоне', () => {
    for (let trial = 0; trial < 200; trial++) {
      const rand = splitmix32(trial);
      const total = 1 + (trial % 50);
      const count = 1 + (trial % total);
      const picked = pickDistinct(rand, total, count);
      expect(picked.length).toBe(count);
      expect(new Set(picked).size).toBe(count);
      for (const value of picked) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(total);
      }
    }
  });

  it('pickDistinct покрывает весь диапазон при count === total', () => {
    const picked = pickDistinct(splitmix32(3), 32, 32);
    expect([...picked].sort((a, b) => a - b)).toEqual([...Array(32).keys()]);
  });
});

describe('robust soliton', () => {
  it('CDF монотонна и заканчивается единицей', () => {
    for (const k of [1, 2, 10, 137, 5000]) {
      const { cdf } = degreeSampler({ k, c: 0.06, delta: 0.05 });
      expect(cdf.length).toBe(k);
      for (let i = 1; i < k; i++) expect(cdf[i]).toBeGreaterThanOrEqual(cdf[i - 1]);
      expect(cdf[k - 1]).toBeCloseTo(1, 12);
    }
  });

  it('возвращает степень из [1, k]', () => {
    const sampler = degreeSampler({ k: 200, c: 0.06, delta: 0.05 });
    const rand = splitmix32(5);
    for (let i = 0; i < 20000; i++) {
      const degree = sampler.sample(rand());
      expect(degree).toBeGreaterThanOrEqual(1);
      expect(degree).toBeLessThanOrEqual(200);
    }
  });

  it('даёт заметную долю кадров первой степени', () => {
    const sampler = degreeSampler({ k: 200, c: 0.06, delta: 0.05 });
    const rand = splitmix32(11);
    let ones = 0;
    const trials = 20000;
    for (let i = 0; i < trials; i++) if (sampler.sample(rand()) === 1) ones++;
    expect(ones / trials).toBeGreaterThan(0.01);
  });
});

describe('расписание кадров', () => {
  it('систематический пролог отдаёт блоки по порядку', () => {
    for (let seq = 0; seq < 50; seq++) {
      expect([...blockIndicesForSeq(seq, 50)]).toEqual([seq]);
    }
  });

  it('фонтанная часть детерминирована', () => {
    for (let seq = 50; seq < 200; seq++) {
      expect([...blockIndicesForSeq(seq, 50)]).toEqual([...blockIndicesForSeq(seq, 50)]);
    }
  });

  it('индексы всегда в диапазоне и без повторов', () => {
    for (let seq = 0; seq < 3000; seq++) {
      const indices = blockIndicesForSeq(seq, 137);
      expect(new Set(indices).size).toBe(indices.length);
      for (const index of indices) {
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(137);
      }
    }
  });

  it('работает при K = 1', () => {
    for (let seq = 0; seq < 20; seq++) {
      expect([...blockIndicesForSeq(seq, 1)]).toEqual([0]);
    }
  });
});

describe('xor', () => {
  it('инволютивен', () => {
    const a = randomBytes(916, 2);
    const b = randomBytes(916, 3);
    const copy = a.slice();
    xorInto(a, b);
    expect(a).not.toEqual(copy);
    xorInto(a, b);
    expect(a).toEqual(copy);
  });

  it('одинаково работает на выровненных и невыровненных длинах', () => {
    const a = randomBytes(101, 4);
    const b = randomBytes(101, 5);
    const expected = a.map((value, index) => value ^ b[index]);
    xorInto(a, b);
    expect(a).toEqual(expected);
  });
});

describe('сериализация кадров', () => {
  it('META переживает round-trip', async () => {
    const meta = await metaFor(randomBytes(5000));
    const parsed = parseFrame(encodeMetaFrame(0x1234, meta));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.frame.type !== FrameType.Meta) throw new Error('unexpected');
    expect(parsed.frame.session).toBe(0x1234);
    expect(parsed.frame.meta).toEqual(meta);
  });

  it('META с юникодным именем переживает round-trip', async () => {
    const source = randomBytes(1000);
    const meta = await buildFileMeta(source, 'Отчёт за квартал 📊.pdf', 'application/pdf', BLOCK_SIZE);
    const parsed = parseFrame(encodeMetaFrame(1, meta));
    if (!parsed.ok || parsed.frame.type !== FrameType.Meta) throw new Error('unexpected');
    expect(parsed.frame.meta.name).toBe('Отчёт за квартал 📊.pdf');
    expect(parsed.frame.meta.mime).toBe('application/pdf');
  });

  it('DATA переживает round-trip', () => {
    const payload = randomBytes(BLOCK_SIZE, 6);
    const parsed = parseFrame(encodeDataFrame(0xabcd, 4242, payload));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok || parsed.frame.type !== FrameType.Data) throw new Error('unexpected');
    expect(parsed.frame.session).toBe(0xabcd);
    expect(parsed.frame.seq).toBe(4242);
    expect(parsed.frame.payload).toEqual(payload);
  });

  it('ловит порчу любого байта', () => {
    const bytes = encodeDataFrame(1, 1, randomBytes(64, 7));
    for (let index = 2; index < bytes.length; index++) {
      const mutated = bytes.slice();
      mutated[index] ^= 0xff;
      const parsed = parseFrame(mutated);
      expect(parsed.ok, `byte ${index} passed unnoticed`).toBe(false);
    }
  });

  it('отбрасывает чужие данные по магии', () => {
    const parsed = parseFrame(new TextEncoder().encode('https://example.com/some/link'));
    expect(parsed).toEqual({ ok: false, error: ParseError.BadMagic });
  });

  it('отбрасывает слишком короткие данные', () => {
    expect(parseFrame(new Uint8Array(4))).toEqual({ ok: false, error: ParseError.TooShort });
  });

  it('truncateUtf8 не режет посреди кодовой точки', () => {
    const value = truncateUtf8('привет 👋 мир', 12);
    expect(new TextEncoder().encode(value).length).toBeLessThanOrEqual(12);
    expect(value.endsWith('�')).toBe(false);
    expect([...value].every((char) => 'привет 👋 мир'.includes(char))).toBe(true);
  });
});

/** Прогоняет поток кадров через приёмник, теряя часть кадров. */
async function simulateTransfer(options: {
  size: number;
  lossRate: number;
  seed: number;
  blockSize?: number;
  dataOnly?: boolean;
  /** Пропустить первые n кадров — приёмник включился позже отправителя. */
  joinLate?: number;
  maxFrames?: number;
}) {
  const blockSize = options.blockSize ?? BLOCK_SIZE;
  const source = randomBytes(options.size, options.seed);
  const meta = await buildFileMeta(source, 'file.bin', 'application/octet-stream', blockSize);
  const encoder = new FountainEncoder(0x4321, source, meta, { dataOnly: options.dataOnly });
  const receiver = new ReceiverSession();

  const rand = splitmix32(options.seed * 7919 + 13);
  const maxFrames = options.maxFrames ?? meta.blockCount * 60 + 5000;
  const skip = options.joinLate ?? 0;

  let shown = 0;
  let delivered = 0;
  let deliveredData = 0;
  while (!receiver.isComplete && shown < maxFrames) {
    const frame = encoder.next();
    shown++;
    if (shown <= skip) continue;
    if (rand() < options.lossRate) continue;
    delivered++;
    if (!frame.isMeta) deliveredData++;
    receiver.accept(frame.bytes);
  }

  return {
    receiver,
    meta,
    source,
    shown,
    delivered,
    deliveredData,
    /** Кадров данных принято на один исходный блок. */
    overhead: deliveredData / meta.blockCount,
  };
}

describe('петлевая передача', () => {
  it('идеальный канал собирает файл ровно за K кадров данных', async () => {
    const { receiver, source, deliveredData, meta } = await simulateTransfer({
      size: 40_000,
      lossRate: 0,
      seed: 21,
    });
    expect(receiver.isComplete).toBe(true);
    // Систематический пролог: ни одного лишнего кадра данных.
    expect(deliveredData).toBe(meta.blockCount);
    expect(await receiver.finish()).toEqual(source);
  });

  for (const lossRate of [0.2, 0.5, 0.7]) {
    it(`собирает файл при потере ${Math.round(lossRate * 100)}% кадров`, async () => {
      const { receiver, source, overhead } = await simulateTransfer({
        size: 60_000,
        lossRate,
        seed: 101 + Math.round(lossRate * 100),
      });
      expect(receiver.isComplete).toBe(true);
      expect(await receiver.finish()).toEqual(source);
      // Фонтанные накладные расходы должны оставаться разумными.
      expect(overhead).toBeLessThan(1.6);
    });
  }

  it('собирает файл, если приёмник включился в середине потока', async () => {
    const { receiver, source } = await simulateTransfer({
      size: 30_000,
      lossRate: 0.4,
      seed: 55,
      joinLate: 400,
    });
    expect(receiver.isComplete).toBe(true);
    expect(await receiver.finish()).toEqual(source);
  });

  it('устойчив к дубликатам кадров', async () => {
    const source = randomBytes(10_000, 8);
    const meta = await metaFor(source);
    const encoder = new FountainEncoder(1, source, meta);
    const receiver = new ReceiverSession();
    for (let i = 0; i < 2000 && !receiver.isComplete; i++) {
      const frame = encoder.next();
      receiver.accept(frame.bytes);
      receiver.accept(frame.bytes);
      receiver.accept(frame.bytes);
    }
    expect(receiver.isComplete).toBe(true);
    expect(await receiver.finish()).toEqual(source);
    expect(receiver.stats().framesRedundant).toBeGreaterThan(0);
  });

  it('переживает произвольный порядок кадров', async () => {
    const source = randomBytes(20_000, 9);
    const meta = await metaFor(source);
    const encoder = new FountainEncoder(2, source, meta);
    const frames = Array.from({ length: 400 }, () => encoder.next().bytes);
    const rand = splitmix32(31);
    for (let i = frames.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [frames[i], frames[j]] = [frames[j], frames[i]];
    }
    const receiver = new ReceiverSession();
    for (const bytes of frames) receiver.accept(bytes);
    expect(receiver.isComplete).toBe(true);
    expect(await receiver.finish()).toEqual(source);
  });

  for (const size of [0, 1, 15, BLOCK_SIZE - 1, BLOCK_SIZE, BLOCK_SIZE + 1]) {
    it(`обрабатывает файл размером ${size} Б`, async () => {
      const source = randomBytes(size, size + 1);
      const meta = await metaFor(source);
      const encoder = new FountainEncoder(3, source, meta);
      const receiver = new ReceiverSession();
      for (let i = 0; i < 200 && !receiver.isComplete; i++) receiver.accept(encoder.next().bytes);
      expect(receiver.isComplete).toBe(true);
      const result = await receiver.finish();
      expect(result).toEqual(source);
      expect(result?.length).toBe(size);
    });
  }
});

describe('сессия приёма', () => {
  it('копит кадры данных до прихода META и потом их применяет', async () => {
    // Файл заведомо длиннее буфера, иначе сборка закончится ещё до META.
    const source = randomBytes(40_000, 12);
    const meta = await metaFor(source);
    const encoder = new FountainEncoder(0x77, source, meta, { dataOnly: true });
    const receiver = new ReceiverSession();

    encoder.next(); // META — намеренно теряем
    const buffered = Array.from({ length: 12 }, () => encoder.next().bytes);
    for (const bytes of buffered) {
      expect(receiver.accept(bytes).outcome).toBe(ReceiveOutcome.Buffered);
    }
    expect(receiver.stats().blocksRecovered).toBe(0);

    const started = receiver.accept(encodeMetaFrame(0x77, meta));
    expect(started.outcome).toBe(ReceiveOutcome.Started);
    expect(started.stats.blocksRecovered).toBe(12);
  });

  it('игнорирует кадры чужой сессии', async () => {
    const source = randomBytes(4000, 13);
    const meta = await metaFor(source);
    const receiver = new ReceiverSession();
    receiver.accept(encodeMetaFrame(0x11, meta));

    const before = receiver.stats().blocksRecovered;
    const foreign = new FountainEncoder(0x22, randomBytes(4000, 14), meta);
    for (let i = 0; i < 5; i++) {
      const frame = foreign.next();
      if (frame.isMeta) continue;
      expect(receiver.accept(frame.bytes).outcome).toBe(ReceiveOutcome.ForeignSession);
    }
    expect(receiver.stats().blocksRecovered).toBe(before);
  });

  it('сообщает о чужом QR, не считая его ошибкой', () => {
    const receiver = new ReceiverSession();
    const event = receiver.accept(new TextEncoder().encode('https://example.com/app123'));
    expect(event.outcome).toBe(ReceiveOutcome.NotOurs);
    expect(event.stats.framesCorrupt).toBe(0);
  });

  it('отвергает файл, если незамеченная порча дошла до сборки', async () => {
    const source = randomBytes(5000, 15);
    const meta = await metaFor(source);
    const decoder = new FountainDecoder(meta);
    const encoder = new FountainEncoder(1, source, meta);

    for (let seq = 0; seq < meta.blockCount; seq++) {
      const parsed = parseFrame(encoder.encodeSeq(seq));
      if (!parsed.ok || parsed.frame.type !== FrameType.Data) throw new Error('unexpected');
      const payload = parsed.frame.payload;
      if (seq === 2) payload[0] ^= 0xff; // порча в обход CRC
      decoder.push(seq, payload);
    }

    expect(decoder.isComplete).toBe(true);
    const assembled = decoder.assemble();
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', assembled.slice().buffer));
    expect([...digest]).not.toEqual([...meta.hash]);
  });

  it('reset возвращает сессию к исходному состоянию', async () => {
    const source = randomBytes(3000, 16);
    const meta = await metaFor(source);
    const encoder = new FountainEncoder(1, source, meta);
    const receiver = new ReceiverSession();
    for (let i = 0; i < 5; i++) receiver.accept(encoder.next().bytes);
    expect(receiver.meta).not.toBeNull();

    receiver.reset();
    expect(receiver.meta).toBeNull();
    expect(receiver.sessionId).toBeNull();
    expect(receiver.stats().framesAccepted).toBe(0);
  });
});

describe('декодер', () => {
  it('не растёт по памяти сверх лимита отложенных кадров', async () => {
    const source = randomBytes(50_000, 17);
    const meta = await metaFor(source);
    const encoder = new FountainEncoder(1, source, meta);
    const decoder = new FountainDecoder(meta, { maxPending: 64 });
    // Только фонтанные кадры высокой степени: систематический пролог пропускаем.
    for (let seq = meta.blockCount; seq < meta.blockCount + 3000; seq++) {
      const parsed = parseFrame(encoder.encodeSeq(seq));
      if (!parsed.ok || parsed.frame.type !== FrameType.Data) continue;
      decoder.push(parsed.frame.seq, parsed.frame.payload);
      expect(decoder.pendingCount).toBeLessThanOrEqual(64);
    }
  });

  it('missingBlocks показывает недостающие индексы', async () => {
    const source = randomBytes(BLOCK_SIZE * 5, 18);
    const meta = await metaFor(source);
    const encoder = new FountainEncoder(1, source, meta);
    const decoder = new FountainDecoder(meta);
    for (const seq of [0, 1, 3]) {
      const parsed = parseFrame(encoder.encodeSeq(seq));
      if (!parsed.ok || parsed.frame.type !== FrameType.Data) throw new Error('unexpected');
      decoder.push(seq, parsed.frame.payload);
    }
    expect(decoder.missingBlocks()).toEqual([2, 4]);
    expect(decoder.isComplete).toBe(false);
    expect(() => decoder.assemble()).toThrow();
  });
});
