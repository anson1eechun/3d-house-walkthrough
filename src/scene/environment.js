// Time of day + weather. Presets are blended continuously (no scene rebuild):
// sky shader uniforms, the sun/moon directional light and its shadow frustum,
// fog, and the sky image-based lighting (PMREM) used by exterior materials.

import * as THREE from 'three';
import { skyVertex, skyFragment } from '../rendering/shaders/sky.glsl.js';

const C = (r, g, b) => new THREE.Color(r, g, b);
const V = (x, y, z) => new THREE.Vector3(x, y, z).normalize();

// Linear HDR values tuned together with the auto exposure in postprocessing.js.
const TIMES = {
  day: {
    sunDir: V(-0.42, 0.74, -0.52), sunColor: C(1.0, 0.94, 0.86), sun: 3.4, disc: 60, glow: 0.6,
    zenith: C(0.11, 0.24, 0.6), horizon: C(0.55, 0.65, 0.78), ground: C(0.12, 0.13, 0.1),
    cloudLit: C(1.4, 1.38, 1.34), cloudShade: C(0.55, 0.6, 0.68), cloud: 0.32, stars: 0,
    env: 1.0, fog: 0.0028, fogColor: C(0.56, 0.64, 0.76), exterior: 0, shadowExtent: 24,
  },
  dusk: {
    sunDir: V(-0.93, 0.13, -0.34), sunColor: C(1.0, 0.52, 0.26), sun: 2.3, disc: 40, glow: 1.6,
    zenith: C(0.06, 0.09, 0.22), horizon: C(0.82, 0.46, 0.3), ground: C(0.06, 0.05, 0.05),
    cloudLit: C(1.4, 0.72, 0.45), cloudShade: C(0.22, 0.2, 0.28), cloud: 0.36, stars: 0.05,
    env: 0.75, fog: 0.004, fogColor: C(0.52, 0.36, 0.3), exterior: 1, shadowExtent: 30,
  },
  night: {
    sunDir: V(0.38, 0.6, -0.7), sunColor: C(0.5, 0.6, 0.85), sun: 0.12, disc: 6, glow: 0.12,
    zenith: C(0.004, 0.007, 0.018), horizon: C(0.016, 0.02, 0.034), ground: C(0.004, 0.004, 0.005),
    cloudLit: C(0.03, 0.035, 0.05), cloudShade: C(0.008, 0.009, 0.014), cloud: 0.25, stars: 1,
    env: 1.0, fog: 0.004, fogColor: C(0.012, 0.015, 0.025), exterior: 1, shadowExtent: 24,
  },
};

// Overcast multipliers applied on top of the time preset by the rain blend.
const RAIN = {
  day: { sky: C(0.26, 0.28, 0.31), horizon: C(0.34, 0.36, 0.38), sunScale: 0.08, fog: 0.016, cloudLit: C(0.38, 0.4, 0.43), cloudShade: C(0.17, 0.18, 0.2) },
  dusk: { sky: C(0.08, 0.075, 0.085), horizon: C(0.17, 0.12, 0.11), sunScale: 0.08, fog: 0.018, cloudLit: C(0.18, 0.13, 0.12), cloudShade: C(0.05, 0.05, 0.06) },
  night: { sky: C(0.006, 0.007, 0.01), horizon: C(0.012, 0.013, 0.017), sunScale: 0.2, fog: 0.016, cloudLit: C(0.014, 0.015, 0.02), cloudShade: C(0.006, 0.006, 0.008) },
};

export const TIME_LABEL = { day: '白天', dusk: '黃昏', night: '夜晚' };
export const WEATHER_LABEL = { clear: '晴天', rain: '雨天' };

export class EnvironmentSystem {
  constructor(ctx) {
    this.ctx = ctx;
    const { scene, renderer } = ctx;
    this.time = 'day';
    this.weather = 'clear';
    this.w = { day: 1, dusk: 0, night: 0 };   // current blend weights
    this.rain = 0;                             // current overcast/rain blend 0..1
    this.p = this._compose();                  // current parameters
    this.changing = true;
    this._envTimer = 0;

    // Sky dome
    this.skyUniforms = {
      uSunDir: { value: new THREE.Vector3() }, uSunColor: { value: new THREE.Color() },
      uSunDisc: { value: 1 }, uSunGlow: { value: 1 },
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
      uCloudCover: { value: 0 }, uCloudLit: { value: new THREE.Color() }, uCloudShade: { value: new THREE.Color() },
      uStars: { value: 0 }, uTime: ctx.globals.uTime, uEnvCapture: { value: 0 },
    };
    const skyMat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms, vertexShader: skyVertex, fragmentShader: skyFragment,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), skyMat);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = 1000;      // after opaque geometry so early-z skips covered pixels
    this.sky.name = 'sky';
    this.sky.userData.isSky = true;
    scene.add(this.sky);

    // Sun / moon
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    this.sun.shadow.bias = -0.0002;
    this.sun.shadow.normalBias = 0.025;
    this.sun.shadow.radius = 3;
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 140;
    this.sun.shadow.autoUpdate = false;
    this.sunTarget = new THREE.Object3D();
    this.sunTarget.position.set(0.5, 0, -1.5);
    scene.add(this.sunTarget);
    this.sun.target = this.sunTarget;
    scene.add(this.sun);

    scene.fog = new THREE.FogExp2(0x8899aa, 0.003);

    // Sky IBL: render the sky alone into a cube map, prefilter with PMREM.
    this.skyScene = new THREE.Scene();
    this.skyScene.add(new THREE.Mesh(this.sky.geometry, skyMat));
    this.cubeRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType, generateMipmaps: false });
    this.cubeCam = new THREE.CubeCamera(1, 1000, this.cubeRT);
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.envRT = null;

    this._apply();
    this.regenerateEnv();
  }

  setTime(t) { if (TIMES[t]) { this.time = t; this.changing = true; } }
  setWeather(w) { this.weather = w; this.changing = true; }
  cycleTime() { const order = ['day', 'dusk', 'night']; this.setTime(order[(order.indexOf(this.time) + 1) % 3]); return this.time; }

  // Rain intensity is owned by the weather system; it drives the overcast blend.
  get targetRain() { return this.weather === 'rain' ? 1 : 0; }

  _compose() {
    const w = this.w, r = this.rain;
    const out = {
      sunDir: new THREE.Vector3(), sunColor: new THREE.Color(0, 0, 0), sun: 0, disc: 0, glow: 0,
      zenith: new THREE.Color(0, 0, 0), horizon: new THREE.Color(0, 0, 0), ground: new THREE.Color(0, 0, 0),
      cloudLit: new THREE.Color(0, 0, 0), cloudShade: new THREE.Color(0, 0, 0), cloud: 0, stars: 0,
      env: 0, fog: 0, fogColor: new THREE.Color(0, 0, 0), exterior: 0, shadowExtent: 0,
    };
    for (const k of ['day', 'dusk', 'night']) {
      const s = TIMES[k], a = w[k];
      if (a <= 0) continue;
      out.sunDir.addScaledVector(s.sunDir, a);
      for (const c of ['sunColor', 'zenith', 'horizon', 'ground', 'cloudLit', 'cloudShade', 'fogColor']) {
        out[c].r += s[c].r * a; out[c].g += s[c].g * a; out[c].b += s[c].b * a;
      }
      for (const n of ['sun', 'disc', 'glow', 'cloud', 'stars', 'env', 'fog', 'exterior', 'shadowExtent']) out[n] += s[n] * a;
    }
    out.sunDir.normalize();
    if (r > 0) {
      // overcast colours for the same time blend
      const sky = new THREE.Color(0, 0, 0), hor = new THREE.Color(0, 0, 0), cl = new THREE.Color(0, 0, 0), cs = new THREE.Color(0, 0, 0);
      let sunScale = 0, fog = 0;
      for (const k of ['day', 'dusk', 'night']) {
        const s = RAIN[k], a = w[k];
        sky.r += s.sky.r * a; sky.g += s.sky.g * a; sky.b += s.sky.b * a;
        hor.r += s.horizon.r * a; hor.g += s.horizon.g * a; hor.b += s.horizon.b * a;
        cl.r += s.cloudLit.r * a; cl.g += s.cloudLit.g * a; cl.b += s.cloudLit.b * a;
        cs.r += s.cloudShade.r * a; cs.g += s.cloudShade.g * a; cs.b += s.cloudShade.b * a;
        sunScale += s.sunScale * a; fog += s.fog * a;
      }
      out.zenith.lerp(sky, r); out.horizon.lerp(hor, r); out.fogColor.lerp(hor, r);
      out.cloudLit.lerp(cl, r); out.cloudShade.lerp(cs, r);
      out.cloud += (1 - out.cloud) * r;
      out.sun *= 1 + (sunScale - 1) * r;
      out.disc *= 1 - r;
      out.glow *= 1 - 0.8 * r;
      out.stars *= 1 - r;
      out.fog += (fog - out.fog) * r;
      out.ground.multiplyScalar(1 - 0.4 * r);
      out.exterior = Math.max(out.exterior, r * 0.6 * (w.dusk + w.night) + r * 0.35 * w.day);
    }
    return out;
  }

  update(dt) {
    const rate = 1 - Math.exp(-dt * 0.9);
    let delta = 0;
    for (const k of ['day', 'dusk', 'night']) {
      const target = this.time === k ? 1 : 0;
      const d = (target - this.w[k]) * rate;
      this.w[k] += d; delta += Math.abs(d);
      if (Math.abs(target - this.w[k]) < 1e-3) this.w[k] = target;
    }
    const rr = 1 - Math.exp(-dt * 0.45);
    const dr = (this.targetRain - this.rain) * rr;
    this.rain += dr; delta += Math.abs(dr);
    if (Math.abs(this.targetRain - this.rain) < 1e-3) this.rain = this.targetRain;

    this.changing = delta > 1e-5;
    if (this.changing) {
      this.p = this._compose();
      this._apply();
      this._envTimer += dt;
      if (this._envTimer > 0.3) { this._envTimer = 0; this.regenerateEnv(); this.ctx.onEnvironmentChanged?.(false); }
    } else if (this._envTimer > 0) {
      this._envTimer = 0;
      this.regenerateEnv();
      this.ctx.onEnvironmentChanged?.(true);
    }
    // keep the dome centred on the viewer
    this.sky.position.copy(this.ctx.camera.position);
  }

  _apply() {
    const p = this.p, u = this.skyUniforms;
    u.uSunDir.value.copy(p.sunDir);
    u.uSunColor.value.copy(p.sunColor);
    u.uSunDisc.value = p.disc;
    u.uSunGlow.value = p.glow;
    u.uZenith.value.copy(p.zenith);
    u.uHorizon.value.copy(p.horizon);
    u.uGround.value.copy(p.ground);
    u.uCloudCover.value = p.cloud;
    u.uCloudLit.value.copy(p.cloudLit);
    u.uCloudShade.value.copy(p.cloudShade);
    u.uStars.value = p.stars;

    this.sun.color.copy(p.sunColor);
    this.sun.intensity = p.sun;
    this.sun.position.copy(this.sunTarget.position).addScaledVector(p.sunDir, 70);
    const cam = this.sun.shadow.camera;
    const e = p.shadowExtent;
    if (cam.right !== e) { cam.left = -e; cam.right = e; cam.top = e; cam.bottom = -e; cam.updateProjectionMatrix(); }
    this.sun.shadow.needsUpdate = true;

    const scene = this.ctx.scene;
    scene.fog.color.copy(p.fogColor);
    scene.fog.density = p.fog;
    scene.environmentIntensity = p.env;
  }

  regenerateEnv() {
    const { renderer } = this.ctx;
    this.skyUniforms.uEnvCapture.value = 1;
    this.cubeCam.update(renderer, this.skyScene);
    this.skyUniforms.uEnvCapture.value = 0;
    this.envRT = this.pmrem.fromCubemap(this.cubeRT.texture, this.envRT);
    this.ctx.scene.environment = this.envRT.texture;
  }

  // Normalised "how much outdoor light" (used by auto exposure fallback and rain lighting).
  get daylight() { return this.w.day * (1 - 0.7 * this.rain) + this.w.dusk * 0.35 * (1 - 0.7 * this.rain) + this.w.night * 0.01; }
}
