/**
 * Тексты интерфейса на двух языках.
 *
 * Собраны в одном месте намеренно: формулировки здесь — половина продукта.
 * Передача идёт минутами и без обратного канала, поэтому текст обязан всё
 * время объяснять, что происходит и чего ждать, иначе пользователь решит,
 * что приложение зависло, и уйдёт.
 *
 * Английский словарь типизирован русским: забытый ключ — ошибка компиляции.
 */
import { createContext, useContext } from 'react';
import type { Lang } from '../app/format';
import type { PresetId } from '../app/presets';

const ru = {
  app: {
    title: 'QR Drop',
    tagline: 'Файл с экрана на камеру. Без интернета, проводов и серверов.',
  },

  home: {
    eyebrow: 'Открытый исходный код · работает офлайн',
    headline: ['Передай файл', 'светом экрана'],
    lead:
      'Одно устройство показывает поток QR-кодов, другое снимает его камерой. ' +
      'Файл никуда не загружается: всё происходит между двумя экранами.',
    send: 'Отправить',
    sendHint: 'Выбрать файл и показать коды',
    receive: 'Принять',
    receiveHint: 'Включить камеру и собрать файл',
    howTitle: 'Как это работает',
    how: [
      ['Нарезка', 'Файл режется на блоки, из них получается бесконечный фонтан кадров.'],
      ['Показ', 'Кадры идут на экране подряд, по 8–12 QR-кодов в секунду.'],
      ['Сборка', 'Камера ловит что успевает. Пропуски не страшны: нужны любые кадры, а не все подряд.'],
    ] as ReadonlyArray<readonly [string, string]>,
    limitsTitle: 'Что нужно знать заранее',
    limits: [
      'Скорость: единицы килобайт в секунду. Подходит для документа, ключа или фото, не для видео.',
      'Оба экрана должны оставаться включёнными и неподвижными всё время передачи.',
      'Приёму нужна камера и HTTPS. Отправка работает в любом современном браузере.',
    ],
    selftest: 'Самопроверка',
    source: 'Исходный код',
    license: 'Лицензия MIT',
  },

  send: {
    title: 'Отправка',
    drop: 'Перетащи файл сюда',
    dropOr: 'или',
    pick: 'Выбрать файл',
    pickAgain: 'Другой файл',
    reading: 'Читаю файл…',
    tooBig: (limit: string) => `Файл больше ${limit}. Передача заняла бы часы, выбери что-то поменьше.`,
    profile: 'Профиль передачи',
    profileNames: {
      reliable: 'Надёжно',
      balanced: 'Обычно',
      fast: 'Быстро',
    } as Record<PresetId, string>,
    profileHints: {
      reliable: 'Крупные коды. Дольше, но читается даже слабой камерой и при плохом свете.',
      balanced: 'Разумная середина. С этого стоит начинать.',
      fast: 'Мелкие плотные коды. Нужны хорошая камера, яркий экран и устойчивые руки.',
    } as Record<PresetId, string>,
    blocksLabel: 'Блоков',
    frameLabel: 'В кадре',
    qrLabel: 'QR',
    bestCase: 'Если всё поймается сразу',
    likelyCase: 'Скорее всего',
    start: 'Показать коды',
    stop: 'Остановить',
    running: 'Идёт передача',
    elapsed: 'Прошло',
    pass: 'Проход',
    framesShown: 'Кадров',
    passHint: 'Поток бесконечный: как только пройдёт круг, начнётся следующий.',
    /** Главная честная мысль экрана отправителя. */
    blindNotice:
      'Отправитель не видит, сколько уже принято: канал односторонний. ' +
      'Прогресс смотри на втором устройстве.',
    holdStill: 'Держи экран неподвижно, примерно в 15–25 см от камеры второго устройства.',
    brightness: 'Выкрути яркость на максимум: от неё зависит скорость.',
    wakeLockMissing:
      'Браузер не даёт удержать экран включённым. Поставь автоблокировку подольше, иначе передача оборвётся.',
    doneHint: 'Когда на втором устройстве появится файл, передачу можно остановить.',
    failed: 'Показ кодов прервался',
    failedHint:
      'Не удалось подготовить кадры. Обнови страницу и попробуй ещё раз. Если повторится, выбери профиль полегче.',
  },

  receive: {
    title: 'Приём',
    start: 'Включить камеру',
    aim: 'Наведи на экран отправителя',
    aimHint: 'Код должен целиком помещаться в рамку. Камера включится только после нажатия.',
    starting: 'Включаю камеру…',
    searching: 'Ищу коды…',
    searchingHint: 'Если ничего не находится, поднеси ближе или добавь света.',
    stalled: 'Кадры перестали приходить. Поправь наводку или убери блики с экрана.',
    torch: 'Подсветка',
    stop: 'Остановить',
    received: 'Принято',
    remaining: 'Осталось примерно',
    framesPerSecond: (value: number) => `${value} кадр/с`,
    blocks: (recovered: number, total: number) => `${recovered} из ${total} блоков`,
    integrityRetry:
      'Контрольная сумма не сошлась: где-то проскочил битый кадр. Сборка сброшена, продолжаю принимать.',
    integrityFailed:
      'Контрольная сумма не сошлась второй раз. Похоже, устройства не договорились. Начни передачу заново.',
    integrityTitle: 'Файл не собрался',
    incompatible:
      'Отправитель работает на другой версии приложения. Обнови страницу на обоих устройствах.',
  },

  camera: {
    unsupported: 'Браузер не даёт доступ к камере',
    unsupportedHint:
      'Приём здесь невозможен. Открой страницу в обычном браузере телефона. Отправка при этом работает везде.',
    denied: 'Доступ к камере запрещён',
    deniedHint: 'Разреши камеру в настройках браузера для этого сайта и попробуй ещё раз.',
    notFound: 'Камера не найдена',
    notFoundHint: 'Похоже, на этом устройстве нет подходящей камеры.',
    busy: 'Камера занята',
    busyHint: 'Другое приложение уже использует камеру. Закрой его и попробуй снова.',
    unknown: 'Не удалось включить камеру',
    unknownHint: 'Попробуй ещё раз или перезагрузи страницу.',
    insecure: 'Нужно защищённое соединение',
    insecureHint: 'Камера доступна только по HTTPS или на localhost.',
    retry: 'Попробовать снова',
  },

  result: {
    title: 'Файл принят',
    subtitle: 'Целостность проверена по SHA-256',
    save: 'Сохранить',
    receiveMore: 'Принять ещё',
    savedShare: 'Файл передан в системное меню «Поделиться».',
    savedDownload: 'Файл сохранён в загрузки.',
    savedTab: 'Файл открыт в новой вкладке, сохрани его оттуда вручную.',
    saveFailed: 'Не удалось сохранить файл. Попробуй другой браузер.',
  },

  selftest: {
    title: 'Самопроверка',
    lead:
      'Кодирует файл, рисует настоящие QR-коды на canvas, читает их обратно через jsQR и собирает файл. ' +
      'Проверяется всё, кроме самой камеры.',
    run: 'Запустить',
    running: 'Идёт проверка…',
    failed: (reason: string) => `Проверка сорвалась: ${reason}`,
    progress: (shown: number, decoded: number, blocks: number, total: number) =>
      `кадров ${shown}, распознано ${decoded}, блоков ${blocks}/${total}`,
    results: 'Результаты',
    cases: ['чистый канал', 'потеря 40%', 'потеря 60%', 'плотный профиль', 'крупный профиль', 'файл меньше блока'],
    summary: (shown: number, meta: number, decoded: number, unreadable: number, overhead: string) =>
      `${shown} кадров показано (служебных ${meta}), распознано ${decoded}, нечитаемых ${unreadable}, кадров данных на блок ×${overhead}`,
    time: 'Время',
    speed: 'Скорость',
    blocks: 'Блоков',
    seconds: 'с',
    note:
      'Скорость посчитана по частоте кадров профиля, а не по времени прогона: рисование и распознавание ' +
      'здесь идут в одном потоке и намного медленнее реальной съёмки.',
  },

  common: {
    back: 'Назад',
    language: 'English',
    languageShort: 'EN',
  },
};

export type Dictionary = typeof ru;

const en: Dictionary = {
  app: {
    title: 'QR Drop',
    tagline: 'Send a file from screen to camera. No internet, no cables, no servers.',
  },

  home: {
    eyebrow: 'Open source · works offline',
    headline: ['Send a file', 'by screen light'],
    lead:
      'One device shows a stream of QR codes, the other films it with its camera. ' +
      'Nothing is uploaded anywhere: it all happens between two screens.',
    send: 'Send',
    sendHint: 'Pick a file and show the codes',
    receive: 'Receive',
    receiveHint: 'Turn on the camera and assemble the file',
    howTitle: 'How it works',
    how: [
      ['Slice', 'The file is cut into blocks that feed an endless fountain of frames.'],
      ['Show', 'Frames play back on screen, 8 to 12 QR codes per second.'],
      ['Assemble', 'The camera catches what it can. Gaps are fine: any frames will do, not all of them.'],
    ],
    limitsTitle: 'Good to know',
    limits: [
      'Throughput is a few kilobytes per second. Great for a document, a key or a photo, not for video.',
      'Both screens must stay on and still for the whole transfer.',
      'Receiving needs a camera and HTTPS. Sending works in any modern browser.',
    ],
    selftest: 'Self-test',
    source: 'Source code',
    license: 'MIT License',
  },

  send: {
    title: 'Send',
    drop: 'Drop a file here',
    dropOr: 'or',
    pick: 'Choose file',
    pickAgain: 'Another file',
    reading: 'Reading file…',
    tooBig: (limit: string) => `The file is larger than ${limit}. That would take hours, pick something smaller.`,
    profile: 'Transfer profile',
    profileNames: {
      reliable: 'Reliable',
      balanced: 'Normal',
      fast: 'Fast',
    },
    profileHints: {
      reliable: 'Large codes. Slower, but readable even by a weak camera in poor light.',
      balanced: 'A sensible middle ground. Start here.',
      fast: 'Small dense codes. Needs a good camera, a bright screen and steady hands.',
    },
    blocksLabel: 'Blocks',
    frameLabel: 'Per frame',
    qrLabel: 'QR',
    bestCase: 'If every frame is caught',
    likelyCase: 'Most likely',
    start: 'Show codes',
    stop: 'Stop',
    running: 'Transmitting',
    elapsed: 'Elapsed',
    pass: 'Pass',
    framesShown: 'Frames',
    passHint: 'The stream is endless: once a pass completes, the next one begins.',
    blindNotice:
      'The sender cannot see how much has been received: the channel is one-way. ' +
      'Watch progress on the other device.',
    holdStill: 'Hold the screen still, about 15–25 cm from the other device’s camera.',
    brightness: 'Turn brightness all the way up: speed depends on it.',
    wakeLockMissing:
      'This browser cannot keep the screen awake. Extend auto-lock, or the transfer will break off.',
    doneHint: 'Once the file appears on the other device, you can stop.',
    failed: 'Code playback stopped',
    failedHint:
      'Could not prepare frames. Reload the page and try again. If it happens again, pick a lighter profile.',
  },

  receive: {
    title: 'Receive',
    start: 'Turn on camera',
    aim: 'Point at the sender’s screen',
    aimHint: 'The code must fit entirely inside the frame. The camera turns on only when you tap.',
    starting: 'Starting camera…',
    searching: 'Looking for codes…',
    searchingHint: 'If nothing shows up, move closer or add light.',
    stalled: 'Frames stopped arriving. Re-aim or get rid of glare on the screen.',
    torch: 'Torch',
    stop: 'Stop',
    received: 'Received',
    remaining: 'About',
    framesPerSecond: (value: number) => `${value} fps`,
    blocks: (recovered: number, total: number) => `${recovered} of ${total} blocks`,
    integrityRetry:
      'Checksum mismatch: a corrupt frame slipped through. Assembly reset, still receiving.',
    integrityFailed:
      'Checksum mismatched a second time. The devices seem to disagree. Restart the transfer.',
    integrityTitle: 'The file did not assemble',
    incompatible: 'The sender runs a different version of the app. Reload the page on both devices.',
  },

  camera: {
    unsupported: 'This browser gives no camera access',
    unsupportedHint:
      'Receiving is impossible here. Open the page in your phone’s regular browser. Sending still works anywhere.',
    denied: 'Camera access denied',
    deniedHint: 'Allow the camera for this site in browser settings and try again.',
    notFound: 'No camera found',
    notFoundHint: 'This device does not seem to have a suitable camera.',
    busy: 'Camera is busy',
    busyHint: 'Another app is using the camera. Close it and try again.',
    unknown: 'Could not start the camera',
    unknownHint: 'Try again or reload the page.',
    insecure: 'A secure connection is required',
    insecureHint: 'The camera is only available over HTTPS or on localhost.',
    retry: 'Try again',
  },

  result: {
    title: 'File received',
    subtitle: 'Integrity verified with SHA-256',
    save: 'Save',
    receiveMore: 'Receive another',
    savedShare: 'File handed to the system share sheet.',
    savedDownload: 'File saved to downloads.',
    savedTab: 'File opened in a new tab, save it from there.',
    saveFailed: 'Could not save the file. Try another browser.',
  },

  selftest: {
    title: 'Self-test',
    lead:
      'Encodes a file, draws real QR codes on a canvas, reads them back with jsQR and reassembles the file. ' +
      'Everything is tested except the camera itself.',
    run: 'Run',
    running: 'Running…',
    failed: (reason: string) => `Self-test crashed: ${reason}`,
    progress: (shown: number, decoded: number, blocks: number, total: number) =>
      `frames ${shown}, decoded ${decoded}, blocks ${blocks}/${total}`,
    results: 'Results',
    cases: ['clean channel', '40% loss', '60% loss', 'dense profile', 'large profile', 'file smaller than a block'],
    summary: (shown: number, meta: number, decoded: number, unreadable: number, overhead: string) =>
      `${shown} frames shown (${meta} meta), ${decoded} decoded, ${unreadable} unreadable, ×${overhead} data frames per block`,
    time: 'Time',
    speed: 'Speed',
    blocks: 'Blocks',
    seconds: 's',
    note:
      'Speed is computed from the profile frame rate, not the run time: drawing and decoding share one thread ' +
      'here and are much slower than a real camera.',
  },

  common: {
    back: 'Back',
    language: 'Русский',
    languageShort: 'RU',
  },
};

export const DICTIONARIES: Record<Lang, Dictionary> = { ru, en };

const STORAGE_KEY = 'qr-drop:lang';

export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'ru' || saved === 'en') return saved;
  } catch {
    // Хранилище бывает недоступно в приватном режиме — это не повод падать.
  }
  const preferred = navigator.languages?.length ? navigator.languages : [navigator.language];
  return preferred.some((tag) => /^(ru|be|uk|kk)\b/i.test(tag)) ? 'ru' : 'en';
}

export function rememberLang(lang: Lang): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // См. detectLang.
  }
}

export interface I18n {
  lang: Lang;
  t: Dictionary;
  setLang: (lang: Lang) => void;
}

export const I18nContext = createContext<I18n>({ lang: 'ru', t: ru, setLang: () => undefined });

export function useI18n(): I18n {
  return useContext(I18nContext);
}
