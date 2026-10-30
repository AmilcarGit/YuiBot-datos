const test = require('node:test')
const assert = require('node:assert/strict')
const { fusionarUsuario, fusionarTrabajos, calcularNivel } = require('../lib/fusion')
const S = require('../lib/seguridad')
const { crearMemoria } = require('../lib/almacen')
const svc = require('../lib/servicio')
const { ruta } = require('../lib/http')

const cfg = S.config({ DATOS_PEPPER: 'pimienta-de-prueba' })
const nuevoAlmacen = () => crearMemoria()
const topesBase = { monedas: 100000, xp: 2000, mensajes: 500, reputacion: 50, trabajosVeces: 100, trabajosGanado: 100000 }

test('nivel se calcula igual que en el bot', () => {
  assert.equal(calcularNivel(0), 0); assert.equal(calcularNivel(100), 1); assert.equal(calcularNivel(400), 2); assert.equal(calcularNivel(-5), 0)
})

test('fusión: suma deltas de dos instalaciones y nunca deja monedas negativas', () => {
  let srv = null
  srv = fusionarUsuario(srv, { monedas: 100, xp: 50, actualizado: 10 }, { monedas: 100, xp: 50 }, topesBase).registro
  srv = fusionarUsuario(srv, { monedas: 30, xp: 20, actualizado: 20 }, { monedas: 30, xp: 20 }, topesBase).registro
  assert.deepEqual([srv.monedas, srv.xp], [130, 70])
  const gasto = fusionarUsuario(srv, { monedas: 0, actualizado: 30 }, { monedas: -500 }, topesBase).registro
  assert.equal(gasto.monedas, 0)
})

test('fusión: topes anti-trampa recortan ganancias absurdas', () => {
  const r = fusionarUsuario({ monedas: 5, xp: 0 }, { actualizado: 1 }, { monedas: 99999999, xp: 999999, mensajes: 99999, reputacion: 999 }, { ...topesBase, gananciaMonedasRestante: 50000 })
  assert.equal(r.registro.monedas, 5 + 50000, 'tope por hora')
  assert.equal(r.registro.xp, 2000)
  assert.equal(r.registro.mensajes, 500)
  assert.equal(r.registro.reputacion, 50)
  assert.equal(r.registro.nivel, calcularNivel(2000))
  assert.equal(fusionarUsuario({ monedas: 5 }, {}, { monedas: 1000 }, { ...topesBase, gananciaMonedasRestante: 0 }).registro.monedas, 5)
})

test('fusión: gana el registro más reciente en lo demás; inventario y logros se unen; máximos se conservan', () => {
  const srv = { nombre: 'Viejo', edad: 20, inventario: ['a'], logros: { x: 1 }, mejorRacha: 9, actualizado: 100 }
  const cli = { nombre: 'Nuevo', inventario: ['b', 'a'], logros: { y: 2 }, mejorRacha: 4, actualizado: 200 }
  const r = fusionarUsuario(srv, cli, {}, topesBase).registro
  assert.equal(r.nombre, 'Nuevo'); assert.equal(r.edad, 20, 'lo que el nuevo no tiene se conserva')
  assert.deepEqual(r.inventario.sort(), ['a', 'b']); assert.deepEqual(r.logros, { x: 1, y: 2 }); assert.equal(r.mejorRacha, 9)
  const viejo = fusionarUsuario(srv, { nombre: 'MásViejo', actualizado: 50 }, {}, topesBase).registro
  assert.equal(viejo.nombre, 'Viejo', 'un registro viejo no pisa al nuevo')
  assert.equal(r.actualizado, 200)
})

test('fusión: xp de la semana suma en la misma semana y se reinicia en una nueva', () => {
  let r = fusionarUsuario({ semana: '2026-10-26', xpSemana: 100 }, { semana: '2026-10-26', actualizado: 1 }, { xpSemana: 40 }, topesBase).registro
  assert.deepEqual([r.semana, r.xpSemana], ['2026-10-26', 140])
  r = fusionarUsuario(r, { semana: '2026-11-02', actualizado: 2 }, { xpSemana: 15 }, topesBase).registro
  assert.deepEqual([r.semana, r.xpSemana], ['2026-11-02', 15])
  r = fusionarUsuario(r, { semana: '2026-10-26', actualizado: 3 }, { xpSemana: 999 }, topesBase).registro
  assert.deepEqual([r.semana, r.xpSemana], ['2026-11-02', 15], 'una semana vieja no pisa la actual')
})

test('fusión de trabajos: máximos, sumas y granja del más reciente', () => {
  const srv = { cd: { minar: 100 }, veces: { minar: 3 }, ganado: 500, mejoras: { pico: 2 }, granja: [{ cultivo: 'papa', listoEn: 5 }], actualizado: 10 }
  const cli = { cd: { minar: 90, pescar: 50 }, mejoras: { pico: 1, cana: 3 }, granja: [], actualizado: 20 }
  const r = fusionarTrabajos(srv, cli, { ganado: 200, veces: { minar: 2, pescar: 1 } }, {})
  assert.deepEqual(r.cd, { minar: 100, pescar: 50 })
  assert.deepEqual(r.mejoras, { pico: 2, cana: 3 })
  assert.deepEqual(r.veces, { minar: 5, pescar: 1 })
  assert.equal(r.ganado, 700); assert.deepEqual(r.granja, [])
  assert.equal(fusionarTrabajos(null, { granja: [1], actualizado: 1 }, {}, {}).granja.length, 1)
})

test('seguridad: limpiar registros quita claves peligrosas y recorta', () => {
  const sucio = JSON.parse('{"__proto__":{"x":1},"ok":1,"mala clave":2,"s":"' + 'a'.repeat(500) + '","arr":[1,2,{"constructor":3,"z":4}],"fn":null}')
  const l = S.registroLimpio(sucio)
  assert.ok(!('mala clave' in l)); assert.equal(l.s.length, 300); assert.deepEqual(l.arr[2], { z: 4 }); assert.equal(({}).x, undefined)
  assert.equal(S.registroLimpio('texto'), null); assert.equal(S.registroLimpio([1]), null)
  assert.equal(S.registroLimpio({ grande: 'x'.repeat(300), otra: Array(200).fill('x'.repeat(100)) }), null, 'más de 16 KB se rechaza')
  assert.equal(S.numeroValido('51910227479'), true); assert.equal(S.numeroValido('abc'), false); assert.equal(S.numeroValido('1'), false)
  assert.equal(S.visibleValido('519••• 479'), '519••• 479'); assert.equal(S.visibleValido('<script>'), '•••')
})

test('seguridad: el id anónimo es estable, distinto por número y no contiene el número', () => {
  const a = S.idUsuario('p', '51910227479')
  assert.equal(a, S.idUsuario('p', '51910227479')); assert.notEqual(a, S.idUsuario('p', '51910227478')); assert.notEqual(a, S.idUsuario('otra', '51910227479'))
  assert.ok(!a.includes('5191022'))
  assert.ok(S.iguales('abc', 'abc')); assert.ok(!S.iguales('abc', 'abd')); assert.ok(!S.iguales('abc', 'abcd'))
})

async function instalacion(almacen) {
  const r = await svc.registrarInstalacion({ almacen, cfg, ip: '1.2.3.4' })
  return r
}

test('registro y autenticación de instalaciones, con ban', async () => {
  const almacen = nuevoAlmacen()
  const { id, clave } = await instalacion(almacen)
  assert.ok(id && clave.length >= 30)
  assert.ok(!JSON.stringify([...(await almacen.get(`inst:${id}`))]).includes(clave), 'la clave no se guarda en claro')
  await svc.autenticar({ almacen, cfg, id, clave })
  await assert.rejects(() => svc.autenticar({ almacen, cfg, id, clave: 'mala' }), { estado: 401 })
  await assert.rejects(() => svc.autenticar({ almacen, cfg, id: 'nope', clave }), { estado: 401 })
  await assert.rejects(() => svc.autenticar({ almacen, cfg, id: undefined, clave }), { estado: 401 })
  const cfgAdmin = { ...cfg, adminToken: 'secreto-admin' }
  await assert.rejects(() => svc.banear({ almacen, cfg: cfgAdmin, token: 'x', id }), { estado: 401 })
  await assert.rejects(() => svc.banear({ almacen, cfg, token: '', id }), { estado: 401 }, 'sin ADMIN_TOKEN configurado nadie puede banear')
  await svc.banear({ almacen, cfg: cfgAdmin, token: 'secreto-admin', id })
  await assert.rejects(() => svc.autenticar({ almacen, cfg, id, clave }), { estado: 403 })
  await svc.banear({ almacen, cfg: cfgAdmin, token: 'secreto-admin', id, baneada: false })
  await svc.autenticar({ almacen, cfg, id, clave })
})

test('registrar: límite por red y exige DATOS_PEPPER', async () => {
  const almacen = nuevoAlmacen()
  for (let i = 0; i < cfg.maxRegistrosIpHora; i++) await svc.registrarInstalacion({ almacen, cfg, ip: '9.9.9.9', ahora: 1e12 })
  await assert.rejects(() => svc.registrarInstalacion({ almacen, cfg, ip: '9.9.9.9', ahora: 1e12 }), { estado: 429 })
  await svc.registrarInstalacion({ almacen, cfg, ip: '8.8.8.8', ahora: 1e12 })
  await assert.rejects(() => svc.registrarInstalacion({ almacen, cfg: S.config({}), ip: 'x' }), { estado: 500 })
})

const NUM = '51910227479'
const envio = (u, t, vis = '519•••479') => ({ usuarios: { [NUM]: { vis, ...(u ? { u } : {}), ...(t ? { t } : {}) } } })

test('sincronizar: dos instalaciones comparten monedas, xp, trabajos y ranking', async () => {
  const almacen = nuevoAlmacen()
  const A = await instalacion(almacen); const B = await instalacion(almacen)
  const sync = (inst, cuerpo, ahora = 1e12) => svc.sincronizar({ almacen, cfg, instalacionId: inst.id, cuerpo, ahora })

  let r = await sync(A, envio({ r: { monedas: 500, xp: 250, mensajes: 5, actualizado: 100 }, d: { monedas: 500, xp: 250, mensajes: 5 } }, { r: { cd: { minar: 90 }, mejoras: { pico: 1 }, actualizado: 100 }, d: { ganado: 300, veces: { minar: 2 } } }))
  assert.equal(r.usuarios[NUM].u.monedas, 500); assert.equal(r.usuarios[NUM].u.nivel, 1)
  // la instalación B conoce a la persona por primera vez y gana 40 monedas allí
  r = await sync(B, envio({ r: { monedas: 40, xp: 10, actualizado: 200 }, d: { monedas: 40, xp: 10 } }))
  assert.deepEqual([r.usuarios[NUM].u.monedas, r.usuarios[NUM].u.xp], [540, 260], 'B ve lo de A y suma lo suyo')
  // A vuelve a sincronizar sin cambios: recibe el total
  r = await sync(A, envio({ r: { monedas: 500, xp: 250, actualizado: 100 }, d: {} }, { r: { cd: {}, actualizado: 50 }, d: {} }))
  assert.equal(r.usuarios[NUM].u.monedas, 540)
  assert.equal(r.usuarios[NUM].t.ganado, 300); assert.equal(r.usuarios[NUM].t.mejoras.pico, 1); assert.equal(r.usuarios[NUM].t.veces.minar, 2)

  const t = await svc.top({ almacen, campo: 'monedas', limite: 5 })
  assert.deepEqual(t.top, [{ pos: 1, visible: '519•••479', valor: 540 }])
  assert.equal((await svc.top({ almacen, campo: 'trabajos' })).top[0].valor, 300)
  assert.equal((await svc.top({ almacen, campo: 'xp' })).top[0].valor, 260)
  await assert.rejects(() => svc.top({ almacen, campo: 'otra' }), { estado: 400 })
  assert.ok(!JSON.stringify(t).includes(NUM), 'el ranking nunca trae el número completo')
  const guardado = await almacen.get(`u:${S.idUsuario(cfg.pepper, NUM)}`)
  assert.ok(!guardado.includes(NUM), 'el servidor no guarda el número de teléfono')
})

test('sincronizar: el tope por hora frena a un tramposo y los datos inválidos se reportan', async () => {
  const almacen = nuevoAlmacen(); const A = await instalacion(almacen)
  const sync = (cuerpo, ahora = 1e12) => svc.sincronizar({ almacen, cfg, instalacionId: A.id, cuerpo, ahora })
  let total = 0
  for (let i = 0; i < 8; i++) {
    const r = await sync(envio({ r: { actualizado: i }, d: { monedas: 99999999 } }), 1e12 + i * 1000)
    total = r.usuarios[NUM].u.monedas
  }
  assert.ok(total <= cfg.maxGananciaHora, `monedas ${total} <= tope por hora`)
  const mas = await sync(envio({ r: { actualizado: 99 }, d: { monedas: 5000 } }), 1e12 + 3600000 + 5)
  assert.ok(mas.usuarios[NUM].u.monedas > total, 'a la hora siguiente vuelve a permitirse')

  const r = await sync({ usuarios: { abc: { u: { r: {}, d: {} } }, '51900000001': { u: { r: 'texto', d: {} } }, '51900000002': null } })
  assert.deepEqual(Object.keys(r.errores).sort(), ['51900000001', '51900000002', 'abc'])
  const demasiados = {}; for (let i = 0; i < 201; i++) demasiados[`5190${String(i).padStart(7, '0')}`] = { u: { r: {}, d: {} } }
  await assert.rejects(() => sync({ usuarios: demasiados }), { estado: 413 })
  assert.deepEqual((await sync({})).usuarios, {})
})

test('sincronizar: límite de peticiones por minuto y usuario bloqueado por otra petición', async () => {
  const almacen = nuevoAlmacen(); const A = await instalacion(almacen)
  for (let i = 0; i < cfg.maxSyncPorMinuto; i++) await svc.sincronizar({ almacen, cfg, instalacionId: A.id, cuerpo: {}, ahora: 5e11 })
  await assert.rejects(() => svc.sincronizar({ almacen, cfg, instalacionId: A.id, cuerpo: {}, ahora: 5e11 }), { estado: 429 })
  const B = await instalacion(almacen)
  await almacen.set(`lock:${S.idUsuario(cfg.pepper, NUM)}`, '1', { ex: 8 })
  const r = await svc.sincronizar({ almacen, cfg, instalacionId: B.id, cuerpo: envio({ r: {}, d: {} }), ahora: 5e11 })
  assert.equal(r.errores[NUM], 'ocupado')
})

function fakeRes() { const r = { headers: {}, setHeader(k, v) { r.headers[k] = v }, end(c) { r.cuerpo = JSON.parse(c) } }; return r }

test('http: método, JSON roto, errores internos sin detalles y tamaño', async () => {
  const h = ruta(['POST'], async ({ cuerpo }) => { if (cuerpo.boom) throw new Error('detalle secreto de la base'); if (cuerpo.api) throw new svc.ErrorApi(418, 'tetera'); return { ok: true, eco: cuerpo } })
  let res = fakeRes(); await h({ method: 'GET', headers: {} }, res)
  assert.equal(res.statusCode, 405); assert.equal(res.headers.Allow, 'POST')
  res = fakeRes(); await h({ method: 'POST', headers: {}, body: '{mal' }, res); assert.equal(res.statusCode, 400)
  res = fakeRes(); await h({ method: 'POST', headers: {}, body: { boom: 1 } }, res)
  assert.equal(res.statusCode, 500); assert.ok(!JSON.stringify(res.cuerpo).includes('secreto'))
  res = fakeRes(); await h({ method: 'POST', headers: {}, body: { api: 1 } }, res); assert.equal(res.statusCode, 418)
  res = fakeRes(); await h({ method: 'POST', headers: { 'content-length': String(3e6) }, body: {} }, res); assert.equal(res.statusCode, 413)
  res = fakeRes(); await h({ method: 'POST', headers: {}, body: '{"a":1}' }, res)
  assert.deepEqual(res.cuerpo, { ok: true, eco: { a: 1 } }); assert.equal(res.headers['Cache-Control'], 'no-store')
})

test('las rutas de api/ cargan y exigen autenticación', async () => {
  const { usarAlmacen } = require('../lib/almacen')
  usarAlmacen(nuevoAlmacen())
  process.env.DATOS_PEPPER = 'pepper-prueba'
  for (const f of ['salud', 'registrar', 'sync', 'top', 'admin']) assert.equal(typeof require(`../api/${f}`), 'function')
  let res = fakeRes(); await require('../api/salud')({ method: 'GET', headers: {} }, res); assert.equal(res.cuerpo.ok, true)
  res = fakeRes(); await require('../api/sync')({ method: 'POST', headers: {}, body: {} }, res); assert.equal(res.statusCode, 401)
  res = fakeRes(); await require('../api/registrar')({ method: 'POST', headers: { 'x-forwarded-for': '7.7.7.7' }, body: {} }, res)
  assert.equal(res.statusCode, 200)
  const { id, clave } = res.cuerpo
  res = fakeRes(); await require('../api/sync')({ method: 'POST', headers: { 'x-instalacion': id, 'x-clave': clave }, body: envio({ r: { actualizado: 1 }, d: { monedas: 10 } }) }, res)
  assert.equal(res.statusCode, 200); assert.equal(res.cuerpo.usuarios[NUM].u.monedas, 10)
  res = fakeRes(); await require('../api/top')({ method: 'GET', headers: {}, url: '/api/top?campo=monedas&limite=3', query: { campo: 'monedas', limite: '3' } }, res)
  assert.equal(res.cuerpo.top[0].valor, 10)
  delete process.env.DATOS_PEPPER
})
