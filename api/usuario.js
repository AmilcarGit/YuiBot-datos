// GET /api/usuario?numero=51910227479 → tu progreso y posición en los rankings (solo datos de juego).
const { ruta } = require('../lib/http')
const { obtenerAlmacen } = require('../lib/almacen')
const { config, ipDe } = require('../lib/seguridad')
const { perfilPublico } = require('../lib/servicio')

module.exports = ruta(['GET'], async ({ req }) => {
  const q = req.query || Object.fromEntries(new URL(req.url, 'http://x').searchParams)
  return { ok: true, ...(await perfilPublico({ almacen: obtenerAlmacen(), cfg: config(), numero: q.numero, ip: ipDe(req) })) }
})
