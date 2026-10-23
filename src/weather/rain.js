// GPU rain. All motion happens in the vertex shader (no per-frame CPU work):
//  * streaks: instanced quads, positions wrapped in a box that follows the camera,
//    stretched along the (wind-tilted) velocity and billboarded around it;
//  * splashes: short-lived instanced sprites respawned on a hashed schedule at
//    the surface height;
//  * occlusion: a top-down height map of the scene (rendered once) hides drops
//    below roofs, the canopy, trees - so it never rains indoors.

import * as THREE from 'three';
import { LAYER } from '../core/layers.js';

const OCC_RECT = [-60, -60, 120, 120];   // x0, z0, sizeX, sizeZ
const OCC_RES = 1024;

const streakVert = /* glsl */`
attribute vec3 aOffset;
attribute vec2 aRand;
uniform float uTime;
uniform vec3 uBox;
uniform vec3 uCam;
uniform float uSpeed;
uniform vec2 uWind;
uniform float uIntensity;
uniform sampler2D uOcc;
uniform vec4 uOccRect;
varying vec2 vUv;
varying float vAlpha;
void main() {
  vec3 vel = vec3(uWind.x, -uSpeed * (0.85 + 0.3 * aRand.x), uWind.y);
  vec3 base = uCam - uBox * 0.5;
  vec3 p = base + mod(aOffset * uBox + vel * uTime - base, uBox);
  vec3 dir = normalize(vel);
  float len = 0.32 + 0.3 * aRand.y;
  vec3 head = p + dir * len;
  vec2 ouv = (head.xz - uOccRect.xy) / uOccRect.zw;
  float occ = -100.0;
  if (ouv.x > 0.0 && ouv.y > 0.0 && ouv.x < 1.0 && ouv.y < 1.0) occ = texture2D(uOcc, ouv).r - 20.0;
  float visible = step(occ, head.y) * step(aRand.x, uIntensity);
  vec3 toCam = normalize(cameraPosition - p);
  vec3 side = normalize(cross(dir, toCam));
  float dist = length(cameraPosition - p);
  float width = 0.0045 + dist * 0.0009;      // keep distant streaks at least ~1px wide
  vec3 pos = p + side * position.x * width + dir * position.y * len;
  vAlpha = visible * smoothstep(0.5, 2.0, dist) * (1.0 - smoothstep(uBox.x * 0.32, uBox.x * 0.5, dist));
  vUv = position.xy;
  gl_Position = vAlpha > 0.0 ? projectionMatrix * viewMatrix * vec4(pos, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}
`;

const streakFrag = /* glsl */`
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
varying float vAlpha;
void main() {
  float across = 1.0 - abs(vUv.x) * 2.0;
  float along = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
  float a = across * across * along * vAlpha * uOpacity;
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor, a);
}
`;

const splashVert = /* glsl */`
attribute vec2 aSeed;
uniform float uTime;
uniform vec3 uCam;
uniform float uRadius;
uniform float uIntensity;
uniform sampler2D uOcc;
uniform vec4 uOccRect;
varying vec2 vUv;
varying float vLife;
varying float vAlpha;
float h1(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
void main() {
  float life = 0.32 + 0.12 * aSeed.y;
  float t = uTime + aSeed.x * 17.0;
  float cycle = floor(t / life);
  float f = fract(t / life);
  vec2 anchor = floor(uCam.xz);
  vec2 r = vec2(h1(aSeed + cycle), h1(aSeed.yx + cycle * 1.37)) * 2.0 - 1.0;
  vec2 xz = anchor + r * uRadius;
  vec2 ouv = (xz - uOccRect.xy) / uOccRect.zw;
  float y = 0.0;
  if (ouv.x > 0.0 && ouv.y > 0.0 && ouv.x < 1.0 && ouv.y < 1.0) y = max(texture2D(uOcc, ouv).r - 20.0, 0.0);
  float d = length(xz - uCam.xz);
  float visible = step(aSeed.x, uIntensity) * (1.0 - smoothstep(uRadius * 0.6, uRadius, d));
  vec3 center = vec3(xz.x, y + 0.01, xz.y);
  float size = mix(0.03, 0.13, f) * (0.7 + 0.6 * aSeed.y);
  // billboard facing the camera, base sitting on the surface
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 pos = center + right * position.x * size + vec3(0.0, 1.0, 0.0) * (position.y + 0.5) * size * 0.6;
  vUv = position.xy + 0.5;
  vLife = f;
  vAlpha = visible;
  gl_Position = visible > 0.0 ? projectionMatrix * viewMatrix * vec4(pos, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);
}
`;

const splashFrag = /* glsl */`
uniform vec3 uColor;
uniform float uOpacity;
varying vec2 vUv;
varying float vLife;
varying float vAlpha;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  p.y = p.y * 1.6 + 0.6;
  float r = length(p);
  // crown ring that opens up and thins out
  float ring = smoothstep(0.18, 0.0, abs(r - mix(0.2, 0.9, vLife))) * (1.0 - vLife);
  float a = ring * vAlpha * uOpacity * step(-1.0, p.y);
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
}
`;

export class RainSystem {
  constructor(ctx) {
    this.ctx = ctx;
    const maxStreaks = 30000, maxSplashes = 3000;
    this.occRT = new THREE.WebGLRenderTarget(OCC_RES, OCC_RES, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: true });
    this.occRT.texture.name = 'rainOcclusion';
    const occRect = new THREE.Vector4(...OCC_RECT);
    this.uniforms = {
      uTime: ctx.globals.uTime, uBox: { value: new THREE.Vector3(34, 20, 34) }, uCam: { value: new THREE.Vector3() },
      uSpeed: { value: 9.0 }, uWind: { value: new THREE.Vector2(0.9, 0.35) }, uIntensity: { value: 0 },
      uOcc: { value: this.occRT.texture }, uOccRect: { value: occRect },
      uColor: { value: new THREE.Color(0.6, 0.62, 0.66) }, uOpacity: { value: 0.32 },
    };

    // streaks
    const quad = new THREE.InstancedBufferGeometry();
    quad.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    const off = new Float32Array(maxStreaks * 3), rnd = new Float32Array(maxStreaks * 2);
    for (let i = 0; i < maxStreaks; i++) {
      off[i * 3] = Math.random(); off[i * 3 + 1] = Math.random(); off[i * 3 + 2] = Math.random();
      rnd[i * 2] = Math.random(); rnd[i * 2 + 1] = Math.random();
    }
    quad.setAttribute('aOffset', new THREE.InstancedBufferAttribute(off, 3));
    quad.setAttribute('aRand', new THREE.InstancedBufferAttribute(rnd, 2));
    quad.instanceCount = 0;
    quad.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.streakMat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: streakVert, fragmentShader: streakFrag,
      transparent: true, depthWrite: false, fog: false,
    });
    this.streaks = new THREE.Mesh(quad, this.streakMat);
    this.streaks.frustumCulled = false;
    this.streaks.renderOrder = 10;
    this.streaks.layers.set(LAYER.MAIN_ONLY);
    this.streaks.name = 'rain';
    this.streaks.visible = false;
    ctx.scene.add(this.streaks);

    // splashes
    const sq = new THREE.InstancedBufferGeometry();
    sq.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    sq.setIndex([0, 1, 2, 0, 2, 3]);
    const seed = new Float32Array(maxSplashes * 2);
    for (let i = 0; i < maxSplashes; i++) { seed[i * 2] = Math.random(); seed[i * 2 + 1] = Math.random(); }
    sq.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 2));
    sq.instanceCount = 0;
    sq.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.splashUniforms = {
      uTime: ctx.globals.uTime, uCam: this.uniforms.uCam, uRadius: { value: 9 }, uIntensity: this.uniforms.uIntensity,
      uOcc: this.uniforms.uOcc, uOccRect: this.uniforms.uOccRect, uColor: this.uniforms.uColor, uOpacity: { value: 0.5 },
    };
    this.splashMat = new THREE.ShaderMaterial({
      uniforms: this.splashUniforms, vertexShader: splashVert, fragmentShader: splashFrag,
      transparent: true, depthWrite: false, fog: false,
    });
    this.splashes = new THREE.Mesh(sq, this.splashMat);
    this.splashes.frustumCulled = false;
    this.splashes.renderOrder = 9;
    this.splashes.layers.set(LAYER.MAIN_ONLY);
    this.splashes.name = 'splashes';
    this.splashes.visible = false;
    ctx.scene.add(this.splashes);

    this.counts = { streaks: 16000, splashes: 1600 };
    this.intensity = 0;
  }

  setQuality(Q) { this.counts = { ...Q.rain }; this._applyCounts(); }

  _applyCounts() {
    this.streaks.geometry.instanceCount = this.intensity > 0 ? this.counts.streaks : 0;
    this.splashes.geometry.instanceCount = this.intensity > 0 ? this.counts.splashes : 0;
  }

  setIntensity(v) {
    const was = this.intensity > 0;
    this.intensity = v;
    this.uniforms.uIntensity.value = v;
    this.streaks.visible = this.splashes.visible = v > 0.001;
    if (was !== v > 0) this._applyCounts();
  }

  update(color) {
    this.uniforms.uCam.value.copy(this.ctx.camera.position);
    if (color) this.uniforms.uColor.value.copy(color);
  }

  // Top-down height map of everything that can stop rain (roofs, trees, ground).
  bakeOcclusion() {
    const { renderer, scene } = this.ctx;
    const [x0, z0, sx, sz] = OCC_RECT;
    const cam = new THREE.OrthographicCamera(-sx / 2, sx / 2, sz / 2, -sz / 2, 0.1, 200);
    cam.position.set(x0 + sx / 2, 100, z0 + sz / 2);
    cam.up.set(0, 0, -1);
    cam.lookAt(x0 + sx / 2, 0, z0 + sz / 2);
    cam.layers.set(LAYER.DEFAULT); cam.layers.enable(LAYER.GROUND);
    const heightMat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */`
        varying float vY;
        void main() {
          vec4 p = vec4(position, 1.0);
          #ifdef USE_INSTANCING
            p = instanceMatrix * p;
          #endif
          vec4 w = modelMatrix * p;
          vY = w.y;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */`
        varying float vY;
        void main() { gl_FragColor = vec4(vY + 20.0, 0.0, 0.0, 1.0); }`, // +20 offset: cleared texels (0) mean 'no occluder'
      side: THREE.DoubleSide,
    });
    const sky = scene.getObjectByName('sky');
    const skyVis = sky ? sky.visible : false;
    if (sky) sky.visible = false;
    const prevOverride = scene.overrideMaterial, prevBg = scene.background;
    scene.overrideMaterial = heightMat;
    const prevTarget = renderer.getRenderTarget();
    const prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
    const prevShadow = renderer.shadowMap.autoUpdate;
    renderer.shadowMap.autoUpdate = false;
    renderer.setRenderTarget(this.occRT);
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(prevClear, prevAlpha);
    renderer.shadowMap.autoUpdate = prevShadow;
    scene.overrideMaterial = prevOverride; scene.background = prevBg;
    if (sky) sky.visible = skyVis;
    heightMat.dispose();
  }
}
