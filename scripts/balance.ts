// Plays AI-only matches headlessly and reports pacing plus how each piece of gear performs.
// Usage: npm run balance -- [matches]
import { CHASSIS, DEFENSES, MELEE, TURRETS } from '../src/sim/data';
import { Match, type BotSetup, type Loadout } from '../src/sim/match';
import { makeRng } from '../src/sim/rng';

const MATCHES = Number(process.argv[2] ?? 200);
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

let totalKills = 0;
let totalTime = 0;
let totalDeaths = 0;
let botSeconds = 0;

for (let m = 0; m < MATCHES; m++) {
  const setups: BotSetup[] = Array.from({ length: 6 }, (_, i) => {
    const loadout: Loadout = {
      chassis: pick(keys(CHASSIS)),
      melee: pick(keys(MELEE)),
      turret: pick(keys(TURRETS)),
      defense: pick(keys(DEFENSES)),
      powerups: { repair: 1, turbo: 1, overdrive: 0, emp: 0 },
      upgrades: { armor: 0, engine: 0, weapons: 0 },
    };
    return { name: `Bot ${i}`, color: 0, loadout, isAI: true, skill: 0.6 };
  });
  const match = new Match(setups, { seed: m + 1 });
  while (!match.over) match.step();

  totalTime += match.time;
  botSeconds += match.time * match.bots.length;
  const top = match.standings()[0].bot;
  for (const bot of match.bots) {
    totalKills += bot.kills;
    totalDeaths += bot.deaths;
    const { chassis, melee, turret, defense } = bot.loadout;
    for (const key of [`chassis/${chassis}`, `melee/${melee}`, `turret/${turret}`, `defense/${defense}`]) {
      const t = tally(key);
      t.bots++;
      t.kills += bot.kills;
      t.deaths += bot.deaths;
      if (bot === top) t.wins++;
    }
  }
}

console.log(`${MATCHES} matches, 6 bots each`);
console.log(`avg length      ${(totalTime / MATCHES).toFixed(0)} s`);
console.log(`kills/minute    ${((totalKills / totalTime) * 60).toFixed(1)}`);
console.log(`avg bot life    ${(botSeconds / Math.max(1, totalDeaths)).toFixed(0)} s`);
console.log('\ngear             kills/match  deaths/match  win%  (even share = 16.7%)');
for (const [key, t] of [...tallies].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(
    `${key.padEnd(20)} ${(t.kills / t.bots).toFixed(2).padStart(6)} ${(t.deaths / t.bots).toFixed(2).padStart(12)} ${((t.wins / t.bots) * 100).toFixed(1).padStart(7)}`,
  );
}
