// APAGAR-Y-ENCENDER · PARTE 5 — LA REGLA DE HIERRO APLICADA A LA ELECCIÓN DE LA SEÑAL.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/apagar-encender-5.mjs
//
// Las partes 1-4 miden la señal YA ELEGIDA. Esto mide el PROCEDIMIENTO: se escanea el menú de 53
// reglas de calendario en la PRIMERA mitad, se coge la mejor, y se aplica TAL CUAL a la segunda.
// Y al revés. Es la única forma de saber si "buscar un hoy-no" produce algo o produce ruido.
//
// Se mide además la correlación entre la ventaja de las 53 reglas en A y en B. Si el ingreso de
// una regla de régimen se hereda entre períodos, esa ρ tiene que ser positiva y grande.

import { readFileSync } from "node:fs";

const EFECTIVO = 7977, INT = 0.05;
const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const anosE = (a, b) => (new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000 / 365.25;
function rho(a, b) { const ma = media(a), mb = media(b); let n = 0, da = 0, db = 0; for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return n / Math.sqrt(da * db); }
function rhoRango(a, b) { const r = (v) => { const o = v.map((x, i) => [x, i]).sort((p, q) => p[0] - q[0]); const s = new Array(v.length); o.forEach(([, i], k) => (s[i] = k)); return s; }; return rho(r(a), r(b)); }

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
const N = filas.length;

// ── el mismo menú de 53 reglas que la parte 4 ───────────────────────────────────────────────
const porMes = new Map();
filas.forEach((f, i) => { if (!porMes.has(f.mes)) porMes.set(f.mes, []); porMes.get(f.mes).push(i); });
const mesesConFin = new Set(filas.filter((f) => f.finMes).map((f) => f.mes));
const posFin = new Array(N), posIni = new Array(N);
for (const [, idx] of porMes) idx.forEach((p, k) => { posFin[p] = idx.length - 1 - k; posIni[p] = k; });
const tv = (f) => { const d = +f.slice(8, 10); return d >= 15 && d <= 21 && new Date(f + "T00:00:00Z").getUTCDay() === 5; };
const REGLAS = [];
const add = (nom, test) => { const off = filas.map((f, i) => (test(f, i) ? 1 : 0)); if (suma(off) >= 20) REGLAS.push({ nom, off }); };
for (let j = 0; j < 10; j++) add("fin−" + j, (f, i) => mesesConFin.has(f.mes) && posFin[i] === j);
for (let j = 0; j < 10; j++) add("ini+" + j, (f, i) => mesesConFin.has(f.mes) && posIni[i] === j);
for (const d of [1, 2, 3, 4, 5]) add("dow=" + d, (f) => f.dow === d);
for (let m = 1; m <= 12; m++) add("mes=" + m, (f) => f.mesNum === m);
for (let c = 1; c <= 6; c++) add("dom " + ((c - 1) * 5 + 1) + "-" + (c === 6 ? 31 : c * 5), (f) => Math.min(6, Math.ceil(f.dom / 5)) === c);
for (let s = 1; s <= 5; s++) add("semMes=" + s, (f) => Math.ceil(f.dom / 7) === s);
add("OPEX", (f) => tv(f.fecha));
add("2 últimos del mes", (f, i) => mesesConFin.has(f.mes) && posFin[i] <= 1);
add("2 primeros del mes", (f, i) => mesesConFin.has(f.mes) && posIni[i] <= 1);
add("3 últimos del mes", (f, i) => mesesConFin.has(f.mes) && posFin[i] <= 2);
add("finTrim", (f, i) => mesesConFin.has(f.mes) && posFin[i] === 0 && [3, 6, 9, 12].includes(f.mesNum));
add("semana de OPEX", (f, i) => { for (let k = 0; k <= 4; k++) { const j = i + k; if (j < N && tv(filas[j].fecha)) return true; } return false; });

// ── ventaja NETA de exposición dentro de un tramo ───────────────────────────────────────────
function anualTramo(ini, fin, campo, off, mult) {
  let caja = EFECTIVO, prev = null;
  for (let i = ini; i < fin; i++) {
    const d = prev == null ? 1 : Math.max(1, (new Date(filas[i].fecha + "T00:00:00Z") - prev) / 86400000);
    prev = new Date(filas[i].fecha + "T00:00:00Z");
    if (caja < 0) caja += caja * INT * d / 365;
    if (!off || !off[i]) caja += filas[i][campo] * mult;
  }
  return (caja - EFECTIVO) / anosE(filas[ini].fecha, filas[fin - 1].fecha);
}
function ventaja(ini, fin, campo, off) {
  let nOff = 0; for (let i = ini; i < fin; i++) if (off[i]) nOff++;
  const frac = (fin - ini - nOff) / (fin - ini);
  if (nOff < 8) return null;                       // muestra corta dentro del tramo: no cuenta
  return anualTramo(ini, fin, campo, off, 1) - anualTramo(ini, fin, campo, null, frac);
}

console.log("═".repeat(104));
console.log("  PARTE 5 · LA REGLA DE HIERRO SOBRE LA ELECCIÓN DE LA SEÑAL · menú de " + REGLAS.length + " reglas");
console.log("═".repeat(104));

const CORTES = [
  ["mitad por días", 0, Math.floor(N / 2), Math.floor(N / 2), N],
  ["2022-23 vs 2024-26", 0, filas.findIndex((f) => f.fecha >= "2024-01-01"), filas.findIndex((f) => f.fecha >= "2024-01-01"), N],
];

for (const [campo, nomG] of [["plProp", "PROPUESTA ±0,80σ/ala30"], ["plHoy", "CÓNDOR HOY ±25/ala50"]]) {
  console.log("\n" + "─".repeat(104));
  console.log(" " + nomG);
  console.log("─".repeat(104));
  for (const [nomC, a0, a1, b0, b1] of CORTES) {
    const vA = REGLAS.map((r) => ventaja(a0, a1, campo, r.off));
    const vB = REGLAS.map((r) => ventaja(b0, b1, campo, r.off));
    const ok = REGLAS.map((_, i) => i).filter((i) => vA[i] != null && vB[i] != null);
    console.log("\n### CORTE: " + nomC + " · A = " + filas[a0].fecha + "→" + filas[a1 - 1].fecha + " · B = " + filas[b0].fecha + "→" + filas[b1 - 1].fecha + "\n");
    console.log("| se elige en | la MEJOR regla de las " + ok.length + " | su ventaja DONDE SE ELIGIÓ | su ventaja EN EL OTRO LADO | ¿sobrevive? |");
    console.log("|---|---|---|---|---|");
    const mejorA = ok.slice().sort((x, y) => vB[0] === undefined ? 0 : vA[y] - vA[x])[0];
    const mejorB = ok.slice().sort((x, y) => vB[y] - vB[x])[0];
    console.log("| A → probada en B | " + REGLAS[mejorA].nom + " | " + eur(vA[mejorA]) + " | **" + eur(vB[mejorA]) + "** | " + (vB[mejorA] > 0 ? "sí" : "**NO**") + " |");
    console.log("| B → probada en A | " + REGLAS[mejorB].nom + " | " + eur(vB[mejorB]) + " | **" + eur(vA[mejorB]) + "** | " + (vA[mejorB] > 0 ? "sí" : "**NO**") + " |");
    const iFin = REGLAS.findIndex((r) => r.nom === "fin−0");
    const rkA = ok.slice().sort((x, y) => vA[y] - vA[x]).indexOf(iFin) + 1;
    const rkB = ok.slice().sort((x, y) => vB[y] - vB[x]).indexOf(iFin) + 1;
    console.log("| **finMes** | fin−0 | A: " + eur(vA[iFin]) + " (puesto " + rkA + ") | B: " + eur(vB[iFin]) + " (puesto " + rkB + ") | " + (vA[iFin] > 0 && vB[iFin] > 0 ? "sí, el mismo signo" : "**NO**") + " |");
    console.log("\n   ρ (Pearson) de la ventaja de las " + ok.length + " reglas entre A y B: **" + rho(ok.map((i) => vA[i]), ok.map((i) => vB[i])).toFixed(2) + "**");
    console.log("   ρ de RANGO (¿se ordenan igual?): **" + rhoRango(ok.map((i) => vA[i]), ok.map((i) => vB[i])).toFixed(2) + "**");
    const top5 = ok.slice().sort((x, y) => vA[y] - vA[x]).slice(0, 5);
    console.log("   las 5 mejores de A, medidas en B: " + top5.map((i) => REGLAS[i].nom + " " + eur(vB[i])).join(" · "));
    console.log("   media en B de las 5 mejores de A: **" + eur(media(top5.map((i) => vB[i]))) + "**  ·  media en B de las 53: " + eur(media(ok.map((i) => vB[i]))));
  }
}
