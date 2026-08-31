// Y4 — LENTE 1: ¿MIRA LA VENTANA AL FUTURO?
//
// Este script NO busca una senal. Audita a scripts/y4-la-curva-del-ticker.mjs preguntando una
// sola cosa: ¿alguno de los numeros que deciden la compra usa datos del propio dia o de despues?
//
// Se comprueba de cuatro maneras distintas, porque leer el codigo no basta:
//
//  (1) FUERZA BRUTA. Se vuelve a calcular el monton de CADA observacion desde cero, filtrando a
//      mano "solo las observaciones con fecha ESTRICTAMENTE anterior". Si el original coincide
//      al 100%, su ventana no incluye el dia de la decision. Si discrepa, ahi esta el agujero.
//
//  (2) TRUNCADO. Se corre la asignacion de montones con el fichero cortado en 2021 y en 2023.
//      Un calculo que solo mira al pasado tiene que dar EXACTAMENTE los mismos montones para los
//      dias que sobreviven al corte. Si cambian, es que el futuro estaba entrando.
//
//  (3) LA TABLA DE ESTACIONALIDAD. Es la sospechosa numero uno de este proyecto: una tabla hecha
//      con toda la historia y aplicada hacia atras convierte la senal en un elector de ganadoras
//      conocidas. Se comprueba que la media del mes de cada ticker solo tiene anos ANTERIORES, y
//      ademas se mide cuanto CAMBIARIA el resultado si se hiciera con toda la historia (para
//      saber si el agujero, de existir, seria grande o cosmetico).
//
//  (4) EL PRECIO DE SALIDA. Un contrato que no aparece en la cadena de salida se esta leyendo
//      como puja 0, es decir, perdida del 100%. Se cuenta cuantas veces pasa y se vuelve a medir
//      tratandolo como hueco, para ver si el resultado depende de ese convenio.
//
// Ademas: cuantos dias de calendario dura de verdad la operacion (el "salir a los 30 dias de
// bolsa" se implementa como "30 ficheros de cadena mas adelante", que no es lo mismo si faltan
// dias), y el reparto call/put del hallazgo.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/y4-lente1-ventana-al-futuro.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const APUESTA = 1000;
const ASK_MIN = 0.10;
const ENVASES = {
  A: { dist: 0.10, dte: 60, tolDte: 17, salida: 30, tolK: 0.50 },
  B: { dist: 0.05, dte: 90, tolDte: 25, salida: 30, tolK: 0.50 },
};
const TRAMOS = [["f", 30, 10], ["m", 90, 22], ["b", 180, 45]];
const COCIENTES = [["30/90", "f", "m"], ["30/180", "f", "b"], ["90/180", "m", "b"]];
const METODOS = ["todos", "propio", "residuo"];
const MIN_ANOS_MES = 2, NB = 5, MIN_POOL = 300, MIN_PROPIO = 12;

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
  if (!mejor) return null;
  if (dm > S * 0.05) return null;
  const cuna = mejor.c + mejor.p;
  if (!(cuna > 0)) return null;
  return (cuna / S) / Math.sqrt(dte / 365);
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
  return { exp, K, clave: `${K}|${tipo}`, bid: ba[0], ask: ba[1] };
}

// ── PASADA 1, identica al original, mas dos contadores nuevos ────────────────
const obs = [], ops = [];
let claveAusente = 0, bidCeroReal = 0;
const dur = [];
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
        const bid = crudo?.[0] ?? 0;
        if (crudo === undefined) claveAusente++;
        else if (bid <= 0) bidCeroReal++;
        if (en === "A" && tipo === "C") dur.push(cal(dia, dSal));
        ops.push({
          sym, dia, ano: dia.slice(0, 4), env: en, tipo, idxObs,
          ret: (bid - ct.ask) / ct.ask, ausente: crudo === undefined ? 1 : 0,
        });
      }
    }
  }
  cache.clear();
}
console.log(`\n## obs ${num(obs.length)} · ops ${num(ops.length)}`);

// ── PASADA 2, identica al original (ventana que crece, en streaming) ─────────
function asignar(lista) {
  const orden = [...lista.keys()].sort((a, b) => (lista[a].dia < lista[b].dia ? -1 : lista[a].dia > lista[b].dia ? 1 : (lista[a].sym < lista[b].sym ? -1 : 1)));
  const B = lista.map(() => ({}));
  const insertar = (arr, x) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; } arr.splice(lo, 0, x); };
  const rango = (arr, x) => { let lo = 0, hi = arr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; } return lo / arr.length; };
  const pool = new Map(), propio = new Map(), resid = new Map(), mesHist = new Map(), resTmp = new Map();
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
        const bs = {};
        bs.todos = P.length >= MIN_POOL ? Math.min(NB - 1, Math.floor(rango(P, x) * NB)) : null;
        bs.propio = R.length >= MIN_PROPIO ? Math.min(NB - 1, Math.floor(rango(R, x) * NB)) : null;
        bs.residuo = null;
        const mh = mesHist.get(`${o.sym}|${nom}|${MM}`);
        if (mh && mh.n >= MIN_ANOS_MES) {
          const r = x - mh.suma / mh.n;
          resTmp.set(`${idx}|${nom}`, r);
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
        const r = resTmp.get(`${idx}|${nom}`);
        if (r !== undefined) { if (!resid.has(kp)) resid.set(kp, []); insertar(resid.get(kp), r); }
      }
    }
    k = j;
  }
  return B;
}
const Bfull = asignar(obs);

// ════════════════════════════════════════════════════════════════════════════
// (1) FUERZA BRUTA — el monton recalculado a mano con filtro "fecha < hoy"
// ════════════════════════════════════════════════════════════════════════════
const ordenF = [...obs.keys()].sort((a, b) => (obs[a].dia < obs[b].dia ? -1 : obs[a].dia > obs[b].dia ? 1 : (obs[a].sym < obs[b].sym ? -1 : 1)));
const Bbruto = obs.map(() => ({}));
const residHist = new Map();
for (const idx of ordenF) {
  const o = obs[idx], MM = o.dia.slice(4, 6);
  for (const [nom] of COCIENTES) {
    const x = o.coc[nom]; if (!(x > 0)) continue;
    let nP = 0, mP = 0, nR = 0, mR = 0, sM = 0, cM = 0;
    for (const p of obs) {
      const y = p.coc[nom]; if (!(y > 0)) continue;
      if (!(p.dia < o.dia)) continue;              // ← el filtro, a mano, sin ventanas que crecen
      nP++; if (y < x) mP++;
      if (p.sym === o.sym) { nR++; if (y < x) mR++; if (p.dia.slice(4, 6) === MM) { sM += y; cM++; } }
    }
    const bs = {};
    bs.todos = nP >= MIN_POOL ? Math.min(NB - 1, Math.floor((mP / nP) * NB)) : null;
    bs.propio = nR >= MIN_PROPIO ? Math.min(NB - 1, Math.floor((mR / nR) * NB)) : null;
    bs.residuo = null;
    if (cM >= MIN_ANOS_MES) {
      const r = x - sM / cM;
      const kp = `${o.sym}|${nom}`;
      const RR = residHist.get(kp) ?? [];
      const previos = RR.filter((e) => e.dia < o.dia).map((e) => e.r);
      if (previos.length >= MIN_PROPIO) {
        const men = previos.filter((v) => v < r).length;
        bs.residuo = Math.min(NB - 1, Math.floor((men / previos.length) * NB));
      }
      if (!residHist.has(kp)) residHist.set(kp, []);
      residHist.get(kp).push({ dia: o.dia, r });
    }
    Bbruto[idx][nom] = bs;
  }
}
let comparadas = 0, discrep = 0;
const ejemplos = [];
for (let i = 0; i < obs.length; i++) {
  for (const [nom] of COCIENTES) {
    const a = Bfull[i][nom], b = Bbruto[i][nom];
    if (!a && !b) continue;
    for (const met of METODOS) {
      const va = a ? a[met] : undefined, vb = b ? b[met] : undefined;
      comparadas++;
      if (va !== vb) { discrep++; if (ejemplos.length < 6) ejemplos.push(`${obs[i].sym} ${obs[i].dia} ${nom}/${met}: original=${va} fuerza-bruta=${vb}`); }
    }
  }
}
console.log(`\n${"=".repeat(96)}`);
console.log("  (1) FUERZA BRUTA — el monton recalculado a mano filtrando 'fecha ESTRICTAMENTE anterior'");
console.log(`${"=".repeat(96)}`);
console.log(`  decisiones comparadas : ${num(comparadas)}`);
console.log(`  discrepancias         : ${num(discrep)} (${pct(discrep / comparadas)})`);
ejemplos.forEach((e) => console.log(`    · ${e}`));
console.log(`  veredicto: ${discrep === 0 ? "la ventana NO incluye el dia de la decision" : "HAY AGUJERO"}`);

// ════════════════════════════════════════════════════════════════════════════
// (2) TRUNCADO — cortar el fichero y ver si cambian los montones de antes del corte
// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"=".repeat(96)}`);
console.log("  (2) TRUNCADO — si el futuro entrara, cortar el fichero cambiaria montones del pasado");
console.log(`${"=".repeat(96)}`);
for (const corte of ["20210101", "20230101"]) {
  const sub = obs.filter((o) => o.dia < corte);
  const idxSub = obs.map((o, i) => (o.dia < corte ? i : -1)).filter((i) => i >= 0);
  const Bs = asignar(sub);
  let cmp = 0, dif = 0;
  for (let s = 0; s < sub.length; s++) {
    const i = idxSub[s];
    for (const [nom] of COCIENTES) for (const met of METODOS) {
      const va = Bfull[i][nom] ? Bfull[i][nom][met] : undefined;
      const vb = Bs[s][nom] ? Bs[s][nom][met] : undefined;
      cmp++; if (va !== vb) dif++;
    }
  }
  console.log(`  corte ${corte.slice(0, 4)}-${corte.slice(4, 6)}-${corte.slice(6, 8)} : ${num(sub.length)} observaciones · ${num(cmp)} decisiones comparadas · ${num(dif)} cambian`);
}

// ════════════════════════════════════════════════════════════════════════════
// (3) LA TABLA DE ESTACIONALIDAD — la sospechosa numero uno
// ════════════════════════════════════════════════════════════════════════════
function asignarTramposo(lista) {
  const B = lista.map(() => ({}));
  const mesTot = new Map();
  for (const o of lista) for (const [nom] of COCIENTES) {
    const x = o.coc[nom]; if (!(x > 0)) continue;
    const km = `${o.sym}|${nom}|${o.dia.slice(4, 6)}`;
    if (!mesTot.has(km)) mesTot.set(km, { suma: 0, n: 0 });
    const m = mesTot.get(km); m.suma += x; m.n++;
  }
  const residTot = new Map();
  for (const o of lista) for (const [nom] of COCIENTES) {
    const x = o.coc[nom]; if (!(x > 0)) continue;
    const m = mesTot.get(`${o.sym}|${nom}|${o.dia.slice(4, 6)}`);
    const kp = `${o.sym}|${nom}`;
    if (!residTot.has(kp)) residTot.set(kp, []);
    residTot.get(kp).push(x - m.suma / m.n);
  }
  for (const v of residTot.values()) v.sort((a, b) => a - b);
  for (let i = 0; i < lista.length; i++) {
    const o = lista[i];
    for (const [nom] of COCIENTES) {
      const x = o.coc[nom]; if (!(x > 0)) continue;
      const m = mesTot.get(`${o.sym}|${nom}|${o.dia.slice(4, 6)}`);
      const r = x - m.suma / m.n;
      const arr = residTot.get(`${o.sym}|${nom}`);
      let lo = 0, hi = arr.length;
      while (lo < hi) { const mm = (lo + hi) >> 1; if (arr[mm] < r) lo = mm + 1; else hi = mm; }
      B[i][nom] = { residuo: Math.min(NB - 1, Math.floor((lo / arr.length) * NB)) };
    }
  }
  return B;
}
const Btramposo = asignarTramposo(obs);

const acc = () => ({ n: 0, win: 0, gan: 0, per: 0 });
const suma = (a, d) => { a.n++; if (d > 0) { a.win++; a.gan += d; } else a.per += -d; };
const ratio = (a) => (a.per > 0 ? a.gan / a.per : NaN);
const acierto = (a) => (a.n ? a.win / a.n : NaN);
function medir(B, en, nom, met, qs, filtro = () => true) {
  const a = acc();
  for (const o of ops) {
    if (o.env !== en || !filtro(o)) continue;
    const bs = B[o.idxObs][nom]; if (!bs || bs[met] == null || !qs.includes(bs[met])) continue;
    suma(a, APUESTA * o.ret);
  }
  return a;
}
function universo(B, en, nom, met, filtro = () => true) {
  const a = acc();
  for (const o of ops) {
    if (o.env !== en || !filtro(o)) continue;
    const bs = B[o.idxObs][nom]; if (!bs || bs[met] == null) continue;
    suma(a, APUESTA * o.ret);
  }
  return a;
}
console.log(`\n${"=".repeat(96)}`);
console.log("  (3) LA TABLA DE ESTACIONALIDAD — honesta contra tramposa (30/180, montones 4+5)");
console.log(`${"=".repeat(96)}`);
const hon = medir(Bfull, "A", "30/180", "residuo", [3, 4]);
const tra = medir(Btramposo, "A", "30/180", "residuo", [3, 4]);
console.log(`  | version de la tabla | n | acierta | RATIO |`);
console.log(`  |---|---|---|---|`);
console.log(`  | HONESTA (solo anos anteriores) | ${num(hon.n)} | ${pct(acierto(hon))} | ${ratio(hon).toFixed(2)} |`);
console.log(`  | TRAMPOSA (toda la historia, tambien la futura) | ${num(tra.n)} | ${pct(acierto(tra))} | ${ratio(tra).toFixed(2)} |`);

// ════════════════════════════════════════════════════════════════════════════
// (4) EL PRECIO DE SALIDA — el contrato que no aparece se lee como puja 0
// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"=".repeat(96)}`);
console.log("  (4) EL PRECIO DE SALIDA — ¿cuantas perdidas totales son un hueco disfrazado?");
console.log(`${"=".repeat(96)}`);
console.log(`  contrato que NO aparece en la cadena de salida (se cuenta como -100%): ${num(claveAusente)} de ${num(ops.length)} (${pct(claveAusente / ops.length)})`);
console.log(`  contrato presente con puja 0 (perdida real del 100%): ${num(bidCeroReal)}`);
const sinAus = medir(Bfull, "A", "30/180", "residuo", [3, 4], (o) => !o.ausente);
const uSinAus = universo(Bfull, "A", "30/180", "residuo", (o) => !o.ausente);
console.log(`  el hallazgo tratando esos como HUECO: n=${num(sinAus.n)} · acierta ${pct(acierto(sinAus))} · RATIO ${ratio(sinAus).toFixed(2)}`);
console.log(`  el liston justo con el mismo trato:   n=${num(uSinAus.n)} · acierta ${pct(acierto(uSinAus))} · RATIO ${ratio(uSinAus).toFixed(2)}`);

dur.sort((a, b) => a - b);
const q = (p) => dur[Math.min(dur.length - 1, Math.floor(dur.length * p))];
console.log(`\n  DURACION REAL (dias de calendario entre compra y venta, envase A call):`);
console.log(`  minimo ${q(0)} · 10% ${q(0.10)} · mediana ${q(0.50)} · 90% ${q(0.90)} · maximo ${dur[dur.length - 1]} · por encima de 50 dias: ${pct(dur.filter((d) => d > 50).length / dur.length)}`);

console.log(`\n${"=".repeat(96)}`);
console.log("  DE DONDE SALE EL DINERO — calls y puts, con senal y sin ella (mismos dias)");
console.log(`${"=".repeat(96)}`);
console.log(`  | lado | con senal: n | acierta | RATIO | liston justo: n | acierta | RATIO |`);
console.log(`  |---|---|---|---|---|---|---|`);
for (const tipo of ["C", "P"]) {
  const s = medir(Bfull, "A", "30/180", "residuo", [3, 4], (o) => o.tipo === tipo);
  const u = universo(Bfull, "A", "30/180", "residuo", (o) => o.tipo === tipo);
  console.log(`  | ${tipo === "C" ? "CALL" : "PUT "} | ${num(s.n)} | ${pct(acierto(s))} | **${ratio(s).toFixed(2)}** | ${num(u.n)} | ${pct(acierto(u))} | ${ratio(u).toFixed(2)} |`);
}
console.log("");
