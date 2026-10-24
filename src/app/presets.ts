/**
 * Профили передачи.
 *
 * Компромисс всегда один: чем больше данных в кадре, тем крупнее и мельче
 * модули QR-кода, тем выше требования к камере, свету и фокусу. Крупный код на
 * тусклом экране в движении не читается вовсе, поэтому «быстро» здесь означает
 * «быстро при хороших условиях», а не всегда.
 */
import { META_FRAME_OVERHEAD } from '../protocol/types';
import { blockSizeFor, frameCapacity, type ErrorCorrectionLevel } from '../qr/capacity';

export type PresetId = 'reliable' | 'balanced' | 'fast';

export interface Preset {
  id: PresetId;
  /** Версия QR-кода: 1…40, определяет размер матрицы. */
  version: number;
  level: ErrorCorrectionLevel;
  /** Сколько кадров в секунду показывать. */
  fps: number;
  /** Байт данных в одном кадре. */
  blockSize: number;
  /** Модулей по стороне матрицы. */
  modules: number;
}

function make(id: PresetId, version: number, level: ErrorCorrectionLevel, fps: number): Preset {
  return {
    id,
    version,
    level,
    fps,
    blockSize: blockSizeFor(version, level),
    modules: version * 4 + 17,
  };
}

export const PRESETS: Record<PresetId, Preset> = {
  // Крупные модули и запас коррекции — читается даже с посредственной камерой.
  reliable: make('reliable', 13, 'M', 8),
  // Рабочая точка по умолчанию.
  balanced: make('balanced', 19, 'L', 10),
  // Требует хорошей камеры, яркого экрана и устойчивых рук.
  fast: make('fast', 25, 'L', 12),
};

export const DEFAULT_PRESET: PresetId = 'balanced';

/**
 * Доля показанных кадров, которую реально успевает распознать камера.
 * Оценка эмпирическая и намеренно пессимистичная: лучше показать срок с
 * запасом, чем обещать минуту и передавать три.
 */
const CAPTURE_RATE: Record<PresetId, number> = {
  reliable: 0.55,
  balanced: 0.45,
  fast: 0.35,
};

/** Накладные расходы фонтанного кода при потерях (измерено на симуляции). */
const FOUNTAIN_OVERHEAD = 1.2;

export interface Estimate {
  /** Число исходных блоков. */
  blocks: number;
  /** Оптимистичная оценка в секундах: приём без потерь. */
  bestSeconds: number;
  /** Реалистичная оценка в секундах. */
  likelySeconds: number;
  /** Байт полезных данных в секунду при реалистичной оценке. */
  bytesPerSecond: number;
}

export function estimate(sizeBytes: number, preset: Preset): Estimate {
  const blocks = Math.max(1, Math.ceil(sizeBytes / preset.blockSize));
  const bestSeconds = slotsForDataFrames(blocks) / preset.fps;
  const likelySeconds =
    slotsForDataFrames(Math.ceil(blocks * FOUNTAIN_OVERHEAD)) /
    (preset.fps * CAPTURE_RATE[preset.id]);
  return {
    blocks,
    bestSeconds,
    likelySeconds,
    bytesPerSecond: likelySeconds > 0 ? sizeBytes / likelySeconds : 0,
  };
}

/**
 * Сколько слотов показа нужно, чтобы отдать `frames` кадров данных.
 *
 * Обратная функция к `isMetaSlot`. Плоского коэффициента здесь мало: в первых
 * 32 слотах служебные кадры идут вчетверо чаще, и на коротком файле это
 * заметная разница — прогресс дошёл бы до конца раньше, чем поток реально
 * закончил проход.
 */
export function slotsForDataFrames(frames: number): number {
  if (frames <= 0) return 0;
  // Слоты 0…31: служебный каждый 4-й, то есть 3 кадра данных на 4 слота.
  const dense = 24;
  if (frames <= dense) return Math.ceil((frames * 4) / 3);
  // Дальше служебный каждый 16-й: 15 кадров данных на 16 слотов.
  return 32 + Math.ceil(((frames - dense) * 16) / 15);
}

/**
 * Верхняя граница размера файла.
 *
 * Не техническое ограничение, а защита от заведомо безнадёжной затеи: 2 МБ на
 * «обычном» профиле — это уже около полутора часов съёмки.
 */
export const MAX_FILE_BYTES = 2 * 1024 * 1024;

/** Проверяет, что описание файла влезет в кадр выбранного профиля. */
export function metaFitsPreset(preset: Preset, nameBytes: number, mimeBytes: number): boolean {
  return frameCapacity(preset.version, preset.level) >= META_FRAME_OVERHEAD + nameBytes + mimeBytes;
}
