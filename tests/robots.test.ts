import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildRobot, type RobotBuild, type RobotModel } from '../src/render/robots';
import { BODIES, CHASSIS, DEFAULT_PAINT, DEFENSES, type BodyId, type ChassisId, type DefenseId } from '../src/sim/data';
import { Match, type BotSetup } from '../src/sim/match';
import { newSave } from '../src/game/progress';

const BODY_IDS = Object.keys(BODIES) as BodyId[];
const CHASSIS_IDS = Object.keys(CHASSIS) as ChassisId[];

function build(chassis: ChassisId, body: BodyId, defense: DefenseId = 'shield'): RobotBuild {
  return { chassis, melee: 'chainsaw', defense, paint: { ...DEFAULT_PAINT, body }, color: DEFAULT_PAINT.primary };
}

function hullBox(model: RobotModel): THREE.Box3 {
  let hull: THREE.Mesh | null = null;
  model.root.traverse((node) => {
    if (node instanceof THREE.Mesh && node.material === model.hullMaterial) hull = node;
  });
  return new THREE.Box3().setFromObject(hull!);
}

describe('defense gear', () => {
  /** Where each piece sits along the robot, front to back. */
  const pieces = (defense: DefenseId, rearMelee: boolean) => {
    const centers: number[] = [];
    const { root } = buildRobot({ ...build('brawler', 'wedge', defense), melee: 'hammer', rearMelee });
    root.updateMatrixWorld(true);
    root.traverse((node) => {
      if (node instanceof THREE.Mesh) centers.push(new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3()).z);
    });
    return centers;
  };
  /** The pieces this defense adds, compared with one that has no model. */
  const gear = (defense: DefenseId, rearMelee: boolean) => {
    const plain = pieces('shield', rearMelee).map((z) => z.toFixed(4));
    return pieces(defense, rearMelee).filter((z) => {
      const match = plain.indexOf(z.toFixed(4));
      if (match >= 0) plain.splice(match, 1);
      return match < 0;
    });
  };

  it.each(['steelram', 'plow'] as const)('the %s sits opposite the main weapon', (defense) => {
    expect(gear(defense, false).length).toBeGreaterThan(0);
    expect(gear(defense, false).every((z) => z < 0)).toBe(true);
    expect(gear(defense, true).every((z) => z > 0)).toBe(true);
  });
});

describe('body shapes', () => {
  it.each(CHASSIS_IDS)('all fill the same footprint on the %s', (chassis) => {
    const sizes = BODY_IDS.map((body) => hullBox(buildRobot(build(chassis, body))).getSize(new THREE.Vector3()));
    for (const size of sizes) {
      expect(size.x).toBeCloseTo(sizes[0].x, 5);
      expect(size.z).toBeCloseTo(sizes[0].z, 5);
    }
  });

  it('change nothing in the rules', () => {
    const fight = (body: BodyId) => {
      const setup = (name: string): BotSetup => {
        const { loadout } = newSave();
        return { name, color: 0xff0000, isAI: true, loadout: { ...loadout, paint: { ...DEFAULT_PAINT, body } } };
      };
      const match = new Match([setup('A'), setup('B')], { seed: 7, arena: 'skyscraper', mode: 'duel' });
      for (let i = 0; i < 1200; i++) match.step();
      return match.bots.map((bot) => [bot.radius, bot.hp, bot.x, bot.z, bot.heading]);
    };
    const results = BODY_IDS.map(fight);
    for (const result of results) expect(result).toEqual(results[0]);
  });
});

describe('robot models', () => {
  it('keep the deck clear, with only the tower above the hull', () => {
    for (const chassis of CHASSIS_IDS) {
      for (const body of BODY_IDS) {
        for (const defense of Object.keys(DEFENSES) as DefenseId[]) {
          const model = buildRobot(build(chassis, body, defense));
          model.root.children.find((node) => node.children.length > 0 && node.position.y > 0 && node !== model.meleePivot && node !== model.shield && node.position.x === 0 && node.position.z < 0)?.removeFromParent();
          model.meleePivot.removeFromParent();
          model.shield.removeFromParent();
          const hull = hullBox(model);
          model.root.updateMatrixWorld(true);
          model.root.traverse((node) => {
            if (!(node instanceof THREE.Mesh)) return;
            const part = new THREE.Box3().setFromObject(node);
            const center = part.getCenter(new THREE.Vector3());
            const overDeck = Math.abs(center.x) < hull.max.x && Math.abs(center.z) < hull.max.z;
            if (overDeck) expect(part.max.y, `${chassis} ${body} ${defense}`).toBeLessThanOrEqual(hull.max.y + 1e-6);
          });
        }
      }
    }
  });

  it('still have armour to lose as they take damage', () => {
    for (const body of BODY_IDS) expect(buildRobot(build('brawler', body)).plates.length).toBeGreaterThanOrEqual(4);
  });
});
