// SEGUIR EL PRINT — el cierre: el peaje contra el movimiento, el racimo ante la barrera,
// y la unica regla que sobrevive: la cinta como MAPA DE LIQUIDEZ.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/seguir-print-cierre.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { media, sd, tUna, pctl, fmt, nEfectiva } from "./print-lib.mjs";
import { pasarBarrera, informe, listonT } from "../lib/barreraHallazgos.ts";

const CUENTA = 56389;
const todo = JSON.parse(readFileSync("scripts/seguir-print-filas.json", "utf8"));
const ASKA = todo.filter((f) => f.lado === 1);
const pc = (x) => (Number.isFinite(x) ? (x >= 0 ? "+" : "-") + (Math.abs(x) * 100).toFixed(2) + "%" : " n/a");
function tPorDia(fs, f) {
  const m = new Map();
  for (const x of fs) { const v = f(x); if (!Number.isFinite(v)) continue; if (!m.has(x.fechaY)) m.set(x.fechaY, []); m.get(x.fechaY).push(v); }
  const d = [...m.values()].map(media);
  return { t: tUna(d), nDias: d.length, m: media(d) };
}

console.log("\n" + "=".repeat(112));
console.log("SEGUIR EL PRINT · CIERRE");
console.log("=".repeat(112));

// ── 1. EL PEAJE CONTRA EL MOVIMIENTO ────────────────────────────────────────────────────────
console.log("\n## 1. QUE parte de la perdida es PEAJE y que parte es que el contrato se movio mal");
console.log("     (medio-a-medio NO es dinero: es diagnostico. El dinero es ask->bid.)");
console.log("   umbral    k    n      ask->bid (dinero)   medio-a-medio (diagnostico)   PEAJE = diferencia");
for (const P of [250e3, 1e6, 5e6]) {
  for (const k of [1, 5, 10]) {
    const fs = ASKA.filter((f) => f.prima >= P && Number.isFinite(f[`r${k}`]) && Number.isFinite(f[`m${k}`]));
    if (fs.length < 50) continue;
    const r = media(fs.map((f) => f[`r${k}`])), m = media(fs.map((f) => f[`m${k}`]));
    console.log(`   >=$${(P / 1e6).toFixed(2)}M ${String(k).padStart(3)} ${String(fs.length).padStart(6)}      ${pc(r).padStart(8)}` +
      `              ${pc(m).padStart(8)}                   ${pc(r - m).padStart(8)}`);
  }
}

// ── 2. EL RACIMO ANTE LA BARRERA ────────────────────────────────────────────────────────────
console.log("\n\n## 2. EL RACIMO ante la barrera — la unica celda que asomo (>=2 prints al mismo contrato, k=5)");
const rac = ASKA.filter((f) => f.nPrints >= 2 && Number.isFinite(f.r5) && Number.isFinite(f.h5));
const V = pasarBarrera(
  rac.map((f) => ({ pnl: f.r5 - f.h5, ticker: f.ticker, fecha: f.fecha, n: f.nPrints })),
  (f) => f.n, { pruebas: 44, nMinimo: 200, maxPorTicker: 0.2 },
);
console.log(informe(V, "racimo >=2 prints, k=5, contra los vecinos de igual horquilla"));
const dR = tPorDia(rac, (f) => f.r5 - f.h5);
console.log(`   media diaria ${pc(dR.m)} · t por dia ${dR.t.toFixed(2)} · ${dR.nDias} dias · liston para 44 pruebas ${listonT(44)}`);
// ¿el racimo aguanta en el ARM DEL BID? Si el vendedor con prisa da lo mismo, no es conviccion.
const racB = todo.filter((f) => f.lado === -1 && f.nPrints >= 2 && Number.isFinite(f.r5) && Number.isFinite(f.h5));
const dRB = tPorDia(racB, (f) => f.r5 - f.h5);
console.log(`   MISMO racimo pero AL BID (control): n=${fmt(racB.length)} media diaria ${pc(dRB.m)} t=${dRB.t.toFixed(2)}`);
console.log(`   -> si el vendedor con prisa da lo mismo que el comprador con prisa, no es conviccion: es liquidez.`);

// ── 3. LA CINTA COMO MAPA DE LIQUIDEZ ───────────────────────────────────────────────────────
console.log("\n\n## 3. LO QUE SI SOBREVIVE — la cinta es un MAPA DE LIQUIDEZ");
const hh = todo.filter((f) => Number.isFinite(f.horqAzar) && Number.isFinite(f.horqVec) && Number.isFinite(f.nCand));
const hP = hh.map((f) => f.horq), hA = hh.map((f) => f.horqAzar);
console.log(`   n=${fmt(hh.length)} contratos-dia · ${media(hh.map((f) => f.nCand)).toFixed(0)} contratos por vencimiento de media`);
console.log(`   horquilla del contrato que acaba de imprimir : ${(media(hP) * 100).toFixed(2)}%   (mediana ${(pctl(hP, 0.5) * 100).toFixed(2)}%)`);
console.log(`   horquilla de un contrato SORTEADO del mismo vencimiento: ${(media(hA) * 100).toFixed(2)}%   (mediana ${(pctl(hA, 0.5) * 100).toFixed(2)}%)`);
const ahorro = media(hh.map((f) => f.horqAzar - f.horq));
console.log(`   AHORRO por entrada: ${(ahorro * 100).toFixed(2)} puntos de la prima · ida y vuelta ${(ahorro * 200).toFixed(2)} puntos`);
const gana = hh.filter((f) => f.horq < f.horqAzar).length / hh.length;
console.log(`   el contrato de la cinta es el mas barato en ${(gana * 100).toFixed(1)}% de los casos`);
// por ticker, para que no sea "esto es SPX"
console.log("\n   por ticker (los que tienen >=200 eventos):");
const porTk = new Map();
for (const f of hh) { if (!porTk.has(f.ticker)) porTk.set(f.ticker, []); porTk.get(f.ticker).push(f); }
const filasTk = [];
for (const [t, v] of [...porTk].sort((a, b) => b[1].length - a[1].length)) {
  if (v.length < 200) continue;
  const p = media(v.map((f) => f.horq)), a = media(v.map((f) => f.horqAzar));
  filasTk.push({ ticker: t, n: v.length, horqPrint: p, horqAzar: a, ahorro: a - p });
  console.log(`     ${t.padEnd(6)} n=${String(v.length).padStart(5)}  cinta ${(p * 100).toFixed(2).padStart(6)}%  sorteo ${(a * 100).toFixed(2).padStart(6)}%  ahorro ${((a - p) * 100).toFixed(2).padStart(6)} pts`);
}
console.log(`   tickers en los que el ahorro es POSITIVO: ${filasTk.filter((x) => x.ahorro > 0).length} de ${filasTk.length}`);

// ── 4. EL DINERO ────────────────────────────────────────────────────────────────────────────
console.log("\n\n## 4. EL DINERO — sobre $" + fmt(CUENTA) + ", con precios reales");
const dinero = {};
for (const [nom, P, k] of [["seguir el print >=$1M, salir a 5 dias", 1e6, 5], ["seguir el print >=$5M, salir a 5 dias", 5e6, 5], ["seguir el print >=$250k, salir a 3 dias", 250e3, 3]]) {
  const fs = ASKA.filter((f) => f.prima >= P && Number.isFinite(f[`r${k}`]));
  const ret = media(fs.map((f) => f[`r${k}`]));
  const prima = media(fs.map((f) => f.ask)) * 100;
  const cap = CUENTA * 0.10;
  const contratos = Math.max(0, Math.floor(cap / prima));
  const capReal = contratos * prima;
  const ciclos = 365 / k;
  const anual = capReal * ret * ciclos;
  const ne = nEfectiva(fs, k);
  dinero[nom] = { n: fs.length, nEf: ne.porTicker, ret, prima, contratos, capReal, ciclos, anual };
  console.log(`   ${nom}`);
  console.log(`     n=${fmt(fs.length)} (nEf ${ne.porTicker}) · prima media $${fmt(prima)}/contrato · con el 10% ($${fmt(cap)}) caben ${contratos} contrato(s) = $${fmt(capReal)}`);
  console.log(`     ret/op ${pc(ret)} · ${ciclos.toFixed(0)} ciclos/ano  ->  ${anual >= 0 ? "+" : "-"}$${fmt(Math.abs(anual))}/ano   (comprar SPY: +$${fmt(cap * 0.14)}/ano)`);
}
// la regla de liquidez, en dinero: cuanto se ahorra por operacion si igualmente ibas a comprar
const primaEsq = 5639;
console.log(`\n   REGLA DE LIQUIDEZ en dinero: si ibas a comprar una opcion igualmente, con $${fmt(primaEsq)} comprometidos`);
console.log(`     ahorro por ida y vuelta ${(ahorro * 200).toFixed(2)}% de la prima = $${fmt(primaEsq * ahorro * 2)} por operacion`);
for (const ciclos of [12, 24]) console.log(`     a ${ciclos} operaciones/ano: +$${fmt(primaEsq * ahorro * 2 * ciclos)}/ano de coste evitado`);

writeFileSync("scripts/seguir-print-cierre.json", JSON.stringify({
  peaje: true, racimo: { barrera: V, tDia: dR, bid: dRB, n: rac.length },
  liquidez: { horqPrint: media(hP), horqAzar: media(hA), ahorro, gana, porTicker: filasTk },
  dinero,
}, null, 1));
console.log("\n   -> scripts/seguir-print-cierre.json\n");
