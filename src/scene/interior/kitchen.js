import * as THREE from 'three';
import { FLOOR_Y, H_PUB } from '../layout.js';
import { ToggleFurniture, ApplianceToggle, slidePart, hingePart, Y_AXIS, X_AXIS } from '../../interaction/furniture.js';
import { LAYER } from '../../core/layers.js';
import { mulberry32 } from '../../core/rng.js';
import { plant, vase, books, artFrame, proxy } from './common.js';

const F = FLOOR_Y;
const COUNTER = 0.92;    // worktop height above floor

// A drawer: front panel + open box, sliding along the parent's +z.
export function makeDrawer(kit, { w, h, d, x, y, z, front = 'greigeLacquer', handle = 'brass', bar = true }) {
  const g = kit.group();
  g.add(kit.rbox(w - 0.004, h - 0.004, 0.019, 0.003, front, 0, 0, 0));
  const bw = w - 0.07, bh = Math.max(0.06, h * 0.62), bd = d - 0.06, by = -h / 2 + 0.035;
  g.add(kit.mergedBoxes([
    [bw, 0.012, bd, 0, by, -bd / 2 - 0.01],
    [0.012, bh, bd, -bw / 2, by + bh / 2, -bd / 2 - 0.01],
    [0.012, bh, bd, bw / 2, by + bh / 2, -bd / 2 - 0.01],
    [bw, bh, 0.012, 0, by + bh / 2, -bd - 0.01],
  ], 'whiteMatte'));
  if (bar) g.add(kit.box(Math.min(0.4, w * 0.5), 0.012, 0.022, handle, 0, h / 2 - 0.05, 0.02));
  g.position.set(x, y, z);
  kit.dynamic(g);
  return { obj: g, front: g.children[0], travel: d * 0.72 };
}

// A hinged door: pivot on the hinge edge at the front face.
export function makeDoor(kit, { w, h, x, y, z, hingeLeft = true, mat = 'greigeLacquer', handle = 'brass', handleV = true, thick = 0.019 }) {
  const pivot = kit.group();
  pivot.position.set(hingeLeft ? x - w / 2 : x + w / 2, y, z);
  const s = hingeLeft ? 1 : -1;
  const panel = kit.rbox(w - 0.004, h - 0.004, thick, 0.003, mat, s * w / 2, 0, -thick / 2);
  pivot.add(panel);
  if (handle) {
    const hb = handleV ? kit.box(0.012, Math.min(0.3, h * 0.4), 0.022, handle, s * (w - 0.045), 0, 0.012) : kit.box(Math.min(0.3, w * 0.5), 0.012, 0.022, handle, s * w / 2, h / 2 - 0.05, 0.012);
    pivot.add(hb);
  }
  kit.dynamic(pivot);
  return { obj: pivot, front: panel, angle: -s * 1.85 };
}

export function buildKitchenDining(env) {
  const { ctx, kit, groups, fx } = env;
  const B = ctx.builder;
  const M = ctx.materials;
  let uid = 0;
  const reg = (label, meshes, parts, opts = {}) => {
    const it = new ToggleFurniture(ctx, { id: 'kit-' + (uid++), label, meshes, parts, ...opts });
    it.zone = 'public';
    ctx.interaction.add(it);
    return it;
  };

  // ======================================================= south run =====
  {
    const g = kit.group();          // local: x along wall (world x), +z = front (world -z) after rotY = PI
    const x0 = -5.3, x1 = -0.125;   // world x range
    const L = x1 - x0, D = 0.62, H = COUNTER - 0.04;
    // carcass (as one box minus fronts) + toe kick
    g.add(kit.box(L, 0.1, D - 0.07, 'rubber', 0, 0.05, -0.035));
    g.add(kit.box(L, H - 0.1, D - 0.02, 'whiteMatte', 0, 0.1 + (H - 0.1) / 2, -0.01));
    const segs = [[-5.3, -4.5, 'drawers3'], [-4.5, -3.9, 'dish'], [-3.9, -2.1, 'sink'], [-2.1, -1.3, 'drawers2'], [-1.3, -0.125, 'doors']];
    const toLocal = (wx) => -(wx - (x0 + x1) / 2);   // rotY=PI flips x
    const fz = D / 2 + 0.0095;
    const frontH = H - 0.1;
    const yc = 0.1 + frontH / 2;
    const items = [];
    for (const [a, b, kind] of segs) {
      const cx = toLocal((a + b) / 2), w = b - a;
      if (kind === 'drawers3' || kind === 'drawers2') {
        const n = kind === 'drawers3' ? 3 : 2;
        const hh = frontH / n;
        for (let i = 0; i < n; i++) {
          const dr = makeDrawer(kit, { w, h: hh, d: D - 0.05, x: cx, y: 0.1 + hh * (n - i - 0.5), z: fz });
          g.add(dr.obj);
          items.push(['抽屜', [dr.front], [slidePart(dr.obj, 0, 0, dr.travel)], { colliders: [{ object: dr.obj, w, d: 0.05, h: hh, y0: F + 0.1 + hh * (n - i - 1), local: [0, 0] }] }]);
        }
      } else if (kind === 'dish') {
        // dishwasher: bottom-hinged panel door
        const pivot = kit.group();
        pivot.position.set(cx, 0.1, fz);
        pivot.add(kit.rbox(w - 0.004, frontH - 0.004, 0.019, 0.003, 'greigeLacquer', 0, frontH / 2, -0.0095));
        pivot.add(kit.box(0.4, 0.012, 0.022, 'brass', 0, frontH - 0.05, 0.012));
        kit.dynamic(pivot);
        g.add(pivot);
        // racks inside
        g.add(kit.box(w - 0.06, 0.01, D - 0.1, 'steel', cx, 0.35, -0.03));
        g.add(kit.box(w - 0.06, 0.01, D - 0.1, 'steel', cx, 0.6, -0.03));
        items.push(['洗碗機', [pivot.children[0]], [hingePart(pivot, X_AXIS, 1.4)], { sound: 'drawer' }]);
      } else if (kind === 'sink') {
        const d1 = makeDoor(kit, { w: w / 2, h: frontH, x: cx - w / 4, y: yc, z: fz, hingeLeft: true });
        const d2 = makeDoor(kit, { w: w / 2, h: frontH, x: cx + w / 4, y: yc, z: fz, hingeLeft: false });
        g.add(d1.obj, d2.obj);
        items.push(['水槽下櫃', [d1.front, d2.front], [hingePart(d1.obj, Y_AXIS, d1.angle), hingePart(d2.obj, Y_AXIS, d2.angle)], { sound: 'drawer', duration: 0.8 }]);
      } else {
        const d1 = makeDoor(kit, { w: w / 2, h: frontH, x: cx - w / 4, y: yc, z: fz, hingeLeft: true });
        const d2 = makeDoor(kit, { w: w / 2, h: frontH, x: cx + w / 4, y: yc, z: fz, hingeLeft: false });
        g.add(d1.obj, d2.obj);
        items.push(['櫥櫃', [d1.front, d2.front], [hingePart(d1.obj, Y_AXIS, d1.angle), hingePart(d2.obj, Y_AXIS, d2.angle)], { sound: 'drawer', duration: 0.8 }]);
        // shelf + pots inside
        g.add(kit.box(w - 0.04, 0.015, D - 0.08, 'whiteMatte', cx, 0.45, -0.03));
        g.add(kit.cyl(0.11, 0.1, 0.12, 'steel', cx - 0.25, 0.52, -0.05));
        g.add(kit.cyl(0.09, 0.08, 0.1, 'steel', cx + 0.2, 0.51, -0.05));
      }
    }
    // worktop with an undermount sink cut-out
    const sx0 = toLocal(-2.62), sx1 = toLocal(-3.38);   // local (flipped) x range of the bowl
    const top = (lx0, lx1, lz0, lz1) => g.add(kit.box(lx1 - lx0, 0.04, lz1 - lz0, 'marble', (lx0 + lx1) / 2, H + 0.02, (lz0 + lz1) / 2));
    const tz0 = -D / 2, tz1 = D / 2 + 0.02;
    top(-L / 2, sx0, tz0, tz1);
    top(sx1, L / 2 + 0.02, tz0, tz1);
    top(sx0, sx1, tz0, -0.2);
    top(sx0, sx1, 0.24, tz1);
    // stainless bowl
    const bw = sx1 - sx0, bz0 = -0.2, bz1 = 0.24, bd = 0.22, bcz = (bz0 + bz1) / 2;
    g.add(kit.box(bw, 0.01, bz1 - bz0, 'steel', (sx0 + sx1) / 2, H - bd, bcz));
    g.add(kit.box(0.01, bd, bz1 - bz0, 'steel', sx0, H - bd / 2, bcz));
    g.add(kit.box(0.01, bd, bz1 - bz0, 'steel', sx1, H - bd / 2, bcz));
    g.add(kit.box(bw, bd, 0.01, 'steel', (sx0 + sx1) / 2, H - bd / 2, bz0));
    g.add(kit.box(bw, bd, 0.01, 'steel', (sx0 + sx1) / 2, H - bd / 2, bz1));
    g.add(kit.cyl(0.03, 0.03, 0.004, 'chrome', (sx0 + sx1) / 2, H - bd + 0.007, bcz, 16));
    // gooseneck tap
    const tapX = (sx0 + sx1) / 2, tapZ = -0.26;
    g.add(kit.cyl(0.025, 0.028, 0.03, 'steel', tapX, H + 0.055, tapZ, 16));
    const spout = kit.tube('gooseneck', [[0, 0, 0], [0, 0.22, 0], [0, 0.34, 0.06], [0, 0.32, 0.2], [0, 0.24, 0.24]], 0.012, 'steel', 40);
    spout.position.set(tapX, H + 0.07, tapZ);
    g.add(spout);
    g.add(kit.box(0.012, 0.012, 0.07, 'steel', tapX + 0.03, H + 0.13, tapZ + 0.02));
    // backsplash and side panels in marble
    g.add(kit.box(L, COUNTER + 0.13 - COUNTER, 0.02, 'marble', 0, H + 0.04 + 0.065, -D / 2 + 0.01));
    for (const [a, b] of [[-5.3, -4.32], [-1.68, -0.125]]) {
      g.add(kit.box(b - a, 1.2, 0.02, 'marble', toLocal((a + b) / 2), H + 0.04 + 0.6, -D / 2 + 0.01));
      g.add(kit.box(b - a - 0.04, 0.035, 0.26, 'walnut', toLocal((a + b) / 2), H + 0.82, -D / 2 + 0.15));
    }
    // decor on shelves and worktop
    g.add(vase(kit, 'k1', 0.06, 0.18, 'ceramic', toLocal(-4.95), H + 0.84, -D / 2 + 0.14));
    g.add(kit.lathe('jar', [[0, 0], [0.05, 0], [0.05, 0.16], [0.03, 0.17], [0, 0.17]], 'ceramicMatte', toLocal(-4.6), H + 0.84, -D / 2 + 0.14, 20));
    g.add(kit.lathe('bowl2', [[0, 0], [0.09, 0.01], [0.12, 0.07], [0.115, 0.075], [0.08, 0.02], [0, 0.02]], 'ceramic', toLocal(-1.0), H + 0.84, -D / 2 + 0.14));
    books(kit, g, [toLocal(-0.55), H + 0.8375, -D / 2 + 0.14], 4, 0.3, 0.2, mulberry32(12), true);
    g.add(kit.rbox(0.42, 0.025, 0.3, 0.01, 'walnut', toLocal(-1.0), H + 0.0525, -0.05));    // chopping board
    kit.place(g, (x0 + x1) / 2, 6.875 - D / 2, Math.PI);
    kit.commit(g, { collider: { w: L, d: D, h: COUNTER } });
    for (const [label, meshes, parts, opts] of items) reg(label, meshes, parts, opts);

    // running water (toggle with the tap)
    const waterMat = new THREE.ShaderMaterial({
      uniforms: { uTime: ctx.globals.uTime },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uTime; varying vec2 vUv;
        float h(float x){ return fract(sin(x*91.7)*43758.5); }
        void main(){ float v = fract(vUv.y * 6.0 + uTime * 4.0); float s = 0.55 + 0.45 * h(floor(vUv.y*30.0 + uTime*25.0));
          float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);
          gl_FragColor = vec4(vec3(0.75, 0.82, 0.88) * (0.6 + 0.4 * v) * s, 0.55 * edge); }`,
      transparent: true, depthWrite: false,
    });
    const tapWorld = new THREE.Vector3(tapX, H + 0.07 + 0.24, tapZ + 0.24).applyMatrix4(g.matrixWorld);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.007, 0.5, 10, 1, true), waterMat);
    water.position.set(tapWorld.x, tapWorld.y - 0.25, tapWorld.z);
    water.scale.y = 1;
    water.visible = false;
    water.layers.set(LAYER.MAIN_ONLY);
    ctx.scene.add(water);
    const tapProxy = proxy(kit, 0.12, 0.4, 0.34, tapWorld.x, F + COUNTER + 0.2, tapWorld.z + 0.1);
    const tap = new ApplianceToggle(ctx, { id: 'kitchen-tap', label: '水龍頭', meshes: [tapProxy], reach: 1.8, onSet: (on) => { water.visible = on; } });
    tap.zone = 'public';
    ctx.interaction.add(tap);
  }

  // ===================================================== tall units ======
  {
    const g = kit.group();   // local x along wall -> world +z, +z front -> world -x  (rotY = -PI/2)
    const z0 = 3.355, z1 = 6.255, D = 0.62, H = 2.4, T = 0.02;
    const L = z1 - z0;
    const toLocal = (wz) => wz - (z0 + z1) / 2;
    g.add(kit.box(L, 0.1, D - 0.07, 'rubber', 0, 0.05, -0.035));
    g.add(kit.box(L, T, D, 'walnut', 0, H - T / 2, 0));                 // top
    g.add(kit.box(L, H, 0.012, 'walnut', 0, H / 2, -D / 2 + 0.006));    // back
    const dividers = [3.355, 4.155, 4.755, 5.655, 6.255];
    for (const wz of dividers) g.add(kit.box(T, H - 0.1, D - 0.02, 'walnut', toLocal(wz) + (wz === z0 ? T / 2 : wz === z1 ? -T / 2 : 0), 0.1 + (H - 0.1) / 2, -0.01));
    const fz = D / 2 + 0.0095;
    const items = [];
    // filler above the units up to the ceiling
    g.add(kit.box(L, H_PUB - F - H, D, 'plaster', 0, H + (H_PUB - F - H) / 2, 0));
    // pantry
    {
      const cx = toLocal((3.355 + 4.155) / 2), w = 0.8;
      for (const y of [0.5, 0.9, 1.3, 1.7, 2.05]) g.add(kit.box(w - 0.04, 0.018, D - 0.06, 'oakLight', cx, y, -0.02));
      const rnd = mulberry32(31);
      for (const y of [0.509, 0.909, 1.309, 1.709]) {
        for (let i = 0; i < 4; i++) {
          if (rnd() < 0.25) continue;
          const jh = 0.12 + rnd() * 0.12;
          const jar = kit.lathe('pj', [[0, 0], [0.045, 0], [0.045, 0.14], [0.03, 0.15], [0.03, 0.17], [0, 0.17]], i % 2 ? 'ceramic' : 'terracotta', cx - 0.27 + i * 0.18, y, -0.05 + (rnd() - 0.5) * 0.1, 18);
          jar.scale.set(1, jh / 0.17, 1);
          g.add(jar);
        }
      }
      const d1 = makeDoor(kit, { w, h: H - 0.1, x: cx, y: 0.1 + (H - 0.1) / 2, z: fz, hingeLeft: true, mat: 'walnut', handle: 'brass' });
      g.add(d1.obj);
      items.push(['食物櫃', [d1.front], [hingePart(d1.obj, Y_AXIS, d1.angle)], { duration: 0.9, colliders: [{ object: d1.front, w, d: 0.05, h: H - 0.15, y0: F + 0.12, local: [0, 0] }] }]);
    }
    // oven tower
    {
      const cx = toLocal((4.155 + 4.755) / 2), w = 0.6;
      const ovY0 = 0.82, ovH = 0.6;
      // oven cavity
      g.add(kit.box(w - 0.06, ovH - 0.06, 0.02, 'blackMetal', cx, ovY0 + ovH / 2, -D / 2 + 0.06));
      g.add(kit.box(w - 0.06, 0.02, D - 0.1, 'blackMetal', cx, ovY0 + 0.03, -0.04));
      g.add(kit.box(w - 0.06, 0.02, D - 0.1, 'blackMetal', cx, ovY0 + ovH - 0.03, -0.04));
      g.add(kit.box(0.02, ovH - 0.06, D - 0.1, 'blackMetal', cx - w / 2 + 0.04, ovY0 + ovH / 2, -0.04));
      g.add(kit.box(0.02, ovH - 0.06, D - 0.1, 'blackMetal', cx + w / 2 - 0.04, ovY0 + ovH / 2, -0.04));
      g.add(kit.box(w - 0.1, 0.008, D - 0.14, 'chrome', cx, ovY0 + 0.25, -0.04));
      const ovenLight = ctx.lighting.emissive(groups.kitchen, { color: 0xffc070, intensity: 0, base: 0x333333 });
      g.add(kit.box(0.08, 0.004, 0.04, ovenLight, cx, ovY0 + ovH - 0.042, -0.1));
      // control strip
      g.add(kit.box(w - 0.004, 0.08, 0.02, 'blackGlass', cx, ovY0 + ovH + 0.045, fz - 0.0095));
      // drop-down door
      const pivot = kit.group();
      pivot.position.set(cx, ovY0, fz);
      pivot.add(kit.box(w - 0.006, ovH - 0.006, 0.03, 'blackGlass', 0, ovH / 2, -0.015));
      pivot.add(kit.box(0.42, 0.016, 0.03, 'steel', 0, ovH - 0.06, 0.02));
      kit.dynamic(pivot);
      g.add(pivot);
      items.push(['烤箱', [pivot.children[0]], [hingePart(pivot, X_AXIS, 1.45)], { duration: 0.9, onChange: (open) => { ovenLight.emissiveIntensity = open ? 3 : 0; } }]);
      // drawer under, cabinet above
      const dr = makeDrawer(kit, { w, h: ovY0 - 0.1, d: D - 0.05, x: cx, y: 0.1 + (ovY0 - 0.1) / 2, z: fz, front: 'walnut' });
      g.add(dr.obj);
      items.push(['抽屜', [dr.front], [slidePart(dr.obj, 0, 0, dr.travel)], {}]);
      const up = makeDoor(kit, { w, h: H - ovY0 - ovH - 0.1, x: cx, y: ovY0 + ovH + 0.1 + (H - ovY0 - ovH - 0.1) / 2, z: fz, hingeLeft: false, mat: 'walnut' });
      g.add(up.obj);
      items.push(['上櫃', [up.front], [hingePart(up.obj, Y_AXIS, up.angle)], { duration: 0.8 }]);
    }
    // integrated fridge
    {
      const cx = toLocal((4.755 + 5.655) / 2), w = 0.9;
      const liner = 'whiteMatte';
      g.add(kit.box(w - 0.06, H - 0.16, 0.02, liner, cx, 0.13 + (H - 0.16) / 2, -D / 2 + 0.05));
      g.add(kit.box(0.02, H - 0.16, D - 0.08, liner, cx - w / 2 + 0.04, 0.13 + (H - 0.16) / 2, -0.03));
      g.add(kit.box(0.02, H - 0.16, D - 0.08, liner, cx + w / 2 - 0.04, 0.13 + (H - 0.16) / 2, -0.03));
      const fridgeLight = ctx.lighting.emissive(groups.kitchen, { color: 0xeef4ff, intensity: 0, base: 0xf4f4f4 });
      g.add(kit.box(w - 0.1, 0.01, D - 0.12, fridgeLight, cx, H - 0.05, -0.03));
      const rnd = mulberry32(19);
      for (const y of [0.55, 0.95, 1.35, 1.75]) {
        g.add(kit.box(w - 0.1, 0.008, D - 0.12, 'frostedPanel', cx, y, -0.03));
        for (let i = 0; i < 4; i++) {
          if (rnd() < 0.3) continue;
          const tall = rnd() < 0.4;
          const col = ['ceramic', 'terracotta', 'fabricBlue', 'oakLight'][Math.floor(rnd() * 4)];
          if (tall) g.add(kit.cyl(0.035, 0.035, 0.24, col, cx - 0.3 + i * 0.2, y + 0.124, -0.08, 14));
          else g.add(kit.rbox(0.14, 0.09, 0.12, 0.01, col, cx - 0.3 + i * 0.2, y + 0.05, -0.06));
        }
      }
      const d = makeDoor(kit, { w, h: H - 0.1, x: cx, y: 0.1 + (H - 0.1) / 2, z: fz, hingeLeft: false, mat: 'walnut', handle: 'brass', thick: 0.05 });
      g.add(d.obj);
      // door shelves
      for (const y of [-0.4, 0.0, 0.4]) d.obj.add(kit.dynamic(kit.box(w - 0.12, 0.08, 0.08, 'frostedPanel', -(w / 2), y, -0.1)));
      items.push(['冰箱', [d.front], [hingePart(d.obj, Y_AXIS, d.angle * 0.85)], { duration: 1.0,
        onChange: (open) => { fridgeLight.emissiveIntensity = open ? 4 : 0; },
        colliders: [{ object: d.front, w, d: 0.07, h: H - 0.15, y0: F + 0.12, local: [0, 0] }] }]);
    }
    // tall cabinet
    {
      const cx = toLocal((5.655 + 6.255) / 2), w = 0.6;
      for (const y of [0.6, 1.2, 1.8]) g.add(kit.box(w - 0.04, 0.018, D - 0.06, 'oakLight', cx, y, -0.02));
      g.add(kit.cyl(0.12, 0.11, 0.22, 'steel', cx, 0.71, -0.04));
      const d = makeDoor(kit, { w, h: H - 0.1, x: cx, y: 0.1 + (H - 0.1) / 2, z: fz, hingeLeft: true, mat: 'walnut' });
      g.add(d.obj);
      items.push(['高櫃', [d.front], [hingePart(d.obj, Y_AXIS, d.angle)], { duration: 0.9 }]);
    }
    kit.place(g, -0.125 - D / 2, (z0 + z1) / 2, -Math.PI / 2);
    kit.commit(g, { collider: { w: L, d: D, h: H } });
    // (pantry and fridge doors swing into the aisle, so they carry colliders)
    for (const [label, meshes, parts, opts] of items) reg(label, meshes, parts, opts);
  }

  // ========================================================== island =====
  {
    const g = kit.group();   // local x = world x, +z front = world +z (cook side faces south)
    const L = 2.9, D = 0.7, H = COUNTER - 0.04;
    g.add(kit.box(L - 0.1, 0.1, D - 0.07, 'rubber', 0, 0.05, -0.035));
    g.add(kit.box(L - 0.08, H - 0.1, D - 0.02, 'walnut', 0, 0.1 + (H - 0.1) / 2, -0.01));
    // waterfall worktop: top slab + two end panels
    g.add(kit.box(L, 0.04, 1.0, 'marble', 0, H + 0.02, -0.15));
    g.add(kit.box(0.04, H, 1.0, 'marble', -L / 2 + 0.02, H / 2, -0.15));
    g.add(kit.box(0.04, H, 1.0, 'marble', L / 2 - 0.02, H / 2, -0.15));
    // induction hob
    g.add(kit.box(0.7, 0.006, 0.5, 'blackGlass', 0.65, H + 0.043, 0.0));
    for (const [x, z, r] of [[0.48, -0.1, 0.09], [0.82, -0.1, 0.07], [0.48, 0.12, 0.07], [0.82, 0.12, 0.09]]) {
      const ring = kit.torus(r, 0.0025, 'whiteMatte', x, H + 0.0465, z);
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
    }
    // drawers on the cook side: 3 columns x 2
    const items = [];
    const cols = 3, cw = (L - 0.08) / cols, fz = D / 2 + 0.0095 - 0.01;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < 2; r++) {
        const hh = (H - 0.1) / 2;
        const dr = makeDrawer(kit, { w: cw, h: hh, d: D - 0.08, x: -L / 2 + 0.04 + cw * (c + 0.5), y: 0.1 + hh * (r + 0.5), z: fz, front: 'walnut', handle: 'brass' });
        g.add(dr.obj);
        items.push(['抽屜', [dr.front], [slidePart(dr.obj, 0, 0, dr.travel)], { colliders: [{ object: dr.obj, w: cw, d: 0.05, h: hh, y0: F + 0.1 + hh * r, local: [0, 0] }] }]);
      }
    }
    // a bowl of fruit and a cookbook on the seating side
    g.add(kit.lathe('fruitbowl', [[0, 0], [0.12, 0.01], [0.17, 0.08], [0.165, 0.085], [0.1, 0.025], [0, 0.02]], 'walnut', -0.8, H + 0.04, -0.3));
    const rnd = mulberry32(8);
    for (let i = 0; i < 6; i++) g.add(kit.sphere(0.035 + rnd() * 0.01, i % 2 ? 'terracotta' : 'fabricOlive', -0.8 + (rnd() - 0.5) * 0.14, H + 0.1 + rnd() * 0.02, -0.3 + (rnd() - 0.5) * 0.14, 14, 10));
    books(kit, g, [-0.1, H + 0.04, -0.42], 2, 0.3, 0.24, mulberry32(4));
    kit.place(g, -3.25, 4.6, 0);
    kit.commit(g, { collider: { w: L, d: 1.0, h: COUNTER, z: -0.15 } });
    for (const [label, meshes, parts, opts] of items) reg(label, meshes, parts, opts);

    // bar stools on the north side
    for (const x of [-4.2, -3.3, -2.4]) {
      const s = kit.group(
        kit.rbox(0.4, 0.06, 0.36, 0.025, 'leather', 0, 0.66, 0),
        kit.rbox(0.38, 0.18, 0.04, 0.015, 'leather', 0, 0.8, -0.17),
      );
      for (const [lx, lz] of [[-0.16, -0.14], [0.16, -0.14], [-0.16, 0.14], [0.16, 0.14]]) {
        const leg = kit.cyl(0.013, 0.016, 0.64, 'oakLight', lx, 0.32, lz, 10);
        leg.rotation.set(lz * 0.25, 0, -lx * 0.25);
        s.add(leg);
      }
      s.add(kit.box(0.36, 0.015, 0.015, 'brass', 0, 0.24, 0.15));
      kit.place(s, x, 3.75, 0);
      kit.commit(s, { shrink: 0.04 });
    }

    // ceiling hood above the hob
    const hood = kit.group(
      kit.rbox(0.95, 0.1, 0.6, 0.01, 'steel', 0, 0, 0),
      kit.box(0.3, H_PUB - F - 2.2 - 0.05, 0.3, 'steel', 0, (H_PUB - F - 2.2) / 2, 0),
    );
    const hoodLamp = ctx.lighting.emissive(groups.kitchen, { color: 0xfff0dc, intensity: 6 });
    hood.add(kit.box(0.6, 0.004, 0.06, hoodLamp, 0, -0.052, 0.12));
    kit.place(hood, -3.25 + 0.65, 4.6, 0, F + 2.2);
    kit.commit(hood, { collider: null });

    // pendant globes over the seating end
    for (const x of [-4.25, -3.55]) {
      const glow = ctx.lighting.emissive(groups.kitchen, { color: 0xffe2bc, intensity: 9, base: 0xf8f4ec });
      const p = kit.group(
        kit.cyl(0.003, 0.003, H_PUB - F - 1.95, 'blackMetal', 0, (H_PUB - F - 1.95) / 2 + 0.13, 0, 6),
        kit.cyl(0.035, 0.035, 0.04, 'brass', 0, 0.13, 0, 16),
        kit.sphere(0.12, glow, 0, 0, 0, 28, 18),
      );
      p.children[2].castShadow = false;
      kit.place(p, x, 4.45, 0, F + 1.95);
      kit.commit(p, { collider: null });
    }
  }

  // ========================================================== dining =====
  {
    const g = kit.group();
    g.add(kit.rbox(2.4, 0.05, 1.0, 0.012, 'walnut', 0, 0.725, 0));
    for (const x of [-0.95, 0.95]) g.add(kit.rbox(0.06, 0.7, 0.8, 0.01, 'walnut', x, 0.35, 0));
    g.add(kit.box(1.84, 0.06, 0.04, 'walnut', 0, 0.62, 0));
    // table decor
    g.add(vase(kit, 'dt', 0.08, 0.32, 'ceramicMatte', 0.1, 0.75, 0));
    for (let i = 0; i < 5; i++) {
      const stem = kit.cyl(0.003, 0.003, 0.5, 'bark', 0.1 + (i - 2) * 0.012, 1.25, (i % 2 - 0.5) * 0.02, 5);
      stem.rotation.z = (i - 2) * 0.12;
      g.add(stem);
    }
    g.add(kit.cyl(0.12, 0.12, 0.012, 'ceramic', -0.55, 0.756, 0.0, 28));
    kit.place(g, -8.7, 3.4, 0);
    kit.commit(g, { collider: { w: 2.3, d: 0.9, h: 0.75 } });
    for (const x of [-9.55, -8.7, -7.85]) {
      for (const side of [-1, 1]) {
        const ch = diningChair(kit);
        kit.place(ch, x, 3.4 + side * 0.66, side > 0 ? Math.PI : 0);
        kit.commit(ch, { shrink: 0.04 });
      }
    }
    // linear pendant
    const strip = ctx.lighting.emissive(groups.dining, { color: 0xffdcb4, intensity: 10 });
    const p = kit.group(
      kit.rbox(1.6, 0.05, 0.09, 0.01, 'blackMetal', 0, 0, 0),
      kit.box(1.56, 0.004, 0.06, strip, 0, -0.027, 0),
    );
    for (const x of [-0.6, 0.6]) p.add(kit.cyl(0.0025, 0.0025, H_PUB - F - 1.95, 'blackMetal', x, (H_PUB - F - 1.95) / 2, 0, 6));
    kit.place(p, -8.7, 3.4, 0, F + 1.95);
    kit.commit(p, { collider: null });
    const s = new THREE.SpotLight(0xffdcb4, 16, 0, 1.15, 0.8, 2);
    s.position.set(-8.7, F + 1.92, 3.4);
    s.target.position.set(-8.7, 0, 3.4);
    fx.shadowCandidate(s);
    ctx.scene.add(s, s.target);
    ctx.lighting.addLight(groups.dining, s, 16);
  }

  // sideboard under the west window
  {
    const g = kit.group();
    const L = 2.7, D = 0.45, H = 0.75;
    g.add(kit.box(L, 0.04, D, 'walnut', 0, H - 0.02, 0));
    g.add(kit.box(L, H - 0.16, D - 0.02, 'walnut', 0, 0.12 + (H - 0.16) / 2, -0.01));
    for (const x of [-L / 2 + 0.06, L / 2 - 0.06]) g.add(kit.box(0.04, 0.12, D - 0.06, 'blackMetal', x, 0.06, 0));
    const items = [];
    const n = 4, w = L / n, fz = D / 2 + 0.0095;
    for (let pair = 0; pair < 2; pair++) {
      const a = makeDoor(kit, { w, h: H - 0.18, x: -L / 2 + w * (pair * 2 + 0.5), y: 0.12 + (H - 0.18) / 2, z: fz, hingeLeft: true, mat: 'walnut', handle: 'brass', handleV: true });
      const b = makeDoor(kit, { w, h: H - 0.18, x: -L / 2 + w * (pair * 2 + 1.5), y: 0.12 + (H - 0.18) / 2, z: fz, hingeLeft: false, mat: 'walnut', handle: 'brass', handleV: true });
      g.add(a.obj, b.obj);
      g.add(kit.box(w * 2 - 0.06, 0.015, D - 0.06, 'oakLight', -L / 2 + w * (pair * 2 + 1), 0.4, -0.02));
      g.add(kit.lathe('plate' + pair, [[0, 0], [0.12, 0], [0.13, 0.02], [0, 0.015]], 'ceramic', -L / 2 + w * (pair * 2 + 1), 0.4075, -0.02));
      items.push(['餐櫃', [a.front, b.front], [hingePart(a.obj, Y_AXIS, a.angle), hingePart(b.obj, Y_AXIS, b.angle)], { duration: 0.8 }]);
    }
    g.add(vase(kit, 'sb', 0.09, 0.42, 'terracotta', -0.8, H, 0));
    g.add(kit.lathe('bowl3', [[0, 0], [0.13, 0.01], [0.17, 0.07], [0.16, 0.075], [0.1, 0.02], [0, 0.02]], 'ceramicMatte', 0.5, H, 0.02));
    books(kit, g, [0.95, H, 0], 3, 0.3, 0.22, mulberry32(77));
    kit.place(g, -11.875 + D / 2, 3.75, Math.PI / 2);
    kit.commit(g, { collider: { w: L, d: D, h: H } });
    for (const [label, meshes, parts, opts] of items) reg(label, meshes, parts, opts);
  }

  // art + plants
  {
    const a = artFrame(kit, M.get('art0'), 0.9, 1.2);
    kit.place(a, -6.35, 6.875 - 0.02, Math.PI, F + 1.55);
    kit.commit(a, { collider: null });
  }
  plant(kit, -11.3, 6.35, 1.5, 81, 'terracotta');
  plant(kit, -5.9, 0.0, 0.9, 82);

  // lights
  fx.downlight(groups.kitchen, -3.25, 4.6, H_PUB, { intensity: 20, angle: 0.95, shadow: true });
  fx.downlight(groups.kitchen, -2.3, 6.15, H_PUB, { intensity: 12, angle: 0.8 });
  fx.downlight(groups.kitchen, -1.2, 1.8, H_PUB, { intensity: 10, angle: 1.0 });
  for (const [x, z] of [[-4.6, 6.15], [-4.6, 1.8], [-2.6, 1.8], [-1.2, 4.6]]) fx.downlight(groups.kitchen, x, z, H_PUB, { light: false });
  for (const [x, z] of [[-10.6, 0.8], [-6.8, 0.8], [-10.6, 6.0], [-6.8, 6.0]]) fx.downlight(groups.dining, x, z, H_PUB, { light: false });
  fx.downlight(groups.dining, -10.9, 3.75, H_PUB, { intensity: 8, angle: 0.8 });
}

function diningChair(kit) {
  const g = kit.group();
  g.add(kit.rbox(0.46, 0.07, 0.46, 0.02, 'fabricCharcoal', 0, 0.46, 0.02));
  for (const [x, z] of [[-0.2, 0.2], [0.2, 0.2]]) { const l = kit.cyl(0.015, 0.012, 0.46, 'walnut', x, 0.23, z, 10); l.rotation.x = 0.06; g.add(l); }
  for (const x of [-0.2, 0.2]) { const l = kit.cyl(0.016, 0.012, 0.86, 'walnut', x, 0.43, -0.2, 10); l.rotation.x = -0.08; g.add(l); }
  const back = kit.rbox(0.44, 0.2, 0.025, 0.01, 'walnut', 0, 0.76, -0.225);
  back.rotation.x = -0.1;
  g.add(back);
  g.add(kit.box(0.4, 0.02, 0.02, 'walnut', 0, 0.12, 0.0));
  return g;
}
