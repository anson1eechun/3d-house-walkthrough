// First-person controller: Pointer Lock mouse look, WASD + Shift movement with
// acceleration, delta-time integration, normalised diagonals, capsule collision
// (via CollisionWorld) and smooth stepping onto raised floors.

import * as THREE from 'three';
import { EYE_HEIGHT } from '../scene/layout.js';

const WALK = 2.5, RUN = 5.0;
const RADIUS = 0.28, HEIGHT = 1.78, STEP = 0.2;
const BOUNDS = { x0: -44, x1: 44, z0: -46, z1: 44 };

export class PlayerController {
  constructor({ camera, dom, collision, settings }) {
    this.camera = camera;
    this.dom = dom;
    this.collision = collision;
    this.settings = settings;
    this.radius = RADIUS;
    this.position = { x: 0, z: 0 };
    this.feetY = 0;
    this.yaw = 0; this.pitch = 0;
    this.vel = new THREE.Vector2();
    this.keys = new Set();
    this.locked = false;
    this.enabled = false;
    this.bobPhase = 0; this.bobAmt = 0;
    this.moving = false;
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.listeners = { lock: [], unlock: [] };

    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.dom;
      if (this.locked && !was) this.listeners.lock.forEach(f => f());
      if (!this.locked && was) { this.keys.clear(); this.listeners.unlock.forEach(f => f()); }
    });
    document.addEventListener('pointerlockerror', () => this.listeners.unlock.forEach(f => f('error')));
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      const s = 0.0022 * (this.settings.sensitivity ?? 1);
      // Guard against the occasional huge spike some browsers report on lock.
      const mx = Math.max(-300, Math.min(300, e.movementX)), my = Math.max(-300, Math.min(300, e.movementY));
      this.yaw -= mx * s;
      this.pitch -= my * s;
      this.pitch = Math.max(-1.48, Math.min(1.48, this.pitch));
    });
    window.addEventListener('keydown', (e) => { if (this.locked || this.enabled === 'debug') this.keys.add(e.code); });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  on(evt, fn) { this.listeners[evt].push(fn); }

  lock() {
    try {
      const p = this.dom.requestPointerLock();
      if (p && p.catch) p.catch(() => this.listeners.unlock.forEach(f => f('error')));
    } catch (e) {
      this.listeners.unlock.forEach(f => f('error'));
    }
  }

  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

  teleport(x, z, yaw = this.yaw, pitch = 0) {
    this.position.x = x; this.position.z = z;
    this.yaw = yaw; this.pitch = pitch;
    this.vel.set(0, 0);
    this.feetY = this.collision.groundHeight(x, z);
    this.collision.resolve(this.position, RADIUS, this.feetY + STEP, this.feetY + HEIGHT);
    this.updateCamera(0);
  }

  update(dt) {
    let fx = 0, fz = 0;
    if (this.enabled) {
      const k = this.keys;
      if (k.has('KeyW') || k.has('ArrowUp')) fz -= 1;
      if (k.has('KeyS') || k.has('ArrowDown')) fz += 1;
      if (k.has('KeyA') || k.has('ArrowLeft')) fx -= 1;
      if (k.has('KeyD') || k.has('ArrowRight')) fx += 1;
    }
    const len = Math.hypot(fx, fz);
    const speed = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) ? RUN : WALK;
    let tx = 0, tz = 0;
    if (len > 0) {
      // normalise so diagonals are not faster, then rotate into world by yaw
      fx /= len; fz /= len;
      const c = Math.cos(this.yaw), s = Math.sin(this.yaw);
      tx = (fx * c + fz * s) * speed;
      tz = (-fx * s + fz * c) * speed;
    }
    const accel = len > 0 ? 9 : 12;
    const a = 1 - Math.exp(-accel * dt);
    this.vel.x += (tx - this.vel.x) * a;
    this.vel.y += (tz - this.vel.y) * a;
    if (Math.abs(this.vel.x) < 1e-4 && Math.abs(this.vel.y) < 1e-4) this.vel.set(0, 0);

    const p = this.position;
    const px = p.x, pz = p.z;
    this.collision.move(p, this.vel.x * dt, this.vel.y * dt, RADIUS, this.feetY + STEP, this.feetY + HEIGHT);
    // Moving doors can push us even while standing still.
    this.collision.resolve(p, RADIUS, this.feetY + STEP, this.feetY + HEIGHT, 2);
    p.x = Math.max(BOUNDS.x0, Math.min(BOUNDS.x1, p.x));
    p.z = Math.max(BOUNDS.z0, Math.min(BOUNDS.z1, p.z));
    // actual velocity after collisions (for head bob)
    const moved = Math.hypot(p.x - px, p.z - pz) / Math.max(dt, 1e-4);
    this.moving = moved > 0.3;

    // Stepping: rise quickly onto higher floors, settle down smoothly.
    const ground = this.collision.groundHeight(p.x, p.z);
    const dy = ground - this.feetY;
    this.feetY += dy * (1 - Math.exp(-(dy > 0 ? 18 : 10) * dt));
    if (Math.abs(dy) < 1e-4) this.feetY = ground;

    // Head bob
    const bobTarget = this.settings.headBob && this.moving ? Math.min(1, moved / RUN) : 0;
    this.bobAmt += (bobTarget - this.bobAmt) * (1 - Math.exp(-8 * dt));
    this.bobPhase += moved * dt * 2.2;
    this.updateCamera(dt);
  }

  updateCamera() {
    const bob = Math.sin(this.bobPhase * Math.PI) * 0.022 * this.bobAmt;
    const sway = Math.cos(this.bobPhase * Math.PI * 0.5) * 0.012 * this.bobAmt;
    this.camera.position.set(this.position.x, this.feetY + EYE_HEIGHT + bob, this.position.z);
    this._euler.set(this.pitch, this.yaw, sway * 0.15);
    this.camera.quaternion.setFromEuler(this._euler);
  }
}
