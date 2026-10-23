// Wet surfaces. Exterior materials get a shader patch driven by global uniforms:
//   * porous materials darken and lose roughness as they soak (per-material porosity)
//   * upward faces grow puddles from a world-space noise mask as wetness rises;
//     puddles are near-mirror, flatten the normal map and carry rain ripples
//   * where a planar reflection is available (ground plane), puddles and wet
//     ground blend it in with Fresnel, replacing the env-map specular there
//   * vertical surfaces get streaky wetness, strongest near the ground
// Interior zone clones of the same materials keep uWetScale = 0.

import * as THREE from 'three';

// porosity (darkening/gloss), puddles (0..1), planar (receives ground reflection), maxGloss
// macro: low-frequency albedo variation that breaks up visible texture tiling
const MACRO = { grass: 0.32, concrete: 0.1, pavers: 0.08, asphalt: 0.12, deck: 0.08, gravel: 0.1, hedgeCore: 0.2 };
const WET = {
  concrete: [0.65, 1.0, 1, 1], pavers: [0.6, 0.85, 1, 1], asphalt: [0.55, 1.0, 1, 1], coping: [0.5, 0.35, 1, 1],
  deck: [0.75, 0.0, 1, 0.8], grass: [0.35, 0.0, 0, 0.35], gravel: [0.6, 0.5, 0, 1], soil: [0.6, 0.0, 0, 0.6],
  stucco: [0.45, 0.0, 0, 0.6], cladding: [0.7, 0.0, 0, 0.7], plinth: [0.6, 0.0, 0, 0.8], fenceWood: [0.7, 0.0, 0, 0.7],
  darkMetal: [0.12, 0.0, 0, 1], frame: [0.08, 0.0, 0, 1], bark: [0.6, 0.0, 0, 0.6], leaves: [0.25, 0.0, 0, 0.7],
  hedgeLeaves: [0.25, 0.0, 0, 0.7], roadLine: [0.4, 0.6, 1, 1], marbleDark: [0.2, 0.3, 1, 1], hills: [0.2, 0, 0, 0.3],
  hedgeCore: [0.3, 0, 0, 0.5], terracotta: [0.5, 0, 0, 0.6], ceramicMatte: [0.3, 0, 0, 0.8], fabricOlive: [0.6, 0, 0, 0.4],
};

const VERT_PARS = /* glsl */`
varying vec3 vWetWorldPos;
varying vec3 vWetWorldNormal;
`;

// Wind for exterior foliage: whole-crown sway (scaled by height in the tree) plus
// per-leaf flutter. Stronger while it rains.
const FOLIAGE = { leaves: 1, hedgeLeaves: 0.25 };
const SWAY_PARS = /* glsl */`
uniform float uTime;
uniform float uWind;
uniform float uSway;
`;
const SWAY_MAIN = /* glsl */`
{
  vec3 base = vec3(0.0);
  #ifdef USE_INSTANCING
    base = instanceMatrix[3].xyz;
  #endif
  float ph = dot(base.xz, vec2(0.37, 0.71));
  float h = smoothstep(0.5, 7.0, position.y) * uSway;
  float amp = (0.05 + 0.16 * uWind);
  transformed.x += sin(uTime * 1.3 + ph) * amp * h;
  transformed.z += cos(uTime * 1.1 + ph * 1.3) * amp * h * 0.7;
  float fl = sin(uTime * (6.0 + 3.0 * uWind) + dot(position, vec3(3.1, 2.3, 2.9)) + ph);
  transformed += normal * fl * (0.012 + 0.02 * uWind);
}
`;
const VERT_MAIN = /* glsl */`
{
  vec4 wwp = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    wwp = instanceMatrix * wwp;
  #endif
  wwp = modelMatrix * wwp;
  vWetWorldPos = wwp.xyz;
  vWetWorldNormal = inverseTransformDirection(transformedNormal, viewMatrix);
}
`;

const FRAG_PARS = /* glsl */`
uniform float uWetness;
uniform float uRain;
uniform float uTime;
uniform float uWetScale;
uniform vec4 uWetCfg;
uniform float uMacro;
uniform sampler2D uReflTex;
uniform mat4 uReflMatrix;
uniform float uReflOn;
uniform float uWetDebug;
uniform sampler2D uOcc;
uniform vec4 uOccRect;
varying vec3 vWetWorldPos;
varying vec3 vWetWorldNormal;
float gWet = 0.0;
float gPuddle = 0.0;

float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1, 0)), u.x), mix(wHash(i + vec2(0, 1)), wHash(i + vec2(1, 1)), u.x), u.y);
}
float wFbm(vec2 p) { return wNoise(p) * 0.55 + wNoise(p * 2.1 + 5.3) * 0.3 + wNoise(p * 4.3 + 1.7) * 0.15; }

// Expanding rain ripple rings on a cell grid; returns a world-space xz slope.
vec2 wRipples(vec2 p, float t) {
  vec2 acc = vec2(0.0);
  for (int layer = 0; layer < 2; layer++) {
    float sc = layer == 0 ? 3.1 : 4.7;
    vec2 g = p * sc + float(layer) * 11.3;
    vec2 id = floor(g);
    vec2 f = fract(g);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j));
      vec2 cid = id + o;
      float h = wHash(cid);
      vec2 c = o + vec2(wHash(cid + 3.1), wHash(cid + 7.7));
      float life = fract(t * (0.9 + h * 0.6) + h * 13.0);
      vec2 d = f - c;
      float r = length(d);
      float ring = life * 0.55;
      float x = (r - ring) * 26.0;
      float w = exp(-x * x) * (1.0 - life) * (1.0 - life);
      acc += (r > 1e-3 ? d / r : vec2(0.0)) * sin(x * 3.0) * w;
    }
  }
  return acc;
}
`;

const FRAG_COLOR = /* glsl */`
{
  float wet = uWetness * uWetScale;
  vec3 wn = normalize(vWetWorldNormal);
  float up = smoothstep(0.55, 0.95, wn.y);
  // ground sheltered by a roof, canopy or tree (rain occlusion height map) stays dry
  vec2 ouv = (vWetWorldPos.xz - uOccRect.xy) / uOccRect.zw;
  if (up > 0.0 && ouv.x > 0.0 && ouv.y > 0.0 && ouv.x < 1.0 && ouv.y < 1.0) {
    float occ = texture2D(uOcc, ouv).r - 20.0;
    wet *= 1.0 - up * step(vWetWorldPos.y + 0.35, occ) * 0.92;
  }
  float streak = wFbm(vec2(vWetWorldPos.x * 3.0 + vWetWorldPos.z * 3.0, vWetWorldPos.y * 0.6));
  float vertical = clamp(1.25 - max(vWetWorldPos.y, 0.0) * 0.22, 0.25, 1.0) * (0.55 + 0.45 * streak);
  gWet = wet * mix(vertical, 1.0, up);
  if (uWetCfg.y > 0.0 && wet > 0.0) {
    float pn = wFbm(vWetWorldPos.xz * 0.45) * 0.7 + wFbm(vWetWorldPos.xz * 1.7 + 3.0) * 0.3;
    float level = 1.0 - wet * 0.42 * uWetCfg.y;
    gPuddle = up * smoothstep(level, level + 0.06, pn) * step(0.01, uWetCfg.y);
  }
  if (uMacro > 0.0) {
    float mv = wFbm(vWetWorldPos.xz * 0.045) * 0.65 + wFbm(vWetWorldPos.xz * 0.21 + 7.0) * 0.35;
    diffuseColor.rgb *= 1.0 + (mv - 0.5) * 2.0 * uMacro;
    diffuseColor.r *= 1.0 + (wFbm(vWetWorldPos.xz * 0.11 + 3.0) - 0.5) * uMacro;
  }
  diffuseColor.rgb *= mix(1.0, 1.0 - 0.5 * uWetCfg.x, gWet);
  diffuseColor.rgb *= mix(1.0, 0.8, gPuddle);
}
`;

const FRAG_ROUGH = /* glsl */`
{
  float soaked = gWet * mix(0.55, 1.0, uWetCfg.x);
  float wetRough = mix(roughnessFactor, max(roughnessFactor * 0.25, 0.08), uWetCfg.w);
  roughnessFactor = mix(roughnessFactor, wetRough, soaked);
  roughnessFactor = mix(roughnessFactor, 0.03, gPuddle);
}
`;

const FRAG_NORMAL = /* glsl */`
if (gPuddle > 0.0 || gWet > 0.0) {
  vec3 flatN = normalize((viewMatrix * vec4(normalize(vWetWorldNormal), 0.0)).xyz);
  normal = normalize(mix(normal, flatN, gPuddle * 0.9 + gWet * 0.25));
  if (uRain > 0.01 && gPuddle > 0.0) {
    vec2 rip = wRipples(vWetWorldPos.xz, uTime) * 0.35 * uRain;
    normal = normalize(normal + (viewMatrix * vec4(rip.x, 0.0, rip.y, 0.0)).xyz * gPuddle);
  }
}
`;

const FRAG_SPEC = /* glsl */`
vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
if (uReflOn > 0.5 && uWetCfg.z > 0.5 && (gWet > 0.0)) {
  vec3 nW = inverseTransformDirection(normal, viewMatrix);
  vec4 rc = uReflMatrix * vec4(vWetWorldPos, 1.0);
  vec2 ruv = rc.xy / rc.w + nW.xz * (0.012 + 0.03 * gPuddle);
  float lod = clamp(roughnessFactor * 9.0, 0.0, 6.0);
  vec3 refl = textureLod(uReflTex, ruv, lod).rgb;
  float NoV = saturate(dot(normal, geometryViewDir));
  // puddles: softened Fresnel so the mirror image reads at walking-eye angles;
  // plain wet ground: a weaker, blurrier sheen
  float fresP = 0.06 + 0.94 * pow(1.0 - NoV, 2.5);
  float fresW = 0.02 + 0.98 * pow(1.0 - NoV, 4.0);
  float k = mix(fresW * gWet * 0.55 * uWetCfg.x, fresP * 0.92, gPuddle);
  // fade out where the projected lookup leaves the reflection texture
  vec2 edge = smoothstep(vec2(0.0), vec2(0.04), ruv) * smoothstep(vec2(1.0), vec2(0.96), ruv);
  k *= edge.x * edge.y;
  totalSpecular = totalSpecular * (1.0 - k) + refl * k;
  totalDiffuse *= 1.0 - gPuddle * 0.45;
  if (uWetDebug > 0.5) {
    if (uWetDebug < 1.5) { totalDiffuse = refl; totalSpecular = vec3(0.0); }
    else if (uWetDebug < 2.5) { totalDiffuse = vec3(gPuddle, gWet, 0.0); totalSpecular = vec3(0.0); }
    else if (uWetDebug < 3.5) { totalDiffuse = vec3(k); totalSpecular = vec3(0.0); }
    else if (uWetDebug < 4.5) { totalDiffuse = vec3(0.0); }
    else { totalSpecular = vec3(0.0); }
  }
}
`;

export class WetSurfaces {
  constructor(globals) {
    this.globals = globals;
    this.refl = { uReflTex: { value: null }, uReflMatrix: { value: new THREE.Matrix4() }, uReflOn: { value: 0 } };
    this.occ = { uOcc: { value: null }, uOccRect: { value: new THREE.Vector4(0, 0, 1, 1) } };
    this.debug = { value: 0 };   // 1: reflection, 2: puddle/wet masks, 3: reflection weight
    this.materials = [];
  }

  setOcclusion(u) { this.occ.uOcc = u.uOcc; this.occ.uOccRect = u.uOccRect; }

  setReflection(r) {
    this.refl.uReflTex = r.uniforms.uReflTex;
    this.refl.uReflMatrix = r.uniforms.uReflMatrix;
    this.refl.uReflOn = r.uniforms.uReflOn;
  }

  patch(mat) {
    const cfg = WET[mat.name];
    if (!cfg || mat.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) return;
    const self = this;
    mat.wetConfig = cfg;
    mat.onBeforeCompile = function (shader) {
      const g = self.globals;
      shader.uniforms.uWetness = g.uWetness;
      shader.uniforms.uRain = g.uRain;
      shader.uniforms.uTime = g.uTime;
      shader.uniforms.uWetScale = { value: this.userData.zone ? 0 : 1 };
      shader.uniforms.uWetCfg = { value: new THREE.Vector4(...cfg) };
      shader.uniforms.uMacro = { value: MACRO[mat.name] || 0 };
      shader.uniforms.uReflTex = self.refl.uReflTex;
      shader.uniforms.uReflMatrix = self.refl.uReflMatrix;
      shader.uniforms.uReflOn = self.refl.uReflOn;
      shader.uniforms.uOcc = self.occ.uOcc;
      shader.uniforms.uOccRect = self.occ.uOccRect;
      shader.uniforms.uWetDebug = self.debug;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\n' + VERT_PARS)
        .replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_MAIN);
      if (FOLIAGE[mat.name]) {
        shader.uniforms.uWind = g.uWind;
        shader.uniforms.uSway = { value: FOLIAGE[mat.name] };
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\n' + SWAY_PARS)
          .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + SWAY_MAIN);
      }
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
        .replace('#include <map_fragment>', '#include <map_fragment>\n' + FRAG_COLOR)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n' + FRAG_ROUGH)
        .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n' + FRAG_NORMAL)
        .replace('vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;', FRAG_SPEC);
    };
    mat.customProgramCacheKey = () => (FOLIAGE[mat.name] ? 'wet-foliage-v1' : 'wet-v1');
    this.materials.push(mat);
  }
}
