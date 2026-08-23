// LENTE 2 — LA COLA DE LAS PÉRDIDAS de «los tres síes entrando más tarde».
//
// ═══ QUÉ MIDE Y POR QUÉ ═════════════════════════════════════════════════════════════════════
//
// El hallazgo que audito dice que bajando el listón de crédito de $100 a $50 (misma hora,
// las 11:00) se sacan $8.365/año, y que la variante de las 11:20 con $50 da $7.706/año con una
// racha en contra de sólo −$3.395.
//
// Vender prima gana casi siempre y pierde mucho de golpe. La media de una estructura vendida
// es un promedio entre 300 días que ganan $120 y 4 días que pierden $4.700: cambiar de sitio
// esos 4 días cambia el resultado entero. Así que aquí NO se mira la media. Se mira:
//
//   1. La distribución completa (percentiles, histograma, cuántos días pierden el riesgo entero).
//   2. Qué queda al quitar los 5, 10 y 25 PEORES días — y los 5, 10 y 25 MEJORES.
//   3. El año a año y si algún año pierde.
//   4. LO DECISIVO: la caja. Lester tiene $7.977 de EFECTIVO libre y Robinhood le retiene
//      $5.000 por cóndor. No basta con que la caída de la caja sea pequeña en el papel: hay que
//      simular el efectivo día a día y ver si en algún momento se queda sin poder poner el
//      colateral del día siguiente. Una regla que exige un día de −$9.000 no se puede operar.
//   5. Si la muestra incluye los días de verdad malos (13 oct 2022, 9 abr 2025, 10 oct 2025,
//      9 jun 2026) o si la regla se los salta — y si se los salta POR EL FILTRO o por azar.
//
// ═══ NADA DE MIRAR AL FUTURO ════════════════════════════════════════════════════════════════
// Mismas reglas que el script auditado: medias con los cierres de días ANTERIORES, strikes con
// el spot de la barra de entrada, precios reales (bid/ask, cuatro patas, dos veces), liquidación
// al intrínseco contra el spot real de las 16:00. estructura() de lib0dte, sin tocar.
//
// Calendario: 244 días de mercado al año, NO 252.
//
// Uso: node --import tsx scripts/v2-lente2-cola-perdidas.mjs

import { diasDisponibles, cargarDia, rejilla, condor, estructura, hayHora, resumen } from "./lib0dte.mjs";

const ANCHO = 45, ALA = 50, COMISION = 0.24;
const MA_CORTA = 5, MA_LARGA = 50;
const DIAS_ANO = 244;
const COLATERAL = 5000;          // lo que retiene Robinhood por el cóndor (una vertical al ancho)
const EFECTIVO_LESTER = 7977;    // efectivo libre real de su cuenta

// las horas que interesan: la original, la "mejor" del hallazgo y la alternativa por riesgo
const HORAS = ["11:00", "11:20"];

const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const orden = (v) => [...v].sort((a, b) => a - b);
function pct(v, p) { const s = orden(v); const i = (s.length - 1) * p; const lo = Math.floor(i), hi = Math.ceil(i); return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo); }
const eur = (x) => (x < 0 ? "−$" : "$") + Math.round(Math.abs(x)).toLocaleString("es-ES");

// caída máxima de pico a valle, y el punto MÍNIMO de la caja empezando desde cero
function caja(pls) {
  let a = 0, pico = 0, peor = 0, minAbs = 0, iIni = 0, iPico = 0, iValle = 0, iMin = 0;
  for (let i = 0; i < pls.length; i++) {
    a += pls[i];
    if (a > pico) { pico = a; iPico = i; }
    if (a - pico < peor) { peor = a - pico; iValle = i; iIni = iPico; }
    if (a < minAbs) { minAbs = a; iMin = i; }
  }
  return { peor, minAbs, iIni, iValle, iMin, final: a };
}

// ── PASADA ÚNICA ────────────────────────────────────────────────────────────────────────────
const dias = diasDisponibles();
console.log(`Días en el banco: ${dias.length} (${dias[0]} → ${dias[dias.length - 1]})`);

const t0 = Date.now();
const R = [];
let huecos = 0, intentos = 0, sinBarras = 0, barrasRaras = 0;
for (const d of dias) {
  const dia = cargarDia(d);
  if (!dia) { sinBarras++; continue; }
  if (dia.barras.length !== 78 || dia.barras[0].t !== "09:35" || dia.barras[77].t !== "16:00") barrasRaras++;
  const cierre = dia.barras[dia.barras.length - 1].spot;
  const minSpot = Math.min(...dia.barras.map((b) => b.spot));
  const maxSpot = Math.max(...dia.barras.map((b) => b.spot));
  const porHora = {};
  for (const hh of HORAS) {
    const i = hayHora(dia, hh);
    if (i < 0) { porHora[hh] = null; continue; }
    intentos++;
    const spot = dia.barras[i].spot;
    const centro = rejilla(spot);
    const r = estructura(dia, i, "vencimiento", condor(centro, ANCHO, ALA));
    if (!r) { porHora[hh] = null; huecos++; continue; }
    porHora[hh] = {
      spot, centro,
      credito: r.credito * 100,
      dolares: r.dolares - COMISION,
      riesgo: r.riesgoMax,
      // cuánto se salió del cóndor al cierre (puntos fuera del strike vendido)
      fuera: Math.max(0, cierre - (centro + ANCHO), (centro - ANCHO) - cierre),
    };
  }
  R.push({ dia: d, cierre, minSpot, maxSpot, porHora });
}
console.log(`Pasada en ${((Date.now() - t0) / 1000).toFixed(1)} s · ${R.length} días leídos · ${sinBarras} sin barras · ${barrasRaras} con rejilla de barras rara`);
console.log(`Huecos: ${huecos} de ${intentos} intentos día-hora (${(100 * huecos / intentos).toFixed(2)} %)\n`);

// ── MEDIAS, sólo con el pasado ──────────────────────────────────────────────────────────────
const cierres = R.map((x) => x.cierre);
for (let i = 0; i < R.length; i++) {
  if (i < MA_LARGA) { R[i].ma5 = null; R[i].ma50 = null; continue; }
  R[i].ma5 = media(cierres.slice(i - MA_CORTA, i));
  R[i].ma50 = media(cierres.slice(i - MA_LARGA, i));
}
const CONMA = R.filter((x) => x.ma50 != null);
const ANOS = CONMA.length / DIAS_ANO;
console.log(`Días con las dos medias: ${CONMA.length} (${CONMA[0].dia} → ${CONMA[CONMA.length - 1].dia}) = ${ANOS.toFixed(2)} años\n`);

function correr(hora, umbral) {
  const ops = [];
  for (const x of CONMA) {
    const c = x.porHora[hora];
    if (!c) continue;
    if (c.spot > x.ma5 && c.spot > x.ma50 && c.credito >= umbral)
      ops.push({ dia: x.dia, pl: c.dolares, credito: c.credito, riesgo: c.riesgo, fuera: c.fuera, spot: c.spot, cierre: x.cierre });
  }
  return ops;
}

// ══════════════════════════════════════════════════════════════════════════════════════════
//  BLOQUE A — LA DISTRIBUCIÓN COMPLETA
// ══════════════════════════════════════════════════════════════════════════════════════════
const VARIANTES = [
  { et: "11:00 / $100  (la que ya opera)", h: "11:00", u: 100 },
  { et: "11:00 / $50   (la «mejor» del hallazgo)", h: "11:00", u: 50 },
  { et: "11:20 / $50   (la «alternativa por riesgo»)", h: "11:20", u: 50 },
];

function ficha(ops) {
  const pls = ops.map((o) => o.pl);
  const r = resumen(pls);
  const s = orden(pls);
  const c = caja(pls);
  const quitar = (k, lado) => (lado === "peores" ? suma(s.slice(k)) : suma(s.slice(0, s.length - k))) / ANOS;
  return {
    n: pls.length, total: suma(pls), porAno: suma(pls) / ANOS, t: r.t, aciertos: r.aciertos,
    p: [0, 0.01, 0.05, 0.25, 0.5, 0.75, 0.95, 0.99, 1].map((q) => pct(pls, q)),
    caja: c,
    entera: ops.filter((o) => o.pl <= -o.riesgo * 0.99).length,
    perdedores: pls.filter((x) => x < 0).length,
    sinPeores: [5, 10, 25].map((k) => quitar(k, "peores")),
    sinMejores: [5, 10, 25].map((k) => quitar(k, "mejores")),
    credMin: Math.min(...ops.map((o) => o.credito)), credMax: Math.max(...ops.map((o) => o.credito)),
    credMed: pct(ops.map((o) => o.credito), 0.5),
    s, ops,
  };
}

const F = {};
for (const v of VARIANTES) {
  const ops = correr(v.h, v.u);
  const f = ficha(ops);
  F[v.et] = f;
  console.log("=".repeat(102));
  console.log(`  ${v.et}`);
  console.log("=".repeat(102));
  console.log(`  n=${f.n} (${(f.n / ANOS).toFixed(0)}/año) · total ${eur(f.total)} · **${eur(f.porAno)}/año** · t=${f.t.toFixed(2)} · acierto ${(f.aciertos * 100).toFixed(1)}%`);
  console.log(`  crédito cobrado: mín ${eur(f.credMin)} · mediana ${eur(f.credMed)} · máx ${eur(f.credMax)}   [cordura: $20–$600]`);
  console.log(`  PERCENTILES del resultado por operación:`);
  console.log(`     peor ${eur(f.p[0])} · p1 ${eur(f.p[1])} · p5 ${eur(f.p[2])} · p25 ${eur(f.p[3])} · MEDIANA ${eur(f.p[4])} · p75 ${eur(f.p[5])} · p95 ${eur(f.p[6])} · p99 ${eur(f.p[7])} · mejor ${eur(f.p[8])}`);
  console.log(`  días perdedores: ${f.perdedores} de ${f.n} (${(100 * f.perdedores / f.n).toFixed(1)}%) · pierden el RIESGO ENTERO: ${f.entera}`);
  console.log(`  LOS 10 PEORES DÍAS: ${f.s.slice(0, 10).map(eur).join(" · ")}`);
  console.log(`  suman ${eur(suma(f.s.slice(0, 10)))} — el ${(100 * Math.abs(suma(f.s.slice(0, 10))) / suma(f.s.filter((x) => x > 0))).toFixed(0)}% de todo lo ganado en los días buenos`);
  console.log(`  QUITANDO LOS PEORES:  −5 → ${eur(f.sinPeores[0])}/año · −10 → ${eur(f.sinPeores[1])}/año · −25 → ${eur(f.sinPeores[2])}/año`);
  console.log(`  QUITANDO LOS MEJORES: −5 → ${eur(f.sinMejores[0])}/año · −10 → ${eur(f.sinMejores[1])}/año · −25 → ${eur(f.sinMejores[2])}/año`);
  console.log(`  CAJA: caída pico-valle ${eur(f.caja.peor)} (${ops[f.caja.iIni]?.dia} → ${ops[f.caja.iValle]?.dia}) · punto más bajo desde cero ${eur(f.caja.minAbs)} (${ops[f.caja.iMin]?.dia})`);

  // histograma
  const cortes = [-5000, -4000, -3000, -2000, -1000, -500, -100, 0, 100, 200, 300, 500, 1000];
  const et = [];
  for (let k = 0; k <= cortes.length; k++) {
    const lo = k === 0 ? -Infinity : cortes[k - 1], hi = k === cortes.length ? Infinity : cortes[k];
    const c = pls_en(f.s, lo, hi);
    if (c) et.push(`${lo === -Infinity ? "<" : eur(lo)}..${hi === Infinity ? ">" : eur(hi)}: ${c}`);
  }
  console.log(`  HISTOGRAMA: ${et.join("  |  ")}`);

  // año a año
  const as = [...new Set(ops.map((o) => o.dia.slice(0, 4)))].sort();
  console.log(`  AÑO A AÑO: ${as.map((a) => { const q = ops.filter((o) => o.dia.startsWith(a)); return `${a} ${eur(suma(q.map((z) => z.pl)))} (${q.length})`; }).join(" · ")}`);

  // rachas
  let rachaPeor = 0, acc = 0, nPeor = 0, nAcc = 0;
  for (const o of ops) { if (o.pl < 0) { acc += o.pl; nAcc++; if (acc < rachaPeor) { rachaPeor = acc; nPeor = nAcc; } } else { acc = 0; nAcc = 0; } }
  console.log(`  peor racha de días perdedores SEGUIDOS: ${eur(rachaPeor)} en ${nPeor} operaciones\n`);
}
function pls_en(s, lo, hi) { return s.filter((x) => x >= lo && x < hi).length; }

// ══════════════════════════════════════════════════════════════════════════════════════════
//  BLOQUE B — LA CAJA DE LESTER: ¿cabe en $7.977 de efectivo?
// ══════════════════════════════════════════════════════════════════════════════════════════
// Robinhood retiene $5.000 por cóndor (una vertical al ancho completo, memoria del proyecto).
// El crédito entra en la cuenta al abrir. Si el efectivo libre cae por debajo de $5.000, NO se
// puede abrir la operación del día siguiente: la regla se para sola. Eso no sale en el $/año.
console.log("=".repeat(102));
console.log("  BLOQUE B · LA CAJA REAL — $7.977 de efectivo, $5.000 de colateral por cóndor");
console.log("=".repeat(102) + "\n");

function simularCaja(ops, efectivo0, contratos) {
  let cash = efectivo0, hechas = 0, saltadas = 0, minCash = efectivo0, diaMin = null;
  const bloqueos = [];
  for (const o of ops) {
    if (cash < COLATERAL * contratos) { saltadas++; if (bloqueos.length < 12) bloqueos.push(o.dia); continue; }
    cash += o.pl * contratos; hechas++;
    if (cash < minCash) { minCash = cash; diaMin = o.dia; }
  }
  return { cash, hechas, saltadas, minCash, diaMin, bloqueos };
}

for (const v of VARIANTES) {
  const ops = correr(v.h, v.u);
  for (const k of [1, 2]) {
    const s = simularCaja(ops, EFECTIVO_LESTER, k);
    const libre = ops.map((o) => o.pl * k);
    const c = caja(libre);
    console.log(`  ${v.et}  ·  ${k} contrato(s)`);
    console.log(`     sin restricción: ${eur(suma(libre))} en total (${eur(suma(libre) / ANOS)}/año), punto más bajo de la caja ${eur(c.minAbs)}`);
    console.log(`     CON la caja real: efectivo final ${eur(s.cash)} · operaciones hechas ${s.hechas} de ${ops.length} · BLOQUEADAS por falta de efectivo: ${s.saltadas}`);
    console.log(`     efectivo mínimo alcanzado ${eur(s.minCash)} el ${s.diaMin}  ·  colchón sobre el colateral: ${eur(s.minCash - COLATERAL * k)}`);
    if (s.saltadas) console.log(`     primeros días bloqueados: ${s.bloqueos.join(", ")}`);
    console.log("");
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════
//  BLOQUE C — LOS DÍAS DE VERDAD MALOS
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("=".repeat(102));
console.log("  BLOQUE C · ¿ESTÁN EN LA MUESTRA LOS DÍAS MALOS? ¿y por qué no se opera en ellos?");
console.log("=".repeat(102) + "\n");

const MALOS = ["2022-10-13", "2025-04-03", "2025-04-04", "2025-04-07", "2025-04-08", "2025-04-09",
  "2025-10-10", "2026-06-09", "2024-08-05", "2025-04-10", "2026-04-13"];
for (const d of MALOS) {
  const x = CONMA.find((z) => z.dia === d) || R.find((z) => z.dia === d);
  if (!x) { console.log(`  ${d}: NO ESTÁ EN EL BANCO`); continue; }
  const sinMa = x.ma50 == null;
  for (const h of HORAS) {
    const c = x.porHora[h];
    if (!c) { console.log(`  ${d} ${h}: sin cadena / hueco`); continue; }
    const a = sinMa ? "?" : (c.spot > x.ma5 ? "SÍ" : "no"), b = sinMa ? "?" : (c.spot > x.ma50 ? "SÍ" : "no");
    const cc50 = c.credito >= 50 ? "SÍ" : "no", cc100 = c.credito >= 100 ? "SÍ" : "no";
    const opera = a === "SÍ" && b === "SÍ" && cc50 === "SÍ";
    console.log(`  ${d} ${h}: spot ${c.spot.toFixed(1)} cierre ${x.cierre.toFixed(1)} (${((x.cierre / c.spot - 1) * 100).toFixed(2)}%) · sobreMA5 ${a} · sobreMA50 ${b} · créd ${eur(c.credito)} (≥50 ${cc50} / ≥100 ${cc100}) · ${opera ? `**OPERA** → ${eur(c.dolares)}` : "no opera"}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════
//  BLOQUE D — LOS 15 PEORES DÍAS DE LA VARIANTE ESTRELLA, con nombre y apellidos
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "=".repeat(102));
console.log("  BLOQUE D · LOS 15 PEORES DÍAS de cada variante — dónde está la cola");
console.log("=".repeat(102) + "\n");
for (const v of VARIANTES) {
  const ops = correr(v.h, v.u);
  const s = [...ops].sort((a, b) => a.pl - b.pl).slice(0, 15);
  console.log(`  ${v.et}`);
  console.log(`  | día | resultado | crédito | riesgo máx | spot entrada | cierre | mov % | puntos fuera del cóndor |`);
  console.log(`  |---|---|---|---|---|---|---|---|`);
  for (const o of s) console.log(`  | ${o.dia} | ${eur(o.pl)} | ${eur(o.credito)} | ${eur(o.riesgo)} | ${o.spot.toFixed(1)} | ${o.cierre.toFixed(1)} | ${((o.cierre / o.spot - 1) * 100).toFixed(2)}% | ${o.fuera.toFixed(0)} |`);
  console.log("");
}

// ══════════════════════════════════════════════════════════════════════════════════════════
//  BLOQUE E — SANIDAD: ¿alguna pérdida se sale del riesgo definido?
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("=".repeat(102));
console.log("  BLOQUE E · SANIDAD");
console.log("=".repeat(102) + "\n");
for (const v of VARIANTES) {
  const ops = correr(v.h, v.u);
  const rotas = ops.filter((o) => o.pl < -(ALA * 100) + o.credito - 1);
  const credRaro = ops.filter((o) => o.credito < 20 || o.credito > 600);
  console.log(`  ${v.et}: pérdidas por encima del riesgo definido (${eur(ALA * 100)} − crédito): ${rotas.length}` +
    (rotas.length ? ` → ${rotas.slice(0, 5).map((o) => `${o.dia} ${eur(o.pl)}`).join(", ")}` : ""));
  console.log(`     créditos fuera del rango de cordura $20–$600: ${credRaro.length}` +
    (credRaro.length ? ` → ${credRaro.slice(0, 5).map((o) => `${o.dia} ${eur(o.credito)}`).join(", ")}` : ""));
}
console.log("\n  ESTO ES BACKTEST. La hora y el umbral nuevos se eligieron sobre estos mismos días.\n");
