// Hinged doors. The leaf rotates about a pivot on its hinge edge; a dynamic OBB
// collider follows the leaf every animation tick, so a closed door blocks the
// doorway, an open one can be walked past, and a moving one pushes the player.

import * as THREE from 'three';
import { Interactable } from './interactionManager.js';
import { ToggleAnimation } from './animator.js';
import { FLOOR_Y } from '../scene/layout.js';
import { boxProjectUV } from '../scene/builder.js';

const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

function boxMesh(w, h, d, mat, uvScale = 1) {
  const g = boxProjectUV(new THREE.BoxGeometry(w, h, d), uvScale);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

// Opening frame in "wall space": x along the wall, z across, origin at wall centre.
export function wallFrame(wall, opening) {
  const cx = (opening.from + opening.to) / 2;
  const g = new THREE.Group();
  if (wall.axis === 'x') { g.position.set(cx, 0, wall.at); }
  else { g.position.set(wall.at, 0, cx); g.rotation.y = -Math.PI / 2; }
  return g;
}

export class HingedDoor extends Interactable {
  constructor(ctx, wall, opening, cfg) {
    super({ id: opening.id, type: 'door', label: cfg.label, reach: 2.4 });
    this.ctx = ctx;
    const M = ctx.materials;
    const width = opening.to - opening.from;
    const height = opening.head;
    const front = cfg.style === 'front';
    const leafT = front ? 0.065 : 0.042;
    const w = width - 0.02, h = height - 0.016;
    const side = cfg.openSide;                      // +1 / -1 along wall-space z
    const dirFree = cfg.hinge === 'from' ? 1 : -1;  // leaf extends from pivot along +x or -x
    const hingeX = (cfg.hinge === 'from' ? -width / 2 + 0.01 : width / 2 - 0.01);
    const zFace = side * (wall.t / 2 - 0.012);      // leaf sits flush with the face it opens towards
    const zLeaf = zFace - side * leafT / 2;

    this.frame = wallFrame(wall, opening);
    ctx.scene.add(this.frame);

    // Pivot on the hinge edge, at the face of the leaf.
    const pivot = new THREE.Group();
    pivot.position.set(hingeX, FLOOR_Y + 0.01, zFace);
    this.frame.add(pivot);
    this.pivot = pivot;

    const leafMat = front ? M.get('walnut') : M.get('whiteLacquer');
    const zone = ctx.zoneOf(this.frame.position.x, 1.2, this.frame.position.z);
    const zm = (m) => ctx.materials.zonedMaterial(m, zone);
    const leaf = boxMesh(w, h, leafT, zm(leafMat));
    leaf.position.set(dirFree * w / 2, h / 2, -side * leafT / 2);
    pivot.add(leaf);
    const meshes = [leaf];

    if (front) {
      // Recessed groove lines and long brass pulls on both faces.
      for (const s of [-1, 1]) {
        for (const gx of [-0.18, 0.18]) {
          const groove = boxMesh(0.008, h - 0.3, 0.004, zm(M.get('darkMetal')));
          groove.position.set(dirFree * (w / 2 + gx), h / 2, -side * leafT / 2 + s * (leafT / 2 + 0.001));
          pivot.add(groove);
        }
        const pull = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 1.2, 16), zm(M.get('brass')));
        pull.position.set(dirFree * (w - 0.11), 1.05, -side * leafT / 2 + s * (leafT / 2 + 0.055));
        pull.castShadow = true;
        pivot.add(pull);
        meshes.push(pull);
        for (const py of [0.55, 1.55]) {
          const st = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.055, 10), zm(M.get('brass')));
          st.rotation.x = Math.PI / 2;
          st.position.set(dirFree * (w - 0.11), py, -side * leafT / 2 + s * (leafT / 2 + 0.027));
          pivot.add(st);
        }
      }
    } else {
      for (const s of [-1, 1]) {
        const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.01, 20), zm(M.get('blackMetal')));
        rose.rotation.x = Math.PI / 2;
        const zz = -side * leafT / 2 + s * (leafT / 2 + 0.005);
        rose.position.set(dirFree * (w - 0.065), 1.0, zz);
        const lever = boxMesh(0.13, 0.018, 0.018, zm(M.get('blackMetal')));
        lever.position.set(dirFree * (w - 0.065 - 0.055), 1.0, zz + s * 0.045);
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.045, 10), zm(M.get('blackMetal')));
        neck.rotation.x = Math.PI / 2;
        neck.position.set(dirFree * (w - 0.065), 1.0, zz + s * 0.022);
        pivot.add(rose, lever, neck);
        meshes.push(lever);
      }
    }
    pivot.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    this.meshes = meshes;

    // Static jamb lining + casings, merged into the static batch.
    this._buildFrame(ctx, wall, opening, front);

    // Animation: rotate the pivot.
    this.openAngle = THREE.MathUtils.degToRad(cfg.angle);
    const phi = -side * dirFree * this.openAngle;
    const q0 = new THREE.Quaternion();
    const q1 = new THREE.Quaternion().setFromAxisAngle(_up, phi);
    this.phiOpen = phi;
    this.anim = new ToggleAnimation(ctx.hub, [{ object: pivot, quaternion: [q0, q1] }], {
      duration: front ? 1.25 : 1.0, name: this.id,
      onTick: () => { this._syncCollider(); ctx.markShadowsDirty(); },
    });

    // Leaf collider in world space.
    this.leafW = w; this.leafT = leafT; this.leafH = h; this.dirFree = dirFree; this.side = side;
    this.collider = ctx.collision.addOBB({ cx: 0, cz: 0, hx: w / 2, hz: leafT / 2 + 0.01, minY: FLOOR_Y, maxY: FLOOR_Y + h, dynamic: true, tag: this.id });
    this.colliders = [this.collider];
    this.frame.updateMatrixWorld(true);
    this._syncCollider();
    this.anim.on((kind) => { if (kind === 'end') ctx.onDoorState?.(this); });
  }

  _buildFrame(ctx, wall, opening, front) {
    const M = ctx.materials;
    const width = opening.to - opening.from, height = opening.head;
    const g = new THREE.Group();
    const lining = front ? M.get('darkMetal') : M.get('whiteLacquer');
    const jT = 0.018;
    const L = (w, h, d, x, y, z, m = lining) => { const b = boxMesh(w, h, d, m); b.position.set(x, y, z); g.add(b); };
    // jambs + head lining the reveal
    L(jT, height, wall.t + 0.004, -width / 2 + jT / 2, FLOOR_Y + height / 2, 0);
    L(jT, height, wall.t + 0.004, width / 2 - jT / 2, FLOOR_Y + height / 2, 0);
    L(width, jT, wall.t + 0.004, 0, FLOOR_Y + height - jT / 2, 0);
    if (!front) {
      // architraves on both faces
      const cw = 0.065, ct = 0.014;
      for (const s of [-1, 1]) {
        const z = s * (wall.t / 2 + ct / 2);
        L(cw, height + cw, ct, -width / 2 - cw / 2 + 0.005, FLOOR_Y + (height + cw) / 2, z);
        L(cw, height + cw, ct, width / 2 + cw / 2 - 0.005, FLOOR_Y + (height + cw) / 2, z);
        L(width + cw * 2 - 0.01, cw, ct, 0, FLOOR_Y + height + cw / 2, z);
      }
    } else {
      // stone threshold across the full wall depth (covers the gap to the porch)
      L(width, FLOOR_Y + 0.008, wall.t + 0.06, 0, (FLOOR_Y + 0.008) / 2, 0, M.get('marbleDark'));
    }
    g.position.copy(this.frame.position);
    g.rotation.copy(this.frame.rotation);
    ctx.scene.add(g);
    ctx.builder.addObject(g);
    ctx.scene.remove(g);
  }

  _leafWorldOBB(phi, out = {}) {
    // Leaf centre relative to the pivot, rotated by phi, then into world.
    const cx = this.dirFree * this.leafW / 2, cz = -this.side * this.leafT / 2;
    const c = Math.cos(phi), s = Math.sin(phi);
    const lx = this.pivot.position.x + cx * c + cz * s;
    const lz = this.pivot.position.z - cx * s + cz * c;
    const fr = this.frame.rotation.y;
    const fc = Math.cos(fr), fs = Math.sin(fr);
    out.cx = this.frame.position.x + lx * fc + lz * fs;
    out.cz = this.frame.position.z - lx * fs + lz * fc;
    out.angle = fr + phi;
    return out;
  }

  _syncCollider() {
    const phi = new THREE.Euler().setFromQuaternion(this.pivot.quaternion, 'YXZ').y;
    const o = this._leafWorldOBB(phi);
    this.ctx.collision.updateOBB(this.collider, o.cx, o.cz, o.angle);
  }

  get busy() { return this.anim.busy; }
  get isOpen() { return this.anim.isOpen; }

  prompt() {
    if (this.anim.busy) return null;
    return (this.anim.state === 'open' ? '關閉' : '開啟') + this.label;
  }

  blockedReason() {
    // Refuse to close onto the player, or to open into a spot where the player would be pinned.
    const p = this.ctx.player.position, r = this.ctx.player.radius + 0.05;
    const target = this.anim.state === 'open' ? 0 : this.phiOpen;
    const o = this._leafWorldOBB(target);
    const dx = p.x - o.cx, dz = p.z - o.cz;
    const c = Math.cos(o.angle), s = Math.sin(o.angle);
    const lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (Math.abs(lx) < this.leafW / 2 + r && Math.abs(lz) < this.leafT / 2 + r) {
      return this.anim.state === 'open' ? '請先離開門口再關門' : '請稍微後退再開門';
    }
    return null;
  }

  interact() {
    this.anim.toggle();
    this.ctx.audio?.play(this.anim.isOpen ? 'doorOpen' : 'doorClose', this.frame.position);
  }

  // Debug/test helper
  setOpenImmediate(open) {
    // Stop first: deactivating the action restores the bound property, then apply the pose.
    this.anim.action.stop();
    this.anim.hub.active.delete(this.anim);
    this.pivot.quaternion.setFromAxisAngle(_up, open ? this.phiOpen : 0);
    this.anim.state = open ? 'open' : 'closed';
    if (open) this.anim.action.time = this.anim.duration;
    this._syncCollider();
    this.ctx.markShadowsDirty();
  }
}
