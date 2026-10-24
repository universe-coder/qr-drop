/** Магия 'QD' — QR Drop. */
export const MAGIC_0 = 0x51;
export const MAGIC_1 = 0x44;

/** Версия протокола. Пишется в старший ниббл третьего байта. */
export const PROTOCOL_VERSION = 1;

export const FrameType = {
  /** Описание файла: имя, MIME, размер, SHA-256, геометрия блоков. */
  Meta: 0,
  /** Фонтанный кадр: XOR выбранных исходных блоков. */
  Data: 1,
} as const;

export type FrameType = (typeof FrameType)[keyof typeof FrameType];

/** Байт до полезной нагрузки: magic(2) + verType(1) + session(2). */
export const COMMON_HEADER_BYTES = 5;
/** Хвостовой CRC-32. */
export const CRC_BYTES = 4;
/** Полные накладные расходы кадра данных: общий заголовок + seq(4) + CRC. */
export const DATA_FRAME_OVERHEAD = COMMON_HEADER_BYTES + 4 + CRC_BYTES; // 13
/** Накладные расходы META без имени файла и MIME. */
export const META_FRAME_OVERHEAD =
  COMMON_HEADER_BYTES + 4 + 4 + 4 + 32 + 4 + 1 + 1 + CRC_BYTES; // 59

/**
 * Число блоков для файла. Пустой файл всё равно занимает один блок:
 * иначе передавать было бы нечего, а приёмнику не от чего считать прогресс.
 */
export function blockCountFor(size: number, blockSize: number): number {
  return Math.max(1, Math.ceil(size / blockSize));
}

export interface FileMeta {
  /** Имя файла как его показать получателю. */
  name: string;
  /** MIME-тип; пустая строка, если неизвестен. */
  mime: string;
  /** Полный размер файла в байтах. */
  size: number;
  /** SHA-256 всего файла. */
  hash: Uint8Array;
  /** Размер одного исходного блока в байтах. */
  blockSize: number;
  /** Число исходных блоков K = ceil(size / blockSize). */
  blockCount: number;
}

export interface MetaFrame {
  type: typeof FrameType.Meta;
  session: number;
  meta: FileMeta;
}

export interface DataFrame {
  type: typeof FrameType.Data;
  session: number;
  /** Номер кадра: seq < K — систематический блок, seq >= K — фонтанный. */
  seq: number;
  /** XOR исходных блоков, выбранных по seq. Длина = blockSize. */
  payload: Uint8Array;
}

export type Frame = MetaFrame | DataFrame;

export const ParseError = {
  TooShort: 'too-short',
  BadMagic: 'bad-magic',
  BadVersion: 'bad-version',
  BadType: 'bad-type',
  BadCrc: 'bad-crc',
  Malformed: 'malformed',
  /** Отправитель считает расписание кадров иначе — собирать нечего. */
  ScheduleMismatch: 'schedule-mismatch',
} as const;

export type ParseError = (typeof ParseError)[keyof typeof ParseError];

export type ParseResult = { ok: true; frame: Frame } | { ok: false; error: ParseError };
