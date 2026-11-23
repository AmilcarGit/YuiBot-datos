// Sustituto de nucleo/api.js del bot: en la web los rankings salen directo de la base (sin pasar por HTTP).
const almacenamiento = () => globalThis[Symbol.for('yui.contexto')]?.getStore()
export const activa = () => Boolean(almacenamiento())

export const api = {
  top: (campo, limite) => almacenamiento().top(campo, limite),
  usuario: () => almacenamiento().perfil()
}
