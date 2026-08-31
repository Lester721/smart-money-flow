// ══════════════════════════════════════════════════════════════════════════════════════════════
// «LA CALMA ANTES DEL MOVIMIENTO» — ¿comprar después de una racha tranquila acierta más?
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// QUÉ SE MIDE, EN CRISTIANO
// El envase ya está fijado y no se toca: se compra UNA opción suelta (una pata, pérdida máxima
// = la prima), al ASK real, y se vende al BID real 30 días de bolsa después.
//     ENVASE A — 10% fuera del dinero · 60 días de plazo   (el principal; listón sin señal 1.11)
//     ENVASE B —  5% fuera del dinero · 90 días de plazo   (contraste: más acierto, premio chico)
//
// Lo único que se añade es un FILTRO DE ENTRADA que sólo mira el PRECIO del subyacente — sin
// opciones de por medio. La idea popular: los periodos de calma preceden a los de movimiento.
// Se miden cuatro formas de "calma", cada una parte la muestra en CINCO MONTONES:
//     1. rango20      : (máximo − mínimo de los últimos 20 días) / precio
//     2. sd20/sd120   : la desviación de 20 días dividida por la de 120  (calma RELATIVA al
//                       propio ticker — KO siempre está más quieta que TSLA, y eso hay que anularlo)
//     3. diasSin2     : cuántos días lleva sin un movimiento diario de más del 2%
//     4. rango20/120  : el rango de 20 días contra el de 120 días
//
// LAS DOS DIRECCIONES. Se lee la escalera entera. Si el montón MÁS TRANQUILO gana, la calma
// precede al movimiento. Si gana el MÁS AGITADO, la volatilidad se agrupa y hay que comprar en
// el ruido, no en la calma. Las dos respuestas valen; se informa la que salga.
//
// ── LAS REGLAS DE LA CASA, Y CÓMO SE CUMPLEN AQUÍ ─────────────────────────────────────────────
//  · SE COMPRA AL ASK Y SE VENDE AL BID. Nunca punto medio. Los dos salen de la cadena en disco.
//  · NADA DE MODELOS. El precio del subyacente sale de la PARIDAD PUT-CALL (una identidad de
//    no-arbitraje, no un modelo) y SÓLO EN EL VENCIMIENTO MÁS CERCANO — el fallo que infló el
//    precio en trabajos anteriores fue mirar toda la cadena a la vez, porque los vencimientos
//    lejanos cruzan en el precio A FUTURO, que está más arriba. Se valida contra los cierres
//    reales de disco (scripts/cache-theta/cierres, 2021-2026) y se imprime el error.
//  · UN HUECO NO ES UN CERO. Si falta la cadena del día de salida, o falta el vencimiento entero
//    dentro de ella, la operación SE DESCARTA y se cuenta aparte. Si la cadena está y el contrato
//    no aparece, es que no tiene comprador: vale 0 y se pierde el 100%. Eso es un dato real.
//  · SÓLO EL PASADO. La señal se calcula con la ventana que TERMINA EL DÍA ANTES de la compra.
//    Y los cortes de los cinco montones se recalculan cada mes con los valores de TODOS los días
//    ANTERIORES a ese mes — nunca con la historia entera. Un percentil calculado con todo y
//    aplicado hacia atrás ya convirtió una señal de este proyecto en un selector de ganadoras.
//  · LOS SPLITS, SIN MIRAR AL FUTURO. Los precios de la cadena son SIN AJUSTAR: un 4x1 se ve como
//    una caída del 75% y envenenaría el rango y la desviación durante 120 días. No se usa ninguna
//    tabla de splits (eso metería el futuro por la puerta de atrás): se neutraliza el retorno del
//    propio día cuando pasa del 35%, decisión que se toma ESE día con lo que se ve ESE día.
//
// ── EL CONTROL DEL AZAR (EL BARAJADO) ─────────────────────────────────────────────────────────
// La misma señal con el día equivocado: a cada entrada se le pega el valor de calma que tenía
// ESE MISMO TICKER 13 entradas antes (13 meses). Desplazamiento FIJO, no Math.random. Conserva
// la mezcla de tickers y la forma de la distribución, y rompe sólo el enganche con la fecha.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/y3-la-calma-antes.mjs
// ══════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const CIERRES = "scripts/cache-theta/cierres";
const CACHE_SPOT = "scripts/cache-theta/_y3-spots.json";

const APUESTA = 1000;
const ASKMIN = 0.10;    // la regla del listón
const TOLK = 0.50;      // cuánto puede apartarse el strike disponible de la distancia pedida
const SALIDA = 30;      // días de bolsa hasta vender
const MIN_DIAS_TICKER = 400;   // menos que eso y el ticker no llega ni al calentado de 120 días
const CALENT = 120;     // días de historia necesarios para las medidas
const MIN_PASADO = 1500; // valores pasados exigidos antes de poder cortar los cinco montones
const DESPL_BARAJADO = 13;

const ENVASES = [
  { id: "A", dist: 0.10, dte: 60, et: "10% fuera · 60 días · salir a los 30 de bolsa" },
  { id: "B", dist: 0.05, dte: 90, et: " 5% fuera · 90 días · salir a los 30 de bolsa" },
];

// ── utilidades ────────────────────────────────────────────────────────────────────────────────
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const tolDte = (d) => Math.max(6, Math.round(d * 0.28));
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
// PUNTO para decimales, COMA para miles — Lester vive en Puerto Rico.
const num = (n, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (x) => (100 * x).toFixed(1) + "%";
const dol = (n) => "$" + num(Math.round(n));

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1) EL PRECIO DEL SUBYACENTE, DÍA A DÍA, SACADO DE LA CADENA
// ══════════════════════════════════════════════════════════════════════════════════════════════
/** Paridad put-call en el vencimiento MÁS CERCANO:  S = K + mid(call) − mid(put).  */
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

// índice de días por ticker
const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();
const TODOS = [...diasPorSim.keys()].sort();
const TICKERS = TODOS.filter((t) => diasPorSim.get(t).length >= MIN_DIAS_TICKER);
const TOTDIAS = [...diasPorSim.values()].reduce((a, v) => a + v.length, 0);

console.log(`\n${"═".repeat(102)}`);
console.log("  LA CALMA ANTES DEL MOVIMIENTO — sólo el precio, sin opciones en la señal");
console.log(`${"═".repeat(102)}`);
console.log(`  cadenas en disco : ${TODOS.length} tickers · ${num(TOTDIAS)} días`);
console.log(`  usables aquí     : ${TICKERS.length} tickers con al menos ${MIN_DIAS_TICKER} días (los demás no llegan al calentado de ${CALENT})`);
console.log(`  descartados      : ${TODOS.filter((t) => !TICKERS.includes(t)).join(", ")}`);

// ── el precio, cacheado a disco ────────────────────────────────────────────────────────────────
let SPOT = null;
if (existsSync(CACHE_SPOT)) {
  try { SPOT = JSON.parse(readFileSync(CACHE_SPOT, "utf8")); } catch { SPOT = null; }
  if (SPOT && !TICKERS.every((t) => SPOT[t])) SPOT = null;
}
if (!SPOT) {
  console.log(`\n  Construyendo la serie de precios desde la cadena (paridad put-call, vencimiento más cercano)…`);
  SPOT = {};
  const t0 = Date.now();
  let leidos = 0, fallidos = 0;
  for (const sym of TICKERS) {
    const dias = diasPorSim.get(sym);
    const arr = new Array(dias.length).fill(null);
    for (let i = 0; i < dias.length; i++) {
      const p = `${CDIR}/${sym}_d${dias[i]}.json`;
      let c = null;
      try { c = JSON.parse(readFileSync(p, "utf8")); leidos++; } catch { fallidos++; continue; }
      arr[i] = spotOk(c, dias[i]);
    }
    SPOT[sym] = arr;
    process.stderr.write(`\r   ${sym} · ${num(leidos)} cadenas leídas · ${Math.round((Date.now() - t0) / 1000)}s      `);
  }
  process.stderr.write("\n");
  writeFileSync(CACHE_SPOT, JSON.stringify(SPOT));
  console.log(`  ${num(leidos)} cadenas leídas · ${fallidos} ilegibles · ${((Date.now() - t0) / 60000).toFixed(1)} min · cacheado en ${CACHE_SPOT}`);
}

// ── VALIDACIÓN del precio contra los cierres REALES de disco ──────────────────────────────────
{
  const errs = [];
  let cubiertos = 0, comparados = 0;
  for (const sym of TICKERS) {
    const p = `${CIERRES}/${sym}.json`;
    if (!existsSync(p)) continue;
    cubiertos++;
    let cl = null;
    try { cl = JSON.parse(readFileSync(p, "utf8")); } catch { continue; }
    const dias = diasPorSim.get(sym);
    for (let i = 0; i < dias.length; i++) {
      const real = cl[dias[i]], mio = SPOT[sym][i];
      if (!(real > 0) || !(mio > 0)) continue;
      errs.push(Math.abs(mio / real - 1)); comparados++;
    }
  }
  errs.sort((a, b) => a - b);
  console.log(`\n  VALIDACIÓN del precio deducido contra los cierres reales de disco:`);
  console.log(`    ${cubiertos} tickers con cierres reales · ${num(comparados)} días comparados`);
  console.log(`    error mediano ${(100 * errs[errs.length >> 1]).toFixed(3)}% · peor 10% ${(100 * errs[Math.floor(errs.length * 0.9)]).toFixed(3)}% · peor 1% ${(100 * errs[Math.floor(errs.length * 0.99)]).toFixed(3)}%`);
  console.log(`    días con más de 1% de error: ${pct(errs.filter((x) => x > 0.01).length / errs.length)}`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2) LAS CUATRO MEDIDAS DE CALMA — causales, ventana terminada EL DÍA ANTES
// ══════════════════════════════════════════════════════════════════════════════════════════════
const MEDIDAS = [
  { id: "rango20", et: "rango de 20 días / precio", ordenCalma: "bajo" },
  { id: "sdrel", et: "desviación 20d / desviación 120d", ordenCalma: "bajo" },
  { id: "diasSin2", et: "días sin un movimiento de más del 2%", ordenCalma: "alto" },
  { id: "rango20120", et: "rango de 20 días / rango de 120 días", ordenCalma: "bajo" },
];

let splitsNeutralizados = 0;
const MED = {};   // ticker -> array de objetos (o null) por índice de día
for (const sym of TICKERS) {
  const s = SPOT[sym], n = s.length;
  // retornos, con los splits neutralizados EL PROPIO DÍA (sin tabla, sin futuro)
  const r = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    if (!(s[i] > 0) || !(s[i - 1] > 0)) continue;
    let x = s[i] / s[i - 1] - 1;
    if (Math.abs(x) > 0.35) { splitsNeutralizados++; x = 0; }
    r[i] = x;
  }
  // precio sintético ajustado: se construye hacia delante, cada punto sólo usa pasado y presente
  const cum = new Array(n).fill(null);
  cum[0] = 1;
  for (let i = 1; i < n; i++) cum[i] = r[i] == null ? cum[i - 1] : cum[i - 1] * (1 + r[i]);

  const out = new Array(n).fill(null);
  for (let i = CALENT + 1; i < n; i++) {
    // VENTANA QUE TERMINA EL DÍA ANTES: índices i-20 … i-1  y  i-120 … i-1
    const w20 = cum.slice(i - 20, i), w120 = cum.slice(i - 120, i);
    const r20 = r.slice(i - 20, i).filter((x) => x != null);
    const r120 = r.slice(i - 120, i).filter((x) => x != null);
    if (w20.some((x) => !(x > 0)) || w120.some((x) => !(x > 0))) continue;
    if (r20.length < 18 || r120.length < 110) continue;
    const ref = cum[i - 1];
    const rango20 = (Math.max(...w20) - Math.min(...w20)) / ref;
    const rango120 = (Math.max(...w120) - Math.min(...w120)) / ref;
    const sd20 = sd(r20), sd120 = sd(r120);
    if (!(sd120 > 0) || !(rango120 > 0)) continue;
    let d2 = 0;
    for (let j = i - 1; j >= 1 && d2 < 250; j--) { if (r[j] == null || Math.abs(r[j]) > 0.02) break; d2++; }
    out[i] = { rango20, sdrel: sd20 / sd120, diasSin2: d2, rango20120: rango20 / rango120 };
  }
  MED[sym] = out;
}
console.log(`\n  Medidas calculadas. Retornos neutralizados por parecer split (|mov| > 35%): ${splitsNeutralizados}`);

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3) LAS OPERACIONES — una entrada al mes por ticker, call y put, en los dos envases
// ══════════════════════════════════════════════════════════════════════════════════════════════
const cacheCad = new Map();
const MAXC = 200;
let lecturas = 0;
function cadena(sym, dia) {
  const k = `${sym}|${dia}`;
  if (cacheCad.has(k)) { const v = cacheCad.get(k); cacheCad.delete(k); cacheCad.set(k, v); return v; }
  const f = `${CDIR}/${sym}_d${dia}.json`;
  let v = null;
  if (existsSync(f)) { try { v = JSON.parse(readFileSync(f, "utf8")); lecturas++; } catch { v = null; } }
  if (cacheCad.size >= MAXC) cacheCad.delete(cacheCad.keys().next().value);
  cacheCad.set(k, v);
  return v;
}

const filas = [];                              // una por operación (envase, ticker, día, lado)
const san = { A: nuevoSan(), B: nuevoSan() };
function nuevoSan() { return { n: 0, huecos: 0, grupoAusente: 0, sinContrato: 0, trunc: 0, coste: 0, horq: 0, sinValor: 0 }; }
let entradas = 0, sinSpot = 0, sinMedida = 0;

for (const sym of TICKERS) {
  const dias = diasPorSim.get(sym);
  const vistos = new Set();
  for (let i = 0; i < dias.length; i++) {
    const dia = dias[i], mes = dia.slice(0, 6);
    if (vistos.has(mes)) continue;      // una entrada al mes por ticker (igual que el envase medido)
    vistos.add(mes);
    const S = SPOT[sym][i];
    if (!(S > 0)) { sinSpot++; continue; }
    const m = MED[sym][i];
    if (!m) { sinMedida++; continue; }
    entradas++;
    const c = cadena(sym, dia);
    if (!c) continue;

    for (const env of ENVASES) {
      // vencimiento más cercano al plazo objetivo
      let exp = null, md = Infinity;
      for (const e of Object.keys(c)) { const dt = dteDe(dia, e); if (dt < 1) continue; const x = Math.abs(dt - env.dte); if (x < md) { md = x; exp = e; } }
      if (!exp || md > tolDte(env.dte)) { san[env.id].sinContrato += 2; continue; }
      const g = c[exp];
      for (const tipo of ["C", "P"]) {
        const objetivo = tipo === "C" ? S * (1 + env.dist) : S * (1 - env.dist);
        let mejor = null, dd = Infinity;
        for (const [clave, ba] of Object.entries(g)) {
          if (clave.slice(-1) !== tipo) continue;
          if (!(ba[1] >= ASKMIN)) continue;
          const K = Number(clave.slice(0, -2));
          const d = Math.abs(K - objetivo);
          if (d < dd) { dd = d; mejor = { K, clave, bid: ba[0], ask: ba[1] }; }
        }
        if (!mejor) { san[env.id].sinContrato++; continue; }
        const distReal = tipo === "C" ? mejor.K / S - 1 : 1 - mejor.K / S;
        if (Math.abs(distReal - env.dist) > env.dist * TOLK) { san[env.id].sinContrato++; continue; }

        // salida: 30 días de bolsa, o el vencimiento si llega antes
        let ds = dias[i + SALIDA] ?? null, trunc = 0;
        if (!ds) { san[env.id].huecos++; continue; }
        if (ds >= exp) { ds = exp; trunc = 1; }
        const cs = cadena(sym, ds);
        if (!cs) { san[env.id].huecos++; continue; }
        const grupo = cs[exp];
        if (!grupo) { san[env.id].huecos++; san[env.id].grupoAusente++; continue; }   // HUECO, no cero
        const salida = grupo[mejor.clave]?.[0] ?? 0;   // sin puja = 0. Dato real.

        const s2 = san[env.id];
        s2.n++; s2.trunc += trunc; s2.coste += mejor.ask / S; s2.horq += (mejor.ask - mejor.bid) / mejor.ask;
        if (salida === 0) s2.sinValor++;
        filas.push({
          env: env.id, sym, dia, ano: dia.slice(0, 4), mes, tipo, i,
          ret: (salida - mejor.ask) / mejor.ask, m,
        });
      }
    }
  }
  cacheCad.clear();
  process.stderr.write(`\r   ${sym} · ${num(entradas)} entradas · ${num(filas.length)} operaciones      `);
}
process.stderr.write("\n");

// ══════════════════════════════════════════════════════════════════════════════════════════════
// SANIDAD
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(102)}`);
console.log("  SANIDAD — antes de mirar ningún resultado");
console.log(`${"═".repeat(102)}`);
console.log(`  entradas (una al mes por ticker, con medida disponible) : ${num(entradas)}`);
console.log(`  días de entrada sin precio deducible : ${sinSpot} · sin medida (calentado de ${CALENT} días) : ${num(sinMedida)}`);
for (const env of ENVASES) {
  const s = san[env.id];
  console.log(`\n  ENVASE ${env.id} — ${env.et}`);
  console.log(`    operaciones medidas : ${num(s.n)}`);
  console.log(`    HUECOS descartados  : ${num(s.huecos)} (${pct(s.huecos / (s.huecos + s.n))}) — de ellos ${num(s.grupoAusente)} por faltar el vencimiento entero en la cadena del día de salida`);
  console.log(`    sin contrato que encaje (strike demasiado lejos o ask < $${ASKMIN.toFixed(2)}) : ${num(s.sinContrato)}`);
  console.log(`    coste medio de entrada : ${pct(s.coste / s.n)} del subyacente · horquilla media ${pct(s.horq / s.n)} de la prima`);
  console.log(`    vencen SIN VALOR (bid 0 el día de salida) : ${pct(s.sinValor / s.n)}`);
  console.log(`    salidas truncadas al vencimiento : ${pct(s.trunc / s.n)}`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4) LOS CINCO MONTONES — recalculados CADA MES con los días ANTERIORES a ese mes
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Se usa el valor de TODOS los días de TODOS los tickers anteriores al mes en curso (no sólo los
// días de entrada): más muestra para el corte y, sobre todo, ni un dato del futuro.
//
// ⚠️ POR QUÉ NO SE CORTA CON CUATRO UMBRALES A SECAS. La medida "días sin un movimiento del 2%"
// es un ENTERO y está llena de empates: el valor 0 puede ser el 20% de la muestra él solito. Con
// umbrales, si el corte del 20% cae justo en 0, TODOS los ceros se van al montón 2 y el montón 1
// se queda VACÍO. La primera versión de este script tenía ese fallo y el "mejor montón" resultó
// estar vacío a partir de 2023: la señal no era calma ni ruido, era "el año es anterior a 2023".
// Se arregla puntuando por RANGO MEDIO (qué fracción del pasado queda por debajo del valor,
// repartiendo los empates), que es estable aunque el corte caiga sobre un empate.
const diaAmes = (d) => d.slice(0, 6);
const mesesOrden = [...new Set(filas.map((f) => f.mes))].sort();

// ── el barajado: el valor de calma de la entrada de HACE 13 MESES del mismo ticker ─────────────
{
  const porTk = new Map();
  for (const f of filas) { const k = f.sym; if (!porTk.has(k)) porTk.set(k, []); porTk.get(k).push(f); }
  for (const v of porTk.values()) {
    const dias = [...new Set(v.map((f) => f.dia))].sort();
    const mPorDia = new Map(); for (const f of v) mPorDia.set(f.dia, f.m);
    const idx = new Map(dias.map((d, i) => [d, i]));
    for (const f of v) {
      const j = idx.get(f.dia) - DESPL_BARAJADO;
      f.mb = j >= 0 ? mPorDia.get(dias[j]) : null;
    }
  }
}

// pila de valores pasados, por medida
const pasados = {}; for (const md of MEDIDAS) pasados[md.id] = [];
const todosLosDias = [];
for (const sym of TICKERS) {
  const dias = diasPorSim.get(sym);
  for (let i = 0; i < dias.length; i++) if (MED[sym][i]) todosLosDias.push({ d: dias[i], m: MED[sym][i] });
}
todosLosDias.sort((a, b) => (a.d < b.d ? -1 : 1));

/** cuántos elementos del array ORDENADO son estrictamente menores que v */
function menores(s, v) { let lo = 0, hi = s.length; while (lo < hi) { const m = (lo + hi) >> 1; if (s[m] < v) lo = m + 1; else hi = m; } return lo; }
/** cuántos son menores o iguales */
function menoresIgual(s, v) { let lo = 0, hi = s.length; while (lo < hi) { const m = (lo + hi) >> 1; if (s[m] <= v) lo = m + 1; else hi = m; } return lo; }
/** montón 0-4 por rango medio dentro del pasado ORDENADO (empates repartidos) */
function montonDe(s, v) {
  if (v == null || !s.length) return null;
  const p = (menores(s, v) + menoresIgual(s, v)) / (2 * s.length);
  return Math.min(4, Math.floor(p * 5));
}

const mesesConCorte = new Set();
{
  const filasPorMes = new Map();
  for (const f of filas) { if (!filasPorMes.has(f.mes)) filasPorMes.set(f.mes, []); filasPorMes.get(f.mes).push(f); }
  let p = 0;
  for (const mes of mesesOrden) {
    while (p < todosLosDias.length && diaAmes(todosLosDias[p].d) < mes) {
      for (const md of MEDIDAS) pasados[md.id].push(todosLosDias[p].m[md.id]);
      p++;
    }
    if (pasados[MEDIDAS[0].id].length < MIN_PASADO) continue;
    mesesConCorte.add(mes);
    const ord = {};
    for (const md of MEDIDAS) ord[md.id] = [...pasados[md.id]].sort((a, b) => a - b);
    for (const f of filasPorMes.get(mes)) {
      f.pil = {}; f.pilB = {};
      for (const md of MEDIDAS) {
        f.pil[md.id] = montonDe(ord[md.id], f.m?.[md.id]);
        f.pilB[md.id] = montonDe(ord[md.id], f.mb?.[md.id]);
      }
    }
  }
}
const mesesSinCorte = mesesOrden.filter((m) => !mesesConCorte.has(m));
console.log(`\n  Montones: asignados en ${num(mesesConCorte.size)} meses, con el pasado ordenado de cada mes.`);
console.log(`  Meses descartados por no tener aún ${num(MIN_PASADO)} valores pasados: ${mesesSinCorte.length} (hasta ${mesesSinCorte.length ? mesesSinCorte[mesesSinCorte.length - 1] : "—"})`);

// ── acumuladores ──────────────────────────────────────────────────────────────────────────────
const acc = () => ({ n: 0, win: 0, gan: 0, per: 0, max: 0 });
function suma(a, d) { a.n++; if (d > 0) { a.win++; a.gan += d; if (d > a.max) a.max = d; } else a.per += -d; }
const ratio = (a) => (a.per > 0 ? a.gan / a.per : (a.gan > 0 ? Infinity : NaN));
const acierto = (a) => (a.n ? a.win / a.n : NaN);
const ganMedio = (a) => (a.win ? a.gan / a.win : 0);
const perMedio = (a) => (a.n - a.win ? a.per / (a.n - a.win) : 0);

function escalera(envId, medId, campo = "pil") {
  const p = [acc(), acc(), acc(), acc(), acc()];
  const total = acc();
  for (const f of filas) {
    if (f.env !== envId) continue;
    const k = f[campo]?.[medId];
    if (k == null) continue;
    const d = APUESTA * f.ret;
    suma(p[k], d); suma(total, d);
  }
  return { p, total };
}

// base sin señal (mismas filas, mismos meses con montón asignado)
function base(envId) {
  const t = acc();
  for (const f of filas) { if (f.env !== envId) continue; if (!f.pil) continue; suma(t, APUESTA * f.ret); }
  return t;
}
// base con TODAS las filas (incluidos los meses sin corte) — para comparar con el envase publicado
function baseTodo(envId) {
  const t = acc();
  for (const f of filas) { if (f.env !== envId) continue; suma(t, APUESTA * f.ret); }
  return t;
}

console.log(`\n${"═".repeat(102)}`);
console.log("  EL LISTÓN SIN SEÑAL, en esta tubería");
console.log(`${"═".repeat(102)}`);
console.log(`  | envase | muestra | n | ratio | acierta | ganador medio | perdedor medio |`);
console.log(`  |---|---|---|---|---|---|`);
for (const env of ENVASES) {
  for (const [et, t] of [["todo", baseTodo(env.id)], ["desde que hay cortes", base(env.id)]]) {
    console.log(`  | ${env.id} | ${et} | ${num(t.n)} | **${ratio(t).toFixed(2)}** | ${pct(acierto(t))} | ${dol(ganMedio(t))} | ${dol(perMedio(t))} |`);
  }
}
console.log(`\n  (el envase A publicado: ratio 1.11 · acierta 17.3% · ganador $4,859 · perdedor $916 · n=6,960)`);

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 5) LAS ESCALERAS
// ══════════════════════════════════════════════════════════════════════════════════════════════
const ETIQ = ["1 (más calma)", "2", "3", "4", "5 (más ruido)"];
const ETIQ_ALTO = ["1 (más ruido)", "2", "3", "4", "5 (más calma)"];
const ANOS_TODOS = [...new Set(filas.filter((f) => f.pil).map((f) => f.ano))].sort();

// ── DIAGNÓSTICO OBLIGATORIO: ¿se llenan los cinco montones TODOS los años? ────────────────────
// Sin esto, un montón que se vacía con el tiempo se lee como una señal buenísima cuando en
// realidad sólo está diciendo "el año es antiguo". Pasó en la primera versión de este script.
console.log(`\n${"═".repeat(102)}`);
console.log("  DIAGNÓSTICO — reparto de operaciones por montón y año (envase A). Ningún montón debe vaciarse.");
console.log(`${"═".repeat(102)}`);
for (const md of MEDIDAS) {
  console.log(`\n  ── ${md.et} ──`);
  console.log(`  | montón | ${ANOS_TODOS.join(" | ")} | total |`);
  console.log(`  |---|${ANOS_TODOS.map(() => "---").join("|")}|---|`);
  for (let k = 0; k < 5; k++) {
    const fila = ANOS_TODOS.map((a) => filas.filter((f) => f.env === "A" && f.pil && f.pil[md.id] === k && f.ano === a).length);
    console.log(`  | ${k + 1} | ${fila.join(" | ")} | ${num(fila.reduce((x, y) => x + y, 0))} |`);
  }
}

for (const env of ENVASES) {
  const b = base(env.id);
  console.log(`\n${"═".repeat(102)}`);
  console.log(`  ENVASE ${env.id} — ${env.et}   ·   sin señal: ratio ${ratio(b).toFixed(2)} · acierta ${pct(acierto(b))} · n=${num(b.n)}`);
  console.log(`${"═".repeat(102)}`);
  for (const md of MEDIDAS) {
    const { p } = escalera(env.id, md.id);
    const et = md.ordenCalma === "alto" ? ETIQ_ALTO : ETIQ;
    console.log(`\n  ── ${md.et}  (montón 1 = valor más bajo de la medida) ──`);
    console.log(`  | montón | n | ratio | acierta | ganador medio | perdedor medio | gana | pierde |`);
    console.log(`  |---|---|---|---|---|---|---|---|`);
    for (let k = 0; k < 5; k++) {
      const a = p[k];
      if (!a.n) { console.log(`  | ${et[k]} | 0 | n/d | n/d | n/d | n/d | n/d | n/d |`); continue; }
      console.log(`  | ${et[k]} | ${num(a.n)} | **${ratio(a).toFixed(2)}** | ${pct(acierto(a))} | ${dol(ganMedio(a))} | ${dol(perMedio(a))} | ${dol(a.gan)} | ${dol(a.per)} |`);
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 6) ¿CUÁL SEPARA MÁS?  — y el barajado al lado
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(102)}`);
console.log("  ¿CUÁL SEPARA MÁS? — montón extremo contra montón extremo, y la misma señal BARAJADA");
console.log(`${"═".repeat(102)}`);
console.log(`  | envase | medida | montón 1 ratio/acierto | montón 5 ratio/acierto | separación | barajado M1 | barajado M5 |`);
console.log(`  |---|---|---|---|---|---|---|`);
const candidatos = [];
for (const env of ENVASES) {
  for (const md of MEDIDAS) {
    const { p } = escalera(env.id, md.id);
    const { p: pb } = escalera(env.id, md.id, "pilB");
    const r1 = ratio(p[0]), r5 = ratio(p[4]);
    console.log(`  | ${env.id} | ${md.et} | ${r1.toFixed(2)} / ${pct(acierto(p[0]))} | ${r5.toFixed(2)} / ${pct(acierto(p[4]))} | ${(r1 - r5).toFixed(2)} | ${ratio(pb[0]).toFixed(2)} | ${ratio(pb[4]).toFixed(2)} |`);
    candidatos.push({ env: env.id, md, k: 0, r: r1, a: p[0], ab: pb[0] });
    candidatos.push({ env: env.id, md, k: 4, r: r5, a: p[4], ab: pb[4] });
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 7) EL EXAMEN COMPLETO DEL MEJOR MONTÓN DEL ENVASE A
// ══════════════════════════════════════════════════════════════════════════════════════════════
const ANOS = [...new Set(filas.map((f) => f.ano))].sort();
const CRISIS = ["2018", "2020", "2022", "2025"];

function examen(envId, medId, ks, titulo) {
  const c = acc(), cb = acc();
  const anos = new Map(), tks = new Map();
  let sin2020 = acc(), nMeses = new Set();
  let mayor = null;
  for (const f of filas) {
    if (f.env !== envId || !f.pil) continue;
    const d = APUESTA * f.ret;
    if (ks.includes(f.pil[medId])) {
      suma(c, d); nMeses.add(f.mes);
      if (!anos.has(f.ano)) anos.set(f.ano, acc()); suma(anos.get(f.ano), d);
      if (!tks.has(f.sym)) tks.set(f.sym, acc()); suma(tks.get(f.sym), d);
      const feb2020 = f.dia >= "20200201" && f.dia <= "20200531";
      if (!feb2020) suma(sin2020, d);
      if (!mayor || d > mayor.d) mayor = { d, sym: f.sym, dia: f.dia, tipo: f.tipo };
    }
    if (f.pilB && ks.includes(f.pilB[medId])) suma(cb, d);
  }
  console.log(`\n${"═".repeat(102)}`);
  console.log(`  ${titulo}`);
  console.log(`${"═".repeat(102)}`);
  const b = base(envId);
  console.log(`  SIN señal : n=${num(b.n)} · ratio ${ratio(b).toFixed(2)} · acierta ${pct(acierto(b))} · ganador ${dol(ganMedio(b))} · perdedor ${dol(perMedio(b))}`);
  console.log(`  CON señal : n=${num(c.n)} · ratio ${ratio(c).toFixed(2)} · acierta ${pct(acierto(c))} · ganador ${dol(ganMedio(c))} · perdedor ${dol(perMedio(c))}`);
  console.log(`  BARAJADA  : n=${num(cb.n)} · ratio ${ratio(cb).toFixed(2)} · acierta ${pct(acierto(cb))}   ← la misma señal con el día equivocado (${DESPL_BARAJADO} entradas antes)`);
  const ANOSPAN = Number(ANOS[ANOS.length - 1]) - Number(ANOS[0]) + 1;
  console.log(`\n  FRECUENCIA: ${num(c.n)} operaciones repartidas en ${num(nMeses.size)} meses de los ${num(mesesConCorte.size)} disponibles`);
  console.log(`              → ${num(c.n / ANOSPAN, 0)} operaciones al año de calendario (${ANOS[0]}-${ANOS[ANOS.length - 1]})`);
  if (mayor) {
    console.log(`  mayor billete: ${dol(mayor.d)} (${mayor.sym} ${mayor.tipo}, entrada ${mayor.dia}) · ratio quitándolo: ${((c.gan - mayor.d) / c.per).toFixed(2)}`);
  }
  console.log(`  ratio quitando febrero-mayo de 2020: ${ratio(sin2020).toFixed(2)} (n=${num(sin2020.n)}) — sin señal ese mismo recorte se comprobará abajo`);

  console.log(`\n  Año a año — TODOS los años, aunque la señal no dispare (así se ve si un montón se vacía):`);
  console.log(`  | año | n CON señal | ratio CON señal | acierta | n SIN señal | ratio SIN señal |`);
  console.log(`  |---|---|---|---|---|---|`);
  const anosBase = new Map();
  for (const f of filas) { if (f.env !== envId || !f.pil) continue; if (!anosBase.has(f.ano)) anosBase.set(f.ano, acc()); suma(anosBase.get(f.ano), APUESTA * f.ret); }
  let malos = 0, conta = 0, anosVacios = 0;
  for (const a of ANOS) {
    const y = anos.get(a) ?? acc(), yb = anosBase.get(a);
    if (!yb || !yb.n) continue;
    if (y.n < 10) anosVacios++;
    if (y.n >= 20) { conta++; if (ratio(y) < 1) malos++; }
    console.log(`  | ${a} | ${num(y.n)} | ${y.n >= 10 ? "**" + ratio(y).toFixed(2) + "**" : "n/d"} | ${y.n >= 10 ? pct(acierto(y)) : "n/d"} | ${num(yb.n)} | ${ratio(yb).toFixed(2)} |`);
  }
  console.log(`  años con ratio por debajo de 1: ${malos} de ${conta} (con al menos 20 operaciones)`);
  console.log(`  años en los que la señal casi no dispara (menos de 10 operaciones): ${anosVacios}`);

  console.log(`\n  Las cuatro crisis por separado:`);
  console.log(`  | año | n | ratio CON | ratio SIN |`);
  console.log(`  |---|---|---|---|`);
  for (const a of CRISIS) {
    const y = anos.get(a), yb = anosBase.get(a);
    console.log(`  | ${a} | ${y ? num(y.n) : 0} | ${y && y.n >= 10 ? ratio(y).toFixed(2) : "n/d"} | ${yb ? ratio(yb).toFixed(2) : "n/d"} |`);
  }

  const lt = [...tks.entries()].map(([k, v]) => ({ k, v, r: ratio(v), neto: v.gan - v.per })).sort((a, b) => b.v.gan - a.v.gan);
  let ac = 0, cuantos = 0;
  for (const t of lt) { if (t.v.gan <= 0) break; ac += t.v.gan; cuantos++; if (ac >= c.gan / 2) break; }
  console.log(`\n  Por ticker: ${lt.length} tickers · ${lt.filter((t) => t.r > 1).length} con ratio por encima de 1 · ${cuantos} aportan la mitad de todo lo ganado`);
  console.log(`  mejores: ${lt.slice(0, 5).map((t) => `${t.k} ${t.r.toFixed(2)}`).join(" · ")}`);
  console.log(`  peores : ${lt.slice(-5).map((t) => `${t.k} ${t.r.toFixed(2)}`).join(" · ")}`);
  console.log(`  ratio quitando el ticker que más aporta (${lt[0].k}): ${((c.gan - lt[0].v.gan) / (c.per - lt[0].v.per)).toFixed(2)}`);

  return { c, cb, malos, conta, cuantos, opsAno: c.n / (nMeses.size / 12), sin2020: ratio(sin2020), tks: lt.length };
}

// sin señal, quitando feb-may de 2020 (para comparar de verdad)
{
  for (const env of ENVASES) {
    const t = acc();
    for (const f of filas) { if (f.env !== env.id || !f.pil) continue; if (f.dia >= "20200201" && f.dia <= "20200531") continue; suma(t, APUESTA * f.ret); }
    console.log(`\n  SIN SEÑAL, envase ${env.id}, quitando febrero-mayo de 2020: ratio ${ratio(t).toFixed(2)} (n=${num(t.n)})`);
  }
}

// el mejor montón extremo del envase A
const mejorA = candidatos.filter((x) => x.env === "A").sort((a, b) => b.r - a.r)[0];
const etM = mejorA.k === 0 ? "montón 1 (valor MÁS BAJO)" : "montón 5 (valor MÁS ALTO)";
const infoA = examen("A", mejorA.md.id, [mejorA.k], `EXAMEN — ENVASE A · ${mejorA.md.et} · ${etM}`);
const infoB = examen("B", mejorA.md.id, [mejorA.k], `LA MISMA REGLA EN EL ENVASE B · ${mejorA.md.et} · ${etM}`);

// y por si el mejor de B fuera otro
const mejorB = candidatos.filter((x) => x.env === "B").sort((a, b) => b.r - a.r)[0];
if (mejorB.md.id !== mejorA.md.id || mejorB.k !== mejorA.k) {
  console.log(`\n  (en el envase B el montón que más rinde es otro: ${mejorB.md.et}, montón ${mejorB.k + 1}, ratio ${mejorB.r.toFixed(2)})`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 8) LAS DOS DIRECCIONES, DICHAS EN VOZ ALTA
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(102)}`);
console.log("  ¿CALMA O RUIDO? — la dirección que sale de los datos");
console.log(`${"═".repeat(102)}`);
for (const env of ENVASES) {
  for (const md of MEDIDAS) {
    const { p } = escalera(env.id, md.id);
    const calmaK = md.ordenCalma === "bajo" ? 0 : 4;
    const ruidoK = md.ordenCalma === "bajo" ? 4 : 0;
    const rc = ratio(p[calmaK]), rr = ratio(p[ruidoK]);
    const veredicto = Math.abs(rc - rr) < 0.05 ? "EMPATE" : (rc > rr ? "gana la CALMA" : "gana el RUIDO");
    console.log(`  ${env.id} · ${md.et.padEnd(36)} → calma ${rc.toFixed(2)} (acierta ${pct(acierto(p[calmaK]))}) · ruido ${rr.toFixed(2)} (acierta ${pct(acierto(p[ruidoK]))})  →  ${veredicto}`);
  }
}

// ── monotonía: ¿es una escalera de verdad o un diente suelto? ─────────────────────────────────
console.log(`\n  ¿Es una escalera o un diente suelto? (ratio del montón 1 al 5)`);
for (const env of ENVASES) {
  for (const md of MEDIDAS) {
    const { p } = escalera(env.id, md.id);
    const rs = p.map((a) => ratio(a));
    const as = p.map((a) => acierto(a));
    console.log(`  ${env.id} · ${md.et.padEnd(36)} ratio ${rs.map((x) => x.toFixed(2)).join(" → ")}`);
    console.log(`  ${" ".repeat(4)}${" ".repeat(36)} acierto ${as.map((x) => pct(x)).join(" → ")}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 9) ¿ES LA FECHA O ES EL TICKER?  — el control que decide si esto sirve para algo
// ══════════════════════════════════════════════════════════════════════════════════════════════
// El barajado da 1.19 y el listón 1.13: parte del efecto sobrevive al día equivocado. Eso huele a
// que la señal está eligiendo TICKERS movidos (TSLA, AMD, NVDA) y no MOMENTOS. Se separa así:
// se vuelven a hacer los cinco montones pero comparando cada día contra la PROPIA historia
// pasada de ESE ticker. Si el efecto se mantiene, es el momento. Si se cae, era el ticker.
console.log(`\n${"═".repeat(102)}`);
console.log("  ¿ES LA FECHA O ES EL TICKER? — montones dentro de CADA ticker, contra su propia historia");
console.log(`${"═".repeat(102)}`);
{
  const pasadoTk = {}; for (const sym of TICKERS) { pasadoTk[sym] = {}; for (const md of MEDIDAS) pasadoTk[sym][md.id] = []; }
  const porTkDia = new Map();
  for (const sym of TICKERS) {
    const dias = diasPorSim.get(sym);
    porTkDia.set(sym, dias.map((d, i) => ({ d, m: MED[sym][i] })).filter((x) => x.m));
  }
  const filasOrd = [...filas].sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0));
  const punt = {}; for (const sym of TICKERS) punt[sym] = 0;
  for (const f of filasOrd) {
    const lista = porTkDia.get(f.sym);
    while (punt[f.sym] < lista.length && lista[punt[f.sym]].d < f.dia) {
      for (const md of MEDIDAS) pasadoTk[f.sym][md.id].push(lista[punt[f.sym]].m[md.id]);
      punt[f.sym]++;
    }
    f.pilTk = null;
    if (pasadoTk[f.sym][MEDIDAS[0].id].length < 250) continue;
    f.pilTk = {};
    for (const md of MEDIDAS) {
      const s = [...pasadoTk[f.sym][md.id]].sort((a, b) => a - b);
      f.pilTk[md.id] = montonDe(s, f.m?.[md.id]);
    }
  }
  for (const env of ENVASES) {
    const b = acc(); for (const f of filas) if (f.env === env.id && f.pilTk) suma(b, APUESTA * f.ret);
    console.log(`\n  ENVASE ${env.id} — sin señal, sobre las filas con montón propio: ratio ${ratio(b).toFixed(2)} · acierta ${pct(acierto(b))} · n=${num(b.n)}`);
    for (const md of MEDIDAS) {
      const { p } = escalera(env.id, md.id, "pilTk");
      console.log(`  ${md.et.padEnd(36)} ratio ${p.map((a) => ratio(a).toFixed(2)).join(" → ")}`);
      console.log(`  ${" ".repeat(36)} acierto ${p.map((a) => pct(acierto(a))).join(" → ")}   n ${p.map((a) => a.n).join(" / ")}`);
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 10) LA REGLA EN PALABRAS LLANAS — umbrales FIJOS, sin percentiles ni cortes móviles
// ══════════════════════════════════════════════════════════════════════════════════════════════
// Un umbral fijo no puede mirar al futuro por construcción, y es lo único que Lester puede
// aplicar delante de la pantalla: "¿se ha movido más del 2% en los últimos X días?".
console.log(`\n${"═".repeat(102)}`);
console.log("  LA REGLA EN PALABRAS LLANAS — «compra si hubo un día de más del 2% en los últimos X días»");
console.log(`${"═".repeat(102)}`);
{
  const ANOSPAN = Number(ANOS[ANOS.length - 1]) - Number(ANOS[0]) + 1;
  for (const env of ENVASES) {
    const b = acc(); for (const f of filas) if (f.env === env.id && f.m) suma(b, APUESTA * f.ret);
    console.log(`\n  ENVASE ${env.id} — sin regla: ratio ${ratio(b).toFixed(2)} · acierta ${pct(acierto(b))} · n=${num(b.n)} · ${num(b.n / ANOSPAN)} operaciones al año`);
    console.log(`  | X (días de bolsa) | n | ratio | acierta | ganador medio | perdedor medio | ops/año | ratio del RESTO |`);
    console.log(`  |---|---|---|---|---|---|---|---|`);
    for (const X of [1, 2, 3, 5, 8, 13, 21]) {
      const s = acc(), r = acc();
      for (const f of filas) { if (f.env !== env.id || !f.m) continue; suma(f.m.diasSin2 < X ? s : r, APUESTA * f.ret); }
      console.log(`  | menos de ${X} | ${num(s.n)} | **${ratio(s).toFixed(2)}** | ${pct(acierto(s))} | ${dol(ganMedio(s))} | ${dol(perMedio(s))} | ${num(s.n / ANOSPAN)} | ${ratio(r).toFixed(2)} |`);
    }
  }
  // el desglose completo de cada umbral fijo, en los DOS envases
  for (const env of ENVASES) {
    for (const X of [1, 2, 3, 5]) {
      const anos2 = new Map(), tks2 = new Map(), tot = acc(), sin20 = acc(), baraj = acc();
      const mit = [acc(), acc()];
      let mayor = null;
      for (const f of filas) {
        if (f.env !== env.id || !f.m) continue;
        const d = APUESTA * f.ret;
        if (f.mb && f.mb.diasSin2 < X) suma(baraj, d);       // BARAJADO: el día equivocado
        if (!(f.m.diasSin2 < X)) continue;
        suma(tot, d);
        suma(mit[Number(f.ano) <= 2020 ? 0 : 1], d);
        if (!(f.dia >= "20200201" && f.dia <= "20200531")) suma(sin20, d);
        if (!anos2.has(f.ano)) anos2.set(f.ano, acc()); suma(anos2.get(f.ano), d);
        if (!tks2.has(f.sym)) tks2.set(f.sym, acc()); suma(tks2.get(f.sym), d);
        if (!mayor || d > mayor.d) mayor = { d, sym: f.sym, dia: f.dia, tipo: f.tipo };
      }
      const lt = [...tks2.entries()].map(([k, v]) => ({ k, v, r: ratio(v) })).sort((a, b) => b.v.gan - a.v.gan);
      let ac = 0, cuantos = 0;
      for (const t of lt) { if (t.v.gan <= 0) break; ac += t.v.gan; cuantos++; if (ac >= tot.gan / 2) break; }
      const malos = ANOS.filter((a) => { const y = anos2.get(a); return y && y.n >= 20 && ratio(y) < 1; }).length;
      const conta = ANOS.filter((a) => (anos2.get(a)?.n ?? 0) >= 20).length;
      console.log(`\n  ── ENVASE ${env.id} · umbral fijo «hubo un día de más del 2% en los últimos ${X} días de bolsa»`);
      console.log(`     ratio ${ratio(tot).toFixed(2)} · acierta ${pct(acierto(tot))} · n=${num(tot.n)} · ganador ${dol(ganMedio(tot))} · perdedor ${dol(perMedio(tot))} · ${num(tot.n / ANOSPAN)} ops/año`);
      console.log(`     BARAJADO (mismo filtro, día equivocado): ratio ${ratio(baraj).toFixed(2)} · acierta ${pct(acierto(baraj))} · n=${num(baraj.n)}`);
      console.log(`     mitades: 2016-2020 ${ratio(mit[0]).toFixed(2)} (n=${num(mit[0].n)}) · 2021-2026 ${ratio(mit[1]).toFixed(2)} (n=${num(mit[1].n)})`);
      console.log(`     sin febrero-mayo de 2020: ${ratio(sin20).toFixed(2)} · mayor billete ${dol(mayor.d)} (${mayor.sym} ${mayor.tipo} ${mayor.dia}) · quitándolo ${((tot.gan - mayor.d) / tot.per).toFixed(2)}`);
      console.log(`     tickers para la mitad de lo ganado: ${cuantos} de ${lt.length} · con ratio > 1: ${lt.filter((t) => t.r > 1).length} · quitando ${lt[0].k}: ${((tot.gan - lt[0].v.gan) / (tot.per - lt[0].v.per)).toFixed(2)}`);
      console.log(`     años por debajo de 1: ${malos} de ${conta}   ·   crisis: ${["2018", "2020", "2022", "2025"].map((a) => { const y = anos2.get(a); return `${a} ${y && y.n >= 10 ? ratio(y).toFixed(2) : "n/d"}`; }).join(" · ")}`);
      console.log(`     | año | ${ANOS.join(" | ")} |`);
      console.log(`     |---|${ANOS.map(() => "---").join("|")}|`);
      console.log(`     | n | ${ANOS.map((a) => anos2.get(a)?.n ?? 0).join(" | ")} |`);
      console.log(`     | ratio | ${ANOS.map((a) => { const y = anos2.get(a); return y && y.n >= 10 ? ratio(y).toFixed(2) : "n/d"; }).join(" | ")} |`);
      console.log(`     | acierta | ${ANOS.map((a) => { const y = anos2.get(a); return y && y.n >= 10 ? pct(acierto(y)) : "n/d"; }).join(" | ")} |`);
    }
  }
}

// ── las dos mitades del período, para el mejor montón ─────────────────────────────────────────
console.log(`\n  Las dos mitades del período (envase A, «días sin movimiento del 2%», montón 1):`);
for (const [et, filtro] of [["2016-2020", (a) => Number(a) <= 2020], ["2021-2026", (a) => Number(a) > 2020]]) {
  const c = acc(), b = acc();
  for (const f of filas) { if (f.env !== "A" || !f.pil || !filtro(f.ano)) continue; suma(b, APUESTA * f.ret); if (f.pil.diasSin2 === 0) suma(c, APUESTA * f.ret); }
  console.log(`    ${et} : con señal ${ratio(c).toFixed(2)} (acierta ${pct(acierto(c))}, n=${num(c.n)}) · sin señal ${ratio(b).toFixed(2)} (acierta ${pct(acierto(b))}, n=${num(b.n)})`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(102)}`);
console.log("  RESUMEN");
console.log(`${"═".repeat(102)}`);
console.log(`  combinaciones medidas: ${ENVASES.length} envases × ${MEDIDAS.length} medidas × 5 montones = ${ENVASES.length * MEDIDAS.length * 5} casillas (más el barajado de cada una)`);
console.log(`  mejor casilla del envase A: ${mejorA.md.et} · montón ${mejorA.k + 1} · ratio ${mejorA.r.toFixed(2)} (listón sin señal ${ratio(base("A")).toFixed(2)})`);
console.log(`  acierto sin señal ${pct(acierto(base("A")))} → con señal ${pct(acierto(infoA.c))}`);
console.log(`  barajado ${ratio(infoA.cb).toFixed(2)} · años por debajo de 1: ${infoA.malos} de ${infoA.conta} · tickers para la mitad: ${infoA.cuantos} · ${num(infoA.opsAno)} operaciones al año`);
console.log(`  la misma regla en el envase B: ratio ${ratio(infoB.c).toFixed(2)} · acierta ${pct(acierto(infoB.c))}`);
console.log(`${"═".repeat(102)}\n`);
