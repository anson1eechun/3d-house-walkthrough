// Exterior: lawn, courtyard pavers, driveway, porch, deck, pool, street,
// trees, hedges, shrubs, outdoor furniture, garden lighting and the distant
// landscape seen through the windows.

import * as THREE from 'three';
import { FLOOR_Y, FOOTPRINTS } from './layout.js';
import { subtractRects } from './createHouse.js';
import { Kit } from './kit.js';
import { LAYER } from '../core/layers.js';
import { mulberry32 } from '../core/rng.js';
import { makeTreeGeometry, plantTrees, buildHedges, buildShrubs } from './vegetation.js';
import { createWaterMaterial } from '../weather/water.js';
import { plant } from './interior/common.js';

const LOT = { x0: -26, x1: 26, z0: -30, z1: 30.5 };
const POOL = { x0: -10, x1: -2, z0: -19, z1: -14, depth: 1.4 };

export function createExterior(ctx) {
  const M = ctx.materials;
  const B = ctx.builder;
  const kit = new Kit(ctx);
  const ext = ctx.lighting.byId.get('exterior');
  const GROUND = { layer: LAYER.GROUND, zone: 'ext' };

  // ------------------------------------------------------------ paving ----
  const paved = [
    { x0: 0.125, x1: 13.8, z0: 1.125, z1: 7.6, y: 0.02, mat: 'pavers' },          // front courtyard
    { x0: 6.8, x1: 11.6, z0: 7.6, z1: 32.0, y: 0.012, mat: 'concrete' },          // driveway
    { x0: -70, x1: 70, z0: 32.0, z1: 34.6, y: 0.04, mat: 'concrete' },            // sidewalk
    { x0: -70, x1: 70, z0: 34.6, z1: 43.0, y: 0.006, mat: 'asphalt' },            // street
    { x0: -12.125, x1: 0.125, z0: -11.2, z1: -7.125, y: FLOOR_Y, mat: 'deck' },   // back deck
    { x0: 0.125, x1: 4.8, z0: 1.125, z1: 3.4, y: FLOOR_Y, mat: 'concrete', notGround: true },   // entry porch
  ];
  for (const p of paved) {
    const m = M.get(p.mat);
    B.box([p.x0, 0, p.z0], [p.x1, p.y, p.z1], (f) => (f === 'ny' ? null : m), p.notGround ? { zone: 'ext' } : GROUND);
    ctx.collision.addFloor({ minX: p.x0, maxX: p.x1, minZ: p.z0, maxZ: p.z1, y: p.y });
  }
  // street centre line dashes
  for (let x = -66; x < 66; x += 6) B.box([x, 0.006, 38.7], [x + 3, 0.008, 38.85], (f) => (f === 'py' ? M.get('roadLine') : null), GROUND);

  // -------------------------------------------------------------- lawn ----
  const holes = [
    ...paved.map(p => ({ x0: p.x0, x1: p.x1, z0: p.z0, z1: p.z1 })),
    ...FOOTPRINTS.map(f => ({ x0: f.x0, x1: f.x1, z0: f.z0, z1: f.z1 })),
    { x0: POOL.x0 - 0.45, x1: POOL.x1 + 0.45, z0: POOL.z0 - 0.45, z1: POOL.z1 + 0.45 },
  ];
  const lawn = subtractRects({ x0: -150, x1: 150, z0: -150, z1: 150 }, holes);
  const grass = M.get('grass');
  for (const r of lawn) B.box([r.x0, -0.05, r.z0], [r.x1, 0, r.z1], (f) => (f === 'py' ? grass : null), { ...GROUND, castShadow: false });

  // -------------------------------------------------------------- pool ----
  {
    const { x0, x1, z0, z1, depth } = POOL;
    const cop = M.get('coping');
    const ring = [[x0 - 0.45, x1 + 0.45, z0 - 0.45, z0], [x0 - 0.45, x1 + 0.45, z1, z1 + 0.45], [x0 - 0.45, x0, z0, z1], [x1, x1 + 0.45, z0, z1]];
    for (const [a, b, c, d] of ring) {
      B.box([a, 0, c], [b, 0.035, d], (f) => (f === 'ny' ? null : cop), GROUND);
      ctx.collision.addFloor({ minX: a, maxX: b, minZ: c, maxZ: d, y: 0.035 });
    }
    const tile = M.get('poolTile');
    B.box([x0, -depth, z0], [x1, -depth + 0.02, z1], (f) => (f === 'py' ? tile : null), { zone: 'ext' });
    B.box([x0 - 0.1, -depth, z0], [x0, 0.0, z1], (f) => (f === 'px' ? tile : null), { zone: 'ext' });
    B.box([x1, -depth, z0], [x1 + 0.1, 0.0, z1], (f) => (f === 'nx' ? tile : null), { zone: 'ext' });
    B.box([x0, -depth, z0 - 0.1], [x1, 0.0, z0], (f) => (f === 'pz' ? tile : null), { zone: 'ext' });
    B.box([x0, -depth, z1], [x1, 0.0, z1 + 0.1], (f) => (f === 'nz' ? tile : null), { zone: 'ext' });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0, 1, 1), createWaterMaterial(ctx.globals, ctx.app.wet));
    water.rotation.x = -Math.PI / 2;
    water.position.set((x0 + x1) / 2, -0.09, (z0 + z1) / 2);
    water.layers.set(LAYER.MAIN_ONLY);
    water.receiveShadow = true;
    water.name = 'poolWater';
    ctx.scene.add(water);
    ctx.collision.addBox({ minX: x0, maxX: x1, minZ: z0, maxZ: z1, minY: -3, maxY: 2.5, tag: 'pool', occludes: false });
    const pl = new THREE.PointLight(0x66e0ff, 5, 0, 2);
    pl.position.set((x0 + x1) / 2, -0.8, (z0 + z1) / 2);
    ctx.scene.add(pl);
    ctx.lighting.addLight(ext, pl, 5);
  }

  // ----------------------------------------------------- deck furniture ---
  {
    // outdoor sofa facing the pool (north)
    const g = kit.group();
    const frame = 'deck';
    g.add(kit.rbox(2.2, 0.06, 0.85, 0.01, frame, 0, 0.3, 0));
    for (const x of [-1.07, 1.07]) g.add(kit.rbox(0.08, 0.6, 0.85, 0.01, frame, x, 0.3, 0));
    g.add(kit.rbox(2.2, 0.5, 0.08, 0.01, frame, 0, 0.55, -0.4));
    for (const x of [-0.53, 0.53]) {
      g.add(kit.rbox(1.02, 0.14, 0.72, 0.05, 'fabricOlive', x, 0.4, 0.04));
      const b = kit.rbox(0.98, 0.42, 0.16, 0.06, 'fabricOlive', x, 0.68, -0.29); b.rotation.x = -0.15; g.add(b);
    }
    kit.place(g, -9.3, -7.95, Math.PI);
    kit.commit(g, { collider: { w: 2.2, d: 0.85, h: 0.85 } });
    const t = kit.group(kit.rbox(1.1, 0.04, 0.6, 0.01, 'deck', 0, 0.38, 0));
    for (const [x, z] of [[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25]]) t.add(kit.box(0.05, 0.36, 0.05, 'deck', x, 0.18, z));
    t.add(kit.lathe('lantern', [[0, 0], [0.08, 0], [0.08, 0.25], [0.05, 0.28], [0, 0.28]], 'ceramicMatte', 0.25, 0.4, 0));
    kit.place(t, -9.3, -9.15, 0);
    kit.commit(t);
    for (const [x, r] of [[-10.95, Math.PI / 2 - 0.35], [-7.65, -Math.PI / 2 + 0.35]]) {
      const c = kit.group();
      c.add(kit.rbox(0.75, 0.06, 0.75, 0.01, 'deck', 0, 0.3, 0));
      for (const s of [-1, 1]) c.add(kit.rbox(0.07, 0.55, 0.75, 0.01, 'deck', s * 0.36, 0.28, 0));
      c.add(kit.rbox(0.68, 0.13, 0.66, 0.05, 'fabricOlive', 0, 0.39, 0.03));
      const b = kit.rbox(0.66, 0.4, 0.14, 0.05, 'fabricOlive', 0, 0.65, -0.3); b.rotation.x = -0.2; c.add(b);
      kit.place(c, x, -9.45, r);
      kit.commit(c, { shrink: 0.05 });
    }
    plant(kit, -11.6, -10.75, 1.4, 201, 'plinth');
    plant(kit, -0.4, -10.75, 1.2, 202, 'plinth');
    // sun loungers on the coping side of the pool
    for (const x of [-8.6, -6.6, -4.6]) {
      const l = kit.group();
      l.add(kit.rbox(0.7, 0.06, 1.9, 0.02, 'deck', 0, 0.28, 0));
      for (const [lx, lz] of [[-0.3, -0.85], [0.3, -0.85], [-0.3, 0.85], [0.3, 0.85]]) l.add(kit.box(0.05, 0.26, 0.05, 'deck', lx, 0.13, lz));
      l.add(kit.rbox(0.64, 0.07, 1.25, 0.03, 'linen', 0, 0.345, 0.3));
      const back = kit.rbox(0.64, 0.07, 0.7, 0.03, 'linen', 0, 0.55, -0.6); back.rotation.x = 0.6; l.add(back);
      kit.place(l, x, -12.6, Math.PI, 0);
      kit.commit(l, { shrink: 0.05 });
    }
  }

  // ------------------------------------------------- courtyard planter ----
  {
    const px = 5.6, pz = 5.3;
    B.box([px - 0.9, 0, pz - 0.9], [px + 0.9, 0.5, pz + 0.9], (f) => (f === 'ny' ? null : M.get('plinth')), { zone: 'ext', collider: { tag: 'planter', occludes: false } });
    B.box([px - 0.8, 0.5, pz - 0.8], [px + 0.8, 0.505, pz + 0.8], (f) => (f === 'py' ? M.get('soil') : null), { zone: 'ext' });
    ctx.courtyardTree = { x: px, z: pz };
    const up = new THREE.SpotLight(0xffe0b0, 26, 0, 0.6, 0.6, 2);
    up.position.set(px + 0.5, 0.55, pz + 0.5);
    up.target.position.set(px, 4, pz);
    ctx.scene.add(up, up.target);
    ctx.lighting.addLight(ext, up, 26);
  }
  // bench in the courtyard
  {
    const g = kit.group(kit.rbox(1.8, 0.06, 0.42, 0.01, 'deck', 0, 0.45, 0));
    for (const x of [-0.75, 0.75]) g.add(kit.box(0.08, 0.42, 0.38, 'plinth', x, 0.21, 0));
    kit.place(g, 0.6, 5.2, Math.PI / 2, 0.02);
    kit.commit(g);
  }

  // -------------------------------------------------- garden lighting ----
  const glow = ctx.lighting.emissive(ext, { color: 0xffdcae, intensity: 12, base: 0x333333 });
  for (const x of [0.78, 3.25]) {
    const s = kit.group(
      kit.box(0.09, 0.32, 0.09, 'darkMetal', 0, 0, 0),
      kit.box(0.07, 0.004, 0.07, glow, 0, 0.162, 0),
      kit.box(0.07, 0.004, 0.07, glow, 0, -0.162, 0),
    );
    kit.place(s, x, 1.125 + 0.05, 0, FLOOR_Y + 2.05);
    kit.commit(s, { collider: null });
    const p = new THREE.PointLight(0xffd6a0, 2.4, 0, 2);
    p.position.set(x, FLOOR_Y + 1.95, 1.4);
    ctx.scene.add(p);
    ctx.lighting.addLight(ext, p, 2.4);
  }
  const bollardSpots = [];
  for (let z = 10; z <= 30; z += 5) { bollardSpots.push([6.45, z], [11.95, z]); }
  bollardSpots.push([-3, -11.6], [-9, -11.6], [-1.2, -13.6], [-10.8, -13.6]);
  for (const [x, z] of bollardSpots) {
    const b = kit.group(
      kit.cyl(0.07, 0.07, 0.6, 'darkMetal', 0, 0.3, 0, 16),
      kit.cyl(0.072, 0.072, 0.05, glow, 0, 0.52, 0, 16),
      kit.cyl(0.08, 0.08, 0.03, 'darkMetal', 0, 0.615, 0, 16),
    );
    kit.place(b, x, z, 0, 0);
    kit.commit(b, { collider: { w: 0.16, d: 0.16, h: 0.6 } });
  }
  {
    const deckSpot = new THREE.SpotLight(0xffd8a8, 18, 0, 1.25, 0.8, 2);
    deckSpot.position.set(-8.0, 3.4, -7.7);
    deckSpot.target.position.set(-8.0, 0, -9.6);
    ctx.scene.add(deckSpot, deckSpot.target);
    ctx.lighting.addLight(ext, deckSpot, 18);
  }
  // street lights (emissive heads only)
  for (const x of [-16, 18]) {
    const s = kit.group(
      kit.cyl(0.06, 0.08, 5.2, 'darkMetal', 0, 2.6, 0, 12),
      kit.box(0.9, 0.06, 0.14, 'darkMetal', -0.42, 5.18, 0),
      kit.box(0.5, 0.02, 0.12, glow, -0.62, 5.14, 0),
    );
    kit.place(s, x, 33.3, Math.PI / 2, 0.04);
    kit.commit(s, { collider: { w: 0.2, d: 0.2, h: 5 } });
  }
  // low front wall + mailbox
  for (const [a, b] of [[LOT.x0, 6.4], [12.0, LOT.x1]]) {
    B.box([a, 0, 30.55], [b, 0.65, 30.85], (f) => (f === 'ny' ? null : M.get('stucco')), { zone: 'ext', collider: { tag: 'wall' } });
    B.box([a - 0.02, 0.65, 30.53], [b + 0.02, 0.69, 30.87], (f) => (f === 'ny' ? null : M.get('coping')), { zone: 'ext' });
  }
  {
    const mb = kit.group(kit.box(0.08, 1.05, 0.08, 'darkMetal', 0, 0.52, 0), kit.rbox(0.3, 0.24, 0.42, 0.03, 'darkMetal', 0, 1.15, 0));
    kit.place(mb, 12.4, 30.2, 0, 0.012);
    kit.commit(mb, { collider: { w: 0.3, d: 0.42, h: 1.3 } });
  }

  // ------------------------------------------------------- vegetation -----
  const bark = M.get('bark'), leaves = M.get('leaves');
  const varA = makeTreeGeometry(11, { height: 8.5, crown: 3.4, trunkR: 0.2, clusters: 40 });
  const varB = makeTreeGeometry(23, { height: 6.2, crown: 2.6, trunkR: 0.15, clusters: 30 });
  const varC = makeTreeGeometry(37, { height: 9.5, crown: 2.2, trunkR: 0.17, conifer: true, clusters: 46, cardsPer: 4, leafSize: 0.8 });
  const varD = makeTreeGeometry(51, { height: 3.6, crown: 1.5, trunkR: 0.07, clusters: 16, cardsPer: 7, leafSize: 0.6 });
  const rnd = mulberry32(606);
  const A = [], Bt = [], Ct = [], D = [];
  // garden
  for (const [x, z] of [[-17, -17], [6, -19], [14, -12], [-21, -5], [19, -25], [-4, -26], [-20, 14]]) A.push({ x, z, s: 0.85 + rnd() * 0.35, r: rnd() * 6 });
  for (const [x, z] of [[21, 3], [22, -8], [-16, 21], [17, 17], [2.5, 23], [-9, 12]]) Bt.push({ x, z, s: 0.85 + rnd() * 0.3, r: rnd() * 6 });
  for (const [x, z] of [[23, -18], [-23, -22], [-23, 4], [23, 22], [-23, 26]]) Ct.push({ x, z, s: 0.9 + rnd() * 0.3, r: rnd() * 6 });
  D.push({ x: ctx.courtyardTree.x, y: 0.5, z: ctx.courtyardTree.z, s: 1.0, r: 1 });
  for (const [x, z] of [[-13.6, -9.5], [1.5, -9.6], [15, 7]]) D.push({ x, z, s: 0.9 + rnd() * 0.3, r: rnd() * 6 });
  // street trees and the wooded surroundings beyond the hedges
  for (const x of [-22, -6, 26]) Bt.push({ x, z: 31.7, s: 0.9, r: rnd() * 6 });
  for (let i = 0; i < 70; i++) {
    const a = rnd() * Math.PI * 2, r = 36 + rnd() * 70;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (z > 28 && z < 48) continue;               // keep the street clear
    const pick = rnd();
    (pick < 0.4 ? A : pick < 0.7 ? Ct : Bt).push({ x, z, s: 0.9 + rnd() * 0.6, r: rnd() * 6 });
  }
  plantTrees(ctx, varA, A, { bark, leaves });
  plantTrees(ctx, varB, Bt, { bark, leaves });
  plantTrees(ctx, varC, Ct, { bark, leaves });
  plantTrees(ctx, varD, D, { bark, leaves });

  buildHedges(ctx, [
    { x0: LOT.x0, z0: LOT.z0, x1: LOT.x1, z1: LOT.z0 },
    { x0: LOT.x0, z0: LOT.z0, x1: LOT.x0, z1: 30.2 },
    { x0: LOT.x1, z0: LOT.z0, x1: LOT.x1, z1: 30.2 },
    { x0: LOT.x0 + 0.5, z0: 30.0, x1: 6.2, z1: 30.0, h: 1.2, w: 0.6 },
    { x0: 12.2, z0: 30.0, x1: LOT.x1 - 0.5, z1: 30.0, h: 1.2, w: 0.6 },
  ], { core: M.get('hedgeCore'), leaves: M.get('hedgeLeaves') });

  const shrubs = [];
  for (let z = -6.2; z <= 6.2; z += 1.25) shrubs.push({ x: -12.7, z, r: 0.42 + rnd() * 0.15 });
  for (let x = 1.0; x <= 12.6; x += 1.3) shrubs.push({ x, z: -7.75, r: 0.4 + rnd() * 0.15 });
  for (let z = -6.0; z <= 0.4; z += 1.3) shrubs.push({ x: 13.75, z, r: 0.4 + rnd() * 0.12 });
  for (const [x, z] of [[13.4, 7.1], [0.7, 7.1], [-0.6, -12.4], [-11.4, -12.4]]) shrubs.push({ x, z, r: 0.55 });
  buildShrubs(ctx, shrubs, M.get('hedgeLeaves'));
  // mulch beds under the shrubs
  for (const [a, b, c, d] of [[-13.2, -12.15, -6.9, 6.9], [0.4, 13.1, -8.25, -7.15], [13.15, 14.25, -6.9, 1.1]]) {
    B.box([a, 0, c], [b, 0.025, d], (f) => (f === 'py' ? M.get('soil') : null), GROUND);
  }

  // -------------------------------------------------- distant landscape ---
  hills(ctx, 190, 340, 34, 0x4d5a3c, 1);
  hills(ctx, 300, 420, 70, 0x5b6676, 2);
}

function hills(ctx, r0, r1, height, color, seed) {
  const rnd = mulberry32(seed * 1000);
  const N = 160;
  const pos = [], idx = [];
  const phase = [rnd() * 6, rnd() * 6, rnd() * 6];
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const h = height * (0.45 + 0.3 * Math.sin(a * 3 + phase[0]) + 0.18 * Math.sin(a * 7 + phase[1]) + 0.07 * Math.sin(a * 17 + phase[2]));
    pos.push(Math.cos(a) * r0, -2, Math.sin(a) * r0);
    pos.push(Math.cos(a) * r1, Math.max(4, h), Math.sin(a) * r1);
    if (i < N) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }  // front faces point at the house
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.MeshStandardMaterial({ color, roughness: 1 });
  m.name = 'hills' + seed;
  const mesh = new THREE.Mesh(g, m);
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  ctx.scene.add(mesh);
}
