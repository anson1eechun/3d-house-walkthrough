import * as THREE from 'three';
import { FLOOR_Y, H_PRI } from '../layout.js';
import { ToggleFurniture, ApplianceToggle, slidePart } from '../../interaction/furniture.js';
import { LAYER } from '../../core/layers.js';
import { makeDrawer } from './kitchen.js';
import { plant, proxy } from './common.js';

const F = FLOOR_Y;

export function buildBathroom(env) {
  const { ctx, kit, groups, fx } = env;
  const B = ctx.builder;

  // ------------------------------------------------- floating vanity ----
  {
    const g = kit.group();       // local x along the wall (world -z), +z front = world +x (rotY = PI/2)
    const L = 1.8, D = 0.52, y0 = 0.4, h = 0.45;
    g.add(kit.box(L, h, D - 0.02, 'walnut', 0, y0 + h / 2, -0.01));
    g.add(kit.box(L + 0.02, 0.03, D + 0.02, 'marble', 0, y0 + h + 0.015, 0));
    const items = [];
    for (const s of [-1, 1]) {
      const dr = makeDrawer(kit, { w: L / 2, h: h - 0.004, d: D - 0.06, x: s * L / 4, y: y0 + h / 2, z: D / 2 + 0.0095, front: 'walnut', handle: 'brass' });
      g.add(dr.obj);
      items.push([[dr.front], [slidePart(dr.obj, 0, 0, dr.travel)], [{ object: dr.obj, w: L / 2, d: 0.05, h, y0: F + y0, local: [0, 0] }]]);
      // vessel basin + wall spout
      const bx = s * L / 4;
      g.add(kit.lathe('basin', [[0, 0], [0.12, 0], [0.19, 0.05], [0.21, 0.13], [0.2, 0.135], [0.18, 0.06], [0.1, 0.02], [0, 0.02]], 'ceramic', bx, y0 + h + 0.03, 0.02, 40));
      const spout = kit.cyl(0.012, 0.012, 0.2, 'chrome', bx, y0 + h + 0.32, -D / 2 + 0.1, 12);
      spout.rotation.x = Math.PI / 2;
      g.add(spout);
      g.add(kit.cyl(0.03, 0.03, 0.01, 'chrome', bx, y0 + h + 0.32, -D / 2 + 0.005, 16).rotateX(Math.PI / 2));
    }
    // mirror with LED halo
    const halo = ctx.lighting.emissive(groups.bath, { color: 0xfff2e0, intensity: 6, base: 0xf0f0f0 });
    g.add(kit.box(1.74, 0.94, 0.008, halo, 0, F + 0.9 + 0.47 - F, -D / 2 + 0.004));
    g.add(kit.box(1.7, 0.9, 0.012, 'mirror', 0, 0.9 + 0.47 + 0.0, -D / 2 + 0.018));
    g.add(kit.rbox(0.18, 0.02, 0.12, 0.005, 'marbleDark', -0.65, y0 + h + 0.04, -0.12));
    g.add(kit.cyl(0.03, 0.03, 0.14, 'ceramicMatte', -0.62, y0 + h + 0.12, -0.12, 14));
    kit.place(g, 0.125 + D / 2, -2.8, Math.PI / 2);
    kit.commit(g, { collider: { w: L, d: D, h: y0 + h + 0.05 } });
    for (const [meshes, parts, colliders] of items) {
      const it = new ToggleFurniture(ctx, { id: 'vanity-' + meshes[0].uuid.slice(0, 6), label: '浴櫃抽屜', meshes, parts, colliders });
      it.zone = 'bath';
      ctx.interaction.add(it);
    }
  }

  // ----------------------------------------------------- wall-hung WC ----
  {
    const g = kit.group();     // facing -x (rotY = -PI/2), back against the east wall
    g.add(kit.box(0.5, 1.1, 0.16, 'bathWallTile', 0, 0.55, -0.08 + 0.0));
    g.add(kit.rbox(0.22, 0.15, 0.01, 0.004, 'chrome', 0, 1.0, 0.002));
    const bowl = kit.lathe('wcbowl', [[0, 0], [0.16, 0], [0.19, 0.12], [0.2, 0.26], [0.19, 0.28], [0.15, 0.27], [0.1, 0.12], [0, 0.1]], 'ceramic', 0, 0.16, 0.27, 36);
    bowl.scale.set(0.9, 1, 1.4);
    g.add(bowl);
    g.add(kit.rbox(0.36, 0.18, 0.12, 0.04, 'ceramic', 0, 0.33, 0.06));
    const seat = kit.torus(0.155, 0.022, 'ceramic', 0, 0.455, 0.29);
    seat.rotation.x = Math.PI / 2; seat.scale.set(1, 1.35, 1);
    g.add(seat);
    const lid = kit.cyl(0.18, 0.18, 0.018, 'ceramic', 0, 0.47, 0.29, 32);
    lid.scale.set(1, 1, 1.35);
    g.add(lid);
    kit.place(g, 3.44 - 0.16, -2.4, -Math.PI / 2);
    kit.commit(g, { collider: { w: 0.42, d: 0.6, h: 0.5, z: 0.25 } });
  }

  // ------------------------------------------------- freestanding tub ----
  {
    const g = kit.group();
    const tub = kit.lathe('tub', [[0, 0], [0.26, 0], [0.34, 0.06], [0.39, 0.5], [0.4, 0.56], [0.385, 0.58], [0.36, 0.565], [0.34, 0.16], [0.27, 0.08], [0, 0.07]], 'ceramic', 0, 0, 0, 56);
    tub.scale.set(2.1, 1, 1);
    g.add(tub);
    // floor-mounted filler
    g.add(kit.cyl(0.02, 0.02, 0.85, 'chrome', 0.98, 0.425, 0, 14));
    const arm = kit.tube('tubspout', [[0.98, 0.85, 0], [0.98, 0.95, 0], [0.9, 0.98, 0], [0.82, 0.92, 0]], 0.014, 'chrome', 20);
    g.add(arm);
    g.add(kit.cyl(0.06, 0.06, 0.01, 'chrome', 0.98, 0.005, 0, 18));
    kit.place(g, 1.7, -4.45, 0);
    kit.commit(g, { collider: { w: 1.75, d: 0.82, h: 0.58 } });
    // bath water surface (toggle fills the tub)
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.34, 40), ctx.glass.shower);
    water.scale.set(2.05, 1, 1);
    water.rotation.x = -Math.PI / 2;
    water.position.set(1.7, F + 0.42, -4.45);
    water.visible = false;
    water.layers.set(LAYER.MAIN_ONLY);
    ctx.scene.add(water);
    const p = proxy(kit, 1.7, 0.6, 0.8, 1.7, F + 0.3, -4.45);
    const fill = new ApplianceToggle(ctx, { id: 'bathtub', label: '浴缸放水', meshes: [p], verbs: ['', '排空'], reach: 2.2, onSet: (on) => { water.visible = on; } });
    fill.prompt = function () { return this.on ? '排空浴缸' : '浴缸放水'; };
    fill.zone = 'bath';
    ctx.interaction.add(fill);
  }

  // ------------------------------------------------------ walk-in shower --
  {
    const gx0 = 0.125, gx1 = 2.0, gz = -5.3, gh = 2.1;
    const glass = new THREE.Mesh(new THREE.BoxGeometry(gx1 - gx0, gh, 0.01), ctx.glass.shower);
    glass.position.set((gx0 + gx1) / 2, F + 0.02 + gh / 2, gz);
    glass.layers.set(LAYER.MAIN_ONLY);
    glass.userData.noShadow = true;
    glass.castShadow = false;
    ctx.scene.add(glass);
    const frame = kit.group(
      kit.box(gx1 - gx0, 0.02, 0.025, 'blackMetal', 0, gh + 0.03, 0),
      kit.box(gx1 - gx0, 0.015, 0.025, 'blackMetal', 0, 0.015, 0),
      kit.box(0.02, 0.02, 1.6, 'blackMetal', (gx1 - gx0) / 2 - 0.1, gh + 0.03, -0.8),
    );
    kit.place(frame, (gx0 + gx1) / 2, gz, 0);
    kit.commit(frame, { collider: null });
    ctx.collision.addBox({ minX: gx0, maxX: gx1, minZ: gz - 0.03, maxZ: gz + 0.03, minY: F, maxY: F + gh, tag: 'shower' });
    // rain head, arm, mixer, drain, niche shelf
    const sh = kit.group(
      kit.box(0.3, 0.012, 0.3, 'chrome', 0, 0, 0),
      kit.cyl(0.01, 0.01, H_PRI - F - 2.25, 'chrome', 0, (H_PRI - F - 2.25) / 2, 0, 10),
    );
    kit.place(sh, 1.0, -6.1, 0, F + 2.25);
    kit.commit(sh, { collider: null });
    const mix = kit.group(
      kit.rbox(0.012, 0.32, 0.12, 0.004, 'chrome', 0, 0, 0),
      kit.cyl(0.02, 0.02, 0.05, 'chrome', 0.03, 0.06, 0, 14).rotateZ(Math.PI / 2),
    );
    kit.place(mix, 0.125 + 0.006, -6.0, 0, F + 1.1);
    kit.commit(mix, { collider: null });
    B.box([0.3, F, -6.83], [3.3, F + 0.004, -6.78], ctx.materials.get('steel'), { zone: 'bath' });
    const shelf = kit.group(kit.box(0.5, 0.025, 0.14, 'marble', 0, 0, 0));
    for (let i = 0; i < 3; i++) shelf.add(kit.cyl(0.028, 0.028, 0.16 + i * 0.03, ['ceramic', 'ceramicMatte', 'terracotta'][i], -0.15 + i * 0.15, 0.09 + i * 0.015, 0, 14));
    kit.place(shelf, 2.4, -6.875 + 0.07, 0, F + 1.25);
    kit.commit(shelf, { collider: null });

    // shower water: falling streaks under the head (toggle)
    const showerMat = new THREE.ShaderMaterial({
      uniforms: { uTime: ctx.globals.uTime },
      vertexShader: 'varying vec2 vUv; varying vec3 vP; void main(){ vUv = uv; vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform float uTime; varying vec2 vUv; varying vec3 vP;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
        void main(){ vec2 g = vec2(vUv.x * 60.0, vUv.y * 2.0 + uTime * 5.0);
          float col = step(0.55, h(vec2(floor(g.x), 1.0)));
          float seg = step(0.35, fract(g.y + h(vec2(floor(g.x), 2.0)) * 7.0));
          float a = col * seg * 0.35 * smoothstep(0.0, 0.1, vUv.y);
          if (a < 0.01) discard;
          gl_FragColor = vec4(vec3(0.8, 0.86, 0.92), a); }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    });
    const curtain = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 2.2, 24, 1, true), showerMat);
    curtain.position.set(1.0, F + 1.12, -6.1);
    curtain.visible = false;
    curtain.layers.set(LAYER.MAIN_ONLY);
    ctx.scene.add(curtain);
    const mp = proxy(kit, 0.1, 0.4, 0.2, 0.18, F + 1.1, -6.0);
    const shower = new ApplianceToggle(ctx, { id: 'shower', label: '淋浴', meshes: [mp], reach: 2.0, onSet: (on) => { curtain.visible = on; } });
    shower.zone = 'bath';
    ctx.interaction.add(shower);
  }

  // heated towel rail with towels
  {
    const g = kit.group();
    for (const x of [-0.25, 0.25]) g.add(kit.cyl(0.012, 0.012, 0.9, 'chrome', x, 0.45, 0, 10));
    for (let i = 0; i < 6; i++) g.add(kit.cyl(0.009, 0.009, 0.5, 'chrome', 0, 0.08 + i * 0.15, 0, 8).rotateZ(Math.PI / 2));
    g.add(kit.rbox(0.42, 0.55, 0.035, 0.015, 'linen', 0, 0.58, 0.03));
    g.add(kit.rbox(0.36, 0.4, 0.03, 0.012, 'fabricOlive', 0, 0.42, 0.06));
    kit.place(g, 3.44 - 0.06, -3.7, -Math.PI / 2, F + 0.5);
    kit.commit(g, { collider: null });
  }
  // teak stool next to the tub
  {
    const g = kit.group(kit.rbox(0.35, 0.03, 0.35, 0.01, 'deck', 0, 0.45, 0));
    for (const [x, z] of [[-0.14, -0.14], [0.14, -0.14], [-0.14, 0.14], [0.14, 0.14]]) g.add(kit.box(0.04, 0.44, 0.04, 'deck', x, 0.22, z));
    g.add(kit.rbox(0.3, 0.06, 0.25, 0.02, 'linen', 0, 0.495, 0));
    kit.place(g, 2.95, -3.75, 0.3);
    kit.commit(g);
  }
  plant(kit, 0.5, -1.05, 0.7, 93);

  // lights
  fx.point(groups.bath, 1.75, H_PRI - 0.25, -3.4, { intensity: 7, color: 0xfff0e0 });
  fx.downlight(groups.bath, 1.0, -6.1, H_PRI, { intensity: 7, angle: 0.8 });
  for (const [x, z] of [[1.75, -2.0], [1.75, -4.6]]) fx.downlight(groups.bath, x, z, H_PRI, { light: false });
}
