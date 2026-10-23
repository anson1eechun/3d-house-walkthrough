// Procedural vegetation: branching trees with textured leaf cards, hedges and
// shrubs. Each tree variant is generated once (trunk + foliage geometries) and
// drawn with InstancedMesh for every placement.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from '../core/rng.js';
import { boxProjectUV } from './builder.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function normalise(geo) {
  // keep only position/normal/uv, indexed, so variants merge cleanly
  const g = geo.index ? geo : geo.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.index) { const idx = []; for (let i = 0; i < g.attributes.position.count; i++) idx.push(i); g.setIndex(idx); }
  return g;
}

function leafCard(size) {
  const g = new THREE.PlaneGeometry(size, size, 1, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, -Math.pow(p.getY(i) / (size / 2), 2) * size * 0.12);
  g.computeVertexNormals();
  return g;
}

// Returns { trunk, leaves } geometries in tree-local space (base at origin).
export function makeTreeGeometry(seed, { height = 7, crown = 2.6, trunkR = 0.16, leafSize = 0.9, clusters = 34, cardsPer = 9, conifer = false } = {}) {
  const rnd = mulberry32(seed);
  const wood = [], leaves = [];
  const branch = (start, dir, len, r0, r1, depth) => {
    const segs = 3;
    let p = start.clone(), d = dir.clone().normalize();
    for (let i = 0; i < segs; i++) {
      const l = len / segs;
      const ra = r0 + (r1 - r0) * (i / segs), rb = r0 + (r1 - r0) * ((i + 1) / segs);
      const c = new THREE.CylinderGeometry(rb, ra, l, depth === 0 ? 10 : 6, 1, true);
      c.translate(0, l / 2, 0);
      _q.setFromUnitVectors(UP, d);
      c.applyMatrix4(_m.compose(p, _q, _s.set(1, 1, 1)));
      wood.push(boxProjectUV(c, 1));
      p = p.clone().addScaledVector(d, l);
      d.x += (rnd() - 0.5) * 0.25; d.z += (rnd() - 0.5) * 0.25; d.y += 0.05; d.normalize();
    }
    return p;
  };
  const top = new THREE.Vector3(0, 0, 0);
  const trunkLen = conifer ? height * 0.95 : height * 0.45;
  const trunkTop = branch(top, new THREE.Vector3((rnd() - 0.5) * 0.08, 1, (rnd() - 0.5) * 0.08), trunkLen, trunkR, trunkR * 0.55, 0);
  const tips = [];
  if (conifer) {
    for (let i = 0; i < clusters; i++) {
      const t = i / clusters;
      const y = height * (0.2 + 0.75 * t);
      const a = rnd() * Math.PI * 2, r = crown * (1 - t) * (0.6 + rnd() * 0.4);
      tips.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r));
    }
  } else {
    const nb = 5 + Math.floor(rnd() * 3);
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * Math.PI * 2 + rnd() * 0.6;
      const startY = trunkLen * (0.6 + rnd() * 0.4);
      const s = new THREE.Vector3(0, startY, 0);
      const dir = new THREE.Vector3(Math.cos(a), 0.9 + rnd() * 0.6, Math.sin(a));
      const end = branch(s, dir, height * (0.3 + rnd() * 0.15), trunkR * 0.5, trunkR * 0.18, 1);
      tips.push(end);
      // secondary twigs
      for (let k = 0; k < 2; k++) {
        const d2 = dir.clone().add(new THREE.Vector3((rnd() - 0.5) * 1.2, 0.3, (rnd() - 0.5) * 1.2));
        tips.push(branch(end.clone().lerp(s, 0.35), d2, height * 0.16, trunkR * 0.16, trunkR * 0.06, 2));
      }
    }
    tips.push(trunkTop);
  }
  // foliage clusters around tips + filler inside the crown
  const card = leafCard(leafSize);
  const centre = new THREE.Vector3(0, conifer ? height * 0.5 : trunkLen + (height - trunkLen) * 0.5, 0);
  const placeCards = (c, n, spread) => {
    for (let k = 0; k < n; k++) {
      const g = card.clone();
      const off = new THREE.Vector3((rnd() - 0.5), (rnd() - 0.3), (rnd() - 0.5)).multiplyScalar(spread);
      const pos = c.clone().add(off);
      // orient cards roughly outward from the crown centre, with jitter
      const out = pos.clone().sub(centre).normalize();
      _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), out.lerp(new THREE.Vector3(rnd() - 0.5, rnd() - 0.2, rnd() - 0.5), 0.6).normalize());
      const sc = 0.7 + rnd() * 0.6;
      g.applyMatrix4(_m.compose(pos, _q, _s.set(sc, sc, sc)));
      leaves.push(g);
    }
  };
  for (const t of tips) placeCards(t, cardsPer, crown * 0.55);
  for (let i = 0; i < clusters; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * crown * 0.8;
    const y = conifer ? height * (0.25 + rnd() * 0.65) : centre.y + (rnd() - 0.4) * (height - trunkLen) * 0.7;
    const rr = conifer ? r * (1 - (y / height)) : r;
    placeCards(new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr), 3, crown * 0.35);
  }
  return {
    trunk: mergeGeometries(wood.map(normalise), false),
    leaves: mergeGeometries(leaves.map(normalise), false),
  };
}

// Instanced placement of one variant. transforms: [{x, y, z, s, r}]
export function plantTrees(ctx, geos, transforms, { bark, leaves }) {
  const n = transforms.length;
  const t = new THREE.InstancedMesh(geos.trunk, bark, n);
  const l = new THREE.InstancedMesh(geos.leaves, leaves, n);
  transforms.forEach((tr, i) => {
    _q.setFromAxisAngle(UP, tr.r || 0);
    _m.compose(_p.set(tr.x, tr.y || 0, tr.z), _q, _s.set(tr.s, tr.s, tr.s));
    t.setMatrixAt(i, _m); l.setMatrixAt(i, _m);
    ctx.collision.addOBB({ cx: tr.x, cz: tr.z, hx: 0.22 * tr.s, hz: 0.22 * tr.s, minY: 0, maxY: 3, tag: 'tree', occludes: false });
  });
  for (const m of [t, l]) {
    m.castShadow = true; m.receiveShadow = true;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    ctx.scene.add(m);
  }
  return [t, l];
}

// Hedge rows: dark core box + leaf cards on the surfaces (one InstancedMesh for all cards).
export function buildHedges(ctx, rows, { core, leaves }) {
  const rnd = mulberry32(404);
  const cardGeo = leafCard(0.55);
  const mats = [];
  for (const r of rows) {
    const len = Math.hypot(r.x1 - r.x0, r.z1 - r.z0);
    const ang = Math.atan2(-(r.z1 - r.z0), r.x1 - r.x0);
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    const h = r.h || 1.6, w = r.w || 0.8;
    ctx.builder.box([cx - len / 2, 0, cz - w / 2 + 0.06], [cx + len / 2, h - 0.08, cz + w / 2 - 0.06], core, { rotY: ang, zone: 'ext', collider: { tag: 'hedge', occludes: false } });
    const area = len * (h * 2 + w);
    const n = Math.floor(area * 7);
    for (let i = 0; i < n; i++) {
      const u = rnd() - 0.5;
      const face = rnd();
      let lx, ly, lz, nx, ny, nz;
      if (face < 0.38) { lx = u * len; ly = rnd() * h; lz = w / 2; nx = 0; ny = 0; nz = 1; }
      else if (face < 0.76) { lx = u * len; ly = rnd() * h; lz = -w / 2; nx = 0; ny = 0; nz = -1; }
      else { lx = u * len; ly = h; lz = (rnd() - 0.5) * w; nx = 0; ny = 1; nz = 0; }
      const out = new THREE.Vector3(nx + (rnd() - 0.5) * 0.9, ny + (rnd() - 0.5) * 0.9, nz + (rnd() - 0.5) * 0.9).normalize();
      _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), out);
      const rq = new THREE.Quaternion().setFromAxisAngle(UP, ang);
      _q.premultiply(rq);
      const lp = new THREE.Vector3(lx, ly - 0.05, lz).applyAxisAngle(UP, ang);
      const sc = 0.8 + rnd() * 0.5;
      mats.push(new THREE.Matrix4().compose(new THREE.Vector3(cx + lp.x, lp.y, cz + lp.z), _q.clone(), new THREE.Vector3(sc, sc, sc)));
    }
  }
  const im = new THREE.InstancedMesh(cardGeo, leaves, mats.length);
  mats.forEach((m, i) => im.setMatrixAt(i, m));
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = true; im.receiveShadow = true;
  im.computeBoundingSphere();
  ctx.scene.add(im);
  return im;
}

// Round shrubs made of leaf cards (one InstancedMesh for all).
export function buildShrubs(ctx, spots, leaves) {
  const rnd = mulberry32(505);
  const cardGeo = leafCard(0.45);
  const mats = [];
  for (const s of spots) {
    const r = s.r || 0.5;
    const n = Math.floor(18 + r * r * 60);
    for (let i = 0; i < n; i++) {
      const d = new THREE.Vector3(rnd() - 0.5, rnd() * 0.8, rnd() - 0.5).normalize();
      const p = new THREE.Vector3(s.x, (s.y || 0) + r * 0.85, s.z).addScaledVector(d, r * (0.55 + rnd() * 0.45));
      _q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), d.clone().add(new THREE.Vector3((rnd() - 0.5) * 0.7, 0.2, (rnd() - 0.5) * 0.7)).normalize());
      const sc = (0.7 + rnd() * 0.5) * Math.min(1.3, 0.6 + r);
      mats.push(new THREE.Matrix4().compose(p, _q.clone(), new THREE.Vector3(sc, sc, sc)));
    }
    if (s.collide !== false) ctx.collision.addOBB({ cx: s.x, cz: s.z, hx: r * 0.7, hz: r * 0.7, minY: 0, maxY: r * 1.6, tag: 'shrub', occludes: false });
  }
  const im = new THREE.InstancedMesh(cardGeo, leaves, mats.length);
  mats.forEach((m, i) => im.setMatrixAt(i, m));
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = true; im.receiveShadow = true;
  im.computeBoundingSphere();
  ctx.scene.add(im);
  return im;
}
