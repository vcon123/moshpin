/* MoshPin — service worker.
   The app shell is cached on first visit, so it opens instantly and works with
   no signal: you keep the timetable, your picks and the last chat you loaded.
   Only live sync needs a connection. */
const V = 'mp-v1';
const SHELL = [
  './', './index.html', './app.html', './grid.html',
  './app.css', './core.js', './landing.js', './grid.js',
  './festival.js', './checkin.js', './social.js', './transport.js',
  './qr.js', './vendor-qrcode.mjs', './logo.png', './map.png', './stage-alpha.png', './stage-bravo.png', './stage-armadillow.png', './stage-heineken.png', './stage-hacienda.png', './stage-india.png', './stage-lima.png', './stage-x-ray.png', './stage-adonis.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  /* never cache Firebase or fonts-as-data: those must be live or absent */
  if (url.hostname.includes('firebase') || url.hostname.includes('googleapis')
      || url.hostname.includes('gstatic')) return;

  if (url.origin === location.origin) {
    /* our own files: serve from cache first, refresh in the background */
    e.respondWith(caches.match(e.request).then(hit => {
      const net = fetch(e.request).then(res => {
        if (res && res.ok) caches.open(V).then(c => c.put(e.request, res.clone()));
        return res;
      }).catch(() => hit);
      return hit || net;
    }));
  }
});
