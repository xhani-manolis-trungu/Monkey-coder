/*
 * Service worker: keeps a copy of the game on the device so the installed app
 * opens instantly and works with no internet. Files are served from the copy
 * and refreshed in the background, so a new version shows up on the next start.
 */
'use strict';

var CACHE = 'monkey-coder-v1';

// Everything the game needs. tests/pwa.test.js checks that this list is complete.
var FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'js/assets.js',
  'js/sound.js',
  'js/blocks.js',
  'js/engine.js',
  'js/levels.js',
  'js/templates.js',
  'js/stage.js',
  'js/editor.js',
  'js/tour.js',
  'js/app.js',
  'fonts/baloo-2-latin-wght-normal.woff2',
  'fonts/baloo-2-latin-ext-wght-normal.woff2',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE)
      .then(function (cache) { return cache.addAll(FILES); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
      })
      .then(function () { return self.clients.claim(); })
  );
});

// Answer from the saved copy straight away, and fetch a fresh copy for next time.
self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;

  var fresh = fetch(req).then(function (res) {
    if (!res || !res.ok) return res;
    var copy = res.clone();
    return caches.open(CACHE).then(function (cache) { return cache.put(req, copy); }).then(function () { return res; });
  });
  // Keep the worker alive until the fresh copy is saved (even if we answered from the cache).
  event.waitUntil(fresh.catch(function () {}));

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then(function (saved) {
      if (saved) return saved;
      return fresh.catch(function () {
        // Offline and not saved yet: opening the app still shows the game.
        return req.mode === 'navigate' ? caches.match('index.html') : Response.error();
      });
    })
  );
});
