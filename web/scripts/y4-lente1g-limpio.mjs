// Y4 — LENTE 1g: EL HALLAZGO CON LOS DOS DEFECTOS DE DATOS QUITADOS.
//
// La lente 1 (ventana al futuro) sale LIMPIA: los montones se pueden reproducir a mano filtrando
// "fecha estrictamente anterior" y no cambia ni uno. Pero mirando los ficheros aparecieron dos
// defectos de DATOS que no son de ventana y que hay que acotar:
//
//   (a) IDENTIDAD DEL TICKER. En unos meses de 2021-2022 el fichero de META no es Meta Platforms:
//       es la empresa de $15 que llevaba ese simbolo antes de que Facebook se lo quedara. El
//       precio deducido por paridad da 15 cuando la accion cerro a 382. Se cazan comparando el
//       precio por paridad con el fichero de cierres reales: se marca el dia si difieren mas del
//       5%. (Ese fichero de cierres solo llega hasta 2021, asi que antes no se puede comprobar.)
//
//   (b) AJUSTE DE CONTRATO. Cuando hay un split la rejilla de strikes cambia de escala entera y
//       la clave vieja desaparece del fichero de salida; el codigo lo apunta como -100%. Se
//       marcan comparando la escala de la rejilla del vencimiento entre entrada y salida.
//
// Se vuelve a medir el hallazgo (30/180, residuo, montones 4+5) quitando los dos, y se imprime
// el reparto por ticker, que es lo que dice si el dinero lo pone media docena de nombres.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/y4-lente1g-limpio.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";
const CDIR = "scripts/cache-theta/cadenas", KDIR = "scripts/cache-theta/cierres";
const APUESTA = 1000, ASK_MIN = 0.10;
const ENVASES = { A: { dist: 0.10, dte: 60, tolDte: 17, tolK: 0.50 }, B: { dist: 0.05, dte: 90, tolDte: 25, tolK: 0.50 } };
const TRAMOS = [["f", 30, 10], ["m", 90, 22], ["b", 180, 45]];
const COCIENTES = [["30/90", "f", "m"], ["30/180", "f", "b"], ["90/180", "m", "b"]];
const MIN_ANOS_MES = 2, NB = 5, MIN_PROPIO = 12, MIN_POOL = 300, ESCALA = 0.25;
const pct = (x) => (100 * x).toFixed(1) + "%";
const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
const num = (n) => Math.round(n).toLocaleString("en-US");
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const cal = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);

const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) { const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/); if (!m) continue; if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []); diasPorSim.get(m[1]).push(m[2]); }
for (const v of diasPorSim.values()) v.sort();
const TICKERS = [...diasPorSim.keys()].sort();
const CIERRES = new Map();
for (const t of TICKERS) { const f = `${KDIR}/${t}.json`; if (existsSync(f)) CIERRES.set(t, JSON.parse(readFileSync(f, "utf8"))); }

const cache = new Map();
function cadena(sym, dia) {
  const k = `${sym}|${dia}`;
  if (cache.has(k)) { const v = cache.get(k); cache.delete(k); cache.set(k, v); return v; }
  const f = `${CDIR}/${sym}_d${dia}.json`;
  let v = null;
  if (existsSync(f)) { try { v = JSON.parse(readFileSync(f, "utf8")); } catch { v = null; } }
  if (cache.size >= 100) cache.delete(cache.keys().next().value);
  cache.set(k, v); return v;
}
function spotOk(c, hoy) {
  let exp = null, md = Infinity;
  for (const e of Object.keys(c)) { const d = cal(hoy, e); if (d < 1) continue; if (d < md) { md = d; exp = e; } }
  if (!exp) return null;
  const g = c[exp]; let K = null, dm = Infinity;
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
    const K = Number(cl.slice(0, -2)); const p = g[`${K}|P`]; if (!p) continue;
    if (!(ba[1] > 0) || !(p[1] > 0)) continue;
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
    if (clave.slice(-1) !== tipo) continue;
    if (!(v[1] >= ASK_MIN)) continue;
    const k = Number(clave.slice(0, -2)); const d = Math.abs(k - objetivo);
    if (d < kd) { kd = d; K = k; ba = v; }
  }
  if (K == null) return null;
  const distReal = tipo === "C" ? K / S - 1 : 1 - K / S;
  if (Math.abs(distReal - env.dist) > env.dist * env.tolK) return null;
  return { exp, K, clave: `${K}|${tipo}`, ask: ba[1] };
}
const medStrikes = (g, tipo) => { const v = []; for (const cl of Object.keys(g)) if (cl.slice(-1) === tipo) v.push(Number(cl.slice(0, -2))); if (!v.length) return null; v.sort((a, b) => a - b); return v[v.length >> 1]; };

const obs = [], ops = [];
let idMala = 0, splits = 0, idComprobables = 0;
const idMalasLista = [];
for (const sym of TICKERS) {
  const ds = diasPorSim.get(sym); const K = CIERRES.get(sym); const vistos = new Set();
  for (let i = 0; i < ds.length; i++) {
    const dia = ds[i], mes = dia.slice(0, 6);
    if (vistos.has(mes)) continue; vistos.add(mes);
    const c = cadena(sym, dia); if (!c) continue;
    const S = spotOk(c, dia); if (!(S > 0)) continue;
    let idOk = true;
    if (K && K[dia] > 0) { idComprobables++; if (Math.abs(S / K[dia] - 1) > 0.05) { idOk = false; idMala++; if (idMalasLista.length < 12) idMalasLista.push(`${sym} ${dia}: cadena dice ${S.toFixed(2)}, el cierre real fue ${K[dia].toFixed(2)}`); } }
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
    obs.push({ sym, dia, ano: dia.slice(0, 4), coc, idOk });
    const dSal = ds[i + 30] ?? null; if (!dSal) continue;
    const cs = cadena(sym, dSal);
    for (const [en, env] of Object.entries(ENVASES)) for (const tipo of ["C", "P"]) {
      const ct = elegir(c, S, dia, env, tipo); if (!ct) continue;
      if (dSal >= ct.exp) continue;
      if (!cs) continue;
      const g2 = cs[ct.exp]; if (!g2) continue;
      const crudo = g2[ct.clave];
      let esSplit = false;
      if (crudo === undefined) {
        const m1 = medStrikes(c[ct.exp], tipo), m2 = medStrikes(g2, tipo);
        if (m1 && m2 && Math.abs(m2 / m1 - 1) > ESCALA) { esSplit = true; splits++; }
      }
      ops.push({ sym, dia, ano: dia.slice(0, 4), env: en, tipo, idxObs, idOk, esSplit, ret: ((crudo?.[0] ?? 0) - ct.ask) / ct.ask });
    }
  }
  cache.clear();
}
function asignar(l) {
  const orden = [...l.keys()].sort((a, b) => (l[a].dia < l[b].dia ? -1 : l[a].dia > l[b].dia ? 1 : (l[a].sym < l[b].sym ? -1 : 1)));
  const B = l.map(() => ({}));
  const ins = (arr, x) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; } arr.splice(lo, 0, x); };
  const rg = (arr, x) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; } return lo / arr.length; };
  const pool = new Map(), propio = new Map(), resid = new Map(), mesHist = new Map(), tmp = new Map();
  for (const [nom] of COCIENTES) pool.set(nom, []);
  let k = 0;
  while (k < orden.length) {
    const dia = l[orden[k]].dia; let j = k;
    while (j < orden.length && l[orden[j]].dia === dia) j++;
    for (let q = k; q < j; q++) {
      const idx = orden[q], o = l[idx], MM = o.dia.slice(4, 6);
      for (const [nom] of COCIENTES) {
        const x = o.coc[nom]; if (!(x > 0)) continue;
        const P = pool.get(nom), kp = `${o.sym}|${nom}`, R = propio.get(kp) ?? [];
        const bs = { todos: P.length >= MIN_POOL ? Math.min(NB - 1, Math.floor(rg(P, x) * NB)) : null, propio: R.length >= MIN_PROPIO ? Math.min(NB - 1, Math.floor(rg(R, x) * NB)) : null, residuo: null };
        const mh = mesHist.get(`${o.sym}|${nom}|${MM}`);
        if (mh && mh.n >= MIN_ANOS_MES) {
          const r = x - mh.suma / mh.n; tmp.set(`${idx}|${nom}`, r);
          const RR = resid.get(kp) ?? [];
          if (RR.length >= MIN_PROPIO) bs.residuo = Math.min(NB - 1, Math.floor(rg(RR, r) * NB));
        }
        B[idx][nom] = bs;
      }
    }
    for (let q = k; q < j; q++) {
      const idx = orden[q], o = l[idx], MM = o.dia.slice(4, 6);
      for (const [nom] of COCIENTES) {
        const x = o.coc[nom]; if (!(x > 0)) continue;
        ins(pool.get(nom), x);
        const kp = `${o.sym}|${nom}`; if (!propio.has(kp)) propio.set(kp, []); ins(propio.get(kp), x);
        const km = `${o.sym}|${nom}|${MM}`; if (!mesHist.has(km)) mesHist.set(km, { suma: 0, n: 0 });
        const mh = mesHist.get(km); mh.suma += x; mh.n++;
        const r = tmp.get(`${idx}|${nom}`);
        if (r !== undefined) { if (!resid.has(kp)) resid.set(kp, []); ins(resid.get(kp), r); }
      }
    }
    k = j;
  }
  return B;
}
const B = asignar(obs);
const acc = () => ({ n: 0, win: 0, gan: 0, per: 0 });
const suma = (a, d) => { a.n++; if (d > 0) { a.win++; a.gan += d; } else a.per += -d; };
const ratio = (a) => (a.per > 0 ? a.gan / a.per : NaN);
const acierto = (a) => (a.n ? a.win / a.n : NaN);
function mide(en, qs, filtro) {
  const a = acc(), anos = new Map(), tks = new Map();
  for (const o of ops) {
    if (o.env !== en || !filtro(o)) continue;
    const bs = B[o.idxObs]["30/180"]; if (!bs || bs.residuo == null) continue;
    if (qs && !qs.includes(bs.residuo)) continue;
    const d = APUESTA * o.ret;
    suma(a, d);
    if (!anos.has(o.ano)) anos.set(o.ano, acc()); suma(anos.get(o.ano), d);
    if (!tks.has(o.sym)) tks.set(o.sym, acc()); suma(tks.get(o.sym), d);
  }
  return { a, anos, tks };
}
console.log(`\n${"=".repeat(96)}`);
console.log("  LOS DOS DEFECTOS DE DATOS, ACOTADOS");
console.log(`${"=".repeat(96)}`);
console.log(`  dias de entrada que se pueden contrastar con el fichero de cierres: ${num(idComprobables)}`);
console.log(`  dias en que la cadena NO es la empresa que dice ser (>5% de diferencia): ${num(idMala)}`);
idMalasLista.forEach((m) => console.log(`    · ${m}`));
console.log(`  operaciones marcadas por ajuste de contrato (split): ${num(splits)} de ${num(ops.length)} (${pct(splits / ops.length)})`);

console.log(`\n${"=".repeat(96)}`);
console.log("  EL HALLAZGO, LIMPIO — envase A y B · 30/180 · residuo · montones 4+5");
console.log(`${"=".repeat(96)}`);
console.log(`  | version | envase | senal: n | acierta | RATIO | liston justo: n | acierta | RATIO |`);
console.log(`  |---|---|---|---|---|---|---|---|`);
const casos = [["tal cual", () => true], ["sin identidad mala ni splits", (o) => o.idOk && !o.esSplit]];
for (const [et, f] of casos) for (const en of ["A", "B"]) {
  const s = mide(en, [3, 4], f), u = mide(en, null, f);
  console.log(`  | ${et} | ${en} | ${num(s.a.n)} | ${pct(acierto(s.a))} | **${ratio(s.a).toFixed(2)}** | ${num(u.a.n)} | ${pct(acierto(u.a))} | ${ratio(u.a).toFixed(2)} |`);
}
const limpio = (o) => o.idOk && !o.esSplit;
const sA = mide("A", [3, 4], limpio), uA = mide("A", null, limpio);
console.log(`\n  Ano a ano del envase A limpio:`);
console.log(`  | ano | senal: n | acierta | RATIO | liston justo: RATIO |`);
console.log(`  |---|---|---|---|---|`);
let bajos = 0, cuentan = 0;
for (const ano of [...sA.anos.keys()].sort()) {
  const y = sA.anos.get(ano), z = uA.anos.get(ano);
  if (y.n < 20) continue;
  cuentan++; if (ratio(y) < 1) bajos++;
  console.log(`  | ${ano} | ${y.n} | ${pct(acierto(y))} | **${ratio(y).toFixed(2)}** | ${ratio(z).toFixed(2)} |`);
}
console.log(`  → ${bajos} de ${cuentan} anos por debajo de 1 (el liston justo, sobre los mismos dias: ${[...uA.anos.values()].filter((y) => y.n >= 20 && ratio(y) < 1).length} de ${[...uA.anos.values()].filter((y) => y.n >= 20).length})`);

const lista = [...sA.tks.entries()].map(([t, v]) => ({ t, v, r: ratio(v) })).sort((a, b) => b.v.gan - a.v.gan);
let ac = 0, cuantos = 0;
for (const x of lista) { if (x.v.gan <= 0) break; ac += x.v.gan; cuantos++; if (ac >= sA.a.gan / 2) break; }
console.log(`\n  Por ticker (envase A limpio): ${lista.length} tickers · ${lista.filter((x) => x.r > 1).length} con ratio mayor que 1`);
console.log(`  hacen falta ${cuantos} tickers para juntar la mitad del dinero ganado`);
console.log(`  los 6 que mas ponen: ${lista.slice(0, 6).map((x) => `${x.t} ${usd(x.v.gan)} (${x.r.toFixed(2)})`).join(" · ")}`);
console.log(`  ratio quitando el que mas pone (${lista[0].t}): ${((sA.a.gan - lista[0].v.gan) / (sA.a.per - lista[0].v.per)).toFixed(2)}`);
{
  const s = acc();
  for (const o of ops) { if (o.env !== "A" || !limpio(o)) continue; const bs = B[o.idxObs]["30/180"]; if (!bs || bs.residuo == null || ![3, 4].includes(bs.residuo)) continue; const ym = o.dia.slice(0, 6); if (ym >= "202002" && ym <= "202005") continue; suma(s, APUESTA * o.ret); }
  const u = acc();
  for (const o of ops) { if (o.env !== "A" || !limpio(o)) continue; const bs = B[o.idxObs]["30/180"]; if (!bs || bs.residuo == null) continue; const ym = o.dia.slice(0, 6); if (ym >= "202002" && ym <= "202005") continue; suma(u, APUESTA * o.ret); }
  console.log(`\n  quitando febrero-mayo de 2020: senal ${ratio(s).toFixed(2)} (n=${num(s.n)}, acierta ${pct(acierto(s))}) · liston justo ${ratio(u).toFixed(2)} (acierta ${pct(acierto(u))})`);
}
console.log("");
