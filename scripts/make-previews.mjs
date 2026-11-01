// Draws the pictures on the map and career cards, from the game's own maps and robots, into public/previews.
// It needs a browser to draw with: npm i --no-save playwright-core, then node scripts/make-previews.mjs
// It uses Microsoft Edge, so nothing else has to be downloaded. Run it again whenever a map or a fight's look changes.
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'previews');
mkdirSync(out, { recursive: true });

const PORT = 5240;
const WIDTH = 560;
const HEIGHT = 315;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const server = spawn(`npx vite --port ${PORT} --strictPort`, { cwd: root, shell: true, stdio: 'ignore' });
await sleep(4000);
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=d3d11'] });
const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
await context.addInitScript(() => localStorage.setItem('scrap-riot.settings.v4', JSON.stringify({ quality: 'high', tutorialDone: true, pilotName: 'Pilot', fullscreen: false })));
await context.route(/localhost:8787/, (route) => route.abort());
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'load' });
await page.waitForSelector('[data-start]', { timeout: 60000 });
await sleep(800);
await page.addStyleTag({ content: '#ui, .hud, .settings-button, .fps-counter { visibility: hidden !important; }' });

const names = await page.evaluate(async () => {
  const g = window.__game;
  const { Match } = await import('/src/sim/match.ts');
  const { CAREER, fightSetups } = await import('/src/game/career.ts');
  const { ARENA_ORDER, ARENAS } = await import('/src/sim/arena.ts');
  const { newSave } = await import('/src/game/progress.ts');
  g.softwareWarning = '';
  g.keyboard.applyTo = () => {};
  // A camera of its own, wherever the match view would have put it.
  const render = g.renderer.render.bind(g.renderer);
  g.renderer.render = (scene, camera) => {
    const v = window.__view;
    if (v) {
      // Just the machines, without the names and health bars that float over them in a match.
      for (const shown of g.view.visuals.values()) shown.label.visible = shown.barBack.visible = shown.barFront.visible = false;
      camera.position.set(...v.from);
      camera.fov = v.fov;
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      camera.lookAt(...v.at);
    }
    render(scene, camera);
  };
  const stage = (setups, arena, mode, spots) => {
    const match = new Match(setups, { seed: 7, arena, mode, countdown: 0, duration: 999, killTarget: 999 });
    match.bots.forEach((bot, i) => {
      const spot = spots(i, match.bots.length);
      Object.assign(bot, { x: spot.x, prevX: spot.x, z: spot.z, prevZ: spot.z, heading: spot.heading, prevHeading: spot.heading, invulnT: 0, vx: 0, vz: 0 });
    });
    match.step = () => {};
    // A moment in, with the wrecking ball swung out of the way and the doors still shut.
    match.time = 2;
    g.training = false;
    g.careerFight = null;
    g.match = match;
    g.player = match.bots[0];
    g.accumulator = 0;
    g.enterMatch(match, match.bots[0]);
  };
  // The whole map from up high at one corner, far enough back to show its shape.
  window.__map = (id) => {
    const { half } = ARENAS[id];
    const rival = { name: 'B', color: 0xe0503a, isAI: false, loadout: newSave().loadout };
    stage([{ name: 'A', color: 0xff8a2a, isAI: false, loadout: newSave().loadout }, rival], id, 'ffa', (i) => ({ x: i ? half * 0.28 : -half * 0.22, z: i ? -half * 0.1 : half * 0.14, heading: i ? -1.2 : 1.9 }));
    // From the corner with nothing standing in it.
    window.__view = { from: [half * 0.95, half * 0.72, -half * 1.05], at: [0, 0, half * 0.04], fov: 46 };
  };
  // How much is in the way of a shot from here. Pits and pillars near the robots or between them and the camera all count.
  const blocked = (def, centre, camera) => {
    const nearSegment = (x, z, a, b) => {
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
      return Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
    };
    const things = [
      ...def.pillars.map((o) => ({ x: o.x, z: o.z, r: o.r })),
      ...def.pits.map((o) => ({ x: o.x, z: o.z, r: o.r })),
      ...def.firePits.map((o) => ({ x: o.x, z: o.z, r: o.r })),
      ...def.blocks.map((o) => ({ x: o.x, z: o.z, r: Math.hypot(o.w, o.d) / 2 })),
    ];
    let score = 0;
    for (const o of things) if (nearSegment(o.x, o.z, centre, camera) < o.r + 5) score++;
    if (Math.max(Math.abs(camera.x), Math.abs(camera.z)) > def.half - 1.5) score += 3;
    if (Math.max(Math.abs(centre.x), Math.abs(centre.z)) > def.half - 8) score += 3;
    return score;
  };
  // A career fight: its real rivals lined up at the camera, with any boss out in front. Each looks from its own side of the map.
  window.__fight = (id) => {
    const index = CAREER.findIndex((f) => f.id === id);
    const fight = CAREER[index];
    const setups = [{ name: 'You', color: 0xff8a2a, isAI: false, loadout: newSave().loadout }, ...fightSetups(fight, 7)];
    const bossAt = setups.findIndex((s) => s.boss);
    const def = ARENAS[fight.arena];
    const distance = bossAt > 0 ? 9.5 : 9 + (setups.length - 2) * 0.8;
    const facing = (yaw) => ({ ahead: { x: Math.sin(yaw), z: Math.cos(yaw) } });
    let best = null;
    for (let turn = 0; turn < 16; turn++) {
      const yaw = index * 2.4 + 0.5 + (turn * Math.PI) / 8;
      const { ahead } = facing(yaw);
      for (const [cx, cz] of [[0, 0], [0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3], [0.45, 0], [-0.45, 0], [0, 0.45], [0, -0.45]]) {
        const centre = { x: cx * def.half, z: cz * def.half };
        const camera = { x: centre.x - ahead.x * distance, z: centre.z - ahead.z * distance };
        const score = blocked(def, { x: centre.x + ahead.x * 3, z: centre.z + ahead.z * 3 }, camera);
        if (!best || score < best.score) best = { score, yaw, centre };
      }
    }
    const { yaw, centre } = best;
    const { ahead } = facing(yaw);
    const across = { x: ahead.z, z: -ahead.x };
    const place = (side, depth) => ({ x: centre.x + across.x * side + ahead.x * depth, z: centre.z + across.z * side + ahead.z * depth, heading: yaw + Math.PI - side * 0.06 });
    stage(setups, fight.arena, fight.mode, (i, n) => {
      // The player's own robot is off behind the camera, as these are the ones to look at.
      if (i === 0) return { x: -ahead.x * def.half * 4, z: -ahead.z * def.half * 4, heading: 0 };
      if (i === bossAt) return place(0, 0.4);
      const others = n - (bossAt > 0 ? 2 : 1);
      const order = i - (bossAt > 0 && i > bossAt ? 2 : 1);
      const spread = others <= 1 ? 0 : (order / (others - 1) - 0.5) * Math.min(13, others * 3.3);
      // Beside a boss rather than behind it.
      const clear = bossAt > 0 ? (others === 1 || spread < 0 ? -4.6 : 4.6) : 0;
      return place(spread + clear, 2.4 + Math.abs(spread) * 0.2);
    });
    window.__view = {
      from: [centre.x - ahead.x * distance + across.x * 2.4, 3.6, centre.z - ahead.z * distance + across.z * 2.4],
      at: [centre.x + ahead.x * 1.6, 0, centre.z + ahead.z * 1.6],
      fov: 42,
    };
  };
  return { maps: ARENA_ORDER, fights: CAREER.map((f) => f.id) };
});

async function shoot(name) {
  await sleep(900);
  await page.screenshot({ path: join(out, `${name}.jpg`), type: 'jpeg', quality: 72 });
  console.log(name);
}

for (const id of names.maps) {
  await page.evaluate((id) => window.__map(id), id);
  await shoot(`map-${id}`);
}
for (const id of names.fights) {
  await page.evaluate((id) => window.__fight(id), id);
  await shoot(`fight-${id}`);
}
// A close look at every weapon and defense, for their cards in the workshop.
const THUMB_W = 400;
const THUMB_H = 175;
const parts = await page.evaluate(async () => {
  const { MELEE, DEFENSES } = await import('/src/sim/data.ts');
  return { melee: Object.keys(MELEE), defense: Object.keys(DEFENSES) };
});
await page.evaluate(async ([width, height]) => {
  const g = window.__game;
  const THREE = await import('/node_modules/three/build/three.module.js');
  // Hands back the one the map shots wrapped, which only moves the camera while a view is set.
  window.__view = null;
  window.__thumb = (slot, id) => {
    const garage = g.garage;
    garage.setBuild({ chassis: 'brawler', melee: slot === 'melee' ? id : 'dagger', defense: slot === 'defense' ? id : 'shield', tower: 'medium', wheels: 'large4', color: 0xff8a2a });
    garage.turntable.rotation.y = 0;
    const model = garage.model;
    model.root.updateMatrixWorld(true);
    const { camera } = garage;
    camera.aspect = width / height;
    camera.fov = 30;
    if (slot === 'melee') {
      const box = new THREE.Box3().setFromObject(model.meleePivot);
      const centre = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3()).length();
      const away = Math.max(size * 1.5, 3.4);
      camera.position.set(centre.x + away * 0.62, centre.y + away * 0.46, centre.z + away * 0.64);
      camera.lookAt(centre);
    } else {
      // Defenses go on the back of the robot, on a shelf or the tower.
      const rootX = model.root.position.x;
      const rootZ = model.root.position.z;
      camera.position.set(rootX + 2.3, 2.3, rootZ - 4.1);
      camera.lookAt(rootX, 0.85, rootZ - 1.15);
    }
    camera.updateProjectionMatrix();
    g.renderer.setPixelRatio(1);
    g.renderer.setSize(width, height, false);
    g.renderer.setScissorTest(false);
    g.renderer.setViewport(0, 0, width, height);
    g.renderer.render(garage.scene, camera);
    return g.renderer.domElement.toDataURL('image/jpeg', 0.8);
  };
}, [THUMB_W, THUMB_H]);
for (const slot of ['melee', 'defense']) {
  for (const id of parts[slot]) {
    const url = await page.evaluate(([slot, id]) => window.__thumb(slot, id), [slot, id]);
    writeFileSync(join(out, `${slot}-${id}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
    console.log(`${slot}-${id}`);
  }
}
if (errors.length) console.log('page errors', errors);
await browser.close();
spawn('taskkill', ['/pid', String(server.pid), '/t', '/f'], { stdio: 'ignore' });
process.exit(errors.length ? 1 : 0);
