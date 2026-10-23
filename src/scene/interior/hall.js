import * as THREE from 'three';
import { FLOOR_Y, H_PRI } from '../layout.js';
import { rug, plant, vase, artFrame } from './common.js';

const F = FLOOR_Y;

export function buildHall(env) {
  const { ctx, kit, groups, fx } = env;
  const M = ctx.materials;

  // entry console with round mirror (north wall of the entry, facing +z)
  {
    const g = kit.group();
    g.add(kit.rbox(1.4, 0.04, 0.3, 0.008, 'walnut', 0, 0.8, 0));
    g.add(kit.rbox(1.3, 0.025, 0.26, 0.006, 'walnut', 0, 0.25, 0));
    for (const x of [-0.66, 0.66]) g.add(kit.box(0.025, 0.8, 0.28, 'blackMetal', x, 0.4, 0));
    g.add(vase(kit, 'entry', 0.07, 0.26, 'terracotta', -0.45, 0.82, 0));
    g.add(kit.lathe('keybowl', [[0, 0], [0.09, 0.005], [0.11, 0.035], [0.105, 0.04], [0.07, 0.01], [0, 0.01]], 'ceramicMatte', 0.35, 0.82, 0.02));
    // mirror
    const mir = kit.cyl(0.4, 0.4, 0.01, 'mirror', 0, 1.55, -0.13, 48);
    mir.rotation.x = Math.PI / 2;
    const rim = kit.torus(0.405, 0.012, 'brass', 0, 1.55, -0.125);
    g.add(mir, rim);
    kit.place(g, 1.15, -0.54 + 0.15, 0);
    kit.commit(g, { collider: { w: 1.4, d: 0.3, h: 0.85 } });
  }
  // coat hooks on the wall beside the front door
  {
    const g = kit.group(kit.box(0.7, 0.06, 0.02, 'walnut', 0, 0, 0));
    for (const x of [-0.25, 0, 0.25]) g.add(kit.cyl(0.008, 0.008, 0.07, 'brass', x, 0, 0.04, 8).rotateX(Math.PI / 2));
    kit.place(g, 0.68, 0.875 - 0.01, Math.PI, F + 1.72);
    kit.commit(g, { collider: null });
  }

  rug(kit, 'rugRunner', 8.4, 0.85, 8.1, 0.17, 0);

  // art along the corridor
  const art = (mat, w, h, x, z, rot) => { const a = artFrame(kit, M.get(mat), w, h); kit.place(a, x, z, rot, F + 1.55); kit.commit(a, { collider: null }); };
  art('art1', 0.75, 0.95, 6.35, -0.54 + 0.02, 0);
  art('art2', 0.75, 0.95, 7.85, -0.54 + 0.02, 0);
  art('art0', 1.0, 0.7, 6.75, 0.875 - 0.02, Math.PI);

  plant(kit, 12.45, 0.5, 1.1, 91, 'terracotta');

  for (const x of [1.6, 7.0, 11.2]) fx.downlight(groups.hall, x, 0.17, H_PRI, { intensity: 9, angle: 0.9 });
  for (const x of [4.3, 9.1]) fx.downlight(groups.hall, x, 0.17, H_PRI, { light: false });
}
