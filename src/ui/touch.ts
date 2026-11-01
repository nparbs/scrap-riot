import type { TouchState } from '../input';
import { POWERUPS, type PowerupId } from '../sim/data';

/** How far the stick travels for full throttle or full steering, as a share of its width. */
const STICK_REACH = 0.35;
/** Small movements near the middle don't count, so resting a thumb doesn't drift. */
const STICK_DEADZONE = 0.14;
const POWERUP_BUZZ_MS = 12;

/**
 * Phones and tablets. A laptop with a touchscreen keeps its mouse as the main pointer, and isn't included.
 * Phones with a stylus can report a fine pointer, so the browser's own description counts as well.
 */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const coarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  return coarse || /Mobi|Android|iPhone|iPod/i.test(navigator.userAgent);
}

function hold(el: HTMLElement, set: (down: boolean) => void): void {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    el.classList.add('touch-held');
    set(true);
  });
  const release = () => {
    el.classList.remove('touch-held');
    set(false);
  };
  el.addEventListener('pointerup', release);
  el.addEventListener('pointercancel', release);
  el.addEventListener('lostpointercapture', release);
}

/** A thumbstick for driving and thumb buttons for everything else, drawn over the match. */
export function touchControls(state: TouchState, onPause: () => void, onPowerup: (slot: number) => void, powerups: PowerupId[]): HTMLElement {
  const el = document.createElement('div');
  el.className = 'touch-controls';
  el.innerHTML = `
    <div class="touch-stick" aria-label="Drive"><div class="touch-knob"></div></div>
    <div class="touch-buttons">
      <button class="touch-btn touch-melee" tabindex="-1" aria-label="Main weapon"><i class="touch-cd"></i><span>Weapon</span></button>
      <button class="touch-btn touch-defense" tabindex="-1" aria-label="Defense"><i class="touch-cd"></i><span>Defense</span></button>
      <button class="touch-btn touch-boost" tabindex="-1" aria-label="Speed boost"><i class="touch-cd"></i><span>Boost</span></button>
      <button class="touch-btn touch-rear" tabindex="-1" aria-label="Look behind"><span>Rear</span></button>
      <div class="touch-powers">
        ${powerups.map((id) => `<button class="touch-power touch-power-${id}" tabindex="-1" aria-label="${POWERUPS[id].name}"><span>${POWERUPS[id].short}</span><b></b></button>`).join('')}
      </div>
    </div>
    <button class="touch-pause" tabindex="-1" aria-label="Menu">II</button>
    <div class="touch-rotate">Turn your phone sideways for more room</div>`;

  const q = (selector: string) => el.querySelector<HTMLElement>(selector)!;
  hold(q('.touch-melee'), (down) => (state.melee = down));
  hold(q('.touch-defense'), (down) => (state.defense = down));
  hold(q('.touch-boost'), (down) => (state.boost = down));
  hold(q('.touch-rear'), (down) => (state.rear = down));
  q('.touch-pause').addEventListener('click', onPause);

  const stick = q('.touch-stick');
  const knob = q('.touch-knob');
  const move = (e: PointerEvent) => {
    const box = stick.getBoundingClientRect();
    const reach = box.width * STICK_REACH;
    let x = e.clientX - (box.left + box.width / 2);
    let y = e.clientY - (box.top + box.height / 2);
    const length = Math.hypot(x, y);
    if (length > reach) {
      x = (x / length) * reach;
      y = (y / length) * reach;
    }
    knob.style.transform = `translate(${x}px, ${y}px)`;
    const axis = (value: number) => {
      const amount = value / reach;
      return Math.abs(amount) < STICK_DEADZONE ? 0 : amount;
    };
    state.throttle = -axis(y);
    // Stick right is positive here, while the sim's steering treats left as positive.
    state.steer = -axis(x);
  };
  const center = () => {
    knob.style.transform = '';
    state.throttle = 0;
    state.steer = 0;
  };
  stick.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    stick.setPointerCapture(e.pointerId);
    move(e);
  });
  stick.addEventListener('pointermove', (e) => {
    if (stick.hasPointerCapture(e.pointerId)) move(e);
  });
  stick.addEventListener('pointerup', center);
  stick.addEventListener('pointercancel', center);

  el.querySelectorAll<HTMLElement>('.touch-power').forEach((button, slot) => {
    hold(button, (down) => {
      if (!down) return;
      // A little buzz where phones allow it, since the thumb hides the button being pressed.
      navigator.vibrate?.(POWERUP_BUZZ_MS);
      onPowerup(slot);
    });
  });
  return el;
}
