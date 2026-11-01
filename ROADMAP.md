# Roadmap

For where the work stands right now, see [the handoff notes](docs/HANDOFF.md).

Each milestone below has a matching GitHub milestone, and its open items are tracked as issues.

## How close is this to the original?

*Robot Rage* is no longer easy to play, and public documentation is thin. These facts come from public listings, a wiki summary and screenshots of *Robot Rage: Rearmed*:

- Robots fighting one on one, online against other users, on the roof of a skyscraper in a dark city
- A workshop of chassis, tower, wheels, engine, power source and weapons, limited by used space, with an armour setting and a front or back placement for weapons
- Tabs for the workshop, paintshop, buying and selling parts, with a preview, stats and highscores
- A paintshop for drawing directly on the unfolded robot, with drawing tools and a colour grid
- A match screen showing each pilot's name, armour, weapon and battery, with chat, surrender and offer draw
- Destroying other tanks earns money, which buys upgrades
- Weapons included a chainsaw and a sledgehammer, and the chainsaw could outreach the hammer

Scrap Riot's look and layout now follow those screenshots, rebuilt from scratch with its own name and logo. Everything else is an original design decision: robot names, the other weapons, all numbers. The default keys are also our choice: WASD to drive, Space for the main weapon, R for defense, 1 to 3 for powerups, and E to look behind. Anything that contradicts how you remember the original is a bug worth filing, and footage of the original would help most. Scrap Riot will keep its own name, art and sound regardless.

## v0.9: Melee first, BattleBots style

Player feedback from playing against the original's look. Melee is the main event. Guns started as a limited extra here, and were later removed.

- [x] Guns fixed to the hull: no tracking, no homing, they fire where the robot points
- [x] Guns limited to a few shots per life, with a battery cost per shot
- [x] Shift for a speed boost, paid for from the battery
- [x] Stronger melee across the board, so no gun can wreck a robot in one life
- [x] New weapon families from real combat robots: vertical disc and bar, horizontal bar, undercutter, drum, eggbeater, ring spinner, hammer saw, flipper, crusher and lifting forks
- [x] Spinners that store energy: spin up, hit, and get thrown back
- [x] Thrown robots that can't steer in the air, and fall when they come down
- [x] Towers that add armour and room, as they did in the original
- [x] Robots rebuilt as low armoured wedges with exposed wheels
- [x] A redrawn logo, used for the website icon, the screens and the maps
- [x] A square preview that frames the whole robot and its weapon
- [ ] Human playtest of the new weapons: damage, spin-up times and how far hits throw
- [x] Weapon sounds for each family, including spinners winding up
- [x] Synthesized music for the menus and for battle
- [x] Cooldowns on strong weapons, and a 10-round burst for the chaingun
- [x] A one-second animated intro, and asking for a name when the game first opens
- [x] A paintshop for drawing on the unfolded robot, shown to opponents
- [x] 1v1 online with no bots, plus separate Offline vs Bots and Training
- [x] Loudness-matched weapon sounds, with volume settings for master, music and effects
- [x] A weaker Flash Bomb, and $1,000 to start with
- [x] Players waiting in the queue shown on the Play Online button, and a list of recent players
- [x] Robots only turn while rolling, and steer like a car in reverse
- [x] Clear decks: toppers and clutter gone, leaving only the tower and what's mounted on it on top
- [x] Three body shapes, for looks only: Wedge, Slab and Turtle
- [x] Smooth shading on robots and maps, with hard edges kept where they belong
- [x] A settings button in the corner, usable at any time, including during a match
- [x] Preview any part in the workshop before you can afford it
- [x] The Garage page renamed Stats, and the robot's numbers renamed Specs
- [x] Online Brawl: a Free-for-All on a random map for up to 8 robots, with bots in any empty seats
- [x] The queue screen shows the map you'll fight on
- [x] Cheat codes on the Stats page
- [x] A smaller chassis or tower gives up armour to make room
- [x] Every finished match pays at least $100, including offline and career, however short
- [x] A 3, 2, 1 countdown before every match
- [x] Quicker, more arcade-style weapons, with bigger hits, recoil and muzzle flashes
- [x] Every weapon remodelled with realistic shapes
- [x] Spectating after being knocked out, with money for staying and a leave timer that scales with how long you lasted
- [x] Traps spectators can control, themed for each map
- [x] Someone knocked out of a match still running can leave after 10 seconds, giving up the payout
- [ ] Replace the name prompt with Google sign-in, and add a name filter
- [ ] A report button or a way to hide other players' paint jobs
- [ ] Sparks and visible damage from spinner hits
- [ ] Modular robots: two main weapons at once, front and back, as in the original's weapon slots
- [x] Self-righting: a Flipper lands robots upside down, and they right themselves about 3 seconds later
- [ ] Weight as a stat, as the original's parts had
- [x] Guns removed altogether, with the Flamethrower, Tesla Coil and Pneumatic Spear kept as main weapons
- [x] Gun-style weapons mounted on the tower, and a Flamethrower barrel that can't be seen through
- [x] A choice of three powerups for each match, with the rest left in the garage
- [x] A model on the robot for every defense
- [x] Spinners turned well down, because they were loud and harsh
- [x] A robot voice saying "Winner" and "Scrapped"
- [x] A duel face-off before the countdown
- [x] Robots tumble and blow up where they actually are, including below the edge
- [x] The Fight Bots start button always on screen, at the bottom of the panel
- [x] Claw, crusher, forks and every other weapon animated, in the match and in the workshop preview
- [x] Tank tracks with links that really run around their wheels
- [x] Pictures of each map and career fight on their cards
- [x] Real holes in the floor, with depth, instead of black circles painted on it
- [x] A shape, landmark and signature hazard of its own for each map
- [x] The Rig replaces Rooftop Rumble, which was a second city roof
- [x] A count of who's online beside the balance, and a picture on every weapon and defense card

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
- [x] Paint shop: colors, patterns, body shapes
- [x] Rear-mounted weapon option
- [x] Battle damage: scorched paint and armor plates falling off

## v0.4: Single-player career

- [x] Ladder of 12 fights with medals
- [x] New modes: last robot standing, king of the hill
- [x] Three boss robots
- [x] Achievements and match stats

## v0.5: Online multiplayer

The original was built around online play, so this was moved to the front of the queue. The netcode and server are built and hosted (see [docs/hosting.md](docs/hosting.md)).

- [x] Netcode: server-authoritative snapshots at 20 Hz, client prediction for your own robot, interpolation for the rest
- [x] Authoritative WebSocket server running the shared sim
- [x] Quick-play matchmaking, with bots filling empty slots
- [x] Reconnects: a bot drives your robot until you return
- [x] Input validation, rate and connection limits, Docker packaging, hosting guide, privacy notes
- [x] Host the server
- [ ] Test with real players over the internet
- [x] Accounts: Google sign-in or guest, with progress owned by the server
- [x] Match history, rating and leaderboard
- [ ] Moderation for player names

## v1.0: Release

- [ ] Touch controls for phones and tablets: built, needs testing on a real phone
- [ ] Full screen and landscape lock on phones, and Add to Home Screen on iPhone: built, needs testing on a real phone
- [ ] Online counts on phones, and joining a waiting match from a bot fight: built, needs testing against a real queue
- [x] Screens checked on phone sizes down to the 720p minimum (640x360), apart from the item below
- [ ] Paintshop layout at the 720p minimum, with tools and colours big enough for thumbs
- [x] Music, with four battle songs and three menu songs in rotation
- [ ] Accessibility: color-blind palette, reduced screen shake
- [ ] Trademark and name check before wide release
- [ ] Launch on the web and itch.io
