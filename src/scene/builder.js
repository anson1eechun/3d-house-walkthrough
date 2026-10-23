// Static geometry builder. Everything that never moves is appended into
// buckets keyed by (material, lighting zone, shadow flags, layer) and merged
// into one mesh per bucket at the end, which keeps draw calls low (the scene is
// rendered by several passes: shadows, AO normals, transmission, reflections).

import * as THREE from 'three';
import { zoneAt } from './layout.js';
import { LAYER } from '../core/layers.js';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m3 = new THREE.Matrix3();
const _box = new THREE.Box3();

class Bucket {
  constructor(material, zone, cast, receive, layer) {
    this.material = material; this.zone = zone; this.cast = cast; this.receive = receive; this.layer = layer;
    this.pos = []; this.nrm = []; this.uv = []; this.col = []; this.idx = [];
    this.count = 0;
  }
}

export class StaticBuilder {
  constructor({ materials, collision }) {
    this.materials = materials;
    this.collision = collision;
    this.buckets = new Map();
    this.meshes = [];
  }

  _bucket(mat, zone, opts) {
    const cast = opts.castShadow !== false, recv = opts.receiveShadow !== false;
    const layer = opts.layer ?? LAYER.DEFAULT;
    const key = `${mat.uuid}|${zone}|${cast}|${recv}|${layer}`;
    let b = this.buckets.get(key);
    if (!b) { b = new Bucket(mat, zone, cast, recv, layer); this.buckets.set(key, b); }
    return b;
  }

  _zoneFor(x, y, z, opts) {
    if (opts.zone) return opts.zone;
    return zoneAt(x, y, z);
  }

  // Axis-aligned (or y-rotated) box with world-space UVs in metres.
  // mat: Material | (face, centre, normal) => Material|null  (null skips the face)
  // faces: px nx py ny pz nz
  box(min, max, mat, opts = {}) {
    const [x0, y0, z0] = min, [x1, y1, z1] = max;
    const rot = opts.rotY || 0;
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const corners = (lx, ly, lz) => {
      if (!rot) return [lx, ly, lz];
      const dx = lx - cx, dz = lz - cz;
      const c = Math.cos(rot), s = Math.sin(rot);
      return [cx + dx * c + dz * s, ly, cz - dx * s + dz * c];
    };
    const rotN = (nx, nz) => {
      if (!rot) return [nx, nz];
      const c = Math.cos(rot), s = Math.sin(rot);
      return [nx * c + nz * s, -nx * s + nz * c];
    };
    const uvs = opts.uvOffset || [0, 0];
    const faces = [
      ['px', [1, 0, 0], [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], p => [-p[2], p[1]]],
      ['nx', [-1, 0, 0], [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], p => [p[2], p[1]]],
      ['py', [0, 1, 0], [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], p => [p[0], -p[2]]],
      ['ny', [0, -1, 0], [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], p => [p[0], p[2]]],
      ['pz', [0, 0, 1], [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], p => [p[0], p[1]]],
      ['nz', [0, 0, -1], [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], p => [-p[0], p[1]]],
    ];
    for (const [face, n, quad, uvf] of faces) {
      if (opts.skip && opts.skip.includes(face)) continue;
      const [rnx, rnz] = rotN(n[0], n[2]);
      const wn = [rnx, n[1], rnz];
      const wq = quad.map(q => corners(q[0], q[1], q[2]));
      const c = [(wq[0][0] + wq[2][0]) / 2, (wq[0][1] + wq[2][1]) / 2, (wq[0][2] + wq[2][2]) / 2];
      const m = typeof mat === 'function' ? mat(face, c, wn) : mat;
      if (!m) continue;
      // UVs from the un-rotated local quad so rotated boxes keep their mapping.
      const uv = quad.map(q => { const u = uvf(q); return [u[0] + uvs[0], u[1] + uvs[1]]; });
      const zone = this._zoneFor(c[0] + wn[0] * 0.03, c[1] + wn[1] * 0.03, c[2] + wn[2] * 0.03, opts);
      this._quad(m, zone, wq, wn, uv, opts);
    }
    if (opts.collider) {
      const col = typeof opts.collider === 'object' ? opts.collider : {};
      this.collision.addOBB({
        cx, cz, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, angle: rot,
        minY: y0, maxY: y1, tag: col.tag || opts.tag || '', occludes: col.occludes !== false,
      });
    }
  }

  _quad(mat, zone, q, n, uv, opts) {
    const b = this._bucket(mat, zone, opts);
    const base = b.count;
    for (let i = 0; i < 4; i++) {
      b.pos.push(q[i][0], q[i][1], q[i][2]);
      b.nrm.push(n[0], n[1], n[2]);
      b.uv.push(uv[i][0], uv[i][1]);
      b.col.push(1, 1, 1);
    }
    b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    b.count += 4;
  }

  // Arbitrary quad (for slanted/odd surfaces). Points in CCW order seen from the normal side.
  quad(mat, pts, uv, opts = {}) {
    const a = new THREE.Vector3(...pts[0]), b = new THREE.Vector3(...pts[1]), c = new THREE.Vector3(...pts[2]);
    const n = b.sub(a).cross(c.sub(a)).normalize();
    const cen = [(pts[0][0] + pts[2][0]) / 2, (pts[0][1] + pts[2][1]) / 2, (pts[0][2] + pts[2][2]) / 2];
    const zone = this._zoneFor(cen[0] + n.x * 0.03, cen[1] + n.y * 0.03, cen[2] + n.z * 0.03, opts);
    this._quad(mat, zone, pts, [n.x, n.y, n.z], uv, opts);
  }

  // Merge a BufferGeometry with a world matrix.
  geometry(geo, mat, matrix, opts = {}) {
    const pos = geo.attributes.position, nrm = geo.attributes.normal, uv = geo.attributes.uv, col = geo.attributes.color;
    let zone = opts.zone;
    if (!zone) {
      if (!geo.boundingBox) geo.computeBoundingBox();
      _box.copy(geo.boundingBox).applyMatrix4(matrix);
      const c = _box.getCenter(_v);
      zone = zoneAt(c.x, c.y, c.z);
    }
    const b = this._bucket(mat, zone, opts);
    const base = b.count;
    _m3.getNormalMatrix(matrix);
    for (let i = 0; i < pos.count; i++) {
      _v.fromBufferAttribute(pos, i).applyMatrix4(matrix);
      b.pos.push(_v.x, _v.y, _v.z);
      if (nrm) { _n.fromBufferAttribute(nrm, i).applyMatrix3(_m3).normalize(); b.nrm.push(_n.x, _n.y, _n.z); }
      else b.nrm.push(0, 1, 0);
      if (uv) b.uv.push(uv.getX(i), uv.getY(i)); else b.uv.push(0, 0);
      if (col) b.col.push(col.getX(i), col.getY(i), col.getZ(i)); else b.col.push(1, 1, 1);
    }
    if (geo.index) {
      const ix = geo.index;
      for (let i = 0; i < ix.count; i++) b.idx.push(base + ix.getX(i));
    } else {
      for (let i = 0; i < pos.count; i++) b.idx.push(base + i);
    }
    b.count += pos.count;
  }

  // Merge every mesh in an Object3D subtree (furniture assembled as groups).
  // Meshes flagged userData.dynamic are left in the scene graph untouched.
  addObject(root, opts = {}) {
    root.updateMatrixWorld(true);
    const keep = [];
    root.traverse(o => {
      if (!o.isMesh) return;
      if (o.userData.dynamic || o.isInstancedMesh) { keep.push(o); return; }
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.length > 1) throw new Error('addObject: multi-material meshes are not supported');
      this.geometry(o.geometry, mats[0], o.matrixWorld, {
        ...opts,
        castShadow: o.castShadow !== false && opts.castShadow !== false && !o.userData.noShadow,
        receiveShadow: opts.receiveShadow !== false,
        layer: o.userData.layer ?? opts.layer,
        zone: opts.zone || o.userData.zone,
      });
    });
    return keep;
  }

  finalize(parent) {
    for (const b of this.buckets.values()) {
      if (!b.count) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      if (b.material.vertexColors) g.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      g.setIndex(b.count > 65535 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1));
      g.computeBoundingSphere();
      g.computeBoundingBox();
      const mat = this.materials.zonedMaterial(b.material, b.zone);
      const mesh = new THREE.Mesh(g, mat);
      mesh.castShadow = b.cast; mesh.receiveShadow = b.receive;
      mesh.layers.set(b.layer);
      mesh.matrixAutoUpdate = false;
      mesh.name = `static:${b.material.name}@${b.zone}`;
      mesh.userData.static = true;
      parent.add(mesh);
      this.meshes.push(mesh);
    }
    this.buckets.clear();
    return this.meshes;
  }
}

// Box-projected UVs in metres, computed in the geometry's local space. Used for
// furniture so wood grain / fabric weave keep a physical scale.
export function boxProjectUV(geo, scale = 1, axisHint = null) {
  const pos = geo.attributes.position, nrm = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(nrm.getX(i)), ny = Math.abs(nrm.getY(i)), nz = Math.abs(nrm.getZ(i));
    let u, v;
    if (ny >= nx && ny >= nz) { u = x; v = z; if (axisHint === 'z') { u = z; v = x; } }
    else if (nx >= nz) { u = z; v = y; }
    else { u = x; v = y; }
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
