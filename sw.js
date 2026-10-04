// sw.js: the service worker. It makes TickFit work offline.
//
// How it works:
//   1. On install it downloads every file in APP_FILES into a cache.
//   2. For each request it asks the network first (so a new version shows up right away
//      when you are online) and falls back to the cache when the network is down or slow.
//
// MAINTAINERS: when you ADD a file to the app, add it to APP_FILES below, and bump
// CACHE_VERSION when you want everyone's cache rebuilt. (vendor/pdfjs is deliberately NOT listed: it is
// big, so it is cached the first time someone uploads a PDF instead.) `node tests/check-sw.mjs` checks the list.

const CACHE_VERSION = 'tickfit-v6';
const NETWORK_TIMEOUT_MS = 3000;

const APP_FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'js/app.js',
  'js/backup.js',
  'js/build.js',
  'js/builder.js',
  'js/ai.js',
  'js/dates.js',
  'js/dom.js',
  'js/exercises.js',
  'js/extract.js',
  'js/foods.js',
  'js/gemini.js',
  'js/icons.js',
  'js/editor.js',
  'js/logging.js',
  'js/more.js',
  'js/parser.js',
  'js/plans.js',
  'js/progress.js',
  'js/safety.js',
  'js/schedule.js',
  'js/sheet.js',
  'js/stats.js',
  'js/store.js',
  'js/theme.js',
  'js/theme-boot.js',
  'js/timer.js',
  'js/today.js',
  'data/sample-plan.json',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  // Delete caches from older versions.
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Only handle our own GET requests. Anything else (like the Gemini API) goes straight to the network.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  event.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const fresh = await withTimeout(fetch(req), NETWORK_TIMEOUT_MS);
    if (fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch {
    // Offline or slow: serve from the cache. Navigations fall back to the app page.
    const cached = (await cache.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? await cache.match('index.html') : null);
    return cached || new Response('Offline and not cached yet.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
  }
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => (clearTimeout(t), resolve(v)),
      (e) => (clearTimeout(t), reject(e))
    );
  });
}
