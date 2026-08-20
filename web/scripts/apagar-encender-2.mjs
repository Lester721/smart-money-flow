// APAGAR-Y-ENCENDER · PARTE 2 — ¿de qué está hecha la ganancia de finMes?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/apagar-encender-2.mjs
//
// La parte 1 dejó esto: apagar el último día hábil del mes sube el cóndor de $1.681 a $3.849/año
// y bate 500 de 500 sorteos al azar. Un 4,9% menos de exposición NO puede DUPLICAR el ingreso si
// no está pasando una de dos cosas: (a) el último día del mes es de verdad distinto, o (b) dos o
// tres días sueltos cargan con todo. Aquí se separa una de la otra.
//
// PRUEBAS DE ESTA PARTE (declaradas): 6 → listón |t| = listonT(6). Sumadas a las 12 de la parte 1.

import { readFileSync } from "node:fs";
import { tWelch, listonT, potencia } from "../lib/barreraHallazgos";

const EFECTIVO = 7977, CUENTA = 56389, INT = 0.05;
const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const pctl = (v, q) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))] : NaN; };
const anos = (a, b) => (new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000 / 365.25;

const G = JSON.parse(readFileSync("scripts/dm-grid.json", "utf8"));
const filas = [];
for (let i = 0; i < G.dias.length; i++) {
  const a = G.variantes["s0.80_a30"].serie[i], b = G.variantes["p25_a50"].serie[i];
  if (!a || !b) continue;
  filas.push({ fecha: G.dias[i].fecha, ano: G.dias[i].ano, mes: G.dias[i].fecha.slice(0, 7),
    mesNum: +G.dias[i].fecha.slice(5, 7), finMes: G.dias[i].finMes, plProp: a.pl, plHoy: b.pl });
}
filas.sort((x, y) => x.fecha.localeCompare(y.fecha));
const AN = anos(filas[0].fecha, filas[filas.length - 1].fecha);
const N = filas.length;
const LIS6 = listonT(6), LIS18 = listonT(18);

function correr(fs, campo, off, mult) {
  let caja = EFECTIVO, minC = caja, interes = 0, acc = 0, pico = 0, dd = 0, prev = fs[0].fecha;
  const op = [];
  for (let i = 0; i < fs.length; i++) {
    const d = Math.max(1, (new Date(fs[i].fecha + "T00:00:00Z") - new Date(prev + "T00:00:00Z")) / 86400000); prev = fs[i].fecha;
    if (caja < 0) { const it = caja * INT * d / 365; interes += it; caja += it; }
    const pl = off[i] ? 0 : fs[i][campo] * mult;
    if (!off[i]) op.push(pl);
    caja += pl; acc += pl; if (acc > pico) pico = acc; if (pico - acc > dd) dd = pico - acc; if (caja < minC) minC = caja;
  }
  const A = anos(fs[0].fecha, fs[fs.length - 1].fecha);
  return { anual: (caja - EFECTIVO) / A, dd: -dd, ddPct: dd / CUENTA * 100, minC, interes,
    peorDia: op.length ? Math.min(...op) : 0,
    es5: media([...op].sort((a, b) => a - b).slice(0, Math.max(1, Math.floor(op.length * 0.05)))) };
}
const CERO = new Array(N).fill(0);
const OFF_FIN = filas.map((f) => f.finMes);

console.log("═".repeat(100));
console.log("  PARTE 2 · DE QUÉ ESTÁ HECHA LA GANANCIA DE finMes · " + N + " días · listón |t| = " + LIS6 + " (6 pruebas)");
console.log("═".repeat(100));

for (const [campo, nomG] of [["plProp", "PROPUESTA ±0,80σ/ala30"], ["plHoy", "CÓNDOR HOY ±25/ala50"]]) {
  const base = correr(filas, campo, CERO, 1);
  const fin = correr(filas, campo, OFF_FIN, 1);
  const dias = filas.filter((f) => f.finMes).map((f) => ({ fecha: f.fecha, pl: f[campo] })).sort((a, b) => a.pl - b.pl);
  const evitado = -suma(dias.map((d) => d.pl));

  console.log("\n" + "─".repeat(100));
  console.log(" " + nomG + " · base " + eur(base.anual) + "/año → finMes " + eur(fin.anual) + "/año · ganancia " + eur(fin.anual - base.anual));
  console.log("─".repeat(100));

  // ── 1 · LOS 55 DÍAS, UNO A UNO ────────────────────────────────────────────────────────────
  console.log("\n### 1 · LOS " + dias.length + " DÍAS APAGADOS, DE PEOR A MEJOR (los 10 peores y los 5 mejores)\n");
  console.log("| # | fecha | P&L evitado | % del total evitado |");
  console.log("|---|---|---|---|");
  dias.slice(0, 10).forEach((d, i) => console.log("| " + (i + 1) + " | " + d.fecha + " | " + eur(d.pl) + " | " + (-d.pl / evitado * 100).toFixed(1) + "% |"));
  console.log("| … | … | … | … |");
  dias.slice(-5).forEach((d, i) => console.log("| " + (dias.length - 4 + i) + " | " + d.fecha + " | " + eur(d.pl) + " | " + (-d.pl / evitado * 100).toFixed(1) + "% |"));
  console.log("\n   total evitado en 4,6 años: " + eur(evitado) + "  ·  días con PÉRDIDA: " + dias.filter((d) => d.pl < 0).length + " de " + dias.length +
    "  ·  días con ganancia: " + dias.filter((d) => d.pl > 0).length);

  // ── 2 · CONCENTRACIÓN: quitar los k días peores del conjunto apagado ──────────────────────
  console.log("\n### 2 · CONCENTRACIÓN — si los k días PEORES no hubieran caído en fin de mes\n");
  console.log("| se le quitan | $/año finMes | ganancia sobre base | ¿sigue ganando? |");
  console.log("|---|---|---|---|");
  for (const k of [0, 1, 2, 3, 5]) {
    const quitar = new Set(dias.slice(0, k).map((d) => d.fecha));
    const off = filas.map((f) => (f.finMes && !quitar.has(f.fecha) ? 1 : 0));
    const r = correr(filas, campo, off, 1);
    console.log("| los " + k + " peores | " + eur(r.anual) + " | **" + eur(r.anual - base.anual) + "** | " + (r.anual > base.anual ? "sí" : "**NO**") + " |");
  }

  // ── 3 · NULO ESTRUCTURADO: un día al azar DE CADA MES (conserva 1/mes, rompe "el último") ──
  console.log("\n### 3 · EL NULO QUE IMPORTA — saltarse UN día al azar DE CADA MES (500 sorteos)\n");
  const porMes = new Map();
  filas.forEach((f, i) => { if (!porMes.has(f.mes)) porMes.set(f.mes, []); porMes.get(f.mes).push(i); });
  const mesesConFin = new Set(filas.filter((f) => f.finMes).map((f) => f.mes));
  let rng = 20260820; const rnd = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; };
  function nulo(candidatos) {
    const an = [], dds = [];
    for (let s = 0; s < 500; s++) {
      const off = new Array(N).fill(0);
      for (const m of mesesConFin) { const c = candidatos(porMes.get(m)); off[c[(rnd() * c.length) | 0]] = 1; }
      const r = correr(filas, campo, off, 1); an.push(r.anual); dds.push(r.dd);
    }
    return { an, dds };
  }
  const nA = nulo((idx) => idx);                          // cualquier día del mes
  const nB = nulo((idx) => idx.slice(-5));                // uno de los 5 últimos del mes
  console.log("| nulo | mediana $/año | p95 | p99 | máximo de 500 | finMes real | percentil de finMes |");
  console.log("|---|---|---|---|---|---|---|");
  for (const [nom, nn] of [["un día CUALQUIERA del mes", nA], ["uno de los 5 ÚLTIMOS del mes", nB]]) {
    const perc = nn.an.filter((x) => x < fin.anual).length / nn.an.length * 100;
    console.log("| " + nom + " | " + eur(pctl(nn.an, 0.50)) + " | " + eur(pctl(nn.an, 0.95)) + " | " + eur(pctl(nn.an, 0.99)) +
      " | " + eur(Math.max(...nn.an)) + " | **" + eur(fin.anual) + "** | **" + perc.toFixed(1) + "%** |");
  }

  // ── 4 · JACKKNIFE por año y por mes del calendario ────────────────────────────────────────
  console.log("\n### 4 · JACKKNIFE — quitar un año entero, y quitar un mes del calendario\n");
  console.log("| se quita | base $/año | finMes $/año | ganancia | signo |");
  console.log("|---|---|---|---|---|");
  for (const a of [...new Set(filas.map((f) => f.ano))].sort()) {
    const fs = filas.filter((f) => f.ano !== a);
    const b = correr(fs, campo, fs.map(() => 0), 1), r = correr(fs, campo, fs.map((f) => f.finMes), 1);
    console.log("| año " + a + " | " + eur(b.anual) + " | " + eur(r.anual) + " | **" + eur(r.anual - b.anual) + "** | " + (r.anual > b.anual ? "+" : "−") + " |");
  }
  let negativos = 0;
  const gm = [];
  for (let m = 1; m <= 12; m++) {
    const fs = filas.filter((f) => f.mesNum !== m);
    const b = correr(fs, campo, fs.map(() => 0), 1), r = correr(fs, campo, fs.map((f) => f.finMes), 1);
    gm.push({ m, g: r.anual - b.anual }); if (r.anual <= b.anual) negativos++;
  }
  console.log("   quitando cada mes del calendario: ganancia mínima " + eur(Math.min(...gm.map((x) => x.g))) +
    " (quitando " + gm.slice().sort((a, b) => a.g - b.g)[0].m + ") · máxima " + eur(Math.max(...gm.map((x) => x.g))) +
    " · meses que dan ganancia NEGATIVA: " + negativos + " de 12");

  // ── 5 · EL CARA A CARA HONESTO: mismo riesgo de COLA, no misma caída ──────────────────────
  console.log("\n### 5 · CARA A CARA AL MISMO RIESGO DE COLA (ES5 = media del 5% peor)\n");
  let mES = 0, rES = null;
  for (let m = 0.01; m <= 1.5001; m += 0.01) { const r = correr(filas, campo, CERO, m); if (Math.abs(r.es5) <= Math.abs(fin.es5) && m > mES) { mES = m; rES = r; } }
  console.log("| configuración | $/año | caída máx | peor día | ES5 |");
  console.log("|---|---|---|---|---|");
  console.log("| finMes, 1 contrato | **" + eur(fin.anual) + "** | " + eur(fin.dd) + " | " + eur(fin.peorDia) + " | " + eur(fin.es5) + " |");
  console.log("| tamaño " + mES.toFixed(2) + " siempre (mismo ES5) | " + eur(rES.anual) + " | " + eur(rES.dd) + " | " + eur(rES.peorDia) + " | " + eur(rES.es5) + " |");
  console.log("| la MITAD siempre | " + eur(correr(filas, campo, CERO, 0.5).anual) + " | " + eur(correr(filas, campo, CERO, 0.5).dd) +
    " | " + eur(correr(filas, campo, CERO, 0.5).peorDia) + " | " + eur(correr(filas, campo, CERO, 0.5).es5) + " |");

  // ── 6 · POTENCIA y listones ───────────────────────────────────────────────────────────────
  const si = filas.filter((f) => f.finMes).map((f) => f[campo]);
  const no = filas.filter((f) => !f.finMes).map((f) => f[campo]);
  const t = tWelch(si, no);
  const sd = Math.sqrt(no.reduce((a, x) => a + (x - media(no)) ** 2, 0) / (no.length - 1));
  const mde = 2.8 * sd * Math.sqrt(1 / si.length + 1 / no.length);
  console.log("\n### 6 · POTENCIA — qué se podría haber detectado\n");
  console.log("   diferencia observada por día: " + eur(media(si) - media(no)) + " · t = " + t.toFixed(2));
  console.log("   listón con 1 prueba: " + listonT(1) + " · con 6: " + LIS6 + " · **con las 18 del panel donde se eligió: " + LIS18 + "**");
  console.log("   mínimo detectable con n=" + si.length + " al listón de 18 pruebas: " + eur(mde) + "/día → " + eur(mde * si.length / AN) + "/año");
}
