// Validación, anonimización y límites. Nada de esto confía en lo que manda la instalación.
const crypto = require('crypto')

const CLAVES_PROHIBIDAS = new Set(['__proto__', 'constructor', 'prototype'])
const RE_CLAVE = /^[\w\-.@:+]{1,80}$/
const RE_NUMERO = /^\d{6,16}$/
const MAX_BYTES_REGISTRO = 16 * 1024

const config = (env = process.env) => ({
  pepper: env.DATOS_PEPPER || '',
  maxUsuariosPorSync: Number(env.MAX_USUARIOS_POR_SYNC) || 200,
  maxDeltaMonedas: Number(env.MAX_DELTA_MONEDAS) || 100000,
  maxDeltaXp: Number(env.MAX_DELTA_XP) || 2000,
  maxGananciaHora: Number(env.MAX_GANANCIA_HORA) || 500000,
  maxSemillaMonedas: Number(env.MAX_SEMILLA_MONEDAS) || 1000000,
  maxSemillaXp: Number(env.MAX_SEMILLA_XP) || 200000,
  maxRegistrosIpHora: Number(env.MAX_REGISTROS_IP_HORA) || 10,
  maxSyncPorMinuto: Number(env.MAX_SYNC_POR_MIN) || 30,
  adminToken: env.ADMIN_TOKEN || '',
})

const hmac = (pepper, texto) => crypto.createHmac('sha256', pepper).update(String(texto)).digest('hex')
/** Identificador anónimo de una persona: el número de teléfono NO se guarda. */
const idUsuario = (pepper, numero) => hmac(pepper, `n:${numero}`).slice(0, 32)
const hashClave = (pepper, clave) => hmac(pepper, `k:${clave}`)
const hashIp = (pepper, ip) => hmac(pepper, `i:${ip}`).slice(0, 24)
const claveNueva = () => crypto.randomBytes(24).toString('base64url')
const idInstalacion = () => crypto.randomBytes(9).toString('base64url')

function iguales(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b))
  return x.length === y.length && crypto.timingSafeEqual(x, y)
}

const numeroValido = (n) => RE_NUMERO.test(String(n))

/** Copia segura de un registro: sin claves peligrosas, tipos simples, tamaño acotado. null si no sirve. */
function limpiarRegistro(valor, profundidad = 0) {
  if (valor === null || typeof valor === 'boolean') return valor
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0
  if (typeof valor === 'string') return valor.slice(0, 300)
  if (profundidad > 4) return undefined
  if (Array.isArray(valor)) return valor.slice(0, 200).map((v) => limpiarRegistro(v, profundidad + 1)).filter((v) => v !== undefined)
  if (typeof valor === 'object') {
    const salida = {}
    let n = 0
    for (const [k, v] of Object.entries(valor)) {
      if (CLAVES_PROHIBIDAS.has(k) || !RE_CLAVE.test(k)) continue
      if (++n > 120) break
      const limpio = limpiarRegistro(v, profundidad + 1)
      if (limpio !== undefined) salida[k] = limpio
    }
    return salida
  }
  return undefined
}

function registroLimpio(valor) {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null
  const l = limpiarRegistro(valor)
  return l && JSON.stringify(l).length <= MAX_BYTES_REGISTRO ? l : null
}

/** Texto enmascarado para el ranking: 519•••479 (nunca el número completo). */
const visibleValido = (v) => (typeof v === 'string' && /^[\d•*+ ]{4,24}$/.test(v) ? v : '•••')

const ipDe = (req) => String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'desconocida').split(',')[0].trim()

module.exports = { config, idUsuario, hashClave, hashIp, claveNueva, idInstalacion, iguales, numeroValido, limpiarRegistro, registroLimpio, visibleValido, ipDe, MAX_BYTES_REGISTRO }
