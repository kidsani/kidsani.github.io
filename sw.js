// sw.js — 아주 단순 캐시 (필요시 확장)
const CACHE = 'kidsani-v1';
const ASSETS = [
  '/', '/index.html',
  '/list.html', '/watch.html',
  '/css/style.css',
  '/image/kidsani_logo_192r.png',
  '/image/kidsani_logo_512r.png',
  '/manifest.json'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  e.respondWith(
    caches.match(request).then(res => res || fetch(request))
  );
});
