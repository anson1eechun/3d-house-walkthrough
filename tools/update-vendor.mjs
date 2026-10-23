#!/usr/bin/env node
// Re-creates vendor/three from the npm registry (needs internet once; the
// project itself never needs the network). Usage: node tools/update-vendor.mjs [version]
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = process.argv[2] || JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).vendored.three;
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'three-vendor-'));
console.log(`Downloading three@${version} ...`);
execSync(`npm pack three@${version}`, { cwd: tmp, stdio: 'inherit' });
const tgz = fs.readdirSync(tmp).find(f => f.endsWith('.tgz'));
execSync(`tar xzf "${tgz}"`, { cwd: tmp });
const src = path.join(tmp, 'package');
const dst = path.join(ROOT, 'vendor', 'three');
fs.rmSync(dst, { recursive: true, force: true });
fs.mkdirSync(path.join(dst, 'build'), { recursive: true });
for (const f of ['three.module.js', 'three.core.js']) fs.copyFileSync(path.join(src, 'build', f), path.join(dst, 'build', f));
for (const f of ['LICENSE', 'package.json']) fs.copyFileSync(path.join(src, f), path.join(dst, f));
// Only the addon folders the project imports from (plus their internal dependencies).
for (const d of ['postprocessing', 'shaders', 'geometries', 'utils', 'math', 'objects', 'environments', 'lights']) {
  fs.cpSync(path.join(src, 'examples', 'jsm', d), path.join(dst, 'examples', 'jsm', d), { recursive: true });
}
// These addons import modules we do not ship; remove them so nothing can fail to resolve.
for (const f of ['objects/GaussianSplat.js', 'utils/GaussianSplatUtils.js', 'geometries/TextGeometry.js']) {
  fs.rmSync(path.join(dst, 'examples', 'jsm', f), { force: true });
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`vendor/three updated to ${version}`);
