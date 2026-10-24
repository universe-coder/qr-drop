/**
 * Байты -> матрица модулей QR-кода.
 *
 * Версия задаётся явно и одинакова для всех кадров передачи, включая META:
 * если код будет менять размер между кадрами, камера принимающего устройства
 * начнёт перефокусироваться и потеряет часть потока.
 */
import QRCode from 'qrcode';
import type { ErrorCorrectionLevel } from './capacity';

export interface QrMatrix {
  /** Сторона матрицы в модулях, без тихой зоны. */
  size: number;
  /** size * size байт, 1 — тёмный модуль. */
  data: Uint8Array;
  version: number;
}

export function encodeMatrix(
  bytes: Uint8Array,
  version: number,
  level: ErrorCorrectionLevel,
): QrMatrix {
  const qr = QRCode.create([{ data: bytes, mode: 'byte' }], {
    errorCorrectionLevel: level,
    version,
  });
  return {
    size: qr.modules.size,
    data: qr.modules.data as unknown as Uint8Array,
    version: qr.version,
  };
}
