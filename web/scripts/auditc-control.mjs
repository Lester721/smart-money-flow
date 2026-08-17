// auditc-control.mjs — AUDITORÍA del control al azar de cartera-cesta.mjs
//
// NO modifica nada. Replica la mecánica de cartera-cesta.mjs pieza por pieza (funciones copiadas
// literalmente) y responde tres preguntas:
//
//   1. ¿El 5,24x del control con semilla 42 es TÍPICO, o salió bajo por suerte?
//      → se corre el control con N semillas y se da la distribución. Percentil del filtro.
//   2. ¿El filtro elige acciones con MÁS contratos disponibles (más apuestas por el mismo dinero)?
//      → patas compradas por (acción,mes) en cada brazo.
//   3. ¿Gasta el filtro más dinero que el control?
//      → dólares desplegados por (acción,mes) y fracción del presupuesto de $500 que se queda sin usar.
//
// Uso: node scripts/auditc-control.mjs [nSemillas]

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const POR_TICKER = Number(process.env.POR_TICKER || 500);
const N_TICKERS = Number(process.env.N_TICKERS || 3);
const OTM_MIN = 60, DTE_MIN = 365;
const ASK_MIN = 0.10, SPREAD_MAX = 0.40;
const N_SEMILLAS = Number(process.argv[2] || 200);
const CACHE_OUT = process.env.CESTAS_CACHE || "scripts/auditc-cestas.json";

const ms = (y) => Date.parse(`${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}T00:00:00Z`);

// ── infraestructura (copiada de cartera-cesta.mjs) ──────────────────────────
const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();

const cache = new Map();
function cadena(sym, dia) {
  const k = `${sym}|${dia}`;
  const hit = cache.get(k);
  if (hit !== undefined) { cache.delete(k); cache.set(k, hit); return hit; }
  const f = `${CDIR}/${sym}_d${dia}.json`;
  const v = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  cache.set(k, v);
  if (cache.size > 250) cache.delete(cache.keys().next().value);
  return v;
}
function spotDe(c) {
  let k = null, dm = Infinity;
  for (const g of Object.values(c)) for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== "C") continue;
    const K = Number(cl.slice(0, -2)); const p = g[`${K}|P`];
    if (!p) continue;
    const d = Math.abs((ba[0] + ba[1]) / 2 - (p[0] + p[1]) / 2);
    if (d < dm) { dm = d; k = K; }
  }
  return k;
}
function idxVenc(sym, exp) {
  const dias = diasPorSim.get(sym) ?? [];
  if (!dias.length || exp > dias[dias.length - 1]) return -1;
  let lo = 0, hi = dias.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (dias[m] <= exp) { r = m; lo = m + 1; } else hi = m - 1; }
  return r;
}
function cesta(sym, dia) {
  const c = cadena(sym, dia);
  if (!c) return null;
  const sp = spotDe(c);
  if (!sp) return null;
  const patas = [];
  for (const [exp, g] of Object.entries(c)) {
    const dte = Math.round((ms(exp) - ms(dia)) / 86_400_000);
    if (dte <= DTE_MIN) continue;
    const iu = idxVenc(sym, exp);
    if (iu < 0) continue;
    const dSal = (diasPorSim.get(sym) ?? [])[iu];
    const gSal = cadena(sym, dSal)?.[exp] ?? {};
    for (const [clave, ba] of Object.entries(g)) {
      if (clave.slice(-1) !== "C") continue;
      const K = Number(clave.slice(0, -2));
      const otm = ((K - sp) / sp) * 100;
      if (otm <= OTM_MIN) continue;
      const [bid, ask] = ba;
      if (!(ask >= ASK_MIN) || !((ask - bid) / ask <= SPREAD_MAX)) continue;
      const salLarga = gSal[clave];
      const valorDesnuda = salLarga ? salLarga[0] : 0;
      const Kobj = sp * (1 + (2 * otm) / 100);
      let corto = null, dm = Infinity;
      for (const [cl2, ba2] of Object.entries(g)) {
        if (cl2.slice(-1) !== "C") continue;
        const K2 = Number(cl2.slice(0, -2));
        if (K2 <= K) continue;
        const d = Math.abs(K2 - Kobj);
        if (d < dm && ba2[0] > 0) { dm = d; corto = { clave: cl2, K: K2, bid: ba2[0], ask: ba2[1] }; }
      }
      let sc = null, sv = 0;
      if (corto) {
        const coste = ask - corto.bid;
        if (coste > 0.02) {
          const salCorta = gSal[corto.clave];
          sc = coste; sv = Math.max(0, valorDesnuda - (salCorta ? salCorta[1] : 0));
        }
      }
      patas.push({ ask, val: valorDesnuda, sc, sv, otm, dte, K, exp });
    }
  }
  return patas.length ? patas : null;
}

// ── señales ─────────────────────────────────────────────────────────────────
const filas = JSON.parse(readFileSync("scripts/puente-filas.json", "utf8")).filter((x) => x.gamLejos != null);
const porMes = new Map();
for (const f of filas) { if (!porMes.has(f.mes)) porMes.set(f.mes, []); porMes.get(f.mes).push(f); }
const meses = [...porMes.keys()].sort();
const ultimoDiaDelMes = (sym, mes) => {
  const d = (diasPorSim.get(sym) ?? []).filter((x) => x.slice(0, 6) === mes);
  return d.length ? d[d.length - 1] : null;
};

// ── FASE A: precomputar TODAS las cestas (acción,mes) ───────────────────────
let CESTAS;
if (existsSync(CACHE_OUT)) {
  CESTAS = new Map(Object.entries(JSON.parse(readFileSync(CACHE_OUT, "utf8"))));
  console.error(`[cache] ${CESTAS.size} cestas leídas de ${CACHE_OUT}`);
} else {
  CESTAS = new Map();
  const t0 = Date.now();
  let i = 0;
  for (const f of filas) {
    const k = `${f.ticker}|${f.mes}`;
    if (CESTAS.has(k)) continue;
    const dia = ultimoDiaDelMes(f.ticker, f.mes);
    CESTAS.set(k, dia ? (cesta(f.ticker, dia) ?? null) : null);
    if (++i % 100 === 0) console.error(`  ${i}/${filas.length}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  writeFileSync(CACHE_OUT, JSON.stringify(Object.fromEntries(CESTAS)));
  console.error(`[cache] escrito ${CACHE_OUT} en ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

// ── FASE B: la mecánica de dinero, idéntica, pero sobre la cache ────────────
function comprasDe(patas, MODO) {
  if (MODO === "fraccion") {
    const cuota = POR_TICKER / patas.length;
    return patas.map((p) => ({ p, uD: cuota / (p.ask * 100), gasto: cuota }));
  }
  const orden = MODO === "enteros"
    ? [...patas].sort((x, y) => x.ask - y.ask)
    : (() => { const k = Math.max(1, Math.floor(patas.length / 20)); return patas.filter((_, i) => i % k === 0); })();
  const compras = [];
  let queda = POR_TICKER;
  for (const p of orden) {
    const coste = p.ask * 100;
    if (coste > queda) continue;
    queda -= coste;
    compras.push({ p, uD: 1, gasto: coste });
  }
  return compras;
}

// ── LOS DOS GENERADORES ─────────────────────────────────────────────────────
// roto  = el de cartera-cesta.mjs. semilla*1103515245 desborda 2^53 → los bits bajos se pierden
//         en el redondeo del double. Periodo real ~10.466 y distribución NO uniforme.
// bueno = mulberry32, aritmética entera de 32 bits con Math.imul, sin desbordamiento.
const rngRoto = (s0) => { let s = s0; return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; };
const rngBueno = (s0) => { let a = (s0 + 0x6d2b79f5) | 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

/** selección: devuelve, por mes, el array de tickers elegidos */
function seleccion(regla, semilla0, gen = rngRoto) {
  const azar = gen(semilla0);
  const out = [];
  for (const mes of meses) {
    const delMes = porMes.get(mes);
    let elegidos;
    if (regla === "azar") {
      const copia = [...delMes];
      elegidos = [];
      for (let i = 0; i < N_TICKERS && copia.length; i++) elegidos.push(copia.splice(Math.floor(azar() * copia.length), 1)[0]);
    } else elegidos = [...delMes].sort((a, b) => b.gamLejos - a.gamLejos).slice(0, N_TICKERS);
    out.push([mes, elegidos]);
  }
  return out;
}

function correr(sel, MODO) {
  const R = { inv: 0, rec: 0, n: 0, gan: 0 };
  const S = { inv: 0, rec: 0, n: 0, gan: 0 };
  let sinCesta = 0, conCesta = 0, patasDisp = 0, presupuesto = 0;
  for (const [, elegidos] of sel) {
    for (const e of elegidos) {
      const patas = CESTAS.get(`${e.ticker}|${e.mes}`);
      if (!patas || !patas.length) { sinCesta++; continue; }
      conCesta++; patasDisp += patas.length; presupuesto += POR_TICKER;
      for (const { p, uD, gasto } of comprasDe(patas, MODO)) {
        R.inv += gasto; R.rec += uD * p.val * 100; R.n++;
        if (p.val > p.ask) R.gan++;
        if (p.sc != null) {
          const costeS = p.sc * 100;
          const uS = MODO === "fraccion" ? gasto / costeS : 1;
          S.inv += MODO === "fraccion" ? gasto : costeS;
          S.rec += uS * p.sv * 100; S.n++;
          if (p.sv > p.sc) S.gan++;
        }
      }
    }
  }
  return { R, S, sinCesta, conCesta, patasDisp, presupuesto };
}

// ═══ SALIDA ════════════════════════════════════════════════════════════════
const MODOS = ["fraccion", "enteros", "repartido"];
const selFiltro = seleccion("filtro");
const SEMILLAS = [42, ...Array.from({ length: N_SEMILLAS }, (_, i) => 1 + i * 7919).filter((s) => s !== 42)];

console.log(`\n════ AUDITORÍA DEL CONTROL ════  ${meses.length} meses · ${filas.length} (acción,mes) con señal`);
console.log(`presupuesto $${POR_TICKER}/acción · ${N_TICKERS} acciones/mes · ${SEMILLAS.length} semillas\n`);

// -- 0. reproducción exacta de la tabla publicada -----------------------------
console.log("── 0. REPRODUCCIÓN (semilla 42) — debe cuadrar con la tabla publicada");
console.log("   modo         control    filtro   |  aciertos ctrl/filtro");
const sel42 = seleccion("azar", 42);
for (const M of MODOS) {
  const a = correr(sel42, M), f = correr(selFiltro, M);
  console.log(`   ${M.padEnd(10)}  ${(a.R.rec / a.R.inv).toFixed(2).padStart(7)}x ${(f.R.rec / f.R.inv).toFixed(2).padStart(8)}x   |  ` +
    `${((a.R.gan / a.R.n) * 100).toFixed(0)}% / ${((f.R.gan / f.R.n) * 100).toFixed(0)}%`);
}

// -- 1. distribución del azar --------------------------------------------------
console.log("\n── 1. DISTRIBUCIÓN DEL AZAR (¿es 5,24x típico?)  [RNG roto = el del test · RNG bueno = mulberry32]");
const resumen = (xs) => {
  const or = [...xs].sort((p, q) => p - q);
  const q = (t) => or[Math.min(or.length - 1, Math.floor(t * or.length))];
  const media = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - media) ** 2, 0) / (xs.length - 1));
  return { or, q, media, sd };
};
for (const M of MODOS) {
  const f = correr(selFiltro, M);
  const fx = f.R.rec / f.R.inv;
  console.log(`\n   ${M.toUpperCase()}   filtro = ${fx.toFixed(2)}x   ·  azar con la semilla 42 publicada = ` +
    `${(correr(sel42, M).R.rec / correr(sel42, M).R.inv).toFixed(2)}x`);
  for (const [nm, gen] of [["roto ", rngRoto], ["bueno", rngBueno]]) {
    const xs = SEMILLAS.map((s) => { const a = correr(seleccion("azar", s, gen), M); return a.R.rec / a.R.inv; });
    const { or, q, media, sd } = resumen(xs);
    const s42 = correr(sel42, M).R.rec / correr(sel42, M).R.inv;
    const peores = xs.filter((x) => x >= fx).length;
    console.log(`     RNG ${nm}: media ${media.toFixed(2)}x · mediana ${q(0.5).toFixed(2)}x · sd ${sd.toFixed(2)} · ` +
      `min ${or[0].toFixed(2)} p05 ${q(0.05).toFixed(2)} p25 ${q(0.25).toFixed(2)} p75 ${q(0.75).toFixed(2)} p95 ${q(0.95).toFixed(2)} max ${or[or.length - 1].toFixed(2)}`);
    console.log(`                percentil de la semilla 42 (${s42.toFixed(2)}x) = ${((or.filter((x) => x < s42).length / or.length) * 100).toFixed(1)}%  ·  ` +
      `p(azar >= filtro) = ${(peores / xs.length).toFixed(3)} (${peores}/${xs.length})  ·  z filtro = ${((fx - media) / sd).toFixed(2)}`);
  }
}

// -- 1b. sesgo posicional del RNG roto ----------------------------------------
console.log("\n── 1b. ¿EL RNG ROTO ELIGE UNIFORME? (frecuencia de elección por ticker, todas las semillas)");
const frec = { roto: new Map(), bueno: new Map(), teorico: new Map() };
for (const [nm, gen] of [["roto", rngRoto], ["bueno", rngBueno]])
  for (const s of SEMILLAS) for (const [, el] of seleccion("azar", s, gen)) for (const e of el) frec[nm].set(e.ticker, (frec[nm].get(e.ticker) || 0) + 1);
// esperanza exacta: en un mes con m tickers, cada uno entra con prob min(3,m)/m
for (const mes of meses) { const d = porMes.get(mes); const p = Math.min(N_TICKERS, d.length) / d.length; for (const e of d) frec.teorico.set(e.ticker, (frec.teorico.get(e.ticker) || 0) + p * SEMILLAS.length); }
const tks = [...frec.teorico.keys()].sort();
console.log("   ticker  teórico   roto   (roto/teo)  |  bueno  (bueno/teo)");
let chiRoto = 0, chiBueno = 0;
for (const t of tks) {
  const te = frec.teorico.get(t), ro = frec.roto.get(t) || 0, bu = frec.bueno.get(t) || 0;
  chiRoto += (ro - te) ** 2 / te; chiBueno += (bu - te) ** 2 / te;
  console.log(`   ${t.padEnd(6)} ${te.toFixed(0).padStart(7)} ${String(ro).padStart(6)}   ${(ro / te).toFixed(3).padStart(9)}  |  ${String(bu).padStart(5)}  ${(bu / te).toFixed(3).padStart(11)}`);
}
console.log(`   χ² frente al teórico:  RNG roto = ${chiRoto.toFixed(0)}   ·   RNG bueno = ${chiBueno.toFixed(0)}   (gl=${tks.length - 1}, χ²(0,001) ≈ ${(tks.length - 1) * 2.2 | 0})`);

// -- 2. patas y dinero ---------------------------------------------------------
console.log("\n── 2. ¿MÁS APUESTAS POR EL MISMO DINERO? (patas disponibles y compradas por (acción,mes))");
console.log("   modo        brazo     |  (a,m) sin cesta | (a,m) con cesta | patas DISP/am | patas COMPR/am | $ gastado/am | % del presupuesto");
for (const M of MODOS) {
  const filas2 = [["filtro", correr(selFiltro, M)]];
  // azar: promedio sobre todas las semillas
  const acc = { sinCesta: 0, conCesta: 0, patasDisp: 0, n: 0, inv: 0, presupuesto: 0 };
  for (const s of SEMILLAS) {
    const a = correr(seleccion("azar", s), M);
    acc.sinCesta += a.sinCesta; acc.conCesta += a.conCesta; acc.patasDisp += a.patasDisp;
    acc.n += a.R.n; acc.inv += a.R.inv; acc.presupuesto += a.presupuesto;
  }
  const k = SEMILLAS.length;
  filas2.push(["azar(med)", { sinCesta: acc.sinCesta / k, conCesta: acc.conCesta / k, patasDisp: acc.patasDisp / k, R: { n: acc.n / k, inv: acc.inv / k }, presupuesto: acc.presupuesto / k }]);
  for (const [nm, x] of filas2) {
    console.log(`   ${M.padEnd(10)}  ${nm.padEnd(9)} |  ${x.sinCesta.toFixed(1).padStart(14)} | ${x.conCesta.toFixed(1).padStart(15)} | ` +
      `${(x.patasDisp / x.conCesta).toFixed(1).padStart(13)} | ${(x.R.n / x.conCesta).toFixed(1).padStart(14)} | ` +
      `${(x.R.inv / x.conCesta).toFixed(0).padStart(12)} | ${((x.R.inv / x.presupuesto) * 100).toFixed(1).padStart(17)}%`);
  }
}

// -- 3. multiplicador sobre el presupuesto COMPROMETIDO -------------------------
console.log("\n── 3. MULTIPLICADOR SOBRE EL PRESUPUESTO COMPROMETIDO ($500 × (acción,mes) elegidos,");
console.log("      el dinero no desplegado cuenta como caja que vuelve entera)");
console.log("   modo        filtro(despl)  filtro(compr) | azar med(despl) azar med(compr) | p(azar>=filtro) sobre comprometido");
for (const M of MODOS) {
  const f = correr(selFiltro, M);
  const fC = (f.R.rec + (f.presupuesto - f.R.inv)) / f.presupuesto;
  const xs = [];
  for (const s of SEMILLAS) { const a = correr(seleccion("azar", s), M); xs.push({ d: a.R.rec / a.R.inv, c: (a.R.rec + (a.presupuesto - a.R.inv)) / a.presupuesto }); }
  const md = xs.reduce((a, b) => a + b.d, 0) / xs.length, mc = xs.reduce((a, b) => a + b.c, 0) / xs.length;
  const p = xs.filter((x) => x.c >= fC).length / xs.length;
  console.log(`   ${M.padEnd(10)}  ${(f.R.rec / f.R.inv).toFixed(2).padStart(12)}x ${fC.toFixed(2).padStart(13)}x | ${md.toFixed(2).padStart(14)}x ${mc.toFixed(2).padStart(14)}x | ${p.toFixed(3).padStart(10)}`);
}

// -- 4. quién elige el filtro --------------------------------------------------
console.log("\n── 4. QUÉ ELIGE EL FILTRO (concentración de la selección)");
const cnt = new Map();
for (const [, el] of selFiltro) for (const e of el) cnt.set(e.ticker, (cnt.get(e.ticker) || 0) + 1);
const tot = [...cnt.values()].reduce((a, b) => a + b, 0);
console.log("   " + [...cnt].sort((a, b) => b[1] - a[1]).map(([t, c]) => `${t}:${c}`).join(" "));
console.log(`   total elecciones ${tot} · tickers distintos ${cnt.size} de 28`);

// -- 5. de dónde sale el dinero del filtro -------------------------------------
console.log("\n── 5. CONCENTRACIÓN DEL RESULTADO (modo enteros, call desnuda)");
for (const [nm, sel] of [["filtro", selFiltro], ["azar42", sel42]]) {
  const porTM = [];
  for (const [mes, el] of sel) for (const e of el) {
    const patas = CESTAS.get(`${e.ticker}|${e.mes}`);
    if (!patas || !patas.length) continue;
    let inv = 0, rec = 0;
    for (const { p, uD, gasto } of comprasDe(patas, "enteros")) { inv += gasto; rec += uD * p.val * 100; }
    porTM.push({ t: e.ticker, mes, inv, rec, pnl: rec - inv });
  }
  const T = porTM.reduce((a, b) => a + b.pnl, 0);
  porTM.sort((a, b) => b.pnl - a.pnl);
  console.log(`   ${nm}: P&L total $${Math.round(T).toLocaleString("es-ES")} · top-5 aporta ` +
    `${((porTM.slice(0, 5).reduce((a, b) => a + b.pnl, 0) / T) * 100).toFixed(0)}% · top-1 ${((porTM[0].pnl / T) * 100).toFixed(0)}%`);
  console.log(`      top-5: ${porTM.slice(0, 5).map((x) => `${x.t}/${x.mes} $${Math.round(x.pnl).toLocaleString("es-ES")}`).join("  ")}`);
}
// -- 6. perfil de lo que compra cada brazo ------------------------------------
console.log("\n── 6. PERFIL DE LAS PATAS COMPRADAS (modo enteros)");
function perfil(sel) {
  let n = 0, ask = 0, otm = 0, dte = 0, disp = 0, am = 0, askDisp = 0, nd = 0;
  for (const [, el] of sel) for (const e of el) {
    const patas = CESTAS.get(`${e.ticker}|${e.mes}`);
    if (!patas || !patas.length) continue;
    am++; disp += patas.length;
    for (const p of patas) { askDisp += p.ask; nd++; }
    for (const { p } of comprasDe(patas, "enteros")) { n++; ask += p.ask; otm += p.otm; dte += p.dte; }
  }
  return { n, am, dispAm: disp / am, askMed: ask / n, askMedDisp: askDisp / nd, otmMed: otm / n, dteMed: dte / n };
}
const pf = perfil(selFiltro);
const pa = perfil(sel42);
console.log("   brazo    patas disp/am  ask medio DISPONIBLE  ask medio COMPRADO  OTM% comprado  DTE comprado");
for (const [nm, p] of [["filtro", pf], ["azar42", pa]])
  console.log(`   ${nm.padEnd(8)} ${p.dispAm.toFixed(1).padStart(13)}  ${p.askMedDisp.toFixed(2).padStart(20)}  ${p.askMed.toFixed(2).padStart(18)}  ${p.otmMed.toFixed(0).padStart(13)}  ${p.dteMed.toFixed(0).padStart(12)}`);

// -- 7. CONTROLES ALTERNATIVOS ------------------------------------------------
// El azar plano mete KO, WMT, XOM, PFE, T — acciones que nunca suben un 60%. El filtro sólo
// elige 12 nombres, todos de alta volatilidad. Estos controles quitan ese confusor.
const universoFiltro = new Set([...cnt.keys()]);
function selPersonalizada(fn, semilla0, gen = rngBueno) {
  const azar = gen(semilla0);
  return meses.map((mes) => [mes, fn(porMes.get(mes), azar, mes)]);
}
const nPatas = (e) => (CESTAS.get(`${e.ticker}|${e.mes}`) ?? []).length;
const tomaAzar = (pool, azar, k) => { const c = [...pool], o = []; for (let i = 0; i < k && c.length; i++) o.push(c.splice(Math.floor(azar() * c.length), 1)[0]); return o; };

const CONTROLES = {
  "A · azar plano (el del test)": (d, az) => tomaAzar(d, az, N_TICKERS),
  "B · azar dentro de los 12 que el filtro elige": (d, az) => { const p = d.filter((x) => universoFiltro.has(x.ticker)); return tomaAzar(p.length ? p : d, az, N_TICKERS); },
  "C · azar entre los 6 de cadena más honda": (d, az) => { const p = [...d].sort((a, b) => nPatas(b) - nPatas(a)).slice(0, Math.min(6, d.length)); return tomaAzar(p, az, N_TICKERS); },
  "D · SEÑAL = nº de contratos disponibles": (d) => [...d].sort((a, b) => nPatas(b) - nPatas(a)).slice(0, N_TICKERS),
  "E · SEÑAL = contrato más barato de la cesta": (d) => [...d].sort((a, b) => { const A = CESTAS.get(`${a.ticker}|${a.mes}`) ?? [], B = CESTAS.get(`${b.ticker}|${b.mes}`) ?? []; const mn = (z) => z.length ? Math.min(...z.map((p) => p.ask)) : Infinity; return mn(A) - mn(B); }).slice(0, N_TICKERS),
};
console.log("\n── 7. CONTROLES ALTERNATIVOS (30 semillas los aleatorios · modo enteros, sobre DESPLEGADO y sobre COMPROMETIDO)");
console.log("   control                                          despl.        compr.     patas disp/am");
const semSub = SEMILLAS.slice(0, 30);
for (const [nm, fn] of Object.entries(CONTROLES)) {
  const det = nm.startsWith("D") || nm.startsWith("E");
  const rs = (det ? [0] : semSub).map((s) => correr(selPersonalizada(fn, 1 + s), "enteros"));
  const md = rs.reduce((a, x) => a + x.R.rec / x.R.inv, 0) / rs.length;
  const mc = rs.reduce((a, x) => a + (x.R.rec + (x.presupuesto - x.R.inv)) / x.presupuesto, 0) / rs.length;
  const dp = rs.reduce((a, x) => a + x.patasDisp / x.conCesta, 0) / rs.length;
  console.log(`   ${nm.padEnd(46)} ${md.toFixed(2).padStart(7)}x ${mc.toFixed(2).padStart(12)}x ${dp.toFixed(1).padStart(15)}`);
}
const ff = correr(selFiltro, "enteros");
console.log(`   ${"FILTRO gamLejos".padEnd(46)} ${(ff.R.rec / ff.R.inv).toFixed(2).padStart(7)}x ${((ff.R.rec + (ff.presupuesto - ff.R.inv)) / ff.presupuesto).toFixed(2).padStart(12)}x ${(ff.patasDisp / ff.conCesta).toFixed(1).padStart(15)}`);

// -- 8. ¿es la señal o son los nombres? ---------------------------------------
// Permutación: se barajan los gamLejos de CADA TICKER entre sus meses. Se conserva qué acciones
// tienden a puntuar alto (TSLA sigue siendo TSLA) y se destruye el MOMENTO. Si el resultado
// aguanta, lo que gana es tener calls de TSLA/NVDA/AMD, no la señal.
const N_PERM = Number(process.env.N_PERM || 200);
console.log(`\n── 8. PERMUTACIÓN POR TICKER (mismo reparto de nombres, momento destruido) · ${N_PERM} barajas`);
const porTicker = new Map();
for (const f of filas) { if (!porTicker.has(f.ticker)) porTicker.set(f.ticker, []); porTicker.get(f.ticker).push(f); }
const permXs = [], permCs = [];
for (let s = 0; s < N_PERM; s++) {
  const az = rngBueno(1000 + s);
  const mapa = new Map();
  for (const [t, arr] of porTicker) {
    const vals = arr.map((x) => x.gamLejos);
    for (let i = vals.length - 1; i > 0; i--) { const j = Math.floor(az() * (i + 1)); [vals[i], vals[j]] = [vals[j], vals[i]]; }
    arr.forEach((x, i) => mapa.set(`${x.ticker}|${x.mes}`, vals[i]));
  }
  const sel = meses.map((mes) => [mes, [...porMes.get(mes)].sort((a, b) => mapa.get(`${b.ticker}|${b.mes}`) - mapa.get(`${a.ticker}|${a.mes}`)).slice(0, N_TICKERS)]);
  const r = correr(sel, "enteros");
  permXs.push(r.R.rec / r.R.inv);
  permCs.push((r.R.rec + (r.presupuesto - r.R.inv)) / r.presupuesto);
}
const fx8 = ff.R.rec / ff.R.inv;
const fc8 = (ff.R.rec + (ff.presupuesto - ff.R.inv)) / ff.presupuesto;
for (const [et, xs, obs] of [["DESPLEGADO ", permXs, fx8], ["COMPROMETIDO", permCs, fc8]]) {
  const pm = xs.reduce((a, b) => a + b, 0) / xs.length;
  const psd = Math.sqrt(xs.reduce((a, b) => a + (b - pm) ** 2, 0) / (xs.length - 1));
  const sup = xs.filter((x) => x >= obs).length;
  console.log(`   ${et}  permutado: media ${pm.toFixed(2)}x · sd ${psd.toFixed(2)} · min ${Math.min(...xs).toFixed(2)} · max ${Math.max(...xs).toFixed(2)}`);
  console.log(`                 filtro real ${obs.toFixed(2)}x · lo igualan o superan ${sup}/${xs.length} (p=${((sup + 1) / (xs.length + 1)).toFixed(3)}) · z=${((obs - pm) / psd).toFixed(2)} · ventaja ${(obs / pm).toFixed(2)}x`);
}

// -- 9. ¿aguanta sin el ganador? ----------------------------------------------
console.log("\n── 9. ROBUSTEZ (modo enteros, sobre desplegado)");
function correrExcl(sel, excl) {
  let inv = 0, rec = 0;
  for (const [, el] of sel) for (const e of el) {
    if (excl(e)) continue;
    const patas = CESTAS.get(`${e.ticker}|${e.mes}`);
    if (!patas || !patas.length) continue;
    for (const { p, uD, gasto } of comprasDe(patas, "enteros")) { inv += gasto; rec += uD * p.val * 100; }
  }
  return rec / inv;
}
const pruebas = [
  ["completo", () => false],
  ["sin TSLA", (e) => e.ticker === "TSLA"],
  ["sin TSLA/201905", (e) => e.ticker === "TSLA" && e.mes === "201905"],
  ["sin 2019", (e) => e.mes.slice(0, 4) === "2019"],
  ["sin 2025", (e) => e.mes.slice(0, 4) === "2025"],
  ["sólo 2016-2020", (e) => e.mes >= "202101"],
  ["sólo 2021-2025", (e) => e.mes < "202101"],
];
console.log("   prueba              filtro   azar(med 30 sem)");
for (const [nm, ex] of pruebas) {
  const f = correrExcl(selFiltro, ex);
  const a = semSub.map((s) => correrExcl(seleccion("azar", s, rngBueno), ex));
  console.log(`   ${nm.padEnd(18)} ${f.toFixed(2).padStart(6)}x ${(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2).padStart(15)}x`);
}
console.log("");
