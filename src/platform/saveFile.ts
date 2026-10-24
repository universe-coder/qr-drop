/**
 * Сохранение принятого файла.
 *
 * Единого способа, работающего во всех браузерах, нет, поэтому идём по
 * цепочке и сообщаем наверх, что именно сработало — пользователю нужно знать,
 * куда смотреть.
 *
 * Порядок зависит от устройства, и это не мелочь:
 *
 *   Сенсорные
 *     1. Системный «Поделиться» — единственный путь, который надёжно доводит
 *        файл до «Файлов» или галереи. iOS вместо скачивания по ссылке часто
 *        просто открывает blob внутри вкладки — для пользователя это выглядит
 *        как «файл не сохранился».
 *     2. Дальше — общий веб-путь.
 *
 *   Десктоп
 *     1. Скачивание ссылкой.
 *     2. «Поделиться», если он вдруг есть.
 *     3. Открытие во вкладке — не сохраняет, но даёт сохранить вручную;
 *        лучше, чем тупик.
 */

export const SaveMethod = {
  Share: 'share',
  Download: 'download',
  NewTab: 'new-tab',
  Failed: 'failed',
} as const;

export type SaveMethod = (typeof SaveMethod)[keyof typeof SaveMethod];

export interface SaveResult {
  method: SaveMethod;
}

export function toFile(data: Uint8Array, name: string, mime: string): File {
  const type = mime || 'application/octet-stream';
  return new File([data.slice().buffer as ArrayBuffer], name || 'file.bin', { type });
}

/** Сенсорный ввод — верный признак телефона или планшета. */
function prefersShareSheet(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
}

export async function saveFile(file: File): Promise<SaveResult> {
  // На мобильных «Поделиться» пробуется первым и сразу, без единого await
  // перед ним: без свежего жеста пользователя системная шторка не откроется.
  if (prefersShareSheet() && (await trySharing(file))) {
    return { method: SaveMethod.Share };
  }

  const url = URL.createObjectURL(file);
  try {
    if (tryDownloadLink(url, file.name)) return { method: SaveMethod.Download };
    if (!prefersShareSheet() && (await trySharing(file))) return { method: SaveMethod.Share };
    if (window.open(url, '_blank')) return { method: SaveMethod.NewTab };
    return { method: SaveMethod.Failed };
  } finally {
    // Даём браузеру дочитать blob до отзыва ссылки.
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}

async function trySharing(file: File): Promise<boolean> {
  if (typeof navigator.share !== 'function') return false;
  try {
    if (typeof navigator.canShare === 'function' && !navigator.canShare({ files: [file] })) {
      return false;
    }
  } catch {
    return false;
  }

  try {
    await navigator.share({ files: [file], title: file.name });
    return true;
  } catch (error) {
    // AbortError — пользователь закрыл шторку: файл не сохранён, но и
    // проваливаться в запасные варианты не надо, он сам так решил.
    if (error instanceof DOMException && error.name === 'AbortError') return true;
    return false;
  }
}

function tryDownloadLink(url: string, name: string): boolean {
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    return true;
  } catch {
    return false;
  }
}

/** Превью для картинок — показать результат сразу, не заставляя сохранять. */
export function isPreviewable(mime: string): boolean {
  return /^image\/(png|jpeg|gif|webp|avif|bmp)$/.test(mime);
}
