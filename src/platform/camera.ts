/**
 * Доступ к камере и подсветке.
 *
 * Во встроенных браузерах (webview мессенджеров, iframe) getUserMedia может
 * быть недоступен — тогда приём просто невозможен, и это надо честно показать,
 * а не молча крутить спиннер.
 */

export const CameraError = {
  Unsupported: 'unsupported',
  Denied: 'denied',
  NotFound: 'not-found',
  Busy: 'busy',
  Unknown: 'unknown',
} as const;

export type CameraError = (typeof CameraError)[keyof typeof CameraError];

export interface CameraHandle {
  stream: MediaStream;
  track: MediaStreamTrack;
  stop(): void;
}

export function isCameraSupported(): boolean {
  return typeof navigator.mediaDevices?.getUserMedia === 'function';
}

/** Камера доступна только в защищённом контексте. */
export function isSecureContextOk(): boolean {
  return window.isSecureContext || window.location.hostname === 'localhost';
}

export async function startCamera(): Promise<CameraHandle> {
  if (!isCameraSupported()) throw CameraError.Unsupported;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      },
      audio: false,
    });
    const track = stream.getVideoTracks()[0];
    return {
      stream,
      track,
      stop() {
        for (const item of stream.getTracks()) item.stop();
      },
    };
  } catch (error) {
    throw mapError(error);
  }
}

function mapError(error: unknown): CameraError {
  if (!(error instanceof DOMException)) return CameraError.Unknown;
  switch (error.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return CameraError.Denied;
    case 'NotFoundError':
    case 'OverconstrainedError':
      return CameraError.NotFound;
    case 'NotReadableError':
    case 'AbortError':
      return CameraError.Busy;
    default:
      return CameraError.Unknown;
  }
}

interface TorchCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
}

export function supportsTorch(track: MediaStreamTrack): boolean {
  if (typeof track.getCapabilities !== 'function') return false;
  return Boolean((track.getCapabilities() as TorchCapabilities).torch);
}

export async function setTorch(track: MediaStreamTrack, on: boolean): Promise<boolean> {
  if (!supportsTorch(track)) return false;
  try {
    await track.applyConstraints({
      advanced: [{ torch: on } as MediaTrackConstraintSet],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Просит камеру держать непрерывный автофокус.
 * QR-код на соседнем экране находится близко, и без этого камера часто
 * «залипает» на фоне.
 */
export async function requestContinuousFocus(track: MediaStreamTrack): Promise<void> {
  const capabilities = track.getCapabilities?.() as
    | (MediaTrackCapabilities & { focusMode?: string[] })
    | undefined;
  if (!capabilities?.focusMode?.includes('continuous')) return;
  try {
    await track.applyConstraints({
      advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
    });
  } catch {
    // Не критично: без непрерывного фокуса приём просто чуть медленнее.
  }
}
