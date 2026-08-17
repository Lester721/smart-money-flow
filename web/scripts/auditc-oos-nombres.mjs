// ¿gamLejos ELIGE NOMBRES en tiempo real, o sólo los eligió con el diario del lunes?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/auditc-oos-nombres.mjs
//
// La defensa del 24,58x: "vale que es una apuesta a NVDA y TSLA, pero gamLejos LAS ENCONTRÓ".
// Se comprueba partiendo la muestra: se ordenan los nombres por su gamLejos MEDIO usando sólo los
// años de entrenamiento y se compran esos 3 fijos en los años siguientes, sin volver a mirar la
// señal. Si el nombre elegido con lo que se sabía entonces no aguanta después, la señal no elige
// nombres: los explica a toro pasado.
//
// Se guarda además el detalle (ticker, mes) → coste/cobro para poder cortar por años sin recalcular.

import { readFileSync, readdirSync, existsSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const POR_TICKER = 500, OTM_MIN = 60, DTE_MIN = 365, ASK_MIN = 0.10, SPREAD_MAX = 0.40, N = 3;
const ms = (y) => Date.parse(`${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}T00:00:00Z`);

const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/); if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();
const cache = new Map();
function cadena(sym, dia) {
  const k = `${sym}|${dia}`; const hit = cache.get(k);
  if (hit !== undefined) { cache.delete(k); cache.set(k, hit); return hit; }
  const f = `${CDIR}/${sym}_d${dia}.json`;
  const v = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  cache.set(k, v); if (cache.size > 250) cache.delete(cache.keys().next().value); return v;
}
function spotDe(c) {
  let k = null, dm = Infinity;
  for (const g of Object.values(c)) for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== "C") continue;
    const K = Number(cl.slice(0, -2)); const p = g[`${K}|P`]; if (!p) continue;
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
function celda(sym, mes) {                            // MODO=enteros, agregado del (ticker,mes)
  const dd = (diasPorSim.get(sym) ?? []).filter((x) => x.slice(0, 6) === mes);
  if (!dd.length) return null;
  const dia = dd[dd.length - 1];
  const c = cadena(sym, dia); if (!c) return null;
  const sp = spotDe(c); if (!sp) return null;
  const patas = [];
  for (const [exp, g] of Object.entries(c)) {
    if (Math.round((ms(exp) - ms(dia)) / 86_400_000) <= DTE_MIN) continue;
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
  let queda = POR_TICKER, inv = 0, rec = 0, n = 0;
  for (const p of patas) { const co = p.ask * 100; if (co > queda) continue; queda -= co; inv += co; rec += p.cobro; n++; }
  return n ? { inv, rec, n } : null;
}

const filas = JSON.parse(readFileSync("scripts/puente-filas.json", "utf8")).filter((x) => x.gamLejos != null);
const porMes = new Map();
for (const f of filas) { if (!porMes.has(f.mes)) porMes.set(f.mes, []); porMes.get(f.mes).push(f); }
const MESES = [...porMes.keys()].sort();
const TICKERS = [...new Set(filas.map((f) => f.ticker))].sort();

const C = new Map();                                   // "TICKER|mes" -> {inv,rec,n}
for (const f of filas) { const v = celda(f.ticker, f.mes); if (v) C.set(`${f.ticker}|${f.mes}`, v); }
console.log(`\nceldas (ticker,mes) operables: ${C.size} de ${filas.length}\n`);

const agg = (pares) => {
  let inv = 0, rec = 0, n = 0;
  for (const k of pares) { const v = C.get(k); if (v) { inv += v.inv; rec += v.rec; n += v.n; } }
  return { inv, rec, n, m: inv ? rec / inv : NaN };
};
const eur = (x) => `$${Math.round(x).toLocaleString("es-ES")}`;
const fmt = (a) => `${String(a.n).padStart(5)} patas · ${eur(a.inv).padStart(10)} → ${eur(a.rec).padStart(12)} = ${(a.m).toFixed(2).padStart(7)}x`;

function mediaGam(tks, mesesEnt) {
  const m = new Map();
  for (const f of filas) {
    if (!mesesEnt.has(f.mes)) continue;
    if (!m.has(f.ticker)) m.set(f.ticker, []);
    m.get(f.ticker).push(f.gamLejos);
  }
  return tks.map((t) => [t, (m.get(t) ?? []).length ? m.get(t).reduce((a, b) => a + b, 0) / m.get(t).length : -1])
            .sort((a, b) => b[1] - a[1]);
}

console.log("═══ ELEGIR LOS 3 NOMBRES CON EL PASADO Y COMPRARLOS EN EL FUTURO ═══\n");
for (const corte of ["2018", "2019", "2020", "2021"]) {
  const ent = new Set(MESES.filter((m) => m < `${corte}13`.slice(0, 4) + "01" || m.slice(0, 4) <= corte));
  const entr = new Set(MESES.filter((m) => m.slice(0, 4) <= corte));
  const test = MESES.filter((m) => m.slice(0, 4) > corte);
  if (!test.length) continue;
  const rank = mediaGam(TICKERS, entr);
  const elegidos = rank.slice(0, N).map((x) => x[0]);

  // (a) los 3 nombres fijos elegidos con el pasado
  const est = agg(test.flatMap((m) => elegidos.map((t) => `${t}|${m}`)));
  // (b) la elección MENSUAL por gamLejos en el mismo tramo de prueba
  const din = agg(test.flatMap((m) => [...porMes.get(m)].sort((a, b) => b.gamLejos - a.gamLejos).slice(0, N).map((e) => `${e.ticker}|${m}`)));
  // (c) las 28 todos los meses — cero decisión
  const todo = agg(test.flatMap((m) => porMes.get(m).map((e) => `${e.ticker}|${m}`)));
  // (d) el mejor trío visto EN ENTRENAMIENTO por resultado (no por señal), aplicado fuera
  console.log(`── entrena ≤${corte} · prueba ${test[0]}–${test[test.length - 1]} (${test.length} meses)`);
  console.log(`   3 nombres por gamLejos medio del pasado [${elegidos.join(", ")}] : ${fmt(est)}`);
  console.log(`   elección MENSUAL por gamLejos                              : ${fmt(din)}`);
  console.log(`   las 28 todos los meses (cero decisión)                     : ${fmt(todo)}`);
  console.log(`   → mensual / estática = ${(din.m / est.m).toFixed(2)}  ·  mensual / todo = ${(din.m / todo.m).toFixed(2)}\n`);
}

console.log("═══ ¿ES ESTABLE EL RANKING DE NOMBRES? ═══");
const mitad = MESES[Math.floor(MESES.length / 2)];
const r1 = mediaGam(TICKERS, new Set(MESES.filter((m) => m < mitad)));
const r2 = mediaGam(TICKERS, new Set(MESES.filter((m) => m >= mitad)));
const pos2 = new Map(r2.map(([t], i) => [t, i]));
console.log(`   primera mitad (${MESES[0]}–${mitad}) top6: ${r1.slice(0, 6).map(([t]) => t).join(", ")}`);
console.log(`   segunda mitad (${mitad}–${MESES[MESES.length - 1]}) top6: ${r2.slice(0, 6).map(([t]) => t).join(", ")}`);
let sd = 0;
r1.forEach(([t], i) => { const d = i - pos2.get(t); sd += d * d; });
const rho = 1 - (6 * sd) / (TICKERS.length * (TICKERS.length ** 2 - 1));
console.log(`   correlación de rangos entre mitades (Spearman): ${rho.toFixed(2)}`);
