// Interior reflection / irradiance probes ("reflection captures").
// One cube capture per room zone, prefiltered with PMREM and assigned as the
// envMap of that zone's material clones. Because captures see the lit room
// (lamps, sun patches, bright windows) and the previous probe state, repeated
// captures accumulate bounce light: a cheap, state-aware stand-in for global
// illumination. Recaptures are queued when lights, doors, time of day or
// weather change and are spread over frames (one zone per frame).

import * as THREE from 'three';
import { ZONES } from '../scene/layout.js';
import { LAYER } from '../core/layers.js';

export class ProbeSystem {
  constructor(ctx) {
    this.ctx = ctx;
    this.size = 0;
    this.zones = {};
    this.queue = new Map();   // zone -> delay seconds
    this.captures = 0;
    this.setQuality({ probeSize: 128 });
  }

  setQuality(Q) {
    if (Q.probeSize === this.size) return;
    const r = this.ctx.renderer;
    this.size = Q.probeSize;
    this.pmrem?.dispose();
    this.pmrem = new THREE.PMREMGenerator(r);
    for (const [id, z] of Object.entries(ZONES)) {
      const old = this.zones[id];
      old?.cube.dispose(); old?.env?.dispose();
      const cube = new THREE.WebGLCubeRenderTarget(this.size, { type: THREE.HalfFloatType, generateMipmaps: false });
      const cam = new THREE.CubeCamera(0.05, 150, cube);
      cam.position.set(...z.probe);
      for (const c of cam.children) { c.layers.set(LAYER.DEFAULT); c.layers.enable(LAYER.GROUND); }
      this.zones[id] = { id, cube, cam, env: null };
    }
    // First pass right away so every zone material has a valid env map of the right size.
    for (const id of Object.keys(this.zones)) this.capture(id);
  }

  requestZone(zone, delay = 0) {
    if (!zone || !this.zones[zone]) return;
    // public zone is open-plan with the hallway: refresh neighbours too
    const cur = this.queue.get(zone);
    this.queue.set(zone, cur === undefined ? delay : Math.min(cur, delay));
    // a second capture lets bounce light settle
    this._second = this._second || new Set();
    this._second.add(zone);
  }

  requestAll(delay = 0) { for (const id of Object.keys(this.zones)) this.requestZone(id, delay); }

  captureAll(passes = 1) {
    for (let i = 0; i < passes; i++) for (const id of Object.keys(this.zones)) this.capture(id);
  }

  update(dt) {
    let picked = null;
    for (const [zone, d] of this.queue) {
      const nd = d - dt;
      this.queue.set(zone, nd);
      if (nd <= 0 && !picked) picked = zone;
    }
    if (picked) {
      this.queue.delete(picked);
      this.capture(picked);
      if (this._second?.has(picked)) { this._second.delete(picked); this.queue.set(picked, 0.15); }
    }
  }

  capture(id) {
    const z = this.zones[id];
    const { renderer, scene, env } = this.ctx;
    const prevShadow = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    if (env) env.skyUniforms.uEnvCapture.value = 1;
    // Damp the probe feedback (probe -> lit room -> probe) so its gain stays < 1:
    // steady state = direct / (1 - c * albedo), shown at the normal zone intensity.
    const mats = this.ctx.materials;
    mats.setZoneEnvIntensity(0.55);
    z.cam.update(renderer, scene);
    mats.setZoneEnvIntensity(mats.zoneEnvIntensity);
    if (env) env.skyUniforms.uEnvCapture.value = 0;
    renderer.shadowMap.autoUpdate = prevShadow;
    const first = !z.env;
    z.env = this.pmrem.fromCubemap(z.cube.texture, z.env);
    if (first) this.ctx.materials.setZoneEnv(id, z.env.texture);
    this.captures++;
  }
}
