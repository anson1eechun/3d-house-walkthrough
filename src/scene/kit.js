// Modelling kit for procedural furniture. Pieces are assembled in a local Group
// (origin on the floor at the footprint centre, +z = front), placed in the
// world, then committed: static meshes are merged into the batched geometry,
// animated sub-trees (userData.dynamic) stay live with zone materials, and an
// oriented box collider is registered from the footprint.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { boxProjectUV } from './builder.js';
import { FLOOR_Y } from './layout.js';

const _box = new THREE.Box3();
const _v = new THREE.Vector3();

export class Kit {
  constructor(ctx) {
    this.ctx = ctx;
    this.M = ctx.materials;
    this.cache = new Map();
  }

  m(name) { return typeof name === 'string' ? this.M.get(name) : name; }

  _geo(key, make) {
    let g = this.cache.get(key);
    if (!g) { g = make(); this.cache.set(key, g); }
    return g;
  }

  mesh(geo, mat, x = 0, y = 0, z = 0) {
    const o = new THREE.Mesh(geo, this.m(mat));
    o.position.set(x, y, z);
    o.castShadow = true; o.receiveShadow = true;
    return o;
  }

  // Box by size, positioned by its centre.
  box(w, h, d, mat, x = 0, y = 0, z = 0) {
    const g = this._geo(`b${w}|${h}|${d}`, () => boxProjectUV(new THREE.BoxGeometry(w, h, d), 1));
    return this.mesh(g, mat, x, y, z);
  }

  // Rounded box (cushions, mattresses, countertops).
  rbox(w, h, d, r, mat, x = 0, y = 0, z = 0, seg = 3) {
    const g = this._geo(`r${w}|${h}|${d}|${r}|${seg}`, () => boxProjectUV(new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2, h / 2, d / 2) * 0.999), 1));
    return this.mesh(g, mat, x, y, z);
  }

  cyl(rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 24) {
    const g = this._geo(`c${rt}|${rb}|${h}|${seg}`, () => boxProjectUV(new THREE.CylinderGeometry(rt, rb, h, seg), 1));
    return this.mesh(g, mat, x, y, z);
  }

  sphere(r, mat, x = 0, y = 0, z = 0, ws = 24, hs = 16) {
    const g = this._geo(`s${r}|${ws}|${hs}`, () => new THREE.SphereGeometry(r, ws, hs));
    return this.mesh(g, mat, x, y, z);
  }

  // Lathe from [[r, y], ...] profile.
  lathe(key, pts, mat, x = 0, y = 0, z = 0, seg = 32) {
    const g = this._geo('l' + key, () => {
      const geo = new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg);
      return geo;
    });
    return this.mesh(g, mat, x, y, z);
  }

  torus(R, r, mat, x = 0, y = 0, z = 0, arc = Math.PI * 2) {
    const g = this._geo(`t${R}|${r}|${arc}`, () => new THREE.TorusGeometry(R, r, 10, 32, arc));
    return this.mesh(g, mat, x, y, z);
  }

  // Tube along a curve (lamp arms, taps, rails).
  tube(key, points, radius, mat, seg = 32) {
    const g = this._geo('u' + key, () => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), seg, radius, 10, false));
    return this.mesh(g, mat);
  }

  // Several boxes sharing one material as a single mesh: [[w, h, d, x, y, z], ...]
  mergedBoxes(list, mat) {
    const key = 'mb' + list.map(b => b.join(',')).join(';');
    const g = this._geo(key, () => mergeGeometries(list.map(([w, h, d, x, y, z]) => boxProjectUV(new THREE.BoxGeometry(w, h, d), 1).translate(x, y, z)), false));
    return this.mesh(g, mat);
  }

  group(...children) {
    const g = new THREE.Group();
    if (children.length) g.add(...children);
    return g;
  }

  dynamic(obj) { obj.traverse(o => { o.userData.dynamic = true; }); return obj; }

  // Place a group in the world (y defaults to the interior floor).
  place(g, x, z, rotY = 0, y = FLOOR_Y) {
    g.position.set(x, y, z);
    g.rotation.y = rotY;
    this.ctx.scene.add(g);
    g.updateMatrixWorld(true);
    return g;
  }

  // Merge static parts, zone the dynamic ones, add a collider.
  // collider: 'auto' (local bounds), {w, d, h, x?, z?, y0?} (local), or null.
  commit(g, { collider = 'auto', zone = null, shrink = 0.02, occludes = false, castShadow = true } = {}) {
    const ctx = this.ctx;
    g.updateMatrixWorld(true);
    let local = null;
    if (collider === 'auto') {
      // bounds in the group's local frame
      const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
      _box.makeEmpty();
      g.traverse(o => {
        if (!o.isMesh || o.userData.noCollide) return;
        o.geometry.computeBoundingBox();
        const b = o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
        _box.union(b);
      });
      if (!_box.isEmpty()) {
        local = { w: _box.max.x - _box.min.x - shrink * 2, d: _box.max.z - _box.min.z - shrink * 2, h: _box.max.y - _box.min.y,
          x: (_box.max.x + _box.min.x) / 2, z: (_box.max.z + _box.min.z) / 2, y0: _box.min.y };
      }
    } else if (collider) {
      local = { x: 0, z: 0, y0: 0, ...collider };
    }
    ctx.builder.addObject(g, { zone, castShadow });
    // drop merged meshes from the graph, keep dynamic sub-trees and lights
    const remove = [];
    g.traverse(o => { if (o.isMesh && !o.userData.dynamic) remove.push(o); });
    for (const o of remove) o.parent.remove(o);
    g.traverse(o => {
      if (o.isMesh && o.userData.dynamic) {
        o.getWorldPosition(_v);
        const z = zone || ctx.zoneOf(_v.x, _v.y, _v.z);
        o.material = ctx.materials.zonedMaterial(o.material, z);
      }
    });
    let keep = false;
    g.traverse(o => { if (o !== g && (o.isMesh || o.isLight)) keep = true; });
    if (!keep) g.parent?.remove(g);
    if (local) {
      const c = Math.cos(g.rotation.y), s = Math.sin(g.rotation.y);
      ctx.collision.addOBB({
        cx: g.position.x + local.x * c + local.z * s, cz: g.position.z - local.x * s + local.z * c,
        hx: Math.max(0.01, local.w / 2), hz: Math.max(0.01, local.d / 2), angle: g.rotation.y,
        minY: g.position.y + local.y0, maxY: g.position.y + local.y0 + local.h, tag: 'furniture', occludes,
      });
    }
    return g;
  }

  // Add a collider in world space for a local rectangle of a placed group.
  colliderFor(g, { x = 0, z = 0, w, d, y0 = 0, h }) {
    const c = Math.cos(g.rotation.y), s = Math.sin(g.rotation.y);
    return this.ctx.collision.addOBB({
      cx: g.position.x + x * c + z * s, cz: g.position.z - x * s + z * c, hx: w / 2, hz: d / 2, angle: g.rotation.y,
      minY: g.position.y + y0, maxY: g.position.y + y0 + h, tag: 'furniture', occludes: false,
    });
  }

  // Wall-mounted switch helper: position on a wall face, facing direction.
  worldPoint(g, x, y, z) { return new THREE.Vector3(x, y, z).applyMatrix4(g.matrixWorld); }
}
