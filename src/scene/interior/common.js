// Furniture and decor shared between rooms.

import * as THREE from 'three';
import { FLOOR_Y } from '../layout.js';
import { mulberry32 } from '../../core/rng.js';

const PROXY_MAT = new THREE.MeshBasicMaterial({ visible: false });

// Invisible raycast target for interactables whose visible meshes were merged.
export function proxy(kit, w, h, d, x, y, z, rotY = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), PROXY_MAT);
  m.position.set(x, y, z);
  m.rotation.y = rotY;
  m.userData.dynamic = true;
  m.castShadow = false;
  kit.ctx.scene.add(m);
  m.updateMatrixWorld(true);
  return m;
}

const BOOK_COLORS = [0xe8dcc4, 0x8b4a36, 0x2f4256, 0x3e5a46, 0x9a9488, 0xc49a4a, 0x6b2f33, 0x2a2a2c, 0xb8b0a0, 0x546670, 0xa86f4c, 0x7f8a6a];

// A row of books (or a flat stack when upright=false). at: [x, yBottom, z] in group space.
export function books(kit, g, at, count, width, depth, rnd = mulberry32(5), upright = false) {
  const c = new THREE.Color();
  let x = at[0] - width / 2;
  const end = at[0] + width / 2;
  for (let i = 0; i < count; i++) {
    const t = upright ? 0.018 + rnd() * 0.032 : 0.025 + rnd() * 0.02;
    const h = upright ? 0.17 + rnd() * 0.11 : 0.15 + rnd() * 0.08;
    const d = depth * (0.75 + rnd() * 0.25);
    if (upright && x + t > end) break;
    const geo = upright ? new THREE.BoxGeometry(t, h, d) : new THREE.BoxGeometry(h * 1.3, t, d);
    c.setHex(BOOK_COLORS[Math.floor(rnd() * BOOK_COLORS.length)]);
    const cols = new Float32Array(geo.attributes.position.count * 3);
    for (let k = 0; k < geo.attributes.position.count; k++) {
      // page edges (front/back faces of the block) are paper coloured
      const nz = geo.attributes.normal.getZ(k), nx = geo.attributes.normal.getX(k);
      const page = upright ? Math.abs(nz) < 0.5 && Math.abs(nx) < 0.5 && false : false;
      const pc = page ? [0.85, 0.82, 0.74] : [c.r, c.g, c.b];
      cols[k * 3] = pc[0]; cols[k * 3 + 1] = pc[1]; cols[k * 3 + 2] = pc[2];
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    const m = new THREE.Mesh(geo, kit.m('books'));
    m.castShadow = true; m.receiveShadow = true;
    if (upright) {
      m.position.set(x + t / 2, at[1] + h / 2, at[2] + (depth - d) * 0.5);
      if (i === count - 1 && rnd() < 0.5) { m.rotation.z = -0.18; m.position.x += 0.02; }
      x += t + 0.001;
    } else {
      m.position.set(at[0] + (rnd() - 0.5) * 0.02, at[1] + t / 2 + i * t, at[2]);
      m.rotation.y = (rnd() - 0.5) * 0.25;
    }
    g.add(m);
  }
}

export function vase(kit, key, r, h, mat, x, y, z) {
  const pts = [[0, 0], [r * 0.7, 0.002], [r, h * 0.25], [r * 0.95, h * 0.6], [r * 0.5, h * 0.88], [r * 0.45, h], [r * 0.38, h], [r * 0.4, h * 0.9], [0, h * 0.9]];
  return kit.lathe(`vase${key}|${r}|${h}`, pts, mat, x, y, z, 28);
}

export function rug(kit, mat, w, d, x, z, rotY = 0) {
  const g = kit.group(kit.mesh(new THREE.BoxGeometry(w, 0.012, d), mat, 0, 0.006, 0));
  g.children[0].castShadow = false;
  kit.place(g, x, z, rotY);
  kit.commit(g, { collider: null });
}

// Potted plant: lathe pot, soil, stems and textured leaf cards.
export function plant(kit, x, z, height = 1.2, seed = 1, potMat = 'ceramicMatte', y = FLOOR_Y) {
  const rnd = mulberry32(seed * 97);
  const g = kit.group();
  const pr = 0.16 + height * 0.06, ph = 0.28 + height * 0.12;
  g.add(kit.lathe(`pot${pr}|${ph}`, [[0, 0], [pr * 0.78, 0], [pr, ph * 0.12], [pr * 1.02, ph], [pr * 0.94, ph], [pr * 0.9, ph * 0.2], [0, ph * 0.2]], potMat, 0, 0, 0, 28));
  g.add(kit.cyl(pr * 0.92, pr * 0.92, 0.01, 'soil', 0, ph - 0.03, 0, 20));
  const leafGeo = kit._geo('leafcard', () => {
    const geo = new THREE.PlaneGeometry(0.42, 0.42, 1, 2);
    // bend the card slightly so it reads as foliage rather than a flat sheet
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, -Math.pow(p.getY(i) / 0.21, 2) * 0.05);
    geo.computeVertexNormals();
    return geo;
  });
  const n = Math.round(10 + height * 12);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, t = rnd();
    const yy = ph + 0.15 + t * (height - ph - 0.1);
    const r = (0.05 + (1 - Math.abs(t - 0.55)) * 0.22) * (0.7 + rnd() * 0.5) * (height / 1.2 + 0.2);
    const stem = kit.cyl(0.006, 0.008, yy - ph + 0.05, 'bark', Math.cos(a) * r * 0.4, ph + (yy - ph) / 2, Math.sin(a) * r * 0.4, 5);
    g.add(stem);
    const leaf = kit.mesh(leafGeo, 'plantLeaves', Math.cos(a) * r, yy, Math.sin(a) * r);
    leaf.rotation.set(-0.5 - rnd() * 0.6, -a + Math.PI / 2, (rnd() - 0.5) * 0.6, 'YXZ');
    const s = 0.8 + rnd() * 0.6;
    leaf.scale.set(s, s, s);
    g.add(leaf);
  }
  kit.place(g, x, z, rnd() * 6, y);
  kit.commit(g, { collider: { w: pr * 1.6, d: pr * 1.6, h: height } });
  return g;
}

// Lounge chair: wooden side frames, upholstered seat and back.
export function lounge(kit, cushion, wood) {
  const g = kit.group();
  for (const s of [-1, 1]) {
    g.add(kit.rbox(0.05, 0.6, 0.78, 0.02, wood, s * 0.38, 0.32, 0));
    g.add(kit.rbox(0.07, 0.04, 0.7, 0.015, wood, s * 0.38, 0.62, -0.02));
  }
  g.add(kit.rbox(0.72, 0.04, 0.7, 0.01, wood, 0, 0.2, 0));
  g.add(kit.rbox(0.7, 0.14, 0.66, 0.06, cushion, 0, 0.29, 0.03));
  const back = kit.rbox(0.7, 0.55, 0.14, 0.06, cushion, 0, 0.62, -0.3);
  back.rotation.x = -0.28;
  g.add(back);
  return g;
}

export function sideTable(kit) {
  const g = kit.group(
    kit.cyl(0.24, 0.24, 0.025, 'marble', 0, 0.52, 0, 32),
    kit.cyl(0.02, 0.02, 0.5, 'blackMetal', 0, 0.26, 0, 12),
    kit.cyl(0.16, 0.17, 0.02, 'blackMetal', 0, 0.01, 0, 24),
  );
  g.add(vase(kit, 'st', 0.045, 0.15, 'ceramic', 0.08, 0.5325, 0.05));
  return g;
}

// Floor lamp with drum shade; shadeMat is the light group's emissive material.
export function floorLamp(kit, shadeMat) {
  const g = kit.group(
    kit.cyl(0.17, 0.18, 0.03, 'marbleDark', 0, 0.015, 0, 32),
    kit.cyl(0.011, 0.011, 1.38, 'brass', 0, 0.72, 0, 10),
    kit.lathe('drum', [[0.2, 0], [0.205, 0], [0.205, 0.34], [0.2, 0.34]], shadeMat, 0, 1.3, 0, 40),
    kit.cyl(0.03, 0.03, 0.06, 'brass', 0, 1.38, 0, 12),
  );
  g.children[2].material = shadeMat;
  g.children[2].material.side = THREE.DoubleSide;
  return { group: g };
}

// Table lamp: ceramic base + shade (emissive group material).
export function tableLamp(kit, shadeMat, baseMat = 'ceramic') {
  const g = kit.group(
    kit.lathe('tlbase', [[0, 0], [0.07, 0], [0.09, 0.08], [0.08, 0.2], [0.03, 0.27], [0.012, 0.3], [0, 0.3]], baseMat, 0, 0, 0, 28),
    kit.cyl(0.006, 0.006, 0.12, 'brass', 0, 0.34, 0, 8),
    kit.lathe('tlshade', [[0.15, 0], [0.152, 0], [0.11, 0.2], [0.108, 0.2]], shadeMat, 0, 0.3, 0, 36),
  );
  shadeMat.side = THREE.DoubleSide;
  return g;
}

// Framed art: thin black frame, white mat, canvas texture.
export function artFrame(kit, artMat, w, h) {
  const g = kit.group();
  const f = 0.03, d = 0.035;
  g.add(kit.box(w, f, d, 'blackMetal', 0, h / 2 - f / 2, 0));
  g.add(kit.box(w, f, d, 'blackMetal', 0, -h / 2 + f / 2, 0));
  g.add(kit.box(f, h - 2 * f, d, 'blackMetal', -w / 2 + f / 2, 0, 0));
  g.add(kit.box(f, h - 2 * f, d, 'blackMetal', w / 2 - f / 2, 0, 0));
  g.add(kit.box(w - 2 * f, h - 2 * f, 0.004, 'whiteMatte', 0, 0, -d / 2 + 0.006));
  const art = kit.mesh(new THREE.PlaneGeometry(w - 0.18, h - 0.18), artMat, 0, 0, -d / 2 + 0.009);
  g.add(art);
  return g;
}
