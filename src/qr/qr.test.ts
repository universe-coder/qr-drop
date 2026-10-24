import { describe, expect, it } from 'vitest';
import jsQR from 'jsqr';
import { blockSizeFor, frameCapacity, modulesPerSide, type ErrorCorrectionLevel } from './capacity';
import { encodeMatrix, type QrMatrix } from './encode';
import { QUIET_ZONE } from './paint';
import { PRESETS, type PresetId } from '../app/presets';
import { buildFileMeta, FountainEncoder } from '../protocol/encoder';
import { parseFrame } from '../protocol/frames';
import { splitmix32 } from '../protocol/prng';
import { ReceiverSession } from '../protocol/receiver';
import { DATA_FRAME_OVERHEAD, FrameType } from '../protocol/types';

/**
 * Растеризует матрицу так же, как это делает `paintMatrix`: целое число
 * пикселей на модуль, тихая зона, никакого сглаживания. Позволяет прогнать
 * настоящий QR через настоящий декодер без браузера.
 */
function rasterize(matrix: QrMatrix, pixelsPerModule: number) {
  const side = (matrix.size + QUIET_ZONE * 2) * pixelsPerModule;
  const data = new Uint8ClampedArray(side * side * 4).fill(255);
  for (let y = 0; y < matrix.size; y++) {
    for (let x = 0; x < matrix.size; x++) {
      if (!matrix.data[y * matrix.size + x]) continue;
      for (let dy = 0; dy < pixelsPerModule; dy++) {
        for (let dx = 0; dx < pixelsPerModule; dx++) {
          const px = (x + QUIET_ZONE) * pixelsPerModule + dx;
          const py = (y + QUIET_ZONE) * pixelsPerModule + dy;
          const offset = (py * side + px) * 4;
          data[offset] = 0;
          data[offset + 1] = 0;
          data[offset + 2] = 0;
        }
      }
    }
  }
  return { data, side };
}

function decode(matrix: QrMatrix, pixelsPerModule = 4): Uint8Array | null {
  const { data, side } = rasterize(matrix, pixelsPerModule);
  const found = jsQR(data, side, side, { inversionAttempts: 'dontInvert' });
  if (!found?.binaryData?.length) return null;
  return Uint8Array.from(found.binaryData);
}

function randomBytes(length: number, seed: number): Uint8Array {
  const rand = splitmix32(seed);
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) bytes[i] = Math.floor(rand() * 256);
  return bytes;
}

describe('ёмкость', () => {
  it('размер блока кратен четырём и влезает в кадр', () => {
    for (const level of ['L', 'M', 'Q', 'H'] as ErrorCorrectionLevel[]) {
      for (let version = 10; version <= 40; version++) {
        const blockSize = blockSizeFor(version, level);
        expect(blockSize % 4).toBe(0);
        expect(blockSize + DATA_FRAME_OVERHEAD).toBeLessThanOrEqual(frameCapacity(version, level));
      }
    }
  });

  it('сторона матрицы совпадает с тем, что выдаёт кодер', () => {
    for (const version of [1, 13, 19, 25, 40]) {
      expect(encodeMatrix(new Uint8Array(4), version, 'L').size).toBe(modulesPerSide(version));
    }
  });
});

describe('двоичный round-trip через настоящий QR', () => {
  it('произвольные байты возвращаются в точности', () => {
    // Нули и байты старше 0x7F — то, на чём ломается любой строковый путь.
    const payload = new Uint8Array(700);
    for (let i = 0; i < payload.length; i++) payload[i] = (i * 37 + 11) & 0xff;
    payload[0] = 0;
    payload[1] = 0xff;

    const decoded = decode(encodeMatrix(payload, 21, 'L'));
    expect(decoded).not.toBeNull();
    expect(decoded).toEqual(payload);
  });

  it('строковое поле jsQR для двоичных данных бесполезно', () => {
    // Фиксируем причину, по которой в приёмнике используется binaryData,
    // а нативный BarcodeDetector (только rawValue) не подходит вовсе.
    const payload = randomBytes(300, 7);
    const { data, side } = rasterize(encodeMatrix(payload, 21, 'L'), 4);
    const found = jsQR(data, side, side, { inversionAttempts: 'dontInvert' });
    expect(found).not.toBeNull();
    expect(found!.binaryData.length).toBe(payload.length);
    expect(new TextEncoder().encode(found!.data).length).not.toBe(payload.length);
  });

  for (const id of Object.keys(PRESETS) as PresetId[]) {
    it(`профиль «${id}»: кадр данных читается обратно`, () => {
      const preset = PRESETS[id];
      const payload = randomBytes(preset.blockSize, preset.version);
      const frame = new Uint8Array(preset.blockSize + DATA_FRAME_OVERHEAD);
      frame.set(payload, 9);

      const matrix = encodeMatrix(frame, preset.version, preset.level);
      expect(matrix.size).toBe(preset.modules);
      expect(decode(matrix, 4)).toEqual(frame);
    });
  }

  it('трёх пикселей на модуль хватает даже самому плотному профилю', () => {
    const preset = PRESETS.fast;
    const frame = randomBytes(preset.blockSize + DATA_FRAME_OVERHEAD, 3);
    expect(decode(encodeMatrix(frame, preset.version, preset.level), 3)).toEqual(frame);
  });
});

describe('сквозная передача через настоящие QR-коды', () => {
  it('файл собирается из распознанных кодов при потере половины кадров', async () => {
    const preset = PRESETS.balanced;
    const source = randomBytes(12_000, 42);
    const meta = await buildFileMeta(source, 'скан.pdf', 'application/pdf', preset.blockSize);
    const encoder = new FountainEncoder(0x1234, source, meta);
    const receiver = new ReceiverSession();
    const drop = splitmix32(99);

    let shown = 0;
    let unreadable = 0;
    while (!receiver.isComplete && shown < 600) {
      const frame = encoder.next();
      shown++;
      if (drop() < 0.5) continue;

      const decoded = decode(encodeMatrix(frame.bytes, preset.version, preset.level));
      if (!decoded) {
        unreadable++;
        continue;
      }
      receiver.accept(decoded);
    }

    expect(unreadable).toBe(0);
    expect(receiver.isComplete).toBe(true);
    expect(await receiver.finish()).toEqual(source);
    expect(receiver.meta?.name).toBe('скан.pdf');
  });

  it('служебный кадр влезает в самый маленький профиль с длинным именем', async () => {
    const preset = PRESETS.reliable;
    const name = 'Очень длинное имя файла с описанием содержимого 2026.pdf';
    const meta = await buildFileMeta(randomBytes(5000, 8), name, 'application/pdf', preset.blockSize);
    const matrix = encodeMatrix(
      new Uint8Array(frameCapacity(preset.version, preset.level)).fill(0),
      preset.version,
      preset.level,
    );
    expect(matrix.size).toBe(preset.modules);

    const { encodeMetaFrame } = await import('../protocol/frames');
    const bytes = encodeMetaFrame(1, meta);
    expect(bytes.length).toBeLessThanOrEqual(frameCapacity(preset.version, preset.level));

    const decoded = decode(encodeMatrix(bytes, preset.version, preset.level));
    const parsed = parseFrame(decoded!);
    expect(parsed.ok).toBe(true);
    if (parsed.ok && parsed.frame.type === FrameType.Meta) {
      expect(parsed.frame.meta.name).toBe(name);
    }
  });
});
