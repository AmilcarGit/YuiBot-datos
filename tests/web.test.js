const test = require('node:test')
const assert = require('node:assert/strict')
const S = require('../lib/seguridad')
const { crearMemoria } = require('../lib/almacen')
const svc = require('../lib/servicio')
const W = require('../lib/web')

const cfg = S.config({ DATOS_PEPPER: 'pimienta-de-prueba' })
const NUM = '51910000001'
const T0 = Date.UTC(2026, 10, 22, 17)

async function jugadorSincronizado(almacen) {
  const { id } = await svc.registrarInstalacion({ almacen, cfg, ip: '1.1.1.1', ahora: T0 })
  await svc.sincronizar({ almacen, cfg, instalacionId: id, ahora: T0, cuerpo: { usuarios: { [NUM]: { u: { semilla: true, r: { actualizado: T0, racha: 1 }, d: { monedas: 1000, xp: 200 } }, vis: '519•••001' } } } })
  return id
}
async function sesion(almacen, id, ahora = T0) {
  const { codigo } = await W.crearVinculo({ almacen, cfg, instalacionId: id, numero: NUM, ahora })
  return W.entrar({ almacen, cfg, numero: NUM, codigo, nombre: 'Ana', ip: '2.2.2.2', ahora })
}

test('vincular exige que ya existan datos del número', async () => {
  const almacen = crearMemoria()
  const { id } = await svc.registrarInstalacion({ almacen, cfg, ip: '1.1.1.1', ahora: T0 })
  await assert.rejects(W.crearVinculo({ almacen, cfg, instalacionId: id, numero: NUM, ahora: T0 }), /Todavía no hay datos/)
})

test('entrar: código correcto da sesión; incorrecto no; 5 fallos lo anulan; el código sirve una sola vez', async () => {
  const almacen = crearMemoria()
  const id = await jugadorSincronizado(almacen)
  const { codigo } = await W.crearVinculo({ almacen, cfg, instalacionId: id, numero: NUM, ahora: T0 })
  const malo = codigo === '000000' ? '111111' : '000000'
  await assert.rejects(W.entrar({ almacen, cfg, numero: NUM, codigo: malo, ip: '9.9.9.9', ahora: T0 }), /inválido/)
  const ok = await W.entrar({ almacen, cfg, numero: NUM, codigo, nombre: 'Ana', ip: '9.9.9.9', ahora: T0 })
  assert.ok(ok.token.length > 20)
  assert.equal(ok.visible, '519•••001')
  assert.ok(ok.comandos.includes('menu'))
  await assert.rejects(W.entrar({ almacen, cfg, numero: NUM, codigo, ip: '9.9.9.9', ahora: T0 }), /inválido/, 'ya se usó')

  const { codigo: c2 } = await W.crearVinculo({ almacen, cfg, instalacionId: id, numero: NUM, ahora: T0 })
  const falso = c2 === '123456' ? '654321' : '123456'
  for (let i = 0; i < 5; i++) await assert.rejects(W.entrar({ almacen, cfg, numero: NUM, codigo: falso, ip: `3.3.3.${i}`, ahora: T0 }))
  await assert.rejects(W.entrar({ almacen, cfg, numero: NUM, codigo: c2, ip: '4.4.4.4', ahora: T0 }), /inválido|intentos/)
})

test('sin sesión válida no se ejecuta nada', async () => {
  const almacen = crearMemoria()
  await assert.rejects(W.comando({ almacen, cfg, token: 'falso', texto: 'menu' }), /sesión|Inicia/)
})

test('comandos: menu, daily y trabajar usan los datos reales y los guardan', async () => {
  const almacen = crearMemoria()
  const id = await jugadorSincronizado(almacen)
  const { token } = await sesion(almacen, id)

  const menu = await W.comando({ almacen, cfg, token, texto: '.menu', ahora: T0 })
  assert.match(menu.respuestas.join('\n'), /daily/)
  assert.doesNotMatch(menu.respuestas.join('\n'), /serbot|antienlaces/, 'solo comandos que funcionan en la web')

  const d = await W.comando({ almacen, cfg, token, texto: 'daily', ahora: T0 + 1000 })
  assert.match(d.respuestas.join('\n'), /monedas/i)
  const guardado = await svc.leerJson(almacen, `u:${S.idUsuario(cfg.pepper, NUM)}`)
  assert.ok(guardado.monedas > 1000 && guardado.ultimoDaily > 0)
  assert.equal(guardado.nombre, 'Ana')

  const otra = await W.comando({ almacen, cfg, token, texto: 'daily', ahora: T0 + 20000 })
  assert.equal(guardado.monedas, (await svc.leerJson(almacen, `u:${S.idUsuario(cfg.pepper, NUM)}`)).monedas, 'el segundo daily no paga')
  assert.ok(otra.respuestas.length)

  const t = await W.comando({ almacen, cfg, token, texto: 'trabajar granjero', ahora: T0 + 30000 })
  assert.ok(t.respuestas.length)
  const trabajo = await W.comando({ almacen, cfg, token, texto: 'trabajar', ahora: T0 + 40000 })
  assert.match(trabajo.respuestas.join('\n'), /monedas/i)
  const rec = await svc.leerJson(almacen, `u:${S.idUsuario(cfg.pepper, NUM)}`)
  const tr = await svc.leerJson(almacen, `t:${S.idUsuario(cfg.pepper, NUM)}`)
  assert.ok(rec.trabajosGanado > 0 && tr.ganado === rec.trabajosGanado && tr.veces.granjero === 1)
  assert.ok((await almacen.zpos('rank:monedas', S.idUsuario(cfg.pepper, NUM))).puntaje > 1000)
})

test('comandos: top y perfil leen el ranking global; uno desconocido avisa', async () => {
  const almacen = crearMemoria()
  const id = await jugadorSincronizado(almacen)
  const { token } = await sesion(almacen, id)
  const top = await W.comando({ almacen, cfg, token, texto: 'top monedas', ahora: T0 })
  assert.match(top.respuestas.join('\n'), /519•••001/)
  const perfil = await W.comando({ almacen, cfg, token, texto: 'perfil', ahora: T0 })
  assert.match(perfil.respuestas.join('\n'), /Ranking global/)
  const raro = await W.comando({ almacen, cfg, token, texto: 'inventadoxyz', ahora: T0 })
  assert.match(raro.respuestas.join('\n'), /No conozco/)
})

test('lo hecho en la web vuelve al bot en la siguiente sincronización (previo)', async () => {
  const almacen = crearMemoria()
  const id = await jugadorSincronizado(almacen)
  const { token } = await sesion(almacen, id)
  await W.comando({ almacen, cfg, token, texto: 'daily', ahora: T0 + 1000 })
  const r = await svc.sincronizar({ almacen, cfg, instalacionId: id, ahora: T0 + 60000, cuerpo: { usuarios: { [NUM]: { u: { r: { actualizado: T0 + 60000 }, d: { monedas: 0 } } } } } })
  assert.ok(r.usuarios[NUM].previo.monedas > 1000, 'el bot sabe que había monedas nuevas')
})

test('salir cierra la sesión', async () => {
  const almacen = crearMemoria()
  const id = await jugadorSincronizado(almacen)
  const { token } = await sesion(almacen, id)
  await W.salir({ almacen, cfg, token })
  await assert.rejects(W.yo({ almacen, cfg, token }), /sesión|Inicia/)
})
