import { describe, expect, it } from 'vitest';
import { estimate, MAX_FILE_BYTES, metaFitsPreset, PRESETS, slotsForDataFrames } from './presets';
import { isMetaSlot } from '../protocol/schedule';
import { frameCapacity } from '../qr/capacity';
import { DATA_FRAME_OVERHEAD, META_FRAME_OVERHEAD } from '../protocol/types';

describe('расписание служебных слотов', () => {
  it('формула слотов в точности повторяет isMetaSlot', () => {
    const actual = new Map<number, number>();
    let data = 0;
    for (let slot = 0; slot < 5000; slot++) {
      if (isMetaSlot(slot)) continue;
      data++;
      if (!actual.has(data)) actual.set(data, slot + 1);
    }
    for (const [frames, slots] of actual) {
      expect(slotsForDataFrames(frames), `кадров данных: ${frames}`).toBe(slots);
    }
    expect(actual.size).toBeGreaterThan(4000);
  });

  it('первые 32 слота дают 8 шансов поймать описание файла', () => {
    let metas = 0;
    for (let slot = 0; slot < 32; slot++) if (isMetaSlot(slot)) metas++;
    expect(metas).toBe(8);
  });

  it('в устойчивом режиме служебные кадры занимают одну шестнадцатую потока', () => {
    let metas = 0;
    for (let slot = 32; slot < 32 + 1600; slot++) if (isMetaSlot(slot)) metas++;
    expect(metas).toBe(100);
  });

  it('нулю кадров соответствует нулевая длина', () => {
    expect(slotsForDataFrames(0)).toBe(0);
    expect(slotsForDataFrames(-5)).toBe(0);
  });
});

describe('профили', () => {
  it('кадр данных влезает в выбранную версию QR', () => {
    for (const preset of Object.values(PRESETS)) {
      expect(preset.blockSize + DATA_FRAME_OVERHEAD).toBeLessThanOrEqual(
        frameCapacity(preset.version, preset.level),
      );
      expect(preset.blockSize % 4).toBe(0);
      expect(preset.modules).toBe(preset.version * 4 + 17);
    }
  });

  it('описание файла с длинным именем влезает в любой профиль', () => {
    // 96 байт под имя и 64 под MIME — предел, который выставляет экран отправки.
    for (const preset of Object.values(PRESETS)) {
      expect(metaFitsPreset(preset, 96, 64), preset.id).toBe(true);
      expect(frameCapacity(preset.version, preset.level)).toBeGreaterThanOrEqual(
        META_FRAME_OVERHEAD + 96 + 64,
      );
    }
  });

  it('оценка времени растёт с размером и не обещает невозможного', () => {
    for (const preset of Object.values(PRESETS)) {
      const small = estimate(10_000, preset);
      const large = estimate(100_000, preset);
      expect(large.likelySeconds).toBeGreaterThan(small.likelySeconds);
      // Реалистичная оценка обязана быть пессимистичнее идеальной.
      expect(large.likelySeconds).toBeGreaterThan(large.bestSeconds);
      expect(large.blocks).toBe(Math.ceil(100_000 / preset.blockSize));
    }
  });

  it('предельный файл остаётся в разумных пределах по времени', () => {
    const worst = estimate(MAX_FILE_BYTES, PRESETS.reliable);
    // Не проверка качества, а страховка от случайной смены константы:
    // предельный файл на самом медленном профиле не должен уйти за сутки.
    expect(worst.likelySeconds).toBeLessThan(24 * 3600);
    expect(worst.likelySeconds).toBeGreaterThan(600);
  });
});
