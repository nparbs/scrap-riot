// Bumped when the default keys change. Old settings are not carried over.
const SETTINGS_KEY = 'scrap-riot.settings.v4';

export type Action =
  | 'forward' | 'back' | 'left' | 'right'
  | 'melee' | 'turret' | 'defense' | 'boost'
  | 'power1' | 'power2' | 'power3' | 'power4' | 'power5' | 'power6'
  | 'rear';

export type Bindings = Record<Action, string>;
export type Level = 'high' | 'medium' | 'low' | 'lowest';
export type Quality = 'auto' | Level;

export const ACTIONS: { id: Action; label: string }[] = [
  { id: 'forward', label: 'Forward' },
  { id: 'back', label: 'Reverse' },
  { id: 'left', label: 'Turn left' },
  { id: 'right', label: 'Turn right' },
  { id: 'melee', label: 'Main weapon' },
  { id: 'turret', label: 'Gun' },
  { id: 'defense', label: 'Defense' },
  { id: 'boost', label: 'Speed boost' },
  { id: 'power1', label: 'Rage' },
  { id: 'power2', label: 'Mega Shield' },
  { id: 'power3', label: 'Cloaking' },
  { id: 'power4', label: 'X-Ray' },
  { id: 'power5', label: 'Repair Kit' },
  { id: 'power6', label: 'Battery Pack' },
  { id: 'rear', label: 'Look behind' },
];

export const DEFAULT_BINDINGS: Bindings = {
  forward: 'KeyW',
  back: 'KeyS',
  left: 'KeyA',
  right: 'KeyD',
  melee: 'Space',
  turret: 'KeyQ',
  defense: 'KeyR',
  boost: 'ShiftLeft',
  power1: 'Digit1',
  power2: 'Digit2',
  power3: 'Digit3',
  power4: 'Digit4',
  power5: 'Digit5',
  power6: 'Digit6',
  rear: 'KeyE',
};

/**
 * Pause and mute always work, so a bad rebind can never trap the player. Ctrl stays free because
 * holding it to play would turn Ctrl+W into closing the tab, which a page can't prevent.
 */
export const RESERVED_KEYS = new Set(['Escape', 'KeyM', 'ControlLeft', 'ControlRight']);

/** Reflections and resolution cost far more than shadows or draw calls, because they're paid per pixel. */
export const QUALITY: Record<Level, { label: string; pixelRatio: number; shadows: boolean; reflections: boolean; particles: number }> = {
  high: { label: 'High', pixelRatio: 2, shadows: true, reflections: true, particles: 1 },
  medium: { label: 'Medium', pixelRatio: 1, shadows: true, reflections: true, particles: 0.6 },
  low: { label: 'Low', pixelRatio: 0.75, shadows: false, reflections: false, particles: 0.3 },
  lowest: { label: 'Lowest', pixelRatio: 0.5, shadows: false, reflections: false, particles: 0.15 },
};

export const LEVELS: Level[] = ['high', 'medium', 'low', 'lowest'];

const AUTO_MIN_FPS = 45;
const AUTO_WINDOW = 3;

/** Steps the graphics down while the frame rate stays low. It never steps back up, which would oscillate. */
export class AutoQuality {
  private frames = 0;
  private time = 0;

  /** Call once per frame. Returns a new level when it's time to drop to one. */
  sample(dt: number, level: Level): Level | null {
    this.frames++;
    this.time += dt;
    if (this.time < AUTO_WINDOW) return null;
    const fps = this.frames / this.time;
    this.frames = 0;
    this.time = 0;
    const next = LEVELS[LEVELS.indexOf(level) + 1];
    return fps < AUTO_MIN_FPS && next ? next : null;
  }
}

export const VOLUME_KINDS = ['master', 'music', 'effects'] as const;
export type VolumeKind = (typeof VOLUME_KINDS)[number];
const DEFAULT_VOLUME: Record<VolumeKind, number> = { master: 100, music: 70, effects: 100 };

export interface Settings {
  bindings: Bindings;
  quality: Quality;
  /** What Auto has settled on for this device. */
  autoLevel: Level;
  showFps: boolean;
  tutorialDone: boolean;
  /** Each from 0 to 100. */
  volume: { master: number; music: number; effects: number };
  muted: boolean;
  /** Silences the music without losing the level its slider is set to. */
  musicMuted: boolean;
  /** The name this player chose when first asked. Empty until then. */
  pilotName: string;
}

export function defaultSettings(): Settings {
  return { bindings: { ...DEFAULT_BINDINGS }, quality: 'auto', autoLevel: 'high', showFps: false, tutorialDone: false, volume: { ...DEFAULT_VOLUME }, muted: false, musicMuted: false, pilotName: '' };
}

/** A slider dragged all the way down counts as off too, so the music button always tells the truth. */
export function musicOff(settings: Settings): boolean {
  return settings.musicMuted || settings.volume.music === 0;
}

/** The levels to actually play at. */
export function audibleVolume(settings: Settings): Settings['volume'] {
  return settings.musicMuted ? { ...settings.volume, music: 0 } : settings.volume;
}

/** Turning music back on from a slider at zero needs a level to return to, or nothing would happen. */
export function toggleMusic(settings: Settings): void {
  if (!musicOff(settings)) {
    settings.musicMuted = true;
    return;
  }
  settings.musicMuted = false;
  if (settings.volume.music === 0) settings.volume.music = DEFAULT_VOLUME.music;
}

export function activeLevel(settings: Settings): Level {
  return settings.quality === 'auto' ? settings.autoLevel : settings.quality;
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
    if (saved.quality === 'auto' || (saved.quality && saved.quality in QUALITY)) settings.quality = saved.quality;
    if (saved.autoLevel && saved.autoLevel in QUALITY) settings.autoLevel = saved.autoLevel;
    settings.showFps = saved.showFps === true;
    for (const kind of VOLUME_KINDS) {
      const value = saved.volume?.[kind];
      if (typeof value === 'number' && Number.isFinite(value)) settings.volume[kind] = Math.max(0, Math.min(100, value));
    }
    settings.muted = saved.muted === true;
    settings.musicMuted = saved.musicMuted === true;
    if (typeof saved.pilotName === 'string') settings.pilotName = saved.pilotName;
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
