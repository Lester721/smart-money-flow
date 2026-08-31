// Poner REDIS_URL como REFERENCIA (${{Redis.REDIS_URL}}) en vez de copia literal.
//
// POR QUÉ. Lester lo vio en el dibujo de Railway el 2026-08-31: "La Palanca" y "TSLA's Missile"
// no salían conectados a Redis, los otros cinco sí. Esas líneas de puntos SON las referencias de
// variable. Al crear los dos servicios se copiaron las variables del modelo con `variables()`,
// que devuelve los valores YA RESUELTOS — así que se guardó la cadena literal, no la referencia.
//
// Funciona hoy y se rompe el día que Redis cambie de URL (rotación, plan nuevo, redespliegue):
// los cinco con referencia seguirían, y estos dos fallarían EN SILENCIO. Un servicio que no
// escribe se ve igual que un día sin señales.
//
// ⚠️ Para LEER lo que hay guardado de verdad hace falta `unrendered: true`. Sin eso la API
//    devuelve el valor resuelto y una referencia y una copia se ven idénticas.
const TOKEN = process.env.RAILWAY_TOKEN;
const API = 'https://backboard.railway.com/graphql/v2';
const APLICAR = process.argv.includes('--aplicar');
const REF = '${{Redis.REDIS_URL}}';
const ARREGLAR = process.env.SVC ? [process.env.SVC] : ["TSLA's Missile", 'Forward · La Palanca'];
async function g(q, v = {}) {
  const r = await fetch(API, { method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+TOKEN},
    body:JSON.stringify({query:q,variables:v}), signal:AbortSignal.timeout(90000) });
  const j = JSON.parse(await r.text());
  if (j.errors?.length) throw new Error(j.errors.map(e=>e.message).join(' · '));
  return j.data; }
const d = await g('query { projects { edges { node { id name environments { edges { node { id name } } } services { edges { node { id name } } } } } } }');
const P = d.projects.edges.map(e=>e.node).find(p=>p.name==='thriving-creation');
const E = P.environments.edges.map(e=>e.node).find(e=>e.name==='production');
const S = Object.fromEntries(P.services.edges.map(e=>[e.node.name, e.node.id]));
const crudo = async (n) => ((await g(
  'query ($p:String!,$e:String!,$s:String!,$u:Boolean){ variables(projectId:$p,environmentId:$e,serviceId:$s,unrendered:$u) }',
  {p:P.id,e:E.id,s:S[n],u:true})).variables||{});
console.log('');
for (const n of ARREGLAR) {
  const v = (await crudo(n)).REDIS_URL || '(no tiene)';
  console.log('  ' + (v.includes('${{') ? '🔗 ya es referencia' : '📋 copia literal    ') + '  ' + n); }
if (!APLICAR) { console.log('\n  (modo mirar. Añade --aplicar)\n'); process.exit(0); }
for (const n of ARREGLAR)
  await g('mutation ($in: VariableUpsertInput!){ variableUpsert(input:$in) }',
    { in: { projectId:P.id, environmentId:E.id, serviceId:S[n], name:'REDIS_URL', value:REF } });
console.log('\n  ── COMPROBADO leyendo de vuelta (unrendered) ──');
let ok = true;
for (const n of ARREGLAR) {
  const v = (await crudo(n)).REDIS_URL || '';
  const bien = v === REF; if (!bien) ok = false;
  console.log('    ' + (bien?'✓':'⛔') + ' ' + n.padEnd(24) + v); }
console.log('');
console.log(ok ? '  ✅ los dos apuntan al servicio Redis por referencia' : '  ⛔ alguno no quedó puesto');
console.log('');
