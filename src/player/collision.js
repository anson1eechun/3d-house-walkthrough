// Character collision. The player is a vertical capsule (radius r, from feet to
// head). Because every obstacle in the house is an upright solid (walls, doors,
// furniture), capsule-vs-solid reduces to circle-vs-rectangle in plan view for
// every collider whose vertical extent overlaps the capsule. Colliders are
// oriented rectangles (OBB) with a [minY, maxY] range; static ones are bucketed
// in a uniform grid so a query touches only nearby cells.
//
// This module has no three.js dependency so it can be unit tested in Node.

export class CollisionWorld {
  constructor(cellSize = 2) {
    this.cell = cellSize;
    this.grid = new Map();
    this.statics = [];
    this.dynamics = [];
    this.floors = [];
    this._seen = new Set();
    this._cands = [];
  }

  _key(ix, iz) { return ix * 73856093 ^ iz * 19349663; }

  _bounds(c) {
    // Conservative AABB of the OBB.
    const ex = Math.abs(c.cos) * c.hx + Math.abs(c.sin) * c.hz;
    const ez = Math.abs(c.sin) * c.hx + Math.abs(c.cos) * c.hz;
    return [c.cx - ex, c.cx + ex, c.cz - ez, c.cz + ez];
  }

  _insert(c) {
    const [x0, x1, z0, z1] = this._bounds(c);
    const s = this.cell;
    for (let ix = Math.floor(x0 / s); ix <= Math.floor(x1 / s); ix++) {
      for (let iz = Math.floor(z0 / s); iz <= Math.floor(z1 / s); iz++) {
        const k = this._key(ix, iz);
        let list = this.grid.get(k);
        if (!list) { list = []; this.grid.set(k, list); }
        list.push(c);
      }
    }
  }

  // Oriented rectangle collider. angle rotates the local x axis around +y
  // (same convention as three.js rotation.y).
  addOBB({ cx, cz, hx, hz, angle = 0, minY = -10, maxY = 10, tag = '', dynamic = false, occludes = true }) {
    const c = { cx, cz, hx, hz, angle, cos: Math.cos(angle), sin: Math.sin(angle), minY, maxY, tag, dynamic, enabled: true, occludes };
    if (dynamic) this.dynamics.push(c);
    else { this.statics.push(c); this._insert(c); }
    return c;
  }

  addBox({ minX, maxX, minZ, maxZ, minY = -10, maxY = 10, tag = '', occludes = true }) {
    return this.addOBB({ cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, hx: (maxX - minX) / 2, hz: (maxZ - minZ) / 2, minY, maxY, tag, occludes });
  }

  updateOBB(c, cx, cz, angle) {
    c.cx = cx; c.cz = cz; c.angle = angle; c.cos = Math.cos(angle); c.sin = Math.sin(angle);
  }

  addFloor({ minX, maxX, minZ, maxZ, y }) {
    this.floors.push({ minX, maxX, minZ, maxZ, y });
  }

  groundHeight(x, z) {
    let h = 0;
    for (const f of this.floors) {
      if (x >= f.minX && x <= f.maxX && z >= f.minZ && z <= f.maxZ && f.y > h) h = f.y;
    }
    return h;
  }

  candidates(x, z, r) {
    const s = this.cell, out = this._cands, seen = this._seen;
    out.length = 0; seen.clear();
    for (let ix = Math.floor((x - r) / s); ix <= Math.floor((x + r) / s); ix++) {
      for (let iz = Math.floor((z - r) / s); iz <= Math.floor((z + r) / s); iz++) {
        const list = this.grid.get(this._key(ix, iz));
        if (!list) continue;
        for (const c of list) { if (!seen.has(c)) { seen.add(c); out.push(c); } }
      }
    }
    for (const c of this.dynamics) if (c.enabled) out.push(c);
    return out;
  }

  // Push a circle out of one collider. Returns true if it moved.
  _pushOut(p, r, c) {
    const dx = p.x - c.cx, dz = p.z - c.cz;
    // world -> local (rotate by -angle). three.js rotation.y maps local x to (cos, -sin).
    const lx = dx * c.cos - dz * c.sin;
    const lz = dx * c.sin + dz * c.cos;
    if (Math.abs(lx) > c.hx + r || Math.abs(lz) > c.hz + r) return false;
    let px, pz; // push in local space
    if (Math.abs(lx) <= c.hx && Math.abs(lz) <= c.hz) {
      // Centre inside: exit along the axis of least penetration.
      const ox = c.hx - Math.abs(lx) + r, oz = c.hz - Math.abs(lz) + r;
      if (ox < oz) { px = Math.sign(lx || 1) * ox; pz = 0; } else { px = 0; pz = Math.sign(lz || 1) * oz; }
    } else {
      const qx = Math.max(-c.hx, Math.min(c.hx, lx)), qz = Math.max(-c.hz, Math.min(c.hz, lz));
      const ex = lx - qx, ez = lz - qz;
      const d = Math.hypot(ex, ez);
      if (d >= r) return false;
      const k = (r - d) / (d || 1e-6);
      px = ex * k; pz = ez * k;
    }
    // local -> world
    p.x += px * c.cos + pz * c.sin;
    p.z += -px * c.sin + pz * c.cos;
    return true;
  }

  // Resolve overlap of a capsule (circle radius r, vertical span [y0, y1]).
  resolve(p, r, y0, y1, iterations = 4) {
    let hit = false;
    for (let it = 0; it < iterations; it++) {
      let moved = false;
      const cands = this.candidates(p.x, p.z, r + 0.05);
      for (const c of cands) {
        if (!c.enabled || c.maxY <= y0 || c.minY >= y1) continue;
        if (this._pushOut(p, r, c)) moved = true;
      }
      hit = hit || moved;
      if (!moved) break;
    }
    return hit;
  }

  // Move with sub-stepping so fast motion cannot tunnel through thin walls.
  move(p, dx, dz, r, y0, y1) {
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(dist / (r * 0.4)));
    let hit = false;
    for (let i = 0; i < steps; i++) {
      p.x += dx / steps; p.z += dz / steps;
      if (this.resolve(p, r, y0, y1)) hit = true;
    }
    return hit;
  }

  // Does a circle overlap any enabled collider (optionally filtered)?
  overlaps(x, z, r, y0, y1, filter = null) {
    const p = { x, z };
    for (const c of this.candidates(x, z, r)) {
      if (!c.enabled || c.maxY <= y0 || c.minY >= y1) continue;
      if (filter && !filter(c)) continue;
      const q = { x, z };
      if (this._pushOut(q, r, c)) return true;
    }
    return false;
  }

  // 3D ray vs collider boxes; returns nearest hit distance (Infinity if none).
  raycast(ox, oy, oz, dx, dy, dz, maxDist, filter = null) {
    let best = Infinity;
    const steps = Math.ceil(maxDist / this.cell) + 1;
    const visited = new Set();
    const test = (c) => {
      if (visited.has(c) || !c.enabled || !c.occludes) return;
      visited.add(c);
      if (filter && !filter(c)) return;
      // Transform ray into the collider's local frame.
      const rx = ox - c.cx, rz = oz - c.cz;
      const lox = rx * c.cos - rz * c.sin, loz = rx * c.sin + rz * c.cos;
      const ldx = dx * c.cos - dz * c.sin, ldz = dx * c.sin + dz * c.cos;
      let t0 = 0, t1 = maxDist;
      const slab = (o, d, mn, mx) => {
        if (Math.abs(d) < 1e-9) return o >= mn && o <= mx;
        let a = (mn - o) / d, b = (mx - o) / d;
        if (a > b) { const t = a; a = b; b = t; }
        t0 = Math.max(t0, a); t1 = Math.min(t1, b);
        return t0 <= t1;
      };
      if (!slab(lox, ldx, -c.hx, c.hx)) return;
      if (!slab(loz, ldz, -c.hz, c.hz)) return;
      if (!slab(oy, dy, c.minY, c.maxY)) return;
      if (t0 < best) best = t0;
    };
    for (let i = 0; i <= steps; i++) {
      const t = Math.min(maxDist, i * this.cell);
      const x = ox + dx * t, z = oz + dz * t;
      const s = this.cell;
      for (let ix = Math.floor(x / s) - 1; ix <= Math.floor(x / s) + 1; ix++) {
        for (let iz = Math.floor(z / s) - 1; iz <= Math.floor(z / s) + 1; iz++) {
          const list = this.grid.get(this._key(ix, iz));
          if (list) for (const c of list) test(c);
        }
      }
    }
    for (const c of this.dynamics) test(c);
    return best;
  }
}
