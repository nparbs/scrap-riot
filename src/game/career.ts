import type { ArenaId } from '../sim/arena';
import type { ChassisId, DefenseId, MeleeId, ModeId, TurretId } from '../sim/data';
import type { BotSetup, Standing } from '../sim/match';
import { makeRivals } from './progress';

const CAREER_KEY = 'scrap-riot.career.v1';

export type Medal = 'bronze' | 'silver' | 'gold';

export interface Boss {
  name: string;
  chassis: ChassisId;
  melee: MeleeId;
  turret: TurretId;
  defense: DefenseId;
  color: number;
  hpMult: number;
  size: number;
}

export interface Fight {
  id: string;
  title: string;
  blurb: string;
  arena: ArenaId;
  mode: ModeId;
  rivals: number;
  level: number;
  /** Money for the first medal, only when progress is kept on this device. */
  reward: number;
  killTarget?: number;
  boss?: Boss;
}

export const CAREER: Fight[] = [
  { id: 'c1', title: 'First Bolts', blurb: 'One slow rival. Learn the controls.', arena: 'pit', mode: 'ffa', rivals: 1, level: 0, reward: 100, killTarget: 3 },
  { id: 'c2', title: 'Three-Way', blurb: 'Two rivals, and the saws are running.', arena: 'pit', mode: 'ffa', rivals: 2, level: 0, reward: 150, killTarget: 5 },
  { id: 'c3', title: 'Mind the Edge', blurb: 'No walls up here. Shove them off.', arena: 'rooftop', mode: 'ffa', rivals: 3, level: 0, reward: 200, killTarget: 6 },
  { id: 'c4', title: 'Hold the Roof', blurb: 'Take the zone and keep it.', arena: 'rooftop', mode: 'koth', rivals: 3, level: 1, reward: 250 },
  {
    id: 'c5', title: 'Old Ironjaw', blurb: 'Boss. The scrapyard\'s oldest brawler wants a word.', arena: 'pit', mode: 'ffa', rivals: 1, level: 1, reward: 500, killTarget: 4,
    boss: { name: 'Old Ironjaw', chassis: 'rhino', melee: 'hammer', turret: 'minigun', defense: 'steelram', color: 0x8a9096, hpMult: 2.5, size: 1.3 },
  },
  { id: 'c6', title: 'Heat Stroke', blurb: 'Stay out of the fire. Keep them in it.', arena: 'furnace', mode: 'ffa', rivals: 4, level: 1, reward: 300, killTarget: 8 },
  { id: 'c7', title: 'Last One Out', blurb: 'One life each, five rivals.', arena: 'furnace', mode: 'lms', rivals: 5, level: 2, reward: 350 },
  { id: 'c8', title: 'Moving Parts', blurb: 'Learn the pistons before they teach you.', arena: 'foundry', mode: 'ffa', rivals: 4, level: 2, reward: 400, killTarget: 8 },
  {
    id: 'c9', title: 'Queen Cinder', blurb: 'Boss. She built the Furnace, and she likes it hot.', arena: 'furnace', mode: 'ffa', rivals: 2, level: 2, reward: 800, killTarget: 5,
    boss: { name: 'Queen Cinder', chassis: 'juggernaut', melee: 'claw', turret: 'flamethrower', defense: 'mines', color: 0xe0503a, hpMult: 3, size: 1.4 },
  },
  { id: 'c10', title: 'Thin Ice', blurb: 'Nobody can stop out here, including you.', arena: 'glacier', mode: 'ffa', rivals: 5, level: 3, reward: 500, killTarget: 10 },
  { id: 'c11', title: 'Three Lanes', blurb: 'Hold the mesa with chasms on both sides.', arena: 'canyon', mode: 'koth', rivals: 5, level: 3, reward: 600 },
  {
    id: 'c12', title: 'The Last Machine', blurb: 'Final boss. Nothing has ever scratched it.', arena: 'foundry', mode: 'ffa', rivals: 3, level: 4, reward: 1500, killTarget: 6,
    boss: { name: 'The Last Machine', chassis: 'juggernaut', melee: 'magnet', turret: 'seeker', defense: 'emp', color: 0x33363b, hpMult: 4, size: 1.6 },
  },
];

export type CareerProgress = Record<string, Medal>;

const RANK: Record<Medal, number> = { bronze: 1, silver: 2, gold: 3 };

export function loadCareer(storage: Pick<Storage, 'getItem'> | null): CareerProgress {
  try {
    const parsed = JSON.parse(storage?.getItem(CAREER_KEY) ?? '{}') as unknown;
    return typeof parsed === 'object' && parsed !== null ? (parsed as CareerProgress) : {};
  } catch {
    return {};
  }
}

export function writeCareer(storage: Pick<Storage, 'setItem'> | null, progress: CareerProgress): void {
  try {
    storage?.setItem(CAREER_KEY, JSON.stringify(progress));
  } catch {
    // Career progress still counts until the page closes.
  }
}

/** Gold for winning almost untouched, silver for winning, bronze for the podium. */
export function medalFor(place: number, deaths: number, rivals: number): Medal | null {
  if (place === 1) return deaths <= 1 ? 'gold' : 'silver';
  // In a small fight, second place isn't much of a podium.
  return place <= Math.min(3, Math.ceil((rivals + 1) / 2)) ? 'bronze' : null;
}

/** Each fight unlocks once the one before it has a medal. */
export function isUnlocked(progress: CareerProgress, index: number): boolean {
  return index === 0 || progress[CAREER[index - 1].id] !== undefined;
}

/** Records a medal if it's better than the last, and returns the money for a first medal. */
export function awardMedal(progress: CareerProgress, fight: Fight, medal: Medal | null): number {
  if (!medal) return 0;
  const previous = progress[fight.id];
  if (!previous || RANK[medal] > RANK[previous]) progress[fight.id] = medal;
  return previous ? 0 : fight.reward;
}

export function fightSetups(fight: Fight, seed: number): BotSetup[] {
  const level = fight.level;
  const rivals = makeRivals({ wins: 2, loadout: { upgrades: { armor: level, engine: level, weapons: level } } }, fight.rivals, seed);
  if (!fight.boss) return rivals;
  const { name, chassis, melee, turret, defense, color, hpMult, size } = fight.boss;
  const base = rivals[0];
  return [
    {
      name,
      color,
      isAI: true,
      skill: Math.min(0.95, 0.65 + level * 0.08),
      boss: { hpMult, size },
      loadout: {
        ...base.loadout,
        chassis,
        melee,
        turret,
        defense,
        powerups: { rage: 1, megashield: 1, cloaking: 0, xray: 0, repair: 1, turbo: 1 },
        paint: { primary: color, secondary: 0x33363b, eye: 0xe0503a, pattern: 'hazard', topper: 'crown' },
      },
    },
    ...rivals.slice(1),
  ];
}

export function careerResult(fight: Fight, standings: Standing[], playerId: number): Medal | null {
  const mine = standings.find((s) => s.bot.id === playerId)!;
  return medalFor(mine.place, mine.bot.deaths, fight.rivals);
}

// --- Achievements ---

export interface AchievementStats {
  matches: number;
  wins: number;
  kills: number;
  rating: number;
  career: CareerProgress;
}

export interface Achievement {
  name: string;
  blurb: string;
  earned: (s: AchievementStats) => boolean;
}

const medals = (s: AchievementStats) => Object.values(s.career);

export const ACHIEVEMENTS: Achievement[] = [
  { name: 'First Blood', blurb: 'Destroy a robot in an online match.', earned: (s) => s.kills >= 1 },
  { name: 'Scrap Dealer', blurb: 'Destroy 100 robots online.', earned: (s) => s.kills >= 100 },
  { name: 'Wrecking Crew', blurb: 'Destroy 500 robots online.', earned: (s) => s.kills >= 500 },
  { name: 'Regular', blurb: 'Play 25 matches online.', earned: (s) => s.matches >= 25 },
  { name: 'Top of the Heap', blurb: 'Win a match online.', earned: (s) => s.wins >= 1 },
  { name: 'Champion', blurb: 'Win 25 matches online.', earned: (s) => s.wins >= 25 },
  { name: 'Contender', blurb: 'Reach a rating of 1100.', earned: (s) => s.rating >= 1100 },
  { name: 'Legend of the Pit', blurb: 'Reach a rating of 1500.', earned: (s) => s.rating >= 1500 },
  { name: 'Ironjaw Broken', blurb: 'Beat the first career boss.', earned: (s) => s.career.c5 !== undefined },
  { name: 'Career Finished', blurb: 'Earn a medal in the final career fight.', earned: (s) => s.career.c12 !== undefined },
  { name: 'Solid Gold', blurb: 'Earn gold in every career fight.', earned: (s) => medals(s).filter((m) => m === 'gold').length >= CAREER.length },
];
