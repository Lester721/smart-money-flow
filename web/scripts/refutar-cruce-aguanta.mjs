// REFUTACIÓN CON LA LENTE "CRUCE" del hallazgo "la cuenta aguanta las TRES a 1 y 2 contratos".
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/refutar-cruce-aguanta.mjs
//
// Se comprueban DOS cosas, en este orden:
//   1 · ¿SE PARTIÓ LA MUESTRA DE VERDAD? — de dónde salieron ±25, ±30, alas 50 y el filtro
//       MA20+MA50, y qué fechas participaron en elegirlos.
//   2 · HOOD REAL — el informe declara HOOD constante a $48.135 los 4,3 años y con eso fija la
//       línea de llamada en −$33.694. HOOD cotizaba a $9,51 el 2022-04-27. La serie real está
//       en scripts/cache-theta/HOOD_bars_20201122_20270308.json (NO en cierres/, como decía
//       el informe). Se rehace la caja con la línea de llamada día a día.
//
// Nada nuevo se ajusta aquí. Se re-mide lo ya dado con el dato que faltaba.

import { readFileSync } from "node:fs";

const EFECTIVO = 7977, CUENTA = 56389, HOOD_HOY = 48135, BP0 = 73874, INT = 0.05, ACC = 500;
const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const pct = (x) => (x < 0 ? "−" : "") + Math.abs(x * 100).toFixed(1) + "%";
const anosEntre = (a, b) => (new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000 / 365.25;

const D = JSON.parse(readFileSync("scripts/cuanto-aguanta-dias.json", "utf8")).dias;

// ── HOOD REAL, día a día (arrastre del último cierre si falta la sesión, se dice cuántas) ──
const barras = JSON.parse(readFileSync("scripts/cache-theta/HOOD_bars_20201122_20270308.json", "utf8"));
const mapH = new Map(barras.map((b) => [b.time, b.close]));
const fechasH = barras.map((b) => b.time);
let arrastradas = 0;
function hoodEn(f) {
  if (mapH.has(f)) return mapH.get(f) * ACC;
  let lo = 0, hi = fechasH.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (fechasH[m] <= f) { r = m; lo = m + 1; } else hi = m - 1; }
  if (r < 0) return null;
  arrastradas++;
  return mapH.get(fechasH[r]) * ACC;
}
for (const d of D) d.hood = hoodEn(d.fecha);
const sinHood = D.filter((d) => d.hood == null).length;

const CFG = [
  { id: "A", nom: "cóndor de HOY  ±25 · alas 50", ala: 50, pl: (d) => d.A.pl, abre: () => true },
  { id: "B", nom: "FILTRO AMPLITUD ±30 · alas 50", ala: 50, pl: (d) => d.B.pl, abre: (d) => d.opera === true },
  { id: "C", nom: "por STRADDLE 2,3x · alas 30", ala: 30, pl: (d) => d.C.pl, abre: () => true },
];

/** La caja. modoHood: "fijo" = HOOD a $48.135 (el informe) · "real" = serie real de HOOD. */
function caja(cfg, n, dias, modoHood) {
  let efectivo = EFECTIVO, interes = 0, minC = EFECTIVO, fechaMin = dias[0].fecha;
  let pico = EFECTIVO, dd = 0, llamada = null, hoodLlamada = null, nLlamadas = 0;
  let peorDia = 0, opera = 0, sinPoder = 0, prev = dias[0].fecha, colMax = 0;
  for (const d of dias) {
    const nd = Math.max(0, (new Date(d.fecha + "T00:00:00Z") - new Date(prev + "T00:00:00Z")) / 86400000);
    prev = d.fecha;
    if (efectivo < 0 && nd > 0) { const it = efectivo * INT * nd / 365; interes += it; efectivo += it; }
    // "fijo"  = todo como el informe (HOOD constante $48.135)
    // "linea" = SOLO la línea de llamada usa HOOD real; el poder de compra queda como el informe
    // "real"  = HOOD real en la línea Y en el poder de compra (escalado al patrimonio del día)
    const hood = modoHood === "fijo" ? HOOD_HOY : d.hood;
    let pl = 0;
    if (cfg.abre(d)) {
      const necesita = cfg.ala * 100 * n;
      // poder de compra escalado al patrimonio del día (hoy: $73.874 con $56.112 de patrimonio)
      const disponible = modoHood === "real"
        ? BP0 * Math.max(0, efectivo + hood) / (EFECTIVO + HOOD_HOY)
        : BP0 + (efectivo - EFECTIVO);
      if (necesita > disponible) sinPoder++;
      else { pl = cfg.pl(d) * n; opera++; colMax = Math.max(colMax, necesita); }
    }
    efectivo += pl;
    if (pl < peorDia) peorDia = pl;
    if (efectivo > pico) pico = efectivo;
    if (pico - efectivo > dd) dd = pico - efectivo;
    if (efectivo < minC) { minC = efectivo; fechaMin = d.fecha; }
    const linea = -0.70 * hood;
    if (efectivo < linea) { nLlamadas++; if (!llamada) { llamada = d.fecha; hoodLlamada = hood; } }
  }
  const anos = anosEntre(dias[0].fecha, dias[dias.length - 1].fecha);
  return { anos, anual: (efectivo - EFECTIVO) / anos, interes, minC, fechaMin, dd, ddPct: dd / CUENTA,
           peorDia, llamada, hoodLlamada, nLlamadas, opera, sinPoder };
}

const A = D.filter((d) => d.ano <= 2023), B = D.filter((d) => d.ano >= 2024);

console.log("=".repeat(112));
console.log("  REFUTACION · lente CRUCE · " + D.length + " sesiones · " + D[0].fecha + " -> " + D[D.length - 1].fecha);
console.log("=".repeat(112));

// === 1 · ¿SE PARTIÓ LA MUESTRA? ===========================================================
console.log("\n### 1 · DE DONDE SALIERON LOS PARAMETROS — las fechas que participaron en elegir\n");
for (const [f, etq] of [["scripts/regimen-filas.json", "eligio el FILTRO MA20+MA50 (refutar-cola-tendencia.mjs)"],
                        ["scripts/amplitud-riesgo-dias.json", "cache del filtro de amplitud (amplitud-riesgo*.mjs)"]]) {
  try {
    const j = JSON.parse(readFileSync(f, "utf8"));
    const a = Array.isArray(j) ? j : (j.dias || j.filas);
    console.log(`| ${f} | n=${a.length} | ${a[0].fecha} -> ${a[a.length - 1].fecha} | ${etq} |`);
  } catch (e) { console.log(`| ${f} | NO LEIBLE | ${e.message.slice(0, 40)} |`); }
}
const s = JSON.parse(readFileSync("scripts/sintesis-mejor-condor.json", "utf8"));
console.log(`| scripts/sintesis-mejor-condor.json | n=${s.muestra.n} | ${s.muestra.desde} -> ${s.muestra.hasta} | eligio la DISTANCIA (rejilla 6x3) · ${s.pruebas.acumuladas} pruebas acumuladas |`);
console.log(`\n  MITAD B del informe ("probadoEn"): ${B.length} dias, ${B[0].fecha} -> ${B[B.length - 1].fecha}`);
console.log(`  MITAD A del informe ("ajustadoEn"): ${A.length} dias, ${A[0].fecha} -> ${A[A.length - 1].fecha}`);

// === 2 · LA ÚNICA MITAD QUE NO PARTICIPÓ EN ELEGIR ========================================
console.log("\n\n### 2 · MITAD A (2022-04-27 -> 2023-12-29) — la UNICA fuera de muestra de verdad\n");
console.log("| geometria | ctr | $/ano | caida max | % cuenta | caja minima | peor dia |");
console.log("|---|---|---|---|---|---|---|");
for (const cfg of CFG) for (const n of [1, 2]) {
  const r = caja(cfg, n, A, "fijo");
  console.log(`| ${cfg.nom} | ${n} | **${eur(r.anual)}** | ${eur(-r.dd)} | ${pct(-r.ddPct)} | ${eur(r.minC)} | ${eur(r.peorDia)} |`);
}

// === 3 · HOOD REAL =======================================================================
console.log(`\n\n### 3 · HOOD REAL contra HOOD CONSTANTE — la linea de llamada dia a dia\n`);
console.log(`HOOD (500 acciones): ${eur(D[0].hood)} el ${D[0].fecha} · ${eur(D[D.length - 1].hood)} el ${D[D.length - 1].fecha} · constante del informe ${eur(HOOD_HOY)}`);
console.log(`Sesiones sin cierre de HOOD: ${sinHood} · con arrastre del cierre anterior: ${arrastradas}\n`);
const hmin = D.reduce((a, b) => (b.hood < a.hood ? b : a));
console.log(`Minimo de HOOD en la muestra: ${eur(hmin.hood)} el ${hmin.fecha} -> linea de llamada ${eur(-0.70 * hmin.hood)} (el informe usa ${eur(-0.70 * HOOD_HOY)})\n`);
console.log("Se separan los dos efectos: LINEA = solo la llamada usa HOOD real (mismo camino de caja que");
console.log("el informe) · REAL = ademas el poder de compra se escala al patrimonio del dia.\n");
console.log("| geometria | ctr | caja min (informe) | LLAMADA informe | LLAMADA con LINEA real | HOOD ese dia | dias bajo linea | LLAMADA con todo REAL | dias sin poder |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const cfg of CFG) for (const n of [1, 2, 3, 4]) {
  const f = caja(cfg, n, D, "fijo"), l = caja(cfg, n, D, "linea"), r = caja(cfg, n, D, "real");
  console.log(`| ${cfg.nom} | ${n} | ${eur(f.minC)} | ${f.llamada || "NO"} | ${l.llamada ? "**" + l.llamada + "**" : "NO"} | ${l.hoodLlamada != null ? eur(l.hoodLlamada) : "—"} | ${l.nLlamadas} | ${r.llamada ? "**" + r.llamada + "**" : "NO"} | ${r.sinPoder} |`);
}

// === 4 · EL LÍMITE DE TAMAÑO CON HOOD REAL ================================================
console.log("\n\n### 4 · CUANTOS CONTRATOS — el informe dice 4 (condor/filtro) y 3 (straddle)\n");
console.log("| geometria | max sin llamada · HOOD FIJO (informe) | max sin llamada · LINEA real | max sin llamada · todo REAL |");
console.log("|---|---|---|---|");
for (const cfg of CFG) {
  const lim = (modo) => { let m = 0; for (let n = 1; n <= 6; n++) { if (!caja(cfg, n, D, modo).llamada) m = n; else break; } return m; };
  console.log(`| ${cfg.nom} | ${lim("fijo")} | **${lim("linea")}** | ${lim("real")} |`);
}

// === 5 · EL ORDEN POR RIESGO =============================================================
console.log("\n\n### 5 · LA RECOMENDACION SIGUE LA REGLA (elegir por RIESGO, no por $/ano)?\n");
console.log("| geometria | caida A | caida B | puesto por riesgo A | puesto por riesgo B | $/ano TODO |");
console.log("|---|---|---|---|---|---|");
const rA = CFG.map((c) => caja(c, 1, A, "fijo").dd), rB = CFG.map((c) => caja(c, 1, B, "fijo").dd);
const puesto = (v, i) => v.filter((x) => x < v[i]).length + 1;
CFG.forEach((c, i) => console.log(`| ${c.nom} | ${eur(-rA[i])} | ${eur(-rB[i])} | ${puesto(rA, i)} | ${puesto(rB, i)} | ${eur(caja(c, 1, D, "fijo").anual)} |`));
console.log("\n(1 = menos caida. El informe recomienda el condor de HOY.)");

// === 6 · ¿HOOD Y EL CONDOR CAEN A LA VEZ? ================================================
console.log("\n\n### 6 · CORRELACION — el supuesto 'HOOD constante' solo es neutral si son independientes\n");
const rets = [];
for (let i = 1; i < D.length; i++) {
  if (D[i].hood > 0 && D[i - 1].hood > 0) rets.push({ rh: D[i].hood / D[i - 1].hood - 1, plA: D[i].A.pl, plB: D[i].B.pl, plC: D[i].C.pl });
}
const med = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const corr = (x, y) => {
  const mx = med(x), my = med(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxy / Math.sqrt(sxx * syy);
};
const rh = rets.map((r) => r.rh);
console.log(`n = ${rets.length} pares de dias consecutivos con cierre de HOOD.\n`);
console.log("| geometria | corr(retorno HOOD, P&L del dia) | P&L medio los dias que HOOD cae >3% | n esos dias | P&L medio el resto |");
console.log("|---|---|---|---|---|");
for (const [nom, k] of [["condor ±25/50", "plA"], ["filtro ±30/50", "plB"], ["straddle 2,3x/30", "plC"]]) {
  const y = rets.map((r) => r[k]);
  const malos = rets.filter((r) => r.rh < -0.03).map((r) => r[k]);
  const resto = rets.filter((r) => r.rh >= -0.03).map((r) => r[k]);
  console.log(`| ${nom} | ${corr(rh, y).toFixed(3)} | ${eur(med(malos))} | ${malos.length} | ${eur(med(resto))} |`);
}

// === 7 · CUANTO DEL BENEFICIO SALE DE LA VENTANA DE SELECCION ============================
console.log("\n\n### 7 · REPARTO DEL BENEFICIO entre la mitad que eligio y la que no\n");
console.log("| geometria | A (fuera de muestra) | B (ventana de seleccion) | % del total que sale de B |");
console.log("|---|---|---|---|");
for (const cfg of CFG) {
  const ra = caja(cfg, 1, A, "fijo"), rb = caja(cfg, 1, B, "fijo");
  const ta = ra.anual * ra.anos, tb = rb.anual * rb.anos;
  console.log(`| ${cfg.nom} | ${eur(ta)} | ${eur(tb)} | ${(tb / (ta + tb) * 100).toFixed(1)}% |`);
}
