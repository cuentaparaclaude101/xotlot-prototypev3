exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: '' };
  let b = {}; try { b = JSON.parse(event.body || '{}'); } catch (e) {}
  const ok = !!process.env.PILOT_ACCESS_CODE && b.codigoPiloto === process.env.PILOT_ACCESS_CODE;
  return { statusCode: ok ? 200 : 401, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ok }) };
};
