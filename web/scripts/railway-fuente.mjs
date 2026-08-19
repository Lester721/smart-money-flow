// VER Y ARREGLAR POR QUÉ UN SERVICIO NO RECOGE LOS PUSH — sin capturas y sin pedirle nada a nadie.
//
// ═══ EL FALLO QUE LO MOTIVA (2026-08-19) ═════════════════════════════════════════════════════
//
// Ideas, Wheel y Credit Spread llevaban desde el 16 de agosto sin actualizarse mientras el Cóndor
// iba al día. No fallaban: Railway SE SALTABA sus despliegues (en el historial salen como
// "Skipped"/"REMOVED"). La causa candidata son los `watchPatterns`: un filtro que dice "sólo
// reconstruye si cambian estos ficheros". Si el filtro no cubre lo que se toca, cada push se
// ignora EN SILENCIO — y desde fuera se ve igual que "el arreglo no funcionó".
//
// ═══ POR QUÉ ESTE FICHERO ════════════════════════════════════════════════════════════════════
//
// Di por hecho que no tenía permisos para esto porque una consulta devolvió "Not Authorized".
// La consulta estaba MAL: la raíz buena es `projects`, no `me { workspaces }`. Antes de decirle
// a Lester "esto lo tienes que hacer tú", hay que INTENTARLO.
//
// Uso:
//   node --env-file=.env.local scripts/railway-fuente.mjs                    (sólo mirar)
//   node --env-file=.env.local scripts/railway-fuente.mjs --limpiar          (vaciar watchPatterns)
//   node --env-file=.env.local scripts/railway-fuente.mjs --desplegar        (desplegar main)

const TOKEN = process.env.RAILWAY_TOKEN;
const API = "https://backboard.railway.com/graphql/v2";
if (!TOKEN) { console.error("Falta RAILWAY_TOKEN en web/.env.local"); process.exit(1); }

async function gql(query, variables = {}) {
  const r = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(60_000),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors.map((e) => e.message)).slice(0, 400));
  return j.data;
}

const LIMPIAR = process.argv.includes("--limpiar");
const DESPLEGAR = process.argv.includes("--desplegar");

const d = await gql(`query {
  projects { edges { node { id name
    services { edges { node { id name
      serviceInstances { edges { node {
        id serviceId environmentId watchPatterns rootDirectory buildCommand startCommand cronSchedule
      } } }
    } } }
  } } }
}`);

const objetivo = [];
for (const p of d.projects.edges) {
  if (p.node.name !== "thriving-creation") continue;
  console.log(`\n══ ${p.node.name} ══\n`);
  for (const s of p.node.services.edges) {
    const i = s.node.serviceInstances.edges[0]?.node;
    if (!i) continue;
    const wp = i.watchPatterns ?? [];
    console.log(`  ${s.node.name}`);
    console.log(`     watchPatterns: ${wp.length ? JSON.stringify(wp) : "(vacío → sigue todos los push)"}`);
    console.log(`     raíz:          ${i.rootDirectory ?? "/"}`);
    console.log(`     build:         ${i.buildCommand ?? "(del repo)"}`);
    if (i.cronSchedule) console.log(`     cron:          ${i.cronSchedule}`);
    console.log("");
    if (wp.length) objetivo.push({ nombre: s.node.name, serviceId: i.serviceId, environmentId: i.environmentId, wp });
  }
}

if (!objetivo.length) {
  console.log("Ningún servicio tiene watchPatterns puestos. La causa del salto es OTRA.");
} else {
  console.log(`\n${objetivo.length} servicio(s) con filtro de ficheros — ese filtro es lo que se salta los push:\n`);
  for (const o of objetivo) console.log(`   · ${o.nombre}: ${JSON.stringify(o.wp)}`);
  if (!LIMPIAR) console.log(`\n   (para vaciarlos: añade --limpiar)`);
}

if (LIMPIAR && objetivo.length) {
  console.log(`\n── vaciando ──`);
  for (const o of objetivo) {
    try {
      await gql(
        `mutation($serviceId: String!, $environmentId: String!, $input: ServiceInstanceUpdateInput!) {
           serviceInstanceUpdate(serviceId: $serviceId, environmentId: $environmentId, input: $input) }`,
        { serviceId: o.serviceId, environmentId: o.environmentId, input: { watchPatterns: [] } },
      );
      console.log(`   ✓ ${o.nombre}`);
    } catch (e) { console.log(`   ✗ ${o.nombre}: ${e.message}`); }
  }
}

if (DESPLEGAR) {
  console.log(`\n── desplegando main ──`);
  for (const p of d.projects.edges) {
    if (p.node.name !== "thriving-creation") continue;
    for (const s of p.node.services.edges) {
      const i = s.node.serviceInstances.edges[0]?.node;
      if (!i || !i.cronSchedule) continue;                 // sólo los cron
      try {
        await gql(
          `mutation($serviceId: String!, $environmentId: String!) {
             serviceInstanceDeployV2(serviceId: $serviceId, environmentId: $environmentId) }`,
          { serviceId: i.serviceId, environmentId: i.environmentId },
        );
        console.log(`   ✓ ${s.node.name}`);
      } catch (e) { console.log(`   ✗ ${s.node.name}: ${e.message}`); }
    }
  }
}
