// Y4-D — LENTE 2, LA PARTE QUE FALTABA: ¿cuantas apuestas INDEPENDIENTES hay de verdad?
//
// El corte ancho de y4 deja 1.514 operaciones. Pero la senal se calcula con la curva de plazos,
// y la curva de plazos de casi todos los tickers se mueve A LA VEZ cuando se mueve el mercado.
// Si la senal dispara en veinte tickers el mismo mes, esas veinte operaciones NO son veinte
// apuestas: son UNA apuesta sobre ese mes, repetida veinte veces. Y entonces "1.514 operaciones"
// suena a muchisimo mas de lo que es.
//
// Se mide:
//   1. en cuantos MESES de calendario distintos dispara, y cuantos tickers disparan a la vez
//   2. cuantos MESES hacen falta para juntar la mitad del dinero ganado (lo mismo que se hace
//      con los tickers, pero con los meses, que es donde esta la dependencia de verdad)
//   3. LA PRUEBA QUE IMPORTA: dentro del MISMO mes de calendario, ¿la senal bate a los tickers
//      que ese mismo mes NO elige? Si si, esta eligiendo tickers y hay 1.514 apuestas de verdad.
//      Si no, es un cronometro de mercado y las apuestas son ~90, no 1.514.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/y4d-lente2-meses.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const APUESTA = 1000, ASK_MIN = 0.10;
const ENV = { dist: 0.10, dte: 60, tolDte: 17, tolK: 0.50 };
const ENVB = { dist: 0.05, dte: 90, tolDte: 25, tolK: 0.50 };
const TRAMOS = [["f", 30, 10], ["b", 180, 45]];
const MIN_ANOS_MES = 2, NB = 5, MIN_PROPIO = 12, QS = [3, 4];

const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) + "%" : "—");
const num = (n) => Math.round(n).toLocaleString("en-US");
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "—");
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const cal = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);

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
  const dr = tipo === "C" ? K / S - 1 : 1 - K / S;
  if (Math.abs(dr - env.dist) > env.dist * env.tolK) return null;
  return { exp, clave: `${K}|${tipo}`, bid: ba[0], ask: ba[1] };
}

const obs = [], ops = [];
for (const sym of TICKERS) {
  const ds = diasPorSim.get(sym), vistos = new Set();
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
    if (!(sig.f > 0 && sig.b > 0)) continue;
    const idxObs = obs.length;
    obs.push({ sym, dia, mes: dia.slice(0, 6), ano: dia.slice(0, 4), coc: sig.f / sig.b });
    const dSal = ds[i + 30] ?? null;
    if (!dSal) continue;
    const cs = cadena(sym, dSal);
    if (!cs) continue;
    for (const [en, env] of [["A", ENV], ["B", ENVB]]) {
      for (const tipo of ["C", "P"]) {
        const ct = elegir(c, S, dia, env, tipo);
        if (!ct || dSal >= ct.exp) continue;
        const g2 = cs[ct.exp];
        if (!g2) continue;
        const bid = g2[ct.clave]?.[0] ?? 0;
        ops.push({ sym, dia, mes: dia.slice(0, 6), ano: dia.slice(0, 4), env: en, tipo, idxObs, ret: (bid - ct.ask) / ct.ask });
      }
    }
  }
  cache.clear();
}
const orden = [...obs.keys()].sort((a, b) => (obs[a].dia < obs[b].dia ? -1 : obs[a].dia > obs[b].dia ? 1 : (obs[a].sym < obs[b].sym ? -1 : 1)));
function insertar(a, x) { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; } a.splice(lo, 0, x); }
function rango(a, x) { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; } return lo / a.length; }
const resid = new Map(), mesHist = new Map();
let kk = 0;
while (kk < orden.length) {
  const dia = obs[orden[kk]].dia;
  let j = kk;
  while (j < orden.length && obs[orden[j]].dia === dia) j++;
  for (let q = kk; q < j; q++) {
    const o = obs[orden[q]], MM = o.dia.slice(4, 6);
    o.q = null;
    const mh = mesHist.get(`${o.sym}|${MM}`);
    if (mh && mh.n >= MIN_ANOS_MES) {
      o.res = o.coc - mh.suma / mh.n;
      const RR = resid.get(o.sym) ?? [];
      if (RR.length >= MIN_PROPIO) o.q = Math.min(NB - 1, Math.floor(rango(RR, o.res) * NB));
    }
  }
  for (let q = kk; q < j; q++) {
    const o = obs[orden[q]], km = `${o.sym}|${o.dia.slice(4, 6)}`;
    if (!mesHist.has(km)) mesHist.set(km, { suma: 0, n: 0 });
    const mh = mesHist.get(km); mh.suma += o.coc; mh.n++;
    if (o.res !== undefined) { if (!resid.has(o.sym)) resid.set(o.sym, []); insertar(resid.get(o.sym), o.res); }
  }
  kk = j;
}

const acc = () => ({ n: 0, win: 0, gan: 0, per: 0 });
function cuenta(l) { const a = acc(); for (const o of l) { a.n++; const d = APUESTA * o.ret; if (d > 0) { a.win++; a.gan += d; } else a.per += -d; } return a; }
const ratio = (a) => (a.per > 0 ? a.gan / a.per : NaN);
const acierto = (a) => a.win / a.n;

for (const en of ["A", "B"]) {
  const S = [], R = [];
  for (const o of ops) { if (o.env !== en) continue; const q = obs[o.idxObs].q; if (q == null) continue; (QS.includes(q) ? S : R).push(o); }
  const U = [...S, ...R];
  const aS = cuenta(S), aU = cuenta(U);
  console.log(`\n${"=".repeat(112)}`);
  console.log(`  ENVASE ${en} — senal ${f2(ratio(aS))} (n=${num(aS.n)}) · universo ${f2(ratio(aU))} (n=${num(aU.n)})`);
  console.log(`${"=".repeat(112)}`);

  // 1 · cuantas apuestas independientes
  const mesesS = new Map();
  for (const o of S) { if (!mesesS.has(o.mes)) mesesS.set(o.mes, new Set()); mesesS.get(o.mes).add(o.sym); }
  const mesesU = new Set(U.map((o) => o.mes));
  const tks = [...mesesS.values()].map((s) => s.size).sort((a, b) => a - b);
  console.log(`  meses de calendario en que dispara: ${mesesS.size} de ${mesesU.size} posibles`);
  console.log(`  tickers que disparan a la vez en un mes: mediana ${tks[Math.floor(tks.length / 2)]} · minimo ${tks[0]} · maximo ${tks[tks.length - 1]}`);
  console.log(`  → las ${num(aS.n)} operaciones son en realidad ${mesesS.size} apuestas de mercado repetidas, no ${num(aS.n)} apuestas sueltas.`);

  // 2 · concentracion por mes
  const porMes = new Map();
  for (const o of S) { if (!porMes.has(o.mes)) porMes.set(o.mes, acc()); const a = porMes.get(o.mes); a.n++; const d = APUESTA * o.ret; if (d > 0) { a.win++; a.gan += d; } else a.per += -d; }
  const gm = [...porMes.entries()].sort((a, b) => b[1].gan - a[1].gan);
  let ac = 0, c = 0;
  for (const [, v] of gm) { if (v.gan <= 0) break; ac += v.gan; c++; if (ac >= aS.gan / 2) break; }
  const porMesU = new Map();
  for (const o of U) { if (!porMesU.has(o.mes)) porMesU.set(o.mes, acc()); const a = porMesU.get(o.mes); a.n++; const d = APUESTA * o.ret; if (d > 0) { a.gan += d; } else a.per += -d; }
  const gmU = [...porMesU.entries()].sort((a, b) => b[1].gan - a[1].gan);
  let acU = 0, cU = 0;
  for (const [, v] of gmU) { if (v.gan <= 0) break; acU += v.gan; cU++; if (acU >= aU.gan / 2) break; }
  console.log(`\n  MESES para juntar la mitad del dinero ganado: senal ${c} de ${mesesS.size} · universo ${cU} de ${mesesU.size}`);
  console.log(`  los 5 mejores meses de la senal: ${gm.slice(0, 5).map(([m, v]) => `${m.slice(0, 4)}-${m.slice(4)} $${num(v.gan)}`).join(" · ")}`);
  console.log(`  ratio quitando los 3 mejores meses: ${f2(ratio(cuenta(S.filter((o) => !gm.slice(0, 3).map((x) => x[0]).includes(o.mes)))))} ` +
    `(el universo sin esos mismos 3 meses: ${f2(ratio(cuenta(U.filter((o) => !gm.slice(0, 3).map((x) => x[0]).includes(o.mes)))))})`);
  const mesesPos = gm.filter(([, v]) => ratio(v) > 1 || (v.per === 0 && v.gan > 0)).length;
  console.log(`  meses con ratio > 1: ${mesesPos} de ${mesesS.size} (${pct(mesesPos / mesesS.size)})`);

  // 3 · LA PRUEBA: dentro del MISMO mes de calendario
  let gana = 0, cuentanM = 0, nS = 0, nR = 0;
  const dentro = acc(), fuera = acc();
  for (const [mes] of porMes) {
    const s = S.filter((o) => o.mes === mes), r = R.filter((o) => o.mes === mes);
    if (s.length >= 6 && r.length >= 6) {
      cuentanM++; nS += s.length; nR += r.length;
      const as = cuenta(s), ar = cuenta(r);
      if (ratio(as) > ratio(ar) || (as.per === 0 && as.gan > 0)) gana++;
      dentro.n += as.n; dentro.win += as.win; dentro.gan += as.gan; dentro.per += as.per;
      fuera.n += ar.n; fuera.win += ar.win; fuera.gan += ar.gan; fuera.per += ar.per;
    }
  }
  console.log(`\n  LA PRUEBA — dentro del MISMO mes, la senal contra los tickers que ese mes NO elige:`);
  console.log(`    ${cuentanM} meses con 6+ operaciones a cada lado`);
  console.log(`    la senal gana en ${gana} de ${cuentanM} meses (${pct(gana / cuentanM)}) — a cara o cruz saldria 50%`);
  console.log(`    sumando esos meses: senal ${f2(ratio(dentro))} (acierta ${pct(acierto(dentro))}, n=${num(dentro.n)}) · ` +
    `descartados ${f2(ratio(fuera))} (acierta ${pct(acierto(fuera))}, n=${num(fuera.n)}) · diferencia ${((ratio(dentro) - ratio(fuera)) >= 0 ? "+" : "") + (ratio(dentro) - ratio(fuera)).toFixed(2)}`);
  console.log(`    → si esta diferencia se cae, la senal es un cronometro de mercado y las apuestas son ${mesesS.size}, no ${num(aS.n)}.`);
}
console.log("");
