// CALENDARIO CONTRA LA COLA · TERCERA PARTE — EL PUENTE.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/calendario-cola-puente.mjs
//      (lee ~1.300 ficheros de cadena, tarda unos minutos)
//
// ═══ POR QUÉ ═══════════════════════════════════════════════════════════════════════════════
// Las dos primeras partes dejan el hallazgo a medias: el fin de mes SÍ tiene la cola más gorda,
// pero NO OPERAR esos días deja el PEOR DÍA exactamente donde estaba (−$4.900), porque el peor
// día no es de fin de mes. "No operar" es la respuesta perezosa: tira el 100% de la prima de
// esos días para quitar el 100% del riesgo de esos días.
//
// La pregunta que de verdad importa es otra: **¿se puede seguir operando esos días, pero de otra
// forma?** Dos palancas, y hacen cosas distintas:
//   · ALEJAR los strikes vendidos (±25 → ±35, ±40, ±50): menos prima, menos probabilidad de que
//     te alcancen. Baja la FRECUENCIA de la cola.
//   · ESTRECHAR las alas (50 → 30 → 20 puntos): la pérdida máxima pasa de $5.000 a $3.000 y a
//     $2.000. No baja la frecuencia, baja el TAMAÑO. Es lo único que puede tocar el PEOR DÍA.
//
// Todo se reconstruye desde las cadenas reales: BID de lo vendido, ASK de lo comprado, comisión
// de $0,03 por pata, liquidación contra el precio real de las 16:00. Ni un precio de modelo.
//
// ═══ LA VALIDACIÓN QUE VA PRIMERO ══════════════════════════════════════════════════════════
// La reconstrucción a ±25 con alas de 50 tiene que dar EXACTAMENTE el P&L que ya está en
// regimen-filas.json, día a día. Si no cuadra, el lector está mal y no se mide nada. Se
// comprueba antes de imprimir un solo resultado.

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { cargar, resumen, media, eur, drawdown } from "./anatomia3-lib.mjs";

const DIR = "scripts/cache-theta/gex-2026", HORA = "11:00", COMM = 0.03;
const DISTANCIAS = [25, 30, 35, 40, 50];      // separación del strike vendido respecto al spot
const ALAS = [50, 30, 20];                    // ancho de las alas

// ── el lector, COPIADO de scripts/desde-2024.mjs. No se reinventa. ──
function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const [iK, iT, iB, iA, iU] = ["strike", "timestamp", "bid", "ask", "underlying_price"].map((c) => cab.indexOf(c));
  if ([iK, iT, iB, iA, iU].some((x) => x < 0)) throw new Error(`${f}: falta una columna. Un campo que no existe se lee como 0.`);
  const enHora = []; let spotFin = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(","), hora = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && hora >= hFin) { hFin = hora; spotFin = sp; }
    if (hora !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask, spot: sp });
  }
  return enHora.length ? { filas: enHora, cierre: spotFin } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

// ── las filas ya calculadas, para validar contra ellas ──
const { filas } = cargar();
filas.sort((a, b) => a.fecha.localeCompare(b.fecha));
const yaCalculado = new Map(filas.map((f) => [f.fecha, f.pl]));
const ANOS = filas.length / 251;

// ── banderas de calendario (mismas definiciones que en los otros dos scripts) ──
const src = readFileSync("scripts/regimen-fomc.mjs", "utf8");
const i0 = src.indexOf("const FOMC = new Set([");
const FOMC = new Set(src.slice(i0, src.indexOf("]);", i0)).match(/\d{4}-\d{2}-\d{2}/g) || []);
if (FOMC.size < 20) throw new Error("el parseo de las fechas del FOMC falló");
const mes = (f) => f.fecha.slice(0, 7);
for (let i = 0; i < filas.length; i++) {
  const f = filas[i];
  let ultimos = 0;
  for (let k = i + 1; k < filas.length && mes(filas[k]) === mes(f); k++) ultimos++;
  f.cFomc = FOMC.has(f.fecha) ? 1 : 0;
  f.cUlt2 = filas.some((g) => mes(g) > mes(f)) && ultimos <= 1 ? 1 : 0;
  f.marcado = f.cUlt2 === 1 || f.cFomc === 1 ? 1 : 0;
}
console.log(`  días marcados (2 últimos del mes + FOMC): ${filas.filter((f) => f.marcado).length} de ${filas.length}`);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 1 · RECONSTRUIR TODAS LAS VARIANTES
// ═════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n  reconstruyendo cóndores desde las cadenas reales…");
const M = new Map();                          // fecha → { "D-ALA": {pl, cred, riesgo} }
let sinCadena = 0, t0 = Date.now();
for (let n = 0; n < filas.length; n++) {
  const fecha = filas[n].fecha;
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P || !(C.cierre > 0)) { sinCadena++; continue; }
  const spot = C.filas[0].spot;
  if (!(spot > 0)) { sinCadena++; continue; }
  const S = C.cierre, dia = {};
  for (const D of DISTANCIAS) {
    const cC = cerca(C.filas, spot + D), pC = cerca(P.filas, spot - D);
    for (const ALA of ALAS) {
      const cL = cerca(C.filas, cC.K + ALA), pL = cerca(P.filas, pC.K - ALA);
      if (cL.K <= cC.K || pL.K >= pC.K) continue;
      const cred = cC.bid + pC.bid - cL.ask - pL.ask;
      if (!(cred > 0)) continue;
      const pl = (cred - Math.min(Math.max(S - cC.K, 0), cL.K - cC.K)
                       - Math.min(Math.max(pC.K - S, 0), pC.K - pL.K)) * 100 - 8 * COMM;
      dia[`${D}-${ALA}`] = { pl, cred: cred * 100, riesgo: (Math.max(cL.K - cC.K, pC.K - pL.K) - cred) * 100 };
    }
  }
  M.set(fecha, dia);
  if (n % 100 === 0) process.stdout.write(`   ${n}/${filas.length}  (${((Date.now() - t0) / 1000).toFixed(0)}s)\r`);
}
console.log(`\n  días leídos: ${M.size} · días sin cadena utilizable: ${sinCadena}`);
if (sinCadena > filas.length * 0.02) throw new Error(`${sinCadena} días sin cadena — eso no es un resultado, es un lector roto`);

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 2 · LA VALIDACIÓN. Sin esto no se imprime ni un número.
// ═════════════════════════════════════════════════════════════════════════════════════════════
let malos = 0, peorDif = 0, ejemplos = [];
for (const [fecha, dia] of M) {
  const base = dia["25-50"];
  if (!base) { malos++; continue; }
  const dif = Math.abs(base.pl - yaCalculado.get(fecha));
  if (dif > peorDif) peorDif = dif;
  if (dif > 0.02) { malos++; if (ejemplos.length < 5) ejemplos.push(`${fecha}: reconstruido ${base.pl.toFixed(2)} vs guardado ${yaCalculado.get(fecha).toFixed(2)}`); }
}
console.log(`\n── validación: ±25 con alas de 50 contra regimen-filas.json ──`);
console.log(`  días comparados: ${M.size} · discrepancias > $0,02: ${malos} · peor diferencia: $${peorDif.toFixed(4)}`);
if (malos) { for (const e of ejemplos) console.log("   " + e); throw new Error("la reconstrucción NO cuadra con lo ya calculado. No se mide con esto."); }
console.log("  cuadra al céntimo en los " + M.size + " días  ✅");

// cuántos días pierde cada variante (crédito ≤ 0, o strikes que no existen)
console.log("\n── cobertura de cada variante (días con cóndor construible) ──");
console.log("| distancia \\ alas | " + ALAS.join(" | ") + " |");
console.log("|---|" + ALAS.map(() => "---").join("|") + "|");
for (const D of DISTANCIAS)
  console.log(`| ±${D} | ` + ALAS.map((A) => [...M.values()].filter((d) => d[`${D}-${A}`]).length).join(" | ") + " |");
console.log("  (si una variante pierde días, sus cifras NO son comparables con las demás — va dicho en cada tabla)");

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 3 · LA COMPARACIÓN. Cada estrategia se evalúa sobre los MISMOS 653 días.
// ═════════════════════════════════════════════════════════════════════════════════════════════
const pc = (x) => (x == null || !isFinite(x) ? "—" : (x * 100).toFixed(0) + "%");
/** Construye la serie diaria aplicando `elegir(fila)` → clave de variante, o null para no operar. */
function serie(elegir) {
  const pl = [], faltan = [], colat = [];
  for (const f of filas) {
    const dia = M.get(f.fecha); if (!dia) continue;
    const cl = elegir(f);
    if (cl == null) { pl.push(0); continue; }         // no operar ese día = P&L cero, sigue en la serie
    const v = dia[cl];
    if (!v) { faltan.push(f.fecha); continue; }
    pl.push(v.pl); colat.push(v.riesgo);
  }
  const operados = pl.filter((x) => x !== 0);
  const oOrd = [...operados].sort((a, b) => a - b);
  const cOrd = [...colat].sort((a, b) => a - b);
  const total = pl.reduce((a, b) => a + b, 0);
  // El colateral que la cuenta tiene que poder poner es el MÁXIMO, no el mediano: Robinhood lo
  // retiene por posición y el día que toca el más ancho hay que tenerlo.
  const colMax = cOrd[cOrd.length - 1], colMed = cOrd[cOrd.length >> 1];
  return {
    nOperados: operados.length, faltan: faltan.length,
    total, alAno: total / ANOS, media: total / Math.max(1, operados.length),
    peor: oOrd[0], p1: oOrd[Math.floor(oOrd.length * 0.01)], p5: oOrd[Math.floor(oOrd.length * 0.05)],
    dd: drawdown(pl), colas2k: operados.filter((x) => x < -2000).length,
    colas4k: operados.filter((x) => x < -4000).length,
    acierto: operados.filter((x) => x > 0).length / operados.length,
    colMax, colMed, porMilColateral: (total / ANOS) / (colMax / 1000),
  };
}

const ESTRATEGIAS = [];
ESTRATEGIAS.push(["BASE · ±25/50 todos los días", () => "25-50"]);
ESTRATEGIAS.push(["no operar los días marcados", (f) => (f.marcado ? null : "25-50")]);
for (const D of [30, 35, 40, 50]) ESTRATEGIAS.push([`días marcados a ±${D}/50 (el resto ±25/50)`, (f) => (f.marcado ? `${D}-50` : "25-50")]);
for (const A of [30, 20]) ESTRATEGIAS.push([`días marcados con alas de ${A} (el resto ±25/50)`, (f) => (f.marcado ? `25-${A}` : "25-50")]);
ESTRATEGIAS.push(["días marcados a ±40 y alas de 20", (f) => (f.marcado ? "40-20" : "25-50")]);
ESTRATEGIAS.push(["TODOS los días con alas de 20", () => "25-20"]);
ESTRATEGIAS.push(["TODOS los días con alas de 30", () => "25-30"]);
ESTRATEGIAS.push(["TODOS los días a ±35/50", () => "35-50"]);
// las dos palancas juntas: el calendario quita días, el ala quita tamaño. Son independientes.
ESTRATEGIAS.push(["saltar marcados + alas de 30 el resto", (f) => (f.marcado ? null : "25-30")]);
ESTRATEGIAS.push(["saltar marcados + alas de 20 el resto", (f) => (f.marcado ? null : "25-20")]);

console.log("\n\n" + "═".repeat(150));
console.log("  EL PUENTE · qué pasa si en vez de NO OPERAR los días marcados, se opera de otra forma");
console.log("═".repeat(150));
console.log("\n| estrategia | días operados | $/año | media/día | acierto | PEOR DÍA | p1 | p5 | PEOR RACHA | días <−$2.000 | días <−$4.000 | colateral máx | $/año por $1.000 de colateral |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
const salida = [];
for (const [nom, fn] of ESTRATEGIAS) {
  const s = serie(fn);
  salida.push({ nombre: nom, ...s });
  console.log(`| ${nom} | ${s.nOperados}${s.faltan ? ` (faltan ${s.faltan})` : ""} | ${eur(s.alAno)} | ${eur(s.media)} | ${pc(s.acierto)} | ${eur(s.peor)} | ${eur(s.p1)} | ${eur(s.p5)} | ${eur(s.dd)} | ${s.colas2k} | ${s.colas4k} | ${eur(s.colMax)} | ${eur(s.porMilColateral)} |`);
}

// ── la métrica que decide, contra la BASE ──
const B = salida[0];
console.log("\n\n  LA MÉTRICA QUE DECIDE, contra la base:\n");
console.log("| estrategia | % ingreso retenido | caída eliminada | peor día eliminado | $/año perdidos por $ de caída eliminado |");
console.log("|---|---|---|---|---|");
for (const s of salida.slice(1)) {
  const ddE = Math.abs(B.dd) - Math.abs(s.dd), peorE = Math.abs(B.peor) - Math.abs(s.peor);
  console.log(`| ${s.nombre} | ${pc(s.alAno / B.alAno)} | ${eur(ddE)} | ${eur(peorE)} | ${ddE > 1 ? ((B.alAno - s.alAno) / ddE).toFixed(2) : "—"} |`);
}

writeFileSync("scripts/calendario-cola-puente.json", JSON.stringify({ base: B, estrategias: salida }, null, 2), "utf8");
console.log("\n  detalle en scripts/calendario-cola-puente.json");
