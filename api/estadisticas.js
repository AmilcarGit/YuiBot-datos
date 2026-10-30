// GET /api/estadisticas → métricas globales agregadas; no expone identificadores ni datos personales.
const { ruta } = require('../lib/http')
const { obtenerAlmacen } = require('../lib/almacen')
const { actividad } = require('../lib/servicio')

module.exports = ruta(['GET'], async () => {
  const almacen = obtenerAlmacen()
  const inicio = new Date().toISOString()
  await almacen.set('stats:inicio', inicio, { nx: true })
  const [instalaciones, usuarios, sincronizaciones, desde] = await Promise.all([
    almacen.get('stats:instalaciones'),
    almacen.get('stats:usuarios'),
    almacen.get('stats:sincronizaciones'),
    almacen.get('stats:inicio'),
  ])
  const numero = (v) => Math.max(0, Number(v) || 0)
  return {
    ok: true,
    desde,
    metricas: {
      instalaciones: numero(instalaciones),
      usuarios: numero(usuarios),
      sincronizaciones: numero(sincronizaciones),
    },
    actividad: await actividad({ almacen }),
    nota: 'Contadores acumulados desde la activación de estas estadísticas. No incluyen actividad anterior.'
  }
})
