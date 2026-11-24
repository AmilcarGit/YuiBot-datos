// Motor de comandos en la web: ejecuta los MISMOS comandos del bot (lib/yui) sobre el perfil guardado en la base.
// El perfil del servidor se convierte al formato del bot, se ejecuta el comando y el resultado se guarda de vuelta.
const { AsyncLocalStorage } = require('node:async_hooks')
const S = require('./seguridad')
const { ErrorApi, leerJson, guardarJson, top, perfilPorHash } = require('./servicio')

const contexto = (globalThis[Symbol.for('yui.contexto')] ||= new AsyncLocalStorage())
const diaPeru = (ahora) => new Date(ahora - 5 * 3600000).toISOString().slice(0, 10)
const nivelBot = (xp) => Math.floor(Math.sqrt(Math.max(0, xp) / 20)) + 1
const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {})

let cargado = null
const yui = () => (cargado ||= Promise.all([
  import('./yui/nucleo/cargador.js'), import('./yui/nucleo/juego.js'), import('./yui/estilo/index.js'),
]).then(([cargador, juego, estilo]) => ({ cargador, juego, estilo })))

/** Perfil del servidor → formato del bot. */
function haciaBot(u, t) {
  return {
    nombre: u.nombre || 'Jugador', registrado: true,
    monedas: n(u.monedas), xp: n(u.xp), nivel: nivelBot(n(u.xp)), mensajes: n(u.mensajes), racha: n(u.racha),
    ultimoDaily: n(u.ultimoDaily), ultimoTrabajo: n(u.ultimoTrabajo), esperaTrabajo: n(u.esperaTrabajo), ultimoAdivina: n(u.ultimoAdivina), ultimoXp: n(u.ultimoXp),
    semana: u.semana || '', xpSemana: n(u.xpSemana), trabajo: u.trabajo || '',
    trabajosGanado: n(t.ganado), veces: { ...obj(t.veces) },
    inventario: Object.fromEntries((Array.isArray(u.inventario) ? u.inventario : []).map((id) => [id, true])),
    coleccion: { ...obj(u.coleccion) },
    logros: Object.keys(obj(u.logros)),
  }
}

/** Resultado del comando → perfil del servidor (contadores y registros). */
function haciaServidor(u, t, antes, despues, ahora) {
  const dGanado = Math.max(0, despues.trabajosGanado - antes.trabajosGanado)
  const dVeces = Object.values(despues.veces).reduce((a, b) => a + n(b), 0) - Object.values(antes.veces).reduce((a, b) => a + n(b), 0)
  const nuevo = {
    ...u,
    monedas: Math.max(0, Math.trunc(despues.monedas)), xp: Math.max(0, Math.trunc(despues.xp)), mensajes: Math.max(0, Math.trunc(despues.mensajes)),
    racha: despues.racha, mejorRacha: Math.max(n(u.mejorRacha), despues.racha),
    ultimoDaily: despues.ultimoDaily, ultimoTrabajo: despues.ultimoTrabajo, esperaTrabajo: despues.esperaTrabajo, ultimoAdivina: despues.ultimoAdivina, ultimoXp: despues.ultimoXp,
    trabajo: despues.trabajo, semana: despues.semana, xpSemana: despues.xpSemana,
    trabajosGanado: n(u.trabajosGanado) + dGanado, trabajosVeces: n(u.trabajosVeces) + Math.max(0, dVeces),
    inventario: Object.keys(despues.inventario).filter((k) => despues.inventario[k]),
    coleccion: despues.coleccion,
    logros: Object.fromEntries(despues.logros.map((id) => [id, 1])),
    actualizado: ahora,
  }
  nuevo.nivel = Math.floor(Math.sqrt(Math.max(0, nuevo.xp) / 100)) // mismo cálculo que fusion.js
  const nt = { ...t, ganado: n(t.ganado) + dGanado, veces: { ...obj(t.veces) }, actualizado: ahora }
  for (const [k, v] of Object.entries(despues.veces)) {
    const d = n(v) - n(antes.veces[k])
    if (d > 0 && /^[a-z]{1,20}$/.test(k)) nt.veces[k] = n(nt.veces[k]) + d
  }
  return { u: nuevo, t: nt }
}

/** Ejecuta un texto como lo haría el bot. Devuelve la lista de mensajes de respuesta. */
async function ejecutarComando({ almacen, cfg, h, texto, ahora = Date.now() }) {
  if (!(await almacen.set(`lock:${h}`, '1', { nx: true, ex: 8 }))) throw new ErrorApi(429, 'Yui sigue con tu comando anterior, espera un momento.')
  try {
    const limpio = String(texto || '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200)
    if (!limpio) throw new ErrorApi(400, 'Escribe un comando, por ejemplo: menu')
    const { cargador, juego, estilo } = await yui()
    const [nombre, ...args] = limpio.replace(/^[.!#/]/, '').split(/\s+/)
    const habilidad = cargador.buscar((nombre || '').toLowerCase())

    const srv = await leerJson(almacen, `u:${h}`)
    if (!srv) throw new ErrorApi(404, 'Aún no tienes datos. Regístrate en el bot con .registrar y vuelve a vincular tu cuenta.')
    const srvT = (await leerJson(almacen, `t:${h}`)) || {}
    const u = haciaBot(srv, srvT)
    const antes = structuredClone(u)

    const respuestas = []
    const ctx = {
      sock: {}, m: {}, jid: `web:${h}`, grupo: false, numero: h, texto: limpio, esDueno: false, esAdmin: false,
      usuario: u, chat: {}, prefijo: '.', args,
      responder: async (c) => { respuestas.push(String(c)) },
      // Audio y video llegan como enlace: el navegador los reproduce o descarga directamente, sin pasar por el servidor.
      enviar: async (c) => {
        const tipo = c?.audio ? 'audio' : c?.video ? 'video' : c?.document ? 'archivo' : null
        const dato = c?.audio || c?.video || c?.document
        // Archivo en memoria (YuiApi): cabe en la respuesta de la página como data URI.
        const url = Buffer.isBuffer(dato) ? `data:${c.mimetype || 'audio/mpeg'};base64,${dato.toString('base64')}` : dato?.url
        if (tipo && /^(https?:\/\/|data:audio\/)/.test(url || '')) respuestas.push({ texto: '', medio: { tipo, url, nombre: String(c.fileName || c.caption || '').slice(0, 120) } })
        else if (c?.text) respuestas.push(String(c.text))
      },
      botonesActivos: true,
      // Texto + botones: la página los dibuja debajo del mensaje (los desplegables salen agrupados).
      botones: async (c, lista, opciones) => {
        respuestas.push({
          texto: String(c),
          ...(opciones?.enLinea ? { enLinea: true } : {}),
          ...(/^https:\/\/[^\s]+\.(jpe?g|png|webp)(\?.*)?$/i.test(opciones?.media || '') ? { imagen: opciones.media } : {}),
          botones: lista.filter((b) => b.cmd).map((b) => ({ texto: String(b.texto), cmd: String(b.cmd) })),
          secciones: lista.flatMap((b) => b.secciones || []).map((sec) => ({ titulo: String(sec.titulo), filas: sec.filas.map((f) => ({ titulo: String(f.titulo), descripcion: String(f.descripcion || ''), cmd: String(f.cmd) })) })),
        })
      },
    }

    // Igual que en WhatsApp: cada mensaje cuenta y da un poco de XP cada 10 segundos.
    u.mensajes++
    if (ahora - u.ultimoXp > 10000) {
      u.ultimoXp = ahora
      if (juego.ganarXp(u, 3)) respuestas.push(estilo.ok(estilo.dice('nivelUp', { nombre: u.nombre, nivel: u.nivel })))
    }

    await contexto.run({
      top: (campo, limite) => top({ almacen, campo, limite }),
      perfil: () => perfilPorHash({ almacen, h }),
    }, async () => {
      if (!habilidad) respuestas.push(estilo.mal(`No conozco ese comando. Escribe menu para ver todos (${limpio.slice(0, 30)}).`))
      else {
        try { await habilidad.ejecutar(ctx.sock, ctx.m, ctx) } catch (e) { console.error('[COMANDO]', habilidad.nombre, e?.message); respuestas.push(estilo.mal(estilo.dice('fallo'))) }
      }
    })

    const { u: nuevo, t: nuevoT } = haciaServidor(srv, srvT, antes, u, ahora)
    await guardarJson(almacen, `u:${h}`, nuevo)
    await guardarJson(almacen, `t:${h}`, nuevoT)
    await Promise.all([
      almacen.zadd('rank:monedas', nuevo.monedas, h), almacen.zadd('rank:xp', nuevo.xp, h), almacen.zadd('rank:trabajos', nuevoT.ganado, h),
      nuevo.semana ? almacen.zadd(`rank:semana:${nuevo.semana}`, nuevo.xpSemana || 0, h) : null,
      almacen.hset(`hist:${h}`, diaPeru(ahora), `${nuevo.monedas},${nuevo.xp}`),
    ])
    return respuestas
  } finally { await almacen.del(`lock:${h}`) }
}

async function comandosDisponibles() { return (await yui()).cargador.listar().map((c) => c.nombre) }

/** Lista para la pestaña "Comandos" de la página: nombre, descripción y categoría. */
async function catalogoComandos() {
  return (await yui()).cargador.listar().map((c) => ({ nombre: c.nombre, alias: c.alias || [], ayuda: c.ayuda || '', categoria: c.categoria || 'general' }))
}

module.exports = { ejecutarComando, haciaBot, haciaServidor, comandosDisponibles, catalogoComandos }
