import { describe, expect, it } from 'vitest';
import { activeLevel, AutoQuality, defaultSettings, DEFAULT_BINDINGS, keyLabel, loadSettings, rebind, writeSettings } from '../src/game/settings';
import { Tutorial, type TutorialInput } from '../src/game/tutorial';
import { deadzone, PadReader, type PadLike } from '../src/gamepad';
import { relativeBearing } from '../src/sim/match';

describe('key bindings', () => {
  it('rebinds, and swaps when the key is already taken', () => {
    const b = { ...DEFAULT_BINDINGS };
    expect(rebind(b, 'melee', 'KeyZ')).toBe(true);
    expect(b.melee).toBe('KeyZ');
    expect(rebind(b, 'melee', 'KeyQ')).toBe(true);
    expect(b.melee).toBe('KeyQ');
    expect(b.turret).toBe('KeyZ');
    expect(new Set(Object.values(b)).size).toBe(Object.keys(b).length);
  });

  it('defaults to WASD, with Space for the main weapon', () => {
    const b = DEFAULT_BINDINGS;
    expect([b.forward, b.left, b.back, b.right]).toEqual(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
    expect([b.melee, b.turret, b.defense, b.rear, b.boost]).toEqual(['Space', 'KeyQ', 'KeyR', 'KeyE', 'ShiftLeft']);
    expect(b.power6).toBe('Digit6');
    expect(new Set(Object.values(b)).size).toBe(Object.keys(b).length);
  });

  it('refuses Ctrl, since Ctrl+W would close the tab mid-match', () => {
    const b = { ...DEFAULT_BINDINGS };
    expect(rebind(b, 'rear', 'ControlLeft')).toBe(false);
    expect(b.rear).toBe('KeyE');
  });

  it('refuses keys reserved for pause and mute', () => {
    const b = { ...DEFAULT_BINDINGS };
    expect(rebind(b, 'melee', 'Escape')).toBe(false);
    expect(rebind(b, 'melee', 'KeyM')).toBe(false);
    expect(b.melee).toBe('Space');
  });

  it('labels keys readably', () => {
    expect(keyLabel('KeyX')).toBe('X');
    expect(keyLabel('Digit1')).toBe('1');
    expect(keyLabel('ArrowUp')).toBe('↑');
    expect(keyLabel('ControlLeft')).toBe('Ctrl');
    expect(keyLabel('Space')).toBe('Space');
  });
});

describe('settings storage', () => {
  it('round-trips and survives corruption, bad values and blocked storage', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const settings = defaultSettings();
    settings.quality = 'low';
    settings.bindings.melee = 'KeyZ';
    writeSettings(storage, settings);
    expect(loadSettings(storage).quality).toBe('low');
    expect(loadSettings(storage).bindings.melee).toBe('KeyZ');

    const key = [...store.keys()][0];
    store.set(key, JSON.stringify({ quality: 'ultra', bindings: { melee: 'Escape', turret: 7 }, showFps: 'yes' }));
    const odd = loadSettings(storage);
    expect(odd.quality).toBe('auto');
    expect(odd.bindings.melee).toBe('Space');
    expect(odd.bindings.turret).toBe('KeyQ');
    expect(odd.showFps).toBe(false);

    store.set(key, '{nope');
    expect(loadSettings(storage).quality).toBe('auto');
    expect(loadSettings(null).quality).toBe('auto');
  });
});

describe('pilot name and music settings', () => {
  it('starts with no name, music on, and remembers both', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const fresh = loadSettings(storage);
    expect(fresh.pilotName).toBe('');
    expect(fresh.music).toBe(true);
    fresh.pilotName = 'Rusty';
    fresh.music = false;
    writeSettings(storage, fresh);
    const back = loadSettings(storage);
    expect(back.pilotName).toBe('Rusty');
    expect(back.music).toBe(false);
  });

  it('ignores a corrupt name', () => {
    expect(loadSettings({ getItem: () => JSON.stringify({ pilotName: 42 }) }).pilotName).toBe('');
  });
});

describe('auto quality', () => {
  const run = (auto: AutoQuality, fps: number, seconds: number, level: 'high' | 'lowest' = 'high') => {
    let result = null;
    for (let i = 0; i < fps * seconds; i++) result = auto.sample(1 / fps, level) ?? result;
    return result;
  };

  it('steps down only after the frame rate stays low', () => {
    expect(run(new AutoQuality(), 60, 10)).toBeNull();
    expect(run(new AutoQuality(), 20, 1)).toBeNull();
    expect(run(new AutoQuality(), 20, 4)).toBe('medium');
  });

  it('stops at the lowest level', () => {
    expect(run(new AutoQuality(), 10, 10, 'lowest')).toBeNull();
  });

  it('a fixed choice overrides what Auto picked', () => {
    const settings = defaultSettings();
    settings.autoLevel = 'low';
    expect(activeLevel(settings)).toBe('low');
    settings.quality = 'medium';
    expect(activeLevel(settings)).toBe('medium');
  });
});

describe('gamepad', () => {
  const pad = (over: { axes?: number[]; pressed?: number[]; values?: Record<number, number> } = {}): PadLike => ({
    axes: over.axes ?? [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, (_, i) => ({
      pressed: over.pressed?.includes(i) ?? false,
      value: over.values?.[i] ?? 0,
    })),
  });

  it('ignores stick drift and rescales beyond the deadzone', () => {
    expect(deadzone(0.1)).toBe(0);
    expect(deadzone(-0.1)).toBe(0);
    expect(deadzone(1)).toBe(1);
    expect(deadzone(-1)).toBe(-1);
  });

  it('maps triggers to throttle and stick right to a right turn', () => {
    const state = new PadReader().read(pad({ axes: [1], values: { 7: 1, 6: 0.25 } }));
    expect(state.throttle).toBeCloseTo(0.75);
    expect(state.steer).toBe(-1);
  });

  it('fires powerups and pause once per press', () => {
    const reader = new PadReader();
    expect(reader.read(pad({ pressed: [12, 9] }))).toMatchObject({ powerup: 0, pausePressed: true });
    expect(reader.read(pad({ pressed: [12, 9] }))).toMatchObject({ powerup: -1, pausePressed: false });
    reader.read(pad());
    expect(reader.read(pad({ pressed: [12] })).powerup).toBe(0);
  });
});

describe('tutorial', () => {
  const idle: TutorialInput = { throttle: 0, steer: 0, melee: false, turret: false, defense: false, boost: false };

  it('advances only when the player does the thing, for long enough', () => {
    const t = new Tutorial(DEFAULT_BINDINGS);
    const first = t.prompt;
    expect(first).toContain('W');
    t.update(5, idle);
    expect(t.prompt).toBe(first);
    t.update(0.2, { ...idle, throttle: 1 });
    expect(t.prompt).toBe(first);
    t.update(1, { ...idle, throttle: 1 });
    expect(t.prompt).not.toBe(first);
  });

  it('runs to completion and shows rebound keys', () => {
    const t = new Tutorial({ ...DEFAULT_BINDINGS, power1: 'KeyZ' });
    t.update(2, { ...idle, throttle: 1 });
    t.update(2, { ...idle, steer: 1 });
    t.update(2, { ...idle, turret: true });
    t.update(2, { ...idle, melee: true });
    t.update(0, { ...idle, defense: true });
    t.update(1, { ...idle, boost: true });
    expect(t.prompt).toContain('Z');
    // The last prompt only gives information, so it clears itself and can't get stuck.
    t.update(1, idle);
    expect(t.finished).toBe(false);
    t.update(5, idle);
    expect(t.finished).toBe(true);
    expect(t.prompt).toBe('');
  });
});

describe('damage direction', () => {
  it('reports attackers relative to where the robot faces, with left positive', () => {
    expect(relativeBearing(0, 0, 0, 0, 10)).toBeCloseTo(0);
    expect(Math.abs(relativeBearing(0, 0, 0, 0, -10))).toBeCloseTo(Math.PI);
    // Facing +z, +x is on screen left, matching how steering and the chase camera work.
    expect(relativeBearing(0, 0, 0, 10, 0)).toBeCloseTo(Math.PI / 2);
    expect(relativeBearing(0, 0, 0, -10, 0)).toBeCloseTo(-Math.PI / 2);
    expect(relativeBearing(0, 0, Math.PI / 2, 10, 0)).toBeCloseTo(0);
  });
});
