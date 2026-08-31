// Y4-C — SONDAS: ¿la senal gana por lo que dice, o por como toca el envase?
//
// Complemento de y4b. Aqui NO se mide ningun ratio nuevo: se abre el capo y se comprueba si las
// operaciones que ELIGE la senal son distintas de las que DESCARTA en cosas que ya sabemos que
// mueven el resultado por si solas:
//
//   · cuantos dias de calendario se aguanta de verdad (la salida es "30 dias de fichero de
//     cadena", y si a un ticker le faltan dias, esos 30 son mas de 30 dias reales)
//   · cuanto plazo tiene el contrato elegido (el envase permite 60 +/- 17 dias)
//   · a que distancia real queda el strike (el envase permite 10% +/- 5 puntos)
//   · cuanto cuesta la prima y cuanto se paga de horquilla
//   · en que tickers vive: indices (SPY/QQQ/SPX/SPXW/NDX) contra acciones sueltas
//   · como se reparten los montones en el tiempo (si el residuo se va hacia abajo con los anos,
//     el "40% mas alto" no es el 40% de los dias, y hay que decirlo)
//
// Si la senal eligiera contratos con mas plazo, mas cerca del dinero o aguantados mas dias, el
// ratio subiria SOLO POR ESO y no por la curva.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/y4c-lente2-sondas.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const APUESTA = 1000, ASK_MIN = 0.10;
const ENVASES = { A: { dist: 0.10, dte: 60, tolDte: 17, salida: 30, tolK: 0.50 } };
const TRAMOS = [["f", 30, 10], ["m", 90, 22], ["b", 180, 45]];
const COCIENTES = [["30/90", "f", "m"], ["30/180", "f", "b"], ["90/180", "m", "b"]];
const MIN_ANOS_MES = 2, NB = 5, MIN_PROPIO = 12;
const SEN = { nom: "30/180", qs: [3, 4] };
const INDICES = new Set(["SPY", "QQQ", "SPX", "SPXW", "NDX"]);

const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) + "%" : "—");
const num = (n) => Math.round(n).toLocaleString("en-US");
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "—");
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const cal = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const med = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const mediana = (v) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();
const TICKERS = [...diasPorSim.keys()].sort();

const cache = new Map();
function cadena(sym, dia) {
  const k = `${sym}|${dia}`;
  if (cache.has(k)) { const v = cache.get(k); cache.delete(k); cache.set(k, v); return v; }
  const f = `${CDIR}/${sym}_d${dia}.json`;
  let v = null;
  if (existsSync(f)) { try { v = JSON.parse(readFileSync(f, "utf8")); } catch { v = null; } }
  if (cache.size >= 100) cache.delete(cache.keys().next().value);
  cache.set(k, v);
  return v;
}
function spotOk(c, hoy) {
  let exp = null, md = Infinity;
  for (const e of Object.keys(c)) { const d = cal(hoy, e); if (d < 1) continue; if (d < md) { md = d; exp = e; } }
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
function sigmaDe(g, S, dte) {
  let mejor = null, dm = Infinity;
  for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== "C") continue;
    const K = Number(cl.slice(0, -2)); const p = g[`${K}|P`];
    if (!p || !(ba[1] > 0) || !(p[1] > 0)) continue;
    const d = Math.abs(K - S);
    if (d < dm) { dm = d; mejor = { c: (ba[0] + ba[1]) / 2, p: (p[0] + p[1]) / 2 }; }
  }
  if (!mejor || dm > S * 0.05) return null;
  const cuna = mejor.c + mejor.p;
  return cuna > 0 ? (cuna / S) / Math.sqrt(dte / 365) : null;
}
function elegir(c, S, hoy, env, tipo) {
  let exp = null, dd = Infinity;
  for (const e of Object.keys(c)) { const d = cal(hoy, e); if (d < 1) continue; const x = Math.abs(d - env.dte); if (x < dd) { dd = x; exp = e; } }
  if (!exp || dd > env.tolDte) return null;
  const objetivo = tipo === "C" ? S * (1 + env.dist) : S * (1 - env.dist);
  let K = null, ba = null, kd = Infinity;
  for (const [clave, v] of Object.entries(c[exp])) {
    if (clave.slice(-1) !== tipo || !(v[1] >= ASK_MIN)) continue;
    const k = Number(clave.slice(0, -2)); const d = Math.abs(k - objetivo);
    if (d < kd) { kd = d; K = k; ba = v; }
  }
  if (K == null) return null;
  const distReal = tipo === "C" ? K / S - 1 : 1 - K / S;
  if (Math.abs(distReal - env.dist) > env.dist * env.tolK) return null;
  return { exp, K, clave: `${K}|${tipo}`, bid: ba[0], ask: ba[1], distReal, dte: cal(hoy, exp) };
}

const obs = [], ops = [];
for (const sym of TICKERS) {
  const ds = diasPorSim.get(sym);
  const vistos = new Set();
  for (let i = 0; i < ds.length; i++) {
    const dia = ds[i];
    if (vistos.has(dia.slice(0, 6))) continue;
    vistos.add(dia.slice(0, 6));
    const c = cadena(sym, dia);
    if (!c) continue;
    const S = spotOk(c, dia);
    if (!(S > 0)) continue;
    const sig = {};
    for (const [nom, obj, tol] of TRAMOS) {
      let exp = null, dd = Infinity;
      for (const e of Object.keys(c)) { const d = cal(dia, e); if (d < 1) continue; const x = Math.abs(d - obj); if (x < dd) { dd = x; exp = e; } }
      if (!exp || dd > tol) continue;
      const s = sigmaDe(c[exp], S, cal(dia, exp));
      if (s > 0) sig[nom] = s;
    }
    const coc = {};
    for (const [nom, a, b] of COCIENTES) if (sig[a] > 0 && sig[b] > 0) coc[nom] = sig[a] / sig[b];
    if (!Object.keys(coc).length) continue;
    const idxObs = obs.length;
    obs.push({ sym, dia, ano: dia.slice(0, 4), coc });
    const dSal = ds[i + 30] ?? null;
    if (!dSal) continue;
    const cs = cadena(sym, dSal);
    const env = ENVASES.A;
    for (const tipo of ["C", "P"]) {
      const ct = elegir(c, S, dia, env, tipo);
      if (!ct) continue;
      if (dSal >= ct.exp) continue;
      if (!cs) continue;
      const g2 = cs[ct.exp];
      if (!g2) continue;
      const bid = g2[ct.clave]?.[0] ?? 0;
      ops.push({
        sym, dia, dSal, ano: dia.slice(0, 4), tipo, idxObs,
        ret: (bid - ct.ask) / ct.ask,
        primaPctS: ct.ask / S, horq: (ct.ask - ct.bid) / ct.ask,
        dteCtr: ct.dte, distReal: ct.distReal, aguante: cal(dia, dSal),
        ask: ct.ask,
      });
    }
  }
  cache.clear();
}

// montones (solo el metodo residuo del 30/180, que es la senal)
const orden = [...obs.keys()].sort((a, b) => (obs[a].dia < obs[b].dia ? -1 : obs[a].dia > obs[b].dia ? 1 : (obs[a].sym < obs[b].sym ? -1 : 1)));
function insertar(arr, x) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; } arr.splice(lo, 0, x); }
function rango(arr, x) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; } return lo / arr.length; }
const resid = new Map(), mesHist = new Map();
let kk = 0;
while (kk < orden.length) {
  const dia = obs[orden[kk]].dia;
  let j = kk;
  while (j < orden.length && obs[orden[j]].dia === dia) j++;
  for (let q = kk; q < j; q++) {
    const o = obs[orden[q]], MM = o.dia.slice(4, 6), x = o.coc[SEN.nom];
    o.q = null;
    if (!(x > 0)) continue;
    const mh = mesHist.get(`${o.sym}|${MM}`);
    if (mh && mh.n >= MIN_ANOS_MES) {
      o.res = x - mh.suma / mh.n;
      const RR = resid.get(o.sym) ?? [];
      if (RR.length >= MIN_PROPIO) o.q = Math.min(NB - 1, Math.floor(rango(RR, o.res) * NB));
    }
  }
  for (let q = kk; q < j; q++) {
    const o = obs[orden[q]], MM = o.dia.slice(4, 6), x = o.coc[SEN.nom];
    if (!(x > 0)) continue;
    const km = `${o.sym}|${MM}`;
    if (!mesHist.has(km)) mesHist.set(km, { suma: 0, n: 0 });
    const mh = mesHist.get(km); mh.suma += x; mh.n++;
    if (o.res !== undefined) { if (!resid.has(o.sym)) resid.set(o.sym, []); insertar(resid.get(o.sym), o.res); }
  }
  kk = j;
}

const S = [], R = [];
for (const o of ops) { const q = obs[o.idxObs].q; if (q == null) continue; (SEN.qs.includes(q) ? S : R).push(o); }
const acc = () => ({ n: 0, win: 0, gan: 0, per: 0 });
function cuenta(l) { const a = acc(); for (const o of l) { a.n++; const d = APUESTA * o.ret; if (d > 0) { a.win++; a.gan += d; } else a.per += -d; } return a; }
const ratio = (a) => (a.per > 0 ? a.gan / a.per : NaN);
const acierto = (a) => a.win / a.n;

console.log(`\n${"=".repeat(112)}`);
console.log("  SONDA 1 — ¿son distintos los CONTRATOS que elige la senal de los que descarta?");
console.log(`${"=".repeat(112)}`);
console.log(`  | magnitud | SENAL (n=${num(S.length)}) | RESTO (n=${num(R.length)}) | ¿empuja el ratio? |`);
console.log(`  |---|---|---|---|`);
const camposs = [
  ["dias de calendario aguantados (media)", (o) => o.aguante, "mas dias = mas ratio"],
  ["dias de calendario aguantados (mediana)", (o) => o.aguante, "mas dias = mas ratio"],
  ["plazo del contrato en dias (media)", (o) => o.dteCtr, "mas plazo = mas ratio"],
  ["distancia real fuera del dinero (media)", (o) => 100 * o.distReal, "mas cerca = mas acierto"],
  ["prima como % de la accion (media)", (o) => 100 * o.primaPctS, "mas cara = MENOS ratio"],
  ["horquilla como % de la prima (media)", (o) => 100 * o.horq, "mas ancha = MENOS ratio"],
  ["prima en dolares por contrato (media)", (o) => 100 * o.ask, "—"],
];
for (const [nom, f, efecto] of camposs) {
  const a = nom.includes("mediana") ? mediana(S.map(f)) : med(S.map(f));
  const b = nom.includes("mediana") ? mediana(R.map(f)) : med(R.map(f));
  console.log(`  | ${nom} | ${a.toFixed(2)} | ${b.toFixed(2)} | ${efecto} |`);
}
console.log(`  | operaciones con mas de 50 dias de calendario aguantados | ${pct(S.filter((o) => o.aguante > 50).length / S.length)} | ${pct(R.filter((o) => o.aguante > 50).length / R.length)} | huecos del fichero |`);
console.log(`  | vence sin valor (bid 0 a la salida) | ${pct(S.filter((o) => o.ret <= -0.999).length / S.length)} | ${pct(R.filter((o) => o.ret <= -0.999).length / R.length)} | — |`);

console.log(`\n${"=".repeat(112)}`);
console.log("  SONDA 2 — ¿y si se igualan las condiciones? mismo tramo de plazo, de distancia y de aguante");
console.log(`${"=".repeat(112)}`);
console.log(`  | condicion igualada | senal n | RATIO senal | resto n | RATIO resto | diferencia |`);
console.log(`  |---|---|---|---|---|---|`);
const cortes = [
  ["sin igualar nada", () => true],
  ["solo plazo 55-65 dias", (o) => o.dteCtr >= 55 && o.dteCtr <= 65],
  ["solo distancia 9%-11%", (o) => o.distReal >= 0.09 && o.distReal <= 0.11],
  ["solo aguante 40-48 dias", (o) => o.aguante >= 40 && o.aguante <= 48],
  ["las tres a la vez", (o) => o.dteCtr >= 55 && o.dteCtr <= 65 && o.distReal >= 0.09 && o.distReal <= 0.11 && o.aguante >= 40 && o.aguante <= 48],
];
for (const [nom, f] of cortes) {
  const a = cuenta(S.filter(f)), b = cuenta(R.filter(f));
  console.log(`  | ${nom} | ${num(a.n)} | **${f2(ratio(a))}** | ${num(b.n)} | ${f2(ratio(b))} | ${((ratio(a) - ratio(b)) >= 0 ? "+" : "") + (ratio(a) - ratio(b)).toFixed(2)} |`);
}

console.log(`\n${"=".repeat(112)}`);
console.log("  SONDA 3 — INDICES contra ACCIONES SUELTAS (SPY/QQQ/SPX/SPXW/NDX son 5 nombres pero 2 mercados)");
console.log(`${"=".repeat(112)}`);
console.log(`  | grupo | senal n | acierta | RATIO | resto n | acierta | RATIO | diferencia |`);
console.log(`  |---|---|---|---|---|---|---|---|`);
for (const [nom, f] of [["indices", (o) => INDICES.has(o.sym)], ["acciones sueltas", (o) => !INDICES.has(o.sym)]]) {
  const a = cuenta(S.filter(f)), b = cuenta(R.filter(f));
  console.log(`  | ${nom} | ${num(a.n)} | ${pct(acierto(a))} | **${f2(ratio(a))}** | ${num(b.n)} | ${pct(acierto(b))} | ${f2(ratio(b))} | ${((ratio(a) - ratio(b)) >= 0 ? "+" : "") + (ratio(a) - ratio(b)).toFixed(2)} |`);
}

console.log(`\n${"=".repeat(112)}`);
console.log("  SONDA 4 — ¿el 'monton 4+5' es de verdad el 40% de los dias? y como se reparte en el tiempo");
console.log(`${"=".repeat(112)}`);
{
  const cnt = [0, 0, 0, 0, 0];
  let conQ = 0;
  for (const o of obs) if (o.q != null) { cnt[o.q]++; conQ++; }
  console.log(`  observaciones con monton asignado: ${num(conQ)} · reparto: ` + cnt.map((c, i) => `${i + 1}=${pct(c / conQ)}`).join(" · "));
  console.log(`  el "40% mas alto" (montones 4+5) es en realidad el ${pct((cnt[3] + cnt[4]) / conQ)} de los dias.`);
  console.log(`  → el residuo se va DESPLAZANDO con los anos: por eso los montones no salen iguales.`);
  console.log(`\n  | ano | dias con monton | % que caen en 4+5 | residuo mediano |`);
  console.log(`  |---|---|---|---|`);
  const anos = [...new Set(obs.filter((o) => o.q != null).map((o) => o.ano))].sort();
  for (const a of anos) {
    const l = obs.filter((o) => o.q != null && o.ano === a);
    console.log(`  | ${a} | ${num(l.length)} | ${pct(l.filter((o) => o.q >= 3).length / l.length)} | ${mediana(l.map((o) => o.res)).toFixed(3)} |`);
  }
}

console.log(`\n${"=".repeat(112)}`);
console.log("  SONDA 5 — el reparto del dinero ganado por ticker (senal, envase A)");
console.log(`${"=".repeat(112)}`);
{
  const m = new Map();
  for (const o of S) { if (!m.has(o.sym)) m.set(o.sym, acc()); const a = m.get(o.sym); a.n++; const d = APUESTA * o.ret; if (d > 0) { a.win++; a.gan += d; } else a.per += -d; }
  const tot = cuenta(S);
  const l = [...m.entries()].sort((a, b) => b[1].gan - a[1].gan);
  console.log(`  | # | ticker | n | RATIO | ganado | % del total ganado | acumulado |`);
  console.log(`  |---|---|---|---|---|---|---|`);
  let ac = 0;
  l.forEach(([t, v], i) => {
    ac += v.gan;
    if (i < 12) console.log(`  | ${i + 1} | ${t} | ${v.n} | ${f2(ratio(v))} | $${num(v.gan)} | ${pct(v.gan / tot.gan)} | ${pct(ac / tot.gan)} |`);
  });
  console.log(`  ... ${l.length} tickers en total. Con ratio > 1: ${l.filter((x) => ratio(x[1]) > 1).length}. Con ratio < 1: ${l.filter((x) => ratio(x[1]) <= 1).length}.`);
  console.log(`  Los 3 mejores ponen el ${pct(l.slice(0, 3).reduce((a, x) => a + x[1].gan, 0) / tot.gan)} del dinero ganado (si estuviera repartido, 3 de ${l.length} pondrian ${pct(3 / l.length)}).`);
}
console.log("");
