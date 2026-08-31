// ¿SE SUMAN O SON LA MISMA COSA VISTA CINCO VECES?
//
// ═══ QUÉ SE PREGUNTA ════════════════════════════════════════════════════════════════════════
//
// Cinco señales apuntan en la misma dirección — comprar cuando YA hay movimiento o la opción
// está CARA, nunca en la calma:
//     A · la opción cara      (cuña al dinero ÷ movimiento de 60 días, contra su propia historia)
//     B · el ruido de ayer    (ayer el subyacente se movió más del 2%)
//     C · el frente caro      (sigma de 30 días ÷ sigma de 180, contra su propia historia)
//     D · después del susto   (el mayor movimiento diario de las últimas 5 sesiones, contra su historia)
//     E · la sonrisa          (no dice CUÁNDO: dice QUÉ distancia comprar de las cinco disponibles)
//
// La sospecha: A, B y D son la misma cosa. Cuando una acción pega un salto, la opción se encarece
// de golpe pero la desviación de 60 días apenas se mueve, así que el cociente de A salta justo
// después del susto que miden B y D.
//
// PRIMERO se mide el SOLAPAMIENTO (tabla 5×5). LUEGO se combina lo que resulte independiente.
//
// ═══ EL DEFECTO DE CIMIENTOS QUE SE ARREGLA AQUÍ ════════════════════════════════════════════
//
// Todo lo medido hasta ahora entraba UNA VEZ AL MES POR TICKER, SIEMPRE EL PRIMER DÍA DE BOLSA
// DEL MES. Consecuencias:
//   · «ayer» era SIEMPRE el último día del mes  →  la señal B no era «ayer se movió», era
//     «el último día del mes se movió». Por eso su 1.51 se cayó a 1.08 al probar otros días.
//   · la muestra era de ~600 operaciones al año.
//   · el año a año quedaba a merced de en qué día del mes cayeron los sustos.
//
// Aquí se entra TODOS LOS DÍAS DE BOLSA. La cadencia mensual y la semanal se miden también, con
// la MISMA tubería, para poder comparar contra lo publicado y para ver cuánto de aquello era
// calendario. La diaria es la principal.
//
// ═══ EL ENVASE — fijado, no se toca ═════════════════════════════════════════════════════════
//
//   A: 10% fuera del dinero · 60 días de plazo · vender a los 30 días de bolsa
//   B:  5% fuera del dinero · 90 días de plazo · vender a los 30 días de bolsa
//   Opción SUELTA, una pata. Se COMPRA AL ASK y se VENDE AL BID. $1.000 en cada intento.
//
//   RATIO = dólares ganados ÷ dólares perdidos.   Objetivo 1.40.
//
// ═══ LAS REGLAS DE LA CASA ══════════════════════════════════════════════════════════════════
//   1. ask a la compra, bid a la venta. Nunca punto medio.
//   2. ningún modelo de precios. Black-Scholes no aparece.
//   3. un HUECO no es un cero: si falta la cadena del día de salida se descarta y se cuenta aparte.
//      Si la cadena está y el contrato no tiene puja, vale 0 y eso es un dato real.
//   4. sólo el pasado: toda ventana termina el día ANTERIOR al de la compra.
//   5. se dicen las puertas: cuántas combinaciones se midieron.
//
// ═══ EL PRECIO DEL SUBYACENTE ═══════════════════════════════════════════════════════════════
// Paridad put-call SÓLO EN EL VENCIMIENTO MÁS CERCANO (la versión corregida de
// z1-la-rejilla-completa.mjs). Se reutiliza la serie ya construida y cacheada por
// y10-la-forma-de-la-sonrisa.mjs, y se vuelve a cotejar contra los cierres reales de disco.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/w3-se-suman-o-son-la-misma.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const CIERRES = "scripts/cache-theta/cierres";
const SPOTCACHE = "scripts/cache-theta/y10-spots.json";

// ── envase, fijado ──────────────────────────────────────────────────────────
const APUESTA = 1000;
const ASKMIN = 0.10;
const TOLK = 0.50;
const SALIDA = 30;                                    // días de bolsa hasta vender
const DISTS = [0.02, 0.05, 0.10, 0.15, 0.20];
const ENVASES = [
  { nom: "A", dte: 60, fija: 0.10, hBolsa: 41 },      // 60 días naturales ≈ 41 de bolsa
  { nom: "B", dte: 90, fija: 0.05, hBolsa: 62 },
];
const tolDte = (d) => Math.max(6, Math.round(d * 0.28));

// ── la curva, para la señal C ───────────────────────────────────────────────
const TRAMO_F = [30, 10];       // frente: vencimiento más cercano a 30 días, ±10
const TRAMO_B = [180, 45];      // fondo:  más cercano a 180, ±45

// ── ventanas de señal, todas terminan el día ANTERIOR ───────────────────────
const VENT_PCTL = 250;          // días de historia propia contra los que se percentila
const MIN_PCTL = 150;           // mínimo de valores válidos dentro de la ventana
const VENT_RV = 60;             // desviación de los retornos diarios (señal A)
const MIN_RV = 48;
const VENT_H = 520;             // historia para el movimiento a plazo (señal E)
const MIN_H = 250;
const MIN_HIST_E = 6;           // observaciones previas para saber qué es «lo normal» (señal E)

// ── umbrales, tomados de los hallazgos previos, NO barridos aquí ────────────
const U_A = 0.80;               // el quinto más caro
const U_B = 0.02;               // ayer se movió más del 2%
const U_C = 0.60;               // el 40% con el frente más caro
const U_D = 0.80;               // el quinto más alto

// ── barajado: VEINTE desplazamientos fijos, en días de bolsa ────────────────
const DESPLS = [];
for (let k = 1; k <= 10; k++) { DESPLS.push(63 * k); DESPLS.push(-63 * k); }

// ── formato: punto para decimales, coma para miles ──────────────────────────
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "—");
const f1 = (x) => (Number.isFinite(x) ? x.toFixed(1) : "—");
const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) + "%" : "—");
const num = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : "—");
const usd = (n) => (Number.isFinite(n) ? "$" + Math.round(n).toLocaleString("en-US") : "—");

const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sdArr = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const mediana = (v) => { if (!v.length) return NaN; const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const cal = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const L = (x = "") => console.log(x);
const linea = (t) => { L(`\n${"═".repeat(108)}`); L("  " + t); L("═".repeat(108)); };

// ════════════════════════════════════════════════════════════════════════════
// ÍNDICE DE DÍAS
// ════════════════════════════════════════════════════════════════════════════
const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();
// Sólo tickers con historia de verdad: con 83 días no hay ni ventana de 250 ni un año de operaciones.
let TICKERS = [...diasPorSim.keys()].filter((t) => diasPorSim.get(t).length >= 800).sort();
if (process.env.SOLO) TICKERS = TICKERS.filter((t) => process.env.SOLO.split(",").includes(t));
const TOTDIAS = TICKERS.reduce((a, t) => a + diasPorSim.get(t).length, 0);

linea("¿SE SUMAN O SON LA MISMA COSA VISTA CINCO VECES?");
L(`  ${TICKERS.length} tickers · ${num(TOTDIAS)} días de cadena · ${diasPorSim.get(TICKERS[0])[0]} → ${diasPorSim.get(TICKERS[0]).at(-1)}`);
L(`  ENTRADA TODOS LOS DÍAS DE BOLSA (se arregla el «una vez al mes, siempre el día 1»).`);

// ════════════════════════════════════════════════════════════════════════════
// LA SERIE DE PRECIOS — reutilizada del caché y cotejada contra los cierres reales
// ════════════════════════════════════════════════════════════════════════════
if (!existsSync(SPOTCACHE)) { console.error(`FALTA ${SPOTCACHE}. Correr antes y10-la-forma-de-la-sonrisa.mjs.`); process.exit(1); }
const SPOTS = JSON.parse(readFileSync(SPOTCACHE, "utf8"));
{
  const errs = []; let comparados = 0, sinCierres = 0;
  for (const t of TICKERS) {
    const p = `${CIERRES}/${t}.json`;
    if (!existsSync(p)) { sinCierres++; continue; }
    const cl = JSON.parse(readFileSync(p, "utf8"));
    for (const [d, v] of Object.entries(cl)) { const s = SPOTS[t]?.[d]; if (s > 0 && v > 0) { errs.push(Math.abs(s / v - 1)); comparados++; } }
  }
  errs.sort((a, b) => a - b);
  L(`  spot por paridad put-call (vencimiento más cercano): ${num(comparados)} días cotejados contra cierres reales · ` +
    `error mediano ${pct(errs[errs.length >> 1])} · peor 10% ${pct(errs[Math.floor(errs.length * 0.9)])} · ${sinCierres} tickers sin fichero de cierres`);
}

function leer(sym, dia) {
  const f = `${CDIR}/${sym}_d${dia}.json`;
  if (!existsSync(f)) return null;
  try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; }
}

/** La cuña al dinero, en ASK (lo que de verdad se paga): askC + askP del strike más cercano al precio. */
function cunaAsk(g, S) {
  let K = null, dm = Infinity;
  for (const cl of Object.keys(g)) {
    if (cl.slice(-1) !== "C") continue;
    const k = Number(cl.slice(0, -2));
    if (!g[`${k}|P`]) continue;
    const d = Math.abs(k - S);
    if (d < dm) { dm = d; K = k; }
  }
  if (K == null || Math.abs(K / S - 1) > 0.05) return null;
  const c = g[`${K}|C`], p = g[`${K}|P`];
  if (!(c[1] > 0) || !(p[1] > 0)) return null;
  return (c[1] + p[1]) / S;
}
/** La cuña a punto medio, para la CURVA (comparar dos plazos: si se usa el ask, el frente sale
 *  caro sólo porque su horquilla es más ancha en porcentaje). Es exactamente sigmaDe() de y4. */
function cunaMid(g, S) {
  let mejor = null, dm = Infinity;
  for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== "C") continue;
    const K = Number(cl.slice(0, -2));
    const p = g[`${K}|P`];
    if (!p || !(ba[1] > 0) || !(p[1] > 0)) continue;
    const d = Math.abs(K - S);
    if (d < dm) { dm = d; mejor = { K, c: (ba[0] + ba[1]) / 2, p: (p[0] + p[1]) / 2 }; }
  }
  if (!mejor || dm > S * 0.05) return null;
  const cu = mejor.c + mejor.p;
  return cu > 0 ? cu / S : null;
}
function expCerca(c, hoy, obj, tol) {
  let e = null, dd = Infinity, dt = 0;
  for (const x of Object.keys(c)) { const d = cal(hoy, x); if (d < 1) continue; const q = Math.abs(d - obj); if (q < dd) { dd = q; e = x; dt = d; } }
  return e && dd <= tol ? { exp: e, dte: dt } : null;
}

/** Percentil de arr[i] contra sus propios VENT_PCTL valores ANTERIORES (hoy no entra). */
function pctlRolling(arr, i) {
  const v = arr[i];
  if (!Number.isFinite(v)) return NaN;
  let n = 0, men = 0;
  for (let j = Math.max(0, i - VENT_PCTL); j < i; j++) { const x = arr[j]; if (!Number.isFinite(x)) continue; n++; if (x < v) men++; }
  return n < MIN_PCTL ? NaN : men / n;
}

// ════════════════════════════════════════════════════════════════════════════
// EL PASE POR TICKER
// ════════════════════════════════════════════════════════════════════════════
const T = [];   // un objeto por ticker con todo lo medido
let gLeidas = 0, gFallos = 0, gSinSpot = 0, gSinContrato = 0, gHuecos = 0, gTrunc = 0,
    gRotas = 0, gOps = 0, gEntradas = 0;
let rotoSinSpot = 0, rotoContraCierre = 0, rotoSalto = 0, saltoSalvado = 0;

const t0 = Date.now();
for (const sym of TICKERS) {
  const dias = diasPorSim.get(sym);
  const n = dias.length;
  const spotMap = SPOTS[sym] || {};
  const cl = existsSync(`${CIERRES}/${sym}.json`) ? JSON.parse(readFileSync(`${CIERRES}/${sym}.json`, "utf8")) : null;

  // ── 1) precio, días rotos y retornos ──────────────────────────────────────
  const S = new Float64Array(n).fill(NaN);
  for (let i = 0; i < n; i++) { const v = spotMap[dias[i]]; if (v > 0) S[i] = v; }
  const ro = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (!Number.isFinite(S[i])) { ro[i] = 1; rotoSinSpot++; continue; }
    const c = cl?.[dias[i]];
    if (c > 0 && Math.abs(S[i] / c - 1) > 0.05) { ro[i] = 1; rotoContraCierre++; continue; }
    if (i > 0 && Number.isFinite(S[i - 1])) {
      const rat = S[i] / S[i - 1];
      if (Math.abs(rat - 1) > 0.35) {
        const c0 = cl?.[dias[i - 1]], c1 = cl?.[dias[i]];
        const conf = c0 > 0 && c1 > 0 && Math.abs(rat / (c1 / c0) - 1) < 0.03;
        if (conf) saltoSalvado++; else { ro[i] = 1; rotoSalto++; }
      }
    }
  }
  const r = new Float64Array(n).fill(NaN);            // retorno logarítmico del día i
  for (let i = 1; i < n; i++) {
    if (ro[i] || ro[i - 1]) continue;
    if (cal(dias[i - 1], dias[i]) > 5) continue;      // hueco de calendario: no es un retorno de un día
    r[i] = Math.log(S[i] / S[i - 1]);
  }
  // serie encadenada limpia (para el movimiento a plazo de la señal E, sin escalones de split)
  const adj = new Float64Array(n);
  adj[0] = 100;
  for (let i = 1; i < n; i++) adj[i] = adj[i - 1] * Math.exp(Number.isFinite(r[i]) ? r[i] : 0);

  // ── 2) señales que NO necesitan la cadena: B (ruido de ayer) y D (el susto) ──
  const sigB = new Int8Array(n).fill(-1);            // -1 = no medible
  const crudoD = new Float64Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    if (i >= 1 && Number.isFinite(r[i - 1])) sigB[i] = Math.abs(r[i - 1]) > U_B ? 1 : 0;
    // D: mayor movimiento diario de las 5 sesiones que TERMINAN AYER
    let mx = 0, c = 0;
    for (let j = i - 5; j <= i - 1; j++) { if (j < 0 || !Number.isFinite(r[j])) continue; c++; const a = Math.abs(r[j]); if (a > mx) mx = a; }
    if (c >= 4) crudoD[i] = mx;
  }
  const pD = new Float64Array(n).fill(NaN);
  for (let i = 0; i < n; i++) pD[i] = pctlRolling(crudoD, i);

  // ── 3) desviación de 60 días y movimiento a plazo, sólo con el pasado ──────
  const rv60 = new Float64Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const v = [];
    for (let j = i - 1; j >= 0 && v.length < VENT_RV; j--) if (Number.isFinite(r[j])) v.push(r[j]);
    if (v.length < MIN_RV) continue;
    const s = sdArr(v);
    if (s > 0) rv60[i] = s;
  }
  const sigH = ENVASES.map(() => new Float64Array(n).fill(NaN));
  for (let e = 0; e < ENVASES.length; e++) {
    const h = ENVASES[e].hBolsa;
    for (let i = 0; i < n; i++) {
      if (i < MIN_H) continue;
      const v = [];
      for (let j = Math.max(0, i - VENT_H); j + h < i; j++) { if (ro[j] || ro[j + h]) continue; v.push(adj[j + h] / adj[j] - 1); }
      if (v.length < 60) continue;
      const s = sdArr(v);
      if (s > 0) sigH[e][i] = s;
    }
  }

  // ── 4) EL PASE POR LAS CADENAS ────────────────────────────────────────────
  //   por cada día: cuña del vencimiento comprado (señal A), curva 30/180 (señal C),
  //   y los 5 contratos por envase y lado. Se resuelven además las salidas que vencen hoy.
  const crudoA = ENVASES.map(() => new Float64Array(n).fill(NaN));   // cuña ÷ movimiento
  const crudoC = new Float64Array(n).fill(NaN);                      // sigma frente ÷ sigma fondo
  // ask y pnl indexados [envase][tipo][dist] → Float64Array(n)
  const mk = () => ENVASES.map(() => [0, 1].map(() => DISTS.map(() => new Float64Array(n).fill(NaN))));
  const ASK = mk(), PNL = mk(), HORQ = mk(), DREAL = mk();
  const pend = new Map();   // fechaSalida → [{i, e, tp, a, clave, exp, ask}]

  for (let i = 0; i < n; i++) {
    const dia = dias[i];
    // primero: resolver lo que vence hoy (necesita la cadena de hoy de todos modos)
    const cola = pend.get(dia);
    const c = leer(sym, dia);
    if (c) gLeidas++; else gFallos++;
    if (cola) {
      pend.delete(dia);
      for (const p of cola) {
        if (!c) { gHuecos++; continue; }
        const g = c[p.exp];
        if (!g) { gHuecos++; continue; }               // falta el vencimiento entero: HUECO, no cero
        const bid = g[p.clave]?.[0] ?? 0;              // la cadena está y no hay puja → 0 real
        PNL[p.e][p.tp][p.a][p.i] = APUESTA * (bid - p.ask) / p.ask;
        gOps++;
      }
    }
    if (!c) continue;
    const sp = S[i];
    if (!Number.isFinite(sp) || ro[i]) { gSinSpot++; continue; }
    gEntradas++;

    // ── la curva 30/180, a punto medio (señal C) ────────────────────────────
    const ef = expCerca(c, dia, TRAMO_F[0], TRAMO_F[1]);
    const eb = expCerca(c, dia, TRAMO_B[0], TRAMO_B[1]);
    if (ef && eb) {
      const uf = cunaMid(c[ef.exp], sp), ub = cunaMid(c[eb.exp], sp);
      if (uf > 0 && ub > 0) {
        const sf = uf / Math.sqrt(ef.dte / 365), sb = ub / Math.sqrt(eb.dte / 365);
        if (sf > 0 && sb > 0) crudoC[i] = sf / sb;
      }
    }

    for (let e = 0; e < ENVASES.length; e++) {
      const env = ENVASES[e];
      const eo = expCerca(c, dia, env.dte, tolDte(env.dte));
      if (!eo) { gSinContrato += 2 * DISTS.length; continue; }
      const g = c[eo.exp];

      // ── señal A: la cuña al dinero del vencimiento que se compra ÷ el movimiento ──
      const u = cunaAsk(g, sp);
      if (u != null && rv60[i] > 0) {
        const mov = rv60[i] * Math.sqrt(Math.max(1, eo.dte * 252 / 365));
        if (mov > 0) crudoA[e][i] = u / mov;
      }

      // ── la salida: 30 días de bolsa, o el vencimiento si cae antes ──────────
      const dNat = dias[i + SALIDA] ?? null;
      let fSal = null, trunc = 0;
      if (dNat && dNat < eo.exp) fSal = dNat;
      else if (eo.exp <= (dias.at(-1) ?? "")) { fSal = eo.exp; trunc = 1; }
      // si no hay ninguna de las dos, la operación no se puede cerrar: es un HUECO

      for (let tp = 0; tp < 2; tp++) {
        const tipo = tp === 0 ? "C" : "P";
        const objs = DISTS.map((d) => (tipo === "C" ? sp * (1 + d) : sp * (1 - d)));
        const cand = DISTS.map(() => null);
        for (const [clv, ba] of Object.entries(g)) {
          if (clv.slice(-1) !== tipo) continue;
          if (!(ba[1] >= ASKMIN)) continue;
          const K = Number(clv.slice(0, -2));
          for (let a = 0; a < DISTS.length; a++) {
            const dd = Math.abs(K - objs[a]);
            if (!cand[a] || dd < cand[a].dd) cand[a] = { dd, K, clave: clv, bid: ba[0], ask: ba[1] };
          }
        }
        for (let a = 0; a < DISTS.length; a++) {
          const ct = cand[a];
          if (!ct) { gSinContrato++; continue; }
          const dr = tipo === "C" ? ct.K / sp - 1 : 1 - ct.K / sp;
          if (Math.abs(dr - DISTS[a]) > DISTS[a] * TOLK) { gSinContrato++; continue; }
          ASK[e][tp][a][i] = ct.ask;
          HORQ[e][tp][a][i] = (ct.ask - ct.bid) / ct.ask;
          DREAL[e][tp][a][i] = dr;
          if (!fSal) { gHuecos++; continue; }
          if (trunc) gTrunc++;
          if (!pend.has(fSal)) pend.set(fSal, []);
          pend.get(fSal).push({ i, e, tp, a, clave: ct.clave, exp: eo.exp, ask: ct.ask });
        }
      }
    }
  }
  for (const cola of pend.values()) gHuecos += cola.length;   // salidas que nunca se pudieron leer

  // ── 5) percentiles de A y C, y descarte de operaciones con un día roto dentro ──
  const pA = ENVASES.map(() => new Float64Array(n).fill(NaN));
  for (let e = 0; e < ENVASES.length; e++) for (let i = 0; i < n; i++) pA[e][i] = pctlRolling(crudoA[e], i);
  const pC = new Float64Array(n).fill(NaN);
  for (let i = 0; i < n; i++) pC[i] = pctlRolling(crudoC, i);

  // ¿hay algún día roto entre la compra y la venta? Entonces ni el precio ni la identidad del
  // contrato son de fiar (un split le cambia el strike). Se descarta la operación entera.
  const sucia = new Uint8Array(n);
  { let ultRoto = -1;
    const roAcum = new Int32Array(n + 1);
    for (let i = 0; i < n; i++) roAcum[i + 1] = roAcum[i] + ro[i];
    for (let i = 0; i < n; i++) { const j = Math.min(n - 1, i + SALIDA); sucia[i] = roAcum[j + 1] - roAcum[i] > 0 ? 1 : 0; }
    void ultRoto;
  }
  for (let e = 0; e < ENVASES.length; e++) for (let tp = 0; tp < 2; tp++) for (let a = 0; a < DISTS.length; a++)
    for (let i = 0; i < n; i++) if (sucia[i] && Number.isFinite(PNL[e][tp][a][i])) { PNL[e][tp][a][i] = NaN; gRotas++; }

  // ── 6) la señal E: qué distancia está hoy más barata DE LO NORMAL para este ticker ──
  //   vara = ask ÷ (precio × movimiento típico a ese plazo).  z = vara de hoy ÷ mediana de su
  //   propia historia previa (misma distancia, mismo lado, mismo envase). Se elige el mínimo z.
  const ELEC = ENVASES.map(() => [0, 1].map(() => new Int8Array(n).fill(-1)));
  for (let e = 0; e < ENVASES.length; e++) for (let tp = 0; tp < 2; tp++) {
    const hist = DISTS.map(() => []);
    for (let i = 0; i < n; i++) {
      const sh = sigH[e][i];
      const z = new Array(DISTS.length).fill(NaN);
      const vara = new Array(DISTS.length).fill(NaN);
      for (let a = 0; a < DISTS.length; a++) {
        const ask = ASK[e][tp][a][i];
        if (!(ask > 0) || !(sh > 0) || !Number.isFinite(S[i])) continue;
        vara[a] = ask / (S[i] * sh);
        if (hist[a].length >= MIN_HIST_E) { const md = mediana(hist[a]); if (md > 0) z[a] = vara[a] / md; }
      }
      let b = -1, bv = Infinity, disp = 0;
      for (let a = 0; a < DISTS.length; a++) if (Number.isFinite(z[a])) { disp++; if (z[a] < bv) { bv = z[a]; b = a; } }
      if (disp >= 3) ELEC[e][tp][i] = b;
      for (let a = 0; a < DISTS.length; a++) if (Number.isFinite(vara[a])) hist[a].push(vara[a]);   // la historia se rellena DESPUÉS
    }
  }

  T.push({ sym, dias, n, S, ro, r, sigB, pA, pC, pD, ELEC, PNL, ASK, HORQ, DREAL, crudoA, crudoC });
  process.stderr.write(`\r   ${sym.padEnd(6)} · ${num(gOps)} operaciones · ${Math.round((Date.now() - t0) / 1000)}s     `);
}
process.stderr.write("\n");

// ════════════════════════════════════════════════════════════════════════════
// SANIDAD
// ════════════════════════════════════════════════════════════════════════════
linea("SANIDAD — antes de mirar ningún resultado");
L(`  ficheros de cadena leídos: ${num(gLeidas)} · no encontrados: ${num(gFallos)}`);
L(`  días de entrada con precio válido: ${num(gEntradas)} · descartados por no poder deducir el precio: ${num(gSinSpot)}`);
L(`  combinaciones sin contrato que encaje (strike demasiado lejos o ask < $${ASKMIN.toFixed(2)}): ${num(gSinContrato)}`);
L(`  operaciones CERRADAS con bid real: ${num(gOps)}`);
L(`  HUECOS descartados (falta la cadena del día de salida o el vencimiento entero): ${num(gHuecos)} (${pct(gHuecos / (gHuecos + gOps))})`);
L(`  salidas truncadas al vencimiento porque los 30 días de bolsa caían más allá: ${num(gTrunc)}`);
L(`  operaciones anuladas por haber un DÍA ROTO entre la compra y la venta: ${num(gRotas)}`);
L(`\n  DÍAS ROTOS marcados en la serie de precios:`);
L(`    sin precio deducible                                       : ${num(rotoSinSpot)}`);
L(`    se apartan más del 5% del CIERRE REAL de disco             : ${num(rotoContraCierre)}   ← META, cuya raíz es de otra empresa entre 09/2021 y 01/2022`);
L(`    saltan más del 35% en un día y el cierre real NO lo avala   : ${num(rotoSalto)}   ← los splits`);
L(`    saltos de más del 35% que el cierre real SÍ avala, se quedan: ${num(saltoSalvado)}`);

// ════════════════════════════════════════════════════════════════════════════
// LA PUERTA COMÚN — todos los brazos operan exactamente los mismos días o ninguno
// ════════════════════════════════════════════════════════════════════════════
//
// Si un brazo pudiera operar días que otro no, la comparación no sería del mismo mercado.
// Un día (ticker, día, envase, lado) es OPERABLE si:
//   · el contrato de la distancia FIJA existe y su operación se cerró con bid real,
//   · las cuatro señales de CUÁNDO (A, B, C, D) son medibles ese día,
//   · la señal E tiene una elección hecha y ESA elección también se cerró con bid real.
for (const t of T) {
  t.gate = ENVASES.map((env, e) => [0, 1].map((_, tp) => {
    const iFija = DISTS.indexOf(env.fija);
    const g = new Uint8Array(t.n);
    for (let i = 0; i < t.n; i++) {
      if (!Number.isFinite(t.PNL[e][tp][iFija][i])) continue;
      if (!Number.isFinite(t.pA[e][i]) || !Number.isFinite(t.pC[i]) || !Number.isFinite(t.pD[i]) || t.sigB[i] < 0) continue;
      const el = t.ELEC[e][tp][i];
      if (el < 0 || !Number.isFinite(t.PNL[e][tp][el][i])) continue;
      g[i] = 1;
    }
    return g;
  }));
}

// ── cadencias ───────────────────────────────────────────────────────────────
function mascaraCadencia(t, modo) {
  const m = new Uint8Array(t.n);
  if (modo === "D") { m.fill(1); return m; }
  const vistos = new Set();
  for (let i = 0; i < t.n; i++) {
    const d = t.dias[i];
    let k;
    if (modo === "M") k = d.slice(0, 6);
    else { const ju = Math.floor(ms(d) / 86_400_000); k = Math.floor((ju + 3) / 7); }   // semana ISO
    if (vistos.has(k)) continue;
    vistos.add(k); m[i] = 1;
  }
  return m;
}
const CAD = { D: T.map((t) => mascaraCadencia(t, "D")), S: T.map((t) => mascaraCadencia(t, "S")), M: T.map((t) => mascaraCadencia(t, "M")) };
// LA AUDITORÍA DEL CALENDARIO: entrar el k-ésimo día de bolsa de cada mes, k = 1…20.
// Si el k=1 (el que se usó siempre) es un valor cualquiera entre los otros diecinueve, el
// resultado publicado era del calendario. Si destaca, el turno de mes es real.
for (let k = 1; k <= 20; k++) {
  CAD["k" + k] = T.map((t) => {
    const m = new Uint8Array(t.n);
    const cont = new Map();
    for (let i = 0; i < t.n; i++) {
      const mes = t.dias[i].slice(0, 6);
      const c = (cont.get(mes) ?? 0) + 1;
      cont.set(mes, c);
      if (c === k) m[i] = 1;
    }
    return m;
  });
}

// ── las señales, como funciones de (ticker, envase, día) ────────────────────
const SENALES = {
  A: { et: "A · la opción CARA", f: (t, e, i) => t.pA[e][i] > U_A },
  B: { et: "B · el RUIDO de ayer", f: (t, e, i) => t.sigB[i] === 1 },
  C: { et: "C · el FRENTE caro", f: (t, e, i) => t.pC[i] > U_C },
  D: { et: "D · después del SUSTO", f: (t, e, i) => t.pD[i] > U_D },
};
const CLAVES = ["A", "B", "C", "D"];

// ════════════════════════════════════════════════════════════════════════════
// 1) EL SOLAPAMIENTO — la tabla 5×5, antes de combinar nada
// ════════════════════════════════════════════════════════════════════════════
//
// E no dice CUÁNDO, así que para poder ponerla en la misma tabla se le da una lectura binaria:
// «E dispara» = E elige una distancia DISTINTA de la fija del envase. Es la única forma honesta
// de meterla, y por eso se dice.
function disparoE(t, e, tp, i) { const el = t.ELEC[e][tp][i]; return el >= 0 && el !== DISTS.indexOf(ENVASES[e].fija); }

const ENV_PRINCIPAL = 0;   // envase A
{
  linea("1 · EL SOLAPAMIENTO — ¿cuántas veces disparan dos señales el MISMO día? (envase A, cadencia diaria)");
  const claves5 = [...CLAVES, "E"];
  const disp = {};   // clave → array de bits sobre todos los (ticker, día, lado) operables
  const N = [];
  for (const k of claves5) disp[k] = [];
  let tot = 0;
  for (const t of T) for (let tp = 0; tp < 2; tp++) {
    const g = t.gate[ENV_PRINCIPAL][tp];
    for (let i = 0; i < t.n; i++) {
      if (!g[i] || !CAD.D[T.indexOf(t)][i]) continue;
      for (const k of claves5) disp[k].push(k === "E" ? (disparoE(t, ENV_PRINCIPAL, tp, i) ? 1 : 0) : (SENALES[k].f(t, ENV_PRINCIPAL, i) ? 1 : 0));
      tot++;
    }
  }
  void N;
  L(`  ${num(tot)} ocasiones operables (ticker × día × lado).  Fracción de días en que dispara cada una:`);
  L(`  | señal | dispara |`);
  L(`  |---|---|`);
  for (const k of claves5) L(`  | ${k} | ${pct(media(disp[k]))} |`);

  L(`\n  SOLAPAMIENTO — arriba de la diagonal: de los días en que dispara la de la FILA, qué % dispara también la de la COLUMNA.`);
  L(`  Debajo de la diagonal: el JACCARD (días con las dos ÷ días con alguna). 100% = son la misma señal.`);
  L(`  | | ${claves5.join(" | ")} |`);
  L(`  |---|${claves5.map(() => "---").join("|")}|`);
  for (let a = 0; a < claves5.length; a++) {
    const fila = [];
    for (let b = 0; b < claves5.length; b++) {
      if (a === b) { fila.push("—"); continue; }
      const A = disp[claves5[a]], B = disp[claves5[b]];
      let na = 0, nb = 0, amb = 0, alg = 0;
      for (let i = 0; i < A.length; i++) { na += A[i]; nb += B[i]; if (A[i] && B[i]) amb++; if (A[i] || B[i]) alg++; }
      fila.push(b > a ? pct(amb / Math.max(1, na)) : pct(amb / Math.max(1, alg)));
      void nb;
    }
    L(`  | **${claves5[a]}** | ${fila.join(" | ")} |`);
  }

  L(`\n  LO QUE MANDA — la CORRELACIÓN entre los disparos (0 = independientes, 1 = la misma señal):`);
  L(`  | par | correlación de los disparos | ¿lo mismo? |`);
  L(`  |---|---|---|`);
  const pares = [];
  for (let a = 0; a < claves5.length; a++) for (let b = a + 1; b < claves5.length; b++) {
    const A = disp[claves5[a]], B = disp[claves5[b]];
    const ma = media(A), mb = media(B);
    let cov = 0, va = 0, vb = 0;
    for (let i = 0; i < A.length; i++) { cov += (A[i] - ma) * (B[i] - mb); va += (A[i] - ma) ** 2; vb += (B[i] - mb) ** 2; }
    const rho = cov / Math.sqrt(va * vb);
    pares.push({ par: `${claves5[a]}–${claves5[b]}`, rho });
  }
  pares.sort((x, y) => y.rho - x.rho);
  for (const p of pares) L(`  | ${p.par} | ${f2(p.rho)} | ${p.rho > 0.60 ? "**SÍ, es la misma**" : p.rho > 0.30 ? "se parecen" : "independientes"} |`);

  // E metida a la fuerza como binaria da una fracción altísima (casi nunca coincide con la fija),
  // así que la columna E de arriba no dice gran cosa. Lo que sí dice algo: QUÉ distancia elige
  // cuando dispara cada una de las otras. Si E eligiera lo mismo siempre, no aportaría nada nuevo.
  L(`\n  QUÉ DISTANCIA ELIGE E, según qué otra señal esté disparando (la fija del envase A es 10%):`);
  L(`  | cuando dispara | distancia media que elige E | % de veces que elige la fija (10%) | n |`);
  L(`  |---|---|---|---|`);
  const filasE = [{ k: "nada (todos los días)", f: () => true }, ...CLAVES.map((k) => ({ k: SENALES[k].et, f: (t, e, tp, i) => SENALES[k].f(t, e, i) }))];
  for (const fe of filasE) {
    const ds = []; let fija = 0;
    for (const t of T) for (let tp = 0; tp < 2; tp++) {
      const g = t.gate[ENV_PRINCIPAL][tp];
      for (let i = 0; i < t.n; i++) {
        if (!g[i] || !fe.f(t, ENV_PRINCIPAL, tp, i)) continue;
        const el = t.ELEC[ENV_PRINCIPAL][tp][i];
        if (el < 0) continue;
        ds.push(DISTS[el]); if (el === DISTS.indexOf(ENVASES[ENV_PRINCIPAL].fija)) fija++;
      }
    }
    L(`  | ${fe.k} | ${pct(media(ds))} | ${pct(fija / Math.max(1, ds.length))} | ${num(ds.length)} |`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// EL MOTOR DE MEDIDA
// ════════════════════════════════════════════════════════════════════════════
const acc = () => ({ n: 0, win: 0, gan: 0, per: 0, anos: new Map(), tks: new Map(), primerDia: "99999999", ultDia: "0" });
function add(a, pnl, ano, sym, dia) {
  a.n++;
  if (pnl > 0) { a.win++; a.gan += pnl; } else a.per += -pnl;
  if (!a.anos.has(ano)) a.anos.set(ano, { n: 0, win: 0, gan: 0, per: 0 });
  const y = a.anos.get(ano); y.n++; if (pnl > 0) { y.win++; y.gan += pnl; } else y.per += -pnl;
  if (!a.tks.has(sym)) a.tks.set(sym, { n: 0, gan: 0, per: 0 });
  const k = a.tks.get(sym); k.n++; if (pnl > 0) k.gan += pnl; else k.per += -pnl;
  if (dia < a.primerDia) a.primerDia = dia;
  if (dia > a.ultDia) a.ultDia = dia;
}
const R = (a) => (a.per > 0 ? a.gan / a.per : (a.gan > 0 ? Infinity : NaN));
const AC = (a) => (a.n ? a.win / a.n : NaN);
const anosSpan = (a) => Math.max(0.1, (ms(a.ultDia) - ms(a.primerDia)) / 86_400_000 / 365.25);

/**
 * Mide un brazo. `cuando(t,e,tp,i)` decide si se compra; `strike` es "fija" o "E".
 * `desplaza` (opcional) mueve la SEÑAL dentro del mismo ticker: es el control barajado.
 */
function medir({ env = ENV_PRINCIPAL, cadencia = "D", cuando, strike = "fija", desplaza = 0, sin2020 = false } = {}) {
  const a = acc();
  const iFija = DISTS.indexOf(ENVASES[env].fija);
  for (let ti = 0; ti < T.length; ti++) {
    const t = T[ti];
    const cad = CAD[cadencia][ti];
    for (let tp = 0; tp < 2; tp++) {
      const g = t.gate[env][tp];
      for (let i = 0; i < t.n; i++) {
        if (!g[i] || !cad[i]) continue;
        const ano = t.dias[i].slice(0, 4);
        if (sin2020 && ano === "2020") continue;
        const j = desplaza ? i + desplaza : i;                 // el barajado mira la señal de otro día
        if (j < 0 || j >= t.n) continue;
        if (desplaza && !g[j]) continue;                       // la señal barajada tiene que ser medible
        if (cuando && !cuando(t, env, tp, j)) continue;
        const idx = strike === "E" ? t.ELEC[env][tp][desplaza ? j : i] : iFija;
        if (idx < 0) continue;
        const pnl = t.PNL[env][tp][idx][i];
        if (!Number.isFinite(pnl)) continue;
        add(a, pnl, ano, t.sym, t.dias[i]);
      }
    }
  }
  return a;
}
const opsAno = (a) => a.n / anosSpan(a);

/** Cuántos tickers hacen falta para la mitad del beneficio neto, y el ratio quitando el mejor. */
function concentracion(a) {
  const arr = [...a.tks.entries()].map(([s, k]) => ({ s, neto: k.gan - k.per })).sort((x, y) => y.neto - x.neto);
  const totPos = arr.filter((x) => x.neto > 0).reduce((s, x) => s + x.neto, 0);
  let ac = 0, cuantos = 0;
  for (const x of arr) { if (x.neto <= 0) break; ac += x.neto; cuantos++; if (ac >= totPos / 2) break; }
  const top = arr[0]?.s;
  let gan = 0, per = 0;
  for (const [s, k] of a.tks) if (s !== top) { gan += k.gan; per += k.per; }
  const perdedores = arr.filter((x) => x.neto < 0).length;
  return { cuantos, top, sinTop: per > 0 ? gan / per : NaN, tickers: a.tks.size, perdedores };
}
/** El barajado con VEINTE desplazamientos: se devuelve la mediana y el mejor de los veinte. */
function barajado(cfg) {
  const rs = [];
  for (const d of DESPLS) { const a = medir({ ...cfg, desplaza: d }); if (a.n > 50) rs.push(R(a)); }
  rs.sort((x, y) => x - y);
  return { mediana: mediana(rs), max: rs.at(-1), min: rs[0], n: rs.length };
}
function filaAnos(a) {
  const ys = [...a.anos.keys()].sort();
  return ys.map((y) => { const v = a.anos.get(y); return `${y}:${v.per > 0 ? (v.gan / v.per).toFixed(2) : "—"}`; }).join(" · ");
}
function anosPositivos(a) {
  const ys = [...a.anos.keys()].sort();
  let pos = 0, tot = 0;
  for (const y of ys) { const v = a.anos.get(y); if (v.n < 20) continue; tot++; if (v.per > 0 && v.gan / v.per >= 1) pos++; }
  return { pos, tot };
}

// ════════════════════════════════════════════════════════════════════════════
// 2) EL LISTÓN Y LAS CINCO SEÑALES SUELTAS, CON LAS TRES CADENCIAS
// ════════════════════════════════════════════════════════════════════════════
let COMBIS = 0;   // las puertas, contadas de verdad

const brazos = [
  { id: "—", et: "SIN señal (el envase vacío)", cuando: null, strike: "fija" },
  { id: "A", et: "A · la opción CARA (percentil > 80)", cuando: (t, e, tp, i) => SENALES.A.f(t, e, i), strike: "fija" },
  { id: "B", et: "B · el RUIDO de ayer (> 2%)", cuando: (t, e, tp, i) => SENALES.B.f(t, e, i), strike: "fija" },
  { id: "C", et: "C · el FRENTE caro (percentil > 60)", cuando: (t, e, tp, i) => SENALES.C.f(t, e, i), strike: "fija" },
  { id: "D", et: "D · después del SUSTO (percentil > 80)", cuando: (t, e, tp, i) => SENALES.D.f(t, e, i), strike: "fija" },
  { id: "E", et: "E · la SONRISA (sin filtro de día, elige el strike)", cuando: null, strike: "E" },
];

linea("2 · LAS CINCO SUELTAS — y qué le pasa a cada una al cambiar la cadencia de entrada");
L(`  Envase A (10% fuera · 60 días · salir a los 30 de bolsa). RATIO = dólares ganados ÷ perdidos.`);
L(`  | señal | MENSUAL (como se midió) ratio | acierta | n | SEMANAL ratio | acierta | n | DIARIA ratio | acierta | n | ops/año diaria | diaria SIN 2020 |`);
L(`  |---|---|---|---|---|---|---|---|---|---|---|---|`);
const sueltas = {};
for (const b of brazos) {
  const f = [];
  let dRef = null;
  for (const cad of ["M", "S", "D"]) {
    const a = medir({ cadencia: cad, cuando: b.cuando, strike: b.strike });
    COMBIS++;
    f.push(`${f2(R(a))} | ${pct(AC(a))} | ${num(a.n)}`);
    if (cad === "D") dRef = a;
  }
  sueltas[b.id] = dRef;
  const s20 = medir({ cuando: b.cuando, strike: b.strike, sin2020: true });
  COMBIS++;
  L(`  | ${b.et} | ${f.join(" | ")} | ${f1(opsAno(dRef))} | ${f2(R(s20))} |`);
}

// ── LA AUDITORÍA DEL CALENDARIO ─────────────────────────────────────────────
linea("2b · LA AUDITORÍA DEL CALENDARIO — ¿y si en vez del PRIMER día del mes se entra el k-ésimo?");
L(`  Todo lo publicado entraba con k=1. Si k=1 es un valor cualquiera entre los otros diecinueve,`);
L(`  el resultado era del calendario y no de la señal.`);
L(`  | k (día de bolsa del mes) | listón sin señal | A · la opción cara | B · el ruido de ayer | D · después del susto |`);
L(`  |---|---|---|---|---|`);
const barridoK = { "—": [], A: [], B: [], D: [] };
for (let k = 1; k <= 20; k++) {
  const fila = [];
  for (const id of ["—", "A", "B", "D"]) {
    const b = brazos.find((x) => x.id === id);
    const a = medir({ cadencia: "k" + k, cuando: b.cuando, strike: b.strike });
    COMBIS++;
    barridoK[id].push({ k, r: R(a), n: a.n });
    fila.push(`${f2(R(a))} (n=${num(a.n)})`);
  }
  L(`  | ${k}${k === 1 ? " ← **el que se usó siempre**" : ""} | ${fila.join(" | ")} |`);
}
L(`\n  | brazo | k=1 (el publicado) | mediana de los 20 | el mejor de los 20 | el peor | puesto de k=1 |`);
L(`  |---|---|---|---|---|---|`);
for (const id of ["—", "A", "B", "D"]) {
  const v = barridoK[id].map((x) => x.r).filter(Number.isFinite);
  const k1 = barridoK[id][0].r;
  const orden = [...v].sort((a, b) => b - a);
  L(`  | ${brazos.find((x) => x.id === id).et} | **${f2(k1)}** | ${f2(mediana(v))} | ${f2(orden[0])} | ${f2(orden.at(-1))} | ${orden.indexOf(k1) + 1}º de ${v.length} |`);
}

// ════════════════════════════════════════════════════════════════════════════
// 3) LAS COMBINACIONES
// ════════════════════════════════════════════════════════════════════════════
const combos = [];
// pares: exigir LAS DOS, y exigir AL MENOS UNA
for (let a = 0; a < CLAVES.length; a++) for (let b = a + 1; b < CLAVES.length; b++) {
  const ka = CLAVES[a], kb = CLAVES[b];
  combos.push({ id: `${ka}+${kb}`, et: `${ka} Y ${kb} a la vez`, cuando: (t, e, tp, i) => SENALES[ka].f(t, e, i) && SENALES[kb].f(t, e, i), strike: "fija", fam: "Y" });
  combos.push({ id: `${ka}|${kb}`, et: `${ka} O ${kb} (al menos una)`, cuando: (t, e, tp, i) => SENALES[ka].f(t, e, i) || SENALES[kb].f(t, e, i), strike: "fija", fam: "O" });
}
// dos pisos: una decide CUÁNDO, E decide QUÉ STRIKE
for (const k of CLAVES) combos.push({ id: `${k}→E`, et: `${k} decide CUÁNDO · E decide QUÉ STRIKE`, cuando: (t, e, tp, i) => SENALES[k].f(t, e, i), strike: "E", fam: "2pisos" });
// votaciones
const cuenta = (t, e, i) => CLAVES.reduce((s, k) => s + (SENALES[k].f(t, e, i) ? 1 : 0), 0);
for (const m of [1, 2, 3, 4]) {
  combos.push({ id: `≥${m}de4`, et: `al menos ${m} de las cuatro (A,B,C,D)`, cuando: (t, e, tp, i) => cuenta(t, e, i) >= m, strike: "fija", fam: "voto" });
  combos.push({ id: `≥${m}de4→E`, et: `al menos ${m} de las cuatro · E elige el strike`, cuando: (t, e, tp, i) => cuenta(t, e, i) >= m, strike: "E", fam: "voto+E" });
}
// los pares que sobrevivan, también con E eligiendo strike
for (let a = 0; a < CLAVES.length; a++) for (let b = a + 1; b < CLAVES.length; b++) {
  const ka = CLAVES[a], kb = CLAVES[b];
  combos.push({ id: `${ka}+${kb}→E`, et: `${ka} Y ${kb} · E elige el strike`, cuando: (t, e, tp, i) => SENALES[ka].f(t, e, i) && SENALES[kb].f(t, e, i), strike: "E", fam: "Y+E" });
}

linea("3 · LAS COMBINACIONES — envase A, cadencia DIARIA");
L(`  | combinación | ratio | acierta | n | ops/año | sin 2020 | años ≥1 | mensual (para comparar) |`);
L(`  |---|---|---|---|---|---|---|---|`);
const res = [];
for (const c of combos) {
  const a = medir({ cuando: c.cuando, strike: c.strike });
  COMBIS++;
  if (a.n < 200) { res.push({ ...c, a, flaca: true }); continue; }
  const s20 = medir({ cuando: c.cuando, strike: c.strike, sin2020: true });
  const men = medir({ cadencia: "M", cuando: c.cuando, strike: c.strike });
  COMBIS += 2;
  const ap = anosPositivos(a);
  res.push({ ...c, a, r: R(a), ac: AC(a), s20: R(s20), men: R(men), menN: men.n, ap });
  L(`  | ${c.et} | **${f2(R(a))}** | ${pct(AC(a))} | ${num(a.n)} | ${f1(opsAno(a))} | ${f2(R(s20))} | ${ap.pos}/${ap.tot} | ${f2(R(men))} (n=${num(men.n)}) |`);
}
for (const c of res) if (c.flaca) L(`  | ${c.et} | muestra demasiado flaca (n=${num(c.a.n)}) | | | | | | |`);

// ════════════════════════════════════════════════════════════════════════════
// 4) LA GANADORA — y si tiene vecinas buenas
// ════════════════════════════════════════════════════════════════════════════
const validas = res.filter((c) => !c.flaca && c.a.n >= 400 && Number.isFinite(c.r));
validas.sort((x, y) => y.r - x.r);
const mejorSuelta = Object.entries(sueltas).filter(([k]) => k !== "—")
  .map(([k, a]) => ({ k, r: R(a), ac: AC(a), n: a.n, opsAno: opsAno(a) }))
  .sort((x, y) => y.r - x.r)[0];

linea("4 · LA GANADORA");
const G = validas[0];
if (!G) { L("  ninguna combinación alcanza muestra suficiente."); }
else {
  const ba = barajado({ cuando: G.cuando, strike: G.strike });
  COMBIS += ba.n;
  const co = concentracion(G.a);
  const sinS = medir({ cadencia: "S", cuando: G.cuando, strike: G.strike });
  COMBIS++;
  L(`  ${G.et}`);
  L(`    RATIO ${f2(G.r)} · acierta ${pct(G.ac)} · ${num(G.a.n)} operaciones (${f1(opsAno(G.a))} al año) · ${G.a.primerDia} → ${G.a.ultDia}`);
  L(`    ganador medio ${usd(G.a.gan / Math.max(1, G.a.win))} · perdedor medio ${usd(G.a.per / Math.max(1, G.a.n - G.a.win))}`);
  L(`    sin 2020: ${f2(G.s20)} · cadencia semanal: ${f2(R(sinS))} · cadencia mensual: ${f2(G.men)}`);
  L(`    BARAJADO con ${ba.n} desplazamientos: mediana ${f2(ba.mediana)} · el mejor de los ${ba.n} ${f2(ba.max)} · el peor ${f2(ba.min)}`);
  L(`    tickers: ${co.tickers} · hacen falta ${co.cuantos} para la mitad del beneficio · ${co.perdedores} tickers PIERDEN dentro · sin el mejor (${co.top}): ${f2(co.sinTop)}`);
  L(`    año a año: ${filaAnos(G.a)}`);
  L(`\n  ¿TIENE VECINAS BUENAS? Las 8 mejores de las ${validas.length} con muestra suficiente:`);
  L(`  | # | combinación | ratio | acierta | ops/año | sin 2020 |`);
  L(`  |---|---|---|---|---|---|`);
  validas.slice(0, 8).forEach((c, i) => L(`  | ${i + 1} | ${c.et} | ${f2(c.r)} | ${pct(c.ac)} | ${f1(opsAno(c.a))} | ${f2(c.s20)} |`));

  L(`\n  CONTRA LA MEJOR SUELTA: ${mejorSuelta.k} da ${f2(mejorSuelta.r)} con ${f1(mejorSuelta.opsAno)} operaciones al año.`);
  L(`  La mejor combinación da ${f2(G.r)} con ${f1(opsAno(G.a))}.  ` +
    (G.r > mejorSuelta.r ? "→ LA COMBINACIÓN GANA." : "→ **LA COMBINACIÓN NO GANA A LA MEJOR SUELTA: NO SE SUMAN.**"));

  // ── LAS CUATRO CRIBAS, aplicadas a las cinco mejores ────────────────────────
  L(`\n  LAS CRIBAS, sobre las 5 mejores (barajado con ${DESPLS.length} desplazamientos):`);
  L(`  | combinación | ratio | sin 2020 | 2020 aporta | barajado (mediana) | barajado (el mejor de 20) | tickers para la mitad | tickers que pierden | sin el mejor ticker | años ≥1 | ¿PASA? |`);
  L(`  |---|---|---|---|---|---|---|---|---|---|---|`);
  for (const c of validas.slice(0, 5)) {
    const ba = barajado({ cuando: c.cuando, strike: c.strike });
    COMBIS += ba.n;
    const co = concentracion(c.a);
    const y20 = c.a.anos.get("2020");
    const cuota20 = y20 ? y20.gan / c.a.gan : 0;
    const pasa = c.r >= 1.40 && c.s20 >= 1.40 && c.r > ba.max && co.cuantos >= 4 && c.ap.pos / Math.max(1, c.ap.tot) >= 0.6;
    L(`  | ${c.et} | **${f2(c.r)}** | ${f2(c.s20)} | ${pct(cuota20)} de lo ganado | ${f2(ba.mediana)} | ${f2(ba.max)} | ${co.cuantos} | ${co.perdedores}/${co.tickers} | ${f2(co.sinTop)} | ${c.ap.pos}/${c.ap.tot} | ${pasa ? "SÍ" : "**NO**"} |`);
  }

  // ── el mismo ranking, pero SIN 2020: quién sobrevive cuando se quita el año que lo paga todo ──
  const porS20 = [...validas].sort((x, y) => y.s20 - x.s20);
  L(`\n  EL MISMO RANKING QUITANDO 2020 (el año que lo paga casi todo):`);
  L(`  | # | combinación | ratio sin 2020 | ratio con 2020 | ops/año |`);
  L(`  |---|---|---|---|---|`);
  porS20.slice(0, 6).forEach((c, i) => L(`  | ${i + 1} | ${c.et} | **${f2(c.s20)}** | ${f2(c.r)} | ${f1(opsAno(c.a))} |`));
}

// ════════════════════════════════════════════════════════════════════════════
// 5) LOS AÑOS DIFÍCILES, Y LOS TERCIOS
// ════════════════════════════════════════════════════════════════════════════
linea("5 · LOS AÑOS DIFÍCILES (2018 · 2020 · 2022 · 2025) Y LOS TERCIOS");
const aMostrar = [{ id: "—", ...brazos[0] }, ...CLAVES.map((k) => brazos.find((b) => b.id === k)), brazos.find((b) => b.id === "E"),
  ...(G ? [G] : []), ...validas.slice(1, 4)];
L(`  | brazo | 2018 | 2020 | 2022 | 2025 | tercio 1 | tercio 2 | tercio 3 |`);
L(`  |---|---|---|---|---|---|---|---|`);
for (const b of aMostrar) {
  const a = medir({ cuando: b.cuando, strike: b.strike });
  COMBIS++;
  const ys = ["2018", "2020", "2022", "2025"].map((y) => { const v = a.anos.get(y); return v && v.per > 0 ? (v.gan / v.per).toFixed(2) : "—"; });
  // tercios por CALENDARIO, no por número de operaciones
  const anosOrd = [...a.anos.keys()].sort();
  const corte = [anosOrd.slice(0, Math.ceil(anosOrd.length / 3)), anosOrd.slice(Math.ceil(anosOrd.length / 3), Math.ceil(2 * anosOrd.length / 3)), anosOrd.slice(Math.ceil(2 * anosOrd.length / 3))];
  const ter = corte.map((gr) => { let gan = 0, per = 0; for (const y of gr) { const v = a.anos.get(y); if (v) { gan += v.gan; per += v.per; } } return per > 0 ? (gan / per).toFixed(2) : "—"; });
  L(`  | ${b.et} | ${ys.join(" | ")} | ${ter.join(" | ")} |`);
}

// ════════════════════════════════════════════════════════════════════════════
// 6) EL ENVASE B, DE CONTRASTE
// ════════════════════════════════════════════════════════════════════════════
linea("6 · EL ENVASE B (5% fuera · 90 días · salir a los 30 de bolsa) — cadencia diaria");
L(`  | brazo | ratio | acierta | n | ops/año |`);
L(`  |---|---|---|---|---|`);
for (const b of [...brazos, ...(G ? [G] : []), ...validas.slice(1, 4)]) {
  const a = medir({ env: 1, cuando: b.cuando, strike: b.strike });
  COMBIS++;
  L(`  | ${b.et} | ${f2(R(a))} | ${pct(AC(a))} | ${num(a.n)} | ${f1(opsAno(a))} |`);
}

// ════════════════════════════════════════════════════════════════════════════
// 7) LA HONESTIDAD SOBRE B — el «ayer» que era siempre fin de mes
// ════════════════════════════════════════════════════════════════════════════
linea("7 · LA SEÑAL B, HONESTA — el «ayer» que en realidad era «el último día del mes»");
{
  const bM = medir({ cadencia: "M", cuando: brazos[1 + 1].cuando });
  const bD = medir({ cadencia: "D", cuando: brazos[2].cuando });
  const lM = medir({ cadencia: "M" });
  const lD = medir({ cadencia: "D" });
  COMBIS += 4;
  L(`  mensual (entrando el día 1, «ayer» = último día del mes): ratio ${f2(R(bM))} · acierta ${pct(AC(bM))} · n=${num(bM.n)}  ·  listón mensual ${f2(R(lM))}`);
  L(`  DIARIA  (cualquier día, «ayer» = ayer de verdad)         : ratio ${f2(R(bD))} · acierta ${pct(AC(bD))} · n=${num(bD.n)}  ·  listón diario ${f2(R(lD))}`);
  L(`  La ventaja sobre su propio listón pasa de ${f2(R(bM) - R(lM))} puntos (mensual) a ${f2(R(bD) - R(lD))} (diaria).`);
  void bM;
}

// ════════════════════════════════════════════════════════════════════════════
// 8 · ¿QUÉ LE FALTA PARA FUNCIONAR? — apretar la señal A, que es la única que sostiene
// ════════════════════════════════════════════════════════════════════════════
//
// Todo lo que llega arriba lleva A dentro; nada sin A pasa de 1.12. Así que la pregunta
// constructiva es si A tiene MÁS que dar al apretarla. ESTO ABRE PUERTAS y se dice: son
// 5 umbrales × 3 formas = 15 medidas EXPLORATORIAS, no una conclusión.
linea("8 · APRETAR LA SEÑAL A — ¿hay más ventaja más arriba, o se agota? (EXPLORATORIO)");
L(`  | umbral de A | A sola | A · E elige strike | A Y D · E elige strike | ops/año (la última) | sin 2020 (la última) |`);
L(`  |---|---|---|---|---|---|`);
for (const u of [0.70, 0.80, 0.90, 0.95, 0.98]) {
  const cA = (t, e, tp, i) => t.pA[e][i] > u;
  const cAD = (t, e, tp, i) => t.pA[e][i] > u && SENALES.D.f(t, e, i);
  const a1 = medir({ cuando: cA });
  const a2 = medir({ cuando: cA, strike: "E" });
  const a3 = medir({ cuando: cAD, strike: "E" });
  const a4 = medir({ cuando: cAD, strike: "E", sin2020: true });
  COMBIS += 4;
  L(`  | percentil > ${(100 * u).toFixed(0)} | ${f2(R(a1))} | ${f2(R(a2))} | ${f2(R(a3))} (n=${num(a3.n)}) | ${f1(opsAno(a3))} | ${f2(R(a4))} |`);
}

// n EFECTIVA de la ganadora: dentro de un ticker, dos entradas separadas por menos de la
// tenencia comparten casi todo el camino. Las filas MIENTEN.
if (G) {
  const porTk = new Map();
  const iFija = DISTS.indexOf(ENVASES[ENV_PRINCIPAL].fija);
  void iFija;
  for (let ti = 0; ti < T.length; ti++) {
    const t = T[ti];
    for (let tp = 0; tp < 2; tp++) {
      const g = t.gate[ENV_PRINCIPAL][tp];
      for (let i = 0; i < t.n; i++) {
        if (!g[i] || !CAD.D[ti][i] || !G.cuando(t, ENV_PRINCIPAL, tp, i)) continue;
        const idx = G.strike === "E" ? t.ELEC[ENV_PRINCIPAL][tp][i] : DISTS.indexOf(ENVASES[ENV_PRINCIPAL].fija);
        if (idx < 0 || !Number.isFinite(t.PNL[ENV_PRINCIPAL][tp][idx][i])) continue;
        const k = `${t.sym}|${tp}`;
        if (!porTk.has(k)) porTk.set(k, []);
        porTk.get(k).push(i);
      }
    }
  }
  let nef = 0;
  for (const v of porTk.values()) { v.sort((a, b) => a - b); let ult = -1e9; for (const i of v) if (i - ult >= SALIDA) { nef++; ult = i; } }
  const fechas = new Set();
  for (const t of T) for (let i = 0; i < t.n; i++) fechas.add(t.dias[i]);
  L(`\n  n EFECTIVA de «${G.et}»: ${num(G.a.n)} filas, pero sólo ${num(nef)} no se solapan dentro de su ticker`);
  L(`  (dos entradas del mismo ticker separadas por menos de ${SALIDA} días de bolsa comparten casi todo el camino).`);
}

// ════════════════════════════════════════════════════════════════════════════
// LAS PUERTAS
// ════════════════════════════════════════════════════════════════════════════
linea("LAS PUERTAS");
L(`  combinaciones y variantes MEDIDAS en esta corrida: ${num(COMBIS)}`);
L(`  de ellas, candidatas de verdad (combinaciones distintas sobre el envase A, cadencia diaria): ${combos.length}`);
L(`  umbrales NO barridos aquí: se heredan de los hallazgos previos (A>80, B>2%, C>60, D>80).`);
L(`  tiempo total: ${Math.round((Date.now() - t0) / 1000)}s`);
L("");
