// Persistent user settings + the pause menu bindings.

import { FloorPlan, SPAWNS } from './floorplan.js';

const KEY = 'house-walkthrough-settings-v1';
const DEFAULTS = {
  quality: null,          // chosen from GPU heuristics when null
  sensitivity: 1.0,
  fov: 70,
  exposureComp: 0,
  rainDensity: 0.75,
  headBob: true,
  showStats: false,
  showMap: false,
};

export function loadSettings() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { s = {}; }
  return { ...DEFAULTS, ...s };
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* private mode: ignore */ }
}

// Guess a sensible default quality from the GPU string.
export function guessQuality(gpu) {
  const r = (gpu.renderer || '').toLowerCase();
  if (/swiftshader|llvmpipe|software|basic render/.test(r)) return 'low';
  if (/intel|uhd|iris|mali|adreno|powervr|apple m1(?!\s*(pro|max|ultra))/.test(r)) return 'low';
  if (/rtx|radeon rx [5-9]|rx 6|rx 7|rx 9|apple m[1-4] (pro|max|ultra)|arc a7/.test(r)) return 'high';
  return 'medium';
}

const $ = (id) => document.getElementById(id);

export { SPAWNS };

export class PauseMenu {
  constructor(app) {
    this.app = app;
    this.el = $('pause');
    const s = app.settings;

    const seg = (id, get, set) => {
      const el = $(id);
      const sync = () => el.querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.v === get()));
      el.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        set(b.dataset.v); sync();
      });
      return sync;
    };
    const range = (id, key, fmt, apply) => {
      const el = $(id), out = el.parentElement.querySelector('output');
      el.value = s[key];
      out.textContent = fmt(+el.value);
      el.addEventListener('input', () => {
        s[key] = +el.value; out.textContent = fmt(s[key]); apply?.(s[key]); saveSettings(s);
      });
    };
    this.syncers = [
      seg('seg-weather', () => app.env.weather, v => app.setWeather(v)),
      seg('seg-time', () => app.env.time, v => app.setTime(v)),
      seg('seg-quality', () => s.quality, v => app.setQuality(v)),
    ];
    range('rng-rain', 'rainDensity', v => Math.round(v * 100) + '%', v => app.weather?.setDensity(v));
    range('rng-exposure', 'exposureComp', v => (v > 0 ? '+' : '') + v.toFixed(1) + ' EV', v => app.post?.setExposureComp(v));
    range('rng-sens', 'sensitivity', v => v.toFixed(1) + '×');
    range('rng-fov', 'fov', v => v + '°', v => app.setFov(v));
    const chk = (id, key, apply) => {
      const el = $(id);
      el.checked = !!s[key];
      el.addEventListener('change', () => { s[key] = el.checked; apply?.(el.checked); saveSettings(s); });
    };
    chk('chk-bob', 'headBob');
    chk('chk-stats', 'showStats', v => app.hud.showStats(v));
    chk('chk-map', 'showMap', v => app.hud.showMap(v));
    this.plan = new FloorPlan($('plan'), { interactive: true, onPick: (id) => app.goTo(id) });

    $('btn-resume').addEventListener('click', (e) => { e.stopPropagation(); app.resume(); });
    $('btn-reset').addEventListener('click', () => { app.resetPlayer(); app.resume(); });
    $('btn-lights-on').addEventListener('click', () => { app.lighting.setAll(true); this.renderLights(); });
    $('btn-lights-off').addEventListener('click', () => { app.lighting.setAll(false); this.renderLights(); });
    // Clicking the backdrop (outside the panel) resumes.
    this.el.addEventListener('click', (e) => { if (e.target === this.el) app.resume(); });
    this.lightList = $('light-list');
    this.lightList.addEventListener('click', (e) => {
      const item = e.target.closest('.light-item');
      if (!item) return;
      app.lighting.toggleGroup(item.dataset.id);
      this.renderLights();
    });
  }

  renderLights() {
    const groups = this.app.lighting.groups.filter(g => g.listed);
    this.lightList.innerHTML = groups.map(g =>
      `<div class="light-item ${g.on ? 'on' : ''}" data-id="${g.id}"><span>${g.name}</span><span class="dot"></span></div>`).join('');
  }

  show(v) {
    this.el.classList.toggle('hidden', !v);
    this.visible = v;
    if (v) {
      this.syncers.forEach(f => f()); this.renderLights();
      $('chk-map').checked = !!this.app.settings.showMap;
      this.plan.resize(); this.plan.draw(this.app.player);
    }
  }

  // Redraw the plan while the menu is open (hover highlight).
  tick() { if (this.visible) this.plan.draw(this.app.player); }
}
