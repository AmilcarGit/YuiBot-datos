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

test('semilla: una instalación vieja aporta su saldo una sola vez; después rigen los topes', async () => {
  const almacen = nuevoAlmacen(); const A = await instalacion(almacen)
  const sync = (cuerpo, ahora = 1e12) => svc.sincronizar({ almacen, cfg, instalacionId: A.id, cuerpo, ahora })
  let r = await sync(envio({ r: { actualizado: 1 }, d: { monedas: 800000, xp: 50000 }, semilla: true }))
  assert.deepEqual([r.usuarios[NUM].u.monedas, r.usuarios[NUM].u.xp], [800000, 50000], 'la semilla pasa los topes normales')
  r = await sync(envio({ r: { actualizado: 2 }, d: { monedas: 800000 }, semilla: true }), 1e12 + 5000)
  assert.equal(r.usuarios[NUM].u.monedas, 800000 + 100000, 'una segunda "semilla" ya no cuenta como semilla')
  const B = await instalacion(almacen)
  r = await svc.sincronizar({ almacen, cfg, instalacionId: B.id, cuerpo: envio({ r: { actualizado: 3 }, d: { monedas: 2000000 }, semilla: true }), ahora: 1e12 + 9000 })
  assert.equal(r.usuarios[NUM].u.monedas, 900000 + 1000000, 'otra instalación sí tiene su propia semilla, pero con tope')
})

test('petición repetida (misma rid): no suma dos veces', async () => {
  const almacen = nuevoAlmacen(); const A = await instalacion(almacen)
  const cuerpo = { rid: 'abc12345-uno', ...envio({ r: { actualizado: 1 }, d: { monedas: 70 } }) }
  const r1 = await svc.sincronizar({ almacen, cfg, instalacionId: A.id, cuerpo, ahora: 1e12 })
  const r2 = await svc.sincronizar({ almacen, cfg, instalacionId: A.id, cuerpo, ahora: 1e12 + 1000 })
  assert.equal(r1.usuarios[NUM].u.monedas, 70); assert.equal(r2.usuarios[NUM].u.monedas, 70); assert.equal(r2.repetida, true)
  const r3 = await svc.sincronizar({ almacen, cfg, instalacionId: A.id, cuerpo: { ...cuerpo, rid: 'abc12345-dos' }, ahora: 1e12 + 2000 })
  assert.equal(r3.usuarios[NUM].u.monedas, 140, 'otra rid sí suma')
  const otra = await instalacion(almacen)
  const r4 = await svc.sincronizar({ almacen, cfg, instalacionId: otra.id, cuerpo, ahora: 1e12 + 3000 })
  assert.ok(!r4.repetida, 'la rid vale solo para su instalación')
})

test('Upstash: hmget funciona con la respuesta en objeto o en lista, y ztop lee puntajes', async () => {
  const { crearUpstash } = require('../lib/almacen')
  const env = { KV_REST_API_URL: 'https://x', KV_REST_API_TOKEN: 't' }
  const clienteObjeto = { hmget: async (k, ...c) => Object.fromEntries(c.map((f, i) => [f, i === 0 ? '519•••479' : null])) }
  const clienteLista = { hmget: async (k, ...c) => c.map((f, i) => (i === 0 ? '519•••479' : null)) }
  for (const cliente of [clienteObjeto, clienteLista]) {
    const a = crearUpstash(env, cliente)
    assert.deepEqual(await a.hmget('vis', ['aa', 'bb']), ['519•••479', null])
  }
  assert.deepEqual(await crearUpstash(env, { hmget: async () => null }).hmget('vis', ['aa']), [null])
  assert.deepEqual(await crearUpstash(env, {}).hmget('vis', []), [])
  const z = crearUpstash(env, { zrange: async (k, a, b, op) => { assert.deepEqual(op, { rev: true, withScores: true }); return ['h1', '256', 'h2', 67] } })
  assert.deepEqual(await z.ztop('rank:monedas', 5), [{ miembro: 'h1', puntaje: 256 }, { miembro: 'h2', puntaje: 67 }])
  assert.throws(() => crearUpstash({}), /Upstash/)
})

test('búsqueda pública: devuelve solo datos de juego, posiciones y valida el número', async () => {
  const almacen = nuevoAlmacen(); const A = await instalacion(almacen)
  const sync = (num, d, extra = {}, ahora = 1e12) => svc.sincronizar({ almacen, cfg, instalacionId: A.id, ahora, cuerpo: { usuarios: { [num]: { vis: '519•••479', u: { r: { actualizado: ahora, nombre: 'Secreto', edad: 15, genero: 'x', racha: 3, logros: { a: 1, b: 1 }, ...extra }, d, semilla: true }, t: { r: { mejoras: { pico: 2, cana: 1 }, actualizado: 5 }, d: { ganado: 400, veces: { minar: 4, pescar: 2 } } } } } } })
  await sync('51910227479', { monedas: 900, xp: 450, mensajes: 12 })
  await sync('51900000009', { monedas: 5000, xp: 100 })
  const buscar = (numero, ip = '5.5.5.5', ahora = 1e12) => svc.perfilPublico({ almacen, cfg, numero, ip, ahora })
  const r = await buscar('+51 910-227 479')
  assert.equal(r.existe, true)
  assert.deepEqual([r.perfil.monedas, r.perfil.xp, r.perfil.nivel, r.perfil.xpNivelActual, r.perfil.xpNivelSiguiente], [900, 450, 2, 400, 900])
  assert.deepEqual([r.perfil.mensajes, r.perfil.racha, r.perfil.logros, r.perfil.ganadoTrabajos, r.perfil.trabajosHechos, r.perfil.mejoras], [12, 3, 2, 400, 6, 3])
  assert.deepEqual([r.posiciones.monedas, r.posiciones.xp], [2, 1])
  assert.ok([1, 2].includes(r.posiciones.trabajos), 'empate en trabajos')
  assert.deepEqual(r.totales, { monedas: 2, xp: 2, trabajos: 2 })
  const texto = JSON.stringify(r)
  for (const privado of ['Secreto', 'genero', 'edad', 'nombre']) assert.ok(!texto.includes(privado), `no debe filtrar ${privado}`)
  assert.deepEqual(await buscar('51999999999'), { existe: false })
  for (const malo of ['', 'abc', '123', '1'.repeat(20), undefined]) await assert.rejects(() => buscar(malo), { estado: 400 })
  await assert.rejects(() => svc.perfilPublico({ almacen, cfg: S.config({}), numero: '51910227479', ip: 'x' }), { estado: 500 })
})

test('búsqueda pública: límite por minuto y por red', async () => {
  const almacen = nuevoAlmacen()
  for (let i = 0; i < cfg.maxBusquedasMin; i++) await svc.perfilPublico({ almacen, cfg, numero: `5190000${String(i).padStart(4, '0')}`, ip: '6.6.6.6', ahora: 2e12 })
  await assert.rejects(() => svc.perfilPublico({ almacen, cfg, numero: '51900009999', ip: '6.6.6.6', ahora: 2e12 }), { estado: 429 })
  assert.deepEqual(await svc.perfilPublico({ almacen, cfg, numero: '51900009999', ip: '7.7.7.7', ahora: 2e12 }), { existe: false }, 'otra red no se ve afectada')
  assert.deepEqual(await svc.perfilPublico({ almacen, cfg, numero: '51900009999', ip: '6.6.6.6', ahora: 2e12 + 61000 }), { existe: false }, 'a los 61 s vuelve')
})

test('actividad: cuenta las sincronizaciones por minuto de los últimos 30 min', async () => {
  const almacen = nuevoAlmacen(); const A = await instalacion(almacen)
  const ahora = 60000 * 1000
  for (const t of [ahora, ahora, ahora - 60000 * 5]) await svc.sincronizar({ almacen, cfg, instalacionId: A.id, cuerpo: {}, ahora: t })
  const serie = await svc.actividad({ almacen, ahora })
  assert.equal(serie.length, 30); assert.equal(serie.at(-1), 2); assert.equal(serie.at(-6), 1); assert.equal(serie[0], 0)
})

test('Upstash: zpos y zcount', async () => {
  const { crearUpstash } = require('../lib/almacen')
  const a = crearUpstash({ KV_REST_API_URL: 'https://x', KV_REST_API_TOKEN: 't' }, { zrevrank: async (k, m) => (m === 'yo' ? 1 : null), zscore: async () => '77', zcard: async () => 9 })
  assert.deepEqual(await a.zpos('rank:monedas', 'yo'), { pos: 2, puntaje: 77 })
  assert.deepEqual(await a.zpos('rank:monedas', 'otro'), { pos: null, puntaje: null })
  assert.equal(await a.zcount('rank:monedas'), 9)
})

test('ruta /api/usuario responde y estadisticas incluye actividad', async () => {
  const { usarAlmacen } = require('../lib/almacen')
  usarAlmacen(nuevoAlmacen()); process.env.DATOS_PEPPER = 'pepper-prueba'
  const res = () => { const r = { headers: {}, setHeader(k, v) { r.headers[k] = v }, end(c) { r.cuerpo = JSON.parse(c) } }; return r }
  let r = res(); await require('../api/usuario')({ method: 'GET', headers: {}, query: { numero: '51910227479' } }, r)
  assert.deepEqual([r.statusCode, r.cuerpo.ok, r.cuerpo.existe], [200, true, false])
  r = res(); await require('../api/usuario')({ method: 'GET', headers: {}, url: '/api/usuario?numero=abc' }, r); assert.equal(r.statusCode, 400)
  r = res(); await require('../api/estadisticas')({ method: 'GET', headers: {} }, r)
  assert.equal(r.cuerpo.actividad.length, 30)
  delete process.env.DATOS_PEPPER
})

test('historial diario: una foto por día con los cambios y solo los últimos 30 días', async () => {
  const almacen = nuevoAlmacen(); const A = await instalacion(almacen)
  const dia = 86400000; const T = Date.parse('2031-01-01T12:00:00Z')
  const sync = (d, ahora) => svc.sincronizar({ almacen, cfg, instalacionId: A.id, ahora, cuerpo: { usuarios: { '51910227479': { vis: '519•••479', u: { r: { actualizado: ahora }, d, semilla: ahora === T } } } } })
  await sync({ monedas: 100, xp: 50 }, T)
  await sync({ monedas: 20, xp: 10 }, T + 3600000) // mismo día: se queda el último valor
  for (let i = 1; i <= 34; i++) await sync({ monedas: 1, xp: 1 }, T + i * dia)
  await sync({}, T + 40 * dia) // sin cambios: no crea día nuevo
  const r = await svc.perfilPublico({ almacen, cfg, numero: '51910227479', ip: '1.1.1.1', ahora: T })
  assert.equal(r.historial.length, 30)
  assert.ok(r.historial.every((p, i, a) => i === 0 || a[i - 1].dia < p.dia), 'en orden')
  assert.equal(r.historial.at(-1).monedas, 120 + 34); assert.equal(r.historial.at(-1).dia, '2031-02-04')
  assert.ok(!JSON.stringify(r.historial).includes('2031-02-10'))
})

test('panel admin: exige token y lista instalaciones con su última sincronización', async () => {
  const almacen = nuevoAlmacen(); const A = await instalacion(almacen); const B = await instalacion(almacen)
  const cfgAdmin = { ...cfg, adminToken: 'secreto-admin' }
  await svc.sincronizar({ almacen, cfg, instalacionId: A.id, ahora: 5e12, cuerpo: { usuarios: {} } })
  await assert.rejects(() => svc.resumenAdmin({ almacen, cfg: cfgAdmin, token: 'mal' }), { estado: 401 })
  await assert.rejects(() => svc.resumenAdmin({ almacen, cfg, token: '' }), { estado: 401 })
  await svc.banear({ almacen, cfg: cfgAdmin, token: 'secreto-admin', id: B.id })
  const r = await svc.resumenAdmin({ almacen, cfg: cfgAdmin, token: 'secreto-admin' })
  assert.equal(r.instalaciones.length, 2)
  assert.equal(r.instalaciones.find((i) => i.id === A.id).ultimo, 5e12)
  assert.equal(r.instalaciones.find((i) => i.id === B.id).baneada, true)
  assert.ok(!JSON.stringify(r).includes(A.clave), 'nunca expone claves')
  assert.equal(r.totales.instalaciones, 2)
})

test('reiniciar: borra jugadores y rankings, conserva instalaciones y cambia la época', async () => {
  const almacen = nuevoAlmacen(); const A = await instalacion(almacen)
  const cfgAdmin = { ...cfg, adminToken: 'secreto-admin' }
  const sync = (num, extra = {}) => svc.sincronizar({ almacen, cfg, instalacionId: A.id, ahora: 1e12, cuerpo: { usuarios: { [num]: { vis: '519•••479', u: { r: { actualizado: 1 }, d: { monedas: 50, xp: 20 }, semilla: true } } }, ...extra } })
  const r1 = await sync('51910227479'); assert.equal(r1.epoca, '0')
  assert.equal((await svc.top({ almacen })).top.length, 1)
  await assert.rejects(() => svc.reiniciarDatos({ almacen, cfg: cfgAdmin, token: 'mal', confirmar: 'REINICIAR' }), { estado: 401 })
  await assert.rejects(() => svc.reiniciarDatos({ almacen, cfg: cfgAdmin, token: 'secreto-admin', confirmar: 'si' }), { estado: 400 })
  const r = await svc.reiniciarDatos({ almacen, cfg: cfgAdmin, token: 'secreto-admin', confirmar: 'REINICIAR' })
  assert.ok(r.ok && r.borradas > 0 && r.epoca !== '0')
  assert.equal((await svc.top({ almacen })).top.length, 0)
  assert.deepEqual(await svc.perfilPublico({ almacen, cfg, numero: '51910227479', ip: '2.2.2.2' }), { existe: false })
  await svc.autenticar({ almacen, cfg, id: A.id, clave: A.clave }) // la instalación sigue registrada
  const resumen = await svc.resumenAdmin({ almacen, cfg: cfgAdmin, token: 'secreto-admin' })
  assert.equal(resumen.instalaciones.length, 1); assert.equal(resumen.totales.usuarios, 0)
  // Un bot con la época vieja: no se aplica nada y se le avisa para que vuelva a subir todo.
  const vieja = await sync('51910227479', { epoca: '0' })
  assert.equal(vieja.reinicio, true); assert.equal(vieja.epoca, r.epoca); assert.deepEqual(vieja.usuarios, {})
  assert.equal((await svc.top({ almacen })).top.length, 0, 'no se aplicó el envío viejo')
  // Con la época nueva (o sin época, bot antiguo) sí se acepta y vuelve a sembrar.
  const nueva = await sync('51910227479', { epoca: r.epoca }); assert.ok(!nueva.reinicio); assert.equal(nueva.usuarios['51910227479'].u.monedas, 50)
  assert.equal((await svc.top({ almacen })).top.length, 1)
})

test('Upstash: borrarPatron recorre el cursor y borra por lotes', async () => {
  const { crearUpstash } = require('../lib/almacen')
  const claves = Array.from({ length: 250 }, (_, i) => `u:${i}`)
  const borradas = []; const llamadas = []
  const cliente = {
    async scan(cursor, op) { llamadas.push([cursor, op.match]); return cursor === '0' ? ['7', claves.slice(0, 150)] : ['0', claves.slice(150)] },
    async del(...ks) { borradas.push(...ks); return ks.length },
  }
  const a = crearUpstash({ KV_REST_API_URL: 'https://x', KV_REST_API_TOKEN: 't' }, cliente)
  assert.equal(await a.borrarPatron('u:*'), 250)
  assert.equal(borradas.length, 250); assert.deepEqual(llamadas, [['0', 'u:*'], ['7', 'u:*']])
})
