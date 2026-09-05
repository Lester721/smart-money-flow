// ╔══════════════════════════════════════════════════════════════════════════════════════════╗
// ║  ¿ESTÁ TODO BIEN EN RAILWAY? — las cinco cosas que han fallado alguna vez                  ║
// ╚══════════════════════════════════════════════════════════════════════════════════════════╝
//
//   node --env-file=.env.local scripts/auditar-railway.mjs
//
// Comprueba, servicio por servicio:
//   1. DESPLIEGUE       un CRASHED **apaga el cron para siempre** y desde fuera se ve igual que
//                       un servicio sano que no encuentra señales. Fallo del 2026-09-01.
//   2. CRON             un servicio sin cronSchedule no corre nunca, y nadie lo nota.
//   3. REDIS            leído con `unrendered: true`, porque RESUELTO una referencia y una copia
//                       se ven IDÉNTICAS. Los dos combinados nacieron con copia literal.
//   4. LATIDO           que exista. Si falta, el servicio es invisible aunque corra.
//   5. FRESCURA         más de 26 horas sin latir = algo pasa.
//
// POR QUÉ EXISTE: el 2026-09-02 Lester preguntó «¿tienes todo en Railway bien?» y la respuesta
// honesta no era un sí de memoria — era esto. Cada vez que lo pregunte, se corre y se enseña.
// Y ojo: comprobar CINCO cosas no es comprobar todas. Esto NO valida que el cuaderno mida bien,
// ni que los números del backtest sigan en pie.
const TOKEN = process.env.RAILWAY_TOKEN, API = "https://backboard.railway.com/graphql/v2";
const gql = async (q, v = {}) => { const r = await fetch(API, { method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer " + TOKEN },
  body: JSON.stringify({ query: q, variables: v }) });
  const j = await r.json(); if (j.errors) throw new Error(j.errors[0].message); return j.data; };
const ET = (t) => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/New_York", dateStyle: "short", timeStyle: "short" }).format(new Date(t));

const d = await gql(`query { projects { edges { node { id name environments { edges { node { id name } } }
  services { edges { node { id name serviceInstances { edges { node { environmentId cronSchedule startCommand restartPolicyType } } } } } } } } } }`);
const P = d.projects.edges.map(e => e.node).find(p => p.name === "thriving-creation");
const ENV = P.environments.edges.map(e => e.node).find(e => e.name === "production");
const SV = P.services.edges.map(e => e.node).sort((a, b) => a.name.localeCompare(b.name));

const R = (await import("ioredis")).default;
const rd = new R(process.env.REDIS_URL, { maxRetriesPerRequest: 2 }); rd.on("error", () => {});
const latidos = {};
for (const k of await rd.keys("latido:*")) latidos[k.replace("latido:", "")] = JSON.parse(await rd.get(k));
const CLAVE = { "Forward · Combinado 6x4": "combinado-6x4", "Forward · Combinado 4x6": "combinado-4x6",
  "Forward · La Palanca": "la-palanca", "TSLA's Missile": "tsla-missile", "Forward · Mariposa 15:00": "mariposa-15h",
  "Forward · Cóndor 0DTE": "gex-condor", "Forward · Wheel": "wheel", "Forward · Credit Spread": "credit-spread",
  "Forward · Ideas": "ideas" };

// AVISO LEER LO QUE DICE EL LATIDO, NO SOLO CUANDO SE ESCRIBIO. El 2026-09-04 este auditor dio
// OCHO servicios por buenos mientras los ocho escribian "NO CORRIO" todas las noches: miraba la
// FRESCURA y no el CONTENIDO. Un servicio que dispara puntual y avisa de que no hizo nada se ve
// igual que uno sano. Un latido fresco solo prueba que el proceso llego a escribir.
const { latidoMalo: esMalo } = await import("../lib/latidoMalo.mjs");

console.log("\n  servicio                    despliegue    cron           Redis   último latido      h  qué dijo");
let fallos = [];
for (const s of SV) {
  const si = s.serviceInstances.edges.map(e => e.node).find(x => x.environmentId === ENV.id);
  const q = await gql(`query($p:String!,$s:String!){ deployments(first:1, input:{projectId:$p, serviceId:$s}){ edges { node { status } } } }`, { p: P.id, s: s.id });
  const est = q.deployments.edges[0]?.node?.status ?? "—";
  // ¿REDIS_URL es referencia o copia? sin unrendered las dos se ven idénticas
  let redis = "—";
  try {
    const v = await gql(`query($p:String!,$e:String!,$s:String!){ variables(projectId:$p, environmentId:$e, serviceId:$s, unrendered:true) }`,
      { p: P.id, e: ENV.id, s: s.id });
    const u = v.variables?.REDIS_URL;
    redis = u == null ? "falta" : (String(u).includes("${{") ? "ref ✓" : "COPIA");
  } catch { redis = "?"; }
  const cl = CLAVE[s.name], lat = cl ? latidos[cl] : null;
  const h = lat ? (Date.now() - Date.parse(lat.cuandoISO)) / 36e5 : null;
  if (est === "CRASHED" || est === "FAILED") fallos.push(s.name + ": despliegue " + est);
  if (cl && redis === "COPIA") fallos.push(s.name + ": Redis COPIADO, no por referencia");
  if (cl && !si?.cronSchedule) fallos.push(s.name + ": SIN cron");
  if (cl && h != null && h > 26) fallos.push(s.name + ": latido de hace " + h.toFixed(0) + "h");
  if (cl && lat && esMalo(lat.resultado)) fallos.push(s.name + ": su ultimo latido dice " + String(lat.resultado).slice(0, 70));
  console.log("  " + (fallos.some(f => f.startsWith(s.name)) ? "⛔ " : "   ") + s.name.padEnd(26) +
    est.padEnd(13) + String(si?.cronSchedule ?? "—").padEnd(15) + redis.padEnd(8) +
    (lat ? (lat.cuandoET ?? "?").padEnd(19) + (h?.toFixed(1) ?? "").padStart(5) + "  " +
           (esMalo(lat.resultado) ? "!! " : "") + String(lat.resultado ?? "").slice(0, 46) : "(sin latido)"));
}
// EL CANDADO. Un dueno con TTL vivo que no sale es lo que apago el calendario 43 horas;
// mirarlo aqui cuesta una linea y lo caza en un segundo.
const dueno = await rd.get("lock:theta");
const ttl = await rd.ttl("lock:theta");
console.log("\n  candado ThetaData: " + (dueno ? dueno + "  (ttl " + ttl + "s)" : "LIBRE"));
if (dueno) {
  const suyo = Object.entries(CLAVE).find(([n]) => String(dueno).startsWith(n));
  const latD = suyo ? latidos[suyo[1]] : null;
  const hd = latD ? (Date.now() - Date.parse(latD.cuandoISO)) / 36e5 : null;
  if (hd != null && hd > 2) fallos.push("el candado de ThetaData lo tiene " + dueno +
    ", que no late desde hace " + hd.toFixed(0) + "h: esta COLGADO y bloquea a los demas");
}

console.log("\n  " + (fallos.length ? "⛔ " + fallos.length + " PROBLEMAS:\n     " + fallos.join("\n     ") : "✅ los servicios con cuaderno están bien"));
await rd.quit();
