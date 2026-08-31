// Copiar las variables del servicio modelo al de LA PALANCA.
// El paso venía DESPUÉS del que falló al crear el servicio (railwayConfigFile deprecado), así
// que nunca llegó a ejecutarse. Sin variables el servicio arranca y muere sin datos, que es
// indistinguible desde fuera de «no había señales».
const TOKEN = process.env.RAILWAY_TOKEN;
const API = 'https://backboard.railway.com/graphql/v2';
const APLICAR = process.argv.includes('--aplicar');
const MODELO = 'Forward · Cóndor 0DTE', NOMBRE = 'Forward · La Palanca';
async function gql(q, v = {}) {
  const r = await fetch(API, { method:'POST',
    headers:{'Content-Type':'application/json',Authorization:'Bearer '+TOKEN},
    body:JSON.stringify({query:q,variables:v}), signal:AbortSignal.timeout(60000) });
  const t = await r.text(); let j;
  try { j = JSON.parse(t); } catch { throw new Error('no-JSON: '+t.slice(0,200)); }
  if (j.errors?.length) throw new Error(j.errors.map(e=>e.message).join(' · '));
  return j.data; }
const d = await gql(`query { projects { edges { node { id name
  environments { edges { node { id name } } }
  services { edges { node { id name } } } } } } }`);
const P = d.projects.edges.map(e=>e.node).find(p=>p.name==='thriving-creation');
const ENV = P.environments.edges.map(e=>e.node).find(e=>e.name==='production');
const mod = P.services.edges.map(e=>e.node).find(s=>s.name===MODELO);
const yo  = P.services.edges.map(e=>e.node).find(s=>s.name===NOMBRE);
const V = await gql('query ($p:String!,$e:String!,$s:String!){ variables(projectId:$p,environmentId:$e,serviceId:$s) }',
  {p:P.id,e:ENV.id,s:mod.id});
const M = await gql('query ($p:String!,$e:String!,$s:String!){ variables(projectId:$p,environmentId:$e,serviceId:$s) }',
  {p:P.id,e:ENV.id,s:yo.id});
const src = V.variables||{}, mias = M.variables||{};
console.log('');
console.log('  modelo "'+MODELO+'": '+Object.keys(src).length+' variables → '+Object.keys(src).join(', '));
console.log('  "'+NOMBRE+'" ahora: '+Object.keys(mias).length+' → '+(Object.keys(mias).join(', ')||'(ninguna)'));
if (!APLICAR) { console.log('\n  (modo mirar. Añade --aplicar)\n'); process.exit(0); }
for (const k of Object.keys(src))
  await gql('mutation ($in: VariableUpsertInput!){ variableUpsert(input:$in) }',
    {in:{projectId:P.id,environmentId:ENV.id,serviceId:yo.id,name:k,value:src[k]}});
const M2 = await gql('query ($p:String!,$e:String!,$s:String!){ variables(projectId:$p,environmentId:$e,serviceId:$s) }',
  {p:P.id,e:ENV.id,s:yo.id});
const fin = M2.variables||{};
console.log('');
console.log('  ── COMPROBADO leyendo de vuelta ──');
let ok=true;
for (const k of Object.keys(src)) { const bien = fin[k] === src[k];
  if(!bien) ok=false;
  console.log('    '+(bien?'✓':'⛔')+' '+k); }
console.log('');
console.log(ok?'  ✅ variables puestas':'  ⛔ falta alguna');
console.log('');
