// L3c — ¿LA CURVA MIDE VOLATILIDAD O MIDE QUÉ VENCIMIENTOS HABÍA LISTADOS ESE DÍA?
//
// ═══ LA SOSPECHA ════════════════════════════════════════════════════════════════════════════
// La señal divide dos "cuñas" (call+put al dinero) normalizadas por la raíz del plazo. Pero el
// vencimiento de 30 días se coge con una tolerancia de +/- 10 días y el de 180 con +/- 45. O sea
// que el "frente" puede ser de 20 o de 40 días y el "fondo" de 135 o de 225 — y eso lo decide la
// REJILLA DE VENCIMIENTOS LISTADOS, no el mercado. Si el cociente sube porque ese día el fondo
// disponible estaba más cerca (o el frente más lejos) y no porque la volatilidad se haya movido,
// la señal es un artefacto del calendario de listados.
//
// Además la "cuña al dinero" se coge con el strike más cercano al precio, y se permite hasta un
// 5% de distancia. Si en el montón ganador el strike está sistemáticamente más lejos del dinero,
// la cuña está contaminada y el cociente también.
//
// ═══ QUÉ SE MIDE ════════════════════════════════════════════════════════════════════════════
//   1. Plazo real del frente y del fondo, y distancia real del strike al dinero, MONTÓN A MONTÓN.
//   2. La misma señal con la rejilla APRETADA: frente 30 +/- 5, fondo 180 +/- 15, y el strike al
//      dinero a menos del 2%. Si el efecto era la rejilla, aquí se apaga.
//   3. La misma señal con el fondo cambiado a 90 días (que tiene rejilla mucho más densa).
//   4. Cuánto se mueve el cociente por culpa del plazo: se mira si el cociente se puede predecir
//      sólo con los dos plazos reales del día.
//
// PUERTAS: aquí se abren 3 variantes nuevas de la señal (rejilla apretada, fondo a 90, y las dos
// juntas). Se declaran: son 3 puertas, y se reportan las tres salgan como salgan.
//
// Reglas de la casa: compra al ASK, venta al BID, ningún modelo, hueco != cero, sólo el pasado,
// spot por paridad sólo en el vencimiento más cercano.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/l3c-curva-rejilla-vencimientos.mjs

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const APUESTA = 1000, ASK_MIN = 0.10;
const ENV_A = { dist: 0.10, dte: 60, tolDte: 17, tolK: 0.50 };
const ENV_B = { dist: 0.05, dte: 90, tolDte: 25, tolK: 0.50 };
const NB = 5, MIN_ANOS_MES = 2, MIN_PROPIO = 12, QS = [3, 4];

// Las variantes de la curva que se prueban. tolATM = cuánto se le permite al strike apartarse
// del dinero para leer la cuña.
const VARIANTES = [
  { id: "original", f: [30, 10], b: [180, 45], tolATM: 0.05, nom: "ORIGINAL (frente 30±10, fondo 180±45, strike al 5%)" },
  { id: "apretada", f: [30, 5], b: [180, 15], tolATM: 0.02, nom: "REJILLA APRETADA (frente 30±5, fondo 180±15, strike al 2%)" },
  { id: "fondo90", f: [30, 10], b: [90, 22], tolATM: 0.05, nom: "FONDO A 90 DÍAS (rejilla más densa)" },
  { id: "apret90", f: [30, 5], b: [90, 10], tolATM: 0.02, nom: "FONDO A 90 + REJILLA APRETADA" },
];

const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) + "%" : "—");
const num = (n) => Math.round(n).toLocaleString("en-US");
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "—");
const media = (v) => (v.length ? v.reduce((x, y) => x + y, 0) / v.length : NaN);
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
/** cuña normalizada + cuánto se apartó el strike del dinero */
function sigmaDe(g, S, dte, tolATM) {
  let mej = null, dm = Infinity;
  for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== "C") continue;
    const K = Number(cl.slice(0, -2)); const p = g[`${K}|P`];
    if (!p || !(ba[1] > 0) || !(p[1] > 0)) continue;
    const d = Math.abs(K - S);
    if (d < dm) { dm = d; mej = { c: (ba[0] + ba[1]) / 2, p: (p[0] + p[1]) / 2 }; }
  }
  if (!mej || dm > S * tolATM) return null;
  const cuna = mej.c + mej.p;
  if (!(cuna > 0)) return null;
  return { s: (cuna / S) / Math.sqrt(dte / 365), off: dm / S };
}
function tramo(c, dia, obj, tol) {
  let exp = null, dd = Infinity;
  for (const e of Object.keys(c)) { const d = cal(dia, e); if (d < 1) continue; const x = Math.abs(d - obj); if (x < dd) { dd = x; exp = e; } }
  if (!exp || dd > tol) return null;
  return { exp, dte: cal(dia, exp) };
}
function elegir(c, S, hoy, env, tipo) {
  let exp = null, dd = Infinity;
  for (const e of Object.keys(c)) { const d = cal(hoy, e); if (d < 1) continue; const x = Math.abs(d - env.dte); if (x < dd) { dd = x; exp = e; } }
  if (!exp || dd > env.tolDte) return null;
  const obj = tipo === "C" ? S * (1 + env.dist) : S * (1 - env.dist);
  let K = null, ba = null, kd = Infinity;
  for (const [clave, v] of Object.entries(c[exp])) {
    if (clave.slice(-1) !== tipo || !(v[1] >= ASK_MIN)) continue;
    const k = Number(clave.slice(0, -2)); const d = Math.abs(k - obj);
    if (d < kd) { kd = d; K = k; ba = v; }
  }
  if (K == null) return null;
  const dr = tipo === "C" ? K / S - 1 : 1 - K / S;
  if (Math.abs(dr - env.dist) > env.dist * env.tolK) return null;
  return { exp, clave: `${K}|${tipo}`, bid: ba[0], ask: ba[1] };
}

// ── PASADA 1 ─────────────────────────────────────────────────────────────────
const obs = [], ops = [];
for (const sym of TICKERS) {
  const ds = diasPorSim.get(sym);
  const vistos = new Set();
  for (let i = 0; i < ds.length; i++) {
    const dia = ds[i], mes = dia.slice(0, 6);
    if (vistos.has(mes)) continue;
    vistos.add(mes);
    const c = cadena(sym, dia);
    if (!c) continue;
    const S = spotOk(c, dia);
    if (!(S > 0)) continue;
    const o = { sym, dia, mes, ano: dia.slice(0, 4), v: {}, meta: {} };
    for (const V of VARIANTES) {
      const tf = tramo(c, dia, V.f[0], V.f[1]), tb = tramo(c, dia, V.b[0], V.b[1]);
      if (!tf || !tb) continue;
      const sf = sigmaDe(c[tf.exp], S, tf.dte, V.tolATM), sb = sigmaDe(c[tb.exp], S, tb.dte, V.tolATM);
      if (!sf || !sb) continue;
      o.v[V.id] = sf.s / sb.s;
      o.meta[V.id] = { dtef: tf.dte, dteb: tb.dte, offf: sf.off, offb: sb.off };
    }
    if (!Object.keys(o.v).length) continue;
    const idxObs = obs.length;
    obs.push(o);
    const dSal = ds[i + 30] ?? null;
    if (!dSal) continue;
    const cs = cadena(sym, dSal);
    for (const [en, env] of [["A", ENV_A], ["B", ENV_B]]) for (const tipo of ["C", "P"]) {
      const ct = elegir(c, S, dia, env, tipo);
      if (!ct || dSal >= ct.exp) continue;
      if (!cs || !cs[ct.exp]) continue;                    // hueco: se descarta
      const bid = cs[ct.exp][ct.clave]?.[0] ?? 0;
      ops.push({ sym, dia, mes, ano: dia.slice(0, 4), env: en, tipo, idxObs, ret: (bid - ct.ask) / ct.ask });
    }
  }
  cache.clear();
}

// ── PASADA 2: montones para cada variante ────────────────────────────────────
const orden = [...obs.keys()].sort((a, b) => (obs[a].dia < obs[b].dia ? -1 : obs[a].dia > obs[b].dia ? 1 : (obs[a].sym < obs[b].sym ? -1 : 1)));
const mesHist = new Map(), resid = new Map();
function insertar(a, x) { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; } a.splice(lo, 0, x); }
function rango(a, x) { let lo = 0, hi = a.length; while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; } return lo / a.length; }
for (const o of obs) { o.b = {}; o.res = {}; }
let k = 0;
while (k < orden.length) {
  const dia = obs[orden[k]].dia;
  let j = k; while (j < orden.length && obs[orden[j]].dia === dia) j++;
  for (let q = k; q < j; q++) {
    const o = obs[orden[q]], MM = o.dia.slice(4, 6);
    for (const V of VARIANTES) {
      const x = o.v[V.id];
      if (!Number.isFinite(x)) continue;
      const mh = mesHist.get(`${o.sym}|${V.id}|${MM}`);
      if (!mh || mh.n < MIN_ANOS_MES) continue;
      o.res[V.id] = x - mh.suma / mh.n;
      const RR = resid.get(`${o.sym}|${V.id}`);
      if (RR && RR.length >= MIN_PROPIO) o.b[V.id] = Math.min(NB - 1, Math.floor(rango(RR, o.res[V.id]) * NB));
    }
  }
  for (let q = k; q < j; q++) {
    const o = obs[orden[q]], MM = o.dia.slice(4, 6);
    for (const V of VARIANTES) {
      const x = o.v[V.id];
      if (!Number.isFinite(x)) continue;
      const km = `${o.sym}|${V.id}|${MM}`;
      if (!mesHist.has(km)) mesHist.set(km, { suma: 0, n: 0 });
      const mh = mesHist.get(km); mh.suma += x; mh.n++;
      if (o.res[V.id] !== undefined) { const kp = `${o.sym}|${V.id}`; if (!resid.has(kp)) resid.set(kp, []); insertar(resid.get(kp), o.res[V.id]); }
    }
  }
  k = j;
}

const acc = () => ({ n: 0, win: 0, gan: 0, per: 0 });
const suma = (a, d) => { a.n++; if (d > 0) { a.win++; a.gan += d; } else a.per += -d; };
const ratio = (a) => (a.per > 0 ? a.gan / a.per : (a.gan > 0 ? Infinity : NaN));
const acierto = (a) => (a.n ? a.win / a.n : NaN);

console.log(`\n  observaciones ${num(obs.length)} · operaciones ${num(ops.length)}`);

// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"=".repeat(100)}`);
console.log("  1. QUÉ VENCIMIENTOS Y QUÉ STRIKE LE TOCAN A CADA MONTÓN (variante ORIGINAL)");
console.log(`${"=".repeat(100)}`);
console.log(`  | montón | obs | plazo real del FRENTE | plazo real del FONDO | strike lejos del dinero: frente | fondo |`);
console.log(`  |---|---|---|---|---|---|`);
for (let q = 0; q < NB; q++) {
  const l = obs.filter((o) => o.b.original === q);
  if (!l.length) continue;
  const m = l.map((o) => o.meta.original);
  console.log(`  | ${q + 1} | ${num(l.length).padStart(4)} | ${media(m.map((x) => x.dtef)).toFixed(1)} | ${media(m.map((x) => x.dteb)).toFixed(1)} | ${pct(media(m.map((x) => x.offf)))} | ${pct(media(m.map((x) => x.offb)))} |`);
}
{
  const l = obs.filter((o) => o.b.original != null).map((o) => o.meta.original);
  console.log(`  | TODOS | ${num(l.length).padStart(4)} | ${media(l.map((x) => x.dtef)).toFixed(1)} | ${media(l.map((x) => x.dteb)).toFixed(1)} | ${pct(media(l.map((x) => x.offf)))} | ${pct(media(l.map((x) => x.offb)))} |`);
}

// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"=".repeat(100)}`);
console.log("  2. LAS CUATRO VARIANTES — si el efecto era la rejilla, con la rejilla apretada se apaga");
console.log(`${"=".repeat(100)}`);
console.log(`  | variante | obs con montón | envase A: n | acierta | RATIO | listón (mismos días) | envase B: RATIO |`);
console.log(`  |---|---|---|---|---|---|---|`);
const salida = {};
for (const V of VARIANTES) {
  const s = acc(), u = acc(), sB = acc();
  for (const o of ops) {
    const q = obs[o.idxObs].b[V.id];
    if (q == null) continue;
    const d = APUESTA * o.ret;
    if (o.env === "A") { suma(u, d); if (QS.includes(q)) suma(s, d); }
    else if (QS.includes(q)) suma(sB, d);
  }
  const cuantas = obs.filter((o) => o.b[V.id] != null).length;
  salida[V.id] = { n: s.n, acierto: acierto(s), ratio: ratio(s), liston: ratio(u), rB: ratio(sB) };
  console.log(`  | ${V.nom.padEnd(56)} | ${num(cuantas).padStart(5)} | ${num(s.n).padStart(5)} | ${pct(acierto(s)).padStart(6)} | **${f2(ratio(s))}** | ${f2(ratio(u))} | ${f2(ratio(sB))} |`);
}

// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"=".repeat(100)}`);
console.log("  3. ¿CUÁNTO DEL COCIENTE LO PONE EL PLAZO Y NO LA VOLATILIDAD?");
console.log(`${"=".repeat(100)}`);
{
  // el cociente medio agrupado por el plazo real del fondo (variante original)
  const grupos = new Map();
  for (const o of obs) {
    if (!Number.isFinite(o.v.original)) continue;
    const b = Math.round(o.meta.original.dteb / 15) * 15;
    if (!grupos.has(b)) grupos.set(b, []);
    grupos.get(b).push(o.v.original);
  }
  console.log(`  cociente medio según el plazo REAL del fondo (si el plazo no importara, saldría plano):`);
  console.log(`  | plazo del fondo (días) | obs | cociente medio |`);
  console.log(`  |---|---|---|`);
  for (const b of [...grupos.keys()].sort((a, c) => a - c)) {
    const v = grupos.get(b);
    if (v.length < 30) continue;
    console.log(`  | ${b} | ${num(v.length)} | ${media(v).toFixed(3)} |`);
  }
  const g2 = new Map();
  for (const o of obs) {
    if (!Number.isFinite(o.v.original)) continue;
    const b = Math.round(o.meta.original.dtef / 5) * 5;
    if (!g2.has(b)) g2.set(b, []);
    g2.get(b).push(o.v.original);
  }
  console.log(`  cociente medio según el plazo REAL del frente:`);
  console.log(`  | plazo del frente (días) | obs | cociente medio |`);
  console.log(`  |---|---|---|`);
  for (const b of [...g2.keys()].sort((a, c) => a - c)) {
    const v = g2.get(b);
    if (v.length < 30) continue;
    console.log(`  | ${b} | ${num(v.length)} | ${media(v).toFixed(3)} |`);
  }
}
// ¿el montón ganador se explica por el plazo? montón medio de cada tramo de plazo
{
  console.log(`\n  Y al revés: qué fracción de cada tramo de plazo del fondo acaba en el 40% de arriba`);
  console.log(`  (si fuera plano, sería 40% en todos):`);
  const g = new Map();
  for (const o of obs) {
    if (o.b.original == null) continue;
    const b = Math.round(o.meta.original.dteb / 15) * 15;
    if (!g.has(b)) g.set(b, { n: 0, dis: 0 });
    const x = g.get(b); x.n++; if (QS.includes(o.b.original)) x.dis++;
  }
  console.log(`  | plazo del fondo | obs | fracción que dispara |`);
  console.log(`  |---|---|---|`);
  for (const b of [...g.keys()].sort((a, c) => a - c)) { const x = g.get(b); if (x.n < 30) continue; console.log(`  | ${b} | ${num(x.n)} | ${pct(x.dis / x.n)} |`); }
}
console.log(`\n${"=".repeat(100)}\n`);
writeFileSync("scripts/l3c-curva-rejilla-vencimientos.json", JSON.stringify(salida, null, 1), "utf8");
console.log("escrito scripts/l3c-curva-rejilla-vencimientos.json");
