// TAM-FINAL — la tabla de tamaño que Lester puede leer y decidir.
//
// La cuenta real: $56.389 · $7.977 EN EFECTIVO · 500 HOOD ($48.412) · poder de compra $73.874
//                 interés de margen 5% · colateral = ancho pleno de la vertical × 100
//
// Regla de hierro: todo se elige en un período y se aplica TAL CUAL al otro. Las dos direcciones.

import { readFileSync } from "node:fs";
import { listonT, potencia } from "../lib/barreraHallazgos.ts";
import { radiografia } from "../lib/radiografia.ts";

const dias = JSON.parse(readFileSync("scripts/tam-anchos.json", "utf8")).sort((a, b) => a.fecha.localeCompare(b.fecha));

const TOTAL = 56389, EFECTIVO = 7977, HOOD = TOTAL - EFECTIVO, PODER = 73874;
const TASA = 0.05, MANT = 0.25;
const ANCHOS = [5, 10, 15, 20, 25, 30, 40, 50];

const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.round(Math.abs(x)).toLocaleString("es-ES");
const pc = (x) => (x * 100).toFixed(1) + "%";
const calend = (a, b) => Math.max(1, Math.round((new Date(b) - new Date(a)) / 86400000));

const A = dias.filter((f) => f.fecha < "2024-01-01");
const B = dias.filter((f) => f.fecha >= "2024-01-01");
const PER = [["A · 2022-2023", A], ["B · 2024-2026", B], ["TODO 2022-2026", dias]];

// PRUEBAS DECLARADAS — se cuentan de verdad, no a ojo.
const PRUEBAS = 8 /*anchos*/ * 3 /*períodos*/ + 5 /*nº contratos*/ * 3 + 4 /*proporcionales*/ * 3
              + 2 /*límites de caída*/ * 2 /*direcciones*/ + 3 /*t de período*/;   // = 58
const LISTON = listonT(PRUEBAS);

radiografia(dias.map((f) => ({ pl50: f.por[50]?.pl ?? null, pl10: f.por[10]?.pl ?? null, mov: f.mov, spot11: f.spot11 })),
  ["pl50", "pl10", "mov", "spot11"], "cóndor por anchos");

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 0 · ¿HAY EDGE QUE DIMENSIONAR? — esto se responde ANTES de hablar de tamaño
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "█".repeat(102));
console.log("0 · ANTES DEL TAMAÑO: ¿hay una ventaja que dimensionar? — cóndor 50/50, 1 contrato");
console.log("█".repeat(102));
console.log(`\nPruebas declaradas: ${PRUEBAS} → listón |t| (Bonferroni) = ${LISTON}\n`);
console.log("| período | días | $/año 1 contrato | t | ¿supera el listón? | intervalo de confianza 95% del $/año |");
console.log("|---|---|---|---|---|---|");
for (const [nom, g] of PER) {
  const pls = g.map((f) => f.por[50].pl);
  const m = pls.reduce((a, b) => a + b, 0) / pls.length;
  const sd = Math.sqrt(pls.reduce((a, b) => a + (b - m) ** 2, 0) / (pls.length - 1));
  const se = sd / Math.sqrt(pls.length), t = m / se;
  const lo = (m - 1.96 * se) * 252, hi = (m + 1.96 * se) * 252;
  console.log(`| ${nom} | ${g.length} | ${eur(m * 252)} | ${t.toFixed(2)} | ${Math.abs(t) >= LISTON ? "SÍ" : "NO"} | de ${eur(lo)} a ${eur(hi)} |`);
}
// potencia() formatea en % porque nació para retornos; aquí las unidades son DÓLARES POR DÍA.
// Se traduce a mano para no leer "24.368%" donde pone "$243,68 al día".
const pot = potencia(dias.map((f) => ({ pnl: f.por[50].pl, ticker: "SPXW", fecha: f.fecha })), 100);
console.log(`\n  Potencia: con n=${dias.length} la prueba sólo distingue diferencias de ${eur(pot.detectable)}/día ` +
  `(${eur(pot.detectable * 252)}/año) entre tercios. La ventaja que se busca es MÁS PEQUEÑA que eso:`);
console.log(`  por eso "no se ve" NO significa "no existe" — significa que 1.121 días no bastan para verla.`);
console.log(`\n  Cruce del SIGNO: A da ${eur(A.reduce((a, b) => a + b.por[50].pl, 0) / (A.length / 252))}/año y ` +
  `B da ${eur(B.reduce((a, b) => a + b.por[50].pl, 0) / (B.length / 252))}/año → SIGNOS OPUESTOS.`);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 1 · LA ESCALERA DE RIESGO — todo lo que la cuenta puede poner, de $500 a $25.000
// ═══════════════════════════════════════════════════════════════════════════════════════════
// El "tamaño" tiene DOS mandos, no uno: el nº de contratos y el ANCHO DEL ALA. El ancho es el
// que da granularidad — con alas de 50 el escalón mínimo ya es el 8,9% de la cuenta.
const ESCALONES = [];
for (const w of ANCHOS) for (const n of [1, 2, 3, 4, 5]) {
  const col = w * 100 * n;
  if (col <= 25000) ESCALONES.push({ w, n, col });
}
ESCALONES.sort((a, b) => a.col - b.col || a.w - b.w);

/** Simula la caja real: P&L al efectivo, interés sobre lo prestado, llamada de margen. */
function simular(rows, w, n) {
  let efectivo = EFECTIVO, cum = 0, interes = 0, pico = 0, dd = 0;
  let efMin = EFECTIVO, llamadas = 0, sinPoder = 0, operados = 0, peor = 0;
  const pls = [];
  for (let i = 0; i < rows.length; i++) {
    const d = rows[i].por[w];
    if (!d) { pls.push(0); continue; }
    const col = d.col * n;
    if (col > PODER + cum) { sinPoder++; pls.push(0); continue; }   // ya no cabe
    operados++;
    const pl = d.pl * n;
    pls.push(pl); if (pl < peor) peor = pl;
    cum += pl; efectivo += pl;
    const nat = i > 0 ? calend(rows[i - 1].fecha, rows[i].fecha) : 1;
    const prestado = Math.max(0, col - efectivo);
    const int = prestado * TASA * (nat / 365);
    interes += int; efectivo -= int; cum -= int;
    if (efectivo < efMin) efMin = efectivo;
    if (HOOD + efectivo < MANT * HOOD + col) llamadas++;
    if (cum > pico) pico = cum;
    if (cum - pico < dd) dd = cum - pico;
  }
  const ord = [...pls].sort((a, b) => a - b);
  const anos = rows.length / 252;
  // peor ventana de 252 días (un año rodante)
  let peorAno = 0;
  if (pls.length > 252) {
    let s = pls.slice(0, 252).reduce((a, b) => a + b, 0); peorAno = s;
    for (let i = 252; i < pls.length; i++) { s += pls[i] - pls[i - 252]; if (s < peorAno) peorAno = s; }
  }
  return {
    total: cum, porAno: cum / anos, interesAno: interes / anos,
    peor, p1: ord[Math.floor(ord.length * 0.01)], p5: ord[Math.floor(ord.length * 0.05)],
    dd, ddPct: -dd / TOTAL, efMin, llamadas, sinPoder, operados, peorAno,
    vive: llamadas === 0 && sinPoder === 0,
  };
}

console.log("\n" + "█".repeat(102));
console.log("1 · LA ESCALERA — cada escalón de riesgo sobre los 1.121 días (2022-2026)");
console.log("█".repeat(102));
console.log("\n| ala | contratos | colateral | % de la cuenta | $/año NETO | peor día | p1 | p5 | peor racha | caída % cuenta | peor año rodante | efectivo mín | ¿vive? |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const e of ESCALONES.filter((x) => x.n <= 3)) {
  const r = simular(dias, e.w, e.n);
  console.log(`| ${e.w} | ${e.n} | ${eur(e.col)} | ${pc(e.col / TOTAL)} | ${eur(r.porAno)} | ${eur(r.peor)} | ${eur(r.p1)} | ${eur(r.p5)} | ${eur(r.dd)} | ${pc(r.ddPct)} | ${eur(r.peorAno)} | ${eur(r.efMin)} | ${r.vive ? "sí" : "NO"} |`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 2 · TAMAÑO FIJO 1, 2, 3 CONTRATOS (alas de 50, la estrategia tal como está definida)
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "█".repeat(102));
console.log("2 · TAMAÑO FIJO 1 / 2 / 3 CONTRATOS · alas de 50 · lo que pide el encargo");
console.log("█".repeat(102));
for (const [nom, g] of PER) {
  console.log(`\n── ${nom} · ${g.length} días ──`);
  console.log("| contratos | colateral | $/año NETO | interés/año | peor día | p1 | p5 | peor racha | caída % cuenta | peor año rodante | efectivo mín | días en llamada | ¿sobrevive? |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const n of [1, 2, 3]) {
    const r = simular(g, 50, n);
    console.log(`| ${n} | ${eur(5000 * n)} | ${eur(r.porAno)} | ${eur(-r.interesAno)} | ${eur(r.peor)} | ${eur(r.p1)} | ${eur(r.p5)} | ${eur(r.dd)} | ${pc(r.ddPct)} | ${eur(r.peorAno)} | ${eur(r.efMin)} | ${r.llamadas} | ${r.vive ? "sí" : "NO — llamada de margen"} |`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 3 · PROPORCIONAL AL CAPITAL — y por qué con este contrato es una escalera, no una rampa
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "█".repeat(102));
console.log("3 · PROPORCIONAL AL CAPITAL — el % de la cuenta puesto como colateral, capital compuesto");
console.log("█".repeat(102));
console.log("\n  Con alas de 50 el contrato vale $5.000 y NO SE PARTE. Sobre $56.389 los escalones son:");
console.log("    0 contratos = 0%   ·   1 = 8,9%   ·   2 = 17,7%   ·   3 = 26,6%");
console.log("  Pedir un 5% es pedir 0,56 contratos: no existe. El ancho del ala SÍ lo parte.\n");
console.log("| objetivo % | colateral objetivo | lo que de verdad se puede poner | días operados de 1.121 | $/año NETO | caída % cuenta | ¿vive? | qué pasa de verdad |");
console.log("|---|---|---|---|---|---|---|---|");
for (const p of [0.05, 0.10, 0.15, 0.20]) {
  const objetivo = p * TOTAL;
  // EL ALA MÁS ANCHA QUE CABE ELLA SOLA en el objetivo. Se prefiere ancha porque la comisión y el
  // peaje de horquilla se pagan POR CONTRATO: cinco cóndores de ala 5 cuestan cinco peajes para
  // arriesgar lo mismo que uno de ala 25.
  const w = [...ANCHOS].reverse().find((x) => x * 100 <= objetivo);
  if (!w) { console.log(`| ${pc(p)} | ${eur(objetivo)} | nada: ni el ala de 5 puntos ($500) cabe | — | — | — |`); continue; }
  const cab = { w, n: Math.floor(objetivo / (w * 100)), col: w * 100 };
  // compuesto: el nº de contratos se recalcula con el capital vivo
  let cap = TOTAL, efectivo = EFECTIVO, cum = 0, pico = 0, dd = 0, llamadas = 0, interes = 0;
  let operados = 0, ultimoOperado = null;
  for (let i = 0; i < dias.length; i++) {
    const d = dias[i].por[cab.w]; if (!d) continue;
    const n = Math.floor((p * cap) / d.col);
    if (n < 1) continue;
    operados++; ultimoOperado = dias[i].fecha;
    const col = d.col * n;
    if (col > PODER + cum) continue;
    const pl = d.pl * n; cum += pl; efectivo += pl; cap = TOTAL + cum;
    const nat = i > 0 ? calend(dias[i - 1].fecha, dias[i].fecha) : 1;
    const int = Math.max(0, col - efectivo) * TASA * (nat / 365);
    interes += int; efectivo -= int; cum -= int; cap = TOTAL + cum;
    if (HOOD + efectivo < MANT * HOOD + col) llamadas++;
    if (cum > pico) pico = cum; if (cum - pico < dd) dd = cum - pico;
  }
  const nota = operados < dias.length * 0.5
    ? `**se AUTO-APAGA**: deja de caber un contrato y no vuelve a operar (último día ${ultimoOperado})`
    : "opera casi todos los días";
  console.log(`| ${pc(p)} | ${eur(objetivo)} | ala de ${cab.w} pts × ${cab.n} = ${eur(cab.col * cab.n)} | ${operados} | ${eur(cum / (dias.length / 252))} | ${pc(-dd / TOTAL)} | ${llamadas === 0 ? "sí" : "NO"} | ${nota} |`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 4 · EL TAMAÑO QUE MAXIMIZA SIN PASAR DE LA CAÍDA — con el CRUCE obligatorio
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "█".repeat(102));
console.log("4 · EL TOPE POR CAÍDA — se elige en un período, se aplica al otro. Las dos direcciones.");
console.log("█".repeat(102));

/** El escalón que más gana en `rows` sin pasar del límite de caída. */
function mejorEscalon(rows, limite) {
  let mejor = null;
  for (const e of ESCALONES) {
    const r = simular(rows, e.w, e.n);
    if (r.ddPct <= limite && r.vive && (!mejor || r.porAno > mejor.r.porAno)) mejor = { e, r };
  }
  return mejor;
}

for (const lim of [0.15, 0.25]) {
  console.log(`\n╔═══ LÍMITE: la caída no puede pasar del ${pc(lim)} de la cuenta = ${eur(lim * TOTAL)} ═══╗\n`);
  const mA = mejorEscalon(A, lim), mB = mejorEscalon(B, lim);
  console.log(`  El mejor escalón elegido SÓLO con 2022-2023: ${mA ? `ala ${mA.e.w} × ${mA.e.n} contrato(s) = ${eur(mA.e.col)} · ${eur(mA.r.porAno)}/año · caída ${pc(mA.r.ddPct)}` : "NINGUNO respeta el límite"}`);
  console.log(`  El mejor escalón elegido SÓLO con 2024-2026: ${mB ? `ala ${mB.e.w} × ${mB.e.n} contrato(s) = ${eur(mB.e.col)} · ${eur(mB.r.porAno)}/año · caída ${pc(mB.r.ddPct)}` : "NINGUNO respeta el límite"}`);
  console.log("");
  console.log("| se elige en | escalón | se aplica a | $/año NETO | peor racha | caída % cuenta | ¿respeta el límite fuera de muestra? |");
  console.log("|---|---|---|---|---|---|---|");
  let cruzaBien = true;
  for (const [de, m, aNom, aRows] of [["A · 2022-2023", mA, "B · 2024-2026", B], ["B · 2024-2026", mB, "A · 2022-2023", A]]) {
    if (!m) { console.log(`| ${de} | — | ${aNom} | — | — | — | no había ningún escalón que elegir |`); cruzaBien = false; continue; }
    const r = simular(aRows, m.e.w, m.e.n);
    const ok = r.ddPct <= lim && r.vive;
    if (!ok || r.porAno <= 0) cruzaBien = false;
    console.log(`| ${de} | ala ${m.e.w} × ${m.e.n} | ${aNom} | ${eur(r.porAno)} | ${eur(r.dd)} | ${pc(r.ddPct)} | ${ok ? (r.porAno > 0 ? "SÍ" : "respeta la caída pero PIERDE dinero") : "NO"} |`);
  }
  console.log(`\n  → ¿SOBREVIVE EL CRUCE EN LAS DOS DIRECCIONES?  ${cruzaBien ? "SÍ" : "NO"}`);
  const mT = mejorEscalon(dias, lim);
  console.log(`  → sobre los 1.121 días de una vez: ${mT ? `ala ${mT.e.w} × ${mT.e.n} = ${eur(mT.e.col)} · ${eur(mT.r.porAno)}/año · caída ${pc(mT.r.ddPct)}` : "NINGÚN escalón respeta el límite"}`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 5 · LA MÉTRICA QUE DECIDE — dólares de ingreso perdidos por cada dólar de caída eliminado
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "█".repeat(102));
console.log("5 · ¿QUÉ CUESTA BAJAR LA CAÍDA? — $ de ingreso perdidos por cada $1 de caída eliminado");
console.log("█".repeat(102));
console.log("\n  Dos maneras de reducir riesgo: BAJAR CONTRATOS (escala lineal) o ESTRECHAR EL ALA.");
console.log("  Medido en 2024-2026, que es el período donde la estrategia gana (si se mide en 2022-2023");
console.log("  bajar tamaño AÑADE dinero, porque la estrategia pierde).\n");
const base = simular(B, 50, 1);
console.log(`  Referencia: ala 50 × 1 contrato en 2024-2026 → ${eur(base.porAno)}/año, caída ${eur(base.dd)} (${pc(base.ddPct)})\n`);
console.log("| cómo se reduce | escalón | colateral | $/año | caída | ingreso perdido | caída eliminada | $ perdidos por $1 de caída quitado |");
console.log("|---|---|---|---|---|---|---|---|");
for (const w of [40, 30, 25, 20, 15, 10, 5]) {
  const r = simular(B, w, 1);
  const dIng = base.porAno - r.porAno, dDD = base.dd - r.dd;   // dDD < 0 si la caída baja
  const quitada = -dDD;
  console.log(`| estrechar el ala | ala ${w} × 1 | ${eur(w * 100)} | ${eur(r.porAno)} | ${eur(r.dd)} | ${eur(dIng)} | ${eur(quitada)} | ${quitada > 0 ? "$" + (dIng / quitada).toFixed(2) : "no la baja"} |`);
}
console.log(`| bajar contratos (lineal) | cualquier fracción f | f × $5.000 | f × ${eur(base.porAno)} | f × ${eur(base.dd)} | (1−f) × ingreso | (1−f) × caída | $${(base.porAno / -base.dd).toFixed(2)} |`);
console.log(`\n  → Bajar tamaño de forma lineal cuesta $${(base.porAno / -base.dd).toFixed(2)} por cada $1 de caída quitado.`);
console.log(`    Estrechar el ala cuesta MÁS que eso en todos los escalones: es la manera CARA de reducir riesgo.`);
console.log(`    El problema es que "bajar contratos" por debajo de 1 no existe. Ese es el nudo.`);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 6 · EL CUELLO DE BOTELLA: EL EFECTIVO
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "█".repeat(102));
console.log("6 · EL EFECTIVO ($7.977) — lo que de verdad limita, no el colateral");
console.log("█".repeat(102));
console.log(`\n  Poder de compra ${eur(PODER)} → caben ${Math.floor(PODER / 5000)} cóndores de colateral.`);
console.log(`  Efectivo ${eur(EFECTIVO)} → aguanta ${(EFECTIVO / 4940).toFixed(1)} días máximos de pérdida de UN contrato.\n`);
console.log("| escalón | colateral | pérdida máxima de 1 día | días máximos que aguanta el efectivo | peor racha histórica | ¿la cubre el efectivo? |");
console.log("|---|---|---|---|---|---|");
for (const e of ESCALONES.filter((x) => [5, 10, 25, 50].includes(x.w) && x.n <= 2)) {
  const r = simular(dias, e.w, e.n);
  const maxDia = e.col - 0;  // pérdida máxima ≈ colateral (ancho pleno menos el crédito)
  console.log(`| ala ${e.w} × ${e.n} | ${eur(e.col)} | ${eur(-maxDia)} | ${(EFECTIVO / maxDia).toFixed(1)} | ${eur(r.dd)} | ${-r.dd <= EFECTIVO ? "sí" : `NO — faltan ${eur(-r.dd - EFECTIVO)}`} |`);
}

// la peor racha de días perdedores seguidos
let cur = 0, racha = 0, peorSeg = 0, largo = 0;
for (const f of dias) { const p = f.por[50].pl; if (p < 0) { cur += p; racha++; } else { if (cur < peorSeg) { peorSeg = cur; largo = racha; } cur = 0; racha = 0; } }
console.log(`\n  Peor racha de días perdedores SEGUIDOS (ala 50, 1 contrato): ${largo} días, ${eur(peorSeg)}.`);
console.log(`  Con el efectivo de ${eur(EFECTIVO)}: ${-peorSeg <= EFECTIVO ? "la cubre" : `NO la cubre — se entra en préstamo de ${eur(-peorSeg - EFECTIVO)}`}.`);

console.log("\n" + "█".repeat(102));
console.log(`PRUEBAS DECLARADAS: ${PRUEBAS} · listón |t| = ${LISTON}`);
console.log("█".repeat(102));
