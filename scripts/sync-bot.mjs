// Copia al servidor la lógica de comandos del bot (para que la web responda igual que WhatsApp).
// Uso: node scripts/sync-bot.mjs ../YuiBot-MD
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const origen = path.resolve(process.argv[2] || '../YuiBot-MD')
const destino = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'yui')
const archivos = [
  'estilo/index.js', 'estilo/temas.js', 'estilo/voz.js',
  'nucleo/juego.js', 'nucleo/utiles.js', 'nucleo/botones.js', 'nucleo/descargas.js', 'nucleo/cnv.js', 'nucleo/pinterest.js', 'nucleo/album.js', 'nucleo/clima.js',
  'habilidades/general/menu.js', 'habilidades/general/ping.js', 'habilidades/general/clima.js',
  'habilidades/economia/perfil.js', 'habilidades/economia/inventario.js', 'habilidades/economia/top.js',
  'habilidades/economia/daily.js', 'habilidades/economia/trabajar.js', 'habilidades/economia/tienda.js', 'habilidades/economia/gacha.js', 'habilidades/economia/dar.js',
  'habilidades/juegos/ppt.js', 'habilidades/juegos/ruleta.js',
  'habilidades/descargas/_enviar.js', 'habilidades/descargas/yts.js', 'habilidades/descargas/play.js', 'habilidades/descargas/ytmp3.js', 'habilidades/descargas/ytmp4.js', 'habilidades/descargas/pin.js', 'habilidades/descargas/pinvid.js', 'habilidades/descargas/facebook.js', 'nucleo/herramientas.js', 'habilidades/herramientas/calc.js', 'habilidades/herramientas/traducir.js', 'habilidades/herramientas/wiki.js', 'habilidades/herramientas/cambio.js', 'habilidades/herramientas/acortar.js', 'habilidades/herramientas/qr.js', 'habilidades/herramientas/hora.js', 'habilidades/juegos/dado.js', 'habilidades/juegos/moneda.js'
]
for (const a of archivos) {
  fs.mkdirSync(path.dirname(path.join(destino, a)), { recursive: true })
  fs.copyFileSync(path.join(origen, a), path.join(destino, a))
  console.log('copiado', a)
}
console.log('Listo. Los sustitutos (ajustes, memoria, api, cargador) no se tocan.')
