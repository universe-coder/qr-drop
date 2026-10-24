/**
 * Небольшой набор своих компонентов. Оформление целиком в index.css,
 * здесь только разметка и поведение.
 */
import { useEffect } from 'react';
import { IconArrowLeft } from './icons';
import { useI18n } from './i18n';

export function ScreenHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const { t } = useI18n();
  return (
    <header className="screen-header">
      <button type="button" className="icon-button" onClick={onBack} aria-label={t.common.back}>
        <IconArrowLeft />
      </button>
      <h1 className="screen-header__title">{title}</h1>
    </header>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  icon?: React.ReactNode;
}

export function Button({ variant = 'primary', icon, children, className, ...rest }: ButtonProps) {
  return (
    <button type="button" className={`button button--${variant} ${className ?? ''}`} {...rest}>
      {icon}
      <span>{children}</span>
    </button>
  );
}

export function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="stat">
      <div className="stat__label">{label}</div>
      <div className="stat__value">{value}</div>
    </div>
  );
}

export function Progress({ value, done }: { value: number; done?: boolean }) {
  const percent = Math.min(100, Math.max(0, value * 100));
  return (
    <div
      className={`progress${done ? ' progress--done' : ''}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
    >
      <div className="progress__bar" style={{ width: `${percent}%` }} />
    </div>
  );
}

export function Notice({ tone = 'info', children }: { tone?: 'info' | 'warn'; children: React.ReactNode }) {
  return <div className={`notice notice--${tone}`}>{children}</div>;
}

interface SegmentedProps<T extends string> {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
}

export function Segmented<T extends string>({ value, options, onChange, label }: SegmentedProps<T>) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={`segmented__item${option.value === value ? ' segmented__item--active' : ''}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface StateCardProps {
  icon: React.ReactNode;
  tone?: 'neutral' | 'success' | 'error';
  title: string;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}

/** Экран-состояние: ошибка, пустой экран, готовый результат. */
export function StateCard({ icon, tone = 'neutral', title, children, actions }: StateCardProps) {
  return (
    <section className={`state-card state-card--${tone}`}>
      <div className="state-card__icon">{icon}</div>
      <h2 className="state-card__title">{title}</h2>
      {children && <div className="state-card__body">{children}</div>}
      {actions && <div className="state-card__actions">{actions}</div>}
    </section>
  );
}

export function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [message, onClose]);
  return (
    <div className="toast" role="status">
      {message}
    </div>
  );
}
