#!/usr/bin/env node
// Local static server (Node.js >= 16, no dependencies). Usage: node serve.mjs [--port 8765] [--no-browser]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8',
};
const args = process.argv.slice(2);
let port = Number(args[args.indexOf('--port') + 1]) || 8765;
const openBrowser = !args.includes('--no-browser');

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
});

function listen(tries = 0) {
  server.once('error', (e) => {
    if (e.code === 'EADDRINUSE' && tries < 20) { port++; listen(tries + 1); }
    else { console.error(e.message); process.exit(1); }
  });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://localhost:${port}/`;
    console.log('='.repeat(60));
    console.log('  現代住宅 3D 看房  -  本機伺服器已啟動');
    console.log('  請用瀏覽器開啟： ' + url);
    console.log('  （按 Ctrl+C 結束）');
    console.log('='.repeat(60));
    if (openBrowser) {
      const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
      exec(cmd, () => {});
    }
  });
}
listen();
