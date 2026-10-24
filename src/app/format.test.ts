import { describe, expect, it } from 'vitest';
import { formatBytes, formatClock, formatDuration, formatSpeed, plural } from './format';

describe('форматирование', () => {
  it('русские формы слова', () => {
    expect(plural(1, 'кадр', 'кадра', 'кадров')).toBe('кадр');
    expect(plural(3, 'кадр', 'кадра', 'кадров')).toBe('кадра');
    expect(plural(11, 'кадр', 'кадра', 'кадров')).toBe('кадров');
    expect(plural(21, 'кадр', 'кадра', 'кадров')).toBe('кадр');
  });

  it('размеры с местными единицами и десятичным знаком', () => {
    expect(formatBytes(512, 'ru')).toBe('512 Б');
    expect(formatBytes(2048, 'en')).toBe('2.0 KB');
    expect(formatBytes(3 * 1024 * 1024, 'ru')).toBe('3,0 МБ');
    expect(formatBytes(2560, 'fr')).toBe('2,5 Ko');
    expect(formatBytes(2048, 'zh')).toBe('2.0 KB');
    expect(formatBytes(2048, 'ar')).toBe('2.0 ك.ب');
  });

  it('длительность', () => {
    expect(formatDuration(1, 'en')).toBe('1 second');
    expect(formatDuration(45, 'ru')).toBe('45 секунд');
    expect(formatDuration(125, 'en')).toBe('2 minutes');
    expect(formatDuration(135, 'ru')).toBe('2 минуты 15 с');
    expect(formatDuration(3720, 'en')).toBe('1 hour 2 min');
    // Intl ставит между числом и единицей неразрывный пробел — так и задумано.
    expect(formatDuration(45, 'fr')).toBe('45\u00a0secondes');
    expect(formatDuration(135, 'zh')).toBe('2分钟15秒');
  });

  it('арабский берёт формы числа из Intl, цифры остаются латинскими', () => {
    expect(formatDuration(2, 'ar')).toBe('ثانيتان');
    expect(formatDuration(45, 'ar')).toBe('45 ثانية');
  });

  it('часы и скорость', () => {
    expect(formatClock(65)).toBe('1:05');
    expect(formatSpeed(0, 'en')).toBe('—');
    expect(formatSpeed(2560, 'en')).toBe('2.5 KB/s');
    expect(formatSpeed(2560, 'fr')).toBe('2,5 Ko/s');
  });
});
