// ═══════════════════════════════════════════════════════════════════════════════════════════
//  EVA COMO TERMÓMETRO DE MOVIMIENTO (no de dirección)
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// QUÉ MIDE Y POR QUÉ EXISTE
//
// En la memoria del proyecto está escrito: «EVA acierta el DÍA, no el LADO». Se archivó como
// fracaso porque entonces se vendían spreads direccionales, y sin el lado no servía de nada.
// Pero el que COMPRA convexidad (una call y una put sueltas, pérdida acotada a la prima) no
// necesita el lado: sólo necesita saber qué días se mueve el subyacente. Si EVA de verdad
// acierta el día, tiene que verse aquí.
//
// El envase está fijado de antes y NO se toca:
//    ENVASE A · 10% fuera del dinero · vencimiento a ~60 días · vender a los 30 días de bolsa
//    ENVASE B ·  5% fuera del dinero · vencimiento a ~90 días · vender a los 30 días de bolsa
// Se compra al ASK real de la cadena de cierre, se vende al BID real. $1,000 por intento.
//    RATIO = dólares ganados / dólares perdidos.  El listón del envase A sin señal es 1.11.
//
// LAS DIEZ SEÑALES (todas se calculan con datos que ya existían ANTES de comprar)
//
//   EVA de verdad, reconstruida de las operaciones grandes reales (ThetaData, ≥ $1M de prima):
//     1. EVA_conviccion   — lib/flow.ts convictionScore(): horquilla + dominancia + fuerza de ejecución
//     2. EVA_agresividad  — lib/flow.ts aggressionScore(): qué parte del dinero entró contra la oferta
//     3. EVA_inusualidad  — la parte de lib/flow.ts unusualityScore() que NO necesita griegas
//                           (tamaño de la orden, plazo, una pata vs varias). Delta/theta/gamma
//                           exigirían Black-Scholes, que está prohibido: SE DICE, no se disimula.
//     4. EVA_compuesto    — las tres anteriores con los pesos de lib/scorecardEva.ts (30/10/20)
//
//   Termómetros que SÍ se pueden reconstruir de la cadena en los diez años completos:
//     5. implicito        — precio del straddle en el dinero ÷ subyacente: lo que cuesta el movimiento
//     6. realizado20      — cuánto se ha movido de verdad en las últimas 20 sesiones
//     7. realMenosImp     — se mueve más de lo que cuesta (el clásico: realizado por encima de implícito)
//     8. cambioImplicito  — el implícito de hoy contra su media de 20 sesiones: ¿se está inflando?
//     9. volumenSubyace   — volumen de acciones de hoy contra su media de 20 sesiones
//    10. oiPutShare       — reparto del interés abierto entre puts y calls fuera del dinero
//
// CÓMO SE PARTE EN CINCO MONTONES
// El valor de hoy se compara con LOS 252 VALORES ANTERIORES DEL MISMO TICKER — ventana que
// termina el día ANTES. Nunca con toda la historia: un percentil calculado con el futuro ya
// convirtió una señal de este proyecto en un selector de ganadoras conocidas.
//
// EL BARAJADO
// Cada montón se repite con el mismo valor de señal pero pegado al día equivocado: se usa el
// montón de 37 sesiones antes (desplazamiento fijo, nada de Math.random). Si el barajado da lo
// mismo, no hay señal.
//
// LAS REGLAS DE LA CASA
//   · se compra al ASK y se vende al BID, nunca a punto medio
//   · ningún modelo de precios: el implícito es el precio real del straddle, no una IV ajustada
//   · un hueco no es un cero: si falta la cadena del día de salida, la operación se descarta y
//     se cuenta aparte. Si la cadena está y el contrato no aparece, es que no tiene puja: vale 0
//   · sólo el pasado: toda ventana histórica termina el día anterior al de la compra
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/y6-eva-como-termometro.mjs
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, existsSync } from "node:fs";
import {
  convictionScore, aggressionScore, executionLevel,
  orderSizeScore, expiryScore, legScore,
} from "../lib/flow.ts";
// NOTA: convictionScore() y aggressionScore() redondean su nota a un entero de 0 a 10. Para
// partir en cinco montones eso es un problema real: con notas enteras, media muestra empata y
// los montones salen de 22 y de 364. Se usan los MISMOS ingredientes sin el redondeo final
// (.spread.points, .dominance.points, .execution.avgRaw y .ratio), que es la misma fórmula.
import { isMultiLegCondition, isCanceledCondition } from "../lib/conditions.ts";
import { EVA_WEIGHTS } from "../lib/scorecardEva.ts";

const CDIR = "scripts/cache-theta/cadenas";
const OIDIR = "scripts/cache-theta/oi-ancho";
const VOLDIR = "scripts/cache-theta/volumen";
const FLUJODIR = "scripts/cache-theta/flujo-historico";

const APUESTA = 1000;
const TOLK = 0.50;      // cuánto puede apartarse el strike disponible de la distancia pedida
const ASKMIN = 0.10;    // el mismo suelo de prima con el que se midió el envase
const SALIDA = 30;      // días de bolsa que se aguanta
const VENTANA = 252;    // sesiones anteriores contra las que se ranquea el valor de hoy
const MINVENT = 100;    // mínimo de valores anteriores para poder ranquear
// EL BARAJADO, con DOS desplazamientos fijos (nada de Math.random).
//  · 37 sesiones  — el barajado corto
//  · 250 sesiones — el barajado largo. Hace falta porque hay señales muy lentas (el implícito de
//    hoy se parece mucho al de hace dos meses): con desplazamiento corto el "control" acaba
//    siendo casi la misma señal y no controla nada.
const LAGS = [37, 250];
const SALTO_SPLIT = 0.35; // un salto de spot mayor que esto es un split, no un movimiento

const ENVASES = [
  { id: "A", dist: 0.10, dte: 60 },
  { id: "B", dist: 0.05, dte: 90 },
];
const SENALES = [
  "EVA_conviccion", "EVA_agresividad", "EVA_inusualidad", "EVA_compuesto",
  "implicito", "realizado20", "realMenosImp", "cambioImplicito", "volumenSubyace", "oiPutShare",
];
const NMONTONES = 5;

const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) + "%" : "  n/d");
const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
const num = (n) => Math.round(n).toLocaleString("en-US");
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86400000);
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const tolDte = (d) => Math.max(6, Math.round(d * 0.28));

// ── índice de días por ticker ──────────────────────────────────────────────────────────────
const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();
let TICKERS = [...diasPorSim.keys()].sort();
if (process.env.SOLO) TICKERS = TICKERS.filter((t) => process.env.SOLO.split(",").includes(t));
const TOTDIAS = [...diasPorSim.values()].reduce((a, v) => a + v.length, 0);

console.log(`\n${"═".repeat(102)}`);
console.log("  EVA COMO TERMÓMETRO DE MOVIMIENTO — ¿los días de convicción alta se mueven más?");
console.log(`${"═".repeat(102)}`);
console.log(`  ${TICKERS.length} tickers · ${num(TOTDIAS)} días de cadena`);
console.log(`  ${SENALES.length} señales × ${ENVASES.length} envases = ${SENALES.length * ENVASES.length} escaleras de ${NMONTONES} montones`);
console.log(`  (${SENALES.length * ENVASES.length * NMONTONES} casillas medidas, más otras tantas barajadas como control)\n`);

// ═══════════════════════════════════════════════════════════════════════════════════════════
//  1. EVA — puntuación por ticker-día, reconstruida de las operaciones grandes reales
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// El fichero de flujo guarda TODAS las operaciones de ≥ $1M de prima del día, con su bid y su
// ask del momento (NBBO consolidado, ya verificado en este proyecto). De ahí salen tres de las
// seis categorías del scorecard. Las otras tres no se pueden y se dice cuáles:
//   · IV/griegas de Inusualidad → habría que invertir una IV que no está en el flujo
//   · Estructura  → necesita el OI de la cadena entera en el instante del print
//   · Confirmación→ usa barras POSTERIORES: sería mirar al futuro
const evaPorDia = new Map();      // "TICKER|AAAAMMDD" -> {conv, agr, inus, comp}
let flujoDias = 0, flujoPrints = 0, flujoSinBBO = 0, flujoCancel = 0;

if (existsSync(FLUJODIR)) {
  for (const f of readdirSync(FLUJODIR)) {
    const m = f.match(/^([A-Z]+)_(\d{8})\.json$/);
    if (!m) continue;
    let j;
    try { j = JSON.parse(readFileSync(`${FLUJODIR}/${f}`, "utf8")); } catch { continue; }
    const notables = j.notables || [];
    if (!notables.length) continue;

    // repeticiones del mismo contrato en el día (entrada de la tabla de inusualidad)
    const veces = new Map();
    for (const n of notables) {
      const k = `${n.exp}|${n.strike}|${n.right}`;
      veces.set(k, (veces.get(k) ?? 0) + 1);
    }

    const filas = [];
    let inusPeso = 0, inusSuma = 0;
    for (const n of notables) {
      if (isCanceledCondition(n.condition)) { flujoCancel++; continue; }
      const bid = n.bid, ask = n.ask, precio = n.price, prima = n.prima;
      if (!(prima > 0)) continue;
      flujoPrints++;
      if (!(bid > 0) || !(ask > 0) || ask < bid) flujoSinBBO++;
      const nivel = (bid > 0 && ask > 0 && ask >= bid) ? executionLevel(precio, bid, ask, "unclear") : "unclear";
      const agr = nivel === "above_ask" || nivel === "at_ask" ? "ask"
        : nivel === "below_bid" || nivel === "at_bid" ? "bid"
        : nivel === "mid" ? "mid" : "unknown";
      filas.push({ price: precio, bid: bid > 0 ? bid : 0, ask: ask > 0 ? ask : 0, premium: prima, side: "unclear", aggression: agr });

      // Inusualidad SIN griegas: tamaño de orden, plazo y una-pata-vs-varias. 3 de los 6
      // parámetros de la tabla. Ponderado por prima, igual que unusualityScore().
      const dte = dteDe(m[2], String(n.exp).replace(/-/g, ""));
      const parcial = (orderSizeScore(prima) + expiryScore(Number.isFinite(dte) ? dte : null) + legScore(isMultiLegCondition(n.condition))) / 3;
      inusSuma += parcial * prima;
      inusPeso += prima;
    }
    if (!filas.length) continue;

    const cv = convictionScore(filas);
    const ag = aggressionScore(filas);
    const conv = (cv.spread.points + cv.dominance.points + cv.execution.avgRaw) / 3;  // 0-10 sin redondear
    const agr = ag.ratio * 10;                                                        // 0-10 sin redondear
    const inus = inusPeso > 0 ? inusSuma / inusPeso : 0;     // 0-10
    const usados = EVA_WEIGHTS.conviction + EVA_WEIGHTS.aggression + EVA_WEIGHTS.unusuality;
    const comp = (conv * EVA_WEIGHTS.conviction + agr * EVA_WEIGHTS.aggression + inus * EVA_WEIGHTS.unusuality) / usados;
    evaPorDia.set(`${m[1]}|${m[2]}`, { conv, agr, inus, comp });
    flujoDias++;
  }
}
const tickersFlujo = [...new Set([...evaPorDia.keys()].map((k) => k.split("|")[0]))].sort();
const diasFlujo = [...new Set([...evaPorDia.keys()].map((k) => k.split("|")[1]))].sort();
console.log(`  EVA reconstruida: ${num(flujoDias)} ticker-días · ${num(flujoPrints)} operaciones de ≥$1M`);
console.log(`     tickers con flujo: ${tickersFlujo.join(", ")}`);
console.log(`     desde ${diasFlujo[0] ?? "—"} hasta ${diasFlujo[diasFlujo.length - 1] ?? "—"}`);
console.log(`     prints sin bid/ask utilizable: ${num(flujoSinBBO)} (${pct(flujoSinBBO / Math.max(1, flujoPrints))}) · anuladas descartadas: ${flujoCancel}`);
if (flujoDias === 0) { console.log("\n  ⛔ NO HAY FLUJO EN DISCO. Sin él las cuatro señales de EVA no se pueden medir.\n"); }

// ── volumen del subyacente (acciones) ──────────────────────────────────────────────────────
const volPorTicker = new Map();
if (existsSync(VOLDIR)) {
  for (const f of readdirSync(VOLDIR)) {
    const m = f.match(/^([A-Z]+)\.json$/);
    if (!m) continue;
    try { volPorTicker.set(m[1], JSON.parse(readFileSync(`${VOLDIR}/${f}`, "utf8"))); } catch {}
  }
}
console.log(`  volumen de acciones en disco: ${volPorTicker.size} tickers`);
console.log(`  interés abierto en disco    : ${existsSync(OIDIR) ? readdirSync(OIDIR).length.toLocaleString("en-US") + " ficheros" : "NO"}\n`);

// ═══════════════════════════════════════════════════════════════════════════════════════════
//  2. Acumuladores
// ═══════════════════════════════════════════════════════════════════════════════════════════
const acc = () => ({ n: 0, win: 0, gan: 0, per: 0, max: 0 });
const suma = (a, d) => { a.n++; if (d > 0) { a.win++; a.gan += d; if (d > a.max) a.max = d; } else a.per += -d; };
const ratio = (a) => (a.per > 0 ? a.gan / a.per : (a.gan > 0 ? Infinity : NaN));
const acierto = (a) => (a.n ? a.win / a.n : NaN);

const cajas = new Map();
function caja(k) {
  let c = cajas.get(k);
  if (!c) { c = { T: acc(), anos: new Map(), tks: new Map(), sin2020: acc(), sumCoste: 0, sinValor: 0, trunc: 0, nC: 0, nP: 0, fechas: new Set() }; cajas.set(k, c); }
  return c;
}
function anota(k, o) {
  const c = caja(k);
  const d = APUESTA * o.ret;
  suma(c.T, d);
  c.sumCoste += o.coste; if (o.salida === 0) c.sinValor++; if (o.trunc) c.trunc++;
  if (o.tipo === "C") c.nC++; else c.nP++;
  c.fechas.add(o.dia);
  const y = o.dia.slice(0, 4);
  if (!c.anos.has(y)) c.anos.set(y, acc());
  suma(c.anos.get(y), d);
  if (!c.tks.has(o.sym)) c.tks.set(o.sym, acc());
  suma(c.tks.get(o.sym), d);
  const mes = o.dia.slice(0, 6);
  if (!(mes >= "202002" && mes <= "202005")) suma(c.sin2020, d);
}

let entradasDia = 0, sinSpot = 0, sinContrato = 0, huecos = 0, ops = 0, splitSospecha = 0;
const t0 = Date.now();

// ── EL TERMÓMETRO, MEDIDO SIN OPCIONES DE POR MEDIO ────────────────────────────────────────
// Antes de culpar a la señal hay que separar dos cosas muy distintas:
//   (a) la señal NO sabe qué días se mueve el subyacente → el termómetro está roto
//   (b) la señal SÍ lo sabe, pero la opción ya cobra ese movimiento por adelantado → el
//       termómetro funciona y aun así no se puede cobrar
// Esto se mide sobre el subyacente puro: cuánto se movió de verdad en las 30 sesiones
// siguientes, y cuánto costaba ese día el straddle en el dinero (el precio real del movimiento).
const termo = new Map();   // "senal|monton" -> {n, sumMov, sumCoste, pasa10}
function anotaTermo(k, mov, coste) {
  let t = termo.get(k);
  if (!t) { t = { n: 0, sumMov: 0, sumCoste: 0, pasa10: 0, conCoste: 0 }; termo.set(k, t); }
  t.n++; t.sumMov += mov; if (mov >= 0.10) t.pasa10++;
  if (Number.isFinite(coste)) { t.sumCoste += coste; t.conCoste++; }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
//  3. El barrido, ticker por ticker, una sola pasada por cada fichero de cadena
// ═══════════════════════════════════════════════════════════════════════════════════════════
function spotOk(c, hoy) {
  let exp = null, md = Infinity;
  for (const e of Object.keys(c)) { const d = dteDe(hoy, e); if (d < 1) continue; if (d < md) { md = d; exp = e; } }
  if (!exp) return null;
  const g = c[exp];
  let K = null, dm = Infinity;
  for (const cl of Object.keys(g)) {
    if (cl.slice(-1) !== "C") continue;
    const k = Number(cl.slice(0, -2)); const p = g[`${k}|P`]; if (!p) continue;
    const ba = g[cl];
    const d = Math.abs((ba[0] + ba[1]) / 2 - (p[0] + p[1]) / 2);
    if (d < dm) { dm = d; K = k; }
  }
  if (K == null) return null;
  const C = g[`${K}|C`], P = g[`${K}|P`];
  const s = K + (C[0] + C[1]) / 2 - (P[0] + P[1]) / 2;
  return s > 0 ? s : null;
}
function expCerca(c, hoy, obj) {
  let mejor = null, md = Infinity;
  for (const e of Object.keys(c)) { const dt = dteDe(hoy, e); if (dt < 1) continue; const x = Math.abs(dt - obj); if (x < md) { md = x; mejor = e; } }
  return md <= tolDte(obj) ? mejor : null;
}
/** Straddle en el dinero, a precio real: (mid call + mid put) / subyacente. Sin modelo. */
function straddle(c, exp, S) {
  const g = c[exp]; if (!g) return null;
  let K = null, dm = Infinity;
  for (const cl of Object.keys(g)) {
    if (cl.slice(-1) !== "C") continue;
    const k = Number(cl.slice(0, -2));
    if (!g[`${k}|P`]) continue;
    const d = Math.abs(k - S);
    if (d < dm) { dm = d; K = k; }
  }
  if (K == null || dm > S * 0.05) return null;
  const C = g[`${K}|C`], P = g[`${K}|P`];
  if (!(C[1] > 0) || !(P[1] > 0)) return null;
  return ((C[0] + C[1]) / 2 + (P[0] + P[1]) / 2) / S;
}
/** Mejor strike a `dist` fuera del dinero dentro de una expiración concreta. */
function esquina(g, S, dist, tipo) {
  const obj = tipo === "C" ? S * (1 + dist) : S * (1 - dist);
  let mej = null, dd = Infinity;
  for (const cl of Object.keys(g)) {
    if (cl.slice(-1) !== tipo) continue;
    const K = Number(cl.slice(0, -2));
    const ba = g[cl];
    if (!(ba[1] >= ASKMIN)) continue;
    const d = Math.abs(K - obj);
    if (d < dd) { dd = d; mej = { K, clave: cl, bid: ba[0], ask: ba[1] }; }
  }
  if (!mej) return null;
  const distReal = tipo === "C" ? mej.K / S - 1 : 1 - mej.K / S;
  if (Math.abs(distReal - dist) > dist * TOLK) return null;
  return mej;
}
/**
 * Percentil del valor de hoy dentro de la ventana ANTERIOR (NO incluye hoy: la ventana termina
 * ayer). Los empates se reparten a medias, que si no una nota repetida amontona media muestra
 * en un solo montón.
 */
function rango(hist, v) {
  if (!Number.isFinite(v)) return null;
  const w = hist.length > VENTANA ? hist.slice(hist.length - VENTANA) : hist;
  if (w.length < MINVENT) return null;
  let menores = 0, iguales = 0;
  for (const x of w) { if (x < v) menores++; else if (x === v) iguales++; }
  return (menores + iguales / 2) / w.length;
}
const monton = (r) => (r == null ? null : Math.min(NMONTONES - 1, Math.floor(r * NMONTONES)));

for (const sym of TICKERS) {
  const dias = diasPorSim.get(sym);
  const N = dias.length;
  const S = new Array(N).fill(null);
  const IMP = new Array(N).fill(null);
  const porSalir = new Map();   // índice de salida -> [operaciones]
  const rangos = {};            // señal -> array de percentiles por índice
  for (const s of SENALES) rangos[s] = new Array(N).fill(null);
  const hist = {};              // señal -> valores crudos anteriores
  for (const s of SENALES) hist[s] = [];
  const retornos = [];          // retornos diarios del subyacente, ya limpios de splits
  const volTk = volPorTicker.get(sym) || null;
  const mesesVistos = new Set();

  for (let i = 0; i < N; i++) {
    const dia = dias[i];
    let cad = null;
    try { cad = JSON.parse(readFileSync(`${CDIR}/${sym}_d${dia}.json`, "utf8")); } catch { cad = null; }

    // ── A. resolver las salidas que vencían hoy ────────────────────────────────────────────
    const salen = porSalir.get(i);
    if (salen) {
      for (const o of salen) {
        if (!cad) { huecos++; continue; }
        const g = cad[o.exp];
        if (!g) { huecos++; continue; }
        const salida = g[o.clave]?.[0] ?? 0;   // sin puja = 0. Dato real.
        ops++;
        const ret = (salida - o.ask) / o.ask;
        const base = { sym, dia: o.dia, tipo: o.tipo, ret, salida, coste: o.coste, trunc: o.trunc };
        anota(`${o.env}|TODO`, base);
        if (o.mensual) anota(`${o.env}|MENSUAL`, base);
        for (const s of SENALES) {
          if (o.m[s] != null) { anota(`${o.env}|${s}|${o.m[s]}`, base); anota(`${o.env}|${s}|TODOS`, base); }
          for (const L of LAGS) if (o.mb[s] && o.mb[s][L] != null) anota(`${o.env}|${s}|BAR${L}_${o.mb[s][L]}`, base);
        }
      }
      porSalir.delete(i);
    }
    if (!cad) continue;

    // ── B. subyacente por paridad, SÓLO en el vencimiento más cercano ──────────────────────
    const sp = spotOk(cad, dia);
    if (!sp) { sinSpot++; continue; }
    S[i] = sp;
    entradasDia++;

    // retorno diario limpio (un salto enorme es un split, no un movimiento)
    let prev = null;
    for (let j = i - 1; j >= 0 && j >= i - 6; j--) if (S[j] != null) { prev = S[j]; break; }
    if (prev != null) {
      const r = sp / prev - 1;
      if (Math.abs(r) > SALTO_SPLIT) splitSospecha++;
      else retornos.push(r);
    }

    const expA = expCerca(cad, dia, 60);
    const expB = expCerca(cad, dia, 90);
    const imp = expA ? straddle(cad, expA, sp) : null;
    IMP[i] = imp;

    // ── C. valores de las diez señales, HOY ────────────────────────────────────────────────
    const ev = evaPorDia.get(`${sym}|${dia}`) || null;
    const rv = retornos.length >= 20 ? sd(retornos.slice(-20)) : null;
    const impPrev = hist.implicito;
    const cambio = (imp != null && impPrev.length >= 20) ? imp / media(impPrev.slice(-20)) : null;
    let volInus = null;
    if (volTk && volTk[dia] > 0) {
      const ant = [];
      for (let j = i - 1; j >= 0 && ant.length < 20; j--) { const v = volTk[dias[j]]; if (v > 0) ant.push(v); }
      if (ant.length === 20) volInus = volTk[dia] / media(ant);
    }
    let putShare = null;
    try {
      const oi = JSON.parse(readFileSync(`${OIDIR}/${sym}_d${dia}.json`, "utf8"));
      let cOI = 0, pOI = 0;
      for (const g of Object.values(oi)) for (const [cl, v] of Object.entries(g)) { if (cl.slice(-1) === "P") pOI += v; else cOI += v; }
      if (cOI + pOI > 0) putShare = pOI / (cOI + pOI);
    } catch {}

    const crudos = {
      EVA_conviccion: ev ? ev.conv : null,
      EVA_agresividad: ev ? ev.agr : null,
      EVA_inusualidad: ev ? ev.inus : null,
      EVA_compuesto: ev ? ev.comp : null,
      implicito: imp,
      realizado20: rv,
      realMenosImp: null,   // se rellena abajo, necesita los dos rangos
      cambioImplicito: cambio,
      volumenSubyace: volInus,
      oiPutShare: putShare,
    };

    // percentil contra la ventana ANTERIOR (la ventana termina ayer)
    const rImp = rango(hist.implicito, imp);
    const rRv = rango(hist.realizado20, rv);
    crudos.realMenosImp = (rImp != null && rRv != null) ? rRv - rImp : null;

    const mHoy = {}, mLag = {};
    for (const s of SENALES) {
      const r = rango(hist[s], crudos[s]);
      rangos[s][i] = r;
      mHoy[s] = monton(r);
      // barajado: el montón de hace L sesiones, pegado al día de hoy
      mLag[s] = {};
      for (const L of LAGS) {
        let k = i - 1, saltos = 0, rl = null;
        while (k >= 0 && saltos < L) { if (rangos[s][k] != null) { saltos++; rl = rangos[s][k]; } k--; }
        mLag[s][L] = saltos === L ? monton(rl) : null;
      }
      if (Number.isFinite(crudos[s])) hist[s].push(crudos[s]);
    }

    // ── D. abrir las operaciones del día, en los dos envases ───────────────────────────────
    const iSal = i + SALIDA;
    if (iSal >= N) continue;
    const mes = dia.slice(0, 6);
    const esMensual = !mesesVistos.has(mes);
    if (esMensual) mesesVistos.add(mes);

    for (const env of ENVASES) {
      const exp = env.id === "A" ? expA : expB;
      if (!exp) { sinContrato += 2; continue; }
      let dSal = dias[iSal], trunc = 0;
      if (dSal >= exp) { trunc = 1; }
      for (const tipo of ["C", "P"]) {
        const ct = esquina(cad[exp], sp, env.dist, tipo);
        if (!ct) { sinContrato++; continue; }
        const o = {
          env: env.id, sym, dia, tipo, exp, clave: ct.clave, ask: ct.ask,
          coste: ct.ask / sp, trunc, mensual: esMensual, m: mHoy, mb: mLag,
        };
        // Si la salida cae más allá del vencimiento, se sale EN el vencimiento.
        let idx = iSal;
        if (trunc) { idx = dias.indexOf(exp, i + 1); if (idx < 0) { huecos++; continue; } }
        if (!porSalir.has(idx)) porSalir.set(idx, []);
        porSalir.get(idx).push(o);
      }
    }
  }
  // ── el termómetro sobre el subyacente puro, ya con toda la serie del ticker en la mano ────
  for (let i = 0; i + SALIDA < N; i++) {
    if (S[i] == null || S[i + SALIDA] == null) continue;
    const mov = Math.abs(S[i + SALIDA] / S[i] - 1);
    if (mov > SALTO_SPLIT) continue;              // split de por medio: no es movimiento
    anotaTermo("TODO|0", mov, IMP[i]);
    for (const s of SENALES) {
      const b = monton(rangos[s][i]);
      if (b != null) { anotaTermo(`${s}|${b}`, mov, IMP[i]); anotaTermo(`${s}|T`, mov, IMP[i]); }
    }
  }
  // las que quedaron sin día de salida dentro del rango son huecos
  for (const v of porSalir.values()) huecos += v.length;
  process.stderr.write(`\r   ${sym} · ${num(ops)} operaciones · ${Math.round((Date.now() - t0) / 1000)}s      `);
}
process.stderr.write("\n");

// ═══════════════════════════════════════════════════════════════════════════════════════════
//  4. SANIDAD — antes de mirar ningún resultado
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(102)}`);
console.log("  SANIDAD");
console.log(`${"═".repeat(102)}`);
console.log(`  días con cadena y subyacente deducible : ${num(entradasDia)}`);
console.log(`  días descartados por no poder deducir el subyacente: ${num(sinSpot)}`);
console.log(`  combinaciones sin contrato que encaje  : ${num(sinContrato)}`);
console.log(`  OPERACIONES medidas                    : ${num(ops)}`);
console.log(`  HUECOS descartados (falta la cadena o el vencimiento el día de salida): ${num(huecos)} (${pct(huecos / (huecos + ops))})`);
console.log(`  saltos de subyacente > ${pct(SALTO_SPLIT)} tratados como split y excluidos del cálculo de movimiento: ${num(splitSospecha)}`);
for (const env of ENVASES) {
  const c = caja(`${env.id}|TODO`);
  if (!c.T.n) continue;
  console.log(`\n  ENVASE ${env.id} (${pct(env.dist)} fuera · ${env.dte} días · salir a los ${SALIDA} de bolsa), entrando TODOS los días:`);
  console.log(`    n=${num(c.T.n)} (${num(c.nC)} calls / ${num(c.nP)} puts) · RATIO ${ratio(c.T).toFixed(2)} · acierta ${pct(acierto(c.T))}`);
  console.log(`    coste medio de entrada = ${pct(c.sumCoste / c.T.n)} del subyacente · vencen sin valor ${pct(c.sinValor / c.T.n)}`);
  console.log(`    ganador medio ${usd(c.T.gan / Math.max(1, c.T.win))} · perdedor medio ${usd(c.T.per / Math.max(1, c.T.n - c.T.win))}`);
  console.log(`    salidas que llegaron al vencimiento antes que al día 30: ${pct(c.trunc / c.T.n)}`);
  const m = caja(`${env.id}|MENSUAL`);
  console.log(`    [control] entrando UNA VEZ AL MES por ticker, como se midió el envase: n=${num(m.T.n)} · RATIO ${ratio(m.T).toFixed(2)} · acierta ${pct(acierto(m.T))}`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
//  5. LAS ESCALERAS
// ═══════════════════════════════════════════════════════════════════════════════════════════
const ANOS = [...new Set([...cajas.values()].flatMap((c) => [...c.anos.keys()]))].sort();
const CRISIS = ["2018", "2020", "2022", "2025"];

function anosData(c) {
  const out = [];
  for (const a of ANOS) { const v = c.anos.get(a); if (v && v.n >= 20) out.push({ a, r: ratio(v), n: v.n, ac: acierto(v) }); }
  return out;
}
function mitadDelDinero(c) {
  const tks = [...c.tks.entries()].map(([k, v]) => ({ k, gan: v.gan })).sort((a, b) => b.gan - a.gan);
  let ac = 0, cuantos = 0;
  for (const t of tks) { if (t.gan <= 0) break; ac += t.gan; cuantos++; if (ac >= c.T.gan / 2) break; }
  return { cuantos, total: tks.length };
}

const resumen = [];
for (const env of ENVASES) {
  const base = caja(`${env.id}|TODO`);
  console.log(`\n${"═".repeat(102)}`);
  console.log(`  ESCALERAS · ENVASE ${env.id} — sin señal: RATIO ${ratio(base.T).toFixed(2)} · acierta ${pct(acierto(base.T))} · n=${num(base.T.n)}`);
  console.log(`${"═".repeat(102)}`);
  for (const s of SENALES) {
    const filas = [];
    let hay = false;
    for (let b = 0; b < NMONTONES; b++) {
      const c = cajas.get(`${env.id}|${s}|${b}`);
      const cb = LAGS.map((L) => cajas.get(`${env.id}|${s}|BAR${L}_${b}`));
      if (c && c.T.n) hay = true;
      filas.push({ b, c, cb });
    }
    if (!hay) { console.log(`\n  ── ${s} — SIN MUESTRA`); continue; }
    // LA REFERENCIA CORRECTA de esta escalera son SUS PROPIAS operaciones sin ordenar, no el
    // envase entero: la señal sólo existe en algunos tickers y algunos años.
    const propio = caja(`${env.id}|${s}|TODOS`);
    console.log(`\n  ── ${s} — sus mismas operaciones SIN ordenar: n=${num(propio.T.n)} · RATIO ${ratio(propio.T).toFixed(2)} · acierta ${pct(acierto(propio.T))}`);
    console.log(`  | montón | n | RATIO | acierta | ganador medio | perdedor medio | barajado 37 | barajado 250 |`);
    console.log(`  |---|---|---|---|---|---|---|---|`);
    for (const f of filas) {
      if (!f.c || !f.c.T.n) { console.log(`  | ${f.b + 1} de ${NMONTONES} | — | — | — | — | — | — | — |`); continue; }
      const t = f.c.T;
      const bar = f.cb.map((x) => (x && x.T.n ? ratio(x.T).toFixed(2) : "—"));
      console.log(`  | ${f.b + 1} de ${NMONTONES} | ${num(t.n)} | **${ratio(t).toFixed(2)}** | ${pct(acierto(t))} | ${usd(t.gan / Math.max(1, t.win))} | ${usd(t.per / Math.max(1, t.n - t.win))} | ${bar[0]} | ${bar[1]} |`);
    }
    const alto = filas[NMONTONES - 1].c, bajo = filas[0].c;
    if (alto?.T.n && bajo?.T.n) {
      console.log(`     montón más alto contra el más bajo: ${ratio(alto.T).toFixed(2)} vs ${ratio(bajo.T).toFixed(2)}` +
        ` · acierto ${pct(acierto(alto.T))} vs ${pct(acierto(bajo.T))} · y sin ordenar ${ratio(propio.T).toFixed(2)} / ${pct(acierto(propio.T))}`);
    }
    for (const f of filas) {
      if (!f.c || f.c.T.n < 300) continue;
      resumen.push({ env: env.id, senal: s, b: f.b, c: f.c, cb: f.cb, propio, r: ratio(f.c.T) });
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
//  6. EL EXAMEN — sólo lo que llega a 1.40 en el envase A merece que se mire de cerca
// ═══════════════════════════════════════════════════════════════════════════════════════════
const anosDelEnvase = (id) => anosData(caja(`${id}|TODO`));
console.log(`\n${"═".repeat(102)}`);
console.log("  LA REFERENCIA SIN SEÑAL, AÑO A AÑO");
console.log(`${"═".repeat(102)}`);
for (const env of ENVASES) {
  const c = caja(`${env.id}|TODO`);
  const ad = anosData(c);
  console.log(`  envase ${env.id}: ${ad.map((x) => `${x.a} ${x.r.toFixed(2)}`).join(" · ")}`);
  console.log(`     años por debajo de 1.00: ${ad.filter((x) => x.r < 1).length} de ${ad.length}` +
    ` · quitando feb-may de 2020: RATIO ${ratio(c.sin2020).toFixed(2)} (n=${num(c.sin2020.n)})`);
}

function examen(x) {
  const c = x.c;
  const anos = new Date(Math.max(...[...c.fechas].map((d) => ms(d)))).getFullYear() - new Date(Math.min(...[...c.fechas].map((d) => ms(d)))).getFullYear() + 1;
  const opsAno = c.T.n / Math.max(1, anos);
  const ad = anosData(c);
  const mal = ad.filter((y) => y.r < 1).length;
  const mm = mitadDelDinero(c);
  const cr = CRISIS.map((y) => { const v = c.anos.get(y); return { y, r: v && v.n >= 20 ? ratio(v) : null, n: v?.n ?? 0 }; });
  console.log(`\n${"─".repeat(102)}`);
  console.log(`  ${x.senal} · montón ${x.b + 1} de ${NMONTONES} · envase ${x.env}`);
  console.log(`  RATIO ${ratio(c.T).toFixed(2)} · acierta ${pct(acierto(c.T))} · n=${num(c.T.n)} · ${Math.round(opsAno)} operaciones al año (${anos} años)`);
  console.log(`  sus mismas operaciones SIN ordenar: RATIO ${ratio(x.propio.T).toFixed(2)} · acierta ${pct(acierto(x.propio.T))} · n=${num(x.propio.T.n)}`);
  console.log(`  barajado (mismo montón, día equivocado): ${LAGS.map((L, k) => `${L} sesiones → ${x.cb[k] && x.cb[k].T.n ? ratio(x.cb[k].T).toFixed(2) : "—"}`).join(" · ")}`);
  console.log(`  ganador medio ${usd(c.T.gan / Math.max(1, c.T.win))} · perdedor medio ${usd(c.T.per / Math.max(1, c.T.n - c.T.win))} · mayor billete ${usd(c.T.max)}`);
  console.log(`  RATIO quitando el mayor billete: ${((c.T.gan - c.T.max) / c.T.per).toFixed(2)}`);
  console.log(`  año a año: ${ad.map((y) => `${y.a} ${y.r.toFixed(2)}`).join(" · ")}`);
  console.log(`  años por debajo de 1.00: ${mal} de ${ad.length}`);
  console.log(`  crisis: ${cr.map((z) => `${z.y} ${z.r == null ? "n/d" : z.r.toFixed(2)}`).join(" · ")}`);
  console.log(`  sin febrero-mayo de 2020: RATIO ${ratio(c.sin2020).toFixed(2)} (n=${num(c.sin2020.n)})`);
  console.log(`  tickers que juntan la mitad de lo ganado: ${mm.cuantos} de ${mm.total}`);
  return { opsAno, mal, ad, mm, cr };
}

console.log(`\n${"═".repeat(102)}`);
console.log("  LAS CASILLAS QUE LLEGAN A 1.40 EN EL ENVASE A");
console.log(`${"═".repeat(102)}`);
const llegan = resumen.filter((x) => x.env === "A" && x.r >= 1.40).sort((a, b) => b.r - a.r);
if (!llegan.length) {
  console.log("  NINGUNA. El mejor montón del envase A se queda en " +
    resumen.filter((x) => x.env === "A").sort((a, b) => b.r - a.r).slice(0, 5).map((x) => `${x.senal}[${x.b + 1}] ${x.r.toFixed(2)}`).join(" · "));
} else {
  for (const x of llegan.slice(0, 6)) examen(x);
}

console.log(`\n${"═".repeat(102)}`);
console.log("  PODIO GENERAL (montones con n ≥ 300)");
console.log(`${"═".repeat(102)}`);
console.log(`  | envase | señal | montón | n | RATIO | acierta | sin ordenar | barajado 37 | barajado 250 |`);
console.log(`  |---|---|---|---|---|---|---|---|---|`);
for (const x of [...resumen].sort((a, b) => b.r - a.r).slice(0, 20)) {
  const bar = x.cb.map((z) => (z && z.T.n ? ratio(z.T).toFixed(2) : "—"));
  console.log(`  | ${x.env} | ${x.senal} | ${x.b + 1} | ${num(x.c.T.n)} | **${x.r.toFixed(2)}** | ${pct(acierto(x.c.T))} | ${ratio(x.propio.T).toFixed(2)} | ${bar[0]} | ${bar[1]} |`);
}

// el mejor de cada señal en el envase A, con su examen completo aunque no llegue a 1.40
console.log(`\n${"═".repeat(102)}`);
console.log("  EL MEJOR MONTÓN DE CADA SEÑAL — ENVASE A, con el examen entero");
console.log(`${"═".repeat(102)}`);
for (const s of SENALES) {
  const cands = resumen.filter((x) => x.env === "A" && x.senal === s);
  if (!cands.length) { console.log(`\n  ${s}: sin muestra suficiente`); continue; }
  examen(cands.sort((a, b) => b.r - a.r)[0]);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
//  7. ¿ESTÁ ROTO EL TERMÓMETRO, O ES QUE LA OPCIÓN YA COBRA EL MOVIMIENTO?
// ═══════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(102)}`);
console.log("  EL TERMÓMETRO SIN OPCIONES DE POR MEDIO — ¿saben estas señales qué días se mueve?");
console.log(`${"═".repeat(102)}`);
console.log("  Movimiento = |cambio del subyacente en las 30 sesiones siguientes|, en bruto.");
console.log("  El envase A necesita un 10% para entrar en dinero: por eso se cuenta esa columna.");
console.log("  El straddle en el dinero es lo que costaba ese día comprar el movimiento (precio real).\n");
{
  const g = termo.get("TODO|0");
  console.log(`  referencia, todos los días: n=${num(g.n)} · movimiento medio ${pct(g.sumMov / g.n)} · pasa del 10% el ${pct(g.pasa10 / g.n)} · straddle ${pct(g.sumCoste / g.conCoste)}`);
}
for (const s of SENALES) {
  const tot = termo.get(`${s}|T`);
  if (!tot || tot.n < 500) { console.log(`\n  ── ${s}: sin muestra`); continue; }
  console.log(`\n  ── ${s} (sus mismos días sin ordenar: movimiento ${pct(tot.sumMov / tot.n)} · pasa del 10% el ${pct(tot.pasa10 / tot.n)} · straddle ${pct(tot.sumCoste / tot.conCoste)})`);
  console.log(`  | montón | días | movimiento a 30 sesiones | pasa del 10% | straddle en el dinero | movimiento ÷ straddle |`);
  console.log(`  |---|---|---|---|---|---|`);
  for (let b = 0; b < NMONTONES; b++) {
    const t = termo.get(`${s}|${b}`);
    if (!t || !t.n) { console.log(`  | ${b + 1} de ${NMONTONES} | — | — | — | — | — |`); continue; }
    const mov = t.sumMov / t.n, cst = t.conCoste ? t.sumCoste / t.conCoste : NaN;
    console.log(`  | ${b + 1} de ${NMONTONES} | ${num(t.n)} | ${pct(mov)} | ${pct(t.pasa10 / t.n)} | ${pct(cst)} | ${(mov / cst).toFixed(2)} |`);
  }
}

console.log(`\n  minutos: ${((Date.now() - t0) / 60000).toFixed(1)}`);
console.log(`${"═".repeat(102)}\n`);
