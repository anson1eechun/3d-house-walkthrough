// Interior: furniture, fixtures, room light groups and wall switches.

import * as THREE from 'three';
import { Kit } from './kit.js';
import { FLOOR_Y, H_PUB, H_PRI } from './layout.js';
import { buildLiving } from './interior/living.js';
import { buildKitchenDining } from './interior/kitchen.js';
import { buildBedrooms } from './interior/bedrooms.js';
import { buildBathroom } from './interior/bathroom.js';
import { buildHall } from './interior/hall.js';

export function createInterior(ctx) {
  const kit = new Kit(ctx);
  const L = ctx.lighting;
  const groups = {
    living: L.group('living', '客廳', { zone: 'public' }),
    livingLamp: L.group('livingLamp', '客廳立燈', { zone: 'public' }),
    dining: L.group('dining', '餐廳', { zone: 'public' }),
    kitchen: L.group('kitchen', '廚房', { zone: 'public' }),
    hall: L.group('hall', '玄關與走廊', { zone: 'hall' }),
    bath: L.group('bath', '浴室', { zone: 'bath' }),
    bed1: L.group('bed1', '主臥室', { zone: 'bed1' }),
    bed1Lamp: L.group('bed1Lamp', '主臥床頭燈', { zone: 'bed1' }),
    bed2: L.group('bed2', '次臥室', { zone: 'bed2' }),
    bed2Lamp: L.group('bed2Lamp', '次臥檯燈', { zone: 'bed2' }),
    exterior: L.group('exterior', '戶外照明', { zone: null }),
    fire: L.group('fire', '壁爐', { zone: 'public', listed: false }),
    tv: L.group('tv', '電視', { zone: 'public', listed: false }),
  };
  const fx = new Fixtures(ctx, kit);
  const env = { ctx, kit, groups, fx, L };
  buildLiving(env);
  buildKitchenDining(env);
  buildHall(env);
  buildBathroom(env);
  buildBedrooms(env);

  // Wall switches (y = 1.3 m). Rotation faces the switch towards the room.
  const sw = (g, x, z, rotY, dy = 0) => L.addSwitch(groups[g], new THREE.Vector3(x, FLOOR_Y + 1.15 + dy, z), rotY);
  sw('living', -0.125, -1.0, -Math.PI / 2);
  sw('kitchen', -0.125, 1.3, -Math.PI / 2);
  sw('dining', -7.0, 6.875, Math.PI);
  sw('hall', 0.75, 0.875, Math.PI);
  sw('exterior', 0.55, 0.875, Math.PI);
  sw('hall', 12.2, -0.54, 0);
  sw('bath', 2.15, -0.66, Math.PI);
  sw('bed1', 5.15, -0.66, Math.PI);
  sw('bed2', 10.45, -0.66, Math.PI);

  // Day start: the house is daylit, only the hallway glows a little.
  return groups;
}

// Light fixtures shared by the room modules.
export class Fixtures {
  constructor(ctx, kit) { this.ctx = ctx; this.kit = kit; }

  // Recessed downlight: trim ring + emissive lens; optional SpotLight.
  downlight(group, x, z, ceil, { light = true, intensity = 14, angle = 0.9, shadow = false, color = 0xffe3c4, distance = 0, fixture = true } = {}) {
    const { kit, ctx } = this;
    if (fixture) {
      const lens = ctx.lighting.emissive(group, { color, intensity: 14, base: 0xfaf6ee });
      const g = kit.group(
        kit.cyl(0.055, 0.055, 0.012, 'whiteMatte', 0, -0.006, 0, 20),
        kit.cyl(0.042, 0.042, 0.004, lens, 0, -0.013, 0, 20),
      );
      g.children.forEach(c => { c.castShadow = false; });
      kit.place(g, x, z, 0, ceil);
      kit.commit(g, { collider: null });
    }
    if (light) {
      const s = new THREE.SpotLight(color, intensity, distance, angle, 0.75, 2);
      s.position.set(x, ceil - 0.03, z);
      s.target.position.set(x, 0, z);
      if (shadow) this.shadowCandidate(s);
      ctx.scene.add(s, s.target);
      ctx.lighting.addLight(group, s, intensity);
      return s;
    }
    return null;
  }

  point(group, x, y, z, { intensity = 6, color = 0xffd9b0, distance = 0, decay = 2 } = {}) {
    const p = new THREE.PointLight(color, intensity, distance, decay);
    p.position.set(x, y, z);
    this.ctx.scene.add(p);
    this.ctx.lighting.addLight(group, p, intensity);
    return p;
  }

  shadowCandidate(light) {
    light.userData.shadowCandidate = true;
    light.castShadow = false;
    light.shadow.mapSize.set(1024, 1024);
    light.shadow.bias = -0.0004;
    light.shadow.normalBias = 0.02;
    light.shadow.radius = 4;
    light.shadow.camera.near = 0.2;
    light.shadow.camera.far = 8;
    light.shadow.autoUpdate = false;
  }
}

export { H_PUB, H_PRI };
