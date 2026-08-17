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

/** selección: devuelve, por mes, el array de tickers elegidos */
function seleccion(regla, semilla0) {
  let semilla = semilla0;
  const azar = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; };
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
console.log("\n── 1. DISTRIBUCIÓN DEL AZAR (¿es 5,24x típico?)");
const dist = {};
for (const M of MODOS) {
  const xs = [];
  for (const s of SEMILLAS) { const a = correr(seleccion("azar", s), M); xs.push(a.R.rec / a.R.inv); }
  dist[M] = xs;
  const f = correr(selFiltro, M);
  const fx = f.R.rec / f.R.inv;
  const or = [...xs].sort((p, q) => p - q);
  const q = (t) => or[Math.min(or.length - 1, Math.floor(t * or.length))];
  const media = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - media) ** 2, 0) / (xs.length - 1));
  const peores = xs.filter((x) => x >= fx).length;
  console.log(`\n   ${M.toUpperCase()}   filtro = ${fx.toFixed(2)}x`);
  console.log(`     azar semilla 42 = ${xs[0].toFixed(2)}x   ·  percentil de la 42 dentro del azar = ` +
    `${((or.filter((x) => x < xs[0]).length / or.length) * 100).toFixed(0)}%`);
  console.log(`     azar: media ${media.toFixed(2)}x · mediana ${q(0.5).toFixed(2)}x · sd ${sd.toFixed(2)}`);
  console.log(`     azar: min ${or[0].toFixed(2)}x · p05 ${q(0.05).toFixed(2)}x · p25 ${q(0.25).toFixed(2)}x · ` +
    `p75 ${q(0.75).toFixed(2)}x · p95 ${q(0.95).toFixed(2)}x · max ${or[or.length - 1].toFixed(2)}x`);
  console.log(`     ► semillas del azar que IGUALAN O SUPERAN al filtro: ${peores}/${xs.length}  (p = ${(peores / xs.length).toFixed(3)})`);
  console.log(`     ► z del filtro sobre el azar: ${((fx - media) / sd).toFixed(2)}`);
}

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
console.log("");
