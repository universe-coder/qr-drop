import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Lang } from './app/format';
import { HomeScreen } from './ui/HomeScreen';
import { DICTIONARIES, detectLang, I18nContext, rememberLang } from './ui/i18n';
import { ReceiveScreen } from './ui/ReceiveScreen';
import { SelfTestScreen } from './ui/SelfTestScreen';
import { SendScreen } from './ui/SendScreen';

export type Route = 'home' | 'send' | 'receive' | 'selftest';

const ROUTES: readonly Route[] = ['home', 'send', 'receive', 'selftest'];

/**
 * Маршрут живёт в hash: статический хостинг (GitHub Pages) не умеет отдавать
 * index.html на произвольный путь, а системная кнопка «Назад» при этом
 * работает сама собой — и заодно гасит камеру или поток, размонтируя экран.
 */
function readRoute(): Route {
  const raw = window.location.hash.replace(/^#\/?/, '');
  // Старая ссылка вида ?selftest=1 продолжает вести на самопроверку.
  if (!raw && new URLSearchParams(window.location.search).has('selftest')) return 'selftest';
  return (ROUTES as readonly string[]).includes(raw) ? (raw as Route) : 'home';
}

export function App() {
  const [route, setRoute] = useState<Route>(readRoute);
  const [lang, setLangState] = useState<Lang>(detectLang);
  /** Пришли ли на текущий экран с главной внутри приложения. */
  const cameFromHomeRef = useRef(false);

  useEffect(() => {
    const onHash = () => {
      const next = readRoute();
      if (next === 'home') cameFromHomeRef.current = false;
      setRoute(next);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = route === 'home' ? 'QR Drop' : `${DICTIONARIES[lang][route].title} · QR Drop`;
  }, [lang, route]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route]);

  const navigate = useCallback((next: Route) => {
    cameFromHomeRef.current = next !== 'home';
    window.location.hash = next === 'home' ? '' : `/${next}`;
  }, []);

  const goHome = useCallback(() => {
    // Если на экран пришли с главной, честнее вернуться по истории:
    // иначе «Назад» браузера после нашей кнопки снова открыл бы экран.
    if (cameFromHomeRef.current) window.history.back();
    else navigate('home');
  }, [navigate]);

  const i18n = useMemo(
    () => ({
      lang,
      t: DICTIONARIES[lang],
      setLang: (next: Lang) => {
        rememberLang(next);
        setLangState(next);
      },
    }),
    [lang],
  );

  return (
    <I18nContext.Provider value={i18n}>
      <main className="app">
        {route === 'home' && <HomeScreen onNavigate={navigate} />}
        {route === 'send' && <SendScreen onBack={goHome} />}
        {route === 'receive' && <ReceiveScreen onBack={goHome} />}
        {route === 'selftest' && <SelfTestScreen onBack={goHome} />}
      </main>
    </I18nContext.Provider>
  );
}
