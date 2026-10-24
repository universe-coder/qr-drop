/**
 * Отрисовка матрицы на canvas.
 *
 * Рисуем в маленький буфер с одним пикселем на модуль и растягиваем его с
 * выключенным сглаживанием. Так границы модулей остаются идеально резкими при
 * любом масштабе — размытые края это главная причина, по которой сканер
 * начинает пропускать кадры.
 */
import type { QrMatrix } from './encode';

/** Тихая зона в модулях. Стандарт требует минимум 4. */
export const QUIET_ZONE = 4;

let scratch: HTMLCanvasElement | OffscreenCanvas | null = null;

function getScratch(side: number): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  if (!scratch || scratch.width !== side || scratch.height !== side) {
    scratch =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(side, side)
        : Object.assign(document.createElement('canvas'), { width: side, height: side });
    if (scratch instanceof HTMLCanvasElement) {
      scratch.width = side;
      scratch.height = side;
    }
  }
  const ctx = (scratch as HTMLCanvasElement).getContext('2d', { willReadFrequently: false });
  if (!ctx) throw new Error('2d context is not available');
  return ctx as CanvasRenderingContext2D;
}

/**
 * Подгоняет буфер полотна под его размер на экране, в реальных пикселях.
 *
 * Делается прямо перед отрисовкой кадра, а не по ResizeObserver снаружи:
 * запись в canvas.width стирает содержимое, и если её делает кто-то другой,
 * на экране остаётся белый квадрат до следующего кадра — то есть до 125 мс
 * пустоты, которые сканер просто теряет.
 */
export function fitCanvasToBox(canvas: HTMLCanvasElement): void {
  const width = canvas.clientWidth;
  if (!width) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 3);
  const pixels = Math.round(width * ratio);
  if (canvas.width === pixels && canvas.height === pixels) return;
  canvas.width = pixels;
  canvas.height = pixels;
}

export interface PaintOptions {
  /** Цвет тёмных модулей. */
  dark?: string;
  /** Цвет фона и тихой зоны. */
  light?: string;
}

/**
 * Рисует матрицу так, чтобы она заняла весь квадратный canvas.
 * Canvas должен быть квадратным; размер в пикселях задаёт вызывающая сторона.
 */
export function paintMatrix(
  canvas: HTMLCanvasElement,
  matrix: QrMatrix,
  options: PaintOptions = {},
): void {
  const { dark = '#000000', light = '#ffffff' } = options;
  const side = matrix.size + QUIET_ZONE * 2;

  const source = getScratch(side);
  source.fillStyle = light;
  source.fillRect(0, 0, side, side);
  source.fillStyle = dark;
  for (let y = 0; y < matrix.size; y++) {
    const row = y * matrix.size;
    for (let x = 0; x < matrix.size; x++) {
      if (matrix.data[row + x]) source.fillRect(x + QUIET_ZONE, y + QUIET_ZONE, 1, 1);
    }
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Целое число пикселей на модуль: дробный масштаб даёт модули разной ширины,
  // и сканеру сложнее попасть в центр каждого.
  const scale = Math.max(1, Math.floor(canvas.width / side));
  const painted = side * scale;
  const offset = Math.floor((canvas.width - painted) / 2);

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(source.canvas as CanvasImageSource, offset, offset, painted, painted);
}
