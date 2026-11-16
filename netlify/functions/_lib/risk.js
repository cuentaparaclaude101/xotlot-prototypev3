const path = require('path');
const terms = require('../../../config/risk-terms.es-SV.json');
function norm(t) {
  return String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/(.)\1{2,}/g, '$1').replace(/[^a-z0-9ñ\s]/g, ' ').replace(/\s+/g, ' ').trim();
}
// Capa determinista: devuelve piso de riesgo (0-3) y categorías que dispararon.
function pisoRiesgo(texto) {
  const n = norm(texto); let piso = 0; const cats = [];
  for (const c of terms.categorias) {
    if (c.terminos.some(t => n.includes(norm(t)))) { cats.push(c.id); piso = Math.max(piso, c.piso); }
  }
  return { piso, cats };
}
module.exports = { norm, pisoRiesgo };
