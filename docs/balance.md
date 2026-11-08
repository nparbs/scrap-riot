# Balance

How robots are built and fair-tested. All the numbers are in `src/sim/data.ts`. They were tuned against bots and need people playing them, so anything a player reports overrides this.

## The rules

- **Points:** every robot gets `POINT_BUDGET` (100). Every part costs points, the chassis included, and stronger parts cost more. Unused points do nothing.
- **Weight:** every part weighs something, and a chassis has a `payload` it can carry. A big weapon needs a big chassis, and a part that fits on points can still be too heavy.
- **Speed:** there's no speed stat on a chassis. Top speed and acceleration come from engine power against total weight, so everything bolted on slows the robot down (`buildStats`).
- **Hit power:** `punch` scales main-weapon damage by total weight, about 75% on a light Whippet and 120% on a loaded Anvil. Ram damage already grew with mass. Mines and other secondary weapons don't get it.
- **Size:** weapon reach is measured from the hull's edge, so a big robot reaches further, and a target's width counts toward a weapon's arc, so a big robot is easier to hit (`inCone`).
- **Health and armor:** health comes from the chassis, and armor is a separate bar set on the workshop dial. Hits wear armor first at `ARMOUR.wear` (0.7 per damage), then reach health. A weapon's `pierce` is the share that skips armor: 100% on the Tesla Coil and fire's burn, none on the chainsaw. Repair kits and pickups mend only health. Armor stays worn until a respawn, unless the chassis is a Whippet.
- **Battery:** weapons and boost share it. `batteryCost` follows `hitPower`: damage plus what it takes to throw and stun, so a miss with a big weapon is expensive. A Sledgehammer swing takes nearly half a stock battery, hit or miss. Held weapons pay per second while cutting, and 35% of that while running with nothing to cut. Spinners pay most on the way up, and a little to wait at full speed. Boost costs more on a heavier robot, and active secondary weapons have a set cost. The Dagger has no motor and uses none. A power source sets recharge (`regen`), size (`capacity`) and, on the Alkaline, a quicker restart when flat (`restart`).
- **Flat battery:** a weapon or boost that runs the battery out cuts out with `batteryFlat`, and nothing that needs battery works until it recharges to `BATTERY_RESTART` (15%), or 8% and about 2 seconds on a stock Alkaline. The HUD shows BATTERY FLAT, and bots back away until it's over. Not affording a secondary weapon doesn't cause it.
- **Classes:** each chassis is a class built around some of the weapons, and every weapon belongs to exactly one (`CLASSES`). Only those weapons get the bonus, and the workshop shows it on the chassis cards and in Specs.

| Chassis | Class | Weapons | Bonus |
| --- | --- | --- | --- |
| Whippet | Striker | Dagger, Power Axe, Drum, Undercutter | +20% damage, 20% faster reload. With any weapon, 25% less damage while at 70% of top speed or more, and rebuilds 8 armor a second after 5 seconds without hurting or being hurt |
| Wraith | Lancer | Flamethrower, Tesla Coil, Pneumatic Spear | +10% damage, 40% less battery, 15% more reach |
| Bruiser | Brawler | Chainsaw, Drill, Rolling Pin, Flail | +15% damage, 15% less battery |
| Rhino | Bulldozer | Spike Ram, Claw, Lifting Forks, Pneumatic Flipper, Magnet | +10% damage, 10% faster reload, +20% grip time |
| Anvil | Titan | Sledgehammer, Hydraulic Crusher, Vertical Disc, Vertical Bar, Horizontal Bar | +15% damage, 10% faster reload |

- **Spike Strip:** lays a strip across the way its owner is facing, which lasts 12 seconds. The first enemy over it takes 8 damage and can't drive for `TIRE_POP_TIME` (3 seconds), though it can still fight, and it can't be popped again for `TIRE_POP_GUARD` (4 more seconds). A strip is used up by that one robot, a Plow clears it, and it passes under a robot in the air.
- **Upgrades:** they count in Career only. `withoutUpgrades` strips them for Online, Offline vs Bots and Training, so points alone decide those. Rivals outside Career have none either, and get tougher with the player's wins. In Career they're the stronger +12% health, +5% speed and +10% damage a level, and rivals there have them too.

## How to test

`npm run balance -- [duels] [brawls]` builds random legal robots with `fillBuild`, then plays duels in pairs with sides swapped, plus 8-robot brawls. It uses every core but one, and 24,000 duels with 2,400 brawls take about two minutes. `BALANCE_SKILL=1` changes how sharp duel bots are.

The column to read is **win%**. If points are right, every part wins about half its duels whatever it costs, because a dearer part leaves fewer points for everything else. **Own worth** is that part's value with the rest of the robot held even, so it should rise with points.

## Latest results

24,000 duels and 2,400 brawls, at skill 0.7, with the trained bots. Half the robots pick the chassis their weapon belongs on, as a player soon would:

| | Duel win% | Share of brawl wins (12.5% is even) |
| --- | --- | --- |
| Chassis | 46% to 53% | Whippet 7.3%, Wraith 10.4%, Bruiser 12.3%, Anvil 14.4%, Rhino 15.8% |
| Main weapons | 40% (Spear) to 62% (Forks) | 7.3% (Sledgehammer) to 22.3% (Spike Ram) |
| Secondary weapons | 43% (Flash Bomb, Kamikaze) to 60% (Spike Strip) | Spike Strip 12.6%, the others not checked closely |
| Engines | 45% to 53% | |
| Wheels | 46% to 52% | |
| Power sources | 46% (Alkaline) to 54% (Fuel Cell, Lithium) | |

A weapon on its own class wins 54% of duels, and anywhere else 44%. By class, in and out: Striker 50% and 43%, Lancer 53% and 39%, Brawler 53% and 43%, Bulldozer 57% and 46%, Titan 56% and 48%. The strongest pairings are Forks on a Rhino and a Crusher on an Anvil, both 68%. The Drum (43%) does worse on a Whippet than elsewhere, and the Power Axe (46%) about the same, which means their class isn't paying off yet.

Bots swing early and wide by how unskilled they are, so missing shows up. That moves weapons with narrow arcs and long reloads the most, such as the Spear and Flipper. An average duel lasts 48 seconds.

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

## Training the bots

`npm run train-bots -- [rounds] [games per try] [generations]` evolves how bots use each main and secondary weapon, and writes the numbers to `src/sim/trained.ts`. It carries on from what's there, and two rounds of 60 games and 12 generations take about 35 minutes. Rerun it after a big change to the weapons.

- **What it can change:** only the numbers in `Tactics` and `Habit` in `src/sim/tactics.ts`, such as how far to flank, when to back off and when to fire a secondary weapon. The behaviours themselves are written by hand in `src/sim/ai.ts`, so it can't invent a new one.
- **How it scores:** three quarters of games are duels, and the rest are 4-robot brawls. A win on time counts for little, so nothing learns to hide. A quarter of rivals fight plainly, so nothing learns tricks that only beat other trained bots. A new set of numbers only stays if it beats the old one on 800 games it hasn't seen.
- **Difficulty:** `trainedShare` blends from plain fighting at skill 0.45 to all the training at 0.95, so early rivals barely use it.

Results, from about 690,000 games:

- **Duels:** with the same robot on both sides at top skill, trained bots beat plain ones 61% of the time on average. By weapon it runs from 73% (Chainsaw) to 49% (Vertical Bar, Flipper).
- **Brawls:** no better. In 8-robot brawls, half trained and half plain, trained robots won 50% of them. There are no tactics for crowds yet, such as who to pick on or when to leave a pile-up.
- **Stalling:** none. 8% of duels run out of time with all bots trained, against 10% with all plain.
- **Backing off:** rarely learned, at 1% to 7% of a fight for most weapons, because reversing is slow. The Magnet is the exception, at 36%. So training didn't make light robots play hit and run.
- **What did help:** slowing down to aim up close, swinging slightly ahead of a target that's closing, shoving robots near a drop, and spinning up from further out.
- **Noise:** some numbers changed without doing anything, so don't read meaning into each one. Flash Bomb's range went to 18.7 when it only reaches 10.

## Known limits of these numbers

- **Bots don't play like people.** They rarely hit and run, even trained, which probably undersells light robots. They never use launch ramps.
- **Light robots lose brawls.** Whippets win 48% of duels but only 7.3% of brawl wins. Training, the class bonus and both passives barely changed that. Bots don't back out of a fight to rebuild armor, a Whippet can carry little armor, and it's often slowed or stopped in a crowd, where Moving Target doesn't count. It's partly the bots and partly real, so the first thing to check by hand is whether a person in a Whippet can survive.
- **Slow robots don't out-damage quick ones in bot fights.** They hit much harder, but per second over a whole fight it comes out even (r close to zero), because they connect less often. A person who keeps a heavy robot on target will do better than this.
- **Random robots barely run flat**, at 2% of a fight (5% on Alkaline), because bots hold back until something's in reach. The table above is the better guide to how it will feel to a person.
- **The Spike Strip leads the secondary weapons**, at 60% of duels even after raising it to 11 points and a 12-second reload. Bots barely steer around one, and a person can see it and go round, so judge it by hand before cutting it further. Popping for 1.5 or 2 seconds instead of 3 made little difference.
- **4 Large Wheels are still behind**, at 46% even with 4% more top speed, so that change didn't do what it was meant to.
- **The stock battery is behind the others**, which is deliberate for a part that costs almost nothing, but it means a new robot is at a real disadvantage until the player buys a better one.
- **Career was only compared bot against bot, and only with a stock robot.** A plain bot at skill 0.7 stood in for a person who doesn't improve. It wins Old Ironjaw about half the time, and the last fights are out of reach without buying upgrades, which is their purpose. Nobody has played the ladder with upgrades bought.
