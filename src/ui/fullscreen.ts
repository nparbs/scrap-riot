/** Older Safari, and iPads, only have the prefixed names. */
type PrefixedElement = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type PrefixedDocument = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };
/** Not in every version of TypeScript's own list, and missing from some browsers. */
type LockableOrientation = ScreenOrientation & { lock?: (orientation: string) => Promise<void>; unlock?: () => void };

let requesting = false;

/** False on iPhones, where Safari keeps full screen for videos. */
export function fullscreenSupported(): boolean {
  const el = document.documentElement as PrefixedElement;
  return typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function';
}

/** Opened from the home screen, so there's no browser around the game to begin with. */
export function isInstalled(): boolean {
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return standalone || window.matchMedia('(display-mode: fullscreen), (display-mode: standalone)').matches;
}

export function isFullscreen(): boolean {
  const doc = document as PrefixedDocument;
  return Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement);
}

/** Browsers only allow this during a tap, and refuse quietly otherwise. */
export function enterFullscreen(): void {
  if (requesting || isFullscreen() || isInstalled() || !fullscreenSupported()) return;
  const el = document.documentElement as PrefixedElement;
  requesting = true;
  void Promise.resolve()
    .then(() => (el.requestFullscreen ? el.requestFullscreen({ navigationUI: 'hide' }) : el.webkitRequestFullscreen?.()))
    .catch(() => undefined)
    .finally(() => (requesting = false));
}

export function exitFullscreen(): void {
  if (!isFullscreen()) return;
  const doc = document as PrefixedDocument;
  void Promise.resolve()
    .then(() => (doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen?.()))
    .catch(() => undefined);
}

export function onFullscreenChange(listener: () => void): void {
  document.addEventListener('fullscreenchange', listener);
  document.addEventListener('webkitfullscreenchange', listener);
}

/** Only works once the game is full screen or installed, and not at all on iPhones. */
export function lockLandscape(): void {
  const orientation = screen.orientation as LockableOrientation | undefined;
  orientation?.lock?.('landscape')?.catch(() => undefined);
}

export function unlockOrientation(): void {
  try {
    (screen.orientation as LockableOrientation | undefined)?.unlock?.();
  } catch {
    // Nothing was locked.
  }
}
