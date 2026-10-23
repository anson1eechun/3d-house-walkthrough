// Floor plan drawn with Canvas 2D from the layout data: rooms with their real
// dimensions, walls with door/window openings, the visitor's position and view
// direction. Clicking a room teleports there (pause menu); a small copy can be
// shown in the HUD as a minimap.

import { ROOMS, WALLS } from '../scene/layout.js';

const BOUNDS = { x0: -13.5, x1: 14.5, z0: -12, z1: 8.5 };

// Spawn points for "go to room": [x, z, yaw]
export const SPAWNS = {
  living: [-4.2, -1.6, 1.25], dining: [-6.4, 3.0, 1.5708], kitchen: [-3.0, 2.2, 3.1416],
  entry: [2.6, 0.2, -1.5708], hall: [6.8, 0.2, -1.5708], bath: [2.9, -1.3, 0.42],
  bed1: [7.8, -1.5, 1.04], bed2: [9.6, -1.4, -0.64],
  front: [8.6, 15.5, 0.12], deck: [-3.2, -10.6, 0.9], garden: [-6.5, -22.5, 3.1416],
};

export class FloorPlan {
  constructor(canvas, { interactive = false, onPick = null } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onPick = onPick;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.hover = null;
    this.resize();
    if (interactive) {
      canvas.addEventListener('mousemove', (e) => { this.hover = this.pick(e); canvas.style.cursor = this.hover ? 'pointer' : 'default'; });
      canvas.addEventListener('mouseleave', () => { this.hover = null; });
      canvas.addEventListener('click', (e) => { const r = this.pick(e); if (r && this.onPick) this.onPick(r); });
    }
  }

  resize() {
    const w = this.canvas.clientWidth || 360, h = this.canvas.clientHeight || 260;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    const sx = this.canvas.width / (BOUNDS.x1 - BOUNDS.x0), sz = this.canvas.height / (BOUNDS.z1 - BOUNDS.z0);
    this.scale = Math.min(sx, sz);
    this.ox = (this.canvas.width - (BOUNDS.x1 - BOUNDS.x0) * this.scale) / 2;
    this.oz = (this.canvas.height - (BOUNDS.z1 - BOUNDS.z0) * this.scale) / 2;
  }

  X(x) { return this.ox + (x - BOUNDS.x0) * this.scale; }
  Z(z) { return this.oz + (z - BOUNDS.z0) * this.scale; }

  pick(e) {
    const r = this.canvas.getBoundingClientRect();
    const px = (e.clientX - r.left) * this.dpr, pz = (e.clientY - r.top) * this.dpr;
    const x = (px - this.ox) / this.scale + BOUNDS.x0, z = (pz - this.oz) / this.scale + BOUNDS.z0;
    for (const room of ROOMS) if (x > room.x0 && x < room.x1 && z > room.z0 && z < room.z1) return room.id;
    if (z > 1 && z < 8.5 && x > 0 && x < 14) return 'front';
    if (z < -7 && z > -11.2 && x > -12.2 && x < 0.2) return 'deck';
    if (z < -11.2) return 'garden';
    return null;
  }

  draw(player, { labels = true, compact = false } = {}) {
    const c = this.ctx, s = this.scale;
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    // outdoor context
    c.fillStyle = 'rgba(70, 92, 60, 0.35)';
    c.fillRect(this.X(BOUNDS.x0), this.Z(BOUNDS.z0), (BOUNDS.x1 - BOUNDS.x0) * s, (BOUNDS.z1 - BOUNDS.z0) * s);
    c.fillStyle = 'rgba(150, 120, 90, 0.45)';   // deck
    c.fillRect(this.X(-12.125), this.Z(-11.2), 12.25 * s, 4.075 * s);
    c.fillStyle = 'rgba(170, 170, 165, 0.35)';  // courtyard + driveway
    c.fillRect(this.X(0.125), this.Z(1.125), 13.7 * s, 6.5 * s);
    c.fillRect(this.X(6.8), this.Z(7.6), 4.8 * s, (BOUNDS.z1 - 7.6) * s);
    // rooms
    for (const r of ROOMS) {
      const hot = this.hover === r.id;
      c.fillStyle = hot ? 'rgba(201, 164, 106, 0.42)' : 'rgba(236, 232, 225, 0.12)';
      c.fillRect(this.X(r.x0), this.Z(r.z0), (r.x1 - r.x0) * s, (r.z1 - r.z0) * s);
    }
    // walls with openings
    for (const w of WALLS) {
      const t = Math.max(1.5, w.t * s);
      const seg = (a0, a1) => {
        if (a1 - a0 <= 0) return;
        c.fillStyle = 'rgba(236, 232, 225, 0.92)';
        if (w.axis === 'x') c.fillRect(this.X(a0), this.Z(w.at) - t / 2, (a1 - a0) * s, t);
        else c.fillRect(this.X(w.at) - t / 2, this.Z(a0), t, (a1 - a0) * s);
      };
      let cur = w.from;
      for (const op of [...w.openings].sort((a, b) => a.from - b.from)) {
        seg(cur, op.from);
        if (op.kind === 'window' || op.kind === 'glasswall') {
          c.fillStyle = 'rgba(140, 200, 230, 0.9)';
          const tw = Math.max(1, t * 0.45);
          if (w.axis === 'x') c.fillRect(this.X(op.from), this.Z(w.at) - tw / 2, (op.to - op.from) * s, tw);
          else c.fillRect(this.X(w.at) - tw / 2, this.Z(op.from), tw, (op.to - op.from) * s);
        }
        cur = op.to;
      }
      seg(cur, w.to);
    }
    // labels with real dimensions
    if (labels) {
      c.textAlign = 'center'; c.textBaseline = 'middle';
      for (const r of ROOMS) {
        if (compact && r.id === 'entry') continue;
        const cx = this.X((r.x0 + r.x1) / 2), cz = this.Z((r.z0 + r.z1) / 2);
        c.fillStyle = 'rgba(236, 232, 225, 0.95)';
        c.font = `${Math.round((compact ? 9 : 12) * this.dpr)}px "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif`;
        if (c.measureText(r.name).width > (r.x1 - r.x0) * s - 2) continue;
        c.fillText(r.name, cx, cz - (compact ? 0 : 7 * this.dpr));
        if (!compact) {
          const w = r.x1 - r.x0, d = r.z1 - r.z0;
          c.font = `${Math.round(10 * this.dpr)}px ui-monospace, Menlo, Consolas, monospace`;
          c.fillStyle = 'rgba(236, 232, 225, 0.6)';
          const room = w * s - 6 * this.dpr;
          // longest label that fits the room's drawn width
          for (const t of [`${w.toFixed(1)}×${d.toFixed(1)} m · ${(w * d).toFixed(0)} m²`, `${w.toFixed(1)}×${d.toFixed(1)} m`, `${(w * d).toFixed(0)} m²`]) {
            if (c.measureText(t).width <= room) { c.fillText(t, cx, cz + 8 * this.dpr); break; }
          }
        }
      }
    }
    // visitor
    if (player) {
      const px = this.X(player.position.x), pz = this.Z(player.position.z);
      const a = player.yaw;
      const fx = -Math.sin(a), fz = -Math.cos(a);
      const len = (compact ? 18 : 26) * this.dpr, spread = 0.55;
      const g = c.createRadialGradient(px, pz, 0, px, pz, len);
      g.addColorStop(0, 'rgba(201, 164, 106, 0.55)'); g.addColorStop(1, 'rgba(201, 164, 106, 0)');
      c.fillStyle = g;
      c.beginPath(); c.moveTo(px, pz);
      const ang = Math.atan2(fz, fx);
      c.arc(px, pz, len, ang - spread, ang + spread); c.closePath(); c.fill();
      c.fillStyle = '#c9a46a';
      c.beginPath(); c.arc(px, pz, 4 * this.dpr, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#1a1612'; c.lineWidth = 1.5 * this.dpr; c.stroke();
    }
  }
}

