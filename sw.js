// Aumentamos la versión para forzar la actualización
const CACHE_NAME = 'fotoperiodo-v2.0'; 
const ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/db.js',
  './js/gps.js',
  './manifest.json'
];

self.addEventListener('install', e => {
  self.skipWaiting(); // Fuerza a la nueva versión a instalarse INMEDIATAMENTE
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(ASSETS))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim()) // Toma el control de la pantalla sin tener que recargar mil veces
  );
});

// NUEVA ESTRATEGIA: NETWORK FIRST (Internet Primero, Caché después)
self.addEventListener('fetch', e => {
  // Ignorar peticiones a Google Scripts u otras APIs externas en la caché local
  if (e.request.url.includes('script.google.com') || e.request.method !== 'GET') return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // Si hay internet, descarga lo más nuevo de GitHub y actualiza la caché oculta
        const resClone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(e.request, resClone));
        return res;
      })
      .catch(() => {
        // Si NO hay internet (estás en la finca), entonces sí usa la memoria caché
        return caches.match(e.request).then(r => r || caches.match('./index.html'));
      })
  );
});

// Sincronización en segundo plano (No tocar)
self.addEventListener('sync', e => {
  if (e.tag === 'sync-lecturas') {
    e.waitUntil(syncPendingData());
  }
});

async function syncPendingData() {
  const clients = await self.clients.matchAll();
  clients.forEach(client => client.postMessage({ type: 'SYNC_REQUESTED' }));
}
