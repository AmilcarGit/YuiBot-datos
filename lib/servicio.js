// Lógica del servidor (sin HTTP): registrar instalaciones, sincronizar usuarios y rankings.
const S = require('./seguridad')
const { fusionarUsuario, fusionarTrabajos } = require('./fusion')

class ErrorApi extends Error {
  constructor(estado, mensaje) { super(mensaje); this.estado = estado }
}

const leerJson = async (almacen, k) => {
  const v = await almacen.get(k)
  if (v == null) return null
  if (typeof v === 'object') return v
  try { return JSON.parse(v) } catch { return null }
}
const guardarJson = (almacen, k, v) => almacen.set(k, JSON.stringify(v))
const diaPeru = (ahora) => new Date(ahora - 5 * 3600000).toISOString().slice(0, 10)

// ── Instalaciones ─────────────────────────────────────────────────────
async function registrarInstalacion({ almacen, cfg, ip, ahora = Date.now() }) {
  if (!cfg.pepper) throw new ErrorApi(500, 'Servidor sin configurar (falta DATOS_PEPPER).')
  const clave = `rl:reg:${S.hashIp(cfg.pepper, ip)}:${Math.floor(ahora / 3600000)}`
  const usos = await almacen.incrby(clave, 1, { ex: 7200 })
  if (usos > cfg.maxRegistrosIpHora) throw new ErrorApi(429, 'Demasiados registros desde esta red. Intenta más tarde.')
  const id = S.idInstalacion()
  const secreto = S.claveNueva()
  await guardarJson(almacen, `inst:${id}`, { h: S.hashClave(cfg.pepper, secreto), creado: ahora, baneada: false })
  await almacen.incrby('stats:instalaciones', 1)
  await almacen.zadd('insts', ahora, id)
  return { id, clave: secreto }
}

async function autenticar({ almacen, cfg, id, clave }) {
  if (!cfg.pepper) throw new ErrorApi(500, 'Servidor sin configurar (falta DATOS_PEPPER).')
  if (!id || !clave || String(id).length > 40 || String(clave).length > 100) throw new ErrorApi(401, 'Instalación no registrada.')
  const inst = await leerJson(almacen, `inst:${id}`)
  if (!inst || !S.iguales(inst.h, S.hashClave(cfg.pepper, clave))) throw new ErrorApi(401, 'Instalación no registrada.')
  if (inst.baneada) throw new ErrorApi(403, 'Esta instalación fue bloqueada.')
  return inst
}

async function banear({ almacen, cfg, token, id, baneada = true }) {
  if (!cfg.adminToken || !S.iguales(token || '', cfg.adminToken)) throw new ErrorApi(401, 'No autorizado.')
  const inst = await leerJson(almacen, `inst:${id}`)
  if (!inst) throw new ErrorApi(404, 'No existe esa instalación.')
  await guardarJson(almacen, `inst:${id}`, { ...inst, baneada: Boolean(baneada) })
  return { ok: true, id, baneada: Boolean(baneada) }
}

async function resumenAdmin({ almacen, cfg, token, ahora = Date.now() }) {
  if (!cfg.adminToken || !S.iguales(token || '', cfg.adminToken)) throw new ErrorApi(401, 'No autorizado.')
  const filas = await almacen.ztop('insts', 100)
  const instalaciones = await Promise.all(filas.map(async (f) => {
    const [inst, ult] = await Promise.all([leerJson(almacen, `inst:${f.miembro}`), almacen.get(`instult:${f.miembro}`)])
    return { id: f.miembro, creado: f.puntaje, ultimo: Number(ult) || 0, baneada: Boolean(inst?.baneada) }
  }))
  instalaciones.sort((a, b) => (b.ultimo || b.creado) - (a.ultimo || a.creado))
  const [inst, usuarios, syncs] = await Promise.all([almacen.get('stats:instalaciones'), almacen.get('stats:usuarios'), almacen.get('stats:sincronizaciones')])
  return { ok: true, ts: ahora, totales: { instalaciones: Number(inst) || 0, usuarios: Number(usuarios) || 0, sincronizaciones: Number(syncs) || 0 }, instalaciones }
}

// ── Sincronización ────────────────────────────────────────────────────
const numeros = (o, claves) => { const r = {}; if (o && typeof o === 'object') for (const k of claves) if (Number.isFinite(Number(o[k]))) r[k] = Number(o[k]); return r }
const DELTAS_U = ['monedas', 'xp', 'mensajes', 'reputacion', 'trabajosVeces', 'trabajosGanado', 'xpSemana']

function deltasUsuario(d) { return numeros(d, DELTAS_U) }
function deltasTrabajos(d) {
  const r = { ganado: Number.isFinite(Number(d?.ganado)) ? Number(d.ganado) : 0, veces: {} }
  if (d?.veces && typeof d.veces === 'object') for (const [k, v] of Object.entries(d.veces)) if (/^[a-z]{1,20}$/.test(k) && Number.isFinite(Number(v))) r.veces[k] = Number(v)
  return r
}

async function conBloqueo(almacen, clave, fn) {
  const ok = await almacen.set(clave, '1', { nx: true, ex: 8 })
  if (!ok) return { ocupado: true }
  try { return { valor: await fn() } } finally { await almacen.del(clave) }
}

async function sincronizar({ almacen, cfg, instalacionId, cuerpo, ahora = Date.now() }) {
  // Misma petición repetida (la respuesta se perdió y el bot reintenta): se devuelve lo ya calculado, sin sumar otra vez.
  const rid = typeof cuerpo?.rid === 'string' && /^[\w-]{8,64}$/.test(cuerpo.rid) ? cuerpo.rid : null
  if (rid) {
    const previa = await leerJson(almacen, `rid:${instalacionId}:${rid}`)
    if (previa) return { ...previa, repetida: true }
  }
  const limite = `rl:sync:${instalacionId}:${Math.floor(ahora / 60000)}`
  if (await almacen.incrby(limite, 1, { ex: 120 }) > cfg.maxSyncPorMinuto) throw new ErrorApi(429, 'Sincronizas demasiado seguido. Espera un minuto.')
  const entradas = cuerpo?.usuarios && typeof cuerpo.usuarios === 'object' ? Object.entries(cuerpo.usuarios) : []
  if (entradas.length > cfg.maxUsuariosPorSync) throw new ErrorApi(413, `Máximo ${cfg.maxUsuariosPorSync} usuarios por sincronización.`)

  const usuarios = {}
  const errores = {}
  const hora = Math.floor(ahora / 3600000)

  for (const [numero, item] of entradas) {
    if (!S.numeroValido(numero) || !item || typeof item !== 'object') { errores[numero] = 'dato inválido'; continue }
    const h = S.idUsuario(cfg.pepper, numero)
    const r = await conBloqueo(almacen, `lock:${h}`, async () => {
      const salida = {}
      const claveGan = `gan:${h}:${hora}`
      const usado = Number(await almacen.get(claveGan)) || 0
      // Semilla: lo que una instalación ya tenía ANTES de conectarse; se acepta una sola vez por (instalación, persona).
      const semilla = item.u?.semilla === true && Boolean(await almacen.set(`sem:${h}:${instalacionId}`, '1', { nx: true }))
      const topes = semilla
        ? { monedas: cfg.maxSemillaMonedas, xp: cfg.maxSemillaXp, mensajes: 1e7, reputacion: 1000, trabajosVeces: 1e6, trabajosGanado: cfg.maxSemillaMonedas }
        : { monedas: cfg.maxDeltaMonedas, xp: cfg.maxDeltaXp, mensajes: 500, reputacion: 50, trabajosVeces: 100, trabajosGanado: cfg.maxDeltaMonedas, gananciaMonedasRestante: Math.max(0, cfg.maxGananciaHora - usado) }

      if (item.u) {
        const cli = S.registroLimpio(item.u.r)
        if (!cli) { errores[numero] = 'registro inválido'; return null }
        const srv = await leerJson(almacen, `u:${h}`)
        const { registro, aplicado } = fusionarUsuario(srv, cli, deltasUsuario(item.u.d), topes)
        if (JSON.stringify(registro).length > S.MAX_BYTES_REGISTRO) { errores[numero] = 'registro muy grande'; return null }
        await guardarJson(almacen, `u:${h}`, registro)
        if (!semilla && aplicado.monedas > 0) await almacen.incrby(claveGan, aplicado.monedas, { ex: 7200 })
        await Promise.all([
          almacen.zadd('rank:monedas', registro.monedas || 0, h),
          almacen.zadd('rank:xp', registro.xp || 0, h),
          registro.semana ? almacen.zadd(`rank:semana:${registro.semana}`, registro.xpSemana || 0, h) : null,
          almacen.hset('vis', h, S.visibleValido(item.vis)),
          // Una foto por día (monedas, XP) para la gráfica de progreso; solo cuando hubo cambios.
          semilla || Object.values(aplicado || {}).some((v) => Number(v)) ? almacen.hset(`hist:${h}`, diaPeru(ahora), `${registro.monedas || 0},${registro.xp || 0}`) : null,
        ])
        salida.u = registro
      }
      if (item.t) {
        const cli = S.registroLimpio(item.t.r)
        if (!cli) { errores[numero] = 'registro inválido'; return null }
        const srv = await leerJson(almacen, `t:${h}`)
        const registro = fusionarTrabajos(srv, cli, deltasTrabajos(item.t.d), topes)
        if (JSON.stringify(registro).length > S.MAX_BYTES_REGISTRO) { errores[numero] = 'registro muy grande'; return null }
        await guardarJson(almacen, `t:${h}`, registro)
        await almacen.zadd('rank:trabajos', registro.ganado || 0, h)
        salida.t = registro
      }
      return salida
    })
    if (r.ocupado) errores[numero] = 'ocupado'
    else if (r.valor) {
      usuarios[numero] = r.valor
      if (await almacen.set(`stats:usuario:${h}`, '1', { nx: true })) await almacen.incrby('stats:usuarios', 1)
    }
  }
  await almacen.incrby('stats:sincronizaciones', 1)
  await almacen.set(`instult:${instalacionId}`, String(ahora))
  await almacen.incrby(`act:${Math.floor(ahora / 60000)}`, 1, { ex: 7200 }) // pulso para la gráfica de actividad
  const respuesta = { ok: true, ts: ahora, usuarios, errores }
  if (rid) await almacen.set(`rid:${instalacionId}:${rid}`, JSON.stringify(respuesta), { ex: 1800 })
  return respuesta
}

// ── Rankings ──────────────────────────────────────────────────────────
const CAMPOS_TOP = { monedas: 'rank:monedas', xp: 'rank:xp', trabajos: 'rank:trabajos' }

async function top({ almacen, campo = 'monedas', limite = 10, ahora = Date.now() }) {
  let clave = CAMPOS_TOP[campo]
  if (campo === 'semana') {
    const d = new Date(ahora - 5 * 3600000); const atras = (d.getUTCDay() + 6) % 7
    clave = `rank:semana:${new Date(d.getTime() - atras * 86400000).toISOString().slice(0, 10)}`
  }
  if (!clave) throw new ErrorApi(400, 'Campo inválido. Usa: monedas, xp, trabajos o semana.')
  const n = Math.min(25, Math.max(1, Math.trunc(Number(limite)) || 10))
  const filas = (await almacen.ztop(clave, n)).filter((f) => f.puntaje > 0)
  const visibles = filas.length ? await almacen.hmget('vis', filas.map((f) => f.miembro)) : []
  return { campo, top: filas.map((f, i) => ({ pos: i + 1, visible: visibles[i] || '•••', valor: f.puntaje })) }
}

// ── Búsqueda pública por número (solo datos de juego; nunca nombre, edad ni género) ──
const nivelDe = (xp) => Math.floor(Math.sqrt(Math.max(0, xp) / 100))

async function perfilPublico({ almacen, cfg, numero, ip, ahora = Date.now() }) {
  if (!cfg.pepper) throw new ErrorApi(500, 'Servidor sin configurar (falta DATOS_PEPPER).')
  const limpio = String(numero || '').replace(/[\s+()-]/g, '')
  if (!S.numeroValido(limpio)) throw new ErrorApi(400, 'Escribe tu número con código de país, solo dígitos (ej. 51910227479).')
  // Límite por red para que nadie pueda recorrer números buscando usuarios.
  const usos = await almacen.incrby(`rl:buscar:${S.hashIp(cfg.pepper, ip)}:${Math.floor(ahora / 60000)}`, 1, { ex: 120 })
  if (usos > cfg.maxBusquedasMin) throw new ErrorApi(429, 'Demasiadas búsquedas seguidas. Espera un minuto.')
  const h = S.idUsuario(cfg.pepper, limpio)
  const u = await leerJson(almacen, `u:${h}`)
  const t = await leerJson(almacen, `t:${h}`)
  if (!u && !t) return { existe: false }
  const [monedas, xp, trabajos, totalMonedas, totalXp, totalTrabajos] = await Promise.all([
    almacen.zpos('rank:monedas', h), almacen.zpos('rank:xp', h), almacen.zpos('rank:trabajos', h),
    almacen.zcount('rank:monedas'), almacen.zcount('rank:xp'), almacen.zcount('rank:trabajos'),
  ])
  const nivel = nivelDe(u?.xp || 0)
  const crudo = await almacen.hgetall(`hist:${h}`)
  const historial = Object.entries(crudo || {}).sort(([a], [b]) => (a < b ? -1 : 1)).slice(-30).map(([dia, v]) => { const [m, x] = String(v).split(','); return { dia, monedas: Number(m) || 0, xp: Number(x) || 0 } })
  const mejoras = Object.values(t?.mejoras || {}).reduce((a, b) => a + (Number(b) || 0), 0)
  return {
    existe: true,
    perfil: {
      monedas: u?.monedas || 0, xp: u?.xp || 0, nivel,
      xpNivelActual: 100 * nivel * nivel, xpNivelSiguiente: 100 * (nivel + 1) * (nivel + 1),
      mensajes: u?.mensajes || 0, racha: u?.racha || 0, mejorRacha: u?.mejorRacha || 0,
      logros: Object.keys(u?.logros || {}).length, ganadoTrabajos: t?.ganado || 0,
      trabajosHechos: Object.values(t?.veces || {}).reduce((a, b) => a + (Number(b) || 0), 0), mejoras,
    },
    posiciones: { monedas: monedas.pos, xp: xp.pos, trabajos: trabajos.pos },
    totales: { monedas: totalMonedas, xp: totalXp, trabajos: totalTrabajos },
    historial,
  }
}

/** Pulsos de sincronización por minuto de los últimos `minutos` minutos (para la gráfica en vivo). */
async function actividad({ almacen, minutos = 30, ahora = Date.now() }) {
  const base = Math.floor(ahora / 60000)
  const claves = Array.from({ length: minutos }, (_, i) => `act:${base - (minutos - 1 - i)}`)
  return (await Promise.all(claves.map((k) => almacen.get(k)))).map((v) => Math.max(0, Number(v) || 0))
}

module.exports = { perfilPublico, actividad, ErrorApi, registrarInstalacion, autenticar, banear, resumenAdmin, sincronizar, top, leerJson }
