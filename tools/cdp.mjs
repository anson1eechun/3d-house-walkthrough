// Minimal Chrome DevTools Protocol driver (Node >= 22, no dependencies).
// Used by tools/smoke-test.mjs to run the walkthrough in a real Chrome and
// inspect it: console errors, network requests, JS evaluation, screenshots.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].filter(Boolean);

export function findChrome() {
  for (const c of CANDIDATES) if (fs.existsSync(c)) return c;
  throw new Error('Chrome not found; set CHROME_PATH');
}

export async function launch({ headless = true, width = 1600, height = 900, offline = true, gpu = 'auto', extraArgs = [] } = {}) {
  const userDir = fs.mkdtempSync(path.join(os.tmpdir(), 'house-cdp-'));
  const args = [
    `--user-data-dir=${userDir}`, '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check',
    `--window-size=${width},${height}`, '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--autoplay-policy=no-user-gesture-required', '--ignore-gpu-blocklist', '--enable-unsafe-webgpu',
  ];
  if (headless) args.push('--headless=new');
  if (gpu === 'swiftshader') args.push('--use-angle=swiftshader', '--enable-unsafe-swiftshader');
  else if (gpu === 'vulkan') args.push('--use-angle=vulkan', '--enable-features=Vulkan');
  else if (gpu === 'egl') args.push('--use-gl=angle', '--use-angle=gl-egl');
  if (offline) {
    // Every hostname except localhost fails to resolve and no proxy is reachable:
    // any request that leaves the machine errors out (simulated disconnected network).
    args.push('--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE localhost , EXCLUDE 127.0.0.1');
    args.push('--proxy-server=http://127.0.0.1:9', '--proxy-bypass-list=<-loopback>;localhost;127.0.0.1');
  }
  args.push(...extraArgs, 'about:blank');
  // Own process group so the whole Chrome tree (GPU, renderer, utility processes)
  // can be killed together, even when the calling script crashes.
  const detached = process.platform !== 'win32';
  const proc = spawn(findChrome(), args, { stdio: ['ignore', 'ignore', 'pipe'], detached });
  const killTree = () => {
    try { if (detached) process.kill(-proc.pid, 'SIGKILL'); else proc.kill('SIGKILL'); } catch (e) { /* already gone */ }
    try { fs.rmSync(userDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  };
  process.on('exit', killTree);
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { killTree(); process.exit(130); });
  process.on('uncaughtException', (e) => { console.error(e); killTree(); process.exit(1); });
  process.on('unhandledRejection', (e) => { console.error(e); killTree(); process.exit(1); });
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    const t = setTimeout(() => reject(new Error('Chrome did not start')), 20000);
    proc.stderr.on('data', (d) => {
      buf += d.toString();
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) { clearTimeout(t); resolve(m[1]); }
    });
    proc.on('exit', (c) => reject(new Error('Chrome exited ' + c + '\n' + buf.slice(-2000))));
  });
  const browser = await connect(wsUrl);
  // keep the old API (browser.proc.kill()) but make it take down the whole tree
  browser.proc = { pid: proc.pid, kill: killTree };
  browser.userDir = userDir;
  return browser;
}

async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
    } else if (msg.method) {
      for (const fn of listeners.get(msg.method) || []) fn(msg.params, msg.sessionId);
    }
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params, sessionId }));
  });
  const on = (method, fn) => { if (!listeners.has(method)) listeners.set(method, []); listeners.get(method).push(fn); };
  return {
    send, on, ws,
    async newPage() {
      const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
      const s = (m, p) => send(m, p, sessionId);
      const page = {
        targetId, sessionId, send: s,
        console: [], errors: [], requests: [],
        async goto(url) { await s('Page.navigate', { url }); },
        async eval(expr, { awaitPromise = true, timeout = 60000 } = {}) {
          const r = await Promise.race([
            s('Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true }),
            new Promise((_, rej) => setTimeout(() => rej(new Error('eval timeout: ' + expr.slice(0, 80))), timeout)),
          ]);
          if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
          return r.result.value;
        },
        async waitFor(expr, timeout = 120000, interval = 250) {
          const t0 = Date.now();
          for (;;) {
            const v = await page.eval(expr).catch(() => false);
            if (v) return v;
            if (Date.now() - t0 > timeout) throw new Error('timeout waiting for ' + expr);
            await new Promise(r => setTimeout(r, interval));
          }
        },
        async screenshot(file) {
          const { data } = await s('Page.captureScreenshot', { format: 'png' });
          fs.writeFileSync(file, Buffer.from(data, 'base64'));
          return file;
        },
        async key(type, code, key) { await s('Input.dispatchKeyEvent', { type, code, key: key || code, windowsVirtualKeyCode: 0 }); },
        async click(x, y) {
          await s('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
          await s('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
        },
      };
      on('Runtime.consoleAPICalled', (p, sid) => { if (sid === sessionId) page.console.push({ type: p.type, text: p.args.map(a => a.value ?? a.description ?? '').join(' ') }); });
      on('Runtime.exceptionThrown', (p, sid) => { if (sid === sessionId) page.errors.push(p.exceptionDetails.exception?.description || p.exceptionDetails.text); });
      on('Log.entryAdded', (p, sid) => { if (sid === sessionId && p.entry.level === 'error') page.errors.push('[log] ' + p.entry.text + ' ' + (p.entry.url || '')); });
      on('Network.requestWillBeSent', (p, sid) => { if (sid === sessionId) page.requests.push(p.request.url); });
      await s('Runtime.enable'); await s('Log.enable'); await s('Network.enable'); await s('Page.enable');
      return page;
    },
    async close() {
      try { await send('Browser.close'); } catch (e) { /* ignore */ }
      ws.close();
    },
  };
}
