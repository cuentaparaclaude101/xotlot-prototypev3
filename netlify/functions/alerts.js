const fs = require('fs'); const path = require('path');
const json = (c, o) => ({ statusCode: c, headers: { 'content-type': 'application/json' }, body: JSON.stringify(o) });
const san = (a) => String(a || 'anon').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 30) || 'anon';
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, {});
  let b; try { b = JSON.parse(event.body || '{}'); } catch (e) { return json(400, {}); }
  const auth = () => process.env.STAFF_PASSWORD && b.password === process.env.STAFF_PASSWORD;
  if (b.action !== 'borrar' && !auth()) return json(401, { error: 'password' }); // la contraseña se revisa primero
  let store; try { const B = require('@netlify/blobs'); if (B.connectLambda) B.connectLambda(event); store = B.getStore('alertas'); } catch (e) { console.error('BLOBS_FALLO', e.message); return json(500, { error: 'blobs', detalle: String(e.message).slice(0, 200) }); }
  try {
    if (b.action === 'borrar') { // el adolescente borra las alertas de su alias (requiere código de piloto)
      if (!process.env.PILOT_ACCESS_CODE || b.codigoPiloto !== process.env.PILOT_ACCESS_CODE) return json(401, {});
      const { blobs } = await store.list(); const suf = '-' + san(b.alias);
      for (const x of blobs) if (x.key.endsWith(suf)) await store.delete(x.key);
      return json(200, { ok: true });
    }
    if (!process.env.STAFF_PASSWORD || b.password !== process.env.STAFF_PASSWORD) return json(401, { error: 'password' });
    if (b.action === 'update') {
      const a = await store.get(String(b.key), { type: 'json' }); if (!a) return json(404, {});
      if (['nueva', 'en_revision', 'cerrada'].includes(b.estado)) a.estado = b.estado;
      if (b.nota) (a.notas = a.notas || []).push({ texto: String(b.nota).slice(0, 500), hora: new Date().toISOString() });
      await store.setJSON(String(b.key), a); return json(200, { ok: true });
    }
    const { blobs } = await store.list(); const lista = [];
    for (const x of blobs) { const a = await store.get(x.key, { type: 'json' }); if (a) lista.push({ key: x.key, ...a }); }
    lista.sort((p, q) => q.nivel - p.nivel || String(q.hora).localeCompare(String(p.hora)));
    const c = require('../../config/crisis-contacts.json');
    const pend = (c.lineasLocales || []).some(l => /POR_COMPLETAR/.test(l.numero));
    return json(200, { alertas: lista, advertencia: pend ? 'Los contactos locales de crisis siguen sin completar: la app solo muestra el 911. Completar config/crisis-contacts.json con datos verificados.' : null });
  } catch (e) { console.error('ALERTS_FALLO', e.message); return json(500, { error: 'fallo', detalle: String(e.message).slice(0, 200) }); }
};