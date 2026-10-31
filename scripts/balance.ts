// Plays AI-only matches headlessly and reports pacing plus how each piece of gear performs.
// Usage: npm run balance -- [matches]
import { ARENA_ORDER, type ArenaId } from '../src/sim/arena';
import { CHASSIS, DEFENSES, MELEE, TURRETS } from '../src/sim/data';
import { Match, type BotSetup, type Loadout } from '../src/sim/match';
import { makeRng } from '../src/sim/rng';

const MATCHES = Number(process.argv[2] ?? 300);
const rng = makeRng(2024);
const pick = <T>(list: T[]): T => list[Math.floor(rng() * list.length)];
const keys = <T extends object>(obj: T) => Object.keys(obj) as (keyof T)[];

interface Tally {
  bots: number;
  kills: number;
  deaths: number;
  wins: number;
}
const tallies = new Map<string, Tally>();
function tally(key: string): Tally {
  let t = tallies.get(key);
  if (!t) tallies.set(key, (t = { bots: 0, kills: 0, deaths: 0, wins: 0 }));
  return t;
}

const arenaStats = new Map<ArenaId, { matches: number; time: number; deaths: number; falls: number }>();

for (let m = 0; m < MATCHES; m++) {
  const setups: BotSetup[] = Array.from({ length: 6 }, (_, i) => {
    const loadout: Loadout = {
      chassis: pick(keys(CHASSIS)),
      melee: pick(keys(MELEE)),
      turret: pick(keys(TURRETS)),
      defense: pick(keys(DEFENSES)),
      powerups: { rage: 1, megashield: 0, cloaking: 0, xray: 0, repair: 1, turbo: 1 },
      upgrades: { armor: 0, engine: 0, weapons: 0 },
    };
    return { name: `Bot ${i}`, color: 0, loadout, isAI: true, skill: 0.6 };
  });
  const arena = ARENA_ORDER[m % ARENA_ORDER.length];
  const match = new Match(setups, { seed: m + 1, arena });
  let falls = 0;
  while (!match.over) {
    match.step();
    for (const event of match.drainEvents()) if (event.type === 'kill' && event.fell) falls++;
  }

  const stats = arenaStats.get(arena) ?? { matches: 0, time: 0, deaths: 0, falls: 0 };
  stats.matches++;
  stats.time += match.time;
  stats.falls += falls;

  const top = match.standings()[0].bot;
  for (const bot of match.bots) {
    stats.deaths += bot.deaths;
    const { chassis, melee, turret, defense } = bot.loadout;
    for (const key of [`chassis/${chassis}`, `melee/${melee}`, `turret/${turret}`, `defense/${defense}`]) {
      const t = tally(key);
      t.bots++;
      t.kills += bot.kills;
      t.deaths += bot.deaths;
      if (bot === top) t.wins++;
    }
  }
  arenaStats.set(arena, stats);
}

console.log(`${MATCHES} matches, 6 bots each\n`);
console.log('arena        avg length  avg bot life  deaths by falling');
for (const [id, s] of arenaStats) {
  const life = (s.time * 6) / Math.max(1, s.deaths);
  console.log(`${id.padEnd(12)} ${(s.time / s.matches).toFixed(0).padStart(7)} s ${life.toFixed(0).padStart(11)} s ${((s.falls / Math.max(1, s.deaths)) * 100).toFixed(0).padStart(14)}%`);
}
console.log('\ngear                 kills/match  deaths/match  win%  (even share = 16.7%)');
for (const [key, t] of [...tallies].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(
    `${key.padEnd(22)} ${(t.kills / t.bots).toFixed(2).padStart(6)} ${(t.deaths / t.bots).toFixed(2).padStart(12)} ${((t.wins / t.bots) * 100).toFixed(1).padStart(7)}`,
  );
}
