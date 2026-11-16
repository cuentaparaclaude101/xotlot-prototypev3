const fs = require('fs'); const path = require('path');
const json = (c, o) => ({ statusCode: c, headers: { 'content-type': 'application/json' }, body: JSON.stringify(o) });
const TEMAS = ['escuela','familia','amistades','soledad','autoestima','sueno','ansiedad','tristeza','enojo','acoso','pareja','otros'];
const FIJO = 'Esto es solo una medida de acompañamiento. No muestra lo que tu hijo/a conversa.';
const num = (v) => (Number.isFinite(+v) && v !== null ? Math.max(0, Math.min(100, Math.round(+v))) : null);
const PAUTAS = ['Busquen un momento tranquilo para conversar sin presionar ni interrogar.', 'Propongan una actividad juntos, como una comida en familia o un paseo.', 'Eviten usar este informe como reclamo o castigo.'];

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, {});
  let b; try { b = JSON.parse(event.body || '{}'); } catch (e) { return json(400, {}); }
  if (!process.env.PILOT_ACCESS_CODE || b.codigoPiloto !== process.env.PILOT_ACCESS_CODE) return json(401, {});
  // SOLO números y etiquetas de una lista fija: nunca texto libre del chat.
  const ind = { felicidad: num(b.felicidad), tendencia: ['sube', 'baja', 'igual'].includes(b.tendencia) ? b.tendencia : 'igual',
    estresAcademico: num(b.estresAcademico), diasActivos: Math.max(0, Math.min(7, b.diasActivos | 0)),
    temas: (Array.isArray(b.temas) ? b.temas : []).filter(t => TEMAS.includes(t)).slice(0, 5), modo: b.modo === '8-12' ? '8-12' : '13-17' };
  let out = { resumen: 'Esta semana hubo algunos momentos de tensión y otros de calma. Un acompañamiento cercano y sin presión ayuda mucho.', pautas: PAUTAS };
  try {
    const { GoogleGenAI, Type } = require('@google/genai');
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const call = ai.models.generateContent({ model: process.env.GEMINI_MODEL, contents: [{ role: 'user', parts: [{ text: JSON.stringify(ind) }] }],
      config: { systemInstruction: fs.readFileSync(path.join(__dirname, '../../prompts/report.md'), 'utf8'), responseMimeType: 'application/json',
        responseSchema: { type: Type.OBJECT, required: ['resumen', 'pautas'], properties: { resumen: { type: Type.STRING }, pautas: { type: Type.ARRAY, items: { type: Type.STRING } } } } } });
    const r = await Promise.race([call, new Promise((_, x) => setTimeout(() => x(new Error('timeout')), 8000))]);
    const j = JSON.parse(r.text);
    if (j.resumen && Array.isArray(j.pautas) && j.pautas.length) out = { resumen: String(j.resumen).slice(0, 600), pautas: j.pautas.slice(0, 3).map(p => String(p).slice(0, 300)) };
  } catch (e) { console.error('REPORT_FALLO', e.message); }
  let enviado = false, error = null;
  if (b.enviar && b.correo) {
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.correo);
    if (!ok) return json(400, { error: 'correo' });
    if (!process.env.RESEND_API_KEY || !process.env.REPORT_FROM_EMAIL) error = 'sin_proveedor';
    else try {
      const html = `<p>${out.resumen}</p><ul>${out.pautas.map(p => `<li>${p}</li>`).join('')}</ul><p><i>${FIJO}</i></p>`;
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({ from: process.env.REPORT_FROM_EMAIL, to: [b.correo], subject: 'Informe de acompañamiento (versión de prueba)', html }) });
      enviado = r.ok; if (!r.ok) error = 'envio_fallido';
    } catch (e) { error = 'envio_fallido'; }
  }
  return json(200, { ...out, indicadores: ind, enviado, error, textoFijo: FIJO });
};
