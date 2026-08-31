// L3 — LA CURVA DEL TICKER, PASADA POR LA LENTE 3: ¿LA SEÑAL ES LO QUE DICE SER?
//
// ═══ QUÉ SE PONE A PRUEBA ═══════════════════════════════════════════════════════════════════
// El hallazgo y4 dice: comprar sólo cuando el frente (30 días) está caro respecto al fondo (180
// días), comparado consigo mismo y quitándole el mes de calendario, sube el envase A de 1.11 a
// 1.45 con 202 operaciones al año. Aquí NO se vuelve a medir eso (ya está reproducido). Aquí se
// pregunta con QUÉ SE CONFUNDE esa señal:
//
//   1. ¿ES UN TERMÓMETRO DE VOLATILIDAD DISFRAZADO? Se construye la MISMA regla (residuo de mes +
//      escalera contra el propio ticker + 40% de arriba) con otros cuatro números que NO son la
//      curva: el nivel del frente solo, el nivel del fondo solo (y su inverso), y lo que cuesta
//      la propia opción que se compra. Si cualquiera de ellos da lo mismo, la curva no aporta.
//   2. ¿ES EL PRECIO DE LA CUÑA CON OTRO NOMBRE? Se cruzan los montones: de los días en que la
//      curva dice COMPRAR, ¿qué fracción también está arriba en el termómetro de volatilidad?
//   3. ¿ES EARNINGS? Se mira la periodicidad de los disparos contra su listón por azar, y se
//      parte el montón ganador dentro/fuera de los meses de resultados del propio ticker.
//   4. ¿ES SÓLO LA DERIVA DEL MERCADO? Se parte en CALLS y PUTS, contra el listón medido en
//      exactamente los mismos días.
//   5. ¿ES UN ELEGIDOR DE DÍAS y no de tickers? Se mide el envase vacío SÓLO en los días en que
//      la señal dispara (control emparejado por día). Con 40 tickers que se mueven juntos, un
//      elegidor de días tiene muchas menos apuestas independientes de las que aparenta.
//   6. ¿SE COLÓ EL ENVASE POR LA PUERTA DE ATRÁS? El envase tiene tolerancias anchas (strike de
//      5% a 15% fuera, plazo de 43 a 77 días, salida a 30 ficheros de cadena y no a 30 días de
//      bolsa garantizados). Se mide, montón a montón, qué strike, qué plazo, qué prima y cuántos
//      días de calendario le tocan de verdad a cada montón. Si el montón ganador compra opciones
//      sistemáticamente distintas, la "señal" es el envase moviéndose.
//   7. EL CONTROL QUE DECIDE: VEINTE barajados, no uno. Dos familias — desplazar la señal N meses
//      dentro del propio ticker (N = 1..20), y permutar qué ticker se lleva qué montón DENTRO DEL
//      MISMO DÍA (20 semillas fijas, generador reproducible, nada de Math.random).
//
// ═══ LAS REGLAS DE LA CASA ══════════════════════════════════════════════════════════════════
//   1. Se COMPRA al ASK y se VENDE al BID. Nunca punto medio para el dinero. (Las lecturas de
//      información — cuña, spot — sí van a punto medio: no son operaciones.)
//   2. Ningún modelo de precios.
//   3. Un HUECO no es un cero. Se descarta y se cuenta aparte.
//   4. SÓLO EL PASADO: toda ventana termina el día ANTERIOR.
//   5. El SPOT por paridad put-call SÓLO en el vencimiento más cercano.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/l3-curva-ticker-lente3.mjs

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const APUESTA = 1000;
const ASK_MIN = 0.10;

const ENVASES = {
  A: { dist: 0.10, dte: 60, tolDte: 17, salida: 30, tolK: 0.50 },
  B: { dist: 0.05, dte: 90, tolDte: 25, salida: 30, tolK: 0.50 },
};
const TRAMOS = [["f", 30, 10], ["m", 90, 22], ["b", 180, 45]];
const NB = 5;
const MIN_ANOS_MES = 2;
const MIN_PROPIO = 12;
const QS_GANA = [3, 4];          // el 40% de arriba: el corte ancho del hallazgo

const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) + "%" : "—");
const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
const num = (n) => Math.round(n).toLocaleString("en-US");
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const cal = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "—");

// generador reproducible (xorshift): el control tiene que poder repetirse igual
function rng(semilla) {
  let s = semilla >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

// ── índice de días por ticker ────────────────────────────────────────────────
const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();
let TICKERS = [...diasPorSim.keys()].sort();
if (process.env.SOLO) TICKERS = TICKERS.filter((t) => process.env.SOLO.split(",").includes(t));

const cache = new Map();
let lecturas = 0, noExiste = 0;
function cadena(sym, dia) {
  const k = `${sym}|${dia}`;
  if (cache.has(k)) { const v = cache.get(k); cache.delete(k); cache.set(k, v); return v; }
  const f = `${CDIR}/${sym}_d${dia}.json`;
  let v = null;
  if (existsSync(f)) { try { v = JSON.parse(readFileSync(f, "utf8")); lecturas++; } catch { v = null; } }
  else noExiste++;
  if (cache.size >= 100) cache.delete(cache.keys().next().value);
  cache.set(k, v);
  return v;
}

/** SPOT por paridad put-call, SÓLO en el vencimiento más cercano. */
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

/** CUÑA al dinero normalizada = (call+put al dinero / S) / raíz(plazo/365). Lectura, punto medio. */
function sigmaDe(g, S, dte) {
  let mejor = null, dm = Infinity;
  for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== "C") continue;
    const K = Number(cl.slice(0, -2));
    const p = g[`${K}|P`];
    if (!p) continue;
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
  for (const e of Object.keys(c)) {
    const d = cal(hoy, e);
    if (d < 1) continue;
    const x = Math.abs(d - env.dte);
    if (x < dd) { dd = x; exp = e; }
  }
  if (!exp || dd > env.tolDte) return null;
  const objetivo = tipo === "C" ? S * (1 + env.dist) : S * (1 - env.dist);
  let K = null, ba = null, kd = Infinity;
  for (const [clave, v] of Object.entries(c[exp])) {
    if (clave.slice(-1) !== tipo) continue;
    if (!(v[1] >= ASK_MIN)) continue;
    const k = Number(clave.slice(0, -2));
    const d = Math.abs(k - objetivo);
    if (d < kd) { kd = d; K = k; ba = v; }
  }
  if (K == null) return null;
  const distReal = tipo === "C" ? K / S - 1 : 1 - K / S;
  if (Math.abs(distReal - env.dist) > env.dist * env.tolK) return null;
  return { exp, K, clave: `${K}|${tipo}`, bid: ba[0], ask: ba[1], distReal, dteReal: cal(hoy, exp) };
}

// ════════════════════════════════════════════════════════════════════════════
// PASADA 1 — señal y operaciones (con TODO lo que hace falta para la autopsia)
// ════════════════════════════════════════════════════════════════════════════
const obs = [];
const ops = [];
let entradas = 0, sinSpot = 0, sinCadenaEntrada = 0, sinTramo = 0, sinContrato = 0;
let huecos = 0, huecoGrupo = 0, trasVto = 0;

const t0 = Date.now();
for (const sym of TICKERS) {
  const ds = diasPorSim.get(sym);
  const vistos = new Set();
  for (let i = 0; i < ds.length; i++) {
    const dia = ds[i];
    const mes = dia.slice(0, 6);
    if (vistos.has(mes)) continue;
    vistos.add(mes);
    const ano = dia.slice(0, 4);

    const c = cadena(sym, dia);
    if (!c) { sinCadenaEntrada++; continue; }
    const S = spotOk(c, dia);
    if (!(S > 0)) { sinSpot++; continue; }
    entradas++;

    const sig = {};
    for (const [nom, obj, tol] of TRAMOS) {
      let exp = null, dd = Infinity;
      for (const e of Object.keys(c)) {
        const d = cal(dia, e);
        if (d < 1) continue;
        const x = Math.abs(d - obj);
        if (x < dd) { dd = x; exp = e; }
      }
      if (!exp || dd > tol) continue;
      const s = sigmaDe(c[exp], S, cal(dia, exp));
      if (s > 0) sig[nom] = s;
    }
    if (!(sig.f > 0 && sig.b > 0)) { sinTramo++; continue; }

    const idxObs = obs.length;
    // los CINCO números que se van a rankear igual: la curva y sus cuatro sospechosos
    const val = {
      curva: sig.f / sig.b,              // LA SEÑAL DEL HALLAZGO (30/180)
      frente: sig.f,                     // sólo el nivel del frente
      fondo: sig.b,                      // sólo el nivel del fondo
      fondoInv: -sig.b,                  // el fondo al revés (fondo barato = arriba)
    };
    const o = { sym, dia, ano, S, val, sig: { f: sig.f, m: sig.m ?? null, b: sig.b } };
    obs.push(o);

    const dSal = ds[i + 30] ?? null;
    if (!dSal) { huecos += 4; continue; }
    const cs = cadena(sym, dSal);
    const S2 = cs ? spotOk(cs, dSal) : null;
    o.holdCal = cal(dia, dSal);
    o.movSub = S2 > 0 ? S2 / S - 1 : null;   // movimiento real del subyacente (diagnóstico)

    for (const [en, env] of Object.entries(ENVASES)) {
      for (const tipo of ["C", "P"]) {
        const ct = elegir(c, S, dia, env, tipo);
        if (!ct) { sinContrato++; continue; }
        if (dSal >= ct.exp) { trasVto++; continue; }
        if (!cs) { huecos++; continue; }
        const g2 = cs[ct.exp];
        if (!g2) { huecos++; huecoGrupo++; continue; }
        const bid = g2[ct.clave]?.[0] ?? 0;
        ops.push({
          sym, dia, ano, env: en, tipo, idxObs,
          ret: (bid - ct.ask) / ct.ask,
          coste: ct.ask / S, horq: (ct.ask - ct.bid) / ct.ask,
          distReal: ct.distReal, dteReal: ct.dteReal, holdCal: o.holdCal,
          sinValor: bid <= 0 ? 1 : 0,
        });
      }
    }
  }
  cache.clear();
  process.stderr.write(`\r   ${sym.padEnd(6)} · ${entradas} entradas · ${num(ops.length)} operaciones · ${Math.round((Date.now() - t0) / 1000)}s     `);
}
process.stderr.write("\n");

// añade a cada op la prima en dólares de la propia opción comprada (para rankear "lo barato")
// (se hace por obs: se usa la CALL del envase A como representante del coste de ese día)
const costeCallA = new Map();
for (const o of ops) if (o.env === "A" && o.tipo === "C") costeCallA.set(o.idxObs, o.coste);
for (let i = 0; i < obs.length; i++) {
  const c = costeCallA.get(i);
  if (c !== undefined) obs[i].val.primaCara = c;   // prima cara = arriba de la escalera
}

// ════════════════════════════════════════════════════════════════════════════
// PASADA 2 — LA MISMA MÁQUINA DE MONTONES aplicada a CADA número candidato
//   residuo de mes (años ANTERIORES, mínimo 2) + escalera contra el propio ticker (mín. 12,
//   ventana que crece y termina el día ANTERIOR)
// ════════════════════════════════════════════════════════════════════════════
const CANDIDATOS = ["curva", "frente", "fondo", "fondoInv", "primaCara"];

function insertar(arr, x) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; }
  arr.splice(lo, 0, x);
}
function rango(arr, x) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; }
  return lo / arr.length;
}

const orden = [...obs.keys()].sort((a, b) => (obs[a].dia < obs[b].dia ? -1 : obs[a].dia > obs[b].dia ? 1 : (obs[a].sym < obs[b].sym ? -1 : 1)));
for (const o of obs) o.b = {};

const mesHist = new Map();   // `${sym}|${cand}|${MM}` -> {suma,n} de años ANTERIORES
const resid = new Map();     // `${sym}|${cand}` -> residuos pasados ordenados

let k = 0;
while (k < orden.length) {
  const dia = obs[orden[k]].dia;
  let j = k;
  while (j < orden.length && obs[orden[j]].dia === dia) j++;
  // 1) asignar montón usando SÓLO lo anterior
  for (let q = k; q < j; q++) {
    const o = obs[orden[q]];
    const MM = o.dia.slice(4, 6);
    o.res = {};
    for (const cand of CANDIDATOS) {
      const x = o.val[cand];
      if (!Number.isFinite(x)) continue;
      const mh = mesHist.get(`${o.sym}|${cand}|${MM}`);
      if (!mh || mh.n < MIN_ANOS_MES) continue;
      const r = x - mh.suma / mh.n;
      o.res[cand] = r;
      const RR = resid.get(`${o.sym}|${cand}`);
      if (RR && RR.length >= MIN_PROPIO) o.b[cand] = Math.min(NB - 1, Math.floor(rango(RR, r) * NB));
    }
  }
  // 2) sólo ahora entra el día de hoy en la historia
  for (let q = k; q < j; q++) {
    const o = obs[orden[q]];
    const MM = o.dia.slice(4, 6);
    for (const cand of CANDIDATOS) {
      const x = o.val[cand];
      if (!Number.isFinite(x)) continue;
      const km = `${o.sym}|${cand}|${MM}`;
      if (!mesHist.has(km)) mesHist.set(km, { suma: 0, n: 0 });
      const mh = mesHist.get(km); mh.suma += x; mh.n++;
      if (o.res[cand] !== undefined) {
        const kp = `${o.sym}|${cand}`;
        if (!resid.has(kp)) resid.set(kp, []);
        insertar(resid.get(kp), o.res[cand]);
      }
    }
  }
  k = j;
}

// ── contadores ───────────────────────────────────────────────────────────────
const acc = () => ({ n: 0, win: 0, gan: 0, per: 0 });
function suma(a, d) { a.n++; if (d > 0) { a.win++; a.gan += d; } else a.per += -d; }
const ratio = (a) => (a.per > 0 ? a.gan / a.per : (a.gan > 0 ? Infinity : NaN));
const acierto = (a) => (a.n ? a.win / a.n : NaN);
const media = (v) => (v.length ? v.reduce((x, y) => x + y, 0) / v.length : NaN);

function medir(en, filtro) {
  const a = acc();
  for (const o of ops) { if (o.env !== en) continue; if (!filtro(o)) continue; suma(a, APUESTA * o.ret); }
  return a;
}
const dentro = (cand, qs) => (o) => { const q = obs[o.idxObs].b[cand]; return q != null && qs.includes(q); };
const definido = (cand) => (o) => obs[o.idxObs].b[cand] != null;

// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"=".repeat(104)}`);
console.log("  SANIDAD");
console.log(`${"=".repeat(104)}`);
console.log(`  entradas usadas (una al mes por ticker): ${num(entradas)} · observaciones de curva ${num(obs.length)} · operaciones ${num(ops.length)}`);
console.log(`  descartes: sin cadena ${num(sinCadenaEntrada)} · sin spot ${num(sinSpot)} · sin los dos tramos ${num(sinTramo)} · sin contrato que encaje ${num(sinContrato)}`);
console.log(`  HUECOS descartados ${num(huecos)} (${pct(huecos / (huecos + ops.length))}) · ${num(huecoGrupo)} por faltar el vencimiento entero · salida tras vencimiento ${num(trasVto)}`);
console.log(`  ficheros leídos ${num(lecturas)} · no encontrados ${num(noExiste)}`);
for (const en of ["A", "B"]) {
  const b = medir(en, () => true);
  const l = ops.filter((o) => o.env === en);
  console.log(`  ENVASE ${en} VACÍO: n=${num(b.n)} · acierta ${pct(acierto(b))} · RATIO ${f2(ratio(b))} · prima ${pct(media(l.map((o) => o.coste)))} de la acción · horquilla ${pct(media(l.map((o) => o.horq)))} · vence sin valor ${pct(media(l.map((o) => o.sinValor)))}`);
}
const señalA = medir("A", dentro("curva", QS_GANA));
const señalB = medir("B", dentro("curva", QS_GANA));
const univA = medir("A", definido("curva"));
const univB = medir("B", definido("curva"));
console.log(`  REPRODUCCIÓN del hallazgo (curva 30/180, residuo, 40% de arriba):`);
console.log(`    envase A: n=${num(señalA.n)} · acierta ${pct(acierto(señalA))} · RATIO ${f2(ratio(señalA))}   [el hallazgo dice n=1,514 · 22.3% · 1.45]`);
console.log(`    envase B: n=${num(señalB.n)} · acierta ${pct(acierto(señalB))} · RATIO ${f2(ratio(señalB))}`);

// ════════════════════════════════════════════════════════════════════════════
// 1. ¿ES UN TERMÓMETRO DE VOLATILIDAD DISFRAZADO?
// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"=".repeat(104)}`);
console.log("  1. LOS IMPOSTORES — la MISMA regla (residuo de mes + escalera propia + 40% de arriba)");
console.log("     construida con otros números que NO son la curva");
console.log(`${"=".repeat(104)}`);
const NOMC = {
  curva: "LA CURVA 30/180 (la señal del hallazgo)",
  frente: "sólo el nivel del frente (30 días)",
  fondo: "sólo el nivel del fondo (180 días) — alto",
  fondoInv: "sólo el nivel del fondo — BAJO (fondo barato)",
  primaCara: "lo que cuesta la propia opción que se compra — cara",
};
console.log(`  | número que ordena | envase A: n | acierta | RATIO | listón en sus días | envase B: RATIO | acierta |`);
console.log(`  |---|---|---|---|---|---|---|`);
const impostores = {};
for (const cand of CANDIDATOS) {
  const a = medir("A", dentro(cand, QS_GANA));
  const u = medir("A", definido(cand));
  const b = medir("B", dentro(cand, QS_GANA));
  impostores[cand] = { n: a.n, acierto: acierto(a), ratio: ratio(a), liston: ratio(u), rB: ratio(b), accB: acierto(b) };
  console.log(`  | ${NOMC[cand].padEnd(46)} | ${num(a.n).padStart(5)} | ${pct(acierto(a)).padStart(6)} | **${f2(ratio(a))}** | ${f2(ratio(u))} | ${f2(ratio(b))} | ${pct(acierto(b))} |`);
}
// la escalera entera de cada impostor, por si el efecto vive en otro escalón
console.log(`\n  La escalera entera de cada uno (envase A, RATIO por montón, del más bajo al más alto):`);
for (const cand of CANDIDATOS) {
  const fila = [];
  for (let q = 0; q < NB; q++) { const a = medir("A", dentro(cand, [q])); fila.push(`${q + 1}=${f2(ratio(a))}(n=${a.n})`); }
  console.log(`    ${cand.padEnd(10)} ${fila.join(" · ")}`);
}

// ════════════════════════════════════════════════════════════════════════════
// 2. ¿SE SOLAPAN? — de los días en que la CURVA dice comprar, ¿cuántos también están arriba
//    en el termómetro de volatilidad / en la prima?
// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"=".repeat(104)}`);
console.log("  2. EL SOLAPAMIENTO — ¿la curva y los impostores señalan los MISMOS días?");
console.log(`${"=".repeat(104)}`);
console.log(`  (si dos señales fueran independientes, el solape con el 40% de arriba sería 40%)`);
console.log(`  | contra | días con las dos definidas | solape con su 40% de arriba | solape con su 40% de ABAJO |`);
console.log(`  |---|---|---|---|`);
const solapes = {};
for (const cand of CANDIDATOS.filter((c) => c !== "curva")) {
  let base = 0, arriba = 0, abajo = 0;
  for (const o of obs) {
    const qc = o.b.curva, qx = o.b[cand];
    if (qc == null || qx == null) continue;
    if (!QS_GANA.includes(qc)) continue;
    base++;
    if (QS_GANA.includes(qx)) arriba++;
    if ([0, 1].includes(qx)) abajo++;
  }
  solapes[cand] = { base, arriba: arriba / base, abajo: abajo / base };
  console.log(`  | ${NOMC[cand].padEnd(46)} | ${num(base)} | ${pct(arriba / base)} | ${pct(abajo / base)} |`);
}

// ¿y si se quita el solape? la curva DENTRO y FUERA del termómetro de volatilidad
console.log(`\n  La curva partida por el termómetro de volatilidad (frente alto/bajo), envase A:`);
for (const cand of ["frente", "primaCara"]) {
  const D = acc(), F = acc();
  for (const o of ops) {
    if (o.env !== "A") continue;
    const ob = obs[o.idxObs];
    if (ob.b.curva == null || !QS_GANA.includes(ob.b.curva)) continue;
    if (ob.b[cand] == null) continue;
    suma(QS_GANA.includes(ob.b[cand]) ? D : F, APUESTA * o.ret);
  }
  console.log(`    curva arriba Y ${cand} arriba : n=${num(D.n)} · acierta ${pct(acierto(D))} · RATIO ${f2(ratio(D))}`);
  console.log(`    curva arriba y ${cand} NO     : n=${num(F.n)} · acierta ${pct(acierto(F))} · RATIO ${f2(ratio(F))}`);
}

// ════════════════════════════════════════════════════════════════════════════
// 3. ¿SE COLÓ EL ENVASE? — qué compra de verdad cada montón
// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"=".repeat(104)}`);
console.log("  3. QUÉ COMPRA DE VERDAD CADA MONTÓN (envase A) — el envase tiene tolerancias anchas");
console.log(`${"=".repeat(104)}`);
console.log(`  | montón | n | strike fuera | plazo (días) | días de calendario aguantando | prima/acción | horquilla | vence sin valor |`);
console.log(`  |---|---|---|---|---|---|---|---|`);
const perfil = [];
for (let q = 0; q < NB; q++) {
  const l = ops.filter((o) => o.env === "A" && obs[o.idxObs].b.curva === q);
  if (!l.length) continue;
  const r = { q, n: l.length, dist: media(l.map((o) => o.distReal)), dte: media(l.map((o) => o.dteReal)), hold: media(l.map((o) => o.holdCal)), coste: media(l.map((o) => o.coste)), horq: media(l.map((o) => o.horq)), sv: media(l.map((o) => o.sinValor)) };
  perfil.push(r);
  console.log(`  | ${q + 1} | ${num(r.n).padStart(5)} | ${pct(r.dist)} | ${r.dte.toFixed(1)} | ${r.hold.toFixed(1)} | ${pct(r.coste)} | ${pct(r.horq)} | ${pct(r.sv)} |`);
}
{
  const l = ops.filter((o) => o.env === "A" && obs[o.idxObs].b.curva != null);
  console.log(`  | TODO el universo | ${num(l.length).padStart(5)} | ${pct(media(l.map((o) => o.distReal)))} | ${media(l.map((o) => o.dteReal)).toFixed(1)} | ${media(l.map((o) => o.holdCal)).toFixed(1)} | ${pct(media(l.map((o) => o.coste)))} | ${pct(media(l.map((o) => o.horq)))} | ${pct(media(l.map((o) => o.sinValor)))} |`);
}

// ════════════════════════════════════════════════════════════════════════════
// 4. ¿ES SÓLO LA DERIVA? — calls contra puts, contra el listón de los MISMOS días
// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"=".repeat(104)}`);
console.log("  4. CALLS CONTRA PUTS — si la mejora sólo está en las calls, es la deriva del mercado");
console.log(`${"=".repeat(104)}`);
console.log(`  | envase | lado | señal: n | acierta | RATIO | listón (mismos días, sin señal): n | acierta | RATIO |`);
console.log(`  |---|---|---|---|---|---|---|---|`);
const ladoRes = {};
for (const en of ["A", "B"]) for (const tipo of ["C", "P"]) {
  const s = medir(en, (o) => o.tipo === tipo && dentro("curva", QS_GANA)(o));
  const u = medir(en, (o) => o.tipo === tipo && definido("curva")(o));
  ladoRes[`${en}${tipo}`] = { n: s.n, acierto: acierto(s), ratio: ratio(s), lisN: u.n, lisAcc: acierto(u), lisRatio: ratio(u) };
  console.log(`  | ${en} | ${tipo === "C" ? "CALL" : "PUT "} | ${num(s.n).padStart(5)} | ${pct(acierto(s)).padStart(6)} | **${f2(ratio(s))}** | ${num(u.n).padStart(5)} | ${pct(acierto(u)).padStart(6)} | ${f2(ratio(u))} |`);
}
// las calls año a año, que es donde vive todo
console.log(`\n  Sólo las CALLS del envase A, año a año (señal contra listón de los mismos días):`);
console.log(`  | año | señal n | señal RATIO | listón RATIO |`);
console.log(`  |---|---|---|---|`);
const ANOS = [...new Set(ops.map((o) => o.ano))].sort();
for (const a of ANOS) {
  const s = medir("A", (o) => o.ano === a && o.tipo === "C" && dentro("curva", QS_GANA)(o));
  const u = medir("A", (o) => o.ano === a && o.tipo === "C" && definido("curva")(o));
  if (s.n < 10) continue;
  console.log(`  | ${a} | ${s.n} | **${f2(ratio(s))}** | ${f2(ratio(u))} |`);
}
// y el movimiento del subyacente: ¿la señal acierta el LADO?
{
  const up = [], dn = [];
  for (const o of obs) {
    if (o.b.curva == null || o.movSub == null) continue;
    (QS_GANA.includes(o.b.curva) ? up : dn).push(o.movSub);
  }
  const frac = (v) => v.filter((x) => x > 0).length / v.length;
  console.log(`\n  El subyacente en los 30 días siguientes (movimiento medio y cuántas veces sube):`);
  console.log(`    días CON señal : n=${num(up.length)} · movimiento medio ${pct(media(up))} · sube el ${pct(frac(up))} de las veces`);
  console.log(`    días SIN señal : n=${num(dn.length)} · movimiento medio ${pct(media(dn))} · sube el ${pct(frac(dn))} de las veces`);
}

// ════════════════════════════════════════════════════════════════════════════
// 5. ¿ELIGE DÍAS O ELIGE TICKERS? — control emparejado por día
// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"=".repeat(104)}`);
console.log("  5. ¿ELIGE DÍAS O ELIGE TICKERS? — el envase vacío SÓLO en los días en que la señal dispara");
console.log(`${"=".repeat(104)}`);
const diasFuego = new Set();
for (const o of ops) if (o.env === "A" && dentro("curva", QS_GANA)(o)) diasFuego.add(o.dia);
const mesesFuego = new Set([...diasFuego].map((d) => d.slice(0, 6)));
for (const en of ["A", "B"]) {
  const s = medir(en, dentro("curva", QS_GANA));
  const mismosDias = medir(en, (o) => diasFuego.has(o.dia) && definido("curva")(o));
  const otrosDias = medir(en, (o) => !diasFuego.has(o.dia) && definido("curva")(o));
  console.log(`  envase ${en}:`);
  console.log(`    la señal                                  : n=${num(s.n).padStart(5)} · acierta ${pct(acierto(s))} · RATIO ${f2(ratio(s))}`);
  console.log(`    TODO lo del envase en esos MISMOS días     : n=${num(mismosDias.n).padStart(5)} · acierta ${pct(acierto(mismosDias))} · RATIO ${f2(ratio(mismosDias))}`);
  console.log(`    todo lo del envase en los días RESTANTES   : n=${num(otrosDias.n).padStart(5)} · acierta ${pct(acierto(otrosDias))} · RATIO ${f2(ratio(otrosDias))}`);
}
console.log(`  la señal dispara en ${num(diasFuego.size)} días distintos de calendario, repartidos en ${num(mesesFuego.size)} meses`);
{
  // cuántos meses hacen falta para juntar la mitad del dinero ganado
  const porMes = new Map();
  const T = acc();
  for (const o of ops) {
    if (o.env !== "A" || !dentro("curva", QS_GANA)(o)) continue;
    const m = o.dia.slice(0, 6);
    if (!porMes.has(m)) porMes.set(m, acc());
    const d = APUESTA * o.ret;
    suma(porMes.get(m), d); suma(T, d);
  }
  const l = [...porMes.entries()].sort((a, b) => b[1].gan - a[1].gan);
  let ac = 0, cuantos = 0;
  for (const [, v] of l) { ac += v.gan; cuantos++; if (ac >= T.gan / 2) break; }
  console.log(`  de esos ${num(porMes.size)} meses, ${cuantos} juntan la mitad del dinero ganado. Los 5 primeros: ${l.slice(0, 5).map(([m, v]) => `${m} ${usd(v.gan - v.per)}`).join(" · ")}`);
}

// ════════════════════════════════════════════════════════════════════════════
// 6. EARNINGS — periodicidad contra su listón por azar
// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"=".repeat(104)}`);
console.log("  6. EARNINGS — ¿dispara siempre en las mismas semanas del trimestre?");
console.log(`${"=".repeat(104)}`);
const top4frac = (meses) => {
  const cnt = new Map();
  for (const m of meses) cnt.set(m, (cnt.get(m) ?? 0) + 1);
  return [...cnt.values()].sort((a, b) => b - a).slice(0, 4).reduce((a, b) => a + b, 0) / meses.length;
};
{
  const porT = new Map(), uniT = new Map();
  for (const o of obs) {
    if (o.b.curva == null) continue;
    if (!uniT.has(o.sym)) uniT.set(o.sym, []);
    uniT.get(o.sym).push(o.dia.slice(4, 6));
    if (!QS_GANA.includes(o.b.curva)) continue;
    if (!porT.has(o.sym)) porT.set(o.sym, []);
    porT.get(o.sym).push(o.dia);
  }
  const r0 = rng(20260824);
  let tks = 0, sumF = 0, sumN = 0, sumAno = 0, tot = 0;
  for (const [t, ds] of porT) {
    if (ds.length < 8) continue;
    tks++; tot += ds.length;
    sumAno += ds.length / new Set(ds.map((d) => d.slice(0, 4))).size;
    sumF += top4frac(ds.map((d) => d.slice(4, 6)));
    const U = uniT.get(t);
    let acu = 0;
    for (let it = 0; it < 400; it++) {
      const c = [...U];
      for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(r0() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
      acu += top4frac(c.slice(0, ds.length));
    }
    sumN += acu / 400;
  }
  console.log(`  ${tks} tickers con 8+ disparos · ${num(tot)} disparos · ${(sumAno / tks).toFixed(1)} disparos por ticker y año`);
  console.log(`  en los 4 meses de calendario favoritos del ticker: ${pct(sumF / tks)} · POR PURO AZAR saldría ${pct(sumN / tks)} · exceso ${pct(sumF / tks - sumN / tks)}`);
  console.log(`  (earnings son 4 al año: si fuera earnings, saldrían ~4 disparos por ticker y año y muy por encima del azar)`);
}

// ════════════════════════════════════════════════════════════════════════════
// 7. EL CONTROL QUE DECIDE — VEINTE barajados, dos familias
// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"=".repeat(104)}`);
console.log("  7. EL BARAJADO — VEINTE tiradas, no una. Dos formas de romper la señal");
console.log(`${"=".repeat(104)}`);

// familia A: desplazar la señal N entradas (meses) dentro del propio ticker
const porTicker = new Map();
for (const idx of orden) {
  const o = obs[idx];
  if (!porTicker.has(o.sym)) porTicker.set(o.sym, []);
  porTicker.get(o.sym).push(idx);
}
const bDespl = new Map();   // `${idx}|${d}` -> montón desplazado
for (const lista of porTicker.values()) {
  for (let i = 0; i < lista.length; i++) {
    for (let d = 1; d <= 20; d++) {
      const src = i - d >= 0 ? obs[lista[i - d]] : null;
      bDespl.set(`${lista[i]}|${d}`, src ? (src.b.curva ?? null) : null);
    }
  }
}
function medirDespl(en, d) {
  const a = acc();
  for (const o of ops) {
    if (o.env !== en) continue;
    const q = bDespl.get(`${o.idxObs}|${d}`);
    if (q == null || !QS_GANA.includes(q)) continue;
    suma(a, APUESTA * o.ret);
  }
  return a;
}
const rsDespl = [];
console.log(`\n  (a) LA SEÑAL DEL MES EQUIVOCADO del mismo ticker — desplazamiento de 1 a 20 meses`);
console.log(`  | desplazamiento | n | acierta | RATIO |   | desplazamiento | n | acierta | RATIO |`);
console.log(`  |---|---|---|---|---|---|---|---|---|`);
for (let d = 1; d <= 10; d++) {
  const a = medirDespl("A", d), b = medirDespl("A", d + 10);
  rsDespl.push({ d, r: ratio(a), n: a.n, acc: acierto(a) });
  rsDespl.push({ d: d + 10, r: ratio(b), n: b.n, acc: acierto(b) });
  console.log(`  | ${String(d).padStart(2)} meses | ${num(a.n).padStart(5)} | ${pct(acierto(a)).padStart(6)} | ${f2(ratio(a))} |   | ${String(d + 10).padStart(2)} meses | ${num(b.n).padStart(5)} | ${pct(acierto(b)).padStart(6)} | ${f2(ratio(b))} |`);
}
rsDespl.sort((x, y) => x.d - y.d);
{
  const v = rsDespl.map((x) => x.r).filter(Number.isFinite).sort((a, b) => a - b);
  const real = ratio(señalA);
  const peores = v.filter((x) => x >= real).length;
  console.log(`\n  RESUMEN barajado (a): las 20 tiradas van de ${f2(v[0])} a ${f2(v[v.length - 1])} · mediana ${f2(v[Math.floor(v.length / 2)])} · media ${f2(media(v))}`);
  console.log(`  la señal DE VERDAD da ${f2(real)} → ${peores} de las 20 tiradas barajadas llegan a ese número o lo pasan`);
}

// familia B: permutar QUÉ TICKER se lleva QUÉ montón dentro del MISMO DÍA
//   esto conserva EXACTAMENTE el reparto por fechas (y por tanto el régimen de mercado) y destruye
//   sólo la información de "a qué ticker le tocaba". Es el control más duro.
const porDia = new Map();
for (const idx of orden) {
  const o = obs[idx];
  if (o.b.curva == null) continue;
  if (!porDia.has(o.dia)) porDia.set(o.dia, []);
  porDia.get(o.dia).push(idx);
}
const rsPerm = [];
console.log(`\n  (b) EL MISMO DÍA, PERO OTRO TICKER — se permuta qué ticker se lleva qué montón dentro`);
console.log(`      del mismo día (conserva el calendario exacto, rompe sólo la elección del ticker)`);
console.log(`  | semilla | n | acierta | RATIO |   | semilla | n | acierta | RATIO |`);
console.log(`  |---|---|---|---|---|---|---|---|---|`);
for (let s = 0; s < 20; s += 2) {
  const linea = [];
  for (const ss of [s, s + 1]) {
    const r = rng(1000 + ss * 7919);
    const mapa = new Map();
    for (const [, idxs] of porDia) {
      const qs = idxs.map((i) => obs[i].b.curva);
      for (let i = qs.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [qs[i], qs[j]] = [qs[j], qs[i]]; }
      idxs.forEach((idx, i) => mapa.set(idx, qs[i]));
    }
    const a = acc();
    for (const o of ops) {
      if (o.env !== "A") continue;
      const q = mapa.get(o.idxObs);
      if (q == null || !QS_GANA.includes(q)) continue;
      suma(a, APUESTA * o.ret);
    }
    rsPerm.push({ s: ss, r: ratio(a), n: a.n, acc: acierto(a) });
    linea.push(`| ${String(ss).padStart(2)} | ${num(a.n).padStart(5)} | ${pct(acierto(a)).padStart(6)} | ${f2(ratio(a))} |`);
  }
  console.log(`  ${linea[0]}   ${linea[1]}`);
}
{
  const v = rsPerm.map((x) => x.r).filter(Number.isFinite).sort((a, b) => a - b);
  const real = ratio(señalA);
  const peores = v.filter((x) => x >= real).length;
  console.log(`\n  RESUMEN barajado (b): las 20 tiradas van de ${f2(v[0])} a ${f2(v[v.length - 1])} · mediana ${f2(v[Math.floor(v.length / 2)])} · media ${f2(media(v))}`);
  console.log(`  la señal DE VERDAD da ${f2(real)} → ${peores} de las 20 tiradas barajadas llegan a ese número o lo pasan`);
  console.log(`  (el listón del envase vacío en esos mismos días es ${f2(ratio(univA))})`);
}

// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"=".repeat(104)}`);
console.log("  RESUMEN DE LA LENTE 3");
console.log(`${"=".repeat(104)}`);
console.log(`  puertas abiertas aquí: ${CANDIDATOS.length} números candidatos × 1 forma de cortar × ${NB} montones × 2 envases = ${CANDIDATOS.length * NB * 2} celdas, + 40 barajados`);
console.log(`  la señal: RATIO ${f2(ratio(señalA))} (A) / ${f2(ratio(señalB))} (B) · listón en sus mismos días ${f2(ratio(univA))} / ${f2(ratio(univB))}`);
console.log(`  el mejor impostor: ` + Object.entries(impostores).filter(([c]) => c !== "curva").sort((a, b) => b[1].ratio - a[1].ratio).slice(0, 2).map(([c, v]) => `${c} ${f2(v.ratio)}`).join(" · "));
console.log(`  calls ${f2(ladoRes.AC.ratio)} (listón ${f2(ladoRes.AC.lisRatio)}) · puts ${f2(ladoRes.AP.ratio)} (listón ${f2(ladoRes.AP.lisRatio)})`);
console.log(`  minutos: ${((Date.now() - t0) / 60000).toFixed(1)}`);
console.log(`${"=".repeat(104)}\n`);

writeFileSync("scripts/l3-curva-ticker-lente3.json", JSON.stringify({
  senal: { A: { n: señalA.n, acierto: acierto(señalA), ratio: ratio(señalA) }, B: { n: señalB.n, acierto: acierto(señalB), ratio: ratio(señalB) } },
  liston: { A: { n: univA.n, acierto: acierto(univA), ratio: ratio(univA) }, B: { n: univB.n, acierto: acierto(univB), ratio: ratio(univB) } },
  impostores, solapes, perfil, lados: ladoRes,
  barajadoDesplazamiento: rsDespl, barajadoPermutacion: rsPerm,
}, null, 1), "utf8");
console.log("escrito scripts/l3-curva-ticker-lente3.json");
