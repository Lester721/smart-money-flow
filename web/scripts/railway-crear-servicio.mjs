// Crear el servicio de Railway para LA PALANCA — copiando la configuración de un servicio
// que YA funciona, en vez de inventarla.
//
// POR QUÉ ASÍ. El 2026-08-13 el servicio del cóndor falló dos veces por el prefijo del fichero
// de config (Railway lo busca desde la RAÍZ del repo, no desde el Root Directory). Y en agosto
// cuatro servicios pasaron días muertos vigilando una rama que ya no recibía nada. Los dos
// fallos se ven igual desde fuera: «corrió y no había nada». Aquí no se escribe ningún valor a
// mano: se lee de un servicio sano y se replica.
//
// ⚠️ LA HORA. Los cron existentes son 15:10, 22:00, 22:30 y 23:00 UTC. Dos servicios pidiendo a
// ThetaData a la vez chocan de sesión (HTTP 478 «Invalid session ID») y el segundo se queda sin
// datos sin dar un error visible. Este va a las 23:30, detrás de todos.
//
// Uso:
//   node --env-file=.env.local scripts/railway-crear-palanca.mjs            (sólo mira)
//   node --env-file=.env.local scripts/railway-crear-palanca.mjs --crear    (crea de verdad)
const TOKEN = process.env.RAILWAY_TOKEN;
const API = 'https://backboard.railway.com/graphql/v2';
const CREAR = process.argv.includes('--crear');
const NOMBRE = process.env.SVC || "Forward · La Palanca";
const CONFIG = 'web/railway.palanca.json';   // Railway lo IGNORA (deprecado); se configura por API
const CRON = process.env.PALANCA_CRON || '0 0 * * 2-6';  // 00:00 UTC = 20:00 Nueva York del día anterior
                                        // (martes-sábado UTC = lunes-viernes en Nueva York)
const PROYECTO = 'thriving-creation';
const MODELO = 'Forward · Cóndor 0DTE';  // el servicio sano del que se copia todo

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

// El token de proyecto NO puede con `me { projects }` ni con `repoTriggers`: «Not Authorized».
// Se entra por `projects` y la rama sale del meta del último despliegue.
const Q = `
query {
  projects { edges { node {
    id name
    environments { edges { node { id name } } }
    services { edges { node {
      id name
      serviceInstances { edges { node { id environmentId rootDirectory railwayConfigFile cronSchedule source { repo } } } }
      deployments(first: 1) { edges { node { meta } } }
    } } }
  } } }
}`;

(async () => {
  const d = await gql(Q);
  const P = d.projects.edges.map((e) => e.node).find((p) => p.name === PROYECTO);
  if (!P) throw new Error('no encuentro el proyecto ' + PROYECTO);
  const envs = P.environments.edges.map((e) => e.node);
  const ENV = envs.find((e) => e.name === 'production') || envs[0];
  const servicios = P.services.edges.map((e) => e.node);

  const ya = servicios.find((s) => s.name === NOMBRE);
  if (ya) { console.log('\n  ⚠️ el servicio "' + NOMBRE + '" YA EXISTE (' + ya.id + '). No se crea otro.\n'); return; }

  const modelo = servicios.find((s) => s.name === MODELO);
  if (!modelo) throw new Error('no encuentro el servicio modelo "' + MODELO + '"');
  const mi = modelo.serviceInstances.edges.map((e) => e.node).find((x) => x.environmentId === ENV.id);
  const meta = (modelo.deployments.edges.map((e) => e.node)[0] || {}).meta || {};
  const repo = meta.repo || (meta.repoOwner && meta.repoName ? meta.repoOwner + '/' + meta.repoName : null)
             || (mi && mi.source && mi.source.repo);
  const rama = meta.branch || meta.repoBranch;
  if (!repo || !rama) throw new Error('no pude leer repo/rama del servicio modelo — NO se crea a ciegas');

  // Choque de horarios: avisar si otro servicio corre a la misma hora
  const choque = servicios.filter((s) => {
    const si = s.serviceInstances.edges.map((e) => e.node).find((x) => x.environmentId === ENV.id);
    return si && si.cronSchedule === CRON;
  });

  console.log('\n  proyecto: ' + P.name + '  ·  entorno: ' + ENV.name);
  console.log('\n  ── lo que se va a crear ──');
  console.log('    nombre:  ' + NOMBRE);
  console.log('    repo:    ' + repo + '   rama: ' + rama + '   (copiado de "' + MODELO + '")');
  console.log('    root:    ' + ((mi && mi.rootDirectory) || '/web'));
  console.log('    config:  ' + CONFIG);
  console.log('    cron:    ' + CRON + '   (23:30 UTC = 19:30 Nueva York)');
  console.log('    horarios ya ocupados: ' + servicios.map((s) => {
    const si = s.serviceInstances.edges.map((e) => e.node).find((x) => x.environmentId === ENV.id);
    return si && si.cronSchedule ? s.name.split('·').pop().trim() + ' ' + si.cronSchedule : null;
  }).filter(Boolean).join(' · '));
  if (choque.length) console.log('    ⚠️ CHOCA con: ' + choque.map((s) => s.name).join(', '));

  if (!CREAR) { console.log('\n  (modo mirar. Añade --crear para crearlo de verdad)\n'); return; }
  if (choque.length) throw new Error('hay choque de horario con ' + choque.map((s) => s.name).join(', ') + ' — cambia CRON antes de crear');

  const c = await gql(
    'mutation ($in: ServiceCreateInput!) { serviceCreate(input: $in) { id name } }',
    { in: { projectId: P.id, name: NOMBRE, branch: rama, source: { repo } } });
  const SID = c.serviceCreate.id;
  console.log('\n  ✓ servicio creado: ' + SID);

  await gql(
    'mutation ($sid: String!, $eid: String!, $in: ServiceInstanceUpdateInput!) { serviceInstanceUpdate(serviceId: $sid, environmentId: $eid, input: $in) }',
    { sid: SID, eid: ENV.id, in: { rootDirectory: (mi && mi.rootDirectory) || '/web', railwayConfigFile: CONFIG, cronSchedule: CRON } });
  console.log('  ✓ configurado: root=' + ((mi && mi.rootDirectory) || '/web') + '  config=' + CONFIG + '  cron=' + CRON);

  // variables: se copian las del servicio modelo (incluye la referencia a Redis y la clave de Theta)
  try {
    const V = await gql(
      'query ($pid: String!, $eid: String!, $sid: String!) { variables(projectId: $pid, environmentId: $eid, serviceId: $sid) }',
      { pid: P.id, eid: ENV.id, sid: modelo.id });
    const vars = V.variables || {};
    const nombres = Object.keys(vars);
    for (const k of nombres) {
      await gql('mutation ($in: VariableUpsertInput!) { variableUpsert(input: $in) }',
        { in: { projectId: P.id, environmentId: ENV.id, serviceId: SID, name: k, value: vars[k] } });
    }
    console.log('  ✓ ' + nombres.length + ' variables copiadas: ' + nombres.join(', '));
  } catch (e) {
    console.log('  ⚠️ NO se pudieron copiar las variables: ' + e.message);
    console.log('     Hay que ponerlas a mano en Railway → el servicio → Variables (mira las del cóndor).');
  }
  console.log('\n  LISTO. Comprueba con:  node --env-file=.env.local scripts/railway-ver-ramas.mjs\n');
})().catch((e) => { console.error('\n  ⛔ ' + e.message + '\n'); process.exit(1); });
