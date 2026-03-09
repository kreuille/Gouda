const CACHE_NAME = 'gouda-kiro-cache-v1';
const ASSETS = [
  '/Gouda/',
  '/Gouda/index.html',
  '/Gouda/css/style.css',
  '/Gouda/js/api.js',
  '/Gouda/js/app.js',
  '/Gouda/js/filemanager.js',
  '/Gouda/models.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});
