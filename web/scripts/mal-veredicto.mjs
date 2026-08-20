// EL VEREDICTO · la prueba de cruce con un objetivo que NO se puede amañar.
//
// El objetivo se declara aquí y el umbral NO sale de los datos, sale de la CUENTA:
//
//   "Entre las variantes cuya PEOR RACHA no pasa de $10.000 en el período de ajuste,
//    elegir la de más $/año. Aplicarla tal cual al otro período. Y al revés."
//
// $10.000 es el 18% de la cuenta y se financia al 5% por unos $500/año. Es el máximo que un
// forward-test puede aguantar sin vender HOOD. No se toca según lo que salga.
//
// Se comprueba además el hallazgo central del retrato con una medida sola: la correlación de
// ORDEN entre períodos, por riesgo y por ingreso, sobre las 34 variantes.

import { readFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";
const COMM = 0.03, EFECTIVO = 7977, MARGEN = 0.05, CUENTA = 56389, TECHO = 10000;
const PRUEBAS = 48, LISTON = listonT(PRUEBAS);
const dias = JSON.parse(readFileSync("scripts/mal-dias.json", "utf8")).sort((a, b) => a.fecha.localeCompare(b.fecha));
const CAD = JSON.parse(readFileSync("scripts/mal-cadenas.json", "utf8"));
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };
const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const n2 = (x) => (x == null || !isFinite(x) ? "—" : x.toFixed(2));
for (const d of dias) { d.per = d.fecha < "2024-01-01" ? "2022-23" : "2024-26"; d.ano = d.fecha.slice(0, 4); }
const cercaK = (ch, o) => ch.reduce((a, b) => (Math.abs(b[0] - o) < Math.abs(a[0] - o) ? b : a));
function operar(d, modo, ala) {
  const c = CAD[d.fecha]; if (!c) return null;
  let objC, objP;
  if (modo.tipo === "pts") { objC = d.sp11 + modo.sep; objP = d.sp11 - modo.sep; }
  else { if (!(d.sigma > 0)) return null; objC = d.sp11 + modo.k * d.sigma; objP = d.sp11 - modo.k * d.sigma; }
  const cC = cercaK(c.C, objC), pC = cercaK(c.P, objP);
  const cL = cercaK(c.C, cC[0] + ala), pL = cercaK(c.P, pC[0] - ala);
  if (cL[0] <= cC[0] || pL[0] >= pC[0]) return null;
  const aC = cL[0] - cC[0], aP = pC[0] - pL[0];
  const cred = cC[1] + pC[1] - cL[2] - pL[2];
  if (!(cred > 0)) return null;
  const S = d.cierre;
  const penC = Math.min(Math.max(S - cC[0], 0), aC), penP = Math.min(Math.max(pC[0] - S, 0), aP);
  return { fecha: d.fecha, per: d.per, pl: (cred - penC - penP) * 100 - 8 * COMM,
           tope: (penC >= aC - 0.001 || penP >= aP - 0.001) ? 1 : 0 };
}
function met(ops, anos) {
  if (!ops.length) return null;
  const pl = ops.map((o) => o.pl), tot = pl.reduce((a, b) => a + b, 0);
  const s = [...pl].sort((a, b) => a - b), k5 = Math.max(1, Math.floor(s.length * 0.05));
  let acc = 0, pico = 0, dd = 0;
  for (const p of pl) { acc += p; if (acc > pico) pico = acc; if (acc - pico < dd) dd = acc - pico; }
  return { n: pl.length, alAno: tot / anos, peor: s[0], p1: pct(pl, 0.01), p5: pct(pl, 0.05),
           es5: Math.abs(media(s.slice(0, k5))), dd, tope: ops.reduce((a, o) => a + o.tope, 0) };
}
const KS = [0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 1.00, 1.20, 1.40, 1.60];
const V = new Map([["BASE ±25pts/50", dias.map((d) => operar(d, { tipo: "pts", sep: 25 }, 50)).filter(Boolean)]]);
for (const ala of [20, 30, 50]) for (const k of KS) V.set(`±${k.toFixed(2)}s/${ala}`, dias.map((d) => operar(d, { tipo: "sig", k }, ala)).filter(Boolean));
const parte = (ops, p) => ops.filter((o) => o.per === p);
const anosA = dias.filter((d) => d.per === "2022-23").length / 252, anosB = dias.filter((d) => d.per === "2024-26").length / 252;

console.log(`\n====== 18 · LA PRUEBA DE CRUCE · techo de racha $${TECHO.toLocaleString("es-ES")} puesto por la CUENTA ======\n`);
let veredicto = { A: null, B: null };
for (const [ajP, prP, aAj, aPr, tag] of [["2022-23", "2024-26", anosA, anosB, "A"], ["2024-26", "2022-23", anosB, anosA, "B"]]) {
  const candidatas = [];
  for (const [nom, ops] of V) {
    const g = parte(ops, ajP); if (g.length < 200) continue;
    const m = met(g, aAj);
    if (m.dd >= -TECHO) candidatas.push({ nom, ops, m });
  }
  candidatas.sort((x, y) => y.m.alAno - x.m.alAno);
  console.log(`── AJUSTE en ${ajP} · ${candidatas.length} de ${V.size} variantes respetan el techo ──`);
  if (!candidatas.length) { console.log("   ninguna. No hay nada que probar.\n"); continue; }
  console.log("   las 4 mejores por ingreso dentro del techo:");
  for (const c of candidatas.slice(0, 4)) console.log(`     ${c.nom.padEnd(16)} ${eur(c.m.alAno).padStart(9)}/año · racha ${eur(c.m.dd)}`);
  const g = candidatas[0];
  const mPr = met(parte(g.ops, prP), aPr);
  const bPr = met(parte(V.get("BASE ±25pts/50"), prP), aPr);
  console.log(`\n   ELEGIDA: ${g.nom} → ${eur(g.m.alAno)}/año, racha ${eur(g.m.dd)} en ${ajP}`);
  console.log(`   APLICADA TAL CUAL a ${prP}: ${eur(mPr.alAno)}/año · racha ${eur(mPr.dd)} · peor día ${eur(mPr.peor)} · p1 ${eur(mPr.p1)} · p5 ${eur(mPr.p5)} · TOPE ${mPr.tope}`);
  console.log(`   (la base ±25/50 en ${prP}: ${eur(bPr.alAno)}/año · racha ${eur(bPr.dd)})`);
  const ok = mPr.alAno > 0 && mPr.dd >= -TECHO;
  console.log(`   ¿SOBREVIVE? ingreso positivo: ${mPr.alAno > 0 ? "SÍ" : "NO"} · racha dentro del techo: ${mPr.dd >= -TECHO ? "SÍ" : `NO (${eur(mPr.dd)}, ${n2(mPr.dd / -TECHO)}x el techo)`} → **${ok ? "SOBREVIVE" : "NO SOBREVIVE"}**\n`);
  veredicto[tag] = { elegida: g.nom, ajuste: g.m, prueba: mPr, ok };
}
console.log(`  VEREDICTO DEL CRUCE EN LAS DOS DIRECCIONES: **${veredicto.A?.ok && veredicto.B?.ok ? "PASA" : "NO PASA"}**`);

console.log(`\n====== 19 · LO QUE SÍ ES ESTABLE · el orden por riesgo contra el orden por dinero ======\n`);
const filas = [];
for (const [nom, ops] of V) {
  const a = met(parte(ops, "2022-23"), anosA), b = met(parte(ops, "2024-26"), anosB);
  if (a && b && a.n >= 200 && b.n >= 200) filas.push({ nom, a, b });
}
const rank = (f) => { const o = [...filas].sort((x, y) => f(y) - f(x)); const m = new Map(); o.forEach((v, i) => m.set(v.nom, i + 1)); return m; };
function spear(m1, m2) { const n = filas.length; let s = 0; for (const v of filas) s += (m1.get(v.nom) - m2.get(v.nom)) ** 2; return 1 - (6 * s) / (n * (n * n - 1)); }
// t de la correlación de Spearman: r*sqrt((n-2)/(1-r^2))
const tDe = (r, n) => (Math.abs(r) >= 1 ? Infinity : r * Math.sqrt((n - 2) / (1 - r * r)));
const pares = [
  ["PEOR RACHA", (v) => v.a.dd, (v) => v.b.dd],
  ["ES5 (cola del 5%)", (v) => -v.a.es5, (v) => -v.b.es5],
  ["p5", (v) => v.a.p5, (v) => v.b.p5],
  ["nº de días TOPE", (v) => -v.a.tope, (v) => -v.b.tope],
  ["INGRESO $/año", (v) => v.a.alAno, (v) => v.b.alAno],
];
console.log(`Se ordenan las ${filas.length} variantes por cada medida, en cada período, y se compara el orden.\n`);
console.log("| se ordena por | correlación de orden 22-23 vs 24-26 | t | ¿supera el listón de " + LISTON + "? | lectura |");
console.log("|---|---|---|---|---|");
for (const [nom, fa, fb] of pares) {
  const r = spear(rank(fa), rank(fb)), t = tDe(r, filas.length);
  const lect = r > 0.5 ? "**estable** — se puede elegir" : r < -0.5 ? "**INVERTIDO** — elegir por aquí es elegir mal" : "ruido";
  console.log(`| ${nom} | ${n2(r)} | ${n2(t)} | ${Math.abs(t) >= LISTON ? "SÍ" : "no"} | ${lect} |`);
}

console.log(`\n====== 20 · LA CONSECUENCIA · si eliges por ingreso, eliges al revés ======\n`);
console.log("Se coge la variante MÁS RENTABLE de cada período y se mira dónde queda en el otro.\n");
console.log("| elegida por ingreso en | variante | $/año ahí | puesto por ingreso en el OTRO período | $/año en el otro |");
console.log("|---|---|---|---|---|");
for (const [nomP, fSel, fOtro, nomO] of [["2022-23", (v) => v.a.alAno, (v) => v.b.alAno, "2024-26"], ["2024-26", (v) => v.b.alAno, (v) => v.a.alAno, "2022-23"]]) {
  const orden = [...filas].sort((x, y) => fSel(y) - fSel(x));
  const g = orden[0];
  const ordenOtro = [...filas].sort((x, y) => fOtro(y) - fOtro(x));
  const puesto = ordenOtro.findIndex((v) => v.nom === g.nom) + 1;
  console.log(`| ${nomP} | ${g.nom} | ${eur(fSel(g))} | ${puesto} de ${filas.length} | ${eur(fOtro(g))} |`);
}

console.log(`\n====== 21 · LA TABLA DE MESA · qué esperar de verdad, por tamaño ======\n`);
console.log("Se asume lo único defendible: el ingreso futuro es el de los 4,5 años ENTEROS, no el");
console.log("de 2024-26. Y el riesgo es el observado en los 4,5 años, que sí es estable.\n");
function cajaInt(ops, n, ef) {
  let c = ef, min = ef, interes = 0;
  for (const o of ops) { if (c < 0) { const i = -c * MARGEN / 252; interes += i; c -= i; } c += o.pl * n; if (c < min) min = c; }
  return { min, interes, final: c };
}
function peorVentana(ops, w) { let p = 0; for (let i = 0; i + w <= ops.length; i++) { const s = ops.slice(i, i + w).reduce((a, o) => a + o.pl, 0); if (s < p) p = s; } return p; }
const anosT = dias.length / 252;
console.log("| variante | contratos | $/año NETO | % de la cuenta | peor día | peor mes (20 días) | peor trimestre (60 días) | peor racha | efectivo necesario |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const nom of ["BASE ±25pts/50", "±0.60s/50", "±0.80s/50", "±0.80s/30", "±1.00s/30"]) {
  const ops = V.get(nom); if (!ops) continue;
  for (const n of [1, 2]) {
    const m = met(ops, anosT);
    const cj = cajaInt(ops, n, EFECTIVO);
    const neto = (ops.reduce((s, o) => s + o.pl, 0) * n - cj.interes) / anosT;
    console.log(`| ${nom} | ${n} | ${eur(neto)} | ${((neto / CUENTA) * 100).toFixed(2)}% | ${eur(m.peor * n)} | ${eur(peorVentana(ops, 20) * n)} | ${eur(peorVentana(ops, 60) * n)} | ${eur(m.dd * n)} | ${eur(Math.max(0, EFECTIVO - cj.min))} |`);
  }
}
console.log(`\n  Efectivo real de Lester: ${eur(EFECTIVO)}. Comprar SPY: ~${eur(CUENTA * 0.14)}/año con una caída del 34% en 2022.`);
