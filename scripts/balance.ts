// Plays AI-only matches headlessly and reports pacing plus how each piece of gear performs.
// Usage: npm run balance -- [brawls] [duels per pairing]
import { ARENA_ORDER, type ArenaId } from '../src/sim/arena';
import { CHASSIS, DEFENSES, MELEE, type ModeId } from '../src/sim/data';
import { Match, type BotSetup, type Loadout } from '../src/sim/match';
import { makeRng } from '../src/sim/rng';

const MATCHES = Number(process.argv[2] ?? 280);
const PLAYERS = 8;
const rng = makeRng(2024);
const pick = <T>(list: T[]): T => list[Math.floor(rng() * list.length)];
const keys = <T extends object>(obj: T) => Object.keys(obj) as (keyof T)[];

interface Tally {
  bots: number;
  kills: number;
  deaths: number;
  damage: number;
  wins: number;
}
const tallies = new Map<string, Tally>();
function tally(key: string): Tally {
  let t = tallies.get(key);
  if (!t) tallies.set(key, (t = { bots: 0, kills: 0, deaths: 0, damage: 0, wins: 0 }));
  return t;
}

const arenaStats = new Map<ArenaId, { matches: number; time: number; deaths: number; falls: number; topKills: number }>();
const modeStats = new Map<ModeId, { matches: number; time: number; timedOut: number; topScore: number; spread: number }>();

function randomLoadout(): Loadout {
  return {
    chassis: pick(keys(CHASSIS)),
    melee: pick(keys(MELEE)),
    defense: pick(keys(DEFENSES)),
    powerups: { rage: 1, megashield: 1, cloaking: 1, xray: 1, repair: 1, battery: 1 },
    upgrades: { armor: 0, engine: 0, weapons: 0 },
  };
}

for (let m = 0; m < MATCHES; m++) {
  const setups: BotSetup[] = Array.from({ length: PLAYERS }, (_, i) => ({ name: `Bot ${i}`, color: 0, loadout: randomLoadout(), isAI: true, skill: 0.6 }));
  const arena = ARENA_ORDER[m % ARENA_ORDER.length];
  // Mostly the mode a Brawl plays, with the other big-match modes alongside.
  const mode: ModeId = m % 4 === 2 ? 'koth' : m % 4 === 3 ? 'lms' : 'ffa';
  const match = new Match(setups, { seed: m + 1, arena, mode });
  let falls = 0;
  while (!match.over) {
    match.step();
    for (const event of match.drainEvents()) if (event.type === 'kill' && event.fell) falls++;
  }

  const stats = arenaStats.get(arena) ?? { matches: 0, time: 0, deaths: 0, falls: 0, topKills: 0 };
  const ranked = match.ranked();
  stats.matches++;
  stats.time += match.time;
  stats.falls += falls;
  stats.topKills += ranked[0].kills;

  const modeStat = modeStats.get(mode) ?? { matches: 0, time: 0, timedOut: 0, topScore: 0, spread: 0 };
  modeStat.matches++;
  modeStat.time += match.time;
  if (match.time >= match.duration) modeStat.timedOut++;
  modeStat.topScore += match.score(ranked[0]);
  modeStat.spread += match.score(ranked[0]) - match.score(ranked[ranked.length - 1]);
  modeStats.set(mode, modeStat);

  const top = ranked[0];
  for (const bot of match.bots) {
    stats.deaths += bot.deaths;
    const { chassis, melee, defense } = bot.loadout;
    for (const key of [`chassis/${chassis}`, `melee/${melee}`, `defense/${defense}`]) {
      const t = tally(key);
      t.bots++;
      t.kills += bot.kills;
      t.deaths += bot.deaths;
      t.damage += bot.damageDealt;
      if (bot === top) t.wins++;
    }
  }
  arenaStats.set(arena, stats);
}

console.log(`${MATCHES} matches, ${PLAYERS} bots each\n`);
console.log('arena        avg length  avg bot life  deaths by falling  winner kills');
for (const [id, s] of arenaStats) {
  const life = (s.time * PLAYERS) / Math.max(1, s.deaths);
  console.log(`${id.padEnd(12)} ${(s.time / s.matches).toFixed(0).padStart(7)} s ${life.toFixed(0).padStart(11)} s ${((s.falls / Math.max(1, s.deaths)) * 100).toFixed(0).padStart(14)}% ${(s.topKills / s.matches).toFixed(1).padStart(12)}`);
}
console.log('\nmode  avg length  ran out of time  winner score  gap to last');
for (const [id, s] of modeStats) {
  console.log(`${id.padEnd(5)} ${(s.time / s.matches).toFixed(0).padStart(7)} s ${((s.timedOut / s.matches) * 100).toFixed(0).padStart(14)}% ${(s.topScore / s.matches).toFixed(1).padStart(13)} ${(s.spread / s.matches).toFixed(1).padStart(12)}`);
}
console.log(`\ngear                 kills/match  deaths/match  damage  win%  (even share = ${(100 / PLAYERS).toFixed(1)}%)`);
for (const [key, t] of [...tallies].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(
    `${key.padEnd(22)} ${(t.kills / t.bots).toFixed(2).padStart(6)} ${(t.deaths / t.bots).toFixed(2).padStart(12)} ${(t.damage / t.bots).toFixed(0).padStart(8)} ${((t.wins / t.bots) * 100).toFixed(1).padStart(6)}`,
  );
}

// A duel round robin: every main weapon against every other, on the map online play uses.
const DUELS = Number(process.argv[3] ?? 6);
const duelRecord = new Map<string, { wins: number; fights: number; time: number; falls: number }>();
const meleeIds = keys(MELEE);
for (const a of meleeIds) {
  for (const b of meleeIds) {
    if (a === b) continue;
    for (let i = 0; i < DUELS / 2; i++) {
      const fighter = (name: string, melee: typeof a): BotSetup => ({
        name,
        color: 0,
        isAI: true,
        skill: 0.7,
        loadout: { chassis: 'brawler', melee, defense: 'shield', powerups: { rage: 0, megashield: 0, cloaking: 0, xray: 0, repair: 1, battery: 1 }, upgrades: { armor: 0, engine: 0, weapons: 0 } },
      });
      const match = new Match([fighter('A', a), fighter('B', b)], { seed: i * 7 + 1, arena: 'skyscraper', mode: 'duel' });
      let fell = 0;
      while (!match.over) {
        match.step();
        for (const event of match.drainEvents()) if (event.type === 'kill' && event.fell) fell = 1;
      }
      const winner = match.standings()[0].bot;
      for (const bot of match.bots) {
        const record = duelRecord.get(bot.loadout.melee) ?? { wins: 0, fights: 0, time: 0, falls: 0 };
        record.fights++;
        record.time += match.time;
        record.falls += fell;
        if (bot === winner) record.wins++;
        duelRecord.set(bot.loadout.melee, record);
      }
    }
  }
}
console.log('\nduel round robin, same robot with each main weapon (even share = 50%)');
console.log('weapon        win%  avg length  ended by a fall');
for (const [id, r] of [...duelRecord].sort(([, x], [, y]) => y.wins / y.fights - x.wins / x.fights)) {
  console.log(`${id.padEnd(12)} ${((r.wins / r.fights) * 100).toFixed(0).padStart(4)}% ${(r.time / r.fights).toFixed(0).padStart(8)} s ${((r.falls / r.fights) * 100).toFixed(0).padStart(12)}%`);
}
