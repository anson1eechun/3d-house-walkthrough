import * as THREE from 'three';
import { FLOOR_Y, H_PRI } from '../layout.js';
import { ToggleFurniture, slidePart, hingePart, Y_AXIS } from '../../interaction/furniture.js';
import { makeDrawer, makeDoor } from './kitchen.js';
import { plant, rug, lounge, sideTable, tableLamp, artFrame, books, vase, proxy } from './common.js';
import { mulberry32 } from '../../core/rng.js';

const F = FLOOR_Y;

export function buildBedrooms(env) {
  const { ctx, kit, groups, fx } = env;
  const M = ctx.materials;
  let uid = 0;
  const reg = (zone, label, meshes, parts, opts = {}) => {
    const it = new ToggleFurniture(ctx, { id: zone + '-' + (uid++), label, meshes, parts, ...opts });
    it.zone = zone;
    ctx.interaction.add(it);
    return it;
  };

  // ============================================================ BED 1 ====
  bed(kit, { W: 2.0, Lm: 2.05, x: 3.56 + 1.16, z: -3.9, rot: Math.PI / 2, duvet: 'linen', throwMat: 'fabricBlue', head: 'fabricSofa' });
  rug(kit, 'rugBed', 2.6, 3.4, 5.55, -3.9, Math.PI / 2);
  for (const z of [-5.33, -2.47]) {
    const ns = nightstand(kit, ctx, 'bed1');
    kit.place(ns.group, 3.56 + 0.23, z, Math.PI / 2);
    kit.commit(ns.group, { collider: { w: 0.5, d: 0.44, h: 0.5 } });
    reg('bed1', '床頭櫃抽屜', [ns.drawer.front], [slidePart(ns.drawer.obj, 0, 0, ns.drawer.travel)]);
    const lampMat = ctx.lighting.emissive(groups.bed1Lamp, { color: 0xffd4a0, intensity: 5, base: 0xf1e8da });
    const lamp = tableLamp(kit, lampMat);
    kit.place(lamp, 3.56 + 0.2, z + 0.04, 0, F + 0.5);
    kit.commit(lamp, { collider: null });
    fx.point(groups.bed1Lamp, 3.56 + 0.2, F + 0.92, z + 0.04, { intensity: 2.6, color: 0xffcc90 });
    const p = proxy(kit, 0.34, 0.5, 0.34, 3.56 + 0.2, F + 0.75, z + 0.04);
    ctx.lighting.addLamp(groups.bed1Lamp, [p], '床頭燈');
  }
  // bench at the foot of the bed
  {
    const g = kit.group(kit.rbox(1.4, 0.12, 0.42, 0.04, 'fabricCharcoal', 0, 0.4, 0));
    for (const x of [-0.62, 0.62]) for (const z of [-0.16, 0.16]) g.add(kit.cyl(0.015, 0.012, 0.34, 'oakLight', x, 0.17, z, 10));
    kit.place(g, 6.1, -3.9, Math.PI / 2);
    kit.commit(g);
  }
  // wardrobe on the east wall (4 hinged doors, 2 interactive pairs)
  wardrobeHinged(kit, ctx, reg, 'bed1', { cx: 8.44 - 0.31, cz: -2.3, L: 2.6 });
  // armchair by the window
  {
    const g = lounge(kit, 'fabricRust', 'walnut');
    kit.place(g, 7.35, -5.95, -0.55);
    kit.commit(g, { shrink: 0.05 });
    const st = sideTable(kit);
    kit.place(st, 7.95, -6.45, 0);
    kit.commit(st);
  }
  {
    const a = artFrame(kit, M.get('art2'), 1.3, 0.75);
    kit.place(a, 3.56 + 0.02, -3.9, Math.PI / 2, F + 1.78);
    kit.commit(a, { collider: null });
  }
  curtains(kit, 4.6, 7.6, -6.875, H_PRI);
  plant(kit, 4.1, -6.45, 1.1, 101);
  fx.downlight(groups.bed1, 6.1, -3.8, H_PRI, { intensity: 14, angle: 1.15, shadow: true, fixture: false });
  ceilingDisc(kit, ctx, groups.bed1, 6.1, -3.8);
  fx.downlight(groups.bed1, 8.0, -1.4, H_PRI, { light: false });

  // ============================================================ BED 2 ====
  bed(kit, { W: 1.6, Lm: 2.0, x: 12.875 - 1.13, z: -4.05, rot: -Math.PI / 2, duvet: 'fabricOlive', throwMat: 'fabricCharcoal', head: 'fabricCharcoal' });
  rug(kit, 'rugLiving', 2.2, 2.8, 10.9, -4.0, Math.PI / 2);
  {
    const ns = nightstand(kit, ctx, 'bed2');
    kit.place(ns.group, 12.875 - 0.23, -5.28, -Math.PI / 2);
    kit.commit(ns.group, { collider: { w: 0.5, d: 0.44, h: 0.5 } });
    reg('bed2', '床頭櫃抽屜', [ns.drawer.front], [slidePart(ns.drawer.obj, 0, 0, ns.drawer.travel)]);
    const lampMat = ctx.lighting.emissive(groups.bed2Lamp, { color: 0xffd4a0, intensity: 5, base: 0xe9e2d6 });
    const lamp = tableLamp(kit, lampMat, 'ceramicMatte');
    kit.place(lamp, 12.875 - 0.2, -5.32, 0, F + 0.5);
    kit.commit(lamp, { collider: null });
    fx.point(groups.bed2Lamp, 12.875 - 0.2, F + 0.92, -5.32, { intensity: 2.6, color: 0xffcc90 });
    const p = proxy(kit, 0.34, 0.5, 0.34, 12.875 - 0.2, F + 0.75, -5.32);
    ctx.lighting.addLamp(groups.bed2Lamp, [p], '檯燈');
  }
  // desk under the north window with drawer and office chair
  {
    const g = kit.group();
    g.add(kit.rbox(1.4, 0.03, 0.6, 0.008, 'oakLight', 0, 0.735, 0));
    for (const x of [-0.66, 0.66]) {
      g.add(kit.box(0.03, 0.72, 0.03, 'blackMetal', x, 0.36, -0.27));
      g.add(kit.box(0.03, 0.72, 0.03, 'blackMetal', x, 0.36, 0.27));
      g.add(kit.box(0.03, 0.03, 0.55, 'blackMetal', x, 0.05, 0));
    }
    g.add(kit.box(0.42, 0.14, 0.52, 'oakLight', 0.42, 0.65, -0.02));
    const dr = makeDrawer(kit, { w: 0.42, h: 0.13, d: 0.5, x: 0.42, y: 0.65, z: 0.25, front: 'oakLight', handle: 'blackMetal' });
    g.add(dr.obj);
    // desk lamp (part of the bed2 lamp group) + books + laptop
    const lampMat = ctx.lighting.emissive(groups.bed2Lamp, { color: 0xfff0d8, intensity: 6, base: 0x222222 });
    g.add(kit.cyl(0.07, 0.08, 0.02, 'blackMetal', -0.5, 0.76, -0.15, 20));
    g.add(kit.tube('desklamp', [[-0.5, 0.76, -0.15], [-0.5, 1.05, -0.12], [-0.4, 1.18, 0.0], [-0.3, 1.14, 0.08]], 0.008, 'blackMetal', 24));
    const shade = kit.lathe('dlshade', [[0.0, 0.05], [0.05, 0.04], [0.07, 0.0], [0.068, 0.0], [0.0, 0.0]], 'blackMetal', -0.3, 1.1, 0.08, 24);
    g.add(shade);
    g.add(kit.cyl(0.055, 0.055, 0.004, lampMat, -0.3, 1.098, 0.08, 20));
    books(kit, g, [0.1, 0.75, -0.18], 3, 0.3, 0.22, mulberry32(33));
    g.add(kit.rbox(0.33, 0.012, 0.23, 0.004, 'darkMetal', -0.05, 0.756, 0.08));
    kit.place(g, 10.3, -6.875 + 0.3, 0);
    kit.commit(g, { collider: { w: 1.4, d: 0.6, h: 0.76 } });
    reg('bed2', '書桌抽屜', [dr.front], [slidePart(dr.obj, 0, 0, dr.travel * 0.8)]);
    fx.point(groups.bed2Lamp, 10.3 - 0.3, F + 1.02, -6.575 + 0.08, { intensity: 1.6, color: 0xfff0d8 });
    const p = proxy(kit, 0.3, 0.45, 0.35, 10.0, F + 0.95, -6.5);
    ctx.lighting.addLamp(groups.bed2Lamp, [p], '檯燈');
    officeChair(kit, 10.3, -5.95, Math.PI + 0.25);
    // floating shelves on the west wall beside the desk
    for (const [y, n] of [[1.45, 9], [1.85, 6]]) {
      const s = kit.group(kit.box(1.1, 0.03, 0.22, 'walnut', 0, 0, 0));
      books(kit, s, [-0.2, 0.015, 0], n, 0.5, 0.18, mulberry32(y * 10), true);
      s.add(vase(kit, 'bs' + n, 0.045, 0.14, 'ceramic', 0.35, 0.015, 0));
      kit.place(s, 8.56 + 0.11, -5.6, Math.PI / 2, F + y);
      kit.commit(s, { collider: null });
    }
  }
  wardrobeSliding(kit, ctx, reg, 'bed2', { cx: 8.56 + 0.31, cz: -2.85, L: 2.2 });
  curtains(kit, 9.4, 11.8, -6.875, H_PRI);
  plant(kit, 12.45, -1.1, 1.0, 103, 'terracotta');
  fx.downlight(groups.bed2, 10.7, -3.8, H_PRI, { intensity: 12, angle: 1.15, fixture: false });
  ceilingDisc(kit, ctx, groups.bed2, 10.7, -3.8);
}

// Upholstered bed. Local: headboard at -z, origin at the footprint centre.
function bed(kit, { W, Lm, x, z, rot, duvet, throwMat, head }) {
  const g = kit.group();
  const L = Lm + 0.12;
  g.add(kit.rbox(W - 0.1, 0.1, L - 0.2, 0.02, 'rubber', 0, 0.05, 0.02));
  g.add(kit.rbox(W + 0.1, 0.22, L, 0.04, head, 0, 0.21, 0));
  g.add(kit.rbox(W + 0.3, 1.12, 0.1, 0.05, head, 0, 0.62, -L / 2 - 0.02));
  // mattress
  g.add(kit.rbox(W - 0.04, 0.24, Lm - 0.04, 0.07, 'linen', 0, 0.44, 0.04));
  // duvet with a folded top band and soft overhang
  const dz0 = -Lm / 2 + 0.6, dz1 = L / 2 + 0.02;
  g.add(kit.rbox(W + 0.06, 0.09, dz1 - dz0, 0.045, duvet, 0, 0.585, (dz0 + dz1) / 2));
  g.add(kit.rbox(W + 0.07, 0.1, 0.28, 0.05, duvet, 0, 0.62, dz0 + 0.1));
  for (const s of [-1, 1]) {
    const side = kit.rbox(0.05, 0.28, dz1 - dz0 - 0.04, 0.02, duvet, s * (W / 2 + 0.035), 0.48, (dz0 + dz1) / 2);
    side.rotation.z = s * 0.06;
    g.add(side);
  }
  g.add(kit.rbox(W + 0.12, 0.035, 0.55, 0.015, throwMat, 0, 0.64, L / 2 - 0.42));
  // pillows
  const pw = W > 1.8 ? 0.68 : 0.62;
  for (const s of [-1, 1]) {
    const p1 = kit.rbox(pw, 0.46, 0.17, 0.08, 'linen', s * (W / 4 + 0.02), 0.78, -Lm / 2 + 0.22);
    p1.rotation.x = -0.32; g.add(p1);
    const p2 = kit.rbox(pw * 0.92, 0.36, 0.15, 0.07, duvet === 'linen' ? 'fabricSofa' : 'linen', s * (W / 4 + 0.02), 0.74, -Lm / 2 + 0.36);
    p2.rotation.x = -0.22; g.add(p2);
  }
  const acc = kit.rbox(0.48, 0.32, 0.14, 0.06, throwMat, 0, 0.72, -Lm / 2 + 0.48);
  acc.rotation.x = -0.18; g.add(acc);
  kit.place(g, x, z, rot);
  kit.commit(g, { collider: { w: W + 0.1, d: L + 0.12, h: 0.65, z: -0.04 } });
}

function nightstand(kit, ctx) {
  const g = kit.group();
  g.add(kit.rbox(0.5, 0.035, 0.44, 0.008, 'walnut', 0, 0.48, 0));
  g.add(kit.box(0.5, 0.025, 0.42, 'walnut', 0, 0.12, -0.01));
  for (const x of [-0.235, 0.235]) g.add(kit.box(0.03, 0.36, 0.42, 'walnut', x, 0.3, -0.01));
  g.add(kit.box(0.44, 0.36, 0.01, 'walnut', 0, 0.3, -0.215));
  for (const [x, z] of [[-0.2, -0.17], [0.2, -0.17], [-0.2, 0.17], [0.2, 0.17]]) g.add(kit.cyl(0.012, 0.01, 0.12, 'brass', x, 0.06, z, 8));
  const dr = makeDrawer(kit, { w: 0.44, h: 0.15, d: 0.38, x: 0, y: 0.385, z: 0.2, front: 'walnut', handle: 'brass' });
  g.add(dr.obj);
  books(kit, g, [0.02, 0.135, 0.0], 2, 0.3, 0.24, mulberry32(2));
  return { group: g, drawer: dr };
}

function ceilingDisc(kit, ctx, group, x, z) {
  const glow = ctx.lighting.emissive(group, { color: 0xffe6c8, intensity: 5, base: 0xf8f6f2 });
  const g = kit.group(
    kit.cyl(0.26, 0.26, 0.02, 'whiteMatte', 0, -0.01, 0, 40),
    kit.cyl(0.235, 0.235, 0.004, glow, 0, -0.022, 0, 40),
  );
  g.children.forEach(c => { c.castShadow = false; });
  kit.place(g, x, z, 0, H_PRI);
  kit.commit(g, { collider: null });
}

function wardrobeHinged(kit, ctx, reg, zone, { cx, cz, L }) {
  const g = kit.group();     // facing -x: rotY = -PI/2, local x -> world +z
  const D = 0.62, H = 2.4, T = 0.02;
  g.add(kit.box(L, 0.08, D - 0.06, 'rubber', 0, 0.04, -0.03));
  g.add(kit.box(L, T, D, 'oakLight', 0, H - T / 2, 0));
  g.add(kit.box(L, T, D, 'oakLight', 0, 0.08 + T / 2, 0));
  g.add(kit.box(L, H, 0.012, 'oakLight', 0, H / 2, -D / 2 + 0.006));
  for (const x of [-L / 2 + T / 2, 0, L / 2 - T / 2]) g.add(kit.box(T, H - 0.08, D - 0.02, 'oakLight', x, 0.08 + (H - 0.08) / 2, -0.01));
  g.add(kit.box(L, H_PRI - F - H, D, 'plaster', 0, H + (H_PRI - F - H) / 2, 0));
  // interior: shelves on one side, hanging rail with clothes on the other
  for (const y of [0.45, 0.9, 1.35, 1.8]) g.add(kit.box(L / 2 - 0.04, 0.018, D - 0.06, 'oakLight', -L / 4, y, -0.02));
  const rnd = mulberry32(44);
  for (const y of [0.459, 0.909, 1.359]) {
    for (let i = 0; i < 3; i++) g.add(kit.rbox(0.32, 0.12 + rnd() * 0.08, 0.36, 0.04, ['linen', 'fabricBlue', 'fabricCharcoal', 'fabricSofa'][Math.floor(rnd() * 4)], -L / 2 + 0.25 + i * 0.36, y + 0.08, -0.04));
  }
  g.add(kit.cyl(0.012, 0.012, L / 2 - 0.04, 'chrome', L / 4, 1.95, -0.02, 10).rotateZ(Math.PI / 2));
  for (let i = 0; i < 9; i++) {
    const c = kit.rbox(0.05, 0.85 + rnd() * 0.3, 0.46, 0.02, ['fabricCharcoal', 'linen', 'fabricBlue', 'fabricOlive', 'fabricRust', 'fabricSofa'][Math.floor(rnd() * 6)], 0.08 + i * 0.12, 1.42 - rnd() * 0.12, -0.02);
    g.add(c);
  }
  const fz = D / 2 + 0.0095, dh = H - 0.12, dy = 0.1 + dh / 2, dw = L / 4;
  const pairs = [];
  for (let p = 0; p < 2; p++) {
    const a = makeDoor(kit, { w: dw, h: dh, x: -L / 2 + dw * (p * 2 + 0.5), y: dy, z: fz, hingeLeft: true, mat: 'oakLight', handle: 'blackMetal' });
    const b = makeDoor(kit, { w: dw, h: dh, x: -L / 2 + dw * (p * 2 + 1.5), y: dy, z: fz, hingeLeft: false, mat: 'oakLight', handle: 'blackMetal' });
    g.add(a.obj, b.obj);
    pairs.push([a, b]);
  }
  kit.place(g, cx, cz, -Math.PI / 2);
  kit.commit(g, { collider: { w: L, d: D, h: H } });
  for (const [a, b] of pairs) {
    reg(zone, '衣櫃', [a.front, b.front], [hingePart(a.obj, Y_AXIS, a.angle * 0.95), hingePart(b.obj, Y_AXIS, b.angle * 0.95)], {
      duration: 0.9, sound: 'drawer',
      colliders: [{ object: a.front, w: dw, d: 0.05, h: dh, y0: F + 0.1, local: [0, 0] }, { object: b.front, w: dw, d: 0.05, h: dh, y0: F + 0.1, local: [0, 0] }],
    });
  }
}

function wardrobeSliding(kit, ctx, reg, zone, { cx, cz, L }) {
  const g = kit.group();     // facing +x: rotY = PI/2
  const D = 0.62, H = 2.4, T = 0.02;
  g.add(kit.box(L, 0.08, D - 0.08, 'rubber', 0, 0.04, -0.04));
  g.add(kit.box(L, T, D, 'whiteMatte', 0, H - T / 2, 0));
  g.add(kit.box(L, H, 0.012, 'whiteMatte', 0, H / 2, -D / 2 + 0.006));
  for (const x of [-L / 2 + T / 2, L / 2 - T / 2]) g.add(kit.box(T, H, D, 'whiteMatte', x, H / 2, 0));
  g.add(kit.box(L, H_PRI - F - H, D, 'plaster', 0, H + (H_PRI - F - H) / 2, 0));
  g.add(kit.box(L - 0.04, 0.02, D - 0.1, 'oakLight', 0, 1.8, -0.04));
  g.add(kit.cyl(0.012, 0.012, L - 0.06, 'chrome', 0, 1.7, -0.04, 10).rotateZ(Math.PI / 2));
  const rnd = mulberry32(57);
  for (let i = 0; i < 14; i++) g.add(kit.rbox(0.05, 0.8 + rnd() * 0.35, 0.44, 0.02, ['fabricCharcoal', 'linen', 'fabricBlue', 'fabricOlive', 'fabricRust'][Math.floor(rnd() * 5)], -L / 2 + 0.15 + i * 0.14, 1.25 - rnd() * 0.12, -0.04));
  // two sliding panels on separate tracks
  const pw = L / 2 + 0.03, ph = H - 0.12;
  const mk = (x, z, mat) => {
    const d = kit.group(kit.rbox(pw, ph, 0.022, 0.004, mat, 0, 0, 0), kit.box(0.02, 0.5, 0.025, 'blackMetal', 0, 0, 0.018));
    d.children[1].position.x = x < 0 ? pw / 2 - 0.06 : -pw / 2 + 0.06;
    d.position.set(x, 0.09 + ph / 2, z);
    kit.dynamic(d);
    g.add(d);
    return d;
  };
  const back = mk(-L / 4 + 0.015, D / 2 - 0.03, 'greigeLacquer');
  const front = mk(L / 4 - 0.015, D / 2 + 0.005, 'oakLight');
  g.add(kit.box(L, 0.03, 0.08, 'blackMetal', 0, H - 0.03, D / 2 - 0.01));
  kit.place(g, cx, cz, Math.PI / 2);
  kit.commit(g, { collider: { w: L, d: D + 0.04, h: H } });
  reg(zone, '衣櫃拉門', [front.children[0], back.children[0]], [slidePart(front, -(L / 2 - 0.06), 0, 0)], { duration: 1.1, sound: 'window' });
}

function officeChair(kit, x, z, rot) {
  const g = kit.group();
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2;
    const leg = kit.box(0.3, 0.025, 0.04, 'darkMetal', Math.cos(a) * 0.15, 0.07, Math.sin(a) * 0.15);
    leg.rotation.y = -a;
    g.add(leg);
    g.add(kit.sphere(0.025, 'rubber', Math.cos(a) * 0.3, 0.025, Math.sin(a) * 0.3, 10, 8));
  }
  g.add(kit.cyl(0.025, 0.03, 0.36, 'chrome', 0, 0.26, 0, 12));
  g.add(kit.rbox(0.48, 0.07, 0.46, 0.03, 'fabricCharcoal', 0, 0.47, 0));
  const back = kit.rbox(0.44, 0.5, 0.06, 0.03, 'fabricCharcoal', 0, 0.82, -0.22);
  back.rotation.x = -0.12;
  g.add(back);
  g.add(kit.box(0.04, 0.3, 0.03, 'darkMetal', 0, 0.62, -0.24));
  kit.place(g, x, z, rot);
  kit.commit(g, { shrink: 0.08 });
}

// Sheer curtains gathered at both ends of a window (static).
function curtains(kit, x0, x1, wallZ, ceil) {
  const geo = kit._geo('curtain', () => {
    const w = 0.42, h = ceil - FLOOR_Y - 0.08, seg = 24;
    const g = new THREE.PlaneGeometry(w, h, seg, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) / w * Math.PI * 7) * 0.035);
    g.computeVertexNormals();
    g.translate(0, h / 2, 0);
    return g;
  });
  for (const x of [x0 - 0.12, x1 + 0.12]) {
    const g = kit.group(kit.mesh(geo, 'curtain', 0, 0, 0));
    kit.place(g, x, wallZ + 0.12, 0, FLOOR_Y + 0.02);
    kit.commit(g, { collider: null });
  }
  const rod = kit.group(kit.cyl(0.012, 0.012, x1 - x0 + 0.7, 'blackMetal', 0, 0, 0, 10).rotateZ(Math.PI / 2));
  kit.place(rod, (x0 + x1) / 2, wallZ + 0.12, 0, ceil - 0.06);
  kit.commit(rod, { collider: null });
}
