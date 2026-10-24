/** Форматирование чисел для интерфейса на обоих языках. */

export type Lang = 'ru' | 'en';

/** Выбор формы слова по русским правилам: 1 файл, 2 файла, 5 файлов. */
export function plural(count: number, one: string, few: string, many: string): string {
  const abs = Math.abs(count) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (last > 1 && last < 5) return few;
  if (last === 1) return one;
  return many;
}

const UNITS = {
  ru: { b: 'Б', kb: 'КБ', mb: 'МБ', perSecond: '/с' },
  en: { b: 'B', kb: 'KB', mb: 'MB', perSecond: '/s' },
} as const;

export function formatBytes(bytes: number, lang: Lang): string {
  const unit = UNITS[lang];
  if (bytes < 1024) return `${bytes} ${unit.b}`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} ${unit.kb}`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ${unit.mb}`;
}

function unitWord(count: number, lang: Lang, ru: [string, string, string], en: [string, string]): string {
  return lang === 'ru' ? plural(count, ...ru) : count === 1 ? en[0] : en[1];
}

export function formatDuration(seconds: number, lang: Lang): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) {
    return `${total} ${unitWord(total, lang, ['секунда', 'секунды', 'секунд'], ['second', 'seconds'])}`;
  }

  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes < 60) {
    const head = `${minutes} ${unitWord(minutes, lang, ['минута', 'минуты', 'минут'], ['minute', 'minutes'])}`;
    return rest >= 10 ? `${head} ${rest} ${lang === 'ru' ? 'с' : 's'}` : head;
  }

  const hours = Math.floor(minutes / 60);
  const hoursWord = unitWord(hours, lang, ['час', 'часа', 'часов'], ['hour', 'hours']);
  return `${hours} ${hoursWord} ${minutes % 60} ${lang === 'ru' ? 'мин' : 'min'}`;
}

/** Короткая форма для счётчиков, которые обновляются каждую секунду. */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, '0')}`;
}

export function formatSpeed(bytesPerSecond: number, lang: Lang): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '—';
  const unit = UNITS[lang];
  if (bytesPerSecond < 1024) return `${Math.round(bytesPerSecond)} ${unit.b}${unit.perSecond}`;
  return `${(bytesPerSecond / 1024).toFixed(1)} ${unit.kb}${unit.perSecond}`;
}

export function formatPercent(value: number): string {
  return `${Math.min(100, Math.max(0, Math.round(value * 100)))}%`;
}
