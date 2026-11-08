import { escapeText } from './hud';
import type { KillEvent } from '../render/replay';

export interface ReplayOverlay {
  el: HTMLElement;
  /** Seconds since the kill in the replay, below zero before it. */
  update(sinceKill: number): void;
  /** Takes the skip listeners off the page. */
  dispose(): void;
}

/** Letterbox bars, a replay tag, and the call of how it ended once the moment comes. Any key or tap skips it. */
export function replayOverlay(event: KillEvent, killer: string | null, victim: string, onSkip: () => void): ReplayOverlay {
  const el = document.createElement('div');
  el.className = 'screen screen-replay';
  const call = event.fell ? 'Ring out!' : 'Knockout!';
  const who = killer ? `<b>${escapeText(killer)}</b> <i>▶</i> ${escapeText(victim)}` : escapeText(victim);
  el.innerHTML = `
    <div class="replay-bar replay-bar-top"></div>
    <div class="replay-bar replay-bar-bottom"></div>
    <div class="replay-tag"><i></i>Replay</div>
    <div class="replay-call"><strong>${call}</strong><span>${who}</span></div>
    <button class="replay-skip" type="button">Skip <i>▶▶</i></button>`;
  let skipped = false;
  const skip = () => {
    if (skipped) return;
    skipped = true;
    onSkip();
  };
  // A key still held from the fight shouldn't skip it the moment it starts.
  const armedAt = performance.now() + 400;
  const onKey = (e: KeyboardEvent) => {
    if (e.repeat || performance.now() < armedAt) return;
    skip();
  };
  window.addEventListener('keydown', onKey);
  el.addEventListener('pointerdown', () => {
    if (performance.now() >= armedAt) skip();
  });
  return {
    el,
    update(sinceKill) {
      el.classList.toggle('replay-hit', sinceKill >= 0);
    },
    dispose() {
      window.removeEventListener('keydown', onKey);
    },
  };
}
