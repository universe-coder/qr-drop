/**
 * Удержание экрана включённым.
 *
 * Передача идёт минутами, и погасший экран отправителя обрывает её на середине.
 * Используется стандартный Screen Wake Lock; где его нет — приложение должно
 * честно предупредить пользователя.
 */

/** В части webview `navigator.wakeLock` просто отсутствует. */
type MaybeWakeLock = WakeLock | undefined;

export function isWakeLockSupported(): boolean {
  return typeof (navigator.wakeLock as MaybeWakeLock)?.request === 'function';
}

export interface WakeLockHandle {
  release(): void;
  readonly active: boolean;
}

/**
 * Берёт блокировку и переустанавливает её после возврата на вкладку —
 * система снимает блокировку сама, когда вкладка уходит в фон.
 */
export function keepScreenAwake(): WakeLockHandle {
  const api = navigator.wakeLock as MaybeWakeLock;
  let sentinel: WakeLockSentinel | null = null;
  let stopped = false;

  const acquire = async () => {
    if (stopped || !api || document.visibilityState !== 'visible') return;
    try {
      sentinel = await api.request('screen');
      sentinel.addEventListener('release', () => {
        sentinel = null;
      });
    } catch {
      sentinel = null;
    }
  };

  const onVisibility = () => {
    if (document.visibilityState === 'visible' && !sentinel) void acquire();
  };

  void acquire();
  document.addEventListener('visibilitychange', onVisibility);

  return {
    get active() {
      return sentinel !== null;
    },
    release() {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void sentinel?.release().catch(() => undefined);
      sentinel = null;
    },
  };
}
