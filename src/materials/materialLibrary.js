// Central material registry. All surfaces share a small set of PBR materials so
// static geometry can be merged by material. Interior materials are cloned per
// lighting zone so each room samples its own reflection/irradiance probe.

import * as THREE from 'three';
import * as T from './proceduralTextures.js';

const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));

export class MaterialLibrary {
  constructor(renderer) {
    this.renderer = renderer;
    this.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    this.m = {};                  // name -> base material
    this.textures = {};           // name -> texture set (for reuse / disposal)
    this.zoned = new Map();       // `${uuid}|${zone}` -> clone
    this.zoneEnv = {};            // zone -> env texture
    this.patchers = [];           // functions(material) applied on creation (wetness etc.)
    this.zoneEnvIntensity = 1.5;
  }

  tex(name, set, tile) {
    const t = T.toTextureSet(set, { tile, anisotropy: this.anisotropy });
    this.textures[name] = t;
    return t;
  }

  // Clone texture set with another world tile size (shares GPU image data).
  retile(t, tile) {
    const rep = Array.isArray(tile) ? [1 / tile[0], 1 / tile[1]] : [1 / tile, 1 / tile];
    const out = {};
    for (const k of Object.keys(t)) { out[k] = t[k].clone(); out[k].repeat.set(rep[0], rep[1]); }
    return out;
  }

  std(name, t, params = {}, physical = false) {
    const { aoMap: aoFlag, aoMapIntensity, normalScale, ...rest } = params;
    const P = { color: 0xffffff, roughness: 1, metalness: 0, ...rest };
    if (t) {
      P.map = t.map; P.roughnessMap = t.orm; P.normalMap = t.normal;
      if (aoFlag !== false) { P.aoMap = t.orm; P.aoMapIntensity = aoMapIntensity ?? 1; }
      if (P.metalness > 0) P.metalnessMap = t.orm;
    }
    const mat = physical ? new THREE.MeshPhysicalMaterial(P) : new THREE.MeshStandardMaterial(P);
    if (normalScale !== undefined) mat.normalScale.set(normalScale, normalScale);
    mat.name = name;
    this.m[name] = mat;
    return mat;
  }

  async build(progress = () => {}) {
    const steps = [];
    const S = (label, fn) => steps.push([label, fn]);

    S('木地板', () => {
      const t = this.tex('oak', T.woodTexture(1024, { seed: 3, base: [194, 166, 136], dark: [146, 118, 92], rows: 12, cuts: 2, roughness: 0.46, variation: 0.1, gap: 1.0, gapDark: 0.62 }), 2.4);
      this.std('oak', t, { normalScale: 0.6 });
    });
    S('胡桃木', () => {
      const t = this.tex('walnut', T.woodTexture(1024, { seed: 7, base: [124, 104, 88], dark: [76, 62, 52], rows: 1, cuts: 0, gap: -1, ringFreq: 14, knots: false, roughness: 0.38, variation: 0.05 }), 1.2);
      this.std('walnut', t, { normalScale: 0.4 });
      const t2 = this.tex('oakLight', T.woodTexture(1024, { seed: 9, base: [204, 178, 142], dark: [160, 128, 92], rows: 1, cuts: 0, gap: -1, ringFreq: 11, knots: false, roughness: 0.45, variation: 0.04 }), 1.2);
      this.std('oakLight', t2, { normalScale: 0.4 });
    });
    S('石材磁磚', () => {
      const t = this.tex('stoneTile', T.tileTexture(1024, { seed: 41, cols: 2, rows: 2, base: [176, 169, 158], grout: [140, 135, 128], roughness: 0.32, veins: 0.18, spread: 0.04 }), 1.2);
      this.std('stoneTile', t, { normalScale: 0.5 });
      const b = this.tex('bathTile', T.tileTexture(1024, { seed: 43, cols: 2, rows: 2, base: [118, 116, 112], grout: [88, 86, 84], roughness: 0.42, veins: 0.12, spread: 0.06 }), 1.2);
      this.std('bathTile', b, { normalScale: 0.5 });
      const w = this.tex('bathWallTile', T.tileTexture(1024, { seed: 45, cols: 4, rows: 2, base: [226, 222, 214], grout: [196, 192, 186], groutW: 2, roughness: 0.12, veins: 0.05, spread: 0.025, stagger: false }), [1.2, 1.2]);
      this.std('bathWallTile', w, { normalScale: 0.6 });
    });
    S('牆面', () => {
      const t = this.tex('plaster', T.plasterTexture(512, { seed: 11, base: [236, 232, 224] }), 2.0);
      this.std('plaster', t, { normalScale: 0.1 });
      const c = this.retile(t, 2.5);
      this.std('ceiling', c, { color: 0xfbfaf8, normalScale: 0.05 });
      const s = this.tex('stucco', T.plasterTexture(1024, { seed: 13, base: [228, 226, 220], strength: 2.2, roughness: 0.92 }), 3.0);
      this.std('stucco', s, { normalScale: 0.8 });
      this.std('soffit', this.retile(t, 2.0), { color: 0xf0eee8, normalScale: 0.1 });
    });
    S('外牆木飾板', () => {
      const t = this.tex('cladding', T.woodTexture(1024, { seed: 17, base: [164, 126, 92], dark: [112, 82, 58], rows: 10, cuts: 0, gap: 2.2, ringFreq: 6, roughness: 0.62, variation: 0.12, knots: true }), [1.2, 1.2]);
      // Boards run vertically: rotate the texture 90 degrees.
      for (const k of ['map', 'orm', 'normal']) { t[k].rotation = Math.PI / 2; }
      this.std('cladding', t, { normalScale: 0.9 });
    });
    S('混凝土', () => {
      const t = this.tex('concrete', T.concreteTexture(1024, { seed: 21, base: [156, 153, 147], joints: true }), 4.0);
      this.std('concrete', t, { normalScale: 0.6 });
      const p = this.tex('plinth', T.concreteTexture(512, { seed: 23, base: [92, 90, 88], joints: false, roughness: 0.75 }), 2.0);
      this.std('plinth', p, { normalScale: 0.6 });
    });
    S('石板鋪面', () => {
      const t = this.tex('pavers', T.paverTexture(1024, { seed: 31, base: [148, 143, 134], rows: 6 }), 2.4);
      this.std('pavers', t, { normalScale: 0.8 });
      const c = this.tex('coping', T.paverTexture(512, { seed: 33, base: [196, 190, 178], rows: 3, grout: [150, 146, 140], spread: 0.06, roughness: 0.7 }), 1.8);
      this.std('coping', c, { normalScale: 0.6 });
    });
    S('戶外木平台', () => {
      const t = this.tex('deck', T.woodTexture(1024, { seed: 27, base: [146, 112, 82], dark: [96, 70, 50], rows: 20, cuts: 1, gap: 3.0, roughness: 0.7, weathered: 0.35 }), 2.8);
      this.std('deck', t, { normalScale: 0.9 });
      const f = this.retile(t, 2.0);
      for (const k of ['map', 'orm', 'normal']) { f[k].rotation = 0; }
      this.std('fenceWood', f, { normalScale: 0.9, color: 0xd8cfc4 });
    });
    S('草地', () => {
      const t = this.tex('grass', T.grassTexture(1024, { seed: 71 }), 3.0);
      this.std('grass', t, { normalScale: 0.7, aoMapIntensity: 0.6 });
    });
    S('大理石', () => {
      const t = this.tex('marble', T.marbleTexture(1024, { seed: 51 }), 1.6);
      this.std('marble', t, { normalScale: 0.2 }, true).clearcoat = 0.35;
      const d = this.tex('marbleDark', T.marbleTexture(512, { seed: 53, base: [52, 50, 50], vein: [150, 146, 140], roughness: 0.18 }), 1.2);
      this.std('marbleDark', d, { normalScale: 0.2 });
    });
    S('布料', () => {
      const t = this.tex('fabric', T.fabricTexture(512, { seed: 61, threads: 90 }), 0.35);
      const fab = (name, color, sheen = 0.5, sheenColor = 0xffffff) => {
        const m = this.std(name, t, { color, normalScale: 0.6, roughness: 1 }, true);
        m.sheen = sheen; m.sheenRoughness = 0.65; m.sheenColor = new THREE.Color(sheenColor);
        return m;
      };
      fab('fabricSofa', 0xb9ae9c, 0.6, 0xe8dfd0);
      fab('fabricCharcoal', 0x4a4a4c, 0.5, 0x8a8a8c);
      fab('fabricBlue', 0x5e6f7c, 0.6, 0x9fb2c0);
      fab('fabricRust', 0x9a5a3c, 0.6, 0xd4946c);
      fab('linen', 0xefece6, 0.35, 0xffffff);
      fab('fabricOlive', 0x77775a, 0.5, 0xb5b58c);
      const tc = this.retile(t, 0.6);
      const cur = this.std('curtain', tc, { color: 0xe6e0d6, normalScale: 0.4, side: THREE.DoubleSide }, true);
      cur.sheen = 0.4; cur.sheenRoughness = 0.7; cur.sheenColor = new THREE.Color(0xffffff);
    });
    S('石材飾牆', () => {
      const t = this.tex('ledgestone', T.ledgestoneTexture(1024, { seed: 81 }), 1.4);
      this.std('ledgestone', t, { normalScale: 1.1, color: 0xf2f0ec });
    });
    S('金屬', () => {
      const t = this.tex('brushed', T.brushedMetalTexture(512, { seed: 91 }), 0.5);
      this.std('steel', t, { color: 0xd6d8da, metalness: 1, normalScale: 0.15 });
      this.std('brass', t, { color: 0xd4a86a, metalness: 1, normalScale: 0.15 });
      this.std('chrome', null, { color: 0xf0f2f4, metalness: 1, roughness: 0.06 });
      this.std('blackMetal', null, { color: 0x1a1a1b, metalness: 0.0, roughness: 0.42 });
      this.std('frame', null, { color: 0x202022, metalness: 0.55, roughness: 0.38 });
      this.std('darkMetal', null, { color: 0x2c2d2f, metalness: 0.6, roughness: 0.45 });
    });
    S('陶瓷與玻璃', () => {
      const c = this.std('ceramic', null, { color: 0xf4f3f0, roughness: 0.1 }, true);
      c.clearcoat = 1; c.clearcoatRoughness = 0.05;
      this.std('ceramicMatte', null, { color: 0x3a3836, roughness: 0.75 });
      this.std('terracotta', null, { color: 0xa86a4c, roughness: 0.85 });
      this.std('blackGlass', null, { color: 0x050506, roughness: 0.04, metalness: 0.0 }, true).clearcoat = 1;
      this.std('mirror', null, { color: 0xeeeeee, metalness: 1, roughness: 0.015 });
      this.std('whiteLacquer', null, { color: 0xeeebe5, roughness: 0.32 }, true).clearcoat = 0.4;
      this.std('greigeLacquer', null, { color: 0x9d9488, roughness: 0.4 }, true).clearcoat = 0.3;
      this.std('whiteMatte', null, { color: 0xf0eeea, roughness: 0.55 });
      this.std('rubber', null, { color: 0x121212, roughness: 0.7 });
      this.std('leather', null, { color: 0x6b3f26, roughness: 0.55 }, true).clearcoat = 0.15;
      this.std('bookPages', null, { color: 0xe9e2d0, roughness: 0.9 });
      this.std('books', null, { vertexColors: true, roughness: 0.7 });
      const ice = this.std('frostedPanel', null, { color: 0xf2f2f0, roughness: 0.3, transparent: true, opacity: 0.35 });
      ice.userData.noZone = true;
    });
    S('地毯與畫作', () => {
      const r1 = T.toTextureSet(T.rugTexture(1024, { seed: 141, base: [200, 194, 182], accent: [170, 160, 146], pattern: 'lines' }), { tile: 1, anisotropy: this.anisotropy, wrap: false });
      this.std('rugLiving', r1, { normalScale: 0.8 });
      const r2 = T.toTextureSet(T.rugTexture(1024, { seed: 143, base: [112, 118, 122], accent: [168, 170, 166], pattern: 'grid' }), { tile: 1, anisotropy: this.anisotropy, wrap: false });
      this.std('rugBed', r2, { normalScale: 0.8 });
      const r3 = T.toTextureSet(T.rugTexture(512, { seed: 145, base: [180, 150, 120], accent: [120, 86, 62], pattern: 'lines', border: false }), { tile: 1, anisotropy: this.anisotropy, wrap: false });
      this.std('rugRunner', r3, { normalScale: 0.8 });
      const pal = [
        [[214, 205, 188], [176, 112, 78], [64, 78, 86], [198, 168, 112]],
        [[226, 222, 212], [92, 110, 120], [150, 160, 150], [60, 64, 70]],
        [[40, 44, 48], [190, 150, 100], [120, 70, 50], [210, 200, 180]],
      ];
      pal.forEach((p, i) => {
        const tex = T.canvasToTexture(T.paintingTexture(512, 384, { seed: 131 + i * 7, palette: p }), { srgb: true, wrap: false, anisotropy: this.anisotropy });
        this.std('art' + i, null, { map: tex, roughness: 0.85 });
      });
    });
    S('植栽與樹木', () => {
      const bark = this.tex('bark', T.barkTexture(512, { seed: 101 }), [0.8, 1.6]);
      this.std('bark', bark, { normalScale: 1.2 });
      const leafSet = T.leafTexture(1024, { seed: 111, hue: [70, 96, 42] });
      const lt = T.toTextureSet(leafSet, { tile: 1, anisotropy: this.anisotropy, wrap: false });
      const leaf = this.std('leaves', lt, { side: THREE.DoubleSide, alphaTest: 0.5, normalScale: 0.6, aoMap: false });
      leaf.shadowSide = THREE.DoubleSide;
      const hedgeSet = T.leafTexture(512, { seed: 113, hue: [56, 84, 40], count: 260, spread: 0.25 });
      const ht = T.toTextureSet(hedgeSet, { tile: 1, anisotropy: this.anisotropy, wrap: false });
      this.std('hedgeLeaves', ht, { side: THREE.DoubleSide, alphaTest: 0.5, normalScale: 0.6, aoMap: false });
      const plantSet = T.leafTexture(512, { seed: 117, hue: [52, 92, 46], count: 70, spread: 0.2 });
      const pt = T.toTextureSet(plantSet, { tile: 1, anisotropy: this.anisotropy, wrap: false });
      this.std('plantLeaves', pt, { side: THREE.DoubleSide, alphaTest: 0.5, normalScale: 0.6, aoMap: false });
      this.std('hedgeCore', null, { color: 0x2c3a20, roughness: 0.95 });
      const soil = this.tex('soil', T.soilTexture(256, { seed: 161 }), 0.8);
      this.std('soil', soil, {});
    });
    S('泳池磁磚', () => {
      const t = this.tex('poolTile', T.tileTexture(512, { seed: 47, cols: 8, rows: 8, base: [176, 206, 212], grout: [214, 222, 222], groutW: 1.5, roughness: 0.18, veins: 0.0, spread: 0.08 }), 0.8);
      this.std('poolTile', t, { normalScale: 0.5 });
    });
    S('屋頂與道路', () => {
      const g = this.tex('gravel', T.gravelTexture(512, { seed: 151 }), 1.5);
      // Roof tops cast sun shadows with their upper face: a 40 cm thick occluder
      // instead of the zero-thickness ceiling, so no light leaks at wall/ceiling joints.
      this.std('gravel', g, { normalScale: 0.8, shadowSide: THREE.FrontSide });
      const a = this.tex('asphalt', T.asphaltTexture(1024, { seed: 121 }), 4.0);
      this.std('asphalt', a, { normalScale: 0.7 });
      this.std('roadLine', null, { color: 0xd8d6cc, roughness: 0.7 });
      this.std('hills', null, { color: 0x4d5a3c, roughness: 1 });
    });

    for (let i = 0; i < steps.length; i++) {
      progress(steps[i][0], i / steps.length);
      await nextFrame();
      steps[i][1]();
    }
    progress('材質完成', 1);
    for (const mat of Object.values(this.m)) this.applyPatchers(mat);
    return this;
  }

  get(name) {
    const m = this.m[name];
    if (!m) throw new Error(`Unknown material "${name}"`);
    return m;
  }

  // Register a function that adapts materials (e.g. wet-surface shader patch).
  addPatcher(fn) { this.patchers.push(fn); }
  applyPatchers(mat) { for (const p of this.patchers) p(mat); }

  register(name, mat) {
    mat.name = mat.name || name;
    this.m[name] = mat;
    return mat;
  }

  // Probe-lit clone of `mat` for an interior zone. Exterior returns the base.
  zonedMaterial(mat, zone) {
    if (!zone || zone === 'ext' || mat.userData.noZone || !mat.isMeshStandardMaterial) return mat;
    const key = mat.uuid + '|' + zone;
    let c = this.zoned.get(key);
    if (!c) {
      c = mat.clone();
      c.name = mat.name + '@' + zone;
      c.onBeforeCompile = mat.onBeforeCompile;
      c.customProgramCacheKey = mat.customProgramCacheKey;
      if (mat.wetConfig) c.wetConfig = mat.wetConfig;
      c.userData.zone = zone;
      c.envMap = this.zoneEnv[zone] || null;
      // probes hold one captured bounce (plus feedback); a mild boost stands in for the rest
      c.envMapIntensity = this.zoneEnvIntensity;
      this.zoned.set(key, c);
    }
    return c;
  }

  setZoneEnv(zone, texture) {
    this.zoneEnv[zone] = texture;
    for (const c of this.zoned.values()) if (c.userData.zone === zone) { c.envMap = texture; c.needsUpdate = true; }
  }

  // Temporarily scale env lighting of all probe-lit clones (used during capture).
  setZoneEnvIntensity(v) {
    for (const c of this.zoned.values()) c.envMapIntensity = v;
  }

  allMaterials() {
    return [...Object.values(this.m), ...this.zoned.values()];
  }
}
