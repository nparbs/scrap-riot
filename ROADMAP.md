# Roadmap

Each milestone below has a matching GitHub milestone, and its open items are tracked as issues.

## How close is this to the original?

*Robot Rage* is no longer easy to play, and public documentation is thin. These facts come from public listings, a wiki summary and screenshots of *Robot Rage: Rearmed*:

- Robots fighting one on one, online against other users, on the roof of a skyscraper in a dark city
- A workshop of chassis, tower, wheels, engine, power source and weapons, limited by used space, with an armour setting and a front or back placement for weapons
- Tabs for the workshop, paintshop, buying and selling parts, with a preview, stats and highscores
- A match screen showing each pilot's name, armour, weapon and battery, with chat, surrender and offer draw
- Destroying other tanks earns money, which buys upgrades
- Weapons included a chainsaw and a sledgehammer, and the chainsaw could outreach the hammer

Scrap Riot's look and layout now follow those screenshots, rebuilt from scratch with its own name and logo. Everything else is an original design decision: robot names, the other weapons, all numbers. The default keys are also our choice: WASD to drive, Space for the main weapon, Q for the turret, R for defense, 1 to 6 for powerups, and E to look behind. Anything that contradicts how you remember the original is a bug worth filing, and footage of the original would help most. Scrap Riot will keep its own name, art and sound regardless.

## v0.1: Playable slice (done)

- [x] Deterministic fixed-step simulation with tests
- [x] Driving, ramming, collisions, walls, pillars, floor saws
- [x] Three each of chassis, front weapons, turrets and defenses
- [x] Four powerups and three upgrade tracks
- [x] AI rivals, free-for-all with respawns, scoring and payouts
- [x] Garage shop with saved progress
- [x] 3D view, HUD, minimap, particles, synthesized sound
- [x] Headless balance report

## v0.2: Make it feel right

The current tuning comes from AI-versus-AI data and has not had a human playtest. This milestone comes first because everything later depends on the core loop being fun.

- [ ] Human playtest pass on handling, camera and weapon feel
- [ ] Balance against human play, including the shop's money curve
- [x] Quality settings and a frame rate counter
- [ ] Measure frame rate on real hardware
- [x] First-match tutorial prompts
- [x] Hit feedback: damage direction, wreck debris
- [ ] Better weapon sounds
- [x] Rebindable keys
- [ ] Gamepad support: built, needs testing with a real controller
- [x] Publish a public build on GitHub Pages

## v0.3: More to fight with

- [x] Five new maps: rooftop, furnace, canyon, foundry, frozen lake
- [x] Every weapon found in the original games ([notes](docs/original-research.md))
- [x] Ammo for turrets
- [x] Paint shop: colors, patterns, toppers
- [x] Rear-mounted weapon option
- [x] Battle damage: scorched paint and armor plates falling off

## v0.4: Single-player career

- [x] Ladder of 12 fights with medals
- [x] New modes: last robot standing, king of the hill
- [x] Three boss robots
- [x] Achievements and match stats

## v0.5: Online multiplayer

The original was built around online play, so this was moved to the front of the queue. The netcode and server are built; they go live once a server is hosted (see [docs/hosting.md](docs/hosting.md)).

- [x] Netcode: server-authoritative snapshots at 20 Hz, client prediction for your own robot, interpolation for the rest
- [x] Authoritative WebSocket server running the shared sim
- [x] Quick-play matchmaking, with bots filling empty slots
- [x] Reconnects: a bot drives your robot until you return
- [x] Input validation, rate and connection limits, Docker packaging, hosting guide, privacy notes
- [ ] Host the server and test with real players over the internet
- [x] Accounts: Google sign-in or guest, with progress owned by the server
- [x] Match history, rating and leaderboard
- [ ] Moderation for player names

## v1.0: Release

- [ ] Touch controls for phones and tablets
- [ ] Music
- [ ] Accessibility: color-blind palette, reduced screen shake
- [ ] Trademark and name check before wide release
- [ ] Launch on the web and itch.io
