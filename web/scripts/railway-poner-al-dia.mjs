// PONER TODOS LOS SERVICIOS DE RAILWAY AL DÍA — y dejarlos siguiendo main para siempre.
//
// ═══ EL FALLO QUE ARREGLA (2026-08-19) ═══════════════════════════════════════════════════════
//
// Ideas, Wheel y Credit Spread llevaban desde el 16 de agosto sin actualizarse mientras el Cóndor
// iba al día. No fallaban: Railway NO LES DESPLEGABA. Cada arreglo que se empujaba no les llegaba,
// y desde fuera eso se ve EXACTAMENTE igual que "el arreglo no funcionó" — se perdieron horas
// buscando bugs en código que ni siquiera estaba desplegado.
//
// No eran los `watchPatterns` (están vacíos en todos: comprobado). Es el AUTO-DEPLOY del servicio,
// que se apaga por servicio y no se ve en la pantalla de despliegues.
//
// ═══ POR QUÉ ESTE FICHERO EXISTE ═════════════════════════════════════════════════════════════
//
// Le pedí a Lester que entrara en la interfaz a tocar variables y a darle a Redeploy, dando por
// hecho que yo no tenía permisos — porque UNA consulta devolvió "Not Authorized". La consulta
// estaba mal escrita (la raíz buena es `projects`, no `me { workspaces }`). Sí tenía permisos.
//
// ORDEN PERMANENTE DE LESTER: comprobar SIEMPRE si puedo hacerlo yo antes de pedírselo.
//
// Uso:
//   node --env-file=.env.local scripts/railway-poner-al-dia.mjs            (mirar)
//   node --env-file=.env.local scripts/railway-poner-al-dia.mjs --aplicar  (arreglar)

import { execSync } from "node:child_process";

const TOKEN = process.env.RAILWAY_TOKEN;
const API = "https://backboard.railway.com/graphql/v2";
const PROYECTO = process.env.RAILWAY_PROYECTO || "thriving-creation";
const APLICAR = process.argv.includes("--aplicar");
if (!TOKEN) { console.error("Falta RAILWAY_TOKEN en web/.env.local"); process.exit(1); }

async function gql(query, variables = {}) {
  const r = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(60_000),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors.map((e) => e.message)).slice(0, 300));
  return j.data;
}

// EL COMMIT AL QUE HAY QUE LLEGAR: el de origin/main, no el local. Si lo local no está empujado,
// desplegar "lo último" no despliega lo que uno cree. Ver [push-a-la-rama-equivocada] en memoria.
execSync("git fetch -q origin", { cwd: process.cwd() });
const SHA = execSync("git rev-parse origin/main").toString().trim();
const ASUNTO = execSync("git log -1 --format=%s origin/main").toString().trim();
console.log(`\nobjetivo: ${SHA.slice(0, 8)} — ${ASUNTO}\n`);

const d = await gql(`query {
  projects { edges { node { id name
    services { edges { node { id name
      serviceInstances { edges { node { serviceId environmentId cronSchedule } } }
      deployments(first: 1) { edges { node { status meta } } }
    } } }
  } } }
}`);

const servicios = [];
for (const p of d.projects.edges) {
  if (p.node.name !== PROYECTO) continue;
  for (const s of p.node.services.edges) {
    const i = s.node.serviceInstances.edges[0]?.node;
    if (!i) continue;
    if (!/^(Redis|Postgres|MySQL|Mongo)/i.test(s.node.name)) { /* servicios de código */ } else continue;
    const dep = s.node.deployments.edges[0]?.node;
    const desplegado = dep?.meta?.commitHash ?? dep?.meta?.commit ?? null;
    servicios.push({ nombre: s.node.name, serviceId: i.serviceId, environmentId: i.environmentId,
                     projectId: p.node.id, cron: i.cronSchedule, estado: dep?.status ?? "?",
                     sha: desplegado, alDia: desplegado ? desplegado.startsWith(SHA.slice(0, 8)) : false });
  }
}

console.log("| servicio | estado | commit desplegado | ¿al día? |");
console.log("|---|---|---|---|");
for (const s of servicios)
  console.log(`| ${s.nombre} | ${s.estado} | ${s.sha ? s.sha.slice(0, 8) : "—"} | ${s.alDia ? "✅" : "❌"} |`);

if (!APLICAR) { console.log(`\n(para arreglarlo: --aplicar)`); process.exit(0); }

// ── 1 · AUTO-DEPLOY ENCENDIDO, para que esto no vuelva a pasar ──────────────
console.log(`\n── 1/2 · encendiendo el auto-deploy ──`);
for (const s of servicios) {
  try {
    await gql(
      `mutation($input: ServiceInstanceAutoDeployUpdateInput!) { serviceInstanceAutoDeployUpdate(input: $input) { enabled } }`,
      { input: { enabled: true, serviceId: s.serviceId, environmentId: s.environmentId, projectId: s.projectId } },
    );
    console.log(`   ✓ ${s.nombre}`);
  } catch (e) { console.log(`   ✗ ${s.nombre}: ${e.message}`); }
}

// ── 2 · DESPLEGAR EL COMMIT DE main, no "lo que ya tenían" ──────────────────
// serviceInstanceDeployV2 redespliega la fuente actual del servicio: por eso Ideas volvía al
// commit del 15 de agosto. La que sirve es serviceInstanceDeploy CON commitSha.
console.log(`\n── 2/2 · desplegando ${SHA.slice(0, 8)} ──`);
for (const s of servicios) {
  if (s.alDia) { console.log(`   · ${s.nombre}: ya estaba al día`); continue; }
  try {
    await gql(
      `mutation($serviceId: String!, $environmentId: String!, $commitSha: String!) {
         serviceInstanceDeploy(serviceId: $serviceId, environmentId: $environmentId, commitSha: $commitSha) }`,
      { serviceId: s.serviceId, environmentId: s.environmentId, commitSha: SHA },
    );
    console.log(`   ✓ ${s.nombre}`);
  } catch (e) { console.log(`   ✗ ${s.nombre}: ${e.message}`); }
}
console.log(`\nComprobar en un par de minutos con: node --env-file=.env.local scripts/railway-run.mjs --listar`);
