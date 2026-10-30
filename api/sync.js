// POST /api/sync → une los datos de la instalación con los del servidor y devuelve el estado oficial.
const { ruta } = require('../lib/http')
const { obtenerAlmacen } = require('../lib/almacen')
const { config } = require('../lib/seguridad')
const { autenticar, sincronizar } = require('../lib/servicio')

module.exports = ruta(['POST'], async ({ req, cuerpo }) => {
  const almacen = obtenerAlmacen(); const cfg = config()
  const id = req.headers['x-instalacion']
  await autenticar({ almacen, cfg, id, clave: req.headers['x-clave'] })
  return sincronizar({ almacen, cfg, instalacionId: id, cuerpo })
})
