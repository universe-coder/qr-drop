/**
 * Короткая тактильная отдача через Vibration API.
 * Молча пропускается там, где её нет (iOS Safari, десктоп).
 */
const PATTERNS = {
  success: [18],
  warning: [12, 60, 12],
  error: [30, 50, 30],
} as const;

export function haptic(type: keyof typeof PATTERNS): void {
  try {
    navigator.vibrate?.([...PATTERNS[type]]);
  } catch {
    // Некоторые браузеры бросают, если страница ещё не получила жест.
  }
}
