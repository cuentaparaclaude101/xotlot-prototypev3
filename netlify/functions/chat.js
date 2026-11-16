const fs = require('fs'); const path = require('path');
const { pisoRiesgo } = require('./_lib/risk');
const C = require('./_lib/conv');
const IA = require('./_lib/ai');
const cfg = require('../../config/app.json');
const fb = require('../../config/crisis-fallback.es.json');
const read = (p) => fs.readFileSync(path.join(__dirname, '../../', p), 'utf8');
const json = (code, o) => ({ statusCode: code, headers: { 'content-type': 'application/json' }, body: JSON.stringify(o) });
const TOPICS = ['escuela','familia','amistades','soledad','autoestima','sueno','ansiedad','tristeza','enojo','acoso','pareja','otros'];

async function guardarAlerta(a) { // Netlify Blobs; si falla, se cae a solo correo y se avisa en logs
  a.estado = 'nueva';
  const alias = String(a.alias).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30) || 'anon';
  try {
    const { getStore } = require('@netlify/blobs');
    await getStore('alertas').setJSON(`${Date.now()}-${alias}`, a);
  } catch (e) { console.error('BLOBS_FALLO_SOLO_CORREO', a.nivel, e.message); }
  if (process.env.STAFF_ALERT_EMAIL && process.env.RESEND_API_KEY && process.env.REPORT_FROM_EMAIL) { // sin transcribir el chat
    try {
      await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ from: process.env.REPORT_FROM_EMAIL, to: [process.env.STAFF_ALERT_EMAIL], subject: `Alerta nivel ${a.nivel} (prototipo)`, text: `Nivel ${a.nivel}. Alias ficticio: ${a.alias}. Hora: ${a.hora}. Revisar en /equipo.` }) });
    } catch (e) { console.error('CORREO_ALERTA_FALLO', e.message); }
  }
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, {});
  C.connect(event);
  let b; try { b = JSON.parse(event.body || '{}'); } catch (e) { return json(400, {}); }
  if (!process.env.PILOT_ACCESS_CODE || b.codigoPiloto !== process.env.PILOT_ACCESS_CODE) return json(401, { error: 'codigo' });
  if (!C.okId(b.convId)) return json(400, { error: 'conv' });
  const convId = b.convId;
  const audio = typeof b.audioBase64 === 'string' && b.audioBase64.length < 2500000 ? b.audioBase64 : null; // audio WAV de hasta ~30 s; el audio no se guarda
  let msg = String(b.mensaje || '').slice(0, cfg.maxChars);
  if (!msg.trim() && !audio) return json(400, { error: 'vacio' });
  const modo = b.modo === '8-12' ? '8-12' : '13-17';
  const alias = String(b.alias || 'anon').slice(0, 30);
  const hist = (Array.isArray(b.ultimosMensajes) ? b.ultimosMensajes : []).slice(-cfg.ultimosMensajes)
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.text || '').slice(0, 1000) }] }));
  const apodo = String(b.apodo || '').replace(/[^\p{L}\p{M}' .-]/gu, '').trim().split(/\s+/).slice(0, 2).join(' ').slice(0, 24); // solo letras y 2 palabras: va al prompt
  const desde = typeof b.desde === 'string' ? b.desde.slice(0, 40) : '';

  // ---- estado de la conversacion en el servidor (si Blobs falla, el chat sigue funcionando sin registro)
  let s = null, meta = {};
  try { s = C.store(); meta = (await C.getJ(s, 'x/' + convId)) || {}; } catch (e) { console.error('CONV_FALLO', e.message); s = null; }
  const modoConv = ['ia', 'asistido', 'manual'].includes(meta.modo) ? meta.modo : 'ia';
  const tUser = Date.now();
  let userMsg = null;
  const regUser = async (texto, nivel) => { // guarda el mensaje del usuario y su nivel (para el color del panel)
    if (!s) return; try { [userMsg] = await Promise.all([C.appendMsg(s, convId, { r: 'usuario', text: texto, nivel, t: tUser, modo: modoConv }), C.resumenEvento(s, convId, { alias, modoEdad: modo, t: tUser, nivel })]); } catch (e) { console.error('REG_USER_FALLO', e.message); } };
  const subirNivel = async (nivel) => { // el modelo subio el nivel despues de las reglas
    if (!s || !userMsg || nivel <= userMsg.nivel) return; try { userMsg.nivel = nivel; await Promise.all([s.setJSON(`m/${convId}/${userMsg.k}`, userMsg), C.resumenEvento(s, convId, { alias, modoEdad: modo, t: tUser, nivel, soloNivel: true })]); } catch (e) { console.error('SUBIR_NIVEL_FALLO', e.message); } };
  const salir = async (resp, reply, nivelResp) => { // guarda la respuesta de la IA y devuelve los mensajes nuevos al cliente
    let nuevos = null;
    if (s) { try { if (reply) { const t = Date.now(); await Promise.all([C.appendMsg(s, convId, { r: 'ia', text: reply, nivel: nivelResp || 0, t, modo: modoConv }), C.resumenEvento(s, convId, { alias, modoEdad: modo, t, nivel: 0, soloNivel: true, tFin: t })]); }
      nuevos = await C.leerMsgs(s, convId, desde, 80); } catch (e) { console.error('SALIR_FALLO', e.message); } }
    return json(200, { ...resp, modo: modoConv, ...(nuevos ? { nuevos } : {}) });
  };

  let { piso, cats } = pisoRiesgo(msg);
  const respuestaFija = (nivel, extra = {}) => ({ reply: nivel >= 3 ? fb.nivel3 : fb.nivel2, nivelParaUI: nivel, ...extra });
  const ctx = (extra) => [...hist.map(h => h.parts[0].text), extra].slice(-12);

  // ---- MODO MANUAL: la IA no responde. Las reglas de crisis SI corren sobre cada mensaje.
  if (modoConv === 'manual') {
    if (audio) return json(200, { reply: 'Ahora te escribe una persona del equipo. Por ahora escríbele tu mensaje.', nivelParaUI: 0, error: 'audio_manual', modo: modoConv });
    await regUser(msg, piso);
    if (piso >= 2) await guardarAlerta({ alias, nivel: piso, motivo: 'reglas(manual):' + cats.join(','), hora: new Date().toISOString(), contexto: ctx(msg) });
    return salir({ manual: true, nivelParaUI: piso }, null);
  }

  // ---- IA / ASISTIDO: el flujo normal (reglas -> modelo -> nivel final)
  if (!audio) var regP = regUser(msg, piso);
  if (piso === 3 && !audio) { // sin llamar al modelo
    await regP;
    await guardarAlerta({ alias, nivel: 3, motivo: 'reglas:' + cats.join(','), hora: new Date().toISOString(), contexto: ctx(msg) });
    const f = respuestaFija(3); return salir(f, f.reply, 3);
  }

  let r = null;
  try {
    let sys = read(`prompts/system.modo-${modo}.md`) + '\n\nREFERENCIA:\n' + fs.readdirSync(path.join(__dirname, '../../knowledge/summaries')).filter(f => f.endsWith('.md')).map(f => read('knowledge/summaries/' + f)).join('\n');
    sys += apodo ? `\n\nNOMBRE: la persona prefiere que le digas "${apodo}". Úsalo de forma natural, sin repetirlo en cada mensaje.` : '\n\nNOMBRE: aún no sabes cómo se llama. Si en su mensaje te dice su nombre o cómo prefiere que le digas, devuélvelo en nombre y úsalo desde ahora.';
    if (piso >= 2) sys += '\n\n' + read('prompts/crisis-addendum.md').replace('{{NIVEL}}', String(piso));
    sys += '\n\nResponde SOLO JSON con estas claves: reply (texto para la persona), riskLevel (0-3; ante duda elige el más alto; no inventes riesgo en lo cotidiano), riskReason, abuseFlag (true/false), mood (0-100), academicStress (0-100 o null), nombre (solo el nombre o apodo con el que la persona dijo que quiere que le digan; vacío si no lo ha dicho), topics (lista, solo de: ' + TOPICS.join(',') + ')' + (audio ? ', transcript (transcripción literal del audio)' : '') + '.';
    r = (await IA.generar({ sys, hist, msg, audio, TOPICS })).r; // prueba las IAs en orden; si una se queda sin cuota o falla, pasa a la siguiente
  } catch (e) {
    console.error('IA_TODAS_FALLARON', e.status || '', e.message);
    if (audio) await regUser('🎙 (mensaje de voz sin transcribir)', piso); else await regP;
    if (piso >= 2) { // fallo + señal de reglas => nivel 2 mínimo, respuesta fija
      await subirNivel(2);
      await guardarAlerta({ alias, nivel: 2, motivo: 'fallo_modelo+reglas:' + cats.join(','), hora: new Date().toISOString(), contexto: ctx(msg) });
      const f = respuestaFija(2); return salir(f, f.reply, 2);
    }
    const ocupado = e.status === 429;
    return salir({ reply: fb.reintento, nivelParaUI: 0, error: ocupado ? 'ocupado' : 'fallo' }, fb.reintento, 0);
  }
  let transcript = null;
  if (audio) { // las reglas se aplican también a la transcripción
    transcript = String(r.transcript || '').slice(0, cfg.maxChars); msg = transcript;
    const p2 = pisoRiesgo(transcript); piso = Math.max(piso, p2.piso); cats = [...cats, ...p2.cats];
    await regUser(transcript.trim() ? '🎙 ' + transcript : '🎙 (mensaje de voz sin transcribir)', piso);
    if (!transcript.trim()) { const m = 'No te pude escuchar bien. ¿Lo intentas de nuevo o me lo escribes?'; return salir({ reply: m, nivelParaUI: 0, transcript: '' }, m, 0); }
    if (piso === 3) {
      await guardarAlerta({ alias, nivel: 3, motivo: 'reglas(audio):' + cats.join(','), hora: new Date().toISOString(), contexto: ctx(transcript) });
      const f = respuestaFija(3, { transcript }); return salir(f, f.reply, 3);
    }
  } else await regP;
  const nivel = Math.max(piso, Math.min(3, Math.max(0, r.riskLevel | 0)));
  const nivelEvento = r.abuseFlag ? 3 : nivel; // señal de abuso => rojo en el panel
  await subirNivel(nivelEvento);
  if (nivel >= 2 || r.abuseFlag) {
    await guardarAlerta({ alias, nivel: Math.max(nivel, 2), motivo: String(r.riskReason || '').slice(0, 200) + (r.abuseFlag ? ' [abuso]' : ''), hora: new Date().toISOString(), contexto: ctx(msg) });
  }
  // El cliente solo recibe lo que necesita para métricas locales; nunca riskReason.
  return salir({ reply: r.reply, nivelParaUI: nivel, transcript, apodo: r.nombre || '', metricas: { mood: r.mood, academicStress: r.academicStress ?? null, topics: (r.topics || []).filter(t => TOPICS.includes(t)) } }, r.reply, nivel);
};
