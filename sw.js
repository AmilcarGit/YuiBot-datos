// Service worker de YuiBot-datos: la página abre al instante y funciona sin conexión (la API siempre va a la red).
const VERSION = 'yui-v18'
const BASE = ['/', '/yui', '/manifest.webmanifest', '/kawaii.css?v=1', '/kawaii.js', '/icons/yui-192.png', '/icons/yui-512.png', '/icons/yui-apple-touch.png']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(BASE)).then(() => self.skipWaiting()).catch(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return // la API nunca se guarda
  if (req.mode === 'navigate') {
    // Páginas: primero la red (siempre lo último); sin conexión, la copia guardada.
    e.respondWith(fetch(req).then((r) => { const copia = r.clone(); caches.open(VERSION).then((c) => c.put(req, copia)).catch(() => {}); return r }).catch(() => caches.match(req).then((c) => c || caches.match('/'))))
    return
  }
  // Manifiesto e íconos: siempre lo último (si no, el ícono de la app se queda viejo).
  if (url.pathname === '/manifest.webmanifest' || url.pathname.startsWith('/icons/')) {
    e.respondWith(fetch(req).then((r) => { if (r.ok) { const copia = r.clone(); caches.open(VERSION).then((x) => x.put(req, copia)).catch(() => {}) } return r }).catch(() => caches.match(req)))
    return
  }
  // Archivos estáticos: copia rápida y se renueva en segundo plano.
  e.respondWith(caches.match(req).then((c) => {
    const red = fetch(req).then((r) => { if (r.ok) { const copia = r.clone(); caches.open(VERSION).then((x) => x.put(req, copia)).catch(() => {}) } return r }).catch(() => c)
    return c || red
  }))
})
