// Service worker de YuiBot-datos: la página abre al instante y funciona sin conexión (la API siempre va a la red).
const VERSION = 'yui-v1'
const BASE = ['/', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png']

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
    e.respondWith(fetch(req).then((r) => { const copia = r.clone(); caches.open(VERSION).then((c) => c.put('/', copia)).catch(() => {}); return r }).catch(() => caches.match('/')))
    return
  }
  // Archivos estáticos: copia rápida y se renueva en segundo plano.
  e.respondWith(caches.match(req).then((c) => {
    const red = fetch(req).then((r) => { if (r.ok) { const copia = r.clone(); caches.open(VERSION).then((x) => x.put(req, copia)).catch(() => {}) } return r }).catch(() => c)
    return c || red
  }))
})
