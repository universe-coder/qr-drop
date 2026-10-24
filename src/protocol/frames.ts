/**
 * Сериализация кадров. Раскладка байтов (little-endian):
 *
 * Общий префикс
 *   0   magic 'Q' 'D'                     2
 *   2   (версия << 4) | тип кадра         1
 *   3   идентификатор сессии              2
 *
 * META (тип 0)
 *   5   размер файла                      4
 *   9   размер блока                      4
 *   13  число блоков K                    4
 *   17  SHA-256 файла                    32
 *   49  отпечаток расписания              4
 *   53  длина имени                       1
 *   54  имя (UTF-8)                       nameLen
 *   ..  длина MIME                        1
 *   ..  MIME (UTF-8)                      mimeLen
 *   ..  CRC-32C                           4
 *
 * DATA (тип 1)
 *   5   номер кадра                       4
 *   9   полезная нагрузка                 blockSize
 *   ..  CRC-32C                           4
 *
 * CRC считается по всем байтам кадра до самого CRC.
 */
import { crc32c } from './crc32';
import { scheduleFingerprint } from './schedule';
import {
  blockCountFor,
  COMMON_HEADER_BYTES,
  CRC_BYTES,
  DATA_FRAME_OVERHEAD,
  FrameType,
  MAGIC_0,
  MAGIC_1,
  META_FRAME_OVERHEAD,
  ParseError,
  PROTOCOL_VERSION,
  type FileMeta,
  type ParseResult,
} from './types';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function writeCommon(view: DataView, bytes: Uint8Array, type: number, session: number): void {
  bytes[0] = MAGIC_0;
  bytes[1] = MAGIC_1;
  bytes[2] = ((PROTOCOL_VERSION & 0x0f) << 4) | (type & 0x0f);
  view.setUint16(3, session & 0xffff, true);
}

function seal(bytes: Uint8Array, view: DataView): Uint8Array {
  view.setUint32(bytes.length - CRC_BYTES, crc32c(bytes, 0, bytes.length - CRC_BYTES), true);
  return bytes;
}

/**
 * Максимальная длина имени файла в байтах при заданной ёмкости кадра.
 * MIME-типу резервируется до 64 байт — он почти всегда короче.
 */
export function maxNameBytes(capacity: number, mimeBytes: number): number {
  return Math.max(0, capacity - META_FRAME_OVERHEAD - mimeBytes);
}

/** Обрезает строку по границе кодовой точки так, чтобы UTF-8 уложился в limit байт. */
export function truncateUtf8(value: string, limit: number): string {
  if (encoder.encode(value).length <= limit) return value;
  let result = '';
  let used = 0;
  for (const char of value) {
    const size = encoder.encode(char).length;
    if (used + size > limit) break;
    result += char;
    used += size;
  }
  return result;
}

export function encodeMetaFrame(session: number, meta: FileMeta): Uint8Array {
  if (meta.hash.length !== 32) throw new Error('meta.hash must be 32 bytes');

  const name = encoder.encode(meta.name);
  const mime = encoder.encode(meta.mime);
  if (name.length > 255 || mime.length > 255) {
    throw new Error('meta name/mime must be <= 255 bytes when encoded');
  }

  const length = META_FRAME_OVERHEAD + name.length + mime.length;
  const bytes = new Uint8Array(length);
  const view = new DataView(bytes.buffer);

  writeCommon(view, bytes, FrameType.Meta, session);
  view.setUint32(5, meta.size, true);
  view.setUint32(9, meta.blockSize, true);
  view.setUint32(13, meta.blockCount, true);
  bytes.set(meta.hash, 17);
  view.setUint32(49, scheduleFingerprint(meta.blockCount), true);
  bytes[53] = name.length;
  bytes.set(name, 54);
  const mimeOffset = 54 + name.length;
  bytes[mimeOffset] = mime.length;
  bytes.set(mime, mimeOffset + 1);

  return seal(bytes, view);
}

export function encodeDataFrame(session: number, seq: number, payload: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(DATA_FRAME_OVERHEAD + payload.length);
  const view = new DataView(bytes.buffer);

  writeCommon(view, bytes, FrameType.Data, session);
  view.setUint32(5, seq >>> 0, true);
  bytes.set(payload, 9);

  return seal(bytes, view);
}

export function parseFrame(bytes: Uint8Array): ParseResult {
  if (bytes.length < COMMON_HEADER_BYTES + CRC_BYTES) {
    return { ok: false, error: ParseError.TooShort };
  }
  if (bytes[0] !== MAGIC_0 || bytes[1] !== MAGIC_1) {
    return { ok: false, error: ParseError.BadMagic };
  }
  if (bytes[2] >> 4 !== PROTOCOL_VERSION) {
    return { ok: false, error: ParseError.BadVersion };
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const crcOffset = bytes.length - CRC_BYTES;
  if (view.getUint32(crcOffset, true) !== crc32c(bytes, 0, crcOffset)) {
    return { ok: false, error: ParseError.BadCrc };
  }

  const type = bytes[2] & 0x0f;
  const session = view.getUint16(3, true);

  if (type === FrameType.Data) {
    if (bytes.length <= DATA_FRAME_OVERHEAD) return { ok: false, error: ParseError.Malformed };
    return {
      ok: true,
      frame: {
        type: FrameType.Data,
        session,
        seq: view.getUint32(5, true),
        // Копия, а не подложка: буфер кадра переиспользуется декодером камеры.
        payload: bytes.slice(9, crcOffset),
      },
    };
  }

  if (type === FrameType.Meta) {
    if (bytes.length < META_FRAME_OVERHEAD) return { ok: false, error: ParseError.Malformed };
    const size = view.getUint32(5, true);
    const blockSize = view.getUint32(9, true);
    const blockCount = view.getUint32(13, true);
    const hash = bytes.slice(17, 49);
    const fingerprint = view.getUint32(49, true);
    const nameLen = bytes[53];
    const mimeOffset = 54 + nameLen;
    if (mimeOffset >= crcOffset) return { ok: false, error: ParseError.Malformed };
    const mimeLen = bytes[mimeOffset];
    if (mimeOffset + 1 + mimeLen !== crcOffset) return { ok: false, error: ParseError.Malformed };
    if (blockSize === 0 || blockCount === 0) return { ok: false, error: ParseError.Malformed };
    if (blockCount !== blockCountFor(size, blockSize)) return { ok: false, error: ParseError.Malformed };
    // Расписание должно совпасть до единого бита, иначе собранный файл будет
    // мусором, а узнаем мы об этом только по SHA-256 в самом конце.
    if (fingerprint !== scheduleFingerprint(blockCount)) {
      return { ok: false, error: ParseError.ScheduleMismatch };
    }

    return {
      ok: true,
      frame: {
        type: FrameType.Meta,
        session,
        meta: {
          size,
          blockSize,
          blockCount,
          hash,
          name: decoder.decode(bytes.subarray(54, 54 + nameLen)),
          mime: decoder.decode(bytes.subarray(mimeOffset + 1, crcOffset)),
        },
      },
    };
  }

  return { ok: false, error: ParseError.BadType };
}
