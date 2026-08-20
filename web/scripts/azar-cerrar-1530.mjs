// SI EL MECANISMO ES REAL, HAY UNA REGLA MEJOR QUE SALTARSE EL DÍA.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/azar-cerrar-1530.mjs
//
// EL RAZONAMIENTO. El informe dice que el daño del último día del mes viene de la subasta de
// cierre: el movimiento de 15:30 al cierre es 14,4 pts contra 8,5 (t=3,48) y el mercado no lo
// cobra (crédito $750 contra $669, t=1,17). Si eso es CIERTO, entonces saltarse el día es la
// respuesta cara: renuncias a 5 horas y media de theta para esquivar media hora de riesgo.
// La respuesta barata es CERRAR a las 15:30 y quedarte con lo cobrado hasta ahí.
//
// Y es una prueba que separa mecanismo de suerte:
//   · si el daño está en la última media hora → cerrar a 15:30 recupera casi todo el ingreso
//     Y quita casi toda la caída. La métrica que decide se dispara.
//   · si el daño estaba repartido por el día (o es ruido de la búsqueda de 44 cubos) →
//     cerrar a 15:30 no arregla nada, porque no hay nada concreto que arreglar.
//
// PRECIOS REALES: se cierra pagando el ASK de lo que se vendió y cobrando el BID de lo comprado.
// Las cuatro patas. Cerrar cuesta la horquilla ENTERA otra vez; eso está dentro.

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { tWelch, listonT } from "../lib/barreraHallazgos";

const DIR = "scripts/cache-theta/gex-2026";
const H_SAL = "15:30", COMM = 0.03, DIAS_ANO = 252, EFECTIVO = 7977, CUENTA = 56389;
const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))] : NaN; };
function drawdown(p) { let a = 0, pi = 0, w = 0; for (const x of p) { a += x; if (a > pi) pi = a; if (a - pi < w) w = a - pi; } return w; }

const filas = JSON.parse(readFileSync("scripts/dsem-filas.json", "utf8"));
filas.sort((a, b) => a.fecha.localeCompare(b.fecha));

// ── precios de las MISMAS cuatro patas a las 15:30 ───────────────────────────────────────────
const CAMPOS = ["strike", "timestamp", "bid", "ask"];
function leer1530(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").split("\n");
  if (lin.length < 3) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = CAMPOS.map((c) => cab.indexOf(c));
  if (idx.some((x) => x < 0)) throw new Error(`faltan columnas en ${f}`);
  const [iK, iT, iB, iA] = idx;
  const m = new Map();
  for (let j = 1; j < lin.length; j++) {
    const L = lin[j]; if (L.length < 20) continue;
    const c = L.split(",");
    if (c[iT].slice(11, 16) !== H_SAL) continue;
    m.set(+c[iK], { bid: +c[iB], ask: +c[iA] });
  }
  return m.size ? m : null;
}

console.log("leyendo el precio de salida de las 15:30 en las 1.121 cadenas…");
let sinSalida = 0, hecho = 0;
for (const f of filas) {
  const C = leer1530(f.fecha, "C"), P = leer1530(f.fecha, "P");
  const cC = C?.get(f.kCallCorta), cL = C?.get(f.kCallLarga), pC = P?.get(f.kPutCorta), pL = P?.get(f.kPutLarga);
  if (!cC || !cL || !pC || !pL || !(cC.ask > 0) || !(pC.ask > 0)) { f.plCerrar = null; sinSalida++; }
  else {
    // cerrar = recomprar los cortos al ASK y vender los largos al BID
    const coste = (cC.ask + pC.ask - cL.bid - pL.bid) * 100;
    f.plCerrar = f.credito - coste - 8 * COMM;
  }
  if (++hecho % 200 === 0) console.log(`  ${hecho}/${filas.length}`);
}
console.log(`  ${filas.length - sinSalida} días con precio de salida a las 15:30 · ${sinSalida} sin él`);
if (sinSalida > filas.length * 0.1) throw new Error(`${sinSalida} días sin salida — el dato no está, no se rellena`);

// Los días sin precio de salida NO se rellenan: se dicen y se excluyen de la comparación.
const util = filas.filter((f) => f.plCerrar != null);
console.log(`  se compara sobre los ${util.length} días que tienen las dos cosas.`);

// calendario mínimo: sólo hace falta la bandera de último día del mes
const FEST = new Set(["2022-01-17","2022-02-21","2022-04-15","2022-05-30","2022-06-20","2022-07-04","2022-09-05","2022-11-24","2022-12-26",
"2023-01-02","2023-01-16","2023-02-20","2023-04-07","2023-05-29","2023-06-19","2023-07-04","2023-09-04","2023-11-23","2023-12-25",
"2024-01-01","2024-01-15","2024-02-19","2024-03-29","2024-05-27","2024-06-19","2024-07-04","2024-09-02","2024-11-28","2024-12-25",
"2025-01-01","2025-01-09","2025-01-20","2025-02-17","2025-04-18","2025-05-26","2025-06-19","2025-07-04","2025-09-01","2025-11-27","2025-12-25",
"2026-01-01","2026-01-19","2026-02-16","2026-04-03","2026-05-25","2026-06-19","2026-07-03","2026-09-07","2026-11-26","2026-12-25"]);
const iso = (d) => d.toISOString().slice(0, 10);
const SES = [];
for (let d = new Date("2021-12-01T00:00:00Z"); iso(d) <= "2026-12-31"; d.setUTCDate(d.getUTCDate() + 1)) {
  const s = iso(d), w = d.getUTCDay(); if (w !== 0 && w !== 6 && !FEST.has(s)) SES.push(s);
}
const POS = new Map(SES.map((s, i) => [s, i]));
for (const f of filas) {
  const sig = SES[POS.get(f.fecha) + 1];
  f.ultimoMes = !sig || sig.slice(5, 7) !== f.fecha.slice(5, 7) ? 1 : 0;
  f.periodo = f.fecha < "2024-01-01" ? "A" : "B";
}
writeFileSync("scripts/azar-cerrar-1530.json", JSON.stringify(filas.map((f) => ({ fecha: f.fecha, pl: f.pl, plCerrar: f.plCerrar, ultimoMes: f.ultimoMes }))));

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1 · LO PRIMERO: ¿de verdad se cobra casi todo a las 15:30?
// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(112));
console.log("1 · ¿CUÁNTO SE DEJA UNO POR CERRAR A LAS 15:30 EN VEZ DE AGUANTAR? (precios reales, horquilla entera)");
console.log("═".repeat(112));
console.log("| grupo | n | aguantar al cierre | cerrar 15:30 | diferencia | acierto aguantar | acierto cerrar |");
console.log("|---|---|---|---|---|---|---|");
for (const [et, g] of [["TODOS los días", util], ["fin de mes", util.filter((f) => f.ultimoMes)], ["resto", util.filter((f) => !f.ultimoMes)]]) {
  const a = g.map((f) => f.pl), c = g.map((f) => f.plCerrar);
  console.log(`| ${et} | ${g.length} | ${eur(media(a))} | ${eur(media(c))} | ${eur(media(c) - media(a))} | ${(a.filter((x) => x > 0).length / a.length * 100).toFixed(0)}% | ${(c.filter((x) => x > 0).length / c.length * 100).toFixed(0)}% |`);
}
const dFm = util.filter((f) => f.ultimoMes).map((f) => f.plCerrar - f.pl);
const dRs = util.filter((f) => !f.ultimoMes).map((f) => f.plCerrar - f.pl);
console.log(`\n  LO QUE SE SALVA EN LA ÚLTIMA MEDIA HORA · fin de mes ${eur(media(dFm))} · resto ${eur(media(dRs))} · t=${tWelch(dFm, dRs).toFixed(2)}`);
console.log(`  (si el mecanismo del informe es cierto, ESTE número tiene que ser claramente positivo`);
console.log(`   para el fin de mes y cercano a cero para el resto)`);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2 · LAS TRES REGLAS DE MESA, LADO A LADO, EN LAS DOS MITADES
// ═════════════════════════════════════════════════════════════════════════════════════════════
function ev(g, modo) {
  // modo: "todo" aguanta siempre · "saltar" no opera fin de mes · "cerrar" cierra 15:30 el fin de mes
  const serie = g.map((f) => (modo === "todo" ? f.pl : modo === "saltar" ? (f.ultimoMes ? 0 : f.pl) : (f.ultimoMes ? f.plCerrar : f.pl)));
  const total = serie.reduce((a, b) => a + b, 0);
  let caja = EFECTIVO, min = EFECTIVO;
  for (const x of serie) { caja += x; if (caja < min) min = caja; }
  return { alAno: total / (g.length / DIAS_ANO), dd: drawdown(serie), p5: pct(serie, 0.05), p1: pct(serie, 0.01),
    peor: Math.min(...serie), minCaja: min };
}
console.log("\n" + "═".repeat(112));
console.log("2 · LAS TRES REGLAS DE MESA · A = 2022-2023 (donde el cóndor pierde) · B = 2024-2026 (donde gana)");
console.log("═".repeat(112));
const uA = util.filter((f) => f.periodo === "A"), uB = util.filter((f) => f.periodo === "B");
console.log("| período | regla | $/año | peor racha | peor día | p1 | p5 | caja mínima |");
console.log("|---|---|---|---|---|---|---|---|");
for (const [et, g] of [["2022-2023", uA], ["2024-2026", uB], ["TODO", util]]) {
  for (const [nm, md] of [["aguantar siempre", "todo"], ["NO operar fin de mes", "saltar"], ["CERRAR a 15:30 el fin de mes", "cerrar"]]) {
    const r = ev(g, md);
    console.log(`| ${et} | ${nm} | ${eur(r.alAno)} | ${eur(r.dd)} | ${eur(r.peor)} | ${eur(r.p1)} | ${eur(r.p5)} | ${eur(r.minCaja)}${r.minCaja <= 0 ? " ⛔" : ""} |`);
  }
}

console.log("\n" + "═".repeat(112));
console.log("3 · LA MÉTRICA QUE DECIDE · dólares de ingreso perdidos por cada dólar de caída eliminado");
console.log("═".repeat(112));
console.log("| período | regla | ingreso perdido/año | caída eliminada | $ por $1 de caída |");
console.log("|---|---|---|---|---|");
for (const [et, g] of [["2022-2023", uA], ["2024-2026", uB], ["TODO", util]]) {
  const b = ev(g, "todo");
  for (const [nm, md] of [["NO operar fin de mes", "saltar"], ["CERRAR a 15:30 el fin de mes", "cerrar"]]) {
    const r = ev(g, md);
    const perd = b.alAno - r.alAno, quit = Math.abs(b.dd) - Math.abs(r.dd);
    console.log(`| ${et} | ${nm} | ${eur(perd)} | ${eur(quit)} | ${quit <= 0 ? "la caída NO baja" : perd <= 0 ? `GRATIS (+${eur(-perd)}/año)` : `$${(perd / quit).toFixed(2)}`} |`);
  }
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 4 · Y EL CONTROL DE AZAR SOBRE LA VARIANTE DE CERRAR
// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(112));
console.log("4 · AZAR · cerrar a las 15:30 en n días AL AZAR, 5.000 sorteos, en cada mitad");
console.log("═".repeat(112));
const S = 5000;
for (const [et, g] of [["2022-2023", uA], ["2024-2026", uB]]) {
  const n = g.filter((f) => f.ultimoMes).length;
  const b = ev(g, "todo"), r = ev(g, "cerrar");
  const dAno = [], idx = g.map((_, i) => i);
  for (let s = 0; s < S; s++) {
    const c = idx.slice();
    for (let i = 0; i < n; i++) { const j = i + Math.floor(Math.random() * (c.length - i)); [c[i], c[j]] = [c[j], c[i]]; }
    const st = new Set(c.slice(0, n));
    const serie = g.map((f, i) => (st.has(i) ? f.plCerrar : f.pl));
    dAno.push(serie.reduce((a, x) => a + x, 0) / (g.length / DIAS_ANO) - b.alAno);
  }
  const real = r.alAno - b.alAno;
  const p = dAno.filter((x) => x >= real).length / S;
  console.log(`  ${et} · cierra ${n} días · Δ$/año real ${eur(real)} │ azar mediana ${eur(pct(dAno, 0.5))} p95 ${eur(pct(dAno, 0.95))} │ p=${p.toFixed(4)} ${p < 0.05 ? "PASA" : "NO PASA"}`);
}

console.log("\n" + "═".repeat(112));
console.log(`5 · EN DÓLARES SOBRE LA CUENTA DE ${eur(CUENTA)}`);
console.log("═".repeat(112));
const bT = ev(util, "todo"), sT = ev(util, "saltar"), cT = ev(util, "cerrar");
console.log(`  aguantar siempre        ${eur(bT.alAno)}/año  (${(bT.alAno / CUENTA * 100).toFixed(1)}% de la cuenta)  caja mínima ${eur(bT.minCaja)}`);
console.log(`  no operar fin de mes    ${eur(sT.alAno)}/año  (${(sT.alAno / CUENTA * 100).toFixed(1)}%)  caja mínima ${eur(sT.minCaja)}`);
console.log(`  cerrar 15:30 fin de mes ${eur(cT.alAno)}/año  (${(cT.alAno / CUENTA * 100).toFixed(1)}%)  caja mínima ${eur(cT.minCaja)}`);
