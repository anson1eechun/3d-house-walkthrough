// Post-processing chain (EffectComposer):
//   ScenePass (HDR, optional MSAA)  -> GTAO -> Exposure (GPU auto exposure)
//   -> UnrealBloom (on exposed HDR, so the threshold means "brighter than white")
//   -> Final (ACES filmic, grading, vignette, sRGB) -> FXAA / SMAA (when MSAA is off)

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { LAYER } from '../core/layers.js';
import * as S from './shaders/post.glsl.js';

const mat = (fragmentShader, uniforms) => new THREE.ShaderMaterial({
  uniforms, vertexShader: S.fsVertex, fragmentShader, depthTest: false, depthWrite: false,
});

class ScenePass extends Pass {
  constructor(scene, camera) {
    super();
    this.scene = scene; this.camera = camera;
    this.needsSwap = false;
    this.samples = 0;
    this.msaaRT = null;
    this.copy = new FullScreenQuad(mat(S.copyFragment, { tDiffuse: { value: null } }));
    this.w = 1; this.h = 1;
  }
  setSamples(n) {
    this.samples = n;
    if (this.msaaRT) { this.msaaRT.dispose(); this.msaaRT = null; }
    if (n > 0) {
      this.msaaRT = new THREE.WebGLRenderTarget(this.w, this.h, { type: THREE.HalfFloatType, samples: n });
      this.msaaRT.texture.name = 'scene.msaa';
    }
  }
  setSize(w, h) { this.w = w; this.h = h; this.msaaRT?.setSize(w, h); }
  render(renderer, writeBuffer, readBuffer) {
    const target = this.msaaRT || readBuffer;
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(this.scene, this.camera);
    if (this.msaaRT) {
      // resolving happens when the MSAA target is unbound; copy the resolved texture on
      this.copy.material.uniforms.tDiffuse.value = this.msaaRT.texture;
      renderer.setRenderTarget(readBuffer);
      this.copy.render(renderer);
    }
  }
  dispose() { this.msaaRT?.dispose(); this.copy.dispose(); }
}

// GTAO that ignores glass, rain and other main-only overlays in its normal pass, and
// alpha-tested foliage (the override normal material would draw leaf cards as solid quads).
class HouseGTAOPass extends GTAOPass {
  constructor(...args) {
    super(...args);
    this.scale = 1;
  }
  setSize(w, h) { this._fullW = w; this._fullH = h; super.setSize(Math.max(1, Math.round(w * this.scale)), Math.max(1, Math.round(h * this.scale))); }
  setScale(s) { this.scale = s; if (this._fullW) this.setSize(this._fullW, this._fullH); }
  _overrideVisibility() {
    const cache = this._visibilityCache;
    const mask = 1 << LAYER.MAIN_ONLY;
    this.scene.traverse((o) => {
      if (!o.visible) return;
      const foliage = o.material && o.material.alphaTest > 0;
      if (foliage || o.isPoints || o.isLine || o.isLine2 || o.userData.isSky || ((o.layers.mask & mask) && !(o.layers.mask & 1) && !(o.layers.mask & (1 << LAYER.GROUND)))) {
        o.visible = false;
        cache.push(o);
      }
    });
  }
}

class ExposurePass extends Pass {
  constructor() {
    super();
    const rt = (w, h) => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    this.lumRT = rt(64, 64);
    this.r16 = rt(16, 16);
    this.r4 = rt(4, 4);
    this.r1 = rt(1, 1);
    this.adapt = [rt(1, 1), rt(1, 1)];
    this.lumQuad = new FullScreenQuad(mat(S.lumFragment, { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2(1 / 256, 1 / 256) } }));
    this.reduceQuad = new FullScreenQuad(mat(S.reduceFragment, { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() } }));
    this.adaptQuad = new FullScreenQuad(mat(S.adaptFragment, { tCurrent: { value: null }, tPrevious: { value: null }, uDt: { value: 0 }, uReset: { value: 1 } }));
    this.applyQuad = new FullScreenQuad(mat(S.exposureFragment, {
      tDiffuse: { value: null }, tAdapted: { value: null }, uAuto: { value: 1 }, uManual: { value: 1 },
      uComp: { value: 0 }, uKey: { value: 0.15 }, uRange: { value: new THREE.Vector2(0.3, 9.0) }, uAdapt: { value: 0.88 },
    }));
    this.flip = 0;
    this.dt = 0.016;
    this.auto = true;
    this.fold = false;      // when true only metering runs; FinalPass applies the exposure
  }
  render(renderer, writeBuffer, readBuffer) {
    const u = this.applyQuad.material.uniforms;
    if (this.auto) {
      this.lumQuad.material.uniforms.tDiffuse.value = readBuffer.texture;
      renderer.setRenderTarget(this.lumRT); this.lumQuad.render(renderer);
      const red = (src, dst) => {
        this.reduceQuad.material.uniforms.tDiffuse.value = src.texture;
        this.reduceQuad.material.uniforms.uTexel.value.set(1 / src.width, 1 / src.height);
        renderer.setRenderTarget(dst); this.reduceQuad.render(renderer);
      };
      red(this.lumRT, this.r16); red(this.r16, this.r4); red(this.r4, this.r1);
      const prev = this.adapt[this.flip], next = this.adapt[1 - this.flip];
      const au = this.adaptQuad.material.uniforms;
      au.tCurrent.value = this.r1.texture; au.tPrevious.value = prev.texture; au.uDt.value = this.dt;
      renderer.setRenderTarget(next); this.adaptQuad.render(renderer);
      au.uReset.value = 0;
      this.flip = 1 - this.flip;
      u.tAdapted.value = next.texture;
    }
    u.uAuto.value = this.auto ? 1 : 0;
    this.needsSwap = !this.fold;
    if (this.fold) return;
    u.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.applyQuad.render(renderer);
  }
  reset() { this.adaptQuad.material.uniforms.uReset.value = 1; }

  // Debug: current adapted average luminance and the resulting exposure.
  read(renderer) {
    const buf = new Uint16Array(4);
    renderer.readRenderTargetPixels(this.adapt[this.flip], 0, 0, 1, 1, buf);
    const avg = Math.exp(THREE.DataUtils.fromHalfFloat(buf[0]));
    const u = this.applyQuad.material.uniforms;
    const k = u.uAdapt.value, key = u.uKey.value;
    return { avgLum: avg, exposure: Math.min(u.uRange.value.y, Math.max(u.uRange.value.x, key / (Math.pow(key, 1 - k) * Math.pow(avg, k)))) };
  }
}

class FinalPass extends Pass {
  constructor(exposure) {
    super();
    const eu = exposure.applyQuad.material.uniforms;
    this.exposure = exposure;
    this.quad = new FullScreenQuad(mat(S.finalFragment, {
      tAdapted: eu.tAdapted, uFoldExposure: { value: 0 }, uKey: eu.uKey, uRange: eu.uRange, uAdapt: eu.uAdapt, uComp: eu.uComp,
      tDiffuse: { value: null }, uSaturation: { value: 1.0 }, uContrast: { value: 1.05 },
      uLift: { value: new THREE.Vector3(0.006, 0.006, 0.009) }, uGain: { value: new THREE.Vector3(0.99, 1.0, 1.01) },
      uVignette: { value: 0.22 }, uResolution: { value: new THREE.Vector2(1, 1) },
    }));
  }
  setSize(w, h) { this.quad.material.uniforms.uResolution.value.set(w, h); }
  render(renderer, writeBuffer, readBuffer) {
    this.quad.material.uniforms.tDiffuse.value = readBuffer.texture;
    this.quad.material.uniforms.uFoldExposure.value = this.exposure.fold ? 1 : 0;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}

export class PostProcessing {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene; this.camera = camera;
    const size = renderer.getSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
    this.composer = new EffectComposer(renderer, rt);
    this.scenePass = new ScenePass(scene, camera);
    this.gtao = new HouseGTAOPass(scene, camera, size.x, size.y);
    this.gtao.blendIntensity = 0.8;
    this.gtao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.6, thickness: 1.2, scale: 1.0, samples: 16, distanceFallOff: 1.0 });
    this.gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 16 });
    this.exposure = new ExposurePass();
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.22, 0.42, 2.6);
    this.bloom.highPassUniforms.smoothWidth.value = 0.8;
    this.final = new FinalPass(this.exposure);
    this.fxaa = new FXAAPass();
    this.smaa = new SMAAPass();
    for (const p of [this.scenePass, this.gtao, this.exposure, this.bloom, this.final, this.fxaa, this.smaa]) this.composer.addPass(p);
  }

  applyQuality(Q) {
    if (this.scenePass.samples !== Q.msaa) this.scenePass.setSamples(Q.msaa);
    this.gtao.enabled = Q.ao;
    this.gtao.setScale(Q.aoScale);
    this.gtao.updateGtaoMaterial({ samples: Q.aoScale < 1 ? 12 : 16 });
    this.bloom.enabled = Q.bloom;
    this.fxaa.enabled = Q.aa === 'fxaa';
    this.smaa.enabled = Q.aa === 'smaa';
    this.exposure.auto = true;
    this.exposure.fold = !Q.bloom;
    this.exposure.reset();
  }

  setExposureComp(ev) { this.exposure.applyQuad.material.uniforms.uComp.value = ev; }

  setSize(w, h, dpr) {
    this.composer.setPixelRatio(dpr);
    this.composer.setSize(w, h);
  }

  render(dt) {
    this.exposure.dt = dt;
    this.composer.render(dt);
  }
}
