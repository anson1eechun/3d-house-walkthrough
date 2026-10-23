// Single source of truth for the house plan. 1 world unit = 1 metre.
// x: east(+) / west(-), z: front/street(+) / back garden(-), y: up.
//
//            x=-12                 x=0      x=3.5        x=8.5        x=13
//   z=-7  +-----------------------+--------+------------+------------+
//         |  LIVING (客廳)         | BATH   | BED 1      | BED 2      |
//         |  glass wall to deck   |        | (主臥室)    | (次臥室)    |
//   z=-0.5|- - - - - - - - - - - -|        |            |            |
//         | DINING     | KITCHEN  +--D-----+--D---------+--D---------+ z=-0.6
//         | (餐廳)      | (廚房)   | ENTRY      HALLWAY (走廊)        |
//         |            |          +--FD----------------------------+ z=1
//   z=7   +------------+----------+   front courtyard / driveway
//
// The public wing (west) is taller than the private wing (east).

export const FLOOR_Y = 0.15;     // finished interior floor height
export const EXT_T = 0.25;       // exterior wall thickness
export const INT_T = 0.12;       // interior partition thickness
export const H_PUB = 3.45;       // top of public wing walls (3.30 m ceiling)
export const H_PRI = 3.05;       // top of private wing walls (2.90 m ceiling)
export const ROOF_T = 0.4;
export const EYE_HEIGHT = 1.65;

export const ROOMS = [
  { id: 'living',  name: '客廳',   zone: 'public', x0: -12, x1: 0,    z0: -7,   z1: -0.5, floor: 'oak',     ceil: H_PUB },
  { id: 'dining',  name: '餐廳',   zone: 'public', x0: -12, x1: -5.5, z0: -0.5, z1: 7,    floor: 'oak',     ceil: H_PUB },
  { id: 'kitchen', name: '廚房',   zone: 'public', x0: -5.5, x1: 0,   z0: -0.5, z1: 7,    floor: 'stoneTile', ceil: H_PUB },
  { id: 'entry',   name: '玄關',   zone: 'hall',   x0: 0,   x1: 3.5,  z0: -0.6, z1: 1,    floor: 'stoneTile', ceil: H_PRI },
  { id: 'hall',    name: '走廊',   zone: 'hall',   x0: 3.5, x1: 13,   z0: -0.6, z1: 1,    floor: 'oak',     ceil: H_PRI },
  { id: 'bath',    name: '浴室',   zone: 'bath',   x0: 0,   x1: 3.5,  z0: -7,   z1: -0.6, floor: 'bathTile', ceil: H_PRI },
  { id: 'bed1',    name: '主臥室', zone: 'bed1',   x0: 3.5, x1: 8.5,  z0: -7,   z1: -0.6, floor: 'oak',     ceil: H_PRI },
  { id: 'bed2',    name: '次臥室', zone: 'bed2',   x0: 8.5, x1: 13,   z0: -7,   z1: -0.6, floor: 'oak',     ceil: H_PRI },
];

export const OUTDOOR_AREAS = [
  { name: '入口門廊', x0: 0.1, x1: 4.8, z0: 1, z1: 3.4 },
  { name: '前院', x0: -0.2, x1: 14, z0: 1, z1: 8.2 },
  { name: '車道', x0: 6.5, x1: 12, z0: 8.2, z1: 34 },
  { name: '後院露台', x0: -12.2, x1: 0.2, z0: -11.4, z1: -7 },
  { name: '泳池區', x0: -12, x1: 0, z0: -21, z1: -12 },
];
export const OUTDOOR_DEFAULT = '庭院';

// Probe zones: one reflection/irradiance capture per zone (see rendering/probes.js).
export const ZONES = {
  public: { probe: [-6, 1.7, -0.5] },
  hall:   { probe: [6.5, 1.6, 0.15] },
  bath:   { probe: [1.75, 1.6, -3.6] },
  bed1:   { probe: [6.0, 1.6, -3.8] },
  bed2:   { probe: [10.7, 1.6, -3.8] },
};

// Walls are axis-aligned boxes along a centreline. Openings are given as
// absolute coordinates along the wall axis (x for E-W walls, z for N-S walls)
// with sill/head heights relative to the finished floor.
export const WALLS = [
  // ---- public wing (exterior) ----
  { id: 'pub-n', axis: 'x', at: -7, from: -12.125, to: 0.125, t: EXT_T, h: H_PUB, openings: [
    { from: -11.4, to: -0.9, sill: 0, head: 2.9, kind: 'glasswall', id: 'glass-living' },
  ] },
  { id: 'pub-s', axis: 'x', at: 7, from: -12.125, to: 0.125, t: EXT_T, h: H_PUB, openings: [
    { from: -10.5, to: -8.5, sill: 0.9, head: 2.3, kind: 'window', id: 'win-dining' },
    { from: -4.3, to: -1.7, sill: 1.05, head: 2.2, kind: 'window', id: 'win-kitchen' },
  ] },
  { id: 'pub-w', axis: 'z', at: -12, from: -6.875, to: 6.875, t: EXT_T, h: H_PUB, openings: [
    { from: 2.0, to: 5.5, sill: 0.95, head: 2.75, kind: 'window', id: 'win-dining-w' },
  ] },
  { id: 'pub-e', axis: 'z', at: 0, from: -6.875, to: 6.875, t: EXT_T, h: H_PUB, openings: [
    { from: -0.54, to: 0.875, sill: 0, head: 2.5, kind: 'passage' },
  ] },
  // ---- private wing (exterior) ----
  { id: 'pri-n', axis: 'x', at: -7, from: 0.125, to: 13.125, t: EXT_T, h: H_PRI, openings: [
    { from: 1.0, to: 2.6, sill: 1.6, head: 2.5, kind: 'window', id: 'win-bath' },
    { from: 4.6, to: 7.6, sill: 0.45, head: 2.6, kind: 'window', id: 'win-bed1' },
    { from: 9.4, to: 11.8, sill: 0.9, head: 2.4, kind: 'window', id: 'win-bed2' },
  ] },
  { id: 'pri-e', axis: 'z', at: 13, from: -6.875, to: 0.875, t: EXT_T, h: H_PRI, openings: [
    { from: -2.6, to: -1.4, sill: 0.9, head: 2.3, kind: 'window', id: 'win-bed2-e' },
    { from: -0.4, to: 0.7, sill: 0.3, head: 2.6, kind: 'window', id: 'win-hall-e' },
  ] },
  { id: 'pri-s', axis: 'x', at: 1, from: 0.125, to: 13.125, t: EXT_T, h: H_PRI, openings: [
    { from: 1.2, to: 2.3, sill: 0, head: 2.4, kind: 'door', id: 'door-front' },
    { from: 2.45, to: 2.95, sill: 0, head: 2.4, kind: 'window', id: 'win-sidelight' },
    { from: 5.0, to: 5.5, sill: 0.25, head: 2.6, kind: 'window', id: 'win-hall-1' },
    { from: 8.0, to: 8.5, sill: 0.25, head: 2.6, kind: 'window', id: 'win-hall-2' },
    { from: 11.0, to: 11.5, sill: 0.25, head: 2.6, kind: 'window', id: 'win-hall-3' },
  ] },
  // ---- private wing (interior partitions) ----
  { id: 'hall-n', axis: 'x', at: -0.6, from: 0.125, to: 12.875, t: INT_T, h: H_PRI, openings: [
    { from: 2.4, to: 3.2, sill: 0, head: 2.1, kind: 'door', id: 'door-bath' },
    { from: 4.0, to: 4.9, sill: 0, head: 2.1, kind: 'door', id: 'door-bed1' },
    { from: 9.3, to: 10.2, sill: 0, head: 2.1, kind: 'door', id: 'door-bed2' },
  ] },
  { id: 'bath-e', axis: 'z', at: 3.5, from: -6.875, to: -0.66, t: INT_T, h: H_PRI, openings: [] },
  { id: 'bed1-e', axis: 'z', at: 8.5, from: -6.875, to: -0.66, t: INT_T, h: H_PRI, openings: [] },
];

// Hinged doors. hinge: which opening end carries the hinge ('from'|'to').
// openSide: +1/-1 along the wall normal axis (z for x-walls) the leaf swings into.
export const DOORS = {
  'door-front': { hinge: 'from', openSide: +1, angle: 95, style: 'front', label: '大門' },
  'door-bath':  { hinge: 'to',   openSide: -1, angle: 95, style: 'interior', label: '浴室門' },
  'door-bed1':  { hinge: 'from', openSide: -1, angle: 95, style: 'interior', label: '主臥室門' },
  'door-bed2':  { hinge: 'from', openSide: -1, angle: 95, style: 'interior', label: '次臥室門' },
};

// Operable windows. Everything else in WALLS of kind 'window' is fixed glazing.
export const WINDOWS = {
  'win-dining':  { type: 'casement2', openSide: +1, label: '餐廳窗戶' },
  'win-kitchen': { type: 'slider', label: '廚房窗戶' },
  'win-bath':    { type: 'awning', openSide: -1, frosted: true, label: '浴室氣窗' },
  'win-bed1':    { type: 'casementLeft', split: 1.0, openSide: -1, label: '主臥室窗戶' },
  'win-bed2':    { type: 'casementRight', split: 1.2, openSide: -1, label: '次臥室窗戶' },
};

// Roof slabs (top of slab = y1). Undersides inside the footprint become ceilings.
export const ROOFS = [
  { id: 'roof-pub', x0: -13.0, x1: 1.0, z0: -7.9, z1: 7.9, y0: H_PUB, y1: H_PUB + ROOF_T },
  { id: 'roof-pri', x0: 0.125, x1: 13.85, z0: -7.8, z1: 1.8, y0: H_PRI, y1: H_PUB - 0.01 },
  { id: 'canopy',   x0: 0.125, x1: 4.8, z0: 1.8, z1: 3.4, y0: H_PRI, y1: H_PUB - 0.01 },
];

export const FOOTPRINTS = [
  { x0: -12.125, x1: 0.125, z0: -7.125, z1: 7.125, top: H_PUB + ROOF_T },
  { x0: 0.125, x1: 13.125, z0: -7.125, z1: 1.125, top: H_PUB },
];

// Interior volume (inside faces of the exterior walls), used to classify surfaces.
const INNER = [
  { x0: -11.875, x1: -0.125, z0: -6.875, z1: 6.875 },
  { x0: 0.125, x1: 12.875, z0: -6.875, z1: 0.875 },
  { x0: -0.2, x1: 0.2, z0: -0.54, z1: 0.875 }, // passage between kitchen and entry
];

export function roomAt(x, z) {
  for (const r of ROOMS) {
    if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return r;
  }
  return null;
}

export function insideFootprint(x, z, margin = 0) {
  for (const f of FOOTPRINTS) {
    if (x >= f.x0 - margin && x <= f.x1 + margin && z >= f.z0 - margin && z <= f.z1 + margin) return true;
  }
  return false;
}

// Zone used for probe-lit materials. Points outside the wall envelope or above
// the ceilings are exterior and use the sky environment instead.
export function zoneAt(x, y, z) {
  const r = roomAt(x, z);
  if (!r) return 'ext';
  const inner = INNER.some(f => x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1);
  if (!inner) return 'ext';
  if (y > r.ceil + 0.02) return 'ext';
  return r.zone;
}

export function areaNameAt(x, z) {
  const r = roomAt(x, z);
  if (r && insideFootprint(x, z, -EXT_T * 0.5)) return r.name;
  for (const a of OUTDOOR_AREAS) {
    if (x >= a.x0 && x <= a.x1 && z >= a.z0 && z <= a.z1) return a.name;
  }
  return OUTDOOR_DEFAULT;
}
