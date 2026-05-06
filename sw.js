const CACHE_NAME = 'v2_eco_app'; // Alterado para v2 para forçar a primeira limpeza
const assets = [
  './', 
  './index.html', 
  './app.js', 
  './manifest.json',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// Instalação: Baixa os arquivos principais, mas não trava esperando.
self.addEventListener('install', e => {
  self.skipWaiting(); // Força o Service Worker a assumir o controle imediatamente
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(assets))
  );
});

// Ativação: Limpa QUALQUER cache antigo que não seja a versão atual (v2)
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(keys
        .filter(key => key !== CACHE_NAME)
        .map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim(); // Garante que a página atual já use o novo Service Worker
});

// Interceptação das requisições: Estratégia "Network First" (Rede Primeiro)
self.addEventListener('fetch', e => {
  e.respondWith(
    fetch(e.request)
      .then(response => {
        // Se a internet funcionou e baixou o arquivo mais novo, atualizamos o cache
        const resClone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(e.request, resClone);
        });
        return response;
      })
      .catch(() => {
        // Se a internet caiu ou falhou, tenta buscar o arquivo no cache salvo
        return caches.match(e.request);
      })
  );
});
