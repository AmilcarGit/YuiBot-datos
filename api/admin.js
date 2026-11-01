// POST /api/admin { id, baneada } con la cabecera x-admin-token → bloquea (o desbloquea) una instalación tramposa.
// GET  /api/admin con la misma cabecera → resumen de instalaciones (para el panel de administración de la web).
const { ruta } = require('../lib/http')
const { obtenerAlmacen } = require('../lib/almacen')
const { config } = require('../lib/seguridad')
const { banear, resumenAdmin } = require('../lib/servicio')

module.exports = ruta(['GET', 'POST'], async ({ req, cuerpo }) => {
  const token = req.headers['x-admin-token']
  if (req.method === 'GET') return resumenAdmin({ almacen: obtenerAlmacen(), cfg: config(), token })
  return banear({ almacen: obtenerAlmacen(), cfg: config(), token, id: String(cuerpo.id || ''), baneada: cuerpo.baneada !== false })
})
