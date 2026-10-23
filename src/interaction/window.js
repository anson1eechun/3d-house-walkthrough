// Window frames, glazing and operable sashes, plus the living room glass wall
// with its lift-and-slide door. Fixed parts are merged into the static batch;
// operable sashes are animated groups registered with the interaction manager.

import * as THREE from 'three';
import { Interactable } from './interactionManager.js';
import { ToggleAnimation } from './animator.js';
import { FLOOR_Y, zoneAt } from '../scene/layout.js';
import { boxProjectUV } from '../scene/builder.js';
import { wallFrame } from './door.js';
import { LAYER } from '../core/layers.js';

const FW = 0.055;   // outer frame face width
const FD = 0.09;    // outer frame depth
const SW = 0.05;    // sash face width
const SD = 0.065;   // sash depth
const GLASS_T = 0.012;

function box(w, h, d, mat) {
  const m = new THREE.Mesh(boxProjectUV(new THREE.BoxGeometry(w, h, d), 1), mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

function glass(w, h, mat) {
  const g = boxProjectUV(new THREE.BoxGeometry(w, h, GLASS_T), 1);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = false; m.receiveShadow = false;
  m.userData.noShadow = true;
  m.userData.layer = LAYER.MAIN_ONLY;
  m.layers.set(LAYER.MAIN_ONLY);
  m.renderOrder = 2;
  return m;
}

// Rectangle of four bars in the local xy plane; x centred, y from 0 to h.
function rectFrame(parent, w, h, fw, fd, mat, z = 0) {
  const parts = [
    box(w, fw, fd, mat), box(w, fw, fd, mat),
    box(fw, h - 2 * fw, fd, mat), box(fw, h - 2 * fw, fd, mat),
  ];
  parts[0].position.set(0, fw / 2, z);
  parts[1].position.set(0, h - fw / 2, z);
  parts[2].position.set(-w / 2 + fw / 2, h / 2, z);
  parts[3].position.set(w / 2 - fw / 2, h / 2, z);
  parent.add(...parts);
  return parts;
}

// Which wall-space z direction points outdoors for this opening.
function outsideSign(wall, opening) {
  const c = (opening.from + opening.to) / 2;
  const y = FLOOR_Y + (opening.sill + opening.head) / 2;
  const probe = (s) => wall.axis === 'x' ? zoneAt(c, y, wall.at + s * 0.6) : zoneAt(wall.at - s * 0.6, y, c);
  // wall-space +z maps to world +z (x-walls) or world -x (z-walls, frame rotated -90deg)
  return probe(1) === 'ext' ? 1 : -1;
}

class OperableWindow extends Interactable {
  constructor(ctx, id, label, parts, colliderSpecs, { duration = 1.1 } = {}) {
    super({ id, type: 'window', label, reach: 2.4 });
    this.ctx = ctx;
    this.colliderSpecs = colliderSpecs;   // [{ object, w, d, h, y0, local:[cx,cz] }]
    this.colliders = colliderSpecs.map(s => ctx.collision.addOBB({ cx: 0, cz: 0, hx: s.w / 2, hz: s.d / 2, minY: s.y0, maxY: s.y0 + s.h, dynamic: true, tag: id }));
    this.anim = new ToggleAnimation(ctx.hub, parts, {
      duration, name: id,
      onTick: () => { this._sync(); ctx.markShadowsDirty(); },
    });
    this.anim.on(k => { if (k === 'end') ctx.onWindowState?.(this); });
  }
  _sync() {
    const v = new THREE.Vector3(), q = new THREE.Quaternion(), e = new THREE.Euler();
    this.colliderSpecs.forEach((s, i) => {
      s.object.updateWorldMatrix(true, false);
      v.set(s.local[0], 0, s.local[1]).applyMatrix4(s.object.matrixWorld);
      s.object.getWorldQuaternion(q);
      e.setFromQuaternion(q, 'YXZ');
      this.ctx.collision.updateOBB(this.colliders[i], v.x, v.z, e.y);
    });
  }
  get busy() { return this.anim.busy; }
  get isOpen() { return this.anim.isOpen; }
  prompt() {
    if (this.anim.busy) return null;
    return (this.anim.state === 'open' ? '關閉' : '開啟') + this.label;
  }
  interact() {
    this.anim.toggle();
    this.ctx.audio?.play('window', this.meshes[0]?.getWorldPosition(new THREE.Vector3()));
  }
}

export function buildWindow(ctx, wall, opening, cfg) {
  const M = ctx.materials;
  const W = opening.to - opening.from;
  const H = opening.head - opening.sill;
  const y0 = FLOOR_Y + opening.sill;
  const out = outsideSign(wall, opening);
  const frameMat = M.get('frame');
  const glassMat = cfg?.frosted ? ctx.glass.frosted : ctx.glass.clear;

  const root = wallFrame(wall, opening);
  ctx.scene.add(root);
  const fixed = new THREE.Group();          // merged into the static batch
  root.add(fixed);
  const zOff = out * 0.02;                  // frames sit slightly towards the outside face

  const outer = new THREE.Group();
  outer.position.set(0, y0, zOff);
  fixed.add(outer);
  rectFrame(outer, W, H, FW, FD, frameMat);

  // sills
  if (opening.sill > 0.1) {
    const inSill = box(W + 0.06, 0.03, wall.t / 2 + 0.035, M.get('marble'));
    inSill.position.set(0, y0 - 0.015, -out * (wall.t / 4 + 0.0175));
    fixed.add(inSill);
  }
  const exSill = box(W + 0.04, 0.025, wall.t / 2 + 0.05, M.get('darkMetal'));
  exSill.position.set(0, y0 - 0.0125, out * (wall.t / 4 + 0.025));
  fixed.add(exSill);

  const innerW = W - 2 * FW, innerH = H - 2 * FW;
  const type = cfg?.type || 'fixed';
  const parts = [], colliders = [], meshes = [];

  const addFixedGlass = (x0, x1) => {
    const g = glass(x1 - x0, innerH, glassMat);
    g.position.set((x0 + x1) / 2, FW + innerH / 2, 0);
    outer.add(g);
  };
  const mullion = (x) => {
    const m = box(FW * 0.9, innerH, FD * 0.95, frameMat);
    m.position.set(x, FW + innerH / 2, 0);
    outer.add(m);
  };

  // A casement sash hinged on one vertical edge (hingeX in outer-frame space).
  const casement = (x0, x1, hingeLeft) => {
    const sw = x1 - x0 - 0.006, sh = innerH - 0.006;
    const pivot = new THREE.Group();
    const hx = hingeLeft ? x0 + 0.003 : x1 - 0.003;
    pivot.position.set(hx, FW + 0.003, out * (FD / 2 - 0.004));
    outer.add(pivot);
    const sash = new THREE.Group();
    sash.position.set(hingeLeft ? sw / 2 : -sw / 2, 0, -out * SD / 2);
    pivot.add(sash);
    rectFrame(sash, sw, sh, SW, SD, frameMat);
    const g = glass(sw - 2 * SW + 0.01, sh - 2 * SW + 0.01, glassMat);
    g.position.set(0, sh / 2, 0);
    sash.add(g);
    // lever handle on the interior face
    const handle = box(0.022, 0.13, 0.02, M.get('blackMetal'));
    handle.position.set(hingeLeft ? sw / 2 - SW / 2 : -sw / 2 + SW / 2, sh / 2, -out * (SD / 2 + 0.018));
    sash.add(handle);
    sash.traverse(o => { if (o.isMesh) meshes.push(o); });
    pivot.traverse(o => { o.userData.dynamic = true; });
    const ang = THREE.MathUtils.degToRad(72) * out * (hingeLeft ? -1 : 1);
    parts.push({ object: pivot, quaternion: [new THREE.Quaternion(), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ang)] });
    colliders.push({ object: sash, w: sw, d: SD + 0.02, h: sh, y0: y0 + FW, local: [0, 0] });
  };

  if (type === 'fixed') {
    const n = Math.max(1, Math.round(innerW / 1.5));
    const pw = innerW / n;
    for (let i = 0; i < n; i++) addFixedGlass(-innerW / 2 + i * pw + (i ? FW * 0.45 : 0), -innerW / 2 + (i + 1) * pw - (i < n - 1 ? FW * 0.45 : 0));
    for (let i = 1; i < n; i++) mullion(-innerW / 2 + i * pw);
  } else if (type === 'casement2') {
    mullion(0);
    casement(-innerW / 2, -FW * 0.45, true);
    casement(FW * 0.45, innerW / 2, false);
  } else if (type === 'casementLeft' || type === 'casementRight') {
    const left = type === 'casementLeft';
    const xs = left ? -innerW / 2 + cfg.split : innerW / 2 - cfg.split;
    mullion(xs);
    if (left) { casement(-innerW / 2, xs - FW * 0.45, true); addFixedGlass(xs + FW * 0.45, innerW / 2); }
    else { addFixedGlass(-innerW / 2, xs - FW * 0.45); casement(xs + FW * 0.45, innerW / 2, false); }
  } else if (type === 'slider') {
    const sw = innerW / 2 + 0.04;
    const mk = (x, z) => {
      const s = new THREE.Group();
      s.position.set(x, FW, z);
      outer.add(s);
      rectFrame(s, sw, innerH, SW, 0.035, frameMat);
      const g = glass(sw - 2 * SW + 0.01, innerH - 2 * SW + 0.01, glassMat);
      g.position.set(0, innerH / 2, 0);
      s.add(g);
      return s;
    };
    mk(-innerW / 2 + sw / 2, out * 0.022);                      // fixed, outer track
    const moving = mk(innerW / 2 - sw / 2, -out * 0.022);       // operable, inner track
    const handle = box(0.02, 0.16, 0.022, M.get('blackMetal'));
    handle.position.set(sw / 2 - SW * 0.6, innerH / 2, -out * 0.03);
    moving.add(handle);
    moving.traverse(o => { o.userData.dynamic = true; if (o.isMesh) meshes.push(o); });
    const p0 = moving.position.clone();
    const p1 = p0.clone(); p1.x -= sw - 0.08;
    parts.push({ object: moving, position: [p0, p1] });
  } else if (type === 'awning') {
    const sw = innerW - 0.006, sh = innerH - 0.006;
    const pivot = new THREE.Group();
    pivot.position.set(0, FW + innerH - 0.003, out * (FD / 2 - 0.004));
    outer.add(pivot);
    const sash = new THREE.Group();
    sash.position.set(0, -sh, -out * SD / 2);
    pivot.add(sash);
    rectFrame(sash, sw, sh, SW, SD, frameMat);
    const g = glass(sw - 2 * SW + 0.01, sh - 2 * SW + 0.01, glassMat);
    g.position.set(0, sh / 2, 0);
    sash.add(g);
    const handle = box(0.12, 0.022, 0.02, M.get('blackMetal'));
    handle.position.set(0, SW / 2, -out * (SD / 2 + 0.018));
    sash.add(handle);
    sash.traverse(o => { if (o.isMesh) meshes.push(o); });
    pivot.traverse(o => { o.userData.dynamic = true; });
    const ang = -THREE.MathUtils.degToRad(32) * out;
    parts.push({ object: pivot, quaternion: [new THREE.Quaternion(), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), ang)] });
  }

  // Fixed parts -> static batch (dynamic sashes stay in the graph).
  root.updateMatrixWorld(true);
  ctx.builder.addObject(fixed);
  const keep = [];
  outer.children.forEach(c => { if (c.userData.dynamic) keep.push(c); });
  fixed.remove(outer);
  for (const k of [...fixed.children]) fixed.remove(k);
  if (keep.length) {
    outer.clear();
    outer.add(...keep);
    root.add(outer);
  }
  root.remove(fixed);

  // Collider for floor-level glass. Higher sills are already blocked by the wall's
  // sill piece (it reaches above the player capsule's step height).
  if (opening.sill < 0.28) {
    if (wall.axis === 'x') ctx.collision.addBox({ minX: opening.from, maxX: opening.to, minZ: wall.at - 0.05, maxZ: wall.at + 0.05, minY: 0, maxY: y0 + H, tag: opening.id, occludes: false });
    else ctx.collision.addBox({ minX: wall.at - 0.05, maxX: wall.at + 0.05, minZ: opening.from, maxZ: opening.to, minY: 0, maxY: y0 + H, tag: opening.id, occludes: false });
  }

  if (parts.length) {
    const win = new OperableWindow(ctx, opening.id, cfg.label, parts, colliders);
    win.meshes = meshes;
    root.updateMatrixWorld(true);
    win._sync();
    if (!colliders.length) win.colliders = [];
    ctx.interaction.add(win);
    return win;
  }
  if (!keep.length) ctx.scene.remove(root);
  return null;
}

// Living room curtain wall: 6 panels, panel 3 is a sliding door on the inner track.
export function buildGlassWall(ctx, wall, opening) {
  const M = ctx.materials;
  const W = opening.to - opening.from, H = opening.head;
  const y0 = FLOOR_Y;
  const out = outsideSign(wall, opening);
  const root = wallFrame(wall, opening);
  ctx.scene.add(root);
  const fixed = new THREE.Group();
  root.add(fixed);
  const frameMat = M.get('frame');
  const n = 6, pw = W / n;
  const MW = 0.06;

  // head + sill rails, mullions
  const head = box(W, 0.08, 0.14, frameMat); head.position.set(0, y0 + H - 0.04, 0); fixed.add(head);
  const sill = box(W, 0.035, 0.16, frameMat); sill.position.set(0, y0 + 0.0175, 0); fixed.add(sill);
  for (let i = 0; i <= n; i++) {
    const m = box(MW, H - 0.115, 0.12, frameMat);
    m.position.set(-W / 2 + i * pw + (i === 0 ? MW / 2 : i === n ? -MW / 2 : 0), y0 + 0.035 + (H - 0.115) / 2, out * 0.01);
    fixed.add(m);
  }
  const gH = H - 0.115 - 0.02;
  for (let i = 0; i < n; i++) {
    if (i === 3) continue;
    const g = glass(pw - MW, gH, ctx.glass.clear);
    g.position.set(-W / 2 + (i + 0.5) * pw, y0 + 0.035 + 0.01 + gH / 2, out * 0.01);
    fixed.add(g);
    const x0 = opening.from + i * pw, x1 = x0 + pw;
    ctx.collision.addBox({ minX: x0, maxX: x1, minZ: wall.at - 0.06, maxZ: wall.at + 0.06, minY: 0, maxY: y0 + H, tag: 'glasswall', occludes: false });
  }
  root.updateMatrixWorld(true);
  ctx.builder.addObject(fixed);
  root.remove(fixed);

  // Sliding panel on the inner track
  const panel = new THREE.Group();
  const sw = pw + 0.04, sh = H - 0.13;
  panel.position.set(-W / 2 + 3.5 * pw, y0 + 0.04, -out * 0.075);
  root.add(panel);
  rectFrame(panel, sw, sh, 0.07, 0.06, frameMat);
  const g = glass(sw - 0.13, sh - 0.13, ctx.glass.clear);
  g.position.set(0, sh / 2, 0);
  panel.add(g);
  const pull = box(0.025, 0.9, 0.035, M.get('blackMetal'));
  pull.position.set(sw / 2 - 0.12, 1.05, -out * 0.055);
  panel.add(pull);
  const pull2 = pull.clone(); pull2.position.z = out * 0.055; panel.add(pull2);
  const meshes = [];
  panel.traverse(o => { o.userData.dynamic = true; if (o.isMesh) meshes.push(o); });
  const p0 = panel.position.clone(), p1 = p0.clone();
  p1.x -= pw - 0.02;
  const door = new OperableWindow(ctx, opening.id, '落地推拉門', [{ object: panel, position: [p0, p1] }],
    [{ object: panel, w: sw, d: 0.1, h: sh, y0: y0, local: [0, 0] }], { duration: 1.6 });
  door.type = 'door';
  door.meshes = meshes;
  root.updateMatrixWorld(true);
  door._sync();
  // The sliding panel's own collider only; static colliders cover the fixed panels.
  ctx.interaction.add(door);
  // The fixed-glass collider under panel 3 must not exist (it is the doorway).
  return door;
}
