/**
 * Снимок пикселей с `ImageBitmap`.
 *
 * Живёт отдельным модулем ради одной строчки порядка: размеры обязаны быть
 * прочитаны ДО `close()`. После закрытия картинка отсоединяется, `width` и
 * `height` становятся нулями, и `getImageData` с нулевой стороной бросает
 * `IndexSizeError` — то есть каждый кадр камеры падал бы, а приём молча не
 * работал бы вовсе. Внутри воркера такую ошибку не видно, поэтому порядок
 * закреплён тестом.
 */

/** Минимум, который нужен от canvas: позволяет подменить его в тестах. */
export interface PixelSurface {
  width: number;
  height: number;
  getContext(id: '2d', options?: unknown): PixelContext | null;
}

export interface PixelContext {
  drawImage(image: CanvasImageSource, dx: number, dy: number): void;
  getImageData(sx: number, sy: number, sw: number, sh: number): ImageData;
}

export interface BitmapReaderOptions {
  /** Создаёт полотно нужного размера. Переиспользуется между кадрами. */
  createSurface: (width: number, height: number) => PixelSurface;
}

export function createBitmapReader({ createSurface }: BitmapReaderOptions) {
  let surface: PixelSurface | null = null;
  let context: PixelContext | null = null;

  return function readPixels(bitmap: ImageBitmap): ImageData {
    const width = bitmap.width;
    const height = bitmap.height;

    if (!surface || surface.width !== width || surface.height !== height) {
      surface = createSurface(width, height);
      context = surface.getContext('2d', { willReadFrequently: true });
    }
    if (!context) {
      bitmap.close();
      throw new Error('2d context is not available');
    }

    try {
      context.drawImage(bitmap, 0, 0);
    } finally {
      // Закрывать обязательно и на пути с ошибкой: иначе кадры камеры
      // копятся в памяти воркера до конца сессии.
      bitmap.close();
    }
    return context.getImageData(0, 0, width, height);
  };
}
