#!/usr/bin/env node
// Soak test: several minutes of random walking, interactions and weather /
// time-of-day switching; compares frame time, JS heap and GPU resource counts
// at the start and the end of the session.
//
//   node tools/soak-test.mjs [--minutes=3] [--gpu=egl] [--quality=medium]

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const MINUTES = +(args.minutes || 3);
const PORT = 8791;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const server = spawn(process.execPath, [path.join(ROOT, 'serve.mjs'), '--port', String(PORT), '--no-browser'], { stdio: 'ignore' });
await sleep(800);
const browser = await launch({ headless: !args.headed, gpu: args.gpu || 'egl', offline: true });
const p = await browser.newPage();
await p.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await p.goto(`http://localhost:${PORT}/`);
await p.waitFor('window.__appReady === true', 240000);
await p.eval(`__app.setQuality('${args.quality || 'medium'}'); __app.debugStart(); 1`);
await p.eval(`window.__bench = (n) => { const a = __app, gl = a.renderer.getContext(), px = new Uint8Array(4); a.renderer.setAnimationLoop(null); let t = performance.now(); for (let i = 0; i < 3; i++) { a.frame(t += 16.7); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } const t0 = performance.now(); let cpu = 0; for (let i = 0; i < n; i++) { a.frame(t += 16.7); cpu += a._cpuMs; gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); } const ms = (performance.now() - t0) / n; a.renderer.setAnimationLoop((tt) => a.frame(tt)); return { ms, cpu: cpu / n }; }; 1`);

const sample = async (label) => {
  await p.eval(`__app.setWeather('clear'); __app.setTime('day'); __app.weather.amount = 0; __app.weather.wetness = 0; __app.weather.glass = 0; 1`);
  await sleep(6000);
  await p.eval(`__app.player.teleport(-2.0, 1.5, 0.64, -0.05); 1`);
  await sleep(1500);
  const b = await p.eval('__bench(40)');
  const m = await p.eval(`({ heap: performance.memory ? performance.memory.usedJSHeapSize : 0, geo: __app.renderer.info.memory.geometries, tex: __app.renderer.info.memory.textures, prog: __app.renderer.info.programs.length })`);
  const r = { label, frameMs: +b.ms.toFixed(2), cpuMs: +b.cpu.toFixed(2), heapMB: +(m.heap / 1048576).toFixed(1), geometries: m.geo, textures: m.tex, programs: m.prog };
  console.log(r);
  return r;
};

const KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
const KEYCHAR = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', KeyF: 'f', KeyE: 'e', KeyR: 'r', KeyT: 't', KeyL: 'l', ShiftLeft: 'Shift' };
const press = async (c) => { await p.key('keyDown', c, KEYCHAR[c]); await sleep(40); await p.key('keyUp', c, KEYCHAR[c]); };

const before = await sample('start');
const t0 = Date.now();
let steps = 0, actions = 0;
const spots = [[-4, -2], [-8, 3], [-3, 3], [2, 0.2], [7, 0.2], [2.2, -3], [6, -3], [11, -3], [8.6, 12], [-6, -10]];
while (Date.now() - t0 < MINUTES * 60000) {
  const s = spots[Math.floor(Math.random() * spots.length)];
  await p.eval(`__app.player.teleport(${s[0]}, ${s[1]}, ${Math.random() * 6.28}, 0); 1`);
  for (let i = 0; i < 6; i++) {
    const k = KEYS[Math.floor(Math.random() * 4)];
    await p.key('keyDown', k, KEYCHAR[k]);
    if (Math.random() < 0.3) await p.key('keyDown', 'ShiftLeft', 'Shift');
    await sleep(300 + Math.random() * 400);
    await p.key('keyUp', k, KEYCHAR[k]); await p.key('keyUp', 'ShiftLeft', 'Shift');
    await p.eval(`__app.player.yaw += ${(Math.random() - 0.5) * 2}; __app.player.pitch = ${(Math.random() - 0.5) * 0.6}; 1`);
    steps++;
    // interact with whatever is in focus
    const focused = await p.eval('!!__app.interaction.focus');
    if (focused || Math.random() < 0.15) { await press(Math.random() < 0.8 ? 'KeyF' : 'KeyE'); actions++; }
  }
  const r = Math.random();
  if (r < 0.2) await press('KeyR');
  else if (r < 0.35) await press('KeyT');
  else if (r < 0.45) await press('KeyL');
  else if (r < 0.5) await p.eval(`__app.setQuality(['low', 'medium', 'high'][Math.floor(Math.random() * 3)]); 1`);
}
await p.eval(`__app.setQuality('${args.quality || 'medium'}'); 1`);
const after = await sample('end');

// Per-frame work diagnostics at the end of the session
const diag = await p.eval(`(() => {
  const a = __app;
  let shadowRenders = 0, probeCaps = a.probes.captures;
  const orig = a.renderer.shadowMap.render.bind(a.renderer.shadowMap);
  a.renderer.shadowMap.render = (...args) => { if (a.renderer.shadowMap.needsUpdate || a.env.sun.shadow.needsUpdate) shadowRenders++; return orig(...args); };
  return new Promise(res => setTimeout(() => {
    a.renderer.shadowMap.render = orig;
    res({ shadowFramesPer2s: shadowRenders, probeCapturesPer2s: a.probes.captures - probeCaps, probeQueue: a.probes.queue.size,
      activeAnims: a.hub.active.size, calls: a.renderer.info.render.calls, lightsOn: a.lighting.groups.filter(g => g.on).map(g => g.id),
      appliancesOn: a.interaction.items.filter(i => i.type === 'appliance' && i.on).map(i => i.id),
      open: a.interaction.items.filter(i => i.isOpen).length, envChanging: a.env.changing, glass: a.globals.uGlassRain.value, wet: a.globals.uWetness.value });
  }, 2000));
})()`);
console.log('diagnostics', diag);
const errs = p.errors;
const out = {
  minutes: MINUTES, steps, interactions: actions, before, after,
  frameTimeChange: +(after.frameMs / before.frameMs - 1).toFixed(3),
  heapGrowthMB: +(after.heapMB - before.heapMB).toFixed(1),
  errors: errs.length,
  diagnostics: diag,
};
console.log(JSON.stringify(out, null, 2));
fs.mkdirSync(path.join(ROOT, 'tools', 'test-output'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'tools', 'test-output', 'soak.json'), JSON.stringify(out, null, 2));
try { await browser.close(); } catch (e) { /* ignore */ }
browser.proc.kill();
server.kill();
process.exit(errs.length ? 1 : 0);
