// Gaze-based interaction. Each frame a ray from the screen centre is tested
// against the meshes of registered interactables; the nearest hit within that
// object's own reach becomes the focus unless a wall/door collider is closer
// (no interacting through walls). F triggers the primary action of the focused
// object only, once per key press (key repeat is ignored).

import * as THREE from 'three';

export class Interactable {
  constructor({ id, type, label, meshes = [], reach = 2.2, zone = null }) {
    this.id = id;
    this.type = type;           // door | window | light | drawer | cabinet | appliance ...
    this.label = label;
    this.meshes = meshes;       // raycast targets
    this.reach = reach;
    this.zone = zone;
    this.enabled = true;
  }
  get busy() { return false; }
  // Text for the prompt, e.g. '開啟房門'. Return null to hide.
  prompt() { return this.label; }
  secondaryPrompt() { return null; }
  interact(/* ctx */) {}
  secondary(/* ctx */) { return false; }
  // Optional: reason the action is not possible right now.
  blockedReason() { return null; }
}

export class InteractionManager {
  constructor({ camera, collision, hud }) {
    this.camera = camera;
    this.collision = collision;
    this.hud = hud;
    this.items = [];
    this.meshToItem = new Map();
    this.targets = [];
    this.raycaster = new THREE.Raycaster();
    this.raycaster.layers.enableAll();
    this.focus = null;
    this.enabled = false;
    this._dir = new THREE.Vector3();
    this._origin = new THREE.Vector3();
    this.listeners = [];
  }

  add(item) {
    this.items.push(item);
    for (const m of item.meshes) { this.meshToItem.set(m, item); this.targets.push(m); }
    return item;
  }

  byId(id) { return this.items.find(i => i.id === id); }

  onAction(fn) { this.listeners.push(fn); }

  update() {
    if (!this.enabled) { this._setFocus(null); return; }
    const cam = this.camera;
    cam.getWorldPosition(this._origin);
    cam.getWorldDirection(this._dir);
    this.raycaster.set(this._origin, this._dir);
    this.raycaster.far = 3.5;
    const hits = this.raycaster.intersectObjects(this.targets, false);
    let found = null, dist = Infinity;
    for (const h of hits) {
      const item = this.meshToItem.get(h.object);
      if (!item || !item.enabled || !h.object.visible) continue;
      if (h.distance > item.reach) break;   // hits are sorted; farther ones are out of reach too
      found = item; dist = h.distance;
      break;
    }
    if (found) {
      // Occlusion by walls / other closed doors (but not by the target's own collider).
      const o = this._origin, d = this._dir;
      const block = this.collision.raycast(o.x, o.y, o.z, d.x, d.y, d.z, dist, c => !found.colliders || !found.colliders.includes(c));
      if (block < dist - 0.06) found = null;
    }
    this._setFocus(found);
  }

  _setFocus(item) {
    this.focus = item;
    this.hud?.setPrompt(item);
  }

  primary(ctx) {
    const it = this.focus;
    if (!it || !it.enabled) return false;
    if (it.busy) return false;
    const blocked = it.blockedReason?.();
    if (blocked) { this.hud?.toast(blocked); return false; }
    it.interact(ctx);
    for (const f of this.listeners) f(it, 'primary');
    this.hud?.setPrompt(it);
    return true;
  }

  secondary(ctx) {
    const it = this.focus;
    if (!it || !it.enabled || it.busy) return false;
    const done = it.secondary(ctx);
    if (done) for (const f of this.listeners) f(it, 'secondary');
    this.hud?.setPrompt(it);
    return done;
  }
}
