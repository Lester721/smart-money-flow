// LANZAR UNA CORRIDA DE UN CRON DE RAILWAY ("Run now") DESDE AQUÍ.
//
// Uso:
//   node --env-file=.env.local scripts/railway-run.mjs --listar
//   node --env-file=.env.local scripts/railway-run.mjs Wheel
//   node --env-file=.env.local scripts/railway-run.mjs Wheel --esperar   (espera a que termine)
//
// POR QUÉ. Hasta el 2026-08-15 cada comprobación dependía de que Lester le diera a "Run now" en
// la web y me pegara una captura. Con esto se lanza y se valida sin que él tenga que estar.
//
// ANTES DE LANZAR comprueba dos cosas y las dice, porque las dos han roto corridas hoy:
//   1. Que el servicio esté DESPLEGADO y no construyendo. Si está construyendo, la corrida usaría
//      la imagen vieja.
//   2. Que el candado de ThetaData esté libre. Sólo hay UNA sesión por cuenta: lanzar dos a la vez
//      hace que la segunda espere media hora o se quede sin correr.

const T = process.env.RAILWAY_TOKEN;
const API = "https://backboard.railway.com/graphql/v2";
const PROYECTO = process.env.RAILWAY_PROYECTO || "thriving-creation";

if (!T) { console.error("Falta RAILWAY_TOKEN en web/.env.local"); process.exit(1); }

const argv = process.argv.slice(2);
const bandera = (n) => argv.includes(n);
const objetivo = argv.find((a) => !a.startsWith("--"));

async function gql(query, variables = {}) {
  const r = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${T}` },
    body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(30_000),
  });
  const j = await r.json();
  if (j.errors?.length) throw new Error(j.errors.map((e) => e.message).join(" · "));
  return j.data;
}

const Q_SERVICIOS = `query {
  projects { edges { node {
    name
    services { edges { node {
      id
      name
      serviceInstances { edges { node { id cronSchedule } } }
      deployments(first: 1) { edges { node { id status createdAt meta } } }
    } } }
  } } }
}`;

async function servicios() {
  const d = await gql(Q_SERVICIOS);
  const out = [];
  for (const { node: p } of d.projects.edges) {
    if (p.name !== PROYECTO) continue;
    for (const { node: s } of p.services.edges) {
      const inst = s.serviceInstances.edges[0]?.node;
      const dep = s.deployments.edges[0]?.node;
      if (!inst?.cronSchedule) continue;              // sólo los cron
      out.push({ nombre: s.name, instancia: inst.id, cron: inst.cronSchedule,
                 estado: dep?.status, commit: (dep?.meta?.commitHash || "").slice(0, 8) });
    }
  }
  return out;
}

/** ¿Hay alguien con la sesión de ThetaData cogida? */
async function candado() {
  if (!process.env.REDIS_URL) return null;
  try {
    const { default: Redis } = await import("ioredis");
    const r = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2 });
    const v = await r.get("lock:theta");
    const ttl = v ? await r.ttl("lock:theta") : 0;
    await r.quit();
    return v ? { quien: v, ttl } : null;
  } catch { return null; }
}

const lista = await servicios();

if (bandera("--listar") || !objetivo) {
  console.log(`CRON DE ${PROYECTO}:\n`);
  for (const s of lista)
    console.log(`  ${s.nombre.padEnd(26)} ${String(s.estado).padEnd(10)} ${s.commit}  cron: ${s.cron}`);
  const c = await candado();
  console.log(c ? `\n🔒 la sesión de ThetaData la tiene "${c.quien}" (${c.ttl}s) — hay algo corriendo`
                : "\n🔓 sesión de ThetaData libre");
  console.log(`\npara lanzar uno:  node --env-file=.env.local scripts/railway-run.mjs "Wheel"`);
  process.exit(0);
}

const s = lista.find((x) => x.nombre.toLowerCase().includes(objetivo.toLowerCase()));
if (!s) { console.error(`No encuentro ningún cron que contenga "${objetivo}". Prueba --listar.`); process.exit(1); }

console.log(`${s.nombre}  ·  despliegue ${s.estado} ${s.commit}`);
if (s.estado !== "SUCCESS") {
  console.error(`✗ NO se lanza: el despliegue está en "${s.estado}". Correría la imagen anterior.`);
  process.exit(1);
}
const c = await candado();
if (c) {
  console.error(`✗ NO se lanza: "${c.quien}" tiene la sesión de ThetaData (quedan ${c.ttl}s).`);
  console.error(`  ThetaData sólo permite UNA. Espera a que termine.`);
  process.exit(1);
}

const res = await gql(
  `mutation($id: String!) { deploymentInstanceExecutionCreate(input: { serviceInstanceId: $id }) }`,
  { id: s.instancia });
console.log(`▶ lanzada. respuesta: ${JSON.stringify(res.deploymentInstanceExecutionCreate)}`);

if (bandera("--esperar")) {
  console.log("  esperando a que coja y suelte el candado…");
  const t0 = Date.now();
  let cogio = false;
  while (Date.now() - t0 < 45 * 60_000) {
    await new Promise((r) => setTimeout(r, 10_000));
    const c2 = await candado();
    if (c2 && !cogio) { cogio = true; console.log(`  🔒 cogió el candado (${c2.quien}) tras ${((Date.now()-t0)/1000).toFixed(0)}s`); }
    if (cogio && !c2) { console.log(`  ✅ terminó tras ${((Date.now()-t0)/60000).toFixed(1)} min`); break; }
  }
  if (!cogio) console.log("  (no llegó a coger el candado: puede que este servicio no use ThetaData)");
}
