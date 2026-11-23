// Sustituto de nucleo/cargador.js: lista fija de comandos disponibles en la web.
import menu from '../habilidades/general/menu.js'
import ping from '../habilidades/general/ping.js'
import perfil from '../habilidades/economia/perfil.js'
import inventario from '../habilidades/economia/inventario.js'
import top from '../habilidades/economia/top.js'
import daily from '../habilidades/economia/daily.js'
import trabajar from '../habilidades/economia/trabajar.js'
import tienda from '../habilidades/economia/tienda.js'
import gacha from '../habilidades/economia/gacha.js'
import ppt from '../habilidades/juegos/ppt.js'
import ruleta from '../habilidades/juegos/ruleta.js'

const todas = [menu, ping, perfil, inventario, top, daily, trabajar, tienda, gacha, ppt, ruleta]

export function listar() { return todas }

export function buscar(nombre) {
  return todas.find(h => h.nombre === nombre || (h.alias || []).includes(nombre))
}
