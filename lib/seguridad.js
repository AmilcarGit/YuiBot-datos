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
  maxBusquedasMin: Number(env.MAX_BUSQUEDAS_MIN) || 20,
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

// Códigos de país reales (UIT). Un "teléfono" cuyo inicio no coincide con ninguno es casi seguro un LID de WhatsApp.
const CODIGOS_PAIS = new Set(['1', '7', ...'20 27 30 31 32 33 34 36 39 40 41 43 44 45 46 47 48 49 51 52 53 54 55 56 57 58 60 61 62 63 64 65 66 81 82 84 86 90 91 92 93 94 95 98'.split(' '),
  ...'211 212 213 216 218 220 221 222 223 224 225 226 227 228 229 230 231 232 233 234 235 236 237 238 239 240 241 242 243 244 245 246 247 248 249 250 251 252 253 254 255 256 257 258 260 261 262 263 264 265 266 267 268 269 290 291 297 298 299 350 351 352 353 354 355 356 357 358 359 370 371 372 373 374 375 376 377 378 380 381 382 383 385 386 387 389 420 421 423 500 501 502 503 504 505 506 507 508 509 590 591 592 593 594 595 596 597 598 599 670 672 673 674 675 676 677 678 679 680 681 682 683 685 686 687 688 689 690 691 692 850 852 853 855 856 870 880 886 960 961 962 963 964 965 966 967 968 970 971 972 973 974 975 976 977 992 993 994 995 996 998'.split(' ')])
/** ¿Los primeros dígitos de este número (o de su máscara 519•••479) forman un código de país real? */
const codigoPaisValido = (texto) => { const d = String(texto || '').replace(/\D/g, '').slice(0, 3); 
  if (!d) return false
  if (d[0] === '1') return d.length < 2 || /[2-9]/.test(d[1]) // Norteamérica: el código de área no empieza con 0 ni 1
  if (d[0] === '7') return d.length < 2 || /[3-9]/.test(d[1]) // Rusia y Kazajistán
  return CODIGOS_PAIS.has(d.slice(0, 2)) || CODIGOS_PAIS.has(d)
}

const ipDe = (req) => String(req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'desconocida').split(',')[0].trim()

module.exports = { config, idUsuario, hashClave, hashIp, claveNueva, idInstalacion, iguales, numeroValido, limpiarRegistro, registroLimpio, visibleValido, codigoPaisValido, ipDe, MAX_BYTES_REGISTRO }
