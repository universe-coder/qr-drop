/**
 * splitmix32 — маленький детерминированный PRNG.
 *
 * Кодер и декодер обязаны получать ровно одну и ту же последовательность из
 * одного и того же seed: номер кадра — единственное, что передаётся по каналу,
 * а набор исходных блоков в кадре обе стороны выводят из него сами.
 * Поэтому реализация зафиксирована здесь и не должна меняться без смены
 * версии протокола.
 */
export type Rand = () => number;

export function splitmix32(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x9e3779b9) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad) >>> 0;
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97) >>> 0;
    return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
  };
}

/**
 * Выбирает `count` различных индексов из [0, total) за O(count).
 *
 * Частичный Фишер–Йетс поверх «ленивой» перестановки: вместо массива длиной
 * total держим только реально затронутые позиции. Для K в десятки тысяч и
 * степени в единицы это на порядки дешевле полной перестановки.
 */
export function pickDistinct(rand: Rand, total: number, count: number): Uint32Array {
  const n = Math.min(count, total);
  const out = new Uint32Array(n);
  const swapped = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    const j = i + Math.floor(rand() * (total - i));
    const vi = swapped.get(i) ?? i;
    const vj = swapped.get(j) ?? j;
    out[i] = vj;
    swapped.set(j, vi);
  }
  return out;
}
