import type { Route } from '../App';
import { IconArrowRight, IconCamera, IconGithub, IconUpload, Logo } from './icons';
import { useI18n } from './i18n';

export const REPO_URL = 'https://github.com/universe-coder/qr-drop';

export function HomeScreen({ onNavigate }: { onNavigate: (route: Route) => void }) {
  const { t, lang, setLang } = useI18n();

  return (
    <div className="screen home">
      <header className="topbar">
        <div className="brand">
          <Logo />
          <span className="brand__name">{t.app.title}</span>
        </div>
        <button
          type="button"
          className="chip"
          onClick={() => setLang(lang === 'ru' ? 'en' : 'ru')}
          aria-label={t.common.language}
          title={t.common.language}
        >
          {t.common.languageShort}
        </button>
      </header>

      <section className="hero">
        <p className="eyebrow">{t.home.eyebrow}</p>
        <h1 className="hero__title">
          {t.home.headline[0]}
          <br />
          <em>{t.home.headline[1]}</em>
        </h1>
        <p className="hero__lead">{t.home.lead}</p>
        <HeroPixels />
      </section>

      <nav className="actions">
        <button type="button" className="action action--send" onClick={() => onNavigate('send')}>
          <span className="action__icon">
            <IconUpload />
          </span>
          <span className="action__text">
            <span className="action__title">{t.home.send}</span>
            <span className="action__hint">{t.home.sendHint}</span>
          </span>
          <IconArrowRight />
        </button>
        <button type="button" className="action action--receive" onClick={() => onNavigate('receive')}>
          <span className="action__icon">
            <IconCamera />
          </span>
          <span className="action__text">
            <span className="action__title">{t.home.receive}</span>
            <span className="action__hint">{t.home.receiveHint}</span>
          </span>
          <IconArrowRight />
        </button>
      </nav>

      <section className="section">
        <h2 className="section__title">{t.home.howTitle}</h2>
        <ol className="steps">
          {t.home.how.map(([title, text], index) => (
            <li key={title} className="step">
              <span className="step__index">{String(index + 1).padStart(2, '0')}</span>
              <div>
                <div className="step__title">{title}</div>
                <div className="step__text">{text}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="section">
        <h2 className="section__title">{t.home.limitsTitle}</h2>
        <ul className="limits">
          {t.home.limits.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <footer className="footer">
        <a className="footer__link" href={REPO_URL} target="_blank" rel="noreferrer">
          <IconGithub />
          {t.home.source}
        </a>
        <button type="button" className="footer__link" onClick={() => onNavigate('selftest')}>
          {t.home.selftest}
        </button>
        <span className="footer__muted">{t.home.license}</span>
      </footer>
    </div>
  );
}

/**
 * Декоративная «лента кадров»: несколько мелких псевдо-QR, которые мигают
 * вразнобой и подсказывают, как выглядит передача, ещё до первого нажатия.
 */
function HeroPixels() {
  const cells = Array.from({ length: 7 * 7 }, (_, index) => {
    // Детерминированный узор, чтобы рисунок не прыгал между рендерами.
    const value = (index * 2654435761) >>> 0;
    return (value >>> 27) % 3 !== 0;
  });
  return (
    <div className="hero-pixels" aria-hidden="true">
      {[0, 1, 2].map((frame) => (
        <div key={frame} className="hero-pixels__frame" style={{ animationDelay: `${frame * 0.6}s` }}>
          {cells.map((on, index) => (
            <span
              key={index}
              className={on !== (((index + frame * 11) % 5) === 0) ? 'on' : undefined}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
