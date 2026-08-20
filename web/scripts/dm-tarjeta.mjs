import { readFileSync } from "node:fs";
const G = JSON.parse(readFileSync("scripts/dm-grid.json", "utf8"));
const CAD = JSON.parse(readFileSync("scripts/mal-cadenas.json", "utf8"));
const D = G.dias, V = G.variantes, N = D.length;
const suma = (v) => v.reduce((a, x) => a + x, 0);
const anosEntre = (a, b) => (new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000 / 365.25;
const AN_T = anosEntre(D[0].fecha, D[N - 1].fecha);
const serie = (vid, fm) => D.map((d, i) => { const r = V[vid].serie[i]; return (r && !(fm && d.finMes)) ? r.pl : 0; });
const cerca = (arr, o) => arr.reduce((a, b) => (Math.abs(b[0] - o) < Math.abs(a[0] - o) ? b : a));

// ── 1 · EJEMPLOS REALES: la regla aplicada a dias concretos, pata a pata
console.log("=== 1 - LA REGLA APLICADA A DIAS REALES (SPXW, 1 contrato) ===");
console.log("fecha      | spot 11:00 | straddle ATM | x2,3 = dist | vende C/P     | compra C/P    | credito | cierre  |    P&L");
const muestra = ["2022-01-05", "2022-06-13", "2023-03-09", "2024-04-04", "2025-04-07", "2026-08-10"];
for (const f of muestra) {
  const i = D.findIndex((d) => d.fecha === f); if (i < 0) continue;
  const d = D[i], r = V["s0.80_a30"].serie[i], c = CAD[f];
  if (!r || !c) { console.log(`${f} - sin dato`); continue; }
  const aC = cerca(c.C, d.sp11), aP = cerca(c.P, d.sp11);
  const strad = (aC[1] + aC[2]) / 2 + (aP[1] + aP[2]) / 2;
  console.log(`${f} | ${d.sp11.toFixed(2).padStart(10)} | ${strad.toFixed(1).padStart(12)} | ${(strad * 2.32).toFixed(0).padStart(11)} | ${String(r.kcC).padStart(5)}/${String(r.kpC).padStart(5)} | ${String(r.kcC + 30).padStart(5)}/${String(r.kpC - 30).padStart(5)} | ${r.credito.toFixed(0).padStart(7)} | ${d.cierre.toFixed(0).padStart(7)} | ${r.pl.toFixed(0).padStart(6)}`);
}

// ── 2 · TAMANO: cuantos contratos aguanta la caja
const EFECTIVO = 7977, HOOD = 500 * 96.82, LINEA = -0.70 * HOOD, INT = 0.05;
function caja(s, mult) {
  let c = EFECTIVO, minC = c, interes = 0, fechaMin = "", llamada = null, prev = D[0].fecha;
  let acc = 0, pico = 0, dd = 0;
  for (let i = 0; i < N; i++) {
    const dd2 = Math.max(1, (new Date(D[i].fecha + "T00:00:00Z") - new Date(prev + "T00:00:00Z")) / 86400000); prev = D[i].fecha;
    if (c < 0) { const it = c * INT * dd2 / 365; interes += it; c += it; }
    c += s[i] * mult; acc += s[i] * mult;
    if (acc > pico) pico = acc; if (pico - acc > dd) dd = pico - acc;
    if (c < minC) { minC = c; fechaMin = D[i].fecha; }
    if (c < LINEA && !llamada) llamada = D[i].fecha;
  }
  return { anual: (c - EFECTIVO) / AN_T, racha: -dd, minC, fechaMin, interes, llamada, peorDia: Math.min(...s) * mult };
}
console.log("\n=== 2 - CUANTOS CONTRATOS AGUANTA LA CAJA (propuesta +-0,80sig/ala30 + finmes) ===");
console.log("contratos | colateral | $/ano neto | peor dia | peor racha | caja minima (fecha)    | interes | LLAMADA");
const s = serie("s0.80_a30", true);
for (const n of [1, 2, 3, 4]) {
  const r = caja(s, n);
  console.log(`${String(n).padStart(9)} | ${("$" + (3000 * n)).padStart(9)} | ${r.anual.toFixed(0).padStart(10)} | ${r.peorDia.toFixed(0).padStart(8)} | ${r.racha.toFixed(0).padStart(10)} | ${r.minC.toFixed(0).padStart(7)} (${r.fechaMin}) | ${r.interes.toFixed(0).padStart(7)} | ${r.llamada || "NO"}`);
}

// ── 3 · ¿COMO DE MALO PUEDE SER UN ANO QUE NO ESTA EN LA MUESTRA? (bootstrap iid; justificado
//        porque la autocorrelacion del P&L diario es -0,047)
console.log("\n=== 3 - EL PEOR ANO PLAUSIBLE (10.000 anos remuestreados de 252 dias, 1 contrato) ===");
function boot(sr, mult) {
  const pool = sr.filter((x) => x !== 0), out = [];
  for (let it = 0; it < 10000; it++) { let a = 0; for (let k = 0; k < 240; k++) a += pool[(Math.random() * pool.length) | 0]; out.push(a * mult); }
  out.sort((x, y) => x - y);
  return { p1: out[100], p5: out[500], p50: out[5000], p95: out[9500], peor: out[0], pNeg: out.filter((x) => x < 0).length / 100 };
}
for (const [nom, sr] of [["condor de HOY +-25/50", serie("p25_a50", false)], ["propuesta sin finmes", serie("s0.80_a30", false)], ["PROPUESTA", serie("s0.80_a30", true)]]) {
  const r = boot(sr, 1);
  console.log(`${nom.padEnd(24)} | mediana $${r.p50.toFixed(0).padStart(6)} | p5 $${r.p5.toFixed(0).padStart(7)} | p1 $${r.p1.toFixed(0).padStart(7)} | peor de 10.000 $${r.peor.toFixed(0).padStart(7)} | anos negativos ${r.pNeg.toFixed(0)}%`);
}
console.log("   (remuestreo iid: legitimo aqui porque la autocorrelacion del P&L diario es -0,047 / -0,086 / -0,008)");

// ── 4 · el calendario de dias que NO se opera, proximos 14 meses
console.log("\n=== 4 - DIAS QUE NO SE OPERA (ultimo dia habil del mes) - proximos 14 meses ===");
const festivos = new Set(["2026-09-07","2026-11-26","2026-12-25","2027-01-01","2027-01-18","2027-02-15","2027-03-26","2027-05-31","2027-06-18","2027-07-05","2027-09-06"]);
const out = [];
for (let k = 0; k < 14; k++) {
  const base = new Date(Date.UTC(2026, 7 + k + 1, 0));   // ultimo dia del mes
  const d = new Date(base);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6 || festivos.has(d.toISOString().slice(0, 10))) d.setUTCDate(d.getUTCDate() - 1);
  out.push(d.toISOString().slice(0, 10));
}
console.log("   " + out.join("  "));
console.log("   (calendario propio: ultimo dia habil menos festivos NYSE conocidos. Comprobar cada mes en el calendario del broker.)");
