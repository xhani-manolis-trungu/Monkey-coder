/* Checks for the installable (PWA) version: the manifest, its icons, and the
   service worker's list of files to keep offline. */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function pngSize(file) {
  const buf = fs.readFileSync(path.join(ROOT, file));
  assert.strictEqual(buf.toString('ascii', 1, 4), 'PNG', file + ' is a PNG');
  return [buf.readUInt32BE(16), buf.readUInt32BE(20)];
}

function offlineFiles() {
  const m = /var FILES = \[([\s\S]*?)\];/.exec(read('sw.js'));
  assert.ok(m, 'sw.js has a FILES list');
  return m[1].match(/'[^']+'/g).map((s) => s.slice(1, -1));
}

test('the manifest is valid and its icons exist at the stated sizes', () => {
  const manifest = JSON.parse(read('manifest.webmanifest'));
  for (const key of ['name', 'short_name', 'start_url', 'display', 'icons', 'theme_color', 'background_color']) {
    assert.ok(manifest[key], 'manifest has ' + key);
  }
  assert.ok(manifest.icons.some((i) => i.sizes === '192x192'), 'has a 192px icon');
  assert.ok(manifest.icons.some((i) => i.sizes === '512x512' && i.purpose === 'any'), 'has a 512px icon');
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'), 'has a maskable icon for Android');
  for (const icon of manifest.icons) {
    const [w, h] = pngSize(icon.src);
    assert.strictEqual(w + 'x' + h, icon.sizes, icon.src);
  }
  assert.deepStrictEqual(pngSize('icons/apple-touch-icon.png'), [180, 180]);
});

test('every file the service worker keeps offline exists', () => {
  for (const f of offlineFiles()) {
    if (f === './') continue;
    assert.ok(fs.existsSync(path.join(ROOT, f)), f + ' exists');
  }
});

test('everything the page loads is kept offline', () => {
  const files = new Set(offlineFiles());
  const html = read('index.html');
  const used = [];
  html.replace(/<script src="([^"]+)"/g, (_, f) => used.push(f));
  html.replace(/<link[^>]+href="([^"]+)"/g, (_, f) => { if (!/^(data:|https?:)/.test(f)) used.push(f); });
  read('css/style.css').replace(/url\(["']?\.\.\/([^"')]+)["']?\)/g, (_, f) => used.push(f));
  assert.ok(used.some((f) => f.startsWith('fonts/')), 'found the font files in the CSS');
  for (const f of used) assert.ok(files.has(f), f + ' is in the service worker list');
  for (const f of fs.readdirSync(path.join(ROOT, 'js'))) assert.ok(files.has('js/' + f), 'js/' + f + ' is kept offline');
});
