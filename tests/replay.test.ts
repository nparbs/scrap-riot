import { describe, expect, it } from 'vitest';
import { newSave } from '../src/game/progress';
import { ReplayPlayer, ReplayRecorder } from '../src/render/replay';
import { Match, STEP, type BotSetup } from '../src/sim/match';

/** A duel on the roof where one robot gets shoved off the open edge, recorded as the view would. */
function ringOut(): { match: Match; recorder: ReplayRecorder } {
  const setup = (name: string): BotSetup => ({ name, color: 0, isAI: false, loadout: newSave().loadout });
  const match = new Match([setup('Pusher'), setup('Faller')], { seed: 1, arena: 'skyscraper', mode: 'duel' });
  const [pusher, faller] = match.bots;
  const place = (bot: typeof pusher, x: number, z: number) => Object.assign(bot, { x, prevX: x, z, prevZ: z, heading: Math.PI, prevHeading: Math.PI, invulnT: 0 });
  place(pusher, 0, -17);
  place(faller, 0, -24);
  const recorder = new ReplayRecorder();
  for (let i = 0; i < 600 && !match.over; i++) {
    if (i === 60) {
      faller.vz = -20;
      faller.lastAttacker = pusher.id;
    }
    match.step();
    recorder.capture(match, match.drainEvents(), 1, STEP);
  }
  return { match, recorder };
}

describe('the replay at the end of a match', () => {
  it('finds the ring-out that decided it, and who did it', () => {
    const { match, recorder } = ringOut();
    expect(match.over).toBe(true);
    const kill = recorder.decidingKill();
    expect(kill?.event.fell).toBe(true);
    expect(kill?.event.victim).toBe(1);
    expect(kill?.event.killer).toBe(0);
  });

  it('plays the kill once, slows down around it, and puts the match back as it ended', () => {
    const { match, recorder } = ringOut();
    const faller = match.bots[1];
    const ended = { x: faller.x, z: faller.z, alive: faller.alive, time: match.time };
    const replay = new ReplayPlayer(match, recorder.frames, recorder.decidingKill()!);
    let kills = 0;
    let slowest = Infinity;
    let sawAlive = false;
    while (!replay.done) {
      slowest = Math.min(slowest, replay.speed());
      kills += replay.advance(1 / 60).events.filter((e) => e.type === 'kill').length;
      if (replay.sinceKill < 0) sawAlive ||= faller.alive;
    }
    expect(kills).toBe(1);
    expect(sawAlive).toBe(true);
    expect(slowest).toBeLessThan(0.5);
    replay.restore();
    expect(faller.alive).toBe(ended.alive);
    expect(faller.x).toBeCloseTo(ended.x, 1);
    expect(faller.z).toBeCloseTo(ended.z, 1);
    expect(match.time).toBeCloseTo(ended.time, 5);
  });

  it('has nothing to replay when nobody was killed', () => {
    const setup = (name: string): BotSetup => ({ name, color: 0, isAI: false, loadout: newSave().loadout });
    const match = new Match([setup('A'), setup('B')], { seed: 1, arena: 'pit', mode: 'ffa' });
    const recorder = new ReplayRecorder();
    for (let i = 0; i < 120; i++) {
      match.step();
      recorder.capture(match, match.drainEvents(), 1, STEP);
    }
    expect(recorder.decidingKill()).toBeNull();
  });
});
