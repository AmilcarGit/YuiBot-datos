const test = require('node:test')
const assert = require('node:assert/strict')
const S = require('../lib/seguridad')
const { crearMemoria } = require('../lib/almacen')
const svc = require('../lib/servicio')
const W = require('../lib/web')
const C = require('../lib/chat')

const cfg = S.config({ DATOS_PEPPER: 'pimienta-de-prueba', ADMIN_TOKEN: 'secreto-admin' })
const T0 = Date.UTC(2026, 10, 25, 12)

async function jugador(almacen, id, numero, nombre, ahora = T0) {
  await svc.sincronizar({ almacen, cfg, instalacionId: id, ahora, cuerpo: { usuarios: { [numero]: { u: { semilla: true, r: { actualizado: ahora, racha: 1 }, d: { monedas: 100, xp: 400 } }, vis: '519•••00' + numero.slice(-1) } } } })
  const { codigo } = await W.crearVinculo({ almacen, cfg, instalacionId: id, numero, ahora })
  return (await W.entrar({ almacen, cfg, numero, codigo, nombre, ip: '3.3.3.' + numero.slice(-1), ahora })).token
}
async function escenario() {
  const almacen = crearMemoria()
  const { id } = await svc.registrarInstalacion({ almacen, cfg, ip: '1.1.1.1', ahora: T0 })
  const ana = await jugador(almacen, id, '51910000001', 'Ana')
  const luis = await jugador(almacen, id, '51910000002', 'Luis')
  return { almacen, ana, luis }
}

test('chat global: se envía, se lee con nombre y nivel, y nadie ve datos privados', async () => {
  const { almacen, ana, luis } = await escenario()
  await C.enviar({ almacen, cfg, token: ana, texto: '  Hola   a todos 🌸 ', ahora: T0 })
  const r = await C.leer({ almacen, cfg, token: luis })
  assert.equal(r.mensajes.length, 1)
  assert.equal(r.mensajes[0].x, 'Hola a todos 🌸'); assert.equal(r.mensajes[0].n, 'Ana'); assert.ok(r.mensajes[0].nv >= 1)
  assert.deepEqual(Object.keys(r.mensajes[0]).sort(), ['a', 'id', 'n', 'nv', 't', 'x'])
  assert.notEqual(r.yo, r.mensajes[0].a)
  const igual = await C.leer({ almacen, cfg, token: luis, desde: r.ult })
  assert.equal(igual.igual, true); assert.equal(igual.mensajes, undefined)
})

test('chat global: reglas (enlaces, teléfonos, largo, repetidos y velocidad)', async () => {
  const { almacen, ana } = await escenario()
  const enviar = (texto, ahora) => C.enviar({ almacen, cfg, token: ana, texto, ahora })
  await assert.rejects(enviar('mira https://malo.com', T0), /enlaces/)
  await assert.rejects(enviar('entra a www.algo.pe', T0 + 4000), /enlaces/)
  await assert.rejects(enviar('llámame al 999 888 777', T0 + 8000), /teléfono/)
  await assert.rejects(enviar('a'.repeat(201), T0 + 12000), /Máximo/)
  await assert.rejects(enviar('   ', T0 + 16000), /Escribe/)
  await enviar('uno', T0 + 20000)
  await assert.rejects(enviar('dos', T0 + 20500), /Espera 3 segundos/)
  await assert.rejects(enviar('uno', T0 + 25000), /repitas/)
  await enviar('dos', T0 + 30000)
})

test('chat global: necesita sesión válida', async () => {
  const { almacen } = await escenario()
  await assert.rejects(C.leer({ almacen, cfg, token: 'falso' }), /sesión/i)
  await assert.rejects(C.enviar({ almacen, cfg, token: '', texto: 'hola' }), /Inicia sesión/)
})

test('chat global: 3 reportes distintos ocultan un mensaje; no se reporta el propio ni dos veces', async () => {
  const { almacen, ana, luis } = await escenario()
  const { id: idInst } = await svc.registrarInstalacion({ almacen, cfg, ip: '9.9.9.9', ahora: T0 })
  const eva = await jugador(almacen, idInst, '51910000003', 'Eva'); const raul = await jugador(almacen, idInst, '51910000004', 'Raúl')
  const { id } = await C.enviar({ almacen, cfg, token: ana, texto: 'mensaje feo', ahora: T0 })
  await assert.rejects(C.reportar({ almacen, cfg, token: ana, id }), /propio/)
  await C.reportar({ almacen, cfg, token: luis, id })
  assert.equal((await C.reportar({ almacen, cfg, token: luis, id })).repetido, true)
  await C.reportar({ almacen, cfg, token: eva, id })
  assert.equal((await C.leer({ almacen, cfg, token: raul })).mensajes.length, 1)
  assert.equal((await C.reportar({ almacen, cfg, token: raul, id })).oculto, true)
  assert.equal((await C.leer({ almacen, cfg, token: raul })).mensajes.length, 0)
})

test('chat global: el admin borra mensajes y silencia; sin token no puede', async () => {
  const { almacen, ana, luis } = await escenario()
  const { id } = await C.enviar({ almacen, cfg, token: ana, texto: 'hola', ahora: T0 })
  await assert.rejects(C.listarAdmin({ almacen, cfg, token: 'no' }), /No autorizado/)
  const lista = await C.listarAdmin({ almacen, cfg, token: 'secreto-admin' })
  assert.equal(lista.mensajes[0].id, id)
  await C.silenciarAdmin({ almacen, cfg, token: 'secreto-admin', autor: lista.mensajes[0].a, horas: 1 })
  await assert.rejects(C.enviar({ almacen, cfg, token: ana, texto: 'otra vez', ahora: T0 + 5000 }), /silenciado/)
  await C.silenciarAdmin({ almacen, cfg, token: 'secreto-admin', autor: lista.mensajes[0].a, quitar: true })
  await C.enviar({ almacen, cfg, token: ana, texto: 'ya puedo', ahora: T0 + 9000 })
  await C.borrarAdmin({ almacen, cfg, token: 'secreto-admin', id })
  const r = await C.leer({ almacen, cfg, token: luis })
  assert.deepEqual(r.mensajes.map((m) => m.x), ['ya puedo'])
})

test('chat global: solo conserva los últimos mensajes', async () => {
  const { almacen, ana, luis } = await escenario()
  for (let i = 0; i < 270; i++) await almacen.hset('g:m', 'x' + i, JSON.stringify({ id: 'x' + i, t: T0 + i, a: 'aaaaaaaaaa', n: 'Z', nv: 1, x: 'm' + i, r: 0 })).then(() => almacen.zadd('g:idx', T0 + i, 'x' + i))
  await C.enviar({ almacen, cfg, token: ana, texto: 'nuevo', ahora: T0 + 100000 })
  assert.ok((await almacen.zcount('g:idx')) <= 201)
  const r = await C.leer({ almacen, cfg, token: luis })
  assert.equal(r.mensajes.at(-1).x, 'nuevo'); assert.equal(r.mensajes.length, 60)
})
