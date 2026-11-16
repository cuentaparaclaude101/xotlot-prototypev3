// Funcion del usuario (adolescente): sincroniza su conversacion (polling) y borra sus datos del servidor.
const C = require('./_lib/conv');
const json = (c, o) => ({ statusCode: c, headers: { 'content-type': 'application/json' }, body: JSON.stringify(o) });
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, {});
  C.connect(event);
  let b; try { b = JSON.parse(event.body || '{}'); } catch (e) { return json(400, {}); }
  if (!process.env.PILOT_ACCESS_CODE || b.codigoPiloto !== process.env.PILOT_ACCESS_CODE) return json(401, {});
  if (!C.okId(b.convId)) return json(400, { error: 'conv' });
  const id = b.convId; let s;
  try { s = C.store(); } catch (e) { return json(200, { modo: 'ia', nombre: null, nuevos: [], sinServidor: true }); }
  try {
    if (b.action === 'borrar') { // "Borrar mis datos": elimina la conversacion completa del servidor
      const { blobs } = await s.list({ prefix: `m/${id}/` });
      for (const x of blobs) await s.delete(x.key);
      await s.delete('r/' + id); await s.delete('x/' + id);
      return json(200, { ok: true });
    }
    // sync
    const ahora = Date.now();
    let [r, meta] = await Promise.all([C.getJ(s, 'r/' + id), C.getJ(s, 'x/' + id)]);
    if (!r && !meta) return json(200, { modo: 'ia', nombre: null, nuevos: [] });
    r = r || { eventos: [] }; meta = meta || {};
    if (meta.modo === 'manual') meta = await C.barrido(s, id, r, meta, ahora); // el usuario no se queda solo
    const desde = typeof b.desde === 'string' ? b.desde.slice(0, 40) : '';
    const ultimo = Math.max(r.ultimoT || 0, meta.ultimoMsgT || 0);
    let nuevos = [];
    if (!desde || C.keyT(desde) < ultimo) nuevos = await C.leerMsgs(s, id, desde, 80); // si no hay cambios, no se listan los mensajes (ahorra creditos)
    const modo = ['ia', 'asistido', 'manual'].includes(meta.modo) ? meta.modo : 'ia';
    return json(200, { modo, nombre: modo === 'manual' && meta.tomadoPor ? meta.tomadoPor.nombre : null, nuevos });
  } catch (e) { console.error('CONV_FALLO', e.message); return json(500, { error: 'fallo' }); }
};
