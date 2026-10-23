export const fsVertex = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

export const copyFragment = /* glsl */`
uniform sampler2D tDiffuse;
varying vec2 vUv;
void main() { gl_FragColor = texture2D(tDiffuse, vUv); }
`;

// Centre-weighted log-luminance metering into a small target: R = sum(w*log L), G = sum(w).
export const lumFragment = /* glsl */`
uniform sampler2D tDiffuse;
uniform vec2 uTexel;
varying vec2 vUv;
float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
void main() {
  float s = 0.0;
  for (int y = -1; y <= 2; y++) for (int x = -1; x <= 2; x++) {
    vec2 o = (vec2(float(x), float(y)) - 0.5) * uTexel;
    s += log(max(lum(texture2D(tDiffuse, vUv + o).rgb), 1e-4));
  }
  s /= 16.0;
  vec2 d = (vUv - 0.5) * vec2(1.6, 1.0);
  float w = mix(0.25, 1.0, exp(-dot(d, d) * 5.0));
  gl_FragColor = vec4(s * w, w, 0.0, 1.0);
}
`;

// 4x4 box reduction using 4 bilinear taps.
export const reduceFragment = /* glsl */`
uniform sampler2D tDiffuse;
uniform vec2 uTexel;   // texel of the source
varying vec2 vUv;
void main() {
  vec4 s = texture2D(tDiffuse, vUv + vec2(-1.0, -1.0) * uTexel)
         + texture2D(tDiffuse, vUv + vec2( 1.0, -1.0) * uTexel)
         + texture2D(tDiffuse, vUv + vec2(-1.0,  1.0) * uTexel)
         + texture2D(tDiffuse, vUv + vec2( 1.0,  1.0) * uTexel);
  gl_FragColor = s * 0.25;
}
`;

// Temporal adaptation of the average log luminance (1x1 ping-pong).
export const adaptFragment = /* glsl */`
uniform sampler2D tCurrent;
uniform sampler2D tPrevious;
uniform float uDt;
uniform float uReset;
varying vec2 vUv;
void main() {
  vec4 c = texture2D(tCurrent, vec2(0.5));
  float cur = c.r / max(c.g, 1e-4);
  float prev = texture2D(tPrevious, vec2(0.5)).r;
  float speed = cur > prev ? 2.2 : 1.1;   // eyes adapt to brightness faster than to darkness
  float v = mix(prev, cur, 1.0 - exp(-uDt * speed));
  gl_FragColor = vec4(uReset > 0.5 ? cur : v, 0.0, 0.0, 1.0);
}
`;

export const exposureFragment = /* glsl */`
uniform sampler2D tDiffuse;
uniform sampler2D tAdapted;
uniform float uAuto;
uniform float uManual;
uniform float uComp;
uniform float uKey;
uniform vec2 uRange;
uniform float uAdapt;
varying vec2 vUv;
void main() {
  vec4 col = texture2D(tDiffuse, vUv);
  float e = uManual;
  if (uAuto > 0.5) {
    // Partial adaptation: a dim room ends up somewhat darker than daylight
    // outside instead of being fully normalised (e = key / (ref^(1-k) * avg^k)).
    float avg = max(exp(texture2D(tAdapted, vec2(0.5)).r), 1e-4);
    e = clamp(uKey / (pow(uKey, 1.0 - uAdapt) * pow(avg, uAdapt)), uRange.x, uRange.y);
  }
  gl_FragColor = vec4(col.rgb * e * exp2(uComp), col.a);
}
`;

// ACES filmic (same fit as three.js) + light grading + vignette + sRGB encode + dither.
export const finalFragment = /* glsl */`
uniform sampler2D tDiffuse;
uniform sampler2D tAdapted;
uniform float uFoldExposure;
uniform float uKey;
uniform vec2 uRange;
uniform float uAdapt;
uniform float uComp;
uniform float uSaturation;
uniform float uContrast;
uniform vec3 uLift;
uniform vec3 uGain;
uniform float uVignette;
uniform vec2 uResolution;
varying vec2 vUv;

vec3 RRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 ACESFilmic(vec3 color) {
  const mat3 ACESInputMat = mat3(
    vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 ACESOutputMat = mat3(
    vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color /= 0.6;
  color = ACESInputMat * color;
  color = RRTAndODTFit(color);
  color = ACESOutputMat * color;
  return clamp(color, 0.0, 1.0);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  if (uFoldExposure > 0.5) {
    // exposure folded in here when there is no bloom pass in between (low quality)
    float avg = max(exp(texture2D(tAdapted, vec2(0.5)).r), 1e-4);
    c *= clamp(uKey / (pow(uKey, 1.0 - uAdapt) * pow(avg, uAdapt)), uRange.x, uRange.y) * exp2(uComp);
  }
  c = ACESFilmic(c);
  // grading in display-referred space
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSaturation);
  c = c * uGain + uLift * (1.0 - c);
  c = clamp((c - 0.5) * uContrast + 0.5, 0.0, 1.0);
  vec2 d = vUv - 0.5;
  d.x *= uResolution.x / uResolution.y;
  c *= 1.0 - uVignette * smoothstep(0.35, 1.1, length(d));
  c = toSRGB(max(c, 0.0));
  c += (hash(vUv * uResolution) - 0.5) / 255.0;
  gl_FragColor = vec4(c, 1.0);
}
`;
