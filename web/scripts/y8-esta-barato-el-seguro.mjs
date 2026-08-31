// ¿ESTÁ BARATO EL SEGURO? — el régimen del MERCADO ENTERO como filtro de entrada.
//
// ═══ QUÉ MIDE, EN CASTELLANO ════════════════════════════════════════════════════════════════
//
// Las otras familias miran cada ticker contra sí mismo. Ésta mira el mercado entero de una vez.
// La idea: hay épocas en que TODO el seguro está barato y épocas en que TODO está caro. Si eso
// es cierto, comprar en las épocas buenas debería acertar más en los 40 tickers A LA VEZ.
//
// EL TERMÓMETRO. Lo que cuesta el seguro del mercado un día es la CUÑA AL DINERO de SPY: el
// precio de la call y la put pegadas al precio, sumadas, dividido por el precio. Un 5% quiere
// decir "asegurar el índice 60 días cuesta el 5% de lo asegurado". Se hace igual con QQQ.
// Como el vencimiento más cercano a 60 días no cae siempre en el mismo sitio, la cuña se pone
// en escala de 60 días dividiéndola por la raíz de (días/60). Eso NO es un modelo de precios:
// es sólo poner todas las lecturas en la misma unidad de tiempo para poder compararlas.
//
// EL PERCENTIL. Ese número se compara con SU PROPIA HISTORIA: los 250 días de bolsa anteriores,
// ventana que TERMINA EL DÍA ANTES de la compra. Nunca entra un dato del futuro.
//
// LAS DOS LECTURAS, las dos con defensa:
//   · comprar cuando el seguro está BARATO → pagas menos por lo mismo
//   · comprar cuando está CARO → el mercado está nervioso y el nerviosismo viene en rachas
// Se parten los días en CINCO montones por percentil y se mide el envase completo en cada uno.
//
// LA VERSIÓN LENTA: no el nivel sino el CAMBIO. ¿La cuña está subiendo o bajando respecto a
// hace 20 días de bolsa (4 semanas)? Un seguro que se encarece dice algo distinto de uno caro.
//
// EL AVISO: esto puede ser 2020 disfrazado. En marzo de 2020 el seguro estaba carísimo y todo
// se movió. Por eso TODA la escalera se repite quitando el año 2020 entero.
//
// ═══ EL ENVASE (fijado de antes, aquí NO se toca) ═══════════════════════════════════════════
//   A: opción suelta 10% fuera del dinero · vencimiento ~60 días · vender a los 30 días de bolsa
//   B: opción suelta  5% fuera del dinero · vencimiento ~90 días · vender a los 30 días de bolsa
//   Se compra al ASK y se vende al BID. $1.000 de riesgo por intento.
//
// ═══ REGLAS DE LA CASA ══════════════════════════════════════════════════════════════════════
//   · ASK para comprar, BID para vender. Nunca punto medio EN EL DINERO. (El termómetro sí usa
//     punto medio, pero el termómetro no compra nada: es una medida, no una operación.)
//   · Ningún modelo de precios. Black-Scholes prohibido.
//   · UN HUECO NO ES UN CERO: si falta la cadena del día de salida, la operación se DESCARTA y
//     se cuenta aparte. Si la cadena está y el contrato no aparece, es que no tiene puja: vale 0.
//   · SÓLO EL PASADO en toda ventana.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/y8-esta-barato-el-seguro.mjs

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const CACHE_TERM = "scripts/cache-theta/_y8-termometro.json";
const CACHE_OPS = "scripts/cache-theta/_y8-operaciones.json";
const APUESTA = 1000;

// ── el envase, fijo ─────────────────────────────────────────────────────────
const ENVASES = {
  A: { dist: 0.10, dte: 60, salida: 30, tolDte: 17, tolK: 0.50 },
  B: { dist: 0.05, dte: 90, salida: 30, tolDte: 25, tolK: 0.50 },
};

// ── el termómetro ───────────────────────────────────────────────────────────
const TERM_DTE = 60;      // plazo objetivo de la cuña
const TERM_TOL = 12;      // cuánto puede apartarse el vencimiento disponible
const VENTANA = 250;      // días de bolsa de historia para el percentil (termina el día ANTES)
const RETARDO = 20;       // días de bolsa para la versión "cambio" (4 semanas)
const DESPL = 125;        // desplazamiento fijo del barajado (medio año de bolsa)

const num = (n, d = 2) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const dol = (n) => "$" + Math.round(n).toLocaleString("en-US");
const pct = (x, d = 1) => (100 * x).toFixed(d) + "%";
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
const TICKERS = [...diasPorSim.keys()].sort();
const TOTDIAS = [...diasPorSim.values()].reduce((a, v) => a + v.length, 0);

// ── lector de cadenas con caché acotada ─────────────────────────────────────
const cache = new Map();
const MAXC = 48;
let parseos = 0;
function cadena(sym, dia) {
  const k = `${sym}|${dia}`;
  if (cache.has(k)) { const v = cache.get(k); cache.delete(k); cache.set(k, v); return v; }
  const f = `${CDIR}/${sym}_d${dia}.json`;
  let v = null;
  if (existsSync(f)) { try { v = JSON.parse(readFileSync(f, "utf8")); parseos++; } catch { v = null; } }
  if (cache.size >= MAXC) cache.delete(cache.keys().next().value);
  cache.set(k, v);
  return v;
}

/** EL SPOT, versión CORREGIDA: paridad put-call SÓLO en el vencimiento más cercano.
 *  Mirar toda la cadena a la vez cruza en el precio a futuro y sale inflado (>2% uno de cada
 *  siete días, siempre hacia arriba). Esto es una identidad de no-arbitraje, no un modelo. */
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

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 1 — EL TERMÓMETRO (cuña al dinero de SPY y de QQQ)
// ════════════════════════════════════════════════════════════════════════════
function construirTermometro(sym) {
  const dias = diasPorSim.get(sym) || [];
  const out = [];
  let sinSpot = 0, sinExp = 0, sinStrike = 0;
  for (const dia of dias) {
    const c = cadena(sym, dia);
    if (!c) continue;
    const S = spotOk(c, dia);
    if (!S) { sinSpot++; continue; }
    // vencimiento más cercano a 60 días
    let exp = null, md = Infinity, dteR = 0;
    for (const e of Object.keys(c)) {
      const d = dteDe(dia, e);
      if (d < 1) continue;
      const x = Math.abs(d - TERM_DTE);
      if (x < md) { md = x; exp = e; dteR = d; }
    }
    if (!exp || md > TERM_TOL) { sinExp++; continue; }
    // strike pegado al precio con call Y put cotizando
    const g = c[exp];
    let K = null, dk = Infinity;
    for (const cl of Object.keys(g)) {
      if (cl.slice(-1) !== "C") continue;
      const k = Number(cl.slice(0, -2));
      const P = g[`${k}|P`], C = g[cl];
      if (!P || !(P[1] > 0) || !(C[1] > 0)) continue;
      const d = Math.abs(k - S);
      if (d < dk) { dk = d; K = k; }
    }
    if (K == null || dk > S * 0.03) { sinStrike++; continue; }
    const C = g[`${K}|C`], P = g[`${K}|P`];
    const cuna = ((C[0] + C[1]) / 2 + (P[0] + P[1]) / 2) / S;
    // a escala de 60 días: la cuña crece con la raíz del tiempo
    out.push({ dia, cuna: cuna / Math.sqrt(dteR / TERM_DTE), dte: dteR, S });
  }
  cache.clear();
  return { sym, filas: out, sinSpot, sinExp, sinStrike };
}

let TERM;
if (existsSync(CACHE_TERM) && !process.env.RECALC) {
  TERM = JSON.parse(readFileSync(CACHE_TERM, "utf8"));
  console.log(`## termómetro leído de caché (${CACHE_TERM})`);
} else {
  console.log("## construyendo el termómetro (SPY y QQQ)…");
  TERM = { SPY: construirTermometro("SPY"), QQQ: construirTermometro("QQQ") };
  writeFileSync(CACHE_TERM, JSON.stringify(TERM));
}

console.log(`\n${"═".repeat(96)}`);
console.log("  ETAPA 1 — EL TERMÓMETRO");
console.log(`${"═".repeat(96)}`);
for (const s of ["SPY", "QQQ"]) {
  const t = TERM[s];
  const cs = t.filas.map((f) => f.cuna).sort((a, b) => a - b);
  const dts = t.filas.map((f) => f.dte);
  console.log(`  ${s}: ${t.filas.length.toLocaleString("en-US")} días con cuña · ${t.filas[0].dia} → ${t.filas.at(-1).dia}`);
  console.log(`      cuña al dinero (60d): más barata ${pct(cs[0])} · mediana ${pct(cs[Math.floor(cs.length / 2)])} · más cara ${pct(cs.at(-1))}`);
  console.log(`      vencimiento real usado: ${Math.min(...dts)}–${Math.max(...dts)} días · descartados ${t.sinSpot} sin precio, ${t.sinExp} sin vencimiento cerca, ${t.sinStrike} sin strike al dinero`);
}

// ── percentiles con ventana que TERMINA EL DÍA ANTES ────────────────────────
/** Para el día i: posición de v[i] dentro de v[i-VENTANA .. i-1]. Sólo pasado. */
function percentilesRodantes(vals) {
  const out = new Array(vals.length).fill(null);
  for (let i = VENTANA; i < vals.length; i++) {
    if (vals[i] == null) continue;
    let n = 0, men = 0;
    for (let j = i - VENTANA; j < i; j++) {
      if (vals[j] == null) continue;
      n++; if (vals[j] < vals[i]) men++;
    }
    if (n >= VENTANA * 0.8) out[i] = men / n;
  }
  return out;
}

const SENALES = {};   // nombre -> Map(dia -> percentil 0..1)
for (const s of ["SPY", "QQQ"]) {
  const filas = TERM[s].filas;
  const dias = filas.map((f) => f.dia);
  const nivel = filas.map((f) => f.cuna);
  const cambio = nivel.map((v, i) => (i >= RETARDO ? v - nivel[i - RETARDO] : null));
  const pNivel = percentilesRodantes(nivel);
  const pCambio = percentilesRodantes(cambio);
  SENALES[`${s}·nivel`] = new Map(dias.map((d, i) => [d, pNivel[i]]));
  SENALES[`${s}·cambio`] = new Map(dias.map((d, i) => [d, pCambio[i]]));
  // barajado: el percentil de hace DESPL días de bolsa pegado al día de hoy
  SENALES[`${s}·nivel·BARAJADO`] = new Map(dias.map((d, i) => [d, i >= DESPL ? pNivel[i - DESPL] : null]));
}
// mezcla: media de los dos percentiles de nivel
{
  const a = SENALES["SPY·nivel"], b = SENALES["QQQ·nivel"];
  const m = new Map();
  for (const [d, v] of a) { const w = b.get(d); if (v != null && w != null) m.set(d, (v + w) / 2); }
  SENALES["SPY+QQQ·nivel"] = m;
}

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 2 — LAS OPERACIONES DEL ENVASE (los 40 tickers)
// ════════════════════════════════════════════════════════════════════════════
function construirOps() {
  const filas = [];
  const san = {};
  for (const k of Object.keys(ENVASES)) san[k] = { n: 0, huecos: 0, sinContrato: 0, trunc: 0, sumCoste: 0, sinValor: 0, sumHorq: 0 };
  let entradas = 0, sinSpot = 0;
  const t0 = Date.now();

  for (const sym of TICKERS) {
    const dias = diasPorSim.get(sym);
    const vistosMes = new Set(), vistasSem = new Set();
    for (let i = 0; i < dias.length; i++) {
      const dia = dias[i];
      const c = cadena(sym, dia);
      if (!c) continue;
      const S = spotOk(c, dia);
      if (!S) { sinSpot++; continue; }
      entradas++;
      const mes = dia.slice(0, 6);
      const esMes = !vistosMes.has(mes); if (esMes) vistosMes.add(mes);
      const sem = Math.floor(ms(dia) / (7 * 86_400_000));
      const esSem = !vistasSem.has(sem); if (esSem) vistasSem.add(sem);

      for (const [nom, E] of Object.entries(ENVASES)) {
        // vencimiento
        let exp = null, md = Infinity;
        for (const e of Object.keys(c)) {
          const d = dteDe(dia, e);
          if (d < 1) continue;
          const x = Math.abs(d - E.dte);
          if (x < md) { md = x; exp = e; }
        }
        if (!exp || md > E.tolDte) { san[nom].sinContrato += 2; continue; }
        const g = c[exp];
        for (const tipo of ["C", "P"]) {
          const obj = tipo === "C" ? S * (1 + E.dist) : S * (1 - E.dist);
          let mej = null, dk = Infinity;
          for (const [cl, ba] of Object.entries(g)) {
            if (cl.slice(-1) !== tipo) continue;
            if (!(ba[1] > 0)) continue;
            const K = Number(cl.slice(0, -2));
            const d = Math.abs(K - obj);
            if (d < dk) { dk = d; mej = { K, cl, bid: ba[0], ask: ba[1] }; }
          }
          if (!mej) { san[nom].sinContrato++; continue; }
          const distReal = tipo === "C" ? mej.K / S - 1 : 1 - mej.K / S;
          if (Math.abs(distReal - E.dist) > E.dist * E.tolK) { san[nom].sinContrato++; continue; }

          let ds = dias[i + E.salida] ?? null, trunc = 0;
          if (!ds) { san[nom].huecos++; continue; }
          if (ds >= exp) { ds = exp; trunc = 1; }
          const cs = cadena(sym, ds);
          if (!cs) { san[nom].huecos++; continue; }
          const grupo = cs[exp];
          if (!grupo) { san[nom].huecos++; continue; }
          const salida = grupo[mej.cl]?.[0] ?? 0;   // sin puja = 0. Dato real.
          const ret = (salida - mej.ask) / mej.ask;
          san[nom].n++; san[nom].trunc += trunc; san[nom].sumCoste += mej.ask / S;
          san[nom].sumHorq += (mej.ask - mej.bid) / mej.ask;
          if (salida === 0) san[nom].sinValor++;
          filas.push({ e: nom, t: sym, d: dia, tp: tipo, r: ret, m: esMes ? 1 : 0, s: esSem ? 1 : 0, c: Math.round(1e5 * mej.ask / S) / 1e5 });
        }
      }
    }
    cache.clear();
    process.stderr.write(`\r   ${sym} · ${entradas.toLocaleString("en-US")} entradas · ${filas.length.toLocaleString("en-US")} ops · ${Math.round((Date.now() - t0) / 1000)}s      `);
  }
  process.stderr.write("\n");
  return { filas, san, entradas, sinSpot, parseos };
}

let OPS;
if (existsSync(CACHE_OPS) && !process.env.RECALC) {
  OPS = JSON.parse(readFileSync(CACHE_OPS, "utf8"));
  console.log(`\n## operaciones leídas de caché (${CACHE_OPS})`);
} else {
  console.log("\n## midiendo el envase en los 40 tickers (todos los días de bolsa)…");
  OPS = construirOps();
  writeFileSync(CACHE_OPS, JSON.stringify(OPS));
}

console.log(`\n${"═".repeat(96)}`);
console.log("  ETAPA 2 — SANIDAD DEL ENVASE");
console.log(`${"═".repeat(96)}`);
console.log(`  ${TICKERS.length} tickers · ${TOTDIAS.toLocaleString("en-US")} días de cadena en disco`);
console.log(`  días de entrada con precio deducible: ${OPS.entradas.toLocaleString("en-US")} · descartados sin precio: ${OPS.sinSpot}`);
for (const [nom, s] of Object.entries(OPS.san)) {
  console.log(`  envase ${nom}: ${s.n.toLocaleString("en-US")} operaciones · ${s.huecos.toLocaleString("en-US")} huecos descartados · ${s.sinContrato.toLocaleString("en-US")} sin contrato que encaje`);
  console.log(`      coste medio de entrada ${pct(s.sumCoste / s.n, 2)} del precio del subyacente · horquilla media ${pct(s.sumHorq / s.n)} de la prima`);
  console.log(`      vencen sin valor: ${pct(s.sinValor / s.n)} · salidas recortadas al vencimiento: ${s.trunc.toLocaleString("en-US")}`);
}

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 3 — LA ESCALERA
// ════════════════════════════════════════════════════════════════════════════
const acc = () => ({ n: 0, win: 0, gan: 0, per: 0 });
function mete(a, ret) { const d = APUESTA * ret; a.n++; if (d > 0) { a.win++; a.gan += d; } else a.per += -d; }
const ratio = (a) => (a.per > 0 ? a.gan / a.per : NaN);
const acierto = (a) => (a.n ? a.win / a.n : NaN);
const neto = (a) => a.gan - a.per;

/** Filtra filas por envase y por muestreo ("mes" | "sem" | "todo"). */
function filtra(env, muestreo) {
  return OPS.filas.filter((f) => f.e === env && (muestreo === "todo" || (muestreo === "mes" ? f.m : f.s)));
}

const ANOS = (f) => f.d.slice(0, 4);
const BUCKETS = 5;
const cual = (p) => Math.min(BUCKETS - 1, Math.floor(p * BUCKETS));

function escalera(filas, senal, { sin2020 = false } = {}) {
  const b = Array.from({ length: BUCKETS }, acc);
  const base = acc();
  let sinSenal = 0;
  for (const f of filas) {
    if (sin2020 && f.d.slice(0, 4) === "2020") continue;
    mete(base, f.r);
    const p = senal.get(f.d);
    if (p == null) { sinSenal++; continue; }
    mete(b[cual(p)], f.r);
  }
  return { b, base, sinSenal };
}

function pintaEscalera(titulo, filas, senal, opts = {}) {
  const { b, base, sinSenal } = escalera(filas, senal, opts);
  const anos = new Set(filas.map(ANOS)).size;
  console.log(`\n  ${titulo}`);
  console.log(`  montón            ops    ops/año   acierto     ratio        neto`);
  const et = ["1 el más BARATO", "2", "3", "4", "5 el más CARO "];
  for (let i = 0; i < BUCKETS; i++) {
    const a = b[i];
    if (!a.n) { console.log(`  ${et[i].padEnd(16)}  sin operaciones`); continue; }
    console.log(`  ${et[i].padEnd(16)} ${String(a.n).padStart(6)} ${num(a.n / anos, 0).padStart(9)} ${pct(acierto(a)).padStart(9)} ${num(ratio(a)).padStart(9)} ${dol(neto(a)).padStart(12)}`);
  }
  console.log(`  ${"TODOS (listón)".padEnd(16)} ${String(base.n).padStart(6)} ${num(base.n / anos, 0).padStart(9)} ${pct(acierto(base)).padStart(9)} ${num(ratio(base)).padStart(9)} ${dol(neto(base)).padStart(12)}`);
  if (sinSenal) console.log(`  (${sinSenal.toLocaleString("en-US")} ops sin termómetro todavía — los primeros 250 días de bolsa no tienen historia)`);
  return { b, base };
}

console.log(`\n${"═".repeat(96)}`);
console.log("  ETAPA 3 — LA ESCALERA POR PRECIO DEL SEGURO");
console.log(`${"═".repeat(96)}`);

const MUESTREOS = process.env.MUESTREO ? [process.env.MUESTREO] : ["mes", "sem"];
const resumen = {};
for (const muestreo of MUESTREOS) {
  for (const env of ["A", "B"]) {
    const filas = filtra(env, muestreo);
    console.log(`\n${"─".repeat(96)}`);
    console.log(`  ENVASE ${env} · muestreo ${muestreo === "mes" ? "MENSUAL (una entrada al mes por ticker)" : "SEMANAL (una entrada a la semana por ticker)"} · ${filas.length.toLocaleString("en-US")} operaciones`);
    console.log(`${"─".repeat(96)}`);
    for (const s of ["SPY·nivel", "QQQ·nivel", "SPY+QQQ·nivel", "SPY·cambio", "QQQ·cambio", "SPY·nivel·BARAJADO"]) {
      const r = pintaEscalera(`termómetro: ${s}`, filas, SENALES[s]);
      resumen[`${env}|${muestreo}|${s}`] = r;
    }
    // sin 2020
    const r2 = pintaEscalera("termómetro: SPY·nivel — QUITANDO 2020 ENTERO", filas, SENALES["SPY·nivel"], { sin2020: true });
    resumen[`${env}|${muestreo}|SPY·nivel|sin2020`] = r2;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 4 — AUTOPSIA DEL MONTÓN GANADOR
// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(96)}`);
console.log("  ETAPA 4 — AUTOPSIA: año a año, concentración por ticker, y los años difíciles");
console.log(`${"═".repeat(96)}`);

function autopsia(titulo, filas, senal, bucket) {
  const sel = filas.filter((f) => { const p = senal.get(f.d); return p != null && cual(p) === bucket; });
  if (!sel.length) { console.log(`\n  ${titulo}: sin operaciones`); return null; }
  const tot = acc(); for (const f of sel) mete(tot, f.r);
  console.log(`\n  ${titulo}`);
  console.log(`  n=${sel.length.toLocaleString("en-US")} · ratio ${num(ratio(tot))} · acierto ${pct(acierto(tot))} · neto ${dol(neto(tot))}`);

  // año a año
  const porAno = new Map();
  for (const f of sel) { const a = ANOS(f); if (!porAno.has(a)) porAno.set(a, acc()); mete(porAno.get(a), f.r); }
  const anos = [...porAno.keys()].sort();
  let bajoUno = 0;
  const lin = anos.map((a) => { const r = ratio(porAno.get(a)); if (!(r >= 1)) bajoUno++; return `${a} ${Number.isFinite(r) ? num(r) : "—"}`; });
  console.log(`  año a año: ${lin.join(" · ")}`);
  console.log(`  años por debajo de 1: ${bajoUno} de ${anos.length}`);

  // concentración por ticker
  const porTk = new Map();
  for (const f of sel) { if (!porTk.has(f.t)) porTk.set(f.t, acc()); mete(porTk.get(f.t), f.r); }
  const gan = [...porTk.entries()].map(([t, a]) => [t, a.gan]).sort((x, y) => y[1] - x[1]);
  const totGan = gan.reduce((s, x) => s + x[1], 0);
  let ac = 0, k = 0;
  for (const [, g] of gan) { ac += g; k++; if (ac >= totGan / 2) break; }
  console.log(`  tickers que hacen falta para juntar la mitad del dinero ganado: ${k} de ${porTk.size} (${gan.slice(0, 5).map((x) => x[0]).join(", ")}…)`);
  const perdedores = [...porTk.values()].filter((a) => neto(a) < 0).length;
  console.log(`  tickers con neto negativo dentro del montón: ${perdedores} de ${porTk.size}`);

  // los años difíciles por separado
  const duros = ["2018", "2020", "2022", "2025"];
  const cad = duros.map((y) => { const a = porAno.get(y); return a ? `${y} ratio ${num(ratio(a))} (n=${a.n})` : `${y} —`; });
  console.log(`  años exigidos: ${cad.join(" · ")}`);

  // sin 2020
  const sin20 = acc(); for (const f of sel) if (ANOS(f) !== "2020") mete(sin20, f.r);
  console.log(`  QUITANDO 2020: ratio ${num(ratio(sin20))} · acierto ${pct(acierto(sin20))} · n=${sin20.n.toLocaleString("en-US")} · neto ${dol(neto(sin20))}`);
  return { tot, sin20, bajoUno, anosN: anos.length, k, tks: porTk.size };
}

for (const muestreo of MUESTREOS) {
  for (const env of ["A", "B"]) {
    const filas = filtra(env, muestreo);
    for (const s of ["SPY·nivel", "SPY·cambio"]) {
      for (const bucket of [0, 4]) {
        autopsia(`ENVASE ${env} · ${muestreo} · ${s} · montón ${bucket + 1}`, filas, SENALES[s], bucket);
      }
    }
  }
}

console.log("\n## fin\n");

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 5 — LA CONTRADICCIÓN: el mismo envase medido en tres rejillas de entrada
//
// La escalera sale preciosa con entradas MENSUALES y se deshace con entradas SEMANALES.
// Como el envase es EL MISMO, la diferencia sólo puede venir de QUÉ DÍAS se compra. Aquí se
// mira eso de frente: el listón y la escalera con TODOS los días de bolsa (la muestra más
// grande y la menos arbitraria), y de paso en qué años vive cada montón — porque si un montón
// es "2020 y 2022" y otro es "2019 y 2021", la escalera no está ordenando días: ordena AÑOS.
// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(96)}`);
console.log("  ETAPA 5 — LA CONTRADICCIÓN: mensual vs semanal vs todos los días");
console.log(`${"═".repeat(96)}`);

console.log("\n  EL LISTÓN (sin ninguna señal), con la misma regla y sólo cambiando los días de compra:");
console.log("  envase  rejilla        ops   acierto   ratio          neto");
for (const env of ["A", "B"]) {
  for (const m of ["mes", "sem", "todo"]) {
    const f = filtra(env, m); const a = acc(); for (const x of f) mete(a, x.r);
    console.log(`  ${env}       ${m.padEnd(8)} ${String(a.n).padStart(8)} ${pct(acierto(a)).padStart(8)} ${num(ratio(a)).padStart(8)} ${dol(neto(a)).padStart(14)}`);
  }
}

for (const env of ["A", "B"]) {
  const filas = filtra(env, "todo");
  console.log(`\n${"─".repeat(96)}`);
  console.log(`  ENVASE ${env} · TODOS LOS DÍAS · ${filas.length.toLocaleString("en-US")} operaciones`);
  console.log(`${"─".repeat(96)}`);
  for (const s of ["SPY·nivel", "SPY+QQQ·nivel", "SPY·cambio", "SPY·nivel·BARAJADO"]) {
    pintaEscalera(`termómetro: ${s}`, filas, SENALES[s]);
  }
  pintaEscalera("termómetro: SPY·nivel — QUITANDO 2020 ENTERO", filas, SENALES["SPY·nivel"], { sin2020: true });
}

// ── ¿en qué años vive cada montón? ──────────────────────────────────────────
console.log(`\n${"─".repeat(96)}`);
console.log("  ¿ORDENA DÍAS O ORDENA AÑOS? — reparto de las operaciones de cada montón por año (envase A, todos los días)");
console.log(`${"─".repeat(96)}`);
{
  const filas = filtra("A", "todo");
  const senal = SENALES["SPY·nivel"];
  const anos = [...new Set(filas.map(ANOS))].sort();
  const tabla = Array.from({ length: BUCKETS }, () => new Map());
  for (const f of filas) { const p = senal.get(f.d); if (p == null) continue; const b = tabla[cual(p)]; const a = ANOS(f); b.set(a, (b.get(a) || 0) + 1); }
  console.log("  montón  " + anos.map((a) => a.padStart(7)).join(""));
  for (let i = 0; i < BUCKETS; i++) {
    const tot = [...tabla[i].values()].reduce((s, x) => s + x, 0);
    console.log(`  ${i + 1}       ` + anos.map((a) => (tot ? pct((tabla[i].get(a) || 0) / tot, 0) : "—").padStart(7)).join(""));
  }
  console.log("  (cada fila suma 100%: es cómo se reparten por años las compras de ese montón)");
}

// ── ¿de qué día del mes salen los 1,06 mensuales? ───────────────────────────
console.log(`\n${"─".repeat(96)}`);
console.log("  ¿DE DÓNDE SALE LA DIFERENCIA? — listón del envase A por día del mes de la compra (todos los días)");
console.log(`${"─".repeat(96)}`);
{
  const filas = filtra("A", "todo");
  const b = Array.from({ length: 7 }, acc);
  for (const f of filas) { const d = Number(f.d.slice(6, 8)); mete(b[Math.min(6, Math.floor((d - 1) / 5))], f.r); }
  console.log("  días del mes      ops   acierto   ratio");
  const et = ["1–5", "6–10", "11–15", "16–20", "21–25", "26–31", "—"];
  for (let i = 0; i < 6; i++) console.log(`  ${et[i].padEnd(12)} ${String(b[i].n).padStart(8)} ${pct(acierto(b[i])).padStart(8)} ${num(ratio(b[i])).padStart(8)}`);
}
console.log("\n## fin de la etapa 5\n");

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 6 — EL PORQUÉ: el termómetro SÍ mueve el acierto. Y aun así el ratio no se mueve.
//
// El encargo pedía subir el acierto del 17,3% al 21% porque eso llevaría el ratio de 1,11 a 1,40.
// Ese salto da por supuesto que el GANADOR MEDIO y el PERDEDOR MEDIO se quedan como estaban.
// Aquí se comprueba ese supuesto de frente: en cada montón se mide, además del acierto, cuánto
// paga el ganador medio, cuánto cuesta el perdedor medio y cuánto cuesta ENTRAR (la prima como
// porcentaje del precio del subyacente). Y se calcula el ratio de mentira: el que saldría si el
// acierto subiera pero los tamaños se quedaran quietos.
// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(96)}`);
console.log("  ETAPA 6 — POR QUÉ SUBE EL ACIERTO Y NO SUBE EL RATIO");
console.log(`${"═".repeat(96)}`);

function tallaje(filas, senal, opts = {}) {
  const b = Array.from({ length: BUCKETS }, () => ({ n: 0, win: 0, gan: 0, per: 0, coste: 0 }));
  const base = { n: 0, win: 0, gan: 0, per: 0, coste: 0 };
  const met = (a, f) => { const d = APUESTA * f.r; a.n++; a.coste += f.c; if (d > 0) { a.win++; a.gan += d; } else a.per += -d; };
  for (const f of filas) {
    if (opts.sin2020 && f.d.slice(0, 4) === "2020") continue;
    met(base, f);
    const p = senal.get(f.d);
    if (p != null) met(b[cual(p)], f);
  }
  return { b, base };
}

for (const env of ["A", "B"]) {
  for (const muestreo of ["todo", "mes"]) {
    const { b, base } = tallaje(filtra(env, muestreo), SENALES["SPY·nivel"]);
    console.log(`\n  ENVASE ${env} · ${muestreo === "todo" ? "TODOS LOS DÍAS" : "entradas MENSUALES"} · termómetro SPY·nivel`);
    console.log("  montón             ops   acierto   ganador medio   perdedor medio   prima pagada   ratio   ratio DE MENTIRA");
    const et = ["1 el más BARATO", "2", "3", "4", "5 el más CARO"];
    const gBase = base.gan / base.win, pBase = base.per / (base.n - base.win);
    for (let i = 0; i < BUCKETS; i++) {
      const a = b[i]; if (!a.n) continue;
      const g = a.gan / a.win, pe = a.per / (a.n - a.win), ac = a.win / a.n;
      const falso = (ac * gBase) / ((1 - ac) * pBase);   // si los tamaños no se movieran
      console.log(`  ${et[i].padEnd(16)} ${String(a.n).padStart(6)} ${pct(ac).padStart(9)} ${dol(g).padStart(15)} ${dol(pe).padStart(16)} ${pct(a.coste / a.n, 2).padStart(14)} ${num(a.gan / a.per).padStart(7)} ${num(falso).padStart(18)}`);
    }
    const ac = base.win / base.n;
    console.log(`  ${"TODOS (listón)".padEnd(16)} ${String(base.n).padStart(6)} ${pct(ac).padStart(9)} ${dol(gBase).padStart(15)} ${dol(pBase).padStart(16)} ${pct(base.coste / base.n, 2).padStart(14)} ${num(base.gan / base.per).padStart(7)} ${num(base.gan / base.per).padStart(18)}`);
  }
}

console.log(`\n${"─".repeat(96)}`);
console.log("  AUTOPSIA DEL MONTÓN 5 CON TODOS LOS DÍAS (la muestra grande)");
console.log(`${"─".repeat(96)}`);
for (const env of ["A", "B"]) {
  for (const s of ["SPY·nivel", "SPY·cambio"]) {
    autopsia(`ENVASE ${env} · todos los días · ${s} · montón 5`, filtra(env, "todo"), SENALES[s], 4);
  }
}
console.log("\n## fin de la etapa 6\n");

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 7 — EL PUENTE: ¿queda algo del termómetro si se paga LO MISMO?
//
// La etapa 6 deja claro que el termómetro del mercado y la prima que pagas son casi la misma
// variable: cuando el seguro del índice está caro, la opción del ticker también. Así que la
// pregunta que decide si esta familia vale para algo es ésta: METIENDO LAS OPERACIONES EN
// CAJONES DE PRECIO FIJO (la prima como % del subyacente, en umbrales absolutos que se conocen
// el día de la compra — nada de percentiles ni de futuro), ¿el termómetro sigue separando?
//   · si dentro del mismo cajón de precio el montón 5 acierta más y gana más → hay señal propia
//   · si dentro del cajón todo se aplana → el termómetro era el precio disfrazado, y punto
// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(96)}`);
console.log("  ETAPA 7 — EL PUENTE: el termómetro a IGUALDAD DE PRECIO PAGADO");
console.log(`${"═".repeat(96)}`);

const CAJONES = [[0, 0.010], [0.010, 0.015], [0.015, 0.020], [0.020, 0.030], [0.030, 9]];
for (const env of ["A", "B"]) {
  const filas = filtra(env, "todo");
  const senal = SENALES["SPY·nivel"];
  console.log(`\n  ENVASE ${env} · todos los días · dentro de cada cajón de prima pagada`);
  console.log("  cajón de prima      montón      ops   acierto   ratio     ganador medio");
  for (const [lo, hi] of CAJONES) {
    const et = hi > 1 ? "más del 3.0%" : `${pct(lo, 1)}–${pct(hi, 1)}`;
    for (const bk of [0, 4]) {
      const a = { n: 0, win: 0, gan: 0, per: 0 };
      for (const f of filas) {
        if (!(f.c >= lo && f.c < hi)) continue;
        const p = senal.get(f.d); if (p == null || cual(p) !== bk) continue;
        const d = APUESTA * f.r; a.n++; if (d > 0) { a.win++; a.gan += d; } else a.per += -d;
      }
      if (!a.n) { console.log(`  ${et.padEnd(18)} ${(bk === 0 ? "1 BARATO" : "5 CARO").padEnd(9)}  sin operaciones`); continue; }
      console.log(`  ${et.padEnd(18)} ${(bk === 0 ? "1 BARATO" : "5 CARO").padEnd(9)} ${String(a.n).padStart(6)} ${pct(a.win / a.n).padStart(9)} ${num(a.gan / a.per).padStart(7)} ${dol(a.gan / a.win).padStart(17)}`);
    }
  }
}
console.log("\n## fin de la etapa 7\n");
