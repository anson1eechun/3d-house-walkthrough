// Window glass with procedural rain droplets.
//
// The glass is a MeshPhysicalMaterial using three.js transmission (the opaque
// scene is rendered into a mip-mapped buffer and sampled through the surface).
// We patch its shader so the droplet field replaces the tangent-space normal:
//   * the perturbed normal bends the transmission lookup (getIBLVolumeRefraction
//     offsets the sample by refract(-v, n) * thickness) -> real local distortion
//     of what is behind the glass, magnified by extra lens thickness in drops;
//   * the same normal drives specular reflections, so drops catch highlights;
//   * a light "mist" raises roughness (blurring the transmission mip level)
//     everywhere except where drops and their trails have wiped the glass.
// The drops live in the pane's own UV space (metres), so they stay on the glass
// when a sash opens and can never float in front of it.

import * as THREE from 'three';

const DROPS_GLSL = /* glsl */`
uniform float uTime;
uniform float uGlassRain;
uniform float uGlassMist;
float gDropMask = 0.0;
float gDropWipe = 0.0;

float dh21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

// Static beads: one candidate per grid cell, appearing and evaporating over time.
vec3 dStatic(vec2 uv, float t, float density, float cell) {
  vec2 g = uv / cell;
  vec2 id = floor(g);
  float present = step(1.0 - density, dh21(id + 7.31));
  vec2 c = 0.3 + 0.4 * vec2(dh21(id), dh21(id + 1.9));
  float r = mix(0.1, 0.34, pow(dh21(id + 3.1), 2.0));
  float life = fract(t * 0.035 + dh21(id + 11.7));
  float fade = smoothstep(0.0, 0.08, life) * smoothstep(1.0, 0.75, life) * present;
  vec2 q = (g - id - c) / r;
  q.y *= 1.12;
  float d2 = dot(q, q);
  if (d2 >= 1.0 || fade <= 0.0) return vec3(0.0);
  float s = sqrt(1.0 - d2);
  return vec3(q / max(s, 0.22), smoothstep(1.0, 0.55, d2)) * fade;
}

// Running drops with a trail of small beads; the trail also wipes the mist.
vec3 dSliding(vec2 uv, float t, float density, out float wipe) {
  wipe = 0.0;
  float colW = 0.085;
  float col = floor(uv.x / colW);
  if (dh21(vec2(col, 1.7)) > density) return vec3(0.0);
  float speed = mix(0.05, 0.16, dh21(vec2(col, 5.3)));
  float period = 1.9;
  float tt = t * speed + dh21(vec2(col, 9.1)) * period;
  // stick-slip motion: pauses and sudden slides
  float slide = tt + 0.035 * sin(tt * 21.0) + 0.02 * sin(tt * 43.0 + col);
  float y = period - mod(slide, period) - 0.4;
  float path = 0.5 + (dh21(vec2(col, 2.2)) - 0.5) * 0.35 + 0.08 * sin(uv.y * 23.0 + col * 1.7);
  float xc = (col + path) * colW;
  float r = mix(0.0035, 0.0065, dh21(vec2(col, 4.4)));
  vec2 q = vec2((uv.x - xc) / r, (uv.y - y) / (r * 1.25));
  vec3 res = vec3(0.0);
  float d2 = dot(q, q);
  if (d2 < 1.0) {
    float s = sqrt(1.0 - d2);
    res = vec3(q / max(s, 0.22), smoothstep(1.0, 0.5, d2));
  }
  float above = uv.y - y;
  float trailLen = 0.18 + 0.2 * dh21(vec2(col, 6.6));
  if (above > 0.0 && above < trailLen) {
    float along = 1.0 - above / trailLen;
    wipe = smoothstep(r * 1.1, r * 0.4, abs(uv.x - xc)) * along;
    float sp = 0.011;
    float k = floor(above / sp);
    float lr = r * 0.35 * along * step(0.35, dh21(vec2(col, k)));
    vec2 tq = vec2((uv.x - xc - (dh21(vec2(k, col)) - 0.5) * r * 0.6) / max(lr, 1e-4), (mod(above, sp) - sp * 0.5) / max(lr, 1e-4));
    float td = dot(tq, tq);
    if (td < 1.0 && lr > 0.0) {
      float s = sqrt(1.0 - td);
      res += vec3(tq / max(s, 0.25), smoothstep(1.0, 0.5, td)) * 0.8;
    }
  }
  return res;
}

vec3 rainOnGlass(vec2 uv) {
  float amt = uGlassRain;
  if (amt <= 0.001) return vec3(0.0);
  float t = uTime;
  vec3 a = dStatic(uv, t, 0.55 * amt, 0.016);
  vec3 b = dStatic(uv + 0.37, t * 1.3, 0.4 * amt, 0.009) * 0.8;
  float w1, w2;
  vec3 c = dSliding(uv, t, 0.5 * amt, w1);
  vec3 d = dSliding(uv + vec2(0.041, 0.7), t * 0.83, 0.35 * amt, w2);
  gDropWipe = clamp(max(w1, w2), 0.0, 1.0);
  vec3 r = a + b + c + d;
  gDropMask = clamp(r.z, 0.0, 1.0);
  return r;
}
`;

export function createGlassMaterials(globals) {
  const flatNormal = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
  flatNormal.needsUpdate = true;

  const base = {
    color: 0xffffff, metalness: 0, roughness: 0.03, transmission: 1, thickness: 0.012, ior: 1.5,
    specularIntensity: 1, envMapIntensity: 1, depthWrite: false,
  };

  const clear = new THREE.MeshPhysicalMaterial({ ...base, normalMap: flatNormal, attenuationColor: new THREE.Color(0.93, 0.97, 0.96), attenuationDistance: 0.6 });
  clear.name = 'glass';
  clear.userData.noZone = true;
  patchDroplets(clear, globals);

  const frosted = new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.55, thickness: 0.02, normalMap: flatNormal });
  frosted.name = 'glassFrosted';
  frosted.userData.noZone = true;
  patchDroplets(frosted, globals);

  const shower = new THREE.MeshPhysicalMaterial({ ...base, roughness: 0.02, attenuationColor: new THREE.Color(0.9, 0.97, 0.95), attenuationDistance: 0.5 });
  shower.name = 'glassShower';
  shower.userData.noZone = true;

  return { clear, frosted, shower, all: [clear, frosted, shower] };
}

function patchDroplets(mat, globals) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = globals.uTime;
    shader.uniforms.uGlassRain = globals.uGlassRain;
    shader.uniforms.uGlassMist = globals.uGlassMist;
    // The lines we patch live inside chunks, which are still #include directives
    // at this point: inline the chunk sources first, then edit them.
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps)
      .replace('#include <transmission_fragment>', THREE.ShaderChunk.transmission_fragment)
      .replace('#include <normalmap_pars_fragment>', '#include <normalmap_pars_fragment>\n' + DROPS_GLSL)
      .replace(
        'vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
        `vec3 dr = rainOnGlass( vNormalMapUv );
        vec3 mapN = normalize( vec3( dr.xy * 0.9, 1.0 ) );
        // condensation mist blurs the transmission everywhere drops have not wiped it
        float mist = uGlassMist * ( 1.0 - max( gDropWipe, gDropMask ) );
        roughnessFactor = clamp( max( roughnessFactor, mist * 0.32 ), 0.0, 1.0 );`)
      .replace(
        'material.thickness = thickness;',
        'material.thickness = thickness + gDropMask * 0.28;');
  };
  mat.customProgramCacheKey = () => 'glass-droplets-v2';
}

// Low quality: plain alpha-blended glass (no transmission pass).
export function setGlassTransmission(materials, enabled) {
  for (const m of materials.all) {
    const want = enabled ? 1 : 0;
    if (m.transmission === want) continue;
    m.transmission = want;
    m.transparent = !enabled;
    m.opacity = enabled ? 1 : (m.roughness > 0.3 ? 0.55 : 0.16);
    m.needsUpdate = true;
  }
}
