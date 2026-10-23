#!/usr/bin/env node
// Automated smoke test: serves the project locally, opens it in Chrome with
// every non-localhost request blocked (simulated offline machine), then drives
// the walkthrough with real keyboard events and checks the core behaviours.
//
//   node tools/smoke-test.mjs [--headed] [--gpu=egl|vulkan|swiftshader|auto] [--quality=medium]
//
// Requires Google Chrome / Chromium. Screenshots go to tools/test-output/.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tools', 'test-output');
fs.mkdirSync(OUT, { recursive: true });
const args = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? true]));
const PORT = 8790;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail: String(detail) }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  — ' + detail : '')); };

const server = spawn(process.execPath, [path.join(ROOT, 'serve.mjs'), '--port', String(PORT), '--no-browser'], { stdio: 'ignore' });
await sleep(800);

const browser = await launch({ headless: !args.headed, gpu: args.gpu || 'egl', offline: true });
const p = await browser.newPage();
const W = 1280, H = 720;
await p.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
const URL = `http://localhost:${PORT}/`;
const t0 = Date.now();
await p.goto(URL);
try {
  await p.waitFor('window.__appReady === true || !document.getElementById("error").classList.contains("hidden")', 240000);
} catch (e) { /* reported below */ }
const ready = await p.eval('!!window.__appReady');
check('A1 啟動完成（無錯誤畫面）', ready, `${((Date.now() - t0) / 1000).toFixed(1)} s`);
if (!ready) {
  const err = await p.eval(`document.getElementById('error-title').textContent + ' ' + document.getElementById('error-detail').textContent`);
  console.log(err, p.errors);
  await finish();
}
const gpu = await p.eval(`document.getElementById('gpu-info').textContent`);
console.log(gpu);

const external = p.requests.filter(u => !/^(http:\/\/localhost[:/]|http:\/\/127\.0\.0\.1[:/]|data:|blob:|about:)/.test(u));
check('A2 沒有任何外部網路請求', external.length === 0, external.length ? external.slice(0, 3).join(', ') : `${p.requests.length} 個請求皆為本機`);

const Q = args.quality || 'medium';
await p.eval(`__app.setQuality('${Q}'); __app.debugStart(); 1`);
await sleep(1500);

const pos = () => p.eval(`({ x: __app.player.position.x, z: __app.player.position.z, y: __app.player.feetY })`);
const tp = (x, z, yaw = 0, pitch = 0) => p.eval(`__app.player.teleport(${x}, ${z}, ${yaw}, ${pitch}); 1`);
const look = (x, y, z) => p.eval(`__app.player.lookAt(${x}, ${y}, ${z}); 1`);
const KEY = { KeyW: 'w', KeyA: 'a', KeyS: 's', KeyD: 'd', KeyF: 'f', KeyE: 'e', KeyR: 'r', KeyT: 't', ShiftLeft: 'Shift' };
const down = (c) => p.key('keyDown', c, KEY[c]);
const up = (c) => p.key('keyUp', c, KEY[c]);
const hold = async (codes, ms) => { for (const c of codes) await down(c); await sleep(ms); for (const c of codes) await up(c); await sleep(150); };
const press = async (c) => { await down(c); await sleep(40); await up(c); };
const focus = () => p.eval(`(() => { const f = __app.interaction.focus; return f ? { id: f.id, type: f.type, prompt: f.prompt(), busy: f.busy } : null; })()`);
const shot = (name) => p.screenshot(path.join(OUT, name + '.png'));
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

// ---------------------------------------------------------------- C: movement
await tp(8.6, 22, 0); await sleep(300);
let a = await pos(); await hold(['KeyW'], 1000); let b = await pos();
const walk = dist(a, b);
check('C1 W 前進（delta time 速度）', walk > 1.8 && walk < 3.2 && b.z < a.z, `1 秒移動 ${walk.toFixed(2)} m`);
await tp(8.6, 22, 0); await sleep(300);
a = await pos(); await hold(['KeyW', 'KeyD'], 1000); b = await pos();
const diag = dist(a, b);
check('C2 斜向移動不會更快', Math.abs(diag - walk) / walk < 0.15, `斜向 ${diag.toFixed(2)} m vs 直行 ${walk.toFixed(2)} m`);
await tp(8.6, 22, 0); await sleep(300);
a = await pos(); await hold(['ShiftLeft', 'KeyW'], 1000); b = await pos();
check('C3 Shift 加速', dist(a, b) > walk * 1.6, `${dist(a, b).toFixed(2)} m`);
await tp(8.6, 22, 0); await sleep(200);
a = await pos(); await hold(['KeyS'], 800); b = await pos();
await hold(['KeyA'], 800); const c = await pos();
check('C4 S 後退 / A 左移', b.z > a.z + 1 && c.x < b.x - 1, `S Δz=${(b.z - a.z).toFixed(2)}, A Δx=${(c.x - b.x).toFixed(2)}`);

// ------------------------------------------------------------ C: collisions
await tp(-13.6, -3.0, -Math.PI / 2); await sleep(300);
await hold(['KeyW'], 2500); b = await pos();
check('C5 外牆碰撞（客廳西牆）', b.x < -12.125 - 0.2, `停在 x=${b.x.toFixed(3)}（牆外側面 -12.125）`);
await tp(5.6, -1.35, Math.PI / 2); await sleep(300);
await hold(['ShiftLeft', 'KeyW'], 2500); b = await pos();
check('C6 室內隔間牆碰撞（主臥/浴室）', b.x > 3.56 + 0.2, `停在 x=${b.x.toFixed(3)}（牆面 3.56）`);
await tp(-9.15, -1.6, 0); await sleep(300);
await hold(['KeyW'], 2000); b = await pos();
check('C7 家具碰撞（茶几）', b.z > -2.95 + 0.36 + 0.2, `停在 z=${b.z.toFixed(2)}`);

// ------------------------------------------------------------- D: front door
await tp(1.75, 2.6, 0); await sleep(300);
await hold(['KeyW'], 2000); b = await pos();
check('D1 關閉的大門會阻擋通行', b.z > 1.3, `停在 z=${b.z.toFixed(2)}`);
await tp(1.75, 2.6, 0); await sleep(200);
await look(1.75, 1.25, 1.0); await sleep(300);
let f = await focus();
check('D2 注視大門時顯示正確提示', f && f.id === 'door-front' && /開啟大門/.test(f.prompt), f ? `${f.id} / ${f.prompt}` : '無焦點');
await shot('door_prompt');
await press('KeyF'); await sleep(150);
await press('KeyF');   // second press during the animation must be ignored
await sleep(1700);
let st = await p.eval(`__app.interaction.byId('door-front').anim.state`);
check('D3 F 開門（動畫中重複按鍵被忽略）', st === 'open', `state=${st}`);
await tp(1.75, 2.6, 0); await sleep(200);
await hold(['KeyW'], 2600); b = await pos();
check('D4 開門後可以通行進入玄關', b.z < 0.7 && b.z > -0.6, `進入後 z=${b.z.toFixed(2)}`);
// aim at the swung-open leaf (it now stands perpendicular to the facade)
const leaf = await p.eval(`(() => { const c = __app.interaction.byId('door-front').collider; return { x: c.cx, z: c.cz }; })()`);
await look(leaf.x, 1.2, leaf.z); await sleep(300);
f = await focus();
await press('KeyF'); await sleep(1700);
st = await p.eval(`__app.interaction.byId('door-front').anim.state`);
check('D5 由室內關門', f && f.id === 'door-front' && st === 'closed', `focus=${f && f.id}, state=${st}`);
await p.eval(`__app.player.yaw = Math.PI; __app.player.pitch = 0; 1`);   // face the door (south)
await hold(['KeyW'], 2000); b = await pos();
check('D6 門關閉後恢復碰撞', b.z < 0.875 && b.z > 0.3, `往門口走停在 z=${b.z.toFixed(2)}`);

// --------------------------------------------------------- D: bedroom door
await tp(4.45, 0.35, 0); await sleep(200);
await look(4.45, 1.2, -0.6); await sleep(300);
f = await focus();
await press('KeyF'); await sleep(1400);
st = await p.eval(`__app.interaction.byId('door-bed1').anim.state`);
check('D7 主臥室房門開啟', f && f.id === 'door-bed1' && st === 'open', `focus=${f && f.id}, state=${st}`);
await tp(4.45, 0.35, 0); await sleep(200);
await hold(['KeyW'], 2200); b = await pos();
check('D8 穿過房門（狹窄門框不卡住）', b.z < -1.2, `z=${b.z.toFixed(2)}`);
const room = await p.eval(`document.getElementById('room-name').textContent`);
check('B1 房間名稱顯示', room === '主臥室', room);

// --------------------------------------------------------- D: light switch
await tp(-1.2, -1.0, -Math.PI / 2); await sleep(200);
await look(-0.125, 1.3, -1.0); await sleep(300);
f = await focus();
const before = await p.eval(`__app.lighting.byId.get('living').lights.map(l => l.light.intensity).reduce((s, v) => s + v, 0)`);
await press('KeyF'); await sleep(900);
const after = await p.eval(`__app.lighting.byId.get('living').lights.map(l => l.light.intensity).reduce((s, v) => s + v, 0)`);
check('D9 開關控制客廳燈光（實際燈光強度）', f && f.type === 'light' && before === 0 && after > 10, `focus=${f && f.prompt}; ${before.toFixed(1)} → ${after.toFixed(1)} cd`);
await shot('living_lights_on');
await press('KeyE'); await sleep(900);
const dim = await p.eval(`__app.lighting.byId.get('living').current`);
check('D10 E 調光', Math.abs(dim - 0.55) < 0.05, `level=${dim.toFixed(2)}`);
await press('KeyF'); await sleep(900);
const off = await p.eval(`__app.lighting.byId.get('living').lights.map(l => l.light.intensity).reduce((s, v) => s + v, 0)`);
check('D11 再按 F 關燈', off < 0.1, `${off.toFixed(2)} cd`);

// ------------------------------------------------------------- D: drawer
await tp(-4.9, 5.25, Math.PI); await sleep(200);
await look(-4.9, 0.85, 6.25); await sleep(300);
f = await focus();
await press('KeyF'); await sleep(80); await press('KeyF'); await sleep(1000);
const drawerState = f ? await p.eval(`__app.interaction.byId('${f.id}').anim.state`) : 'none';
check('D12 廚房抽屜開啟（連按不會錯亂）', f && /抽屜/.test(f.prompt) && drawerState === 'open', `${f && f.prompt} → ${drawerState}`);
await shot('drawer_open');
await press('KeyF'); await sleep(1000);
const drawerState2 = f ? await p.eval(`__app.interaction.byId('${f.id}').anim.state`) : 'none';
check('D13 抽屜關閉', drawerState2 === 'closed', drawerState2);
// fridge
await tp(-1.6, 5.2, -Math.PI / 2); await sleep(200);
await look(-0.74, 1.4, 5.2); await sleep(300);
f = await focus();
await press('KeyF'); await sleep(1300);
const fr = f ? await p.eval(`__app.interaction.byId('${f.id}').anim.state`) : 'none';
check('D14 冰箱門開啟', f && /冰箱/.test(f.prompt || '') || fr === 'open', `${f && f.prompt} → ${fr}`);
await shot('fridge_open');

// ------------------------------------------------------------- D: window
await tp(5.15, -5.7, 0); await sleep(200);
await look(5.1, 1.5, -7.0); await sleep(300);
f = await focus();
await press('KeyF'); await sleep(1500);
const ws = f ? await p.eval(`__app.interaction.byId('${f.id}').anim.state`) : 'none';
check('D15 主臥窗戶開啟', f && f.type === 'window' && ws === 'open', `${f && f.prompt} → ${ws}`);
await shot('window_open');

// ----------------------------------------------------- D: sliding glass door
await tp(-5.3, -5.4, 0); await sleep(200);
await look(-5.3, 1.2, -7.0); await sleep(300);
f = await focus();
await press('KeyF'); await sleep(2000);
await tp(-5.3, -5.4, 0); await sleep(200);
await hold(['KeyW'], 2400); b = await pos();
check('D16 落地推拉門開啟後可走到露台', f && f.id === 'glass-living' && b.z < -7.4, `${f && f.prompt}; z=${b.z.toFixed(2)}`);

// ------------------------------------------------------ E/F: weather & state
const mem0 = await p.eval(`({ g: __app.renderer.info.memory.geometries, t: __app.renderer.info.memory.textures, p: __app.renderer.info.programs.length })`);
for (let i = 0; i < 3; i++) {
  await press('KeyR'); await sleep(2500);
  await press('KeyR'); await sleep(1500);
}
await press('KeyR'); await sleep(9000);
const wet = await p.eval(`({ rain: __app.globals.uRain.value, wet: __app.globals.uWetness.value, glass: __app.globals.uGlassRain.value, streaks: __app.rain.streaks.visible, refl: __app.reflection.uniforms.uReflOn.value })`);
check('E1 雨天：雨滴 / 濕地面 / 玻璃水珠同步', wet.rain > 0.5 && wet.wet > 0.4 && wet.glass > 0.4 && wet.streaks, JSON.stringify(wet));
await tp(9.2, 12, 0.1, -0.12); await sleep(2500);
await shot('rain_driveway');
await tp(6.0, -4.6, 0.25, -0.05); await sleep(2000);
await shot('rain_window_drops');
const mem1 = await p.eval(`({ g: __app.renderer.info.memory.geometries, t: __app.renderer.info.memory.textures, p: __app.renderer.info.programs.length })`);
check('F2 反覆切換天氣不累積資源', mem1.g <= mem0.g + 2 && mem1.t <= mem0.t + 2, `geo ${mem0.g}→${mem1.g}, tex ${mem0.t}→${mem1.t}, programs ${mem0.p}→${mem1.p}`);
await press('KeyR'); await sleep(500);

// time of day cycle
await press('KeyT'); await sleep(1500); await press('KeyT'); await sleep(1500);
const tod = await p.eval(`__app.env.time`);
check('E2 時段切換（T）', tod === 'night', tod);
await press('KeyT'); await sleep(500);

// quality switching keeps player and object state
const doorBefore = await p.eval(`__app.interaction.byId('door-bed1').anim.state`);
const pBefore = await pos();
for (const q of ['low', 'high', Q]) { await p.eval(`__app.setQuality('${q}'); 1`); await sleep(1200); }
const pAfter = await pos();
const doorAfter = await p.eval(`__app.interaction.byId('door-bed1').anim.state`);
check('F4 切換畫質不影響位置與物件狀態', dist(pBefore, pAfter) < 0.05 && doorBefore === doorAfter, `door ${doorBefore}→${doorAfter}, Δpos ${dist(pBefore, pAfter).toFixed(3)}`);

// resize
await p.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 600, deviceScaleFactor: 1, mobile: false });
await sleep(800);
const sz = await p.eval(`({ w: __app.renderer.domElement.width, h: __app.renderer.domElement.height, cw: __app.post.composer.renderTarget1.width })`);
check('F1 視窗縮放', sz.w === 900 && sz.h === 600 && sz.cw === 900, JSON.stringify(sz));
await p.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await sleep(500);

// random walk stress test
await tp(-3, 1, 0); await sleep(200);
const keys = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
let bad = 0;
for (let i = 0; i < 40; i++) {
  const k = [keys[Math.floor(Math.random() * 4)]];
  if (Math.random() < 0.4) k.push('ShiftLeft');
  await p.eval(`__app.player.yaw = ${Math.random() * Math.PI * 2}; 1`);
  await hold(k, 350);
  const q = await pos();
  if (!(Number.isFinite(q.x) && Number.isFinite(q.z) && q.y >= -0.01 && q.y <= 0.2)) bad++;
}
const q = await pos();
check('C8 隨機走動 40 次：不會穿地或出現 NaN', bad === 0, `最終位置 ${q.x.toFixed(2)}, ${q.z.toFixed(2)}, 腳高 ${q.y.toFixed(3)}`);

// room labels
const rooms = [['客廳', -6, -4], ['餐廳', -9, 1.5], ['廚房', -3, 2.5], ['走廊', 7, 0.2], ['浴室', 1.8, -3], ['主臥室', 6, -3], ['次臥室', 11, -2.5], ['前院', 10, 5], ['後院露台', -9, -9]];
let okRooms = 0, miss = [];
for (const [name, x, z] of rooms) {
  await tp(x, z, 0); await sleep(250);
  const r = await p.eval(`document.getElementById('room-name').textContent`);
  if (r === name) okRooms++; else miss.push(`${name}≠${r}`);
}
check('B2 各房間名稱判定', okRooms === rooms.length, miss.join(', ') || `${okRooms}/${rooms.length}`);

check('A5 執行期間沒有 JavaScript 錯誤', p.errors.length === 0, p.errors.slice(0, 3).join(' | ') || '0 errors');
await finish();

async function finish() {
  const pass = results.filter(r => r.ok).length;
  console.log(`\n${pass}/${results.length} passed`);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ date: new Date().toISOString(), gpu, results }, null, 2));
  try { await browser.close(); } catch (e) { /* ignore */ }
  browser.proc.kill();
  server.kill();
  process.exit(pass === results.length ? 0 : 1);
}
