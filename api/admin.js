// POST /api/admin { id, baneada } con la cabecera x-admin-token → bloquea (o desbloquea) una instalación tramposa.
const { ruta } = require('../lib/http')
const { obtenerAlmacen } = require('../lib/almacen')
const { config } = require('../lib/seguridad')
const { banear } = require('../lib/servicio')

module.exports = ruta(['POST'], async ({ req, cuerpo }) => banear({ almacen: obtenerAlmacen(), cfg: config(), token: req.headers['x-admin-token'], id: String(cuerpo.id || ''), baneada: cuerpo.baneada !== false }))
