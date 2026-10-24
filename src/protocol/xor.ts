/**
 * XOR блоков. Размер блока всегда кратен 4 (см. `qr/capacity.ts`), поэтому
 * почти всегда работает быстрый путь по 32-битным словам; побайтовый остался
 * как страховка для чужих/тестовых данных.
 */
export function xorInto(target: Uint8Array, source: Uint8Array): void {
  const length = Math.min(target.length, source.length);
  const aligned =
    target.byteOffset % 4 === 0 && source.byteOffset % 4 === 0 && length % 4 === 0;

  if (aligned) {
    const words = length / 4;
    const t = new Uint32Array(target.buffer, target.byteOffset, words);
    const s = new Uint32Array(source.buffer, source.byteOffset, words);
    for (let i = 0; i < words; i++) t[i] ^= s[i];
    return;
  }

  for (let i = 0; i < length; i++) target[i] ^= source[i];
}
