// SOLO CALLS — ¿el lado que gana, o la deriva del mercado disfrazada?
//
// ═══ QUÉ SE PREGUNTA ════════════════════════════════════════════════════════════════════════
// En todas las familias medidas las CALLS ganan y las PUTS pierden (sin señal: 1.82 vs 0.52).
// En diez años de mercado alcista eso puede ser simplemente la deriva. Aquí se separan las dos
// cosas con cuatro cortes:
//   1) las calls SÓLO en los tramos BAJISTAS del SPY (2018 Q4 · covid · 2022 · abril 2025)
//   2) el ratio de las calls AÑO A AÑO contra lo que hizo el SPY ese año (correlación)
//   3) las DOS PATAS a la vez (call + put mismo día y ticker): quita la dirección, deja el vehículo
//   4) cada señal medida SÓLO EN PUTS: ¿hay alguna que funcione del otro lado?
//
// ═══ EL ARREGLO DE CIMIENTOS ════════════════════════════════════════════════════════════════
// Los estudios anteriores entraban UNA VEZ AL MES, siempre el PRIMER día de bolsa del mes. Eso
// convierte "ayer" en "el último día del mes" y deja ~600 operaciones al año. Aquí la entrada es
// SEMANAL (primer día de cadena de cada semana). Se imprime también el corte MENSUAL para poder
// cotejar con lo publicado.
//
// ═══ LAS REGLAS DE LA CASA ══════════════════════════════════════════════════════════════════
//   · se COMPRA al ASK y se VENDE al BID. Nunca punto medio.
//   · ningún modelo de precios. El spot sale de la paridad put-call SÓLO EN EL VENCIMIENTO MÁS
//     CERCANO (versión corregida de z1-la-rejilla-completa.mjs).
//   · un HUECO no es un cero: si falta la cadena de salida se descarta y se cuenta aparte.
//   · SÓLO EL PASADO en toda ventana de señal (termina el día ANTERIOR a la compra).
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/w4-solo-calls.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const CIERRES = "scripts/cache-theta/cierres";

// ── envase A, fijado ────────────────────────────────────────────────────────
const DIST = 0.10, DTE = 60, SALIDA = 30;
const ASKMIN = 0.10, TOLK = 0.50, APUESTA = 1000;
const DISTS = [0.02, 0.05, 0.10, 0.15, 0.20];   // para la señal E (la sonrisa)
const MIN_HIST_E = 6;
const VENT_PCTL = 250, MIN_PCTL = 150;
const RV_W = 60;
const tolDte = (d) => Math.max(6, Math.round(d * 0.28));

const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const mediana = (v) => { if (!v.length) return NaN; const s = [...v].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) + "%" : "—");
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "—");
const usd = (n) => (Number.isFinite(n) ? "$" + Math.round(n).toLocaleString("en-US") : "—");
const num = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : "—");
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86400000);
// El día 0 del epoch fue JUEVES: sin el +3 la semana empieza en jueves y todas las entradas
// "semanales" caen el mismo día de la semana — el mismo defecto de calendario que se está
// arreglando, sólo que en otra casilla. Con el +3 la semana empieza en LUNES.
const semanaDe = (d) => Math.floor((ms(d) / 86400000 + 3) / 7);

// ── índice de días por ticker ───────────────────────────────────────────────
const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();
let TICKERS = [...diasPorSim.keys()].filter((t) => diasPorSim.get(t).length >= 800).sort();
if (process.env.SOLO) TICKERS = TICKERS.filter((t) => process.env.SOLO.split(",").includes(t));
// SPY primero: su serie de spot se usa como vara del mercado.
TICKERS = TICKERS.includes("SPY") ? ["SPY", ...TICKERS.filter((t) => t !== "SPY")] : TICKERS;
const TOTDIAS = TICKERS.reduce((a, t) => a + diasPorSim.get(t).length, 0);

const L = (s = "") => console.log(s);
const linea = (t) => { L(`\n${"═".repeat(112)}\n  ${t}\n${"═".repeat(112)}`); };

L(`\n${"═".repeat(112)}`);
L("  SOLO CALLS — el lado que gana, medido en serio");
L(`${"═".repeat(112)}`);
L(`  ${TICKERS.length} tickers con historia (>=800 días) · ${num(TOTDIAS)} días de cadena`);
L(`  envase: ${pct(DIST)} fuera · ${DTE} días de plazo · vender a los ${SALIDA} días de bolsa · al ask, salida al bid`);
L(`  entrada DIARIA — una por cada día de cadena. Es el arreglo del defecto de calendario.`);

// ── lectura de cadenas ──────────────────────────────────────────────────────
let lecturas = 0, noHallados = 0;
function leer(sym, dia) {
  const f = `${CDIR}/${sym}_d${dia}.json`;
  if (!existsSync(f)) { noHallados++; return null; }
  try { lecturas++; return JSON.parse(readFileSync(f, "utf8")); } catch { return null; }
}

/** Spot por paridad put-call EN EL VENCIMIENTO MÁS CERCANO. */
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
function expObjetivo(c, hoy, objetivo) {
  let mejor = null, md = Infinity, dtReal = 0;
  for (const e of Object.keys(c)) {
    const dt = dteDe(hoy, e); if (dt < 1) continue;
    const x = Math.abs(dt - objetivo);
    if (x < md) { md = x; mejor = e; dtReal = dt; }
  }
  if (!mejor || md > tolDte(objetivo)) return null;
  return { exp: mejor, dte: dtReal };
}
/** Strike al dinero y los dos asks de ese strike. */
function atmDe(c, exp, S) {
  const g = c[exp]; if (!g) return null;
  let K = null, dm = Infinity;
  for (const cl of Object.keys(g)) {
    if (cl.slice(-1) !== "C") continue;
    const k = Number(cl.slice(0, -2)); if (!g[`${k}|P`]) continue;
    const d = Math.abs(k - S); if (d < dm) { dm = d; K = k; }
  }
  if (K == null || Math.abs(K / S - 1) > 0.05) return null;
  const askC = g[`${K}|C`][1], askP = g[`${K}|P`][1];
  if (!(askC > 0) || !(askP > 0)) return null;
  return { K, askC, askP, cuna: (askC + askP) / S };
}
function contratoEsquina(c, exp, S, dist, tipo) {
  const g = c[exp]; if (!g) return null;
  const objetivo = tipo === "C" ? S * (1 + dist) : S * (1 - dist);
  let mej = null, dm = Infinity;
  for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== tipo) continue;
    if (!(ba[1] >= ASKMIN)) continue;
    const K = Number(cl.slice(0, -2));
    const d = Math.abs(K - objetivo);
    if (d < dm) { dm = d; mej = { K, clave: cl, bid: ba[0], ask: ba[1] }; }
  }
  if (!mej) return null;
  const distReal = tipo === "C" ? mej.K / S - 1 : 1 - mej.K / S;
  if (Math.abs(distReal - dist) > dist * TOLK) return null;
  return { ...mej, distReal };
}
/** Percentil de x contra los últimos VENT_PCTL valores previos de la serie. */
function percentilar(serie, i) {
  const x = serie[i]; if (x == null) return null;
  let n = 0, menores = 0;
  for (let j = Math.max(0, i - VENT_PCTL); j < i; j++) { const v = serie[j]; if (v == null) continue; n++; if (v < x) menores++; }
  return n < MIN_PCTL ? null : menores / n;
}

// ════════════════════════════════════════════════════════════════════════════
// PASE ÚNICO POR TICKER
// ════════════════════════════════════════════════════════════════════════════
const OPS = [];        // una fila por (entrada, lado) con la distancia FIJA
const OPS_E = [];      // una fila por (entrada, lado) con la distancia ELEGIDA (señal E)
const SPY_SPOT = new Map();
let entradas = 0, entradasMes = 0, sinSpot = 0, sinContrato = 0, huecos = 0, truncadas = 0, retSaltados = 0, retTot = 0;
const audSpot = [];
const t0 = Date.now();

for (const sym of TICKERS) {
  const dias = diasPorSim.get(sym);
  const n = dias.length;
  const cl = existsSync(`${CIERRES}/${sym}.json`) ? JSON.parse(readFileSync(`${CIERRES}/${sym}.json`, "utf8")) : null;

  const S = new Array(n).fill(null);
  const ret = new Array(n).fill(null);
  const serCocA = new Array(n).fill(null);   // señal A: cuña/movimiento real
  const serCocC = new Array(n).fill(null);   // señal C: frente(30) vs fondo(180)
  const serSusto = new Array(n).fill(null);  // señal D: mayor movimiento de las últimas 5 sesiones
  const pend = new Map();                    // índice de salida -> operaciones pendientes
  const histE = new Map();                   // `${tipo}|${a}` -> [varas pasadas]

  const resolver = (i, c) => {
    const v = pend.get(i); if (!v) return;
    pend.delete(i);
    for (const o of v) {
      if (!c) { o.muerta = 1; huecos++; continue; }
      const g = c[o.exp];
      o.salida = g ? (g[o.clave]?.[0] ?? 0) : 0;   // sin puja = 0, dato real
      o.ret = (o.salida - o.ask) / o.ask;
      o.Ssal = spotOk(c, dias[i]);
    }
  };

  for (let i = 0; i < n; i++) {
    const d = dias[i];
    const c = leer(sym, d);
    if (!c) { resolver(i, null); continue; }
    const s = spotOk(c, d);
    if (!s) { sinSpot++; resolver(i, null); continue; }
    S[i] = s;
    if (sym === "SPY") SPY_SPOT.set(d, s);
    if (cl && cl[d] > 0) audSpot.push(Math.abs(s / cl[d] - 1));

    // retorno diario (sólo entre días de cadena con hueco de calendario <= 5)
    if (i > 0 && S[i - 1] != null && dteDe(dias[i - 1], d) <= 5) {
      const r = Math.log(s / S[i - 1]); retTot++;
      if (Math.abs(r) > 0.35) retSaltados++; else ret[i] = r;
    }
    // susto: mayor |retorno| de las 5 sesiones que terminan AYER
    { let mx = 0, cnt = 0;
      for (let j = i - 5; j <= i - 1; j++) { if (j < 0 || ret[j] == null) continue; cnt++; const a = Math.abs(ret[j]); if (a > mx) mx = a; }
      if (cnt >= 4) serSusto[i] = mx; }
    // rv60 con retornos que terminan AYER
    let rv = null;
    { const v = []; for (let j = i - 1; j >= 0 && v.length < RV_W; j--) if (ret[j] != null) v.push(ret[j]);
      if (v.length >= Math.round(RV_W * 0.8)) { const x = sd(v); if (x > 0) rv = x; } }

    const eo = expObjetivo(c, d, DTE);
    const atmEnv = eo ? atmDe(c, eo.exp, s) : null;
    if (atmEnv && rv) {
      const diasBolsa = Math.max(1, eo.dte * 252 / 365);
      const mov = rv * Math.sqrt(diasBolsa);
      if (mov > 0) serCocA[i] = atmEnv.cuna / mov;
    }
    // curva frente/fondo
    { const e30 = expObjetivo(c, d, 30), e180 = expObjetivo(c, d, 180);
      if (e30 && e180 && e30.exp !== e180.exp) {
        const a30 = atmDe(c, e30.exp, s), a180 = atmDe(c, e180.exp, s);
        if (a30 && a180) {
          const fr = a30.cuna / Math.sqrt(e30.dte), fo = a180.cuna / Math.sqrt(e180.dte);
          if (fr > 0 && fo > 0) serCocC[i] = fr / fo;
        }
      } }

    resolver(i, c);   // resolver salidas que vencen hoy ANTES de abrir nada nuevo

    // ── SE ENTRA TODOS LOS DÍAS. Es la única forma de que ninguna señal quede
    //    atada a un día del calendario. Se etiqueta además cuáles serían las
    //    entradas semanales (primer día de cadena del lunes) y mensuales
    //    (primer día de cadena del mes) para poder cotejar con lo publicado.
    const esSem = i === 0 ? false : semanaDe(d) !== semanaDe(dias[i - 1]);
    const esMes = i === 0 ? false : dias[i].slice(0, 6) !== dias[i - 1].slice(0, 6);
    if (i === 0 || !eo || !atmEnv) continue;
    const pA = percentilar(serCocA, i), pC = percentilar(serCocC, i), pD = percentilar(serSusto, i);
    const rAyer = ret[i - 1];
    entradas++;
    if (esMes) entradasMes++;

    // índice y fecha de salida
    let iSal = i + SALIDA, trunc = 0;
    if (iSal >= n) { huecos++; continue; }
    if (dias[iSal] >= eo.exp) {
      let j = iSal; while (j > i && dias[j] >= eo.exp) j--;
      if (j <= i) { huecos++; continue; }
      iSal = j; trunc = 1; truncadas++;
    }

    const base = { sym, dia: d, ano: d.slice(0, 4), esMes, esSem, exp: eo.exp, dteReal: eo.dte,
                   pA, pC, pD, rAyer, trunc, diaSal: dias[iSal] };

    for (const tipo of ["C", "P"]) {
      const ct = contratoEsquina(c, eo.exp, s, DIST, tipo);
      if (!ct) { sinContrato++; continue; }
      const op = { ...base, tipo, K: ct.K, clave: ct.clave, ask: ct.ask, bid: ct.bid, distReal: ct.distReal, S: s };
      if (!pend.has(iSal)) pend.set(iSal, []);
      pend.get(iSal).push(op);
      OPS.push(op);
    }
    // ── señal E: la distancia más barata DE LO NORMAL para este ticker ─────
    for (const tipo of ["C", "P"]) {
      const askAtm = tipo === "C" ? atmEnv.askC : atmEnv.askP;
      let mejor = null, completo = true;
      const nuevos = [];
      for (let a = 0; a < DISTS.length; a++) {
        const ct = contratoEsquina(c, eo.exp, s, DISTS[a], tipo);
        if (!ct) { completo = false; continue; }
        const vara = ct.ask / askAtm;
        const h = histE.get(`${tipo}|${a}`) ?? [];
        nuevos.push([`${tipo}|${a}`, vara]);
        if (h.length < MIN_HIST_E) { completo = false; continue; }
        const rel = vara / mediana(h);
        if (!mejor || rel < mejor.rel) mejor = { rel, ct, a };
      }
      for (const [k, v] of nuevos) { if (!histE.has(k)) histE.set(k, []); histE.get(k).push(v); }
      if (!completo || !mejor) continue;
      const op = { ...base, tipo, K: mejor.ct.K, clave: mejor.ct.clave, ask: mejor.ct.ask, bid: mejor.ct.bid,
                   distReal: mejor.ct.distReal, S: s, distPedida: DISTS[mejor.a] };
      if (!pend.has(iSal)) pend.set(iSal, []);
      pend.get(iSal).push(op);
      OPS_E.push(op);
    }
  }
  // las que quedaron sin resolver son huecos
  for (const v of pend.values()) for (const o of v) { o.muerta = 1; huecos++; }

  process.stderr.write(`\r   ${sym} · ${num(entradas)} entradas · ${num(OPS.length)} ops · ${Math.round((Date.now() - t0) / 1000)}s     `);
}
process.stderr.write("\n");

// El análisis corre sobre TODAS las entradas (una por día de cadena). Las semanales y las
// mensuales se guardan aparte sólo para el cotejo con lo publicado.
const VIVAS = OPS.filter((o) => !o.muerta && Number.isFinite(o.ret));
const VIVAS_E = OPS_E.filter((o) => !o.muerta && Number.isFinite(o.ret));
const TODAS = VIVAS, TODAS_E = VIVAS_E;
const SEMS = VIVAS.filter((o) => o.esSem);
const MENS = VIVAS.filter((o) => o.esMes);

// ── el SPY como vara del mercado ────────────────────────────────────────────
const SPY_DIAS = [...SPY_SPOT.keys()].sort();
function spyEn(d) {
  if (SPY_SPOT.has(d)) return SPY_SPOT.get(d);
  let lo = 0, hi = SPY_DIAS.length - 1, best = null;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (SPY_DIAS[m] <= d) { best = SPY_DIAS[m]; lo = m + 1; } else hi = m - 1; }
  return best ? SPY_SPOT.get(best) : null;
}
for (const o of [...TODAS, ...TODAS_E]) {
  const a = spyEn(o.dia), b = spyEn(o.diaSal);
  o.spyRet = a && b ? b / a - 1 : null;
  o.subRet = o.Ssal && o.S ? o.Ssal / o.S - 1 : null;
}

// ════════════════════════════════════════════════════════════════════════════
// SANIDAD
// ════════════════════════════════════════════════════════════════════════════
linea("SANIDAD");
L(`  entradas semanales usadas       : ${num(entradas)}   (de ellas, primer día del mes: ${num(entradasMes)})`);
L(`  días sin spot deducible         : ${num(sinSpot)}`);
L(`  combinaciones sin contrato      : ${num(sinContrato)}`);
L(`  HUECOS descartados (falta cadena de salida o se salió del rango): ${num(huecos)}`);
L(`  operaciones VIVAS con entrada DIARIA (distancia fija): ${num(VIVAS.length)}  ·  con distancia elegida (señal E): ${num(VIVAS_E.length)}`);
L(`     de ellas, entrada SEMANAL (lunes): ${num(SEMS.length)}  ·  entrada MENSUAL (1º del mes): ${num(MENS.length)}`);
L(`  truncadas al último día antes del vencimiento: ${num(truncadas)}`);
L(`  ficheros leídos ${num(lecturas)} · no encontrados ${num(noHallados)}`);
L(`  retornos saltados por salto > 35% (splits): ${num(retSaltados)} de ${num(retTot)} (${pct(retSaltados / retTot)})`);
{ const s = audSpot.sort((a, b) => a - b);
  L(`  EL SPOT contra los cierres reales de disco (${num(s.length)} días con los dos):`);
  L(`    error mediano ${pct(s[s.length >> 1])} · peor 10% ${pct(s[Math.floor(s.length * 0.9)])} · peor 1% ${pct(s[Math.floor(s.length * 0.99)])}`); }
{ const c = VIVAS.filter((o) => o.tipo === "C"), p = VIVAS.filter((o) => o.tipo === "P");
  L(`  distancia real media: calls ${pct(media(c.map((o) => o.distReal)))} · puts ${pct(media(p.map((o) => o.distReal)))} (se pidió ${pct(DIST)})`);
  L(`  plazo real medio ${media(VIVAS.map((o) => o.dteReal)).toFixed(0)} días · horquilla media ${pct(media(VIVAS.map((o) => (o.ask - o.bid) / o.ask)))} de la prima`);
  L(`  vencen sin puja al salir: calls ${pct(c.filter((o) => o.salida === 0).length / c.length)} · puts ${pct(p.filter((o) => o.salida === 0).length / p.length)}`); }

// ════════════════════════════════════════════════════════════════════════════
// LA VARA
// ════════════════════════════════════════════════════════════════════════════
const acc = () => ({ n: 0, win: 0, gan: 0, per: 0 });
function suma(a, r) { const d = APUESTA * r; a.n++; if (d > 0) { a.win++; a.gan += d; } else a.per += -d; }
function mide(v) { const a = acc(); for (const o of v) suma(a, o.ret); return a; }
const ratio = (a) => (a.per > 0 ? a.gan / a.per : (a.gan > 0 ? Infinity : NaN));
const R = (a) => (a.n ? f2(ratio(a)) : "—");
const AC = (a) => (a.n ? pct(a.win / a.n) : "—");
const ANOS_TOT = 10.63;   // 2016-01-04 → 2026-08-19

/**
 * OPERACIONES QUE DE VERDAD SE PUEDEN TOMAR. Con entrada diaria las filas se solapan: dos
 * entradas del mismo ticker con dos días de diferencia comparten casi todo el camino. Se cuenta
 * greedy por ticker: una entrada nueva sólo cuenta si la anterior del mismo ticker ya cerró.
 * Es el número honesto de "operaciones al año" para juzgar si la regla es operable.
 */
function opsIndep(filas) {
  const porTk = new Map();
  for (const f of filas) { if (!porTk.has(f.sym)) porTk.set(f.sym, []); porTk.get(f.sym).push(f); }
  let n = 0;
  for (const v of porTk.values()) {
    v.sort((a, b) => (a.dia < b.dia ? -1 : 1));
    let hasta = null;
    for (const f of v) if (hasta === null || f.dia >= hasta) { n++; hasta = f.diaSal; }
  }
  return n;
}

const SEN = {
  SIN: { et: "sin señal (el envase entero)",                  f: () => true },
  A:   { et: "A · la opción CARA (percentil > 80)",           f: (o) => o.pA != null && o.pA > 0.80 },
  B:   { et: "B · ayer se movió más del 2%",                  f: (o) => o.rAyer != null && Math.abs(o.rAyer) > 0.02 },
  C:   { et: "C · frente CARO respecto al fondo (perc > 60)", f: (o) => o.pC != null && o.pC > 0.60 },
  D:   { et: "D · después del susto (percentil > 80)",        f: (o) => o.pD != null && o.pD > 0.80 },
};
const CLAVES = ["SIN", "A", "B", "C", "D"];

function tabla(titulo, filas) {
  L(`\n  ${titulo}`);
  L(`  | ${"señal".padEnd(46)} | ${"n".padStart(7)} | ${"ops/año".padStart(7)} | ${"ratio".padStart(6)} | ${"acierta".padStart(7)} | ${"ganador".padStart(9)} | ${"perdedor".padStart(9)} |`);
  L(`  |${"-".repeat(48)}|${"-".repeat(9)}|${"-".repeat(9)}|${"-".repeat(8)}|${"-".repeat(9)}|${"-".repeat(11)}|${"-".repeat(11)}|`);
  for (const [et, a, indep] of filas) {
    const oa = (indep ?? a.n) / ANOS_TOT;
    L(`  | ${et.padEnd(46)} | ${num(a.n).padStart(7)} | ${num(oa).padStart(7)} | ${R(a).padStart(6)} | ${AC(a).padStart(7)} | ${usd(a.gan / Math.max(1, a.win)).padStart(9)} | ${usd(a.per / Math.max(1, a.n - a.win)).padStart(9)} |`);
  }
}

// ── las dos patas ───────────────────────────────────────────────────────────
function dosPatas(filas) {
  const m = new Map();
  for (const o of filas) { const k = `${o.sym}|${o.dia}`; if (!m.has(k)) m.set(k, {}); m.get(k)[o.tipo] = o; }
  const out = [];
  for (const v of m.values()) {
    if (!v.C || !v.P) continue;
    const coste = v.C.ask + v.P.ask, sal = v.C.salida + v.P.salida;
    out.push({ ...v.C, tipo: "CP", ask: coste, salida: sal, ret: (sal - coste) / coste });
  }
  return out;
}

linea("PASO 0 — EL DEFECTO DE CALENDARIO, MEDIDO: la MISMA regla con tres ritmos de entrada");
{
  for (const [et, base] of [["MENSUAL (1º del mes) — como los estudios anteriores", MENS], ["SEMANAL (lunes)", SEMS], ["DIARIA (todos los días de cadena)", VIVAS]]) {
    const filas = [];
    for (const k of ["SIN", "A"]) for (const [lado, ft] of [["calls", (o) => o.tipo === "C"], ["puts", (o) => o.tipo === "P"], ["las dos", () => true]]) {
      filas.push([`${k === "SIN" ? "sin señal" : "señal A"} · ${lado}`, mide(base.filter((o) => SEN[k].f(o) && ft(o)))]);
    }
    tabla(`entrada ${et}`, filas);
  }
  L(`\n  Lo publicado con entrada mensual era: sin señal calls 1.82 / puts 0.52 · con la señal A calls 2.58 / puts 0.97.`);
  L(`  Si las tres filas no dicen lo mismo, el número publicado era del CALENDARIO, no de la regla.`);
}

linea("PASO 0b — ¿POR QUÉ EL MENSUAL SALE MÁS ALTO? Ratio por DÓNDE CAE LA ENTRADA DENTRO DEL MES");
{
  const cubos = [["días 1–7", 1, 7], ["días 8–14", 8, 14], ["días 15–21", 15, 21], ["días 22–31", 22, 31]];
  L(`  (con entrada diaria: si el 1º del mes fuera especial, el primer tramo saldría más alto)`);
  L(`  | ${"tramo del mes".padEnd(14)} | ${"calls n".padStart(7)} | ${"calls r".padStart(7)} | ${"puts n".padStart(7)} | ${"puts r".padStart(7)} | ${"las dos r".padStart(9)} |`);
  L(`  |${"-".repeat(16)}|${"-".repeat(9)}|${"-".repeat(9)}|${"-".repeat(9)}|${"-".repeat(9)}|${"-".repeat(11)}|`);
  for (const [et, a, b] of cubos) {
    const dentro = (o) => { const dm = Number(o.dia.slice(6, 8)); return dm >= a && dm <= b; };
    const c = mide(VIVAS.filter((o) => o.tipo === "C" && dentro(o)));
    const p = mide(VIVAS.filter((o) => o.tipo === "P" && dentro(o)));
    const t = mide(VIVAS.filter(dentro));
    L(`  | ${et.padEnd(14)} | ${num(c.n).padStart(7)} | ${R(c).padStart(7)} | ${num(p.n).padStart(7)} | ${R(p).padStart(7)} | ${R(t).padStart(9)} |`);
  }
  L(`\n  Y por DÍA DE LA SEMANA de la entrada — si un día manda, la regla estaba atada al calendario:`);
  const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
  for (let w = 1; w <= 5; w++) {
    const dentro = (o) => new Date(ms(o.dia)).getUTCDay() === w;
    const c = mide(TODAS.filter((o) => o.tipo === "C" && dentro(o)));
    if (!c.n) continue;
    const p = mide(TODAS.filter((o) => o.tipo === "P" && dentro(o)));
    L(`    ${DIAS[w].padEnd(11)} calls n=${num(c.n).padStart(6)} ratio ${R(c)} · puts n=${num(p.n).padStart(6)} ratio ${R(p)}`);
  }
}

linea("PASO 1 — CON ENTRADA DIARIA (sin calendario): cada señal, por lado");
L(`  "ops/año" cuenta las que NO se solapan (una nueva del mismo ticker sólo si la anterior ya cerró).`);
for (const [lado, ft] of [["CALLS", (o) => o.tipo === "C"], ["PUTS", (o) => o.tipo === "P"], ["LAS DOS SUELTAS", () => true]]) {
  const filas = CLAVES.map((k) => { const v = VIVAS.filter((o) => SEN[k].f(o) && ft(o)); return [SEN[k].et, mide(v), opsIndep(v)]; });
  const ve = VIVAS_E.filter(ft);
  filas.push(["E · la sonrisa (distancia más barata de lo normal)", mide(ve), opsIndep(ve)]);
  tabla(`${lado} — ${pct(DIST)} fuera · ${DTE} días · salir a los ${SALIDA} de bolsa`, filas);
}

// ════════════════════════════════════════════════════════════════════════════
// PASO 2 — LA PRUEBA QUE LO DECIDE: las calls en los TRAMOS BAJISTAS
// ════════════════════════════════════════════════════════════════════════════
const TRAMOS = [
  { et: "2018 Q4    (20181001–20181224)", a: "20181001", b: "20181224", anos: 0.23 },
  { et: "covid      (20200219–20200323)", a: "20200219", b: "20200323", anos: 0.09 },
  { et: "2022 entero(20220101–20221231)", a: "20220101", b: "20221231", anos: 1.00 },
  { et: "abril 2025 (20250219–20250408)", a: "20250219", b: "20250408", anos: 0.13 },
];
const ANOS_BAJ = TRAMOS.reduce((a, t) => a + t.anos, 0);

linea("PASO 2 — LAS CALLS EN LOS TRAMOS BAJISTAS DEL SPY (por fecha de ENTRADA)");
{
  for (const tr of TRAMOS) {
    const a0 = spyEn(tr.a), a1 = spyEn(tr.b);
    L(`\n  ── ${tr.et} · el SPY hizo ${pct(a1 / a0 - 1)} ──`);
    L(`  | ${"señal / lado".padEnd(34)} | ${"n".padStart(6)} | ${"ratio".padStart(6)} | ${"acierta".padStart(7)} |`);
    L(`  |${"-".repeat(36)}|${"-".repeat(8)}|${"-".repeat(8)}|${"-".repeat(9)}|`);
    const dentro = (o) => o.dia >= tr.a && o.dia <= tr.b;
    for (const k of ["SIN", "A"]) for (const [lado, ft] of [["calls", (o) => o.tipo === "C"], ["puts", (o) => o.tipo === "P"]]) {
      const x = mide(VIVAS.filter((o) => dentro(o) && SEN[k].f(o) && ft(o)));
      L(`  | ${`${k === "SIN" ? "sin señal" : "señal A"} · ${lado}`.padEnd(34)} | ${num(x.n).padStart(6)} | ${R(x).padStart(6)} | ${AC(x).padStart(7)} |`);
    }
    const dp = dosPatas(VIVAS.filter(dentro));
    L(`  | ${"sin señal · las dos patas".padEnd(34)} | ${num(mide(dp).n).padStart(6)} | ${R(mide(dp)).padStart(6)} | ${AC(mide(dp)).padStart(7)} |`);
  }
  const enAlgun = (o) => TRAMOS.some((t) => o.dia >= t.a && o.dia <= t.b);
  L(`\n  ── LOS CUATRO TRAMOS JUNTOS (${f2(ANOS_BAJ)} años) contra el resto del tiempo ──`);
  L(`  | ${"corte".padEnd(40)} | ${"n".padStart(6)} | ${"ops/año".padStart(7)} | ${"ratio".padStart(6)} | ${"acierta".padStart(7)} |`);
  L(`  |${"-".repeat(42)}|${"-".repeat(8)}|${"-".repeat(9)}|${"-".repeat(8)}|${"-".repeat(9)}|`);
  for (const k of ["SIN", "A"]) for (const [lado, ft] of [["calls", (o) => o.tipo === "C"], ["puts", (o) => o.tipo === "P"]]) {
    for (const [cor, cf, an] of [["BAJISTA", enAlgun, ANOS_BAJ], ["resto", (o) => !enAlgun(o), ANOS_TOT - ANOS_BAJ]]) {
      const x = mide(VIVAS.filter((o) => cf(o) && SEN[k].f(o) && ft(o)));
      L(`  | ${`${k === "SIN" ? "sin señal" : "señal A"} · ${lado} · ${cor}`.padEnd(40)} | ${num(x.n).padStart(6)} | ${num(x.n / an).padStart(7)} | ${R(x).padStart(6)} | ${AC(x).padStart(7)} |`);
    }
  }
}

linea("PASO 2b — ATRIBUCIÓN (mira el futuro a propósito, NO es una regla) — según lo que hizo el SPY DURANTE la tenencia");
{
  L(`  | ${"corte".padEnd(40)} | ${"n".padStart(6)} | ${"ratio".padStart(6)} | ${"acierta".padStart(7)} |`);
  L(`  |${"-".repeat(42)}|${"-".repeat(8)}|${"-".repeat(8)}|${"-".repeat(9)}|`);
  for (const [lado, ft] of [["calls", (o) => o.tipo === "C"], ["puts", (o) => o.tipo === "P"]]) {
    for (const [et, cf] of [["SPY subió", (o) => o.spyRet > 0], ["SPY bajó", (o) => o.spyRet < 0], ["SPY bajó más del 5%", (o) => o.spyRet < -0.05]]) {
      const x = mide(VIVAS.filter((o) => o.spyRet != null && cf(o) && ft(o)));
      L(`  | ${`${lado} · ${et}`.padEnd(40)} | ${num(x.n).padStart(6)} | ${R(x).padStart(6)} | ${AC(x).padStart(7)} |`);
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// PASO 3 — AÑO A AÑO contra el SPY
// ════════════════════════════════════════════════════════════════════════════
linea("PASO 3 — RATIO DE LAS CALLS AÑO A AÑO CONTRA LO QUE HIZO EL SPY ESE AÑO");
{
  const anos = [...new Set(VIVAS.map((o) => o.ano))].sort();
  const DOS = dosPatas(VIVAS);
  L(`  | ${"año".padEnd(5)} | ${"SPY".padStart(8)} | ${"calls n".padStart(7)} | ${"calls r".padStart(7)} | ${"puts n".padStart(7)} | ${"puts r".padStart(7)} | ${"2 patas r".padStart(9)} | ${"calls+A n".padStart(9)} | ${"calls+A r".padStart(9)} |`);
  L(`  |${"-".repeat(7)}|${"-".repeat(10)}|${"-".repeat(9)}|${"-".repeat(9)}|${"-".repeat(9)}|${"-".repeat(9)}|${"-".repeat(11)}|${"-".repeat(11)}|${"-".repeat(11)}|`);
  const xs = [], ys = [];
  for (const y of anos) {
    const dY = SPY_DIAS.filter((d) => d.slice(0, 4) === y);
    if (!dY.length) continue;
    const spy = SPY_SPOT.get(dY[dY.length - 1]) / SPY_SPOT.get(dY[0]) - 1;
    const c = mide(VIVAS.filter((o) => o.ano === y && o.tipo === "C"));
    const p = mide(VIVAS.filter((o) => o.ano === y && o.tipo === "P"));
    const dp = mide(DOS.filter((o) => o.ano === y));
    const ca = mide(VIVAS.filter((o) => o.ano === y && o.tipo === "C" && SEN.A.f(o)));
    L(`  | ${y.padEnd(5)} | ${pct(spy).padStart(8)} | ${num(c.n).padStart(7)} | ${R(c).padStart(7)} | ${num(p.n).padStart(7)} | ${R(p).padStart(7)} | ${R(dp).padStart(9)} | ${num(ca.n).padStart(9)} | ${R(ca).padStart(9)} |`);
    if (c.n > 50 && Number.isFinite(ratio(c))) { xs.push(spy); ys.push(ratio(c)); }
  }
  const corr = (a, b) => { const ma = media(a), mb = media(b); let s = 0, sa = 0, sb = 0;
    for (let i = 0; i < a.length; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; } return s / Math.sqrt(sa * sb); };
  L(`\n  Correlación entre lo que hizo el SPY y el ratio de las calls, año a año (${xs.length} años): ${f2(corr(xs, ys))}`);
  L(`  (cerca de 1.00 = el ratio de las calls ES el año del mercado: beta apalancada.)`);
  // lo mismo pero con las puts, y con las dos patas
  const yp = [], yd = [], xs2 = [];
  for (const y of anos) {
    const dY = SPY_DIAS.filter((d) => d.slice(0, 4) === y); if (!dY.length) continue;
    const spy = SPY_SPOT.get(dY[dY.length - 1]) / SPY_SPOT.get(dY[0]) - 1;
    const p = mide(VIVAS.filter((o) => o.ano === y && o.tipo === "P"));
    const dp = mide(DOS.filter((o) => o.ano === y));
    if (p.n > 50 && Number.isFinite(ratio(p)) && Number.isFinite(ratio(dp))) { xs2.push(spy); yp.push(ratio(p)); yd.push(ratio(dp)); }
  }
  L(`  La misma correlación con las PUTS: ${f2(corr(xs2, yp))} · con LAS DOS PATAS: ${f2(corr(xs2, yd))}`);
}

// ════════════════════════════════════════════════════════════════════════════
// PASO 4 — LAS DOS PATAS
// ════════════════════════════════════════════════════════════════════════════
linea("PASO 4 — LAS DOS PATAS A LA VEZ (quita la dirección, deja sólo el vehículo)");
{
  const DOS = dosPatas(VIVAS);
  const DOSE = dosPatas(VIVAS_E);
  const filas = CLAVES.map((k) => [SEN[k].et, mide(DOS.filter(SEN[k].f))]);
  filas.push(["E · la sonrisa (distancia más barata de lo normal)", mide(DOSE)]);
  tabla("call + put del mismo día y ticker, $1,000 en el paquete completo", filas);
  const enAlgun = (o) => TRAMOS.some((t) => o.dia >= t.a && o.dia <= t.b);
  const b0 = mide(DOS.filter(enAlgun)), b1 = mide(DOS.filter((o) => enAlgun(o) && SEN.A.f(o)));
  L(`\n  Las dos patas SÓLO en los tramos bajistas: sin señal ${R(b0)} (n=${num(b0.n)}) · con la señal A ${R(b1)} (n=${num(b1.n)})`);
  // año a año de las dos patas
  const anos = [...new Set(DOS.map((o) => o.ano))].sort();
  L(`  año a año (sin señal): ${anos.map((y) => `${y} ${R(mide(DOS.filter((o) => o.ano === y)))}`).join(" · ")}`);
  L(`  año a año (señal A)  : ${anos.map((y) => `${y} ${R(mide(DOS.filter((o) => o.ano === y && SEN.A.f(o))))}`).join(" · ")}`);
}

// ════════════════════════════════════════════════════════════════════════════
// PASO 5 — ¿HAY ALGUNA SEÑAL QUE FUNCIONE EN LAS PUTS?
// ════════════════════════════════════════════════════════════════════════════
linea("PASO 5 — CADA SEÑAL SÓLO EN PUTS, con la escalera entera");
{
  const puts = VIVAS.filter((o) => o.tipo === "P");
  const base = mide(puts);
  L(`  listón de las puts sin señal: ratio ${R(base)} · acierta ${AC(base)} · n=${num(base.n)}\n`);
  const ESC = [
    ["A · lo caro que está (cuña/movimiento)", (o) => o.pA],
    ["C · frente vs fondo", (o) => o.pC],
    ["D · el susto reciente", (o) => o.pD],
  ];
  L(`  | ${"señal · quintil".padEnd(52)} | ${"n".padStart(6)} | ${"ratio".padStart(6)} | ${"acierta".padStart(7)} |`);
  L(`  |${"-".repeat(54)}|${"-".repeat(8)}|${"-".repeat(8)}|${"-".repeat(9)}|`);
  for (const [et, g] of ESC) {
    const conP = puts.filter((o) => g(o) != null);
    for (let q = 0; q < 5; q++) {
      const x = mide(conP.filter((o) => Math.min(4, Math.floor(g(o) * 5)) === q));
      L(`  | ${`${et} · Q${q + 1}`.padEnd(52)} | ${num(x.n).padStart(6)} | ${R(x).padStart(6)} | ${AC(x).padStart(7)} |`);
    }
    L(`  |${"-".repeat(54)}|${"-".repeat(8)}|${"-".repeat(8)}|${"-".repeat(9)}|`);
  }
  const b1 = mide(puts.filter((o) => o.rAyer != null && Math.abs(o.rAyer) > 0.02));
  const b0 = mide(puts.filter((o) => o.rAyer != null && Math.abs(o.rAyer) <= 0.02));
  L(`  | ${"B · ayer se movió MÁS del 2%".padEnd(52)} | ${num(b1.n).padStart(6)} | ${R(b1).padStart(6)} | ${AC(b1).padStart(7)} |`);
  L(`  | ${"B · ayer se movió MENOS del 2%".padEnd(52)} | ${num(b0.n).padStart(6)} | ${R(b0).padStart(6)} | ${AC(b0).padStart(7)} |`);
  const e = mide(VIVAS_E.filter((o) => o.tipo === "P"));
  L(`  | ${"E · la sonrisa, en puts".padEnd(52)} | ${num(e.n).padStart(6)} | ${R(e).padStart(6)} | ${AC(e).padStart(7)} |`);
  L(`\n  Parejas de señales, sólo en puts:`);
  const P2 = [["A+C", (o) => SEN.A.f(o) && SEN.C.f(o)], ["A+D", (o) => SEN.A.f(o) && SEN.D.f(o)], ["C+D", (o) => SEN.C.f(o) && SEN.D.f(o)],
              ["A+B", (o) => SEN.A.f(o) && SEN.B.f(o)], ["B+D", (o) => SEN.B.f(o) && SEN.D.f(o)]];
  for (const [et, f] of P2) { const x = mide(puts.filter(f)); L(`    ${et.padEnd(6)} n=${num(x.n).padStart(6)} · ops/año ${num(x.n / ANOS_TOT).padStart(4)} · ratio ${R(x)} · acierta ${AC(x)}`); }
  // la mejor casilla de puts, año a año
  const mejor = puts.filter((o) => o.pD != null && o.pD > 0.80);
  const anos = [...new Set(puts.map((o) => o.ano))].sort();
  L(`\n  Puts + señal D, año a año: ${anos.map((y) => `${y} ${R(mide(mejor.filter((o) => o.ano === y)))}`).join(" · ")}`);

  // ── la ÚNICA casilla de puts que se acerca a 1.40: A+D. Se le pasan los escépticos. ──
  L(`\n  ── LA ÚNICA CANDIDATA DEL LADO PUT: A+D · los escépticos ──`);
  const cand = puts.filter((o) => SEN.A.f(o) && SEN.D.f(o));
  const ca = mide(cand);
  L(`    ratio ${R(ca)} · acierta ${AC(ca)} · n=${num(ca.n)} · ${num(opsIndep(cand) / ANOS_TOT)} ops/año SIN SOLAPE`);
  L(`    año a año: ${anos.map((y) => `${y} ${R(mide(cand.filter((o) => o.ano === y)))}`).join(" · ")}`);
  const cds = [...new Set(cand.map((o) => o.dia))].sort();
  const q1 = cds[Math.floor(cds.length / 3)], q2 = cds[Math.floor(2 * cds.length / 3)];
  L(`    por TERCIOS: ${R(mide(cand.filter((o) => o.dia < q1)))} · ${R(mide(cand.filter((o) => o.dia >= q1 && o.dia < q2)))} · ${R(mide(cand.filter((o) => o.dia >= q2)))}`);
  L(`    SIN 2020: ${R(mide(cand.filter((o) => o.ano !== "2020")))} · sin 2020 ni 2022: ${R(mide(cand.filter((o) => o.ano !== "2020" && o.ano !== "2022")))}`);
  const tkc = new Map();
  for (const o of cand) { if (!tkc.has(o.sym)) tkc.set(o.sym, acc()); suma(tkc.get(o.sym), o.ret); }
  const gc = [...tkc.values()].map((x) => x.gan).sort((x, y) => y - x);
  let ac2 = 0, kc = 0; for (const g of gc) { if (ac2 >= ca.gan / 2) break; ac2 += g; kc++; }
  L(`    tickers para la mitad del dinero: ${kc} de ${tkc.size} · con ratio < 1: ${[...tkc.values()].filter((x) => ratio(x) < 1).length}`);
  const porTkP = new Map();
  for (const o of puts) { if (!porTkP.has(o.sym)) porTkP.set(o.sym, []); porTkP.get(o.sym).push(o); }
  for (const arr of porTkP.values()) arr.sort((x, y) => (x.dia < y.dia ? -1 : 1));
  const rsP = [];
  for (let k = 1; k <= 20; k++) {
    const dp = k * 25; const b = acc();
    for (const arr of porTkP.values()) for (let i = dp; i < arr.length; i++) { const s = arr[i - dp]; if (SEN.A.f(s) && SEN.D.f(s)) suma(b, arr[i].ret); }
    rsP.push(ratio(b));
  }
  rsP.sort((x, y) => x - y);
  L(`    BARAJADO (20 desplazamientos): mediana ${f2(mediana(rsP))} · peor ${f2(rsP[0])} · mejor ${f2(rsP[rsP.length - 1])} · llegan a ${R(ca)}: ${rsP.filter((x) => x >= ratio(ca)).length} de 20`);
  const enBaj = (o) => TRAMOS.some((t) => o.dia >= t.a && o.dia <= t.b);
  L(`    en los tramos bajistas ${R(mide(cand.filter(enBaj)))} (n=${num(cand.filter(enBaj).length)}) · en el resto ${R(mide(cand.filter((o) => !enBaj(o))))} (n=${num(cand.filter((o) => !enBaj(o)).length)})`);
}

// ════════════════════════════════════════════════════════════════════════════
// PASO 6 — LOS ESCÉPTICOS sobre el mejor brazo de calls
// ════════════════════════════════════════════════════════════════════════════
linea("PASO 6 — LOS ESCÉPTICOS · calls con la señal A (entrada diaria)");
{
  const v = VIVAS.filter((o) => o.tipo === "C" && SEN.A.f(o));
  const a = mide(v);
  L(`  n=${num(a.n)} · ${num(opsIndep(v) / ANOS_TOT)} operaciones al año SIN SOLAPE (${num(a.n / ANOS_TOT)} oportunidades) · ratio ${R(a)} · acierta ${AC(a)}`);
  const ds = [...new Set(v.map((o) => o.dia))].sort();
  const c1 = ds[Math.floor(ds.length / 3)], c2 = ds[Math.floor(2 * ds.length / 3)];
  L(`  por TERCIOS de calendario: ${R(mide(v.filter((o) => o.dia < c1)))} (hasta ${c1}) · ${R(mide(v.filter((o) => o.dia >= c1 && o.dia < c2)))} · ${R(mide(v.filter((o) => o.dia >= c2)))} (desde ${c2})`);
  L(`  años sueltos: ${["2018", "2020", "2022", "2025"].map((y) => `${y} ${R(mide(v.filter((o) => o.ano === y)))}`).join(" · ")}`);
  L(`  sin 2020: ${R(mide(v.filter((o) => o.ano !== "2020")))}`);
  const tks = new Map();
  for (const o of v) { if (!tks.has(o.sym)) tks.set(o.sym, acc()); suma(tks.get(o.sym), o.ret); }
  const gs = [...tks.values()].map((x) => x.gan).sort((x, y) => y - x);
  let acu = 0, kt = 0; for (const g of gs) { if (acu >= a.gan / 2) break; acu += g; kt++; }
  L(`  tickers para juntar la mitad del dinero ganado: ${kt} de ${tks.size} · tickers con ratio < 1: ${[...tks.values()].filter((x) => ratio(x) < 1).length}`);
  const porTk = new Map();
  for (const o of VIVAS.filter((x) => x.tipo === "C")) { if (!porTk.has(o.sym)) porTk.set(o.sym, []); porTk.get(o.sym).push(o); }
  for (const arr of porTk.values()) arr.sort((x, y) => (x.dia < y.dia ? -1 : 1));
  const rs = [];
  for (let k = 1; k <= 20; k++) {
    const dp = k * 25;   // 25 a 500 días de bolsa: de un mes a dos años de desplazamiento
    const b = acc();
    for (const arr of porTk.values()) for (let i = dp; i < arr.length; i++) { const s = arr[i - dp]; if (SEN.A.f(s)) suma(b, arr[i].ret); }
    rs.push(ratio(b));
  }
  rs.sort((x, y) => x - y);
  L(`  BARAJADO (20 desplazamientos, de 25 a 500 días de bolsa): mediana ${f2(mediana(rs))} · peor ${f2(rs[0])} · mejor ${f2(rs[rs.length - 1])}`);
  L(`  de los 20 barajados, ¿cuántos llegan al ratio real de ${R(a)}? ${rs.filter((x) => x >= ratio(a)).length}`);
  // y el mismo escéptico para las dos patas + A
  const DOS = dosPatas(VIVAS).filter(SEN.A.f);
  const da = mide(DOS);
  L(`\n  Para contraste, LAS DOS PATAS + señal A: n=${num(da.n)} · ${num(opsIndep(DOS) / ANOS_TOT)} ops/año sin solape · ratio ${R(da)} · acierta ${AC(da)}`);
  const dds = [...new Set(DOS.map((o) => o.dia))].sort();
  const e1 = dds[Math.floor(dds.length / 3)], e2 = dds[Math.floor(2 * dds.length / 3)];
  L(`  por TERCIOS: ${R(mide(DOS.filter((o) => o.dia < e1)))} · ${R(mide(DOS.filter((o) => o.dia >= e1 && o.dia < e2)))} · ${R(mide(DOS.filter((o) => o.dia >= e2)))}`);
  L(`  sin 2020: ${R(mide(DOS.filter((o) => o.ano !== "2020")))}`);
  const tk2 = new Map();
  for (const o of DOS) { if (!tk2.has(o.sym)) tk2.set(o.sym, acc()); suma(tk2.get(o.sym), o.ret); }
  const g2 = [...tk2.values()].map((x) => x.gan).sort((x, y) => y - x);
  let a2 = 0, k2 = 0; for (const g of g2) { if (a2 >= da.gan / 2) break; a2 += g; k2++; }
  L(`  tickers para la mitad del dinero: ${k2} de ${tk2.size} · con ratio < 1: ${[...tk2.values()].filter((x) => ratio(x) < 1).length}`);
  const porTk2 = new Map();
  for (const o of dosPatas(VIVAS)) { if (!porTk2.has(o.sym)) porTk2.set(o.sym, []); porTk2.get(o.sym).push(o); }
  for (const arr of porTk2.values()) arr.sort((x, y) => (x.dia < y.dia ? -1 : 1));
  const rs2 = [];
  for (let k = 1; k <= 20; k++) {
    const dp = k * 25; const b = acc();
    for (const arr of porTk2.values()) for (let i = dp; i < arr.length; i++) { const s = arr[i - dp]; if (SEN.A.f(s)) suma(b, arr[i].ret); }
    rs2.push(ratio(b));
  }
  rs2.sort((x, y) => x - y);
  L(`  BARAJADO de las dos patas (20 desplazamientos): mediana ${f2(mediana(rs2))} · peor ${f2(rs2[0])} · mejor ${f2(rs2[rs2.length - 1])}`);
}

linea("PUERTAS");
L(`  6 señales (sin, A, B, C, D, E) × 4 lados (call, put, las dos sueltas, las dos patas) = 24 casillas`);
L(`  + 4 tramos bajistas × 5 casillas = 20 · + escaleras de quintiles en puts 3×5 = 15 · + 5 parejas en puts`);
L(`  + atribución por SPY = 6 · + 3 correlaciones año a año · + 40 barajados (20 en calls, 20 en dos patas)`);
L(`  COMBINACIONES MEDIDAS: 73 casillas de resultado (sin contar los barajados ni los escépticos).`);
L(`\n  hecho en ${Math.round((Date.now() - t0) / 1000)}s`);
