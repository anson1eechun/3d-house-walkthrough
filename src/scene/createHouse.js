// House shell: walls (split into solid pieces around real openings), floors and
// ceilings per room, roof slabs with soffits/fascia, door and window assemblies.

import {
  WALLS, ROOMS, ROOFS, FOOTPRINTS, DOORS, WINDOWS, FLOOR_Y, zoneAt,
} from './layout.js';
import { HingedDoor } from '../interaction/door.js';
import { buildWindow, buildGlassWall } from '../interaction/window.js';

export function createHouse(ctx) {
  const M = ctx.materials;
  const B = ctx.builder;
  const mat = {
    plaster: M.get('plaster'), stucco: M.get('stucco'), cladding: M.get('cladding'), tile: M.get('bathWallTile'),
    ceiling: M.get('ceiling'), gravel: M.get('gravel'), fascia: M.get('darkMetal'), soffit: M.get('cladding'),
    plinth: M.get('plinth'),
  };

  // ------------------------------------------------------------- walls ----
  for (const wall of WALLS) buildWall(ctx, wall, mat);

  // ------------------------------------------------- floors & ceilings ----
  for (const r of ROOMS) {
    B.box([r.x0, FLOOR_Y - 0.05, r.z0], [r.x1, FLOOR_Y, r.z1], (f) => (f === 'py' ? M.get(r.floor) : null), { zone: r.zone });
    B.box([r.x0, r.ceil, r.z0], [r.x1, r.ceil + 0.05, r.z1], (f) => (f === 'ny' ? mat.ceiling : null), { zone: r.zone, castShadow: true });
  }
  for (const f of FOOTPRINTS) {
    ctx.collision.addFloor({ minX: f.x0, maxX: f.x1, minZ: f.z0, maxZ: f.z1, y: FLOOR_Y });
  }

  // ---------------------------------------------------------------- roof ----
  for (const r of ROOFS) buildRoof(ctx, r, mat);

  // ------------------------------------------------- doors and windows ----
  for (const wall of WALLS) {
    for (const op of wall.openings) {
      if (op.kind === 'door' && DOORS[op.id]) {
        const d = new HingedDoor(ctx, wall, op, DOORS[op.id]);
        ctx.interaction.add(d);
        ctx.doors.push(d);
      } else if (op.kind === 'window') {
        buildWindow(ctx, wall, op, WINDOWS[op.id]);
      } else if (op.kind === 'glasswall') {
        ctx.doors.push(buildGlassWall(ctx, wall, op));
      }
    }
  }
}

function exteriorMaterial(wall, c, mat) {
  // Warm vertical cedar boards on the private wing street facade and east end.
  if (wall.id === 'pri-s' || wall.id === 'pri-e') return mat.cladding;
  return mat.stucco;
}

function buildWall(ctx, wall, mat) {
  const B = ctx.builder;
  const t = wall.t;
  const along = wall.axis;
  const ops = [...wall.openings].sort((a, b) => a.from - b.from);

  const faceMat = (face, c, n) => {
    const endFace = along === 'x' ? (face === 'px' || face === 'nx') : (face === 'pz' || face === 'nz');
    if (face === 'ny' && c[1] < 0.01) return null;
    if (face === 'py' && c[1] >= wall.h - 0.001) return null;
    const z = zoneAt(c[0] + n[0] * 0.05, c[1], c[2] + n[2] * 0.05);
    if (endFace || face === 'py' || face === 'ny') {
      // opening reveals, sills and lintel soffits
      if (z === 'bath') return mat.tile;
      return z === 'ext' ? mat.stucco : mat.plaster;
    }
    if (z === 'ext') return exteriorMaterial(wall, c, mat);
    if (z === 'bath') return mat.tile;
    return mat.plaster;
  };

  // Which side of the wall (+1/-1 along its normal) is outdoors here, plus the room zone
  // on the other side. null when both sides are interior.
  const sideAt = (a) => {
    const probe = (s) => (along === 'x' ? zoneAt(a, 1.2, wall.at + s * (t / 2 + 0.3)) : zoneAt(wall.at + s * (t / 2 + 0.3), 1.2, a));
    const zp = probe(1), zn = probe(-1);
    if (zp === 'ext' && zn !== 'ext') return { out: 1, inZone: zn };
    if (zn === 'ext' && zp !== 'ext') return { out: -1, inZone: zp };
    return null;
  };
  const box = (a0, a1, y0, y1, c0, c1, fm, opts) => (along === 'x'
    ? B.box([a0, y0, c0], [a1, y1, c1], fm, opts)
    : B.box([c0, y0, a0], [c1, y1, a1], fm, opts));
  const posFace = along === 'x' ? 'pz' : 'px', negFace = along === 'x' ? 'nz' : 'nx';
  const hiddenEnds = (face, c) => (face === 'ny' && c[1] < 0.01) || (face === 'py' && c[1] >= wall.h - 0.001);

  const piece = (a0, a1, y0, y1) => {
    if (a1 - a0 < 1e-4 || y1 - y0 < 1e-4) return;
    const sd = sideAt((a0 + a1) / 2);
    if (!sd) {
      box(a0, a1, y0, y1, wall.at - t / 2, wall.at + t / 2, faceMat, { collider: { tag: 'wall' } });
      return;
    }
    // Exterior wall: split the thickness so reveals, sills and lintels get stucco
    // (sky-lit) on the outer half and plaster/tile (room-probe-lit) on the inner half.
    const m = wall.at, outerFace = sd.out > 0 ? posFace : negFace, midOuter = sd.out > 0 ? negFace : posFace;
    const innerMat = sd.inZone === 'bath' ? mat.tile : mat.plaster;
    const outerFm = (face, c) => {
      if (face === midOuter || hiddenEnds(face, c)) return null;
      return face === outerFace ? exteriorMaterial(wall, c, mat) : mat.stucco;
    };
    const innerFm = (face, c) => {
      if (face === outerFace || hiddenEnds(face, c)) return null;
      return innerMat;
    };
    const [o0, o1] = sd.out > 0 ? [m, m + t / 2] : [m - t / 2, m];
    const [i0, i1] = sd.out > 0 ? [m - t / 2, m] : [m, m + t / 2];
    box(a0, a1, y0, y1, o0, o1, outerFm, { zone: 'ext' });
    box(a0, a1, y0, y1, i0, i1, innerFm, { zone: sd.inZone });
    if (along === 'x') ctx.collision.addBox({ minX: a0, maxX: a1, minZ: m - t / 2, maxZ: m + t / 2, minY: y0, maxY: y1, tag: 'wall' });
    else ctx.collision.addBox({ minX: m - t / 2, maxX: m + t / 2, minZ: a0, maxZ: a1, minY: y0, maxY: y1, tag: 'wall' });
  };

  let cursor = wall.from;
  for (const op of ops) {
    piece(cursor, op.from, 0, wall.h);
    const sillY = FLOOR_Y + op.sill, headY = FLOOR_Y + op.head;
    if (op.sill > 0) piece(op.from, op.to, 0, sillY);
    if (headY < wall.h) piece(op.from, op.to, headY, wall.h);
    cursor = op.to;
  }
  piece(cursor, wall.to, 0, wall.h);

  // Dark plinth band along exterior faces (skipped under floor-level openings).
  let a = wall.from;
  const segs = [];
  for (const op of ops) { if (op.sill < 0.3) { segs.push([a, op.from]); a = op.to; } }
  segs.push([a, wall.to]);
  for (const [a0, a1] of segs) {
    if (a1 - a0 < 0.02) continue;
    const sd = sideAt((a0 + a1) / 2);
    if (!sd) continue;
    const s = sd.out;
    const o0 = wall.at + s * t / 2, o1 = o0 + s * 0.012;
    box(a0, a1, 0, 0.28, Math.min(o0, o1), Math.max(o0, o1), (f) => (f === 'ny' ? null : mat.plinth), { zone: 'ext' });
  }
}

function buildRoof(ctx, r, mat) {
  const B = ctx.builder;
  // Top + fascia
  B.box([r.x0, r.y0, r.z0], [r.x1, r.y1, r.z1], (face) => {
    if (face === 'py') return mat.gravel;
    if (face === 'ny') return null;
    // faces that butt against the taller public wing wall are hidden
    if (r.id !== 'roof-pub' && face === 'nx') return null;
    if (r.id === 'canopy' && face === 'nz') return null;
    if (r.id === 'roof-pri' && face === 'pz') {
      return null; // replaced by split fascia below (canopy attaches on part of it)
    }
    return mat.fascia;
  }, { zone: 'ext' });
  if (r.id === 'roof-pri') {
    // front fascia except where the canopy continues the slab
    B.box([4.8, r.y0, r.z1 - 0.01], [r.x1, r.y1, r.z1], (f) => (f === 'pz' ? mat.fascia : null), { zone: 'ext' });
  }
  // Soffits = slab underside outside the wall footprint.
  const fp = FOOTPRINTS.filter(f => !(f.x1 <= r.x0 || f.x0 >= r.x1 || f.z1 <= r.z0 || f.z0 >= r.z1));
  const strips = subtractRects({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1 }, fp);
  for (const s of strips) {
    B.box([s.x0, r.y0, s.z0], [s.x1, r.y0 + 0.02, s.z1], (f) => (f === 'ny' ? mat.soffit : null), { zone: 'ext', castShadow: true });
  }
}

// Rectangle minus a set of rectangles -> list of disjoint rectangles (grid decomposition).
export function subtractRects(r, holes) {
  const xs = new Set([r.x0, r.x1]), zs = new Set([r.z0, r.z1]);
  for (const h of holes) {
    if (h.x0 > r.x0 && h.x0 < r.x1) xs.add(h.x0); if (h.x1 > r.x0 && h.x1 < r.x1) xs.add(h.x1);
    if (h.z0 > r.z0 && h.z0 < r.z1) zs.add(h.z0); if (h.z1 > r.z0 && h.z1 < r.z1) zs.add(h.z1);
  }
  const X = [...xs].sort((a, b) => a - b), Z = [...zs].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < X.length - 1; i++) {
    for (let j = 0; j < Z.length - 1; j++) {
      const cx = (X[i] + X[i + 1]) / 2, cz = (Z[j] + Z[j + 1]) / 2;
      if (holes.some(h => cx > h.x0 && cx < h.x1 && cz > h.z0 && cz < h.z1)) continue;
      out.push({ x0: X[i], x1: X[i + 1], z0: Z[j], z1: Z[j + 1] });
    }
  }
  return out;
}
