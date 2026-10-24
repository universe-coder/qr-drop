/**
 * Иконки — встроенный SVG, без внешних наборов: приложение обязано работать
 * офлайн, а пара десятков линий дешевле любой библиотеки.
 */
interface IconProps {
  size?: number;
}

function Svg({ size = 24, flip, children }: IconProps & { flip?: boolean; children: React.ReactNode }) {
  return (
    <svg
      className={flip ? 'icon-flip' : undefined}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Стрелки отражаются в письме справа налево — см. `.icon-flip` в стилях. */
export const IconArrowLeft = (props: IconProps) => (
  <Svg {...props} flip>
    <path d="M19 12H5M11 18l-6-6 6-6" />
  </Svg>
);

export const IconArrowRight = (props: IconProps) => (
  <Svg {...props} flip>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);

export const IconGlobe = (props: IconProps) => (
  <Svg size={16} {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" />
  </Svg>
);

export const IconUpload = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
  </Svg>
);

export const IconCamera = (props: IconProps) => (
  <Svg {...props}>
    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
    <circle cx="12" cy="13" r="3.5" />
  </Svg>
);

export const IconFile = (props: IconProps) => (
  <Svg {...props}>
    <path d="M14 3H6v18h12V7z" />
    <path d="M14 3v4h4" />
  </Svg>
);

export const IconFlash = (props: IconProps) => (
  <Svg {...props}>
    <path d="M13 2 4 14h7l-1 8 9-12h-7z" />
  </Svg>
);

export const IconCheck = (props: IconProps) => (
  <Svg {...props}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Svg>
);

export const IconAlert = (props: IconProps) => (
  <Svg {...props}>
    <path d="M12 3 2 20h20z" />
    <path d="M12 10v4M12 17.2v.1" />
  </Svg>
);

export const IconGithub = ({ size = 18 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.58.23 2.75.11 3.04.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.39-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
  </svg>
);

/** Знак приложения: три поисковых узора QR и падающая капля на месте четвёртого. */
export const Logo = ({ size = 28 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
    <rect width="32" height="32" rx="8" fill="var(--accent)" />
    <g fill="none" stroke="var(--on-accent)" strokeWidth="2.2">
      <rect x="6" y="6" width="7" height="7" rx="1.2" />
      <rect x="19" y="6" width="7" height="7" rx="1.2" />
      <rect x="6" y="19" width="7" height="7" rx="1.2" />
    </g>
    <path d="M22.5 17.5c2 2.6 3.2 4.4 3.2 5.8a3.2 3.2 0 0 1-6.4 0c0-1.4 1.2-3.2 3.2-5.8Z" fill="var(--on-accent)" />
  </svg>
);
