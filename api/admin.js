// POST /api/admin { id, baneada } con la cabecera x-admin-token → bloquea (o desbloquea) una instalación tramposa.
// POST /api/admin { accion: 'reiniciar', confirmar: 'REINICIAR' } → borra los datos de jugadores (las instalaciones siguen registradas).
// POST /api/admin { accion: 'evento', titulo, texto, tipo, horas } o { accion: 'evento', quitar: true } → banner de la web.
// POST /api/admin { accion: 'limpiar' } → vista previa de registros sospechosos (LIDs); con confirmar:true los borra.
// GET  /api/admin con la misma cabecera → resumen de instalaciones (para el panel de administración de la web).
const { ruta } = require('../lib/http')
const { obtenerAlmacen } = require('../lib/almacen')
const { config } = require('../lib/seguridad')
const { banear, resumenAdmin, reiniciarDatos, definirEvento, limpiarSospechosos } = require('../lib/servicio')

module.exports = ruta(['GET', 'POST'], async ({ req, cuerpo }) => {
  const token = req.headers['x-admin-token']
  const almacen = obtenerAlmacen(); const cfg = config()
  if (req.method === 'GET') return resumenAdmin({ almacen, cfg, token })
  if (cuerpo.accion === 'evento') return definirEvento({ almacen, cfg, token, titulo: cuerpo.titulo, texto: cuerpo.texto, tipo: cuerpo.tipo, horas: cuerpo.horas, quitar: cuerpo.quitar === true })
  if (cuerpo.accion === 'limpiar') return limpiarSospechosos({ almacen, cfg, token, confirmar: cuerpo.confirmar === true })
  if (cuerpo.accion === 'reiniciar') return reiniciarDatos({ almacen, cfg, token, confirmar: cuerpo.confirmar })
  return banear({ almacen, cfg, token, id: String(cuerpo.id || ''), baneada: cuerpo.baneada !== false })
})
