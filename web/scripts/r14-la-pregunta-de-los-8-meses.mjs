// LA PREGUNTA QUE LLEVA TODO EL DÍA ABIERTA
//
// En enero de 2026 el mercado bajó y el 94% de lo que compra la tabla mágica son PUTS.
// El acierto del 96% se desglosa así: comprar caro y dentro del dinero da 37% · que sea put lo
// sube a 58% (eso lo pone el mercado, no la señal) · la señal lo sube a 96%.
//
//   **¿En un mes ALCISTA la señal elige CALLS y acierta igual?**
//
//   · Si sí → hay estrategia.
//   · Si sigue eligiendo puts y falla → es una apuesta bajista con buen disfraz.
//
// Este script se corre en cuanto acabe la descarga de los 8 meses. Usa la tabla maestra, así que
// tarda segundos. Nada de resúmenes del camino: `simular()` lo recorre día a día.

import { cargar, tabla, resumir, cuenta, simular } from "./consultar.mjs";

const R = { objetivo: 1.50, suelo: 0.50 };
const $ = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");

const T = cargar();
const meses = [...new Set(T.map((f) => f.dC.slice(0, 6)))].sort();
console.log(`\n  ${T.length.toLocaleString("en-US")} contratos · meses: ${meses.join(" ")}\n`);

// la tabla mágica, tal como está grabada
const MAGICA = (f) => f.dentro && f.dte >= 5 && f.dte <= 90 && f.vsOI >= 12 && f.ask * 100 >= 10000 && f.hora >= "14:00";
const CUATRO = (f) => f.dentro && f.dte >= 5 && f.dte <= 90 && f.vsOI >= 4 && f.ask * 100 >= 10000;

console.log(`═══ 1. MES A MES ═══\n`);
console.log(`  ${"mes".padEnd(9)} ${"señales".padStart(7)} ${"calls".padStart(6)} ${"puts".padStart(6)} ${"ganan".padStart(6)} ${"RATIO".padStart(7)} ${"dinero".padStart(12)}`);
for (const m of meses) {
  const L = T.filter((f) => f.dC.slice(0, 6) === m && CUATRO(f));
  const r = resumir(L, R);
  if (!r) { console.log(`  ${m.padEnd(9)} ${"0".padStart(7)}`); continue; }
  const c = L.filter((f) => f.l === "C").length, p = L.filter((f) => f.l === "P").length;
  console.log(`  ${m.padEnd(9)} ${String(r.n).padStart(7)} ${String(c).padStart(6)} ${String(p).padStart(6)} ${(r.pg.toFixed(0) + "%").padStart(6)} ${(r.r === Infinity ? "∞" : r.r.toFixed(2)).padStart(7)} ${$(r.neto).padStart(12)}`);
}

console.log(`\n═══ 2. CALLS CONTRA PUTS, mes a mes ═══\n`);
console.log(`  ${"mes".padEnd(9)}   CALLS: n  ganan   RATIO        PUTS: n  ganan   RATIO`);
for (const m of meses) {
  const L = T.filter((f) => f.dC.slice(0, 6) === m && CUATRO(f));
  const c = resumir(L.filter((f) => f.l === "C"), R), p = resumir(L.filter((f) => f.l === "P"), R);
  const fmt = (r) => r ? `${String(r.n).padStart(4)} ${(r.pg.toFixed(0) + "%").padStart(6)} ${(r.r === Infinity ? "∞" : r.r.toFixed(2)).padStart(7)}` : `${"—".padStart(4)} ${"—".padStart(6)} ${"—".padStart(7)}`;
  console.log(`  ${m.padEnd(9)}   ${fmt(c)}        ${fmt(p)}`);
}

console.log(`\n═══ 3. LA RESPUESTA — sólo los meses donde la señal eligió MÁS CALLS QUE PUTS ═══\n`);
const alcistas = meses.filter((m) => {
  const L = T.filter((f) => f.dC.slice(0, 6) === m && CUATRO(f));
  return L.filter((f) => f.l === "C").length > L.filter((f) => f.l === "P").length;
});
console.log(`  meses con más calls que puts: ${alcistas.length ? alcistas.join(" ") : "NINGUNO"}`);
if (alcistas.length) {
  const L = T.filter((f) => alcistas.includes(f.dC.slice(0, 6)) && CUATRO(f));
  tabla([
    ["esos meses, todo", L],
    ["  sus calls", L.filter((f) => f.l === "C")],
    ["  sus puts", L.filter((f) => f.l === "P")],
  ], R);
} else {
  console.log(`\n  ⚠ Si NUNCA elige más calls que puts, la señal es estructuralmente bajista.`);
  console.log(`     Mirar entonces si las calls que sí elige ACIERTAN, aunque sean pocas:`);
  const C = T.filter((f) => CUATRO(f) && f.l === "C");
  tabla([["todas las calls de los 8 meses", C]], R);
}

console.log(`\n═══ 4. LA TABLA MÁGICA COMPLETA, 8 MESES ═══\n`);
const M = T.filter(MAGICA);
tabla([
  ["12x · $10,000+ · después 14:00", M],
  ["  sus calls", M.filter((f) => f.l === "C")],
  ["  sus puts", M.filter((f) => f.l === "P")],
  ["4x · $10,000+ (más señales)", T.filter(CUATRO)],
], R);

console.log(`\n  --- año a año no hay; mes a mes de la tabla mágica ---\n`);
console.log(`  ${"mes".padEnd(9)} ${"n".padStart(4)} ${"gana".padStart(5)} ${"pierde".padStart(7)} ${"RATIO".padStart(7)} ${"dinero".padStart(12)}`);
for (const m of meses) {
  const r = resumir(M.filter((f) => f.dC.slice(0, 6) === m), R);
  if (!r) { console.log(`  ${m.padEnd(9)} ${"0".padStart(4)}`); continue; }
  console.log(`  ${m.padEnd(9)} ${String(r.n).padStart(4)} ${String(r.gana).padStart(5)} ${String(r.pierde).padStart(7)} ${(r.r === Infinity ? "∞" : r.r.toFixed(2)).padStart(7)} ${$(r.neto).padStart(12)}`);
}

console.log(`\n═══ 5. LA CUENTA DE $60,000 SOBRE LOS 8 MESES ═══\n`);
console.log(`  ${"regla".padEnd(34)} ${"$ pos".padEnd(9)} ${"máx".padEnd(4)} ${"ops".padEnd(11)} ${"gana/pierde".padEnd(12)} ${"termina en".padEnd(12)} ganancia`);
for (const [nom, filtro] of [["12x · $10,000+ · 14:00", MAGICA], ["4x · $10,000+", CUATRO]]) {
  for (const [p, m] of [[15000, 4], [12000, 5]]) {
    const c = cuenta(T.filter(filtro), { capital: 60000, porOp: p, maxAbiertas: m, ...R });
    console.log(`  ${nom.padEnd(34)} ${$(p).padEnd(9)} ${String(m).padEnd(4)} ${String(c.tomadas.length).padEnd(11)} ${`${c.gana} / ${c.pierde}`.padEnd(12)} ${$(c.final).padEnd(12)} ${$(c.ganancia)}  (${c.pct.toFixed(0)}%)`);
  }
}
console.log("");
