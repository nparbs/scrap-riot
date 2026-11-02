// Written by scripts/train-bots.ts. Run that again rather than editing these by hand.
import type { DefenseId, MeleeId } from './data';
import type { Habit, Tactics } from './tactics';

export const TRAINED_TACTICS: Partial<Record<MeleeId, Tactics>> = {
  chainsaw: { flank: 0.173, standoff: 0.292, kiteReload: 0.679, kiteGap: 2.534, kiteSpeed: 0.802, turnThrottle: 0.493, lead: 0.355, engage: 6.77, saveBattery: 0.063, boostDist: 11.965, boostAmmo: 0.844, edgeHunt: 3.492, repairAt: 0.296, kitAt: 0.449, batteryAt: 0.205 },
  drill: { flank: 0.125, standoff: 0.232, kiteReload: 0.835, kiteGap: 1.769, kiteSpeed: 1.15, turnThrottle: 0.533, lead: 0.03, engage: 6.906, saveBattery: 0.075, boostDist: 19.522, boostAmmo: 0.484, edgeHunt: 4.721, repairAt: 0.396, kitAt: 0.416, batteryAt: 0.115 },
  dagger: { flank: 0.166, standoff: 0.073, kiteReload: 0.552, kiteGap: 1.667, kiteSpeed: 1.216, turnThrottle: 0.499, lead: 0.206, engage: 2.804, saveBattery: 0.044, boostDist: 16.455, boostAmmo: 0.792, edgeHunt: 3.899, repairAt: 0.406, kitAt: 0.576, batteryAt: 0.126 },
  rollingpin: { flank: 0.276, standoff: 0.309, kiteReload: 0.969, kiteGap: 3.877, kiteSpeed: 1.385, turnThrottle: 0.506, lead: 0.243, engage: 6.032, saveBattery: 0.177, boostDist: 7.844, boostAmmo: 0.56, edgeHunt: 4.173, repairAt: 0.265, kitAt: 0.469, batteryAt: 0.195 },
  hammer: { flank: 0.18, standoff: 0.328, kiteReload: 0.989, kiteGap: 0.923, kiteSpeed: 1.327, turnThrottle: 0.797, lead: 0.149, engage: 7.016, saveBattery: 0.056, boostDist: 15.317, boostAmmo: 0.887, edgeHunt: 1.906, repairAt: 0.494, kitAt: 0.564, batteryAt: 0.065 },
  axe: { flank: 0.141, standoff: 0.068, kiteReload: 1, kiteGap: 0.957, kiteSpeed: 1.062, turnThrottle: 0.852, lead: 0.044, engage: 3.411, saveBattery: 0.02, boostDist: 12.221, boostAmmo: 0.52, edgeHunt: 0.786, repairAt: 0.393, kitAt: 0.52, batteryAt: 0.088 },
  ram: { flank: 0.149, standoff: 0.227, kiteReload: 0.982, kiteGap: 0.433, kiteSpeed: 1.219, turnThrottle: 0.451, lead: 0.098, engage: 6.801, saveBattery: 0.334, boostDist: 20.784, boostAmmo: 0.902, edgeHunt: 5.471, repairAt: 0.468, kitAt: 0.565, batteryAt: 0.301 },
  claw: { flank: 0, standoff: 0, kiteReload: 1, kiteGap: 0, kiteSpeed: 1, turnThrottle: 1, lead: 0, engage: 3.3, saveBattery: 0, boostDist: 12, boostAmmo: 0.6, edgeHunt: 0, repairAt: 0.35, kitAt: 0.5, batteryAt: 0.15 },
  magnet: { flank: 0.118, standoff: 0.223, kiteReload: 0.703, kiteGap: 2.02, kiteSpeed: 0.727, turnThrottle: 0.872, lead: 0.263, engage: 8.332, saveBattery: 0.268, boostDist: 13.634, boostAmmo: 0.412, edgeHunt: 2.572, repairAt: 0.44, kitAt: 0.501, batteryAt: 0.152 },
  vertdisc: { flank: 0.218, standoff: 0.175, kiteReload: 0.84, kiteGap: 2.654, kiteSpeed: 1.316, turnThrottle: 0.721, lead: 0.075, engage: 15.281, saveBattery: 0.104, boostDist: 19.419, boostAmmo: 0.498, edgeHunt: 2.069, repairAt: 0.577, kitAt: 0.276, batteryAt: 0.091 },
  vertbar: { flank: 0.154, standoff: 0.249, kiteReload: 0.655, kiteGap: 2.894, kiteSpeed: 1.117, turnThrottle: 0.874, lead: 0.154, engage: 15.815, saveBattery: 0.057, boostDist: 20.142, boostAmmo: 0.397, edgeHunt: 1.855, repairAt: 0.182, kitAt: 0.358, batteryAt: 0.068 },
  horizbar: { flank: 0.204, standoff: 0.214, kiteReload: 0.873, kiteGap: 0.464, kiteSpeed: 1.395, turnThrottle: 0.916, lead: 0.144, engage: 15.565, saveBattery: 0.044, boostDist: 9.359, boostAmmo: 0.446, edgeHunt: 2.948, repairAt: 0.467, kitAt: 0.649, batteryAt: 0.071 },
  undercutter: { flank: 0.476, standoff: 0.248, kiteReload: 0.967, kiteGap: 1.306, kiteSpeed: 1.259, turnThrottle: 0.675, lead: 0.079, engage: 14.537, saveBattery: 0.041, boostDist: 13.66, boostAmmo: 0.404, edgeHunt: 4.057, repairAt: 0.341, kitAt: 0.58, batteryAt: 0.111 },
  drum: { flank: 0, standoff: 0, kiteReload: 1, kiteGap: 0, kiteSpeed: 1, turnThrottle: 1, lead: 0, engage: 12, saveBattery: 0, boostDist: 12, boostAmmo: 0.6, edgeHunt: 0, repairAt: 0.35, kitAt: 0.5, batteryAt: 0.15 },
  hammersaw: { flank: 0.454, standoff: 0.212, kiteReload: 1, kiteGap: 2.237, kiteSpeed: 0.753, turnThrottle: 0.92, lead: 0.091, engage: 4.093, saveBattery: 0.226, boostDist: 13.572, boostAmmo: 0.818, edgeHunt: 3.001, repairAt: 0.269, kitAt: 0.482, batteryAt: 0.18 },
  flipper: { flank: 0.307, standoff: 0.165, kiteReload: 0.863, kiteGap: 1.718, kiteSpeed: 0.985, turnThrottle: 0.475, lead: 0.021, engage: 5.688, saveBattery: 0.184, boostDist: 13.62, boostAmmo: 0.69, edgeHunt: 2.339, repairAt: 0.443, kitAt: 0.307, batteryAt: 0.11 },
  crusher: { flank: 0.244, standoff: 0.365, kiteReload: 0.913, kiteGap: 3.877, kiteSpeed: 1.375, turnThrottle: 0.883, lead: 0.28, engage: 3.804, saveBattery: 0.122, boostDist: 8.587, boostAmmo: 0.772, edgeHunt: 6.149, repairAt: 0.471, kitAt: 0.485, batteryAt: 0.143 },
  forks: { flank: 0.261, standoff: 0.148, kiteReload: 0.921, kiteGap: 2.031, kiteSpeed: 1.391, turnThrottle: 0.497, lead: 0.24, engage: 4.706, saveBattery: 0.199, boostDist: 20.352, boostAmmo: 0.5, edgeHunt: 5.104, repairAt: 0.51, kitAt: 0.387, batteryAt: 0.18 },
  flamethrower: { flank: 0.476, standoff: 0.057, kiteReload: 0.334, kiteGap: 5.321, kiteSpeed: 0.81, turnThrottle: 0.411, lead: 0.372, engage: 5.091, saveBattery: 0.299, boostDist: 18.946, boostAmmo: 0.944, edgeHunt: 7.209, repairAt: 0.549, kitAt: 0.506, batteryAt: 0.059 },
  tesla: { flank: 0.178, standoff: 0.077, kiteReload: 1, kiteGap: 1.868, kiteSpeed: 1.042, turnThrottle: 0.684, lead: 0.06, engage: 4.614, saveBattery: 0.179, boostDist: 14.521, boostAmmo: 0.465, edgeHunt: 1.744, repairAt: 0.507, kitAt: 0.531, batteryAt: 0.274 },
  spear: { flank: 0.316, standoff: 0.071, kiteReload: 0.909, kiteGap: 2.983, kiteSpeed: 1.452, turnThrottle: 0.457, lead: 0.033, engage: 6.679, saveBattery: 0.112, boostDist: 13.32, boostAmmo: 0.712, edgeHunt: 3.237, repairAt: 0.424, kitAt: 0.304, batteryAt: 0.125 },
};

export const TRAINED_HABITS: Partial<Record<DefenseId, Habit>> = {
  shield: { range: 34.377, health: 1, reserve: 0.319 },
  mines: { range: 24.178, health: 0.743, reserve: 0.024 },
  oil: { range: 9, health: 1, reserve: 0 },
  glue: { range: 25.693, health: 0.792, reserve: 0.055 },
  nails: { range: 21.05, health: 0.586, reserve: 0.242 },
  blades: { range: 1.6, health: 1, reserve: 0 },
  cutter: { range: 0, health: 0.823, reserve: 0.215 },
  teleport: { range: 13.181, health: 0.111, reserve: 0.301 },
  flash: { range: 18.709, health: 0.825, reserve: 0.103 },
  regen: { range: 40, health: 0.6, reserve: 0 },
  cloak: { range: 32.916, health: 0.715, reserve: 0.228 },
  emp: { range: 6.3, health: 1, reserve: 0 },
  minibot: { range: 27.088, health: 0.865, reserve: 0.231 },
  remote: { range: 10.089, health: 0.779, reserve: 0.047 },
  kamikaze: { range: 4.8, health: 0.2, reserve: 0 },
};
