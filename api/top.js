// GET /api/top?campo=monedas|xp|trabajos|semana&limite=10 → ranking global (números enmascarados).
const { ruta } = require('../lib/http')
const { obtenerAlmacen } = require('../lib/almacen')
const { top } = require('../lib/servicio')

module.exports = ruta(['GET'], async ({ req }) => {
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams)
  return { ok: true, ...(await top({ almacen: obtenerAlmacen(), campo: String(q.campo || 'monedas'), limite: q.limite })) }
})
