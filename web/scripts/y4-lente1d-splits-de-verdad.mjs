// Y4 — LENTE 1d: ¿CUANTOS DE LOS CEROS SON UN SPLIT?
//
// En 1c separe los contratos desaparecidos en "el strike sigue en la rejilla" y "el strike se
// sale de la rejilla". Esa separacion NO vale: una opcion que no vale nada esta, por definicion,
// mas alla del ultimo strike que alguien se molesta en cotizar. Salirse de la rejilla es lo
// NORMAL para una opcion muerta, no la senal de un fallo.
//
// El fallo de verdad es otro y hay que cazarlo con su propia huella: un SPLIT mueve la rejilla
// ENTERA. El 1040 de NVDA pasa a 104 y la clave vieja deja de existir aunque la opcion valiera
// dinero. La huella es que la rejilla del dia de salida esta a otra escala que la del dia de
// entrada PARA EL MISMO VENCIMIENTO.
//
// Detector: se compara el strike del medio de la rejilla de entrada con el de la rejilla de
// salida, mismo vencimiento y mismo lado. Si la escala cambia mas de un 25% en cualquier
// direccion, hubo un ajuste de contrato. Ahi el -100% esta inventado y la operacion es un HUECO.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/y4-lente1d-splits-de-verdad.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const APUESTA = 1000;
const ASK_MIN = 0.10;
const ENVASES = { A: { dist: 0.10, dte: 60, tolDte: 17, tolK: 0.50 }, B: { dist: 0.05, dte: 90, tolDte: 25, tolK: 0.50 } };
const TRAMOS = [["f", 30, 10], ["m", 90, 22], ["b", 180, 45]];
const COCIENTES = [["30/90", "f", "m"], ["30/180", "f", "b"], ["90/180", "m", "b"]];
const MIN_ANOS_MES = 2, NB = 5, MIN_PROPIO = 12, MIN_POOL = 300;
const ESCALA = 0.25;   // cambio de escala de la rejilla que se considera ajuste de contrato

const pct = (x) => (100 * x).toFixed(1) + "%";
const num = (n) => Math.round(n).toLocaleString("en-US");
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
    const K = Number(cl.slice(0, -2)); const p = g[`${K}|P`]; if (!p) continue;
    if (!(ba[1] > 0) || !(p[1] > 0)) continue;
    const d = Math.abs(K - S);
    if (d < dm) { dm = d; mejor = { K, c: (ba[0] + ba[1]) / 2, p: (p[0] + p[1]) / 2 }; }
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
const medianaStrikes = (g, tipo) => {
  const v = [];
  for (const cl of Object.keys(g)) if (cl.slice(-1) === tipo) v.push(Number(cl.slice(0, -2)));
  if (!v.length) return null;
  v.sort((a, b) => a - b);
  return v[v.length >> 1];
};

const obs = [], ops = [];
let split = 0, ceroNormal = 0, presente = 0;
const lista = [];
for (const sym of TICKERS) {
  const ds = diasPorSim.get(sym);
  const vistos = new Set();
  for (let i = 0; i < ds.length; i++) {
    const dia = ds[i], mes = dia.slice(0, 6);
    if (vistos.has(mes)) continue;
    vistos.add(mes);
    const c = cadena(sym, dia); if (!c) continue;
    const S = spotOk(c, dia); if (!(S > 0)) continue;
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
    const dSal = ds[i + 30] ?? null; if (!dSal) continue;
    const cs = cadena(sym, dSal);
    for (const [en, env] of Object.entries(ENVASES)) {
      for (const tipo of ["C", "P"]) {
        const ct = elegir(c, S, dia, env, tipo); if (!ct) continue;
        if (dSal >= ct.exp) continue;
        if (!cs) continue;
        const g2 = cs[ct.exp]; if (!g2) continue;
        const crudo = g2[ct.clave];
        let clase = "presente";
        if (crudo === undefined) {
          const m1 = medianaStrikes(c[ct.exp], tipo), m2 = medianaStrikes(g2, tipo);
          const esc = (m1 && m2) ? m2 / m1 : 1;
          if (Math.abs(esc - 1) > ESCALA) {
            clase = "split"; split++;
            if (en === "A" && lista.length < 25) lista.push(`${sym} ${tipo} K=${ct.K} · ${dia} → ${dSal} · strike del medio pasa de ${m1} a ${m2} (x${esc.toFixed(2)})`);
          } else { clase = "ceroNormal"; ceroNormal++; }
        } else presente++;
        ops.push({ sym, dia, ano: dia.slice(0, 4), env: en, tipo, idxObs, clase, ret: ((crudo?.[0] ?? 0) - ct.ask) / ct.ask });
      }
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
        const bs = { todos: P.length >= MIN_POOL ? Math.min(NB - 1, Math.floor(rg(P, x) * NB)) : null,
                     propio: R.length >= MIN_PROPIO ? Math.min(NB - 1, Math.floor(rg(R, x) * NB)) : null, residuo: null };
        const mh = mesHist.get(`${o.sym}|${nom}|${MM}`);
        if (mh && mh.n >= MIN_ANOS_MES) {
          const r = x - mh.suma / mh.n;
          tmp.set(`${idx}|${nom}`, r);
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
        const kp = `${o.sym}|${nom}`;
        if (!propio.has(kp)) propio.set(kp, []);
        ins(propio.get(kp), x);
        const km = `${o.sym}|${nom}|${MM}`;
        if (!mesHist.has(km)) mesHist.set(km, { suma: 0, n: 0 });
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
  const a = acc(), anos = new Map();
  for (const o of ops) {
    if (o.env !== en || !filtro(o)) continue;
    const bs = B[o.idxObs]["30/180"];
    if (!bs || bs.residuo == null) continue;
    if (qs && !qs.includes(bs.residuo)) continue;
    const d = APUESTA * o.ret;
    suma(a, d);
    if (!anos.has(o.ano)) anos.set(o.ano, acc());
    suma(anos.get(o.ano), d);
  }
  return { a, anos };
}

console.log(`\n${"=".repeat(96)}`);
console.log("  SPLITS DE VERDAD — la rejilla entera cambia de escala entre la compra y la venta");
console.log(`${"=".repeat(96)}`);
console.log(`  operaciones totales (A y B) : ${num(ops.length)}`);
console.log(`  contrato presente al salir  : ${num(presente)} (${pct(presente / ops.length)})`);
console.log(`  desaparecido, rejilla IGUAL (opcion muerta, el 0 es correcto) : ${num(ceroNormal)} (${pct(ceroNormal / ops.length)})`);
console.log(`  desaparecido por AJUSTE DE CONTRATO (el -100% es inventado)   : ${num(split)} (${pct(split / ops.length)})`);
console.log(`\n  Los ajustes de contrato encontrados (envase A):`);
lista.forEach((m) => console.log(`    · ${m}`));

console.log(`\n${"=".repeat(96)}`);
console.log("  EL HALLAZGO SIN LOS SPLITS — envase A · 30/180 · residuo · montones 4+5");
console.log(`${"=".repeat(96)}`);
console.log(`  | version | senal: n | acierta | RATIO | liston justo: n | acierta | RATIO |`);
console.log(`  |---|---|---|---|---|---|---|`);
for (const [et, f] of [["tal cual", () => true], ["quitando los splits (son huecos)", (o) => o.clase !== "split"]]) {
  for (const en of ["A", "B"]) {
    const s = mide(en, [3, 4], f), u = mide(en, null, f);
    console.log(`  | ${en} · ${et} | ${num(s.a.n)} | ${pct(acierto(s.a))} | **${ratio(s.a).toFixed(2)}** | ${num(u.a.n)} | ${pct(acierto(u.a))} | ${ratio(u.a).toFixed(2)} |`);
  }
}
console.log(`\n  Ano a ano del envase A sin los splits:`);
console.log(`  | ano | senal: n | RATIO | liston justo: RATIO |`);
console.log(`  |---|---|---|---|`);
const sA = mide("A", [3, 4], (o) => o.clase !== "split"), uA = mide("A", null, (o) => o.clase !== "split");
let bajos = 0, cuentan = 0;
for (const ano of [...sA.anos.keys()].sort()) {
  const y = sA.anos.get(ano), z = uA.anos.get(ano);
  if (y.n < 20) continue;
  cuentan++; if (ratio(y) < 1) bajos++;
  console.log(`  | ${ano} | ${y.n} | **${ratio(y).toFixed(2)}** | ${ratio(z).toFixed(2)} |`);
}
console.log(`  → ${bajos} de ${cuentan} anos por debajo de 1`);
console.log("");
