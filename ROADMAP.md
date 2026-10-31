# Roadmap

Each milestone below has a matching GitHub milestone, and its open items are tracked as issues.

## How close is this to the original?

*Robot Rage* is no longer easy to play, and public documentation is thin. These facts come from public listings and a wiki summary:

- Robot tanks fighting in a free-for-all arena, played online against other users
- Drive with the arrow keys, X for melee, C for turret, V for defense, 1 to 4 for powerups, Ctrl for rear view
- Destroying other tanks earns money, which buys upgrades
- Weapons included a chainsaw and a sledgehammer, and the chainsaw could outreach the hammer

Everything else is an original design decision: robot names, the other weapons, the arena layout, all numbers. Anything that contradicts how you remember the original is a bug worth filing, and footage of the original would help most. Scrap Riot will keep its own name, art and sound regardless.

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
- [ ] Measure frame rate on real hardware and add quality settings
- [ ] First-match tutorial prompts
- [ ] Hit feedback: damage direction, wreck debris, better weapon sounds
- [ ] Rebindable keys and gamepad support
- [x] Publish a public build on GitHub Pages

## v0.3: More to fight with

- [ ] Two more arenas with distinct hazards
- [ ] Rear-mounted weapon option
- [ ] Two to three new weapons per slot
- [ ] Paint and decal customization
- [ ] Per-part damage visuals

## v0.4: Single-player career

- [ ] Ladder of named rivals with escalating builds
- [ ] New modes: last robot standing, king of the hill
- [ ] Boss robots
- [ ] Achievements and match stats

## v0.5: Online multiplayer

The original was built around online play, so this is what most defines a faithful remake. It is also the largest and riskiest item here, because it adds a server to run and pay for.

- [ ] Choose a netcode model and prove it with a two-player prototype (the sim is already deterministic and server-ready)
- [ ] Authoritative WebSocket server running the shared sim
- [ ] Quick-play matchmaking, with bots filling empty slots
- [ ] Server-side accounts and progress, since browser saves can be edited
- [ ] Anti-cheat validation, reconnects, hosting and cost plan

## v1.0: Release

- [ ] Touch controls for phones and tablets
- [ ] Music
- [ ] Accessibility: color-blind palette, reduced screen shake
- [ ] Trademark and name check before wide release
- [ ] Launch on the web and itch.io
