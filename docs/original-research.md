# What we know about the original

Research behind Scrap Riot's weapon list. If you have footage of the original or remember something differently, please open an issue.

## There were several games

| Version | Year | Notes |
| --- | --- | --- |
| RobotKampen | 2001 | Swedish original, linked to Robot Wars on TV |
| Robot Rage | 2004 | English release on Miniclip |
| Robot Rage 2: Rearmed | 2005 | Added six weapons |
| Robot Rage 3 | 2013 | 3D Unity rebuild by Miniclip, with X/C/V controls. Removed in 2016. |

Scrap Riot plays like Robot Rage 3 and borrows weapons from every version.

## Arsenal

Names and broad behavior come from the sources below. **Exact behavior, damage and every other number are Scrap Riot's own design**, because no source documents them for the Unity version. Art, sound and code are all original.

| Scrap Riot | Original name | Where it's from | How much is documented |
| --- | --- | --- | --- |
| **Main weapon (Space)** | | | |
| Chainsaw | Chainsaw, Saw | All | Spins on a key. Outreached the sledgehammer. |
| Sledgehammer | Sledgehammer | RR3 | Named only |
| Power Axe | Power axe | Classic | Hammer-like motion, on a key |
| Drill | Drill | Classic | Spins on a key. Players rated it below the saw. |
| Dagger | Dagger | Classic | No key needed. Cheap starter weapon. |
| Rolling Pin | Rolling pin | Classic | Spinning drum that could leave robots stuck |
| Claw | Claw | All | Named only. Carrying the victim is our design. |
| Magnet | Magnet | RR3 | Named only. Pulling robots is our design. |
| Spike Ram | none | Ours | Original to Scrap Riot |
| Vertical Disc, Vertical Bar, Horizontal Bar, Undercutter, Drum, Eggbeater, Ring Spinner, Hammer Saw, Pneumatic Flipper, Hydraulic Crusher, Lifting Forks | none | Real combat robots | See below |
| **Gun (Q)** | | | |
| Chaingun | Chaingun, Mini-Gun | All | Fires along the weapon's forward angle, and doesn't track. 200 charges, damage 2. |
| Missile Pod | Missiles | RR3 | Named only |
| Heavy Rocket | Guided Missiles | Classic | The original's tracked its target. Ours fly straight, by design. |
| Bunker Buster | Heat-Seeking Missiles | Classic | Hit harder than guided missiles. Ours fly straight, by design. |
| Mortar | Mortar | RR3 | Named only |
| Grenade Launcher | Grenade Launcher | Classic | Named only |
| Flamethrower | Flamethrower | All | Medium range |
| Laser Cannon | Laser, Laser Cannon | All | Long range |
| Razor Discs | Razor-Discs | Rearmed | Ranged, can bounce back at the thrower, deflected by the plow |
| Spear Gun | Spear Gun | Rearmed | Ranged |
| Arc Coil | none | Ours | Original to Scrap Riot |
| **Defense (R)** | | | |
| Force Field | Force Field | Classic | Halved damage in the original |
| Land Mines | Land mines, Mines | All | RR3 had mines on the ranged key |
| Oil Spreader | Oil spreader | Classic | Named only |
| Glue Spreader | Glue spreader | Classic | Named only |
| Nail Spreader | Nail spreader | Classic | Spikes that do continuous damage |
| Steel Ram | Steel ram | RR3 | Named only |
| Plow | Plow | Classic | No key needed. Clears mines and nails, deflects discs. |
| Side Blades | Blades | RR3 | Named only |
| Cutter | Cutter | RR3 | Named only |
| Teleport | Teleport | RR3 | Named only |
| Flash Bomb | Flash Bombs | Rearmed | Blinds opponents briefly |
| Armor Regenerator | Armour Regenerator | Rearmed | Restores armor, used battery in the original |
| Cloaking Device | Cloaking Device | Classic | Named only |
| EMP | EMP | Classic | Stunned for 10 seconds, so strong that tournaments banned it. Ours lasts 1.5. |
| Mini-Robot | Mini-Robot | Classic | Named only |
| Remote Charges | Remote Charges | Classic | Named only |
| Kamikaze Bomb | Kamikaze Bomb | Rearmed | Destroys both robots |

**Powerups (1 to 4):** Rage, Mega Shield, Cloaking and X-Ray are RR3's four. Repair Kit and Battery Pack (5 and 6) are ours.

**How the parts worked:** each part in *Rearmed* had a price, weight, space and, for weapons, damage, charges and a front or back placement. The Saw cost 70 cr, did 4 damage and took 2 space, and could leave a robot stuck on it for a lot of unavoidable damage. Towers added armour and storage space (a Large Tower gave 83 more armour), and a Medium Chassis had 125 armour against a Large Chassis's 166. Moving, especially chasing, drained the battery, which is why Scrap Riot's boost runs on it. Alkaline, hydrogen and nuclear batteries are all mentioned.

**Also in the originals, and not yet here:** weight as a stat, two main weapons at once, the Rear-View Camera (covered by the look-behind key), gold as a second currency, and spectator mode.

## Real combat robots

The newer main weapons come from the families real builders use. Numbers are Scrap Riot's own, and the behaviour is simplified to work in a 2D simulation.

| Family | How the real thing behaves | How it plays here |
| --- | --- | --- |
| Vertical spinner | A disc or bar spinning upright, striking up or down. The impact can knock its own robot away. | Long spin-up, huge single hit, throws the target in the air, big recoil |
| Horizontal spinner | A bar or blade spinning flat, hitting from the side. Undercutters sit low and go for the wheels. | A wide sweep that swats robots sideways. The Undercutter slows them instead. |
| Drum, eggbeater | A short, heavy cylinder across the front that spins up quickly with less knockback. Eggbeaters are lighter toothed bars with less mass behind each hit. | Quick to spin up, frequent small hits, pops robots off the ground |
| Full body spinner | The spinning weapon surrounds the whole robot, so any contact hits it, but it is very hard to design and drive. | Hits from every side, slow to wind up, costs top speed |
| Hammer | An arm swings a heavy head onto the top armour, usually the weakest part. | Slow, strong strike and a stun |
| Hammer saw | A spinning tool on an arm, brought down onto a grappled opponent. It takes time to do real damage. | A strike, then continuous cutting while held |
| Flipper | A powered plate gets under the opponent and throws it. Real ones have a limited number of flips, because they run out of stored energy. | Low damage and a long throw, using battery per flip. Deadly near an edge. |
| Crusher | A beak or jaws that bite and hold. Heavy damage from a solid bite, but little otherwise. | Grabs and does very high damage for a short time |
| Lifter, grappler | Scoops up and pins the opponent, doing little damage. | Carries the target wherever you drive |

The robots' look follows the same idea: low armoured wedges with a steel scoop along the floor and exposed wheels.

## Deliberately left out

The first version's arena used Robot Wars house robots (Sir Killalot, Matilda and Sgt. Bash). Those belong to that TV show, so Scrap Riot uses its own hazards instead: flame sentries and piston rams.

## Sources

- [Not So Casual wiki: Robot Rage](http://wiki.notsocasual.com/view/Robot_Rage) (RR3 weapon slots, powerups, tactics; read through search summaries)
- [RobotRage history](https://robotrage.pro/?page=history) and [fan wiki](https://wiki.robotrage.pro/index.php/Robot_parts) (version timeline and parts)
- [Robot Rage cheats and tips](https://www.cheatbook.de/files/robotrage.htm) (classic weapon behavior; cheats ignored)
- [GameKB listing](https://www.gamekb.com/games/2053176-robot-rage) (fire pits, electric shockers, falling off the edge, cash and gold)
- [Robot Rage Wiki: Saw](https://wiki.robotrage.pro/index.php/Saw) and [Mini-Gun](https://wiki.robotrage.pro/index.php/Mini-Gun) (part stats and behaviour)
- [NHRL Wiki: Common Robot Types](https://wiki.nhrl.io/wiki/index.php/Common_Robot_Types) and [SparkFun: Combat Bot Weapon Types](https://news.sparkfun.com/2454) (combat robot weapon families)
- [Common Sense Media review](https://www.commonsensemedia.org/website-reviews/robot-rage) and [designer's portfolio](https://gamesbymanuel.com/portfolio/robot-rage/)
