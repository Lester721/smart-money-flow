// AMPLITUD COMO RIESGO · PARTE 4 — la decisión.
//
// Lo que ya está medido:
//   · el filtro se salta 39 de los 50 días más caros (esperado al azar: 20) — z = 5,59
//   · la frecuencia de palo gordo pasa del 11,9% al 2,8%, y pasa el listón en LAS DOS mitades
//   · eligiendo media y distancia POR RIESGO en una mitad, el 5% peor mejora en la otra en las
//     dos direcciones, y la rejilla de medias es una MESETA, no un pico
//
// Lo que falta y decide:
//   1 · los TRES tercios, no dos mitades (regla de barreraHallazgos)
//   2 · a RIESGO IGUALADO, ¿gana al modo tonto? — y esta vez el riesgo se iguala por el 5% peor,
//       que es la métrica que se hereda (ρ = 0,92 aquí, 0,98 en el hallazgo maestro), no por la
//       caída máxima, que es UN dato extremo y ordena mucho peor (ρ = 0,70)
//   3 · qué compra el riesgo ahorrado: ¿cuántos contratos aguanta la cuenta de Lester?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/amplitud-riesgo-4.mjs

import { readFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";

const CUENTA = 56389, EFECTIVO = 7977, PODER = 73874, COLATERAL_POR_PUNTO = 100;
const PRUEBAS = 50, LISTON = listonT(PRUEBAS);
const eur = (x) => (x == null || !Number.isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const pct = (x) => (x == null || !Number.isFinite(x) ? "—" : (x * 100).toFixed(1) + "%");
const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);

const { dias } = JSON.parse(readFileSync("scripts/amplitud-riesgo-dias.json", "utf8"));
function caidaMax(pl) { let c = 0, p = 0, w = 0; for (const x of pl) { c += x; p = Math.max(p, c); w = Math.min(w, c - p); } return w; }
function es5de(pl) { const o = [...pl].sort((a, b) => a - b); return media(o.slice(0, Math.max(1, Math.round(pl.length * 0.05)))); }
function suelo(pl, f) { let c = EFECTIVO, m = EFECTIVO, fe = null, q = null; for (let i = 0; i < pl.length; i++) { c += pl[i]; if (c < m) { m = c; fe = f[i]; } if (c <= 0 && !q) q = f[i]; } return { min: m, fecha: fe, quiebra: q }; }

const MC = [5, 10, 20, 50, 100, 200];
const MA = {};
for (const k of MC) MA[k] = dias.map((_, i) => { if (i < k) return null; let s = 0; for (let j = i - k; j < i; j++) s += dias[j].cierre; return s / k; });
const idxDe = new Map(dias.map((d, i) => [d.fecha, i]));
/** Serie diaria: 0 los días que la regla no opera. `a`=null → sin filtro. */
const serie = (ds, c, k = 1) => ds.map((d) => {
  const i = idxDe.get(d.fecha), p = d.pnl[String(c.dist)];
  if (p == null) return 0;
  if (c.a == null) return p * k;
  const m1 = MA[c.a][i], m2 = c.b ? MA[c.b][i] : m1;
  if (m1 == null || m2 == null) return 0;
  return d.sp11 >= m1 && d.sp11 >= m2 ? p * k : 0;
});
const evalua = (ds, c, k = 1) => {
  const s = serie(ds, c, k), fechas = ds.map((d) => d.fecha);
  return { n: s.filter((x) => x !== 0).length, a: suma(s) / (ds.length / 252), c: caidaMax(s), e: es5de(s), peor: Math.min(...s), su: suelo(s, fechas), s };
};
const nomC = (c) => (c.a == null ? `±${c.dist} sin filtro` : `±${c.dist} · sobre MA${c.a}${c.b ? " y MA" + c.b : ""}`);

const ANCHO = 104;
const raya = (t) => { console.log("\n" + "═".repeat(ANCHO)); console.log("  " + t); console.log("═".repeat(ANCHO)); };
const m2 = Math.floor(dias.length / 2);
const H = [dias.slice(0, m2), dias.slice(m2)];
const t3 = Math.floor(dias.length / 3);
const T = [dias.slice(0, t3), dias.slice(t3, 2 * t3), dias.slice(2 * t3)];

const BASE = { a: null, b: null, dist: 25 };
const REF = { a: 20, b: 50, dist: 30 };          // el filtro que trajo Lester
const C1 = { a: 5, b: 50, dist: 45 };            // el que eligió H1 por riesgo
const C2 = { a: 5, b: 20, dist: 45 };            // el que eligió H2 por riesgo

console.log(`\n# AMPLITUD COMO RIESGO · PARTE 4 — la decisión\n`);
console.log(`${dias.length} sesiones · ${dias[0].fecha} → ${dias[dias.length - 1].fecha} · ${PRUEBAS} pruebas declaradas · listón |t| = ${LISTON}`);

// ═══ O · LOS TRES TERCIOS ═══════════════════════════════════════════════════════════════════
raya("O · LOS TRES TERCIOS — partir en dos mitades aprueba cosas que partir en tres mata");
console.log("\n| tercio | días | regla | días op. | $/año | caída máx | 5% peor | mejora del 5% peor vs base |");
console.log("|---|---|---|---|---|---|---|---|");
for (const [i, ds] of T.entries()) {
  const b = evalua(ds, BASE);
  for (const [j, c] of [BASE, REF, C1].entries()) {
    const m = evalua(ds, c);
    console.log(`| ${j === 0 ? `**T${i + 1}** ${ds[0].fecha}→${ds[ds.length - 1].fecha}` : ""} | ${j === 0 ? ds.length : ""} | ${nomC(c)} | ${m.n} | ${eur(m.a)} | ${eur(m.c)} | ${eur(m.e)} | ${j === 0 ? "—" : (m.e > b.e ? "**+" : "−") + eur(Math.abs(m.e - b.e)).slice(1) + (m.e > b.e ? "**" : "")} |`);
  }
}
const signos = [REF, C1].map((c) => T.map((ds) => Math.sign(evalua(ds, c).e - evalua(ds, BASE).e)));
console.log(`\n   Signo de la mejora del 5% peor en los tres tercios:`);
for (const [i, c] of [REF, C1].entries()) console.log(`   · ${nomC(c).padEnd(28)} ${signos[i].map((s) => (s > 0 ? "+" : "−")).join(" · ")}  → ${signos[i].every((s) => s > 0) ? "**mejora en los TRES**" : "NO es estable"}`);

// ═══ P · A RIESGO IGUALADO POR EL 5% PEOR ═══════════════════════════════════════════════════
raya("P · LA COMPARACIÓN QUE DECIDE — a 5% peor IGUALADO, contra los dos modos tontos");
console.log(`
  Se iguala el riesgo por el 5% PEOR, no por la caída máxima. Motivo: la caída máxima es UN dato
  extremo y ordena mal entre períodos (ρ = 0,70 en estas 32 variantes); el 5% peor ordena a 0,92.
  Los dos modos tontos de llegar al mismo 5% peor:
     TAMAÑO    · la base ±25 todos los días con f contratos (todo escala por f, exacto)
     DISTANCIA · alejar el cóndor sin dejar de operar ni un día
`);
for (const [aj, pr] of [[0, 1], [1, 0]]) {
  const cand = aj === 0 ? C1 : C2;
  const mAj = evalua(H[aj], cand), mPr = evalua(H[pr], cand), bPr = evalua(H[pr], BASE);
  const f = mPr.e / bPr.e;                                    // contratos de base que igualan el 5% peor
  const tam = evalua(H[pr], BASE, f);
  // la mejor distancia SIN filtro que se acerque al mismo 5% peor
  const dist = [20, 25, 30, 35, 40, 45, 50].map((d) => ({ d, m: evalua(H[pr], { a: null, b: null, dist: d }) }))
    .sort((x, y) => Math.abs(x.m.e - mPr.e) - Math.abs(y.m.e - mPr.e))[0];
  console.log(`\n### Ajustado en H${aj + 1} (por 5% peor, ${nomC(cand)}) · probado en H${pr + 1}\n`);
  console.log("| variante en H" + (pr + 1) + " | días op. | $/año | 5% peor | caída máx | peor día | suelo EFECTIVO |");
  console.log("|---|---|---|---|---|---|---|");
  const filas = [[`**FILTRO ${nomC(cand)}** · 1 contrato`, mPr], [`TAMAÑO · base ±25 · ${f.toFixed(3)} contratos`, tam], [`DISTANCIA · ±${dist.d} sin filtro · 1 contrato`, dist.m], [`base ±25 · 1 contrato (referencia)`, bPr]];
  for (const [n, m] of filas) console.log(`| ${n} | ${m.n} | ${eur(m.a)} | ${eur(m.e)} | ${eur(m.c)} | ${eur(m.peor)} | ${eur(m.su.min)} |`);
  const gana = mPr.a > tam.a && mPr.a > dist.m.a;
  console.log(`\n   → a riesgo igualado por el 5% peor, **${gana ? "gana el FILTRO" : "NO gana el filtro"}**: ${eur(mPr.a)}/año contra ${eur(tam.a)} del tamaño y ${eur(dist.m.a)} de la distancia.`);
  console.log(`   → el 5% peor que la DISTANCIA sola no puede alcanzar: ni ±50 baja de ${eur(evalua(H[pr], { a: null, b: null, dist: 50 }).e)}, y el filtro llega a ${eur(mPr.e)}.`);
}

// ═══ Q · QUÉ COMPRA EL RIESGO AHORRADO ══════════════════════════════════════════════════════
raya("Q · QUÉ COMPRA EL RIESGO AHORRADO — cuántos contratos aguanta la cuenta");
console.log(`
  Un reductor de riesgo no vale por lo que ahorra: vale por el TAMAÑO que permite. Se sube el
  número de contratos de cada variante hasta el máximo que el efectivo de ${eur(EFECTIVO)} aguanta
  sin quedarse en rojo NI UN DÍA en todo el período, y se compara el $/año que sale de ahí.
  Colateral: $5.000 por cóndor de alas 50 y ${eur(4500)} de alas 45 — del poder de compra (${eur(PODER)}).
`);
console.log("| variante | máx contratos por EFECTIVO | colateral | $/año a ese tamaño | caída máx | % cuenta | suelo EFECTIVO |");
console.log("|---|---|---|---|---|---|---|");
const fechas = dias.map((d) => d.fecha);
for (const c of [BASE, { a: null, b: null, dist: 45 }, REF, C1, C2]) {
  let k = 0;
  for (let t = 1; t <= 12; t++) { const s = serie(dias, c, t); if (suelo(s, fechas).min > 0 && t * 50 * COLATERAL_POR_PUNTO <= PODER) k = t; else break; }
  if (k === 0) { console.log(`| ${nomC(c)} | **0** — se queda sin efectivo ya con 1 contrato | — | — | — | — | ${eur(evalua(dias, c).su.min)} |`); continue; }
  const m = evalua(dias, c, k);
  console.log(`| ${nomC(c)} | **${k}** | ${eur(k * 50 * COLATERAL_POR_PUNTO)} | ${eur(m.a)} | ${eur(m.c)} | ${pct(m.c / CUENTA)} | ${eur(m.su.min)} |`);
}

// ═══ R · LA CONFIGURACIÓN, AÑO A AÑO ════════════════════════════════════════════════════════
raya("R · AÑO A AÑO — la base contra el filtro que sobrevivió al cruce");
const anos = [...new Set(dias.map((d) => d.ano))].sort();
console.log("\n| año | días | $/año base ±25 | caída base | $/año ±45·MA5+MA50 | caída | 5% peor base | 5% peor filtro |");
console.log("|---|---|---|---|---|---|---|---|");
for (const a of anos) {
  const ds = dias.filter((d) => d.ano === a);
  const b = evalua(ds, BASE), f = evalua(ds, C1);
  console.log(`| **${a}** | ${ds.length} | ${eur(suma(b.s))} | ${eur(b.c)} | ${eur(suma(f.s))} | ${eur(f.c)} | ${eur(b.e)} | ${eur(f.e)} |`);
}
const B = evalua(dias, BASE), F1 = evalua(dias, C1), F2 = evalua(dias, C2), R = evalua(dias, REF);
console.log(`| **TODO** | ${dias.length} | ${eur(B.a)}/año | ${eur(B.c)} | ${eur(F1.a)}/año | ${eur(F1.c)} | ${eur(B.e)} | ${eur(F1.e)} |`);

// ═══ VEREDICTO ══════════════════════════════════════════════════════════════════════════════
raya("VEREDICTO");
console.log(`
  Sobre la cuenta de ${eur(CUENTA)} · efectivo ${eur(EFECTIVO)} · SPXW 0DTE a las 11:00, precios reales.

  | | base ±25 todos | filtro ±30·MA20+MA50 | ±45·MA5+MA50 (cruce) |
  |---|---|---|---|
  | $/año, 1 contrato | ${eur(B.a)} | ${eur(R.a)} | ${eur(F1.a)} |
  | caída máx | ${eur(B.c)} (${pct(B.c / CUENTA)}) | ${eur(R.c)} (${pct(R.c / CUENTA)}) | ${eur(F1.c)} (${pct(F1.c / CUENTA)}) |
  | 5% peor | ${eur(B.e)} | ${eur(R.e)} | ${eur(F1.e)} |
  | peor día | ${eur(B.peor)} | ${eur(R.peor)} | ${eur(F1.peor)} |
  | días operados | ${B.n} | ${R.n} | ${F1.n} |
  | suelo de efectivo | ${eur(B.su.min)} | ${eur(R.su.min)} | ${eur(F1.su.min)} |
`);
