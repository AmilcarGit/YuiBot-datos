// Chat global de la web: todos los jugadores con sesión hablan en una misma sala.
// Reglas: 200 caracteres, sin enlaces ni teléfonos, un mensaje cada 3 s (12 por minuto), sin repetir,
// 3 reportes ocultan un mensaje y el admin puede borrar mensajes o silenciar a alguien.
const S = require('./seguridad')
const { ErrorApi, leerJson } = require('./servicio')

const MAX_TEXTO = 200
const GUARDAR = 200 // mensajes que se conservan
const VISIBLES = 60 // mensajes que se envían al abrir
const REPORTES_OCULTAR = 3
const SEGUNDOS_ENTRE = 3
const POR_MINUTO = 12
const DIAS_REPORTE = 3

const limpio = (t, max) => String(t || '').replace(/[\u0000-\u001f\u007f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
const autorDe = (h) => String(h).slice(0, 10)
const ENLACE = /(https?:\/\/|www\.|\b[a-z0-9-]{2,}\.(com|net|org|io|me|gg|xyz|ly|co|pe|ar|mx|es|tv|app|link|site|online|club|top|cc)\b|t\.me\/|wa\.me\/|chat\.whatsapp)/i
const TELEFONO = /(\+?\d[\s().-]?){8,}/

/** Devuelve el motivo si el mensaje rompe las reglas, o '' si está bien. */
function motivoRechazo(texto) {
  if (!texto) return 'Escribe un mensaje.'
  if (ENLACE.test(texto)) return 'No se permiten enlaces en el chat global.'
  if (TELEFONO.test(texto)) return 'No compartas números de teléfono en el chat global.'
  if (/(.)\1{9,}/u.test(texto)) return 'Evita repetir tanto la misma letra.'
  return ''
}

async function jugador({ almacen, cfg, token }) {
  if (!token || String(token).length > 100) throw new ErrorApi(401, 'Inicia sesión de nuevo.')
  const s = await leerJson(almacen, `ses:${S.hashClave(cfg.pepper, token)}`)
  if (!s) throw new ErrorApi(401, 'Tu sesión venció. Inicia sesión de nuevo.')
  const u = await leerJson(almacen, `u:${s.h}`)
  if (!u) throw new ErrorApi(404, 'Todavía no hay datos de tu cuenta.')
  return { h: s.h, u }
}

async function enviar({ almacen, cfg, token, texto, ahora = Date.now() }) {
  const { h, u } = await jugador({ almacen, cfg, token })
  const a = autorDe(h)
  const silencio = await almacen.get(`g:mute:${a}`)
  if (silencio) throw new ErrorApi(403, 'Estás silenciado en el chat global por un rato.')
  const t = limpio(texto, MAX_TEXTO + 50)
  if (t.length > MAX_TEXTO) throw new ErrorApi(400, `Máximo ${MAX_TEXTO} caracteres.`)
  const motivo = motivoRechazo(t); if (motivo) throw new ErrorApi(400, motivo)
  if (await almacen.incrby(`rl:g3:${h}:${Math.floor(ahora / (SEGUNDOS_ENTRE * 1000))}`, 1, { ex: 10 }) > 1) throw new ErrorApi(429, `Espera ${SEGUNDOS_ENTRE} segundos entre mensajes.`)
  if (await almacen.incrby(`rl:g60:${h}:${Math.floor(ahora / 60000)}`, 1, { ex: 120 }) > POR_MINUTO) throw new ErrorApi(429, 'Vas muy rápido, respira un momento.')
  const huella = S.hashClave(cfg.pepper, t.toLowerCase())
  if (await almacen.set(`g:rep:${h}:${huella}`, '1', { nx: true, ex: 60 }) === null) throw new ErrorApi(400, 'No repitas el mismo mensaje.')
  const id = ahora.toString(36) + Math.random().toString(36).slice(2, 5)
  const nombre = limpio(u.nombre, 24) || 'Jugador'
  await almacen.hset('g:m', id, JSON.stringify({ id, t: ahora, a, n: nombre, nv: Math.max(1, Number(u.nivel) || 1), x: t, r: 0 }))
  await almacen.zadd('g:idx', ahora, id)
  await almacen.set('g:ult', id)
  if ((await almacen.zcount('g:idx')) > GUARDAR + 60) {
    const todos = await almacen.ztop('g:idx', GUARDAR + 200)
    for (const { miembro } of todos.slice(GUARDAR)) { await almacen.zrem('g:idx', miembro); await almacen.hdel('g:m', miembro) }
  }
  return { ok: true, id }
}

async function mensajes(almacen, n) {
  const filas = await almacen.ztop('g:idx', n)
  const crudos = filas.length ? await almacen.hmget('g:m', filas.map((f) => f.miembro)) : []
  return crudos.map((c) => { try { return c ? JSON.parse(c) : null } catch { return null } }).filter(Boolean).sort((x, y) => x.t - y.t)
}

/** Si nada cambió desde la última vez, responde sin leer los mensajes (una sola consulta a la base). */
async function leer({ almacen, cfg, token, desde }) {
  const { h } = await jugador({ almacen, cfg, token })
  const ult = (await almacen.get('g:ult')) || ''
  const a = autorDe(h)
  if (desde && desde === ult) return { ok: true, igual: true, ult, yo: a }
  const lista = (await mensajes(almacen, VISIBLES)).filter((m) => m.r < REPORTES_OCULTAR)
  return { ok: true, ult, yo: a, mensajes: lista.map((m) => ({ id: m.id, t: m.t, a: m.a, n: m.n, nv: m.nv, x: m.x })) }
}

async function reportar({ almacen, cfg, token, id, ahora = Date.now() }) {
  const { h } = await jugador({ almacen, cfg, token })
  const a = autorDe(h)
  if (await almacen.incrby(`rl:grep:${h}:${Math.floor(ahora / 3600000)}`, 1, { ex: 7200 }) > 20) throw new ErrorApi(429, 'Demasiados reportes por hora.')
  const [crudo] = await almacen.hmget('g:m', [String(id || '')])
  if (!crudo) throw new ErrorApi(404, 'Ese mensaje ya no existe.')
  const m = JSON.parse(crudo)
  if (m.a === a) throw new ErrorApi(400, 'No puedes reportar tu propio mensaje.')
  if (await almacen.set(`g:rp:${m.id}:${a}`, '1', { nx: true, ex: DIAS_REPORTE * 86400 }) === null) return { ok: true, repetido: true }
  m.r = (m.r || 0) + 1
  await almacen.hset('g:m', m.id, JSON.stringify(m))
  await almacen.set('g:ult', `${m.id}.${m.r}`)
  return { ok: true, oculto: m.r >= REPORTES_OCULTAR }
}

// ── Moderación (token de administrador) ──
const admin = (cfg, token) => { if (!cfg.adminToken || !S.iguales(token || '', cfg.adminToken)) throw new ErrorApi(401, 'No autorizado.') }

async function listarAdmin({ almacen, cfg, token }) {
  admin(cfg, token)
  return { ok: true, mensajes: (await mensajes(almacen, 40)).reverse() }
}
async function borrarAdmin({ almacen, cfg, token, id }) {
  admin(cfg, token)
  await almacen.zrem('g:idx', String(id || '')); await almacen.hdel('g:m', String(id || '')); await almacen.set('g:ult', `b${Date.now().toString(36)}`)
  return { ok: true }
}
async function silenciarAdmin({ almacen, cfg, token, autor, horas = 24, quitar = false }) {
  admin(cfg, token)
  const a = String(autor || '')
  if (!/^[0-9a-f]{10}$/.test(a)) throw new ErrorApi(400, 'Autor inválido.')
  if (quitar) { await almacen.del(`g:mute:${a}`); return { ok: true, silenciado: false } }
  const h = Math.min(24 * 30, Math.max(0.1, Number(horas) || 24))
  await almacen.set(`g:mute:${a}`, '1', { ex: Math.round(h * 3600) })
  return { ok: true, silenciado: true, horas: h }
}

module.exports = { enviar, leer, reportar, listarAdmin, borrarAdmin, silenciarAdmin, motivoRechazo, REPORTES_OCULTAR, MAX_TEXTO }
