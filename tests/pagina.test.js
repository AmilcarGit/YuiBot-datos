const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8')

test('la página usa solo textContent con datos de la API (nada de innerHTML)', () => {
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/.test(html))
})

test('la página llama a las rutas públicas que existen y tiene sus secciones', () => {
  for (const ruta of ['/api/salud', '/api/estadisticas', '/api/top', '/api/usuario', '/api/evento']) {
    assert.ok(html.includes(ruta), ruta)
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'api', `${ruta.split('/').pop()}.js`)), `falta api/${ruta.split('/').pop()}.js`)
  }
  for (const id of ['buscar', 'vivo', 'ranking', 'funciones', 'empezar', 'dev', 'faq', 'numero', 'resultado']) assert.ok(html.includes(`id="${id}"`), id)
  for (const campo of ['monedas', 'xp', 'trabajos', 'semana']) assert.ok(html.includes(`data-campo="${campo}"`), campo)
})

test('los ids que usa el script existen en la página', () => {
  const usados = [...html.matchAll(/\$\('([\w-]+)'\)/g)].map((m) => m[1])
  for (const id of new Set(usados)) assert.ok(html.includes(`id="${id}"`), `falta id="${id}"`)
})

test('la página trae tarjeta para compartir, historial, enlace por número y administración sin guardar el token', () => {
  for (const id of ['adm-form', 'adm-token', 'adm-caja']) assert.ok(html.includes(`id="${id}"`), id)
  for (const frase of ['/api/admin', 'x-admin-token', 'tarjetaSVG', 'cajaHistorial', "get('n')"]) assert.ok(html.includes(frase), frase)
  assert.ok(!/(localStorage|sessionStorage|almacen\.poner)\([^)]*(tokenAdmin|adm-token)/.test(html), 'el token nunca va al almacenamiento')
})

test('el panel admin tiene el reinicio con confirmación escrita', () => {
  for (const id of ['adm-peligro', 'adm-confirmar', 'adm-reiniciar']) assert.ok(html.includes(`id="${id}"`), id)
  assert.ok(html.includes("accion: 'reiniciar'") && html.includes('REINICIAR'))
})

test('PWA: manifiesto, service worker e íconos existen y están enlazados', () => {
  const raiz = path.join(__dirname, '..')
  const m = JSON.parse(fs.readFileSync(path.join(raiz, 'manifest.webmanifest'), 'utf8'))
  assert.equal(m.display, 'standalone'); assert.ok(m.icons.some((i) => i.purpose === 'maskable'))
  for (const i of m.icons) assert.ok(fs.existsSync(path.join(raiz, i.src.replace(/^\//, ''))), i.src)
  assert.ok(fs.existsSync(path.join(raiz, 'sw.js')) && fs.existsSync(path.join(raiz, 'icons', 'apple-touch-icon.png')))
  for (const frase of ['rel="manifest"', 'apple-touch-icon', "register('/sw.js')", 'beforeinstallprompt']) assert.ok(html.includes(frase), frase)
  const sw = fs.readFileSync(path.join(raiz, 'sw.js'), 'utf8'); assert.ok(sw.includes("startsWith('/api/')"), 'la API nunca se guarda en caché')
  assert.ok(JSON.parse(fs.readFileSync(path.join(raiz, 'vercel.json'), 'utf8')).headers.length >= 2)
})

test('accesibilidad, medallas, descarga y banner están en la página', () => {
  for (const id of ['acc-panel', 'acc-tams', 'acc-contraste', 'acc-anim', 'banner', 'adm-extra', 'ev-publicar', 'lid-buscar', 'lid-borrar']) assert.ok(html.includes(`id="${id}"`), id)
  for (const frase of ['data-tam', 'cajaMedallas', 'descargarProgreso', 'cargarEvento', "accion: 'limpiar'", "accion: 'evento'"]) assert.ok(html.includes(frase), frase)
  const ids = [...html.matchAll(/\['([a-z0-9-]+)', '[^']+', '[^']+', '(?:bronce|plata|oro|diamante)'/g)].map((m) => m[1])
  assert.equal(ids.length, 21, 'catálogo de medallas completo')
})
