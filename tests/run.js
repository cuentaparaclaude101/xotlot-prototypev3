const { pisoRiesgo } = require('../netlify/functions/_lib/risk');
const casos = [
 ['hoy tuve examen de mate y estoy cansado', 0],
 ['JAJAJA me muero de la pena', 2],
 ['me quiero morir', 3],
 ['ya no aguanto mas', 2],
 ['me hacen bullying en la escuela', 1],
 ['Quiero quitarme la vidaaaa', 3]];
let fallos = 0;
for (const [t, esp] of casos) { const { piso } = pisoRiesgo(t); const ok = piso === esp; if (!ok) fallos++; console.log(ok ? 'OK ' : 'FALLA', piso, '(esp', esp + ')', t); }
process.exit(fallos ? 1 : 0);
