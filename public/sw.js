/*
 * Сервис-воркер: держит приложение в кэше, чтобы оно открывалось без сети.
 *
 * Страница — сначала из сети (так обновления приходят сразу), при отказе —
 * из кэша. Файлы из assets/ с хэшем в имени не меняются никогда, поэтому их
 * выгоднее отдавать из кэша. Всё, что пришло из сети, кладётся в кэш, так что
 * после первого открытия приложение целиком доступно офлайн.
 */
const CACHE = 'qr-drop-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(['./', './manifest.webmanifest', './favicon.svg'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const immutable = url.pathname.includes('/assets/');
  event.respondWith(immutable ? cacheFirst(request) : networkFirst(request));
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    // Копию снимаем сразу: тело ответа уйдёт странице раньше, чем откроется кэш.
    const copy = response.clone();
    void caches.open(CACHE).then((cache) => cache.put(request, copy));
  }
  return response;
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const copy = response.clone();
      void caches.open(CACHE).then((cache) => cache.put(request, copy));
    }
    return response;
  } catch (error) {
    const cached = (await caches.match(request)) ?? (request.mode === 'navigate' ? await caches.match('./') : null);
    if (cached) return cached;
    throw error;
  }
}
