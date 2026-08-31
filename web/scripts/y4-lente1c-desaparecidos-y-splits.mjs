// Y4 — LENTE 1c: SEPARAR EL CERO BUENO DEL CERO MALO.
//
// El 37% de las operaciones del envase A se apuntan como perdida total porque el contrato no
// aparece en el fichero del dia de salida. Hay DOS motivos muy distintos para que no aparezca:
//
//   (a) EL CERO BUENO. El strike sigue existiendo en la rejilla de ese vencimiento (hay strikes
//       por encima y por debajo del nuestro), pero ese contrato concreto ya no tiene puja porque
//       no vale nada. El vecino de al lado cotiza a $0.01. Apuntar 0 es CORRECTO.
//
//   (b) EL CERO MALO. El strike se sale de la rejilla entera: no hay ningun strike por encima
//       (o por debajo) del nuestro. Eso no es que no valga nada: es que la rejilla CAMBIO. La
//       causa tipica es un SPLIT — el 1040 de NVDA pasa a ser 104 y la clave vieja deja de
//       existir. Ahi apuntar -100% es inventarse un dato.
//
// Se cuentan los dos, y se vuelve a medir el hallazgo (30/180, residuo, montones 4+5) quitando
// SOLO los del grupo (b), que son los unicos que estan mal.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/y4-lente1c-desaparecidos-y-splits.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const APUESTA = 1000;
const ASK_MIN = 0.10;
const ENVASES = {
  A: { dist: 0.10, dte: 60, tolDte: 17, tolK: 0.50 },
  B: { dist: 0.05, dte: 90, tolDte: 25, tolK: 0.50 },
};
const TRAMOS = [["f", 30, 10], ["m", 90, 22], ["b", 180, 45]];
const COCIENTES = [["30/90", "f", "m"], ["30/180", "f", "b"], ["90/180", "m", "b"]];
const MIN_ANOS_MES = 2, NB = 5, MIN_PROPIO = 12, MIN_POOL = 300;

const pct = (x) => (100 * x).toFixed(1) + "%";
const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
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

const obs = [], ops = [];
let ceroBueno = 0, ceroMalo = 0, presente = 0;
const malos = [];
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
          // ¿el strike sigue dentro de la rejilla de ese lado y vencimiento?
          let lo = Infinity, hi = -Infinity, cuantos = 0;
          for (const cl of Object.keys(g2)) {
            if (cl.slice(-1) !== tipo) continue;
            const K = Number(cl.slice(0, -2));
            cuantos++; if (K < lo) lo = K; if (K > hi) hi = K;
          }
          clase = (cuantos > 0 && ct.K >= lo && ct.K <= hi) ? "ceroBueno" : "ceroMalo";
          if (clase === "ceroBueno") ceroBueno++;
          else { ceroMalo++; if (en === "A" && malos.length < 15) malos.push(`${sym} ${tipo} K=${ct.K} entrada ${dia} salida ${dSal} · la rejilla de salida va de ${lo} a ${hi}`); }
        } else presente++;
        ops.push({ sym, dia, ano: dia.slice(0, 4), env: en, tipo, idxObs, clase,
          ret: ((crudo?.[0] ?? 0) - ct.ask) / ct.ask });
      }
    }
  }
  cache.clear();
}

// montones, igual que el original
function asignar(lista) {
  const orden = [...lista.keys()].sort((a, b) => (lista[a].dia < lista[b].dia ? -1 : lista[a].dia > lista[b].dia ? 1 : (lista[a].sym < lista[b].sym ? -1 : 1)));
  const B = lista.map(() => ({}));
  const insertar = (arr, x) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; } arr.splice(lo, 0, x); };
  const rango = (arr, x) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; } return lo / arr.length; };
  const pool = new Map(), propio = new Map(), resid = new Map(), mesHist = new Map(), tmp = new Map();
  for (const [nom] of COCIENTES) pool.set(nom, []);
  let k = 0;
  while (k < orden.length) {
    const dia = lista[orden[k]].dia; let j = k;
    while (j < orden.length && lista[orden[j]].dia === dia) j++;
    for (let q = k; q < j; q++) {
      const idx = orden[q], o = lista[idx], MM = o.dia.slice(4, 6);
      for (const [nom] of COCIENTES) {
        const x = o.coc[nom]; if (!(x > 0)) continue;
        const P = pool.get(nom), kp = `${o.sym}|${nom}`, R = propio.get(kp) ?? [];
        const bs = { todos: P.length >= MIN_POOL ? Math.min(NB - 1, Math.floor(rango(P, x) * NB)) : null,
                     propio: R.length >= MIN_PROPIO ? Math.min(NB - 1, Math.floor(rango(R, x) * NB)) : null, residuo: null };
        const mh = mesHist.get(`${o.sym}|${nom}|${MM}`);
        if (mh && mh.n >= MIN_ANOS_MES) {
          const r = x - mh.suma / mh.n;
          tmp.set(`${idx}|${nom}`, r);
          const RR = resid.get(kp) ?? [];
          if (RR.length >= MIN_PROPIO) bs.residuo = Math.min(NB - 1, Math.floor(rango(RR, r) * NB));
        }
        B[idx][nom] = bs;
      }
    }
    for (let q = k; q < j; q++) {
      const idx = orden[q], o = lista[idx], MM = o.dia.slice(4, 6);
      for (const [nom] of COCIENTES) {
        const x = o.coc[nom]; if (!(x > 0)) continue;
        insertar(pool.get(nom), x);
        const kp = `${o.sym}|${nom}`;
        if (!propio.has(kp)) propio.set(kp, []);
        insertar(propio.get(kp), x);
        const km = `${o.sym}|${nom}|${MM}`;
        if (!mesHist.has(km)) mesHist.set(km, { suma: 0, n: 0 });
        const mh = mesHist.get(km); mh.suma += x; mh.n++;
        const r = tmp.get(`${idx}|${nom}`);
        if (r !== undefined) { if (!resid.has(kp)) resid.set(kp, []); insertar(resid.get(kp), r); }
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
console.log("  DE DONDE SALEN LAS PERDIDAS TOTALES (todas las operaciones, A y B)");
console.log(`${"=".repeat(96)}`);
console.log(`  el contrato SIGUE en el fichero de salida            : ${num(presente)} (${pct(presente / ops.length)})`);
console.log(`  CERO BUENO — el strike sigue en la rejilla, sin puja : ${num(ceroBueno)} (${pct(ceroBueno / ops.length)})`);
console.log(`  CERO MALO  — el strike se sale de la rejilla entera  : ${num(ceroMalo)} (${pct(ceroMalo / ops.length)})`);
console.log(`\n  Ejemplos de CERO MALO (envase A):`);
malos.forEach((m) => console.log(`    · ${m}`));

console.log(`\n${"=".repeat(96)}`);
console.log("  EL HALLAZGO CON Y SIN LOS CEROS MALOS — envase A · 30/180 · residuo · montones 4+5");
console.log(`${"=".repeat(96)}`);
console.log(`  | version | senal: n | acierta | RATIO | liston justo: n | acierta | RATIO |`);
console.log(`  |---|---|---|---|---|---|---|`);
const casos = [
  ["tal cual (todo dentro)", () => true],
  ["quitando los CEROS MALOS", (o) => o.clase !== "ceroMalo"],
  ["quitando TODOS los desaparecidos", (o) => o.clase === "presente"],
];
for (const [et, f] of casos) {
  const s = mide("A", [3, 4], f), u = mide("A", null, f);
  console.log(`  | ${et} | ${num(s.a.n)} | ${pct(acierto(s.a))} | **${ratio(s.a).toFixed(2)}** | ${num(u.a.n)} | ${pct(acierto(u.a))} | ${ratio(u.a).toFixed(2)} |`);
}
console.log(`\n  Lo mismo en el envase B:`);
console.log(`  | version | senal: n | acierta | RATIO | liston justo: n | acierta | RATIO |`);
console.log(`  |---|---|---|---|---|---|---|`);
for (const [et, f] of casos) {
  const s = mide("B", [3, 4], f), u = mide("B", null, f);
  console.log(`  | ${et} | ${num(s.a.n)} | ${pct(acierto(s.a))} | **${ratio(s.a).toFixed(2)}** | ${num(u.a.n)} | ${pct(acierto(u.a))} | ${ratio(u.a).toFixed(2)} |`);
}

// ano a ano quitando los ceros malos
console.log(`\n  Ano a ano del envase A quitando los CEROS MALOS:`);
console.log(`  | ano | senal: n | RATIO | liston justo: n | RATIO |`);
console.log(`  |---|---|---|---|---|`);
const sA = mide("A", [3, 4], (o) => o.clase !== "ceroMalo");
const uA = mide("A", null, (o) => o.clase !== "ceroMalo");
let bajos = 0, cuentan = 0;
for (const ano of [...sA.anos.keys()].sort()) {
  const y = sA.anos.get(ano), z = uA.anos.get(ano);
  if (y.n < 20) { console.log(`  | ${ano} | ${y.n} | muestra corta | ${z ? z.n : 0} | — |`); continue; }
  cuentan++; if (ratio(y) < 1) bajos++;
  console.log(`  | ${ano} | ${y.n} | **${ratio(y).toFixed(2)}** | ${z.n} | ${ratio(z).toFixed(2)} |`);
}
console.log(`  → ${bajos} de ${cuentan} anos por debajo de 1`);
console.log("");
