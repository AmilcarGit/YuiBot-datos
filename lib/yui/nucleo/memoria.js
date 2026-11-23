// Sustituto de nucleo/memoria.js del bot: en la web no hay chats; solo el estilo global por defecto.
const chats = {}
export const chat = id => (chats[id] ??= { tema: '' })
export const usuario = () => { throw new Error('En la web el usuario llega en ctx.usuario') }
export const todosUsuarios = () => ({})
export const guardar = () => {}
