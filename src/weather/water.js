// Pool water: MeshPhysicalMaterial with transmission (refracts the tiled pool
// shell, tinted by volume attenuation) and a patched normal: two scrolling wave
// octaves plus rain ripples. The ground planar reflection (plane y = 0, the
// water sits just below it) is blended in with Fresnel, replacing env specular.

import * as THREE from 'three';

export function createWaterMaterial(globals, wet) {
  const flat = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
  flat.needsUpdate = true;
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.04, metalness: 0, transmission: 1, ior: 1.33, thickness: 1.2,
    attenuationColor: new THREE.Color(0.32, 0.72, 0.74), attenuationDistance: 2.4,
    normalMap: flat, specularIntensity: 1,
  });
  m.name = 'water';
  m.userData.noZone = true;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = globals.uTime;
    shader.uniforms.uRain = globals.uRain;
    shader.uniforms.uReflTex = wet.refl.uReflTex;
    shader.uniforms.uReflMatrix = wet.refl.uReflMatrix;
    shader.uniforms.uReflOn = wet.refl.uReflOn;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWaterPos;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWaterPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform float uRain;
        uniform sampler2D uReflTex; uniform mat4 uReflMatrix; uniform float uReflOn;
        varying vec3 vWaterPos;
        float wh(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        vec2 waveGrad(vec2 p, float t) {
          vec2 g = vec2(0.0);
          g += vec2(cos(p.x * 1.7 + t * 1.1), cos(p.y * 1.3 - t * 0.9)) * 0.06;
          g += vec2(cos(dot(p, vec2(2.9, 1.7)) + t * 1.7)) * vec2(2.9, 1.7) * 0.012;
          g += vec2(cos(dot(p, vec2(-3.7, 4.1)) - t * 2.1)) * vec2(-3.7, 4.1) * 0.006;
          return g;
        }
        vec2 rainRipple(vec2 p, float t) {
          vec2 acc = vec2(0.0);
          vec2 g = p * 3.0; vec2 id = floor(g); vec2 f = fract(g);
          for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
            vec2 o = vec2(float(i), float(j)); vec2 cid = id + o; float h = wh(cid);
            vec2 c = o + vec2(wh(cid + 3.1), wh(cid + 7.7));
            float life = fract(t * (0.9 + h * 0.6) + h * 13.0);
            vec2 d = f - c; float r = length(d); float x = (r - life * 0.6) * 24.0;
            acc += (r > 1e-3 ? d / r : vec2(0.0)) * sin(x * 3.0) * exp(-x * x) * (1.0 - life);
          }
          return acc;
        }`)
      .replace('vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;', `
        vec2 wg = waveGrad(vWaterPos.xz, uTime) + rainRipple(vWaterPos.xz, uTime) * 0.5 * uRain;
        vec3 mapN = normalize(vec3(-wg.x, -wg.y, 1.0));`)
      .replace('vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;', `
        vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
        if (uReflOn > 0.5) {
          vec3 nW = inverseTransformDirection(normal, viewMatrix);
          vec4 rc = uReflMatrix * vec4(vWaterPos.x, 0.0, vWaterPos.z, 1.0);
          vec2 ruv = rc.xy / rc.w + nW.xz * 0.05;
          vec3 refl = textureLod(uReflTex, ruv, 0.5).rgb;
          float NoV = saturate(dot(normal, geometryViewDir));
          float fres = 0.02 + 0.98 * pow(1.0 - NoV, 5.0);
          vec2 edge = smoothstep(vec2(0.0), vec2(0.03), ruv) * smoothstep(vec2(1.0), vec2(0.97), ruv);
          float k = fres * edge.x * edge.y;
          totalSpecular = totalSpecular * (1.0 - k) + refl * k;
        }`);
  };
  m.customProgramCacheKey = () => 'water-v1';
  return m;
}
