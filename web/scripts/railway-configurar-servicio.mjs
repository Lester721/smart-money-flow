// Configurar el servicio de LA PALANCA en Railway SIN fichero de config.
//
// POR QUÉ. Al crearlo (2026-08-31) Railway rechazó `railwayConfigFile`:
//   «Config as Code (railway.json / railway.toml) is deprecated. Use Infrastructure as Code
//    (.railway/railway.ts) instead.»
// Los servicios viejos siguen funcionando con su railway.*.json, pero uno NUEVO ya no lo admite.
// Así que los tres valores que traía `railway.palanca.json` se ponen a mano en la instancia:
// raíz, comando de construcción, comando de arranque y política de reinicio.
//
// ⚠️ Se COMPRUEBA leyendo de vuelta. Un servicio mal configurado y uno que falla se ven igual
//    desde fuera: «corrió y no había nada».
const TOKEN = process.env.RAILWAY_TOKEN;
const API = 'https://backboard.railway.com/graphql/v2';
const NOMBRE = process.env.SVC || 'Forward · La Palanca';
const APLICAR = process.argv.includes('--aplicar');
if (!TOKEN) { console.error('Falta RAILWAY_TOKEN'); process.exit(1); }

async function gql(query, variables = {}) {
  const r = await fetch(API, { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
    body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(60000) });
  const t = await r.text(); let j;
  try { j = JSON.parse(t); } catch { throw new Error('no-JSON (HTTP ' + r.status + '): ' + t.slice(0,300)); }
  if (j.errors?.length) throw new Error(j.errors.map(e => e.message).join(' · '));
  return j.data; }

const Q = `query { projects { edges { node { id name
  environments { edges { node { id name } } }
  services { edges { node { id name
    serviceInstances { edges { node { id environmentId rootDirectory cronSchedule
      startCommand buildCommand restartPolicyType source { repo } } } } } } } } } } }`;

const d = await gql(Q);
const proy = d.projects.edges.map(e => e.node).find(p => p.name === 'thriving-creation');
if (!proy) { console.error('no encuentro el proyecto thriving-creation'); process.exit(1); }
const ENV = proy.environments.edges.map(e => e.node).find(e => e.name === 'production');
const svc = proy.services.edges.map(e => e.node).find(s => s.name === NOMBRE);
if (!svc) { console.error('no encuentro el servicio "' + NOMBRE + '"'); process.exit(1); }
const mi = proy.services.edges.map(e => e.node).find(s => s.name === 'Forward · Cóndor 0DTE')
  ?.serviceInstances.edges.map(e => e.node).find(i => i.environmentId === ENV.id);
const yo = svc.serviceInstances.edges.map(e => e.node).find(i => i.environmentId === ENV.id);

const QUIERO = {
  rootDirectory: mi?.rootDirectory || '/web',
  buildCommand: 'sh scripts/preparar-jar-theta.sh',
  startCommand: process.env.CMD || 'npm run palanca:theta',
  cronSchedule: process.env.CRON || '0 0 * * 2-6',
  restartPolicyType: 'NEVER',
};
console.log('');
console.log('  servicio: ' + svc.name + '  (' + svc.id + ')');
console.log('  AHORA:');
for (const k of Object.keys(QUIERO)) console.log('    ' + k.padEnd(18) + (yo?.[k] ?? '(vacío)'));
console.log('  QUEDARÁ:');
for (const [k, v] of Object.entries(QUIERO)) console.log('    ' + k.padEnd(18) + v);

if (!APLICAR) { console.log('\n  (modo mirar. Añade --aplicar)\n'); process.exit(0); }

await gql('mutation ($sid: String!, $eid: String!, $in: ServiceInstanceUpdateInput!) { serviceInstanceUpdate(serviceId: $sid, environmentId: $eid, input: $in) }',
  { sid: svc.id, eid: ENV.id, in: QUIERO });

// ── LEER DE VUELTA: sin esto no se sabe si de verdad quedó puesto ──
const d2 = await gql(Q);
const yo2 = d2.projects.edges.map(e => e.node).find(p => p.name === 'thriving-creation')
  .services.edges.map(e => e.node).find(s => s.name === NOMBRE)
  .serviceInstances.edges.map(e => e.node).find(i => i.environmentId === ENV.id);
console.log('');
console.log('  ── COMPROBADO leyendo de vuelta ──');
let ok = true;
for (const [k, v] of Object.entries(QUIERO)) {
  const bien = String(yo2?.[k]) === String(v);
  if (!bien) ok = false;
  console.log('    ' + (bien ? '✓' : '⛔') + ' ' + k.padEnd(18) + (yo2?.[k] ?? '(vacío)')); }
console.log('    repo: ' + (yo2?.source?.repo || '(sin repo)'));
console.log('');
console.log(ok ? '  ✅ el servicio queda configurado' : '  ⛔ algo NO quedó puesto — revisar');
console.log('');
