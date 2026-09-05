// LOS CUATRO QUE IMPORTAN — validación diaria.
//
// Lester, 2026-09-04: «los únicos forward test que parece la pena dejar son La Palanca, TSLA
// Missile, credit spread y wheel. Graba que todos los días vas a validar que estos test estén
// corriendo bien tanto en Railway como en el web, y asegúrate de tener una validación sobre
// estos test para ir APRENDIENDO de los resultados y luego proponer cambios a la estrategia».
//
// Por eso esto hace DOS cosas, no una:
//   1. ¿ESTÁ VIVO?   despliegue, cron, latido y lo que DICE el latido.
//   2. ¿QUÉ APRENDO? el reparto de resultados, dónde se concentra el dinero, y sobre todo
//      QUÉ PARTE NO HA REPORTADO TODAVÍA — que es donde se esconden las conclusiones falsas.
//
// El punto 2 existe por dos casos reales del 2026-09-04:
//   · el Wheel iba «100% de acierto» con 20 cerradas de 337, TODAS del plazo corto y en un mes
//     alcista. Las 245 del plazo de 30 días no habían dicho nada.
//   · el credit spread iba +$15.645 con CERO cerradas del plazo de 90 días -- el único que
//     sobrevivió al backtest. Todo el verde venía de los plazos ya refutados.
// Un marcador que no separa «lo que cerró» de «lo que falta» invita a concluir de más.

const T = process.env.RAILWAY_TOKEN, API = "https://backboard.railway.com/graphql/v2";
const Redis = (await import("ioredis")).default;
const rd = new Redis(process.env.REDIS_URL); rd.on("error", () => {});
const gql = async (q, v = {}) => {
  const r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer " + T },
    body: JSON.stringify({ query: q, variables: v }), signal: AbortSignal.timeout(60000) });
  const j = JSON.parse(await r.text()); if (j.errors?.length) throw new Error(j.errors[0].message); return j.data;
};

const CUATRO = [
  { nombre: "Forward · La Palanca", latido: "la-palanca",    clave: "forward:la-palanca",  tipo: "obj" },
  { nombre: "TSLA's Missile",       latido: "tsla-missile",  clave: "forward:tsla-missile", tipo: "obj" },
  { nombre: "Forward · Credit Spread", latido: "credit-spread", clave: "forward:ledger",   tipo: "lista", res: "retOnRisk", plazo: "dte" },
  { nombre: "Forward · Wheel",      latido: "wheel",         clave: "forward:wheel",       tipo: "lista", res: "retOnColl", plazo: "dte" },
];
// La lista de palabras malas es COMPARTIDA (lib/latidoMalo.mjs): tenerla a mano en cada
// vigilante fue lo que hizo que este dijera "los cuatro bien" con un "PARADO" delante.
const { latidoMalo: MALOfn } = await import("../lib/latidoMalo.mjs");
const MALO = { test: MALOfn };
let fallos = [];

// ── 1. ¿ESTÁ VIVO? ────────────────────────────────────────────────────────────────────────
const d = await gql(`query { projects { edges { node { id name services { edges { node { id name
  serviceInstances { edges { node { id environmentId cronSchedule } } } } } } environments { edges { node { id name } } } } } } }`);
const P = d.projects.edges.map((e) => e.node).find((p) => p.name === "thriving-creation");
const ENV = P.environments.edges.map((e) => e.node).find((e) => e.name === "production");

console.log("\n  ══ 1. ¿ESTÁN CORRIENDO? ══════════════════════════════════════════════════\n");
console.log("  servicio                 despliegue  cron           latido            qué dijo");
for (const c of CUATRO) {
  const s = P.services.edges.map((e) => e.node).find((x) => x.name === c.nombre);
  if (!s) { fallos.push(c.nombre + ": NO EXISTE el servicio en Railway"); continue; }
  const si = s.serviceInstances.edges.map((e) => e.node).find((x) => x.environmentId === ENV.id);
  const q = await gql(`query($p:String!,$s:String!){ deployments(first:1, input:{projectId:$p, serviceId:$s}){ edges { node { status } } } }`, { p: P.id, s: s.id });
  const est = q.deployments.edges[0]?.node?.status ?? "—";
  const lat = JSON.parse((await rd.get("latido:" + c.latido)) || "null");
  const h = lat ? (Date.now() - Date.parse(lat.cuandoISO)) / 36e5 : null;
  if (est === "CRASHED" || est === "FAILED") fallos.push(c.nombre + ": despliegue " + est);
  if (!si?.cronSchedule) fallos.push(c.nombre + ": SIN cron");
  if (!lat) fallos.push(c.nombre + ": SIN latido");
  else if (MALO.test(lat.resultado ?? "")) fallos.push(c.nombre + ": " + String(lat.resultado).slice(0, 70));
  else if (h > 26) fallos.push(c.nombre + ": lleva " + h.toFixed(0) + " h sin latir");
  console.log("  " + (fallos.some((f) => f.startsWith(c.nombre)) ? "⛔" : "  ") + c.nombre.replace("Forward · ", "").padEnd(24) +
    est.padEnd(12) + String(si?.cronSchedule ?? "—").padEnd(15) + String(lat?.cuandoET ?? "—").padEnd(18) +
    String(lat?.resultado ?? "").slice(0, 40));
}

// ── 2. ¿QUÉ APRENDO? ──────────────────────────────────────────────────────────────────────
console.log("\n  ══ 2. QUÉ SE PUEDE APRENDER (y qué NO todavía) ══════════════════════════\n");
for (const c of CUATRO) {
  const crudo = JSON.parse((await rd.get(c.clave)) || "null");
  if (!crudo) { console.log("  " + c.nombre + ": sin registro"); continue; }
  console.log("  ── " + c.nombre.replace("Forward · ", ""));
  if (c.tipo === "obj") {
    const ab = (crudo.abiertas ?? []).length, op = (crudo.operaciones ?? []).length;
    console.log("     abiertas " + ab + " · cerradas " + op + (op === 0 && ab === 0
      ? "   ⚠️ NO HA OPERADO NUNCA: no hay nada que aprender todavía, y eso ES el hallazgo" : ""));
    continue;
  }
  const L = Array.isArray(crudo) ? crudo : [];
  const cer = L.filter((o) => o.status === "closed"), abi = L.filter((o) => o.status === "open");
  const val = cer.map((o) => o[c.res]).filter((x) => typeof x === "number");
  const gan = val.filter((x) => x > 0).length;
  console.log("     cerradas " + cer.length + " de " + L.length + " · acierto " +
    (val.length ? Math.round(100 * gan / val.length) + "%" : "—") +
    " · media " + (val.length ? (val.reduce((a, b) => a + b, 0) / val.length).toFixed(2) + "%" : "—"));
  // POR PLAZO: aquí es donde aparecen las conclusiones falsas.
  const plazos = [...new Set(L.map((o) => o[c.plazo]))].sort((a, b) => a - b);
  for (const p of plazos) {
    const cp = cer.filter((o) => o[c.plazo] === p), ap = abi.filter((o) => o[c.plazo] === p);
    const v = cp.map((o) => o[c.res]).filter((x) => typeof x === "number");
    const aviso = cp.length === 0 && ap.length > 0 ? "   ⚠️ NINGUNA ha cerrado: este plazo NO respalda ninguna conclusión" : "";
    console.log("       " + String(p).padStart(3) + "d · cerradas " + String(cp.length).padStart(3) +
      " · abiertas " + String(ap.length).padStart(3) +
      (v.length ? " · media " + (v.reduce((a, b) => a + b, 0) / v.length).toFixed(2) + "%" : "") + aviso);
  }
}

console.log("\n  ══════════════════════════════════════════════════════════════════════════");
console.log("  " + (fallos.length ? "⛔ " + fallos.length + " PROBLEMAS:\n     " + fallos.join("\n     ")
                                  : "✅ los cuatro están corriendo bien"));
await rd.quit();
if (fallos.length) process.exitCode = 1;
