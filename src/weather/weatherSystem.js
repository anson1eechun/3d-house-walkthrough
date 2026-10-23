// Weather state machine. Owns the slowly-evolving quantities and pushes them to
// shared shader uniforms: rain intensity, ground wetness (soaks fast, dries
// slowly), drops on glass and condensation mist. Switching weather only moves
// these targets - nothing is rebuilt or reallocated.

import * as THREE from 'three';
import { zoneAt } from '../scene/layout.js';

export class WeatherSystem {
  constructor(ctx, { rain, wet, env }) {
    this.ctx = ctx; this.rain = rain; this.wet = wet; this.env = env;
    this.raining = false;
    this.density = 0.75;
    this.amount = 0;      // rain falling 0..1
    this.wetness = 0;     // surfaces 0..1
    this.glass = 0;       // drops on windows 0..1
    this._color = new THREE.Color();
  }

  setTarget(raining) { this.raining = raining; }
  setDensity(d) { this.density = d; }

  get reflectionNeeded() { return this.wetness > 0.03; }

  update(dt) {
    const approach = (v, target, upRate, downRate) => {
      const r = target > v ? upRate : downRate;
      return v + (target - v) * (1 - Math.exp(-dt * r));
    };
    const target = this.raining ? 1 : 0;
    this.amount = approach(this.amount, target, 0.5, 0.7);
    this.wetness = approach(this.wetness, this.raining ? 1 : 0, 0.16, 0.05);
    this.glass = approach(this.glass, this.raining ? 1 : 0, 0.22, 0.06);
    if (this.amount < 0.002 && !this.raining) this.amount = 0;
    if (this.wetness < 0.002 && !this.raining) this.wetness = 0;
    if (this.glass < 0.002 && !this.raining) this.glass = 0;

    const g = this.ctx.globals;
    const intensity = this.amount * this.density;
    g.uRain.value = intensity;
    g.uWetness.value = this.wetness;
    g.uGlassRain.value = this.glass * (0.55 + 0.45 * this.density);
    g.uGlassMist.value = this.glass * 0.7;
    this.rain.setIntensity(intensity);

    // Streak colour follows the sky brightness (rain is mostly seen by refracted skylight).
    const p = this.env.p;
    this._color.copy(p.horizon).multiplyScalar(1.5).lerp(p.cloudLit, 0.3);
    this._color.r += 0.002; this._color.g += 0.002; this._color.b += 0.003;
    this.rain.update(this._color);

    // Rain audio: louder outside, muffled indoors.
    const cam = this.ctx.camera.position;
    const indoor = zoneAt(cam.x, cam.y, cam.z) !== 'ext';
    this.ctx.audio?.setRain(intensity, indoor);
  }
}
