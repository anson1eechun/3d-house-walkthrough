// Two-state (closed <-> open) animations built on the three.js animation system.
// Each animated part gets an AnimationClip with eased keyframes (position and/or
// quaternion tracks) that is played forward to open and backward to close on a
// shared AnimationMixer. The mixer reports completion, which is what gates
// further input so repeated key presses cannot desynchronise the state.

import * as THREE from 'three';

const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const SAMPLES = 16;

export class AnimationHub {
  constructor(root) {
    this.mixer = new THREE.AnimationMixer(root);
    this.active = new Set();
    this.mixer.addEventListener('finished', (e) => {
      const anim = e.action.userData?.owner;
      if (anim) anim._finished();
    });
  }
  update(dt) {
    this.mixer.update(dt);
    for (const a of this.active) a.onTick?.();
  }
}

// parts: [{ object, position?: [from Vector3, to Vector3], quaternion?: [from Quaternion, to Quaternion] }]
export class ToggleAnimation {
  constructor(hub, parts, { duration = 0.9, name = 'toggle', onTick = null } = {}) {
    this.hub = hub;
    this.duration = duration;
    this.onTick = onTick;
    this.state = 'closed';       // closed | opening | open | closing
    this.listeners = [];
    const tracks = [];
    const times = [];
    for (let i = 0; i <= SAMPLES; i++) times.push((i / SAMPLES) * duration);
    for (const p of parts) {
      const path = p.object.uuid;
      if (p.position) {
        const vals = [];
        const v = new THREE.Vector3();
        for (let i = 0; i <= SAMPLES; i++) { v.lerpVectors(p.position[0], p.position[1], easeInOut(i / SAMPLES)); vals.push(v.x, v.y, v.z); }
        tracks.push(new THREE.VectorKeyframeTrack(`${path}.position`, times, vals));
      }
      if (p.quaternion) {
        const vals = [];
        const q = new THREE.Quaternion();
        for (let i = 0; i <= SAMPLES; i++) { q.slerpQuaternions(p.quaternion[0], p.quaternion[1], easeInOut(i / SAMPLES)); vals.push(q.x, q.y, q.z, q.w); }
        tracks.push(new THREE.QuaternionKeyframeTrack(`${path}.quaternion`, times, vals));
      }
    }
    this.clip = new THREE.AnimationClip(name, duration, tracks);
    // Tracks address nodes by uuid, which PropertyBinding.findNode resolves under the mixer root.
    this.action = hub.mixer.clipAction(this.clip);
    this.action.setLoop(THREE.LoopOnce, 1);
    this.action.clampWhenFinished = true;
    this.action.userData = { owner: this };
  }

  get busy() { return this.state === 'opening' || this.state === 'closing'; }
  get isOpen() { return this.state === 'open' || this.state === 'opening'; }

  open() {
    if (this.busy || this.state === 'open') return false;
    this.state = 'opening';
    const a = this.action;
    a.enabled = true; a.paused = false; a.timeScale = 1;
    if (!a.isRunning()) { a.reset(); a.play(); }
    this.hub.active.add(this);
    this._emit('start');
    return true;
  }

  close() {
    if (this.busy || this.state === 'closed') return false;
    this.state = 'closing';
    const a = this.action;
    a.enabled = true; a.paused = false; a.timeScale = -1;
    a.time = this.duration;
    a.play();
    this.hub.active.add(this);
    this._emit('start');
    return true;
  }

  toggle() { return this.isOpen ? this.close() : this.open(); }

  _finished() {
    this.state = this.state === 'opening' ? 'open' : 'closed';
    this.hub.active.delete(this);
    this.onTick?.();
    this._emit('end');
  }

  on(fn) { this.listeners.push(fn); }
  _emit(kind) { for (const f of this.listeners) f(kind, this); }

  // Progress 0 (closed) .. 1 (open) of the eased motion.
  get progress() {
    const t = this.action.time / this.duration;
    if (this.state === 'closed') return 0;
    if (this.state === 'open') return 1;
    return easeInOut(Math.min(1, Math.max(0, t)));
  }
}
