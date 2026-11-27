// App-shell cache for offline study. AI calls (/api) always go to the network.
const VERSION = 'pp-v87';
// Packs are fetched on demand (content/packs/<id>.json?v=...) and cached by the fetch handler below.
const SHELL = ['./', 'index.html', 'app.css', 'manifest.webmanifest', 'js/app.js', 'js/plan.js', 'js/content.js', 'js/store.js', 'js/ai.js', 'js/auth.js', 'js/voice.js', 'js/realtime.js', 'js/config.js', 'js/diagrams.js', 'js/diagram-data.js', 'js/animate.js', 'js/pip.js', 'content/roles.json', 'content/packs/index.json', 'fonts/newsreader.woff2', 'fonts/instrument-sans.woff2', 'icons/icon.svg', 'icons/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // Network first so content updates show up; cache as offline fallback.
  e.respondWith(
    fetch(e.request)
      // Only keep good answers: during an outage the server returns 404 pages, and caching those
      // would keep showing 'not found' after the site is back.
      .then(res => { if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); } return res; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html'))),
  );
});
