// POST /api/web { accion: 'entrar' | 'comando' | 'yo' | 'salir' | 'chat-leer' | 'chat-enviar' | 'chat-reportar', … } → la cuenta web de Yui (sesión en el encabezado Authorization: Bearer).
const { ruta } = require('../lib/http')
const { obtenerAlmacen } = require('../lib/almacen')
const { config, ipDe } = require('../lib/seguridad')
const { ErrorApi } = require('../lib/servicio')
const W = require('../lib/web')
const C = require('../lib/chat')

module.exports = ruta(['POST'], async ({ req, cuerpo }) => {
  const almacen = obtenerAlmacen(); const cfg = config()
  if (!cfg.pepper) throw new ErrorApi(500, 'Servidor sin configurar (falta DATOS_PEPPER).')
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  switch (cuerpo.accion) {
    case 'entrar': return { ok: true, ...(await W.entrar({ almacen, cfg, numero: cuerpo.numero, codigo: cuerpo.codigo, nombre: cuerpo.nombre, ip: ipDe(req) })) }
    case 'comando': return { ok: true, ...(await W.comando({ almacen, cfg, token, texto: cuerpo.texto })) }
    case 'yo': return { ok: true, ...(await W.yo({ almacen, cfg, token })) }
    case 'chat-leer': return C.leer({ almacen, cfg, token, desde: String(cuerpo.desde || '') })
    case 'chat-enviar': return C.enviar({ almacen, cfg, token, texto: cuerpo.texto })
    case 'chat-reportar': return C.reportar({ almacen, cfg, token, id: cuerpo.id })
    case 'salir': return W.salir({ almacen, cfg, token })
    default: throw new ErrorApi(400, 'Acción desconocida.')
  }
})
