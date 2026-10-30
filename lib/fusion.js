// Reglas para unir lo que dicen DOS instalaciones del bot sobre la misma persona.
//
//  · aditivos: se suma lo que cada instalación ganó/gastó desde la última sincronización (deltas).
//  · máximos: se queda el mayor (rachas, mejoras, tiempos de espera).
//  · uniones: inventario y logros se juntan.
//  · todo lo demás (nombre, edad, boosts, racha…): gana el registro más reciente (`actualizado`).
// El servidor es la autoridad: recalcula el nivel y aplica topes anti-trampa.

const ADITIVOS_USUARIO = ['monedas', 'xp', 'mensajes', 'reputacion', 'trabajosVeces', 'trabajosGanado']
const MAXIMOS_USUARIO = ['mejorRacha', 'ultimoDaily', 'ultimoXp', 'mejorasTotal']
const SIN_NEGATIVOS = new Set(['monedas', 'xp', 'mensajes', 'trabajosVeces', 'trabajosGanado'])

const calcularNivel = (xp) => Math.floor(Math.sqrt(Math.max(0, xp) / 100))
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const ts = (r) => num(r?.actualizado)
const esObj = (v) => v && typeof v === 'object' && !Array.isArray(v)

function acotar(valor, min, max) { return Math.min(max, Math.max(min, valor)) }

/**
 * Une el registro del servidor con el de la instalación.
 * @param {object|null} srv  registro guardado en el servidor
 * @param {object} cli       registro que mandó la instalación (ya limpio)
 * @param {object} d         deltas de la instalación: { monedas, xp, …, xpSemana }
 * @param {object} topes     { monedas, xp, mensajes, reputacion, trabajosVeces, trabajosGanado, gananciaMonedasRestante }
 * @returns {{ registro: object, aplicado: object }}
 */
function fusionarUsuario(srv, cli, d = {}, topes = {}) {
  const s = esObj(srv) ? srv : {}
  const c = esObj(cli) ? cli : {}
  const nuevo = ts(c) >= ts(s)
  // El más reciente manda; del otro solo se conserva lo que el reciente no tenga.
  const out = nuevo ? { ...s, ...c } : { ...c, ...s }

  // Uniones
  out.inventario = [...new Set([...(Array.isArray(s.inventario) ? s.inventario : []), ...(Array.isArray(c.inventario) ? c.inventario : [])])]
  if (!out.inventario.length) delete out.inventario
  if (esObj(s.logros) || esObj(c.logros)) out.logros = { ...(esObj(s.logros) ? s.logros : {}), ...(esObj(c.logros) ? c.logros : {}) }

  // Máximos
  for (const f of MAXIMOS_USUARIO) if (s[f] !== undefined || c[f] !== undefined) out[f] = Math.max(num(s[f]), num(c[f]))

  // Aditivos con topes (el servidor decide cuánto de lo que dice la instalación se acepta)
  const aplicado = {}
  for (const f of ADITIVOS_USUARIO) {
    let delta = Math.trunc(num(d[f]))
    const tope = topes[f]
    if (tope !== undefined) delta = acotar(delta, SIN_NEGATIVOS.has(f) ? -Infinity : -tope, tope)
    if (f === 'monedas' && delta > 0 && topes.gananciaMonedasRestante !== undefined) delta = Math.min(delta, Math.max(0, topes.gananciaMonedasRestante))
    const total = num(s[f]) + delta
    out[f] = SIN_NEGATIVOS.has(f) ? Math.max(0, total) : total
    aplicado[f] = delta
  }

  // XP de la semana: suma solo dentro de la misma semana; una semana más nueva reemplaza.
  const semS = String(s.semana || ''); const semC = String(c.semana || '')
  const dSem = Math.trunc(num(d.xpSemana))
  if (semC && semC >= semS) {
    const limite = topes.xp !== undefined ? topes.xp : Infinity
    const sumar = acotar(dSem, 0, limite)
    out.semana = semC
    out.xpSemana = semC === semS ? num(s.xpSemana) + sumar : sumar
  } else if (semS) { out.semana = semS; out.xpSemana = num(s.xpSemana) }

  out.nivel = calcularNivel(out.xp)
  out.actualizado = Math.max(ts(s), ts(c))
  return { registro: out, aplicado }
}

/** Trabajos: { cd:{clave:ts}, veces:{clave:n}, ganado:n, granja:[…], mejoras:{clave:n}, actualizado } */
function fusionarTrabajos(srv, cli, d = {}, topes = {}) {
  const s = esObj(srv) ? srv : {}
  const c = esObj(cli) ? cli : {}
  const nuevo = ts(c) >= ts(s)
  const out = { cd: {}, veces: {}, ganado: 0, granja: [], mejoras: {} }

  const maximos = (a, b) => { const r = {}; for (const k of new Set([...Object.keys(esObj(a) ? a : {}), ...Object.keys(esObj(b) ? b : {})])) r[k] = Math.max(num(a?.[k]), num(b?.[k])); return r }
  out.cd = maximos(s.cd, c.cd)
  out.mejoras = maximos(s.mejoras, c.mejoras)

  const topeVeces = topes.trabajosVeces ?? 100
  const dv = esObj(d.veces) ? d.veces : {}
  for (const k of new Set([...Object.keys(esObj(s.veces) ? s.veces : {}), ...Object.keys(dv)])) {
    out.veces[k] = Math.max(0, num(s.veces?.[k]) + acotar(Math.trunc(num(dv[k])), 0, topeVeces))
  }
  out.ganado = Math.max(0, num(s.ganado) + acotar(Math.trunc(num(d.ganado)), 0, topes.trabajosGanado ?? 100000))
  out.granja = (nuevo ? c.granja : s.granja) || s.granja || c.granja || []
  out.actualizado = Math.max(ts(s), ts(c))
  return out
}

module.exports = { ADITIVOS_USUARIO, MAXIMOS_USUARIO, calcularNivel, fusionarUsuario, fusionarTrabajos }
