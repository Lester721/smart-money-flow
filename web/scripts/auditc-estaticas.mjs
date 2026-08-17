// AUDITORÍA — ¿el 24,58x lo hace la SEÑAL o lo hacen los NOMBRES?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/auditc-estaticas.mjs
//
// La cartera estática es ADITIVA: comprar la cesta de un ticker todos los meses tiene un coste y un
// cobro fijos, así que el múltiplo de cualquier trío de nombres sale de sumar. Se calcula una vez
// por ticker y se puede rankear los 3.276 tríos posibles de 28 nombres SIN señal ninguna.
//
// La pregunta: el 24,58x del filtro, ¿en qué percentil cae entre los tríos elegidos a ciegas?
// Y el listón más honesto de todos: comprar LAS 28 todos los meses (cero decisión).

import { readFileSync, readdirSync, existsSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const POR_TICKER = Number(process.env.POR_TICKER || 500);
const OTM_MIN = 60, DTE_MIN = 365, ASK_MIN = 0.10, SPREAD_MAX = 0.40;
const ms = (y) => Date.parse(`${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}T00:00:00Z`);

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
  cache.set(k, v); if (cache.size > 250) cache.delete(cache.keys().next().value);
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
function comprasDe(sym, mes) {                       // idéntico a MODO=enteros
  const dd = (diasPorSim.get(sym) ?? []).filter((x) => x.slice(0, 6) === mes);
  if (!dd.length) return null;
  const dia = dd[dd.length - 1];
  const c = cadena(sym, dia); if (!c) return null;
  const sp = spotDe(c); if (!sp) return null;
  const patas = [];
  for (const [exp, g] of Object.entries(c)) {
    const dte = Math.round((ms(exp) - ms(dia)) / 86_400_000);
    if (dte <= DTE_MIN) continue;
    const iu = idxVenc(sym, exp); if (iu < 0) continue;
    const gSal = cadena(sym, (diasPorSim.get(sym) ?? [])[iu])?.[exp] ?? {};
    for (const [clave, ba] of Object.entries(g)) {
      if (clave.slice(-1) !== "C") continue;
      const K = Number(clave.slice(0, -2));
      if (((K - sp) / sp) * 100 <= OTM_MIN) continue;
      const [bid, ask] = ba;
      if (!(ask >= ASK_MIN) || !((ask - bid) / ask <= SPREAD_MAX)) continue;
      patas.push({ ask, cobro: (gSal[clave] ? gSal[clave][0] : 0) * 100 });
    }
  }
  if (!patas.length) return null;
  patas.sort((a, b) => a.ask - b.ask);
  const out = []; let queda = POR_TICKER;
  for (const p of patas) { const coste = p.ask * 100; if (coste > queda) continue; queda -= coste; out.push({ gasto: coste, cobro: p.cobro }); }
  return out.length ? out : null;
}

const filas = JSON.parse(readFileSync("scripts/puente-filas.json", "utf8")).filter((x) => x.gamLejos != null);
const porMes = new Map();
for (const f of filas) { if (!porMes.has(f.mes)) porMes.set(f.mes, []); porMes.get(f.mes).push(f); }
const MESES = [...porMes.keys()].sort();
const TICKERS = [...new Set(filas.map((f) => f.ticker))].sort();

const eur = (x) => `$${Math.round(x).toLocaleString("es-ES")}`;
console.log(`\n═══ TRÍOS ESTÁTICOS · sin señal ninguna · ${MESES.length} meses · ${TICKERS.length} nombres ═══\n`);

// totales por ticker (y por ticker excluyendo 2019/2025, para el escenario recortado)
const T = new Map();
for (const t of TICKERS) {
  const a = { inv: 0, rec: 0, n: 0, invR: 0, recR: 0 };
  for (const mes of MESES) {
    if (!porMes.get(mes).some((x) => x.ticker === t)) continue;
    const cs = comprasDe(t, mes); if (!cs) continue;
    const rec2 = mes.slice(0, 4) !== "2019" && mes.slice(0, 4) !== "2025";
    for (const c of cs) { a.inv += c.gasto; a.rec += c.cobro; a.n++; if (rec2) { a.invR += c.gasto; a.recR += c.cobro; } }
  }
  T.set(t, a);
  process.stdout.write(`${t} `);
}
console.log("\n");

console.log("── comprar la cesta de UN nombre todos los meses (sin señal) ──");
console.log("   ticker   patas    invertido       cobrado     mult    | sin 2019/2025");
for (const [t, a] of [...T].sort((x, y) => (y[1].rec / y[1].inv || 0) - (x[1].rec / x[1].inv || 0)))
  console.log(`   ${t.padEnd(6)} ${String(a.n).padStart(7)} ${eur(a.inv).padStart(12)} ${eur(a.rec).padStart(13)} ${(a.rec / a.inv).toFixed(2).padStart(8)}x  |  ${(a.recR / a.invR).toFixed(2).padStart(7)}x`);

// las 28 a la vez — cero decisión
const todo = [...T.values()].reduce((a, x) => ({ inv: a.inv + x.inv, rec: a.rec + x.rec, invR: a.invR + x.invR, recR: a.recR + x.recR }), { inv: 0, rec: 0, invR: 0, recR: 0 });
console.log(`\n   LAS 28 TODOS LOS MESES (cero decisión): ${eur(todo.inv)} → ${eur(todo.rec)} = ${(todo.rec / todo.inv).toFixed(2)}x` +
            `  ·  sin 2019/2025: ${(todo.recR / todo.invR).toFixed(2)}x`);

// todos los tríos
const tri = [];
for (let i = 0; i < TICKERS.length; i++) for (let j = i + 1; j < TICKERS.length; j++) for (let k = j + 1; k < TICKERS.length; k++) {
  const a = T.get(TICKERS[i]), b = T.get(TICKERS[j]), c = T.get(TICKERS[k]);
  const inv = a.inv + b.inv + c.inv, rec = a.rec + b.rec + c.rec;
  const invR = a.invR + b.invR + c.invR, recR = a.recR + b.recR + c.recR;
  if (inv > 0) tri.push({ n: `${TICKERS[i]}+${TICKERS[j]}+${TICKERS[k]}`, m: rec / inv, mR: invR ? recR / invR : NaN });
}
tri.sort((x, y) => y.m - x.m);
const FILTRO = 24.58, FILTRO_R = 5.95;
console.log(`\n── los ${tri.length} tríos posibles, elegidos A CIEGAS ──`);
console.log(`   mejor:   ${tri[0].n.padEnd(16)} ${tri[0].m.toFixed(2)}x`);
console.log(`   p90:     ${tri[Math.floor(tri.length * 0.10)].n.padEnd(16)} ${tri[Math.floor(tri.length * 0.10)].m.toFixed(2)}x`);
console.log(`   MEDIANA: ${tri[Math.floor(tri.length * 0.50)].n.padEnd(16)} ${tri[Math.floor(tri.length * 0.50)].m.toFixed(2)}x`);
console.log(`   peor:    ${tri[tri.length - 1].n.padEnd(16)} ${tri[tri.length - 1].m.toFixed(2)}x`);
const mejores = tri.filter((x) => x.m >= FILTRO).length;
console.log(`\n   tríos CIEGOS que igualan o superan el ${FILTRO}x del filtro: ${mejores} de ${tri.length} (${((mejores / tri.length) * 100).toFixed(1)}%)`);
console.log("   los 10 mejores tríos ciegos:");
for (const x of tri.slice(0, 10)) console.log(`     ${x.n.padEnd(18)} ${x.m.toFixed(2).padStart(7)}x   (sin 2019/2025: ${x.mR.toFixed(2)}x)`);

const triR = tri.filter((x) => Number.isFinite(x.mR)).sort((a, b) => b.mR - a.mR);
const mejoresR = triR.filter((x) => x.mR >= FILTRO_R).length;
console.log(`\n── mismo ejercicio SIN 2019 y SIN 2025 (el filtro cae a ${FILTRO_R}x) ──`);
console.log(`   mediana de los tríos ciegos: ${triR[Math.floor(triR.length * 0.5)].mR.toFixed(2)}x`);
console.log(`   tríos ciegos que igualan o superan al filtro: ${mejoresR} de ${triR.length} (${((mejoresR / triR.length) * 100).toFixed(1)}%)`);
