// Varias IAs con respaldo automatico. Orden y proveedores en config/providers.json.
// 1 llamada util por mensaje: se prueba el primer proveedor sano; si falla, el siguiente, dentro de un presupuesto de tiempo
// (Netlify corta las funciones a ~10 s). Un proveedor que acaba de fallar descansa unos segundos ("frio") para no perder tiempo en el.
const P = require('../../../config/providers.json');
const frio = {}; // nombre -> hasta cuando descansa (memoria de la instancia; se reinicia sola)
const stats = {}; // intentos/fallos por proveedor (solo para logs)

const activo = (id) => { const p = P.proveedores[id]; return !!(p && process.env[p.key] && process.env[p.model]); };
const listaActivos = () => P.orden.filter(activo);
function clasificar(e) {
  const s = e && (e.status || e.code), m = String((e && e.message) || '');
  if (s === 429 || /quota|rate.?limit|resource.?exhausted|too many/i.test(m)) return 'cuota';
  if (s === 401 || s === 403 || s === 404) return 'auth';
  return 'otro';
}
function extraerJSON(t) {
  t = String(t || '').replace(/```json|```/g, '').trim();
  try { return JSON.parse(t); } catch (e) { const a = t.indexOf('{'), b = t.lastIndexOf('}'); if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1)); throw new Error('json_invalido'); }
}
function validar(r) {
  if (!r || typeof r.reply !== 'string' || !r.reply.trim()) throw new Error('json_invalido');
  r.riskLevel = Math.min(3, Math.max(0, Number(r.riskLevel) | 0)); r.abuseFlag = r.abuseFlag === true;
  r.mood = Math.min(100, Math.max(0, Number(r.mood) | 0)); if (!Array.isArray(r.topics)) r.topics = [];
  r.nombre = String(r.nombre || '').replace(/[^\p{L}\p{M}' .-]/gu, '').trim().split(/\s+/).slice(0, 2).join(' ').slice(0, 24);
  return r;
}
const conTope = (prom, ms) => new Promise((ok, no) => { const t = setTimeout(() => no(Object.assign(new Error('timeout'), { status: 408 })), ms); prom.then(v => { clearTimeout(t); ok(v); }, e => { clearTimeout(t); no(e); }); });

async function viaGemini(p, { sys, hist, msg, audio, TOPICS }, ms) {
  const { GoogleGenAI, Type } = require('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env[p.key] });
  const res = await conTope(ai.models.generateContent({
    model: process.env[p.model],
    contents: [...hist, { role: 'user', parts: audio ? [{ inlineData: { mimeType: 'audio/wav', data: audio } }, { text: '(Mensaje de voz. Transcríbelo literalmente en transcript y responde.)' }] : [{ text: msg }] }],
    config: { systemInstruction: sys, responseMimeType: 'application/json',
      responseSchema: { type: Type.OBJECT, required: ['reply', 'riskLevel', 'abuseFlag', 'mood'], properties: { transcript: { type: Type.STRING }, nombre: { type: Type.STRING },
        reply: { type: Type.STRING }, riskLevel: { type: Type.INTEGER }, riskReason: { type: Type.STRING },
        abuseFlag: { type: Type.BOOLEAN }, mood: { type: Type.INTEGER }, academicStress: { type: Type.INTEGER, nullable: true },
        topics: { type: Type.ARRAY, items: { type: Type.STRING } } } } }
  }), ms);
  return extraerJSON(res.text);
}
async function viaOpenAI(p, { sys, hist, msg }, ms) { // Groq, OpenRouter, Cerebras, Mistral... (formato "chat completions")
  const ctrl = new AbortController(), t = setTimeout(() => ctrl.abort(), ms);
  try {
    const body = { model: process.env[p.model], temperature: 0.7, max_tokens: 700,
      messages: [{ role: 'system', content: sys }, ...hist.map(h => ({ role: h.role === 'model' ? 'assistant' : 'user', content: h.parts[0].text })), { role: 'user', content: msg }] };
    if (p.json) body.response_format = { type: 'json_object' };
    const res = await fetch((p.urlEnv && process.env[p.urlEnv]) || p.url, { method: 'POST', signal: ctrl.signal, headers: { Authorization: 'Bearer ' + process.env[p.key], 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) { const e = new Error('http ' + res.status); e.status = res.status; throw e; }
    const d = await res.json();
    return extraerJSON(d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content);
  } catch (e) { if (e.name === 'AbortError') { e.status = 408; e.message = 'timeout'; } throw e; } finally { clearTimeout(t); }
}

// entrada: { sys, hist, msg, audio, TOPICS }  ->  { r, proveedor }   |  lanza error con .status (429 si todos estaban sin cuota)
async function generar(inp) {
  const ahora = Date.now(), fin = ahora + P.presupuestoMs;
  let ids = listaActivos(); if (inp.audio) ids = ids.filter(id => P.proveedores[id].audio); // solo Gemini transcribe audio
  if (!ids.length) throw Object.assign(new Error('sin_proveedores'), { status: 500 });
  let cand = ids.filter(id => !(frio[id] > ahora)); if (!cand.length) cand = ids.slice().sort((a, b) => (frio[a] || 0) - (frio[b] || 0));
  const fallos = [];
  for (let i = 0; i < cand.length; i++) {
    const id = cand[i], p = P.proveedores[id], resta = fin - Date.now();
    if (resta < 1200) break;
    const ms = Math.min(resta, i === 0 ? P.primerIntentoMs : P.intentoMs);
    const t0 = Date.now(); stats[id] = stats[id] || { ok: 0, fallo: 0 };
    try {
      const r = validar(await (p.tipo === 'gemini' ? viaGemini : viaOpenAI)(p, inp, ms));
      stats[id].ok++; delete frio[id]; console.log('IA_OK', p.nombre, Date.now() - t0 + 'ms', fallos.length ? 'tras ' + fallos.map(f => f.id + ':' + f.tipo).join(',') : '');
      return { r, proveedor: id };
    } catch (e) {
      const tipo = e.message === 'json_invalido' ? 'otro' : clasificar(e); stats[id].fallo++;
      frio[id] = Date.now() + (P.frioMs[tipo] || 20000); fallos.push({ id, tipo, status: e.status || '' });
      console.error('IA_FALLO', p.nombre, tipo, e.status || '', e.message);
    }
  }
  const e = new Error('todas_fallaron'); e.status = fallos.length && fallos.every(f => f.tipo === 'cuota') ? 429 : 500; e.fallos = fallos; throw e;
}
module.exports = { generar, listaActivos, _reset: () => { for (const k in frio) delete frio[k]; } };
