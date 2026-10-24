/**
 * Robust soliton distribution для LT-кодов (Luby, 2002).
 *
 * Кодер выбирает степень кадра d ~ mu(d), декодер использует ту же таблицу,
 * чтобы восстановить набор блоков по номеру кадра. Таблица кумулятивных
 * вероятностей строится один раз на сессию и кэшируется по (K, c, delta).
 */

export interface SolitonParams {
  /** Число исходных блоков. */
  k: number;
  /** Константа c (~0.03…0.2). Меньше — «тяжелее» хвост, больше кадров степени 1. */
  c: number;
  /** Допустимая вероятность неудачи декодирования. */
  delta: number;
}

export const DEFAULT_SOLITON: Omit<SolitonParams, 'k'> = { c: 0.06, delta: 0.05 };

export interface DegreeSampler {
  readonly k: number;
  /** Кумулятивная функция распределения, cdf[d-1] = P(degree <= d). */
  readonly cdf: Float64Array;
  /** Переводит равномерное u в [0,1) в степень из [1, k]. */
  sample(u: number): number;
}

const cache = new Map<string, DegreeSampler>();

export function degreeSampler({ k, c, delta }: SolitonParams): DegreeSampler {
  const key = `${k}|${c}|${delta}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const sampler = buildSampler(k, c, delta);
  // Сессий за время жизни вкладки единицы, но кэш не должен течь на бесконечность.
  if (cache.size > 16) cache.clear();
  cache.set(key, sampler);
  return sampler;
}

function buildSampler(k: number, c: number, delta: number): DegreeSampler {
  const weights = new Float64Array(k);

  // Идеальное солитонное распределение.
  weights[0] = 1 / k;
  for (let d = 2; d <= k; d++) weights[d - 1] = 1 / (d * (d - 1));

  // Робастная добавка tau.
  const r = c * Math.log(k / delta) * Math.sqrt(k);
  const pivot = Math.round(k / r); // k/R
  if (pivot >= 1) {
    for (let d = 1; d <= Math.min(pivot - 1, k); d++) weights[d - 1] += r / (d * k);
    if (pivot <= k) weights[pivot - 1] += (r * Math.log(r / delta)) / k;
  }

  let sum = 0;
  for (let i = 0; i < k; i++) sum += weights[i];

  const cdf = new Float64Array(k);
  let acc = 0;
  for (let i = 0; i < k; i++) {
    acc += weights[i] / sum;
    cdf[i] = acc;
  }
  cdf[k - 1] = 1; // страховка от накопленной ошибки округления

  return {
    k,
    cdf,
    sample(u: number) {
      // Бинарный поиск: степени доходят до k, линейный проход был бы O(k).
      let lo = 0;
      let hi = k - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (u < cdf[mid]) hi = mid;
        else lo = mid + 1;
      }
      return lo + 1;
    },
  };
}
