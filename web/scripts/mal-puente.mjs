// EL PUENTE · por qué ningún filtro sobrevive el cruce, y qué SÍ sobrevive.
//
// ═══ LO QUE SE DECLARA ANTES DE CORRER ═══════════════════════════════════════════════════════
//
// HIPÓTESIS (escrita antes de medir): el retrato dice que el día malo es EL MISMO animal en los
// dos períodos cuando se mide en sigmas (movimiento de tarde 0,72σ contra 0,69σ, t=0,79), y
// completamente distinto cuando se mide en puntos o en % del índice (los 25 pts pasan de 0,61%
// a 0,41%, t=36,6). Si eso es cierto, entonces:
//   (a) todo filtro escrito en PUNTOS o en % del índice o en nivel de VIX es un filtro DISTINTO
//       en cada período, y por eso muere al cruzar; y
//   (b) la propia POSICIÓN está escrita en puntos (±25 fijos), así que la posición también
//       cambia de significado entre períodos.
// EL PUENTE que se prueba: escribir la posición en SIGMAS (±k·sigma) en vez de en puntos.
//
// PRUEBAS DECLARADAS EN TODO EL ENCARGO: 48 (24 del retrato + 18 de la rejilla k×ala + 6 reglas).
// El divisor NO se baja aunque alguna prueba se quede sin correr.
//
// REGLA DE HIERRO: se ajusta k y el ala SÓLO en un período y se aplica TAL CUAL al otro. Y al
// revés. Sólo cuenta lo que funciona en las dos direcciones.
//
// PRECIOS: bid al vender, ask al comprar, las cuatro patas, comisión $0,03 por pata. Los strikes
// se eligen de la cadena REAL — si el strike objetivo no existe, se coge el más cercano que SÍ
// cotiza y se mide cuánto se falló.

import { readFileSync } from "node:fs";
import { listonT, tWelch } from "../lib/barreraHallazgos";
import { radiografia } from "../lib/radiografia";

const PRUEBAS = 48;
const LISTON = listonT(PRUEBAS);
const COMM = 0.03;
const CUENTA = 56389, EFECTIVO = 7977;

const dias = JSON.parse(readFileSync("scripts/mal-dias.json", "utf8")).sort((a, b) => a.fecha.localeCompare(b.fecha));
const CAD = JSON.parse(readFileSync("scripts/mal-cadenas.json", "utf8"));

const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };
const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const n2 = (x) => (x == null || !isFinite(x) ? "—" : x.toFixed(2));

for (const d of dias) {
  d.ano = d.fecha.slice(0, 4);
  d.per = d.fecha < "2024-01-01" ? "2022-23" : "2024-26";
  d.sigmaRatio = d.sigma ? 25 / d.sigma : null;
  d.tardeSig = d.sigma ? Math.abs(d.cierre - d.sp11) / d.sigma : null;
}

// ══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n====== 9 · LA PRUEBA DEL MECANISMO · el mismo umbral, dos significados ======\n`);
console.log("Cada fila es un umbral escrito como lo escribieron los filtros que murieron. Se mira");
console.log("qué FRACCIÓN de días caza en cada período. Si la fracción cambia, el filtro no es el");
console.log("mismo experimento en los dos lados y no puede sobrevivir el cruce.\n");
const A = dias.filter((d) => d.per === "2022-23"), B = dias.filter((d) => d.per === "2024-26");
const umbrales = [
  ["rango de la mañana > 30 PUNTOS  (el filtro de amplitud)", (d) => d.maxM - d.minM > 30],
  ["rango de la mañana > 0,50% del índice", (d) => (d.maxM - d.minM) / d.sp11 * 100 > 0.5],
  ["rango de la mañana > 0,50 sigmas", (d) => (d.maxM - d.minM) / d.sigma > 0.5],
  ["movimiento de la mañana > 0,40%", (d) => Math.abs(d.sp11 / d.ap - 1) * 100 > 0.4],
  ["IV del dinero > 25%", (d) => d.ivPct0 > 25],
  ["crédito cobrado > $600", (d) => d.credito > 600],
  ["los 25 pts valen menos de 0,40 sigmas", (d) => d.sigmaRatio < 0.4],
];
for (const d of dias) d.ivPct0 = d.iv * 100;
console.log("| umbral escrito así | % de días en 2022-23 | % de días en 2024-26 | ¿mismo experimento? |");
console.log("|---|---|---|---|");
for (const [nom, f] of umbrales) {
  const a = A.filter(f).length / A.length * 100, b = B.filter(f).length / B.length * 100;
  const est = Math.abs(a - b) <= 6 ? "**SÍ**" : "NO — " + (a > b ? "caza " + (a / b).toFixed(1) + "x más en 22-23" : "caza " + (b / a).toFixed(1) + "x más en 24-26");
  console.log(`| ${nom} | ${a.toFixed(0)}% | ${b.toFixed(0)}% | ${est} |`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// EL MOTOR: coloca el cóndor donde se le diga y liquida contra el cierre real.
// ══════════════════════════════════════════════════════════════════════════════════════════
const cercaK = (chain, obj) => chain.reduce((a, b) => (Math.abs(b[0] - obj) < Math.abs(a[0] - obj) ? b : a));

/** modo: {tipo:"pts", sep:25} o {tipo:"sig", k:0.45} · ala en puntos */
function operar(d, modo, ala) {
  const c = CAD[d.fecha]; if (!c) return null;
  let objC, objP;
  if (modo.tipo === "pts") { objC = d.sp11 + modo.sep; objP = d.sp11 - modo.sep; }
  else { if (!(d.sigma > 0)) return null; objC = d.sp11 + modo.k * d.sigma; objP = d.sp11 - modo.k * d.sigma; }
  const cC = cercaK(c.C, objC), pC = cercaK(c.P, objP);
  const cL = cercaK(c.C, cC[0] + ala), pL = cercaK(c.P, pC[0] - ala);
  if (cL[0] <= cC[0] || pL[0] >= pC[0]) return null;
  const anchoC = cL[0] - cC[0], anchoP = pC[0] - pL[0];
  const cred = cC[1] + pC[1] - cL[2] - pL[2];
  if (!(cred > 0)) return null;
  const S = d.cierre;
  const penC = Math.min(Math.max(S - cC[0], 0), anchoC), penP = Math.min(Math.max(pC[0] - S, 0), anchoP);
  const pl = (cred - penC - penP) * 100 - 8 * COMM;
  const colateral = Math.max(anchoC, anchoP) * 100 - cred * 100;   // Robinhood: una vertical al ancho completo
  return { fecha: d.fecha, pl, credito: cred * 100, colateral,
           fallo: Math.max(Math.abs(cC[0] - objC), Math.abs(pC[0] - objP)),
           tope: (penC >= anchoC - 0.001 || penP >= anchoP - 0.001) ? 1 : 0,
           distC: cC[0] - d.sp11, distP: d.sp11 - pC[0] };
}

function metricas(ops, anos) {
  if (!ops.length) return null;
  const pl = ops.map((o) => o.pl);
  const tot = pl.reduce((a, b) => a + b, 0);
  const s = [...pl].sort((a, b) => a - b);
  const k5 = Math.max(1, Math.floor(s.length * 0.05));
  const es5 = Math.abs(media(s.slice(0, k5)));                  // pérdida media del 5% peor
  let acc = 0, pico = 0, dd = 0;
  for (const p of pl) { acc += p; if (acc > pico) pico = acc; if (acc - pico < dd) dd = acc - pico; }
  const colMax = Math.max(...ops.map((o) => o.colateral));
  return { n: ops.length, tot, alAno: tot / anos, media: tot / pl.length, peor: s[0],
           p1: pct(pl, 0.01), p5: pct(pl, 0.05), es5, dd, colMax,
           acierto: pl.filter((x) => x > 0).length / pl.length,
           tope: ops.reduce((a, o) => a + o.tope, 0),
           objetivo: es5 > 0 ? (tot / anos) / es5 : -Infinity,
           credito: media(ops.map((o) => o.credito)),
           fallo: media(ops.map((o) => o.fallo)) };
}
const anosDe = (g) => g.length / 252;

// ══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n====== 10 · LA REJILLA · ±k·sigma contra los ±25 puntos fijos ======\n`);
console.log("Objetivo de ajuste, DECLARADO ANTES: $/año dividido por la pérdida media del 5% de");
console.log("días peores (ES5). Se maximiza sólo en el período de ajuste; el otro no se mira.\n");
const KS = [0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.70, 0.80];
const ALAS = [30, 50];
const familias = [];
for (const ala of ALAS) for (const k of KS) familias.push({ nom: `±${k.toFixed(2)}s / ala ${ala}`, modo: { tipo: "sig", k }, ala });
const BASE = { nom: "±25 pts / ala 50 (LO DE HOY)", modo: { tipo: "pts", sep: 25 }, ala: 50 };
const BASE30 = { nom: "±25 pts / ala 30", modo: { tipo: "pts", sep: 25 }, ala: 30 };

const corrida = new Map();
for (const f of [BASE, BASE30, ...familias]) {
  const ops = dias.map((d) => operar(d, f.modo, f.ala)).filter(Boolean);
  corrida.set(f.nom, { f, ops, A: ops.filter((o) => o.fecha < "2024-01-01"), B: ops.filter((o) => o.fecha >= "2024-01-01") });
}
// control de dato: los strikes elegidos existen y el fallo es pequeño
const ctrl = corrida.get("±0.45s / ala 50");
radiografia(ctrl.ops, ["pl", "credito", "colateral", "distC", "distP"], "cóndor a ±0,45 sigmas", { maxCeros: 0.2 });
console.log(`  fallo medio al buscar el strike objetivo: ${n2(metricas(ctrl.ops, 1).fallo)} puntos (rejilla de 5 → máximo posible 2,5)\n`);

console.log("| variante | días | $/año TODO | ES5 | objetivo | peor día | p1 | p5 | peor racha | TOPE | colateral máx |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const [nom, v] of corrida) {
  const m = metricas(v.ops, anosDe(v.ops));
  console.log(`| ${nom} | ${m.n} | ${eur(m.alAno)} | ${eur(m.es5)} | ${n2(m.objetivo)} | ${eur(m.peor)} | ${eur(m.p1)} | ${eur(m.p5)} | ${eur(m.dd)} | ${m.tope} | ${eur(m.colMax)} |`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n====== 11 · LA REGLA DE HIERRO · ajustar en uno, aplicar al otro ======\n`);
function elegir(cual) {
  let mejor = null;
  for (const [nom, v] of corrida) {
    if (nom.startsWith("±25")) continue;                 // la base no compite: es lo que hay
    const m = metricas(v[cual], anosDe(v[cual]));
    if (!m || m.n < 200) continue;
    if (!mejor || m.objetivo > mejor.m.objetivo) mejor = { nom, v, m };
  }
  return mejor;
}
for (const [ajuste, prueba, nomA, nomP] of [["A", "B", "2022-23", "2024-26"], ["B", "A", "2024-26", "2022-23"]]) {
  const g = elegir(ajuste);
  const mAj = g.m, mPr = metricas(g.v[prueba], anosDe(g.v[prueba]));
  const bAj = metricas(corrida.get(BASE.nom)[ajuste], anosDe(corrida.get(BASE.nom)[ajuste]));
  const bPr = metricas(corrida.get(BASE.nom)[prueba], anosDe(corrida.get(BASE.nom)[prueba]));
  console.log(`\n── AJUSTADO EN ${nomA} · elegido: ${g.nom} (objetivo ${n2(mAj.objetivo)}) ──`);
  console.log(`| ${" ".padEnd(26)} | días | $/año | ES5 | objetivo | peor día | p1 | p5 | peor racha | TOPE |`);
  console.log("|---|---|---|---|---|---|---|---|---|---|");
  const fila = (et, m) => console.log(`| ${et.padEnd(26)} | ${m.n} | ${eur(m.alAno)} | ${eur(m.es5)} | ${n2(m.objetivo)} | ${eur(m.peor)} | ${eur(m.p1)} | ${eur(m.p5)} | ${eur(m.dd)} | ${m.tope} |`);
  fila(`AJUSTE ${nomA} · elegido`, mAj);
  fila(`AJUSTE ${nomA} · base ±25/50`, bAj);
  fila(`PRUEBA ${nomP} · elegido`, mPr);
  fila(`PRUEBA ${nomP} · base ±25/50`, bPr);
  const dIng = mPr.alAno - bPr.alAno, dDD = mPr.dd - bPr.dd, dES = mPr.es5 - bPr.es5;
  console.log(`\n  FUERA DE MUESTRA en ${nomP}: ingreso ${dIng >= 0 ? "+" : ""}${eur(dIng)}/año · peor racha ${dDD >= 0 ? "mejora " : "empeora "}${eur(Math.abs(dDD))} · ES5 ${dES <= 0 ? "mejora " : "empeora "}${eur(Math.abs(dES))}`);
  if (dDD > 0 && dIng < 0) console.log(`  MÉTRICA QUE DECIDE: ${n2(-dIng / dDD)} dólares de ingreso al año por cada dólar de caída eliminado`);
  else if (dDD > 0 && dIng >= 0) console.log(`  MÉTRICA QUE DECIDE: 0 — quita caída y ADEMÁS da más ingreso`);
  else console.log(`  MÉTRICA QUE DECIDE: no aplica — no elimina caída (${eur(dDD)})`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n====== 12 · ¿AGUANTA EL CRUCE EN LAS DOS DIRECCIONES? — el veredicto ======\n`);
console.log("| variante | 22-23 $/año | 22-23 objetivo | 24-26 $/año | 24-26 objetivo | mismo signo de mejora | t (pl var vs base) |");
console.log("|---|---|---|---|---|---|---|");
const baseA = metricas(corrida.get(BASE.nom).A, anosDe(corrida.get(BASE.nom).A));
const baseB = metricas(corrida.get(BASE.nom).B, anosDe(corrida.get(BASE.nom).B));
const plBase = new Map(corrida.get(BASE.nom).ops.map((o) => [o.fecha, o.pl]));
for (const [nom, v] of corrida) {
  const mA = metricas(v.A, anosDe(v.A)), mB = metricas(v.B, anosDe(v.B));
  if (!mA || !mB) continue;
  const dif = v.ops.filter((o) => plBase.has(o.fecha)).map((o) => o.pl - plBase.get(o.fecha));
  const m = media(dif), sdv = Math.sqrt(dif.reduce((a, x) => a + (x - m) ** 2, 0) / (dif.length - 1));
  const t = sdv > 0 ? m / (sdv / Math.sqrt(dif.length)) : 0;
  const mismoSigno = Math.sign(mA.objetivo - baseA.objetivo) === Math.sign(mB.objetivo - baseB.objetivo);
  console.log(`| ${nom} | ${eur(mA.alAno)} | ${n2(mA.objetivo)} | ${eur(mB.alAno)} | ${n2(mB.objetivo)} | ${mismoSigno ? "**SÍ**" : "no"} | ${n2(t)} |`);
}
console.log(`\n  listón de |t| con ${PRUEBAS} pruebas: ${LISTON}`);
