// Trains the bots by evolution: tries variations on how each weapon and defense is used, keeps what wins, and writes the result to src/sim/trained.ts.
// Usage: npm run train-bots -- [rounds] [games per try] [generations]
import { fork, type ChildProcess } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { cpus, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARENA_ORDER, type ArenaId } from '../src/sim/arena';
import { CHASSIS, DEFENSES, fillBuild, MELEE, type DefenseId, type MeleeId, type PartsChoice } from '../src/sim/data';
import { Match, type BotSetup, type Loadout } from '../src/sim/match';
import { makeRng, type Rng } from '../src/sim/rng';
import { HABIT_BOUNDS, plainHabit, plainTactics, TACTIC_BOUNDS, type Habit, type Tactics } from '../src/sim/tactics';
import { TRAINED_HABITS, TRAINED_TACTICS } from '../src/sim/trained';

const keys = <T extends object>(obj: T) => Object.keys(obj) as (keyof T)[];
const POWERUPS = { rage: 0, megashield: 0, cloaking: 0, xray: 0, repair: 1, battery: 1 };
const NO_UPGRADES = { armor: 0, engine: 0, weapons: 0 };

interface Brains {
  tactics: Partial<Record<MeleeId, Tactics>>;
  habits: Partial<Record<DefenseId, Habit>>;
}

interface Job {
  id: number;
  seed: number;
  games: number;
  /** Which part is being tried out, and the numbers to try. */
  melee?: MeleeId;
  defense?: DefenseId;
  tactics?: Tactics;
  habit?: Habit;
  brains: Brains;
}

const tacticsOf = (brains: Brains, melee: MeleeId) => brains.tactics[melee] ?? plainTactics(melee);
const habitsOf = (brains: Brains) => Object.fromEntries(keys(DEFENSES).map((id) => [id, brains.habits[id] ?? plainHabit(id)])) as Record<DefenseId, Habit>;

function play(job: Job, rng: Rng): number {
  const pick = <T>(list: T[]): T => list[Math.floor(rng() * list.length)];
  const random = (melee?: MeleeId, defense?: DefenseId): PartsChoice =>
    fillBuild({ chassis: pick(keys(CHASSIS)), melee: melee ?? pick(keys(MELEE)), defense: defense ?? pick(keys(DEFENSES)) }, rng);
  const setup = (name: string, build: PartsChoice, tactics: Tactics, habits: Record<DefenseId, Habit>): BotSetup => ({
    name, color: 0, isAI: true, skill: 1,
    loadout: { ...build, powerups: POWERUPS, upgrades: NO_UPGRADES } as Loadout,
    brain: { tactics, habits },
  });
  const trained = habitsOf(job.brains);
  // Some rivals fight plainly, so nothing is learned that only works on other trained bots.
  const rival = (name: string): BotSetup => {
    const build = random();
    return rng() < 0.25
      ? setup(name, build, plainTactics(build.melee), Object.fromEntries(keys(DEFENSES).map((id) => [id, plainHabit(id)])) as Record<DefenseId, Habit>)
      : setup(name, build, tacticsOf(job.brains, build.melee), trained);
  };
  const melee = job.melee ?? pick(keys(MELEE));
  const myHabits = job.defense && job.habit ? { ...trained, [job.defense]: job.habit } : trained;
  const me = setup('Me', random(melee, job.defense), job.tactics ?? tacticsOf(job.brains, melee), myHabits);
  const arena: ArenaId = rng() < 0.5 ? 'skyscraper' : pick(ARENA_ORDER);

  // A share of the games are small brawls, because that's where robots meet a crowd.
  if (rng() < 0.25) {
    const match = new Match([me, rival('A'), rival('B'), rival('C')], { seed: Math.floor(rng() * 1e9), arena: pick(ARENA_ORDER), mode: 'ffa', duration: 60, killTarget: 5 });
    while (!match.over) match.step();
    return [1, 0.6, 0.3, 0][match.ranked().indexOf(match.bots[0])];
  }
  const match = new Match(rng() < 0.5 ? [me, rival('B')] : [rival('B'), me], { seed: Math.floor(rng() * 1e9), arena, mode: 'duel' });
  while (!match.over) match.step();
  const mine = match.bots.find((bot) => bot.name === 'Me')!;
  const won = match.standings()[0].bot === mine;
  // Running down the clock is worth little to either side, so nothing learns to hide until time's up.
  if (match.time >= match.duration) return won ? 0.6 : 0.1;
  return won ? 1 : 0;
}

function work(job: Job): number {
  const rng = makeRng(job.seed);
  let total = 0;
  for (let i = 0; i < job.games; i++) total += play(job, rng);
  return total / job.games;
}

/** A pool of workers, each running one job at a time. */
class Pool {
  private readonly idle: ChildProcess[] = [];
  private readonly queue: { job: Job; done: (score: number) => void }[] = [];
  private nextId = 1;
  private readonly waiting = new Map<number, { done: (score: number) => void; child: ChildProcess }>();

  constructor(bundle: string, size: number) {
    for (let i = 0; i < size; i++) {
      const child = fork(bundle, ['--worker']);
      child.on('message', (message: { id: number; score: number }) => {
        const entry = this.waiting.get(message.id)!;
        this.waiting.delete(message.id);
        entry.done(message.score);
        this.idle.push(child);
        this.pump();
      });
      this.idle.push(child);
    }
  }

  run(job: Omit<Job, 'id'>): Promise<number> {
    return new Promise((done) => {
      this.queue.push({ job: { ...job, id: this.nextId++ }, done });
      this.pump();
    });
  }

  private pump(): void {
    while (this.idle.length > 0 && this.queue.length > 0) {
      const child = this.idle.pop()!;
      const { job, done } = this.queue.shift()!;
      this.waiting.set(job.id, { done, child });
      child.send(job);
    }
  }

  stop(): void {
    for (const child of this.idle) child.kill();
  }
}

const POPULATION = 14;
const BEST = 4;
const CHECK_GAMES = 800;

function gauss(rng: Rng): number {
  return Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
}

/** Evolves one set of numbers, working on them as shares of their allowed range so every one moves alike. */
async function evolve<T extends object>(
  start: T,
  bounds: Record<keyof T, [number, number]>,
  generations: number,
  games: number,
  rng: Rng,
  score: (candidate: T, seed: number, games: number) => Promise<number>,
): Promise<{ best: T; before: number; after: number }> {
  const names = Object.keys(bounds) as (keyof T)[];
  const read = (values: T) => names.map((name) => {
    const [low, high] = bounds[name];
    return (Number(values[name]) - low) / (high - low);
  });
  const write = (shares: number[]) => Object.fromEntries(names.map((name, i) => {
    const [low, high] = bounds[name];
    return [name, low + Math.max(0, Math.min(1, shares[i])) * (high - low)];
  })) as T;
  let mean = read(start);
  let sigma = 0.22;
  for (let generation = 0; generation < generations; generation++) {
    // Every try faces the same rivals on the same maps, so differences come from the numbers and not the luck.
    const seed = Math.floor(rng() * 1e9);
    const tries: number[][] = [];
    for (let i = 0; i < POPULATION / 2; i++) {
      const step = names.map(() => gauss(rng) * sigma);
      tries.push(mean.map((m, j) => m + step[j]), mean.map((m, j) => m - step[j]));
    }
    const scores = await Promise.all(tries.map((shares) => score(write(shares), seed, games)));
    const order = scores.map((_, i) => i).sort((a, b) => scores[b] - scores[a]).slice(0, BEST);
    mean = mean.map((_, j) => order.reduce((sum, i) => sum + Math.max(0, Math.min(1, tries[i][j])), 0) / BEST);
    sigma *= 0.92;
  }
  // On games it hasn't seen, because anything can look good after this many tries on the same seeds.
  const best = write(mean);
  const seed = Math.floor(rng() * 1e9);
  const chunks = Array.from({ length: 8 }, (_, i) => seed + i);
  const fair = async (candidate: T) => (await Promise.all(chunks.map((s) => score(candidate, s, CHECK_GAMES / 8)))).reduce((a, b) => a + b, 0) / chunks.length;
  const [before, after] = await Promise.all([fair(start), fair(best)]);
  return after > before + 0.005 ? { best, before, after } : { best: start, before, after };
}

const format = (values: object) => `{ ${Object.entries(values).map(([key, value]) => `${key}: ${Number((value as number).toFixed(3))}`).join(', ')} }`;

function save(brains: Brains): void {
  const table = (entries: object) => Object.entries(entries).map(([id, values]) => `  ${id}: ${format(values as object)},`).join('\n');
  writeFileSync(join(fileURLToPath(new URL('.', import.meta.url)), '../src/sim/trained.ts'), `// Written by scripts/train-bots.ts. Run that again rather than editing these by hand.
import type { DefenseId, MeleeId } from './data';
import type { Habit, Tactics } from './tactics';

export const TRAINED_TACTICS: Partial<Record<MeleeId, Tactics>> = {
${table(brains.tactics)}
};

export const TRAINED_HABITS: Partial<Record<DefenseId, Habit>> = {
${table(brains.habits)}
};
`);
}

if (process.argv[2] === '--worker') {
  process.on('message', (job: Job) => process.send!({ id: job.id, score: work(job) }));
} else {
  const ROUNDS = Number(process.argv[2] ?? 3);
  const GAMES = Number(process.argv[3] ?? 60);
  const GENERATIONS = Number(process.argv[4] ?? 12);
  const { build } = await import('esbuild');
  const bundle = join(tmpdir(), `scrap-riot-train-${process.pid}.mjs`);
  await build({ entryPoints: [fileURLToPath(import.meta.url)], outfile: bundle, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
  const pool = new Pool(bundle, Math.max(1, cpus().length - 1));
  const rng = makeRng(20261102);
  const brains: Brains = { tactics: { ...TRAINED_TACTICS }, habits: { ...TRAINED_HABITS } };
  const started = Date.now();
  const log = (text: string) => console.log(`[${Math.round((Date.now() - started) / 1000)} s] ${text}`);

  for (let round = 1; round <= ROUNDS; round++) {
    for (const melee of keys(MELEE)) {
      const { best, before, after } = await evolve(tacticsOf(brains, melee), TACTIC_BOUNDS, GENERATIONS, GAMES, rng, (tactics, seed, games) => pool.run({ seed, games, melee, tactics, brains }));
      brains.tactics[melee] = best;
      save(brains);
      log(`round ${round} ${melee.padEnd(13)} ${(before * 100).toFixed(1)} -> ${(after * 100).toFixed(1)}${best === tacticsOf(brains, melee) && after <= before + 0.005 ? ' (kept the old one)' : ''}`);
    }
    for (const defense of keys(DEFENSES)) {
      if (DEFENSES[defense].passive) continue;
      const start = brains.habits[defense] ?? plainHabit(defense);
      const { best, before, after } = await evolve(start, HABIT_BOUNDS, Math.ceil(GENERATIONS / 2), GAMES, rng, (habit, seed, games) => pool.run({ seed, games, defense, habit, brains }));
      brains.habits[defense] = best;
      save(brains);
      log(`round ${round} ${defense.padEnd(13)} ${(before * 100).toFixed(1)} -> ${(after * 100).toFixed(1)}`);
    }
  }
  pool.stop();
  rmSync(bundle, { force: true });
  process.exit(0);
}
