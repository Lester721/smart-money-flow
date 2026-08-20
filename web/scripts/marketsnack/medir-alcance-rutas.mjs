// ¿HASTA DÓNDE ATRÁS LLEGA CADA RUTA? — el alcance histórico, ruta por ruta.
//
// La interfaz sólo ofrece 1D / 1W / 1M. Eso NO quiere decir que la API sólo acepte eso: lo que
// decide es el servidor, y hay que preguntárselo. Se prueban valores plausibles y se mide la
// FECHA MÁS ANTIGUA que devuelve cada uno, que es la única respuesta que importa.
//
// ⚠️ Un período que devuelve las MISMAS filas que otro no es un período nuevo: es el servidor
// ignorando el parámetro (ya pasó con `period` en flow_feed). Por eso se compara la fecha más
// antigua y el número de filas contra el período anterior.
//
// Uso: node scripts/marketsnack/medir-alcance-rutas.mjs [TICKER]

import fs from "node:fs";

const BASE = "https://app.marketsnack.com/api";
const T = (process.argv[2] || "SPY").toUpperCase();
const C = fs.readFileSync(".env.local", "utf8").split("\n")
  .find((l) => l.startsWith("MARKETSNACK_COOKIE="))?.slice("MARKETSNACK_COOKIE=".length).trim();

const PERIODOS = ["1d", "5d", "1w", "2w", "1m", "3m", "6m", "1y", "2y", "5y", "ytd", "all", "max"];
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function pedir(ruta) {
  const r = await fetch(BASE + ruta, {
    headers: { Accept: "application/json", Cookie: C }, redirect: "manual",
    signal: AbortSignal.timeout(60000),
  });
  const txt = await r.text().catch(() => "");
  let j = null; try { j = JSON.parse(txt); } catch {}
  return { http: r.status, j, bytes: txt.length };
}

/** Saca el array de filas y el rango de fechas, mire donde mire la respuesta. */
function analizar(j) {
  if (!j) return { n: 0, desde: null, hasta: null };
  const arr = Array.isArray(j) ? j
    : j.data ?? j.list ?? Object.values(j).find(Array.isArray) ?? [];
  if (!Array.isArray(arr) || !arr.length) return { n: 0, desde: null, hasta: null };
  const fechas = arr.map((x) => x?.t ?? x?.timestamp ?? x?.date ?? x?.occurred_at)
    .filter((x) => typeof x === "string").sort();
  return { n: arr.length, desde: fechas[0] ?? null, hasta: fechas[fechas.length - 1] ?? null };
}

const RUTAS = [
  ["assets/gex_stats_chart", (p) => `/assets/${T}/gex_stats_chart?period=${p}`],
  ["assets/chart", (p) => `/assets/${T}/chart?period=${p}`],
  ["assets/sentiment", (p) => `/assets/${T}/sentiment?period=${p}`],
  ["widgets/market_sentiment", (p) => `/widgets/market_sentiment?period=${p}`],
  ["widgets/volume_change_chart", (p) => `/widgets/volume_change_chart?symbol=${T}&period=${p}&interval=1d`],
];

console.log(`═══ ALCANCE HISTÓRICO POR RUTA · ${T} ═══\n`);
const resumen = {};
for (const [nombre, hacer] of RUTAS) {
  console.log(`── ${nombre}`);
  let previo = null;
  resumen[nombre] = [];
  for (const p of PERIODOS) {
    try {
      const { http, j, bytes } = await pedir(hacer(p));
      if (http !== 200) { console.log(`   ${p.padEnd(4)} HTTP ${http}`); resumen[nombre].push({ p, http }); continue; }
      const a = analizar(j);
      const igual = previo && previo.n === a.n && previo.desde === a.desde ? "  ← IGUAL que el anterior (el servidor ignora el período)" : "";
      const dias = a.desde ? ((Date.now() - Date.parse(a.desde)) / 86400000).toFixed(0) : "—";
      console.log(`   ${p.padEnd(4)} ${String(a.n).padStart(4)} filas · desde ${(a.desde ?? "—").slice(0, 10)} (${dias} días atrás) · ${(bytes / 1024).toFixed(1)}kB${igual}`);
      resumen[nombre].push({ p, http, ...a, bytes });
      previo = a;
    } catch (e) { console.log(`   ${p.padEnd(4)} error: ${String(e.message).slice(0, 40)}`); }
    await dormir(150);
  }
  console.log("");
}

// ── el contrato: ¿guarda historia por contrato? ─────────────────────────────
const ff = await pedir(`/flow_feed?filter[scope]=all&period=1d&filter[premium][gte]=1000000`);
const sim = ff.j?.list?.[0]?.symbol;
if (sim) {
  console.log(`── por CONTRATO (${sim})`);
  for (const [n, r] of [
    ["premium_traded", (p) => `/option_contracts/${sim}/premium_traded?period=${p}`],
    ["weighted_avg_price", (p) => `/option_contracts/${sim}/weighted_avg_price?period=${p}`],
    ["trade_summaries", (p) => `/option_contracts/${sim}/trade_summaries?period=${p}&interval=1d`],
  ]) {
    for (const p of ["1d", "1w", "1m", "3m", "1y", "all"]) {
      try {
        const { http, j } = await pedir(r(p));
        const a = analizar(j);
        console.log(`   ${n.padEnd(20)} ${p.padEnd(4)} HTTP ${http} · ${String(a.n).padStart(3)} filas · desde ${(a.desde ?? "—").slice(0, 10)}`);
      } catch (e) { console.log(`   ${n.padEnd(20)} ${p.padEnd(4)} error`); }
      await dormir(120);
    }
  }
}

fs.writeFileSync("data/marketsnack/inventario/alcance-rutas.json", JSON.stringify(resumen, null, 1));
console.log(`\nguardado en data/marketsnack/inventario/alcance-rutas.json`);
