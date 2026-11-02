// Plays AI-only matches with random robots built to the points limit, and reports pacing and how each part does.
// If points are right, every part should win about half its duels, whatever it costs.
// Usage: npm run balance -- [duels] [brawls]
import { spawn } from 'node:child_process';
import { cpus, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARENA_ORDER, type ArenaId } from '../src/sim/arena';
import { ARMOUR, buildStats, CHASSIS, classFor, CLASSES, DEFENSES, ENGINES, fillBuild, MELEE, POWER_SOURCES, WHEELS, installedParts, payloadUsed, pointsUsed, buildProblem, type ModeId, type PartsChoice } from '../src/sim/data';
import { Match, type BotSetup, type Loadout } from '../src/sim/match';
import { makeRng, type Rng } from '../src/sim/rng';

const keys = <T extends object>(obj: T) => Object.keys(obj) as (keyof T)[];
/** How sharp the bots are in a duel, from 0 to 1. Set BALANCE_SKILL to see if a result only holds for clumsy bots. */
const DUEL_SKILL = Number(process.env.BALANCE_SKILL ?? 0.7);

function randomBuild(rng: Rng): PartsChoice {
  const pick = <T>(list: T[]): T => list[Math.floor(rng() * list.length)];
  const melee = pick(keys(MELEE));
  // Half pick the chassis their weapon belongs on, as a player soon would.
  return fillBuild({ chassis: rng() < 0.5 ? classFor(melee) : pick(keys(CHASSIS)), melee, defense: pick(keys(DEFENSES)) }, rng);
}

const fighter = (name: string, build: PartsChoice, skill: number): BotSetup => ({
  name,
  color: 0,
  isAI: true,
  skill,
  loadout: { ...build, powerups: { rage: 0, megashield: 0, cloaking: 0, xray: 0, repair: 1, battery: 1 }, upgrades: { armor: 0, engine: 0, weapons: 0 } } as Loadout,
});

interface DuelRow {
  a: PartsChoice;
  b: PartsChoice;
  /** Which of them won. */
  won: 0 | 1;
  time: number;
  fell: boolean;
  timedOut: boolean;
  damage: [number, number];
  /** Share of the fight spent with a flat battery. */
  dry: [number, number];
}

interface BrawlRow {
  arena: ArenaId;
  mode: ModeId;
  time: number;
  timedOut: boolean;
  falls: number;
  deaths: number;
  topKills: number;
  topScore: number;
  spread: number;
  bots: { build: PartsChoice; kills: number; deaths: number; damage: number; won: boolean }[];
}

function playDuel(seed: number, a: PartsChoice, b: PartsChoice, arena: ArenaId): DuelRow {
  const match = new Match([fighter('A', a, DUEL_SKILL), fighter('B', b, DUEL_SKILL)], { seed, arena, mode: 'duel' });
  let fell = false;
  const dry: [number, number] = [0, 0];
  let samples = 0;
  while (!match.over) {
    match.step();
    for (const event of match.drainEvents()) if (event.type === 'kill' && event.fell) fell = true;
    if (++samples % 30 === 0) match.bots.forEach((bot, i) => { if (bot.batteryFlat) dry[i]++; });
  }
  const winner = match.standings()[0].bot;
  const checks = Math.max(1, samples / 30);
  return {
    a, b, won: winner === match.bots[0] ? 0 : 1, time: match.time, fell,
    timedOut: match.time >= match.duration,
    damage: [match.bots[0].damageDealt, match.bots[1].damageDealt],
    dry: [dry[0] / checks, dry[1] / checks],
  };
}

function playBrawl(seed: number, rng: Rng): BrawlRow {
  const players = 8;
  const arena = ARENA_ORDER[seed % ARENA_ORDER.length];
  // Mostly the mode a Brawl plays, with the other big-match modes alongside.
  const mode: ModeId = seed % 4 === 2 ? 'koth' : seed % 4 === 3 ? 'lms' : 'ffa';
  const setups = Array.from({ length: players }, (_, i) => fighter(`Bot ${i}`, randomBuild(rng), 0.6));
  const match = new Match(setups, { seed: seed + 1, arena, mode });
  let falls = 0;
  while (!match.over) {
    match.step();
    for (const event of match.drainEvents()) if (event.type === 'kill' && event.fell) falls++;
  }
  const ranked = match.ranked();
  return {
    arena, mode, time: match.time, timedOut: match.time >= match.duration, falls,
    deaths: match.bots.reduce((sum, bot) => sum + bot.deaths, 0),
    topKills: ranked[0].kills,
    topScore: match.score(ranked[0]),
    spread: match.score(ranked[0]) - match.score(ranked[ranked.length - 1]),
    bots: match.bots.map((bot) => ({ build: bot.loadout, kills: bot.kills, deaths: bot.deaths, damage: bot.damageDealt, won: bot === ranked[0] })),
  };
}

/** One worker's share. Duels come in pairs, swapping sides, so neither robot gets the better start. */
function work(seed: number, duels: number, brawls: number): { duels: DuelRow[]; brawls: BrawlRow[] } {
  const rng = makeRng(seed);
  const rows: DuelRow[] = [];
  for (let i = 0; i < duels; i += 2) {
    const a = randomBuild(rng);
    const b = randomBuild(rng);
    // Half on the map online duels use, and the rest anywhere.
    const arena = i % 4 === 0 ? 'skyscraper' : ARENA_ORDER[Math.floor(rng() * ARENA_ORDER.length)];
    const fightSeed = seed * 1000 + i;
    rows.push(playDuel(fightSeed, a, b, arena));
    const swapped = playDuel(fightSeed, b, a, arena);
    rows.push({ a, b, won: swapped.won === 0 ? 1 : 0, time: swapped.time, fell: swapped.fell, timedOut: swapped.timedOut, damage: [swapped.damage[1], swapped.damage[0]], dry: [swapped.dry[1], swapped.dry[0]] });
  }
  return { duels: rows, brawls: Array.from({ length: brawls }, (_, i) => playBrawl(seed * 100 + i, rng)) };
}

const FEATURES: [string, (build: PartsChoice) => string, Record<string, { points: number; weight: number }>][] = [
  ['chassis', (b) => b.chassis, CHASSIS],
  ['melee', (b) => b.melee, MELEE],
  ['defense', (b) => b.defense, DEFENSES],
  ['engine', (b) => installedParts(b).engine, ENGINES],
  ['wheels', (b) => installedParts(b).wheels, WHEELS],
  ['power', (b) => installedParts(b).power, POWER_SOURCES],
];

/**
 * Each part's own worth with the rest of the robot held even, from a logistic fit of who won against
 * which parts each side had, and given as how often it would beat a robot like itself without it.
 */
function fitPartValues(rows: DuelRow[]): Map<string, number> {
  const index = new Map<string, number>();
  const vector = (build: PartsChoice): number[] => {
    const on: number[] = [];
    for (const [group, read] of FEATURES) {
      const key = `${group}/${read(build)}`;
      if (!index.has(key)) index.set(key, index.size);
      on.push(index.get(key)!);
    }
    return on;
  };
  const data = rows.map((row) => ({ a: vector(row.a), b: vector(row.b), armour: (installedParts(row.a).armour - installedParts(row.b).armour) / ARMOUR.step, y: row.won === 0 ? 1 : 0 }));
  const weights = new Array<number>(index.size + 1).fill(0);
  const armourAt = index.size;
  for (let round = 0; round < 1500; round++) {
    const grad = new Array<number>(weights.length).fill(0);
    for (const row of data) {
      let score = weights[armourAt] * row.armour;
      for (const i of row.a) score += weights[i];
      for (const i of row.b) score -= weights[i];
      const miss = row.y - 1 / (1 + Math.exp(-score));
      for (const i of row.a) grad[i] += miss;
      for (const i of row.b) grad[i] -= miss;
      grad[armourAt] += miss * row.armour;
    }
    for (let i = 0; i < weights.length; i++) weights[i] += (0.3 * (grad[i] - weights[i])) / data.length;
  }
  const out = new Map<string, number>();
  for (const [key, i] of index) out.set(key, weights[i]);
  out.set('armour/per step', weights[armourAt]);
  return out;
}

function report(duels: DuelRow[], brawls: BrawlRow[]): void {
  const percent = (n: number) => `${(n * 100).toFixed(0)}%`.padStart(5);
  const average = (list: number[]) => list.reduce((sum, n) => sum + n, 0) / Math.max(1, list.length);

  console.log(`${duels.length} duels between random robots built to the limits`);
  console.log(`  average length ${average(duels.map((d) => d.time)).toFixed(0)} s, ${percent(average(duels.map((d) => (d.fell ? 1 : 0))))} ended by a fall, ${percent(average(duels.map((d) => (d.timedOut ? 1 : 0))))} ran out of time`);
  console.log(`  points used, on average: ${average(duels.flatMap((d) => [pointsUsed(d.a), pointsUsed(d.b)])).toFixed(0)}`);
  const flatOn = (power: string) => average(duels.flatMap((d) => [installedParts(d.a).power === power ? d.dry[0] : -1, installedParts(d.b).power === power ? d.dry[1] : -1]).filter((n) => n >= 0));
  console.log(`  battery flat for ${percent(average(duels.flatMap((d) => d.dry)))} of the average fight (${keys(POWER_SOURCES).map((id) => `${id} ${percent(flatOn(id)).trim()}`).join(', ')})`);
  const illegal = duels.flatMap((d) => [d.a, d.b]).filter((b) => buildProblem(b)).length;
  if (illegal) console.log(`  WARNING: ${illegal} robots over the limits`);

  const fitted = fitPartValues(duels);
  for (const [group, read, table] of FEATURES) {
    console.log(`\n${group.padEnd(14)} pts   kg  picked   win%  own worth  dmg/s`);
    const lines = keys(table).map((id) => {
      const mine = duels.flatMap((d) => {
        const rows: { won: boolean; dps: number }[] = [];
        if (read(d.a) === id) rows.push({ won: d.won === 0, dps: d.damage[0] / d.time });
        if (read(d.b) === id) rows.push({ won: d.won === 1, dps: d.damage[1] / d.time });
        return rows;
      });
      const wins = average(mine.map((r) => (r.won ? 1 : 0)));
      const worth = 1 / (1 + Math.exp(-(fitted.get(`${group}/${id as string}`) ?? 0)));
      return { wins, text: `${(id as string).padEnd(14)} ${String(table[id as string].points).padStart(3)} ${String(table[id as string].weight).padStart(4)} ${String(mine.length).padStart(7)} ${percent(wins)} ${percent(worth).padStart(9)} ${average(mine.map((r) => r.dps)).toFixed(1).padStart(6)}` };
    });
    for (const line of lines.sort((x, y) => y.wins - x.wins)) console.log(line.text);
  }
  const perStep = fitted.get('armour/per step') ?? 0;
  console.log(`\neach ${ARMOUR.step} armor is worth ${percent(1 / (1 + Math.exp(-perStep)))} wins with the rest of the robot held even`);

  // Does a heavier robot really hit harder and move slower?
  const robots = duels.flatMap((d) => [
    { build: d.a, dps: d.damage[0] / d.time, won: d.won === 0 },
    { build: d.b, dps: d.damage[1] / d.time, won: d.won === 1 },
  ]);
  const correlation = (xs: number[], ys: number[]) => {
    const mx = average(xs);
    const my = average(ys);
    const top = average(xs.map((x, i) => (x - mx) * (ys[i] - my)));
    return top / Math.sqrt(average(xs.map((x) => (x - mx) ** 2)) * average(ys.map((y) => (y - my) ** 2)));
  };
  const speeds = robots.map((r) => buildStats(r.build).speed);
  const weights = robots.map((r) => buildStats(r.build).weight);
  const dps = robots.map((r) => r.dps);
  console.log(`\nspeed against damage per second: r = ${correlation(speeds, dps).toFixed(2)}, weight against speed: r = ${correlation(weights, speeds).toFixed(2)}`);
  console.log('chassis         speed     kg  carrying  armor  dmg/s');
  for (const id of keys(CHASSIS)) {
    const mine = robots.filter((r) => r.build.chassis === id);
    console.log(`${id.padEnd(14)} ${average(mine.map((r) => buildStats(r.build).speed)).toFixed(1).padStart(6)} ${average(mine.map((r) => buildStats(r.build).weight)).toFixed(0).padStart(6)} ${average(mine.map((r) => payloadUsed(r.build))).toFixed(0).padStart(9)} ${average(mine.map((r) => installedParts(r.build).armour)).toFixed(0).padStart(6)} ${average(mine.map((r) => r.dps)).toFixed(1).padStart(6)}`);
  }

  // Does fitting a weapon to its class pay off?
  const inClass = (r: { build: PartsChoice }) => CLASSES[r.build.chassis].weapons.includes(r.build.melee);
  const winsOf = (list: { won: boolean }[]) => average(list.map((r) => (r.won ? 1 : 0)));
  console.log(`\nin its class: ${percent(winsOf(robots.filter(inClass)))} wins, out of it: ${percent(winsOf(robots.filter((r) => !inClass(r))))}`);
  console.log('chassis         role        in class  out of class');
  for (const id of keys(CHASSIS)) {
    const mine = robots.filter((r) => r.build.chassis === id);
    console.log(`${id.padEnd(14)} ${CLASSES[id].role.padEnd(11)} ${percent(winsOf(mine.filter(inClass))).padStart(8)} ${percent(winsOf(mine.filter((r) => !inClass(r)))).padStart(13)}`);
  }
  console.log('weapon         on its class  elsewhere');
  for (const id of keys(MELEE)) {
    const mine = robots.filter((r) => r.build.melee === id);
    console.log(`${(id as string).padEnd(14)} ${percent(winsOf(mine.filter(inClass))).padStart(12)} ${percent(winsOf(mine.filter((r) => !inClass(r)))).padStart(10)}`);
  }

  // What each chassis can really bring to a fight: the hardest hitter it can lift, and how fast it then goes.
  console.log('\nchassis         heaviest weapon it can carry      top speed  biggest hit  damage/s in contact');
  const contactDps = (id: keyof typeof MELEE) => {
    const def = MELEE[id];
    if (def.kind === 'spinner' || def.kind === 'strike') return (def.damage + (def.saw ?? 0) * def.cooldown) / (def.cooldown + def.windup);
    if (def.kind === 'claw') return (def.damage * def.windup) / (def.windup + def.cooldown);
    return def.damage * (def.runTime ? def.runTime / (def.runTime + def.cooldown) : 1);
  };
  for (const chassis of keys(CHASSIS)) {
    const fits = keys(MELEE).filter((melee) => !buildProblem({ chassis, melee, defense: 'shield', engine: 'medium', wheels: 'large4', power: 'alkaline', armour: 0 }));
    const heaviest = fits.reduce((best, id) => (MELEE[id].weight > MELEE[best].weight ? id : best));
    const stats = buildStats({ chassis, melee: heaviest, defense: 'shield', engine: 'medium', wheels: 'large4', power: 'alkaline', armour: 0 });
    const hit = (MELEE[heaviest].kind === 'claw' ? MELEE[heaviest].damage * MELEE[heaviest].windup : MELEE[heaviest].damage) * stats.punch;
    const dps = contactDps(heaviest) * stats.punch;
    console.log(`${chassis.padEnd(14)} ${heaviest.padEnd(14)} ${`(${MELEE[heaviest].weight} kg, of ${fits.length} that fit)`.padEnd(24)} ${stats.speed.toFixed(1).padStart(6)} ${hit.toFixed(0).padStart(10)} ${dps.toFixed(0).padStart(12)}`);
  }

  // Anything winning far too much in one pairing would be the first thing players find.
  const combos = new Map<string, { wins: number; fights: number }>();
  for (const r of robots) {
    const key = `${r.build.chassis} + ${r.build.melee}`;
    const combo = combos.get(key) ?? { wins: 0, fights: 0 };
    combo.fights++;
    if (r.won) combo.wins++;
    combos.set(key, combo);
  }
  const ranked = [...combos].filter(([, c]) => c.fights >= 40).sort(([, x], [, y]) => y.wins / y.fights - x.wins / x.fights);
  console.log('\nbest chassis and weapon pairings');
  for (const [key, c] of ranked.slice(0, 8)) console.log(`  ${key.padEnd(28)} ${percent(c.wins / c.fights)} of ${c.fights}`);
  console.log('worst');
  for (const [key, c] of ranked.slice(-8)) console.log(`  ${key.padEnd(28)} ${percent(c.wins / c.fights)} of ${c.fights}`);

  if (brawls.length === 0) return;
  const players = brawls[0].bots.length;
  console.log(`\n${brawls.length} brawls of ${players}`);
  console.log('arena        avg length  avg bot life  deaths by falling  winner kills');
  for (const id of ARENA_ORDER) {
    const mine = brawls.filter((b) => b.arena === id);
    if (mine.length === 0) continue;
    const time = average(mine.map((b) => b.time));
    const deaths = average(mine.map((b) => b.deaths));
    console.log(`${id.padEnd(12)} ${time.toFixed(0).padStart(7)} s ${((time * players) / Math.max(1, deaths)).toFixed(0).padStart(11)} s ${percent(average(mine.map((b) => b.falls)) / Math.max(1, deaths)).padStart(18)} ${average(mine.map((b) => b.topKills)).toFixed(1).padStart(12)}`);
  }
  console.log('\nmode  avg length  ran out of time  winner score  gap to last');
  for (const id of ['ffa', 'koth', 'lms'] as ModeId[]) {
    const mine = brawls.filter((b) => b.mode === id);
    console.log(`${id.padEnd(5)} ${average(mine.map((b) => b.time)).toFixed(0).padStart(7)} s ${percent(average(mine.map((b) => (b.timedOut ? 1 : 0)))).padStart(16)} ${average(mine.map((b) => b.topScore)).toFixed(1).padStart(13)} ${average(mine.map((b) => b.spread)).toFixed(1).padStart(12)}`);
  }
  console.log(`\nin brawls        share of wins (even = ${(100 / players).toFixed(1)}%)  kills  deaths`);
  const brawlers = brawls.flatMap((b) => b.bots);
  for (const [group, read, table] of FEATURES) {
    const lines = keys(table).map((id) => {
      const mine = brawlers.filter((b) => read(b.build) === id);
      const wins = average(mine.map((b) => (b.won ? 1 : 0)));
      return { wins, text: `${`${group}/${id as string}`.padEnd(24)} ${`${(wins * 100).toFixed(1)}%`.padStart(6)} ${average(mine.map((b) => b.kills)).toFixed(2).padStart(6)} ${average(mine.map((b) => b.deaths)).toFixed(2).padStart(6)}` };
    });
    for (const line of lines.sort((x, y) => y.wins - x.wins)) console.log(line.text);
  }
}

const DUELS = Number(process.argv[2] ?? 4000);
const BRAWLS = Number(process.argv[3] ?? 200);

if (process.argv[2] === '--worker') {
  const [seed, duels, brawls] = process.argv.slice(3).map(Number);
  process.stdout.write(JSON.stringify(work(seed, duels, brawls)));
} else {
  // Bundled so the workers start quickly, as plain Node with nothing to compile.
  const { build } = await import('esbuild');
  const bundle = join(tmpdir(), `scrap-riot-balance-${process.pid}.mjs`);
  await build({ entryPoints: [fileURLToPath(import.meta.url)], outfile: bundle, bundle: true, platform: 'node', format: 'esm', logLevel: 'silent' });
  const workers = Math.max(1, cpus().length - 1);
  const results = await Promise.all(Array.from({ length: workers }, (_, i) => new Promise<ReturnType<typeof work>>((resolve, reject) => {
    const child = spawn(process.execPath, [bundle, '--worker', String(i + 1), String(Math.ceil(DUELS / workers / 2) * 2), String(Math.ceil(BRAWLS / workers))], { stdio: ['ignore', 'pipe', 'inherit'] });
    let text = '';
    child.stdout.on('data', (chunk) => { text += chunk; });
    child.on('close', (code) => (code === 0 ? resolve(JSON.parse(text)) : reject(new Error(`worker exited with ${code}`))));
  })));
  (await import('node:fs')).rmSync(bundle, { force: true });
  report(results.flatMap((r) => r.duels), results.flatMap((r) => r.brawls));
}
