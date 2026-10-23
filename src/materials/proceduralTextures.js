// Procedural PBR texture generation with Canvas 2D.
// Structure (planks, tiles, stones, strokes) is drawn with the 2D context; grain,
// pores and wear are added per pixel through ImageData. Every generator is
// tileable (periodic noise lattices + wrapped drawing) so materials repeat
// without seams. Each generator returns canvases for:
//   map    - sRGB base colour
//   orm    - R: ambient occlusion, G: roughness, B: metalness (three.js layout)
//   normal - tangent-space normal map derived from a height field

import * as THREE from 'three';
import { mulberry32, hash2i } from '../core/rng.js';

// ------------------------------------------------------------------ noise ----

function addValueNoise(out, size, cx, cy, seed, amp) {
  const lat = new Float32Array(cx * cy);
  for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) lat[j * cx + i] = hash2i(i, j, seed);
  const sx = cx / size, sy = cy / size;
  const x0a = new Int32Array(size), x1a = new Int32Array(size), txa = new Float32Array(size);
  for (let x = 0; x < size; x++) {
    const fx = x * sx, ix = Math.floor(fx);
    let t = fx - ix; t = t * t * (3 - 2 * t);
    x0a[x] = ix % cx; x1a[x] = (ix + 1) % cx; txa[x] = t;
  }
  for (let y = 0; y < size; y++) {
    const fy = y * sy, iy = Math.floor(fy);
    let ty = fy - iy; ty = ty * ty * (3 - 2 * ty);
    const r0 = (iy % cy) * cx, r1 = ((iy + 1) % cy) * cx, row = y * size;
    for (let x = 0; x < size; x++) {
      const i0 = x0a[x], i1 = x1a[x], tx = txa[x];
      const a = lat[r0 + i0], b = lat[r0 + i1], c = lat[r1 + i0], d = lat[r1 + i1];
      const top = a + (b - a) * tx, bot = c + (d - c) * tx;
      out[row + x] += (top + (bot - top) * ty) * amp;
    }
  }
}

function normalize01(a) {
  let mn = Infinity, mx = -Infinity;
  for (let i = 0; i < a.length; i++) { const v = a[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
  const k = mx > mn ? 1 / (mx - mn) : 0;
  for (let i = 0; i < a.length; i++) a[i] = (a[i] - mn) * k;
  return a;
}

// Tileable fBm. cx/cy = lattice cells across the texture for the first octave.
export function fbm(size, { cx = 4, cy = cx, octaves = 5, gain = 0.5, seed = 1 } = {}) {
  const out = new Float32Array(size * size);
  let amp = 1, x = cx, y = cy;
  for (let o = 0; o < octaves; o++) {
    addValueNoise(out, size, Math.min(x, size), Math.min(y, size), seed * 7919 + o * 101, amp);
    amp *= gain; x *= 2; y *= 2;
  }
  return normalize01(out);
}

// Ridged variant for veins and cracks.
function ridged(size, opts) {
  const f = fbm(size, opts);
  for (let i = 0; i < f.length; i++) f[i] = 1 - Math.abs(f[i] * 2 - 1);
  return normalize01(f);
}

const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const clamp255 = v => (v < 0 ? 0 : v > 255 ? 255 : v);

// ------------------------------------------------------------ canvas glue ---

function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  // CPU-backed canvas: we read pixels back constantly, and GPU-accelerated
  // canvases can silently lose their contents under GPU memory pressure.
  c.getContext('2d', { willReadFrequently: true });
  return c;
}

// Draw a shape at all wrapped offsets so it tiles seamlessly.
function wrapDraw(size, x, y, w, h, fn) {
  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      const dx = ox * size, dy = oy * size;
      if (x + dx + w < 0 || x + dx > size || y + dy + h < 0 || y + dy > size) continue;
      fn(dx, dy);
    }
  }
}

class PixelSet {
  constructor(size) {
    this.size = size;
    const n = size * size;
    this.r = new Float32Array(n); this.g = new Float32Array(n); this.b = new Float32Array(n);
    this.height = new Float32Array(n);
    this.rough = new Float32Array(n).fill(0.5);
    this.ao = new Float32Array(n).fill(1);
    this.metal = new Float32Array(n);
  }
  // Read a drawn canvas into the colour channels (0..255).
  readColor(canvas) {
    const d = canvas.getContext('2d').getImageData(0, 0, this.size, this.size).data;
    for (let i = 0, p = 0; i < this.r.length; i++, p += 4) { this.r[i] = d[p]; this.g[i] = d[p + 1]; this.b[i] = d[p + 2]; }
  }
  // Read the red channel of a drawn canvas as 0..1 values.
  readChannel(canvas, target) {
    const d = canvas.getContext('2d').getImageData(0, 0, this.size, this.size).data;
    for (let i = 0, p = 0; i < target.length; i++, p += 4) target[i] = d[p] / 255;
  }
  finish({ normalStrength = 2, alpha = null } = {}) {
    const s = this.size, n = s * s;
    const map = makeCanvas(s), orm = makeCanvas(s), nrm = makeCanvas(s);
    const mctx = map.getContext('2d'), octx = orm.getContext('2d'), nctx = nrm.getContext('2d');
    const mi = mctx.createImageData(s, s), oi = octx.createImageData(s, s), ni = nctx.createImageData(s, s);
    const md = mi.data, od = oi.data, nd = ni.data;
    const h = this.height;
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      md[p] = clamp255(this.r[i]); md[p + 1] = clamp255(this.g[i]); md[p + 2] = clamp255(this.b[i]);
      md[p + 3] = alpha ? clamp255(alpha[i] * 255) : 255;
      od[p] = clamp255(this.ao[i] * 255); od[p + 1] = clamp255(this.rough[i] * 255); od[p + 2] = clamp255(this.metal[i] * 255); od[p + 3] = 255;
    }
    for (let y = 0; y < s; y++) {
      const ym = ((y - 1 + s) % s) * s, yp = ((y + 1) % s) * s, yc = y * s;
      for (let x = 0; x < s; x++) {
        const xm = (x - 1 + s) % s, xp = (x + 1) % s;
        // Sobel
        const dx = (h[ym + xp] + 2 * h[yc + xp] + h[yp + xp]) - (h[ym + xm] + 2 * h[yc + xm] + h[yp + xm]);
        const dy = (h[yp + xm] + 2 * h[yp + x] + h[yp + xp]) - (h[ym + xm] + 2 * h[ym + x] + h[ym + xp]);
        let nx = -dx * normalStrength, ny = dy * normalStrength, nz = 1;
        const l = 1 / Math.hypot(nx, ny, nz);
        const p = (yc + x) * 4;
        nd[p] = (nx * l * 0.5 + 0.5) * 255; nd[p + 1] = (ny * l * 0.5 + 0.5) * 255; nd[p + 2] = (nz * l * 0.5 + 0.5) * 255; nd[p + 3] = 255;
      }
    }
    mctx.putImageData(mi, 0, 0); octx.putImageData(oi, 0, 0); nctx.putImageData(ni, 0, 0);
    return { map, orm, normal: nrm };
  }
}

// ----------------------------------------------------------- generators -----

// Wooden planks (floor, deck, cladding) or continuous grain (furniture).
// rows: plank rows across the tile; cuts: max butt joints per row (0 = continuous)
export function woodTexture(size, {
  seed = 1, base = [176, 136, 98], dark = [112, 78, 52], rows = 12, cuts = 2, gap = 1.4,
  roughness = 0.45, ringFreq = 9, variation = 0.16, knots = true, weathered = 0, gapDark = 0.34,
} = {}) {
  const ps = new PixelSet(size);
  const rand = mulberry32(seed);
  const grain = fbm(size, { cx: 2, cy: 40, octaves: 5, seed: seed + 1, gain: 0.55 });
  const warp = fbm(size, { cx: 2, cy: 6, octaves: 3, seed: seed + 2 });
  const fine = fbm(size, { cx: 16, cy: 128, octaves: 3, seed: seed + 3 });
  const blotch = fbm(size, { cx: 4, cy: 4, octaves: 4, seed: seed + 4 });
  const rowH = size / rows;
  const rowData = [];
  for (let r = 0; r < rows; r++) {
    const n = cuts === 0 ? 0 : 1 + Math.floor(rand() * cuts);
    const offset = rand() * size;
    const list = [];
    for (let k = 0; k < n; k++) list.push((offset + (k / n) * size + (rand() - 0.5) * size / (n * 2.2)) % size);
    list.sort((a, b) => a - b);
    rowData.push(list);
  }
  const plankInfo = new Map();
  const info = (id) => {
    let v = plankInfo.get(id);
    if (!v) {
      const pr = mulberry32(seed * 1000 + id * 17 + 3);
      v = { tint: (pr() - 0.5) * 2 * variation, ox: Math.floor(pr() * size), oy: Math.floor(pr() * size),
        knot: knots && pr() < 0.28 ? { x: pr(), y: pr(), r: 4 + pr() * 9 } : null, warm: (pr() - 0.5) * 0.08 };
      plankInfo.set(id, v);
    }
    return v;
  };
  const TAU = Math.PI * 2;
  for (let y = 0; y < size; y++) {
    const row = Math.floor(y / rowH);
    const yIn = y - row * rowH;
    const dyEdge = Math.min(yIn, rowH - 1 - yIn);
    const list = rowData[row];
    for (let x = 0; x < size; x++) {
      let k = 0, dxEdge = 1e9;
      if (list.length) {
        k = list.length - 1;
        for (let c = 0; c < list.length; c++) { if (x < list[c]) { k = c - 1; break; } }
        if (k < 0) k = list.length - 1;
        for (let c = 0; c < list.length; c++) {
          const d = Math.abs(x - list[c]);
          dxEdge = Math.min(dxEdge, d, size - d);
        }
      }
      const id = row * 16 + k;
      const pl = info(id);
      const sx = (x + pl.ox) % size, sy = (y + pl.oy) % size;
      const si = sy * size + sx;
      const i = y * size + x;
      const ring = 0.5 + 0.5 * Math.sin(TAU * (sy / size * ringFreq + warp[si] * 2.5 + grain[si] * 0.6));
      let dk = grain[si] * 0.55 + Math.pow(ring, 3) * 0.35 + (fine[si] - 0.5) * 0.25;
      if (pl.knot) {
        const kx = pl.knot.x * size, ky = row * rowH + pl.knot.y * rowH;
        const ddx = Math.min(Math.abs(x - kx), size - Math.abs(x - kx)) * 0.35, ddy = y - ky;
        const kd = Math.hypot(ddx, ddy);
        dk += Math.max(0, 1 - kd / pl.knot.r) * 0.9 + 0.25 * Math.max(0, Math.sin(kd * 0.9)) * Math.max(0, 1 - kd / (pl.knot.r * 2.5));
      }
      dk = Math.min(1, Math.max(0, dk));
      const t = 1 + pl.tint + (blotch[i] - 0.5) * 0.12;
      let rr = (base[0] + (dark[0] - base[0]) * dk) * t * (1 + pl.warm);
      let gg = (base[1] + (dark[1] - base[1]) * dk) * t;
      let bb = (base[2] + (dark[2] - base[2]) * dk) * t * (1 - pl.warm);
      if (weathered > 0) {
        const gray = (rr + gg + bb) / 3;
        const w = weathered * (0.6 + 0.4 * blotch[i]);
        rr += (gray * 1.02 - rr) * w; gg += (gray - gg) * w; bb += (gray * 0.97 - bb) * w;
      }
      const edge = Math.min(dyEdge, dxEdge);
      let hgt = 0.6 + grain[si] * 0.08 + (fine[si] - 0.5) * 0.05 - Math.pow(ring, 3) * 0.03;
      let rough = roughness + (fine[si] - 0.5) * 0.1 + dk * 0.08;
      let ao = 1;
      if (edge < gap) {
        rr *= gapDark; gg *= gapDark * 0.95; bb *= gapDark * 0.92; hgt = 0.05; rough = 0.95; ao = 0.35 + gapDark * 0.5;
      } else if (edge < gap + 3) {
        const e = (edge - gap) / 3;
        hgt = 0.05 + (hgt - 0.05) * smooth(0, 1, e);
        ao = 0.8 + 0.2 * e;
      }
      ps.r[i] = rr; ps.g[i] = gg; ps.b[i] = bb;
      ps.height[i] = hgt; ps.rough[i] = Math.min(1, Math.max(0.05, rough)); ps.ao[i] = ao;
    }
  }
  return ps.finish({ normalStrength: 2.2 });
}

// Smooth painted plaster / exterior render.
export function plasterTexture(size, { seed = 11, base = [236, 233, 226], strength = 1, roughness = 0.9 } = {}) {
  const ps = new PixelSet(size);
  const low = fbm(size, { cx: 3, octaves: 5, seed });
  const mid = fbm(size, { cx: 12, octaves: 4, seed: seed + 1 });
  const hi = fbm(size, { cx: 96, octaves: 2, seed: seed + 2 });
  for (let i = 0; i < low.length; i++) {
    const v = 1 + (low[i] - 0.5) * 0.05 * strength + (mid[i] - 0.5) * 0.03 * strength + (hi[i] - 0.5) * 0.025 * strength;
    ps.r[i] = base[0] * v; ps.g[i] = base[1] * v; ps.b[i] = base[2] * v;
    ps.height[i] = mid[i] * 0.3 * strength + hi[i] * 0.4 * strength + low[i] * 0.2;
    ps.rough[i] = roughness + (hi[i] - 0.5) * 0.08;
  }
  return ps.finish({ normalStrength: 1.2 * strength });
}

// Concrete with pores, stains and (optionally) saw-cut joints on the tile border.
export function concreteTexture(size, { seed = 21, base = [152, 149, 143], joints = true, roughness = 0.82 } = {}) {
  const ps = new PixelSet(size);
  const low = fbm(size, { cx: 3, octaves: 6, seed });
  const mid = fbm(size, { cx: 16, octaves: 4, seed: seed + 1 });
  const hi = fbm(size, { cx: 128, octaves: 2, seed: seed + 2 });
  const stain = fbm(size, { cx: 5, octaves: 5, seed: seed + 3 });
  const rand = mulberry32(seed);
  const pores = new Float32Array(size * size);
  const nPores = Math.floor(size * size / 900);
  for (let p = 0; p < nPores; p++) {
    const cx = Math.floor(rand() * size), cy = Math.floor(rand() * size), r = 0.6 + rand() * 1.6;
    const ri = Math.ceil(r);
    for (let dy = -ri; dy <= ri; dy++) for (let dx = -ri; dx <= ri; dx++) {
      const d = Math.hypot(dx, dy) / r;
      if (d < 1) { const idx = ((cy + dy + size) % size) * size + (cx + dx + size) % size; pores[idx] = Math.max(pores[idx], 1 - d); }
    }
  }
  const jw = size / 340;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    let v = 1 + (low[i] - 0.5) * 0.16 + (mid[i] - 0.5) * 0.08 + (hi[i] - 0.5) * 0.08 - smooth(0.55, 0.9, stain[i]) * 0.12;
    v -= pores[i] * 0.25;
    let hgt = 0.7 + mid[i] * 0.05 + hi[i] * 0.06 - pores[i] * 0.3;
    let ao = 1 - pores[i] * 0.5;
    let rough = roughness + (hi[i] - 0.5) * 0.12 - smooth(0.55, 0.9, stain[i]) * 0.08;
    if (joints) {
      const d = Math.min(x, size - 1 - x, y, size - 1 - y);
      if (d < jw) { v *= 0.55; hgt = 0.1; ao = 0.4; rough = 0.95; }
      else if (d < jw + 2) { hgt = 0.1 + (hgt - 0.1) * ((d - jw) / 2); }
    }
    ps.r[i] = base[0] * v; ps.g[i] = base[1] * v; ps.b[i] = base[2] * v;
    ps.height[i] = hgt; ps.ao[i] = ao; ps.rough[i] = rough;
  }
  return ps.finish({ normalStrength: 2.0 });
}

// Natural stone pavers in running-bond rows (courtyard, paths, pool coping).
export function paverTexture(size, { seed = 31, base = [146, 141, 132], rows = 6, grout = [92, 88, 82], roughness = 0.78, spread = 0.18 } = {}) {
  const ps = new PixelSet(size);
  const rand = mulberry32(seed);
  const color = makeCanvas(size), hc = makeCanvas(size);
  const cctx = color.getContext('2d'), hctx = hc.getContext('2d');
  cctx.fillStyle = `rgb(${grout.join(',')})`; cctx.fillRect(0, 0, size, size);
  hctx.fillStyle = '#000'; hctx.fillRect(0, 0, size, size);
  const rowH = size / rows, g = Math.max(2, size / 220);
  for (let r = 0; r < rows; r++) {
    let x = rand() * size;
    const end = x + size;
    while (x < end - 1) {
      let w = rowH * (1.1 + rand() * 1.6);
      if (end - (x + w) < rowH * 0.8) w = end - x;
      const t = 1 + (rand() - 0.5) * 2 * spread;
      const warm = (rand() - 0.5) * 10;
      const fill = `rgb(${Math.round(base[0] * t + warm)},${Math.round(base[1] * t)},${Math.round(base[2] * t - warm)})`;
      const lift = 0.75 + rand() * 0.25;
      const sx = x, sy = r * rowH, sw = w, sh = rowH;
      wrapDraw(size, sx, sy, sw, sh, (dx, dy) => {
        cctx.fillStyle = fill;
        roundRect(cctx, sx + dx + g / 2, sy + dy + g / 2, sw - g, sh - g, g * 1.2); cctx.fill();
        const grd = hctx.createLinearGradient(0, sy + dy, 0, sy + dy + sh);
        const v = Math.round(lift * 255);
        grd.addColorStop(0, `rgb(${v * 0.85},0,0)`); grd.addColorStop(0.5, `rgb(${v},0,0)`); grd.addColorStop(1, `rgb(${v * 0.85},0,0)`);
        hctx.fillStyle = grd;
        roundRect(hctx, sx + dx + g / 2, sy + dy + g / 2, sw - g, sh - g, g * 1.6); hctx.fill();
      });
      x += w;
    }
  }
  ps.readColor(color);
  ps.readChannel(hc, ps.height);
  const mid = fbm(size, { cx: 10, octaves: 5, seed: seed + 1 });
  const hi = fbm(size, { cx: 80, octaves: 2, seed: seed + 2 });
  for (let i = 0; i < ps.r.length; i++) {
    const stone = ps.height[i] > 0.05;
    const n = (mid[i] - 0.5) * 0.18 + (hi[i] - 0.5) * 0.12;
    ps.r[i] *= 1 + n; ps.g[i] *= 1 + n; ps.b[i] *= 1 + n;
    ps.height[i] = stone ? ps.height[i] * 0.8 + mid[i] * 0.12 + hi[i] * 0.08 : 0;
    ps.rough[i] = stone ? roughness + (hi[i] - 0.5) * 0.15 : 0.95;
    ps.ao[i] = stone ? 1 : 0.45;
  }
  return ps.finish({ normalStrength: 2.4 });
}

// Square/rectangular tiles with thin grout and optional stone veining.
export function tileTexture(size, {
  seed = 41, cols = 2, rows = 2, base = [170, 163, 154], grout = [130, 126, 120], groutW = 2,
  roughness = 0.3, veins = 0.35, spread = 0.05, stagger = false,
} = {}) {
  const ps = new PixelSet(size);
  const low = fbm(size, { cx: 4, octaves: 6, seed });
  const hi = fbm(size, { cx: 64, octaves: 3, seed: seed + 1 });
  const vein = ridged(size, { cx: 3, octaves: 6, seed: seed + 2, gain: 0.55 });
  const tw = size / cols, th = size / rows;
  const rand = mulberry32(seed);
  const tint = [];
  for (let k = 0; k < cols * rows * 2; k++) tint.push({ t: 1 + (rand() - 0.5) * 2 * spread, ox: Math.floor(rand() * size), oy: Math.floor(rand() * size) });
  for (let y = 0; y < size; y++) {
    const r = Math.floor(y / th);
    const yIn = y - r * th;
    const shift = stagger && (r % 2) ? tw / 2 : 0;
    for (let x = 0; x < size; x++) {
      const xs = (x + shift) % size;
      const c = Math.floor(xs / tw);
      const xIn = xs - c * tw;
      const tile = tint[r * cols + c];
      const i = y * size + x;
      const si = ((y + tile.oy) % size) * size + (x + tile.ox) % size;
      const edge = Math.min(xIn, tw - 1 - xIn, yIn, th - 1 - yIn);
      const v = tile.t * (1 + (low[si] - 0.5) * 0.08 + (hi[si] - 0.5) * 0.04) - Math.pow(vein[si], 9) * veins;
      if (edge < groutW) {
        ps.r[i] = grout[0]; ps.g[i] = grout[1]; ps.b[i] = grout[2];
        ps.height[i] = 0; ps.rough[i] = 0.9; ps.ao[i] = 0.5;
      } else {
        ps.r[i] = base[0] * v; ps.g[i] = base[1] * v; ps.b[i] = base[2] * v;
        ps.height[i] = 0.8 * smooth(groutW, groutW + 2.5, edge) + hi[si] * 0.01;
        ps.rough[i] = roughness + (hi[si] - 0.5) * 0.06;
        ps.ao[i] = 0.75 + 0.25 * smooth(groutW, groutW + 3, edge);
      }
    }
  }
  return ps.finish({ normalStrength: 2.0 });
}

// Polished marble slab (countertops, vanity).
export function marbleTexture(size, { seed = 51, base = [234, 232, 228], vein = [120, 118, 116], roughness = 0.12 } = {}) {
  const ps = new PixelSet(size);
  const warp = fbm(size, { cx: 3, octaves: 6, seed });
  const warp2 = fbm(size, { cx: 6, octaves: 5, seed: seed + 1 });
  const cloud = fbm(size, { cx: 4, octaves: 6, seed: seed + 2 });
  const TAU = Math.PI * 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const t = x / size * 2 + y / size * 1 + warp[i] * 2.4 + warp2[i] * 0.8;
    const s = Math.abs(Math.sin(TAU * t * 0.5));
    const v1 = Math.pow(1 - s, 14);
    const t2 = x / size * 1 - y / size * 3 + warp2[i] * 3.1;
    const v2 = Math.pow(1 - Math.abs(Math.sin(TAU * t2 * 0.5)), 28) * 0.6;
    const vv = Math.min(1, v1 * 0.85 + v2);
    const c = 1 + (cloud[i] - 0.5) * 0.06;
    ps.r[i] = (base[0] + (vein[0] - base[0]) * vv) * c;
    ps.g[i] = (base[1] + (vein[1] - base[1]) * vv) * c;
    ps.b[i] = (base[2] + (vein[2] - base[2]) * vv) * c;
    ps.height[i] = 0.5;
    ps.rough[i] = roughness + vv * 0.05;
  }
  return ps.finish({ normalStrength: 0.5 });
}

// Woven textile (sofa, bedding, curtains). Near-white so material colour tints it.
export function fabricTexture(size, { seed = 61, threads = 96, base = [232, 230, 226], roughness = 0.92, slub = 0.12 } = {}) {
  const ps = new PixelSet(size);
  const low = fbm(size, { cx: 6, octaves: 4, seed });
  const slubX = fbm(size, { cx: 4, cy: 64, octaves: 3, seed: seed + 1 });
  const slubY = fbm(size, { cx: 64, cy: 4, octaves: 3, seed: seed + 2 });
  const fuzz = fbm(size, { cx: 128, octaves: 2, seed: seed + 3 });
  const f = Math.PI * 2 * threads / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const wx = Math.sin(x * f), wy = Math.sin(y * f);
    const over = Math.sin((x + y) * f * 0.5) > 0;
    const thread = over ? 0.5 + 0.5 * wy : 0.5 + 0.5 * wx;
    const v = 1 - 0.1 * (1 - thread) + (slubX[i] - 0.5) * slub + (slubY[i] - 0.5) * slub * 0.6 + (low[i] - 0.5) * 0.05 + (fuzz[i] - 0.5) * 0.06;
    ps.r[i] = base[0] * v; ps.g[i] = base[1] * v; ps.b[i] = base[2] * v;
    ps.height[i] = thread * 0.6 + fuzz[i] * 0.2;
    ps.rough[i] = roughness + (fuzz[i] - 0.5) * 0.06;
    ps.ao[i] = 0.82 + 0.18 * thread;
  }
  return ps.finish({ normalStrength: 1.4 });
}

// Lawn: multi-scale colour variation plus thousands of drawn blade strokes.
export function grassTexture(size, { seed = 71 } = {}) {
  const ps = new PixelSet(size);
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const rand = mulberry32(seed);
  ctx.fillStyle = 'rgb(66,82,38)'; ctx.fillRect(0, 0, size, size);
  const n = Math.floor(size * size / 22);
  ctx.lineCap = 'round';
  for (let k = 0; k < n; k++) {
    const x = rand() * size, y = rand() * size;
    const len = (2 + rand() * 7) * size / 1024;
    const a = -Math.PI / 2 + (rand() - 0.5) * 1.6;
    const g = 70 + rand() * 70, r = g * (0.55 + rand() * 0.35), b = g * (0.25 + rand() * 0.2);
    ctx.strokeStyle = `rgba(${r | 0},${g | 0},${b | 0},${0.55 + rand() * 0.45})`;
    ctx.lineWidth = (0.6 + rand() * 1.1) * size / 1024;
    const ex = Math.cos(a) * len, ey = Math.sin(a) * len;
    wrapDraw(size, Math.min(x, x + ex) - 2, Math.min(y, y + ey) - 2, Math.abs(ex) + 4, Math.abs(ey) + 4, (dx, dy) => {
      ctx.beginPath(); ctx.moveTo(x + dx, y + dy); ctx.lineTo(x + ex + dx, y + ey + dy); ctx.stroke();
    });
  }
  ps.readColor(c);
  const low = fbm(size, { cx: 3, octaves: 5, seed: seed + 1 });
  const mid = fbm(size, { cx: 12, octaves: 4, seed: seed + 2 });
  const dirt = fbm(size, { cx: 6, octaves: 5, seed: seed + 3 });
  const hi = fbm(size, { cx: 160, octaves: 2, seed: seed + 4 });
  for (let i = 0; i < ps.r.length; i++) {
    const dry = smooth(0.55, 0.85, low[i]);
    const d = smooth(0.72, 0.9, dirt[i]) * 0.6;
    let r = ps.r[i] * (1 + dry * 0.35), g = ps.g[i] * (1 + dry * 0.12), b = ps.b[i] * (1 - dry * 0.1);
    const m = 0.88 + (mid[i] - 0.5) * 0.3;
    r *= m; g *= m; b *= m;
    r += (96 - r) * d; g += (80 - g) * d; b += (58 - b) * d;
    ps.r[i] = r; ps.g[i] = g; ps.b[i] = b;
    ps.height[i] = hi[i] * 0.6 + mid[i] * 0.2 + (ps.g[i] / 255) * 0.4;
    ps.rough[i] = 0.9 + (hi[i] - 0.5) * 0.1;
    ps.ao[i] = 0.75 + 0.25 * (ps.g[i] / 160);
  }
  return ps.finish({ normalStrength: 2.5 });
}

// Stacked ledgestone (fireplace feature wall): thin long stones with strong relief.
export function ledgestoneTexture(size, { seed = 81, base = [150, 146, 140] } = {}) {
  const ps = new PixelSet(size);
  const rand = mulberry32(seed);
  const color = makeCanvas(size), hc = makeCanvas(size);
  const cctx = color.getContext('2d'), hctx = hc.getContext('2d');
  cctx.fillStyle = 'rgb(40,38,36)'; cctx.fillRect(0, 0, size, size);
  hctx.fillStyle = '#000'; hctx.fillRect(0, 0, size, size);
  let y = 0;
  while (y < size - 2) {
    let h = size / 26 * (0.6 + rand() * 0.9);
    if (size - (y + h) < size / 60) h = size - y;
    let x = rand() * size;
    const end = x + size;
    while (x < end - 1) {
      let w = size * (0.08 + rand() * 0.22);
      if (end - (x + w) < size * 0.04) w = end - x;
      const t = 0.75 + rand() * 0.5;
      const warm = (rand() - 0.5) * 8;
      const sx = x, sy = y, sw = w, sh = h;
      const depth = 0.45 + rand() * 0.55;
      const fill = `rgb(${Math.round(base[0] * t + warm)},${Math.round(base[1] * t + warm * 0.4)},${Math.round(base[2] * t)})`;
      wrapDraw(size, sx, sy, sw, sh, (dx, dy) => {
        cctx.fillStyle = fill;
        roundRect(cctx, sx + dx + 1, sy + dy + 1, sw - 2, sh - 2, 2); cctx.fill();
        const v = Math.round(depth * 255);
        hctx.fillStyle = `rgb(${v},0,0)`;
        roundRect(hctx, sx + dx + 1.5, sy + dy + 1.5, sw - 3, sh - 3, 3); hctx.fill();
      });
      x += w;
    }
    y += h;
  }
  ps.readColor(color);
  ps.readChannel(hc, ps.height);
  const mid = fbm(size, { cx: 14, cy: 40, octaves: 5, seed: seed + 1 });
  const hi = fbm(size, { cx: 90, octaves: 2, seed: seed + 2 });
  for (let i = 0; i < ps.r.length; i++) {
    const stone = ps.height[i] > 0.05;
    const n = (mid[i] - 0.5) * 0.3 + (hi[i] - 0.5) * 0.15;
    ps.r[i] *= 1 + n; ps.g[i] *= 1 + n; ps.b[i] *= 1 + n;
    ps.height[i] = stone ? ps.height[i] + (mid[i] - 0.5) * 0.25 + hi[i] * 0.1 : 0;
    ps.rough[i] = stone ? 0.8 + (hi[i] - 0.5) * 0.15 : 0.95;
    ps.ao[i] = stone ? 0.6 + ps.height[i] * 0.4 : 0.25;
  }
  return ps.finish({ normalStrength: 3.5 });
}

// Brushed metal: anisotropic streaks in roughness and a faint normal.
export function brushedMetalTexture(size, { seed = 91 } = {}) {
  const ps = new PixelSet(size);
  const streak = fbm(size, { cx: 2, cy: 256, octaves: 2, seed });
  const low = fbm(size, { cx: 4, octaves: 3, seed: seed + 1 });
  for (let i = 0; i < ps.r.length; i++) {
    const v = 1 + (streak[i] - 0.5) * 0.08;
    ps.r[i] = ps.g[i] = ps.b[i] = 235 * v;
    ps.height[i] = streak[i] * 0.4;
    ps.rough[i] = 0.32 + (streak[i] - 0.5) * 0.18 + (low[i] - 0.5) * 0.05;
    ps.metal[i] = 1;
  }
  return ps.finish({ normalStrength: 0.6 });
}

export function barkTexture(size, { seed = 101 } = {}) {
  const ps = new PixelSet(size);
  const ridge = ridged(size, { cx: 10, cy: 2, octaves: 5, seed, gain: 0.55 });
  const mid = fbm(size, { cx: 24, cy: 6, octaves: 4, seed: seed + 1 });
  const moss = fbm(size, { cx: 4, octaves: 4, seed: seed + 2 });
  for (let i = 0; i < ps.r.length; i++) {
    const h = Math.pow(ridge[i], 1.6) * 0.8 + mid[i] * 0.2;
    const v = 0.45 + h * 0.65;
    const m = smooth(0.62, 0.85, moss[i]) * (1 - h) * 0.6;
    ps.r[i] = (92 * v) * (1 - m) + 70 * m; ps.g[i] = (82 * v) * (1 - m) + 84 * m; ps.b[i] = (72 * v) * (1 - m) + 48 * m;
    ps.height[i] = h; ps.rough[i] = 0.9; ps.ao[i] = 0.5 + h * 0.5;
  }
  return ps.finish({ normalStrength: 3.0 });
}

// Leaf cluster card with alpha (tree and shrub foliage).
export function leafTexture(size, { seed = 111, hue = [74, 98, 44], spread = 0.35, count = 140 } = {}) {
  const ps = new PixelSet(size);
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const a = makeCanvas(size);
  const actx = a.getContext('2d');
  const rand = mulberry32(seed);
  ctx.fillStyle = `rgb(${hue.map(v => v * 0.6 | 0).join(',')})`; ctx.fillRect(0, 0, size, size);
  actx.fillStyle = '#000'; actx.fillRect(0, 0, size, size);
  // Twigs
  ctx.strokeStyle = 'rgb(70,58,44)'; actx.strokeStyle = '#fff';
  for (let k = 0; k < 6; k++) {
    const x0 = size / 2 + (rand() - 0.5) * size * 0.2, y0 = size * 0.98;
    const x1 = rand() * size, y1 = rand() * size * 0.5;
    ctx.lineWidth = actx.lineWidth = size / 220;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(size / 2, size / 2, x1, y1); ctx.stroke();
    actx.beginPath(); actx.moveTo(x0, y0); actx.quadraticCurveTo(size / 2, size / 2, x1, y1); actx.stroke();
  }
  for (let k = 0; k < count; k++) {
    const ang = rand() * Math.PI * 2, rad = Math.sqrt(rand()) * size * 0.43;
    const x = size / 2 + Math.cos(ang) * rad, y = size / 2 + Math.sin(ang) * rad * 0.95;
    const len = size * (0.05 + rand() * 0.05), wid = len * (0.38 + rand() * 0.2);
    const rot = rand() * Math.PI * 2;
    const t = 1 + (rand() - 0.5) * 2 * spread;
    const yellow = rand() * 0.25;
    const r = hue[0] * t * (1 + yellow), g = hue[1] * t, b = hue[2] * t * (1 - yellow);
    for (const [cx, col] of [[ctx, `rgb(${r | 0},${g | 0},${b | 0})`], [actx, '#fff']]) {
      cx.save(); cx.translate(x, y); cx.rotate(rot);
      cx.fillStyle = col;
      cx.beginPath(); cx.moveTo(-len / 2, 0);
      cx.quadraticCurveTo(0, -wid, len / 2, 0); cx.quadraticCurveTo(0, wid, -len / 2, 0); cx.fill();
      if (cx === ctx) {
        cx.strokeStyle = `rgba(${(r * 0.7) | 0},${(g * 0.75) | 0},${(b * 0.6) | 0},0.7)`; cx.lineWidth = size / 900;
        cx.beginPath(); cx.moveTo(-len / 2, 0); cx.lineTo(len / 2, 0); cx.stroke();
      }
      cx.restore();
    }
  }
  ps.readColor(c);
  const alpha = new Float32Array(size * size);
  ps.readChannel(a, alpha);
  const fine = fbm(size, { cx: 64, octaves: 2, seed: seed + 1 });
  for (let i = 0; i < ps.r.length; i++) {
    ps.height[i] = alpha[i] * 0.5 + fine[i] * 0.2;
    ps.rough[i] = 0.62 + (fine[i] - 0.5) * 0.1;
  }
  return ps.finish({ normalStrength: 1.0, alpha });
}

export function asphaltTexture(size, { seed = 121 } = {}) {
  const ps = new PixelSet(size);
  const low = fbm(size, { cx: 4, octaves: 5, seed });
  const hi = fbm(size, { cx: 200, octaves: 2, seed: seed + 1 });
  const agg = fbm(size, { cx: 300, octaves: 1, seed: seed + 2 });
  for (let i = 0; i < ps.r.length; i++) {
    const stone = smooth(0.7, 0.8, agg[i]);
    const v = 58 + (low[i] - 0.5) * 14 + (hi[i] - 0.5) * 16 + stone * 36;
    ps.r[i] = v; ps.g[i] = v; ps.b[i] = v * 1.03;
    ps.height[i] = hi[i] * 0.5 + stone * 0.5;
    ps.rough[i] = 0.88 - stone * 0.15;
  }
  return ps.finish({ normalStrength: 2.0 });
}

// Painted abstract canvas for the art frames (non-repeating, soft colour fields).
export function paintingTexture(w, h, { seed = 131, palette } = {}) {
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const rand = mulberry32(seed);
  const pal = palette || [[214, 205, 188], [176, 112, 78], [64, 78, 86], [198, 168, 112], [120, 132, 118]];
  ctx.fillStyle = `rgb(${pal[0].join(',')})`; ctx.fillRect(0, 0, w, h);
  const bands = 2 + Math.floor(rand() * 3);
  let y = h * 0.08;
  for (let b = 0; b < bands; b++) {
    const bh = (h * 0.84 / bands) * (0.8 + rand() * 0.35);
    const col = pal[1 + Math.floor(rand() * (pal.length - 1))];
    for (let k = 0; k < 40; k++) {
      ctx.fillStyle = `rgba(${col.map(v => Math.round(v * (0.9 + rand() * 0.2))).join(',')},0.08)`;
      const j = rand() * 8;
      ctx.beginPath();
      ctx.ellipse(w / 2 + (rand() - 0.5) * 10, y + bh / 2, w * 0.42 + j, bh * 0.45 + j, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    y += bh + h * 0.03;
  }
  // Fine brush texture
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * 10;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// Area rug (not tiled: covers the whole rug, uv 0..1).
export function rugTexture(size, { seed = 141, base = [196, 188, 172], accent = [120, 108, 94], border = true, pattern = 'lines' } = {}) {
  const ps = new PixelSet(size);
  const fiber = fbm(size, { cx: 128, octaves: 2, seed });
  const low = fbm(size, { cx: 5, octaves: 4, seed: seed + 1 });
  const TAU = Math.PI * 2;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const u = x / size, v = y / size;
    let m = 0;
    if (pattern === 'lines') {
      const wv = Math.sin(TAU * (u * 3 + Math.sin(TAU * v * 1.5) * 0.08));
      m = smooth(0.92, 0.97, Math.abs(wv));
    } else {
      const gx = Math.abs(((u * 8) % 1) - 0.5), gy = Math.abs(((v * 6) % 1) - 0.5);
      m = smooth(0.44, 0.47, Math.max(gx, gy)) * 0.8;
    }
    if (border) {
      const e = Math.min(u, 1 - u, v, 1 - v);
      if (e < 0.06 && e > 0.045) m = 1;
    }
    const n = 1 + (fiber[i] - 0.5) * 0.1 + (low[i] - 0.5) * 0.05;
    ps.r[i] = (base[0] + (accent[0] - base[0]) * m) * n;
    ps.g[i] = (base[1] + (accent[1] - base[1]) * m) * n;
    ps.b[i] = (base[2] + (accent[2] - base[2]) * m) * n;
    ps.height[i] = fiber[i] * 0.35 + (1 - m) * 0.08;
    ps.rough[i] = 0.95;
    ps.ao[i] = 0.8 + fiber[i] * 0.2;
  }
  return ps.finish({ normalStrength: 2.0 });
}

// Roof membrane with ballast gravel.
export function gravelTexture(size, { seed = 151 } = {}) {
  const ps = new PixelSet(size);
  const a = fbm(size, { cx: 90, octaves: 2, seed });
  const b = fbm(size, { cx: 40, octaves: 3, seed: seed + 1 });
  for (let i = 0; i < ps.r.length; i++) {
    const pebble = smooth(0.45, 0.7, a[i]);
    const v = 90 + pebble * 60 + (b[i] - 0.5) * 30;
    ps.r[i] = v; ps.g[i] = v * 0.97; ps.b[i] = v * 0.92;
    ps.height[i] = pebble; ps.rough[i] = 0.9; ps.ao[i] = 0.6 + pebble * 0.4;
  }
  return ps.finish({ normalStrength: 2.5 });
}

// Small dark soil / mulch for planters.
export function soilTexture(size, { seed = 161 } = {}) {
  const ps = new PixelSet(size);
  const a = fbm(size, { cx: 64, octaves: 3, seed });
  const b = fbm(size, { cx: 8, octaves: 4, seed: seed + 1 });
  for (let i = 0; i < ps.r.length; i++) {
    const v = 0.6 + a[i] * 0.6 + (b[i] - 0.5) * 0.3;
    ps.r[i] = 62 * v; ps.g[i] = 48 * v; ps.b[i] = 36 * v;
    ps.height[i] = a[i]; ps.rough[i] = 0.95;
  }
  return ps.finish({ normalStrength: 2.0 });
}

function roundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------------------------------------------------- three.js wrappers -----

export function canvasToTexture(canvas, { srgb = false, repeat = 1, anisotropy = 8, wrap = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (wrap) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = anisotropy;
  if (Array.isArray(repeat)) t.repeat.set(repeat[0], repeat[1]); else t.repeat.set(repeat, repeat);
  t.needsUpdate = true;
  return t;
}

// Turns a generator result into three.js textures. `tile` is the world size in
// metres the texture covers (world-space UVs are in metres).
export function toTextureSet(set, { tile = 1, anisotropy = 8, wrap = true } = {}) {
  const rep = Array.isArray(tile) ? [1 / tile[0], 1 / tile[1]] : 1 / tile;
  return {
    map: canvasToTexture(set.map, { srgb: true, repeat: rep, anisotropy, wrap }),
    orm: canvasToTexture(set.orm, { repeat: rep, anisotropy, wrap }),
    normal: canvasToTexture(set.normal, { repeat: rep, anisotropy, wrap }),
  };
}
