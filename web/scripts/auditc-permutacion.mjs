// AUDITORÍA 2 — ¿es el FILTRO, o es 2019?
//
// Precalcula la cesta (MODO=enteros) de TODOS los (acción,mes) de 2016-2020 y luego:
//   1. compara el filtro contra 2.000 carteras al azar (no una sola semilla)
//   2. repite quitando 2019, y quitando TSLA y NVDA
//   3. mira si gamLejos=1,00 es un dato o un fallo del solucionador de volatilidad
//
// Uso: node --max-old-space-size=8192 scripts/auditc-permutacion.mjs

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const CACHE = "scripts/auditc-cestas-2016-2020.json";
const PRESUPUESTO = 500, N = 3, OTM_MIN = 60, DTE_MIN = 365, ASK_MIN = 0.10, SPREAD_MAX = 0.40;
const DESDE = "201601", HASTA = "202012";
const aMs = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
const dias = (a, b) => Math.round((aMs(b) - aMs(a)) / 86400000);

const calendario = new Map();
for (const nombre of readdirSync(CDIR)) {
  const m = /^([A-Z]+)_d(\d{8})\.json$/.exec(nombre);
  if (!m) continue;
  let a = calendario.get(m[1]); if (!a) calendario.set(m[1], (a = []));
  a.push(m[2]);
}
for (const a of calendario.values()) a.sort();

const memo = new Map();
const leer = (sym, d) => {
  const k = sym + d; if (memo.has(k)) return memo.get(k);
  const r = `${CDIR}/${sym}_d${d}.json`;
  const v = existsSync(r) ? JSON.parse(readFileSync(r, "utf8")) : null;
  if (memo.size > 300) memo.delete(memo.keys().next().value);
  memo.set(k, v); return v;
};
const diaHasta = (sym, tope) => {
  const a = calendario.get(sym) || []; let lo = 0, hi = a.length - 1, r = null;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (a[m] <= tope) { r = a[m]; lo = m + 1; } else hi = m - 1; }
  return r;
};
function spot(c) {
  let mejor = null, dif = Infinity;
  for (const g of Object.values(c)) for (const clave of Object.keys(g)) {
    if (!clave.endsWith("|C")) continue;
    const K = +clave.slice(0, -2), p = g[K + "|P"]; if (!p) continue;
    const cc = g[clave], d = Math.abs((cc[0] + cc[1]) / 2 - (p[0] + p[1]) / 2);
    if (d < dif) { dif = d; mejor = K; }
  }
  return mejor;
}

function cesta(sym, mes) {
  const ld = calendario.get(sym) || [];
  const delMes = ld.filter((d) => d.slice(0, 6) === mes);
  if (!delMes.length) return null;
  const dia = delMes[delMes.length - 1];
  const c = leer(sym, dia); if (!c) return null;
  const sp = spot(c); if (sp == null) return null;
  const fin = ld[ld.length - 1];
  const cand = [];
  for (const [exp, g] of Object.entries(c)) {
    if (dias(dia, exp) <= DTE_MIN || exp > fin) continue;
    const ds = diaHasta(sym, exp); if (!ds) continue;
    for (const [clave, ba] of Object.entries(g)) {
      if (!clave.endsWith("|C")) continue;
      const K = +clave.slice(0, -2);
      if (!(K > sp * (1 + OTM_MIN / 100))) continue;
      const [bid, ask] = ba;
      if (!(ask >= ASK_MIN) || !((ask - bid) / ask <= SPREAD_MAX)) continue;
      cand.push({ exp, clave, K, ask, ds });
    }
  }
  if (!cand.length) return null;
  cand.sort((a, b) => a.ask - b.ask);
  let queda = PRESUPUESTO, inv = 0, rec = 0, n = 0, gan = 0;
  for (const x of cand) {
    const coste = x.ask * 100; if (coste > queda) continue; queda -= coste;
    const cs = leer(sym, x.ds);
    const ba = cs?.[x.exp]?.[x.clave];
    const val = ba ? ba[0] : 0;
    inv += coste; rec += val * 100; n++; if (val > x.ask) gan++;
  }
  return n ? { inv, rec, n, gan } : null;
}

// ── tabla de cestas ──────────────────────────────────────────────────────────
const filas = JSON.parse(readFileSync("scripts/puente-filas.json", "utf8"))
  .filter((f) => f.gamLejos != null && f.mes >= DESDE && f.mes <= HASTA);
console.log(`${filas.length} filas (acción,mes) en ${DESDE}-${HASTA}`);

let tabla;
if (existsSync(CACHE)) { tabla = JSON.parse(readFileSync(CACHE, "utf8")); console.log("cestas leídas de caché"); }
else {
  tabla = [];
  let i = 0;
  for (const f of filas) {
    const c = cesta(f.ticker, f.mes);
    tabla.push({ ticker: f.ticker, mes: f.mes, gam: f.gamLejos, res: f.resultado, ...(c || { inv: 0, rec: 0, n: 0, gan: 0 }) });
    if (++i % 100 === 0) process.stdout.write(`  ${i}/${filas.length}\r`);
  }
  writeFileSync(CACHE, JSON.stringify(tabla));
  console.log(`\n${tabla.length} cestas calculadas`);
}

const porMes = new Map();
for (const t of tabla) { let a = porMes.get(t.mes); if (!a) porMes.set(t.mes, (a = [])); a.push(t); }
const meses = [...porMes.keys()].sort();

function evaluar(sel, filtroFila = () => true) {
  let inv = 0, rec = 0, n = 0, gan = 0;
  for (const mes of meses) {
    const cand = porMes.get(mes).filter(filtroFila);
    if (!cand.length) continue;
    for (const t of sel(cand)) { inv += t.inv; rec += t.rec; n += t.n; gan += t.gan; }
  }
  return { inv, rec, n, gan, x: rec / inv };
}
const topGam = (c) => [...c].sort((a, b) => b.gam - a.gam).slice(0, N);
let sem = 1;
const rnd = () => { sem = (sem * 1103515245 + 12345) & 0x7fffffff; return sem / 0x7fffffff; };
const azar = (c) => { const k = [...c], o = []; for (let i = 0; i < N && k.length; i++) o.push(k.splice(Math.floor(rnd() * k.length), 1)[0]); return o; };

function permutacion(etiqueta, filtroFila = () => true, reps = 2000) {
  const real = evaluar(topGam, filtroFila);
  const xs = [];
  for (let r = 0; r < reps; r++) xs.push(evaluar(azar, filtroFila).x);
  xs.sort((a, b) => a - b);
  const mejores = xs.filter((v) => v >= real.x).length;
  const q = (p) => xs[Math.min(xs.length - 1, Math.floor(xs.length * p))];
  console.log(`\n── ${etiqueta}`);
  console.log(`   FILTRO  ${real.n} patas · ganan ${((real.gan / real.n) * 100).toFixed(0)}% · $${Math.round(real.inv).toLocaleString("es-ES")} → $${Math.round(real.rec).toLocaleString("es-ES")} = ${real.x.toFixed(2)}x`);
  console.log(`   AZAR (${reps} carteras)  p10 ${q(0.1).toFixed(2)}x · mediana ${q(0.5).toFixed(2)}x · p90 ${q(0.9).toFixed(2)}x · p99 ${q(0.99).toFixed(2)}x · máx ${xs[xs.length - 1].toFixed(2)}x`);
  console.log(`   ➜ ${mejores} de ${reps} carteras al azar igualan o superan al filtro  (p = ${(mejores / reps).toFixed(3)})`);
}

permutacion("TODO 2016-2020");
permutacion("SIN 2019", (t) => t.mes.slice(0, 4) !== "2019");
permutacion("SIN TSLA ni NVDA", (t) => t.ticker !== "TSLA" && t.ticker !== "NVDA");
permutacion("SÓLO 2019", (t) => t.mes.slice(0, 4) === "2019");

// ── ¿a quién elige el filtro? ────────────────────────────────────────────────
const cuenta = new Map();
for (const mes of meses) for (const t of topGam(porMes.get(mes))) cuenta.set(t.ticker, (cuenta.get(t.ticker) || 0) + 1);
console.log(`\n── a quién elige el filtro (${meses.length} meses × 3):`);
console.log("   " + [...cuenta].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join("  "));

const en2019 = meses.filter((m) => m.startsWith("2019"));
console.log(`\n── elegidos mes a mes en 2019:`);
for (const m of en2019) console.log(`   ${m}  ` + topGam(porMes.get(m)).map((t) => `${t.ticker}(${t.gam.toFixed(3)})`).join("  "));

// ── gamLejos = 1,00 ──────────────────────────────────────────────────────────
const unos = tabla.filter((t) => t.gam >= 0.999);
console.log(`\n── gamLejos ≥ 0,999: ${unos.length} filas de ${tabla.length}`);
for (const t of unos.slice(0, 20)) console.log(`   ${t.ticker} ${t.mes} gam=${t.gam}`);
const altos = tabla.filter((t) => t.gam > 0.5);
console.log(`   gamLejos > 0,5: ${altos.length} filas · tickers: ${[...new Set(altos.map((t) => t.ticker))].join(",")}`);
