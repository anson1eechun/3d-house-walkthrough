#!/usr/bin/env node
// Unit tests for the capsule collision core (pure JS, runs in Node without a browser).
import { CollisionWorld } from '../src/player/collision.js';

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, detail); }
};
const R = 0.28;

{
  // Push-out from an axis-aligned wall
  const w = new CollisionWorld(2);
  w.addBox({ minX: -0.1, maxX: 0.1, minZ: -5, maxZ: 5, minY: 0, maxY: 3 });
  const p = { x: 0.2, z: 0 };
  w.resolve(p, R, 0.3, 1.8);
  ok('circle is pushed out of a wall', Math.abs(p.x - (0.1 + R)) < 1e-6, JSON.stringify(p));
}
{
  // Fast movement cannot tunnel through a thin wall (sub-stepping)
  const w = new CollisionWorld(2);
  w.addBox({ minX: -0.06, maxX: 0.06, minZ: -5, maxZ: 5, minY: 0, maxY: 3 });
  const p = { x: -1, z: 0 };
  w.move(p, 3.0, 0, R, 0.3, 1.8);   // 3 m in a single frame
  ok('no tunnelling through a 12 cm wall at 3 m/frame', p.x <= -0.06 - R + 1e-6, JSON.stringify(p));
}
{
  // Sliding along a wall keeps the tangential motion
  const w = new CollisionWorld(2);
  w.addBox({ minX: -0.1, maxX: 0.1, minZ: -50, maxZ: 50, minY: 0, maxY: 3 });
  const p = { x: -0.5, z: 0 };
  w.move(p, 1.0, 1.0, R, 0.3, 1.8);
  ok('diagonal move into a wall slides along it', Math.abs(p.z - 1.0) < 1e-6 && p.x <= -0.1 - R + 1e-6, JSON.stringify(p));
}
{
  // Rotated (door-like) collider
  const w = new CollisionWorld(2);
  const door = w.addOBB({ cx: 0, cz: 0, hx: 0.45, hz: 0.03, angle: Math.PI / 2, minY: 0, maxY: 2.1, dynamic: true });
  const p = { x: 0.1, z: 0.2 };
  w.resolve(p, R, 0.3, 1.8);
  ok('rotated OBB pushes along its local normal', Math.abs(p.x - (0.03 + R)) < 1e-6 && Math.abs(p.z - 0.2) < 1e-6, JSON.stringify(p));
  door.enabled = false;
  const q = { x: 0.0, z: 0.0 };
  ok('disabled collider is ignored', !w.resolve(q, R, 0.3, 1.8));
}
{
  // Vertical extent: low objects (rugs, floor steps) and high ones (lintels) do not block
  const w = new CollisionWorld(2);
  w.addBox({ minX: -1, maxX: 1, minZ: -1, maxZ: 1, minY: 0, maxY: 0.15 });
  w.addBox({ minX: -1, maxX: 1, minZ: -1, maxZ: 1, minY: 2.1, maxY: 3 });
  const p = { x: 0, z: 0 };
  ok('objects below the step height or above the head are ignored', !w.resolve(p, R, 0.35, 1.93));
}
{
  // Corner: resolves out of two walls without jitter
  const w = new CollisionWorld(2);
  w.addBox({ minX: -0.1, maxX: 0.1, minZ: -5, maxZ: 0.1, minY: 0, maxY: 3 });
  w.addBox({ minX: -5, maxX: 0.1, minZ: -0.1, maxZ: 0.1, minY: 0, maxY: 3 });
  const p = { x: -0.25, z: -0.25 };
  for (let i = 0; i < 30; i++) w.move(p, 0.05, 0.05, R, 0.3, 1.8);
  const a = { ...p };
  w.move(p, 0.05, 0.05, R, 0.3, 1.8);
  ok('pushing into an inside corner is stable', Math.hypot(p.x - a.x, p.z - a.z) < 1e-6 && p.x <= -0.1 - R + 1e-6 && p.z <= -0.1 - R + 1e-6, JSON.stringify(p));
}
{
  // Raycast against boxes (used to stop interacting through walls)
  const w = new CollisionWorld(2);
  w.addBox({ minX: 2, maxX: 2.2, minZ: -1, maxZ: 1, minY: 0, maxY: 3 });
  w.addBox({ minX: 4, maxX: 4.2, minZ: -1, maxZ: 1, minY: 0, maxY: 3, occludes: false });
  const d = w.raycast(0, 1.5, 0, 1, 0, 0, 10);
  ok('raycast returns the nearest occluder distance', Math.abs(d - 2) < 1e-6, d);
  const d2 = w.raycast(3, 1.5, 0, 1, 0, 0, 10);
  ok('non-occluding colliders are skipped by raycasts', d2 === Infinity, d2);
  const d3 = w.raycast(0, 3.5, 0, 1, 0, 0, 10);
  ok('raycast respects collider height', d3 === Infinity, d3);
}
{
  // Floors: the highest floor rectangle under the point wins
  const w = new CollisionWorld(2);
  w.addFloor({ minX: -10, maxX: 10, minZ: -10, maxZ: 10, y: 0.02 });
  w.addFloor({ minX: 0, maxX: 5, minZ: 0, maxZ: 5, y: 0.15 });
  ok('ground height picks the raised slab', w.groundHeight(1, 1) === 0.15 && w.groundHeight(-1, 1) === 0.02 && w.groundHeight(50, 50) === 0);
}
{
  // Spatial grid: candidates only include nearby static colliders
  const w = new CollisionWorld(2);
  for (let i = 0; i < 200; i++) w.addBox({ minX: i * 3, maxX: i * 3 + 0.2, minZ: 0, maxZ: 0.2 });
  const c = w.candidates(30, 0, 0.3);
  ok('spatial grid limits collision candidates', c.length > 0 && c.length <= 3, c.length);
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
