// ═══════════════════════════════════════════════════════════════════════════════════════════════
// REFUTACIÓN CON LA LENTE «DINERO» · TERCERA PARTE — EL TAMAÑO TAMBIÉN SE CRUZA
//
// En la parte 2 elegí el tamaño máximo mirando las 870 ventanas de TODA la muestra. Eso es
// exactamente el pecado que este encargo prohíbe: elegir un número mirando el resultado.
// Aquí el tamaño se elige en una mitad y se aplica a la otra, en las dos direcciones.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/refut-dinero-3.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from "node:fs";

const EFECTIVO = 7977, CUENTA = 56389, COLATERAL = 5000;
const TASA_MARGEN = 0.05, BASE_DIAS = 360, COMM_PATA = 0.03, DIAS_ANO = 252, VENT = 252;
const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))] : NaN; };
const H = (t) => { console.log("\n" + "═".repeat(112)); console.log(t); console.log("═".repeat(112)); };

const filas = JSON.parse(readFileSync("scripts/refut-dinero-filas.json", "utf8"));
filas.sort((a, b) => a.fecha.localeCompare(b.fecha));
const FEST = new Set(["2022-01-17","2022-02-21","2022-04-15","2022-05-30","2022-06-20","2022-07-04","2022-09-05","2022-11-24","2022-12-26",
"2023-01-02","2023-01-16","2023-02-20","2023-04-07","2023-05-29","2023-06-19","2023-07-04","2023-09-04","2023-11-23","2023-12-25",
"2024-01-01","2024-01-15","2024-02-19","2024-03-29","2024-05-27","2024-06-19","2024-07-04","2024-09-02","2024-11-28","2024-12-25",
"2025-01-01","2025-01-09","2025-01-20","2025-02-17","2025-04-18","2025-05-26","2025-06-19","2025-07-04","2025-09-01","2025-11-27","2025-12-25",
"2026-01-01","2026-01-19","2026-02-16","2026-04-03","2026-05-25","2026-06-19","2026-07-03","2026-09-07","2026-11-26","2026-12-25"]);
const iso = (d) => d.toISOString().slice(0, 10);
const SES = [];
for (let d = new Date("2021-12-01T00:00:00Z"); iso(d) <= "2026-12-31"; d.setUTCDate(d.getUTCDate() + 1)) { const s = iso(d), w = d.getUTCDay(); if (w !== 0 && w !== 6 && !FEST.has(s)) SES.push(s); }
const POS = new Map(SES.map((s, i) => [s, i]));
for (const f of filas) { f.ultimoMes = SES[POS.get(f.fecha) + 1].slice(5, 7) !== f.fecha.slice(5, 7) ? 1 : 0; f.pl = f.creditoNat - f.perdidaC - f.perdidaP - 8 * COMM_PATA; }
const A = filas.filter((f) => f.fecha < "2024-01-01"), B = filas.filter((f) => f.fecha >= "2024-01-01");
const sinRegla = () => false, conRegla = (f) => f.ultimoMes === 1;

function ventana(fs, i, n, saltar, k) {
  let c = EFECTIVO, minC = EFECTIVO, prev = null;
  for (let j = i; j < Math.min(i + n, fs.length); j++) {
    const f = fs[j];
    if (prev && c < 0) c -= -c * TASA_MARGEN / BASE_DIAS * ((new Date(f.fecha) - new Date(prev)) / 86400000);
    prev = f.fecha;
    if (saltar(f)) continue;
    c += f.pl * k;
    if (c < minC) minC = c;
  }
  return minC;
}
/** Ventanas de un año que ARRANCAN dentro de `fs`, pero que pueden seguir por la muestra entera. */
function rojo(fs, saltar, k) {
  const ini = new Set(fs.map((f) => f.fecha));
  let n = 0, r = 0, mins = [];
  for (let i = 0; i + VENT <= filas.length; i++) {
    if (!ini.has(filas[i].fecha)) continue;
    const m = ventana(filas, i, VENT, saltar, k); n++; mins.push(m); if (m < 0) r++;
  }
  return { n, r, pct: r / n, mediana: pct(mins, 0.5), peor: Math.min(...mins) };
}
/** Tamaño máximo (en cóndores SPXW) con el que NINGUNA ventana de arranque dentro de `fs` va a rojo. */
function tamanoMax(fs, saltar) {
  for (let k = 1; k >= 0.005; k -= 0.005) if (rojo(fs, saltar, k).r === 0) return Math.round(k * 1000) / 1000;
  return 0;
}
const anos = (fs) => fs.length / DIAS_ANO;
const alAno = (fs, saltar, k) => fs.filter((f) => !saltar(f)).reduce((a, f) => a + f.pl, 0) * k / anos(fs);

H("15 · EL TAMAÑO, CRUZADO · se elige en una mitad y se aplica a la otra, sin tocarlo");
console.log("  «tamaño» = el mayor número de cóndores SPXW con el que la caja NUNCA se pone en rojo en");
console.log("  ninguna ventana de un año que arranque en el período de ajuste. 1,0 = SPXW · 0,1 = un XSP.\n");
for (const [nomA, aj, nomB, pr] of [["2022-2023", A, "2024-2026", B], ["2024-2026", B, "2022-2023", A]]) {
  console.log("─".repeat(112));
  console.log(`AJUSTADO EN ${nomA} → APLICADO A ${nomB}`);
  for (const [rn, rg] of [["sin regla", sinRegla], ["CON regla fin de mes", conRegla]]) {
    const k = tamanoMax(aj, rg);
    const dentro = rojo(aj, rg, k), fuera = rojo(pr, rg, k);
    console.log(`  ${rn.padEnd(22)} tamaño elegido ${k.toFixed(3)} (${(k * 10).toFixed(1)} XSP)` +
      `  →  FUERA DE MUESTRA: ${fuera.r} de ${fuera.n} ventanas en rojo (${(fuera.pct * 100).toFixed(0)}%)` +
      `  caja mín peor ${eur(fuera.peor)}  ·  rinde ${eur(alAno(pr, rg, k))}/año (${(alAno(pr, rg, k) / CUENTA * 100).toFixed(2)}% de la cuenta)`);
  }
}

H("16 · LA PREGUNTA FINAL, EN UN NÚMERO");
// tamaño elegido en cada mitad, aplicado a la otra, CON la regla; se toma el PEOR de los dos
const kA = tamanoMax(A, conRegla), kB = tamanoMax(B, conRegla);
const kAsinR = tamanoMax(A, sinRegla), kBsinR = tamanoMax(B, sinRegla);
console.log(`  tamaño elegido en 2022-2023 CON regla: ${kA.toFixed(3)} · aplicado a 2024-2026 rinde ${eur(alAno(B, conRegla, kA))}/año`);
console.log(`  tamaño elegido en 2024-2026 CON regla: ${kB.toFixed(3)} · aplicado a 2022-2023 rinde ${eur(alAno(A, conRegla, kB))}/año`);
console.log(`  el mismo ejercicio SIN la regla:       ${kAsinR.toFixed(3)} → ${eur(alAno(B, sinRegla, kAsinR))}/año  ·  ${kBsinR.toFixed(3)} → ${eur(alAno(A, sinRegla, kBsinR))}/año`);
console.log(`\n  LO QUE APORTA LA REGLA, FUERA DE MUESTRA Y AL TAMAÑO QUE LA CUENTA AGUANTA:`);
console.log(`    dirección A→B:  ${eur(alAno(B, conRegla, kA))} − ${eur(alAno(B, sinRegla, kAsinR))} = ${eur(alAno(B, conRegla, kA) - alAno(B, sinRegla, kAsinR))}/año`);
console.log(`    dirección B→A:  ${eur(alAno(A, conRegla, kB))} − ${eur(alAno(A, sinRegla, kBsinR))} = ${eur(alAno(A, conRegla, kB) - alAno(A, sinRegla, kBsinR))}/año`);
const spx0 = filas[0].cierre, spx1 = filas[filas.length - 1].cierre;
const anosSpx = (new Date(filas[filas.length - 1].fecha) - new Date(filas[0].fecha)) / 86400000 / 365.25;
console.log(`\n  el listón: el índice hizo ${(((spx1 / spx0) ** (1 / anosSpx) - 1) * 100).toFixed(1)}%/año = ${eur(CUENTA * ((spx1 / spx0) ** (1 / anosSpx) - 1))}/año sobre la misma cuenta.`);
