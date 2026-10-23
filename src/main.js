// Application bootstrap and main loop.

import * as THREE from 'three';
import { checkWebGL2, createRenderer, InitError } from './rendering/renderer.js';
import { MaterialLibrary } from './materials/materialLibrary.js';
import { StaticBuilder } from './scene/builder.js';
import { createHouse } from './scene/createHouse.js';
import { createInterior } from './scene/createInterior.js';
import { createExterior } from './scene/createExterior.js';
import { EnvironmentSystem, TIME_LABEL, WEATHER_LABEL } from './scene/environment.js';
import { zoneAt, areaNameAt } from './scene/layout.js';
import { CollisionWorld } from './player/collision.js';
import { PlayerController } from './player/controller.js';
import { InteractionManager } from './interaction/interactionManager.js';
import { AnimationHub } from './interaction/animator.js';
import { LightingSystem } from './interaction/lighting.js';
import { createGlassMaterials, setGlassTransmission } from './weather/glassDroplets.js';
import { WetSurfaces } from './weather/wetSurface.js';
import { RainSystem } from './weather/rain.js';
import { WeatherSystem } from './weather/weatherSystem.js';
import { PostProcessing } from './rendering/postprocessing.js';
import { ProbeSystem } from './rendering/probes.js';
import { PlanarReflection } from './rendering/planarReflection.js';
import { QUALITY, QUALITY_LABEL } from './rendering/quality.js';
import { AudioSystem } from './core/audio.js';
import { HUD } from './ui/hud.js';
import { loadSettings, saveSettings, guessQuality, PauseMenu, SPAWNS } from './ui/settings.js';
import { LAYER } from './core/layers.js';

const START = { x: 8.6, z: 15.5, yaw: 0.12, pitch: 0.02 };
const nextFrame = () => new Promise(r => requestAnimationFrame(() => r()));
const $ = (id) => document.getElementById(id);

class App {
  async init() {
    const loadBar = $('load-bar'), loadLabel = $('load-label');
    const tInit = performance.now();
    this.timings = [];
    const progress = (label, f) => {
      loadLabel.textContent = label; loadBar.style.width = Math.round(f * 100) + '%';
      this.timings.push([label, Math.round(performance.now() - tInit)]);
    };

    progress('檢查 WebGL2…', 0.02);
    this.gpu = checkWebGL2();
    this.settings = loadSettings();
    if (!this.settings.quality) this.settings.quality = guessQuality(this.gpu);
    $('gpu-info').textContent = this.gpu.renderer ? `GPU：${this.gpu.renderer}` : '';
    if (window.matchMedia?.('(pointer: coarse)').matches && !window.matchMedia('(any-pointer: fine)').matches) $('touch-note').classList.remove('hidden');

    const canvas = $('viewport');
    this.renderer = createRenderer(canvas);
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, window.innerWidth / window.innerHeight, 0.05, 900);
    this.camera.layers.enable(LAYER.MAIN_ONLY);
    this.camera.layers.enable(LAYER.GROUND);
    this.timer = new THREE.Timer();
    this.timer.connect(document);
    this.globals = {
      uTime: { value: 0 },
      uWetness: { value: 0 },
      uRain: { value: 0 },
      uGlassRain: { value: 0 },
      uGlassMist: { value: 0 },
      uWind: { value: 0.25 },
    };
    this.hud = new HUD();
    this.collision = new CollisionWorld(2);
    this.hub = new AnimationHub(this.scene);
    this.audio = new AudioSystem();
    this.shadowsDirty = true;
    this.doors = [];

    progress('生成程式化材質…', 0.05);
    this.materials = new MaterialLibrary(this.renderer);
    this.wet = new WetSurfaces(this.globals);
    this.materials.addPatcher(m => this.wet.patch(m));
    await this.materials.build((label, f) => progress('生成材質：' + label, 0.05 + f * 0.45));
    this.glass = createGlassMaterials(this.globals);

    // Shared context handed to scene builders and systems.
    const ctx = this.ctx = {
      app: this, scene: this.scene, renderer: this.renderer, camera: this.camera,
      materials: this.materials, glass: this.glass, collision: this.collision, hub: this.hub,
      globals: this.globals, audio: this.audio, doors: this.doors, updaters: [],
      markShadowsDirty: () => { this.shadowsDirty = true; },
      zoneOf: (x, y, z) => {
        for (const [dx, dz] of [[0, 0], [0, 0.3], [0, -0.3], [0.3, 0], [-0.3, 0]]) {
          const zn = zoneAt(x + dx, y, z + dz);
          if (zn !== 'ext') return zn;
        }
        return 'ext';
      },
      onLightsChanged: (g) => { this.probes?.requestZone(g.zone, 0.35); this.shadowsDirty = true; },
      onDoorState: () => { this.probes?.requestAll(0.1); },
      onWindowState: () => {},
      onEnvironmentChanged: (final) => { this.probes?.requestAll(final ? 0 : 0.05); this.shadowsDirty = true; },
    };

    progress('建立環境…', 0.52);
    await nextFrame();
    this.env = new EnvironmentSystem(ctx);
    ctx.env = this.env;
    this.interaction = new InteractionManager({ camera: this.camera, collision: this.collision, hud: this.hud });
    ctx.interaction = this.interaction;
    this.lighting = new LightingSystem(ctx);
    ctx.lighting = this.lighting;
    this.player = new PlayerController({ camera: this.camera, dom: canvas, collision: this.collision, settings: this.settings });
    ctx.player = this.player;

    progress('建立房屋結構…', 0.56);
    await nextFrame();
    this.builder = new StaticBuilder({ materials: this.materials, collision: this.collision });
    ctx.builder = this.builder;
    createHouse(ctx);
    progress('擺放家具與燈具…', 0.64);
    await nextFrame();
    createInterior(ctx);
    progress('建立庭院與景觀…', 0.72);
    await nextFrame();
    createExterior(ctx);
    this.staticRoot = new THREE.Group();
    this.staticRoot.name = 'static';
    this.scene.add(this.staticRoot);
    this.builder.finalize(this.staticRoot);
    this.scene.updateMatrixWorld(true);

    progress('建立天氣系統…', 0.78);
    await nextFrame();
    this.reflection = new PlanarReflection(this.renderer, this.scene, this.camera, 0.0);
    this.wet.setReflection(this.reflection);
    this.rain = new RainSystem(ctx);
    this.wet.setOcclusion(this.rain.uniforms);
    this.weather = new WeatherSystem(ctx, { rain: this.rain, wet: this.wet, env: this.env });
    this.weather.setDensity(this.settings.rainDensity);

    progress('建立後處理…', 0.84);
    await nextFrame();
    this.post = new PostProcessing(this.renderer, this.scene, this.camera);
    this.post.setExposureComp(this.settings.exposureComp);
    this.probes = new ProbeSystem(ctx);

    progress('套用畫質設定…', 0.9);
    await nextFrame();
    this.applyQuality(this.settings.quality, true);

    progress('預先編譯著色器…', 0.93);
    await nextFrame();
    this.resetPlayer();
    // Compile everything up front, including objects that start hidden (rain, flames,
    // screens, water) so the first toggle does not stall on a shader compile.
    const hidden = [];
    this.scene.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    // Bind the HDR target first: program variants depend on the output target (linear
    // HDR here vs sRGB for the screen), and the scene is only ever drawn off-screen.
    this.renderer.setRenderTarget(this.post.composer.readBuffer);
    await this.renderer.compileAsync(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    for (const o of hidden) o.visible = false;
    this.probes.captureAll(2);
    this.rain.bakeOcclusion();

    this.pause = new PauseMenu(this);
    this.bindEvents();
    this.onResize();
    progress('完成', 1);
    window.__appReady = true;
    $('start-quality').value = this.settings.quality;
    $('loading').classList.add('hidden');
    $('start').classList.remove('hidden');
    this.started = false;
    this.renderer.setAnimationLoop((t) => this.frame(t));
    // The init-time captures ran before any shadow map existed; refresh once frames are rendering.
    this.probes.requestAll(0.4);
    window.__app = this; // debug / automated test hook
  }

  bindEvents() {
    window.addEventListener('resize', () => this.onResize());
    $('btn-start').addEventListener('click', () => {
      const q = $('start-quality').value;
      if (q !== this.settings.quality) this.setQuality(q);
      this.start();
    });
    $('viewport').addEventListener('click', () => { if (this.started && !this.player.locked) this.resume(); });
    this.player.on('lock', () => {
      this.pause.show(false);
      this.hud.show(true);
      this.player.enabled = true;
      this.interaction.enabled = true;
      this.audio.resume();
    });
    this.player.on('unlock', (err) => {
      this.player.enabled = false;
      this.interaction.enabled = false;
      if (!this.started) return;
      this.pause.show(true);
      if (err) this.hud.toast('無法鎖定滑鼠，請再點擊一次畫面');
    });
    window.addEventListener('keydown', (e) => {
      if (!this.started || !(this.player.locked || this.debugInput)) return;
      if (e.repeat) return;
      switch (e.code) {
        case 'KeyF': this.interaction.primary(this.ctx); break;
        case 'KeyE': this.interaction.secondary(this.ctx); break;
        case 'KeyR': this.setWeather(this.env.weather === 'rain' ? 'clear' : 'rain'); break;
        case 'KeyT': this.setTime(this.env.cycleTime()); break;
        case 'KeyL': { const on = !this.lighting.anyOn(); this.lighting.setAll(on); this.hud.toast(on ? '全屋燈光：開啟' : '全屋燈光：關閉'); break; }
        case 'KeyB': this.resetPlayer(); this.hud.toast('已回到起點'); break;
        case 'KeyP': this.settings.showStats = !this.settings.showStats; this.hud.showStats(this.settings.showStats); saveSettings(this.settings); break;
        case 'KeyM': this.settings.showMap = !this.settings.showMap; this.hud.showMap(this.settings.showMap); saveSettings(this.settings); break;
        default: break;
      }
    });
    window.addEventListener('app-fatal', (e) => showError(e.detail.title, e.detail.detail));
  }

  start() {
    this.started = true;
    $('start').classList.add('hidden');
    this.hud.show(true);
    this.hud.showStats(this.settings.showStats);
    this.hud.showMap(this.settings.showMap);
    this.hud.fadeHint();
    this.player.lock();
  }

  resume() { this.player.lock(); }

  // Enter the scene without pointer lock (automated tests / headless browsers).
  debugStart() {
    this.started = true;
    $('start').classList.add('hidden');
    this.pause.show(false);
    this.hud.show(true);
    this.player.enabled = 'debug';   // keyboard works without pointer lock
    this.interaction.enabled = true;
    this.debugInput = true;
  }

  resetPlayer() { this.player.teleport(START.x, START.z, START.yaw, START.pitch); }

  // Floor plan "go to room".
  goTo(id) {
    const s = SPAWNS[id];
    if (!s) return;
    this.player.teleport(s[0], s[1], s[2], -0.05);
    this.hud.toast('已前往：' + areaNameAt(s[0], s[1]));
    this.pause.show(false);
    this.resume();
  }

  setWeather(w) {
    this.env.setWeather(w);
    this.weather.setTarget(w === 'rain');
    this.hud.toast('天氣：' + WEATHER_LABEL[w]);
  }

  setTime(t) {
    this.env.setTime(t);
    // Exterior lights follow the time of day; interior lights are left as the visitor set them,
    // except at night when we switch the main rooms on if everything is dark.
    this.lighting.set('exterior', t !== 'day');
    if (t !== 'day') for (const id of ['living', 'kitchen', 'dining', 'hall', 'livingLamp']) this.lighting.set(id, true);
    this.hud.toast('時段：' + TIME_LABEL[t]);
  }

  setQuality(q) {
    if (!QUALITY[q]) return;
    this.settings.quality = q;
    saveSettings(this.settings);
    this.applyQuality(q);
    this.hud.toast('畫質：' + QUALITY_LABEL[q]);
  }

  applyQuality(q, initial = false) {
    const Q = QUALITY[q];
    this.quality = Q;
    const dpr = Math.min(window.devicePixelRatio || 1, Q.maxPixelRatio);
    this.renderer.setPixelRatio(dpr);
    this.renderer.transmissionResolutionScale = Q.transmissionScale;
    setGlassTransmission(this.glass, Q.transmission);
    // sun shadow map
    const sun = this.env.sun;
    if (sun.shadow.mapSize.x !== Q.shadowMap) {
      sun.shadow.mapSize.set(Q.shadowMap, Q.shadowMap);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
    sun.shadow.radius = Q.shadowRadius;
    // Interior spot shadows: the caster count never changes (that would recompile every
    // shader); quality only picks the map resolution. Maps re-render only on changes.
    for (const g of this.lighting.groups) {
      for (const { light } of g.lights) {
        if (!light.userData.shadowCandidate) continue;
        light.castShadow = true;
        if (light.shadow.mapSize.x !== Q.interiorShadowMap) {
          light.shadow.mapSize.set(Q.interiorShadowMap, Q.interiorShadowMap);
          if (light.shadow.map) { light.shadow.map.dispose(); light.shadow.map = null; }
        }
      }
    }
    this.post.applyQuality(Q);
    this.reflection.setQuality(Q.reflection);
    this.rain.setQuality(Q);
    this.shadowsDirty = true;
    if (!initial) this.onResize();
  }

  setFov(v) { this.camera.fov = v; this.camera.updateProjectionMatrix(); }

  onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, this.renderer.getPixelRatio());
    this.reflection.setSize(w * this.renderer.getPixelRatio(), h * this.renderer.getPixelRatio());
  }

  frame(time) {
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), 0.05);
    this.globals.uTime.value += dt;
    const t0 = performance.now();

    this.player.update(dt);
    this.hub.update(dt);
    this.lighting.update(dt);
    this.env.update(dt);
    this.weather.update(dt);
    for (const u of this.ctx.updaters) u(dt, this.globals.uTime.value);
    this.interaction.update();
    this.updateHUD(dt);

    // shadows only re-render when something that casts them changed
    if (this.shadowsDirty) {
      this.env.sun.shadow.needsUpdate = true;
      for (const g of this.lighting.groups) for (const { light } of g.lights) if (light.castShadow) light.shadow.needsUpdate = true;
      this.shadowsDirty = false;
    }
    this.renderer.info.reset();
    this.probes.update(dt);
    // planar reflection: wet ground, or the pool (its water uses the same mirror plane)
    const cp = this.camera.position;
    const nearPool = Math.hypot(cp.x + 6, cp.z + 16.5) < 32;
    this.reflection.update(this.weather.reflectionNeeded || nearPool);
    this.post.render(dt);
    this._cpuMs = performance.now() - t0;
  }

  updateHUD(dt) {
    const p = this.player.position;
    this.hud.setRoom(areaNameAt(p.x, p.z));
    const subKey = this.env.time + this.env.weather + this.settings.quality;
    if (subKey !== this._subKey) {
      this._subKey = subKey;
      this.hud.setSub(`${TIME_LABEL[this.env.time]} · ${WEATHER_LABEL[this.env.weather]}`);
      this.hud.setChips([QUALITY_LABEL[this.settings.quality] + '畫質']);
    }
    this._fpsAcc = (this._fpsAcc || 0) + dt; this._fpsN = (this._fpsN || 0) + 1;
    this._mapAcc = (this._mapAcc || 0) + dt;
    if (this._mapAcc > 0.1) { this._mapAcc = 0; this.hud.drawMap(this.player); this.pause?.tick(); }
    if (this._fpsAcc > 0.5) {
      this.fps = this._fpsN / this._fpsAcc; this._fpsAcc = 0; this._fpsN = 0;
      if (this.settings.showStats) {
        const i = this.renderer.info;
        this.hud.setStats([
          `FPS        ${this.fps.toFixed(0)}`,
          `CPU 幀時間  ${this._cpuMs.toFixed(1)} ms`,
          `Draw calls ${i.render.calls}`,
          `三角形      ${(i.render.triangles / 1000).toFixed(0)} k`,
          `幾何 / 貼圖 ${i.memory.geometries} / ${i.memory.textures}`,
          `著色器程式  ${i.programs?.length ?? '-'}`,
          `畫質        ${QUALITY_LABEL[this.settings.quality]}`,
          `位置        ${p.x.toFixed(1)}, ${p.z.toFixed(1)}`,
        ].join('\n'));
      }
    }
  }
}

function showError(title, detail, trace = '') {
  if (window.__fail) window.__fail(title, detail);
  $('error-trace').textContent = trace;
}

const app = new App();
app.init().catch((e) => {
  console.error(e);
  if (e instanceof InitError) showError(e.title, e.detail);
  else showError('初始化失敗', String(e && e.message || e), String(e && e.stack || ''));
});
