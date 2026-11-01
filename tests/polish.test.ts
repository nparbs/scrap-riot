import { describe, expect, it } from 'vitest';
import { PLAYLISTS } from '../src/music';
import { activeLevel, audibleVolume, AutoQuality, defaultSettings, DEFAULT_BINDINGS, keyLabel, loadSettings, musicOff, rebind, toggleMusic, writeSettings } from '../src/game/settings';
import { Tutorial, type TutorialInput } from '../src/game/tutorial';
import { deadzone, PadReader, type PadLike } from '../src/gamepad';
import { relativeBearing } from '../src/sim/match';

describe('key bindings', () => {
  it('rebinds, and swaps when the key is already taken', () => {
    const b = { ...DEFAULT_BINDINGS };
    expect(rebind(b, 'melee', 'KeyZ')).toBe(true);
    expect(b.melee).toBe('KeyZ');
    expect(rebind(b, 'melee', 'KeyR')).toBe(true);
    expect(b.melee).toBe('KeyR');
    expect(b.defense).toBe('KeyZ');
    expect(new Set(Object.values(b)).size).toBe(Object.keys(b).length);
  });

  it('defaults to WASD, with Space for the main weapon', () => {
    const b = DEFAULT_BINDINGS;
    expect([b.forward, b.left, b.back, b.right]).toEqual(['KeyW', 'KeyA', 'KeyS', 'KeyD']);
    expect([b.melee, b.defense, b.rear, b.boost]).toEqual(['Space', 'KeyR', 'KeyE', 'ShiftLeft']);
    expect(b.power3).toBe('Digit3');
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
    store.set(key, JSON.stringify({ quality: 'ultra', bindings: { melee: 'Escape', defense: 7 }, showFps: 'yes' }));
    const odd = loadSettings(storage);
    expect(odd.quality).toBe('auto');
    expect(odd.bindings.melee).toBe('Space');
    expect(odd.bindings.defense).toBe('KeyR');
    expect(odd.showFps).toBe(false);

    store.set(key, '{nope');
    expect(loadSettings(storage).quality).toBe('auto');
    expect(loadSettings(null).quality).toBe('auto');
  });
});

describe('pilot name and audio settings', () => {
  const memory = () => {
    const store = new Map<string, string>();
    return { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  };

  it('starts with no name and audible sound, and remembers changes', () => {
    const storage = memory();
    const fresh = loadSettings(storage);
    expect(fresh.pilotName).toBe('');
    expect(fresh.muted).toBe(false);
    expect(fresh.volume.master).toBeGreaterThan(0);
    expect(fresh.volume.music).toBeGreaterThan(0);
    expect(fresh.volume.effects).toBeGreaterThan(0);
    fresh.pilotName = 'Rusty';
    fresh.muted = true;
    fresh.volume = { master: 40, music: 0, effects: 55 };
    writeSettings(storage, fresh);
    const back = loadSettings(storage);
    expect(back.pilotName).toBe('Rusty');
    expect(back.muted).toBe(true);
    expect(back.volume).toEqual({ master: 40, music: 0, effects: 55 });
    expect(back.musicMuted).toBe(false);
  });

  it('the music toggle silences the music, and brings back the level it had', () => {
    const settings = defaultSettings();
    settings.volume.music = 35;
    toggleMusic(settings);
    expect(musicOff(settings)).toBe(true);
    expect(audibleVolume(settings).music).toBe(0);
    expect(settings.volume.music).toBe(35);
    toggleMusic(settings);
    expect(musicOff(settings)).toBe(false);
    expect(audibleVolume(settings).music).toBe(35);
  });

  it('the music toggle turns on from a slider at zero, and is remembered', () => {
    const settings = defaultSettings();
    settings.volume.music = 0;
    expect(musicOff(settings)).toBe(true);
    toggleMusic(settings);
    expect(audibleVolume(settings).music).toBeGreaterThan(0);
    toggleMusic(settings);
    const storage = memory();
    writeSettings(storage, settings);
    expect(loadSettings(storage).musicMuted).toBe(true);
  });

  it('keeps bad saved values from reaching the audio', () => {
    const odd = loadSettings({ getItem: () => JSON.stringify({ pilotName: 42, muted: 'yes', volume: { master: 900, music: -5, effects: 'loud' } }) });
    expect(odd.pilotName).toBe('');
    expect(odd.muted).toBe(false);
    expect(odd.volume.master).toBe(100);
    expect(odd.volume.music).toBe(0);
    expect(odd.volume.effects).toBe(defaultSettings().volume.effects);
  });

  it('settings changed on one copy do not leak into the defaults', () => {
    defaultSettings().volume.master = 1;
    expect(defaultSettings().volume.master).toBe(100);
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

describe('full screen setting', () => {
  it('is on unless it was turned off', () => {
    const stored = (value: object) => ({ getItem: () => JSON.stringify(value) });
    expect(defaultSettings().fullscreen).toBe(true);
    expect(loadSettings(stored({})).fullscreen).toBe(true);
    expect(loadSettings(stored({ fullscreen: false })).fullscreen).toBe(false);
  });
});

describe('tutorial', () => {
  const idle: TutorialInput = { throttle: 0, steer: 0, melee: false, defense: false, boost: false };

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

  it('talks about the on-screen controls on a touch device', () => {
    const t = new Tutorial(DEFAULT_BINDINGS, true);
    const seen = [t.prompt];
    t.update(2, { ...idle, throttle: 1 });
    seen.push(t.prompt);
    t.update(2, { ...idle, steer: 1, throttle: 1 });
    seen.push(t.prompt);
    t.update(2, { ...idle, melee: true });
    seen.push(t.prompt);
    t.update(0, { ...idle, defense: true });
    seen.push(t.prompt);
    t.update(1, { ...idle, boost: true });
    seen.push(t.prompt);
    expect(new Set(seen).size).toBe(6);
    for (const prompt of seen) expect(prompt).not.toMatch(/\b(key|keys|mouse|click|Space|Shift)\b|\bW\b/i);
  });

  it('runs to completion and shows rebound keys', () => {
    const t = new Tutorial({ ...DEFAULT_BINDINGS, power1: 'KeyZ' });
    t.update(2, { ...idle, throttle: 1 });
    t.update(2, { ...idle, steer: 1, throttle: 1 });
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

describe('music', () => {
  const songs = [...PLAYLISTS.battle, ...PLAYLISTS.menu];

  it('has several songs for each mood, all properly different', () => {
    expect(PLAYLISTS.battle.length).toBeGreaterThanOrEqual(3);
    expect(PLAYLISTS.menu.length).toBeGreaterThanOrEqual(3);
    expect(new Set(songs.map((song) => song.name)).size).toBe(songs.length);
    expect(new Set(songs.map((song) => song.bars.join())).size).toBe(songs.length);
    expect(new Set(songs.map((song) => song.bpm)).size).toBe(songs.length);
  });

  it('has patterns that fit the bar', () => {
    for (const song of songs) {
      expect(song.kick, song.name).toHaveLength(16);
      expect(song.snare, song.name).toHaveLength(16);
      if (song.riff.length) expect(song.riff, song.name).toHaveLength(32);
      expect(song.length % song.bars.length, song.name).toBe(0);
    }
    for (const song of PLAYLISTS.battle) expect(song.chug, song.name).toHaveLength(16);
    for (const song of PLAYLISTS.menu) expect(song.arpeggio, song.name).toHaveLength(8);
  });
});
