// SEGUIR EL PRINT — la regla que se ejecuta MIRANDO LA PANTALLA: la horquilla del contrato.
// Si la cinta no dice hacia donde, al menos dice DONDE es barato entrar y salir. Se corta por
// deciles de horquilla para poder escribir un numero en la regla.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/seguir-print-regla-pantalla.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { media, pctl, tUna, fmt, nEfectiva } from "./print-lib.mjs";

const CUENTA = 56389, PLAZA = Math.round(CUENTA * 0.10);
const todo = JSON.parse(readFileSync("scripts/seguir-print-filas.json", "utf8"));
const A = todo.filter((f) => f.lado === 1 && Number.isFinite(f.r5) && Number.isFinite(f.m5));
const pc = (x) => (x >= 0 ? "+" : "-") + (Math.abs(x) * 100).toFixed(2) + "%";

console.log("\n" + "=".repeat(110));
console.log("LA REGLA DE PANTALLA — el peaje por horquilla del contrato que la cinta acaba de imprimir");
console.log("=".repeat(110));
console.log("\n## Por tramo de HORQUILLA (lo que Lester ve en la pantalla antes de pulsar)");
console.log("   tramo horquilla     n     peaje ida+vuelta   medio-a-medio(*)   ask->bid (DINERO)   prima mediana");
const tramos = [[0, 0.01], [0.01, 0.02], [0.02, 0.03], [0.03, 0.05], [0.05, 0.08], [0.08, 0.15], [0.15, 9]];
const filas = [];
for (const [lo, hi] of tramos) {
  const fs = A.filter((f) => f.horq >= lo && f.horq < hi);
  if (fs.length < 100) continue;
  const r = media(fs.map((f) => f.r5)), m = media(fs.map((f) => f.m5));
  const prima = pctl(fs.map((f) => f.ask * 100), 0.5);
  filas.push({ lo, hi, n: fs.length, peaje: m - r, mid: m, ret: r, prima });
  console.log(`   ${(lo * 100).toFixed(0).padStart(3)}-${(hi * 100).toFixed(0).padStart(3)}%  ${String(fs.length).padStart(7)}      ${((m - r) * 100).toFixed(2).padStart(6)}%`
    + `           ${pc(m).padStart(8)}         ${pc(r).padStart(8)}          $${fmt(prima)}`);
}
console.log("   (*) medio-a-medio NO es dinero: exige que la orden limitada al medio LLENE. Es el techo, no el resultado.");

// ── EL FILTRO DE PANTALLA: horquilla <= 3% Y esquina barata ────────────────────────────────
console.log("\n\n## EL FILTRO COMPLETO — horquilla <=3% + 3-8% fuera del dinero + 60-120 dias");
const filtro = (f) => f.horq <= 0.03 && f.dist >= 0.03 && f.dist <= 0.08 && f.dte >= 60 && f.dte <= 120;
for (const [nom, fs] of [
  ["todo el flujo >=$250k", A.filter(filtro)],
  ["solo >=$1M", A.filter((f) => filtro(f) && f.prima >= 1e6)],
  ["y ademas asequible (<=$5.639)", A.filter((f) => filtro(f) && f.ask * 100 <= PLAZA)],
]) {
  if (fs.length < 40) { console.log(`   ${nom}: n=${fs.length}, insuficiente`); continue; }
  const r = media(fs.map((f) => f.r5)), m = media(fs.map((f) => f.m5));
  const dH = fs.filter((f) => Number.isFinite(f.h5));
  const exc = media(dH.map((f) => f.r5 - f.h5));
  const ne = nEfectiva(fs, 5);
  const prima = media(fs.map((f) => f.ask)) * 100;
  const contratos = Math.max(1, Math.floor(PLAZA / prima));
  const anual = contratos * prima * r * (365 / 5);
  console.log(`   ${nom.padEnd(32)} n=${String(fs.length).padStart(4)} nEf=${String(ne.porTicker).padStart(3)}/${ne.ventanas}`
    + `  peaje ${((m - r) * 100).toFixed(2)}%  medio ${pc(m)}  DINERO ${pc(r)}  vs vecinos ${pc(exc)}`
    + `  prima $${fmt(prima)}  ->  ${anual >= 0 ? "+" : "-"}$${fmt(Math.abs(anual))}/ano`);
}

// ── LO QUE CUESTA NO MIRAR: el mismo contrato elegido a ojo ─────────────────────────────────
console.log("\n\n## LO QUE CUESTA ELEGIR A OJO — mismo activo, mismo vencimiento, strike al azar");
const hh = todo.filter((f) => Number.isFinite(f.horqAzar));
const barato = hh.filter((f) => f.horq <= 0.03);
console.log(`   contrato de la cinta con horquilla <=3%: ${fmt(barato.length)} de ${fmt(hh.length)} (${(barato.length / hh.length * 100).toFixed(1)}%)`);
console.log(`     su horquilla media ${(media(barato.map((f) => f.horq)) * 100).toFixed(2)}% · la del sorteado del mismo vencimiento ${(media(barato.map((f) => f.horqAzar)) * 100).toFixed(2)}%`);
const ah = media(barato.map((f) => f.horqAzar - f.horq));
console.log(`     ahorro ida y vuelta ${(ah * 200).toFixed(2)} puntos = $${fmt(PLAZA * ah * 2)} por operacion sobre $${fmt(PLAZA)}`);
console.log(`     a 24 operaciones al ano: $${fmt(PLAZA * ah * 2 * 24)} de peaje que NO se paga`);

writeFileSync("scripts/seguir-print-regla-pantalla.json", JSON.stringify({ tramos: filas, ahorroBarato: ah, plaza: PLAZA }, null, 1));
console.log("\n   -> scripts/seguir-print-regla-pantalla.json\n");
