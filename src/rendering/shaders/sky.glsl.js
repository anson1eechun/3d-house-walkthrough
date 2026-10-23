export const skyVertex = /* glsl */`
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;   // depth = far plane, so the sky only fills uncovered pixels
}
`;

export const skyFragment = /* glsl */`
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uSunDisc;
uniform float uSunGlow;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform float uCloudCover;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform float uStars;
uniform float uTime;
uniform float uEnvCapture;
varying vec3 vDir;

float sh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float sn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(sh(i), sh(i + vec2(1, 0)), u.x), mix(sh(i + vec2(0, 1)), sh(i + vec2(1, 1)), u.x), u.y);
}
float sfbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * sn(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}

void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float t = pow(clamp(h, 0.0, 1.0), 0.5);
  vec3 col = mix(uHorizon, uZenith, t);
  float sd = max(dot(d, uSunDir), 0.0);
  // forward scattering glow, stronger near the horizon
  float horizonBoost = 1.0 - clamp(h * 2.5, 0.0, 1.0);
  col += uSunColor * (pow(sd, 6.0) * 0.18 + pow(sd, 48.0) * 0.5) * uSunGlow * (0.6 + horizonBoost);

  float cloud = 0.0;
  if (h > 0.0) {
    vec2 uv = d.xz / (h + 0.15) * 0.55 + uTime * vec2(0.0035, 0.0012);
    float n = sfbm(uv * 1.6);
    float n2 = sfbm(uv * 4.0 + 3.7);
    float c = n * 0.75 + n2 * 0.25;
    cloud = smoothstep(1.0 - uCloudCover * 0.95 - 0.05, 1.0 - uCloudCover * 0.95 + 0.25, c);
    cloud *= smoothstep(0.0, 0.12, h);
    float lit = clamp(0.55 + 0.45 * dot(normalize(vec3(d.x, 0.35, d.z)), uSunDir) + (n2 - 0.5) * 0.6, 0.0, 1.0);
    vec3 ccol = mix(uCloudShade, uCloudLit, lit);
    ccol += uSunColor * pow(sd, 10.0) * 0.6 * uSunGlow * (1.0 - cloud * 0.5);
    col = mix(col, ccol, cloud);
  }

  // stars
  if (uStars > 0.001 && h > 0.0) {
    vec2 g = d.xz / (h + 0.4) * 180.0;
    vec2 id = floor(g);
    float r = sh(id);
    vec2 f = fract(g) - 0.5 - (vec2(sh(id + 1.3), sh(id + 2.7)) - 0.5) * 0.6;
    float star = smoothstep(0.08, 0.0, length(f)) * step(0.985, r) * (0.5 + 0.5 * sin(uTime * 2.0 + r * 50.0));
    col += vec3(0.8, 0.85, 1.0) * star * uStars * (1.0 - cloud) * 0.6;
  }

  // sun / moon disc (dimmed in environment captures to avoid doubling the direct light)
  float disc = smoothstep(0.99955, 0.9998, sd);
  col += uSunColor * disc * uSunDisc * (1.0 - cloud * 0.97) * (1.0 - uEnvCapture * 0.97);

  // ground hemisphere
  col = mix(col, uGround, smoothstep(0.0, -0.06, h));
  gl_FragColor = vec4(col, 1.0);
}
`;
