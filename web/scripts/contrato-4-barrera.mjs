// EL CONTRATO QUE ELIGEN · 4 — LA BARRERA, BIEN APLICADA.
//
// En el pase 3 llamé a pasarBarrera() con el PROPIO resultado como criterio de ordenación. Eso
// pregunta "¿el tercio con más beneficio tiene más beneficio que el tercio con menos?", que da
// que sí siempre. El t=16,81 que imprimió NO SIGNIFICA NADA y queda retirado.
//
// pasarBarrera() ordena por un PREDICTOR y mide la separación del RESULTADO entre el tercio alto
// y el bajo. Aquí el predictor es lo que el encargo pregunta: el TAMAÑO DE LA PRIMA del print y
// la DISTANCIA al dinero. ¿Elige mejor el dinero más grande?
//
// Se corre sobre el emparejamiento GENEROSO (5 vecinos de horquilla más parecida) de contrato-1,
// que es el que MÁS favorece al hallazgo. Si no pasa aquí, con el calibre estricto tampoco.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/contrato-4-barrera.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { media, tUna, fmt, nEfectiva } from "./print-lib.mjs";
import { pasarBarrera, listonT } from "../lib/barreraHallazgos.ts";

const PRUEBAS = 60, LISTON = listonT(PRUEBAS), K_SAL = 5;
const filas = JSON.parse(readFileSync("scripts/contrato-1-filas.json", "utf8"));
for (const f of filas) f.exc = f.ret - media(f.vecEmp);
const ESQ = (x) => x.dist >= 0.03 && x.dist <= 0.08 && x.dte >= 60 && x.dte <= 120;

console.log(`\n${"═".repeat(104)}`);
console.log(`LA BARRERA — ¿el TAMAÑO de la prima o la DISTANCIA eligen mejor? (emparejamiento generoso)`);
console.log(`${"═".repeat(104)}`);
console.log(`  ${fmt(filas.length)} operaciones al ask · listón |t| ${LISTON}\n`);

const CASOS = [
  ["TODA la rejilla · ordena por PRIMA", filas, (f) => f.prem],
  ["TODA la rejilla · ordena por DISTANCIA", filas, (f) => f.dist],
  ["TODA la rejilla · ordena por PLAZO", filas, (f) => f.dte],
  ["ESQUINA BARATA · ordena por PRIMA", filas.filter(ESQ), (f) => f.prem],
  ["ESQUINA BARATA · ordena por HORA", filas.filter(ESQ), (f) => f.et],
];
const salida = [];
for (const [nombre, f, crit] of CASOS) {
  const v = pasarBarrera(f.map((x) => ({ pnl: x.exc, ticker: x.ticker, fecha: x.fecha, c: crit(x) })), (x) => x.c,
    { pruebas: PRUEBAS, nMinimo: 200, maxPorTicker: 0.2 });
  console.log(`  ${nombre}`);
  console.log(`     n=${fmt(f.length)} · separación tercio alto − bajo: ${v.detalle.sep === null ? "—" : (100 * v.detalle.sep).toFixed(2) + "%"} · t=${v.detalle.t?.toFixed(2) ?? "—"} · ¿PASA? ${v.pasa ? "SÍ" : "NO"}`);
  for (const m of v.motivos) console.log(`        ✗ ${m}`);
  for (const t of v.detalle.tercios) console.log(`        tercio ${t.periodo}  n=${fmt(t.n)}  sep ${(100 * t.sep).toFixed(2)}%  t ${t.t.toFixed(2)}`);
  console.log("");
  salida.push({ caso: nombre, n: f.length, sep: v.detalle.sep, t: v.detalle.t, pasa: v.pasa, motivos: v.motivos, tercios: v.detalle.tercios });
}

// ── cuánta muestra haría falta ──────────────────────────────────────────────────────────────
console.log(`${"═".repeat(104)}`);
console.log(`CUÁNTOS DÍAS FALTARÍAN — para que el candidato menos malo llegue al listón`);
console.log(`${"═".repeat(104)}\n`);
const tPorDia = (f, get) => {
  const m = new Map();
  for (const x of f) { if (!m.has(x.fechaY)) m.set(x.fechaY, []); m.get(x.fechaY).push(get(x)); }
  return tUna([...m.values()].map(media));
};
const DIAS_HOY = 86;
const cands = [
  ["ESQUINA BARATA, prima $250k-1M", filas.filter((x) => ESQ(x) && x.prem >= 250e3 && x.prem < 1e6)],
  ["ESQUINA BARATA, todo", filas.filter(ESQ)],
  ["TODA la rejilla", filas],
];
const falta = [];
for (const [nombre, f] of cands) {
  if (f.length < 40) continue;
  const t = tPorDia(f, (x) => x.exc);
  const ne = nEfectiva(f, K_SAL);
  const factor = (LISTON / Math.abs(t)) ** 2;
  const diasNec = Math.ceil(DIAS_HOY * factor);
  console.log(`  ${nombre.padEnd(34)} n=${String(f.length).padStart(5)} · nEf ${String(ne.porTicker).padStart(3)} · ventanas ${String(ne.ventanas).padStart(2)} · exceso ${(100 * media(f.map((x) => x.exc))).toFixed(2)}% · t ${t.toFixed(2)}`);
  console.log(`     para llegar a |t|=${LISTON} haría falta ×${factor.toFixed(1)} de muestra = ${fmt(diasNec)} días de flujo → ${fmt(Math.max(0, diasNec - DIAS_HOY))} días MÁS (≈ ${((diasNec - DIAS_HOY) / 21).toFixed(0)} meses de mercado)`);
  falta.push({ nombre, n: f.length, nEf: ne.porTicker, ventanas: ne.ventanas, exceso: media(f.map((x) => x.exc)), t, diasNec, diasMas: Math.max(0, diasNec - DIAS_HOY) });
}

writeFileSync("scripts/contrato-4-barrera.json", JSON.stringify({ LISTON, casos: salida, falta }, null, 1));
console.log(`\n  → scripts/contrato-4-barrera.json\n`);
