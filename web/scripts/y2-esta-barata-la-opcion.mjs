// ¿ESTÁ BARATA LA OPCIÓN? — la opción contra lo que la acción se mueve de verdad.
//
// ═══ LA PREGUNTA ════════════════════════════════════════════════════════════════════════════
//
// El envase está fijado y medido: comprar una opción suelta 10% fuera del dinero, 60 días de
// plazo, vendiéndola a los 30 días de bolsa, al ask y vendiendo al bid. Da un RATIO de 1,11 y
// acierta el 17,3%. Hace falta llegar a 1,40, y la palanca es el ACIERTO.
//
// Aquí se prueba lo más directo que hay: comprar SÓLO cuando la opción está barata comparada
// con lo que esa acción suele moverse. Y también lo contrario, comprar sólo cuando está CARA,
// porque las dos tienen defensa (barata = pagas menos por lo mismo; cara = el mercado sabe algo).
//
// ═══ CÓMO SE MIDE, SIN NINGÚN MODELO ════════════════════════════════════════════════════════
//
// LO QUE EL MERCADO COBRA por el movimiento se lee directamente de la cadena, sin Black-Scholes:
//     cuña = (ask de la call al dinero + ask de la put al dinero) / precio de la acción
// del MISMO vencimiento que se va a comprar. Es un precio real que alguien está pidiendo.
//
// LO QUE LA ACCIÓN SE MUEVE DE VERDAD sale de sus propios precios anteriores:
//     rv = desviación de los retornos diarios de los últimos 20 / 60 / 120 días,
//     escalada al plazo del contrato:  movimiento = rv × raíz(días de bolsa hasta el vencimiento)
//
//     cociente = cuña / movimiento   ← lo caro que está HOY
//
// Como el cociente vive en escalas distintas según el ticker (una cuña del 8% es cara en KO y
// barata en TSLA), no se usa el nivel: se usa el PERCENTIL del cociente contra sus propios
// últimos 250 días del MISMO ticker. Ventana que termina el día ANTES de comprar.
//
// ═══ EL PRECIO DE LA ACCIÓN ═════════════════════════════════════════════════════════════════
//
// Paridad put-call, PERO SÓLO EN EL VENCIMIENTO MÁS CERCANO (versión corregida de
// z1-la-rejilla-completa.mjs). Mirando toda la cadena a la vez, los vencimientos lejanos cruzan
// en el precio a futuro y el spot sale inflado. Aquí se valida contra los cierres reales de
// disco antes de medir nada.
//
// ═══ LAS REGLAS DE LA CASA ══════════════════════════════════════════════════════════════════
//   · se COMPRA al ASK y se VENDE al BID. Nunca punto medio.
//   · ningún modelo de precios. Todo sale de la cadena o de precios que existen.
//   · un HUECO no es un cero: si falta la cadena del día de salida, la operación se descarta y
//     se cuenta aparte. Si la cadena está y el contrato no aparece, es que no tiene puja: 0.
//   · SÓLO EL PASADO: los retornos usados terminan el día ANTERIOR a la compra, y el percentil
//     se calcula contra los 250 días anteriores, sin incluir el día de la compra.
//   · el BARAJADO usa un desplazamiento fijo (la señal que le tocaba a la entrada de 13 meses
//     antes del mismo ticker), no Math.random.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/y2-esta-barata-la-opcion.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const CIERRES = "scripts/cache-theta/cierres";

// ── el envase, tal cual está fijado ─────────────────────────────────────────
const ENVASES = {
  A: { dist: 0.10, dte: 60, salida: 30, etiqueta: "A · 10% fuera · 60 días · salir a los 30 de bolsa" },
  B: { dist: 0.05, dte: 90, salida: 30, etiqueta: "B · 5% fuera · 90 días · salir a los 30 de bolsa" },
};
const ASKMIN = 0.10;
const TOLK = 0.50;
const APUESTA = 1000;
const VENTANAS_RV = [20, 60, 120];
const VENT_PCTL = 250;      // días de historia propia contra los que se compara
const MIN_PCTL = 150;       // mínimo de valores válidos dentro de esa ventana
const DESPLS = [7, 13, 25]; // desplazamientos FIJOS (en meses) para el control barajado
const DESPL_BARAJA = 13;    // el que se enseña en las tablas

const tolDte = (d) => Math.max(6, Math.round(d * 0.28));

const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const pct = (x) => (100 * x).toFixed(1) + "%";
const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
const num = (n) => Math.round(n).toLocaleString("en-US");
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);

// ── índice de días por ticker ───────────────────────────────────────────────
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

console.log(`\n## ${TICKERS.length} tickers · ${num(TOTDIAS)} días de cadena`);
console.log(`## envase A: ${ENVASES.A.etiqueta}`);
console.log(`## envase B: ${ENVASES.B.etiqueta}\n`);

// ── caché LRU ───────────────────────────────────────────────────────────────
const cache = new Map();
const MAXC = 200;
let lecturas = 0, fallosFichero = 0;
function cadena(sym, dia) {
  const k = `${sym}|${dia}`;
  if (cache.has(k)) { const v = cache.get(k); cache.delete(k); cache.set(k, v); return v; }
  const f = `${CDIR}/${sym}_d${dia}.json`;
  let v = null;
  if (existsSync(f)) { try { v = JSON.parse(readFileSync(f, "utf8")); lecturas++; } catch { v = null; } }
  else fallosFichero++;
  if (cache.size >= MAXC) cache.delete(cache.keys().next().value);
  cache.set(k, v);
  return v;
}

/** Spot por paridad put-call EN EL VENCIMIENTO MÁS CERCANO. */
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

/** La expiración más cercana a `objetivo` días, dentro de tolerancia. */
function expObjetivo(c, hoy, objetivo) {
  let mejor = null, md = Infinity, dtReal = 0;
  for (const e of Object.keys(c)) {
    const dt = dteDe(hoy, e);
    if (dt < 1) continue;
    const x = Math.abs(dt - objetivo);
    if (x < md) { md = x; mejor = e; dtReal = dt; }
  }
  if (!mejor || md > tolDte(objetivo)) return null;
  return { exp: mejor, dte: dtReal };
}

/**
 * LA CUÑA AL DINERO: ask de la call + ask de la put del strike más cercano al precio,
 * dentro de un 5% del dinero. Es lo que el mercado COBRA por el movimiento, sin modelo.
 */
function cunaDe(c, exp, S) {
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
  if (Math.abs(K / S - 1) > 0.05) return null;      // no hay strike de verdad al dinero
  const askC = g[`${K}|C`][1], askP = g[`${K}|P`][1];
  if (!(askC > 0) || !(askP > 0)) return null;
  return (askC + askP) / S;
}

/** El contrato del envase: `dist` fuera del dinero en la expiración dada. */
function contratoEsquina(c, exp, S, dist, tipo) {
  const g = c[exp];
  if (!g) return null;
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

// ════════════════════════════════════════════════════════════════════════════
// PASE ÚNICO POR TICKER
// ════════════════════════════════════════════════════════════════════════════
const OPS = [];                 // todas las operaciones medidas
let entradas = 0, sinSpot = 0, sinContrato = 0, sinCuna = 0, sinPctl = 0;
let huecos = 0, retSaltados = 0, retTotales = 0;
const audSpot = [];             // error del spot contra los cierres reales

const t0 = Date.now();
for (const sym of TICKERS) {
  const dias = diasPorSim.get(sym);
  const cl = existsSync(`${CIERRES}/${sym}.json`) ? JSON.parse(readFileSync(`${CIERRES}/${sym}.json`, "utf8")) : null;

  // ── 1) serie diaria: spot + cuña de cada envase ──────────────────────────
  const serie = [];             // {d, S, cuna:{A,B}, dte:{A,B}, exp:{A,B}}
  const vistos = new Set();
  const entradasIdx = [];
  for (let i = 0; i < dias.length; i++) {
    const d = dias[i];
    const c = cadena(sym, d);
    if (!c) { serie.push(null); continue; }
    const S = spotOk(c, d);
    if (!S) { sinSpot++; serie.push(null); continue; }
    if (cl && cl[d] > 0) audSpot.push(Math.abs(S / cl[d] - 1));
    const fila = { d, S, cuna: {}, dte: {}, exp: {} };
    for (const [k, e] of Object.entries(ENVASES)) {
      const eo = expObjetivo(c, d, e.dte);
      if (!eo) continue;
      fila.exp[k] = eo.exp; fila.dte[k] = eo.dte;
      const u = cunaDe(c, eo.exp, S);
      if (u != null) fila.cuna[k] = u;
    }
    serie.push(fila);
    const mes = d.slice(0, 6);
    if (!vistos.has(mes)) { vistos.add(mes); entradasIdx.push(i); }
  }

  // ── 2) retornos diarios del propio spot ──────────────────────────────────
  // Sólo entre días de cadena consecutivos con hueco de calendario ≤ 5 días (fin de semana ok).
  // Un salto mayor del 35% en un día es un split (o una lectura mala): se salta y se cuenta.
  const ret = new Array(dias.length).fill(null);
  for (let i = 1; i < dias.length; i++) {
    const a = serie[i - 1], b = serie[i];
    if (!a || !b) continue;
    if (dteDe(a.d, b.d) > 5) continue;
    const r = Math.log(b.S / a.S);
    retTotales++;
    if (Math.abs(r) > 0.35) { retSaltados++; continue; }
    ret[i] = r;
  }

  // ── 3) rv por ventana, cociente y percentil — TODO CON DATOS ANTERIORES ──
  // rv en el índice i usa retornos de índices ≤ i-1  (termina el día ANTES de comprar).
  const coc = {};   // coc[envase][ventana] = array alineado con dias
  for (const k of Object.keys(ENVASES)) { coc[k] = {}; for (const w of VENTANAS_RV) coc[k][w] = new Array(dias.length).fill(null); }
  for (let i = 0; i < dias.length; i++) {
    const f = serie[i];
    if (!f) continue;
    for (const w of VENTANAS_RV) {
      const v = [];
      for (let j = i - 1; j >= 0 && v.length < w; j--) if (ret[j] != null) v.push(ret[j]);
      if (v.length < Math.round(w * 0.8)) continue;
      const s = sd(v);
      if (!(s > 0)) continue;
      for (const k of Object.keys(ENVASES)) {
        if (f.cuna[k] == null || !f.dte[k]) continue;
        const diasBolsa = Math.max(1, f.dte[k] * 252 / 365);
        const mov = s * Math.sqrt(diasBolsa);
        if (!(mov > 0)) continue;
        coc[k][w][i] = f.cuna[k] / mov;
      }
    }
  }
  // LA DESCOMPOSICIÓN: para saber si manda el numerador (la cuña) o el denominador (lo que la
  // acción se mueve), se guardan también las dos piezas por separado, con el MISMO tratamiento.
  const cunaSerie = {};   // cunaSerie[envase] = array
  for (const k of Object.keys(ENVASES)) cunaSerie[k] = serie.map((f) => (f && f.cuna[k] != null ? f.cuna[k] : null));
  const rvSerie = {};     // rvSerie[ventana] = array
  for (const w of VENTANAS_RV) rvSerie[w] = new Array(dias.length).fill(null);
  for (let i = 0; i < dias.length; i++) {
    if (!serie[i]) continue;
    for (const w of VENTANAS_RV) {
      const v = [];
      for (let j = i - 1; j >= 0 && v.length < w; j--) if (ret[j] != null) v.push(ret[j]);
      if (v.length < Math.round(w * 0.8)) continue;
      const s = sd(v);
      if (s > 0) rvSerie[w][i] = s;
    }
  }

  /** Percentil de una serie contra sus propios VENT_PCTL días ANTERIORES (sin incluir hoy). */
  function percentilar(s) {
    const out = new Array(s.length).fill(null);
    for (let i = 0; i < s.length; i++) {
      if (s[i] == null) continue;
      let n = 0, menores = 0;
      for (let j = Math.max(0, i - VENT_PCTL); j < i; j++) { if (s[j] == null) continue; n++; if (s[j] < s[i]) menores++; }
      if (n < MIN_PCTL) continue;
      out[i] = menores / n;
    }
    return out;
  }
  const pc = {}, pcCuna = {}, pcRv = {};
  for (const k of Object.keys(ENVASES)) { pc[k] = {}; for (const w of VENTANAS_RV) pc[k][w] = percentilar(coc[k][w]); }
  for (const k of Object.keys(ENVASES)) pcCuna[k] = percentilar(cunaSerie[k]);
  for (const w of VENTANAS_RV) pcRv[w] = percentilar(rvSerie[w]);

  // ── 4) las operaciones ───────────────────────────────────────────────────
  const porEnvase = { A: [], B: [] };
  for (const i of entradasIdx) {
    const f = serie[i];
    if (!f) continue;
    const c = cadena(sym, dias[i]);
    if (!c) continue;
    entradas++;
    for (const [k, e] of Object.entries(ENVASES)) {
      const exp = f.exp[k];
      if (!exp) { sinContrato++; continue; }
      const iSal = i + e.salida;
      for (const tipo of ["C", "P"]) {
        const ct = contratoEsquina(c, exp, f.S, e.dist, tipo);
        if (!ct) { sinContrato++; continue; }
        if (dias[iSal] == null) { huecos++; continue; }
        let ds = dias[iSal], trunc = 0;
        if (ds >= exp) { ds = exp; trunc = 1; }
        const cs = cadena(sym, ds);
        if (!cs) { huecos++; continue; }
        const grupo = cs[exp];
        if (!grupo) { huecos++; continue; }
        const salida = grupo[ct.clave]?.[0] ?? 0;    // sin puja = 0. Dato real.
        if (f.cuna[k] == null) sinCuna++;
        const señal = {}, sCuna = pcCuna[k][i], sRv = {};
        let algunaSeñal = false;
        for (const w of VENTANAS_RV) { señal[w] = pc[k][w][i]; sRv[w] = pcRv[w][i]; if (señal[w] != null) algunaSeñal = true; }
        if (!algunaSeñal) sinPctl++;
        porEnvase[k].push({
          sCuna, sRv,
          env: k, sym, dia: dias[i], ano: dias[i].slice(0, 4), mes: dias[i].slice(0, 6), tipo,
          ret: (salida - ct.ask) / ct.ask, salida, ask: ct.ask, bid: ct.bid,
          coste: ct.ask / f.S, distReal: ct.distReal, horq: (ct.ask - ct.bid) / ct.ask,
          dteReal: f.dte[k], trunc, cuna: f.cuna[k] ?? null, señal,
        });
      }
    }
  }
  // ── 5) el BARAJADO: a cada operación se le pega la señal que le tocaba a la
  //       entrada de DESPL_BARAJA meses antes del mismo ticker y mismo envase.
  for (const k of Object.keys(ENVASES)) {
    const v = porEnvase[k];
    // agrupar por mes para desplazar por ENTRADAS, no por filas
    const meses = [...new Set(v.map((o) => o.mes))].sort();
    const idxMes = new Map(meses.map((m, j) => [m, j]));
    const señalPorMes = new Map();
    for (const o of v) if (!señalPorMes.has(o.mes)) señalPorMes.set(o.mes, o.señal);
    for (const o of v) {
      o.baraja = {};
      for (const dp of DESPLS) {
        const j = idxMes.get(o.mes) - dp;
        o.baraja[dp] = j >= 0 ? (señalPorMes.get(meses[j]) ?? {}) : {};
      }
    }
    OPS.push(...v);
  }
  cache.clear();
  process.stderr.write(`\r   ${sym} · ${entradas} entradas · ${num(OPS.length)} operaciones · ${Math.round((Date.now() - t0) / 1000)}s     `);
}
process.stderr.write("\n");

// ════════════════════════════════════════════════════════════════════════════
// SANIDAD — antes de mirar ningún resultado
// ════════════════════════════════════════════════════════════════════════════
const linea = (t) => { console.log(`\n${"═".repeat(104)}\n  ${t}\n${"═".repeat(104)}`); };
linea("SANIDAD");
console.log(`  días de entrada usados (el primero de cada mes por ticker) : ${num(entradas)}`);
console.log(`  entradas sin spot deducible                                : ${num(sinSpot)}`);
console.log(`  combinaciones sin contrato que encaje (strike lejos o ask < $0.10) : ${num(sinContrato)}`);
console.log(`  HUECOS descartados (falta la cadena de salida o el vencimiento entero) : ${num(huecos)}`);
console.log(`  operaciones medidas                                        : ${num(OPS.length)}`);
console.log(`  ficheros de cadena leídos: ${num(lecturas)} · no encontrados: ${num(fallosFichero)}`);
console.log(`  retornos diarios saltados por salto > 35% (splits/lecturas malas): ${num(retSaltados)} de ${num(retTotales)} (${pct(retSaltados / retTotales)})`);
{
  const s = [...audSpot].sort((a, b) => a - b);
  console.log(`\n  EL SPOT, validado contra los cierres reales de disco (${num(s.length)} días con los dos):`);
  console.log(`    error mediano ${pct(s[s.length >> 1])} · peor 10% ${pct(s[Math.floor(s.length * 0.9)])} · peor 1% ${pct(s[Math.floor(s.length * 0.99)])}`);
}

for (const k of Object.keys(ENVASES)) {
  const v = OPS.filter((o) => o.env === k);
  if (!v.length) continue;
  console.log(`\n  ENVASE ${k} — ${ENVASES[k].etiqueta}`);
  console.log(`    operaciones ${num(v.length)} · distancia real media ${pct(media(v.map((o) => o.distReal)))} (se pidió ${pct(ENVASES[k].dist)})`);
  console.log(`    plazo real medio ${media(v.map((o) => o.dteReal)).toFixed(0)} días · coste de entrada ${pct(media(v.map((o) => o.coste)))} del subyacente`);
  console.log(`    horquilla media ${pct(media(v.map((o) => o.horq)))} de la prima · ask medio $${media(v.map((o) => o.ask)).toFixed(2)}`);
  console.log(`    vencen sin valor (bid 0 al salir) ${pct(v.filter((o) => o.salida === 0).length / v.length)} · truncadas al vencimiento ${pct(v.filter((o) => o.trunc).length / v.length)}`);
  const conP = v.filter((o) => o.señal[60] != null).length;
  console.log(`    con percentil disponible (ventana 60): ${num(conP)} (${pct(conP / v.length)}) — el resto es calentamiento de los 250 días`);
  console.log(`    cuña al dinero media: ${pct(media(v.filter((o) => o.cuna != null).map((o) => o.cuna)))} del subyacente`);
}

// ════════════════════════════════════════════════════════════════════════════
// LA VARA
// ════════════════════════════════════════════════════════════════════════════
const acc = () => ({ n: 0, win: 0, gan: 0, per: 0, max: 0 });
function suma(a, o) {
  const d = APUESTA * o.ret;
  a.n++; if (d > 0) { a.win++; a.gan += d; if (d > a.max) a.max = d; } else a.per += -d;
}
const ratio = (a) => (a.per > 0 ? a.gan / a.per : (a.gan > 0 ? Infinity : NaN));
const acierto = (a) => a.n ? a.win / a.n : NaN;
function mide(v) { const a = acc(); for (const o of v) suma(a, o); return a; }
const R = (a) => (a.n ? ratio(a).toFixed(2) : " n/d");

// ── el listón: el envase sin ninguna señal ─────────────────────────────────
linea("EL LISTÓN — el envase sin señal");
console.log(`  | envase | n | ratio | acierta | ganador medio | perdedor medio |`);
console.log(`  |---|---|---|---|---|---|`);
const LISTON = {};
for (const k of Object.keys(ENVASES)) {
  const a = mide(OPS.filter((o) => o.env === k));
  LISTON[k] = a;
  console.log(`  | ${k} | ${num(a.n)} | **${ratio(a).toFixed(2)}** | ${pct(acierto(a))} | ${usd(a.gan / a.win)} | ${usd(a.per / (a.n - a.win))} |`);
}
console.log(`\n  (publicado para A: ratio 1.11 · acierta 17.3% · ganador $4,859 · perdedor $916 · n=6,960)`);

// mismo listón, pero SÓLO donde hay percentil — es la comparación honesta
linea("EL LISTÓN RESTRINGIDO — sólo los días donde la señal existe (tras los 250 de calentamiento)");
console.log(`  | envase | ventana rv | n | ratio | acierta |`);
console.log(`  |---|---|---|---|---|`);
const LISTON_R = {};
for (const k of Object.keys(ENVASES)) for (const w of VENTANAS_RV) {
  const a = mide(OPS.filter((o) => o.env === k && o.señal[w] != null));
  LISTON_R[`${k}|${w}`] = a;
  console.log(`  | ${k} | ${w} d | ${num(a.n)} | ${ratio(a).toFixed(2)} | ${pct(acierto(a))} |`);
}

// ════════════════════════════════════════════════════════════════════════════
// LA ESCALERA — cinco montones por percentil
// ════════════════════════════════════════════════════════════════════════════
const QUINTIL = (p) => Math.min(4, Math.floor(p * 5));
const ETQ = ["1 · el 20% MÁS BARATO", "2", "3 · el medio", "4", "5 · el 20% MÁS CARO"];

linea("LA ESCALERA COMPLETA — ratio y acierto por quintil del percentil de lo caro que está");
for (const k of Object.keys(ENVASES)) {
  for (const w of VENTANAS_RV) {
    const base = OPS.filter((o) => o.env === k && o.señal[w] != null);
    if (base.length < 500) continue;
    const q = [0, 1, 2, 3, 4].map((i) => mide(base.filter((o) => QUINTIL(o.señal[w]) === i)));
    const rs = q.map((a) => ratio(a));
    const as = q.map((a) => acierto(a));
    const monoR = rs.every((x, i) => i === 0 || x >= rs[i - 1]) || rs.every((x, i) => i === 0 || x <= rs[i - 1]);
    const monoA = as.every((x, i) => i === 0 || x >= as[i - 1]) || as.every((x, i) => i === 0 || x <= as[i - 1]);
    console.log(`\n  ── ENVASE ${k} · movimiento real de los últimos ${w} días · listón sin señal ${ratio(LISTON_R[`${k}|${w}`]).toFixed(2)} / ${pct(acierto(LISTON_R[`${k}|${w}`]))} ──`);
    console.log(`  | montón | n | ratio | acierta | ganador medio | perdedor medio | cuña media |`);
    console.log(`  |---|---|---|---|---|---|---|`);
    for (let i = 0; i < 5; i++) {
      const a = q[i], sub = base.filter((o) => QUINTIL(o.señal[w]) === i);
      console.log(`  | ${ETQ[i]} | ${num(a.n)} | **${ratio(a).toFixed(2)}** | ${pct(acierto(a))} | ${usd(a.gan / Math.max(1, a.win))} | ${usd(a.per / Math.max(1, a.n - a.win))} | ${pct(media(sub.filter((o) => o.cuna != null).map((o) => o.cuna)))} |`);
    }
    console.log(`  monótona en ratio: ${monoR ? "SÍ" : "NO"} · monótona en acierto: ${monoA ? "SÍ" : "NO"}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// EL BARRIDO DE UMBRALES — las dos direcciones
// ════════════════════════════════════════════════════════════════════════════
const UMBRALES = [
  { et: "el quinto MÁS BARATO      (percentil < 20)", f: (p) => p < 0.20 },
  { et: "el 40% MÁS BARATO         (percentil < 40)", f: (p) => p < 0.40 },
  { et: "la mitad MÁS BARATA       (percentil < 50)", f: (p) => p < 0.50 },
  { et: "la mitad MÁS CARA         (percentil > 50)", f: (p) => p > 0.50 },
  { et: "el 40% MÁS CARO           (percentil > 60)", f: (p) => p > 0.60 },
  { et: "el quinto MÁS CARO        (percentil > 80)", f: (p) => p > 0.80 },
];
const ANOSCAL = 10.6;   // 2016-01 a 2026-08

linea("EL BARRIDO DE UMBRALES — las dos direcciones, en los dos envases");
const CAND = [];
for (const k of Object.keys(ENVASES)) {
  console.log(`\n  ── ENVASE ${k} ──`);
  console.log(`  | regla | ventana rv | n | ops/año | ratio | acierta | listón restringido | BARAJADO (7/13/25 meses) |`);
  console.log(`  |---|---|---|---|---|---|---|---|`);
  for (const u of UMBRALES) for (const w of VENTANAS_RV) {
    const base = OPS.filter((o) => o.env === k && o.señal[w] != null);
    if (base.length < 500) continue;
    const sel = base.filter((o) => u.f(o.señal[w]));
    if (sel.length < 100) continue;
    const a = mide(sel);
    const bars = DESPLS.map((dp) => mide(base.filter((o) => o.baraja?.[dp]?.[w] != null && u.f(o.baraja[dp][w]))));
    const bar = bars[DESPLS.indexOf(DESPL_BARAJA)];
    const lr = LISTON_R[`${k}|${w}`];
    CAND.push({ env: k, u, w, a, bar, bars, sel, lr });
    console.log(`  | ${u.et} | ${w} d | ${num(a.n)} | ${(a.n / ANOSCAL).toFixed(0)} | **${ratio(a).toFixed(2)}** | ${pct(acierto(a))} | ${ratio(lr).toFixed(2)} / ${pct(acierto(lr))} | ${bars.map((b) => R(b)).join(" / ")} |`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// LA MEJOR CANDIDATA, A EXAMEN
// ════════════════════════════════════════════════════════════════════════════
const ANOS = [...new Set(OPS.map((o) => o.ano))].sort();
const CRISIS = ["2018", "2020", "2022", "2025"];

function examen(c, titulo) {
  const { a, sel, lr, bar } = c;
  linea(`${titulo} — envase ${c.env} · ${c.u.et.trim()} · movimiento de ${c.w} días`);
  console.log(`  n=${num(a.n)} (${(a.n / ANOSCAL).toFixed(0)} operaciones al año) · RATIO ${ratio(a).toFixed(2)} · acierta ${pct(acierto(a))}`);
  console.log(`  listón restringido sin señal: ratio ${ratio(lr).toFixed(2)} · acierta ${pct(acierto(lr))}`);
  console.log(`  BARAJADO (la misma regla con el día equivocado, desplazando 7 / 13 / 25 meses): ratio ${c.bars.map((b) => R(b)).join(" / ")}`);
  {
    const m1 = mide(sel.filter((o) => o.ano <= "2020")), m2 = mide(sel.filter((o) => o.ano > "2020"));
    const l1 = mide(OPS.filter((o) => o.env === c.env && o.señal[c.w] != null && o.ano <= "2020"));
    const l2 = mide(OPS.filter((o) => o.env === c.env && o.señal[c.w] != null && o.ano > "2020"));
    console.log(`  LAS DOS MITADES: 2016-2020 ratio ${R(m1)} / acierta ${pct(acierto(m1))} (n=${num(m1.n)}, listón ${R(l1)})  ·  2021-2026 ratio ${R(m2)} / acierta ${pct(acierto(m2))} (n=${num(m2.n)}, listón ${R(l2)})`);
    const t1 = mide(sel.filter((o) => o.ano <= "2019")), t2 = mide(sel.filter((o) => o.ano >= "2020" && o.ano <= "2022")), t3 = mide(sel.filter((o) => o.ano >= "2023"));
    console.log(`  LOS TRES TERCIOS: 16-19 ${R(t1)} (n=${num(t1.n)}) · 20-22 ${R(t2)} (n=${num(t2.n)}) · 23-26 ${R(t3)} (n=${num(t3.n)})`);
  }
  console.log(`  ganador medio ${usd(a.gan / Math.max(1, a.win))} · perdedor medio ${usd(a.per / Math.max(1, a.n - a.win))} · mayor billete ${usd(a.max)}`);
  console.log(`  ratio quitando el mayor billete: ${((a.gan - a.max) / a.per).toFixed(2)}`);

  const cc = mide(sel.filter((o) => o.tipo === "C")), pp = mide(sel.filter((o) => o.tipo === "P"));
  console.log(`  calls: ratio ${R(cc)} acierta ${pct(acierto(cc))} (n=${num(cc.n)}) · puts: ratio ${R(pp)} acierta ${pct(acierto(pp))} (n=${num(pp.n)})`);

  console.log(`\n  Año a año:`);
  console.log(`  | año | n | ratio CON señal | acierta | ratio SIN señal |`);
  console.log(`  |---|---|---|---|---|`);
  let malos = 0, conMuestra = 0;
  for (const y of ANOS) {
    const s = mide(sel.filter((o) => o.ano === y));
    const l = mide(lr === null ? [] : c.sel.length ? OPS.filter((o) => o.env === c.env && o.señal[c.w] != null && o.ano === y) : []);
    if (s.n < 20) { console.log(`  | ${y} | ${s.n} | n/d (muestra corta) | | |`); continue; }
    conMuestra++;
    if (ratio(s) < 1) malos++;
    console.log(`  | ${y} | ${s.n} | **${ratio(s).toFixed(2)}** | ${pct(acierto(s))} | ${R(l)} |`);
  }
  console.log(`  años con ratio por debajo de 1: ${malos} de ${conMuestra}`);

  const crisisTxt = CRISIS.map((y) => { const s = mide(sel.filter((o) => o.ano === y)); return `${y}: ${s.n < 20 ? "n/d" : ratio(s).toFixed(2)} (n=${s.n})`; }).join(" · ");
  console.log(`\n  Las cuatro crisis por separado — ${crisisTxt}`);

  const sin2020 = mide(sel.filter((o) => !(o.dia >= "20200201" && o.dia <= "20200531")));
  const sin2020L = mide(OPS.filter((o) => o.env === c.env && o.señal[c.w] != null && !(o.dia >= "20200201" && o.dia <= "20200531")));
  console.log(`  quitando febrero-mayo de 2020: ratio ${R(sin2020)} (n=${num(sin2020.n)}) · el listón restringido sin esos meses: ${R(sin2020L)}`);

  const porTk = new Map();
  for (const o of sel) { if (!porTk.has(o.sym)) porTk.set(o.sym, []); porTk.get(o.sym).push(o); }
  const tks = [...porTk.entries()].map(([k2, v]) => ({ k: k2, a: mide(v) })).sort((x, y) => y.a.gan - x.a.gan);
  let ac = 0, cuantos = 0;
  for (const t of tks) { if (t.a.gan <= 0) break; ac += t.a.gan; cuantos++; if (ac >= a.gan / 2) break; }
  console.log(`\n  Por ticker: ${tks.length} tickers · ${tks.filter((t) => ratio(t.a) > 1).length} con ratio > 1 · ${cuantos} juntan la mitad de todo lo ganado`);
  console.log(`  mejores: ${tks.slice(0, 5).map((t) => `${t.k} ${R(t.a)}`).join(" · ")}`);
  console.log(`  peores : ${tks.slice(-5).map((t) => `${t.k} ${R(t.a)}`).join(" · ")}`);
  const sinMejor = { gan: a.gan - tks[0].a.gan, per: a.per - tks[0].a.per, n: 1 };
  console.log(`  ratio quitando ${tks[0].k} entero: ${(sinMejor.gan / sinMejor.per).toFixed(2)}`);
  return { malos, conMuestra, cuantos, sin2020, tks };
}

// candidata = la de mayor ratio en el envase A con al menos 100 ops/año
const cands = CAND.filter((c) => c.env === "A" && c.a.n / ANOSCAL >= 100).sort((x, y) => ratio(y.a) - ratio(x.a));
const mejor = cands[0] ?? CAND.filter((c) => c.env === "A").sort((x, y) => ratio(y.a) - ratio(x.a))[0];
const infoMejor = mejor ? examen(mejor, "LA MEJOR DEL ENVASE A") : null;

// y la misma regla en el envase B
const gemela = mejor ? CAND.find((c) => c.env === "B" && c.u.et === mejor.u.et && c.w === mejor.w) : null;
if (gemela) examen(gemela, "LA MISMA REGLA EN EL ENVASE B");

// la mejor absoluta del envase B
const mejorB = CAND.filter((c) => c.env === "B" && c.a.n / ANOSCAL >= 100).sort((x, y) => ratio(y.a) - ratio(x.a))[0];
if (mejorB && (!gemela || mejorB.u.et !== gemela.u.et || mejorB.w !== gemela.w)) examen(mejorB, "LA MEJOR DEL ENVASE B");

// ════════════════════════════════════════════════════════════════════════════
// ¿Y SI LA SEÑAL SE USA COMO NIVEL EN VEZ DE COMO PERCENTIL?
// Control barato: el propio cociente crudo, partido en quintiles GLOBALES por ticker
// no se puede (sería mirar al futuro). Lo que sí: la CUÑA sola, sin dividir por nada.
// Si la cuña sola hace lo mismo, el "movimiento real" no aporta nada.
// ════════════════════════════════════════════════════════════════════════════
linea("LA DESCOMPOSICIÓN — ¿manda la cuña (lo que cobran) o el movimiento real (lo que se mueve)?");
console.log(`  El cociente tiene dos piezas. Se percentilan las dos POR SEPARADO, misma ventana de 250 días`);
console.log(`  y las mismas reglas. Si una sola de ellas hace todo el trabajo, el cociente sobra.`);
console.log(`\n  | envase | señal | quinto BAJO: n / ratio / acierta | quinto ALTO: n / ratio / acierta |`);
console.log(`  |---|---|---|---|`);
for (const k of Object.keys(ENVASES)) {
  const fila = (et, campo) => {
    const base = OPS.filter((o) => o.env === k && campo(o) != null);
    if (base.length < 500) return;
    const lo = mide(base.filter((o) => campo(o) < 0.20)), hi = mide(base.filter((o) => campo(o) > 0.80));
    console.log(`  | ${k} | ${et} | ${num(lo.n)} / ${R(lo)} / ${pct(acierto(lo))} | ${num(hi.n)} / ${R(hi)} / ${pct(acierto(hi))} |`);
  };
  fila("**el cociente** (cuña ÷ movimiento, rv 60d)", (o) => o.señal[60]);
  fila("sólo la CUÑA (lo que cobran)", (o) => o.sCuna);
  fila("sólo el MOVIMIENTO real (rv 60d)", (o) => o.sRv[60]);
  fila("sólo el MOVIMIENTO real (rv 120d)", (o) => o.sRv[120]);
}

// ── la regla combinada: caro con la ventana de 60 Y con la de 120 ──────────
linea("¿SE PUEDE SUBIR LA FRECUENCIA? — reglas más anchas y combinadas, envase A");
console.log(`  | regla | n | ops/año | ratio | acierta | barajado 7/13/25 |`);
console.log(`  |---|---|---|---|---|---|`);
{
  const base = OPS.filter((o) => o.env === "A" && o.señal[60] != null && o.señal[120] != null);
  const reglas = [
    ["caro (>80) con rv 60d", (s) => s[60] > 0.80],
    ["caro (>80) con rv 120d", (s) => s[120] > 0.80],
    ["caro (>80) con las DOS ventanas", (s) => s[60] > 0.80 && s[120] > 0.80],
    ["caro (>80) con ALGUNA de las dos", (s) => s[60] > 0.80 || s[120] > 0.80],
    ["caro (>70) con las DOS ventanas", (s) => s[60] > 0.70 && s[120] > 0.70],
    ["caro (>60) con las DOS ventanas", (s) => s[60] > 0.60 && s[120] > 0.60],
    ["caro (>60) con ALGUNA de las dos", (s) => s[60] > 0.60 || s[120] > 0.60],
  ];
  for (const [et, f] of reglas) {
    const a = mide(base.filter((o) => f(o.señal)));
    const bs = DESPLS.map((dp) => mide(base.filter((o) => o.baraja?.[dp]?.[60] != null && o.baraja[dp][120] != null && f(o.baraja[dp]))));
    console.log(`  | ${et} | ${num(a.n)} | ${(a.n / ANOSCAL).toFixed(0)} | **${R(a)}** | ${pct(acierto(a))} | ${bs.map((b) => R(b)).join(" / ")} |`);
  }
}

// ── calls y puts por separado, en las reglas que importan ──────────────────
linea("CALLS Y PUTS POR SEPARADO — la pega grande");
console.log(`  | envase | regla | lado | n | ops/año | ratio | acierta |`);
console.log(`  |---|---|---|---|---|---|---|`);
for (const k of Object.keys(ENVASES)) for (const [et, f] of [["caro >80, rv 60d", (o) => o.señal[60] > 0.80], ["caro >60, rv 60d", (o) => o.señal[60] > 0.60], ["SIN señal", () => true]]) {
  for (const tipo of ["C", "P"]) {
    const a = mide(OPS.filter((o) => o.env === k && o.señal[60] != null && o.tipo === tipo && f(o)));
    console.log(`  | ${k} | ${et} | ${tipo === "C" ? "calls" : "puts"} | ${num(a.n)} | ${(a.n / ANOSCAL).toFixed(0)} | ${R(a)} | ${pct(acierto(a))} |`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
linea("RESUMEN");
// AVISO DE PUERTAS — se cuentan TODAS las que se han abierto, no sólo las de la rejilla principal.
const nE = Object.keys(ENVASES).length, nW = VENTANAS_RV.length;
const nRejilla = nE * nW * (5 + UMBRALES.length);   // quintiles + umbrales, los dos envases
const nComb2 = 7;                                    // reglas combinadas de las dos ventanas
const nDesc = nE * 4 * 2;                            // descomposición: 4 señales × 2 extremos
const nLados = nE * 3 * 2;                           // calls/puts en 3 reglas
const nComb = nRejilla + nComb2 + nDesc + nLados;
console.log(`  PUERTAS ABIERTAS: ${nRejilla} en la rejilla principal (2 envases × 3 ventanas × (5 quintiles + 6 umbrales))`);
console.log(`                  + ${nComb2} reglas combinadas + ${nDesc} de la descomposición + ${nLados} de calls/puts = ${nComb} en total`);
console.log(`  operaciones totales ${num(OPS.length)} · huecos ${num(huecos)} (${pct(huecos / (huecos + OPS.length))})`);
if (mejor) {
  console.log(`  mejor regla del envase A: ${mejor.u.et.trim()} · movimiento de ${mejor.w} días`);
  console.log(`    ratio ${ratio(mejor.a).toFixed(2)} (listón ${ratio(mejor.lr).toFixed(2)}) · acierta ${pct(acierto(mejor.a))} (listón ${pct(acierto(mejor.lr))}) · ${(mejor.a.n / ANOSCAL).toFixed(0)} ops/año`);
  console.log(`    barajado ${R(mejor.bar)} · años por debajo de 1: ${infoMejor.malos} de ${infoMejor.conMuestra} · tickers para la mitad: ${infoMejor.cuantos}`);
}
console.log(`  minutos: ${((Date.now() - t0) / 60000).toFixed(1)}`);
console.log(`${"═".repeat(104)}\n`);
