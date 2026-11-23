// POST /api/vincular { numero } → código de 6 dígitos para enlazar la cuenta web. Solo lo pide el bot (instalación autenticada).
const { ruta } = require('../lib/http')
const { obtenerAlmacen } = require('../lib/almacen')
const { config } = require('../lib/seguridad')
const { autenticar } = require('../lib/servicio')
const { crearVinculo } = require('../lib/web')

module.exports = ruta(['POST'], async ({ req, cuerpo }) => {
  const almacen = obtenerAlmacen(); const cfg = config()
  const id = req.headers['x-instalacion']
  await autenticar({ almacen, cfg, id, clave: req.headers['x-clave'] })
  return { ok: true, ...(await crearVinculo({ almacen, cfg, instalacionId: id, numero: cuerpo.numero })) }
})
