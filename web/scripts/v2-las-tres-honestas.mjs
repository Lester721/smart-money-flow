// ══════════════════════════════════════════════════════════════════════════════════════════════
// V2 — LAS TRES SEÑALES, MEDIDAS HONESTAMENTE
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// Las tres señales (A la opción cara · B el ruido de ayer · C el frente caro) se midieron sobre
// un universo de UNA ENTRADA AL MES (siempre el primer día de bolsa) y contra un listón inflado
// de 1.11. Las dos cosas cambiaron:
//
//   1) EL LISTÓN HONESTO ES 0.95 (envase A) y 1.00 (envase B), medido sobre el universo DIARIO.
//   2) EL ENVASE NO COMPRABA EL PLAZO QUE DECÍA: "60 días" con tolerancia ±17 acababa comprando
//      49.5 días entrando el día 1 y 63.9 entrando a mitad de mes. El "efecto del día del mes"
//      era PLAZO y LIQUIDEZ, no mercado.
//
// Aquí se re-miden las tres:
//   · sobre el universo DIARIO (todas las sesiones de bolsa de los 28 tickers útiles)
//   · con el PLAZO FIJADO A UNA BANDA ESTRECHA: envase A sólo compra vencimientos de 55 a 65
//     días; envase B sólo de 85 a 95. Si ese día no hay ninguno en la banda, ESE DÍA NO SE OPERA
//     y se cuenta aparte. Así el plazo real no puede bailar con el calendario.
//   · contra el listón honesto, y además contra EL ENVASE VACÍO MEDIDO AQUÍ MISMO, en este mismo
//     universo y esta misma banda de plazo (el único listón que compara peras con peras).
//
// ─── EL ENVASE (fijado, no se toca) ───────────────────────────────────────────────────────────
//   A: 10% fuera del dinero · vencimiento de 55-65 días · vender a los 30 días de bolsa
//   B:  5% fuera del dinero · vencimiento de 85-95 días · vender a los 30 días de bolsa
//   Opción SUELTA (una pata). Se COMPRA AL ASK y se VENDE AL BID. $1,000 arriesgados por intento.
//   Call y put en cada entrada. Ask mínimo $0.10.
//
// ─── LAS TRES SEÑALES ─────────────────────────────────────────────────────────────────────────
//
// A · LA OPCIÓN CARA
//     cuña = (ask de la call al dinero + ask de la put al dinero) / precio, DEL MISMO VENCIMIENTO
//     que se va a comprar. movimiento = desviación de los retornos diarios de los últimos 60 días
//     × raíz(días de bolsa hasta el vencimiento). cociente = cuña / movimiento.
//     Percentil del cociente contra los 250 días anteriores del MISMO ticker (ventana que TERMINA
//     EL DÍA ANTES). Se compra por encima del percentil 80.
//
// B · EL RUIDO DE AYER
//     El movimiento del subyacente de AYER (de anteayer a ayer; nunca el de hoy). Se prueban
//     umbrales absolutos de 1% / 1.5% / 2% / 3% y la versión RELATIVA (el movimiento de ayer en
//     el quinto más alto de su propia historia de 250 días).
//     Y se mide el ratio POR DÍA DE LA SEMANA y POR DÍA DEL MES: si vuelve a haber un día que
//     manda, es el calendario otra vez.
//
// C · EL FRENTE CARO RESPECTO AL FONDO
//     Vencimiento más cercano a 30 días (±10) y más cercano a 180 (±45). En cada uno,
//     sigma = (cuña al dinero A PUNTO MEDIO / precio) / raíz(días/365). cociente = sigma30/sigma180.
//     SU PEGA ERA EL UMBRAL: un corte fijo compraba el 14.0% de los días en 2023 y el 49.1% en
//     2020. ARREGLO: percentil móvil del propio ticker contra sus 250 días anteriores, así compra
//     SIEMPRE la misma fracción de días. Se imprime la fracción por año para comprobar el arreglo.
//     (La cuña de C va a punto medio porque es una LECTURA, no una operación; el dinero sigue
//     entrando al ask y saliendo al bid.)
//
// ─── LAS REGLAS DE LA CASA ────────────────────────────────────────────────────────────────────
//   1. Se COMPRA al ASK y se VENDE al BID. Nunca punto medio para el dinero.
//   2. Ningún modelo de precios. Todo sale de precios que existen en la cadena. Black-Scholes ni
//      aparece.
//   3. Un HUECO no es un cero: falta la cadena del día de salida o el vencimiento entero dentro
//      de ella → la operación SE DESCARTA y se cuenta aparte. La cadena está y el contrato no
//      aparece → no tiene puja: vale 0, y eso es un dato real.
//   4. SÓLO EL PASADO. Toda ventana termina el día ANTERIOR al de la compra.
//   5. Se avisa de cuántas combinaciones se midieron.
//
// ─── EL PRECIO DEL SUBYACENTE ─────────────────────────────────────────────────────────────────
//   Paridad put-call SÓLO EN EL VENCIMIENTO MÁS CERCANO. Se reutiliza la serie ya validada de
//   w1/y9 (scripts/cache-theta/_y9-spots.json). Misma criba de días rotos que w1: sin precio, o
//   se aparta >5% del CIERRE REAL de disco, o salta >35% en un día sin que el cierre real lo
//   avale. Si hay un día roto entre la compra y la venta, la operación se descarta ENTERA.
//
// ─── EL BARAJADO ──────────────────────────────────────────────────────────────────────────────
//   VEINTE desplazamientos fijos (6, 12, 18 … 120 meses ≈ 126, 252 … 2,520 días de bolsa). A cada
//   operación se le pega la señal que le tocaba a ESE MISMO TICKER ese número de días antes
//   (circular). Nunca Math.random. Conserva la mezcla de tickers y la forma de la señal, y rompe
//   sólo el enganche con la fecha.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/v2-las-tres-honestas.mjs
// ══════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const CIERRES = "scripts/cache-theta/cierres";
const SPOTCACHE = "scripts/cache-theta/_y9-spots.json";

const APUESTA = 1000;
const ASKMIN = 0.10;
const TOLK = 0.50;      // cuánto puede apartarse el strike disponible de la distancia pedida
const SALIDA = 30;      // días de bolsa hasta vender

// EL ENVASE, con el PLAZO FIJADO A UNA BANDA ESTRECHA
const ENVASES = [
  { id: "A", dist: 0.10, lo: 55, hi: 65, obj: 60, liston: 0.95, et: "A · 10% fuera · vencimiento 55-65 días · salir a los 30 de bolsa" },
  { id: "B", dist: 0.05, lo: 85, hi: 95, obj: 90, liston: 1.00, et: "B ·  5% fuera · vencimiento 85-95 días · salir a los 30 de bolsa" },
];

const VENT_PCTL = 250;   // días propios contra los que se percentila (ventana que termina AYER)
// OJO — ESTO NO ES UN DETALLE. Con el plazo SUELTO (±17 días) casi todos los días tenían un
// vencimiento que valiera, y exigir 150 valores dentro de los 250 anteriores no estorbaba. Con la
// BANDA ESTRECHA de 55-65 días sólo el ~37% de los días tiene vencimiento, así que dentro de esos
// 250 días caben ~91 observaciones y el mínimo de 150 dejaba la señal A SIN DISPARAR NI UNA VEZ
// (comprobado: 967 días con cociente, 0 con percentil). El mínimo se baja a 50 observaciones y se
// exige además un año entero de calentamiento (j >= 250) para las TRES señales, de modo que el
// arranque sea el mismo para todas y la única diferencia sea cuántas observaciones caben dentro.
const MIN_PCTL = 50;
const RVW = 60;          // ventana del movimiento real (la de la señal A publicada)
const MIN_RET = 48;      // mínimo de retornos válidos para poder calcular ese movimiento

// C: los dos tramos de la curva
const FRENTE = { obj: 30, tol: 10 };
const FONDO = { obj: 180, tol: 45 };

// EL BARAJADO — 20 desplazamientos fijos, en meses (≈21 días de bolsa por mes)
const DESPL_MESES = Array.from({ length: 20 }, (_, i) => (i + 1) * 6);   // 6,12,…,120

const ANOS_DUROS = ["2018", "2020", "2022", "2025"];
const TERCIOS = [["2016", "2019", "2016-2019"], ["2020", "2022", "2020-2022"], ["2023", "2026", "2023-2026"]];

// ── formato: PUNTO para decimales, COMA para miles ──────────────────────────────────────────
const mil = (n) => Number(n).toLocaleString("en-US");
const num = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : "n/d");
const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) + "%" : "n/d");
const usd = (n) => (Number.isFinite(n) ? "$" + Math.round(n).toLocaleString("en-US") : "n/d");
const L = (x = "") => console.log(x);
const linea = (t) => { L(`\n${"═".repeat(112)}`); L(`  ${t}`); L(`${"═".repeat(112)}`); };

const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sdv = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };

// ════════════════════════════════════════════════════════════════════════════════════════════
// ÍNDICE DE DÍAS POR TICKER
// ════════════════════════════════════════════════════════════════════════════════════════════
const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();
// mismo corte que w1/y9: sólo tickers con cadena diaria de verdad (los de 83 y 158 días no sirven)
let TICKERS = [...diasPorSim.keys()].filter((t) => diasPorSim.get(t).length >= 800).sort();
if (process.env.SOLO) TICKERS = TICKERS.filter((t) => process.env.SOLO.split(",").includes(t));
const TKI = new Map(TICKERS.map((t, i) => [t, i]));

function leer(sym, dia) {
  const f = `${CDIR}/${sym}_d${dia}.json`;
  if (!existsSync(f)) return null;
  try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; }
}

/** EL SPOT: paridad put-call en el vencimiento MÁS CERCANO. */
function spotOk(c, hoy) {
  let exp = null, md = Infinity;
  for (const e of Object.keys(c)) { const d = dteDe(hoy, e); if (d < 1) continue; if (d < md) { md = d; exp = e; } }
  if (!exp) return null;
  const g = c[exp];
  let K = null, dm = Infinity;
  for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== "C") continue;
    const k = Number(cl.slice(0, -2)); const p = g[`${k}|P`]; if (!p) continue;
    const d = Math.abs((ba[0] + ba[1]) / 2 - (p[0] + p[1]) / 2);
    if (d < dm) { dm = d; K = k; }
  }
  if (K == null) return null;
  const C = g[`${K}|C`], P = g[`${K}|P`];
  const s = K + (C[0] + C[1]) / 2 - (P[0] + P[1]) / 2;
  return s > 0 ? s : null;
}

// ════════════════════════════════════════════════════════════════════════════════════════════
// ETAPA 1 — la serie de precios (reutilizada de w1/y9) y la criba de días rotos
// ════════════════════════════════════════════════════════════════════════════════════════════
const t0 = Date.now();
let SPOTS = existsSync(SPOTCACHE) ? JSON.parse(readFileSync(SPOTCACHE, "utf8")) : {};
{
  const faltan = TICKERS.filter((t) => !Array.isArray(SPOTS[t]) || SPOTS[t].length !== diasPorSim.get(t).length);
  if (faltan.length) {
    L(`## reconstruyendo la serie de precios de ${faltan.length} tickers`);
    for (const sym of faltan) {
      const arr = [];
      for (const d of diasPorSim.get(sym)) { const c = leer(sym, d); arr.push(c ? spotOk(c, d) : null); }
      SPOTS[sym] = arr;
      process.stderr.write(`\r   spots · ${sym}     `);
    }
    process.stderr.write("\n");
    writeFileSync(SPOTCACHE, JSON.stringify(SPOTS));
  } else {
    L(`## serie de precios leída de ${SPOTCACHE} (la misma que usan w1 y y9) — ${TICKERS.length} tickers`);
  }
}

const cierresDe = (t) => { const p = `${CIERRES}/${t}.json`; if (!existsSync(p)) return null; try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const ROTO = {}, PREF = {};
let rotoSinSpot = 0, rotoContraCierre = 0, rotoSalto = 0, saltoSalvado = 0;
for (const sym of TICKERS) {
  const dias = diasPorSim.get(sym), s = SPOTS[sym], cl = cierresDe(sym);
  const n = dias.length, ro = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    if (s[i] == null) { ro[i] = true; rotoSinSpot++; continue; }
    const c = cl?.[dias[i]];
    if (c != null && c > 0 && Math.abs(s[i] / c - 1) > 0.05) { ro[i] = true; rotoContraCierre++; continue; }
    if (i > 0 && s[i - 1] != null) {
      const rat = s[i] / s[i - 1];
      if (Math.abs(rat - 1) > 0.35) {
        const c0 = cl?.[dias[i - 1]], c1 = cl?.[dias[i]];
        const confirmado = c0 > 0 && c1 > 0 && Math.abs(rat / (c1 / c0) - 1) < 0.03;
        if (confirmado) saltoSalvado++; else { ro[i] = true; rotoSalto++; }
      }
    }
  }
  ROTO[sym] = ro;
  const pf = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) pf[i + 1] = pf[i] + (ro[i] ? 1 : 0);
  PREF[sym] = pf;
}

// ════════════════════════════════════════════════════════════════════════════════════════════
// HERRAMIENTAS DE CADENA
// ════════════════════════════════════════════════════════════════════════════════════════════
/** Vencimiento DENTRO DE LA BANDA [lo,hi], el más cercano al objetivo. null si no hay ninguno. */
function expEnBanda(c, hoy, lo, hi, obj) {
  let mejor = null, md = Infinity, dtr = 0;
  for (const e of Object.keys(c)) {
    const dt = dteDe(hoy, e);
    if (dt < lo || dt > hi) continue;
    const x = Math.abs(dt - obj);
    if (x < md) { md = x; mejor = e; dtr = dt; }
  }
  return mejor ? { exp: mejor, dte: dtr } : null;
}
/** Vencimiento más cercano a `obj` con tolerancia `tol` (para los tramos de la curva de C). */
function expCerca(c, hoy, obj, tol) {
  let mejor = null, md = Infinity, dtr = 0;
  for (const e of Object.keys(c)) {
    const dt = dteDe(hoy, e);
    if (dt < 1) continue;
    const x = Math.abs(dt - obj);
    if (x < md) { md = x; mejor = e; dtr = dt; }
  }
  if (!mejor || md > tol) return null;
  return { exp: mejor, dte: dtr };
}
/** Cuña al dinero. modo "ask" (lo que cobran de verdad) o "mid" (lectura). Devuelve cuña/S. */
function cunaDe(c, exp, S, modo) {
  const g = c[exp];
  if (!g) return null;
  let K = null, dm = Infinity;
  for (const cl of Object.keys(g)) {
    if (cl.slice(-1) !== "C") continue;
    const k = Number(cl.slice(0, -2));
    if (!g[`${k}|P`]) continue;
    const d = Math.abs(k - S);
    if (d < dm) { dm = d; K = k; }
  }
  if (K == null) return null;
  if (Math.abs(K / S - 1) > 0.05) return null;         // no hay strike de verdad al dinero
  const bc = g[`${K}|C`], bp = g[`${K}|P`];
  if (modo === "ask") {
    if (!(bc[1] > 0) || !(bp[1] > 0)) return null;
    return (bc[1] + bp[1]) / S;
  }
  const mc = (bc[0] + bc[1]) / 2, mp = (bp[0] + bp[1]) / 2;
  if (!(mc > 0) || !(mp > 0)) return null;
  return (mc + mp) / S;
}

// ════════════════════════════════════════════════════════════════════════════════════════════
// EL BARRIDO — un pase por ticker, una cadena en memoria cada vez
// ════════════════════════════════════════════════════════════════════════════════════════════
const OPS = [];            // todas las operaciones medidas
const SIG = [];            // SIG[tk] = { sA:[arr por envase], sB:[], sBp:[], sC:[], cocC:[], n }
let diasVistos = 0, sinSpotEnt = 0, contaminadas = 0, sinBanda = 0, sinContrato = 0, huecos = 0;
let entradasA = 0, entradasB = 0;
const audSpot = [];
const DIASEM = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

for (const sym of TICKERS) {
  const tk = TKI.get(sym);
  const dias = diasPorSim.get(sym);
  const S = SPOTS[sym], pf = PREF[sym], n = dias.length;
  const idxDe = new Map(dias.map((d, i) => [d, i]));
  const cl = cierresDe(sym);

  // posición del día dentro de su mes (0 = primer día de bolsa del mes)
  const dom = new Int32Array(n);
  { let mes = null, k = 0; for (let i = 0; i < n; i++) { const m = dias[i].slice(0, 6); if (m !== mes) { mes = m; k = 0; } dom[i] = Math.min(k, 21); k++; } }

  // retornos diarios del propio spot (huecos de calendario > 5 días y saltos > 35% fuera)
  const ret = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    if (S[i] == null || S[i - 1] == null) continue;
    if (dteDe(dias[i - 1], dias[i]) > 5) continue;
    const r = Math.log(S[i] / S[i - 1]);
    if (Math.abs(r) > 0.35) continue;
    ret[i] = r;
  }

  // series de señal, rellenadas sobre la marcha (nunca se mira hacia adelante)
  const cocA = ENVASES.map(() => new Array(n).fill(null));   // cuña/movimiento del vencimiento comprado
  const sA = ENVASES.map(() => new Array(n).fill(null));     // su percentil móvil
  const cocC = new Array(n).fill(null);                      // sigma30/sigma180
  const sC = new Array(n).fill(null);                        // su percentil móvil
  const sB = new Array(n).fill(null);                        // |movimiento de ayer|
  const sBp = new Array(n).fill(null);                       // su percentil móvil
  const absr = new Array(n).fill(null);
  for (let i = 0; i < n; i++) if (ret[i] != null) absr[i] = Math.abs(ret[i]);

  /** Percentil de serie[i] contra serie[i-VENT_PCTL .. i-1]. Sólo el pasado. */
  const percentilAqui = (serie, i) => {
    if (serie[i] == null || i < VENT_PCTL) return null;      // un año entero de calentamiento
    let cnt = 0, menores = 0;
    for (let j = i - VENT_PCTL; j < i; j++) { if (serie[j] == null) continue; cnt++; if (serie[j] < serie[i]) menores++; }
    return cnt < MIN_PCTL ? null : menores / cnt;
  };

  const pend = new Map();   // índice de día de salida -> operaciones abiertas

  for (let j = 0; j < n; j++) {
    const c = leer(sym, dias[j]);
    diasVistos++;

    // ── 1) cerrar lo que sale hoy ─────────────────────────────────────────────
    if (pend.has(j)) {
      for (const o of pend.get(j)) {
        if (!c) { huecos++; continue; }
        const grupo = c[o.exp];
        if (!grupo) { huecos++; continue; }
        const salida = grupo[o.clave]?.[0] ?? 0;      // sin puja = 0. Dato real.
        const r = (salida - o.ask) / o.ask;
        o.ret = r; o.dol = APUESTA * r; o.salida = salida;
        OPS.push(o);
      }
      pend.delete(j);
    }

    if (!c) continue;

    // ── 2) señales del día (todo con datos anteriores) ────────────────────────
    const sp = S[j];
    if (sp != null && cl && cl[dias[j]] > 0) audSpot.push(Math.abs(sp / cl[dias[j]] - 1));

    // B — el movimiento de AYER (de anteayer a ayer). Nunca el de hoy.
    // (el umbral absoluto no necesitaría historia, pero se le exige el MISMO año de calentamiento
    //  que a las demás para que las cuatro reglas se midan sobre el mismo conjunto de días)
    if (j >= VENT_PCTL && absr[j - 1] != null) {
      sB[j] = absr[j - 1];
      // percentil de ese movimiento contra los 250 anteriores A ÉL (mismo calentamiento)
      if (j - 1 >= VENT_PCTL) {
        let cnt = 0, menores = 0;
        for (let q = j - 1 - VENT_PCTL; q < j - 1; q++) { if (absr[q] == null) continue; cnt++; if (absr[q] < absr[j - 1]) menores++; }
        if (cnt >= MIN_PCTL) sBp[j] = menores / cnt;
      }
    }

    if (sp != null) {
      // movimiento real de los últimos RVW días, TERMINANDO EN j-1
      const v = [];
      for (let q = j - 1; q >= 0 && v.length < RVW; q--) if (ret[q] != null) v.push(ret[q]);
      const rv = v.length >= MIN_RET ? sdv(v) : NaN;

      // A — la cuña del vencimiento que se va a comprar, contra ese movimiento
      for (let ei = 0; ei < ENVASES.length; ei++) {
        const e = ENVASES[ei];
        const eo = expEnBanda(c, dias[j], e.lo, e.hi, e.obj);
        if (!eo || !(rv > 0)) continue;
        const cu = cunaDe(c, eo.exp, sp, "ask");
        if (cu == null) continue;
        const mov = rv * Math.sqrt(Math.max(1, eo.dte * 252 / 365));
        if (!(mov > 0)) continue;
        cocA[ei][j] = cu / mov;
        sA[ei][j] = percentilAqui(cocA[ei], j);
      }

      // C — el frente contra el fondo, a punto medio
      const ef = expCerca(c, dias[j], FRENTE.obj, FRENTE.tol);
      const eb = expCerca(c, dias[j], FONDO.obj, FONDO.tol);
      if (ef && eb && ef.exp !== eb.exp) {
        const cf = cunaDe(c, ef.exp, sp, "mid"), cb = cunaDe(c, eb.exp, sp, "mid");
        if (cf != null && cb != null) {
          const sf = cf / Math.sqrt(ef.dte / 365), sb2 = cb / Math.sqrt(eb.dte / 365);
          if (sf > 0 && sb2 > 0) { cocC[j] = sf / sb2; sC[j] = percentilAqui(cocC, j); }
        }
      }
    }

    // ── 3) abrir lo de hoy ────────────────────────────────────────────────────
    if (j + SALIDA >= n) continue;
    if (sp == null || ROTO[sym][j]) { sinSpotEnt++; continue; }
    if (pf[j + SALIDA + 1] - pf[j] > 0) { contaminadas++; continue; }   // día roto por el camino

    for (let ei = 0; ei < ENVASES.length; ei++) {
      const e = ENVASES[ei];
      const eo = expEnBanda(c, dias[j], e.lo, e.hi, e.obj);
      if (!eo) { sinBanda++; continue; }                                 // ESE DÍA NO SE OPERA
      if (ei === 0) entradasA++; else entradasB++;

      let iSal = j + SALIDA, trunc = 0;
      if (dias[iSal] >= eo.exp) {
        const k = idxDe.get(eo.exp);
        if (k == null || k <= j) { huecos += 2; continue; }
        iSal = k; trunc = 1;
      }

      for (const tipo of ["C", "P"]) {
        const objetivo = tipo === "C" ? sp * (1 + e.dist) : sp * (1 - e.dist);
        let mej = null, dd = Infinity;
        for (const [clave, ba] of Object.entries(c[eo.exp])) {
          if (clave.slice(-1) !== tipo) continue;
          if (!(ba[1] > 0) || ba[1] < ASKMIN) continue;
          const K = Number(clave.slice(0, -2));
          const d = Math.abs(K - objetivo);
          if (d < dd) { dd = d; mej = { K, clave, bid: ba[0], ask: ba[1] }; }
        }
        if (!mej) { sinContrato++; continue; }
        const distReal = tipo === "C" ? mej.K / sp - 1 : 1 - mej.K / sp;
        if (Math.abs(distReal - e.dist) > e.dist * TOLK) { sinContrato++; continue; }

        const o = {
          tk, ei, j, tipo, sym, dia: dias[j], ano: dias[j].slice(0, 4),
          dow: new Date(ms(dias[j])).getUTCDay(), dom: dom[j],
          exp: eo.exp, clave: mej.clave, ask: mej.ask, bid: mej.bid,
          dteReal: eo.dte, distReal, coste: mej.ask / sp, horq: (mej.ask - mej.bid) / mej.ask,
          trunc, ret: null, dol: 0, salida: null,
        };
        if (!pend.has(iSal)) pend.set(iSal, []);
        pend.get(iSal).push(o);
      }
    }
  }
  for (const [, arr] of pend) huecos += arr.length;   // lo abierto al final no tiene salida

  SIG[tk] = { sA, sB, sBp, sC, n };
  process.stderr.write(`\r   ${sym} · ${mil(diasVistos)} días · ${mil(OPS.length)} operaciones · ${Math.round((Date.now() - t0) / 1000)}s     `);
}
process.stderr.write("\n");

// ════════════════════════════════════════════════════════════════════════════════════════════
// SANIDAD
// ════════════════════════════════════════════════════════════════════════════════════════════
const ANOS = [...new Set(OPS.map((o) => o.ano))].sort();
const NANOS = ANOS.length;
const DIAS_TOT = TICKERS.reduce((a, t) => a + diasPorSim.get(t).length, 0);
const FECHA0 = TICKERS.map((t) => diasPorSim.get(t)[0]).sort()[0];
const FECHA1 = TICKERS.map((t) => diasPorSim.get(t).at(-1)).sort().at(-1);
const ANOSCAL = (Date.parse(FECHA1.slice(0, 4) + "-" + FECHA1.slice(4, 6) + "-" + FECHA1.slice(6, 8)) -
  Date.parse(FECHA0.slice(0, 4) + "-" + FECHA0.slice(4, 6) + "-" + FECHA0.slice(6, 8))) / (365.25 * 86400000);

linea("SANIDAD — antes de mirar ningún resultado");
L(`  tickers: ${TICKERS.length} · días de cadena: ${mil(DIAS_TOT)} · de ${FECHA0} a ${FECHA1} (${num(ANOSCAL, 1)} años)`);
L(`  días de cadena leídos de disco: ${mil(diasVistos)}`);
L(`  entradas con vencimiento EN LA BANDA — envase A: ${mil(entradasA)} · envase B: ${mil(entradasB)}`);
L(`  días descartados por NO HABER vencimiento en la banda (sumando los dos envases): ${mil(sinBanda)}`);
L(`  descartes — sin precio o día roto en la entrada: ${mil(sinSpotEnt)} · día roto entre compra y venta: ${mil(contaminadas)}`);
L(`  descartes — sin contrato que encaje (strike lejos o ask < $${ASKMIN.toFixed(2)}): ${mil(sinContrato)}`);
L(`  HUECOS descartados (falta la cadena de salida o el vencimiento entero): ${mil(huecos)} = ${pct(huecos / (huecos + OPS.length))} de lo intentado`);
L(`  operaciones medidas: ${mil(OPS.length)}`);
L(`  días rotos en la serie de precios: sin precio ${mil(rotoSinSpot)} · se apartan >5% del cierre real ${mil(rotoContraCierre)} · saltos >35% no avalados ${mil(rotoSalto)} · saltos avalados que se quedan ${saltoSalvado}`);
{
  const s = [...audSpot].sort((a, b) => a - b);
  L(`  EL PRECIO, validado contra los cierres reales de disco (${mil(s.length)} días con los dos): error mediano ${pct(s[s.length >> 1])} · peor 10% ${pct(s[Math.floor(s.length * 0.9)])} · peor 1% ${pct(s[Math.floor(s.length * 0.99)])}`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════
// LA VARA
// ════════════════════════════════════════════════════════════════════════════════════════════
const acc = () => ({ n: 0, win: 0, gan: 0, per: 0, max: 0, dte: 0, coste: 0, horq: 0, dist: 0 });
function suma(a, o) {
  const d = o.dol;
  a.n++; if (d > 0) { a.win++; a.gan += d; if (d > a.max) a.max = d; } else a.per += -d;
  a.dte += o.dteReal; a.coste += o.coste; a.horq += o.horq; a.dist += o.distReal;
}
function mide(v) { const a = acc(); for (const o of v) suma(a, o); return a; }
const ratio = (a) => (a.per > 0 ? a.gan / a.per : (a.gan > 0 ? Infinity : NaN));
const acierto = (a) => (a.n ? a.win / a.n : NaN);
const R = (a) => (a && a.n ? num(ratio(a)) : "n/d");

const POR_ENV = ENVASES.map((_, ei) => OPS.filter((o) => o.ei === ei));

// ── el envase vacío MEDIDO AQUÍ, con la banda estrecha ──────────────────────────────────────
linea("EL ENVASE VACÍO MEDIDO AQUÍ — el único listón que compara peras con peras");
L(`  | envase | n | ops/año | RATIO | acierta | ganador medio | perdedor medio | plazo real medio | distancia real | prima/subyacente | horquilla | listón publicado |`);
L(`  |---|---|---|---|---|---|---|---|---|---|---|`);
const VACIO = [];
for (let ei = 0; ei < ENVASES.length; ei++) {
  const a = mide(POR_ENV[ei]);
  VACIO.push(a);
  L(`  | ${ENVASES[ei].et} | ${mil(a.n)} | ${mil(Math.round(a.n / ANOSCAL))} | **${num(ratio(a))}** | ${pct(acierto(a))} | ${usd(a.gan / a.win)} | ${usd(a.per / (a.n - a.win))} | ${num(a.dte / a.n, 1)} días | ${pct(a.dist / a.n)} | ${pct(a.coste / a.n)} | ${pct(a.horq / a.n)} | ${num(ENVASES[ei].liston)} |`);
}
L(`\n  El listón publicado (0.95 / 1.00) se midió con el plazo SUELTO (±17 / ±25 días). Aquí el plazo`);
L(`  está fijado a una banda estrecha, así que el envase vacío puede salir algo distinto: ése es el`);
L(`  número contra el que hay que comparar las señales de este mismo informe.`);

// ── el plazo real por día del mes: ¿se acabó el baile? ──────────────────────────────────────
linea("¿SE ACABÓ EL BAILE DEL PLAZO? — plazo real medio por día de bolsa del mes, con la banda fijada");
for (let ei = 0; ei < ENVASES.length; ei++) {
  const filas = [];
  for (let k = 0; k < 22; k++) {
    const v = POR_ENV[ei].filter((o) => o.dom === k);
    if (v.length < 200) continue;
    const a = mide(v);
    filas.push(`${k + 1}º ${num(a.dte / a.n, 1)}d/${pct(a.horq / a.n)}`);
  }
  const dtes = [], horqs = [];
  for (let k = 0; k < 22; k++) { const v = POR_ENV[ei].filter((o) => o.dom === k); if (v.length < 200) continue; const a = mide(v); dtes.push(a.dte / a.n); horqs.push(a.horq / a.n); }
  L(`  envase ${ENVASES[ei].id}: plazo real de ${num(Math.min(...dtes), 1)} a ${num(Math.max(...dtes), 1)} días (antes: 49.5 a 63.9) · horquilla de ${pct(Math.min(...horqs))} a ${pct(Math.max(...horqs))} (antes: 10.3% a 23.0%)`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════
// EL MOTOR DE EXAMEN
// ════════════════════════════════════════════════════════════════════════════════════════════
/**
 * base = las operaciones donde la señal EXISTE (el listón restringido honesto)
 * sel  = las que la señal elige
 * getS = (op, desplazamientoEnDias) -> valor de la señal desplazada (para el barajado)
 * regla = (valor) -> bool
 */
function examen(titulo, envId, base, sel, getSig, regla, extra = {}) {
  const a = mide(sel), lb = mide(base);
  linea(`${titulo} — envase ${envId}`);
  L(`  n=${mil(a.n)} (${mil(Math.round(a.n / ANOSCAL))} operaciones al año, ${pct(a.n / lb.n)} de los días disponibles)`);
  L(`  RATIO ${num(ratio(a))}  ·  acierta ${pct(acierto(a))}`);
  L(`  LISTÓN RESTRINGIDO (los mismos días, SIN la señal): ratio ${num(ratio(lb))} · acierta ${pct(acierto(lb))} (n=${mil(lb.n)})`);
  L(`  ganador medio ${usd(a.gan / Math.max(1, a.win))} · perdedor medio ${usd(a.per / Math.max(1, a.n - a.win))} · mayor billete ${usd(a.max)} · ratio sin ese billete ${num((a.gan - a.max) / a.per)}`);
  L(`  plazo real medio ${num(a.dte / a.n, 1)} días · prima ${pct(a.coste / a.n)} del subyacente · horquilla ${pct(a.horq / a.n)} de la prima`);

  // año a año
  L(`\n  AÑO A AÑO:`);
  L(`  | año | n | RATIO con señal | acierta | RATIO sin señal (mismos días) | % de días que compra |`);
  L(`  |---|---|---|---|---|---|`);
  let malos = 0, conMuestra = 0;
  const porAnoTxt = [];
  for (const y of ANOS) {
    const s = mide(sel.filter((o) => o.ano === y));
    const l = mide(base.filter((o) => o.ano === y));
    if (s.n < 30) { L(`  | ${y} | ${mil(s.n)} | n/d (muestra corta) | | ${R(l)} | |`); continue; }
    conMuestra++; if (ratio(s) < 1) malos++;
    porAnoTxt.push(`${y} ${num(ratio(s))}`);
    L(`  | ${y} | ${mil(s.n)} | **${num(ratio(s))}** | ${pct(acierto(s))} | ${R(l)} | ${pct(s.n / Math.max(1, l.n))} |`);
  }
  L(`  años con ratio por debajo de 1.00: ${malos} de ${conMuestra}`);

  // tercios
  const terciosTxt = [];
  L(`\n  POR TERCIOS (tres tercios, no dos mitades):`);
  L(`  | tercio | n | RATIO con señal | acierta | RATIO sin señal |`);
  L(`  |---|---|---|---|---|`);
  for (const [ya, yb, et] of TERCIOS) {
    const s = mide(sel.filter((o) => o.ano >= ya && o.ano <= yb));
    const l = mide(base.filter((o) => o.ano >= ya && o.ano <= yb));
    terciosTxt.push(`${et} ${s.n ? num(ratio(s)) : "n/d"}`);
    L(`  | ${et} | ${mil(s.n)} | **${s.n ? num(ratio(s)) : "n/d"}** | ${pct(acierto(s))} | ${R(l)} |`);
  }

  // crisis
  const crisisTxt = ANOS_DUROS.map((y) => { const s = mide(sel.filter((o) => o.ano === y)); return `${y} ${s.n < 30 ? "n/d" : num(ratio(s))} (n=${mil(s.n)})`; });
  L(`\n  LAS CUATRO CRISIS POR SEPARADO: ${crisisTxt.join(" · ")}`);

  // sin 2020
  const s2020 = mide(sel.filter((o) => o.ano !== "2020"));
  const l2020 = mide(base.filter((o) => o.ano !== "2020"));
  L(`  SIN 2020 ENTERO: ratio ${num(ratio(s2020))} (n=${mil(s2020.n)}) · el listón restringido sin 2020: ${R(l2020)}`);
  const sFM = mide(sel.filter((o) => !(o.dia >= "20200201" && o.dia <= "20200531")));
  L(`  SIN febrero-mayo de 2020: ratio ${num(ratio(sFM))} (n=${mil(sFM.n)})`);

  // tickers
  const porTk = new Map();
  for (const o of sel) { if (!porTk.has(o.sym)) porTk.set(o.sym, []); porTk.get(o.sym).push(o); }
  const tks = [...porTk.entries()].map(([k, v]) => ({ k, a: mide(v) })).sort((x, y) => y.a.gan - x.a.gan);
  let ac = 0, cuantos = 0;
  for (const t of tks) { if (t.a.gan <= 0) break; ac += t.a.gan; cuantos++; if (ac >= a.gan / 2) break; }
  const conR1 = tks.filter((t) => ratio(t.a) > 1).length;
  L(`\n  POR TICKER: ${tks.length} tickers · ${conR1} con ratio > 1 · **${cuantos} juntan la mitad de todo lo ganado**`);
  L(`    mejores: ${tks.slice(0, 5).map((t) => `${t.k} ${R(t.a)}`).join(" · ")}`);
  L(`    peores : ${tks.slice(-5).map((t) => `${t.k} ${R(t.a)}`).join(" · ")}`);
  L(`    ratio quitando ${tks[0].k} entero: ${num((a.gan - tks[0].a.gan) / (a.per - tks[0].a.per))}`);

  // calls y puts
  const cc = mide(sel.filter((o) => o.tipo === "C")), pp = mide(sel.filter((o) => o.tipo === "P"));
  L(`\n  CALLS: ratio ${R(cc)} acierta ${pct(acierto(cc))} (n=${mil(cc.n)})  ·  PUTS: ratio ${R(pp)} acierta ${pct(acierto(pp))} (n=${mil(pp.n)})`);

  // EL BARAJADO — 20 desplazamientos
  const rs = [];
  for (const m of DESPL_MESES) {
    const sh = m * 21;
    const b = acc();
    for (const o of base) { const v = getSig(o, sh); if (v == null || !regla(v)) continue; suma(b, o); }
    if (b.n >= 100) rs.push({ m, r: ratio(b), n: b.n });
  }
  const ords = rs.map((x) => x.r).sort((x, y) => x - y);
  const baten = rs.filter((x) => x.r >= ratio(a)).length;
  const medBar = ords.length ? ords[ords.length >> 1] : NaN;
  L(`\n  EL BARAJADO — la misma regla con el día equivocado, ${DESPL_MESES.length} desplazamientos fijos (6, 12 … 120 meses):`);
  L(`    de ${num(ords[0])} a ${num(ords.at(-1))}, mediana ${num(medBar)}   ·   la señal de verdad da ${num(ratio(a))}`);
  L(`    desplazamientos que IGUALAN O BATEN a la señal de verdad: ${baten} de ${rs.length}`);
  L(`    detalle: ${rs.map((x) => `${x.m}m ${num(x.r)}`).join(" · ")}`);

  return {
    a, lb, malos, conMuestra, cuantos, tks, porAnoTxt, terciosTxt, crisisTxt,
    sin2020: ratio(s2020), barMediana: medBar, barMin: ords[0], barMax: ords.at(-1), baten, nBar: rs.length,
    opsAno: Math.round(a.n / ANOSCAL), ratio: ratio(a), acierto: acierto(a),
    ratioListon: ratio(lb), aciertoListon: acierto(lb),
  };
}

// ── acceso a la señal desplazada ────────────────────────────────────────────────────────────
const sigA = (o, sh) => { const S = SIG[o.tk]; return S.sA[o.ei][(o.j + sh) % S.n]; };
const sigB = (o, sh) => { const S = SIG[o.tk]; return S.sB[(o.j + sh) % S.n]; };
const sigBp = (o, sh) => { const S = SIG[o.tk]; return S.sBp[(o.j + sh) % S.n]; };
const sigC = (o, sh) => { const S = SIG[o.tk]; return S.sC[(o.j + sh) % S.n]; };

let COMBOS = 0;

// ════════════════════════════════════════════════════════════════════════════════════════════
// LA ESCALERA DE LAS TRES — cinco montones, para ver la forma antes de elegir umbral
// ════════════════════════════════════════════════════════════════════════════════════════════
const ETQ5 = ["1 · el 20% más BAJO", "2", "3 · el medio", "4", "5 · el 20% más ALTO"];
function escalera(nombre, ei, getS, etiquetas = ETQ5) {
  const base = POR_ENV[ei].filter((o) => getS(o, 0) != null);
  if (base.length < 1000) { L(`  (envase ${ENVASES[ei].id}: muestra insuficiente)`); return; }
  const lb = mide(base);
  L(`\n  ── ${nombre} · ENVASE ${ENVASES[ei].id} · listón restringido ${num(ratio(lb))} / ${pct(acierto(lb))} (n=${mil(lb.n)}) ──`);
  L(`  | montón | n | RATIO | acierta | ganador medio | perdedor medio |`);
  L(`  |---|---|---|---|---|---|`);
  const rs = [], as = [];
  for (let q = 0; q < 5; q++) {
    const v = base.filter((o) => Math.min(4, Math.floor(getS(o, 0) * 5)) === q);
    const a = mide(v);
    rs.push(ratio(a)); as.push(acierto(a)); COMBOS++;
    L(`  | ${etiquetas[q]} | ${mil(a.n)} | **${num(ratio(a))}** | ${pct(acierto(a))} | ${usd(a.gan / Math.max(1, a.win))} | ${usd(a.per / Math.max(1, a.n - a.win))} |`);
  }
  const mono = (v) => v.every((x, i) => i === 0 || x >= v[i - 1]) || v.every((x, i) => i === 0 || x <= v[i - 1]);
  L(`  monótona en ratio: ${mono(rs) ? "SÍ" : "NO"} · monótona en acierto: ${mono(as) ? "SÍ" : "NO"}`);
}

linea("LA ESCALERA DE LAS TRES SEÑALES — cinco montones por percentil");
L(`  A · lo CARA que está la opción que se compra (cuña ÷ movimiento real de 60 días)`);
for (let ei = 0; ei < 2; ei++) escalera("A · LA OPCIÓN CARA", ei, sigA);
L(`\n  B · lo GRANDE que fue el movimiento de AYER, en percentil de su propia historia`);
for (let ei = 0; ei < 2; ei++) escalera("B · EL RUIDO DE AYER (relativo)", ei, sigBp);
L(`\n  C · lo CARO que está el frente respecto al fondo, en percentil de su propia historia`);
for (let ei = 0; ei < 2; ei++) escalera("C · EL FRENTE CARO", ei, sigC);

// ════════════════════════════════════════════════════════════════════════════════════════════
// A · LA OPCIÓN CARA
// ════════════════════════════════════════════════════════════════════════════════════════════
linea("SEÑAL A · LA OPCIÓN CARA — la regla publicada: comprar por encima del percentil 80");
const reglaA = (v) => v > 0.80;
const RES_A = [];
for (let ei = 0; ei < 2; ei++) {
  const base = POR_ENV[ei].filter((o) => sigA(o, 0) != null);
  const sel = base.filter((o) => reglaA(sigA(o, 0)));
  COMBOS++;
  RES_A.push(examen("A · LA OPCIÓN CARA (percentil > 80)", ENVASES[ei].id, base, sel, sigA, reglaA));
}
// ¿se apaga? por tercios, con la muestra 21 veces mayor
linea("A · ¿SE APAGA? — lo que más importa de esta señal (antes daba 1.90 · 2.10 · 1.19 por tercios)");
L(`  | tercio | envase A: n / RATIO / acierta | listón | envase B: n / RATIO / acierta | listón |`);
L(`  |---|---|---|---|---|`);
for (const [ya, yb, et] of TERCIOS) {
  const cel = [];
  for (let ei = 0; ei < 2; ei++) {
    const base = POR_ENV[ei].filter((o) => sigA(o, 0) != null && o.ano >= ya && o.ano <= yb);
    const sel = base.filter((o) => reglaA(sigA(o, 0)));
    const a = mide(sel), l = mide(base);
    cel.push(`${mil(a.n)} / **${R(a)}** / ${pct(acierto(a))}`, R(l));
  }
  L(`  | ${et} | ${cel.join(" | ")} |`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════
// B · EL RUIDO DE AYER
// ════════════════════════════════════════════════════════════════════════════════════════════
linea("SEÑAL B · EL RUIDO DE AYER — umbrales absolutos y la versión relativa");
const UMB_B = [
  { et: "ayer se movió más del 1%", f: (v) => v > 0.010, rel: false },
  { et: "ayer se movió más del 1.5%", f: (v) => v > 0.015, rel: false },
  { et: "ayer se movió más del 2% (la regla publicada)", f: (v) => v > 0.020, rel: false },
  { et: "ayer se movió más del 3%", f: (v) => v > 0.030, rel: false },
  { et: "el movimiento de ayer en su quinto MÁS ALTO (relativo al propio ticker)", f: (v) => v > 0.80, rel: true },
  { et: "el movimiento de ayer en su quinto MÁS BAJO (la calma — el control)", f: (v) => v < 0.20, rel: true },
];
L(`  | regla | envase | n | ops/año | RATIO | acierta | listón restringido | barajado: mediana (min-max) | baten |`);
L(`  |---|---|---|---|---|---|---|---|---|`);
const TAB_B = [];
for (const u of UMB_B) {
  for (let ei = 0; ei < 2; ei++) {
    const get = u.rel ? sigBp : sigB;
    const base = POR_ENV[ei].filter((o) => get(o, 0) != null);
    const sel = base.filter((o) => u.f(get(o, 0)));
    if (sel.length < 200) continue;
    COMBOS++;
    const a = mide(sel), l = mide(base);
    const rs = [];
    for (const m of DESPL_MESES) {
      const b = acc();
      for (const o of base) { const v = get(o, m * 21); if (v == null || !u.f(v)) continue; suma(b, o); }
      if (b.n >= 100) rs.push(ratio(b));
    }
    rs.sort((x, y) => x - y);
    TAB_B.push({ u, ei, a, l, rs, get });
    L(`  | ${u.et} | ${ENVASES[ei].id} | ${mil(a.n)} | ${mil(Math.round(a.n / ANOSCAL))} | **${num(ratio(a))}** | ${pct(acierto(a))} | ${num(ratio(l))} / ${pct(acierto(l))} | ${num(rs[rs.length >> 1])} (${num(rs[0])}-${num(rs.at(-1))}) | ${rs.filter((x) => x >= ratio(a)).length} de ${rs.length} |`);
  }
}

// LO QUE MÁS IMPORTA DE B: ¿es el calendario otra vez?
linea("B · ¿ES EL CALENDARIO OTRA VEZ? — el envase vacío por día de la semana y por día del mes");
L(`  Si vuelve a haber un día que manda, la señal está midiendo el calendario, no el ruido.`);
L(`\n  POR DÍA DE LA SEMANA (envase vacío, sin ninguna señal):`);
L(`  | día | n (A) | RATIO A | acierta A | n (B) | RATIO B | acierta B |`);
L(`  |---|---|---|---|---|---|---|`);
for (let w = 1; w <= 5; w++) {
  const a = mide(POR_ENV[0].filter((o) => o.dow === w)), b = mide(POR_ENV[1].filter((o) => o.dow === w));
  if (!a.n) continue;
  L(`  | ${DIASEM[w]} | ${mil(a.n)} | ${num(ratio(a))} | ${pct(acierto(a))} | ${mil(b.n)} | ${num(ratio(b))} | ${pct(acierto(b))} |`);
}
L(`\n  Y LA SEÑAL B (ayer > 2%) POR DÍA DE LA SEMANA — envase A:`);
L(`  | día | n con señal | RATIO con señal | RATIO sin señal (mismo día) |`);
L(`  |---|---|---|---|`);
{
  const base = POR_ENV[0].filter((o) => sigB(o, 0) != null);
  for (let w = 1; w <= 5; w++) {
    const b2 = base.filter((o) => o.dow === w);
    const s = mide(b2.filter((o) => sigB(o, 0) > 0.020)), l = mide(b2);
    if (!l.n) continue;
    L(`  | ${DIASEM[w]} | ${mil(s.n)} | ${R(s)} | ${R(l)} |`);
  }
}
L(`\n  POR DÍA DE BOLSA DEL MES (envase vacío, sin señal) — envase A:`);
L(`  | día del mes | n | RATIO | acierta | plazo real medio | horquilla |`);
L(`  |---|---|---|---|---|---|`);
{
  const rs = [];
  for (let k = 0; k < 22; k++) {
    const a = mide(POR_ENV[0].filter((o) => o.dom === k));
    if (a.n < 200) continue;
    rs.push(ratio(a));
    L(`  | ${k + 1}º | ${mil(a.n)} | ${num(ratio(a))} | ${pct(acierto(a))} | ${num(a.dte / a.n, 1)} días | ${pct(a.horq / a.n)} |`);
  }
  const o2 = [...rs].sort((x, y) => x - y);
  L(`  los ${rs.length} días del mes van de ${num(o2[0])} a ${num(o2.at(-1))}, mediana ${num(o2[o2.length >> 1])}. El 1º da ${num(rs[0])}.`);
}
L(`\n  Y LA SEÑAL B (ayer > 2%) POR DÍA DEL MES — envase A (si un día se lleva todo, es calendario):`);
L(`  | día del mes | n con señal | RATIO con señal | RATIO sin señal |`);
L(`  |---|---|---|---|`);
{
  const base = POR_ENV[0].filter((o) => sigB(o, 0) != null);
  const rs = [];
  for (let k = 0; k < 22; k++) {
    const b2 = base.filter((o) => o.dom === k);
    const s = mide(b2.filter((o) => sigB(o, 0) > 0.020)), l = mide(b2);
    if (s.n < 100) continue;
    rs.push(ratio(s));
    L(`  | ${k + 1}º | ${mil(s.n)} | ${num(ratio(s))} | ${R(l)} |`);
  }
  const o2 = [...rs].sort((x, y) => x - y);
  if (o2.length) L(`  los ${rs.length} días del mes con señal van de ${num(o2[0])} a ${num(o2.at(-1))}, mediana ${num(o2[o2.length >> 1])}.`);
}

// examen completo de la mejor de B en el envase A
const mejorB = TAB_B.filter((x) => x.ei === 0 && x.a.n / ANOSCAL >= 200).sort((x, y) => ratio(y.a) - ratio(x.a))[0];
const RES_B = [];
if (mejorB) {
  const base = POR_ENV[0].filter((o) => mejorB.get(o, 0) != null);
  RES_B.push(examen(`B · ${mejorB.u.et}`, "A", base, base.filter((o) => mejorB.u.f(mejorB.get(o, 0))), mejorB.get, mejorB.u.f));
  const baseB = POR_ENV[1].filter((o) => mejorB.get(o, 0) != null);
  RES_B.push(examen(`B · ${mejorB.u.et} (la misma regla)`, "B", baseB, baseB.filter((o) => mejorB.u.f(mejorB.get(o, 0))), mejorB.get, mejorB.u.f));
}
// y la regla PUBLICADA (ayer > 2%) siempre, aunque no sea la mejor
const RES_B2 = [];
{
  const f = (v) => v > 0.020;
  for (let ei = 0; ei < 2; ei++) {
    const base = POR_ENV[ei].filter((o) => sigB(o, 0) != null);
    RES_B2.push(examen("B · LA REGLA PUBLICADA: ayer se movió más del 2%", ENVASES[ei].id, base, base.filter((o) => f(sigB(o, 0))), sigB, f));
  }
}

// ════════════════════════════════════════════════════════════════════════════════════════════
// C · EL FRENTE CARO
// ════════════════════════════════════════════════════════════════════════════════════════════
linea("SEÑAL C · EL FRENTE CARO — con el umbral ARREGLADO (percentil móvil del propio ticker)");
L(`  La pega era que un corte fijo compraba el 14.0% de los días en 2023 y el 49.1% en 2020.`);
L(`  Con el percentil móvil, la fracción de días que compra tiene que salir clavada al 20% todos los años.`);
L(`\n  COMPROBACIÓN DEL ARREGLO — % de días disponibles que compra la regla (percentil > 80), envase A:`);
L(`  | año | días disponibles | días que compra | % |`);
L(`  |---|---|---|---|`);
{
  const base = POR_ENV[0].filter((o) => sigC(o, 0) != null);
  const fr = [];
  for (const y of ANOS) {
    const b2 = base.filter((o) => o.ano === y);
    if (b2.length < 100) continue;
    const s = b2.filter((o) => sigC(o, 0) > 0.80).length;
    fr.push(s / b2.length);
    L(`  | ${y} | ${mil(b2.length)} | ${mil(s)} | ${pct(s / b2.length)} |`);
  }
  L(`  rango de la fracción: ${pct(Math.min(...fr))} a ${pct(Math.max(...fr))}  (antes: 14.0% a 49.1%)`);
}
const reglaC = (v) => v > 0.80;
const RES_C = [];
for (let ei = 0; ei < 2; ei++) {
  const base = POR_ENV[ei].filter((o) => sigC(o, 0) != null);
  const sel = base.filter((o) => reglaC(sigC(o, 0)));
  COMBOS++;
  RES_C.push(examen("C · EL FRENTE CARO (percentil móvil > 80)", ENVASES[ei].id, base, sel, sigC, reglaC));
}

// ════════════════════════════════════════════════════════════════════════════════════════════
// ¿SE APAGAN? — la pregunta que hay detrás de las tres
// ════════════════════════════════════════════════════════════════════════════════════════════
linea("¿SE APAGAN LAS TRES? — el mismo cuadro para las tres, por tercios, envase A");
L(`  | señal | total | 2016-2019 | 2020-2022 | 2023-2026 | listón restringido total |`);
L(`  |---|---|---|---|---|---|`);
const TRES = [
  ["A · la opción cara (>p80)", sigA, reglaA],
  ["B · ayer > 2%", sigB, (v) => v > 0.020],
  ["B · ayer en su quinto más alto", sigBp, (v) => v > 0.80],
  ["C · el frente caro (>p80 móvil)", sigC, reglaC],
];
for (const [et, get, f] of TRES) {
  const base = POR_ENV[0].filter((o) => get(o, 0) != null);
  const sel = base.filter((o) => f(get(o, 0)));
  const cel = TERCIOS.map(([ya, yb]) => { const s = mide(sel.filter((o) => o.ano >= ya && o.ano <= yb)); return s.n >= 100 ? `${num(ratio(s))} (n=${mil(s.n)})` : "n/d"; });
  L(`  | ${et} | **${num(ratio(mide(sel)))}** | ${cel.join(" | ")} | ${num(ratio(mide(base)))} |`);
}
L(`\n  Y el ENVASE VACÍO por tercios, para saber si lo que se apaga es la señal o el envase entero:`);
L(`  | envase | total | ${TERCIOS.map((t) => t[2]).join(" | ")} |`);
L(`  |---|---|${TERCIOS.map(() => "---").join("|")}|`);
for (let ei = 0; ei < 2; ei++) {
  const cel = TERCIOS.map(([ya, yb]) => { const s = mide(POR_ENV[ei].filter((o) => o.ano >= ya && o.ano <= yb)); return `${num(ratio(s))} (n=${mil(s.n)})`; });
  L(`  | ${ENVASES[ei].id} | ${num(ratio(VACIO[ei]))} | ${cel.join(" | ")} |`);
}

// ── LA VENTAJA SOBRE EL LISTÓN, año a año, para las tres ────────────────────────────────────
linea("LA VENTAJA SOBRE EL LISTÓN AÑO A AÑO — señal menos listón restringido (envase A)");
L(`  | año | A · la opción cara | B · ayer > 2% | B · ayer quinto alto | C · el frente caro |`);
L(`  |---|---|---|---|---|`);
for (const y of ANOS) {
  const cel = TRES.map(([, get, f]) => {
    const base = POR_ENV[0].filter((o) => get(o, 0) != null && o.ano === y);
    const sel = base.filter((o) => f(get(o, 0)));
    if (sel.length < 50) return "n/d";
    return `${num(ratio(mide(sel)) - ratio(mide(base)), 2)}`;
  });
  L(`  | ${y} | ${cel.join(" | ")} |`);
}

// ════════════════════════════════════════════════════════════════════════════════════════════
linea("RESUMEN");
L(`  PUERTAS ABIERTAS: ${COMBOS} combinaciones medidas`);
L(`    (3 señales × 5 montones × 2 envases = 30 en las escaleras, + las reglas de umbral de A, B y C)`);
L(`  operaciones ${mil(OPS.length)} · huecos ${mil(huecos)} (${pct(huecos / (huecos + OPS.length))})`);
L(`\n  EL ENVASE VACÍO AQUÍ (banda de plazo estrecha, universo diario):`);
for (let ei = 0; ei < 2; ei++) L(`    envase ${ENVASES[ei].id}: ratio ${num(ratio(VACIO[ei]))} · acierta ${pct(acierto(VACIO[ei]))} · n=${mil(VACIO[ei].n)}   [listón publicado ${num(ENVASES[ei].liston)}]`);
L(`\n  LAS TRES SEÑALES, envase A:`);
if (RES_A[0]) L(`    A · la opción cara (>p80)      : ratio ${num(RES_A[0].ratio)} (listón ${num(RES_A[0].ratioListon)}) · acierta ${pct(RES_A[0].acierto)} vs ${pct(RES_A[0].aciertoListon)} · ${mil(RES_A[0].opsAno)} ops/año · barajado mediana ${num(RES_A[0].barMediana)}`);
if (RES_B2[0]) L(`    B · ayer > 2%                  : ratio ${num(RES_B2[0].ratio)} (listón ${num(RES_B2[0].ratioListon)}) · acierta ${pct(RES_B2[0].acierto)} vs ${pct(RES_B2[0].aciertoListon)} · ${mil(RES_B2[0].opsAno)} ops/año · barajado mediana ${num(RES_B2[0].barMediana)}`);
if (RES_B[0]) L(`    B · ${mejorB.u.et}: ratio ${num(RES_B[0].ratio)} (listón ${num(RES_B[0].ratioListon)}) · acierta ${pct(RES_B[0].acierto)} vs ${pct(RES_B[0].aciertoListon)} · ${mil(RES_B[0].opsAno)} ops/año · barajado mediana ${num(RES_B[0].barMediana)}`);
if (RES_C[0]) L(`    C · el frente caro (>p80 móvil): ratio ${num(RES_C[0].ratio)} (listón ${num(RES_C[0].ratioListon)}) · acierta ${pct(RES_C[0].acierto)} vs ${pct(RES_C[0].aciertoListon)} · ${mil(RES_C[0].opsAno)} ops/año · barajado mediana ${num(RES_C[0].barMediana)}`);
L(`\n  LAS TRES SEÑALES, envase B:`);
if (RES_A[1]) L(`    A · la opción cara (>p80)      : ratio ${num(RES_A[1].ratio)} (listón ${num(RES_A[1].ratioListon)}) · acierta ${pct(RES_A[1].acierto)} vs ${pct(RES_A[1].aciertoListon)}`);
if (RES_B2[1]) L(`    B · ayer > 2%                  : ratio ${num(RES_B2[1].ratio)} (listón ${num(RES_B2[1].ratioListon)}) · acierta ${pct(RES_B2[1].acierto)} vs ${pct(RES_B2[1].aciertoListon)}`);
if (RES_C[1]) L(`    C · el frente caro (>p80 móvil): ratio ${num(RES_C[1].ratio)} (listón ${num(RES_C[1].ratioListon)}) · acierta ${pct(RES_C[1].acierto)} vs ${pct(RES_C[1].aciertoListon)}`);
L(`\n  minutos: ${num((Date.now() - t0) / 60000, 1)}`);
L(`${"═".repeat(112)}\n`);
