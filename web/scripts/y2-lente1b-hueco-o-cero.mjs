// LENTE 1b — EL CERO QUE NADIE ESCRIBIÓ, y si la escalera es peaje en vez de señal.
//
// ═══ DE DÓNDE SALE ESTO ═════════════════════════════════════════════════════════════════════
//
// En scripts/y2-esta-barata-la-opcion.mjs la salida de cada operación se lee así:
//       const salida = grupo[ct.clave]?.[0] ?? 0;    // "sin puja = 0. Dato real."
// Y al contar en scripts/y2-lente1-ventana-al-futuro.mjs sale que de 13,621 salidas:
//       10,903 (80.0%)  el contrato está en el fichero y tiene puja
//            0 ( 0.0%)  el contrato está en el fichero con puja CERO
//        2,718 (20.0%)  el contrato NO ESTÁ en el fichero — y eso se cuenta como perder el 100%
//
// Barriendo 316,937 filas de 189 cadenas: NO EXISTE ni una sola fila con puja 0. La puja más
// baja que aparece en todo el fichero es de 1 centavo. O sea que la frase "sin puja = 0, dato
// real" no describe estos ficheros: aquí un cero NUNCA es un dato, siempre es una ausencia.
//
// ═══ QUÉ SE COMPRUEBA AQUÍ ══════════════════════════════════════════════════════════════════
//
// 1) LA AUSENCIA, ¿ES DE VERDAD UN CERO? Para cada salida ausente se busca EN LA MISMA CADENA,
//    EL MISMO DÍA Y EL MISMO VENCIMIENTO el strike vecino del mismo lado que sí está:
//      · uno MÁS lejos del dinero que el nuestro: si ése cotiza a 3 centavos, el nuestro valía
//        al menos 3 centavos y el −100% es inventado. Es una cota por abajo con precios REALES.
//      · uno MENOS lejos del dinero: cota por arriba, también con precios reales.
//    Ningún modelo. Sólo precios que están escritos en el fichero.
//
// 2) ¿CUÁNTO DEPENDE EL HALLAZGO DE ESE CERO? El ratio es dinero ganado ÷ dinero perdido, y las
//    ausencias son la mayor parte del denominador. Se recalcula el ratio rellenando la ausencia
//    con la cota por abajo real (el vecino más lejano del dinero que sí cotiza).
//
// 3) ¿ES SEÑAL O ES PEAJE? La opción barata paga la misma horquilla por un billete más pequeño.
//    Si la escalera se aplana comprando y vendiendo a PUNTO MEDIO (sin peaje), lo que separa a
//    los montones no es acertar más, es pagar menos. OJO: el punto medio NO ES OPERABLE y no se
//    usa para ningún número de resultado — es sólo el aparato de medida.
//
// 4) El control de rotar tickers dentro del mes, separado en calls y puts.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/y2-lente1b-hueco-o-cero.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const ENVASES = {
  A: { dist: 0.10, dte: 60, salida: 30, etiqueta: "A · 10% fuera · 60 días · salir a los 30 de bolsa" },
  B: { dist: 0.05, dte: 90, salida: 30, etiqueta: "B · 5% fuera · 90 días · salir a los 30 de bolsa" },
};
const ASKMIN = 0.10, TOLK = 0.50, APUESTA = 1000;
const VENTANAS_RV = [20, 60, 120];
const VENT_PCTL = 250, MIN_PCTL = 150, ANOSCAL = 10.6;

const tolDte = (d) => Math.max(6, Math.round(d * 0.28));
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) + "%" : "n/d");
const usd = (n) => (Number.isFinite(n) ? "$" + Math.round(n).toLocaleString("en-US") : "n/d");
const num = (n) => Math.round(n).toLocaleString("en-US");
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const linea = (t) => { console.log(`\n${"═".repeat(106)}\n  ${t}\n${"═".repeat(106)}`); };
const pctl = (v, q) => { if (!v.length) return NaN; const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };

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
function cadena(sym, dia) {
  const k = `${sym}|${dia}`;
  if (cache.has(k)) { const v = cache.get(k); cache.delete(k); cache.set(k, v); return v; }
  const f = `${CDIR}/${sym}_d${dia}.json`;
  let v = null;
  if (existsSync(f)) { try { v = JSON.parse(readFileSync(f, "utf8")); } catch { v = null; } }
  if (cache.size >= 200) cache.delete(cache.keys().next().value);
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
    const dt = dteDe(hoy, e); if (dt < 1) continue;
    const x = Math.abs(dt - objetivo);
    if (x < md) { md = x; mejor = e; dtReal = dt; }
  }
  if (!mejor || md > tolDte(objetivo)) return null;
  return { exp: mejor, dte: dtReal };
}
function cunaDe(c, exp, S) {
  const g = c[exp]; if (!g) return null;
  let K = null, dm = Infinity;
  for (const cl of Object.keys(g)) {
    if (cl.slice(-1) !== "C") continue;
    const k = Number(cl.slice(0, -2)); if (!g[`${k}|P`]) continue;
    const d = Math.abs(k - S); if (d < dm) { dm = d; K = k; }
  }
  if (K == null || Math.abs(K / S - 1) > 0.05) return null;
  const askC = g[`${K}|C`][1], askP = g[`${K}|P`][1];
  if (!(askC > 0) || !(askP > 0)) return null;
  return (askC + askP) / S;
}
function contratoEsquina(c, exp, S, dist, tipo) {
  const g = c[exp]; if (!g) return null;
  const objetivo = tipo === "C" ? S * (1 + dist) : S * (1 - dist);
  let mej = null, dm = Infinity;
  for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== tipo || !(ba[1] >= ASKMIN)) continue;
    const K = Number(cl.slice(0, -2)); const d = Math.abs(K - objetivo);
    if (d < dm) { dm = d; mej = { K, clave: cl, bid: ba[0], ask: ba[1] }; }
  }
  if (!mej) return null;
  const distReal = tipo === "C" ? mej.K / S - 1 : 1 - mej.K / S;
  if (Math.abs(distReal - dist) > dist * TOLK) return null;
  return { ...mej, distReal };
}

/** LOS VECINOS REALES: en la misma cadena, día y vencimiento, el strike del mismo lado más
 *  cercano que SÍ está, uno más lejos del dinero (cota por abajo) y uno más cerca (por arriba). */
function vecinos(grupo, K, tipo) {
  let masLejos = null, masCerca = null;   // {K, bid, ask}
  for (const [cl, ba] of Object.entries(grupo)) {
    if (cl.slice(-1) !== tipo) continue;
    const k = Number(cl.slice(0, -2));
    if (k === K) continue;
    // para una CALL, "más lejos del dinero" = strike MÁS ALTO; para una PUT, más BAJO
    const lejos = tipo === "C" ? k > K : k < K;
    if (lejos) { if (!masLejos || Math.abs(k - K) < Math.abs(masLejos.K - K)) masLejos = { K: k, bid: ba[0], ask: ba[1] }; }
    else { if (!masCerca || Math.abs(k - K) < Math.abs(masCerca.K - K)) masCerca = { K: k, bid: ba[0], ask: ba[1] }; }
  }
  return { masLejos, masCerca };
}

// ════════════════════════════════════════════════════════════════════════════
const OPS = [];
const t0 = Date.now();
for (const sym of TICKERS) {
  const dias = diasPorSim.get(sym);
  const serie = []; const vistos = new Set(); const entradasIdx = [];
  for (let i = 0; i < dias.length; i++) {
    const d = dias[i]; const c = cadena(sym, d);
    if (!c) { serie.push(null); continue; }
    const S = spotOk(c, d);
    if (!S) { serie.push(null); continue; }
    const fila = { d, S, cuna: {}, dte: {}, exp: {} };
    for (const [k, e] of Object.entries(ENVASES)) {
      const eo = expObjetivo(c, d, e.dte); if (!eo) continue;
      fila.exp[k] = eo.exp; fila.dte[k] = eo.dte;
      const u = cunaDe(c, eo.exp, S); if (u != null) fila.cuna[k] = u;
    }
    serie.push(fila);
    const mes = d.slice(0, 6);
    if (!vistos.has(mes)) { vistos.add(mes); entradasIdx.push(i); }
  }
  const ret = new Array(dias.length).fill(null);
  for (let i = 1; i < dias.length; i++) {
    const a = serie[i - 1], b = serie[i];
    if (!a || !b || dteDe(a.d, b.d) > 5) continue;
    const r = Math.log(b.S / a.S);
    if (Math.abs(r) > 0.35) continue;
    ret[i] = r;
  }
  // señal (idéntica al original, ya auditada como limpia en la lente 1)
  const coc = {};
  for (const k of Object.keys(ENVASES)) { coc[k] = {}; for (const w of VENTANAS_RV) coc[k][w] = new Array(dias.length).fill(null); }
  for (let i = 0; i < dias.length; i++) {
    const f = serie[i]; if (!f) continue;
    for (const w of VENTANAS_RV) {
      const v = [];
      for (let j = i - 1; j >= 0 && v.length < w; j--) if (ret[j] != null) v.push(ret[j]);
      if (v.length < Math.round(w * 0.8)) continue;
      const s = sd(v); if (!(s > 0)) continue;
      for (const k of Object.keys(ENVASES)) {
        if (f.cuna[k] == null || !f.dte[k]) continue;
        const mov = s * Math.sqrt(Math.max(1, f.dte[k] * 252 / 365));
        if (mov > 0) coc[k][w][i] = f.cuna[k] / mov;
      }
    }
  }
  const percentilar = (s) => {
    const out = new Array(s.length).fill(null);
    for (let i = 0; i < s.length; i++) {
      if (s[i] == null) continue;
      let nn = 0, men = 0;
      for (let j = Math.max(0, i - VENT_PCTL); j < i; j++) { if (s[j] == null) continue; nn++; if (s[j] < s[i]) men++; }
      if (nn >= MIN_PCTL) out[i] = men / nn;
    }
    return out;
  };
  const pc = {};
  for (const k of Object.keys(ENVASES)) { pc[k] = {}; for (const w of VENTANAS_RV) pc[k][w] = percentilar(coc[k][w]); }

  for (const i of entradasIdx) {
    const f = serie[i]; if (!f) continue;
    const c = cadena(sym, dias[i]); if (!c) continue;
    for (const [k, e] of Object.entries(ENVASES)) {
      const exp = f.exp[k]; if (!exp) continue;
      const iSal = i + e.salida;
      for (const tipo of ["C", "P"]) {
        const ct = contratoEsquina(c, exp, f.S, e.dist, tipo);
        if (!ct) continue;
        if (dias[iSal] == null) continue;
        let ds = dias[iSal];
        if (ds >= exp) ds = exp;
        const cs = cadena(sym, ds); if (!cs) continue;
        const grupo = cs[exp]; if (!grupo) continue;
        const presente = Object.prototype.hasOwnProperty.call(grupo, ct.clave);
        const bidSal = presente ? grupo[ct.clave][0] : 0;
        const askSal = presente ? grupo[ct.clave][1] : 0;
        const Ssal = spotOk(cs, ds);
        const vc = presente ? { masLejos: null, masCerca: null } : vecinos(grupo, ct.K, tipo);
        // el rango de strikes que el fichero registra ese día en ese vencimiento
        let minK = Infinity, maxK = -Infinity;
        for (const cl2 of Object.keys(grupo)) { if (cl2.slice(-1) !== tipo) continue; const k2 = Number(cl2.slice(0, -2)); if (k2 < minK) minK = k2; if (k2 > maxK) maxK = k2; }
        const senal = {};
        for (const w of VENTANAS_RV) senal[w] = pc[k][w][i];
        OPS.push({
          env: k, sym, dia: dias[i], ano: dias[i].slice(0, 4), mes: dias[i].slice(0, 6), tipo,
          K: ct.K, ask: ct.ask, bid: ct.bid, distReal: ct.distReal, dteReal: f.dte[k],
          bidSal, askSal, presente: presente ? 1 : 0, senal,
          Sent: f.S, Ssal: Ssal ?? null,
          // moneyness a la salida: >1 = fuera del dinero (para call K/S, para put S/K)
          fueraSal: Ssal ? (tipo === "C" ? ct.K / Ssal : Ssal / ct.K) : null,
          dentroRango: ct.K >= minK && ct.K <= maxK ? 1 : 0,
          vecLejosBid: vc.masLejos ? vc.masLejos.bid : null,
          vecCercaBid: vc.masCerca ? vc.masCerca.bid : null,
          diasRestantes: dteDe(ds, exp),
        });
      }
    }
  }
  cache.clear();
  process.stderr.write(`\r   ${sym} · ${num(OPS.length)} ops · ${Math.round((Date.now() - t0) / 1000)}s     `);
}
process.stderr.write("\n");

// ════════════════════════════════════════════════════════════════════════════
const acc = () => ({ n: 0, win: 0, gan: 0, per: 0, max: 0 });
const ratio = (a) => (a.per > 0 ? a.gan / a.per : (a.gan > 0 ? Infinity : NaN));
const acierto = (a) => (a.n ? a.win / a.n : NaN);
function mideCon(v, salidaDe) {
  const a = acc();
  for (const o of v) { const d = APUESTA * ((salidaDe(o) - o.ask) / o.ask); a.n++; if (d > 0) { a.win++; a.gan += d; if (d > a.max) a.max = d; } else a.per += -d; }
  return a;
}
const salBid = (o) => (o.presente ? o.bidSal : 0);
const R = (a) => (a.n ? ratio(a).toFixed(2) : "n/d");

const A = OPS.filter((o) => o.env === "A");
const baseA = A.filter((o) => o.senal[60] != null);
const selA = baseA.filter((o) => o.senal[60] > 0.80);

linea("REPRODUCCIÓN");
console.log(`  envase A sin señal: n=${num(A.length)} · ratio ${R(mideCon(A, salBid))} · acierta ${pct(acierto(mideCon(A, salBid)))}`);
console.log(`  regla >80 rv60d   : n=${num(selA.length)} · ratio ${R(mideCon(selA, salBid))} · acierta ${pct(acierto(mideCon(selA, salBid)))}`);
console.log(`  listón restringido: n=${num(baseA.length)} · ratio ${R(mideCon(baseA, salBid))} · acierta ${pct(acierto(mideCon(baseA, salBid)))}`);

// ── 1) LA AUSENCIA, ¿ES UN CERO? ────────────────────────────────────────────
linea("1 — LA AUSENCIA, ¿ES DE VERDAD UN CERO? (envase A)");
const aus = A.filter((o) => !o.presente);
console.log(`  salidas ausentes del fichero: ${num(aus.length)} de ${num(A.length)} (${pct(aus.length / A.length)})`);
console.log(`  de ellas, el strike cae DENTRO del rango de strikes que el fichero sí registra ese día: ${pct(media(aus.map((o) => o.dentroRango)))}`);
{
  const conLejos = aus.filter((o) => o.vecLejosBid != null);
  const conCerca = aus.filter((o) => o.vecCercaBid != null);
  console.log(`\n  COTA POR ABAJO con precios reales — el strike vecino MÁS lejos del dinero que sí cotiza:`);
  console.log(`    ausencias con ese vecino presente: ${num(conLejos.length)} (${pct(conLejos.length / aus.length)})`);
  if (conLejos.length) {
    const b = conLejos.map((o) => o.vecLejosBid);
    console.log(`    su puja: mediana $${pctl(b, 0.5).toFixed(2)} · media $${media(b).toFixed(2)} · peor 10% $${pctl(b, 0.9).toFixed(2)}`);
    console.log(`    → en esas ${num(conLejos.length)} operaciones el contrato valía AL MENOS eso, y el guion las apuntó a 0.`);
    console.log(`    esa cota como fracción de lo pagado: mediana ${pct(pctl(conLejos.map((o) => o.vecLejosBid / o.ask), 0.5))} · media ${pct(media(conLejos.map((o) => o.vecLejosBid / o.ask)))}`);
  }
  console.log(`\n  COTA POR ARRIBA — el strike vecino MENOS lejos del dinero que sí cotiza:`);
  console.log(`    ausencias con ese vecino presente: ${num(conCerca.length)} (${pct(conCerca.length / aus.length)})`);
  if (conCerca.length) {
    const b = conCerca.map((o) => o.vecCercaBid);
    console.log(`    su puja: mediana $${pctl(b, 0.5).toFixed(2)} · media $${media(b).toFixed(2)}`);
  }
  const dist = aus.filter((o) => o.fueraSal != null).map((o) => o.fueraSal);
  console.log(`\n  a la salida, esos contratos estaban fuera del dinero: mediana ${pct(pctl(dist, 0.5) - 1)} · el 10% menos fuera ${pct(pctl(dist, 0.10) - 1)}`);
  console.log(`  días que les quedaban al vencimiento: mediana ${pctl(aus.map((o) => o.diasRestantes), 0.5)}`);
}
// referencia: ¿qué valen los contratos PRESENTES a esa misma distancia?
{
  console.log(`\n  REFERENCIA — lo que cotizan los contratos que SÍ están, a la misma distancia del dinero:`);
  console.log(`  | fuera del dinero a la salida | n presentes | puja mediana | puja media | % de lo pagado (mediana) | n ausentes |`);
  console.log(`  |---|---|---|---|---|---|`);
  const cortes = [[1.00, 1.05], [1.05, 1.10], [1.10, 1.20], [1.20, 1.40], [1.40, 9]];
  for (const [lo, hi] of cortes) {
    const p = A.filter((o) => o.presente && o.fueraSal != null && o.fueraSal >= lo && o.fueraSal < hi);
    const q = A.filter((o) => !o.presente && o.fueraSal != null && o.fueraSal >= lo && o.fueraSal < hi);
    if (!p.length && !q.length) continue;
    console.log(`  | ${((lo - 1) * 100).toFixed(0)}%–${((hi - 1) * 100).toFixed(0)}% | ${num(p.length)} | ${p.length ? "$" + pctl(p.map((o) => o.bidSal), 0.5).toFixed(2) : "n/d"} | ${p.length ? "$" + media(p.map((o) => o.bidSal)).toFixed(2) : "n/d"} | ${p.length ? pct(pctl(p.map((o) => o.bidSal / o.ask), 0.5)) : "n/d"} | ${num(q.length)} |`);
  }
}

// ── 2) SENSIBILIDAD DEL RATIO AL RELLENO ───────────────────────────────────
linea("2 — ¿CUÁNTO DEPENDE EL HALLAZGO DE ESE CERO?");
{
  const perTot = mideCon(A, salBid).per;
  const perAus = mideCon(aus, salBid).per;
  console.log(`  del dinero PERDIDO en el envase A (el denominador del ratio), las salidas ausentes son el ${pct(perAus / perTot)}`);
  const rellenos = [
    ["cero (lo que hace el guion)", (o) => (o.presente ? o.bidSal : 0)],
    ["1 centavo (la puja más baja que existe en el fichero)", (o) => (o.presente ? o.bidSal : 0.01)],
    ["la cota por abajo real: el vecino más lejano que sí cotiza", (o) => (o.presente ? o.bidSal : (o.vecLejosBid ?? 0))],
    ["la cota por arriba real: el vecino menos lejano que sí cotiza", (o) => (o.presente ? o.bidSal : (o.vecCercaBid ?? o.vecLejosBid ?? 0))],
  ];
  console.log(`\n  | cómo se rellena la ausencia | listón A | acierta | regla >80 | acierta |`);
  console.log(`  |---|---|---|---|---|`);
  for (const [et, fn] of rellenos) {
    const l = mideCon(baseA, fn), s = mideCon(selA, fn);
    console.log(`  | ${et} | ${R(l)} | ${pct(acierto(l))} | **${R(s)}** | ${pct(acierto(s))} |`);
  }
}

// ── 3) ¿SEÑAL O PEAJE? ──────────────────────────────────────────────────────
linea("3 — ¿ES SEÑAL O ES PEAJE?  (punto medio: APARATO DE MEDIDA, no operable)");
console.log(`  La opción barata paga la misma horquilla por un billete más pequeño. Si al quitar el`);
console.log(`  peaje la escalera se aplana, lo que separa los montones es el coste, no el acierto.`);
{
  const QUINTIL = (p) => Math.min(4, Math.floor(p * 5));
  const ETQ = ["1 · más BARATO", "2", "3 · el medio", "4", "5 · más CARO"];
  const entMid = (o) => (o.bid + o.ask) / 2;
  const salMid = (o) => (o.presente ? (o.bidSal + o.askSal) / 2 : 0);
  const mideMid = (v) => { const a = acc(); for (const o of v) { const d = APUESTA * ((salMid(o) - entMid(o)) / entMid(o)); a.n++; if (d > 0) { a.win++; a.gan += d; } else a.per += -d; } return a; };
  console.log(`\n  | montón | n | ratio AL ASK/BID (operable) | acierta | ratio a punto medio (sin peaje) | acierta | peaje de ida y vuelta |`);
  console.log(`  |---|---|---|---|---|---|---|`);
  for (let q = 0; q < 5; q++) {
    const v = baseA.filter((o) => QUINTIL(o.senal[60]) === q);
    const a = mideCon(v, salBid), m = mideMid(v);
    const peaje = media(v.map((o) => (o.ask - o.bid) / ((o.bid + o.ask) / 2)));
    console.log(`  | ${ETQ[q]} | ${num(a.n)} | **${R(a)}** | ${pct(acierto(a))} | ${R(m)} | ${pct(acierto(m))} | ${pct(peaje)} |`);
  }
  const s = baseA.filter((o) => o.senal[60] > 0.80);
  console.log(`  regla >80: operable ${R(mideCon(s, salBid))} · a punto medio ${R(mideMid(s))} · listón a punto medio ${R(mideMid(baseA))}`);
}

// ── 4) ROTACIÓN DENTRO DEL MES, SEPARANDO CALLS Y PUTS ─────────────────────
linea("4 — ROTAR LOS TICKERS DENTRO DEL MISMO MES, calls y puts por separado");
console.log(`  Se conserva CUÁNTAS operaciones se hacen cada mes y se cambia CUÁLES (rotación fija).`);
console.log(`  Si el ratio aguanta, la señal está eligiendo el MES, no la empresa.`);
{
  for (const lado of ["C", "P", "todos"]) {
    const v0 = baseA.filter((o) => lado === "todos" || o.tipo === lado);
    const porMes = new Map();
    for (const o of v0) { if (!porMes.has(o.mes)) porMes.set(o.mes, []); porMes.get(o.mes).push(o); }
    const real = v0.filter((o) => o.senal[60] > 0.80);
    const fila = [];
    for (const desp of [1, 3, 7]) {
      const ctrl = [];
      for (const [, v] of porMes) {
        const orden = [...v].sort((a, b) => (a.sym + a.tipo).localeCompare(b.sym + b.tipo));
        const idxs = orden.map((o, j) => (o.senal[60] > 0.80 ? j : -1)).filter((x) => x >= 0);
        for (const j of idxs) ctrl.push(orden[(j + desp) % orden.length]);
      }
      fila.push(`${R(mideCon(ctrl, salBid))}`);
    }
    const a = mideCon(real, salBid), l = mideCon(v0, salBid);
    console.log(`  ${lado === "C" ? "calls " : lado === "P" ? "puts  " : "todos "}: señal real ${R(a)} (acierta ${pct(acierto(a))}, n=${num(a.n)}) · rotado 1/3/7 ${fila.join(" / ")} · sin señal ${R(l)} (acierta ${pct(acierto(l))})`);
  }
}

// ── 5) EL PUENTE: si lo que elige es el MES, que lo elija UNA SOLA VEZ ─────
linea("5 — EL PUENTE: convertirlo en un interruptor de MERCADO, no en un selector de empresas");
console.log(`  La prueba 4 dice que lo que la señal acierta es el mes. Entonces la forma honesta de`);
console.log(`  usarla no es mirar 40 cadenas y elegir cuáles: es mirar cuántas empresas están caras`);
console.log(`  ese mes y, si son bastantes, comprar TODO. Una decisión al mes en vez de cuarenta.`);
console.log(`  El interruptor se calcula con las mismas señales, todas de días anteriores.`);
{
  // cuántos de los tickers con señal ese mes están por encima del percentil 80
  const porMes = new Map();
  for (const o of baseA) { if (!porMes.has(o.mes)) porMes.set(o.mes, []); porMes.get(o.mes).push(o); }
  const fraccion = new Map();
  for (const [m, v] of porMes) {
    const sim = new Map();
    for (const o of v) if (!sim.has(o.sym)) sim.set(o.sym, o.senal[60]);
    const vals = [...sim.values()];
    fraccion.set(m, vals.filter((x) => x > 0.80).length / vals.length);
  }
  console.log(`\n  | interruptor: % de empresas caras ese mes | meses | n | ops/año | ratio | acierta | calls | puts |`);
  console.log(`  |---|---|---|---|---|---|---|---|`);
  for (const u of [0.15, 0.25, 0.35, 0.50]) {
    const meses = [...fraccion.entries()].filter(([, f]) => f >= u).map(([m]) => m);
    const set = new Set(meses);
    const v = baseA.filter((o) => set.has(o.mes));
    if (!v.length) continue;
    const a = mideCon(v, salBid);
    const cc = mideCon(v.filter((o) => o.tipo === "C"), salBid), pp = mideCon(v.filter((o) => o.tipo === "P"), salBid);
    console.log(`  | ≥ ${(u * 100).toFixed(0)}% | ${meses.length} de ${fraccion.size} | ${num(a.n)} | ${(a.n / ANOSCAL).toFixed(0)} | **${R(a)}** | ${pct(acierto(a))} | ${R(cc)} | ${R(pp)} |`);
  }
  // el mismo interruptor, sólo calls, y año a año
  const meses = new Set([...fraccion.entries()].filter(([, f]) => f >= 0.25).map(([m]) => m));
  const v = baseA.filter((o) => meses.has(o.mes) && o.tipo === "C");
  console.log(`\n  interruptor ≥ 25% + SÓLO CALLS: n=${num(v.length)} (${(v.length / ANOSCAL).toFixed(0)}/año) · ratio ${R(mideCon(v, salBid))} · acierta ${pct(acierto(mideCon(v, salBid)))}`);
  const anos = [...new Set(baseA.map((o) => o.ano))].sort();
  console.log(`  año a año (interruptor ≥ 25%, todo):`);
  for (const y of anos) {
    const s = mideCon(baseA.filter((o) => meses.has(o.mes) && o.ano === y), salBid);
    const l = mideCon(baseA.filter((o) => o.ano === y), salBid);
    console.log(`    ${y}: n=${String(s.n).padStart(4)} · ratio ${R(s).padStart(5)} · (sin interruptor ${R(l)})`);
  }
  const m2 = mideCon(baseA.filter((o) => meses.has(o.mes) && o.ano >= "2021"), salBid);
  const l2 = mideCon(baseA.filter((o) => o.ano >= "2021"), salBid);
  console.log(`  la mitad reciente (2021-2026): interruptor ${R(m2)} (n=${num(m2.n)}) · sin interruptor ${R(l2)}`);
}

// ── 6) FUERA DE MUESTRA EN EL TIEMPO ───────────────────────────────────────
linea("6 — LA MITAD RECIENTE, QUE ES LA ÚNICA FUERA DE MUESTRA QUE HAY");
{
  const t = (f) => { const s = mideCon(selA.filter(f), salBid), l = mideCon(baseA.filter(f), salBid); return `regla ${R(s)} (acierta ${pct(acierto(s))}, n=${num(s.n)}) · listón ${R(l)} (acierta ${pct(acierto(l))})`; };
  console.log(`  2016-2020 : ${t((o) => o.ano <= "2020")}`);
  console.log(`  2021-2026 : ${t((o) => o.ano > "2020")}`);
  console.log(`  2023-2026 : ${t((o) => o.ano >= "2023")}`);
  console.log(`\n  el objetivo del encargo es 1.40. La regla se eligió mirando los diez años enteros.`);
}

console.log(`\n  minutos: ${((Date.now() - t0) / 60000).toFixed(1)}`);
console.log(`${"═".repeat(106)}\n`);
