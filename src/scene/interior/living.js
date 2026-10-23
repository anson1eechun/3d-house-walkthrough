import * as THREE from 'three';
import { FLOOR_Y, H_PUB } from '../layout.js';
import { ApplianceToggle } from '../../interaction/furniture.js';
import { LAYER } from '../../core/layers.js';
import { mulberry32 } from '../../core/rng.js';
import { plant, lounge, floorLamp, rug, books, vase, sideTable, proxy } from './common.js';

export function buildLiving(env) {
  const { ctx, kit, groups, fx } = env;
  const B = ctx.builder;
  const M = ctx.materials;
  const F = FLOOR_Y;

  // ---------------------------------------------------- sectional sofa ----
  {
    const g = kit.group();
    const len = 3.6, dep = 1.0, arm = 0.2, chaiseLen = 1.75, chaiseW = 1.0;
    const fab = 'fabricSofa';
    // plinth + frame
    g.add(kit.rbox(len - 0.1, 0.08, dep - 0.1, 0.02, 'rubber', 0, 0.04, 0));
    g.add(kit.rbox(len, 0.3, dep, 0.05, fab, 0, 0.23, 0));
    g.add(kit.rbox(len - chaiseW, 0.32, 0.2, 0.06, fab, chaiseW / 2, 0.52, -dep / 2 + 0.1));
    g.add(kit.rbox(arm, 0.56, dep, 0.07, fab, len / 2 - arm / 2, 0.36, 0));
    // seat cushions on the main run
    const runX0 = -len / 2 + chaiseW, runX1 = len / 2 - arm;
    const n = 2, cw = (runX1 - runX0) / n;
    for (let i = 0; i < n; i++) {
      const cx = runX0 + cw * (i + 0.5);
      g.add(kit.rbox(cw - 0.012, 0.17, dep - 0.22, 0.07, fab, cx, 0.465, 0.09));
      const back = kit.rbox(cw - 0.03, 0.46, 0.2, 0.09, fab, cx, 0.78, -dep / 2 + 0.24);
      back.rotation.x = -0.14;
      g.add(back);
    }
    // chaise (extends forward on the left end)
    const cz = -dep / 2 + chaiseLen / 2;
    g.add(kit.rbox(chaiseW, 0.08, chaiseLen - 0.1, 0.02, 'rubber', -len / 2 + chaiseW / 2, 0.04, cz));
    g.add(kit.rbox(chaiseW, 0.3, chaiseLen, 0.05, fab, -len / 2 + chaiseW / 2, 0.23, cz));
    g.add(kit.rbox(chaiseW - 0.04, 0.17, chaiseLen - 0.24, 0.07, fab, -len / 2 + chaiseW / 2 + 0.02, 0.465, cz + 0.09));
    g.add(kit.rbox(chaiseW, 0.32, 0.2, 0.06, fab, -len / 2 + chaiseW / 2, 0.52, -dep / 2 + 0.1));
    const cb = kit.rbox(chaiseW - 0.06, 0.46, 0.2, 0.09, fab, -len / 2 + chaiseW / 2, 0.78, -dep / 2 + 0.24);
    cb.rotation.x = -0.14; g.add(cb);
    g.add(kit.rbox(arm * 0.8, 0.5, chaiseLen * 0.55, 0.07, fab, -len / 2 + arm * 0.4, 0.33, -dep / 2 + chaiseLen * 0.275));
    // throw pillows + blanket
    const pil = (x, z, r, mat) => { const p = kit.rbox(0.46, 0.44, 0.15, 0.07, mat, x, 0.74, z); p.rotation.set(-0.25, r, 0.05); g.add(p); };
    pil(len / 2 - 0.45, -dep / 2 + 0.42, -0.25, 'fabricRust');
    pil(len / 2 - 0.85, -dep / 2 + 0.42, -0.1, 'fabricCharcoal');
    pil(-len / 2 + 0.5, -dep / 2 + 0.42, 0.2, 'fabricBlue');
    const throwB = kit.rbox(0.55, 0.035, 0.9, 0.015, 'fabricCharcoal', -len / 2 + 0.55, 0.565, cz + 0.35);
    throwB.rotation.y = 0.2; g.add(throwB);
    kit.place(g, -7.1, -3.6, -Math.PI / 2);
    kit.commit(g, { collider: { x: 0.0, z: 0, w: len - 0.04, d: dep - 0.04, h: 0.85 } });
    kit.colliderFor(g, { x: -len / 2 + chaiseW / 2, z: cz, w: chaiseW - 0.04, d: chaiseLen - 0.04, h: 0.6 });
  }

  // ----------------------------------------------------- coffee table ----
  {
    const g = kit.group();
    g.add(kit.rbox(1.25, 0.045, 0.72, 0.012, 'walnut', 0, 0.39, 0));
    g.add(kit.rbox(1.1, 0.025, 0.6, 0.008, 'walnut', 0, 0.12, 0));
    for (const [x, z] of [[-0.56, -0.29], [0.56, -0.29], [-0.56, 0.29], [0.56, 0.29]]) g.add(kit.cyl(0.014, 0.014, 0.37, 'blackMetal', x, 0.185, z, 12));
    // decor: tray, book stack, vase with stems, bowl
    g.add(kit.rbox(0.42, 0.02, 0.28, 0.006, 'oakLight', -0.25, 0.423, 0.05));
    books(kit, g, [0.2, 0.413, -0.12], 3, 0.3, 0.22);
    g.add(vase(kit, 'v1', 0.07, 0.24, 'ceramicMatte', -0.32, 0.433, 0.07));
    g.add(kit.lathe('bowl1', [[0, 0], [0.11, 0.01], [0.13, 0.05], [0.125, 0.06], [0.1, 0.02], [0, 0.015]], 'ceramic', 0.33, 0.4125, 0.14));
    kit.place(g, -9.15, -2.95, Math.PI / 2);
    kit.commit(g);
  }

  rug(kit, 'rugLiving', 3.8, 4.4, -9.0, -3.3, 0);

  // armchair facing the sofa / fireplace
  {
    const g = lounge(kit, 'leather', 'walnut');
    kit.place(g, -10.1, -1.25, 2.55);
    kit.commit(g, { shrink: 0.05 });
    const st = sideTable(kit);
    kit.place(st, -10.95, -1.0, 0);
    kit.commit(st);
  }

  // ------------------------------------------------ fireplace wall -------
  const bx0 = -11.875, bx1 = -11.5, bz0 = -5.0, bz1 = -2.4;
  const oz0 = -4.5, oz1 = -2.9, oy0 = F + 0.47, oy1 = F + 0.87;
  const stone = M.get('ledgestone');
  const face = (f) => (f === 'nx' || f === 'ny' ? null : stone);
  B.box([bx0, 0, bz0], [bx1, H_PUB, oz0], face, { zone: 'public', collider: true });
  B.box([bx0, 0, oz1], [bx1, H_PUB, bz1], face, { zone: 'public', collider: true });
  B.box([bx0, 0, oz0], [bx1, oy0, oz1], face, { zone: 'public', collider: true });
  B.box([bx0, oy1, oz0], [bx1, H_PUB, oz1], face, { zone: 'public' });
  // firebox interior
  const fb = kit.group(
    kit.box(0.02, oy1 - oy0, oz1 - oz0, 'blackMetal', -0.33, (oy0 + oy1) / 2, 0),
    kit.box(0.34, 0.02, oz1 - oz0, 'blackMetal', -0.17, oy0 + 0.01, 0),
    kit.box(0.34, 0.02, oz1 - oz0, 'blackMetal', -0.17, oy1 - 0.01, 0),
  );
  // glass-fibre embers / pebbles bed
  const rnd = mulberry32(55);
  for (let i = 0; i < 26; i++) {
    const s = kit.sphere(0.02 + rnd() * 0.025, i % 3 ? 'ceramicMatte' : 'plinth', -0.08 - rnd() * 0.2, oy0 + 0.03, (rnd() - 0.5) * (oz1 - oz0 - 0.1));
    s.scale.y = 0.55;
    fb.add(s);
  }
  kit.place(fb, bx1, (oz0 + oz1) / 2, 0, 0);
  kit.commit(fb, { collider: null, zone: 'public' });
  // floating hearth bench
  B.box([bx0, F + 0.22, -6.5], [-11.33, F + 0.3, -0.85], M.get('marbleDark'), { zone: 'public', collider: true });

  // flames: additive shader plane inside the firebox
  const flameMat = new THREE.ShaderMaterial({
    uniforms: { uTime: ctx.globals.uTime, uLevel: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */`
      uniform float uTime; uniform float uLevel; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
        return mix(mix(h(i),h(i+vec2(1,0)),u.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x),u.y); }
      void main(){
        vec2 uv = vUv;
        float t = uTime * 1.6;
        float f = n(vec2(uv.x * 9.0, uv.y * 3.0 - t * 2.2)) * 0.6 + n(vec2(uv.x * 23.0, uv.y * 6.0 - t * 3.7)) * 0.4;
        float tongues = 0.5 + 0.5 * sin(uv.x * 40.0 + n(vec2(uv.x * 5.0, t)) * 6.0);
        float height = (0.35 + 0.5 * uLevel) * (0.65 + 0.35 * tongues);
        float flame = smoothstep(height, height * 0.2, uv.y - f * 0.25) * smoothstep(0.0, 0.08, uv.y + 0.02);
        flame *= smoothstep(0.0, 0.06, uv.x) * smoothstep(1.0, 0.94, uv.x);
        vec3 col = mix(vec3(1.0, 0.25, 0.04), vec3(1.0, 0.75, 0.35), smoothstep(0.1, 0.0, uv.y - f * 0.1));
        col = mix(col, vec3(0.25, 0.45, 1.0), smoothstep(0.08, 0.0, uv.y) * 0.6);
        float a = flame * (0.5 + 0.5 * uLevel);
        gl_FragColor = vec4(col * a * 9.0, a);
      }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const flames = new THREE.Mesh(new THREE.PlaneGeometry(oz1 - oz0 - 0.08, oy1 - oy0 - 0.04), flameMat);
  flames.position.set(bx1 - 0.16, (oy0 + oy1) / 2, (oz0 + oz1) / 2);
  flames.rotation.y = Math.PI / 2;
  flames.visible = false;
  flames.layers.set(LAYER.MAIN_ONLY);
  flames.renderOrder = 5;
  ctx.scene.add(flames);
  const fireLight = fx.point(groups.fire, bx1 + 0.25, oy0 + 0.25, (oz0 + oz1) / 2, { intensity: 4.5, color: 0xff8a3a });
  let level = 1;
  ctx.updaters.push((dt, t) => {
    if (!flames.visible) return;
    const flick = 0.82 + 0.1 * Math.sin(t * 13.1) + 0.06 * Math.sin(t * 27.7 + 1.3) + 0.05 * Math.sin(t * 7.3);
    fireLight.intensity = groups.fire.lights[0].base * groups.fire.current * flick;
  });
  const fireProxy = proxy(kit, 0.06, oy1 - oy0, oz1 - oz0, bx1 + 0.01, (oy0 + oy1) / 2, (oz0 + oz1) / 2);
  const fire = new ApplianceToggle(ctx, {
    id: 'fireplace', label: '壁爐', meshes: [fireProxy],
    onSet: (on) => { flames.visible = on; ctx.lighting.set(groups.fire, on); flameMat.uniforms.uLevel.value = on ? level : 0; },
    secondaryLabel: () => `調整火焰（${['小', '中', '大'][Math.round(level * 2)]}）`,
    onSecondary: () => {
      level = level >= 1 ? 0 : level + 0.5;
      flameMat.uniforms.uLevel.value = level;
      groups.fire.lights[0].base = 2.5 + level * 3;
    },
  });
  fire.zone = 'public';
  ctx.interaction.add(fire);

  // -------------------------------------------------------------- TV ----
  {
    const tvW = 1.64, tvH = 0.94, tx = bx1 + 0.035, ty = F + 1.78, tz = (bz0 + bz1) / 2;
    const g = kit.group(
      kit.rbox(0.03, tvH, tvW, 0.005, 'blackMetal', 0, 0, 0),
    );
    const screen = kit.box(0.004, tvH - 0.02, tvW - 0.02, 'blackGlass', 0.017, 0, 0);
    g.add(screen);
    kit.place(g, tx, tz, 0, ty);
    kit.commit(g, { collider: null, zone: 'public' });
    const scrMat = new THREE.ShaderMaterial({
      uniforms: { uTime: ctx.globals.uTime, uOn: { value: 0 }, uChannel: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */`
        uniform float uTime; uniform float uOn; uniform float uChannel; varying vec2 vUv;
        vec3 pal(float t, vec3 a, vec3 b, vec3 c, vec3 d){ return a + b * cos(6.28318 * (c * t + d)); }
        void main(){
          vec2 p = vUv * 2.0 - 1.0;
          float t = uTime * 0.12 + uChannel * 3.7;
          float v = sin(p.x * 2.1 + t * 2.0) + sin(p.y * 3.3 - t * 1.4) + sin((p.x + p.y) * 1.7 + t);
          vec3 col = uChannel < 0.5 ? pal(v * 0.15 + t * 0.2, vec3(0.45), vec3(0.4), vec3(1.0), vec3(0.0, 0.15, 0.25))
                   : uChannel < 1.5 ? pal(v * 0.1 + t * 0.1, vec3(0.5, 0.45, 0.4), vec3(0.4, 0.3, 0.2), vec3(1.0, 0.8, 0.6), vec3(0.6, 0.4, 0.2))
                   : vec3(0.1, 0.12, 0.15) + vec3(0.6, 0.65, 0.7) * smoothstep(0.02, 0.0, abs(fract(p.y * 3.0 + t) - 0.5) - 0.3);
          gl_FragColor = vec4(col * 1.4 * uOn, 1.0);
        }`,
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(tvW - 0.03, tvH - 0.03), scrMat);
    glow.position.set(tx + 0.0195, ty, tz);
    glow.rotation.y = Math.PI / 2;
    glow.visible = false;
    glow.layers.set(LAYER.MAIN_ONLY);
    ctx.scene.add(glow);
    const tvLight = fx.point(groups.tv, tx + 0.6, ty - 0.1, tz, { intensity: 1.2, color: 0xaac4ff });
    let channel = 0;
    const tvProxy = proxy(kit, 0.05, tvH, tvW, tx + 0.02, ty, tz);
    const tv = new ApplianceToggle(ctx, {
      id: 'tv', label: '電視', meshes: [tvProxy],
      onSet: (on) => { glow.visible = on; scrMat.uniforms.uOn.value = on ? 1 : 0; ctx.lighting.set(groups.tv, on); },
      secondaryLabel: () => `切換頻道（${channel + 1}/3）`,
      onSecondary: () => { channel = (channel + 1) % 3; scrMat.uniforms.uChannel.value = channel; tvLight.color.set([0xaac4ff, 0xffd2a0, 0xdfe6ee][channel]); },
    });
    tv.zone = 'public';
    ctx.interaction.add(tv);
  }

  // ------------------------------------------- reading corner & shelf ----
  {
    const g = lounge(kit, 'fabricOlive', 'oakLight');
    kit.place(g, -1.55, -5.55, -2.45);
    kit.commit(g, { shrink: 0.05 });
    const st = sideTable(kit);
    kit.place(st, -0.85, -6.3, 0);
    kit.commit(st);
    const lamp = floorLamp(kit, ctx.lighting.emissive(groups.livingLamp, { color: 0xffd6a0, intensity: 5, base: 0xefe6d8 }));
    kit.place(lamp.group, -2.45, -6.35, 0);
    const lampProxy = proxy(kit, 0.5, 1.75, 0.5, -2.45, F + 0.9, -6.35);
    kit.commit(lamp.group, { collider: { w: 0.4, d: 0.4, h: 1.7 } });
    fx.point(groups.livingLamp, -2.45, F + 1.42, -6.35, { intensity: 3.2, color: 0xffcf96 });
    ctx.lighting.addLamp(groups.livingLamp, [lampProxy], '立燈');
  }
  // floor lamp next to the sofa (same group)
  {
    const lamp = floorLamp(kit, ctx.lighting.emissive(groups.livingLamp, { color: 0xffd6a0, intensity: 5, base: 0xefe6d8 }));
    kit.place(lamp.group, -7.05, -1.25, 0);
    kit.commit(lamp.group, { collider: { w: 0.4, d: 0.4, h: 1.7 } });
    fx.point(groups.livingLamp, -7.05, F + 1.42, -1.25, { intensity: 3.2, color: 0xffcf96 });
    const p2 = proxy(kit, 0.5, 1.75, 0.5, -7.05, F + 0.9, -1.25);
    ctx.lighting.addLamp(groups.livingLamp, [p2], '立燈');
  }
  bookshelf(kit, -0.125, -5.0);

  plant(kit, -11.15, -6.25, 1.3, 77);
  plant(kit, -0.75, -2.7, 1.0, 78);
  plant(kit, -6.9, -6.4, 0.75, 79);

  // ---------------------------------------------------------- lighting ----
  fx.downlight(groups.living, -8.9, -3.4, H_PUB, { intensity: 22, angle: 1.0, shadow: true });
  fx.downlight(groups.living, -3.6, -3.9, H_PUB, { intensity: 18, angle: 1.0 });
  for (const [x, z] of [[-10.6, -5.9], [-10.6, -1.3], [-6.2, -5.9], [-6.2, -1.3], [-1.4, -5.9], [-1.4, -1.6]]) fx.downlight(groups.living, x, z, H_PUB, { light: false });
}

// Tall walnut shelving unit with books and objects, against a wall facing -x.
function bookshelf(kit, wallX, cz) {
  const g = kit.group();
  const W = 3.2, H = 2.4, D = 0.36, T = 0.025;
  g.add(kit.box(W, T, D, 'walnut', 0, T / 2, 0));
  g.add(kit.box(W, T, D, 'walnut', 0, H - T / 2, 0));
  for (const x of [-W / 2 + T / 2, -W / 6, W / 6, W / 2 - T / 2]) g.add(kit.box(T, H, D, 'walnut', x, H / 2, 0));
  g.add(kit.box(W, H, 0.01, 'walnut', 0, H / 2, -D / 2 + 0.005));
  const shelves = [0.42, 0.82, 1.22, 1.62, 2.0];
  for (const y of shelves) g.add(kit.box(W, T, D - 0.01, 'walnut', 0, y, 0.005));
  const rnd = mulberry32(91);
  const bays = [[-W / 2 + T, -W / 6 - T / 2], [-W / 6 + T / 2, W / 6 - T / 2], [W / 6 + T / 2, W / 2 - T]];
  const levels = [T, ...shelves.map(y => y + T / 2)];
  for (let li = 0; li < levels.length; li++) {
    for (let bi = 0; bi < 3; bi++) {
      const [x0, x1] = bays[bi];
      const r = rnd();
      if (r < 0.62) books(kit, g, [(x0 + x1) / 2 - 0.1 * (rnd() - 0.5), levels[li], 0.02], 8 + Math.floor(rnd() * 10), (x1 - x0) * (0.5 + rnd() * 0.4), 0.26, rnd, true);
      if (r > 0.45) g.add(vase(kit, 'sv' + (li * 3 + bi) % 4, 0.05 + rnd() * 0.04, 0.12 + rnd() * 0.16, rnd() < 0.5 ? 'ceramic' : 'ceramicMatte', x1 - 0.18, levels[li], 0.02));
    }
  }
  kit.place(g, wallX - D / 2, cz, -Math.PI / 2);
  kit.commit(g);
}
