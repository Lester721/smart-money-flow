// VER RAILWAY SIN CAPTURAS DE PANTALLA.
//
// Uso:
//   node --env-file=.env.local scripts/railway-api.mjs                 estado de todos los servicios
//   node --env-file=.env.local scripts/railway-api.mjs --logs Wheel    los logs del último despliegue
//   node --env-file=.env.local scripts/railway-api.mjs --logs Wheel --lineas 60
//
// POR QUÉ EXISTE. El 2026-08-15 se fue la mañana entera en un fallo de build que estaba escrito
// en la primera línea del log — dos Java en conflicto. No lo vi porque dependía de que Lester
// fuera pegando capturas una a una, y con una captura sólo se ve un trozo. Con esto se lee el
// log entero de una, y además se puede mirar cuando él no está delante.
//
// EL TOKEN: se saca en Railway → (arriba a la derecha) Account Settings → Tokens → Create Token.
// Elige el workspace del proyecto. Se pega en web/.env.local, en la línea RAILWAY_TOKEN=
// que ya está puesta ahí esperando. NO se pega en el chat y NO va al repositorio: .env.local
// está en .gitignore.

const TOKEN = process.env.RAILWAY_TOKEN;
const API = "https://backboard.railway.com/graphql/v2";

if (!TOKEN) {
  console.error("Falta RAILWAY_TOKEN en web/.env.local.");
  console.error("Railway → Account Settings → Tokens → Create Token, y pégalo en la línea");
  console.error("RAILWAY_TOKEN= que ya está en el fichero.");
  process.exit(1);
}

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const LINEAS = Number(arg("--lineas") || 40);

async function gql(query, variables = {}) {
  const r = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30_000),
  });
  const t = await r.text();
  let j; try { j = JSON.parse(t); } catch { throw new Error(`respuesta no-JSON (HTTP ${r.status}): ${t.slice(0, 200)}`); }
  if (j.errors?.length) throw new Error(j.errors.map((e) => e.message).join(" · "));
  return j.data;
}

const ahoraET = () => new Date().toLocaleString("sv-SE", { timeZone: "America/New_York" }).slice(0, 16);
const haceCuanto = (iso) => {
  const h = (Date.now() - Date.parse(iso)) / 3_600_000;
  return h < 1 ? `hace ${Math.round(h * 60)} min` : h < 48 ? `hace ${h.toFixed(1)} h` : `hace ${(h / 24).toFixed(0)} días`;
};

/** Todos los proyectos a los que llega el token, con sus servicios y el despliegue de cada uno. */
// OJO: es `projects` a pelo, NO `me { projects }`. Con el token de workspace, `me` devuelve
// "Not Authorized" mientras que `projects` funciona — comprobado el 2026-08-15 probando las ocho
// combinaciones de endpoint/cabecera/consulta en diag-railway-token.mjs.
const Q_ESTADO = `
query {
  projects { edges { node {
    id name
    services { edges { node {
      id name
      deployments(first: 1) { edges { node {
        id status createdAt
        meta
      } } }
    } } }
  } } }
}`;

const Q_LOGS = `
query($id: String!, $limit: Int!) {
  buildLogs(deploymentId: $id, limit: $limit) { message timestamp severity }
  deploymentLogs(deploymentId: $id, limit: $limit) { message timestamp severity }
}`;

const ESTADOS = {
  SUCCESS: "✅ ACTIVO", DEPLOYING: "⏳ desplegando", BUILDING: "⏳ construyendo",
  FAILED: "❌ FALLÓ", CRASHED: "❌ SE CAYÓ", REMOVED: "· retirado", INITIALIZING: "⏳ arrancando",
};

async function estado() {
  const d = await gql(Q_ESTADO);
  console.log(`RAILWAY · ${ahoraET()} (hora de Nueva York)\n`);
  for (const { node: p } of d.projects.edges) {
    console.log(`── ${p.name} ${"─".repeat(Math.max(0, 60 - p.name.length))}`);
    for (const { node: s } of p.services.edges) {
      const dep = s.deployments.edges[0]?.node;
      if (!dep) { console.log(`  ${s.name.padEnd(26)} (sin despliegues)`); continue; }
      const m = dep.meta || {};
      const commit = (m.commitHash || "").slice(0, 8) || "?";
      const msg = String(m.commitMessage || "").split("\n")[0].slice(0, 52);
      console.log(`  ${s.name.padEnd(26)} ${(ESTADOS[dep.status] || dep.status).padEnd(16)} ` +
                  `${commit}  ${haceCuanto(dep.createdAt)}`);
      if (msg) console.log(`  ${" ".repeat(26)} "${msg}"`);
      if (dep.status === "FAILED" || dep.status === "CRASHED")
        console.log(`  ${" ".repeat(26)} → ver el log:  --logs "${s.name}"`);
    }
    console.log("");
  }
}

async function logs(nombreServicio) {
  const d = await gql(Q_ESTADO);
  // SE RECOGEN TODAS LAS COINCIDENCIAS, NO LA ÚLTIMA. El bucle original reasignaba sin `break` y
  // ganaba la última de CUALQUIER proyecto — y hay TRES servicios llamados "smart-money-flow" en
  // proyectos distintos. Pedir el log de uno y recibir el de otro, sin ninguna señal, es
  // exactamente el fallo silencioso que este script viene a eliminar.
  const casan = [];
  for (const { node: p } of d.projects.edges)
    for (const { node: s } of p.services.edges)
      if (s.name.toLowerCase().includes(nombreServicio.toLowerCase())) casan.push({ proyecto: p.name, s });

  if (!casan.length) { console.error(`No encuentro ningún servicio que contenga "${nombreServicio}".`); process.exit(1); }
  if (casan.length > 1) {
    console.error(`"${nombreServicio}" casa con ${casan.length} servicios. Sé más específico:`);
    for (const c of casan) console.error(`   ${c.proyecto} · ${c.s.name}`);
    process.exit(1);
  }
  const { proyecto, s: encontrado } = casan[0];
  const dep = encontrado.deployments.edges[0]?.node;
  if (!dep) { console.error(`"${encontrado.name}" no tiene despliegues.`); process.exit(1); }

  console.log(`${proyecto} · ${encontrado.name} · ${ESTADOS[dep.status] || dep.status} · ${haceCuanto(dep.createdAt)}`);
  console.log(`commit ${(dep.meta?.commitHash || "").slice(0, 8)} — ${String(dep.meta?.commitMessage || "").split("\n")[0]}\n`);

  const l = await gql(Q_LOGS, { id: dep.id, limit: LINEAS });
  for (const [titulo, filas] of [["BUILD", l.buildLogs], ["EJECUCIÓN", l.deploymentLogs]]) {
    if (!filas?.length) continue;
    console.log(`── ${titulo} (últimas ${filas.length}) ${"─".repeat(30)}`);
    for (const f of filas) console.log(`  ${f.message}`);
    console.log("");
  }
}

try {
  const servicio = arg("--logs");
  if (servicio) await logs(servicio); else await estado();
} catch (e) {
  console.error(`\n✗ ${e.message}`);
  if (/Not Authorized|Unauthorized|invalid/i.test(e.message))
    console.error("  El token no vale o no tiene acceso a ese workspace. Crea otro en Account Settings → Tokens.");
  process.exit(1);
}
