import { describe, expect, it } from 'vitest';
import { formatBytes, formatClock, formatDuration, formatSpeed, plural } from './format';

describe('форматирование', () => {
  it('русские формы слова', () => {
    expect(plural(1, 'кадр', 'кадра', 'кадров')).toBe('кадр');
    expect(plural(3, 'кадр', 'кадра', 'кадров')).toBe('кадра');
    expect(plural(11, 'кадр', 'кадра', 'кадров')).toBe('кадров');
    expect(plural(21, 'кадр', 'кадра', 'кадров')).toBe('кадр');
  });

  it('размеры на обоих языках', () => {
    expect(formatBytes(512, 'ru')).toBe('512 Б');
    expect(formatBytes(2048, 'en')).toBe('2.0 KB');
    expect(formatBytes(3 * 1024 * 1024, 'ru')).toBe('3.0 МБ');
  });

  it('длительность', () => {
    expect(formatDuration(1, 'en')).toBe('1 second');
    expect(formatDuration(45, 'ru')).toBe('45 секунд');
    expect(formatDuration(125, 'en')).toBe('2 minutes');
    expect(formatDuration(135, 'ru')).toBe('2 минуты 15 с');
    expect(formatDuration(3720, 'en')).toBe('1 hour 2 min');
  });

  it('часы и скорость', () => {
    expect(formatClock(65)).toBe('1:05');
    expect(formatSpeed(0, 'en')).toBe('—');
    expect(formatSpeed(2560, 'en')).toBe('2.5 KB/s');
  });
});
