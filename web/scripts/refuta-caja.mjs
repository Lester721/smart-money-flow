// REFUTACIÓN CON LA LENTE "CAJA" — ¿queda algo después, y en qué fecha se rompe?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/refuta-caja.mjs
//
// El hallazgo original (scripts/cuanto-aguanta-caja.mjs) concluye: "con 1 y 2 contratos NINGUNA
// de las tres geometrías provoca llamada de margen en 1.069 sesiones". Ese resultado se apoya en
// DOS cosas que aquí se ponen a prueba:
//
//   1. UNA SOLA FECHA DE ARRANQUE (2022-04-27). Antes del mal trecho la caja acumuló $13.440 de
//      beneficio, y ese colchón es lo que absorbe la caída. La caja mínima de −$766 no es una
//      propiedad de la estrategia: es una propiedad del día en que se empezó.
//   2. HOOD CONGELADO a $48.135 los 4,3 años. La línea de llamada es el 70% del valor de HOOD.
//      Los cierres reales de HOOD están en scripts/cache-theta/HOOD_bars_20201122_20270308.json
//      (NO en cache-theta/cierres/, que sólo tiene 28 tickers y ninguno es HOOD).
//
// Además se endurecen los dos supuestos que el propio autor declara optimistas:
//   3. El colateral abierto cuenta en el requisito de mantenimiento (equity ≥ 30%·HOOD + colateral).
//   4. El poder de compra baja 2:1 con las pérdidas (Reg-T), no 1:1.
//
// PRUEBAS DECLARADAS: 3 geometrías × 2 tamaños × (arranque fijo + arranque rodante) × 2 mitades
//                     + 4 variantes de dureza = 24.

import { readFileSync, existsSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { listonT } from "../lib/barreraHallazgos";

// ── LA CUENTA REAL (get_portfolio, 2026-08-17) ──────────────────────────────────────────────
const EFECTIVO = 7977;
const CUENTA = 56389;
const ACCIONES = 500;              // 500 acciones de HOOD
const HOOD_HOY = 48135;            // = $96,27 × 500
const BP0 = 73874;
const INT = 0.05;
const MANT = 0.30;                 // mantenimiento del 30% sobre la acción
const PRUEBAS = 24;

const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const pct = (x) => (x < 0 ? "−" : "") + Math.abs(x * 100).toFixed(1) + "%";
const anosEntre = (a, b) => (new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000 / 365.25;
const q = (v, p) => { const s = [...v].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

const D = JSON.parse(readFileSync("scripts/cuanto-aguanta-dias.json", "utf8")).dias;

// ── HOOD REAL, día a día ────────────────────────────────────────────────────────────────────
const FH = "scripts/cache-theta/HOOD_bars_20201122_20270308.json";
if (!existsSync(FH)) throw new Error("no está el fichero de HOOD: " + FH);
const barras = JSON.parse(readFileSync(FH, "utf8"));
const mapaH = new Map(barras.map((b) => [b.time, b.close]));
console.log(`HOOD real: ${barras.length} cierres · ${barras[0].time} → ${barras[barras.length - 1].time} · último ${barras[barras.length - 1].close}`);

let ultimo = null, ffill = 0;
for (const d of D) {
  const c = mapaH.get(d.fecha);
  if (c > 0) { ultimo = c; d.hood = c; }
  else { d.hood = ultimo; ffill++; }         // arrastre del cierre anterior, contado y declarado
  d.hoodVal = d.hood * ACCIONES;
}
if (D.some((d) => !(d.hoodVal > 0))) throw new Error("hay sesiones sin precio de HOOD antes del primero");
console.log(`sesiones con arrastre del cierre anterior de HOOD: ${ffill} de ${D.length} (la serie de HOOD acaba el ${barras[barras.length - 1].time})`);
console.log(`HOOD en la muestra: mín $${Math.min(...D.map((d) => d.hood)).toFixed(2)} · máx $${Math.max(...D.map((d) => d.hood)).toFixed(2)} · primer día $${D[0].hood.toFixed(2)} · último $${D[D.length - 1].hood.toFixed(2)}`);

// ── RADIOGRAFÍA antes de medir ──────────────────────────────────────────────────────────────
radiografia(
  D.map((d) => ({ plA: d.A.pl, plB: d.B.pl, plC: d.C.pl, hood: d.hood, hoodVal: d.hoodVal, cierre: d.cierre })),
  ["plA", "plB", "plC", "hood", "hoodVal", "cierre"],
  "refutación caja · P&L + HOOD real",
);
console.log(`  opera (filtro): ${D.filter((d) => d.opera === true).length} sí · ${D.filter((d) => d.opera === false).length} no`);
console.log(`  Listón con ${PRUEBAS} pruebas declaradas: |t| ≥ ${listonT(PRUEBAS).toFixed(2)} (aquí se cuenta dinero, no se contrasta hipótesis).`);

const CFG = [
  { id: "A", nom: "cóndor de HOY  ±25/50", ala: 50, pl: (d) => d.A.pl, abre: () => true },
  { id: "B", nom: "FILTRO AMPLITUD ±30/50", ala: 50, pl: (d) => d.B.pl, abre: (d) => d.opera === true },
  { id: "C", nom: "por STRADDLE 2,3×/30", ala: 30, pl: (d) => d.C.pl, abre: () => true },
];

/**
 * La caja, día a día, sobre `dias`, arrancando SIEMPRE con los mismos $7.977.
 * hood: "fijo" (supuesto del autor) | "real" (cierres reales de HOOD)
 * colatEnLinea: si el colateral abierto cuenta en el requisito de mantenimiento
 * bp2a1: si el poder de compra baja 2:1 con las pérdidas (Reg-T) en vez de 1:1
 */
function caja(cfg, n, dias, { hood = "fijo", colatEnLinea = false, bp2a1 = false } = {}) {
  const colat = cfg.ala * 100 * n;
  let c = EFECTIVO, interes = 0, min = EFECTIVO, fMin = dias[0].fecha;
  let pico = EFECTIVO, dd = 0, fDD = "", rojo = null, diasRojo = 0;
  let llam = null, sinPoder = 0, opera = 0, prev = dias[0].fecha;

  for (const d of dias) {
    const nd = Math.max(0, (new Date(d.fecha + "T00:00:00Z") - new Date(prev + "T00:00:00Z")) / 86400000);
    prev = d.fecha;
    if (c < 0 && nd > 0) { const i2 = c * INT * nd / 365; interes += i2; c += i2; }

    const H = hood === "real" ? d.hoodVal : HOOD_HOY;
    let abierto = false;
    if (cfg.abre(d)) {
      const disp = bp2a1 ? BP0 + 2 * (c - EFECTIVO) : BP0 + (c - EFECTIVO);
      if (colat > disp) sinPoder++;
      else { c += cfg.pl(d) * n; opera++; abierto = true; }
    }

    // línea de llamada: equity (HOOD + caja) < mantenimiento (30%·HOOD [+ colateral abierto])
    const linea = -(1 - MANT) * H + (colatEnLinea && abierto ? colat : 0);
    if (c > pico) pico = c;
    if (pico - c > dd) { dd = pico - c; fDD = d.fecha; }
    if (c < min) { min = c; fMin = d.fecha; }
    if (c < 0) { diasRojo++; if (!rojo) rojo = d.fecha; }
    if (c < linea && !llam) llam = d.fecha;
  }
  const anos = anosEntre(dias[0].fecha, dias[dias.length - 1].fecha);
  return { final: c, anual: (c - EFECTIVO) / anos, anos, interes, min, fMin, dd, fDD, ddPct: dd / CUENTA, rojo, diasRojo, llam, sinPoder, opera, colat };
}

// ════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(120));
console.log(`  REFUTACIÓN CAJA · ${D.length} sesiones · ${D[0].fecha} → ${D[D.length - 1].fecha} · efectivo $7.977 · 500 HOOD · interés 5%`);
console.log("═".repeat(120));

// ── 0 · SANIDAD: se reproduce el hallazgo tal cual ───────────────────────────────────────────
console.log("\n\n### 0 · SANIDAD — se reproduce el hallazgo con SUS supuestos (HOOD fijo, 1:1, sin colateral en la línea)\n");
console.log("| geometría | ctr | $/año NETO | caída máx | caja mínima | LLAMADA |");
console.log("|---|---|---|---|---|---|");
for (const cfg of CFG) for (const n of [1, 2]) {
  const r = caja(cfg, n, D);
  console.log(`| ${cfg.nom} | ${n} | ${eur(r.anual)} | ${eur(-r.dd)} | ${eur(r.min)} (${r.fMin}) | ${r.llam || "NO"} |`);
}

// ── 1 · LO MISMO CON HOOD REAL ───────────────────────────────────────────────────────────────
console.log("\n\n### 1 · EL MISMO ARRANQUE, PERO CON EL HOOD REAL — la línea de llamada se mueve cada día\n");
console.log(`HOOD el ${D[0].fecha}: $${D[0].hood.toFixed(2)} × 500 = ${eur(D[0].hoodVal)} → línea ${eur(-0.7 * D[0].hoodVal)}   (el autor usa ${eur(-0.7 * HOOD_HOY)} TODOS los días)\n`);
console.log("| geometría | ctr | $/año NETO | caja mínima | días en rojo | interés | LLAMADA (HOOD real) |");
console.log("|---|---|---|---|---|---|---|");
for (const cfg of CFG) for (const n of [1, 2]) {
  const r = caja(cfg, n, D, { hood: "real" });
  console.log(`| ${cfg.nom} | ${n} | ${eur(r.anual)} | ${eur(r.min)} (${r.fMin}) | ${r.diasRojo} | ${eur(r.interes)} | ${r.llam ? "**" + r.llam + "**" : "no"} |`);
}

// ── 2 · EL ARRANQUE RODANTE — la prueba que decide ───────────────────────────────────────────
// Empezar con $7.977 en CADA una de las 1.069 sesiones y correr hasta el final de la muestra.
console.log("\n\n### 2 · ARRANQUE RODANTE — empezar con $7.977 en CADA sesión y correr hasta el final\n");
console.log("(el hallazgo mide UNA de estas 1.069 filas: la que empieza el primer día, que es la que más colchón acumula antes del mal trecho)\n");
console.log("| geometría | ctr | HOOD | arranques con LLAMADA | % | primer arranque que rompe | peor caja | arranque peor | préstamo mediano |");
console.log("|---|---|---|---|---|---|---|---|---|");
const rod = {};
for (const cfg of CFG) for (const n of [1, 2]) for (const hood of ["fijo", "real"]) {
  const mins = [], calls = [];
  let peor = Infinity, peorIni = "", primerRompe = null;
  for (let i = 0; i < D.length - 20; i++) {
    const r = caja(cfg, n, D.slice(i), { hood });
    mins.push(r.min);
    if (r.llam) { calls.push(D[i].fecha); if (!primerRompe) primerRompe = `${D[i].fecha} → llamada ${r.llam}`; }
    if (r.min < peor) { peor = r.min; peorIni = D[i].fecha; }
  }
  rod[`${cfg.id}${n}${hood}`] = { calls: calls.length, tot: D.length - 20, peor, peorIni, primerRompe, mins };
  console.log(`| ${cfg.nom} | ${n} | ${hood} | **${calls.length}** de ${D.length - 20} | ${(calls.length / (D.length - 20) * 100).toFixed(1)}% | ${primerRompe || "—"} | ${eur(peor)} | ${peorIni} | ${eur(Math.min(0, q(mins, 0.5)))} |`);
}

// ── 3 · VENTANAS DE UN AÑO DESDE FRÍO (horizontes comparables) ───────────────────────────────
console.log("\n\n### 3 · UN AÑO DESDE FRÍO — cada ventana de 252 sesiones arrancando con $7.977\n");
console.log("| geometría | ctr | HOOD | ventanas | con LLAMADA | sin efectivo | caja mín. mediana | caja mín. p10 | $/año mediano | $/año p10 |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
const VEN = 252;
const anual1 = {};
for (const cfg of CFG) for (const n of [1, 2]) for (const hood of ["fijo", "real"]) {
  const mins = [], anuales = []; let calls = 0, rojos = 0, nv = 0;
  for (let i = 0; i + VEN <= D.length; i++) {
    const r = caja(cfg, n, D.slice(i, i + VEN), { hood });
    mins.push(r.min); anuales.push(r.anual); nv++;
    if (r.llam) calls++;
    if (r.rojo) rojos++;
  }
  anual1[`${cfg.id}${n}${hood}`] = anuales;
  console.log(`| ${cfg.nom} | ${n} | ${hood} | ${nv} | **${calls}** (${(calls / nv * 100).toFixed(1)}%) | ${rojos} (${(rojos / nv * 100).toFixed(1)}%) | ${eur(q(mins, 0.5))} | ${eur(q(mins, 0.10))} | ${eur(q(anuales, 0.5))} | ${eur(q(anuales, 0.10))} |`);
}

// ── 4 · LA REGLA DE HIERRO: ¿pasa en LAS DOS MITADES? ────────────────────────────────────────
console.log("\n\n### 4 · LAS DOS MITADES POR SEPARADO — ventanas de 252 desde frío, HOOD real\n");
const iB = D.findIndex((d) => d.ano >= 2024);
console.log(`A = ${D[0].fecha} → ${D[iB - 1].fecha} (${iB} sesiones) · B = ${D[iB].fecha} → ${D[D.length - 1].fecha} (${D.length - iB} sesiones)\n`);
console.log("| geometría | ctr | mitad | ventanas | con LLAMADA | sin efectivo | caja mín. p10 | $/año mediano |");
console.log("|---|---|---|---|---|---|---|---|");
for (const cfg of CFG) for (const n of [1, 2]) for (const [nom, sl] of [["A 2022-23", D.slice(0, iB)], ["B 2024-26", D.slice(iB)]]) {
  const mins = [], anuales = []; let calls = 0, rojos = 0, nv = 0;
  for (let i = 0; i + VEN <= sl.length; i++) {
    const r = caja(cfg, n, sl.slice(i, i + VEN), { hood: "real" });
    mins.push(r.min); anuales.push(r.anual); nv++;
    if (r.llam) calls++; if (r.rojo) rojos++;
  }
  if (!nv) { console.log(`| ${cfg.nom} | ${n} | ${nom} | 0 | — | — | — | — |`); continue; }
  console.log(`| ${cfg.nom} | ${n} | ${nom} | ${nv} | **${calls}** (${(calls / nv * 100).toFixed(1)}%) | ${rojos} (${(rojos / nv * 100).toFixed(1)}%) | ${eur(q(mins, 0.10))} | ${eur(q(anuales, 0.5))} |`);
}

// ── 5 · LOS DOS SUPUESTOS OPTIMISTAS, ENDURECIDOS ────────────────────────────────────────────
console.log("\n\n### 5 · ENDURECIENDO LOS SUPUESTOS QUE EL AUTOR DECLARA OPTIMISTAS (arranque original, período entero)\n");
console.log("| geometría | ctr | base (autor) | + HOOD real | + colateral en mantenimiento | + poder de compra 2:1 | TODO junto |");
console.log("|---|---|---|---|---|---|---|");
for (const cfg of CFG) for (const n of [1, 2]) {
  const v = [
    caja(cfg, n, D),
    caja(cfg, n, D, { hood: "real" }),
    caja(cfg, n, D, { colatEnLinea: true }),
    caja(cfg, n, D, { bp2a1: true }),
    caja(cfg, n, D, { hood: "real", colatEnLinea: true, bp2a1: true }),
  ].map((r) => (r.llam ? `**LLAMADA ${r.llam}**` : `ok ${eur(r.min)}`));
  console.log(`| ${cfg.nom} | ${n} | ${v.join(" | ")} |`);
}

// ── 6 · EL PEOR ARRANQUE, CONTADO ────────────────────────────────────────────────────────────
console.log("\n\n### 6 · EL PEOR ARRANQUE — qué pasa si se empieza el día que peor pinta tiene\n");
for (const cfg of CFG) for (const n of [1, 2]) {
  const k = rod[`${cfg.id}${n}real`];
  const i = D.findIndex((d) => d.fecha === k.peorIni);
  const r = caja(cfg, n, D.slice(i), { hood: "real" });
  console.log(`${cfg.nom} · ${n} ctr · empezando el ${k.peorIni}: caja mínima ${eur(r.min)} el ${r.fMin} · ${r.diasRojo} días en rojo · interés ${eur(r.interes)} · llamada: ${r.llam || "no"} · acaba en ${eur(r.final)} tras ${r.anos.toFixed(2)} años → ${eur(r.anual)}/año`);
}

// ── 7 · ¿QUEDA ALGO DESPUÉS? El $/año NETO honesto ───────────────────────────────────────────
console.log("\n\n### 7 · ¿QUEDA ALGO? — el $/año NETO según de qué día se arranque (ventanas de 252, HOOD real)\n");
console.log("| geometría | ctr | p10 | mediana | p90 | ventanas en pérdida | el número que reporta el hallazgo |");
console.log("|---|---|---|---|---|---|---|");
for (const cfg of CFG) for (const n of [1, 2]) {
  const a = anual1[`${cfg.id}${n}real`];
  const neg = a.filter((x) => x < 0).length;
  const base = caja(cfg, n, D).anual;
  console.log(`| ${cfg.nom} | ${n} | ${eur(q(a, 0.10))} | **${eur(q(a, 0.5))}** | ${eur(q(a, 0.90))} | ${neg} de ${a.length} (${(neg / a.length * 100).toFixed(1)}%) | ${eur(base)} |`);
}
