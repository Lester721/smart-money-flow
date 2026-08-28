// Qué rama, qué repo y qué fichero de config vigila CADA servicio de Railway.
//
// POR QUÉ. El 2026-08-16 cuatro servicios llevaban días muertos porque vigilaban
// feat/massive-migration, una rama que ya no recibía nada. Desde fuera, «un servicio que no
// despliega» y «un arreglo que no funciona» se ven exactamente igual. Esto lo hace visible
// de un vistazo, sin capturas.
//
// ⚠️ El token de proyecto NO tiene permiso para `me { projects }` ni para `repoTriggers`:
// devuelve «Not Authorized». Entra por `projects` a secas, y la rama viene en el `meta` del
// último despliegue. Comprobado el 2026-08-28.
//
// Uso:  node --env-file=.env.local scripts/railway-ver-ramas.mjs
const TOKEN = process.env.RAILWAY_TOKEN;
const API = 'https://backboard.railway.com/graphql/v2';
if (!TOKEN) { console.error('Falta RAILWAY_TOKEN en web/.env.local'); process.exit(1); }

async function gql(query, variables = {}) {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(45000),
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
        id environmentId rootDirectory railwayConfigFile cronSchedule nextCronRunAt
        source { repo image }
      } } }
      deployments(first: 1) { edges { node { id status createdAt meta } } }
    } } }
  } } }
}`;

(async () => {
  const d = await gql(Q);
  for (const p of d.projects.edges.map((e) => e.node)) {
    const envs = p.environments.edges.map((e) => e.node);
    console.log('\n── ' + p.name + ' ──');
    console.log('   id: ' + p.id + '   ·   entornos: ' + envs.map((e) => e.name + '=' + e.id).join(', '));
    console.log('  ' + 'servicio'.padEnd(24) + 'rama'.padEnd(12) + 'repo'.padEnd(30) + 'config'.padEnd(26) + 'root'.padEnd(7) + 'cron');
    for (const s of p.services.edges.map((e) => e.node)) {
      const si = s.serviceInstances.edges.map((e) => e.node)[0];
      const dep = s.deployments.edges.map((e) => e.node)[0];
      const m = (dep && dep.meta) || {};
      const rama = m.branch || m.repoBranch || '—';
      const repo = m.repo || (m.repoOwner && m.repoName ? m.repoOwner + '/' + m.repoName : null)
                 || (si && si.source && (si.source.repo || si.source.image)) || '—';
      console.log('  ' + s.name.padEnd(24) + String(rama).padEnd(12) + String(repo).padEnd(30) +
        String((si && si.railwayConfigFile) || '—').padEnd(26) +
        String((si && si.rootDirectory) || '—').padEnd(7) +
        String((si && si.cronSchedule) || '—'));
      if (si && si.nextCronRunAt) console.log('  ' + ' '.repeat(24) + '→ próxima corrida: ' + si.nextCronRunAt);
      if (si) console.log('  ' + ' '.repeat(24) + '   serviceId=' + s.id + '  envId=' + si.environmentId);
    }
  }
  console.log('');
})().catch((e) => { console.error('\n  ⛔ ' + e.message + '\n'); process.exit(1); });
