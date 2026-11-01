# Map design

Why the maps are the way they are, for anyone changing them. Layouts are in `ARENAS` in `src/sim/arena.ts`, and looks are in `src/render/arenaScene.ts` and `src/render/hazards.ts`.

## What was wrong

- **All seven maps were the same shape:** a square about 60 units across, so one fight felt much like another.
- **Holes were paint:** black circles on the floor, with no depth. The Canyon's "chasms" were overlapping circles.
- **Things overlapped:** hill zones over logos and shock coils, piston rods through walls, sentry rings into walls. Nothing checked for it.
- **Two maps were one idea:** The Skyscraper and Rooftop Rumble were both a city roof.
- **Every obstacle was the same pillar**, and walled maps had no danger at their edges at all.

## What the research said

- **Hazards should be tools.** In Robot Wars the pit, floor flipper and wall saw changed how people drove, because you could push the other robot into them. Strong robots still lost that way.
- **Reward goes where the risk is.** Classic arena shooters put the best pickups in dangerous spots.
- **Shape changes the fight.** Round arenas have no safe corner, and square ones have refuges.
- **One big landmark** tells you where you are at a glance.
- **Dangers should warn first.** This one is general design practice rather than something the searches backed up, and my searches found nothing good specifically on fair telegraphing, so treat it as a judgment call.

Sources: [Unreal Wiki on map flow](https://unrealarchive.org/wikis/unreal-wiki/Legacy:Map_Flow.html), [level design techniques](https://openlab.bmcc.cuny.edu/mmp-270-spring-2026/level-design-techniques/?pdf=2559), [Robot Wars arena](https://robotwars.fandom.com/wiki/Robot_Wars_Arena/Series_8-10), [BattleBots history at IEEE Spectrum](https://spectrum.ieee.org/inside-story-of-battlebots/particle-9), [Robot Wars arenas](https://grandavehousing.calpoly.edu/news/robot-wars-inside-the-arenas). These are practitioner and fan sources, so they're starting points rather than proof. Only playtesting can show what's actually fun.

## The rules each map follows

1. One big idea of its own, which the blurb can say in a sentence.
2. Its own outline or layout, not just a new coat of paint.
3. A landmark you can recognise from anywhere.
4. Repairs in the most dangerous spots, not the safest.
5. Every timed danger warns first, and lethal things glow the same red on every map.
6. The same from either end, except The Skyscraper, so no spawn is better by design.
7. Nothing on the floor touches anything else, which `tests/maps.test.ts` enforces.

## The maps

| Map | Shape | The big idea | Risk and reward |
| --- | --- | --- | --- |
| The Skyscraper | Square | The online duel map: open edges and cover. Changed the least, because it's the most played. | Repairs out by the drop |
| The Scrap Pit | Square, walled | A central pit opens every 15 seconds, and saws in the walls make being shoved against one a real danger. | A repair on the pit's doors, and the hill around them |
| The Rig (new) | Plus | A wrecking ball sweeps the middle on a line that slowly turns, and cargo hatches open in turn, showing the real sea below. | A repair dead centre in the ball's path, and more beyond the hatches |
| The Furnace | Square, walled | A lethal molten pool, and vents that take turns to erupt. | Repairs on the vents, and a hill that's a ring around the pool |
| Canyon Ledge | Square, cut in three | Real chasms make three lanes. Cross on a bridge, or hit a ramp and jump. | Repairs on the bridges |
| Piston Foundry | Square, walled | Belts carry you toward wall rams, and drop hammers pound the floor. | The hill and a repair under the hammers |
| Black Ice | Round | No corners and no grip, and thin ice gives way in turn, then freezes over. | Repairs on the thin ice |

## Ideas for later

- Bots use ramps on purpose. They only cross on bridges now.
- A sound for each warning. A klaxon before a trapdoor opens would help a lot, and none of the new hazards has its own sound yet.
- A held robot rising on the Lifting Forks, which needs `clawTarget` sent to clients.
- Online Brawl could vote on maps, once there are enough people.

## Numbers to check by hand

These are first guesses, tuned only against bots. `npm run balance` shows average robot life and share of deaths by falling on each map.

- `HAMMER_DAMAGE` 34 and `HAMMER_STUN` 0.7
- `BALL_DAMAGE` 16 and `BALL_FORCE` 30
- `GRINDER_DPS` 26
- `VENT_MULT` 3
- `TRAPDOOR_WARN` 2.5 seconds
