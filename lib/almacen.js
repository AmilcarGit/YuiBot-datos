// Almacenamiento: Upstash Redis en producción, memoria en las pruebas. Misma interfaz en ambos.
// Los valores se guardan como texto JSON para no depender de cómo cada cliente (de)serializa.

function crearMemoria(reloj = () => Date.now()) {
  const datos = new Map() // clave → { v, exp }
  const zsets = new Map() // clave → Map(miembro → puntaje)
  const hashes = new Map()
  const vivo = (k) => { const e = datos.get(k); if (!e) return null; if (e.exp && e.exp <= reloj()) { datos.delete(k); return null } return e }
  return {
    async get(k) { return vivo(k)?.v ?? null },
    async set(k, v, { nx = false, ex = 0 } = {}) {
      if (nx && vivo(k)) return null
      datos.set(k, { v: String(v), exp: ex ? reloj() + ex * 1000 : 0 })
      return 'OK'
    },
    async del(k) { datos.delete(k) },
    async incrby(k, n, { ex = 0 } = {}) {
      const e = vivo(k); const total = (e ? Number(e.v) : 0) + n
      datos.set(k, { v: String(total), exp: e?.exp || (ex ? reloj() + ex * 1000 : 0) })
      return total
    },
    async zadd(k, puntaje, miembro) { if (!zsets.has(k)) zsets.set(k, new Map()); zsets.get(k).set(miembro, puntaje) },
    async ztop(k, n) { return [...(zsets.get(k) || new Map()).entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([miembro, puntaje]) => ({ miembro, puntaje })) },
    async hset(k, campo, valor) { if (!hashes.has(k)) hashes.set(k, new Map()); hashes.get(k).set(campo, String(valor)) },
    async hmget(k, campos) { const h = hashes.get(k) || new Map(); return campos.map((c) => h.get(c) ?? null) },
  }
}

function crearUpstash(env = process.env, cliente = null) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) throw new Error('Falta conectar la base de datos Upstash Redis en Vercel (Storage).')
  const r = cliente || new (require('@upstash/redis').Redis)({ url, token, automaticDeserialization: false })
  return {
    get: (k) => r.get(k),
    async set(k, v, { nx = false, ex = 0 } = {}) {
      const op = {}
      if (nx) op.nx = true
      if (ex) op.ex = ex
      return r.set(k, String(v), op)
    },
    del: (k) => r.del(k),
    async incrby(k, n, { ex = 0 } = {}) { const total = await r.incrby(k, n); if (ex && total === n) await r.expire(k, ex); return total },
    zadd: (k, puntaje, miembro) => r.zadd(k, { score: puntaje, member: miembro }),
    async ztop(k, n) {
      const filas = await r.zrange(k, 0, n - 1, { rev: true, withScores: true })
      const salida = []
      for (let i = 0; i < filas.length; i += 2) salida.push({ miembro: String(filas[i]), puntaje: Number(filas[i + 1]) })
      return salida
    },
    hset: (k, campo, valor) => r.hset(k, { [campo]: String(valor) }),
    // Según la versión del cliente, hmget devuelve un objeto { campo: valor } o una lista en el mismo orden; se aceptan las dos.
    async hmget(k, campos) {
      if (!campos.length) return []
      const r2 = await r.hmget(k, ...campos)
      const valor = (i, c) => (Array.isArray(r2) ? r2[i] : r2 && typeof r2 === 'object' ? r2[c] : null)
      return campos.map((c, i) => { const v = valor(i, c); return v != null ? String(v) : null })
    },
  }
}

let global = null
const obtenerAlmacen = () => (global ||= crearUpstash())
const usarAlmacen = (a) => { global = a } // para pruebas

module.exports = { crearMemoria, crearUpstash, obtenerAlmacen, usarAlmacen }
