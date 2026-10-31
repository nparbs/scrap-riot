# Scrap Riot

A 3D robot-tank arena brawler that runs in the browser. Bolt weapons onto a chassis, fight five rivals in a free-for-all pit, and spend the winnings on a nastier robot.

Scrap Riot is a fan-made homage to *Robot Rage*, the Miniclip web game. All code, art and sound here are original. The project is not affiliated with or endorsed by Miniclip and uses none of its assets.

![A match in progress](docs/match.png)

## Play

**[Play in your browser](https://nparbs.github.io/scrap-riot/)**. A keyboard and a WebGL-capable browser are required.

To run it locally:

```sh
npm install
npm run dev
```

| Key | Action |
| --- | --- |
| Arrow keys | Drive |
| X | Front weapon |
| C | Turret (aims itself, you choose when to fire) |
| V | Defense |
| 1 to 4 | Repair, Turbo, Overdrive, EMP |
| Ctrl (hold) | Look behind |
| M / Esc | Mute / Pause |

A match ends after 2:30 or when a robot reaches 12 kills. Damage, kills and scrap pickups earn money, and you get a bonus for your final placement. Progress is saved in the browser's local storage.

## What's in the game

- **3 chassis:** Whippet, Bruiser, Anvil
- **3 front weapons:** Chainsaw, Sledgehammer, Spike Ram
- **3 turrets:** Minigun, Rocket Pod, Arc Coil
- **3 defenses:** Energy Shield, Mine Layer, Oil Slick
- **4 powerups:** Repair Kit, Turbo, Overdrive, EMP Burst
- **3 upgrade tracks** of 5 levels each: armor, engine, weapons
- **AI rivals** that get tougher as you invest in upgrades
- **1 arena** with pillars, sliding floor saws, and repair pickups

See [ROADMAP.md](ROADMAP.md) for what's next.

![The garage](docs/garage.png)

## Development

```sh
npm test            # simulation and progression tests
npm run typecheck
npm run build       # production build in dist/
npm run balance     # plays 200 AI matches and reports pacing and win rates per item
```

### Layout

| Path | Purpose |
| --- | --- |
| `src/sim/` | The game itself: physics, combat, AI, balance data. No DOM or three.js. |
| `src/game/` | Save data, the shop, rival generation. |
| `src/render/` | three.js scenes and effects. Reads the sim, never writes to it. |
| `src/ui/` | HUD and menu screens (plain DOM). |
| `scripts/balance.ts` | Headless balance report. |

The sim runs at a fixed 60 Hz, uses only its own seeded random number generator, and takes the same input structure from the keyboard and the AI. A seed plus inputs therefore replays a match exactly, which is what online multiplayer will build on.

All balance numbers are in [`src/sim/data.ts`](src/sim/data.ts).

## License

[MIT](LICENSE). The license covers this project's own code and assets only; *Robot Rage* and Miniclip are trademarks of their respective owners.
