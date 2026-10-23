// Furniture interactables: drawers (slide), cabinet / wardrobe / appliance doors
// (hinge), sliding wardrobe doors, and on/off appliances (TV, fireplace, tap).
// Movement uses the shared AnimationMixer via ToggleAnimation; parts that swing
// into walkable space carry dynamic colliders.

import * as THREE from 'three';
import { Interactable } from './interactionManager.js';
import { ToggleAnimation } from './animator.js';

const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

export class ToggleFurniture extends Interactable {
  // parts: ToggleAnimation part specs; colliders: [{ object, w, d, h, y0, local:[x,z] }]
  constructor(ctx, { id, type = 'cabinet', label, meshes, parts, verbs = ['打開', '關上'], colliders = [], duration = 0.7, sound = 'drawer', reach = 2.0, onChange = null }) {
    // Every mesh of a moving part is a target, so an open drawer or a swung door
    // can be aimed at anywhere, not only at its front panel.
    const targets = new Set(meshes);
    for (const p of parts) p.object.traverse(o => { if (o.isMesh) targets.add(o); });
    super({ id, type, label, meshes: [...targets], reach });
    this.ctx = ctx; this.verbs = verbs; this.sound = sound; this.onChange = onChange;
    this.colliderSpecs = colliders;
    this.colliders = colliders.map(s => ctx.collision.addOBB({ cx: 0, cz: 0, hx: s.w / 2, hz: s.d / 2, minY: s.y0, maxY: s.y0 + s.h, dynamic: true, tag: id, occludes: false }));
    this.anim = new ToggleAnimation(ctx.hub, parts, {
      duration, name: id,
      onTick: () => { this._sync(); ctx.markShadowsDirty(); },
    });
    this.anim.on((k) => {
      if (k === 'start') this.onChange?.(this.anim.isOpen, this);
      if (k === 'end') ctx.onFurnitureState?.(this);
    });
    // Sync once the parts are in the scene graph.
    queueMicrotask(() => this._sync());
  }
  _sync() {
    this.colliderSpecs.forEach((s, i) => {
      s.object.updateWorldMatrix(true, false);
      _v.set(s.local[0], 0, s.local[1]).applyMatrix4(s.object.matrixWorld);
      s.object.getWorldQuaternion(_q);
      _e.setFromQuaternion(_q, 'YXZ');
      this.ctx.collision.updateOBB(this.colliders[i], _v.x, _v.z, _e.y);
    });
  }
  get busy() { return this.anim.busy; }
  get isOpen() { return this.anim.isOpen; }
  prompt() {
    if (this.anim.busy) return null;
    return (this.anim.state === 'open' ? this.verbs[1] : this.verbs[0]) + this.label;
  }
  interact() {
    this.anim.toggle();
    this.ctx.audio?.play(this.sound);
  }
}

// On/off device without motion (TV, fireplace, tap). onSet(on) applies the state.
export class ApplianceToggle extends Interactable {
  constructor(ctx, { id, label, meshes, onSet, secondaryLabel = null, onSecondary = null, reach = 2.6, verbs = ['開啟', '關閉'] }) {
    super({ id, type: 'appliance', label, meshes, reach });
    this.ctx = ctx; this.on = false; this.onSet = onSet; this.verbs = verbs;
    this.secondaryLabel = secondaryLabel; this.onSecondary = onSecondary;
  }
  prompt() { return (this.on ? this.verbs[1] : this.verbs[0]) + this.label; }
  secondaryPrompt() { return this.on && this.secondaryLabel ? (typeof this.secondaryLabel === 'function' ? this.secondaryLabel() : this.secondaryLabel) : null; }
  interact() { this.set(!this.on); this.ctx.audio?.play('click'); }
  set(on) { this.on = on; this.onSet(on, this); this.ctx.onLightsChanged?.({ zone: this.zone }); }
  secondary() {
    if (!this.on || !this.onSecondary) return false;
    this.onSecondary(this); this.ctx.audio?.play('click');
    return true;
  }
}

// Helpers to build parts specs ------------------------------------------------

export function slidePart(object, dx, dy, dz) {
  const p0 = object.position.clone();
  return { object, position: [p0, p0.clone().add(new THREE.Vector3(dx, dy, dz))] };
}

export function hingePart(object, axis, angle) {
  const q0 = object.quaternion.clone();
  const q1 = q0.clone().multiply(new THREE.Quaternion().setFromAxisAngle(axis, angle));
  return { object, quaternion: [q0, q1] };
}

export const Y_AXIS = new THREE.Vector3(0, 1, 0);
export const X_AXIS = new THREE.Vector3(1, 0, 0);
