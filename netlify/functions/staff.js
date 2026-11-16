// Funcion del equipo: lista con colores, leer chat, cambiar modo, escribir (solo Manual), revisar, notas y auditoria.
const C = require('./_lib/conv');
const json = (c, o) => ({ statusCode: c, headers: { 'content-type': 'application/json' }, body: JSON.stringify(o) });
const MODOS = ['ia', 'asistido', 'manual'];
const ORDEN = { rojo: 0, amarillo: 1, verde: 2 };

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, {});
  C.connect(event);
  let b; try { b = JSON.parse(event.body || '{}'); } catch (e) { return json(400, {}); }
  if (!process.env.STAFF_PASSWORD || b.password !== process.env.STAFF_PASSWORD) return json(401, { error: 'password' });
  const nombre = String(b.nombre || '').replace(/[^\p{L}\p{N} ._-]/gu, '').trim().slice(0, 30);
  if (nombre.length < 2) return json(400, { error: 'nombre' }); // nombre ficticio del profesional (se muestra al usuario)
  let s; try { s = C.store(); } catch (e) { return json(500, { error: 'blobs', detalle: String(e.message).slice(0, 200) }); }
  const ahora = Date.now();
  const cargar = async (id) => { const [r, meta] = await Promise.all([C.getJ(s, 'r/' + id), C.getJ(s, 'x/' + id)]); return { r: r || { eventos: [] }, meta: meta || {} }; };
  const fila = (id, r, meta) => { const color = C.colorDe(r, meta, ahora), esp = C.esperaDe(r, meta, ahora);
    return { id, alias: r.alias || '(sin alias)', modoEdad: r.modoEdad || '', ultimoT: Math.max(r.ultimoT || 0, meta.ultimoMsgT || 0), ultimoUsuarioT: r.ultimoUsuarioT || 0,
      modo: MODOS.includes(meta.modo) ? meta.modo : 'ia', color, nivelTxt: C.nivelTxt(color), noLeido: (r.ultimoUsuarioT || 0) > (meta.leidoT || 0),
      tomadoPor: C.tomadoActivo(meta, ahora) ? meta.tomadoPor.nombre : null, etiquetas: meta.etiquetas || [], espera: esp, ofrecerIA: !!meta.ofrecerIA, revisadoT: meta.revisadoT || null }; };
  try {
    if (b.action === 'lista') {
      const { blobs } = await s.list({ prefix: 'r/' }); const lista = [];
      for (let i = 0; i < blobs.length; i += 15) { // en tandas para no saturar
        const parte = await Promise.all(blobs.slice(i, i + 15).map(async x => { const id = x.key.slice(2); let { r, meta } = await cargar(id);
          if (meta.modo === 'manual') meta = await C.barrido(s, id, r, meta, ahora); return fila(id, r, meta); }));
        lista.push(...parte);
      }
      lista.sort((p, q) => ORDEN[p.color] - ORDEN[q.color] || q.ultimoT - p.ultimoT);
      return json(200, { lista, ahora });
    }
    if (b.action === 'auditoria') {
      const a = C.store('auditoria'); const { blobs } = await a.list(); const keys = blobs.map(x => x.key).sort().slice(b.todo ? -2000 : -150).reverse();
      if (b.todo) await C.audit({ quien: nombre, accion: 'exportar_registro' });
      return json(200, { registro: (await Promise.all(keys.map(k => C.getJ(a, k)))).filter(Boolean) });
    }
    if (b.action === 'plantillas') { // solo se pueden usar las aprobadas por psicologos (aprobada: true)
      const p = require('../../config/plantillas.es.json'); return json(200, { plantillas: p.plantillas.map(x => ({ id: x.id, titulo: x.titulo, texto: x.aprobada ? x.texto : '', aprobada: !!x.aprobada })) });
    }
    if (!C.okId(b.id)) return json(400, { error: 'id' });
    const id = b.id; let { r, meta } = await cargar(id);
    if (!r.alias && !meta.modo && !r.ultimoT) return json(404, {});
    const guardarMeta = async () => s.setJSON('x/' + id, meta);
    const sistema = async (texto) => { const t = Date.now(); await C.appendMsg(s, id, { r: 'sistema', text: texto, t, modo: meta.modo }); meta.ultimoMsgT = t; };

    if (b.action === 'leer') {
      if (meta.modo === 'manual') meta = await C.barrido(s, id, r, meta, ahora);
      let cambio = false;
      if (b.abrir) { // abrir un chat: queda en la auditoria (como maximo una vez cada 10 min por persona) y se marca como visto
        meta.viendo = meta.viendo || {}; meta.aperturas = meta.aperturas || {};
        if (ahora - (meta.aperturas[nombre] || 0) > 600000) { meta.aperturas[nombre] = ahora; await C.audit({ quien: nombre, accion: 'abrir_conversacion', convId: id, alias: r.alias }); }
        meta.viendo[nombre] = ahora; cambio = true;
      }
      if ((r.ultimoUsuarioT || 0) > (meta.leidoT || 0) && b.marcarLeido !== false) { meta.leidoT = ahora; cambio = true; }
      if (cambio) await guardarMeta();
      const msgs = await C.leerMsgs(s, id, typeof b.desde === 'string' ? b.desde.slice(0, 40) : '', 200);
      const viendo = Object.entries(meta.viendo || {}).filter(([n, t]) => n !== nombre && ahora - t < 25000).map(([n]) => n);
      let alertas = null;
      if (b.abrir) { try { const al = C.store('alertas'); const { blobs } = await al.list(); const suf = '-' + C.san(r.alias);
        alertas = (await Promise.all(blobs.filter(x => x.key.endsWith(suf)).map(x => C.getJ(al, x.key)))).filter(Boolean).map(a => ({ hora: a.hora, nivel: a.nivel, motivo: a.motivo, estado: a.estado })).sort((p, q) => String(q.hora).localeCompare(String(p.hora))).slice(0, 20); } catch (e) { alertas = []; } }
      return json(200, { fila: fila(id, r, meta), msgs, viendo, notas: meta.notas || [], revisadoPor: meta.revisadoPor || null, ...(alertas ? { alertas } : {}), ahora });
    }
    if (b.action === 'latido') { // mantiene "tomado" y "viendo" vivos
      meta.viendo = meta.viendo || {}; meta.viendo[nombre] = ahora;
      if (meta.tomadoPor && meta.tomadoPor.nombre === nombre) meta.tomadoPor.hb = ahora;
      await guardarMeta(); return json(200, { ok: true });
    }
    if (b.action === 'modo') {
      const nuevo = b.modo; if (!MODOS.includes(nuevo)) return json(400, { error: 'modo' });
      const actual = MODOS.includes(meta.modo) ? meta.modo : 'ia';
      const activo = C.tomadoActivo(meta, ahora), mio = meta.tomadoPor && meta.tomadoPor.nombre === nombre;
      if (actual === 'manual' && activo && !mio) return json(409, { error: 'tomado', por: meta.tomadoPor.nombre }); // un profesional por conversacion
      if (nuevo === 'manual' && activo && !mio) return json(409, { error: 'tomado', por: meta.tomadoPor.nombre });
      if (nuevo === actual) return json(200, { ok: true, fila: fila(id, r, meta) });
      meta.modo = nuevo; meta.ofrecerIA = false;
      if (nuevo === 'manual') { meta.tomadoPor = { nombre, desde: ahora, hb: ahora }; meta.manualDesdeT = ahora; await sistema(`Ahora te escribe una persona del equipo: ${nombre}.`); }
      else { meta.tomadoPor = null; if (actual === 'manual') await sistema('Vuelve el acompañante con IA. Recuerda: es una inteligencia artificial, no una persona.'); }
      await guardarMeta(); await C.audit({ quien: nombre, accion: 'cambio_modo', convId: id, alias: r.alias, detalle: `${actual} -> ${nuevo}` });
      return json(200, { ok: true, fila: fila(id, r, meta) });
    }
    if (b.action === 'enviar') {
      const texto = String(b.texto || '').trim().slice(0, 1000); if (!texto) return json(400, { error: 'vacio' });
      if (meta.modo !== 'manual' || !meta.tomadoPor || meta.tomadoPor.nombre !== nombre) return json(409, { error: 'no_manual' }); // solo escribe quien tiene el chat en Manual
      const t = Date.now(); const m = await C.appendMsg(s, id, { r: 'profesional', text: texto, nombre, t, modo: 'manual' });
      meta.ultimoProfT = t; meta.ultimoMsgT = t; meta.ofrecerIA = false; meta.tomadoPor.hb = t; await guardarMeta();
      await C.audit({ quien: nombre, accion: 'mensaje_enviado', convId: id, alias: r.alias }); // sin el contenido
      return json(200, { ok: true, msg: m });
    }
    if (b.action === 'revisar') { // unica forma de bajar un rojo
      meta.revisadoT = ahora; meta.revisadoPor = nombre; meta.ofrecerIA = false;
      if (b.nota) (meta.notas = meta.notas || []).push({ texto: String(b.nota).slice(0, 500), hora: new Date(ahora).toISOString(), por: nombre });
      await guardarMeta();
      try { const al = C.store('alertas'); const { blobs } = await al.list(); const suf = '-' + C.san(r.alias); for (const x of blobs.filter(x => x.key.endsWith(suf))) { const a = await C.getJ(al, x.key); if (a) { a.estado = 'cerrada'; await al.setJSON(x.key, a); } } } catch (e) { console.error('CERRAR_ALERTAS_FALLO', e.message); }
      await C.audit({ quien: nombre, accion: 'marcado_revisado', convId: id, alias: r.alias });
      return json(200, { ok: true, fila: fila(id, r, meta) });
    }
    if (b.action === 'etiquetas') {
      const lim = (Array.isArray(b.etiquetas) ? b.etiquetas : []).map(t => String(t).replace(/[^\p{L}\p{N} _-]/gu, '').trim().slice(0, 20)).filter(Boolean);
      meta.etiquetas = [...new Set(lim)].slice(0, 6); await guardarMeta();
      await C.audit({ quien: nombre, accion: 'etiquetas', convId: id, alias: r.alias, detalle: meta.etiquetas.join(', ') });
      return json(200, { ok: true, etiquetas: meta.etiquetas });
    }
    if (b.action === 'nota') {
      const texto = String(b.texto || '').trim().slice(0, 500); if (!texto) return json(400, { error: 'vacio' });
      (meta.notas = meta.notas || []).push({ texto, hora: new Date(ahora).toISOString(), por: nombre }); await guardarMeta();
      await C.audit({ quien: nombre, accion: 'nota', convId: id, alias: r.alias });
      return json(200, { ok: true, notas: meta.notas });
    }
    return json(400, { error: 'accion' });
  } catch (e) { console.error('STAFF_FALLO', e.message); return json(500, { error: 'fallo', detalle: String(e.message).slice(0, 200) }); }
};
