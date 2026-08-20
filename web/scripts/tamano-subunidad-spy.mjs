// LA SUBUNIDAD · el cóndor de SPY como "décimo de contrato" de SPX
//
// EL PROBLEMA QUE RESUELVE: en SPXW el contrato mínimo pide $5.000 de colateral, que es el 8,9%
// de la cuenta de Lester. No existe "medio contrato": el tamaño va 0 → 8,9% → 17,7%. Estrangular
// el ala para hacerlo más pequeño sale caro (medido en scripts/tamano-dial-justo.mjs).
//
// SPY vale ~1/10 de SPX. El mismo cóndor a escala —cortas a ±2,5 puntos, alas 5 puntos más allá—
// pide $500 de colateral: el 0,9% de la cuenta. Es el dial fino que faltaba, SI el resultado
// escala. La pregunta es si la horquilla se lo come: la horquilla es un % de la PRIMA, y una
// prima diez veces más pequeña paga el mismo tipo de peaje.
//
// DATOS: scripts/cache-theta/spy-0dte/AAAA-MM-DD.json · [hora, lado, strike, bid, ask, iv, spot]
// bid/ask REALES del mismo endpoint de Theta. 1.075 ficheros: 2022 tiene 170 días (SPY no tuvo
// vencimiento diario todo 2022) frente a los 220 de SPX. NO se rellena: se compara en la
// INTERSECCIÓN de fechas y además se informa de SPY por su cuenta.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/tamano-subunidad-spy.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { radiografia } from "../lib/radiografia.ts";
import { listonT, tWelch } from "../lib/barreraHallazgos.ts";

const DIR = "scripts/cache-theta/spy-0dte";
const HORA = "11:00", SEP = 2.5, ALA = 5, COMM = 0.03, PATAS = 8;
const TOTAL0 = 56389, EFECTIVO0 = 7977;

const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const pc = (x) => (x * 100).toFixed(1) + "%";
const med = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const perc = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

// ── construir la serie de SPY ────────────────────────────────────────────────────────────────
const fechas = readdirSync(DIR).map((f) => (f.match(/^(\d{4}-\d{2}-\d{2})\.json$/) || [])[1]).filter(Boolean).sort();
const spy = [];
const desc = { sinFilas: 0, sinSpot: 0, sinCierre: 0, sinAla: 0, creditoNoPositivo: 0 };
for (const fecha of fechas) {
  const j = JSON.parse(readFileSync(`${DIR}/${fecha}.json`, "utf8"));
  if (!Array.isArray(j) || !j.length) { desc.sinFilas++; continue; }
  const C = [], P = [];
  let spot = 0, cierre = 0, hFin = "";
  for (const r of j) {
    const [h, lado, K, bid, ask, , U] = r;
    if (U > 0 && h >= hFin) { hFin = h; cierre = U; }
    if (h !== HORA) continue;
    if (U > 0 && !spot) spot = U;
    if (!(K > 0) || !(bid >= 0) || !(ask > 0)) continue;
    (lado === "C" ? C : P).push({ K, bid, ask });
  }
  if (!(spot > 0)) { desc.sinSpot++; continue; }
  if (!(cierre > 0)) { desc.sinCierre++; continue; }
  if (!C.length || !P.length) { desc.sinFilas++; continue; }
  const cC = cerca(C, spot + SEP), pC = cerca(P, spot - SEP);
  const cL = cerca(C, cC.K + ALA), pL = cerca(P, pC.K - ALA);
  if (cL.K <= cC.K || pL.K >= pC.K) { desc.sinAla++; continue; }
  const cred = cC.bid + pC.bid - cL.ask - pL.ask;
  if (!(cred > 0)) { desc.creditoNoPositivo++; continue; }
  const anc = Math.max(cL.K - cC.K, pC.K - pL.K);
  spy.push({
    fecha, spot11: spot, cierre, movPct: ((cierre - spot) / spot) * 100,
    credito: cred * 100, colateral: anc * 100,
    horquilla: (cC.ask - cC.bid + pC.ask - pC.bid) * 100,
    pl: (cred - Math.min(Math.max(cierre - cC.K, 0), cL.K - cC.K)
             - Math.min(Math.max(pC.K - cierre, 0), pC.K - pL.K)) * 100 - PATAS * COMM,
  });
}
console.log(`ficheros SPY: ${fechas.length} · días con operación: ${spy.length} · descartes: ${JSON.stringify(desc)}`);
radiografia(spy, ["spot11", "cierre", "credito", "horquilla", "pl"], "cóndor SPY 0DTE");

const spx = JSON.parse(readFileSync("scripts/tamano-serie.json", "utf8"));
const mapaSPX = new Map(spx.map((d) => [d.fecha, d]));
const comun = spy.filter((d) => mapaSPX.has(d.fecha));
console.log(`\nfechas en común SPY∩SPX: ${comun.length}`);

// ── métricas ─────────────────────────────────────────────────────────────────────────────────
function met(serie, campo, k = 1, calendario = null) {
  const pls = serie.map((d) => campo(d) * k);
  let eq = 0, pico = 0, peor = 0;
  for (const p of pls) { eq += p; pico = Math.max(pico, eq); peor = Math.max(peor, pico - eq); }
  const total = pls.reduce((a, x) => a + x, 0), n = (calendario ?? serie).length;
  return { n: serie.length, total, porAno: total / (n / 252), peorDia: Math.min(...pls),
    p1: perc(pls, 0.01), p5: perc(pls, 0.05), peorRacha: peor, caida: peor / TOTAL0,
    ganados: pls.filter((x) => x > 0).length / pls.length, pls };
}
const PER = [["TODO 22-26", (d) => true], ["2022-2023", (d) => d.fecha < "2024-01-01"], ["2024-2026", (d) => d.fecha >= "2024-01-01"]];

// ── 1 · SPY POR SU CUENTA ────────────────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(108)}\n1 · EL CÓNDOR DE SPY · cortas a ±2,5 · alas de 5 · colateral ${eur(med(spy.map((d) => d.colateral)))} = ${pc(med(spy.map((d) => d.colateral)) / TOTAL0)} de la cuenta\n${"═".repeat(108)}\n`);
console.log("| período | días | ganados | $/año 1 contrato | peor día | p1 | p5 | peor racha | caída | crédito medio | horquilla media |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const [et, f] of PER) {
  const s = spy.filter(f); if (!s.length) continue;
  const r = met(s, (d) => d.pl);
  console.log(`| ${et} | ${r.n} | ${pc(r.ganados)} | ${eur(r.porAno)} | ${eur(r.peorDia)} | ${eur(r.p1)} | ${eur(r.p5)} | ${eur(-r.peorRacha)} | ${pc(r.caida)} | ${eur(med(s.map((d) => d.credito)))} | ${eur(med(s.map((d) => d.horquilla)))} |`);
}
console.log("\n  Por año:");
console.log("| año | días | ganados | total 1 contrato | peor día | crédito medio | horquilla / crédito |");
console.log("|---|---|---|---|---|---|---|");
for (const a of ["2022", "2023", "2024", "2025", "2026"]) {
  const s = spy.filter((d) => d.fecha.startsWith(a)); if (!s.length) continue;
  const r = met(s, (d) => d.pl);
  console.log(`| ${a} | ${r.n} | ${pc(r.ganados)} | ${eur(r.total)} | ${eur(r.peorDia)} | ${eur(med(s.map((d) => d.credito)))} | ${pc(med(s.map((d) => d.horquilla)) / med(s.map((d) => d.credito)))} |`);
}

// ── 2 · ¿ESCALA? SPY×10 CONTRA SPX, MISMOS DÍAS ──────────────────────────────────────────────
console.log(`\n${"═".repeat(108)}\n2 · ¿ES DE VERDAD UN DÉCIMO? · SPY×10 contra SPX, exactamente los mismos ${comun.length} días\n${"═".repeat(108)}\n`);
console.log("| período | días | SPY×10 $/año | SPX $/año | diferencia | SPY×10 peor día | SPX peor día | SPY×10 caída | SPX caída |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const [et, f] of PER) {
  const s = comun.filter(f); if (s.length < 30) continue;
  const a = met(s, (d) => d.pl * 10);
  const b = met(s.map((d) => mapaSPX.get(d.fecha)), (d) => d.pl);
  console.log(`| ${et} | ${s.length} | ${eur(a.porAno)} | ${eur(b.porAno)} | ${eur(a.porAno - b.porAno)} | ${eur(a.peorDia)} | ${eur(b.peorDia)} | ${pc(a.caida)} | ${pc(b.caida)} |`);
}
const dif = comun.map((d) => d.pl * 10 - mapaSPX.get(d.fecha).pl);
console.log(`\n  diferencia media por día (SPY×10 − SPX): ${eur(med(dif))} · t = ${(med(dif) / (Math.sqrt(dif.reduce((a, x) => a + (x - med(dif)) ** 2, 0) / (dif.length - 1)) / Math.sqrt(dif.length))).toFixed(2)}`);
console.log(`  correlación día a día: ${(() => {
  const x = comun.map((d) => d.pl * 10), y = comun.map((d) => mapaSPX.get(d.fecha).pl);
  const mx = med(x), my = med(y);
  const num = x.reduce((a, _, i) => a + (x[i] - mx) * (y[i] - my), 0);
  return num / Math.sqrt(x.reduce((a, v) => a + (v - mx) ** 2, 0) * y.reduce((a, v) => a + (v - my) ** 2, 0));
})().toFixed(3)}`);

// ── 3 · LA GRANULARIDAD QUE COMPRA ───────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(108)}\n3 · LO QUE COMPRA LA SUBUNIDAD · el tamaño deja de ir a saltos del 8,9%\n${"═".repeat(108)}\n`);
console.log("| nº de cóndores SPY | colateral | % de la cuenta | equivale a SPX | $/año 22-26 | $/año 22-23 | $/año 24-26 | peor día | ¿lo cubre el efectivo? | caída 22-26 |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const k of [1, 2, 3, 5, 8, 10, 15, 20]) {
  const T = met(spy, (d) => d.pl, k), A = met(spy.filter((d) => d.fecha < "2024-01-01"), (d) => d.pl, k), B = met(spy.filter((d) => d.fecha >= "2024-01-01"), (d) => d.pl, k);
  const col = 500 * k;
  console.log(`| ${k} | ${eur(col)} | ${pc(col / TOTAL0)} | ${(k / 10).toFixed(1)} contratos | ${eur(T.porAno)} | ${eur(A.porAno)} | ${eur(B.porAno)} | ${eur(T.peorDia)} | ${Math.abs(T.peorDia) <= EFECTIVO0 ? "sí" : "**NO**"} | ${pc(T.caida)} |`);
}

// ── 4 · LA PRUEBA CRUZADA DEL TAMAÑO EN SPY ──────────────────────────────────────────────────
console.log(`\n${"═".repeat(108)}\n4 · PRUEBA CRUZADA · el mayor nº de cóndores SPY con la caída bajo el techo, elegido en un período y aplicado al otro\n${"═".repeat(108)}\n`);
const A22 = spy.filter((d) => d.fecha < "2024-01-01"), B24 = spy.filter((d) => d.fecha >= "2024-01-01");
const mayor = (s, techo) => { let m = 0; for (let k = 1; k <= 60; k++) { const r = met(s, (d) => d.pl, k); if (r.caida <= techo && Math.abs(r.peorDia) <= EFECTIVO0) m = k; else break; } return m; };
for (const techo of [0.15, 0.25]) {
  console.log(`### techo ${pc(techo)} (${eur(techo * TOTAL0)})\n`);
  console.log("| se elige mirando | nº de cóndores SPY | colateral | $/año ahí | caída ahí | → aplicado a | $/año FUERA | caída FUERA | ¿gana fuera? | ¿respeta el techo? |");
  console.log("|---|---|---|---|---|---|---|---|---|---|");
  for (const [etA, SA, etB, SB] of [["2022-2023", A22, "2024-2026", B24], ["2024-2026", B24, "2022-2023", A22]]) {
    const k = mayor(SA, techo);
    if (!k) { console.log(`| ${etA} | **0** | — | — | — | ${etB} | — | — | — | — |`); continue; }
    const a = met(SA, (d) => d.pl, k), b = met(SB, (d) => d.pl, k);
    console.log(`| ${etA} | ${k} | ${eur(500 * k)} | ${eur(a.porAno)} | ${pc(a.caida)} | ${etB} | ${eur(b.porAno)} | ${pc(b.caida)} | ${b.porAno > 0 ? "SÍ" : "**NO**"} | ${b.caida <= techo ? "SÍ" : "**NO**"} |`);
  }
  const kT = mayor(spy, techo);
  console.log(`\n  sobre los ${spy.length} días juntos: ${kT} cóndores SPY` + (kT ? ` = ${eur(500 * kT)} de colateral · ${eur(met(spy, (d) => d.pl, kT).porAno)}/año · caída ${pc(met(spy, (d) => d.pl, kT).caida)}` : "") + "\n");
}

const PRUEBAS = 8 * 3 + 2 * 2 + 10;
console.log(`${"═".repeat(108)}`);
console.log(`RECUENTO de este script: ${PRUEBAS} pruebas · listón |t| = ${listonT(PRUEBAS)}`);
const p = met(spy, (d) => d.pl).pls, m = med(p);
console.log(`|t| del cóndor SPY sobre ${p.length} días: ${(m / (Math.sqrt(p.reduce((a, x) => a + (x - m) ** 2, 0) / (p.length - 1)) / Math.sqrt(p.length))).toFixed(2)}`);
console.log("═".repeat(108));
