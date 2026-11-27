// Sustituto de nucleo/cargador.js: lista fija de comandos disponibles en la web.
import menu from '../habilidades/general/menu.js'
import ping from '../habilidades/general/ping.js'
import clima from '../habilidades/general/clima.js'
import perfil from '../habilidades/economia/perfil.js'
import inventario from '../habilidades/economia/inventario.js'
import top from '../habilidades/economia/top.js'
import daily from '../habilidades/economia/daily.js'
import trabajar from '../habilidades/economia/trabajar.js'
import tienda from '../habilidades/economia/tienda.js'
import gacha from '../habilidades/economia/gacha.js'
import dar from '../habilidades/economia/dar.js'
import ppt from '../habilidades/juegos/ppt.js'
import ruleta from '../habilidades/juegos/ruleta.js'

import yts from '../habilidades/descargas/yts.js'
import play from '../habilidades/descargas/play.js'
import ytmp3 from '../habilidades/descargas/ytmp3.js'
import ytmp4 from '../habilidades/descargas/ytmp4.js'
import pin from '../habilidades/descargas/pin.js'
import pinvid from '../habilidades/descargas/pinvid.js'
import facebook from '../habilidades/descargas/facebook.js'
import calc from '../habilidades/herramientas/calc.js'
import traducir from '../habilidades/herramientas/traducir.js'
import wiki from '../habilidades/herramientas/wiki.js'
import cambio from '../habilidades/herramientas/cambio.js'
import acortar from '../habilidades/herramientas/acortar.js'
import qr from '../habilidades/herramientas/qr.js'
import hora from '../habilidades/herramientas/hora.js'
import dado from '../habilidades/juegos/dado.js'
import moneda from '../habilidades/juegos/moneda.js'

const todas = [menu, ping, clima, perfil, inventario, top, daily, trabajar, tienda, gacha, dar, ppt, ruleta, yts, play, ytmp3, ytmp4, pin, pinvid, facebook, calc, traducir, wiki, cambio, acortar, qr, hora, dado, moneda]

export function listar() { return todas }

export function buscar(nombre) {
  return todas.find(h => h.nombre === nombre || (h.alias || []).includes(nombre))
}
