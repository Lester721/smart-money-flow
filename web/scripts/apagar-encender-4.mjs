// APAGAR-Y-ENCENDER · PARTE 4 — EL VEREDICTO. La señal contra el menú entero que se miró,
// y con la reducción de exposición DESCONTADA.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/apagar-encender-4.mjs
//
// ═══ LOS DOS ARREGLOS QUE FALTABAN ═══════════════════════════════════════════════════════════
//
// 1. LA VENTAJA SE MIDE NETA DE EXPOSICIÓN. Cualquier regla que apague días baja la exposición, y
//    bajar exposición ya cambia el dinero por sí solo. Así que la ventaja de una regla NO es
//    "$/año con la regla − $/año a tamaño pleno", sino
//        $/año con la regla − $/año operando SIEMPRE con el tamaño que da la MISMA exposición.
//    Eso es exactamente la pregunta del encargo: ¿hace algo más que reducir tamaño?
//
// 2. EL MENÚ ENTERO. "El último día del mes" salió de escanear cubos de calendario: 18 en
//    regimen-18.mjs y 58 en la tanda de dsem. El nulo tiene que repetir ESE escaneo dentro de
//    cada sorteo y quedarse con el mejor. Aquí se reconstruye el menú (57 reglas) y se gira el
//    P&L contra el calendario 1.118 veces.

import { readFileSync } from "node:fs";

const EFECTIVO = 7977, CUENTA = 56389, INT = 0.05;
const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const pctl = (v, q) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))] : NaN; };
const anosE = (a, b) => (new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000 / 365.25;

const G = JSON.parse(readFileSync("scripts/dm-grid.json", "utf8"));
const filas = [];
for (let i = 0; i < G.dias.length; i++) {
  const a = G.variantes["s0.80_a30"].serie[i], b = G.variantes["p25_a50"].serie[i];
  if (!a || !b) continue;
  const fe = G.dias[i].fecha;
  filas.push({ fecha: fe, mes: fe.slice(0, 7), mesNum: +fe.slice(5, 7), finMes: G.dias[i].finMes,
    dow: new Date(fe + "T00:00:00Z").getUTCDay(), dom: +fe.slice(8, 10), plProp: a.pl, plHoy: b.pl });
}
filas.sort((x, y) => x.fecha.localeCompare(y.fecha));
const N = filas.length, AN = anosE(filas[0].fecha, filas[N - 1].fecha);
const DIAS = filas.map((f) => new Date(f.fecha + "T00:00:00Z").getTime());
const DT = DIAS.map((d, i) => (i === 0 ? 1 : Math.max(1, (d - DIAS[i - 1]) / 86400000)));

// ── EL MENÚ que de verdad se escaneó ────────────────────────────────────────────────────────
const porMes = new Map();
filas.forEach((f, i) => { if (!porMes.has(f.mes)) porMes.set(f.mes, []); porMes.get(f.mes).push(i); });
const mesesConFin = new Set(filas.filter((f) => f.finMes).map((f) => f.mes));
const idxUlt = new Map(), idxIni = new Map();
for (const [m, idx] of porMes) { idxUlt.set(m, idx); idxIni.set(m, idx); }
const posFin = new Array(N), posIni = new Array(N);
for (const [m, idx] of porMes) idx.forEach((p, k) => { posFin[p] = idx.length - 1 - k; posIni[p] = k; });
const terceroViernes = (f) => { const d = +f.slice(8, 10); return d >= 15 && d <= 21 && new Date(f + "T00:00:00Z").getUTCDay() === 5; };

const REGLAS = [];
const add = (nom, test) => { const off = filas.map((f, i) => (test(f, i) ? 1 : 0)); const n = suma(off); if (n >= 20) REGLAS.push({ nom, off, n, frac: (N - n) / N }); };
for (let j = 0; j < 10; j++) add("fin−" + j, (f, i) => mesesConFin.has(f.mes) && posFin[i] === j);   // fin−0 = finMes
for (let j = 0; j < 10; j++) add("ini+" + j, (f, i) => mesesConFin.has(f.mes) && posIni[i] === j);
for (const d of [1, 2, 3, 4, 5]) add("dow=" + d, (f) => f.dow === d);
for (let m = 1; m <= 12; m++) add("mes=" + m, (f) => f.mesNum === m);
for (let c = 1; c <= 6; c++) add("dom " + ((c - 1) * 5 + 1) + "-" + (c === 6 ? 31 : c * 5), (f) => Math.min(6, Math.ceil(f.dom / 5)) === c);
for (let s = 1; s <= 5; s++) add("semMes=" + s, (f) => Math.ceil(f.dom / 7) === s);
add("OPEX", (f) => terceroViernes(f.fecha));
add("2 últimos del mes", (f, i) => mesesConFin.has(f.mes) && posFin[i] <= 1);
add("2 primeros del mes", (f, i) => mesesConFin.has(f.mes) && posIni[i] <= 1);
add("3 últimos del mes", (f, i) => mesesConFin.has(f.mes) && posFin[i] <= 2);
add("finTrim", (f, i) => mesesConFin.has(f.mes) && posFin[i] === 0 && [3, 6, 9, 12].includes(f.mesNum));
add("semana de OPEX", (f, i) => { for (let k = 0; k <= 4; k++) { const j = i + k; if (j < N && terceroViernes(filas[j].fecha)) return true; } return false; });
const I_FIN = REGLAS.findIndex((r) => r.nom === "fin−0");

// ── motor ───────────────────────────────────────────────────────────────────────────────────
function anual(pl, off, mult) {
  let caja = EFECTIVO;
  for (let i = 0; i < N; i++) {
    if (caja < 0) caja += caja * INT * DT[i] / 365;
    if (!off || !off[i]) caja += pl[i] * mult;
  }
  return (caja - EFECTIVO) / AN;
}
function conCaida(pl, off, mult) {
  let caja = EFECTIVO, acc = 0, pico = 0, dd = 0, minC = caja;
  const op = [];
  for (let i = 0; i < N; i++) {
    if (caja < 0) caja += caja * INT * DT[i] / 365;
    const x = (!off || !off[i]) ? pl[i] * mult : 0;
    if (!off || !off[i]) op.push(x);
    caja += x; acc += x; if (acc > pico) pico = acc; if (pico - acc > dd) dd = pico - acc; if (caja < minC) minC = caja;
  }
  return { anual: (caja - EFECTIVO) / AN, dd: -dd, ddPct: dd / CUENTA * 100, minC,
    peor: Math.min(...op), es5: media([...op].sort((a, b) => a - b).slice(0, Math.max(1, Math.floor(op.length * 0.05)))) };
}

console.log("═".repeat(104));
console.log("  PARTE 4 · VEREDICTO · " + N + " días · menú de " + REGLAS.length + " reglas · " + (N - 1) + " rotaciones");
console.log("  VENTAJA NETA = $/año con la regla − $/año operando SIEMPRE al tamaño de la MISMA exposición");
console.log("═".repeat(104));

for (const [campo, nomG] of [["plProp", "PROPUESTA ±0,80σ/ala30"], ["plHoy", "CÓNDOR HOY ±25/ala50"]]) {
  const pl = filas.map((f) => f[campo]);
  const base = anual(pl, null, 1);
  const ventaja = REGLAS.map((r) => anual(pl, r.off, 1) - anual(pl, null, r.frac));
  const vFin = ventaja[I_FIN];

  console.log("\n" + "─".repeat(104));
  console.log(" " + nomG + " · siempre encendido a 1 contrato: " + eur(base) + "/año");
  console.log("─".repeat(104));

  const orden = REGLAS.map((r, i) => ({ nom: r.nom, n: r.n, frac: r.frac, v: ventaja[i], bruto: anual(pl, r.off, 1) })).sort((a, b) => b.v - a.v);
  console.log("\n### EL MENÚ ENTERO, ORDENADO POR VENTAJA NETA DE EXPOSICIÓN\n");
  console.log("| puesto | regla | días OFF | $/año bruto | $/año del MISMO tamaño sin regla | **ventaja NETA** |");
  console.log("|---|---|---|---|---|---|");
  orden.forEach((o, i) => { if (i < 6 || o.nom === "fin−0" || i >= orden.length - 3)
    console.log("| " + (i + 1) + " | " + o.nom + " | " + o.n + " | " + eur(o.bruto) + " | " + eur(anual(pl, null, o.frac)) + " | **" + eur(o.v) + "** |"); });
  console.log("   puesto de finMes: **" + (orden.findIndex((o) => o.nom === "fin−0") + 1) + " de " + REGLAS.length + "**  ·  reglas con ventaja positiva: " + orden.filter((o) => o.v > 0).length);

  // ── el nulo de rotación, con y sin corrección por selección ───────────────────────────────
  const solo = [], mx20 = [], mxAll = [];
  const I20 = REGLAS.map((r, i) => i).filter((i) => /^(fin−|ini\+)/.test(REGLAS[i].nom));
  for (let r = 1; r < N; r++) {
    const g = new Array(N);
    for (let i = 0; i < N; i++) g[i] = pl[(i + r) % N];
    const vs = REGLAS.map((R) => anual(g, R.off, 1) - anual(g, null, R.frac));
    solo.push(vs[I_FIN]);
    mx20.push(Math.max(...I20.map((i) => vs[i])));
    mxAll.push(Math.max(...vs));
  }
  const p = (arr) => arr.filter((x) => x >= vFin).length / arr.length;
  console.log("\n### EL NULO DE ROTACIÓN — ventaja NETA en un mundo sin señal\n");
  console.log("| nulo | mediana | p95 | p99 | máximo | ventaja real de finMes | **p** |");
  console.log("|---|---|---|---|---|---|---|");
  console.log("| finMes sola, sin corregir | " + eur(pctl(solo, 0.5)) + " | " + eur(pctl(solo, 0.95)) + " | " + eur(pctl(solo, 0.99)) +
    " | " + eur(Math.max(...solo)) + " | " + eur(vFin) + " | **" + p(solo).toFixed(3) + "** |");
  console.log("| la mejor de las 20 hermanas de mes | " + eur(pctl(mx20, 0.5)) + " | " + eur(pctl(mx20, 0.95)) + " | " + eur(pctl(mx20, 0.99)) +
    " | " + eur(Math.max(...mx20)) + " | " + eur(vFin) + " | **" + p(mx20).toFixed(3) + "** |");
  console.log("| **la mejor del MENÚ de " + REGLAS.length + "** (lo que se hizo de verdad) | " + eur(pctl(mxAll, 0.5)) + " | " + eur(pctl(mxAll, 0.95)) +
    " | " + eur(pctl(mxAll, 0.99)) + " | " + eur(Math.max(...mxAll)) + " | " + eur(vFin) + " | **" + p(mxAll).toFixed(3) + "** |");

  // ── la tarjeta operativa ──────────────────────────────────────────────────────────────────
  const rFin = conCaida(pl, REGLAS[I_FIN].off, 1);
  const rBase = conCaida(pl, null, 1);
  const rMitad = conCaida(pl, null, 0.5);
  let mDD = 0, rDD = null;
  for (let m = 0.01; m <= 1.5001; m += 0.01) { const rr = conCaida(pl, null, m); if (Math.abs(rr.dd) <= Math.abs(rFin.dd) && m > mDD) { mDD = m; rDD = rr; } }
  console.log("\n### LA TARJETA — apagar-y-encender contra comprar el mismo riesgo con TAMAÑO\n");
  console.log("| configuración | $/año NETO | caída máx | % de la cuenta | peor día | ES5 | caja mínima |");
  console.log("|---|---|---|---|---|---|---|");
  const L = (n, r) => console.log("| " + n + " | **" + eur(r.anual) + "** | " + eur(r.dd) + " | " + r.ddPct.toFixed(1) + "% | " + eur(r.peor) + " | " + eur(r.es5) + " | " + eur(r.minC) + " |");
  L("siempre encendido, 1 contrato", rBase);
  L("APAGAR fin de mes, 1 contrato", rFin);
  L("tamaño " + mDD.toFixed(2) + " siempre (misma caída)", rDD);
  L("la MITAD siempre (0,50)", rMitad);
}
