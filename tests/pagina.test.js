const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const path = require('path')

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8')

test('la página usa solo textContent con datos de la API (nada de innerHTML)', () => {
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(/.test(html))
})

test('la página llama a las rutas públicas que existen y tiene sus secciones', () => {
  for (const ruta of ['/api/salud', '/api/estadisticas', '/api/top', '/api/usuario']) {
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
