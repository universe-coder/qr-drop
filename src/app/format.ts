/**
 * Форматирование чисел для интерфейса на всех языках приложения.
 *
 * Формы слов для длительностей берутся из Intl: правила множественного числа
 * в арабском (шесть форм) или французском вручную воспроизводить незачем.
 * Русский оставлен на своей таблице — у него короткий хвост «2 минуты 15 с»,
 * которого Intl не даёт. Цифры везде латинские: счётчики на экране набраны
 * моноширинным шрифтом, и восточноарабские цифры там смотрелись бы чужими.
 */

export type Lang = 'ru' | 'en' | 'zh' | 'ar' | 'fr';

export const LANGS: readonly Lang[] = ['en', 'ru', 'zh', 'ar', 'fr'];

/** Языки с письмом справа налево. */
export function isRtl(lang: Lang): boolean {
  return lang === 'ar';
}

/** Выбор формы слова по русским правилам: 1 файл, 2 файла, 5 файлов. */
export function plural(count: number, one: string, few: string, many: string): string {
  const abs = Math.abs(count) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last > 1 && last < 5) return few;
  if (last === 1) return one;
  return many;
}

const UNITS: Record<Lang, { b: string; kb: string; mb: string; perSecond: string }> = {
  ru: { b: 'Б', kb: 'КБ', mb: 'МБ', perSecond: '/с' },
  en: { b: 'B', kb: 'KB', mb: 'MB', perSecond: '/s' },
  zh: { b: 'B', kb: 'KB', mb: 'MB', perSecond: '/秒' },
  ar: { b: 'بايت', kb: 'ك.ب', mb: 'م.ب', perSecond: '/ث' },
  fr: { b: 'o', kb: 'Ko', mb: 'Mo', perSecond: '/s' },
};

function decimal(value: number, digits: number, lang: Lang): string {
  return new Intl.NumberFormat(lang, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    numberingSystem: 'latn',
  }).format(value);
}

function unit(value: number, name: 'second' | 'minute' | 'hour', display: 'long' | 'short', lang: Lang): string {
  return new Intl.NumberFormat(lang, {
    style: 'unit',
    unit: name,
    unitDisplay: display,
    numberingSystem: 'latn',
  }).format(value);
}

export function formatBytes(bytes: number, lang: Lang): string {
  const names = UNITS[lang];
  if (bytes < 1024) return `${bytes} ${names.b}`;
  if (bytes < 1024 * 1024) return `${decimal(bytes / 1024, bytes < 10 * 1024 ? 1 : 0, lang)} ${names.kb}`;
  return `${decimal(bytes / (1024 * 1024), 1, lang)} ${names.mb}`;
}

export function formatDuration(seconds: number, lang: Lang): string {
  const total = Math.max(0, Math.round(seconds));
  if (lang === 'ru') return formatDurationRu(total);

  // Китайский пишет единицы слитно: «2分钟15秒».
  const gap = lang === 'zh' ? '' : ' ';
  if (total < 60) return unit(total, 'second', 'long', lang);

  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes < 60) {
    const head = unit(minutes, 'minute', 'long', lang);
    return rest >= 10 ? `${head}${gap}${unit(rest, 'second', 'short', lang)}` : head;
  }

  const hours = Math.floor(minutes / 60);
  return `${unit(hours, 'hour', 'long', lang)}${gap}${unit(minutes % 60, 'minute', 'short', lang)}`;
}

function formatDurationRu(total: number): string {
  if (total < 60) return `${total} ${plural(total, 'секунда', 'секунды', 'секунд')}`;

  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes < 60) {
    const head = `${minutes} ${plural(minutes, 'минута', 'минуты', 'минут')}`;
    return rest >= 10 ? `${head} ${rest} с` : head;
  }

  const hours = Math.floor(minutes / 60);
  return `${hours} ${plural(hours, 'час', 'часа', 'часов')} ${minutes % 60} мин`;
}

/** Короткая форма для счётчиков, которые обновляются каждую секунду. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, '0')}`;
}

export function formatSpeed(bytesPerSecond: number, lang: Lang): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '—';
  const names = UNITS[lang];
  if (bytesPerSecond < 1024) return `${Math.round(bytesPerSecond)} ${names.b}${names.perSecond}`;
  return `${decimal(bytesPerSecond / 1024, 1, lang)} ${names.kb}${names.perSecond}`;
}

export function formatPercent(value: number): string {
  return `${Math.min(100, Math.max(0, Math.round(value * 100)))}%`;
}
