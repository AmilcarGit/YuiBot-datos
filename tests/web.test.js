const test = require('node:test')
const assert = require('node:assert/strict')
const S = require('../lib/seguridad')
const { crearMemoria } = require('../lib/almacen')
const svc = require('../lib/servicio')
const W = require('../lib/web')

const cfg = S.config({ DATOS_PEPPER: 'pimienta-de-prueba' })
const NUM = '51910000001'
const T0 = Date.UTC(2026, 10, 22, 17)
const texto = (r) => r.respuestas.map((x) => (typeof x === 'string' ? x : x.texto)).join('\n')

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
  assert.ok(ok.catalogo.some((c) => c.nombre === 'daily' && c.ayuda && c.categoria === 'economia'), 'catálogo para copiar comandos')
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
  assert.match(texto(menu), /daily/)
  assert.doesNotMatch(texto(menu), /serbot|antienlaces/, 'solo comandos que funcionan en la web')

  const d = await W.comando({ almacen, cfg, token, texto: 'daily', ahora: T0 + 1000 })
  assert.match(texto(d), /monedas/i)
  const guardado = await svc.leerJson(almacen, `u:${S.idUsuario(cfg.pepper, NUM)}`)
  assert.ok(guardado.monedas > 1000 && guardado.ultimoDaily > 0)
  assert.equal(guardado.nombre, 'Ana')

  const otra = await W.comando({ almacen, cfg, token, texto: 'daily', ahora: T0 + 20000 })
  assert.equal(guardado.monedas, (await svc.leerJson(almacen, `u:${S.idUsuario(cfg.pepper, NUM)}`)).monedas, 'el segundo daily no paga')
  assert.ok(otra.respuestas.length)

  const t = await W.comando({ almacen, cfg, token, texto: 'trabajar granjero', ahora: T0 + 30000 })
  assert.ok(t.respuestas.length)
  const trabajo = await W.comando({ almacen, cfg, token, texto: 'trabajar', ahora: T0 + 40000 })
  assert.match(texto(trabajo), /monedas/i)
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
  assert.match(texto(top), /519•••001/)
  const perfil = await W.comando({ almacen, cfg, token, texto: 'perfil', ahora: T0 })
  assert.match(texto(perfil), /Ranking global/)
  const raro = await W.comando({ almacen, cfg, token, texto: 'inventadoxyz', ahora: T0 })
  assert.match(texto(raro), /No conozco/)
})

test('lo hecho en la web vuelve al bot en la siguiente sincronización (previo)', async () => {
  const almacen = crearMemoria()
  const id = await jugadorSincronizado(almacen)
  const { token } = await sesion(almacen, id)
  await W.comando({ almacen, cfg, token, texto: 'daily', ahora: T0 + 1000 })
  const r = await svc.sincronizar({ almacen, cfg, instalacionId: id, ahora: T0 + 60000, cuerpo: { usuarios: { [NUM]: { u: { r: { actualizado: T0 + 60000 }, d: { monedas: 0 } } } } } })
  assert.ok(r.usuarios[NUM].previo.monedas > 1000, 'el bot sabe que había monedas nuevas')
})

test('las respuestas con botones llegan con sus atajos y desplegables', async () => {
  const almacen = crearMemoria()
  const id = await jugadorSincronizado(almacen)
  const { token } = await sesion(almacen, id)
  const ppt = await W.comando({ almacen, cfg, token, texto: 'ppt', ahora: T0 })
  assert.deepEqual(ppt.respuestas[0].botones.map((b) => b.cmd), ['ppt piedra', 'ppt papel', 'ppt tijera'])
  const juego = await W.comando({ almacen, cfg, token, texto: 'ppt papel', ahora: T0 + 1000 })
  assert.match(juego.respuestas[0].texto, /Yui/)
  assert.equal(juego.respuestas[0].botones.length, 3, 'otra ronda con un toque')
  const menu = await W.comando({ almacen, cfg, token, texto: 'menu', ahora: T0 + 2000 })
  const secciones = menu.respuestas[0].secciones
  assert.ok(secciones.length >= 2 && secciones.every((s) => s.filas.length && s.filas.every((f) => f.cmd)))
  const ruleta = await W.comando({ almacen, cfg, token, texto: 'ruleta', ahora: T0 + 3000 })
  assert.deepEqual(ruleta.respuestas[0].botones.map((b) => b.cmd), ['ruleta 100 rojo', 'ruleta 100 negro', 'ruleta 100 verde'])
})

test('descargas: la web devuelve audio y video como enlaces', async () => {
  const almacen = crearMemoria()
  const id = await jugadorSincronizado(almacen)
  const { token } = await sesion(almacen, id)
  const original = globalThis.fetch
  globalThis.fetch = async (u) => ({ ok: true, status: 200, json: async () => String(u).includes('busqueda')
    ? { status: true, data: [{ type: 'video', url: 'https://youtu.be/a', title: 'Patadas', duration: '3:45', author: { name: 'LM' } }] }
    : String(u).includes('ytmp3') ? { status: true, data: { download: 'https://x.test/a.mp3' } }
    : { result: [{ title: 'V', downloads: { mp4: { url: 'https://x.test/v.mp4' } } }] } })
  try {
    const yts = await W.comando({ almacen, cfg, token, texto: 'yts patadas', ahora: T0 })
    assert.ok(yts.respuestas[0].secciones.length === 2 && yts.respuestas[0].secciones[0].filas[0].cmd.startsWith('ytmp3 https://youtu.be/a'))
    assert.equal(yts.respuestas[0].enLinea, true)
    assert.match(yts.respuestas[0].texto, /patadas/)
    const play = await W.comando({ almacen, cfg, token, texto: 'play patadas', ahora: T0 + 1000 })
    assert.deepEqual(play.respuestas.filter((r) => r.medio).map((r) => r.medio.tipo), ['audio'])
    assert.equal(play.respuestas.find((r) => r.medio).medio.url, 'https://x.test/a.mp3')
    const mp4 = await W.comando({ almacen, cfg, token, texto: 'ytmp4 https://youtu.be/a', ahora: T0 + 2000 })
    assert.equal(mp4.respuestas.find((r) => r.medio).medio.tipo, 'video')
    const mal = await W.comando({ almacen, cfg, token, texto: 'ytmp3 hola', ahora: T0 + 3000 })
    assert.ok(!mal.respuestas.some((r) => r.medio))
  } finally { globalThis.fetch = original }
})

test('salir cierra la sesión', async () => {
  const almacen = crearMemoria()
  const id = await jugadorSincronizado(almacen)
  const { token } = await sesion(almacen, id)
  await W.salir({ almacen, cfg, token })
  await assert.rejects(W.yo({ almacen, cfg, token }), /sesión|Inicia/)
})

test('.dar regala monedas a otro jugador y el servidor lo guarda', async () => {
  const almacen = crearMemoria()
  const id = await jugadorSincronizado(almacen)
  const OTRO = '51910000002'
  await svc.sincronizar({ almacen, cfg, instalacionId: id, ahora: T0 + 1, cuerpo: { usuarios: { [OTRO]: { u: { semilla: true, r: { actualizado: T0 }, d: { monedas: 50, xp: 0 } }, vis: '519•••002' } } } })
  const { token } = await sesion(almacen, id)
  const r = await W.comando({ almacen, cfg, token, texto: `.dar ${OTRO} 300`, ahora: T0 + 5000 })
  assert.match(texto(r), /Le diste 300/)
  const yo = await svc.leerJson(almacen, `u:${S.idUsuario(cfg.pepper, NUM)}`)
  const otro = await svc.leerJson(almacen, `u:${S.idUsuario(cfg.pepper, OTRO)}`)
  assert.equal(yo.monedas, 700); assert.equal(otro.monedas, 350)
  const mucho = await W.comando({ almacen, cfg, token, texto: `.dar ${OTRO} 5000`, ahora: T0 + 20000 })
  assert.match(texto(mucho), /No tienes tantas/)
  const yoMismo = await W.comando({ almacen, cfg, token, texto: `.dar ${NUM} 10`, ahora: T0 + 40000 })
  assert.match(texto(yoMismo), /ti mismo/)
  const nadie = await W.comando({ almacen, cfg, token, texto: '.dar 51999999999 10', ahora: T0 + 60000 })
  assert.match(texto(nadie), /no tiene datos|datos todavía/i)
})

test('web: .pin responde con imágenes que el navegador muestra directo', async () => {
  const almacen = crearMemoria(); const id = await jugadorSincronizado(almacen); const { token } = await sesion(almacen, id)
  const original = globalThis.fetch
  globalThis.fetch = async (url) => ({ ok: true, status: 200, url: String(url), text: async () => '<a href="/pin/123456789012345/"><img src="https://i.pinimg.com/236x/aa/bb/cc/web.jpg"></a>' })
  try {
    const r = await W.comando({ almacen, cfg, token, texto: '.pin web-test-unico', ahora: T0 + 1000 })
    const medios = r.respuestas.filter((x) => typeof x === 'object' && x.medio)
    assert.equal(medios.length, 1); assert.equal(medios[0].medio.tipo, 'imagen'); assert.match(medios[0].medio.url, /^https:\/\/i\.pinimg\.com\/736x\//)
  } finally { globalThis.fetch = original }
})

test('web: .pin con varias imágenes devuelve una sola galería', async () => {
  const almacen = crearMemoria(); const id = await jugadorSincronizado(almacen); const { token } = await sesion(almacen, id)
  const original = globalThis.fetch
  const html = [1, 2, 3, 4].map(i => `<a href="/pin/12345678901234${i}/"><img src="https://i.pinimg.com/236x/aa/bb/cc/g${i}.jpg"></a>`).join('')
  globalThis.fetch = async (url) => ({ ok: true, status: 200, url: String(url), text: async () => html })
  try {
    const r = await W.comando({ almacen, cfg, token, texto: '.pin galeria-test-unico 4', ahora: T0 + 1000 })
    const medios = r.respuestas.filter((x) => typeof x === 'object' && x.medio)
    assert.equal(medios.length, 1); assert.equal(medios[0].medio.tipo, 'album'); assert.equal(medios[0].medio.urls.length, 4)
  } finally { globalThis.fetch = original }
})

test('web: .facebook responde con un video que el navegador reproduce directo', async () => {
  const almacen = crearMemoria(); const id = await jugadorSincronizado(almacen); const { token } = await sesion(almacen, id)
  const original = globalThis.fetch
  globalThis.fetch = async (url) => ({ ok: true, status: 200, url: String(url), json: async () => ({ status: true, result: { title: 'Mi video', media: { video_hd: 'https://video.xx.fbcdn.net/hd.mp4', video_sd: 'https://video.xx.fbcdn.net/sd.mp4' } } }) })
  try {
    const r = await W.comando({ almacen, cfg, token, texto: '.facebook https://www.facebook.com/watch?v=1', ahora: T0 + 1000 })
    const medios = r.respuestas.filter((x) => typeof x === 'object' && x.medio)
    assert.equal(medios.length, 1); assert.equal(medios[0].medio.tipo, 'video'); assert.equal(medios[0].medio.url, 'https://video.xx.fbcdn.net/hd.mp4')
  } finally { globalThis.fetch = original }
})
