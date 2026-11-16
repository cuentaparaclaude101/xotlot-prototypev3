// Simula Gemini devolviendo una transcripción con riesgo: debe dar nivel 3 con la respuesta fija (caso de audio).
const M = require('module'); const orig = M._load;
M._load = function (r, ...a) { if (r === '@google/genai') return { Type: new Proxy({}, { get: () => 'x' }), GoogleGenAI: class { constructor() { this.models = { generateContent: async () => ({ text: JSON.stringify({ transcript: 'me quiero morir', reply: 'respuesta del modelo', riskLevel: 0, abuseFlag: false, mood: 20 }) }) }; } } }; return orig.call(this, r, ...a); };
process.env.PILOT_ACCESS_CODE = 'x'; process.env.GEMINI_MODEL = 'm';
require('../netlify/functions/chat.js').handler({ httpMethod: 'POST', body: JSON.stringify({ codigoPiloto: 'x', alias: 'T', modo: '13-17', audioBase64: 'AAAA', mensaje: '' }) })
 .then(r => { const j = JSON.parse(r.body); const ok = j.nivelParaUI === 3 && j.reply !== 'respuesta del modelo' && j.transcript === 'me quiero morir'; console.log(ok ? 'OK audio->nivel 3' : 'FALLA', r.body.slice(0, 120)); process.exit(ok ? 0 : 1); });
