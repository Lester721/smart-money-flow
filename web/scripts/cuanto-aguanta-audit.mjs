// AUDITORÍA de la simulación de caja. Se comprueba ANTES de reportar nada.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/cuanto-aguanta-audit.mjs
//
//  1. El peor día, pata a pata, leído OTRA VEZ del CSV crudo (no de la caché).
//  2. La aritmética de la caja, recalculada con un acumulador independiente.
//  3. El cruce contra la caché que construyó otro agente (amplitud-riesgo-dias.json).
//  4. Los días de abril de 2024 donde la caja se pone en rojo.
//  5. El reparto de días por año (el $/año depende de cuántos días tiene cada año).

import { readFileSync, existsSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const J = JSON.parse(readFileSync("scripts/cuanto-aguanta-dias.json", "utf8"));
const D = J.dias;

// ── 1 · EL PEOR DÍA, RELEÍDO DEL CSV CRUDO ──────────────────────────────────────────────────
const peor = D.reduce((a, b) => (b.A.pl < a.A.pl ? b : a));
console.log(`\n### 1 · EL PEOR DÍA del cóndor de hoy: ${peor.fecha} · P&L en caché ${eur(peor.A.pl)}\n`);

function crudo(fecha, right, hora) {
  const lin = readFileSync(`${DIR}/iv_${fecha}_${right}.csv`, "utf8").trim().split("\n");
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const [iK, iT, iB, iA, iU] = ["strike", "timestamp", "bid", "ask", "underlying_price"].map((c) => cab.indexOf(c));
  const filas = []; let cierre = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    const h = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && h >= hFin) { hFin = h; cierre = sp; }
    if (h === hora) { const K = Number(c[iK]), b = Number(c[iB]), a = Number(c[iA]); if (K > 0 && b >= 0 && a > 0) filas.push({ K, bid: b, ask: a, spot: sp }); }
  }
  return { filas, cierre, hFin };
}
const C = crudo(peor.fecha, "C", "11:00"), P = crudo(peor.fecha, "P", "11:00");
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));
const sp = C.filas[0].spot;
const cC = cerca(C.filas, sp + 25), pC = cerca(P.filas, sp - 25);
const cL = cerca(C.filas, cC.K + 50), pL = cerca(P.filas, pC.K - 50);
console.log(`spot 11:00 = ${sp} · cierre = ${C.cierre} (última marca ${C.hFin})`);
console.log(`| pata | strike | precio usado | lado |`);
console.log(`|---|---|---|---|`);
console.log(`| vende CALL | ${cC.K} | bid ${cC.bid} | cobra |`);
console.log(`| compra CALL | ${cL.K} | ask ${cL.ask} | paga |`);
console.log(`| vende PUT | ${pC.K} | bid ${pC.bid} | cobra |`);
console.log(`| compra PUT | ${pL.K} | ask ${pL.ask} | paga |`);
const cred = cC.bid + pC.bid - cL.ask - pL.ask;
const S = C.cierre;
const pl = (cred - Math.min(Math.max(S - cC.K, 0), cL.K - cC.K) - Math.min(Math.max(pC.K - S, 0), pC.K - pL.K)) * 100 - 8 * 0.03;
console.log(`crédito = ${cred.toFixed(2)} × 100 = ${eur(cred * 100)} · el cierre ${S} rompe el corto ${S > cC.K ? "CALL" : S < pC.K ? "PUT" : "ninguno"}`);
console.log(`P&L recalculado = ${eur(pl)} · en caché = ${eur(peor.A.pl)} · **${Math.abs(pl - peor.A.pl) < 0.01 ? "COINCIDE" : "NO COINCIDE"}**`);
console.log(`(pérdida máxima teórica de un ala de 50 = $5.000 − crédito ${eur(cred * 100)} − $0,24 = ${eur(5000 - cred * 100 - 0.24)})`);

// ── 2 · LA CAJA, RECALCULADA CON UN ACUMULADOR INDEPENDIENTE ────────────────────────────────
console.log(`\n### 2 · LA CAJA recalculada aparte (1 contrato del cóndor de hoy)\n`);
let c = 7977, pico = 7977, dd = 0, min = 7977, fMin = "", rojo = null, llam = null, it = 0, prev = D[0].fecha;
for (const d of D) {
  const nd = (new Date(d.fecha + "T00:00:00Z") - new Date(prev + "T00:00:00Z")) / 86400000; prev = d.fecha;
  if (c < 0 && nd > 0) { const i2 = c * 0.05 * nd / 365; it += i2; c += i2; }
  c += d.A.pl;
  if (c > pico) pico = c;
  if (pico - c > dd) dd = pico - c;
  if (c < min) { min = c; fMin = d.fecha; }
  if (c < 0 && !rojo) rojo = d.fecha;
  if (c < -0.70 * 48135 && !llam) llam = d.fecha;
}
const anos = (new Date(D[D.length - 1].fecha + "T00:00:00Z") - new Date(D[0].fecha + "T00:00:00Z")) / 86400000 / 365.25;
console.log(`final ${eur(c)} · neto ${eur(c - 7977)} · años ${anos.toFixed(2)} · $/año ${eur((c - 7977) / anos)}`);
console.log(`caída máxima ${eur(-dd)} · caja mínima ${eur(min)} (${fMin}) · primer rojo ${rojo || "nunca"} · llamada ${llam || "no"} · interés ${eur(it)}`);
console.log(`suma directa de los P&L = ${eur(D.reduce((a, d) => a + d.A.pl, 0))} (debe cuadrar con el neto salvo el interés)`);

// ── 3 · CRUCE contra la caché de otro agente ────────────────────────────────────────────────
console.log(`\n### 3 · CRUCE contra scripts/amplitud-riesgo-dias.json (construida por otro agente)\n`);
if (existsSync("scripts/amplitud-riesgo-dias.json")) {
  const O = JSON.parse(readFileSync("scripts/amplitud-riesgo-dias.json", "utf8")).dias;
  const m = new Map(O.map((d) => [d.fecha, d]));
  let n = 0, dif25 = 0, dif30 = 0, difMax = 0;
  for (const d of D) {
    const o = m.get(d.fecha); if (!o) continue;
    n++;
    const e25 = Math.abs(o.pnl["25"] - d.A.pl), e30 = Math.abs(o.pnl["30"] - d.B.pl);
    if (e25 > 0.01) dif25++; if (e30 > 0.01) dif30++;
    difMax = Math.max(difMax, e25, e30);
  }
  console.log(`${n} fechas en común de ${D.length} · discrepancias en ±25: ${dif25} · en ±30: ${dif30} · máxima diferencia ${difMax.toFixed(4)}`);
} else console.log("no existe — no se cruza");

// ── 4 · ABRIL DE 2024, día a día ────────────────────────────────────────────────────────────
console.log(`\n### 4 · ABRIL DE 2024 — dónde se pone en rojo la caja (1 contrato)\n`);
console.log("| fecha | ±25/50 P&L | caja | ±30/50 P&L | opera filtro | caja filtro |");
console.log("|---|---|---|---|---|---|");
let cA = 7977, cB = 7977;
for (const d of D) {
  if (d.fecha < "2024-04-01") { cA += d.A.pl; if (d.opera) cB += d.B.pl; continue; }
  if (d.fecha > "2024-05-05") break;
  cA += d.A.pl; const ope = d.opera === true; if (ope) cB += d.B.pl;
  console.log(`| ${d.fecha} | ${eur(d.A.pl)} | ${eur(cA)} | ${eur(d.B.pl)} | ${ope ? "sí" : "NO"} | ${eur(cB)} |`);
}

// ── 5 · DÍAS POR AÑO ────────────────────────────────────────────────────────────────────────
console.log(`\n### 5 · DÍAS POR AÑO (SPXW no tenía vencimiento diario todos los días en 2022)\n`);
const porAno = {};
for (const d of D) porAno[d.ano] = (porAno[d.ano] || 0) + 1;
console.log("| año | sesiones en la muestra | días que pasa el filtro |");
console.log("|---|---|---|");
for (const a of Object.keys(porAno).sort()) console.log(`| ${a} | ${porAno[a]} | ${D.filter((d) => d.ano === Number(a) && d.opera).length} |`);
