// Conversaciones en el servidor (Netlify Blobs). Una sola store "conv" con prefijos:
//   m/<id>/<clave>  mensajes (un blob por mensaje; clave = hora + aleatorio, sin contador compartido)
//   r/<id>          resumen (lo escribe SOLO la funcion chat)
//   x/<id>          meta (lo escriben el panel del equipo y el barrido de seguridad)
const cfg = require('../../../config/app.json');
const fb = require('../../../config/crisis-fallback.es.json');
const H24 = 24 * 3600 * 1000;

function connect(event) { try { const B = require('@netlify/blobs'); if (B.connectLambda) B.connectLambda(event); } catch (e) { console.error('BLOBS_FALLO', e.message); } }
// Lecturas "strong" si el entorno las soporta; si Netlify no da uncachedEdgeURL, se cae a lecturas normales (eventual) sin romper.
function store(name) {
  const { getStore } = require('@netlify/blobs'); const n = name || 'conv';
  let fuerte = null, normal = null;
  try { fuerte = getStore({ name: n, consistency: 'strong' }); } catch (e) {}
  try { normal = getStore(n); } catch (e) {}
  const base = normal || fuerte; if (!base) throw new Error('No se pudo abrir Netlify Blobs');
  if (!fuerte || !normal) return base;
  let soloNormal = false;
  const leer = (m) => async (...a) => { if (!soloNormal) { try { return await fuerte[m](...a); } catch (e) { if (!/uncachedEdgeURL|strong consistency/i.test(String(e && e.message))) throw e; soloNormal = true; } } return normal[m](...a); };
  return new Proxy(base, { get(t, k) { if (k === 'get' || k === 'list' || k === 'getWithMetadata') return leer(k); const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } });
}
const okId = (id) => typeof id === 'string' && /^[a-z0-9]{16,40}$/.test(id);
const san = (a) => String(a || 'anon').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30) || 'anon';
const rand = () => Math.random().toString(36).slice(2, 6);
const mkKey = (t) => String(t).padStart(13, '0') + '-' + rand();
const keyT = (k) => Number(String(k || '').slice(0, 13)) || 0;
async function getJ(s, k) { try { return await s.get(k, { type: 'json' }); } catch (e) { return null; } }

// ---- mensajes. r: 'usuario' | 'ia' | 'profesional' | 'sistema'
async function appendMsg(s, id, m) {
  const t = m.t || Date.now(); const k = mkKey(t);
  const msg = { k, t, r: m.r, text: String(m.text || '').slice(0, 2000), nivel: m.nivel || 0, modo: m.modo || 'ia' };
  if (m.nombre) msg.nombre = m.nombre; if (m.auto) msg.auto = true;
  await s.setJSON(`m/${id}/${k}`, msg); return msg;
}
async function leerMsgs(s, id, desdeK, limite) {
  const { blobs } = await s.list({ prefix: `m/${id}/` });
  let keys = blobs.map(b => b.key.slice(`m/${id}/`.length)).sort();
  if (desdeK) keys = keys.filter(k => k > desdeK);
  keys = keys.slice(-(limite || 80));
  const out = await Promise.all(keys.map(k => getJ(s, `m/${id}/${k}`)));
  return out.filter(Boolean);
}
// ---- resumen (nivel por evento, para el color)
async function resumenEvento(s, id, o) { // o: {alias, modoEdad, t, nivel, soloNivel}
  const r = (await getJ(s, 'r/' + id)) || { id, creado: o.t, eventos: [], ultimoRojoT: null, ultimoUsuarioT: 0, ultimoT: 0 };
  if (!o.soloNivel) { r.alias = o.alias; r.modoEdad = o.modoEdad; r.ultimoUsuarioT = Math.max(r.ultimoUsuarioT || 0, o.t); }
  r.ultimoT = Math.max(r.ultimoT || 0, o.t, o.tFin || 0);
  if (o.nivel >= 2) {
    const e = r.eventos.find(x => x.t === o.t); if (e) e.nivel = Math.max(e.nivel, o.nivel); else r.eventos.push({ t: o.t, nivel: o.nivel });
    r.eventos = r.eventos.sort((a, b) => a.t - b.t).slice(-30);
    if (o.nivel >= 3) r.ultimoRojoT = Math.max(r.ultimoRojoT || 0, o.t);
  }
  await s.setJSON('r/' + id, r); return r;
}
// ---- color y espera
function colorDe(r, meta, ahora) {
  const rev = (meta && meta.revisadoT) || 0;
  if (r.ultimoRojoT && r.ultimoRojoT > rev) return 'rojo'; // el rojo NO baja solo: solo "Marcar como revisado"
  const lim = ahora - H24;
  const max = Math.max(0, ...(r.eventos || []).filter(e => e.t > rev && e.t > lim).map(e => e.nivel));
  return max >= 3 ? 'rojo' : max === 2 ? 'amarillo' : 'verde';
}
const nivelTxt = (c) => c === 'rojo' ? 'Nivel 3' : c === 'amarillo' ? 'Nivel 2' : 'Nivel 0-1';
function esperaDe(r, meta, ahora) {
  if (!meta || meta.modo !== 'manual') return null;
  const base = Math.max(meta.ultimoProfT || 0, meta.manualDesdeT || 0);
  const ev = (r.eventos || []).filter(e => e.t > base); if (!ev.length) return null;
  const nivel = Math.max(...ev.map(e => e.nivel)), desde = Math.min(...ev.map(e => e.t));
  const um = nivel >= 3 ? cfg.manual.n3Ms : cfg.manual.n2Ms, ms = ahora - desde;
  return { nivel, desde, umbralMs: um, vencido: ms > um, critico: ms > 2 * um, seg: Math.round(ms / 1000) };
}
const tomadoActivo = (meta, ahora) => !!(meta && meta.tomadoPor && ahora - (meta.tomadoPor.hb || 0) < cfg.lockStaleMs);
// Si en Manual nadie responde en el doble del tiempo: mensaje fijo de seguridad (una vez) y se ofrece volver a IA.
async function barrido(s, id, r, meta, ahora) {
  const e = esperaDe(r, meta, ahora);
  if (e && e.critico && (meta.fallbackT || 0) < e.desde) {
    const t = Date.now();
    await appendMsg(s, id, { r: 'sistema', auto: true, t, nivel: e.nivel, modo: 'manual', text: e.nivel >= 3 ? fb.nivel3 : fb.nivel2 });
    meta.fallbackT = t; meta.ofrecerIA = true; meta.ultimoMsgT = t;
    await s.setJSON('x/' + id, meta);
  }
  return meta;
}
async function audit(entrada) {
  try { const a = store('auditoria'); await a.setJSON(`${Date.now()}-${rand()}`, { hora: new Date().toISOString(), ...entrada }); } catch (e) { console.error('AUDIT_FALLO', e.message); }
}
module.exports = { cfg, fb, connect, store, okId, san, mkKey, keyT, getJ, appendMsg, leerMsgs, resumenEvento, colorDe, nivelTxt, esperaDe, tomadoActivo, barrido, audit };
