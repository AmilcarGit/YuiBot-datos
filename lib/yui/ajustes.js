// Sustituto de ajustes.js del bot para la versión web (no se copia desde el bot).
export default {
  nombre: 'YuiBot-MD', creador: 'AmilcarGit', prefijos: ['.'],
  descargas: {
    yuiapi: { url: process.env.YUIAPI_URL?.trim() || 'https://yuiapi.vercel.app', clave: process.env.YUIAPI_KEY?.trim() || 'amk_i9vKkMEpbyOOueT2YcPxs68JFH3JaFzw' },
    maxAudioBytes: 3 * 1024 * 1024, // la respuesta de Vercel admite ~4,5 MB
    nexora: { url: process.env.NEXORA_URL?.trim() || 'https://nexora-api-max6.onrender.com', clave: process.env.NEXORA_KEY?.trim() || 'nexora_1iw82j8LXamd1Qk4OVA8rjR5Bst0txDl' },
    yosoyo: { url: process.env.YOSOYO_URL?.trim() || 'https://api-yosoyyo-api-ofc.onrender.com', clave: process.env.YOSOYO_KEY?.trim() || 'AmilcarGit' },
    espera: 15000,
    audioMs: 22000
  }
}
