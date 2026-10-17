/* ENCOR study app - service worker.
   - App files (the "shell") are cached for offline use, in a versioned cache.
   - Encrypted data files are cached as you open them (the URL carries a version, so new data = new download).
   - Firebase library files are cached so sign-in screens and the app start offline.
   - A new version waits until you tap "Update now" in the app (no surprise reloads mid-test).
   tools/stamp_version.py rewrites the BUILD and SHELL_FILES lines below. */
// >>> stamped
const BUILD = 'd4f448fa';
const SHELL_FILES = [
  './',
  'css/app.css',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'index.html',
  'js/app.js',
  'js/auth.js',
  'js/crypto.js',
  'js/dashboard.js',
  'js/data.js',
  'js/exam.js',
  'js/flashcards.js',
  'js/practice.js',
  'js/study.js',
  'js/sync.js',
  'js/test.js',
  'js/ui.js',
  'js/util.js',
  'js/version.js',
  'manifest.json'
];
// <<< stamped

const SHELL = 'encor-shell-' + BUILD;
const DATA = 'encor-data';
const CDN = 'encor-cdn';

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)));   // no skipWaiting: the app asks the user first
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('encor-shell-') && k !== SHELL) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type === 'SKIP_WAITING') self.skipWaiting();
  else if (d.type === 'KEEP_DATA') e.waitUntil(pruneData(d.urls || []));
  else if (d.type === 'CACHE_URLS') e.waitUntil(warm(d.urls || []));
});

async function pruneData(urls) {
  const keep = new Set(urls.map(u => new URL(u, self.registration.scope).href));
  const c = await caches.open(DATA);
  for (const r of await c.keys()) if (!r.url.endsWith('data-manifest.json') && !keep.has(r.url)) await c.delete(r);
}
async function warm(urls) {
  const c = await caches.open(CDN);
  for (const u of urls) { if (!(await c.match(u))) { try { const r = await fetch(u, { mode: 'cors' }); if (r.ok) await c.put(u, r); } catch (e) { /* later */ } } }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.includes('/data/')) {
      if (url.pathname.endsWith('data-manifest.json')) return e.respondWith(networkFirst(req, DATA));   // always try for the newest list
      return e.respondWith(cacheFirst(req, DATA));                                                   // .enc URLs carry ?v=hash
    }
    if (req.mode === 'navigate') return e.respondWith(caches.open(SHELL).then(c => c.match('index.html')).then(r => r || fetch(req)));
    return e.respondWith(caches.open(SHELL).then(c => c.match(req, { ignoreSearch: true })).then(r => r || fetch(req)));
  }
  if (url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')) return e.respondWith(cacheFirst(req, CDN));
  // everything else (Firebase Auth / Firestore network calls) goes straight to the network
});

async function cacheFirst(req, name) {
  const c = await caches.open(name), hit = await c.match(req);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok) c.put(req, r.clone());
  return r;
}
async function networkFirst(req, name) {
  const c = await caches.open(name);
  try { const r = await fetch(req); if (r.ok) c.put(req, r.clone()); return r; }
  catch (err) { const hit = await c.match(req); if (hit) return hit; throw err; }
}
