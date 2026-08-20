// URGENCIA · 0 — CENSO. Qué es cada etiqueta de `side`, cuánta hay, y qué queda tras las cribas.
//
// Antes de medir nada: verificar EMPÍRICAMENTE qué significa ABOVE_ASK / AT_ASK / ASKSIDE
// mirando dónde cayó el precio dentro de la horquilla del propio print.
//
// node --import tsx --max-old-space-size=10240 scripts/urg-0-censo.mjs

import { writeFileSync } from "node:fs";
import { diasFlujo, leerDia, parseOCC } from "./ventana-lib.mjs";
import { tickersConCadena, cierres, diasDe, media, pctl, fmt } from "./print-lib.mjs";
import { conditionOf } from "../lib/conditions.ts";

// Clasificación por código OPRA REAL (no por la etiqueta de MarketSnack, que está mal).
const UNA_PATA = new Set(["AUTO", "REOP", "ISOI", "SLAN", "SLAI", "SLCN", "SLCI", "SLFT"]);
const MULTI    = new Set(["MLET", "MLAT", "MLCT", "MLFT", "CBMO", "MESL", "MASL", "MFSL"]);
const ACC_OPC  = new Set(["TLAT", "TLET", "TLCT", "TLFT", "TESL", "TASL", "TFSL"]);
const BASURA   = new Set(["CANC", "OSEQ", "CNCL", "LATE", "CNCO", "OPEN", "CNOL", "OPNL", "MCTP", "EXHT"]);
const clase = (id) => {
  const c = conditionOf(id);
  if (!c) return "SIN_CODIGO";
  if (BASURA.has(c.code)) return "BASURA";
  if (MULTI.has(c.code)) return "MULTI";
  if (ACC_OPC.has(c.code)) return "ACC_OPC";
  if (UNA_PATA.has(c.code)) return "UNA_PATA";
  return "OTRO";
};

const conCad = new Set(tickersConCadena().filter((t) => cierres(t)));
const diasCad = new Map([...conCad].map((t) => [t, new Set(diasDe(t))]));

const porLado = new Map();          // side -> {n, prem, pos:[], clases:Map}
const porClase = new Map();
let total = 0, sinQuote = 0;
const porTicker = new Map();
const laddersDia = new Map();

const dias = diasFlujo("100k");
for (const dia of dias) {
  const filas = leerDia(dia, "100k");
  const dY = dia.replace(/-/g, "");
  for (const o of filas) {
    total++;
    const cl = clase(o.trade_condition_id);
    porClase.set(cl, (porClase.get(cl) ?? 0) + 1);
    const s = o.side ?? "NULO";
    if (!porLado.has(s)) porLado.set(s, { n: 0, prem: 0, pos: [], clases: new Map(), et: [] });
    const L = porLado.get(s);
    L.n++; L.prem += o.premium;
    L.clases.set(cl, (L.clases.get(cl) ?? 0) + 1);
    const h = o.ask_price - o.bid_price;
    if (h > 0) L.pos.push((o.price - o.bid_price) / h); else sinQuote++;
    L.et.push(Number(o.timestamp.slice(11, 13)) - 4 + Number(o.timestamp.slice(14, 16)) / 60);
    const q = parseOCC(o.symbol);
    if (q) {
      if (!porTicker.has(q.raiz)) porTicker.set(q.raiz, { n: 0, prem: 0, cad: conCad.has(q.raiz) });
      const T = porTicker.get(q.raiz); T.n++; T.prem += o.premium;
    }
  }
  laddersDia.set(dia, filas.length);
}

console.log(`\n${"█".repeat(100)}`);
console.log(`URGENCIA · 0 — CENSO de los ${fmt(total)} prints (${dias.length} días: ${dias[0]} → ${dias[dias.length - 1]})`);
console.log(`${"█".repeat(100)}\n`);

console.log(`CLASE DE OPERACIÓN (código OPRA real):`);
for (const [c, n] of [...porClase.entries()].sort((a, b) => b[1] - a[1]))
  console.log(`   ${c.padEnd(10)} ${fmt(n).padStart(10)}  ${((100 * n) / total).toFixed(2).padStart(6)}%`);

console.log(`\nETIQUETA \`side\` — y DÓNDE cayó el precio en la horquilla (0 = bid, 1 = ask):`);
console.log(`   ${"side".padEnd(11)} ${"n".padStart(10)} ${"%".padStart(6)} ${"prima $M".padStart(10)}  ${"pos p10".padStart(8)} ${"p50".padStart(7)} ${"p90".padStart(7)}  ${"unaPata%".padStart(9)} ${"hora med".padStart(9)}`);
const ladosOut = [];
for (const [s, L] of [...porLado.entries()].sort((a, b) => b[1].n - a[1].n)) {
  const p = L.pos.length ? L.pos : [NaN];
  const up = (L.clases.get("UNA_PATA") ?? 0) / L.n;
  console.log(`   ${s.padEnd(11)} ${fmt(L.n).padStart(10)} ${((100 * L.n) / total).toFixed(2).padStart(5)}% ${fmt(L.prem / 1e6).padStart(10)}  ${pctl(p, 0.1).toFixed(2).padStart(8)} ${pctl(p, 0.5).toFixed(2).padStart(7)} ${pctl(p, 0.9).toFixed(2).padStart(7)}  ${(100 * up).toFixed(1).padStart(8)}% ${media(L.et).toFixed(2).padStart(9)}`);
  ladosOut.push({ side: s, n: L.n, pct: L.n / total, primaM: L.prem / 1e6, p10: pctl(p, 0.1), p50: pctl(p, 0.5), p90: pctl(p, 0.9), unaPata: up });
}

console.log(`\nTICKERS — los 15 de más prima, y si tenemos CADENA:`);
const tk = [...porTicker.entries()].sort((a, b) => b[1].prem - a[1].prem);
const primaTot = tk.reduce((a, x) => a + x[1].prem, 0), nTot = tk.reduce((a, x) => a + x[1].n, 0);
for (const [t, v] of tk.slice(0, 15))
  console.log(`   ${t.padEnd(7)} ${fmt(v.n).padStart(9)} prints  ${((100 * v.prem) / primaTot).toFixed(2).padStart(6)}% de la prima   ${v.cad ? "cadena ✔" : "SIN CADENA ✗"}`);
const cubPr = tk.filter((x) => x[1].cad).reduce((a, x) => a + x[1].prem, 0) / primaTot;
const cubN = tk.filter((x) => x[1].cad).reduce((a, x) => a + x[1].n, 0) / nTot;
console.log(`\n   COBERTURA con cadena+cierres: ${(100 * cubN).toFixed(1)}% de los prints · ${(100 * cubPr).toFixed(1)}% de la prima`);

writeFileSync("scripts/cache-theta/marketsnack/urg2-censo.json", JSON.stringify({ total, dias: dias.length, clases: [...porClase], lados: ladosOut, cobPrints: cubN, cobPrima: cubPr }, null, 1));
console.log(`\n   → scripts/cache-theta/marketsnack/urg2-censo.json\n`);
