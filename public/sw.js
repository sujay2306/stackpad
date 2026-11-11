// Stackpad service worker: offline-first app shell.
// - Precaches the shell and every built asset (the list is filled in at build time by
//   the swPrecache plugin in vite.config.js).
// - Only same-origin GET requests are handled. Supabase, Google sign-in, fonts and any
//   other cross-origin request go straight to the network and are never cached.
// - Page loads are network-first (fresh deploys show up), falling back to the cached shell
//   offline. Hashed assets under /assets/ are cache-first.
const VERSION = 'dev';
const PRECACHE = [];
const CACHE = `stackpad-${VERSION}`;
const SHELL = '/index.html';
const NAV_TIMEOUT = 4000;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll([...new Set(['/', SHELL, ...PRECACHE])].map((u) => new Request(u, { cache: 'reload' })));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('stackpad-') && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase, OAuth, fonts: never touched
  if (url.pathname === '/sw.js') return;
  if (req.mode === 'navigate') { e.respondWith(page(req, url)); return; }
  if (url.pathname.startsWith('/assets/')) { e.respondWith(cacheFirst(req)); return; }
  e.respondWith(staleWhileRevalidate(req));
});

async function page(req, url) {
  const cache = await caches.open(CACHE);
  try {
    const res = await withTimeout(fetch(req), NAV_TIMEOUT);
    // Only the bare shell is stored; URLs with a query (e.g. ?code= from sign-in) are never cached.
    if (res.ok && res.type === 'basic' && !url.search && (url.pathname === '/' || url.pathname === SHELL)) {
      cache.put(SHELL, res.clone());
    }
    return res;
  } catch {
    return (await cache.match(SHELL)) || (await cache.match('/')) || Response.error();
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok && res.type === 'basic') cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch: false });
  const net = fetch(req).then((res) => {
    if (res.ok && res.type === 'basic') cache.put(req, res.clone());
    return res;
  });
  if (hit) { net.catch(() => {}); return hit; }
  return net;
}

function withTimeout(p, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (err) => { clearTimeout(t); reject(err); });
  });
}
