# Project handoff

Where Scrap Riot stands, for picking the work up in a new session. Last updated 1 November 2026. [ROADMAP.md](../ROADMAP.md) has the full plan, and [README.md](../README.md) describes the game.

## Shipping an update

1. Commit on a branch and open a PR. Wait for CI, then merge.
2. The page deploys itself on merge.
3. Update the server from the user's PC, which needs its home network: `ssh -i ~/.ssh/scrap-riot-deploy deb@<VM address>`. That key can only run `~/deploy-scrap-riot.sh` on the VM, which pulls `main` and rebuilds, so connecting always deploys. The address is in Claude's private memory on that PC rather than here, because this repo is public.

Update the page and server together whenever `PROTOCOL_VERSION` changes.

## Latest work (protocol 10)

- **No guns:** turrets, projectiles and the gun key are gone. The Flamethrower, Arc Coil (now Tesla Coil) and Spear Gun (now Pneumatic Spear) became main weapons. `retireGuns` in `src/game/progress.ts` upgrades old saves on load, refunding any other gun bought and handing over the weapon a converted one became. The refund reaches the database with the player's next garage action.
- **Balance:** `npm run balance` plays 8-robot matches in every big mode, plus a duel round robin. Bots-only numbers can't show how a weapon feels to a person. Bots are poor with the Magnet (27% of duels) and strong with the Ring Spinner (69%, mostly by outlasting), so check those by hand before moving them further.
- **Big matches:** assists pay `REWARD.assist`, splash shrinks with `CROWD_SPLASH` for each extra robot caught, chained stuns shorten under `STUN_GUARD`, repairs spawn faster with more robots, landing a hit ends spawn protection and cloaking, bots avoid piling on one target and lean toward the leader, and a shared hill splits its points.
- **Death:** `src/render/ragdoll.ts` tumbles a copy of the model for `RAGDOLL_TIME`, then blows it apart. `kill` events carry position and speed for this, and the sim no longer sends an explosion when a robot dies. The Hud then fades to black with a line from `src/game/lastWords.ts`. The user asked for Breaking Bad quotes there, but these are original lines, because this is a public game and the show's dialogue isn't ours to ship. The list is plain text and easy to change.
- **Duel face-off:** `src/ui/duelIntro.ts`, with its own small renderer so robots sit between the page's layers. A duel's countdown is `COUNTDOWN + DUEL_INTRO`, including online, so the face-off is timed by the match and a late joiner lands part way through. On an upright screen the robots stack, each by their own name, because the VS would cover them side by side.
- **Going over the edge:** the blast happens where the robot is, below the floor. `Particles.floorHalf` stops effects landing on air, and only those coming down from above land at all. The robot's own camera leans out past the edge (`leanPastEdge`), or the floor would hide the fall. The Skyscraper has lower rooftops right against its edge (`nightCityLedges`), and a robot lands on those and blows up there. Bystanders on the roof usually can't see the blast, only hear it, because the roof is in the way.
- **Input:** left and right click in `src/input.ts`, active only during a match. Touch controls are in `src/ui/touch.ts`, and appear when the main pointer is coarse or the browser describes itself as mobile. Their layout is `.hud-touch` in the stylesheet, and `html.touch` marks a touch device everywhere else. Screens leave out keyboard, mouse and gamepad text on touch devices by asking `isTouchDevice()`. Knocked out of Last Robot Standing, the thumb buttons become that map's traps (`updateTrapButtons` in the Hud).
- **Full screen:** `src/ui/fullscreen.ts`. A page can only ask during a tap, so every tap on a touch device asks again unless the Settings switch is off, and matches lock to landscape once full screen. Safari on an iPhone has no such call for a page, so it gets a hint to use Add to Home Screen, which works through `public/manifest.webmanifest` and the Apple tags in `index.html`.
- **Workshop:** a top bar, a section rail and cards with stat chips, in `workshopPanel` and `partChips` in `src/ui/screens.ts`. Bindings no longer have a gun, and old saved bindings for it are ignored.
- **Tool chest look:** the page's colours are tokens at the top of `src/style.css`: graphite and pegboard, cream lettering, and one orange for headings and whatever is selected. Health and battery colours are set in `src/ui/hud.ts`, because the game changes them as they run down.
- **Garage sounds:** `drill` and `chaChing` in `src/audio.ts`. Fitting a part drills, buying or selling rings the register, and buying a part that fits does both. Levels were measured, but nobody has listened to them yet, so the user's ear overrides the numbers.
- **Music button:** beside the settings gear. `musicMuted` in `src/game/settings.ts` silences the music and keeps the slider's level, and moving the slider turns it back on.
- **Map looks:** each map's sky, light colours and floor are in `LOOKS` in `src/render/arenaScene.ts`, and only base colours are in `src/sim/arena.ts`. Glow is soft additive layers from `GlowBatch` rather than a bloom pass, to stay cheap on weak graphics cards. Moving scenery goes in `animators`. Frame rate hasn't been measured on a real graphics card.
- **Chase camera:** stays inside walled maps, through `keepInsideWalls` in `src/render/matchView.ts`. Before this it could end up behind a wall.
- **Workshop layout:** the robot preview is always on screen, filling the right column, with Specs directly under it. The tabs below it only swap Specs, Highscore and Players. Big screens scale the whole page with CSS `zoom`, and narrow windows scroll as one column.
- **Music:** `PLAYLISTS` in `src/music.ts` holds the songs as data: tempo, bass notes, drum patterns, riff and chords. Each match starts the next song, and they rotate by themselves after `length` bars. Levels were measured, but nobody has listened to them yet, so the user's ear overrides the numbers.
- **Spectating:** in Last Robot Standing, someone knocked out gets an overhead camera and earns `SPECTATE.payPerSecond`, paid only if they stay to the end. The leave button unlocks after `leaveWait`: a quarter of how long they lasted, from 10 to 30 seconds. The pause menu can still quit at any time, which also pays nothing.
- **Defense placement:** a defense always goes on the side opposite the main weapon, which is the back by default. There's no setting of its own, so the two can't share a side: `defenseAngle` in `src/sim/match.ts` and the `gear` group in `buildRobot` both follow `rearMelee`. Steel Ram, Plow and everything dropped (`mounted` in `DEFENSES`) really work from that side, and the rest work all around. A Steel Ram only adds its 30% ram bonus on the nose, so only with the main weapon at the back. Bots never mount weapons at the back, so their Steel Rams and Plows now cover their backs too, and that includes the Old Ironjaw boss. None of this has been rebalanced.
- **Members:** only accounts that entered `MEMBER_CODE` appear on the Highscore and Players lists, through `joinMembers` in `server/accounts.ts` and `POST /api/member`, limited to 10 tries an hour per address. The code is only in the server's `.env`, never in the public page or repo. Players can enter it on the first name screen, where it's optional and a wrong one keeps them there with a message, or on the Stats page. Everyone else plays as normal, still earns stats and still shows by name inside matches. Existing accounts started as non-members, and joining puts a player's existing record on the board. Setup and removing someone are in [hosting.md](hosting.md).
- **Spectator traps:** driving keys steer a marker and weapon keys fire three traps, in `updateSpectator` and `updateTraps` in `src/sim/match.ts`. They arrive through the normal input messages, so they work online, though no online queue uses Last Robot Standing yet. Each map names them and picks the falling object in `TRAP_NAMES` in `src/sim/arena.ts`. Numbers are in `TRAP` in `src/sim/data.ts`. Trap damage and kills count for the spectator.
- **Quicker weapons:** cooldowns and wind-ups are down by about 40 to 55 percent, projectiles fly about 35 percent faster, and damage per hit is down a little to compensate. Big hits (`BIG_HIT` in `src/render/matchView.ts`) get extra sparks, a flash and a camera kick, and guns have recoil and muzzle flashes. The numbers are in `src/sim/data.ts`.
- **Weapon models:** every weapon in `src/render/robots.ts` is rebuilt from helpers such as `sawBlade`, `sideOn`, `turned` and `piston`. The chainsaw's teeth really run around its bar, using an `InstancedMesh`. Reach is about what it was, so models still match what they hit.
- **Online Brawl:** a second online queue, set by `BRAWL_ROOM_OPTIONS` in `server/room.ts`. It's a Free-for-All on a random map for 8 robots, needing at least 2 humans, with bots in the other seats. It starts 10 seconds after a second pilot joins, or 3 seconds after it fills. Leaving or staying disconnected removes the robot and ranks that pilot last, a last human fights on against the bots, and the match ends once every human has gone. The queue screen shows bots fighting on the chosen map, using the same demo match as the title screen.
- **Cheat codes:** on the Stats page. `money` gives $5,000 each time, and `unlock` owns every part, in `applyCheat` in `src/game/progress.ts`. With an account the server applies them, and money shows in the ledger as `garage: cheat`. They work for anyone, and the codes are readable in the public page and repo, so nothing bought online can be trusted as earned. Worth removing or limiting before sharing widely.
- **Armour makes room:** switching to a smaller chassis or tower lowers armour as far as needed to fit, in `withPart` in `src/game/progress.ts`. If even the minimum armour doesn't fit, the part still says No room.
- **Intro:** one second, with the logo slamming down, a flash, a shockwave ring and sparks. It's all CSS, timed around the moment of impact. Rating runs evenly from +25 for first to -15 for last.
- **Payouts:** anyone still in a match when it ends earns at least `REWARD.minimum` ($100), including losers and draws, however short the match. Anyone who surrendered gets no minimum, and anyone who left gets nothing. With an account, offline and career matches are now banked with a `payout` garage action, capped at `OFFLINE_PAYOUT_MAX`. They used to pay accounts nothing, and every player gets a guest account, so that's why payouts looked broken. The server takes the browser's word for the amount, and two accounts can farm a duel by surrendering. Neither matters while the `money` cheat exists, but both should be closed before wide sharing.
- **Countdown:** every match starts with 3, 2, 1, GO!, set by `COUNTDOWN`. Nothing moves and the clock doesn't run until it ends. The title screen and queue background matches skip it.
- **Sound levels matched:** every weapon sound was rendered and measured with A-weighting, then given a level in `MELEE_LEVEL` and `GUN_LEVEL` in `src/audio.ts`. The spinner whine dropped from 45 dB to 24 dB. Weapon families now sit within about 4–5 dB.
- **Audio settings:** Master, Music and Sound Effects sliders plus Mute, saved per browser.
- **Queue count:** "N in queue" on the Play Online button, refreshed every 15 seconds.
- **Players tab:** beside Highscore, showing who is in the queue or a match and who was recently active. It comes from `GET /api/online`, which returns only names and last-seen times, for the past 7 days. Guests still named "Pilot" are left out.
- **Flash Bomb weakened:** 1.2 seconds instead of 2.5, radius 8 instead of 11, cooldown 14 seconds instead of 10. It can no longer fully white out the screen.
- **Starting money:** $1,000 instead of $250. Existing accounts keep what they have.
- **Laser sound fixed:** it was using the arc coil's sound.
- **Turning:** robots turn only while rolling. The rate scales with rolling speed, reaching full at `TURN_FULL_SPEED` (4 units/s) in `src/sim/match.ts`. Reversing steers like a car, so the turn direction flips. This is the user's request, but the reverse direction was our call.
- **Clear decks:** toppers are gone, along with rails, bolts, fins, roll hoops, exhausts and all deck-mounted defense gear. Only the tower and gun sit on top. Defenses at the ends or sides (Steel Ram, Plow, Side Blades, Cutter) still have models, so opponents can no longer see the others by looking.
- **Body shapes:** Wedge, Slab and Turtle, chosen in the Paintshop. They live in `Paint`, which the rules never read, and a test checks that fights play out identically. The five chassis keep their different hitboxes, because size is balanced against their stats.
- **Smooth shading:** materials are no longer flat-shaded, and hulls use creased normals, like Blender's smooth by angle. Canyon rock and snow stay faceted on purpose.
- **Self-righting:** a Flipper hit sets `flipT`, which stuns the target through the throw plus `FLIP_TIME` (2.5 seconds on the ground). 3 seconds on the ground made the Flipper win 84% of bot duels. Vertical spinners, drums and eggbeaters still throw robots without flipping them.
- **Settings button:** a gear in the top right corner, on every screen after the name prompt. It pauses offline matches, while online matches carry on underneath. Keys rebound during a match work at once, but the HUD shows the old key names until the next match.
- **Workshop and Buy Parts merged:** Workshop has a tab for each part type plus Powerups and Upgrades, showing the part fitted now, and cards for everything in that type. Clicking a card previews it on the robot and in the numbers, and only the card's Fit or Buy button changes anything, in `partCards` in `src/ui/screens.ts`. Powerups and Upgrades have nothing to preview, so clicking those buys straight away, as it did before.
- **Renames:** the Garage page is now Stats, so the robot's numbers in the side panel became Specs.

## Earlier work

Shipped before the latest work, and still true unless it says otherwise above.

- **1v1 online:** Online Duel is always a Duel on The Skyscraper with no bots. A match starts only once a second player joins.
- **Ways to play:** Online Duel, Online Brawl, Offline vs Bots (choice of map and mode, plus Career) and Training (a practice dummy, no payout).
- **Workshop:** in the style of the original, with Chassis, Tower, Wheels, Engine, Power Source and an Armour dial, limited by Used Space.
- **Paintshop:** paint on an unfolded robot with drawing tools and a 120-colour palette. Opponents see it. Paint jobs are in `src/game/skin.ts`.
- **Melee only:** 23 main weapons, including spinners that store energy, a flipper, a crusher and forks.
- **Battery:** runs the Shift boost and powered weapons.
- **Look and sound:** BattleBots-style robots, a redrawn logo, synthesized sound and music, a short intro, and a name prompt on first visit.
- **Netcode:** fixed the online stutter with an input queue on the server and blended prediction on the client.
- **Graphics:** Auto quality steps down on slower machines.

### Controls

WASD to drive, Space or left click main weapon, R or right click defense, Shift boost, E look behind, 1–6 powerups, M mute, Esc menu. Players can rebind them in Settings, except that Ctrl can't be bound, because Ctrl+W closes the tab.

## What the user wants next

They were about to test by hand, and their feedback should drive what comes next. Open items, roughly by priority:

1. **Human playtest:** nobody has played the new weapons by hand against another person. Balance has only been tuned against bots.
2. **Sound by ear:** levels were measured but never listened to by the person building them, so the user's opinion overrides the numbers.
3. **Google sign-in:** the name prompt is a stopgap until this exists. `GOOGLE_CLIENT_ID` isn't set on the server.
4. **Name and paint moderation:** there is no filter on names and no report button for paint jobs. This is needed before sharing widely. The original had a Report Abuse button.
5. **Custom domain:** `scrapriot.parbs.online` was discussed but not set up. DNS, GitHub Pages and the server's `ALLOWED_ORIGINS` would all need changing.
6. **Database backups:** the nightly backup in [hosting.md](hosting.md) was never set up on the VM.
7. **Roadmap items:** modular robots with two main weapons, weight as a stat.

### Known weak spots

- **Weapon balance:** the turning change reshuffled bot-only duels, so the numbers need a fresh look. Axe (about 76%) and Ring Spinner (about 71%) lead, Flipper is about 65%, and Magnet and Lifting Forks still trail at about 15%. Run `npm run balance -- 42 6` for current numbers.
- **Bot driving:** bots can't turn on the spot either, so `mindTheEdge` in `src/sim/ai.ts` slows them for turns near a ledge and backs them away. Without it, about 70% of bot duels ended in a fall. It's now about 10%, except for the Flipper at about 60%, where falls are the point. Maps with pits rely on the older steering away from hazards, and weren't measured separately.
- **Mini-Robot:** it still hunts on its own. The user asked for no gun tracking, and this is a drone, so it was left alone and flagged to them. They have not said either way.
- **Windows Sticky Keys:** tapping Shift five times can bring up the prompt.
- **Frame rate:** the Skyscraper was measured only in a software renderer, never on a weak real GPU. A friend of the user had low frame rates before Auto quality was added, and the result on their PC is unconfirmed.
- **Promo video:** it shows the old game and needs re-rendering. Its files are in `C:\Users\N P\Projects\scrap-riot-promo\`.
- **Open PRs #26–28:** these are old and can be closed.

## Things worth knowing

### Hosting

| Piece | Where |
| --- | --- |
| Page | https://nparbs.github.io/scrap-riot/, GitHub Pages, deployed on push to `main` |
| Server | `wss://game.parbs.online`, on the user's Debian VM on Proxmox, in `~/scrap-riot`, as user `deb` |
| Tunnel | Cloudflare, routing `game.parbs.online` to `http://server:8787` |
| Build setting | Repo variable `GAME_SERVER_URL` |

- **Reaching the VM:** deploys go over the restricted SSH key above, which can do nothing else. For anything more, a Claude session called `deb-soft-haven` runs on the VM. It lacked Docker access last time, because it started before `deb` joined the `docker` group.
- **Use `sg docker` on the VM, not `sudo`:** root's Docker context points at an old Docker Desktop socket, and `sudo git pull` can leave root-owned files in the repo.
- **Passwords:** the database password is in `.env`, which is gitignored. Never put it in commits, docs or chat.

### Working agreements

- Commit or push only when the user asks, and branch first.
- The user wants to be told plainly what's verified and what isn't.
- Merging from a session may be blocked as "Merge Without Review". If it is, the user clicks merge. Don't route around it or ask another session to do it.
- Saves don't need migrating, because the game is in early development. Bump the storage key instead (`SAVE_KEY`, `SETTINGS_KEY`).
- Change `PROTOCOL_VERSION` when the page and server can no longer talk to each other, and say so, as both must then update.

### Running and testing

```sh
npm run dev          # the game, on the port Vite prints
npm run server:dev   # local server with a temporary database
npm test
npm run balance -- 42 6
```

For a second local player, use a private window. Two normal tabs share an account and get rejected.

`smoke/full.mjs` in this session's scratchpad covers the settings button, renames, part previews, body shapes and flips. It's at `C:\Users\NPFFCD~1\AppData\Local\Temp\claude\c--Users-N-P-Projects\7dd40e2a-93f9-4282-8e5e-ed62253bce2b\scratchpad\smoke\`, and expects Vite on port 5208.

Older browser test scripts are **not in the repo** either. They use `playwright-core` with headless Edge and a software renderer, and they are in a temporary folder that may not last:
`C:\Users\NPFFCD~1\AppData\Local\Temp\claude\c--Users-N-P-Projects\539cd780-c477-41da-bf3d-55afad7e860c\scratchpad\smoke\`

The useful ones are `final.mjs` (first-run flow and settings), `duel.mjs` (two-player match), `paint.mjs`, `robots.mjs` (contact sheets of every robot) and `loudness.mjs` (ranks sounds by A-weighted level). They expect Vite on port 5199. If they matter long-term, move them into the repo. In `final.mjs`, the "the buttons are right" check needs updating, because the Play Online button now includes the queue count.

### Where things are

| Area | Files |
| --- | --- |
| Balance and parts | `src/sim/data.ts` |
| Rules (no DOM or three.js) | `src/sim/match.ts`, `src/sim/ai.ts`, `src/sim/arena.ts` |
| Netcode | `server/room.ts`, `src/net/client.ts`, `src/net/protocol.ts`, `src/net/snapshot.ts` |
| Accounts and API | `server/accounts.ts`, `server/api.ts` |
| Robots and maps | `src/render/robots.ts`, `src/render/arenaScene.ts` |
| Screens and HUD | `src/ui/screens.ts`, `src/ui/hud.ts`, `src/ui/painter.ts` |
| Sound | `src/audio.ts`, `src/music.ts` |
| Logo | `src/render/logo.ts` |

The research behind the weapons is in [original-research.md](original-research.md). The privacy notes are in [privacy.md](privacy.md).
