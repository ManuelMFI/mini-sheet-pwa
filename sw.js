/* sw.js — service worker: precache delle risorse statiche + cache-first => funziona offline.
   Percorsi RELATIVI: valgono sia su GitHub Pages (sottocartella) sia su Vercel (root). */
const CACHE = 'mini-sheet-v1';   // cambia il numero quando modifichi i file, per aggiornare la cache
const FILES = ['./', './index.html', './manifest.json', './css/bootstrap.min.css', './css/style.css',
  './js/coordinates.js', './js/engine.js', './js/app.js', './icons/icon-192.png', './icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES))); self.skipWaiting(); });
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(r => r || fetch(e.request)));   // prima cache, poi rete
});
