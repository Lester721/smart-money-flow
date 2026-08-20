// LA REPETICIÓN · 0 — CENSO. Qué hay ahí antes de medir nada.
//
// La unidad NO es el print: es el RACIMO — varios prints del MISMO contrato, del MISMO lado,
// el MISMO día. Antes de preguntar si predice, hay que saber cuántos hay, de qué tamaño, de
// cuántos activos, y cuántos caen en activos con cadena en disco (los únicos medibles).
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/rep-0-censo.mjs

import { writeFileSync } from "node:fs";
import { diasFlujo, leerDia, parseOCC } from "./ventana-lib.mjs";
import { tickersConCadena, diasDe, cierres, fmt, media, pctl } from "./print-lib.mjs";

const ASK = new Set(["ABOVE_ASK", "AT_ASK", "ASKSIDE"]);
const BID = new Set(["BELOW_BID", "AT_BID", "BIDSIDE"]);

// Códigos OPRA. La clasificación de MarketSnack está mal: MESL/MFSL/MASL son MULTI-PATA
// ejecutadas contra cotizaciones de una pata, y su filtro las llama "single leg".
const MULTI = new Set([232, 233, 234, 235, 236, 238, 239, 246, 247]);
const BASURA = new Set([201, 202, 203, 204, 205, 206, 207, 208, 248]);
const ACCOPC = new Set([237, 240, 241, 242, 243, 244, 245]);

const conCad = new Set(tickersConCadena().filter((t) => cierres(t)));
const diasCad = new Map([...conCad].map((t) => [t, new Set(diasDe(t))]));

console.log(`\n${"#".repeat(100)}`);
console.log(`LA REPETICION · 0 — CENSO DE RACIMOS`);
console.log(`${"#".repeat(100)}\n`);

const dias = diasFlujo("100k");
console.log(`  ${dias.length} días de flujo: ${dias[0]} -> ${dias[dias.length - 1]}\n`);

const racimos = [];               // un objeto por (día, contrato, lado) con >=1 print single-leg
let nPrints = 0, nMulti = 0, nBasura = 0, nAccOpc = 0, nSingle = 0, nSinOCC = 0;

for (const dia of dias) {
  const crudos = leerDia(dia, "100k");
  if (!crudos.length) continue;
  const dY = dia.replace(/-/g, "");
  const g = new Map();
  for (const o of crudos) {
    nPrints++;
    const cid = o.trade_condition_id;
    if (BASURA.has(cid)) { nBasura++; continue; }
    if (MULTI.has(cid)) { nMulti++; continue; }
    if (ACCOPC.has(cid)) { nAccOpc++; continue; }
    nSingle++;
    const q = parseOCC(o.symbol);
    if (!q) { nSinOCC++; continue; }
    const lado = ASK.has(o.side) ? 1 : BID.has(o.side) ? -1 : 0;
    if (lado === 0) continue;
    // hora de Nueva York (el timestamp es UTC con Z; verano = UTC-4)
    const et = Number(o.timestamp.slice(11, 13)) - 4 + Number(o.timestamp.slice(14, 16)) / 60 + Number(o.timestamp.slice(17, 19)) / 3600;
    const k = `${o.symbol}|${lado}`;
    let r = g.get(k);
    if (!r) { r = { dY, dia, sym: o.symbol, tk: q.raiz, exp: q.exp, tipo: q.tipo, K: q.strike, lado, n: 0, prem: 0, size: 0, t0: 99, t1: -99, S: o.asset_price, primas: [] }; g.set(k, r); }
    r.n++; r.prem += o.premium; r.size += o.size;
    if (et < r.t0) r.t0 = et;
    if (et > r.t1) r.t1 = et;
    r.primas.push(o.premium);
    if (o.asset_price) r.S = o.asset_price;
  }
  for (const r of g.values()) racimos.push(r);
}

console.log(`${"=".repeat(100)}`);
console.log(`1. DE QUE ESTA HECHA LA CINTA (por código OPRA real, no por heurística)`);
console.log(`${"=".repeat(100)}\n`);
const P = (x) => `${fmt(x)}  ${((100 * x) / nPrints).toFixed(2)}%`;
console.log(`   prints totales          ${fmt(nPrints)}`);
console.log(`   MULTI-PATA (fuera)      ${P(nMulti)}   <- incluye MESL/MFSL/MASL que MS llama "single"`);
console.log(`   BASURA (fuera)          ${P(nBasura)}   canceladas, tardías, fuera de horario`);
console.log(`   ACCION+OPCION (fuera)   ${P(nAccOpc)}`);
console.log(`   UNA PATA (se usa)       ${P(nSingle)}   de los que ${fmt(nSinOCC)} sin OCC parseable`);

console.log(`\n${"=".repeat(100)}`);
console.log(`2. RACIMOS: (día, contrato, lado) — cuántos prints caen en el mismo sitio`);
console.log(`${"=".repeat(100)}\n`);
const cubo = (n) => (n >= 20 ? "20+" : n >= 10 ? "10-19" : n >= 5 ? "5-9" : String(n));
const orden = ["1", "2", "3", "4", "5-9", "10-19", "20+"];
const totR = racimos.length;
console.log(`   ${"prints en el racimo".padEnd(22)} ${"racimos".padStart(9)} ${"%".padStart(7)}  ${"prima mediana".padStart(14)} ${"minutos mediana".padStart(16)}`);
for (const b of orden) {
  const sub = racimos.filter((r) => cubo(r.n) === b);
  if (!sub.length) continue;
  const mins = sub.filter((r) => r.n > 1).map((r) => (r.t1 - r.t0) * 60);
  console.log(`   ${b.padEnd(22)} ${fmt(sub.length).padStart(9)} ${((100 * sub.length) / totR).toFixed(2).padStart(6)}%  ${("$" + fmt(pctl(sub.map((r) => r.prem), 0.5))).padStart(14)} ${(mins.length ? pctl(mins, 0.5).toFixed(0) : "-").padStart(16)}`);
}

console.log(`\n${"=".repeat(100)}`);
console.log(`3. LA REJILLA DE LA REGLA: N prints >= · prima total >= · cuántos eventos quedan`);
console.log(`${"=".repeat(100)}\n`);
const NN = [2, 3, 5];
const XX = [1e6, 2.5e6, 5e6, 10e6];
const tabla = [];
console.log(`   ${"".padEnd(10)} ${XX.map((x) => (">=$" + (x / 1e6) + "M").padStart(13)).join(" ")}     [entre paréntesis: con cadena y día]`);
for (const N of NN) {
  const cel = [];
  for (const X of XX) {
    const s = racimos.filter((r) => r.n >= N && r.prem >= X);
    const conC = s.filter((r) => conCad.has(r.tk) && diasCad.get(r.tk)?.has(r.dY));
    cel.push(`${fmt(s.length)}(${fmt(conC.length)})`.padStart(13));
    tabla.push({ N, X, n: s.length, conCadena: conC.length, tickers: new Set(conC.map((r) => r.tk)).size, dias: new Set(conC.map((r) => r.dY)).size });
  }
  console.log(`   N>=${N}       ${cel.join(" ")}`);
}
console.log(`\n   Y el PRINT UNICO (racimo de 1) del mismo tamaño, que es el control de "aporta repetir?":`);
for (const X of XX) {
  const s = racimos.filter((r) => r.n === 1 && r.prem >= X);
  const conC = s.filter((r) => conCad.has(r.tk) && diasCad.get(r.tk)?.has(r.dY));
  console.log(`     N=1 · >=$${(X / 1e6).toFixed(1)}M : ${fmt(s.length).padStart(7)} racimos  (${fmt(conC.length)} con cadena)`);
}

console.log(`\n${"=".repeat(100)}`);
console.log(`4. CONCENTRACION — medir racimos es medir SPX otra vez?`);
console.log(`${"=".repeat(100)}\n`);
for (const [N, X] of [[3, 2.5e6], [2, 1e6], [5, 5e6]]) {
  const s = racimos.filter((r) => r.n >= N && r.prem >= X);
  const c = new Map();
  for (const r of s) c.set(r.tk, (c.get(r.tk) ?? 0) + 1);
  const top = [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  console.log(`   N>=${N} · >=$${(X / 1e6).toFixed(1)}M  (n=${fmt(s.length)}, ${c.size} activos)`);
  console.log(`      ${top.map(([t, n]) => `${t} ${((100 * n) / s.length).toFixed(1)}%${conCad.has(t) ? "" : "(x)"}`).join(" · ")}   ((x) = sin cadena)`);
}

console.log(`\n${"=".repeat(100)}`);
console.log(`5. ES EL RACIMO UN FENOMENO DE MINUTOS O DE TODO EL DIA?`);
console.log(`${"=".repeat(100)}\n`);
{
  const s = racimos.filter((r) => r.n >= 3 && r.prem >= 2.5e6);
  const mins = s.map((r) => (r.t1 - r.t0) * 60);
  console.log(`   racimos N>=3 · >=$2,5M: n=${fmt(s.length)}`);
  console.log(`   minutos entre el primer y el último print — p10 ${pctl(mins, 0.1).toFixed(0)} · mediana ${pctl(mins, 0.5).toFixed(0)} · p90 ${pctl(mins, 0.9).toFixed(0)}`);
  for (const w of [5, 30, 60, 120]) console.log(`      cabe en ${String(w).padStart(3)} min: ${((100 * mins.filter((m) => m <= w).length) / mins.length).toFixed(1)}%`);
  console.log(`\n   fracción de prima del racimo que aporta su print MAYOR:`);
  const dom = s.map((r) => Math.max(...r.primas) / r.prem);
  console.log(`      p10 ${(100 * pctl(dom, 0.1)).toFixed(0)}% · mediana ${(100 * pctl(dom, 0.5)).toFixed(0)}% · p90 ${(100 * pctl(dom, 0.9)).toFixed(0)}%`);
  console.log(`      (si la mediana fuera ~100% el racimo sería un print grande disfrazado)`);
}

writeFileSync("scripts/rep-0-censo.json", JSON.stringify({ nPrints, nMulti, nBasura, nAccOpc, nSingle, totRacimos: totR, tabla }, null, 1));
console.log(`\n  -> scripts/rep-0-censo.json\n`);
