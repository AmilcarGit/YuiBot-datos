// Cuenta web: el dueño de un número demuestra que es suyo con un código que le llega POR WHATSAPP (comando .web del bot).
const crypto = require('node:crypto')
const S = require('./seguridad')
const { ErrorApi, leerJson, guardarJson, perfilPorHash } = require('./servicio')
const { ejecutarComando, comandosDisponibles, catalogoComandos } = require('./motor')

const MINUTOS_CODIGO = 10
const DIAS_SESION = 30
const normalizar = (numero) => String(numero || '').replace(/[\s+()-]/g, '')

/** El bot (instalación autenticada) pide un código para un número que acaba de escribirle en privado. */
async function crearVinculo({ almacen, cfg, instalacionId, numero, ahora = Date.now() }) {
  const limpio = normalizar(numero)
  if (!S.numeroValido(limpio) || limpio.length >= 15) throw new ErrorApi(400, 'Número inválido.')
  if (await almacen.incrby(`rl:vinc:${instalacionId}:${Math.floor(ahora / 3600000)}`, 1, { ex: 7200 }) > 120) throw new ErrorApi(429, 'Demasiados códigos por hora.')
  const h = S.idUsuario(cfg.pepper, limpio)
  if (!(await leerJson(almacen, `u:${h}`))) throw new ErrorApi(404, 'Todavía no hay datos de este número. Regístrate con .registrar y espera la sincronización.')
  const codigo = String(crypto.randomInt(0, 1000000)).padStart(6, '0')
  await almacen.set(`link:${h}`, JSON.stringify({ c: S.hashClave(cfg.pepper, codigo), n: 0 }), { ex: MINUTOS_CODIGO * 60 })
  return { codigo, minutos: MINUTOS_CODIGO }
}

/** La persona escribe su número y el código en la web → recibe una sesión. */
async function entrar({ almacen, cfg, numero, codigo, nombre, ip, ahora = Date.now() }) {
  if (await almacen.incrby(`rl:entrar:${S.hashIp(cfg.pepper, ip)}:${Math.floor(ahora / 60000)}`, 1, { ex: 120 }) > 10) throw new ErrorApi(429, 'Demasiados intentos. Espera un minuto.')
  const limpio = normalizar(numero)
  if (!S.numeroValido(limpio) || !/^\d{6}$/.test(String(codigo || ''))) throw new ErrorApi(400, 'Escribe tu número con código de país y el código de 6 dígitos.')
  const h = S.idUsuario(cfg.pepper, limpio)
  const v = await leerJson(almacen, `link:${h}`)
  if (!v) throw new ErrorApi(401, 'Código inválido o vencido. Pídelo de nuevo en WhatsApp con .web')
  if (v.n >= 5) { await almacen.del(`link:${h}`); throw new ErrorApi(429, 'Demasiados intentos con ese código. Pide uno nuevo.') }
  if (!S.iguales(v.c, S.hashClave(cfg.pepper, codigo))) {
    await almacen.set(`link:${h}`, JSON.stringify({ ...v, n: v.n + 1 }), { ex: MINUTOS_CODIGO * 60 })
    throw new ErrorApi(401, 'Código inválido o vencido. Pídelo de nuevo en WhatsApp con .web')
  }
  await almacen.del(`link:${h}`)
  const token = S.claveNueva()
  await almacen.set(`ses:${S.hashClave(cfg.pepper, token)}`, JSON.stringify({ h, creado: ahora }), { ex: DIAS_SESION * 86400 })
  const u = await leerJson(almacen, `u:${h}`)
  const nom = String(nombre || '').replace(/[\u0000-\u001f<>]/g, ' ').trim().slice(0, 24)
  if (nom.length >= 2 && !u?.nombre) await guardarJson(almacen, `u:${h}`, { ...u, nombre: nom })
  const [visible] = await almacen.hmget('vis', [h])
  return { token, visible: visible || '•••', comandos: await comandosDisponibles(), catalogo: await catalogoComandos() }
}

async function sesion({ almacen, cfg, token }) {
  if (!token || String(token).length > 100) throw new ErrorApi(401, 'Inicia sesión de nuevo.')
  const s = await leerJson(almacen, `ses:${S.hashClave(cfg.pepper, token)}`)
  if (!s) throw new ErrorApi(401, 'Tu sesión venció. Inicia sesión de nuevo.')
  return s
}

async function comando({ almacen, cfg, token, texto, ahora = Date.now() }) {
  const { h } = await sesion({ almacen, cfg, token })
  if (await almacen.incrby(`rl:cmd:${h}:${Math.floor(ahora / 60000)}`, 1, { ex: 120 }) > 30) throw new ErrorApi(429, 'Vas muy rápido, espera un momento.')
  return { respuestas: await ejecutarComando({ almacen, cfg, h, texto, ahora }) }
}

async function yo({ almacen, cfg, token }) {
  const { h } = await sesion({ almacen, cfg, token })
  const [visible] = await almacen.hmget('vis', [h])
  return { visible: visible || '•••', ...(await perfilPorHash({ almacen, h })), comandos: await comandosDisponibles(), catalogo: await catalogoComandos() }
}

async function salir({ almacen, cfg, token }) {
  if (token) await almacen.del(`ses:${S.hashClave(cfg.pepper, token)}`)
  return { ok: true }
}

module.exports = { crearVinculo, entrar, sesion, comando, yo, salir }
