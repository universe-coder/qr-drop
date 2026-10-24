/**
 * Тексты интерфейса на пяти языках.
 *
 * Собраны в одном месте намеренно: формулировки здесь — половина продукта.
 * Передача идёт минутами и без обратного канала, поэтому текст обязан всё
 * время объяснять, что происходит и чего ждать, иначе пользователь решит,
 * что приложение зависло, и уйдёт.
 *
 * Словари лежат в `locales/`; все они типизированы русским, поэтому
 * забытый ключ — ошибка компиляции.
 */
import { createContext, useContext } from 'react';
import { LANGS, type Lang } from '../app/format';
import { ar } from './locales/ar';
import { en } from './locales/en';
import { fr } from './locales/fr';
import { ru, type Dictionary } from './locales/ru';
import { zh } from './locales/zh';

export type { Dictionary };

export const DICTIONARIES: Record<Lang, Dictionary> = { ru, en, zh, ar, fr };

/** Название языка на нём самом — так его найдёт тот, кто его читает. */
export const LANG_NAMES: Record<Lang, string> = {
  en: 'English',
  ru: 'Русский',
  zh: '中文',
  ar: 'العربية',
  fr: 'Français',
};

const STORAGE_KEY = 'qr-drop:lang';

/** Первые две буквы BCP 47 тега, для которых есть свой словарь. */
const BY_PREFIX: Record<string, Lang> = {
  ru: 'ru',
  be: 'ru',
  uk: 'ru',
  kk: 'ru',
  en: 'en',
  zh: 'zh',
  ar: 'ar',
  fr: 'fr',
};

export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (LANGS as readonly string[]).includes(saved)) return saved as Lang;
  } catch {
    // Хранилище бывает недоступно в приватном режиме — это не повод падать.
  }
  const preferred = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of preferred) {
    const match = BY_PREFIX[tag.slice(0, 2).toLowerCase()];
    if (match) return match;
  }
  return 'en';
}

export function rememberLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // См. detectLang.
  }
}

export interface I18n {
  lang: Lang;
  t: Dictionary;
  setLang: (lang: Lang) => void;
}

export const I18nContext = createContext<I18n>({ lang: 'en', t: en, setLang: () => undefined });

export function useI18n(): I18n {
  return useContext(I18nContext);
}
