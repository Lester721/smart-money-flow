// SÍNTESIS · LA MEJOR CONFIGURACIÓN DEL CÓNDOR 0DTE — todo lo que sobrevivió, junto y medido entero.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/sintesis-mejor-condor.mjs
//
// ═══ QUÉ SE JUNTA AQUÍ Y POR QUÉ ══════════════════════════════════════════════════════════
// De 15 agentes y ~200 pruebas sobre los MISMOS 653 días, sólo DOS cosas quedaron vivas:
//
//   1. ALEJAR LOS DOS STRIKES A LA VEZ (anatomia-distancia-cola.mjs). ±25 → ±30/±35. La caída
//      baja monótona en los 9 escalones, mejora en los tres tercios, y el ingreso no cambia de
//      forma medible (t pareada −0,17). No toca el peor día: es aritmética del colateral.
//   2. EL FILTRO DE TENDENCIA (refutar-cola-tendencia.mjs). No operar si el spot de las 11:00
//      está por debajo de su media de 20 sesiones (regla A) o de la de 20 Y la de 50 (regla B).
//      Sobrevivió a nulo de rotación, descarte aleatorio, rejilla, jackknife y años. Corta la
//      FRECUENCIA de los golpes (p<5e−5); la caída y el ingreso NO llegan al listón.
//
// Nadie las ha medido JUNTAS. Eso es lo único nuevo de este script: la rejilla 3×3
// (distancia × filtro) sobre los 653 días con precios reales, más el escalado de tamaño.
//
// ═══ NADA DE MIRAR AL FUTURO ══════════════════════════════════════════════════════════════
// · Los strikes se eligen con el spot de SPX de las 11:00 (el momento de entrar).
// · Las medias de 20/50 se calculan SÓLO con cierres de D−1 hacia atrás; lo único del día D
//   que entra es el precio de SPY a las 11:00 (minuto 660).
// · Bid al vender, ask al comprar, las cuatro patas. Liquidación contra el cierre real. $0,03/pata.
// · Ningún precio de modelo. Si un día no tiene dato, SE DICE y se cuenta.

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { listonT } from "../lib/barreraHallazgos";

// ─── PRUEBAS DECLARADAS ────────────────────────────────────────────────────────────────────
// 9 celdas de la rejilla (3 distancias × 3 filtros) + 4 escalados de tamaño = 13 nuevas.
// Sobre estos MISMOS 653 días el proyecto lleva ~200 pruebas previas (17 filtros de régimen,
// 30 reglas de gestión, 22+16+13+87 señales de cola, 79 reglas de tamaño, 40 paradas...).
// El listón honesto es el del acumulado, no el de las 13 de hoy.
const PRUEBAS_HOY = 18 + 20 + 4;   // rejilla 6×3 + rejilla de parámetros 5×4 + escalados
const PRUEBAS_ACUMULADAS = 242;
const LISTON = listonT(PRUEBAS_ACUMULADAS);

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00", COMM = 0.03, ALA = 50;
const DIST = [25, 28, 30, 32, 35, 40];
const CUENTA = 56389;      // la cuenta de Lester, según el encargo
const EFECTIVO = 7977;     // efectivo libre (el cuello de botella real del colateral)

const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const sd = (v) => { const m = media(v); return Math.sqrt(suma(v.map((x) => (x - m) ** 2)) / (v.length - 1)); };
const q = (v, p) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(p * s.length)))]; };
const eur = (x) => (x < 0 ? "−$" : "$") + Math.round(Math.abs(x)).toLocaleString("es-ES");
const pc = (x) => (x * 100).toFixed(1) + "%";

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 1 · LAS CADENAS — el mismo lector de anatomia-distancia-cola.mjs, sin reinventar nada
// ═══════════════════════════════════════════════════════════════════════════════════════════
function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const [iK, iT, iB, iA, iU] = ["strike", "timestamp", "bid", "ask", "underlying_price"].map((c) => cab.indexOf(c));
  if ([iK, iT, iB, iA, iU].some((x) => x < 0)) return null;
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

const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();
const cond = [];                    // una fila por día con las 3 distancias dentro
const sinCadena = [];
for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P || !(C.cierre > 0)) { sinCadena.push(fecha); continue; }
  const spot = C.filas[0].spot;
  if (!(spot > 0)) { sinCadena.push(fecha); continue; }
  const S = C.cierre, fila = { fecha, spot, cierre: S };
  let malo = false;
  for (const d of DIST) {
    const cC = cerca(C.filas, spot + d), pC = cerca(P.filas, spot - d);
    const cL = cerca(C.filas, cC.K + ALA), pL = cerca(P.filas, pC.K - ALA);
    if (cL.K <= cC.K || pL.K >= pC.K) { malo = true; break; }
    const cred = cC.bid + pC.bid - cL.ask - pL.ask;
    if (!(cred > 0)) { malo = true; break; }
    const aC = cL.K - cC.K, aP = pC.K - pL.K;
    const danoCall = Math.min(Math.max(S - cC.K, 0), aC), danoPut = Math.min(Math.max(pC.K - S, 0), aP);
    fila[d] = {
      pl: (cred - danoCall - danoPut) * 100 - 8 * COMM,
      credito: cred * 100,
      colateral: (Math.max(aC, aP) - cred) * 100,
      danoCall: danoCall * 100, danoPut: danoPut * 100,
    };
  }
  if (malo || DIST.some((d) => !fila[d])) { sinCadena.push(fecha); continue; }
  cond.push(fila);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 2 · PARIDAD — el ±25 reconstruido tiene que ser EL MISMO que el guardado
// ═══════════════════════════════════════════════════════════════════════════════════════════
const guardadas = new Map(JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8")).map((o) => [o.fecha, o.pl]));
let peorDif = 0, nComp = 0;
for (const f of cond) { const g = guardadas.get(f.fecha); if (g === undefined) continue; nComp++; peorDif = Math.max(peorDif, Math.abs(g - f[25].pl)); }

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 3 · LA SEÑAL DE TENDENCIA — cinta de minutos de SPY, medias sólo con cierres de D−1 atrás
// ═══════════════════════════════════════════════════════════════════════════════════════════
const dias = [];
for (const y of [2023, 2024, 2025, 2026]) {
  const j = JSON.parse(readFileSync(`scripts/cache-theta/SPY_spotmin_y_${y}.json`, "utf8"));
  for (const [d, arr] of Object.entries(j)) {
    const m = new Map(arr.map(([mi, p]) => [mi, p]));
    const o = m.get(570), c = m.get(960), p11 = m.get(660);
    if (!(o > 0) || !(c > 0) || !(p11 > 0)) continue;
    dias.push({ fecha: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, c, p11 });
  }
}
dias.sort((a, b) => a.fecha.localeCompare(b.fecha));
const idx = new Map(dias.map((d, i) => [d.fecha, i]));

const filas = [];
const sinSerie = [];
for (const f of cond) {
  const i = idx.get(f.fecha);
  if (i === undefined || i < 200) { sinSerie.push(f.fecha); continue; }
  const cierres = dias.slice(i - 200, i).map((d) => d.c);      // SÓLO D−200 … D−1
  const p11 = dias[i].p11;
  const d = {};
  for (const k of [10, 15, 20, 25, 30, 40, 50, 60, 75]) d[k] = p11 / media(cierres.slice(-k)) - 1;
  filas.push({
    ...f,
    dma: d,
    dma20: d[20],
    dma50: d[50],
    pl25: f[25].pl, pl30: f[30].pl, pl35: f[35].pl,
    cred25: f[25].credito, col25: f[25].colateral,
  });
}
filas.sort((a, b) => a.fecha.localeCompare(b.fecha));
const N = filas.length, ANOS = N / 252;

console.log("═".repeat(112));
console.log("SÍNTESIS · LA MEJOR CONFIGURACIÓN DEL CÓNDOR DE HIERRO 0DTE SOBRE SPXW");
console.log("═".repeat(112));
console.log(`\nDías con cadena completa en las 3 distancias: ${cond.length} (de ${fechas.length} fechas en disco).`);
if (sinCadena.length) console.log(`SE DICE, NO SE RELLENA — ${sinCadena.length} fecha(s) sin cadena utilizable a las ${HORA} o sin crédito positivo en alguna distancia.`);
console.log(`PARIDAD con scripts/regimen-filas.json en el ±25: ${nComp} días comparados, diferencia máxima ${peorDif.toFixed(6)} $.`);
if (sinSerie.length) console.log(`SE DICE, NO SE RELLENA — ${sinSerie.length} día(s) fuera por no tener 200 sesiones previas de SPY: ${sinSerie.join(", ")}`);
console.log(`\nMuestra final: ${N} días · ${filas[0].fecha} → ${filas[N - 1].fecha} · ${ANOS.toFixed(2)} años`);
console.log(`Pruebas nuevas hoy: ${PRUEBAS_HOY}. Acumuladas sobre estos mismos días: ~${PRUEBAS_ACUMULADAS}. Listón de Bonferroni |t| ≥ ${LISTON}`);

radiografia(filas, ["pl25", "pl30", "pl35", "cred25", "col25", "dma20", "dma50"], "síntesis", { maxCeros: 0.2 });

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 4 · LAS MÉTRICAS — sobre la serie de CALENDARIO (día sin operar = $0)
// ═══════════════════════════════════════════════════════════════════════════════════════════
function ddPico(pls) { let a = 0, p = 0, w = 0; for (const x of pls) { a += x; p = Math.max(p, a); w = Math.min(w, a - p); } return w; }
function ddDetalle(pls, fech) {
  let a = 0, p = 0, w = 0, iPico = 0, iP = 0, iV = 0;
  for (let i = 0; i < pls.length; i++) { a += pls[i]; if (a > p) { p = a; iPico = i; } if (a - p < w) { w = a - p; iP = iPico; iV = i; } }
  return { w, desde: fech[iP], hasta: fech[iV], sesiones: iV - iP };
}

/**
 * Estimador de caída que NO depende de un solo camino: media de las 10 PEORES ventanas de 60
 * sesiones (sin solaparse). La peor racha es un máximo — un número de un solo camino; esto tiene
 * muestra. Lo pidió la refutación del filtro de IV y tiene razón.
 */
function caida60(cal) {
  const v = [];
  for (let i = 0; i + 60 <= cal.length; i += 60) v.push(suma(cal.slice(i, i + 60)));
  v.sort((a, b) => a - b);
  return media(v.slice(0, Math.min(3, v.length)));   // las 3 peores ventanas de 60 sesiones
}

/** mask = qué días se opera · esc = tamaño (nº de contratos, puede ser fraccional) */
function evalua(dist, mask, esc = 1) {
  const cal = filas.map((f, i) => (mask[i] ? f[dist].pl * esc : 0));
  const op = filas.filter((_, i) => mask[i]);
  const opPl = op.map((f) => f[dist].pl * esc);
  const total = suma(cal);
  const dd = ddDetalle(cal, filas.map((f) => f.fecha));
  return {
    dist, nOp: op.length, diasAno: op.length / ANOS,
    total, alAno: total / ANOS, medio: media(opPl),
    acierto: opPl.filter((x) => x > 0).length / opPl.length,
    credito: media(op.map((f) => f[dist].credito * esc)),
    colMed: q(op.map((f) => f[dist].colateral * esc), 0.5),
    colMax: Math.max(...op.map((f) => f[dist].colateral * esc)),
    peorDia: Math.min(...opPl),
    p1op: q(opPl, 0.01), p5op: q(opPl, 0.05),
    p1cal: q(cal, 0.01), p5cal: q(cal, 0.05),
    nMalo2k: opPl.filter((x) => x <= -2000).length, pMalo2k: opPl.filter((x) => x <= -2000).length / opPl.length,
    dd: dd.w, ddDesde: dd.desde, ddHasta: dd.hasta, ddSesiones: dd.sesiones,
    dd60: caida60(cal),
    cal, opPl,
  };
}

const TODOS = filas.map(() => true);
const A = filas.map((f) => f.dma20 >= 0);
const B = filas.map((f) => f.dma20 >= 0 && f.dma50 >= 0);
const FILTROS = [["sin filtro", TODOS], ["A · spot ≥ MA20", A], ["B · spot ≥ MA20 y ≥ MA50", B]];

const REJILLA = [];
for (const d of DIST) for (const [nf, mk] of FILTROS) REJILLA.push({ nombre: `±${d} · ${nf}`, dist: d, filtro: nf, r: evalua(d, mk) });
const BASE = REJILLA.find((x) => x.dist === 25 && x.filtro === "sin filtro").r;

console.log(`\n\n${"─".repeat(112)}\nTABLA 1 · LA REJILLA ENTERA — 3 distancias × 3 filtros · alas ${ALA} · 1 contrato · entrada ${HORA} ET\n${"─".repeat(112)}`);
console.log("\n| configuración | días op. | días/año | $/año | % del ingreso | acierto | crédito medio | PEOR día | p1 (op) | p5 (op) | días <−$2k | PEOR RACHA | caída robusta 60d | colateral med. |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const c of REJILLA) {
  const r = c.r;
  console.log(`| ${c.nombre} | ${r.nOp} | ${r.diasAno.toFixed(0)} | ${eur(r.alAno)} | ${((r.alAno / BASE.alAno) * 100).toFixed(0)}% | ${(r.acierto * 100).toFixed(0)}% | ${eur(r.credito)} | ${eur(r.peorDia)} | ${eur(r.p1op)} | ${eur(r.p5op)} | ${r.nMalo2k} (${pc(r.pMalo2k)}) | ${eur(r.dd)} | ${eur(r.dd60)} | ${eur(r.colMed)} |`);
}

console.log(`\n\n${"─".repeat(112)}\nTABLA 2 · LA MÉTRICA QUE DECIDE — $/año perdidos por cada $ de caída eliminado\n(negativo = GRATIS: mejora las dos cosas · el patrón oro de bajar tamaño cuesta ${(BASE.alAno / Math.abs(BASE.dd)).toFixed(2)})\n${"─".repeat(112)}`);
console.log("\n| configuración | ingreso perdido $/año | caída eliminada | $/año por $ de caída | p5 eliminado | $/año por $ de p5 |");
console.log("|---|---|---|---|---|---|");
for (const c of REJILLA) {
  if (c.dist === 25 && c.filtro === "sin filtro") continue;
  const r = c.r, perd = BASE.alAno - r.alAno;
  const eDD = Math.abs(BASE.dd) - Math.abs(r.dd), eP5 = Math.abs(BASE.p5op) - Math.abs(r.p5op);
  console.log(`| ${c.nombre} | ${eur(perd)} | ${eur(eDD)} | ${eDD !== 0 ? (perd / eDD).toFixed(2) : "—"} | ${eur(eP5)} | ${eP5 !== 0 ? (perd / eP5).toFixed(2) : "—"} |`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 5 · EL GANADOR — el que más caída quita por menos ingreso, con caída eliminada > 0
// ═══════════════════════════════════════════════════════════════════════════════════════════
const cands = REJILLA.filter((c) => !(c.dist === 25 && c.filtro === "sin filtro"))
  .map((c) => { const perd = BASE.alAno - c.r.alAno, eDD = Math.abs(BASE.dd) - Math.abs(c.r.dd); return { ...c, perd, eDD, ratio: eDD > 0 ? perd / eDD : Infinity }; })
  .filter((c) => c.eDD > 0)
  .sort((a, b) => a.ratio - b.ratio);
console.log(`\n\n${"─".repeat(112)}\nORDEN POR LA MÉTRICA QUE DECIDE (sólo las que SÍ bajan la caída)\n${"─".repeat(112)}`);
for (const c of cands) console.log(`  ${c.ratio.toFixed(2).padStart(7)}  ${c.nombre.padEnd(34)} caída ${eur(c.r.dd).padStart(10)}  ingreso ${eur(c.r.alAno).padStart(9)}/año  ingreso perdido ${eur(c.perd)}/año`);

// ELECCIÓN. Un ratio negativo significa "gratis": mejora caída E ingreso a la vez. Entre varias
// gratis, el ratio más negativo NO es la mejor: puede ser la que quita MENOS caída. Se elige por
// CAÍDA ELIMINADA entre las gratis; si ninguna es gratis, por el ratio más barato.
const gratis = cands.filter((c) => c.perd <= 0).sort((a, b) => b.eDD - a.eDD);
const GAN = gratis.length ? gratis[0] : cands[0];
console.log(`\nGANADORA: ${GAN.nombre} — ${gratis.length ? "quita más caída de entre las que NO cuestan ingreso" : "el ratio más barato"}.`);
const maskGan = GAN.filtro === "sin filtro" ? TODOS : (GAN.filtro.startsWith("A") ? A : B);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 6 · TERCIOS Y AÑO A AÑO DEL GANADOR
// ═══════════════════════════════════════════════════════════════════════════════════════════
const k3 = Math.floor(N / 3);
const trozos = [[0, k3], [k3, 2 * k3], [2 * k3, N]];
console.log(`\n\n${"─".repeat(112)}\nTABLA 3 · ¿VIVE EN UN SOLO PERÍODO? — tercios de tiempo y años naturales\n${"─".repeat(112)}`);
function trozoStats(cal, a, b) { const g = cal.slice(a, b); return { ano: suma(g) / ((b - a) / 252), dd: ddPico(g) }; }
console.log(`\n| serie | ${trozos.map((t, i) => `T${i + 1} ${filas[t[0]].fecha}→${filas[t[1] - 1].fecha}`).join(" | ")} |`);
console.log("|---|---|---|---|");
for (const [nom, r] of [["BASE ±25 $/año", BASE], [`${GAN.nombre} $/año`, GAN.r]])
  console.log(`| ${nom} | ${trozos.map(([a, b]) => eur(trozoStats(r.cal, a, b).ano)).join(" | ")} |`);
for (const [nom, r] of [["BASE ±25 caída", BASE], [`${GAN.nombre} caída`, GAN.r]])
  console.log(`| ${nom} | ${trozos.map(([a, b]) => eur(trozoStats(r.cal, a, b).dd)).join(" | ")} |`);
const signoT = trozos.map(([a, b]) => (Math.abs(trozoStats(GAN.r.cal, a, b).dd) < Math.abs(trozoStats(BASE.cal, a, b).dd) ? "+" : "−")).join("");
const signoI = trozos.map(([a, b]) => (trozoStats(GAN.r.cal, a, b).ano > trozoStats(BASE.cal, a, b).ano ? "+" : "−")).join("");
console.log(`\nSigno por tercios · CAÍDA menor que la base: ${signoT}   ·   INGRESO mayor que la base: ${signoI}`);

const anos = [...new Set(filas.map((f) => f.fecha.slice(0, 4)))].sort();
console.log(`\n| serie | ${anos.join(" | ")} |`);
console.log(`|---|${anos.map(() => "---").join("|")}|`);
for (const [nom, r] of [["BASE ±25 $/año", BASE], [`${GAN.nombre} $/año`, GAN.r]]) {
  console.log(`| ${nom} | ${anos.map((y) => { const g = r.cal.filter((_, i) => filas[i].fecha.startsWith(y)); return eur(suma(g) / (g.length / 252)); }).join(" | ")} |`);
}
for (const [nom, r] of [["BASE ±25 caída", BASE], [`${GAN.nombre} caída`, GAN.r]]) {
  console.log(`| ${nom} | ${anos.map((y) => { const g = r.cal.filter((_, i) => filas[i].fecha.startsWith(y)); return eur(ddPico(g)); }).join(" | ")} |`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 7 · NULO DE ROTACIÓN — ¿la caída baja por INFORMACIÓN o por operar menos días?
// ═══════════════════════════════════════════════════════════════════════════════════════════
function nuloRotacion(dist, mask) {
  const ddN = [], totN = [], p2kN = [];
  for (let k = 25; k < N - 25; k++) {
    const m = mask.map((_, i) => mask[(i + k) % N]);
    const r = evalua(dist, m);
    if (r.nOp < 50) continue;
    ddN.push(Math.abs(r.dd)); totN.push(r.total); p2kN.push(r.pMalo2k);
  }
  return { ddN, totN, p2kN };
}
if (GAN.filtro !== "sin filtro") {
  const nulo = nuloRotacion(GAN.dist, maskGan);
  const rank = (v, x, menorMejor) => (menorMejor ? v.filter((y) => y <= x).length : v.filter((y) => y >= x).length) / v.length;
  console.log(`\n\n${"─".repeat(112)}\nTABLA 4 · NULO DE ROTACIÓN — se gira la máscara del filtro k días (mismo nº de días operados,\nmisma agrupación, alineación con el P&L destruida). ${nulo.ddN.length} giros.\n${"─".repeat(112)}`);
  console.log("\n| métrica | real | mediana del nulo | 5% del nulo | 95% del nulo | p (fracción del nulo igual o mejor) |");
  console.log("|---|---|---|---|---|---|");
  console.log(`| peor racha | ${eur(GAN.r.dd)} | ${eur(-q(nulo.ddN, 0.5))} | ${eur(-q(nulo.ddN, 0.95))} | ${eur(-q(nulo.ddN, 0.05))} | **${rank(nulo.ddN, Math.abs(GAN.r.dd), true).toFixed(3)}** |`);
  console.log(`| P&L total | ${eur(GAN.r.total)} | ${eur(q(nulo.totN, 0.5))} | ${eur(q(nulo.totN, 0.05))} | ${eur(q(nulo.totN, 0.95))} | **${rank(nulo.totN, GAN.r.total, false).toFixed(3)}** |`);
  console.log(`| P(pérdida > $2.000) | ${pc(GAN.r.pMalo2k)} | ${pc(q(nulo.p2kN, 0.5))} | ${pc(q(nulo.p2kN, 0.05))} | ${pc(q(nulo.p2kN, 0.95))} | **${rank(nulo.p2kN, GAN.r.pMalo2k, true).toFixed(3)}** |`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 8 · BOOTSTRAP POR BLOQUES, PAREADO — ¿es la caída menor real o suerte del camino?
// ═══════════════════════════════════════════════════════════════════════════════════════════
function boot(a, c, iter = 6000, bl = 10) {
  const n = a.length, nb = Math.ceil(n / bl);
  let mDD = 0, mTot = 0, mP5 = 0, mPeor = 0;
  for (let it = 0; it < iter; it++) {
    const x = [], y = [];
    for (let b = 0; b < nb; b++) { const i0 = (Math.random() * n) | 0; for (let j = 0; j < bl && x.length < n; j++) { const i = (i0 + j) % n; x.push(a[i]); y.push(c[i]); } }
    if (Math.abs(ddPico(y)) < Math.abs(ddPico(x))) mDD++;
    if (suma(y) > suma(x)) mTot++;
    if (q(y, 0.05) > q(x, 0.05)) mP5++;
    if (Math.min(...y) > Math.min(...x)) mPeor++;
  }
  return { pDD: mDD / iter, pTot: mTot / iter, pP5: mP5 / iter, pPeor: mPeor / iter };
}
console.log(`\n\n${"─".repeat(112)}\nTABLA 5 · BOOTSTRAP POR BLOQUES (6.000 remuestreos de bloques de 10 días, pareado contra la base)\n${"─".repeat(112)}`);
console.log("\n| configuración | P(caída menor) | P(p5 menos malo) | P(peor día menos malo) | P(gana MÁS dinero) |");
console.log("|---|---|---|---|---|");
const boots = {};
for (const c of REJILLA) {
  if (c.dist === 25 && c.filtro === "sin filtro") continue;
  const b = boot(BASE.cal, c.r.cal); boots[c.nombre] = b;
  console.log(`| ${c.nombre} | ${(b.pDD * 100).toFixed(0)}% | ${(b.pP5 * 100).toFixed(0)}% | ${(b.pPeor * 100).toFixed(0)}% | ${(b.pTot * 100).toFixed(0)}% |`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 9 · ¿ES MEDIBLE LA PÉRDIDA DE INGRESO? — t pareada diaria contra la base
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n${"─".repeat(112)}\nTABLA 6 · ¿SE PIERDE INGRESO DE FORMA MEDIBLE? — t pareada del P&L diario contra la base (listón |t| ≥ ${LISTON})\n${"─".repeat(112)}`);
console.log("\n| configuración | diferencia media $/día | $/año | t pareada | ¿supera el listón? |");
console.log("|---|---|---|---|---|");
const ts = {};
for (const c of REJILLA) {
  if (c.dist === 25 && c.filtro === "sin filtro") continue;
  const dif = c.r.cal.map((x, i) => x - BASE.cal[i]);
  const t = media(dif) / (sd(dif) / Math.sqrt(dif.length)); ts[c.nombre] = t;
  console.log(`| ${c.nombre} | ${eur(media(dif))} | ${eur(media(dif) * 252)} | ${t.toFixed(2)} | ${Math.abs(t) >= LISTON ? "SÍ" : "no"} |`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 10 · LA FRONTERA DEL TAMAÑO — lo único que baja el PEOR DÍA, y lo que cuesta
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n${"─".repeat(112)}\nTABLA 7 · LA FRONTERA DEL TAMAÑO — escalar es lineal: baja TODO en la misma proporción,\nincluido el PEOR DÍA (lo único que ninguna otra palanca toca).\n${"─".repeat(112)}`);
console.log("\n| configuración | tamaño | $/año | PEOR día | PEOR RACHA | p5 (op) | colateral med. | ¿cabe en $7.977 de efectivo? | ¿existe el contrato? |");
console.log("|---|---|---|---|---|---|---|---|---|");
const ESCALAS = [
  ["BASE ±25 sin filtro", 25, TODOS, 1], ["BASE ±25 sin filtro", 25, TODOS, 0.5], ["BASE ±25 sin filtro", 25, TODOS, 0.25],
  [GAN.nombre, GAN.dist, maskGan, 1], [GAN.nombre, GAN.dist, maskGan, 0.5], [GAN.nombre, GAN.dist, maskGan, 0.25],
];
const frontera = [];
for (const [nom, d, mk, e] of ESCALAS) {
  const r = evalua(d, mk, e);
  const cabe = r.colMax <= EFECTIVO ? "sí" : `no (máx ${eur(r.colMax)})`;
  const existe = e === 1 ? "sí, 1 contrato SPXW" : `NO en SPXW — ${e} contratos no se pueden operar`;
  frontera.push({ nom, esc: e, ...r, cal: undefined, opPl: undefined });
  console.log(`| ${nom} | ×${e} | ${eur(r.alAno)} | ${eur(r.peorDia)} | ${eur(r.dd)} | ${eur(r.p5op)} | ${eur(r.colMed)} | ${cabe} | ${existe} |`);
}

// ── ¿CUÁNTO CUESTA CADA NIVEL DE CAÍDA? ───────────────────────────────────────────────────
console.log(`\n\n${"─".repeat(112)}\nTABLA 7b · EL PRECIO DE DORMIR — cuánto ingreso cuesta cada techo de caída, con la GANADORA\n${"─".repeat(112)}`);
console.log("\n| caída máxima que quiere aguantar | tamaño necesario | $/año | PEOR día | ¿se puede operar en SPXW? |");
console.log("|---|---|---|---|---|");
for (const obj of [15176, 12000, 10000, 7500, 5000, 3000]) {
  const esc = Math.min(2, obj / Math.abs(GAN.r.dd));
  const r = evalua(GAN.dist, maskGan, esc);
  const ok = Math.abs(esc - Math.round(esc)) < 1e-9 && esc >= 1 ? `sí, ${Math.round(esc)} contrato(s)` : "NO — haría falta fracción de contrato (SPXW es indivisible)";
  console.log(`| ${eur(-obj)} | ×${esc.toFixed(2)} | ${eur(r.alAno)} | ${eur(r.peorDia)} | ${ok} |`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 11 · LA TABLA QUE PIDIÓ LESTER — la mejor configuración contra el cóndor de hoy
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n${"═".repeat(112)}\nTABLA 8 · LA RECOMENDACIÓN — ${GAN.nombre} contra el cóndor de hoy\n${"═".repeat(112)}`);
const F = [
  ["$/año", (r) => eur(r.alAno)],
  ["$/operación", (r) => eur(r.medio)],
  ["días operados / año", (r) => r.diasAno.toFixed(0)],
  ["acierto", (r) => (r.acierto * 100).toFixed(0) + "%"],
  ["crédito medio cobrado", (r) => eur(r.credito)],
  ["PEOR DÍA", (r) => eur(r.peorDia)],
  ["percentil 1 (de los días operados)", (r) => eur(r.p1op)],
  ["percentil 5 (de los días operados)", (r) => eur(r.p5op)],
  ["percentil 1 (del calendario)", (r) => eur(r.p1cal)],
  ["percentil 5 (del calendario)", (r) => eur(r.p5cal)],
  ["días con pérdida > $2.000", (r) => `${r.nMalo2k} (${pc(r.pMalo2k)})`],
  ["PEOR RACHA ACUMULADA", (r) => eur(r.dd)],
  ["caída robusta (media de las 3 peores ventanas de 60 sesiones)", (r) => eur(r.dd60)],
  ["  · cuándo", (r) => `${r.ddDesde} → ${r.ddHasta} (${r.ddSesiones} sesiones)`],
  ["  · % de la cuenta de $56.389", (r) => pc(Math.abs(r.dd) / CUENTA)],
  ["colateral mediano", (r) => eur(r.colMed)],
  ["colateral máximo", (r) => eur(r.colMax)],
];
console.log(`\n| | cóndor de hoy (±25, sin filtro) | ${GAN.nombre} | diferencia |`);
console.log("|---|---|---|---|");
for (const [nom, fn] of F) {
  const a = fn(BASE), b = fn(GAN.r);
  console.log(`| ${nom} | ${a} | ${b} | ${a === b ? "igual" : ""} |`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 11b · ¿PICO O MESETA? — rejilla de parámetros alrededor de la ganadora
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n${"─".repeat(112)}\nTABLA 10 · ¿PICO O MESETA? — se cambian las DOS medias del filtro (la ganadora usa 20 y 50)\ny se mira la caída y el ingreso en ±${GAN.dist}. Si el efecto es real, todo el vecindario funciona.\n${"─".repeat(112)}`);
const CORTAS = [10, 15, 20, 25, 30], LARGAS = [40, 50, 60, 75];
console.log(`\n| media corta \\ media larga | ${LARGAS.map((l) => "MA" + l).join(" | ")} |`);
console.log(`|---|${LARGAS.map(() => "---").join("|")}|`);
let peorCelda = { dd: 0 }, mejorCelda = { dd: -1e9 };
for (const c of CORTAS) {
  const fila = LARGAS.map((l) => {
    const m = filas.map((f) => f.dma[c] >= 0 && f.dma[l] >= 0);
    const r = evalua(GAN.dist, m);
    if (Math.abs(r.dd) > Math.abs(peorCelda.dd)) peorCelda = { ...r, c, l };
    if (Math.abs(r.dd) < Math.abs(mejorCelda.dd) || mejorCelda.dd === -1e9) mejorCelda = { ...r, c, l };
    return `${eur(r.dd)} · ${eur(r.alAno)}/año`;
  });
  console.log(`| MA${c} | ${fila.join(" | ")} |`);
}
console.log(`\nDe las ${CORTAS.length * LARGAS.length} combinaciones: la PEOR deja la caída en ${eur(peorCelda.dd)} (MA${peorCelda.c}/MA${peorCelda.l}) con ${eur(peorCelda.alAno)}/año,`);
console.log(`la mejor en ${eur(mejorCelda.dd)} (MA${mejorCelda.c}/MA${mejorCelda.l}). La base sin filtro está en ${eur(BASE.dd)}.`);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 11c · JACKKNIFE POR MES — ¿lo sostienen unas pocas semanas?
// ═══════════════════════════════════════════════════════════════════════════════════════════
const meses = [...new Set(filas.map((f) => f.fecha.slice(0, 7)))].sort();
const jk = [];
for (const m of meses) {
  const keep = filas.map((f) => !f.fecha.startsWith(m));
  const calB = BASE.cal.filter((_, i) => keep[i]), calG = GAN.r.cal.filter((_, i) => keep[i]);
  const nA = calB.length / 252;
  jk.push({ mes: m, ddB: ddPico(calB), ddG: ddPico(calG), anoB: suma(calB) / nA, anoG: suma(calG) / nA });
}
const peorJK = jk.reduce((a, b) => (Math.abs(b.ddG) > Math.abs(a.ddG) ? b : a));
const peorJKano = jk.reduce((a, b) => (b.anoG < a.anoG ? b : a));
const nMalos = jk.filter((x) => Math.abs(x.ddG) >= Math.abs(x.ddB)).length;
console.log(`\n\n${"─".repeat(112)}\nTABLA 11 · JACKKNIFE POR MES — se quita un mes entero (${meses.length} meses) y se vuelve a medir\n${"─".repeat(112)}`);
console.log(`\nCaída de la ganadora quitando el peor mes para ella (${peorJK.mes}): ${eur(peorJK.ddG)} · la base en ese mismo escenario: ${eur(peorJK.ddB)}`);
console.log(`Ingreso mínimo de la ganadora en los ${meses.length} escenarios: ${eur(peorJKano.anoG)}/año (quitando ${peorJKano.mes}) · la base: ${eur(peorJKano.anoB)}/año`);
console.log(`Meses en los que quitar ese mes hace que la ganadora NO sea mejor que la base en caída: ${nMalos} de ${meses.length}`);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// 12 · LA INCERTIDUMBRE — el cóndor entero tiene t=1,70. Toda mejora hereda esa duda.
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n${"═".repeat(112)}\nTABLA 9 · LA INCERTIDUMBRE — ¿está establecida siquiera la ventaja de partida?\n${"═".repeat(112)}`);
function tMedia(v) { return media(v) / (sd(v) / Math.sqrt(v.length)); }
function icAno(cal, iter = 4000, bl = 21) {
  const n = cal.length, nb = Math.ceil(n / bl), tot = [];
  for (let it = 0; it < iter; it++) {
    let s = 0, c = 0;
    for (let b = 0; b < nb; b++) { const i0 = (Math.random() * n) | 0; for (let j = 0; j < bl && c < n; j++, c++) s += cal[(i0 + j) % n]; }
    tot.push(s / ANOS);
  }
  return { lo: q(tot, 0.025), hi: q(tot, 0.975), pPos: tot.filter((x) => x > 0).length / tot.length };
}
console.log("\n| serie | $/año | t de la media diaria | IC 95% del $/año (bloques de 21 días) | P($/año > 0) | días con pérdida > $4.000 |");
console.log("|---|---|---|---|---|---|");
for (const [nom, r] of [["cóndor de hoy ±25", BASE], [GAN.nombre, GAN.r]]) {
  const ic = icAno(r.cal);
  console.log(`| ${nom} | ${eur(r.alAno)} | ${tMedia(r.opPl).toFixed(2)} | ${eur(ic.lo)} … ${eur(ic.hi)} | ${pc(ic.pPos)} | ${r.opPl.filter((x) => x <= -4000).length} |`);
}
{
  const nulo = nuloRotacion(GAN.dist, maskGan);
  console.log(`\nEL ESCENARIO MALO, con nombre: si el filtro de tendencia NO llevara información (es decir, si`);
  console.log(`fuera sólo "operar 457 días de 651"), la caída de la ganadora sería la MEDIANA de su propio nulo`);
  console.log(`de rotación: ${eur(-q(nulo.ddN, 0.5))}. Ése es el suelo honesto de lo que se compra. La caída medida`);
  console.log(`es ${eur(GAN.r.dd)}; la diferencia entre las dos cifras es exactamente lo que hay que verificar en vivo.`);
}

writeFileSync("scripts/sintesis-mejor-condor.json", JSON.stringify({
  muestra: { n: N, desde: filas[0].fecha, hasta: filas[N - 1].fecha, anos: ANOS, paridadMax: peorDif, sinCadena: sinCadena.length, sinSerie },
  pruebas: { hoy: PRUEBAS_HOY, acumuladas: PRUEBAS_ACUMULADAS, liston: LISTON },
  rejilla: REJILLA.map((c) => ({ nombre: c.nombre, ...c.r, cal: undefined, opPl: undefined })),
  ganador: GAN.nombre, ratios: cands.map((c) => ({ nombre: c.nombre, ratio: c.ratio, perd: c.perd, eDD: c.eDD })),
  signoTercios: { caida: signoT, ingreso: signoI }, bootstrap: boots, tPareada: ts, frontera,
}, null, 2));
console.log(`\n(detalle en scripts/sintesis-mejor-condor.json)`);
