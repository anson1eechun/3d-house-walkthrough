// Room light groups. A group owns real three.js lights and the emissive
// materials of its fixtures; switching fades both together. Lights are never
// removed or hidden (that would change the shader light count and recompile
// every material) - "off" is intensity 0. Each change notifies the renderer so
// the room's reflection probe and shadows are refreshed.

import * as THREE from 'three';
import { Interactable } from './interactionManager.js';
import { boxProjectUV } from '../scene/builder.js';

const LEVELS = [1, 0.55, 0.25];

export class LightGroup {
  constructor(id, name, { zone = null, listed = true, on = false } = {}) {
    this.id = id; this.name = name; this.zone = zone; this.listed = listed;
    this.on = on;
    this.levelIndex = 0;
    this.current = on ? 1 : 0;
    this.lights = [];      // { light, base }
    this.emissives = [];   // { material, base }
    this.switches = [];
    this.listeners = [];
  }
  get level() { return LEVELS[this.levelIndex]; }
  get target() { return this.on ? this.level : 0; }
  apply() {
    for (const l of this.lights) l.light.intensity = l.base * this.current;
    for (const e of this.emissives) e.material.emissiveIntensity = e.base * this.current;
  }
}

export class LightingSystem {
  constructor(ctx) {
    this.ctx = ctx;
    this.groups = [];
    this.byId = new Map();
    this._dirty = new Set();
  }

  group(id, name, opts) {
    const g = new LightGroup(id, name, opts);
    this.groups.push(g);
    this.byId.set(id, g);
    return g;
  }

  addLight(group, light, base = light.intensity) {
    group.lights.push({ light, base });
    light.intensity = base * group.current;
    return light;
  }

  // Unique emissive material for a group's fixtures (never zone-cloned so the
  // group can drive it directly).
  emissive(group, { color = 0xfff1dc, intensity = 8, base = 0xf6f2ea, roughness = 0.4, transmission = 0, physical = false } = {}) {
    const P = { color: base, emissive: new THREE.Color(color), emissiveIntensity: 0, roughness };
    const m = physical ? new THREE.MeshPhysicalMaterial({ ...P, transmission }) : new THREE.MeshStandardMaterial(P);
    m.name = `emissive:${group.id}`;
    m.userData.noZone = true;
    group.emissives.push({ material: m, base: intensity });
    m.emissiveIntensity = intensity * group.current;
    return m;
  }

  set(group, on) {
    if (typeof group === 'string') group = this.byId.get(group);
    if (!group || group.on === on) return;
    group.on = on;
    this._dirty.add(group);
    for (const sw of group.switches) sw.sync();
    this.ctx.onLightsChanged?.(group);
  }

  toggleGroup(id) { const g = this.byId.get(id); if (g) this.set(g, !g.on); return g; }

  cycleLevel(group) {
    if (!group.on) { this.set(group, true); return group.level; }
    group.levelIndex = (group.levelIndex + 1) % LEVELS.length;
    this._dirty.add(group);
    this.ctx.onLightsChanged?.(group);
    return group.level;
  }

  setAll(on) { for (const g of this.groups) if (g.listed) this.set(g, on); }
  anyOn() { return this.groups.some(g => g.listed && g.on); }

  update(dt) {
    const k = 1 - Math.exp(-dt * 10);
    for (const g of this.groups) {
      const t = g.target;
      if (Math.abs(g.current - t) > 1e-3) {
        g.current += (t - g.current) * k;
        if (Math.abs(g.current - t) < 2e-3) g.current = t;
        g.apply();
        this.ctx.markShadowsDirty?.();
      }
    }
  }

  // ------------------------------------------------ interactables ----

  // Wall switch plate. pos: world position on the wall surface, rotY: facing.
  addSwitch(group, pos, rotY) {
    const M = this.ctx.materials;
    const root = new THREE.Group();
    root.position.copy(pos);
    root.rotation.y = rotY;
    const plate = new THREE.Mesh(boxProjectUV(new THREE.BoxGeometry(0.086, 0.086, 0.01), 1), M.get('whiteMatte'));
    plate.position.z = 0.005;
    const rocker = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.008), M.get('whiteMatte'));
    rocker.position.z = 0.012;
    const ledMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffb060, emissiveIntensity: 0, roughness: 0.4 });
    ledMat.userData.noZone = true;
    const led = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.0025, 0.002), ledMat);
    led.position.set(0, -0.032, 0.0105);
    root.add(plate, rocker, led);
    root.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; } });
    this.ctx.scene.add(root);
    const sw = new LightSwitch(this, group, root, rocker, led);
    group.switches.push(sw);
    sw.sync();
    this.ctx.interaction.add(sw);
    return sw;
  }

  addLamp(group, meshes, label) {
    const lamp = new LampToggle(this, group, meshes, label);
    group.switches.push(lamp);
    this.ctx.interaction.add(lamp);
    return lamp;
  }
}

class LightSwitch extends Interactable {
  constructor(sys, group, root, rocker, led) {
    super({ id: 'switch-' + group.id + '-' + group.switches.length, type: 'light', label: group.name, meshes: [root.children[0], rocker], reach: 2.0 });
    this.sys = sys; this.group = group; this.rocker = rocker; this.led = led;
  }
  sync() {
    this.rocker.rotation.x = this.group.on ? -0.12 : 0.12;
    // locator LED glows when the room is dark so the switch is easy to find
    this.led.material.emissiveIntensity = this.group.on ? 0 : 2.5;
  }
  prompt() { return `${this.group.on ? '關閉' : '開啟'}燈光 — ${this.group.name}`; }
  secondaryPrompt() { return `調整亮度（目前 ${Math.round(this.group.target * 100)}%）`; }
  interact() { this.sys.set(this.group, !this.group.on); this.sys.ctx.audio?.play('click'); }
  secondary() { this.sys.cycleLevel(this.group); this.sys.ctx.audio?.play('click'); return true; }
}

class LampToggle extends Interactable {
  constructor(sys, group, meshes, label) {
    super({ id: 'lamp-' + group.id, type: 'light', label, meshes, reach: 2.2 });
    this.sys = sys; this.group = group;
  }
  sync() {}
  prompt() { return `${this.group.on ? '關閉' : '開啟'}${this.label}`; }
  secondaryPrompt() { return `調整亮度（目前 ${Math.round(this.group.target * 100)}%）`; }
  interact() { this.sys.set(this.group, !this.group.on); this.sys.ctx.audio?.play('click'); }
  secondary() { this.sys.cycleLevel(this.group); this.sys.ctx.audio?.play('click'); return true; }
}
