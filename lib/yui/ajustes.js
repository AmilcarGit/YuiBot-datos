// Sustituto de ajustes.js del bot para la versión web (no se copia desde el bot).
export default {
  nombre: 'YuiBot-MD', creador: 'AmilcarGit', prefijos: ['.'],
  descargas: {
    nexora: { url: process.env.NEXORA_URL?.trim() || 'https://nexora-api-max6.onrender.com', clave: process.env.NEXORA_KEY?.trim() || 'nexora_1iw82j8LXamd1Qk4OVA8rjR5Bst0txDl' },
    yosoyo: { url: process.env.YOSOYO_URL?.trim() || 'https://api-yosoyyo-api-ofc.onrender.com', clave: process.env.YOSOYO_KEY?.trim() || 'AmilcarGit' },
    espera: 40000
  }
}
