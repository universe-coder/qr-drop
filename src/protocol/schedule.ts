/**
 * Расписание кадров — единственное место, где кодер и декодер обязаны
 * совпадать бит в бит. По каналу передаётся только номер кадра `seq`;
 * набор исходных блоков обе стороны выводят из него этой функцией.
 *
 * Схема — систематические проходы, разбавленные фонтаном:
 *
 *   seq mod 5K < K   — ровно один исходный блок с индексом (seq mod 5K);
 *   иначе            — LT-кадр со степенью по robust soliton.
 *
 * Систематический пролог даёт идеальный случай: при чистом приёме файл
 * собирается ровно за K кадров, без накладных расходов фонтана вообще.
 * Повтор пролога каждые 5K кадров нужен тому, кто навёл камеру позже начала
 * передачи: иначе он навсегда остаётся с накладными расходами чистого LT.
 *
 * Лестница остаточной доли
 * ------------------------
 * Наивная связка «пролог + обычный RSD(K)» под потерями работает ХУЖЕ чистого
 * LT: распределение рассчитано на то, что неизвестны все K блоков, а после
 * пролога их осталось меньше, и заметная доля кадров приходит уже полностью
 * выводимой из известного — то есть впустую. Поэтому в фонтанной фазе степень
 * берётся из RSD(K*u) для предполагаемой остаточной доли u, циклически по
 * фиксированной лестнице, и масштабируется обратно в 1/u раз. Приёмник
 * повторяет ту же лестницу по seq и ничего не сообщает отправителю.
 *
 * Замерено на симуляции BP-декодера (60 прогонов на точку, K от 64 до 1024):
 * лестница снимает 5–9% кадров при потерях 30–60% — это рабочий режим съёмки
 * с рук. При потерях 75% и выше она, наоборот, добавляет 2–4%, но такая
 * передача и без того безнадёжна по времени. Более глубокие лестницы (до 0.1)
 * проверялись и оказались заметно хуже во всём диапазоне: раздутая степень
 * даёт кадры, которые нечем свернуть до самого конца сборки.
 */
import { pickDistinct, splitmix32 } from './prng';
import { degreeSampler, DEFAULT_SOLITON, type SolitonParams } from './soliton';

export type ScheduleParams = Pick<SolitonParams, 'c' | 'delta'>;

export const DEFAULT_SCHEDULE: ScheduleParams = DEFAULT_SOLITON;

/** Предполагаемые доли ещё не собранного файла. */
const RESIDUAL_LADDER = [1, 0.8, 0.6, 0.4] as const;

/** Длина цикла в кадрах: систематический проход плюс фонтан. */
const CYCLE_MULTIPLIER = 5;

/**
 * Индексы исходных блоков, участвующих в кадре `seq`.
 * Возвращаемый массив принадлежит вызывающей стороне.
 */
export function blockIndicesForSeq(
  seq: number,
  blockCount: number,
  params: ScheduleParams = DEFAULT_SCHEDULE,
): Uint32Array {
  // Файл в один блок: любой кадр — это и есть весь файл.
  if (blockCount <= 1) return Uint32Array.of(0);

  const phase = seq % (CYCLE_MULTIPLIER * blockCount);
  if (phase < blockCount) return Uint32Array.of(phase);

  const rand = splitmix32(seq >>> 0);
  const residual = RESIDUAL_LADDER[(seq - blockCount) % RESIDUAL_LADDER.length];

  // Степень подбирается под «сжавшийся» файл, затем растягивается обратно:
  // кадр всё равно покрывает все K блоков, но плотность соответствует тому,
  // сколько их предположительно осталось неизвестными.
  const assumed = Math.max(1, Math.round(blockCount * residual));
  const scaled = degreeSampler({ k: assumed, c: params.c, delta: params.delta }).sample(rand());
  const degree = Math.min(blockCount, Math.max(1, Math.round(scaled / residual)));

  return pickDistinct(rand, blockCount, degree);
}

/**
 * Отпечаток расписания для заданного K.
 *
 * Обе стороны — один и тот же код, но одна из вкладок может работать на
 * закэшированной старой сборке. Тогда расписания разойдутся, файл соберётся
 * из мусора, и единственным сигналом станет несошедшийся SHA-256 через
 * несколько минут съёмки. Отпечаток превращает это в честную ошибку сразу.
 */
export function scheduleFingerprint(blockCount: number, params: ScheduleParams = DEFAULT_SCHEDULE): number {
  // Точки выборки покрывают оба режима: систематический проход и лестницу.
  const probes = [0, 1, blockCount - 1, blockCount, blockCount + 1, blockCount + 2, blockCount + 3];
  let hash = 0x811c9dc5;
  for (const seq of probes) {
    if (seq < 0) continue;
    for (const index of blockIndicesForSeq(seq, blockCount, params)) {
      hash = (Math.imul(hash ^ index, 0x01000193) + seq) >>> 0;
    }
    hash = (Math.imul(hash ^ 0x9e37, 0x01000193) >>> 0) >>> 0;
  }
  return hash >>> 0;
}

/**
 * Служебный ли это слот показа.
 *
 * Плотно в начале и редко потом: тот, кто навёл камеру сразу, получает
 * описание файла в первых же слотах даже при сильных потерях, а в устойчивом
 * режиме служебные кадры съедают только 1/16 потока.
 */
export function isMetaSlot(slot: number): boolean {
  return slot < 32 ? slot % 4 === 0 : slot % 16 === 0;
}
