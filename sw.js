const CACHE_NAME = 'kiro-v2.2';
const ASSETS = [
  '/Gouda/',
  '/Gouda/index.html',
  '/Gouda/manifest.json',
  '/Gouda/css/style.css',
  '/Gouda/models.js',
  '/Gouda/js/api.js',
  '/Gouda/js/filemanager.js',
  '/Gouda/js/app.js',
  '/Gouda/js/github-backup.js',
  '/Gouda/icons/icon-192.png',
  '/Gouda/icons/icon-512.png',
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js',
  'https://cdn.jsdelivr.net/npm/marked/marked.min.js'
];

// Install: cache all static assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate: delete old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Fetch: cache-first for local assets, network-only for API calls
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Never cache API calls (OpenAI, Anthropic, Google, Perplexity, GitHub)
  if (
    url.includes('api.openai.com') ||
    url.includes('api.anthropic.com') ||
    url.includes('generativelanguage.googleapis.com') ||
    url.includes('api.perplexity.ai') ||
    url.includes('api.github.com')
  ) {
    return; // let the browser handle it natively
  }

  // Cache-first for everything else
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200 && response.type !== 'opaque') {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback for navigation
        if (event.request.mode === 'navigate') {
          return caches.match('/Gouda/index.html');
        }
      });
    })
  );
});

// Background sync: push a pending backup to GitHub when back online
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
