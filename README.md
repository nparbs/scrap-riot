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
| 1 to 6 | Rage, Mega Shield, Cloaking, X-Ray, Repair, Turbo |
| Ctrl (hold) | Look behind |
| M / Esc | Mute / Pause |

These are the default keys. You can rebind them in Settings, which also lists the gamepad layout.

A match ends after 2:30 or when a robot reaches 12 kills. Damage, kills and scrap pickups earn money, and you get a bonus for your final placement. Progress is saved in the browser's local storage.

## Online play

Choose **Fight online** in the garage to join a match of up to six players, with bots filling empty slots. Everyone fights with equal stats and one of each powerup, and only your choice of gear carries over from the garage. If your connection drops, a bot drives your robot until you reconnect.

The server is authoritative: it runs the same simulation as the game, and clients send only their controls. To run your own server, see [docs/hosting.md](docs/hosting.md). For local development, run `npm run server` alongside `npm run dev`.

## What's in the game

- **5 chassis**, from the quick Whippet to the Anvil
- **37 weapons:** 9 front weapons, 11 turrets and 17 defenses, drawn from every version of the original ([research notes](docs/original-research.md))
- **6 powerups:** Rage, Mega Shield, Cloaking, X-Ray, Repair Kit, Turbo
- **3 upgrade tracks** of 5 levels each: armor, engine, weapons
- **6 maps:** walled pits, a rooftop and a canyon with lethal drops, a furnace, a piston foundry, and a frozen lake
- **3 modes:** Free-for-All, Last Robot Standing, King of the Hill
- **Paint shop:** colors, patterns and toppers, all visible to other players
- **AI rivals** that get tougher as you invest in upgrades

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
| `src/net/` | Protocol and snapshot format shared with the server, plus the browser's network client. |
| `server/` | Authoritative game server: rooms, matchmaking, validation. |
| `scripts/balance.ts` | Headless balance report. |

The sim runs at a fixed 60 Hz, uses only its own seeded random number generator, and takes the same input structure from the keyboard and the AI. A seed plus inputs therefore replays a match exactly, which is what online multiplayer will build on.

All balance numbers are in [`src/sim/data.ts`](src/sim/data.ts).

## License

[MIT](LICENSE). The license covers this project's own code and assets only; *Robot Rage* and Miniclip are trademarks of their respective owners.
