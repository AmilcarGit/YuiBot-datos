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

// ── Instalaciones ─────────────────────────────────────────────────────
async function registrarInstalacion({ almacen, cfg, ip, ahora = Date.now() }) {
  if (!cfg.pepper) throw new ErrorApi(500, 'Servidor sin configurar (falta DATOS_PEPPER).')
  const clave = `rl:reg:${S.hashIp(cfg.pepper, ip)}:${Math.floor(ahora / 3600000)}`
  const usos = await almacen.incrby(clave, 1, { ex: 7200 })
  if (usos > cfg.maxRegistrosIpHora) throw new ErrorApi(429, 'Demasiados registros desde esta red. Intenta más tarde.')
  const id = S.idInstalacion()
  const secreto = S.claveNueva()
  await guardarJson(almacen, `inst:${id}`, { h: S.hashClave(cfg.pepper, secreto), creado: ahora, baneada: false })
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
      const topes = { monedas: cfg.maxDeltaMonedas, xp: cfg.maxDeltaXp, mensajes: 500, reputacion: 50, trabajosVeces: 100, trabajosGanado: cfg.maxDeltaMonedas, gananciaMonedasRestante: Math.max(0, cfg.maxGananciaHora - usado) }

      if (item.u) {
        const cli = S.registroLimpio(item.u.r)
        if (!cli) { errores[numero] = 'registro inválido'; return null }
        const srv = await leerJson(almacen, `u:${h}`)
        const { registro, aplicado } = fusionarUsuario(srv, cli, deltasUsuario(item.u.d), topes)
        if (JSON.stringify(registro).length > S.MAX_BYTES_REGISTRO) { errores[numero] = 'registro muy grande'; return null }
        await guardarJson(almacen, `u:${h}`, registro)
        if (aplicado.monedas > 0) await almacen.incrby(claveGan, aplicado.monedas, { ex: 7200 })
        await Promise.all([
          almacen.zadd('rank:monedas', registro.monedas || 0, h),
          almacen.zadd('rank:xp', registro.xp || 0, h),
          registro.semana ? almacen.zadd(`rank:semana:${registro.semana}`, registro.xpSemana || 0, h) : null,
          almacen.hset('vis', h, S.visibleValido(item.vis)),
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
    else if (r.valor) usuarios[numero] = r.valor
  }
  return { ok: true, ts: ahora, usuarios, errores }
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

module.exports = { ErrorApi, registrarInstalacion, autenticar, banear, sincronizar, top, leerJson }
