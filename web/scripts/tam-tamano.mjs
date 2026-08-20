// TAM-TAMANO — el tamaño de posición sobre 1.121 días reales, con la cuenta real de Lester.
//
// Cuenta:  $56.389 total · $7.977 EN EFECTIVO · 500 HOOD ($48.412) · poder de compra $73.874
//          interés de margen 5% · colateral $5.000 por cóndor (vertical al ancho pleno)
// Regla de hierro: todo umbral se ELIGE en un período y se APLICA tal cual al otro. Las dos
// direcciones, o no cuenta.

import { readFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia.ts";
import { listonT, tWelch } from "../lib/barreraHallazgos.ts";

const filas = JSON.parse(readFileSync("scripts/tam-base.json", "utf8"));

// ── LA CUENTA, tal como está ──
const TOTAL = 56389, EFECTIVO = 7977, HOOD = TOTAL - EFECTIVO, PODER = 73874;
const COLATERAL = 5000;          // por contrato, comprobado en pantalla
const TASA = 0.05;               // interés de margen anual
const MANT = 0.25;               // mantenimiento Reg-T sobre las acciones

// ═════ 0. RADIOGRAFÍA — mirar el fichero antes de medirlo ═════
// `colateral` NO entra: es constante por construcción ($5.000 en 1.117 de 1.121 días, $5.500 en 4)
// y la radiografía lo tumba con razón — un campo de 2 valores no ordena nada. No es un predictor,
// es el ancho del ala. Se comprueba aparte, abajo.
radiografia(filas, ["pl", "credito", "spot11", "cierre", "movPct", "rvManana", "ivAtm"], "cóndor 1.121 días");
const cols = {};
for (const f of filas) cols[f.colateral] = (cols[f.colateral] ?? 0) + 1;
console.log(`  colateral (constante, comprobado aparte): ${JSON.stringify(cols)}\n`);

const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.round(Math.abs(x)).toLocaleString("es-ES");
const pct = (x) => (x * 100).toFixed(1) + "%";
const orden = [...filas].sort((a, b) => a.fecha.localeCompare(b.fecha));
const dias = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

const PERIODOS = {
  "A · 2022-2023": (f) => f.fecha < "2024-01-01",
  "B · 2024-2026": (f) => f.fecha >= "2024-01-01",
  "TODO 2022-2026": () => true,
};

// ═════ EL MOTOR ═════
// Simula la caja día a día. `tamano(capital, i)` devuelve cuántos contratos se ponen ESE día
// (sólo con información anterior a las 11:00 de ese día).
//
// Modelo de dinero, explícito:
//   · el P&L del día entra o sale del EFECTIVO
//   · si el efectivo se queda por debajo del colateral retenido, la diferencia es un préstamo de
//     margen y devenga el 5% anual por días NATURALES (así se cobra de verdad)
//   · llamada de margen cuando  patrimonio < 25% de las acciones + colateral retenido
function simular(rows, tamano, { conInteres = true } = {}) {
  let efectivo = EFECTIVO, cum = 0, interesTotal = 0;
  let pico = 0, peorRacha = 0, peorDia = 0, mejorDia = 0;
  let efectivoMin = EFECTIVO, prestamoMax = 0, llamadas = 0, diasSinPoder = 0, operados = 0;
  const serie = [], plDiario = [], contratos = [];

  for (let i = 0; i < rows.length; i++) {
    const f = rows[i];
    const capital = TOTAL + cum;
    let n = tamano(capital, i, f, efectivo);

    // ¿cabe? el colateral sale del poder de compra, que encoge con las pérdidas
    const poder = PODER + cum;
    if (n * COLATERAL > poder) { n = Math.max(0, Math.floor(poder / COLATERAL)); diasSinPoder++; }
    if (n < 0) n = 0;
    contratos.push(n);
    if (n > 0) operados++;

    const pl = n * f.pl;
    cum += pl; efectivo += pl;
    plDiario.push(pl);
    if (pl < peorDia) peorDia = pl;
    if (pl > mejorDia) mejorDia = pl;

    // interés: sobre lo que falte para cubrir el colateral del día y sobre el efectivo negativo
    if (conInteres && n > 0) {
      const naturales = i > 0 ? Math.max(1, dias(rows[i - 1].fecha, f.fecha)) : 1;
      const prestado = Math.max(0, n * COLATERAL - efectivo);
      if (prestado > prestamoMax) prestamoMax = prestado;
      const int = prestado * TASA * (naturales / 365);
      interesTotal += int; efectivo -= int; cum -= int;
    }
    if (efectivo < efectivoMin) efectivoMin = efectivo;

    // llamada de margen: patrimonio por debajo del mantenimiento
    const patrimonio = HOOD + efectivo;
    if (patrimonio < MANT * HOOD + n * COLATERAL) llamadas++;

    if (cum > pico) pico = cum;
    if (cum - pico < peorRacha) peorRacha = cum - pico;
    serie.push({ fecha: f.fecha, cum, efectivo, n });
  }

  const anos = rows.length / 252;
  const ord = [...plDiario].sort((a, b) => a - b);
  return {
    n: rows.length, operados,
    total: cum, porAno: cum / anos, interesTotal, interesAno: interesTotal / anos,
    peorDia, mejorDia, peorRacha,
    p1: ord[Math.floor(ord.length * 0.01)], p5: ord[Math.floor(ord.length * 0.05)],
    efectivoMin, prestamoMax, llamadas, diasSinPoder,
    ddPctCuenta: -peorRacha / TOTAL,
    contratoMedio: contratos.reduce((a, b) => a + b, 0) / contratos.length,
    contratoMax: Math.max(...contratos),
    serie, plDiario,
  };
}

const fijo = (N) => () => N;

// ═════ 1. LA SERIE BASE — ¿hay algo que dimensionar? ═════
console.log("\n" + "═".repeat(100));
console.log("1 · LA MATERIA PRIMA — un contrato, precios reales, 1.121 días");
console.log("═".repeat(100));
const PRUEBAS = 34;   // declaradas abajo, al final
const LISTON = listonT(PRUEBAS);
console.log(`\nPruebas declaradas: ${PRUEBAS} → listón de |t| (Bonferroni) = ${LISTON}\n`);
console.log("| período | días | ganados | $/año 1 contrato | peor día | p1 | p5 | peor racha | t |");
console.log("|---|---|---|---|---|---|---|---|---|");
const tPeriodo = {};
for (const [nom, filtro] of Object.entries(PERIODOS)) {
  const g = orden.filter(filtro);
  const r = simular(g, fijo(1), { conInteres: false });
  const pls = g.map((x) => x.pl);
  const m = pls.reduce((a, b) => a + b, 0) / pls.length;
  const sd = Math.sqrt(pls.reduce((a, b) => a + (b - m) ** 2, 0) / (pls.length - 1));
  const t = m / (sd / Math.sqrt(pls.length));
  tPeriodo[nom] = t;
  console.log(`| ${nom} | ${g.length} | ${pct(g.filter((x) => x.pl > 0).length / g.length)} | ${eur(r.porAno)} | ${eur(r.peorDia)} | ${eur(r.p1)} | ${eur(r.p5)} | ${eur(r.peorRacha)} | ${t.toFixed(2)} |`);
}
console.log(`\n  ¿supera el listón en los DOS períodos por separado? ` +
  `A=${tPeriodo["A · 2022-2023"].toFixed(2)} B=${tPeriodo["B · 2024-2026"].toFixed(2)} · listón ${LISTON} → ` +
  (Math.abs(tPeriodo["A · 2022-2023"]) >= LISTON && Math.abs(tPeriodo["B · 2024-2026"]) >= LISTON ? "SÍ" : "NO"));

// ═════ 2. TAMAÑO FIJO 1, 2, 3 (y 4, 5 de referencia) ═════
console.log("\n" + "═".repeat(100));
console.log("2 · TAMAÑO FIJO — con interés de margen y con la caja real de $7.977");
console.log("═".repeat(100));
for (const [nom, filtro] of Object.entries(PERIODOS)) {
  const g = orden.filter(filtro);
  console.log(`\n── ${nom} · ${g.length} días ──`);
  console.log("| contratos | colateral | $/año NETO | interés/año | peor día | p1 | p5 | peor racha | caída % cuenta | efectivo mínimo | préstamo máx | días en llamada | sobrevive |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const N of [1, 2, 3, 4, 5]) {
    const r = simular(g, fijo(N));
    const vive = r.llamadas === 0 && r.diasSinPoder === 0;
    console.log(`| ${N} | ${eur(N * COLATERAL)} | ${eur(r.porAno)} | ${eur(-r.interesAno)} | ${eur(r.peorDia)} | ${eur(r.p1)} | ${eur(r.p5)} | ${eur(r.peorRacha)} | ${pct(r.ddPctCuenta)} | ${eur(r.efectivoMin)} | ${eur(r.prestamoMax)} | ${r.llamadas} | ${vive ? "sí" : "NO"} |`);
  }
}

// ═════ 3. TAMAÑO PROPORCIONAL AL CAPITAL, COMPUESTO ═════
console.log("\n" + "═".repeat(100));
console.log("3 · TAMAÑO PROPORCIONAL — el % de la cuenta que se pone como colateral, capital compuesto");
console.log("═".repeat(100));
console.log(`\n  OJO: el contrato es indivisible y cuesta ${eur(COLATERAL)} de colateral. Sobre ${eur(TOTAL)}:`);
for (let k = 1; k <= 4; k++) console.log(`    ${k} contrato(s) = ${pct((k * COLATERAL) / TOTAL)} de la cuenta`);
console.log(`  Por debajo del ${pct(COLATERAL / TOTAL)} NO SE PUEDE OPERAR: no cabe ni un contrato.\n`);

for (const [nom, filtro] of Object.entries(PERIODOS)) {
  const g = orden.filter(filtro);
  console.log(`\n── ${nom} ──`);
  console.log("| objetivo % | contratos medios | máx | días operados | $/año NETO | peor día | peor racha | caída % cuenta | efectivo mín | sobrevive |");
  console.log("|---|---|---|---|---|---|---|---|---|---|");
  for (const p of [0.05, 0.10, 0.15, 0.20, 0.25, 0.30]) {
    const r = simular(g, (cap) => Math.floor((p * cap) / COLATERAL));
    const vive = r.llamadas === 0 && r.diasSinPoder === 0 && r.operados > 0;
    console.log(`| ${pct(p)} | ${r.contratoMedio.toFixed(2)} | ${r.contratoMax} | ${r.operados} | ${eur(r.porAno)} | ${eur(r.peorDia)} | ${eur(r.peorRacha)} | ${pct(r.ddPctCuenta)} | ${eur(r.efectivoMin)} | ${vive ? "sí" : "NO"} |`);
  }
}

// ═════ 4. EL TAMAÑO QUE MAXIMIZA SIN PASAR DE LA CAÍDA ═════
console.log("\n" + "═".repeat(100));
console.log("4 · EL TOPE POR CAÍDA — y el CRUCE: se elige en un período y se aplica al otro");
console.log("═".repeat(100));

/** Mayor N entero (1..12) cuya peor racha no pasa del límite, medido en `rows`. */
function mayorNQueAguanta(rows, limitePct) {
  let mejor = 0;
  for (let N = 1; N <= 12; N++) {
    const r = simular(rows, fijo(N));
    if (r.ddPctCuenta <= limitePct && r.llamadas === 0 && r.diasSinPoder === 0) mejor = N; else break;
  }
  return mejor;
}

const A = orden.filter(PERIODOS["A · 2022-2023"]);
const B = orden.filter(PERIODOS["B · 2024-2026"]);

for (const lim of [0.15, 0.25]) {
  console.log(`\n╔══ LÍMITE DE CAÍDA: ${pct(lim)} de la cuenta = ${eur(lim * TOTAL)} ══╗\n`);
  const nA = mayorNQueAguanta(A, lim);
  const nB = mayorNQueAguanta(B, lim);
  console.log(`  elegido en A (2022-2023): ${nA} contratos   ·   elegido en B (2024-2026): ${nB} contratos`);
  console.log("");
  console.log("| se elige en | N | se aplica a | $/año NETO | peor racha | caída % cuenta | ¿respeta el límite fuera de muestra? |");
  console.log("|---|---|---|---|---|---|---|");
  const cruces = [
    ["A · 2022-2023", nA, "B · 2024-2026", B],
    ["B · 2024-2026", nB, "A · 2022-2023", A],
  ];
  let sobreviveCruce = true;
  for (const [de, N, a, rows] of cruces) {
    if (N === 0) { console.log(`| ${de} | 0 | ${a} | — | — | — | ni un contrato aguanta el límite |`); sobreviveCruce = false; continue; }
    const r = simular(rows, fijo(N));
    const ok = r.ddPctCuenta <= lim && r.llamadas === 0;
    if (!ok) sobreviveCruce = false;
    console.log(`| ${de} | ${N} | ${a} | ${eur(r.porAno)} | ${eur(r.peorRacha)} | ${pct(r.ddPctCuenta)} | ${ok ? "SÍ" : "NO — se pasa"} |`);
  }
  const nSeguro = Math.min(nA, nB);
  const rTodo = nSeguro > 0 ? simular(orden, fijo(nSeguro)) : null;
  console.log(`\n  → sobrevive el cruce en LAS DOS direcciones: ${sobreviveCruce ? "SÍ" : "NO"}`);
  console.log(`  → tamaño que aguanta en los DOS períodos: ${nSeguro} contrato(s)` +
    (rTodo ? ` · sobre los 1.121 días: ${eur(rTodo.porAno)}/año, caída ${pct(rTodo.ddPctCuenta)} (${eur(rTodo.peorRacha)})` : ""));
}

// ═════ 5. LA CURVA COMPLETA — dinero contra caída, sobre todo el período ═════
console.log("\n" + "═".repeat(100));
console.log("5 · LA CURVA — 1.121 días, cada tamaño con su precio en caída");
console.log("═".repeat(100));
console.log("\n| contratos | colateral | $/año NETO | % anual sobre $56.389 | peor día | peor racha | caída % cuenta | efectivo mín | días en llamada |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (let N = 1; N <= 8; N++) {
  const r = simular(orden, fijo(N));
  console.log(`| ${N} | ${eur(N * COLATERAL)} | ${eur(r.porAno)} | ${pct(r.porAno / TOTAL)} | ${eur(r.peorDia)} | ${eur(r.peorRacha)} | ${pct(r.ddPctCuenta)} | ${eur(r.efectivoMin)} | ${r.llamadas} |`);
}

// ═════ 6. ¿DÓNDE DUELE? — el reparto de la peor racha en el tiempo ═════
console.log("\n" + "═".repeat(100));
console.log("6 · CUÁNDO SE SUFRE — la peor racha de 1 contrato, año a año");
console.log("═".repeat(100));
console.log("\n| año | días | $/año 1 contrato | peor día | peor racha del año | días con pérdida > $2.000 |");
console.log("|---|---|---|---|---|---|");
for (const a of ["2022", "2023", "2024", "2025", "2026"]) {
  const g = orden.filter((f) => f.fecha.startsWith(a));
  if (!g.length) continue;
  const r = simular(g, fijo(1), { conInteres: false });
  console.log(`| ${a} | ${g.length} | ${eur(r.total)} | ${eur(r.peorDia)} | ${eur(r.peorRacha)} | ${g.filter((x) => x.pl < -2000).length} |`);
}

// ═════ 7. EL COSTE DE LA CAJA — cuántos días malos seguidos aguanta el efectivo ═════
console.log("\n" + "═".repeat(100));
console.log("7 · EL CUELLO DE BOTELLA REAL — el efectivo, no el colateral");
console.log("═".repeat(100));
const peores = [...orden].sort((a, b) => a.pl - b.pl).slice(0, 5).map((x) => x.pl);
console.log(`\n  Efectivo disponible: ${eur(EFECTIVO)}`);
console.log(`  Los 5 peores días de la historia (1 contrato): ${peores.map(eur).join(" · ")}`);
for (const N of [1, 2, 3]) {
  const sum5 = peores.reduce((a, b) => a + b, 0) * N;
  console.log(`  Con ${N} contrato(s): los 5 peores días juntos = ${eur(sum5)} → ` +
    (Math.abs(sum5) > EFECTIVO ? `SE COME EL EFECTIVO ENTERO (${eur(EFECTIVO + sum5)} restantes, en préstamo)` : `quedan ${eur(EFECTIVO + sum5)}`));
}
// la peor racha de días consecutivos perdedores
let racha = 0, peorSeg = 0, cur = 0, dLargo = 0;
for (const f of orden) { if (f.pl < 0) { cur += f.pl; racha++; } else { if (cur < peorSeg) { peorSeg = cur; dLargo = racha; } cur = 0; racha = 0; } }
console.log(`\n  Peor racha de días perdedores SEGUIDOS: ${dLargo} días, ${eur(peorSeg)} con 1 contrato ` +
  `(${eur(peorSeg * 2)} con 2 · ${eur(peorSeg * 3)} con 3)`);

console.log("\n" + "═".repeat(100));
console.log(`PRUEBAS DECLARADAS: ${PRUEBAS} = 3 períodos × 5 tamaños fijos (15) + 6 proporcionales × 2 períodos elegidos (12) +`);
console.log(`  2 límites de caída × 2 direcciones de cruce (4) + 3 t de período = 34. Listón |t| = ${LISTON}.`);
console.log("═".repeat(100));
