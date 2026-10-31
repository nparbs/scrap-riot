const SETTINGS_KEY = 'scrap-riot.settings.v1';

export type Action =
  | 'forward' | 'back' | 'left' | 'right'
  | 'melee' | 'turret' | 'defense'
  | 'power1' | 'power2' | 'power3' | 'power4'
  | 'rear';

export type Bindings = Record<Action, string>;
export type Quality = 'high' | 'medium' | 'low';

export const ACTIONS: { id: Action; label: string }[] = [
  { id: 'forward', label: 'Forward' },
  { id: 'back', label: 'Reverse' },
  { id: 'left', label: 'Turn left' },
  { id: 'right', label: 'Turn right' },
  { id: 'melee', label: 'Front weapon' },
  { id: 'turret', label: 'Turret' },
  { id: 'defense', label: 'Defense' },
  { id: 'power1', label: 'Repair Kit' },
  { id: 'power2', label: 'Turbo' },
  { id: 'power3', label: 'Overdrive' },
  { id: 'power4', label: 'EMP Burst' },
  { id: 'rear', label: 'Look behind' },
];

export const DEFAULT_BINDINGS: Bindings = {
  forward: 'ArrowUp',
  back: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  melee: 'KeyX',
  turret: 'KeyC',
  defense: 'KeyV',
  power1: 'Digit1',
  power2: 'Digit2',
  power3: 'Digit3',
  power4: 'Digit4',
  rear: 'ControlLeft',
};

/** Pause and mute always work, so a bad rebind can never trap the player. */
export const RESERVED_KEYS = new Set(['Escape', 'KeyM']);

export const QUALITY: Record<Quality, { label: string; pixelRatio: number; shadows: boolean; particles: number }> = {
  high: { label: 'High', pixelRatio: 2, shadows: true, particles: 1 },
  medium: { label: 'Medium', pixelRatio: 1, shadows: true, particles: 0.6 },
  low: { label: 'Low', pixelRatio: 0.75, shadows: false, particles: 0.3 },
};

export interface Settings {
  bindings: Bindings;
  quality: Quality;
  showFps: boolean;
  tutorialDone: boolean;
}

export function defaultSettings(): Settings {
  return { bindings: { ...DEFAULT_BINDINGS }, quality: 'high', showFps: false, tutorialDone: false };
}

export function loadSettings(storage: Pick<Storage, 'getItem'> | null): Settings {
  const settings = defaultSettings();
  try {
    const raw = storage?.getItem(SETTINGS_KEY);
    if (!raw) return settings;
    const saved = JSON.parse(raw) as Partial<Settings>;
    for (const { id } of ACTIONS) {
      const code = saved.bindings?.[id];
      if (typeof code === 'string' && code && !RESERVED_KEYS.has(code)) settings.bindings[id] = code;
    }
    if (saved.quality && saved.quality in QUALITY) settings.quality = saved.quality;
    settings.showFps = saved.showFps === true;
    settings.tutorialDone = saved.tutorialDone === true;
  } catch {
    // Blocked storage or corrupt settings both fall back to the defaults.
  }
  return settings;
}

export function writeSettings(storage: Pick<Storage, 'setItem'> | null, settings: Settings): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Settings still apply for this session.
  }
}

/** Binds a key. If another action already uses it, the two actions swap keys. */
export function rebind(bindings: Bindings, action: Action, code: string): boolean {
  if (RESERVED_KEYS.has(code)) return false;
  const previous = bindings[action];
  for (const { id } of ACTIONS) {
    if (bindings[id] === code) bindings[id] = previous;
  }
  bindings[action] = code;
  return true;
}

export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  const arrows: Record<string, string> = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  if (arrows[code]) return arrows[code];
  if (code.startsWith('Control')) return 'Ctrl';
  if (code.startsWith('Shift')) return 'Shift';
  if (code.startsWith('Alt')) return 'Alt';
  return code;
}
