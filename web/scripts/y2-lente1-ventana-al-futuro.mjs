// LENTE 1 — ¿MIRA AL FUTURO LA VENTANA?  Auditoría de scripts/y2-esta-barata-la-opcion.mjs
//
// ═══ QUÉ SE AUDITA ══════════════════════════════════════════════════════════════════════════
//
// El hallazgo dice: comprar la opción SÓLO cuando está CARA (la cuña dividida por lo que la
// acción se mueve de verdad cae por encima del percentil 80 de sus propios últimos 250 días)
// sube el ratio del envase A de 1.11 a 1.67. La sospecha de oficio es que alguna ventana
// (media, desviación, percentil) incluye el día de la compra o días posteriores.
//
// ═══ CÓMO SE COMPRUEBA — NO LEYENDO, SINO ENVENENANDO EL FUTURO ═════════════════════════════
//
// Leer el código y decir "los índices parecen bien" no vale. Aquí la señal se calcula DOS VECES:
//
//   1) COMO EL ORIGINAL: en un array de toda la historia del ticker, con bucles que van hacia
//      atrás desde el día de la compra.
//   2) A CIEGAS: la misma cuenta, pero a la función se le entrega ÚNICAMENTE el trozo de
//      historia hasta el día anterior. Los días posteriores NO EXISTEN en memoria. Si el código
//      original leyera un solo día del futuro, aquí saldría `undefined` y los dos números no
//      coincidirían.
//
// Se comparan valor a valor las CUATRO piezas: el movimiento real (la desviación), el cociente,
// el percentil del cociente y el percentil de la cuña. Cualquier diferencia por encima de la
// basura decimal se cuenta y se enseña con nombre y fecha.
//
// ═══ Y LAS OTRAS PUERTAS DE ATRÁS ═══════════════════════════════════════════════════════════
//
//   · ¿el envase es el MISMO en los cinco montones? El filtro de "ask ≥ $0.10" puede echar
//     fuera el contrato justo cuando la opción está barata, y entonces los montones no se
//     comparan entre sí: se compara un contrato con otro distinto. Se mide la distancia real,
//     el ask, la horquilla, el plazo y la mezcla de calls/puts montón por montón.
//   · ¿cuántas salidas son un CERO DE VERDAD (hay cadena, hay vencimiento, el contrato cotiza
//     a 0) y cuántas son un contrato que simplemente NO APARECE en el fichero? Lo segundo se
//     está leyendo como pérdida del 100%.
//   · ¿la señal elige TICKER o elige MES? Control: dentro de cada mes, se cambia QUÉ tickers se
//     compran (rotación fija, no Math.random) manteniendo cuántos. Si el ratio aguanta, lo que
//     manda es el calendario y el número de apuestas independientes es mucho menor.
//   · concentración: cuántos meses distintos, y qué queda al quitar los tres mejores.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/y2-lente1-ventana-al-futuro.mjs

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const CIERRES = "scripts/cache-theta/cierres";
const CACHE_SERIE = "scripts/_y2lente1-serie.json";

// ── el envase, COPIADO TAL CUAL del original ────────────────────────────────
const ENVASES = {
  A: { dist: 0.10, dte: 60, salida: 30, etiqueta: "A · 10% fuera · 60 días · salir a los 30 de bolsa" },
  B: { dist: 0.05, dte: 90, salida: 30, etiqueta: "B · 5% fuera · 90 días · salir a los 30 de bolsa" },
};
const ASKMIN = 0.10;
const TOLK = 0.50;
const APUESTA = 1000;
const VENTANAS_RV = [20, 60, 120];
const VENT_PCTL = 250;
const MIN_PCTL = 150;
const ANOSCAL = 10.6;

const tolDte = (d) => Math.max(6, Math.round(d * 0.28));
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) + "%" : "n/d");
const usd = (n) => (Number.isFinite(n) ? "$" + Math.round(n).toLocaleString("en-US") : "n/d");
const num = (n) => Math.round(n).toLocaleString("en-US");
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const linea = (t) => { console.log(`\n${"═".repeat(106)}\n  ${t}\n${"═".repeat(106)}`); };

// ── índice de días por ticker ───────────────────────────────────────────────
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
const TOTDIAS = [...diasPorSim.values()].reduce((a, v) => a + v.length, 0);
console.log(`\n## ${TICKERS.length} tickers · ${num(TOTDIAS)} días de cadena`);
console.log(`## tickers: ${TICKERS.join(" ")}`);

// ── caché LRU (idéntica) ────────────────────────────────────────────────────
const cache = new Map();
const MAXC = 200;
function cadena(sym, dia) {
  const k = `${sym}|${dia}`;
  if (cache.has(k)) { const v = cache.get(k); cache.delete(k); cache.set(k, v); return v; }
  const f = `${CDIR}/${sym}_d${dia}.json`;
  let v = null;
  if (existsSync(f)) { try { v = JSON.parse(readFileSync(f, "utf8")); } catch { v = null; } }
  if (cache.size >= MAXC) cache.delete(cache.keys().next().value);
  cache.set(k, v);
  return v;
}
function spotOk(c, hoy) {
  let exp = null, md = Infinity;
  for (const e of Object.keys(c)) { const d = dteDe(hoy, e); if (d < 1) continue; if (d < md) { md = d; exp = e; } }
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
function expObjetivo(c, hoy, objetivo) {
  let mejor = null, md = Infinity, dtReal = 0;
  for (const e of Object.keys(c)) {
    const dt = dteDe(hoy, e);
    if (dt < 1) continue;
    const x = Math.abs(dt - objetivo);
    if (x < md) { md = x; mejor = e; dtReal = dt; }
  }
  if (!mejor || md > tolDte(objetivo)) return null;
  return { exp: mejor, dte: dtReal };
}
function cunaDe(c, exp, S) {
  const g = c[exp];
  if (!g) return null;
  let K = null, dm = Infinity;
  for (const cl of Object.keys(g)) {
    if (cl.slice(-1) !== "C") continue;
    const k = Number(cl.slice(0, -2));
    if (!g[`${k}|P`]) continue;
    const d = Math.abs(k - S);
    if (d < dm) { dm = d; K = k; }
  }
  if (K == null) return null;
  if (Math.abs(K / S - 1) > 0.05) return null;
  const askC = g[`${K}|C`][1], askP = g[`${K}|P`][1];
  if (!(askC > 0) || !(askP > 0)) return null;
  return (askC + askP) / S;
}
function contratoEsquina(c, exp, S, dist, tipo) {
  const g = c[exp];
  if (!g) return null;
  const objetivo = tipo === "C" ? S * (1 + dist) : S * (1 - dist);
  let mej = null, dm = Infinity;
  for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== tipo) continue;
    if (!(ba[1] >= ASKMIN)) continue;
    const K = Number(cl.slice(0, -2));
    const d = Math.abs(K - objetivo);
    if (d < dm) { dm = d; mej = { K, clave: cl, bid: ba[0], ask: ba[1] }; }
  }
  if (!mej) return null;
  const distReal = tipo === "C" ? mej.K / S - 1 : 1 - mej.K / S;
  if (Math.abs(distReal - dist) > dist * TOLK) return null;
  return { ...mej, distReal };
}
// El contrato SIN el filtro del ask — para saber si el filtro cambia el envase por montón
function contratoSinFiltro(c, exp, S, dist, tipo) {
  const g = c[exp];
  if (!g) return null;
  const objetivo = tipo === "C" ? S * (1 + dist) : S * (1 - dist);
  let mej = null, dm = Infinity;
  for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== tipo) continue;
    const K = Number(cl.slice(0, -2));
    const d = Math.abs(K - objetivo);
    if (d < dm) { dm = d; mej = { K, clave: cl, bid: ba[0], ask: ba[1] }; }
  }
  if (!mej) return null;
  const distReal = tipo === "C" ? mej.K / S - 1 : 1 - mej.K / S;
  if (Math.abs(distReal - dist) > dist * TOLK) return null;
  return { ...mej, distReal };
}

// ════════════════════════════════════════════════════════════════════════════
// LAS DOS IMPLEMENTACIONES DE LA SEÑAL
// ════════════════════════════════════════════════════════════════════════════

// (1) LA DEL ORIGINAL — vectorizada sobre TODA la historia del ticker.
function senalOriginal(dias, serie, ret) {
  const n = dias.length;
  const coc = {}, cunaSerie = {}, rvSerie = {};
  for (const k of Object.keys(ENVASES)) { coc[k] = {}; for (const w of VENTANAS_RV) coc[k][w] = new Array(n).fill(null); }
  for (const w of VENTANAS_RV) rvSerie[w] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const f = serie[i];
    if (!f) continue;
    for (const w of VENTANAS_RV) {
      const v = [];
      for (let j = i - 1; j >= 0 && v.length < w; j--) if (ret[j] != null) v.push(ret[j]);
      if (v.length < Math.round(w * 0.8)) continue;
      const s = sd(v);
      if (!(s > 0)) continue;
      rvSerie[w][i] = s;
      for (const k of Object.keys(ENVASES)) {
        if (f.cuna[k] == null || !f.dte[k]) continue;
        const diasBolsa = Math.max(1, f.dte[k] * 252 / 365);
        const mov = s * Math.sqrt(diasBolsa);
        if (!(mov > 0)) continue;
        coc[k][w][i] = f.cuna[k] / mov;
      }
    }
  }
  for (const k of Object.keys(ENVASES)) cunaSerie[k] = serie.map((f) => (f && f.cuna[k] != null ? f.cuna[k] : null));
  const percentilar = (s) => {
    const out = new Array(s.length).fill(null);
    for (let i = 0; i < s.length; i++) {
      if (s[i] == null) continue;
      let nn = 0, menores = 0;
      for (let j = Math.max(0, i - VENT_PCTL); j < i; j++) { if (s[j] == null) continue; nn++; if (s[j] < s[i]) menores++; }
      if (nn < MIN_PCTL) continue;
      out[i] = menores / nn;
    }
    return out;
  };
  const pc = {}, pcCuna = {}, pcRv = {};
  for (const k of Object.keys(ENVASES)) { pc[k] = {}; for (const w of VENTANAS_RV) pc[k][w] = percentilar(coc[k][w]); }
  for (const k of Object.keys(ENVASES)) pcCuna[k] = percentilar(cunaSerie[k]);
  for (const w of VENTANAS_RV) pcRv[w] = percentilar(rvSerie[w]);
  return { coc, rvSerie, pc, pcCuna, pcRv };
}

// (2) A CIEGAS — recibe SÓLO el pasado. `serieCorte` llega hasta hoy (índice m-1) y `retCorte`
//     se corta un día ANTES: el retorno de hoy ni siquiera está en memoria. Si el original
//     leyera el futuro, este número saldría distinto (o NaN).
function senalCiega(serieCorte, retCorte, k, w) {
  const m = serieCorte.length;           // el día de hoy es el índice m-1
  const hoy = m - 1;
  const rvEn = (i) => {                  // i sólo puede ser ≤ hoy; usa retCorte[j] con j ≤ i-1
    const v = [];
    for (let j = i - 1; j >= 0 && v.length < w; j--) { const r = retCorte[j]; if (r != null && r !== undefined) v.push(r); }
    if (v.length < Math.round(w * 0.8)) return null;
    const s = sd(v);
    return s > 0 ? s : null;
  };
  const cocEn = (i) => {
    const f = serieCorte[i];
    if (!f || f.cuna[k] == null || !f.dte[k]) return null;
    const s = rvEn(i);
    if (s == null) return null;
    const mov = s * Math.sqrt(Math.max(1, f.dte[k] * 252 / 365));
    return mov > 0 ? f.cuna[k] / mov : null;
  };
  const cunaEn = (i) => { const f = serieCorte[i]; return f && f.cuna[k] != null ? f.cuna[k] : null; };
  const pctlDe = (fn) => {
    const x = fn(hoy);
    if (x == null) return null;
    let nn = 0, menores = 0;
    for (let j = Math.max(0, hoy - VENT_PCTL); j < hoy; j++) {
      const y = fn(j);
      if (y == null) continue;
      nn++; if (y < x) menores++;
    }
    return nn < MIN_PCTL ? null : menores / nn;
  };
  return { rv: rvEn(hoy), coc: cocEn(hoy), pcCoc: pctlDe(cocEn), pcCuna: pctlDe(cunaEn) };
}

// ════════════════════════════════════════════════════════════════════════════
// PASE ÚNICO
// ════════════════════════════════════════════════════════════════════════════
const OPS = [];
let entradas = 0, sinSpot = 0, sinContrato = 0, huecos = 0;
let comparaciones = 0, discrepancias = 0;
const ejemplosDisc = [];
const audSpot = [];
// contabilidad del "hueco vs cero"
let salCeroReal = 0, salAusente = 0, salPositiva = 0;

const t0 = Date.now();
for (const sym of TICKERS) {
  const dias = diasPorSim.get(sym);
  const cl = existsSync(`${CIERRES}/${sym}.json`) ? JSON.parse(readFileSync(`${CIERRES}/${sym}.json`, "utf8")) : null;

  const serie = [];
  const vistos = new Set();
  const entradasIdx = [];
  for (let i = 0; i < dias.length; i++) {
    const d = dias[i];
    const c = cadena(sym, d);
    if (!c) { serie.push(null); continue; }
    const S = spotOk(c, d);
    if (!S) { sinSpot++; serie.push(null); continue; }
    if (cl && cl[d] > 0) audSpot.push(Math.abs(S / cl[d] - 1));
    const fila = { d, S, cuna: {}, dte: {}, exp: {} };
    for (const [k, e] of Object.entries(ENVASES)) {
      const eo = expObjetivo(c, d, e.dte);
      if (!eo) continue;
      fila.exp[k] = eo.exp; fila.dte[k] = eo.dte;
      const u = cunaDe(c, eo.exp, S);
      if (u != null) fila.cuna[k] = u;
    }
    serie.push(fila);
    const mes = d.slice(0, 6);
    if (!vistos.has(mes)) { vistos.add(mes); entradasIdx.push(i); }
  }

  const ret = new Array(dias.length).fill(null);
  for (let i = 1; i < dias.length; i++) {
    const a = serie[i - 1], b = serie[i];
    if (!a || !b) continue;
    if (dteDe(a.d, b.d) > 5) continue;
    const r = Math.log(b.S / a.S);
    if (Math.abs(r) > 0.35) continue;
    ret[i] = r;
  }

  const O = senalOriginal(dias, serie, ret);

  // ── LA PRUEBA DEL ENVENENAMIENTO ────────────────────────────────────────
  // Para CADA día de entrada se recalcula la señal con una función que sólo recibe el pasado.
  for (const i of entradasIdx) {
    if (!serie[i]) continue;
    const serieCorte = serie.slice(0, i + 1);   // hasta hoy incluido
    const retCorte = ret.slice(0, i);           // hasta AYER: el retorno de hoy no existe
    for (const k of Object.keys(ENVASES)) for (const w of VENTANAS_RV) {
      const ci = senalCiega(serieCorte, retCorte, k, w);
      const pares = [
        ["rv", O.rvSerie[w][i], ci.rv],
        ["cociente", O.coc[k][w][i], ci.coc],
        ["percentil del cociente", O.pc[k][w][i], ci.pcCoc],
      ];
      if (w === VENTANAS_RV[0]) pares.push(["percentil de la cuña", O.pcCuna[k][i], ci.pcCuna]);
      for (const [et, a, b] of pares) {
        comparaciones++;
        const ok = (a == null && b == null) || (a != null && b != null && Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a)));
        if (!ok) {
          discrepancias++;
          if (ejemplosDisc.length < 12) ejemplosDisc.push(`${sym} ${dias[i]} envase ${k} ventana ${w} · ${et}: original ${a} · a ciegas ${b}`);
        }
      }
    }
  }

  // ── las operaciones, con diagnóstico ────────────────────────────────────
  for (const i of entradasIdx) {
    const f = serie[i];
    if (!f) continue;
    const c = cadena(sym, dias[i]);
    if (!c) continue;
    entradas++;
    for (const [k, e] of Object.entries(ENVASES)) {
      const exp = f.exp[k];
      if (!exp) { sinContrato++; continue; }
      const iSal = i + e.salida;
      for (const tipo of ["C", "P"]) {
        const ct = contratoEsquina(c, exp, f.S, e.dist, tipo);
        const sf = contratoSinFiltro(c, exp, f.S, e.dist, tipo);
        if (!ct) { sinContrato++; continue; }
        if (dias[iSal] == null) { huecos++; continue; }
        let ds = dias[iSal], trunc = 0;
        if (ds >= exp) { ds = exp; trunc = 1; }
        const cs = cadena(sym, ds);
        if (!cs) { huecos++; continue; }
        const grupo = cs[exp];
        if (!grupo) { huecos++; continue; }
        const presente = Object.prototype.hasOwnProperty.call(grupo, ct.clave);
        const salida = grupo[ct.clave]?.[0] ?? 0;
        if (!presente) salAusente++; else if (salida > 0) salPositiva++; else salCeroReal++;
        const senal = {}, sRv = {};
        for (const w of VENTANAS_RV) { senal[w] = O.pc[k][w][i]; sRv[w] = O.pcRv[w][i]; }
        OPS.push({
          env: k, sym, dia: dias[i], ano: dias[i].slice(0, 4), mes: dias[i].slice(0, 6), tipo,
          ret: (salida - ct.ask) / ct.ask, salida, ask: ct.ask, bid: ct.bid,
          coste: ct.ask / f.S, distReal: ct.distReal, horq: (ct.ask - ct.bid) / ct.ask,
          dteReal: f.dte[k], trunc, cuna: f.cuna[k] ?? null, senal, sCuna: O.pcCuna[k][i], sRv,
          presente: presente ? 1 : 0,
          // ¿el filtro del ask cambió el contrato?
          filtroCambio: sf && sf.clave !== ct.clave ? 1 : 0,
        });
      }
    }
  }
  cache.clear();
  process.stderr.write(`\r   ${sym} · ${num(OPS.length)} operaciones · ${num(comparaciones)} comparaciones · ${Math.round((Date.now() - t0) / 1000)}s     `);
}
process.stderr.write("\n");

// ════════════════════════════════════════════════════════════════════════════
linea("PRUEBA 1 — EL ENVENENAMIENTO DEL FUTURO");
console.log(`  Cada señal de cada día de compra recalculada con una función que SÓLO recibe`);
console.log(`  la historia hasta el día anterior. Si el original mirase al futuro, no cuadraría.`);
console.log(`\n  comparaciones hechas : ${num(comparaciones)}`);
console.log(`  DISCREPANCIAS        : ${num(discrepancias)}`);
if (discrepancias) { console.log(`\n  ejemplos:`); for (const e of ejemplosDisc) console.log(`    ${e}`); }
else console.log(`  → la ventana NO mira al futuro. Ni el movimiento real, ni el cociente, ni el percentil.`);

{
  const s = [...audSpot].sort((a, b) => a - b);
  console.log(`\n  EL SPOT contra los cierres reales de disco (${num(s.length)} días de ${num(TOTDIAS)} — sólo hay cierres de 2021 en adelante):`);
  console.log(`    error mediano ${pct(s[s.length >> 1])} · peor 10% ${pct(s[Math.floor(s.length * 0.9)])} · peor 1% ${pct(s[Math.floor(s.length * 0.99)])}`);
}

// ════════════════════════════════════════════════════════════════════════════
const acc = () => ({ n: 0, win: 0, gan: 0, per: 0, max: 0 });
function suma(a, o) { const d = APUESTA * o.ret; a.n++; if (d > 0) { a.win++; a.gan += d; if (d > a.max) a.max = d; } else a.per += -d; }
const ratio = (a) => (a.per > 0 ? a.gan / a.per : (a.gan > 0 ? Infinity : NaN));
const acierto = (a) => (a.n ? a.win / a.n : NaN);
const mide = (v) => { const a = acc(); for (const o of v) suma(a, o); return a; };
const R = (a) => (a.n ? ratio(a).toFixed(2) : "n/d");

linea("REPRODUCCIÓN — el listón y la regla del hallazgo");
for (const k of Object.keys(ENVASES)) {
  const a = mide(OPS.filter((o) => o.env === k));
  console.log(`  envase ${k}: n=${num(a.n)} · ratio ${ratio(a).toFixed(2)} · acierta ${pct(acierto(a))} · ganador ${usd(a.gan / a.win)} · perdedor ${usd(a.per / (a.n - a.win))}`);
}
const baseA = OPS.filter((o) => o.env === "A" && o.senal[60] != null);
const selA = baseA.filter((o) => o.senal[60] > 0.80);
console.log(`\n  regla del hallazgo (envase A, percentil > 80, ventana 60):`);
console.log(`    n=${num(selA.length)} (${(selA.length / ANOSCAL).toFixed(0)}/año) · ratio ${R(mide(selA))} · acierta ${pct(acierto(mide(selA)))}`);
console.log(`    listón restringido: n=${num(baseA.length)} · ratio ${R(mide(baseA))} · acierta ${pct(acierto(mide(baseA)))}`);

// ════════════════════════════════════════════════════════════════════════════
linea("PRUEBA 2 — ¿ES EL MISMO ENVASE EN LOS CINCO MONTONES?");
console.log(`  Si el contrato que se compra cambia de montón a montón, la escalera no compara`);
console.log(`  una señal: compara dos contratos distintos. El sospechoso es el filtro de ask ≥ $0.10.`);
const QUINTIL = (p) => Math.min(4, Math.floor(p * 5));
const ETQ = ["1 · el 20% MÁS BARATO", "2", "3 · el medio", "4", "5 · el 20% MÁS CARO"];
for (const k of ["A", "B"]) {
  const base = OPS.filter((o) => o.env === k && o.senal[60] != null);
  console.log(`\n  ── ENVASE ${k} · ventana de 60 días ──`);
  console.log(`  | montón | n | ratio | acierta | distancia real | ask medio | coste (ask/S) | horquilla | plazo | % calls | filtro cambió contrato | ausentes al salir |`);
  console.log(`  |---|---|---|---|---|---|---|---|---|---|---|---|`);
  for (let q = 0; q < 5; q++) {
    const v = base.filter((o) => QUINTIL(o.senal[60]) === q);
    if (!v.length) continue;
    const a = mide(v);
    console.log(`  | ${ETQ[q]} | ${num(a.n)} | **${R(a)}** | ${pct(acierto(a))} | ${pct(media(v.map((o) => o.distReal)))} | $${media(v.map((o) => o.ask)).toFixed(2)} | ${pct(media(v.map((o) => o.coste)))} | ${pct(media(v.map((o) => o.horq)))} | ${media(v.map((o) => o.dteReal)).toFixed(0)} d | ${pct(v.filter((o) => o.tipo === "C").length / v.length)} | ${pct(media(v.map((o) => o.filtroCambio)))} | ${pct(1 - media(v.map((o) => o.presente)))} |`);
  }
}

linea("PRUEBA 2b — LA ESCALERA CON EL ENVASE IGUALADO");
console.log(`  Se repite la escalera del envase A quedándose SÓLO con los contratos cuya distancia real`);
console.log(`  está entre el 9% y el 11% (el 10% de verdad) y donde el filtro del ask no tocó nada.`);
console.log(`  Si la escalera se cae aquí, lo que separaba era el contrato, no la señal.`);
{
  const base = OPS.filter((o) => o.env === "A" && o.senal[60] != null && o.distReal >= 0.09 && o.distReal <= 0.11 && !o.filtroCambio);
  console.log(`\n  operaciones que sobreviven al igualado: ${num(base.length)} de ${num(OPS.filter((o) => o.env === "A" && o.senal[60] != null).length)}`);
  console.log(`  | montón | n | ratio | acierta | distancia real | ask medio |`);
  console.log(`  |---|---|---|---|---|---|`);
  for (let q = 0; q < 5; q++) {
    const v = base.filter((o) => QUINTIL(o.senal[60]) === q);
    if (!v.length) continue;
    const a = mide(v);
    console.log(`  | ${ETQ[q]} | ${num(a.n)} | **${R(a)}** | ${pct(acierto(a))} | ${pct(media(v.map((o) => o.distReal)))} | $${media(v.map((o) => o.ask)).toFixed(2)} |`);
  }
  const s = mide(base.filter((o) => o.senal[60] > 0.80));
  console.log(`  regla > 80 con el envase igualado: n=${num(s.n)} (${(s.n / ANOSCAL).toFixed(0)}/año) · ratio ${R(s)} · acierta ${pct(acierto(s))} · listón ${R(mide(base))} / ${pct(acierto(mide(base)))}`);
}

// ════════════════════════════════════════════════════════════════════════════
linea("PRUEBA 3 — HUECO O CERO: cómo se lee la salida");
const totSal = salCeroReal + salAusente + salPositiva;
console.log(`  salidas con puja > 0 (el contrato cotiza)                : ${num(salPositiva)} (${pct(salPositiva / totSal)})`);
console.log(`  salidas con el contrato PRESENTE y puja 0 (cero de verdad): ${num(salCeroReal)} (${pct(salCeroReal / totSal)})`);
console.log(`  salidas con el contrato AUSENTE del fichero, leídas como 0: ${num(salAusente)} (${pct(salAusente / totSal)})`);
console.log(`\n  ¿el trato de los ausentes cambia el resultado? Se repite la regla quitándolos:`);
{
  const b2 = baseA.filter((o) => o.presente), s2 = b2.filter((o) => o.senal[60] > 0.80);
  console.log(`    listón sólo con contratos presentes: n=${num(b2.length)} · ratio ${R(mide(b2))} · acierta ${pct(acierto(mide(b2)))}`);
  console.log(`    regla  sólo con contratos presentes: n=${num(s2.length)} · ratio ${R(mide(s2))} · acierta ${pct(acierto(mide(s2)))}`);
}

// ════════════════════════════════════════════════════════════════════════════
linea("PRUEBA 4 — ¿LA SEÑAL ELIGE TICKER O ELIGE MES?");
console.log(`  Control: mes a mes se conserva CUÁNTAS operaciones se hacen, pero se cambia CUÁLES:`);
console.log(`  se rotan los tickers una posición fija dentro de la lista de candidatos de ese mes.`);
console.log(`  Sin Math.random. Si el ratio aguanta, lo que la señal está eligiendo es el CALENDARIO.`);
{
  const porMes = new Map();
  for (const o of baseA) { if (!porMes.has(o.mes)) porMes.set(o.mes, []); porMes.get(o.mes).push(o); }
  for (const desp of [1, 3, 7]) {
    const control = [];
    for (const [, v] of porMes) {
      const orden = [...v].sort((a, b) => (a.sym + a.tipo).localeCompare(b.sym + b.tipo));
      // los índices de los elegidos, desplazados `desp` posiciones dentro del mismo mes
      const idxs = orden.map((o, j2) => (o.senal[60] > 0.80 ? j2 : -1)).filter((x) => x >= 0);
      if (!idxs.length) continue;
      for (const j2 of idxs) control.push(orden[(j2 + desp) % orden.length]);
    }
    const a = mide(control);
    console.log(`    rotando ${desp} posición(es) dentro del mismo mes: n=${num(a.n)} · ratio ${R(a)} · acierta ${pct(acierto(a))}`);
  }
  const a0 = mide(selA);
  console.log(`    la señal de verdad                              : n=${num(a0.n)} · ratio ${R(a0)} · acierta ${pct(acierto(a0))}`);
}

linea("PRUEBA 5 — CONCENTRACIÓN EN EL CALENDARIO");
{
  const porMes = new Map();
  for (const o of selA) { if (!porMes.has(o.mes)) porMes.set(o.mes, []); porMes.get(o.mes).push(o); }
  const filas = [...porMes.entries()].map(([m, v]) => ({ m, a: mide(v) })).sort((x, y) => y.a.gan - x.a.gan);
  const a = mide(selA);
  console.log(`  meses de entrada distintos con al menos una operación: ${filas.length} (de ${new Set(baseA.map((o) => o.mes)).size} posibles)`);
  console.log(`  los 3 meses que más ganan: ${filas.slice(0, 3).map((f) => `${f.m} ${usd(f.a.gan)}`).join(" · ")} — el ${pct(filas.slice(0, 3).reduce((s2, f) => s2 + f.a.gan, 0) / a.gan)} de todo lo ganado`);
  let ac = 0, cuantos = 0;
  for (const f of filas) { if (f.a.gan <= 0) break; ac += f.a.gan; cuantos++; if (ac >= a.gan / 2) break; }
  console.log(`  meses que juntan la mitad de todo lo ganado: ${cuantos}`);
  const quitando3 = selA.filter((o) => !filas.slice(0, 3).some((f) => f.m === o.mes));
  console.log(`  ratio quitando esos 3 meses: ${R(mide(quitando3))} (n=${num(quitando3.length)})`);
  const porTk = new Map();
  for (const o of selA) { if (!porTk.has(o.sym)) porTk.set(o.sym, []); porTk.get(o.sym).push(o); }
  const tk = [...porTk.entries()].map(([s2, v]) => ({ s: s2, a: mide(v) })).sort((x, y) => y.a.gan - x.a.gan);
  let ac2 = 0, c2 = 0;
  for (const t of tk) { if (t.a.gan <= 0) break; ac2 += t.a.gan; c2++; if (ac2 >= a.gan / 2) break; }
  console.log(`  tickers que juntan la mitad de todo lo ganado: ${c2} de ${tk.length}`);
  console.log(`  año a año:`);
  const anos = [...new Set(selA.map((o) => o.ano))].sort();
  for (const y of anos) {
    const s2 = mide(selA.filter((o) => o.ano === y)), l2 = mide(baseA.filter((o) => o.ano === y));
    console.log(`    ${y}: n=${String(s2.n).padStart(4)} · ratio ${R(s2).padStart(5)} · acierta ${pct(acierto(s2)).padStart(6)} · (sin señal ${R(l2)})`);
  }
}

linea("PRUEBA 6 — LA MISMA REGLA EN EL ENVASE B");
{
  const baseB = OPS.filter((o) => o.env === "B" && o.senal[60] != null);
  const selB = baseB.filter((o) => o.senal[60] > 0.80);
  console.log(`  listón B: n=${num(baseB.length)} · ratio ${R(mide(baseB))} · acierta ${pct(acierto(mide(baseB)))}`);
  console.log(`  regla  B: n=${num(selB.length)} (${(selB.length / ANOSCAL).toFixed(0)}/año) · ratio ${R(mide(selB))} · acierta ${pct(acierto(mide(selB)))}`);
}

writeFileSync(CACHE_SERIE, JSON.stringify({ n: OPS.length }));
console.log(`\n  minutos: ${((Date.now() - t0) / 60000).toFixed(1)}`);
console.log(`${"═".repeat(106)}\n`);
