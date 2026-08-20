// EL CONTRATO QUE ELIGEN · 0 — CENSO: ¿dónde apuesta el dinero grande?
//
// Cruce distancia al dinero × plazo × tamaño de la prima, sobre los 2.208.177 prints.
// Pesado en NÚMERO de prints y en DÓLARES de prima. Antes de medir si sirve, hay que saber
// dónde está. La esquina barata (3-8% fuera, 60-120 días) se mira aparte.
//
// El feed de 1000k es un SUBCONJUNTO exacto del de 100k (comprobado: 3.189/3.189 el 2026-08-05),
// así que sólo se lee 100k. Contar los dos sería contar doble.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/contrato-0-censo.mjs

import { writeFileSync } from "node:fs";
import { diasFlujo, leerDia, parseOCC, cierres } from "./ventana-lib.mjs";
import { conditionOf } from "../lib/conditions.ts";

const fmt = (n) => Math.round(n).toLocaleString("es-ES");
const pctS = (a, b) => (b > 0 ? (100 * a / b).toFixed(2) : "0.00").padStart(6) + "%";

// ── Clasificación REAL por código OPRA (no la de MarketSnack, que se equivoca con MFSL/MESL/MASL)
const MULTI = new Set(["MLET", "MLAT", "MLCT", "MLFT", "CBMO", "MCTP", "MESL", "MASL", "MFSL"]);
const ACCOPC = new Set(["TLAT", "TLET", "TLCT", "TLFT", "TESL", "TASL", "TFSL"]);
const BASURA = new Set(["CANC", "OSEQ", "CNCL", "LATE", "CNCO", "OPEN", "CNOL", "OPNL", "REOP", "EXHT"]);
function clase(id) {
  const c = conditionOf(id);
  if (!c) return "SIN_ID";
  if (BASURA.has(c.code)) return "BASURA";
  if (MULTI.has(c.code)) return "MULTI";
  if (ACCOPC.has(c.code)) return "ACCOPC";
  return "UNA";
}

const ASK = new Set(["ABOVE_ASK", "AT_ASK", "ASKSIDE"]);
const BID = new Set(["BELOW_BID", "AT_BID", "BIDSIDE"]);

// ── Rejilla ────────────────────────────────────────────────────────────────────────────────
// distancia FUERA del dinero en fracción: call → K/S−1 ; put → 1−K/S. Negativo = dentro.
const DIST = [
  { n: "DENTRO", lo: -Infinity, hi: -0.02 },
  { n: "EN EL DINERO", lo: -0.02, hi: 0.02 },
  { n: "5% fuera", lo: 0.02, hi: 0.075 },
  { n: "10% fuera", lo: 0.075, hi: 0.15 },
  { n: "20% fuera", lo: 0.15, hi: 0.30 },
  { n: "LEJÍSIMOS", lo: 0.30, hi: Infinity },
];
const PLAZO = [
  { n: "0-7d", lo: 0, hi: 8 },
  { n: "8-30d", lo: 8, hi: 31 },
  { n: "31-90d", lo: 31, hi: 91 },
  { n: "90+d", lo: 91, hi: Infinity },
];
const PRIMA = [
  { n: "$100-250k", lo: 100e3, hi: 250e3 },
  { n: "$250k-1M", lo: 250e3, hi: 1e6 },
  { n: "$1-2,5M", lo: 1e6, hi: 2.5e6 },
  { n: "$2,5-5M", lo: 2.5e6, hi: 5e6 },
  { n: "$5M+", lo: 5e6, hi: Infinity },
];
const idx = (arr, v) => arr.findIndex((b) => v >= b.lo && v < b.hi);

const diasEntre = (dY, exp) =>
  Math.round((Date.parse(`${exp.slice(0, 4)}-${exp.slice(4, 6)}-${exp.slice(6, 8)}`) -
    Date.parse(`${dY.slice(0, 4)}-${dY.slice(4, 6)}-${dY.slice(6, 8)}`)) / 86400000);

// ── Recorrido ───────────────────────────────────────────────────────────────────────────────
const dias = diasFlujo("100k");
console.log(`\n${"═".repeat(104)}`);
console.log(`EL CONTRATO QUE ELIGEN · CENSO — ${dias.length} días de flujo (${dias[0]} → ${dias[dias.length - 1]})`);
console.log(`${"═".repeat(104)}\n`);

const G = {}; // clave dist|plazo|prima → {n, prem}
const total = { n: 0, prem: 0 };
const porClase = new Map();
const porTicker = new Map();
const sinS = { con: 0, sin: 0, porFallback: 0 };
let sinOCC = 0, sinPrima = 0;
const porDist = DIST.map(() => ({ n: 0, prem: 0 }));
const porPlazo = PLAZO.map(() => ({ n: 0, prem: 0 }));
const porPrima = PRIMA.map(() => ({ n: 0, prem: 0 }));
// esquina barata: 3-8% fuera y 60-120 días
const esq = { n: 0, prem: 0, ask: 0, bid: 0, una: 0, multi: 0, porTicker: new Map(), porPrima: PRIMA.map(() => 0) };
const CLASES_VIVAS = new Set(["UNA", "MULTI", "ACCOPC"]);

for (const dia of dias) {
  const filas = leerDia(dia, "100k");
  const dY = dia.replace(/-/g, "");
  for (const o of filas) {
    const cl = clase(o.trade_condition_id);
    porClase.set(cl, (porClase.get(cl) ?? 0) + 1);
    if (!CLASES_VIVAS.has(cl)) continue;              // canceladas / tardías fuera
    const q = parseOCC(o.symbol);
    if (!q) { sinOCC++; continue; }
    const prem = Number(o.premium);
    if (!(prem > 0)) { sinPrima++; continue; }

    let S = Number(o.asset_price);
    if (!(S > 0)) {
      const c = cierres(q.raiz);
      const v = c ? (c[dY] ?? c[dia]) : null;
      if (v > 0) { S = v; sinS.porFallback++; } else { sinS.sin++; continue; }
    } else sinS.con++;

    const dist = q.tipo === "C" ? q.strike / S - 1 : 1 - q.strike / S;
    const dte = diasEntre(dY, q.exp);
    if (dte < 0) continue;
    const i = idx(DIST, dist), j = idx(PLAZO, dte), k = idx(PRIMA, prem);
    if (i < 0 || j < 0 || k < 0) continue;

    total.n++; total.prem += prem;
    porDist[i].n++; porDist[i].prem += prem;
    porPlazo[j].n++; porPlazo[j].prem += prem;
    porPrima[k].n++; porPrima[k].prem += prem;
    const key = `${i}|${j}|${k}`;
    if (!G[key]) G[key] = { n: 0, prem: 0 };
    G[key].n++; G[key].prem += prem;
    const t = porTicker.get(q.raiz) ?? { n: 0, prem: 0 };
    t.n++; t.prem += prem; porTicker.set(q.raiz, t);

    if (dist >= 0.03 && dist <= 0.08 && dte >= 60 && dte <= 120) {
      esq.n++; esq.prem += prem;
      if (ASK.has(o.side)) esq.ask++; else if (BID.has(o.side)) esq.bid++;
      if (cl === "UNA") esq.una++; else if (cl === "MULTI") esq.multi++;
      esq.porTicker.set(q.raiz, (esq.porTicker.get(q.raiz) ?? 0) + prem);
      esq.porPrima[k]++;
    }
  }
  process.stdout.write(`\r  ${dia}  ${fmt(total.n)} prints`);
}
console.log(`\n`);

// ── Salud del dato ──────────────────────────────────────────────────────────────────────────
console.log(`## SALUD DEL DATO`);
for (const [c, n] of [...porClase.entries()].sort((a, b) => b[1] - a[1]))
  console.log(`   ${c.padEnd(8)} ${fmt(n).padStart(10)}`);
console.log(`   asset_price presente ${fmt(sinS.con)} · rellenado con cierre real ${fmt(sinS.porFallback)} · descartado sin precio ${fmt(sinS.sin)}`);
console.log(`   sin OCC ${fmt(sinOCC)} · sin prima ${fmt(sinPrima)}`);
console.log(`\n   TOTAL medible: ${fmt(total.n)} prints · $${fmt(total.prem / 1e6)} millones de prima\n`);

// ── Marginales ──────────────────────────────────────────────────────────────────────────────
const linea = (nombre, c) => `   ${nombre.padEnd(14)} ${fmt(c.n).padStart(10)} ${pctS(c.n, total.n)}   $${fmt(c.prem / 1e6).padStart(9)}M ${pctS(c.prem, total.prem)}`;
console.log(`## DÓNDE ESTÁ EL DINERO — por DISTANCIA AL DINERO        prints              prima`);
DIST.forEach((b, i) => console.log(linea(b.n, porDist[i])));
console.log(`\n## por PLAZO`);
PLAZO.forEach((b, j) => console.log(linea(b.n, porPlazo[j])));
console.log(`\n## por TAMAÑO DE LA PRIMA`);
PRIMA.forEach((b, k) => console.log(linea(b.n, porPrima[k])));

// ── La rejilla completa, en % de la PRIMA ───────────────────────────────────────────────────
console.log(`\n${"═".repeat(104)}`);
console.log(`LA REJILLA — % de los DÓLARES de prima (filas = distancia · columnas = plazo)`);
console.log(`${"═".repeat(104)}\n`);
console.log(`   ${"".padEnd(14)}${PLAZO.map((p) => p.n.padStart(9)).join("")}${"TOTAL".padStart(9)}`);
for (let i = 0; i < DIST.length; i++) {
  let fila = `   ${DIST[i].n.padEnd(14)}`, tot = 0;
  for (let j = 0; j < PLAZO.length; j++) {
    let s = 0;
    for (let k = 0; k < PRIMA.length; k++) s += G[`${i}|${j}|${k}`]?.prem ?? 0;
    tot += s;
    fila += `${(100 * s / total.prem).toFixed(2).padStart(8)}%`;
  }
  console.log(fila + `${(100 * tot / total.prem).toFixed(2).padStart(8)}%`);
}

console.log(`\n## LA MISMA REJILLA sólo con prints de ≥$2,5M (los gigantes)`);
console.log(`   ${"".padEnd(14)}${PLAZO.map((p) => p.n.padStart(9)).join("")}${"TOTAL".padStart(9)}`);
let gigTot = 0;
for (let i = 0; i < DIST.length; i++) for (let j = 0; j < PLAZO.length; j++) for (const k of [3, 4]) gigTot += G[`${i}|${j}|${k}`]?.prem ?? 0;
for (let i = 0; i < DIST.length; i++) {
  let fila = `   ${DIST[i].n.padEnd(14)}`, tot = 0;
  for (let j = 0; j < PLAZO.length; j++) {
    let s = 0;
    for (const k of [3, 4]) s += G[`${i}|${j}|${k}`]?.prem ?? 0;
    tot += s;
    fila += `${(100 * s / gigTot).toFixed(2).padStart(8)}%`;
  }
  console.log(fila + `${(100 * tot / gigTot).toFixed(2).padStart(8)}%`);
}

// ── La esquina barata ───────────────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(104)}`);
console.log(`LA ESQUINA BARATA — 3-8% fuera del dinero, 60-120 días`);
console.log(`${"═".repeat(104)}\n`);
console.log(`   ${fmt(esq.n)} prints (${(100 * esq.n / total.n).toFixed(2)}% del flujo) · $${fmt(esq.prem / 1e6)}M (${(100 * esq.prem / total.prem).toFixed(2)}% de la prima)`);
console.log(`   al ASK ${fmt(esq.ask)} (${(100 * esq.ask / esq.n).toFixed(1)}%) · al BID ${fmt(esq.bid)} (${(100 * esq.bid / esq.n).toFixed(1)}%)`);
console.log(`   una pata ${fmt(esq.una)} (${(100 * esq.una / esq.n).toFixed(1)}%) · pata de spread ${fmt(esq.multi)} (${(100 * esq.multi / esq.n).toFixed(1)}%)`);
console.log(`   por tamaño de prima: ${PRIMA.map((p, k) => `${p.n} ${fmt(esq.porPrima[k])}`).join(" · ")}`);
console.log(`\n   los 12 tickers que más prima ponen en la esquina barata:`);
[...esq.porTicker.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
  .forEach(([t, p]) => console.log(`      ${t.padEnd(6)} $${fmt(p / 1e6).padStart(7)}M  ${(100 * p / esq.prem).toFixed(1)}%`));

console.log(`\n## CONCENTRACIÓN GENERAL — los 12 tickers con más prima`);
[...porTicker.entries()].sort((a, b) => b[1].prem - a[1].prem).slice(0, 12)
  .forEach(([t, c]) => console.log(`      ${t.padEnd(6)} $${fmt(c.prem / 1e6).padStart(8)}M  ${(100 * c.prem / total.prem).toFixed(1)}%   ${fmt(c.n).padStart(8)} prints`));

writeFileSync("scripts/contrato-0-censo.json", JSON.stringify({
  dias: dias.length, total, porClase: [...porClase], porDist, porPlazo, porPrima, G, DIST, PLAZO, PRIMA,
  esquina: { ...esq, porTicker: [...esq.porTicker].sort((a, b) => b[1] - a[1]).slice(0, 40) },
  porTicker: [...porTicker].sort((a, b) => b[1].prem - a[1].prem).slice(0, 60),
}, null, 1));
console.log(`\n  → scripts/contrato-0-censo.json\n`);
