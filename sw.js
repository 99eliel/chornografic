// Sempre que fizer uma grande mudança no site, mude esse "v3" para "v4", "v5", etc.
const CACHE_NAME = 'chronographic-v3'; 
const urlsToCache = [
  './',
  './index.html',
  './manifest.json'
];

// Instala o Service Worker e força ele a assumir o controle na hora
self.addEventListener('install', event => {
  self.skipWaiting(); // Pula a fila de espera e instala imediatamente
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Ativa o novo Service Worker e apaga os caches velhos
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Se o nome do cache for diferente do atual, ele deleta o velho
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim(); // Toma o controle de todas as abas abertas na hora
});

// Estratégia: NETWORK FIRST (Internet primeiro, Cache como plano B)
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // Se a internet funcionou e baixou o arquivo novo, ele salva uma cópia no cache
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
        return response; // Mostra o arquivo novo pro cliente
      })
      .catch(() => {
        // Se deu erro ou o cliente está offline (sem internet), pega a versão salva no cache
        return caches.match(event.request);
      })
  );
});
