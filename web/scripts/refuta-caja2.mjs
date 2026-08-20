// REFUTACIÓN CAJA · PARTE 2 — separar los dos efectos y hacer la prueba JUSTA.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/refuta-caja2.mjs
//
// La parte 1 mezcla dos cosas distintas y hay que separarlas para no acusar de más:
//   (a) LA FECHA DE ARRANQUE. Mismo supuesto del autor (HOOD congelado a $48.135), sólo cambia
//       el día en que se empieza. Esto es una crítica limpia: no toca ninguna hipótesis suya.
//   (b) HOOD REAL. En 2022 HOOD valía $9,51 y la cuenta entera eran $12.732, no $56.389. Medir
//       con la serie cruda castiga por tener una cuenta pequeña en 2022, que NO es la pregunta.
//
// La prueba JUSTA para la decisión de hoy es (c): la cuenta de HOY ($48.135 de HOOD) moviéndose
// con los RENDIMIENTOS REALES de HOOD desde el día en que se arranca. Así el tamaño de la cuenta
// es el de hoy y la correlación entre "el cóndor pierde" y "HOOD cae" es la real, no un escenario.
//
// PRUEBAS DECLARADAS: 3 geometrías × 2 tamaños × 3 modos de HOOD × 2 mitades = 36.

import { readFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { listonT } from "../lib/barreraHallazgos";

const EFECTIVO = 7977, ACCIONES = 500, HOOD_HOY = 48135, BP0 = 73874, INT = 0.05, MANT = 0.30;
const PRUEBAS = 36;
const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const anosEntre = (a, b) => (new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000 / 365.25;
const qq = (v, p) => { const s = [...v].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

const D = JSON.parse(readFileSync("scripts/cuanto-aguanta-dias.json", "utf8")).dias;
const barras = JSON.parse(readFileSync("scripts/cache-theta/HOOD_bars_20201122_20270308.json", "utf8"));
const mapaH = new Map(barras.map((b) => [b.time, b.close]));
let u = null;
for (const d of D) { const c = mapaH.get(d.fecha); if (c > 0) u = c; d.hood = u; }

radiografia(D.map((d) => ({ plA: d.A.pl, plB: d.B.pl, plC: d.C.pl, hood: d.hood })), ["plA", "plB", "plC", "hood"], "refuta 2");
console.log(`  Listón con ${PRUEBAS} pruebas declaradas: |t| ≥ ${listonT(PRUEBAS).toFixed(2)}\n`);

const CFG = [
  { id: "A", nom: "cóndor de HOY  ±25/50", ala: 50, pl: (d) => d.A.pl, abre: () => true },
  { id: "B", nom: "FILTRO AMPLITUD ±30/50", ala: 50, pl: (d) => d.B.pl, abre: (d) => d.opera === true },
  { id: "C", nom: "por STRADDLE 2,3×/30", ala: 30, pl: (d) => d.C.pl, abre: () => true },
];

// hood: "fijo" = $48.135 siempre (autor) · "crudo" = precio real × 500 · "hoy" = $48.135 el día
// del arranque, moviéndose después con los rendimientos REALES de HOOD (la prueba justa).
function caja(cfg, n, dias, hood = "fijo") {
  const colat = cfg.ala * 100 * n, h0 = dias[0].hood;
  let c = EFECTIVO, interes = 0, min = EFECTIVO, fMin = dias[0].fecha;
  let rojo = null, diasRojo = 0, llam = null, prev = dias[0].fecha, sinPoder = 0;
  for (const d of dias) {
    const nd = Math.max(0, (new Date(d.fecha + "T00:00:00Z") - new Date(prev + "T00:00:00Z")) / 86400000);
    prev = d.fecha;
    if (c < 0 && nd > 0) { const i2 = c * INT * nd / 365; interes += i2; c += i2; }
    const H = hood === "fijo" ? HOOD_HOY : hood === "crudo" ? d.hood * ACCIONES : HOOD_HOY * (d.hood / h0);
    if (cfg.abre(d)) {
      if (colat > BP0 + (c - EFECTIVO)) sinPoder++;
      else c += cfg.pl(d) * n;
    }
    if (c < min) { min = c; fMin = d.fecha; }
    if (c < 0) { diasRojo++; if (!rojo) rojo = d.fecha; }
    if (c < -(1 - MANT) * H && !llam) llam = d.fecha;
  }
  const anos = anosEntre(dias[0].fecha, dias[dias.length - 1].fecha);
  return { final: c, anual: (c - EFECTIVO) / anos, interes, min, fMin, rojo, diasRojo, llam, sinPoder };
}

console.log("═".repeat(118));
console.log(`  PARTE 2 · ${D.length} sesiones · ${D[0].fecha} → ${D[D.length - 1].fecha}`);
console.log("═".repeat(118));

// ── 1 · ¿DE QUÉ AÑO SON LOS ARRANQUES QUE ROMPEN? ────────────────────────────────────────────
console.log("\n\n### 1 · ARRANQUE RODANTE por AÑO de arranque — ¿el fallo es de 2022 (cuenta pequeña) o de la estrategia?\n");
console.log("| geometría | ctr | HOOD | 2022 | 2023 | 2024 | 2025 | 2026 | TOTAL |");
console.log("|---|---|---|---|---|---|---|---|---|");
const guarda = {};
for (const cfg of CFG) for (const n of [1, 2]) for (const hood of ["fijo", "crudo", "hoy"]) {
  const porAno = {}, totAno = {};
  let peor = Infinity, peorIni = "", peorRes = null, tot = 0;
  const mins = [], rojos = [], ints = [];
  for (let i = 0; i < D.length - 20; i++) {
    const a = D[i].ano; totAno[a] = (totAno[a] || 0) + 1; tot++;
    const r = caja(cfg, n, D.slice(i), hood);
    mins.push(r.min); rojos.push(r.diasRojo); ints.push(r.interes);
    if (r.llam) porAno[a] = (porAno[a] || 0) + 1;
    if (r.min < peor) { peor = r.min; peorIni = D[i].fecha; peorRes = r; }
  }
  const tt = Object.values(porAno).reduce((x, y) => x + y, 0);
  guarda[`${cfg.id}${n}${hood}`] = { peor, peorIni, peorRes, tt, tot, mins, rojos, ints };
  console.log(`| ${cfg.nom} | ${n} | ${hood} | ` +
    [2022, 2023, 2024, 2025, 2026].map((a) => `${porAno[a] || 0}/${totAno[a] || 0}`).join(" | ") +
    ` | **${tt}** de ${tot} (${(tt / tot * 100).toFixed(1)}%) |`);
}

// ── 2 · LA PRUEBA JUSTA: cuenta de HOY, HOOD con sus rendimientos reales ─────────────────────
console.log("\n\n### 2 · LA PRUEBA JUSTA — $48.135 de HOOD el día del arranque, moviéndose como HOOD se movió de verdad\n");
console.log("| geometría | ctr | arranques con LLAMADA | peor caja | arranque peor | fecha de la llamada desde el peor arranque |");
console.log("|---|---|---|---|---|---|");
for (const cfg of CFG) for (const n of [1, 2]) {
  const g = guarda[`${cfg.id}${n}hoy`];
  console.log(`| ${cfg.nom} | ${n} | **${g.tt}** de ${g.tot} (${(g.tt / g.tot * 100).toFixed(1)}%) | ${eur(g.peor)} | ${g.peorIni} | ${g.peorRes.llam || "no rompe"} |`);
}

// ── 3 · LO QUE EL HALLAZGO REPORTA vs. LO QUE SALE SEGÚN EL DÍA DE ARRANQUE ──────────────────
console.log("\n\n### 3 · «la caja toca fondo UN día en −$766 y $0 de interés» — ¿es la regla o es el mejor de 1.049?\n");
console.log("| geometría | ctr | HOOD | reportado (arranque 2022-04-27) | mediana de arranques | p10 | PEOR |");
console.log("|---|---|---|---|---|---|---|");
for (const cfg of CFG) for (const n of [1, 2]) for (const hood of ["fijo", "hoy"]) {
  const g = guarda[`${cfg.id}${n}${hood}`];
  const base = caja(cfg, n, D, hood);
  console.log(`| ${cfg.nom} | ${n} | ${hood} | caja ${eur(base.min)} · ${base.diasRojo} d. rojo · int. ${eur(base.interes)} | caja ${eur(qq(g.mins, 0.5))} · ${qq(g.rojos, 0.5)} d. · ${eur(qq(g.ints, 0.5))} | caja ${eur(qq(g.mins, 0.10))} · ${qq(g.rojos, 0.90)} d. · ${eur(qq(g.ints, 0.10))} | caja ${eur(g.peor)} · ${Math.max(...g.rojos)} d. · ${eur(Math.min(...g.ints))} |`);
}

// ── 4 · LA REGLA DE HIERRO sobre la refutación: ¿el fallo aparece en LAS DOS mitades? ────────
const iB = D.findIndex((d) => d.ano >= 2024);
console.log("\n\n### 4 · ¿EL FALLO APARECE EN LAS DOS MITADES? (arranque rodante DENTRO de cada mitad, hasta el final de esa mitad)\n");
console.log(`A = ${D[0].fecha} → ${D[iB - 1].fecha} (${iB}) · B = ${D[iB].fecha} → ${D[D.length - 1].fecha} (${D.length - iB})\n`);
console.log("| geometría | ctr | HOOD | A: arranques con llamada | A: peor caja | B: arranques con llamada | B: peor caja | ¿mismo signo? |");
console.log("|---|---|---|---|---|---|---|---|");
for (const cfg of CFG) for (const n of [1, 2]) for (const hood of ["fijo", "hoy"]) {
  const res = [D.slice(0, iB), D.slice(iB)].map((sl) => {
    let c = 0, peor = Infinity;
    for (let i = 0; i < sl.length - 20; i++) { const r = caja(cfg, n, sl.slice(i), hood); if (r.llam) c++; if (r.min < peor) peor = r.min; }
    return { c, tot: sl.length - 20, peor };
  });
  const mismo = (res[0].c > 0) === (res[1].c > 0);
  console.log(`| ${cfg.nom} | ${n} | ${hood} | ${res[0].c}/${res[0].tot} | ${eur(res[0].peor)} | ${res[1].c}/${res[1].tot} | ${eur(res[1].peor)} | ${mismo ? "SÍ" : "**no**"} |`);
}

// ── 5 · EL RIESGO CORRELACIONADO, MEDIDO (no un escenario) ───────────────────────────────────
console.log("\n\n### 5 · ¿CAE HOOD LOS DÍAS QUE EL CÓNDOR PIERDE? — medido, no supuesto\n");
const conRet = D.map((d, i) => ({ ...d, ret: i ? d.hood / D[i - 1].hood - 1 : 0 })).slice(1);
const ord = [...conRet].sort((a, b) => a.A.pl - b.A.pl);
const peor20 = ord.slice(0, 20), resto = ord.slice(20);
const med = (v) => v.reduce((a, b) => a + b, 0) / v.length;
console.log(`Rendimiento medio de HOOD los 20 PEORES días del cóndor: ${(med(peor20.map((x) => x.ret)) * 100).toFixed(2)}%`);
console.log(`Rendimiento medio de HOOD los otros ${resto.length} días:        ${(med(resto.map((x) => x.ret)) * 100).toFixed(2)}%`);
const dRoj = conRet.filter((x) => x.A.pl < 0), dVer = conRet.filter((x) => x.A.pl >= 0);
console.log(`HOOD los ${dRoj.length} días en que el cóndor pierde: ${(med(dRoj.map((x) => x.ret)) * 100).toFixed(2)}% · los ${dVer.length} en que gana: ${(med(dVer.map((x) => x.ret)) * 100).toFixed(2)}%`);
const cov = med(conRet.map((x) => x.A.pl * x.ret)) - med(conRet.map((x) => x.A.pl)) * med(conRet.map((x) => x.ret));
const sd = (v) => Math.sqrt(med(v.map((x) => x * x)) - med(v) ** 2);
console.log(`correlación P&L del cóndor ↔ rendimiento diario de HOOD: ${(cov / (sd(conRet.map((x) => x.A.pl)) * sd(conRet.map((x) => x.ret)))).toFixed(3)}`);
let p = -Infinity, ddH = 0, fH = "";
for (const d of D) { if (d.hood > p) p = d.hood; if ((p - d.hood) / p > ddH) { ddH = (p - d.hood) / p; fH = d.fecha; } }
console.log(`\nCaída máxima del propio HOOD en la muestra: ${(ddH * 100).toFixed(1)}% (suelo el ${fH}). Sobre $48.135 eso son ${eur(-ddH * HOOD_HOY)} y la línea de llamada sube a ${eur(-0.7 * HOOD_HOY * (1 - ddH))}.`);

// ── 6 · EL $/AÑO NETO HONESTO ───────────────────────────────────────────────────────────────
console.log("\n\n### 6 · ¿QUEDA ALGO? — la cuenta al final, desde el arranque original y desde el peor\n");
console.log("| geometría | ctr | desde 2022-04-27: efectivo final | $/año | desde el PEOR arranque: efectivo final | $/año | ¿llamada? |");
console.log("|---|---|---|---|---|---|---|");
for (const cfg of CFG) for (const n of [1, 2]) {
  const b = caja(cfg, n, D, "hoy");
  const g = guarda[`${cfg.id}${n}hoy`];
  const i = D.findIndex((d) => d.fecha === g.peorIni);
  const w = caja(cfg, n, D.slice(i), "hoy");
  console.log(`| ${cfg.nom} | ${n} | ${eur(b.final)} | ${eur(b.anual)} | ${eur(w.final)} (desde ${g.peorIni}) | ${eur(w.anual)} | ${w.llam || b.llam || "no"} |`);
}
