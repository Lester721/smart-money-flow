// L3b — DESMONTAJE DE LA CURVA DEL TICKER: ¿de dónde sale de verdad el 1.45?
//
// ═══ POR QUÉ ESTE SEGUNDO PASE ══════════════════════════════════════════════════════════════
// En el primer pase (l3-curva-ticker-lente3.mjs) apareció algo que el hallazgo original no midió:
// el envase entra UNA VEZ AL MES POR TICKER y, como todos los tickers tienen cadena los mismos
// días, esa entrada cae CASI SIEMPRE EN EL MISMO DÍA para los 40 tickers. O sea que las 1,514
// operaciones de la señal no son 1,514 apuestas repartidas: son ~85 MESES, y dentro de cada mes
// varios tickers que se mueven juntos.
//
// Eso parte la pregunta en dos, y hay que medirlas por separado:
//   (1) ¿la señal elige BIEN LOS MESES? (dispara más veces en unos meses que en otros)
//   (2) ¿la señal elige BIEN LOS TICKERS dentro de cada mes?
// El barajado que CONSERVA el reparto por meses y sólo rompe la elección de ticker separa las dos.
//
// Y encima hay que repetirlo TODO quitando febrero-mayo de 2020, porque un solo mes (febrero de
// 2020) se lleva una parte enorme del dinero ganado.
//
// ═══ QUÉ SE IMPRIME ═════════════════════════════════════════════════════════════════════════
//   A. El dinero: total ganado/perdido, el mes más grande, el billete más grande.
//   B. La descomposición: listón → barajado que conserva los meses → señal de verdad.
//   C. Los DOS barajados (20 tiradas cada uno) repetidos en cuatro trozos: todo, sin feb-may 2020,
//      2019-2021 y 2022-2026.
//   D. Año a año, la señal contra la NUBE de sus 20 barajados de ese mismo año (no contra 1.00).
//   E. ¿Los meses con muchos disparos son meses buenos para el envase ENTERO? (si sí, la mitad de
//      la señal es una alarma de mercado, no una elección de ticker).
//   F. Calls y puts del envase entero en toda la historia, para saber contra qué se compara.
//
// Reglas de la casa: compra al ASK, venta al BID, ningún modelo, un hueco no es un cero, ventanas
// que terminan el día ANTERIOR, spot por paridad sólo en el vencimiento más cercano.
// Generador reproducible (xorshift con semilla fija): nada de Math.random.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/l3b-curva-ticker-desmontaje.mjs

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const APUESTA = 1000;
const ASK_MIN = 0.10;
const ENV_A = { dist: 0.10, dte: 60, tolDte: 17, tolK: 0.50 };
const ENV_B = { dist: 0.05, dte: 90, tolDte: 25, tolK: 0.50 };
const ENVASES = { A: ENV_A, B: ENV_B };
const TRAMOS = [["f", 30, 10], ["b", 180, 45]];
const NB = 5, MIN_ANOS_MES = 2, MIN_PROPIO = 12, QS = [3, 4];

const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) + "%" : "—");
const usd = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
const num = (n) => Math.round(n).toLocaleString("en-US");
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "—");
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const cal = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const media = (v) => (v.length ? v.reduce((x, y) => x + y, 0) / v.length : NaN);
function rng(s0) { let s = s0 >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

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
  let mej = null, dm = Infinity;
  for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== "C") continue;
    const K = Number(cl.slice(0, -2)); const p = g[`${K}|P`];
    if (!p || !(ba[1] > 0) || !(p[1] > 0)) continue;
    const d = Math.abs(K - S);
    if (d < dm) { dm = d; mej = { c: (ba[0] + ba[1]) / 2, p: (p[0] + p[1]) / 2 }; }
  }
  if (!mej || dm > S * 0.05) return null;
  const cuna = mej.c + mej.p;
  return cuna > 0 ? (cuna / S) / Math.sqrt(dte / 365) : null;
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
let huecos = 0;
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
    obs.push({ sym, dia, ano: dia.slice(0, 4), mes, curva: sig.f / sig.b });
    const dSal = ds[i + 30] ?? null;
    if (!dSal) continue;
    const cs = cadena(sym, dSal);
    for (const [en, env] of Object.entries(ENVASES)) for (const tipo of ["C", "P"]) {
      const ct = elegir(c, S, dia, env, tipo);
      if (!ct) continue;
      if (dSal >= ct.exp) continue;
      if (!cs || !cs[ct.exp]) { huecos++; continue; }
      const bid = cs[ct.exp][ct.clave]?.[0] ?? 0;
      ops.push({ sym, dia, mes, ano: dia.slice(0, 4), env: en, tipo, idxObs, ret: (bid - ct.ask) / ct.ask });
    }
  }
  cache.clear();
}

// ── PASADA 2: montones (residuo de mes + escalera del propio ticker, sólo pasado) ──
const orden = [...obs.keys()].sort((a, b) => (obs[a].dia < obs[b].dia ? -1 : obs[a].dia > obs[b].dia ? 1 : (obs[a].sym < obs[b].sym ? -1 : 1)));
const mesHist = new Map(), resid = new Map();
function insertar(arr, x) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; } arr.splice(lo, 0, x); }
function rango(arr, x) { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; } return lo / arr.length; }
let k = 0;
while (k < orden.length) {
  const dia = obs[orden[k]].dia;
  let j = k; while (j < orden.length && obs[orden[j]].dia === dia) j++;
  for (let q = k; q < j; q++) {
    const o = obs[orden[q]], MM = o.dia.slice(4, 6);
    const mh = mesHist.get(`${o.sym}|${MM}`);
    if (!mh || mh.n < MIN_ANOS_MES) continue;
    o.res = o.curva - mh.suma / mh.n;
    const RR = resid.get(o.sym);
    if (RR && RR.length >= MIN_PROPIO) o.q = Math.min(NB - 1, Math.floor(rango(RR, o.res) * NB));
  }
  for (let q = k; q < j; q++) {
    const o = obs[orden[q]], MM = o.dia.slice(4, 6), km = `${o.sym}|${MM}`;
    if (!mesHist.has(km)) mesHist.set(km, { suma: 0, n: 0 });
    const mh = mesHist.get(km); mh.suma += o.curva; mh.n++;
    if (o.res !== undefined) { if (!resid.has(o.sym)) resid.set(o.sym, []); insertar(resid.get(o.sym), o.res); }
  }
  k = j;
}

// ── contadores ───────────────────────────────────────────────────────────────
const acc = () => ({ n: 0, win: 0, gan: 0, per: 0 });
const suma = (a, d) => { a.n++; if (d > 0) { a.win++; a.gan += d; } else a.per += -d; };
const ratio = (a) => (a.per > 0 ? a.gan / a.per : (a.gan > 0 ? Infinity : NaN));
const acierto = (a) => (a.n ? a.win / a.n : NaN);

const SIN2020 = (o) => !(o.mes >= "202002" && o.mes <= "202005");
const TROZOS = [
  ["TODO (2019-2026)", () => true],
  ["sin feb-may 2020", SIN2020],
  ["2019-2021", (o) => o.ano <= "2021"],
  ["2022-2026", (o) => o.ano >= "2022"],
];

function medir(en, filtro, qmap) {
  const a = acc();
  for (const o of ops) {
    if (o.env !== en || !filtro(o)) continue;
    const q = qmap ? qmap(o) : obs[o.idxObs].q;
    if (q == null || !QS.includes(q)) continue;
    suma(a, APUESTA * o.ret);
  }
  return a;
}
function universo(en, filtro) {
  const a = acc();
  for (const o of ops) { if (o.env !== en || !filtro(o)) continue; if (obs[o.idxObs].q == null) continue; suma(a, APUESTA * o.ret); }
  return a;
}

console.log(`\n  ops ${num(ops.length)} · observaciones ${num(obs.length)} · huecos descartados ${num(huecos)}`);
const real = medir("A", () => true);
console.log(`  REPRODUCCIÓN: envase A · n=${num(real.n)} · acierta ${pct(acierto(real))} · RATIO ${f2(ratio(real))}   [hallazgo: 1,514 / 22.3% / 1.45]`);

// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"=".repeat(100)}`);
console.log("  A. EL DINERO — de dónde sale");
console.log(`${"=".repeat(100)}`);
{
  const porMes = new Map(); let mayor = null;
  for (const o of ops) {
    if (o.env !== "A") continue;
    const q = obs[o.idxObs].q; if (q == null || !QS.includes(q)) continue;
    const d = APUESTA * o.ret;
    if (!porMes.has(o.mes)) porMes.set(o.mes, acc());
    suma(porMes.get(o.mes), d);
    if (!mayor || d > mayor.d) mayor = { d, sym: o.sym, dia: o.dia, tipo: o.tipo };
  }
  console.log(`  gana ${usd(real.gan)} · pierde ${usd(real.per)} · neto ${usd(real.gan - real.per)} · RATIO ${f2(ratio(real))}`);
  console.log(`  billete más grande: ${usd(mayor.d)} (${mayor.sym} ${mayor.tipo}, entrada ${mayor.dia}) = ${pct(mayor.d / real.gan)} de TODO lo ganado`);
  const l = [...porMes.entries()].sort((a, b) => b[1].gan - a[1].gan);
  console.log(`  meses con disparos: ${num(porMes.size)}`);
  console.log(`  los 5 meses que más aportan: ${l.slice(0, 5).map(([m, v]) => `${m} ${usd(v.gan)}`).join(" · ")}`);
  console.log(`  febrero de 2020 solo: ${usd((porMes.get("202002") ?? acc()).gan)} = ${pct((porMes.get("202002")?.gan ?? 0) / real.gan)} de todo lo ganado`);
  let ac = 0, c = 0;
  for (const [, v] of l) { ac += v.gan; c++; if (ac >= real.gan / 2) break; }
  console.log(`  ${c} meses de ${num(porMes.size)} juntan la mitad del dinero ganado`);
  const sinMayor = { gan: real.gan - mayor.d, per: real.per };
  console.log(`  RATIO quitando ese único billete: ${f2(sinMayor.gan / sinMayor.per)}`);
}

// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"=".repeat(100)}`);
console.log("  B/C. LOS DOS BARAJADOS, 20 TIRADAS CADA UNO, EN CUATRO TROZOS");
console.log(`${"=".repeat(100)}`);
console.log(`  (a) DESPLAZAR N meses dentro del propio ticker = rompe la señal ENTERA (meses y ticker)`);
console.log(`  (b) PERMUTAR dentro del MISMO DÍA = conserva EXACTAMENTE en qué meses se dispara y`);
console.log(`      cuántas veces, y rompe SÓLO a qué ticker le tocaba. Separa las dos mitades.`);

const porTicker = new Map();
for (const idx of orden) { const o = obs[idx]; if (!porTicker.has(o.sym)) porTicker.set(o.sym, []); porTicker.get(o.sym).push(idx); }
const bDespl = new Map();
for (const lista of porTicker.values()) for (let i = 0; i < lista.length; i++) for (let d = 1; d <= 20; d++)
  bDespl.set(`${lista[i]}|${d}`, i - d >= 0 ? (obs[lista[i - d]].q ?? null) : null);

const porDia = new Map();
for (const idx of orden) { const o = obs[idx]; if (o.q == null) continue; if (!porDia.has(o.dia)) porDia.set(o.dia, []); porDia.get(o.dia).push(idx); }
const mapasPerm = [];
for (let s = 0; s < 20; s++) {
  const r = rng(1000 + s * 7919), mapa = new Map();
  for (const [, idxs] of porDia) {
    const qs = idxs.map((i) => obs[i].q);
    for (let i = qs.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [qs[i], qs[j]] = [qs[j], qs[i]]; }
    idxs.forEach((idx, i) => mapa.set(idx, qs[i]));
  }
  mapasPerm.push(mapa);
}

const resumen = {};
console.log(`\n  | trozo | señal | listón (envase vacío, mismos días) | barajado (a): mediana [min-max] | ¿cuántas de 20 llegan? | barajado (b): mediana [min-max] | ¿cuántas de 20 llegan? |`);
console.log(`  |---|---|---|---|---|---|---|`);
for (const [nom, filtro] of TROZOS) {
  const R = ratio(medir("A", filtro));
  const U = ratio(universo("A", filtro));
  const va = [];
  for (let d = 1; d <= 20; d++) va.push(ratio(medir("A", filtro, (o) => bDespl.get(`${o.idxObs}|${d}`))));
  const vb = mapasPerm.map((mapa) => ratio(medir("A", filtro, (o) => mapa.get(o.idxObs))));
  const ord = (v) => v.filter(Number.isFinite).sort((x, y) => x - y);
  const A = ord(va), B = ord(vb);
  const ga = A.filter((x) => x >= R).length, gb = B.filter((x) => x >= R).length;
  resumen[nom] = { real: R, liston: U, a: { med: A[10], min: A[0], max: A[A.length - 1], gana: ga }, b: { med: B[10], min: B[0], max: B[B.length - 1], gana: gb } };
  console.log(`  | ${nom.padEnd(18)} | **${f2(R)}** | ${f2(U)} | ${f2(A[10])} [${f2(A[0])}–${f2(A[A.length - 1])}] | ${ga} | ${f2(B[10])} [${f2(B[0])}–${f2(B[B.length - 1])}] | ${gb} |`);
}
console.log(`\n  LECTURA: la distancia listón → barajado (b) es la parte que pone ELEGIR LOS MESES.`);
console.log(`           La distancia barajado (b) → señal es la parte que pone ELEGIR EL TICKER.`);

// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"=".repeat(100)}`);
console.log("  D. AÑO A AÑO — la señal contra la NUBE de sus 20 barajados de ESE MISMO año");
console.log(`${"=".repeat(100)}`);
console.log(`  (el hallazgo compara cada año contra 1.00; el listón honesto es lo que da el barajado)`);
console.log(`  | año | n | señal | listón | barajado (b): mediana [min-max] | ¿cuántas de 20 llegan a la señal? |`);
console.log(`  |---|---|---|---|---|---|`);
const ANOS = [...new Set(ops.map((o) => o.ano))].sort();
const porAno = {};
for (const a of ANOS) {
  const fl = (o) => o.ano === a;
  const s = medir("A", fl);
  if (s.n < 20) continue;
  const U = ratio(universo("A", fl));
  const B = mapasPerm.map((mp) => ratio(medir("A", fl, (o) => mp.get(o.idxObs)))).filter(Number.isFinite).sort((x, y) => x - y);
  const g = B.filter((x) => x >= ratio(s)).length;
  porAno[a] = { n: s.n, real: ratio(s), liston: U, med: B[10], min: B[0], max: B[B.length - 1], gana: g };
  console.log(`  | ${a} | ${s.n} | **${f2(ratio(s))}** | ${f2(U)} | ${f2(B[10])} [${f2(B[0])}–${f2(B[B.length - 1])}] | ${g} |`);
}

// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"=".repeat(100)}`);
console.log("  E. ¿ES UNA ALARMA DE MERCADO? — meses con muchos disparos contra meses con pocos");
console.log(`${"=".repeat(100)}`);
{
  const disparosMes = new Map(), univMes = new Map();
  for (const o of obs) {
    if (o.q == null) continue;
    univMes.set(o.mes, (univMes.get(o.mes) ?? 0) + 1);
    if (QS.includes(o.q)) disparosMes.set(o.mes, (disparosMes.get(o.mes) ?? 0) + 1);
  }
  const filas = [...univMes.entries()].map(([m, u]) => ({ m, frac: (disparosMes.get(m) ?? 0) / u, u }));
  filas.sort((a, b) => a.frac - b.frac);
  const terc = Math.ceil(filas.length / 3);
  const grupos = [["pocos disparos (tercio bajo)", filas.slice(0, terc)], ["a medias", filas.slice(terc, 2 * terc)], ["MUCHOS disparos (tercio alto)", filas.slice(2 * terc)]];
  console.log(`  ${num(filas.length)} meses. Se ordenan por QUÉ FRACCIÓN de los tickers dispara ese mes.`);
  console.log(`  | grupo de meses | meses | fracción media que dispara | envase ENTERO ese mes (sin señal): n | RATIO | la señal ese mes: n | RATIO |`);
  console.log(`  |---|---|---|---|---|---|---|`);
  for (const [nom, g] of grupos) {
    const set = new Set(g.map((x) => x.m));
    const u = acc(), s = acc();
    for (const o of ops) {
      if (o.env !== "A" || !set.has(o.mes) || obs[o.idxObs].q == null) continue;
      const d = APUESTA * o.ret;
      suma(u, d);
      if (QS.includes(obs[o.idxObs].q)) suma(s, d);
    }
    console.log(`  | ${nom.padEnd(30)} | ${g.length} | ${pct(media(g.map((x) => x.frac)))} | ${num(u.n).padStart(5)} | ${f2(ratio(u))} | ${num(s.n).padStart(5)} | ${f2(ratio(s))} |`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"=".repeat(100)}`);
console.log("  F. CONTRA QUÉ SE COMPARA — calls y puts del envase VACÍO, toda la historia");
console.log(`${"=".repeat(100)}`);
for (const en of ["A", "B"]) {
  const C = acc(), P = acc();
  for (const o of ops) { if (o.env !== en) continue; suma(o.tipo === "C" ? C : P, APUESTA * o.ret); }
  console.log(`  envase ${en}: CALLS n=${num(C.n)} acierta ${pct(acierto(C))} RATIO ${f2(ratio(C))} · PUTS n=${num(P.n)} acierta ${pct(acierto(P))} RATIO ${f2(ratio(P))}`);
}
{
  const dias = new Set(ops.map((o) => o.dia));
  const meses = new Set(ops.map((o) => o.mes));
  console.log(`  el envase entero usa ${num(dias.size)} días de entrada distintos repartidos en ${num(meses.size)} meses:`);
  console.log(`  las ${num(ops.filter((o) => o.env === "A").length)} operaciones del envase A no son apuestas sueltas, son ${num(meses.size)} meses con hasta 40 tickers dentro.`);
}
console.log(`\n${"=".repeat(100)}\n`);

writeFileSync("scripts/l3b-curva-ticker-desmontaje.json", JSON.stringify({ resumen, porAno }, null, 1), "utf8");
console.log("escrito scripts/l3b-curva-ticker-desmontaje.json");

// ── G. EN DÓLARES AL AÑO (traducción obligatoria: ops/año x $/op = $/año) ────
console.log(`${"=".repeat(100)}`);
console.log("  G. EN DÓLARES AL AÑO — $1,000 arriesgados por intento");
console.log(`${"=".repeat(100)}`);
const ANOS2 = [...new Set(ops.map((o) => o.ano))].sort();
const span = Number(ANOS2[ANOS2.length - 1]) - Number(ANOS2[0]) + 1;
for (const [nom, filtro] of TROZOS) {
  const s = medir("A", filtro);
  const u = universo("A", filtro);
  const anosT = new Set(ops.filter((o) => o.env === "A" && filtro(o)).map((o) => o.ano)).size;
  console.log(`  ${nom.padEnd(18)} señal: ${num(s.n)} ops en ${anosT} años = ${Math.round(s.n / anosT)}/año · neto ${usd(s.gan - s.per)} = ${usd((s.gan - s.per) / anosT)}/año`);
  console.log(`  ${" ".repeat(18)} listón (esos mismos días, sin señal): neto ${usd(u.gan - u.per)} en ${num(u.n)} ops = ${usd((u.gan - u.per) / anosT)}/año`);
}
