const { ruta } = require('../lib/http')

module.exports = ruta(['GET'], async () => ({ ok: true, servicio: 'YuiBot-datos', version: 1, ts: Date.now() }))
