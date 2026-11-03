# Project handoff

Where Scrap Riot stands, for picking the work up in a new session. Last updated 2 November 2026. [ROADMAP.md](../ROADMAP.md) has the full plan, and [README.md](../README.md) describes the game.

## Shipping an update

1. Commit on a branch and open a PR. Wait for CI, then merge.
2. The page deploys itself on merge, so merging goes live for players without any further step.
3. Update the server from the user's PC, which needs its home network: `ssh -i ~/.ssh/scrap-riot-deploy deb@<VM address>`. That key can only run `~/deploy-scrap-riot.sh` on the VM, which pulls `main` and rebuilds, so connecting always deploys. The address is in Claude's private memory on that PC rather than here, because this repo is public.

Update the page and server together whenever `PROTOCOL_VERSION` changes.

If `git pull --ff-only origin main` fails with "Cannot fast-forward to multiple branches", `git fetch origin` then `git merge --ff-only origin/main` works. The cause wasn't looked into.

## Current state

- **Live:** everything through PR #53 is merged and on the page, with the server on protocol 15. A two-browser duel ran on the live page and server on 2 November, from joining the queue through surrender to the results, with no page errors.
- **Tests:** see `npm test`, which includes the map layout checks.
- **Not verified yet:** nobody has played the points, weight, armor or battery rules by hand, and no online match has run on them against the real server. The new maps, animations, tracks and window fixes have also only run in a headless browser. Hazard timings and damage are first guesses, tuned against bots only. An account already showing `null/3` hasn't been checked on the real database, only in tests. Nothing since the phone work has run on a real phone. That includes the thumb buttons, the face-off when a phone really rotates or goes full screen, the landscape lock and Add to Home Screen. The join banner and phone counts have only run against a mocked server, not a real queue.

## Latest work (protocol 15)

- **Phone paintshop:** the rules are at the end of `src/style.css`. On a phone the board and tools share the panel, and the colors open as a full-screen sheet from `.paint-color-open` (`palette-open` on the bar). The sheet can't cover the settings and music buttons by z-index, because `#ui` is a fixed stacking context and they sit outside it, so `:has` hides them while it's open.
- **Name filter:** `isNameAllowed` in `src/game/nameFilter.ts`, called from `sanitizeName`, so the server enforces it on every name. Names already stored are masked as they're read (`toSave`, `leaderboard`, `recentPlayers`) and the table isn't changed. It's a small word list that errs toward letting names through.
- **Hidden paint:** `settings.hidePaint` leaves `skin` off other robots with `withoutSkin`, in `MatchView.addBot` and the duel face-off. Patterns and colors come from fixed lists, so only drawings need hiding. There's still no report button.
- **Sparks and scars:** `cutterHit` in `src/render/matchView.ts` runs on hits from a spinner or `CUTTERS`. `hit` events don't say which weapon landed, so a mine from a robot with a spinner also sparks. Scars are drawn into the hull's picture by `scarHull` so they follow every body shape, up to `MAX_SCARS`, and a `spawn` event clears them.
- **Accessibility:** `settings.reduceShake` keeps `REDUCED_SHAKE` of the shake, and starts on if the system asks for reduced motion. `settings.colorblind` swaps `STANDARD_PALETTE` for `COLORBLIND_PALETTE` in `src/game/palette.ts`, for health, armor and pickups. Colors players pick for their robots don't change.
- **Chassis models:** each chassis has its own proportions in `HULLS`, on a shared frame in `buildHull` in `src/render/robots.ts`: a tub, side rails, a suspension for each wheel (`addSuspension`), fenders (`addFender`), a class-specific nose (`buildNose`) and a tail bumper. The frame is merged by `bake` into one mesh per material, so hundreds of brackets cost a few draw calls. The painted shell and body shapes work as before, on top of it. `buildTower` draws a different tower for each class, and they stop short of where a gun bolts on. `buildWeaponMount` stands every nose weapon on a fixed pedestal, while the weapon itself moves. `WEAPON_DROP` lifts big spinners clear of the floor. Run `scripts/make-previews.mjs` after changing any of this.
- **Secondary weapons:** what the screens and docs call a secondary weapon is still `defense` in the code, saves, settings and network messages, and `DEFENSES` holds them. Side Blades, Cutter and the Nail Spreader are gone, with refunds in `retireParts`.
- **Spike Strip:** `spikes` in `DEFENSES`, with the rule in `rollOverSpikes` in `src/sim/match.ts`. Patches now have an `angle`, sent in snapshots. `Bot.poppedT` stops driving through the same path as a stun, but not weapons. The numbers are in [balance.md](balance.md).
- **Bumpers:** `buildNose` in `src/render/robots.ts` draws a plain bumper or plow, with no spikes, on purpose, because the main weapon is the star. `model.nose` is baked apart from the frame so it can be checked. `lowestOverNose` lifts each weapon clear of the bumper as it's built, turning spinners to check every angle. A bumper comes off any end with something at it (`GEAR_AT_THE_END`), and a tower with a gun has no hatch. `tests/robots.test.ts` checks every weapon on every chassis, by its vertices.
- **Passives and small fixes:** `isMovingTarget` in `src/sim/match.ts` gives the Whippet 25% less damage at speed, and the HUD says MOVING TARGET. The Lancer's bonus has `reach`, which goes through every `def.range` in `updateMelee` and through the bots, and drives the spear's point out further. `restart` on a power source shortens a flat battery's cut-out, and `missReload` on the Flipper shortens the reload after a miss. The Spear's arc went from 0.3 to 0.4, and 4 Large Wheels gained 4% speed.
- **Armor rebuilding:** the Armor Regenerator is gone, with a refund. A Whippet has `armourRegen` in `CLASSES` instead: 8 armor a second once `ARMOUR_REGEN_DELAY` (5 seconds) has passed since it hurt something or was hurt (`Bot.lastFightT`). It never mends health. `Bot.rebuilding` is sent in snapshots for the HUD and particles.
- **Classes:** `CLASSES` in `src/sim/data.ts`, with the table in [balance.md](balance.md). `classBonus` is worked out once per robot into `Bot.bonus`, and the HUD and bots read reload times through it. Rivals fit the right chassis 70% of the time when they could have bought it.
- **Comic look:** a Settings switch, off by default, for black ink outlines, flat shading and hatching in deep shadow. `src/render/comicPass.ts` draws it over the finished picture using the depth the scene already wrote, so materials know nothing about it and it's only a look. Everything in the main window goes through `draw` in `src/main.ts`, and `DuelIntro` has a pass of its own. It sets three's `isXRRenderTarget` so materials blend as they do on the canvas, because blending in linear colour made skylights hide the robots under them. Check that when upgrading three. It has only run on a desktop graphics card and in a software renderer, never on a phone, and hatching hasn't been judged by a person in motion.
- **Trained bots:** `src/sim/ai.ts` now flanks, backs off facing the target, leads its swings and shoves robots near a drop, by the numbers in `src/sim/tactics.ts`. `scripts/train-bots.ts` evolves those numbers into `src/sim/trained.ts`, and `trainedShare` scales how much of them a bot of a given skill uses. How it's done and what it achieved are in [balance.md](balance.md). Trained bots win duels but do no better in brawls.
- **Points and weight:** rules, how to test and current results are in [balance.md](balance.md). `POINT_BUDGET`, `pointsUsed`, `payloadUsed`, `buildProblem` and `buildStats` in `src/sim/data.ts` are the core. A chassis has no speed stat any more, because speed comes from engine power against total weight. `Bot.chassis` still has `speed`, `accel` and `mass`, worked out when the robot is created.
- **Armor:** `Bot.armour` is a separate bar, sent in snapshots. `Match.damage` takes a `pierce` share. The HUD shows it as a thin strip across the top of the health bar, and over each robot's head. Plates fall off the model as armor goes.
- **Battery:** `batteryCost` in `src/sim/data.ts`, spent through `Match.spend`. `battery` and `drain` on weapons are gone. Running out sets `batteryFlat`, sent in snapshots, which cuts out the weapon and boost until it recharges to `BATTERY_RESTART`. The HUD shows BATTERY FLAT, and bots back away meanwhile.
- **Towers:** no longer a part. `TOWER_LOOK` in `src/render/robots.ts` sets each chassis's tower size and plating. The Flamethrower and Spear still mount on it, and the Tesla Coil now points forward from the nose.
- **Old saves:** `retireParts` in `src/game/progress.ts` refunds towers and the removed weapons, and `fitToLimits` cuts a robot down to the limits on load. As with guns, a refund reaches the database with the player's next garage action.
- **Rivals:** `fillBuild` finishes a robot for bots, and `rivalPoints` limits how many points they get by level, so early rivals are near a starter robot. Bosses get no armor, repair kit or battery pack, because their toughness is in `hpMult`, which was lowered to suit.
- **Online:** `onlineLoadout` holds a browser's request to the limits. Accounts are held to them by the garage actions and on load.
- **Upgrades:** Career only, through `withoutUpgrades` in `src/sim/data.ts`, called from `server/room.ts` and from `startMatch` and `startTraining` in `src/main.ts`. The workshop page is called Career Upgrades and says so. Only `Match` setups drop them, so the save keeps them. Rivals outside Career get tougher with wins (`WINS_PER_RIVAL_LEVEL`) and have no upgrades, and online bots use `ONLINE_BOTS`.
- **Spinners:** they now hold back until 45% speed (`SPINNER_MIN_SPEED`). At 20% they fired feeble hits as soon as they touched anything.

## Earlier work (protocol 12)

- **Maps redone:** the brief, and what the research said, are in [map-design.md](map-design.md). `ARENAS` in `src/sim/arena.ts` holds each layout, and `tests/maps.test.ts` fails if anything on a floor overlaps anything else, which is what caused the old glitches, so a new map gets that check for free. Everything new is timed by `match.time`, so it needs no extra snapshot data.
- **Real holes:** `floorGeometry` in `src/render/hazards.ts` cuts them out of one sheet of floor, with walls going down and a hot line and glow at the rim. Canyon and Black Ice build only the sides of what's under the floor, because a solid box would plug the holes. Trapdoor leaves sit just below the floor and slide under it, so the floor hides them, and nothing there may use `polygonOffset` or it draws on top.
- **New hazards:** trapdoors (`trapdoorAmount`), chasms and `crossings`, launch ramps, conveyors, drop hammers, wrecking balls, wall grinders and erupting vents, all in `src/sim/arena.ts`, with their looks in `src/render/hazards.ts`. Bots avoid them all, and route over bridges with `crossingToward`, but they never use a ramp on purpose.
- **Shapes:** `shape` on a map is square, round or plus. Ask `onDeck` or `solidGround` rather than comparing with `half`.
- **Rooftop Rumble is gone:** The Rig replaced it, and `tidyPowerups` moves a save that remembers it back to The Skyscraper. Old match history still shows the id `rooftop`, because `ARENAS[h.arena]?.name ?? h.arena` falls back to that.
- **Online count:** `.bar-online` beside the balance, which opens the `players` tab. It counts by account: anyone in a queue or match, plus anyone who has touched the controls in the last minute, anywhere in the game. `noteInput` in `src/main.ts` watches for input, and `pollOnline`, which runs every 5 seconds, also sends `POST /api/presence` every 30 seconds (`PRESENCE_MS`) while it's recent. The server remembers that for `ACTIVE_FOR_MS` (45 seconds), in memory only. So someone drops off within about 2 minutes of stopping.
- **Weapon pictures:** `.card-thumb` on melee and defense cards, from `scripts/make-previews.mjs`.
- **Window shapes:** narrow windows (860 wide or less) scroll as one column, and the music and settings buttons are fixed to the window, so content used to slide under them. `.ws-bar` is now sticky there, and the buttons are placed inside the bar by the `--ws-*` variables at the end of the stylesheet, including when `zoom` scales the page. A tall window with a mouse also stacks the match dock in two rows, in the `@media (max-width: 1100px)` rules near the end, because two cards side by side squeezed the slots until keys ran into counts.
- **Battery Pack null/3:** this powerup was once called `turbo`, so older accounts had no `battery` count. Buying or using one made it `NaN`, which saves as null. `tidyPowerups` in `src/game/progress.ts` gives every powerup a real count on every load. Anyone already affected shows 0, and any Battery Packs they paid for in that state aren't refunded.
- **Till:** the balance is a box of its own (`.garage-money`), rolling to its new value and flashing when it changes (`rollMoney`). The match's earnings use the same look.
- **Tank tracks:** `addTrack` in `src/render/robots.ts`. Links are an `InstancedMesh` that really runs around a sprocket, idler and road wheels, driven by `model.tread`. Tyres got tread blocks and a bolted rim, the nose scoop got ribs and a hardened edge, and the dock got the workshop's finish.
- **Weapon animations:** `poseWeapon` in `src/render/robots.ts` drives them, for both the match and the workshop preview, which now demonstrates the weapon on a loop. Each weapon's own moving parts are in the `animate` it returns from `buildMelee`. New: claw and crusher jaws open and shut, forks lift, the magnet draws in rings of force, the flamethrower's pilot light flickers and flares, the Tesla Coil's crown kicks, the spear telescopes, and the dagger pushes out as the robot charges. All of it reads fields already in snapshots, so the protocol didn't change, and none of it changes the rules. A held robot isn't lifted by the forks, because `clawTarget` isn't sent to clients.
- **Map and career pictures:** `public/previews`, made from the game's own scenes by `scripts/make-previews.mjs` (instructions at the top of that file). They're plain JPEGs on the cards, about 400 KB in all, loaded only when the Fight Bots tab opens. Run it again if a map, a career fight or the look of a robot changes.
- **Three powerups at a time:** `POWERUP_SLOTS`. `loadout.powerupSlots` lists what goes into a match, in slot order, and `fittedPowerups` in `src/sim/data.ts` caps it and picks for robots nobody chose for. `Match` only loads those (`carriedPowerups`), so the server enforces it and the rest of the garage stock can't be spent. Keys 1 to 3 and the D-pad's up, right and down fire slots, not particular powerups. Workshop cards have a tick box. In a match they sit in the dock's weapon row on a desktop, and on touch in an arc above the thumb buttons (`.touch-power`).
- **Tower weapons:** `onTower` on the Flamethrower and Pneumatic Spear mounts them on the tower in `buildRobot`, placed by `TOWER_MOUNTS`. Every robot always has a tower, so nothing has to enforce needing one.
- **Spinner sound:** set well below everything else on purpose, including the extra clang when they land a big hit (`SPINNER_HIT_VOLUME`). The whine is a low triangle wave now.
- **Result sounds:** `win` and `lose` in `src/audio.ts` play a synthesized happy or sad sound, and nothing plays in a draw. They replaced a robot voice saying "Winner" and "Scrapped". Levels were measured, but nobody has listened to them yet.
- **Phone workshop menu:** every section shows at once in a grid (`.shop-rail`), 3 across upright and 5 sideways. The top tabs also fit without scrolling, with a row of their own on an upright phone.
- **Fight Bots button:** `.fight-bar` is pinned to the bottom of the panel on every screen, with the chosen mode and map beside it.
- **Who's online on phones:** the pill on the robot preview (`.online-pill`) opens the `players` tab, which has no top tab of its own, and the online buttons show queue counts. Phones are the only place the pill shows, as desktops have the Players panel.
- **Joining from a bot fight:** `pollOnline` runs every 5 seconds, including during offline matches, and `updateQueueOffer` puts a banner up when someone is waiting, duels first (`waitingQueue`). Joining is the same as forfeiting from the pause menu, then `startOnline`. A dismissed queue stays quiet until it empties.
- **Face-off shape:** `DuelIntro.update` re-measures every frame, because tapping into a fight is when a phone goes full screen and turns sideways. A narrow lens from further back keeps robots from stretching toward the sides.
- **Defense gear on show:** `buildDefenseGear` gives every defense its own model. Big things sit on a shelf behind the hull, opposite the main weapon, and small ones on the tower at `TOWER_SPOT`, because only the tower stands above the deck. It's only a look, and changes nothing in the rules.
- **Long names:** names can be 16 wide letters. The face-off shrinks them to fit (`fitNames`), and it must not clip them, because the slanted font leans past its own box. Elsewhere they end in an ellipsis.
- **No guns:** turrets, projectiles and the gun key are gone. The Flamethrower, Arc Coil (now Tesla Coil) and Spear Gun (now Pneumatic Spear) became main weapons. `retireGuns` in `src/game/progress.ts` upgrades old saves on load, refunding any other gun bought and handing over the weapon a converted one became. The refund reaches the database with the player's next garage action.
- **Balance:** see [balance.md](balance.md).
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
- **Defense placement:** a defense always goes on the side opposite the main weapon, which is the back by default. There's no setting of its own, so the two can't share a side: `defenseAngle` in `src/sim/match.ts` and the `gear` and `towerGear` groups in `buildRobot` all follow `rearMelee`. Steel Ram, Plow and everything dropped (`mounted` in `DEFENSES`) really work from that side, and the rest work all around. A Steel Ram only adds its 30% ram bonus on the nose, so only with the main weapon at the back. Bots never mount weapons at the back, so their Steel Rams and Plows now cover their backs too, and that includes the Old Ironjaw boss. None of this has been rebalanced.
- **Members:** only accounts that entered `MEMBER_CODE` appear on the Highscore and Players lists, through `joinMembers` in `server/accounts.ts` and `POST /api/member`, limited to 10 tries an hour per address. The code is only in the server's `.env`, never in the public page or repo. Players can enter it on the first name screen, where it's optional and a wrong one keeps them there with a message, or on the Stats page. Everyone else plays as normal, still earns stats and still shows by name inside matches. Existing accounts started as non-members, and joining puts a player's existing record on the board. Setup and removing someone are in [hosting.md](hosting.md).
- **Spectator traps:** driving keys steer a marker and weapon keys fire three traps, in `updateSpectator` and `updateTraps` in `src/sim/match.ts`. They arrive through the normal input messages, so they work online, though no online queue uses Last Robot Standing yet. Each map names them and picks the falling object in `TRAP_NAMES` in `src/sim/arena.ts`. Numbers are in `TRAP` in `src/sim/data.ts`. Trap damage and kills count for the spectator.
- **Quicker weapons:** cooldowns and wind-ups are down by about 40 to 55 percent, and damage per hit is down a little to compensate. Big hits (`BIG_HIT` in `src/render/matchView.ts`) get extra sparks, a flash and a camera kick. The numbers are in `src/sim/data.ts`.
- **Weapon models:** every weapon in `src/render/robots.ts` is rebuilt from helpers such as `sawBlade`, `sideOn`, `turned` and `piston`. The chainsaw's teeth really run around its bar, using an `InstancedMesh`. Reach is about what it was, so models still match what they hit.
- **Online Brawl:** a second online queue, set by `BRAWL_ROOM_OPTIONS` in `server/room.ts`. It's a Free-for-All on a random map for 8 robots, needing at least 2 humans, with bots in the other seats. It starts 10 seconds after a second pilot joins, or 3 seconds after it fills. Leaving or staying disconnected removes the robot and ranks that pilot last, a last human fights on against the bots, and the match ends once every human has gone. The queue screen shows bots fighting on the chosen map, using the same demo match as the title screen.
- **Cheat codes:** on the Stats page. `money` gives $5,000 each time, and `unlock` owns every part, in `applyCheat` in `src/game/progress.ts`. With an account the server applies them, and money shows in the ledger as `garage: cheat`. They work for anyone, and the codes are readable in the public page and repo, so nothing bought online can be trusted as earned. Worth removing or limiting before sharing widely.
- **Armor gives way:** fitting any part lowers armor as far as needed to stay within the limits, in `withPart` in `src/game/progress.ts`. If even no armor isn't enough, the part says Too heavy or Too many points.
- **Intro:** one second, with the logo slamming down, a flash, a shockwave ring and sparks. It's all CSS, timed around the moment of impact. Rating runs evenly from +25 for first to -15 for last.
- **Payouts:** anyone still in a match when it ends earns at least `REWARD.minimum` ($100), including losers and draws, however short the match. Anyone who surrendered gets no minimum, and anyone who left gets nothing. With an account, offline and career matches are now banked with a `payout` garage action, capped at `OFFLINE_PAYOUT_MAX`. They used to pay accounts nothing, and every player gets a guest account, so that's why payouts looked broken. The server takes the browser's word for the amount, and two accounts can farm a duel by surrendering. Neither matters while the `money` cheat exists, but both should be closed before wide sharing.
- **Countdown:** every match starts with 3, 2, 1, GO!, set by `COUNTDOWN`. Nothing moves and the clock doesn't run until it ends. The title screen and queue background matches skip it.
- **Sound levels matched:** every weapon sound was rendered and measured with A-weighting, then given a level in `MELEE_LEVEL` in `src/audio.ts`. Spinners were later set well below the rest on purpose, because they were still too harsh for the user, so they no longer match the others.
- **Audio settings:** Master, Music and Sound Effects sliders plus Mute, saved per browser.
- **Queue count:** "N in queue" on the Online Duel and Online Brawl buttons, refreshed every 5 seconds (`ONLINE_POLL_MS`).
- **Players tab:** beside Highscore, showing who is in the queue or a match and who was recently active. It comes from `GET /api/online`, which returns only names and last-seen times, for the past 7 days. Guests still named "Pilot" are left out.
- **Flash Bomb weakened:** 1.2 seconds instead of 2.5, radius 8 instead of 11, cooldown 14 seconds instead of 10. It can no longer fully white out the screen.
- **Starting money:** $1,000 instead of $250. Existing accounts keep what they have.
- **Laser sound fixed:** it was using the arc coil's sound.
- **Turning:** robots turn only while rolling. The rate scales with rolling speed, reaching full at `TURN_FULL_SPEED` (4 units/s) in `src/sim/match.ts`. Reversing steers like a car, so the turn direction flips. This is the user's request, but the reverse direction was our call.
- **Clear decks:** toppers are gone, along with rails, bolts, fins, roll hoops and exhausts, and a test keeps the deck itself clear. Only the tower and what's mounted on it stand above the hull. Defenses show through the shelf behind the hull and the tower instead (see Defense gear on show).
- **Body shapes:** Wedge, Slab and Turtle, chosen in the Paintshop. They live in `Paint`, which the rules never read, and a test checks that fights play out identically. The five chassis keep their different hitboxes, because size is balanced against their stats.
- **Smooth shading:** materials are no longer flat-shaded, and hulls use creased normals, like Blender's smooth by angle. Canyon rock and snow stay faceted on purpose.
- **Self-righting:** a Flipper hit sets `flipT`, which stuns the target through the throw plus `FLIP_TIME` (2.5 seconds on the ground). 3 seconds on the ground made the Flipper win 84% of bot duels. Vertical spinners, drums and eggbeaters still throw robots without flipping them.
- **Settings button:** a gear in the top right corner, on every screen after the name prompt. It pauses offline matches, while online matches carry on underneath. Keys rebound during a match work at once, but the HUD shows the old key names until the next match.
- **Workshop and Buy Parts merged:** Workshop has a tab for each part type plus Powerups and Upgrades, showing the part fitted now, and cards for everything in that type. Clicking a card previews it on the robot and in the numbers, and only the card's Fit or Buy button changes anything, in `partCards` in `src/ui/screens.ts`. Upgrades have nothing to preview, so clicking those buys straight away, as it did before.
- **Renames:** the Garage page is now Stats, so the robot's numbers in the side panel became Specs.

## Earlier work

Shipped before the latest work, and still true unless it says otherwise above.

- **1v1 online:** Online Duel is always a Duel on The Skyscraper with no bots. A match starts only once a second player joins.
- **Ways to play:** Online Duel, Online Brawl, Offline vs Bots (choice of map and mode, plus Career) and Training (a practice dummy, no payout).
- **Workshop:** in the style of the original, with Chassis, Wheels, Engine, Power Source and an Armor dial, limited by points and weight.
- **Paintshop:** paint on an unfolded robot with drawing tools and a 120-colour palette. Opponents see it. Paint jobs are in `src/game/skin.ts`.
- **Melee only:** 21 main weapons, including spinners that store energy, a flipper, a crusher and forks.
- **Battery:** runs the Shift boost and powered weapons.
- **Look and sound:** BattleBots-style robots, a redrawn logo, synthesized sound and music, a short intro, and a name prompt on first visit.
- **Netcode:** fixed the online stutter with an input queue on the server and blended prediction on the client.
- **Graphics:** Auto quality steps down on slower machines.

### Controls

WASD to drive, Space or left click main weapon, R or right click defense, Shift boost, E look behind, 1–3 powerups, M mute, Esc menu. Players can rebind them in Settings, except that Ctrl can't be bound, because Ctrl+W closes the tab.

## What the user wants next

The user tests by hand, and their feedback should drive what comes next. Open items, roughly by priority:

1. **Real phone test:** see "Not verified yet" under Current state. The face-off, the join banner and the new paintshop are the first things to try.
2. **Report button:** other players' paint can be hidden, but nothing can be reported.
3. **Human playtest:** nobody has played the points, weight, armor and battery rules by hand. Balance has only been tuned against bots.
4. **Sound by ear:** levels were measured but never listened to by the person building them, so the user's opinion overrides the numbers. That includes the quieter spinners.
5. **Google sign-in:** the name prompt is a stopgap until this exists. `GOOGLE_CLIENT_ID` isn't set on the server.
6. **Sparks and scars by eye:** both have only been seen in small screenshots from a software renderer, so their size and how often they appear are guesses.
7. **Custom domain:** `scrapriot.parbs.online` was discussed but not set up. DNS, GitHub Pages and the server's `ALLOWED_ORIGINS` would all need changing.
8. **Check the first backup:** a nightly dump to `~/scrap-riot-backups` on the VM, kept 14 days, was installed on 2 November. A restore matched the live row counts, but real cron hadn't fired it yet.

### Known weak spots

- **Balance:** see Known limits in [balance.md](balance.md). Light robots lose bot brawls, and the Magnet leads brawls while trailing duels.
- **Bot driving:** bots can't turn on the spot either, so `mindTheEdge` in `src/sim/ai.ts` slows them for turns near a ledge and backs them away. Without it, about 70% of bot duels ended in a fall. It's now about 10%, except for the Flipper at about 60%, where falls are the point. Maps with pits rely on the older steering away from hazards, and weren't measured separately.
- **Mini-Robot:** it still hunts on its own. The user asked for no gun tracking, and this is a drone, so it was left alone and flagged to them. They have not said either way.
- **Windows Sticky Keys:** tapping Shift five times can bring up the prompt.
- **Frame rate:** the Skyscraper was measured only in a software renderer, never on a weak real GPU. A friend of the user had low frame rates before Auto quality was added, and the result on their PC is unconfirmed.
- **Paintshop on phones:** the tools are 40px tall, and 34 to 37px wide on an upright phone, under the usual 44px advice. The board is 236px across at 640x360, so fine detail is fiddly. Pattern and body shape are a scroll below it. It has only run with emulated touch.
- **Upright tablets:** the workshop panel sits above the robot and play buttons, so those need scrolling to, and the Fight Bots bar sits about two-thirds of the way down the screen.
- **Refresh rate limit:** the 5-second refresh uses 12 of the 120 requests a minute each address gets (`REQUESTS_PER_WINDOW` in `server/api.ts`). About 10 people on one address would reach the limit, and their garage actions could then be refused. Matches don't go through it.
- **Join banner lag:** the person waiting may have gone by the time someone taps it, leaving them waiting in the queue instead.
- **Defense gear:** it's only a look. Parts stick out past the hull and can poke through walls, and shelf items stay put when used, so the Mini-Robot and bomb still show after they've gone.
- **Below the minimum:** the `@media (max-height: 340px)` block in the stylesheet only serves phones below the 720p target and can go.
- **Trailer:** the current one is `C:\Users\N P\Projects\scrap-riot-trailer-30s.mp4` (30 seconds, 1080p). Its fights are staged, including the one under the "Online Duels" caption, and nobody has listened to its sound. Its rig is `promo-30s.mjs` in `C:\Users\N P\Projects\scrap-riot-promo\`. Run it with `PROMO_GPU=1 node promo-30s.mjs final`, because the PC's graphics card takes about 4 minutes where the software renderer would take about 1.5 hours. That folder also has the overlap sweep (`sweep.mjs`) and weapon close-ups (`anim.mjs`), which load `playwright-core` from the older `smoke` folder below. The older `scrap-riot-trailer.mp4` and `scrap-riot-promo.mp4` predate much of the game.

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
- Phones: the minimum is 720p, which is about 640x360 in CSS pixels, either way up. The user doesn't want special cases for anything smaller.

### Running and testing

```sh
npm run dev          # the game, on the port Vite prints
npm run server:dev   # local server with a temporary database
npm test
npm run balance -- 24000 2400
npm run train-bots -- 2 60 12
```

For a second local player, use a private window. Two normal tabs share an account and get rejected.

Docker Desktop is installed on the user's PC again, so `docker-compose.yml` could be run locally to test against the real server and database, for example a real queue for the join banner. This hasn't been tried, and the engine wasn't running when last checked, so it may need starting first.

The newest browser checks are also **not in the repo**, and are in a temporary folder that may not last:
`C:\Users\NPFFCD~1\AppData\Local\Temp\claude\c--Users-N-P-Projects\2d6053cb-e901-455d-9005-b4ec9dc043be\scratchpad\`

The useful ones are `ui-audit.mjs` (every screen at many sizes, summarised by `audit-sum.mjs`), `online-check.mjs` (phone counts and the join banner against a mocked server), `fight-check.mjs`, `vs-check.mjs`, `slots-check.mjs`, `gear-view.mjs` (a picture of every defense), `sound-measure.mjs` and `promo2.mjs` (the trailer rig). They load `playwright-core` from the older `smoke` folder below, and start their own Vite server.

`smoke/full.mjs` in an earlier session's scratchpad covers the settings button, renames, part previews, body shapes and flips. It's at `C:\Users\NPFFCD~1\AppData\Local\Temp\claude\c--Users-N-P-Projects\7dd40e2a-93f9-4282-8e5e-ed62253bce2b\scratchpad\smoke\`, and expects Vite on port 5208.

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
