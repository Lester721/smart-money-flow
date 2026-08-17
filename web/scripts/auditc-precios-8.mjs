// AUDITORÍA 8 — DESCOMPOSICIÓN determinista: ¿cuánto es ELEGIR LA ACCIÓN y cuánto ELEGIR EL MES?
//
// Uso: node --max-old-space-size=10240 scripts/auditc-precios-8.mjs
//
// Sin semillas, sin sorteos. Se compara el filtro contra la MISMA MEZCLA DE ACCIONES invertida en
// TODOS sus meses operables (misma acción, mismo capital por acción, cero elección de momento).
// Si el filtro no le gana a eso, gamLejos no elige el momento: sólo elige la acción.

import { readFileSync, readdirSync, existsSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const TDIR = "scripts/cache-theta";
const POR_TICKER = 500, N_TICKERS = 3;
const OTM_MIN = 60, DTE_MIN = 365, ASK_MIN = 0.10, SPREAD_MAX = 0.40;
const HAIRCUT = 0.97;
const ms = (y) => Date.parse(`${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}T00:00:00Z`);

const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/); if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();
const barsCache = new Map();
function closes(sym) {
  if (barsCache.has(sym)) return barsCache.get(sym);
  const m = new Map();
  for (const f of readdirSync(TDIR))
    if (f.startsWith(`${sym}_barsPAR_y_`) && f.endsWith(".json"))
      for (const b of JSON.parse(readFileSync(`${TDIR}/${f}`, "utf8"))) m.set(b.time.replaceAll("-", ""), b.close);
  barsCache.set(sym, m); return m;
}
const cache = new Map();
function cadena(sym, dia) {
  const k = `${sym}|${dia}`; const hit = cache.get(k);
  if (hit !== undefined) { cache.delete(k); cache.set(k, hit); return hit; }
  const f = `${CDIR}/${sym}_d${dia}.json`;
  const v = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  cache.set(k, v); if (cache.size > 200) cache.delete(cache.keys().next().value);
  return v;
}
function spotDe(c) {
  let k = null, dm = Infinity;
  for (const g of Object.values(c)) for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== "C") continue;
    const K = Number(cl.slice(0, -2)); const p = g[`${K}|P`]; if (!p) continue;
    const d = Math.abs((ba[0] + ba[1]) / 2 - (p[0] + p[1]) / 2); if (d < dm) { dm = d; k = K; }
  }
  return k;
}
function spotParidad(c) {
  let s = null, dm = Infinity;
  for (const g of Object.values(c)) for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== "C") continue;
    const K = Number(cl.slice(0, -2)); const p = g[`${K}|P`]; if (!p) continue;
    const mc = (ba[0] + ba[1]) / 2, mq = (p[0] + p[1]) / 2;
    if (Math.abs(mc - mq) < dm) { dm = Math.abs(mc - mq); s = K + mc - mq; }
  }
  return s;
}
const precio = (sym, dia) => closes(sym).get(dia) ?? (cadena(sym, dia) ? spotParidad(cadena(sym, dia)) : null);
const SPLITS = { AAPL: [["20200831", 4]], GE: [["20210803", 1 / 8]], NVDA: [["20210720", 4], ["20240610", 10]],
                 TSLA: [["20200831", 5], ["20220825", 3]], WMT: [["20240226", 3]] };
const factor = (sym, d0, d1) => { let r = 1; for (const [d, x] of SPLITS[sym] ?? []) if (d > d0 && d <= d1) r *= x; return r; };
function idxVenc(sym, exp) {
  const dias = diasPorSim.get(sym) ?? [];
  if (!dias.length || exp > dias[dias.length - 1]) return -1;
  let lo = 0, hi = dias.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (dias[m] <= exp) { r = m; lo = m + 1; } else hi = m - 1; }
  return r;
}
function cesta(sym, dia) {
  const c = cadena(sym, dia); if (!c) return null;
  const sp = spotDe(c); if (!sp) return null;
  const patas = [];
  for (const [exp, g] of Object.entries(c)) {
    const dte = Math.round((ms(exp) - ms(dia)) / 86_400_000);
    if (dte <= DTE_MIN) continue;
    const iu = idxVenc(sym, exp); if (iu < 0) continue;
    const dSal = (diasPorSim.get(sym) ?? [])[iu];
    const gSal = cadena(sym, dSal)?.[exp] ?? {};
    for (const [clave, ba] of Object.entries(g)) {
      if (clave.slice(-1) !== "C") continue;
      const K = Number(clave.slice(0, -2));
      if (((K - sp) / sp) * 100 <= OTM_MIN) continue;
      const [bid, ask] = ba;
      if (!(ask >= ASK_MIN) || !((ask - bid) / ask <= SPREAD_MAX)) continue;
      const sl = gSal[clave]; const vTest = sl ? sl[0] : 0;
      const r = factor(sym, dia, dSal), S = precio(sym, dSal);
      patas.push({ ask, vTest, vCorr: r === 1 ? vTest : (S != null ? Math.max(0, r * S - K) * HAIRCUT : vTest) });
    }
  }
  return patas.length ? patas : null;
}

const filas = JSON.parse(readFileSync("scripts/puente-filas.json", "utf8")).filter((x) => x.gamLejos != null);
const porMes = new Map();
for (const f of filas) { if (!porMes.has(f.mes)) porMes.set(f.mes, []); porMes.get(f.mes).push(f); }
const meses = [...porMes.keys()].sort();
const ultimoDiaDelMes = (sym, mes) => { const d = (diasPorSim.get(sym) ?? []).filter((x) => x.slice(0, 6) === mes); return d.length ? d[d.length - 1] : null; };

const res = new Map(), mesesOp = new Map();
for (const mes of meses) for (const e of porMes.get(mes)) {
  const k = `${e.ticker}|${mes}`; if (res.has(k)) continue;
  const dia = ultimoDiaDelMes(e.ticker, mes);
  const patas = dia ? cesta(e.ticker, dia) : null;
  if (!patas) { res.set(k, null); continue; }
  let queda = POR_TICKER, coste = 0, rT = 0, rC = 0, n = 0, gT = 0;
  for (const p of [...patas].sort((x, y) => x.ask - y.ask)) {
    const c = p.ask * 100; if (c > queda) continue; queda -= c;
    coste += c; rT += p.vTest * 100; rC += p.vCorr * 100; n++; if (p.vTest > p.ask) gT++;
  }
  const o = n ? { coste, rT, rC, n, gT } : null;
  res.set(k, o);
  if (o) { if (!mesesOp.has(e.ticker)) mesesOp.set(e.ticker, []); mesesOp.get(e.ticker).push(mes); }
}

const elegidos = new Map();   // ticker -> [meses elegidos y operables]
for (const mes of meses) for (const e of [...porMes.get(mes)].sort((a, b) => b.gamLejos - a.gamLejos).slice(0, N_TICKERS)) {
  if (!res.get(`${e.ticker}|${mes}`)) continue;
  if (!elegidos.has(e.ticker)) elegidos.set(e.ticker, []);
  elegidos.get(e.ticker).push(mes);
}

const agrega = (lista) => lista.reduce((a, [t, m]) => { const o = res.get(`${t}|${m}`); if (o) { a.c += o.coste; a.t += o.rT; a.k += o.rC; a.n += o.n; a.g += o.gT; } return a; }, { c: 0, t: 0, k: 0, n: 0, g: 0 });

const paresF = [...elegidos].flatMap(([t, ms_]) => ms_.map((m) => [t, m]));
const F = agrega(paresF);

// "SIN ELEGIR EL MES": la misma acción, TODOS sus meses operables, con el mismo capital por acción
let c2 = 0, t2 = 0, k2 = 0, n2 = 0, g2 = 0;
for (const [t, ms_] of elegidos) {
  const todos = mesesOp.get(t) ?? [];
  const w = ms_.length / todos.length;                       // mismo capital que dedicó el filtro
  const a = agrega(todos.map((m) => [t, m]));
  c2 += a.c * w; t2 += a.t * w; k2 += a.k * w; n2 += a.n * w; g2 += a.g * w;
}

console.log("\n=== DESCOMPOSICIÓN: ELEGIR LA ACCIÓN vs ELEGIR EL MES ===\n");
console.log(`   FILTRO (elige acción Y mes)                      ${(F.t / F.c).toFixed(2).padStart(7)}x tal cual · ${(F.k / F.c).toFixed(2).padStart(7)}x splits bien · aciertos ${((F.g / F.n) * 100).toFixed(1)}%`);
console.log(`   MISMAS ACCIONES, TODOS los meses (no elige mes)  ${(t2 / c2).toFixed(2).padStart(7)}x tal cual · ${(k2 / c2).toFixed(2).padStart(7)}x splits bien · aciertos ${((g2 / n2) * 100).toFixed(1)}%`);
console.log(`\n   → lo que aporta ELEGIR EL MES: ${((F.t / F.c) / (t2 / c2)).toFixed(2)}x tal cual · ${((F.k / F.c) / (k2 / c2)).toFixed(2)}x con los splits bien`);

console.log("\n=== ACCIÓN POR ACCIÓN: los meses que eligió el filtro vs TODOS los meses operables ===");
console.log("   acción  elegidos/operables   filtro(tal cual)   todos(tal cual)   filtro(splits)   todos(splits)");
const orden = [...elegidos].sort((a, b) => b[1].length - a[1].length);
for (const [t, ms_] of orden) {
  const todos = mesesOp.get(t) ?? [];
  const a = agrega(ms_.map((m) => [t, m])), b = agrega(todos.map((m) => [t, m]));
  console.log(`   ${t.padEnd(6)} ${String(ms_.length).padStart(4)}/${String(todos.length).padEnd(4)}   ` +
    `${(a.t / a.c).toFixed(2).padStart(12)}x  ${(b.t / b.c).toFixed(2).padStart(12)}x  ` +
    `${(a.k / a.c).toFixed(2).padStart(12)}x  ${(b.k / b.c).toFixed(2).padStart(12)}x   ${(a.t / a.c) > (b.t / b.c) ? "elige mejor" : "elige PEOR"}`);
}
const mejores = orden.filter(([t, ms_]) => { const a = agrega(ms_.map((m) => [t, m])), b = agrega((mesesOp.get(t) ?? []).map((m) => [t, m])); return (a.t / a.c) > (b.t / b.c); }).length;
console.log(`\n   acciones donde el filtro eligió MEJORES meses que la media de sus meses: ${mejores} de ${orden.length}`);
