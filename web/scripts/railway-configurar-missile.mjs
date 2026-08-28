// Terminar de configurar el servicio TSLA's Missile.
//
// ⚠️ POR QUÉ NO SE USA railway.missile.json. Railway DEPRECÓ «Config as Code»: al intentar poner
// `railwayConfigFile` responde «Config as Code (railway.json / railway.toml) is deprecated».
// Los servicios viejos (cóndor, wheel, ideas…) siguen funcionando con su fichero porque se
// configuraron antes — a esos NO se les toca. El nuevo lleva los ajustes puestos directamente.
// Descubierto el 2026-08-28, con el servicio ya creado y a medio configurar.
//
// Uso:  node --env-file=.env.local scripts/railway-configurar-missile.mjs
//       node --env-file=.env.local scripts/railway-configurar-missile.mjs --aplicar
const TOKEN = process.env.RAILWAY_TOKEN;
const API = 'https://backboard.railway.com/graphql/v2';
const APLICAR = process.argv.includes('--aplicar');
const NOMBRE = "TSLA's Missile";
const PROYECTO = 'thriving-creation';
const MODELO = 'Forward · Cóndor 0DTE';

const AJUSTES = {
  rootDirectory: '/web',
  buildCommand: 'sh scripts/preparar-jar-theta.sh',
  startCommand: 'sh -c "node scripts/with-theta.mjs npm run missile"',
  cronSchedule: '30 23 * * 1-5',
  restartPolicyType: 'NEVER',
};

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
    services { edges { node {
      id name
      serviceInstances { edges { node {
        id environmentId rootDirectory buildCommand startCommand cronSchedule restartPolicyType
        railwayConfigFile source { repo }
      } } }
    } } }
  } } }
}`;

(async () => {
  const d = await gql(Q);
  const P = d.projects.edges.map((e) => e.node).find((p) => p.name === PROYECTO);
  const envs = P.environments.edges.map((e) => e.node);
  const ENV = envs.find((e) => e.name === 'production') || envs[0];
  const servicios = P.services.edges.map((e) => e.node);
  const S = servicios.find((x) => x.name === NOMBRE);
  if (!S) throw new Error('no encuentro el servicio "' + NOMBRE + '"');
  const si = S.serviceInstances.edges.map((e) => e.node).find((x) => x.environmentId === ENV.id);

  console.log('\n  servicio: ' + NOMBRE + '  (' + S.id + ')');
  console.log('  repo: ' + ((si && si.source && si.source.repo) || '—'));
  console.log('\n  ' + 'ajuste'.padEnd(20) + 'ahora'.padEnd(46) + 'debe quedar');
  for (const k of Object.keys(AJUSTES))
    console.log('  ' + k.padEnd(20) + String((si && si[k]) || '—').slice(0, 44).padEnd(46) + AJUSTES[k]);

  if (!APLICAR) { console.log('\n  (modo mirar. Añade --aplicar para escribirlo)\n'); return; }

  await gql(
    'mutation ($sid: String!, $eid: String!, $in: ServiceInstanceUpdateInput!) { serviceInstanceUpdate(serviceId: $sid, environmentId: $eid, input: $in) }',
    { sid: S.id, eid: ENV.id, in: AJUSTES });
  console.log('\n  ✓ ajustes escritos');

  // variables del servicio modelo (referencia a Redis + clave de Theta)
  const modelo = servicios.find((x) => x.name === MODELO);
  try {
    const V = await gql(
      'query ($pid: String!, $eid: String!, $sid: String!) { variables(projectId: $pid, environmentId: $eid, serviceId: $sid) }',
      { pid: P.id, eid: ENV.id, sid: modelo.id });
    const vars = V.variables || {};
    const nombres = Object.keys(vars);
    for (const k of nombres)
      await gql('mutation ($in: VariableUpsertInput!) { variableUpsert(input: $in) }',
        { in: { projectId: P.id, environmentId: ENV.id, serviceId: S.id, name: k, value: vars[k] } });
    console.log('  ✓ ' + nombres.length + ' variables copiadas de "' + MODELO + '": ' + nombres.join(', '));
  } catch (e) {
    console.log('  ⚠️ variables NO copiadas: ' + e.message);
  }

  // comprobar que quedó puesto, en vez de fiarse de que la mutación no diera error
  const d2 = await gql(Q);
  const P2 = d2.projects.edges.map((e) => e.node).find((p) => p.name === PROYECTO);
  const S2 = P2.services.edges.map((e) => e.node).find((x) => x.name === NOMBRE);
  const si2 = S2.serviceInstances.edges.map((e) => e.node).find((x) => x.environmentId === ENV.id);
  console.log('\n  ── comprobación ──');
  let mal = 0;
  for (const k of Object.keys(AJUSTES)) {
    const ok = String((si2 && si2[k]) || '') === String(AJUSTES[k]);
    if (!ok) mal++;
    console.log('  ' + (ok ? '✓' : '⚠') + ' ' + k.padEnd(20) + String((si2 && si2[k]) || '—'));
  }
  console.log(mal === 0 ? '\n  TODO PUESTO.\n' : '\n  ⚠️ ' + mal + ' ajuste(s) NO quedaron. Hay que ponerlos a mano en Railway.\n');
})().catch((e) => { console.error('\n  ⛔ ' + e.message + '\n'); process.exit(1); });
