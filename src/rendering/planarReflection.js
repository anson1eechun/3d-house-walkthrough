// Planar reflection for the exterior ground plane (wet driveway, pavers, deck).
// The scene (minus ground surfaces, glass and rain) is rendered from the camera
// mirrored about y = planeY with an oblique near plane, into a reduced-size,
// mip-mapped HDR target. Wet materials sample it projectively and pick a blur
// level from their roughness. It only renders while the ground is wet, at a
// quality-dependent resolution and update interval.

import * as THREE from 'three';
import { LAYER } from '../core/layers.js';

export class PlanarReflection {
  constructor(renderer, scene, camera, planeY = 0) {
    this.renderer = renderer; this.scene = scene; this.camera = camera;
    this.planeY = planeY;
    this.scale = 0; this.interval = 1;
    this.frame = 0;
    this.w = 1; this.h = 1;
    this.virtual = new THREE.PerspectiveCamera();
    this.virtual.layers.set(LAYER.DEFAULT);
    this.rt = null;
    this.uniforms = { uReflTex: { value: null }, uReflMatrix: { value: new THREE.Matrix4() }, uReflOn: { value: 0 } };
    this._n = new THREE.Vector3(0, 1, 0);
    this._p = new THREE.Vector3();
    this._cam = new THREE.Vector3();
    this._view = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._target = new THREE.Vector3();
    this._rot = new THREE.Matrix4();
    this._plane = new THREE.Plane();
    this._clip = new THREE.Vector4();
    this._q = new THREE.Vector4();
  }

  setQuality({ scale, interval }) {
    this.scale = scale; this.interval = Math.max(1, interval || 1);
    this._alloc();
  }

  setSize(w, h) { this.w = w; this.h = h; this._alloc(); }

  _alloc() {
    if (this.scale <= 0) {
      this.rt?.dispose(); this.rt = null; this.uniforms.uReflOn.value = 0;
      return;
    }
    const w = Math.max(64, Math.round(this.w * this.scale)), h = Math.max(64, Math.round(this.h * this.scale));
    if (this.rt && this.rt.width === w && this.rt.height === h) return;
    this.rt?.dispose();
    this.rt = new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType, generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
    });
    this.rt.texture.name = 'planarReflection';
    this.uniforms.uReflTex.value = this.rt.texture;
  }

  update(needed) {
    if (!this.rt || !needed) { this.uniforms.uReflOn.value = 0; return; }
    this.uniforms.uReflOn.value = 1;
    if ((this.frame++ % this.interval) !== 0) return;

    const cam = this.camera, v = this.virtual, n = this._n;
    cam.updateMatrixWorld();
    this._cam.setFromMatrixPosition(cam.matrixWorld);
    if (this._cam.y < this.planeY + 0.01) return;
    this._p.set(this._cam.x, this.planeY, this._cam.z);

    this._view.subVectors(this._p, this._cam).reflect(n).negate().add(this._p);
    this._rot.extractRotation(cam.matrixWorld);
    this._look.set(0, 0, -1).applyMatrix4(this._rot).add(this._cam);
    this._target.subVectors(this._p, this._look).reflect(n).negate().add(this._p);
    v.position.copy(this._view);
    v.up.set(0, 1, 0).applyMatrix4(this._rot).reflect(n);
    v.lookAt(this._target);
    v.near = cam.near; v.far = cam.far; v.fov = cam.fov; v.aspect = cam.aspect;
    v.updateMatrixWorld();
    v.projectionMatrix.copy(cam.projectionMatrix);

    const tm = this.uniforms.uReflMatrix.value;
    tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    tm.multiply(v.projectionMatrix).multiply(v.matrixWorldInverse);

    // Oblique near plane: clip everything below the mirror plane.
    this._plane.setFromNormalAndCoplanarPoint(n, this._p).applyMatrix4(v.matrixWorldInverse);
    const c = this._clip.set(this._plane.normal.x, this._plane.normal.y, this._plane.normal.z, this._plane.constant);
    const pm = v.projectionMatrix, e = pm.elements, q = this._q;
    q.x = (Math.sign(c.x) + e[8]) / e[0];
    q.y = (Math.sign(c.y) + e[9]) / e[5];
    q.z = -1.0;
    q.w = (1.0 + e[10]) / e[14];
    c.multiplyScalar(2.0 / c.dot(q));
    e[2] = c.x; e[6] = c.y; e[10] = c.z + 1.0 - 0.003; e[14] = c.w;

    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const prevShadow = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    r.setRenderTarget(this.rt);
    r.clear();
    r.render(this.scene, v);
    r.setRenderTarget(prevTarget);
    r.shadowMap.autoUpdate = prevShadow;
  }
}
