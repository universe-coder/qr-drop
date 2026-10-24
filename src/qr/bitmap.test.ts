import { describe, expect, it, vi } from 'vitest';
import { createBitmapReader, type PixelContext, type PixelSurface } from './bitmap';

/**
 * Заглушка, повторяющая поведение настоящего ImageBitmap: после close()
 * картинка отсоединяется и её размеры становятся нулями.
 */
function fakeBitmap(width: number, height: number) {
  const bitmap = {
    width,
    height,
    closed: false,
    close() {
      bitmap.closed = true;
      bitmap.width = 0;
      bitmap.height = 0;
    },
  };
  return bitmap;
}

function fakeSurface(width: number, height: number) {
  const calls: Array<{ sw: number; sh: number }> = [];
  const context: PixelContext = {
    drawImage: vi.fn(),
    getImageData(_sx, _sy, sw, sh) {
      calls.push({ sw, sh });
      // Ровно та же ошибка, что бросает настоящий canvas на нулевой стороне.
      if (sw === 0 || sh === 0) throw new Error('IndexSizeError: The source width is 0.');
      return { data: new Uint8ClampedArray(sw * sh * 4), width: sw, height: sh } as ImageData;
    },
  };
  const surface: PixelSurface = { width, height, getContext: () => context };
  return { surface, context, calls };
}

describe('чтение пикселей с ImageBitmap', () => {
  it('снимает размеры до close(), а не после', () => {
    const { surface, calls } = fakeSurface(512, 512);
    const read = createBitmapReader({ createSurface: () => surface });

    const bitmap = fakeBitmap(512, 512);
    const image = read(bitmap as unknown as ImageBitmap);

    expect(image.width).toBe(512);
    expect(image.height).toBe(512);
    expect(calls).toEqual([{ sw: 512, sh: 512 }]);
    expect(bitmap.closed).toBe(true);
  });

  it('закрывает картинку даже когда drawImage бросает', () => {
    const { surface, context } = fakeSurface(64, 64);
    vi.mocked(context.drawImage).mockImplementation(() => {
      throw new Error('draw failed');
    });
    const read = createBitmapReader({ createSurface: () => surface });

    const bitmap = fakeBitmap(64, 64);
    expect(() => read(bitmap as unknown as ImageBitmap)).toThrow('draw failed');
    // Иначе кадры камеры копились бы в памяти воркера всю сессию.
    expect(bitmap.closed).toBe(true);
  });

  it('переиспользует полотно, пока размер не менялся', () => {
    const { surface } = fakeSurface(512, 512);
    const createSurface = vi.fn(() => surface);
    const read = createBitmapReader({ createSurface });

    for (let i = 0; i < 5; i++) read(fakeBitmap(512, 512) as unknown as ImageBitmap);
    expect(createSurface).toHaveBeenCalledTimes(1);
  });

  it('пересоздаёт полотно при смене размера кадра', () => {
    const createSurface = vi.fn((w: number, h: number) => fakeSurface(w, h).surface);
    const read = createBitmapReader({ createSurface });

    read(fakeBitmap(512, 512) as unknown as ImageBitmap);
    read(fakeBitmap(256, 256) as unknown as ImageBitmap);
    expect(createSurface).toHaveBeenCalledTimes(2);
  });

  it('закрывает картинку, если контекст недоступен', () => {
    const read = createBitmapReader({
      createSurface: (width, height) => ({ width, height, getContext: () => null }),
    });
    const bitmap = fakeBitmap(64, 64);
    expect(() => read(bitmap as unknown as ImageBitmap)).toThrow();
    expect(bitmap.closed).toBe(true);
  });
});
