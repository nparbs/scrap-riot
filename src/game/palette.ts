/** The colors that carry meaning, as opposed to the ones players pick for their robots. */
export interface Palette {
  /** Over the robots, at more than half, more than a quarter, and below that. */
  bar: [number, number, number];
  /** The same, in the HUD. */
  hudBar: [number, number, number];
  armour: number;
  /** Null keeps the stylesheet's color. */
  hudArmour: number | null;
  repair: number;
  scrap: number;
}

export const STANDARD_PALETTE: Palette = {
  bar: [0x5be36a, 0xf2c037, 0xe84a3a],
  hudBar: [0x7ddba8, 0xffa94d, 0xe8483a],
  armour: 0x9fc4e8,
  hudArmour: null,
  repair: 0x5be36a,
  scrap: 0xffd24a,
};

/** Blue, yellow and vermillion from the Okabe-Ito set, which stay apart for the common kinds of color blindness. Armor goes pale grey so it doesn't read as health. */
export const COLORBLIND_PALETTE: Palette = {
  bar: [0x56b4e9, 0xf0e442, 0xd55e00],
  hudBar: [0x56b4e9, 0xf0e442, 0xd55e00],
  armour: 0xe6e6e6,
  hudArmour: 0xe6e6e6,
  repair: 0x56b4e9,
  scrap: 0xf0e442,
};

export function healthColor(colors: [number, number, number], health: number): number {
  return colors[health > 0.5 ? 0 : health > 0.25 ? 1 : 2];
}
