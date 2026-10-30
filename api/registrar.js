// POST /api/registrar → crea una instalación y devuelve { id, clave }. La clave solo se muestra una vez.
const { ruta } = require('../lib/http')
const { obtenerAlmacen } = require('../lib/almacen')
const { config, ipDe } = require('../lib/seguridad')
const { registrarInstalacion } = require('../lib/servicio')

module.exports = ruta(['POST'], async ({ req }) => ({ ok: true, ...(await registrarInstalacion({ almacen: obtenerAlmacen(), cfg: config(), ip: ipDe(req) })) }))
