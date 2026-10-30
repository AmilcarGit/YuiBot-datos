// Envoltorio común de las rutas de Vercel: método, cuerpo JSON, errores sin filtrar detalles internos.
const { ErrorApi } = require('./servicio')

const MAX_BYTES = 2 * 1024 * 1024

function leerCuerpo(req) {
  const b = req.body
  if (b == null || b === '') return {}
  if (typeof b === 'object') return b
  try { return JSON.parse(b) } catch { throw new ErrorApi(400, 'El cuerpo no es JSON válido.') }
}

function responder(res, estado, datos) {
  res.statusCode = estado
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(datos))
}

/** metodos: ['POST'] etc. fn({ req, cuerpo }) → objeto de respuesta. */
function ruta(metodos, fn) {
  return async (req, res) => {
    try {
      if (!metodos.includes(req.method)) { res.setHeader('Allow', metodos.join(', ')); return responder(res, 405, { ok: false, error: 'Método no permitido.' }) }
      if (Number(req.headers?.['content-length']) > MAX_BYTES) return responder(res, 413, { ok: false, error: 'Petición demasiado grande.' })
      const cuerpo = req.method === 'GET' ? {} : leerCuerpo(req)
      return responder(res, 200, await fn({ req, cuerpo }))
    } catch (e) {
      if (e instanceof ErrorApi) return responder(res, e.estado, { ok: false, error: e.message })
      console.error('[API]', e?.message || e) // el detalle queda en los logs de Vercel, no en la respuesta
      return responder(res, 500, { ok: false, error: 'Error interno del servidor.' })
    }
  }
}

module.exports = { ruta, responder, leerCuerpo }
