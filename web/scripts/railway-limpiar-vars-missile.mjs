// Quitar del servicio TSLA's Missile las variables RAILWAY_* que se copiaron por error del
// servicio del cóndor.
//
// ⚠️ POR QUÉ IMPORTA. Railway INYECTA solo RAILWAY_SERVICE_NAME, RAILWAY_SERVICE_ID, etc. con
// el valor del servicio que corre. Si se copian a mano las del cóndor, el Missile se firmaría
// como «railway:Forward · Cóndor 0DTE» en el latido y en el campo `origen` de cada operación —
// que es EXACTAMENTE el campo que existe para saber quién escribió qué. Un forward-test que no
// distingue quién escribió no se puede auditar. Ver lib/origenEjecucion.ts.
//
// Uso:  node --env-file=.env.local scripts/railway-limpiar-vars-missile.mjs
//       node --env-file=.env.local scripts/railway-limpiar-vars-missile.mjs --aplicar
const TOKEN = process.env.RAILWAY_TOKEN;
const API = 'https://backboard.railway.com/graphql/v2';
const APLICAR = process.argv.includes('--aplicar');
const NOMBRE = "TSLA's Missile";
const PROYECTO = 'thriving-creation';
// Se quita todo lo que empiece por RAILWAY_: son variables que el contenedor inyecta solo.
const FUERA = (k) => k.startsWith('RAILWAY_');

if (!TOKEN) { console.error('Falta RAILWAY_TOKEN en web/.env.local'); process.exit(1); }

async function gql(query, variables = {}) {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(60000),
  });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { throw new Error('respuesta no-JSON (HTTP ' + r.status + '): ' + t.slice(0, 300)); }
  if (j.errors && j.errors.length) throw new Error(j.errors.map((e) => e.message).join(' · '));
  return j.data;
}

const Q = `
query {
  projects { edges { node {
    id name
    environments { edges { node { id name } } }
    services { edges { node { id name } } }
  } } }
}`;

(async () => {
  const d = await gql(Q);
  const P = d.projects.edges.map((e) => e.node).find((p) => p.name === PROYECTO);
  const envs = P.environments.edges.map((e) => e.node);
  const ENV = envs.find((e) => e.name === 'production') || envs[0];
  const S = P.services.edges.map((e) => e.node).find((x) => x.name === NOMBRE);
  if (!S) throw new Error('no encuentro el servicio "' + NOMBRE + '"');

  const V = await gql(
    'query ($pid: String!, $eid: String!, $sid: String!) { variables(projectId: $pid, environmentId: $eid, serviceId: $sid) }',
    { pid: P.id, eid: ENV.id, sid: S.id });
  const vars = V.variables || {};
  const todas = Object.keys(vars).sort();
  const quitar = todas.filter(FUERA);
  const quedan = todas.filter((k) => !FUERA(k));

  console.log('\n  servicio: ' + NOMBRE + '  (' + S.id + ')');
  console.log('\n  SE QUEDAN (' + quedan.length + '): ' + (quedan.join(', ') || '—'));
  console.log('  SE QUITAN (' + quitar.length + '): ' + (quitar.join(', ') || '—'));
  console.log('\n  (las RAILWAY_* las vuelve a inyectar Railway sola, con el valor de ESTE servicio)');

  if (!APLICAR) { console.log('\n  (modo mirar. Añade --aplicar para borrarlas)\n'); return; }
  if (!quitar.length) { console.log('\n  nada que quitar.\n'); return; }

  for (const k of quitar)
    await gql('mutation ($in: VariableDeleteInput!) { variableDelete(input: $in) }',
      { in: { projectId: P.id, environmentId: ENV.id, serviceId: S.id, name: k } });
  console.log('\n  ✓ ' + quitar.length + ' variables borradas');

  // comprobar de verdad, no fiarse de que la mutación no fallara
  const V2 = await gql(
    'query ($pid: String!, $eid: String!, $sid: String!) { variables(projectId: $pid, environmentId: $eid, serviceId: $sid) }',
    { pid: P.id, eid: ENV.id, sid: S.id });
  const restan = Object.keys(V2.variables || {}).sort();
  const malas = restan.filter(FUERA);
  console.log('  quedan ahora: ' + (restan.join(', ') || '—'));
  console.log(malas.length ? '\n  ⚠️ TODAVÍA hay RAILWAY_* puestas a mano: ' + malas.join(', ') + '\n'
                           : '\n  LIMPIO. El Missile se firmará con su propio nombre.\n');
})().catch((e) => { console.error('\n  ⛔ ' + e.message + '\n'); process.exit(1); });
