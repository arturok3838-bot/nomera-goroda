// «Номера города» — работа без интернета.
// Игра — один файл index.html: при первом открытии он сохраняется в телефоне,
// дальше игра запускается и без сети. Когда сеть есть, подтягивается свежая версия.
const CACHE = 'nomera-v2';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('nomera-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// сама игра: сначала сеть (чтобы приходили обновления), без сети или при медленной сети — из памяти телефона
async function page(req) {
  const c = await caches.open(CACHE);
  try {
    const net = fetch(req, { cache: 'no-cache' });
    const r = await Promise.race([net, new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 4000))]);
    if (r && r.ok) { c.put('./index.html', r.clone()); return r; }
    throw new Error('bad');
  } catch (e) {
    const hit = (await c.match('./index.html')) || (await c.match('./'));
    if (hit) {
      // сеть медленная — отдали сохранённую версию, а свежую докачаем в фоне
      const old = hit.clone();
      fetch(req, { cache: 'no-cache' }).then(async (r) => {
        if (!r.ok) return;
        const [nt, ot] = await Promise.all([r.clone().text(), old.text()]);
        await c.put('./index.html', r);
        // версия на сайте новее той, что сейчас открыта, — предлагаем обновить
        if (nt !== ot) (await self.clients.matchAll({ type: 'window' })).forEach((cl) => cl.postMessage({ t: 'upd', v: (nt.match(/GAME_VER='([^']+)'/) || [])[1] || '' }));
      }).catch(() => {});
      return hit;
    }
    return fetch(req);
  }
}
// шрифты Google: сохраняем при первой загрузке, потом берём из памяти
async function fonts(req) {
  const c = await caches.open(CACHE + '-fonts');
  const hit = await c.match(req);
  const net = fetch(req).then((r) => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => null);
  return hit || (await net) || new Response('', { status: 504 });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (req.mode === 'navigate' || url.pathname.endsWith('/') || url.pathname.endsWith('/index.html')) { e.respondWith(page(req)); return; }
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((r) => { if (r.ok) caches.open(CACHE).then((c) => c.put(req, r.clone())); return r; })));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') e.respondWith(fonts(req));
});
