// GET /api/evento → evento activo para el banner de la web (doble monedas, torneo…). Público.
const { ruta } = require('../lib/http')
const { obtenerAlmacen } = require('../lib/almacen')
const { eventoActual } = require('../lib/servicio')

module.exports = ruta(['GET'], async () => ({ ok: true, ...(await eventoActual({ almacen: obtenerAlmacen() })) }))
