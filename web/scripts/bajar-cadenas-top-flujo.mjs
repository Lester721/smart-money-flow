// LAS CADENAS DE LOS TICKERS QUE DE VERDAD HABLA EL FLUJO.
//
// El censo (print-0-censo.mjs) dice que con las cadenas de hoy sólo se puede medir el 26,8% de los
// prints. Y los que faltan no son la cola: MU es el 9,7% del flujo y SNDK el 7,2%, más que SPY,
// NVDA y TSLA juntos. Medir "el flujo" sin ellos es medir otra cosa.
//
// Además arregla la CONCENTRACIÓN: con sólo los 27 de siempre + SPX/SPXW, SPXW se lleva el 25% de
// la muestra filtrada y `pasarBarrera` la tumba por concentración antes de mirar el resultado.
//
// Top-40 del flujo = 81,9% de los prints. Aquí se bajan los que faltan.
//
// Uso: node scripts/with-theta.mjs node scripts/bajar-cadenas-top-flujo.mjs

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, statSync } from "node:fs";

const BASE = (process.env.THETA_BASE || "http://127.0.0.1:25503").replace(/\/+$/, "");
const CDIR = "scripts/cache-theta/cadenas";
const CIERRES = "scripts/cache-theta/cierres";
const CONC = Number(process.env.CONC || 4);
const MAX_DTE = Number(process.env.MAX_DTE || 400);
const DESDE = process.env.DESDE || "20260422";
const HASTA = process.env.HASTA || "20260819";

// Índices: no tienen cotización de acción, su cierre sale de /index/history/eod.
const INDICES = new Set(["NDX", "RUT", "SPX", "SPXW", "VIX"]);
const ORDEN = (process.env.TICKERS || [
  "MU", "SNDK", "NDX", "GOOGL", "NBIS", "AMZN", "AVGO", "SPCX", "SOXL", "MRVL",
  "SMH", "TSM", "PLTR", "BE", "GOOG", "ASML", "MSTR", "GLD", "LITE", "RUT",
  "IWM", "DELL", "WDC", "AMAT", "STX", "ARM", "CRWV", "GS",
].join(",")).split(",").filter(Boolean);

if (!existsSync(CDIR)) mkdirSync(CDIR, { recursive: true });
const limpia = (s) => String(s ?? "").replace(/"/g, "").trim();
const iso = (y) => `${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}`;
const dias = (a, b) => Math.round((Date.parse(iso(b)) - Date.parse(iso(a))) / 86400000);

async function pMap(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    for (;;) { const k = i++; if (k >= items.length) return; await fn(items[k], k); }
  }));
}

// El calendario real: los días que YA tienen cadena de SPY, más los laborables posteriores.
const calSPY = readdirSync(CDIR).filter((f) => /^SPY_d\d{8}\.json$/.test(f)).map((f) => f.slice(5, 13)).sort();
const ultimoSPY = calSPY[calSPY.length - 1];
const laborables = (d0, d1) => {
  const out = [];
  for (let d = new Date(iso(d0) + "T12:00:00Z"); d <= new Date(iso(d1) + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
    const w = d.getUTCDay(); if (w !== 0 && w !== 6) out.push(d.toISOString().slice(0, 10).replace(/-/g, ""));
  }
  return out;
};
const DIAS = [...new Set([
  ...calSPY.filter((d) => d >= DESDE && d <= HASTA),
  ...(HASTA > ultimoSPY ? laborables(ultimoSPY, HASTA).filter((d) => d > ultimoSPY) : []),
])].sort();

let httpOk = 0, httpFallo = 0;
async function bajarCadena(sym, dia) {
  const f = `${CDIR}/${sym}_d${dia}.json`;
  if (existsSync(f) && statSync(f).size > 40) return "ya";
  const out = {}; let filas = 0;
  for (let intento = 0; intento < 3; intento++) {
    try {
      const r = await fetch(`${BASE}/v3/option/history/eod?symbol=${sym}&expiration=*&start_date=${dia}&end_date=${dia}`,
        { signal: AbortSignal.timeout(300_000) });
      if (!r.ok) { if (r.status === 404 || r.status === 472) return "vacío"; httpFallo++; await new Promise((s) => setTimeout(s, 1500 * (intento + 1))); continue; }
      const l = (await r.text()).trim().split("\n");
      if (l.length < 2) return "vacío";
      const h = l[0].split(",").map(limpia);
      const iE = h.indexOf("expiration"), iK = h.indexOf("strike"), iR = h.indexOf("right"), iB = h.indexOf("bid"), iA = h.indexOf("ask");
      if (iE < 0 || iK < 0 || iR < 0 || iB < 0 || iA < 0) throw new Error(`${sym} ${dia}: faltan columnas (${h.join("|")})`);
      for (let j = 1; j < l.length; j++) {
        const c = l[j].split(",");
        const exp = limpia(c[iE]).replace(/-/g, "");
        if (exp.length !== 8) continue;
        const dte = dias(dia, exp); if (dte < 0 || dte > MAX_DTE) continue;
        const b = Number(limpia(c[iB])), a = Number(limpia(c[iA])), K = Number(limpia(c[iK]));
        if (!(K > 0) || !(b > 0) || !(a > 0) || a < b) continue;
        (out[exp] ??= {})[`${K}|${limpia(c[iR]).toUpperCase().startsWith("C") ? "C" : "P"}`] = [b, a];
        filas++;
      }
      httpOk++; break;
    } catch (e) {
      if (String(e.message).includes("faltan columnas")) throw e;
      httpFallo++; await new Promise((s) => setTimeout(s, 1500 * (intento + 1)));
    }
  }
  if (!filas) return "vacío";
  writeFileSync(f, JSON.stringify(out), "utf8");
  return filas;
}

async function bajarCierres(sym) {
  const f = `${CIERRES}/${sym}.json`;
  const prev = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {};
  const ruta = INDICES.has(sym) ? "index" : "stock";
  let add = 0;
  for (let a = 2024; a <= 2026; a++) {
    try {
      const r = await fetch(`${BASE}/v3/${ruta}/history/eod?symbol=${sym}&start_date=${a}0101&end_date=${a === 2026 ? "20261231" : `${a}1231`}`,
        { signal: AbortSignal.timeout(120_000) });
      if (!r.ok) continue;
      const l = (await r.text()).trim().split("\n"); if (l.length < 2) continue;
      const h = l[0].split(",").map(limpia);
      const iC = h.indexOf("close");
      const iT = h.indexOf("last_trade") >= 0 ? h.indexOf("last_trade") : h.indexOf("created");
      if (iC < 0 || iT < 0) continue;
      for (let j = 1; j < l.length; j++) {
        const c = l[j].split(",");
        const d = limpia(c[iT]).slice(0, 10).replace(/-/g, ""), v = Number(limpia(c[iC]));
        if (d.length === 8 && v > 0 && !prev[d]) { prev[d] = v; add++; }
      }
    } catch { /* se ve en la validación */ }
  }
  if (add) writeFileSync(f, JSON.stringify(prev), "utf8");
  return { n: Object.keys(prev).length, add };
}

console.log(`\n${"═".repeat(96)}`);
console.log(`CADENAS DE LOS TICKERS QUE MÁS PESAN EN EL FLUJO`);
console.log(`${"═".repeat(96)}`);
console.log(`  ${ORDEN.length} tickers × ${DIAS.length} días (${DIAS[0]} → ${DIAS[DIAS.length - 1]}) · vencimientos hasta ${MAX_DTE} días\n`);

for (const t of ORDEN) {
  const cl = await bajarCierres(t);
  const faltan = DIAS.filter((d) => !(existsSync(`${CDIR}/${t}_d${d}.json`) && statSync(`${CDIR}/${t}_d${d}.json`).size > 40));
  if (!faltan.length) { console.log(`  ${t.padEnd(6)} cadenas completas · cierres ${cl.n}`); continue; }
  const t0 = Date.now(); let ok = 0, vac = 0, n = 0;
  await pMap(faltan, CONC, async (d) => {
    const r = await bajarCadena(t, d);
    if (typeof r === "number") ok++; else if (r === "vacío") vac++; else ok++;
    if (++n % 20 === 0) process.stdout.write(`\r  ${t.padEnd(6)} ${n}/${faltan.length} · ${ok} ok  `);
  });
  console.log(`\r  ${t.padEnd(6)} ${ok}/${faltan.length} cadenas · ${vac} vacías · cierres ${cl.n}${cl.add ? ` (+${cl.add})` : ""} · ${((Date.now() - t0) / 1000).toFixed(0)}s        `);
}

// ═══ VALIDACIÓN — ABRIENDO LOS FICHEROS ═════════════════════════════════════════════════════
console.log(`\n${"═".repeat(96)}`);
console.log(`VALIDACIÓN · http ok ${httpOk} · reintentos/fallos ${httpFallo}`);
console.log(`${"═".repeat(96)}\n`);
console.log(`  ${"tick".padEnd(6)} ${"días".padStart(5)} ${"venc/día".padStart(8)} ${"K/venc".padStart(7)} ${"bid>0".padStart(6)}  ${"cierres".padStart(7)}  rango`);
const informe = {};
for (const t of ORDEN) {
  const fs2 = readdirSync(CDIR).filter((f) => new RegExp(`^${t}_d\\d{8}\\.json$`).test(f))
    .map((f) => f.slice(t.length + 2, t.length + 10)).filter((d) => d >= DESDE && d <= HASTA).sort();
  if (!fs2.length) { console.log(`  ${t.padEnd(6)} SIN NINGÚN FICHERO EN EL RANGO`); informe[t] = { dias: 0 }; continue; }
  const muestra = [...new Set([0, 0.25, 0.5, 0.75, 0.999].map((q) => fs2[Math.min(fs2.length - 1, Math.floor(fs2.length * q))]))];
  const exps = [], ks = []; let conBid = 0, tot = 0;
  for (const d of muestra) {
    const c = JSON.parse(readFileSync(`${CDIR}/${t}_d${d}.json`, "utf8"));
    const e = Object.keys(c); exps.push(e.length);
    for (const x of e) { ks.push(Object.keys(c[x]).length); for (const v of Object.values(c[x])) { tot++; if (v[0] > 0) conBid++; } }
  }
  const med = (v) => (v.length ? v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)] : 0);
  const cl = existsSync(`${CIERRES}/${t}.json`) ? Object.keys(JSON.parse(readFileSync(`${CIERRES}/${t}.json`, "utf8"))).filter((d) => d >= DESDE && d <= HASTA).length : 0;
  console.log(`  ${t.padEnd(6)} ${String(fs2.length).padStart(5)} ${String(med(exps)).padStart(8)} ${String(med(ks)).padStart(7)} ${((100 * conBid) / (tot || 1)).toFixed(0).padStart(5)}%  ${String(cl).padStart(7)}  ${fs2[0]}→${fs2[fs2.length - 1]}`);
  informe[t] = { dias: fs2.length, cierres: cl, expDia: med(exps), kExp: med(ks) };
}
writeFileSync("scripts/bajar-cadenas-top-flujo.json", JSON.stringify(informe, null, 1));
console.log(`\n  Un rango completo son ${DIAS.length} días. El que baje mucho de ahí, no cotizaba o falta.`);
console.log(`  → scripts/bajar-cadenas-top-flujo.json\n`);
