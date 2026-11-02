# Balance

How robots are built and fair-tested. All the numbers are in `src/sim/data.ts`. They were tuned against bots and need people playing them, so anything a player reports overrides this.

## The rules

- **Points:** every robot gets `POINT_BUDGET` (100). Every part costs points, the chassis included, and stronger parts cost more. Unused points do nothing.
- **Weight:** every part weighs something, and a chassis has a `payload` it can carry. A big weapon needs a big chassis, and a part that fits on points can still be too heavy.
- **Speed:** there's no speed stat on a chassis. Top speed and acceleration come from engine power against total weight, so everything bolted on slows the robot down (`buildStats`).
- **Hit power:** `punch` scales main-weapon damage by total weight, about 75% on a light Whippet and 120% on a loaded Anvil. Ram damage already grew with mass. Mines and other defenses don't get it.
- **Size:** weapon reach is measured from the hull's edge, so a big robot reaches further, and a target's width counts toward a weapon's arc, so a big robot is easier to hit (`inCone`).
- **Health and armor:** health comes from the chassis, and armor is a separate bar set on the workshop dial. Hits wear armor first at `ARMOUR.wear` (0.7 per damage), then reach health. A weapon's `pierce` is the share that skips armor: 100% on the Tesla Coil and fire's burn, none on the chainsaw. Repair kits and pickups mend only health, and only the Armor Regenerator rebuilds armor.
- **Battery:** weapons and boost share it. `batteryCost` follows `hitPower`: damage plus what it takes to throw and stun, so a miss with a big weapon is expensive. A Sledgehammer swing takes nearly half a stock battery, hit or miss. Held weapons pay per second while cutting, and 35% of that while running with nothing to cut. Spinners pay most on the way up, and a little to wait at full speed. Boost costs more on a heavier robot, and active defenses have a set cost. The Dagger has no motor and uses none. A power source sets recharge (`regen`) and size (`capacity`).
- **Flat battery:** a weapon or boost that runs the battery out cuts out with `batteryFlat`, and nothing that needs battery works until it recharges to `BATTERY_RESTART` (15%), about 3 seconds on a stock battery. The HUD shows BATTERY FLAT, and bots back away until it's over. Not affording a defense doesn't cause it.
- **Upgrades:** they count in Career only. `withoutUpgrades` strips them for Online, Offline vs Bots and Training, so points alone decide those. Rivals outside Career have none either, and get tougher with the player's wins. In Career they're the stronger +12% health, +5% speed and +10% damage a level, and rivals there have them too.

## How to test

`npm run balance -- [duels] [brawls]` builds random legal robots with `fillBuild`, then plays duels in pairs with sides swapped, plus 8-robot brawls. It uses every core but one, and 24,000 duels with 2,400 brawls take about two minutes. `BALANCE_SKILL=1` changes how sharp duel bots are.

The column to read is **win%**. If points are right, every part wins about half its duels whatever it costs, because a dearer part leaves fewer points for everything else. **Own worth** is that part's value with the rest of the robot held even, so it should rise with points.

## Latest results

24,000 duels and 2,400 brawls, at skill 0.7:

| | Duel win% | Share of brawl wins (12.5% is even) |
| --- | --- | --- |
| Chassis | 43% to 55% | Whippet 6.1%, Wraith 8.6%, Bruiser 12.5%, Rhino 15.7%, Anvil 16.3% |
| Main weapons | 38% (Flipper) to 59% (Crusher) | 6.2% (Flipper) to 23.5% (Flamethrower) |
| Defenses | 40% (Teleport) to 56% (Side Blades) | not checked closely |
| Engines | 47% to 54% | |
| Wheels | 46% to 52% | |
| Power sources | 44% (Alkaline) to 56% (Lithium) | |

Bots swing early and wide by how unskilled they are, so missing shows up. That moves weapons with long reloads the most. The spread for weapons is 28% to 63% at skill 0.4, and 43% to 57% at skill 1.0, where bots don't miss. An average duel lasts 51 seconds.

Battery, on a stock Alkaline with a stock opponent, 16 duels each. Careful means only pressing when lined up, and held means keeping the key down from 14 units away:

| Weapon | Flat when careful | Flat with the key held |
| --- | --- | --- |
| Chainsaw | 1% of the fight | 26% |
| Power Axe | 11% | 41% |
| Tesla Coil | 7% | 31% |
| Flamethrower | 3% | 36% |

What each chassis can bring, with a medium engine and no armor:

| Chassis | Heaviest weapon | Top speed | Biggest hit |
| --- | --- | --- | --- |
| Whippet | Rolling Pin (20 kg) | 16.2 | 17 |
| Wraith | Claw (24 kg) | 14.5 | 51 over a full grip |
| Bruiser | Vertical Bar (50 kg) | 11.5 | 74 |
| Rhino | Vertical Bar | 10.7 | 79 |
| Anvil | Vertical Bar | 10.0 | 84 |

## Known limits of these numbers

- **Bots don't play like people.** They drive straight at the target, so they never hit and run, which undersells light robots. They also use Teleport, Kamikaze and Flash badly, and they never use launch ramps.
- **Light robots lose brawls.** Whippets and Wraiths do fine in duels and poorly in crowds. That's partly the bots and partly real, so the first thing to check by hand is whether a person in a Whippet survives a Brawl.
- **Slow robots don't out-damage quick ones in bot fights.** They hit much harder, but per second over a whole fight it comes out even (r = 0.00), because they connect less often. A person who keeps a heavy robot on target will do better than this.
- **Random robots barely run flat**, at 2% of a fight (5% on Alkaline), because bots hold back until something's in reach. The table above is the better guide to how it will feel to a person.
- **The stock battery is behind the others**, which is deliberate for a part that costs almost nothing, but it means a new robot is at a real disadvantage until the player buys a better one.
- **Career was only compared bot against bot, and only with a stock robot.** With rivals' upgrades back to full strength, the last fights are out of reach without buying upgrades, which is their purpose. Old Ironjaw is won about a third of the time, against nearly two thirds before. Nobody has played the ladder with upgrades bought.
