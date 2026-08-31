// Y4 — LA CURVA DEL PROPIO TICKER: EL FRENTE CONTRA EL FONDO.
//
// ═══ QUÉ MIDE Y POR QUÉ ═════════════════════════════════════════════════════════════════════
//
// Cada día hay VARIOS vencimientos cotizando a la vez del mismo ticker. Lo que cuesta comprar el
// movimiento a 30 días no tiene por qué costar lo mismo (una vez ajustado por el plazo) que a 90
// o a 180. Ese desnivel es la CURVA del propio ticker, y dice CUÁNDO espera el mercado que pase
// algo: si el frente está caro respecto al fondo, el mercado avisa de que espera algo PRONTO.
// Nunca se ha mirado aquí.
//
// Cómo se lee, sin ningún modelo:
//   · CUÑA al dinero de un vencimiento = precio de la call al dinero + precio de la put al dinero
//     del MISMO vencimiento. Es literalmente lo que cuesta comprar el movimiento hasta ese día.
//   · se divide por el precio de la acción (para poder comparar tickers) y se divide por la raíz
//     del plazo (para poder comparar vencimientos): sigma = (cuña/S) / raíz(días/365).
//   · el COCIENTE frente/fondo = sigma(30d) / sigma(90d). Por debajo de 1 = curva normal (el
//     frente barato). Por encima de 1 = curva INVERTIDA (el frente caro, el mercado avisa).
//   Se miden también 30/180 y 90/180 por si el efecto vive en otro tramo.
//
// La cuña se lee a PUNTO MEDIO porque es una LECTURA, no una operación: el dinero siempre entra
// al ask y sale al bid. Usar el ask en los dos plazos metería un sesgo hacia "el frente está
// caro" sólo porque el frente tiene la horquilla más ancha en porcentaje.
//
// ═══ LAS DOS LECTURAS QUE SE PRUEBAN ════════════════════════════════════════════════════════
//   (a) comprar cuando el frente está BARATO respecto al fondo  → compras lo que nadie quiere
//   (b) comprar cuando el frente está CARO respecto al fondo     → el mercado avisa de algo
// Son los dos extremos de la misma escalera de cinco montones, así que salen las dos a la vez.
//
// ═══ EL SESGO DE EARNINGS — el que puede matarlo todo ═══════════════════════════════════════
// El frente se pone caro justo antes de los resultados. Si esta señal dispara cuatro veces al año
// por ticker y siempre en las mismas semanas, no es una señal: es el calendario de resultados
// disfrazado. Se comprueba explícitamente: disparos por ticker y año, y qué fracción de ellos cae
// en los cuatro meses de calendario favoritos de cada ticker (al azar sería 33,3%).
//
// ═══ EL ENVASE — FIJADO, no se toca ═════════════════════════════════════════════════════════
//   A: 10% fuera del dinero · 60 días de plazo · vender a los 30 días de bolsa   (listón 1.11)
//   B:  5% fuera del dinero · 90 días de plazo · vender a los 30 días de bolsa
// Una opción SUELTA, se COMPRA al ASK y se VENDE al BID. $1,000 arriesgados en cada intento.
//
// ═══ LA VARA ════════════════════════════════════════════════════════════════════════════════
//   RATIO = dólares ganados en total / dólares perdidos en total. Hace falta 1.40 en el envase A.
//   Y sobre todo: que el ACIERTO suba del 17.3%. No se usa la t como criterio ni se reporta.
//
// ═══ LAS REGLAS DE LA CASA ══════════════════════════════════════════════════════════════════
//   1. Se COMPRA al ASK y se VENDE al BID. Nunca punto medio para el dinero.
//   2. Ningún modelo de precios. Todo sale de precios que existen en la cadena.
//   3. Un HUECO no es un cero: si falta la cadena del día de salida (o el vencimiento entero en
//      ella), la operación se descarta y se cuenta aparte. Si la cadena está y el contrato no
//      tiene puja, vale 0 y se pierde el 100%: eso es un dato real.
//   4. SÓLO EL PASADO. Los cinco montones NO se cortan con percentiles de toda la historia. Se
//      cortan con una ventana que crece y que TERMINA EL DÍA ANTERIOR — dos versiones: contra la
//      historia de todos los tickers, y contra la historia del propio ticker.
//   5. EL SPOT, por paridad put-call y SÓLO en el vencimiento más cercano (el fallo de ayer).
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/y4-la-curva-del-ticker.mjs

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const APUESTA = 1000;
const ASK_MIN = 0.10;

// El envase, fijado. NO se barre.
const ENVASES = {
  A: { dist: 0.10, dte: 60, tolDte: 17, salida: 30, tolK: 0.50 },
  B: { dist: 0.05, dte: 90, tolDte: 25, salida: 30, tolK: 0.50 },
};

// Los tres plazos de la curva y cuánto se les permite apartarse
const TRAMOS = [
  ["f", 30, 10],
  ["m", 90, 22],
  ["b", 180, 45],
];
const COCIENTES = [["30/90", "f", "m"], ["30/180", "f", "b"], ["90/180", "m", "b"]];
// Ventana que crece (siempre termina el dia ANTERIOR):
//   todos   = el cociente de hoy contra la historia de todos los tickers
//   propio  = contra la historia del propio ticker
//   residuo = MATA LA ESTACIONALIDAD: primero se le resta a cada cociente lo que ese ticker suele
//             valer EN ESE MES DE CALENDARIO (media de los anos ANTERIORES, minimo 2), y se
//             ordena el sobrante. Si la senal es el calendario de resultados, aqui se apaga.
const METODOS = ["todos", "propio", "residuo"];
const MIN_ANOS_MES = 2;                 // anos anteriores del mismo mes para poder quitar la estacionalidad
const NB = 5;                           // cinco montones
const MIN_POOL = 300;                   // mínimo de observaciones pasadas para cortar contra todos
const MIN_PROPIO = 12;                  // mínimo de observaciones pasadas del propio ticker
const DESPL = [7, 12];                  // barajados: desplazamiento fijo en entradas (meses)

const pct = (x) => (100 * x).toFixed(1) + "%";
const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
const num = (n) => Math.round(n).toLocaleString("en-US");
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const cal = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);

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
const TOTDIAS = [...diasPorSim.values()].reduce((a, v) => a + v.length, 0);
console.log(`\n## ${TICKERS.length} tickers · ${num(TOTDIAS)} días de cadena`);
console.log(`## ${COCIENTES.length} cocientes × ${METODOS.length} formas de cortar × ${NB} montones × 2 envases = ` +
  `${COCIENTES.length * METODOS.length * NB * 2} celdas medidas, más ${DESPL.length} barajados\n`);

// ── caché acotada de cadenas ─────────────────────────────────────────────────
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

/** EL SPOT por paridad put-call, SÓLO en el vencimiento más cercano.
 *  Mirar toda la cadena a la vez cruza en el precio A FUTURO y sale inflado (el fallo de ayer). */
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

/** La CUÑA al dinero de un vencimiento, a punto medio, normalizada: sigma = (cuña/S)/raíz(T/365).
 *  Es una LECTURA (información), no una operación: el dinero sigue entrando al ask. */
function sigmaDe(g, S, dte) {
  let mejor = null, dm = Infinity;
  for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== "C") continue;
    const K = Number(cl.slice(0, -2));
    const p = g[`${K}|P`];
    if (!p) continue;
    if (!(ba[1] > 0) || !(p[1] > 0)) continue;         // sin ask no hay precio
    const d = Math.abs(K - S);
    if (d < dm) { dm = d; mejor = { K, c: (ba[0] + ba[1]) / 2, p: (p[0] + p[1]) / 2 }; }
  }
  if (!mejor) return null;
  if (dm > S * 0.05) return null;                       // no hay strike razonablemente al dinero
  const cuna = mejor.c + mejor.p;
  if (!(cuna > 0)) return null;
  return (cuna / S) / Math.sqrt(dte / 365);
}

/** Elige el contrato del envase: `dist` fuera, vencimiento cerca de `dte`. Devuelve bid/ask reales. */
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
  return { exp, K, clave: `${K}|${tipo}`, bid: ba[0], ask: ba[1], distReal };
}

// ════════════════════════════════════════════════════════════════════════════
// PASADA 1 — recolectar señal y operaciones
// ════════════════════════════════════════════════════════════════════════════
const obs = [];    // {sym, dia, ano, coc:{...}}  una por ticker y mes
const ops = [];    // {sym, dia, ano, env, tipo, ret, coste, horq, sinValor, idxObs}

let entradas = 0, sinSpot = 0, sinCadenaEntrada = 0;
let sinTramo = 0, sinContrato = 0, huecos = 0, huecoGrupo = 0, trasVto = 0;

const t0 = Date.now();
for (const sym of TICKERS) {
  const ds = diasPorSim.get(sym);
  const vistos = new Set();
  for (let i = 0; i < ds.length; i++) {
    const dia = ds[i];
    const mes = dia.slice(0, 6);
    if (vistos.has(mes)) continue;          // una entrada al mes por ticker (así se fijó el envase)
    vistos.add(mes);
    const ano = dia.slice(0, 4);

    const c = cadena(sym, dia);
    if (!c) { sinCadenaEntrada++; continue; }
    const S = spotOk(c, dia);
    if (!(S > 0)) { sinSpot++; continue; }
    entradas++;

    // ── LA CURVA: sigma en los tres tramos ─────────────────────────────────
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
    const coc = {};
    for (const [nom, a, b] of COCIENTES) if (sig[a] > 0 && sig[b] > 0) coc[nom] = sig[a] / sig[b];
    if (!Object.keys(coc).length) { sinTramo++; continue; }
    const idxObs = obs.length;
    obs.push({ sym, dia, ano, coc });

    // ── LAS OPERACIONES del envase ─────────────────────────────────────────
    const dSal = ds[i + 30] ?? null;
    if (!dSal) { huecos += 4; continue; }
    const cs = cadena(sym, dSal);

    for (const [en, env] of Object.entries(ENVASES)) {
      for (const tipo of ["C", "P"]) {
        const ct = elegir(c, S, dia, env, tipo);
        if (!ct) { sinContrato++; continue; }
        if (dSal >= ct.exp) { trasVto++; continue; }     // no se puede leer el bid: se descarta
        if (!cs) { huecos++; continue; }                 // UN HUECO NO ES UN CERO
        const g2 = cs[ct.exp];
        if (!g2) { huecos++; huecoGrupo++; continue; }
        const bid = g2[ct.clave]?.[0] ?? 0;              // la cadena está y no hay puja → 0 real
        ops.push({
          sym, dia, ano, env: en, tipo, idxObs,
          ret: (bid - ct.ask) / ct.ask,
          coste: ct.ask / S, horq: (ct.ask - ct.bid) / ct.ask,
          sinValor: bid <= 0 ? 1 : 0,
        });
      }
    }
  }
  cache.clear();
  process.stderr.write(`\r   ${sym.padEnd(6)} · ${entradas} entradas · ${num(ops.length)} operaciones · ${Math.round((Date.now() - t0) / 1000)}s     `);
}
process.stderr.write("\n");

// ════════════════════════════════════════════════════════════════════════════
// PASADA 2 — los montones, con ventana que CRECE y termina el día anterior
// ════════════════════════════════════════════════════════════════════════════
const orden = [...obs.keys()].sort((a, b) => (obs[a].dia < obs[b].dia ? -1 : obs[a].dia > obs[b].dia ? 1 : (obs[a].sym < obs[b].sym ? -1 : 1)));
// montones[idxObs][cociente][metodo] = 0..4  ó  null si no hay bastante pasado
for (const o of obs) o.b = {};

function insertar(arr, x) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; }
  arr.splice(lo, 0, x);
  return lo;
}
function rango(arr, x) {   // fracción de valores pasados estrictamente menores
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < x) lo = m + 1; else hi = m; }
  return lo / arr.length;
}

const pool = new Map();      // cociente -> array ordenado de valores pasados (todos los tickers)
const propio = new Map();    // `${sym}|${cociente}` -> array ordenado
const resid = new Map();     // `${sym}|${cociente}` -> array ordenado de residuos pasados
const mesHist = new Map();   // `${sym}|${cociente}|${MM}` -> {suma, n} de anos ANTERIORES
for (const [nom] of COCIENTES) pool.set(nom, []);

let k = 0;
while (k < orden.length) {
  const dia = obs[orden[k]].dia;
  let j = k;
  while (j < orden.length && obs[orden[j]].dia === dia) j++;
  // 1) asignar montón a TODAS las observaciones de este día usando sólo lo anterior
  for (let q = k; q < j; q++) {
    const o = obs[orden[q]];
    const MM = o.dia.slice(4, 6);
    for (const [nom] of COCIENTES) {
      const x = o.coc[nom];
      if (!(x > 0)) continue;
      const P = pool.get(nom);
      const kp = `${o.sym}|${nom}`;
      const R = propio.get(kp) ?? [];
      const bs = {};
      bs.todos = P.length >= MIN_POOL ? Math.min(NB - 1, Math.floor(rango(P, x) * NB)) : null;
      bs.propio = R.length >= MIN_PROPIO ? Math.min(NB - 1, Math.floor(rango(R, x) * NB)) : null;
      // residuo: quitar lo que ese ticker suele valer en ESE mes de calendario (anos anteriores)
      bs.residuo = null;
      const mh = mesHist.get(`${o.sym}|${nom}|${MM}`);
      if (mh && mh.n >= MIN_ANOS_MES) {
        const r = x - mh.suma / mh.n;
        o.res = o.res ?? {};
        o.res[nom] = r;
        const RR = resid.get(kp) ?? [];
        if (RR.length >= MIN_PROPIO) bs.residuo = Math.min(NB - 1, Math.floor(rango(RR, r) * NB));
      }
      o.b[nom] = bs;
    }
  }
  // 2) sólo ahora entran los valores de hoy en la historia
  for (let q = k; q < j; q++) {
    const o = obs[orden[q]];
    const MM = o.dia.slice(4, 6);
    for (const [nom] of COCIENTES) {
      const x = o.coc[nom];
      if (!(x > 0)) continue;
      insertar(pool.get(nom), x);
      const kp = `${o.sym}|${nom}`;
      if (!propio.has(kp)) propio.set(kp, []);
      insertar(propio.get(kp), x);
      const km = `${o.sym}|${nom}|${MM}`;
      if (!mesHist.has(km)) mesHist.set(km, { suma: 0, n: 0 });
      const mh = mesHist.get(km); mh.suma += x; mh.n++;
      if (o.res && o.res[nom] !== undefined) {
        if (!resid.has(kp)) resid.set(kp, []);
        insertar(resid.get(kp), o.res[nom]);
      }
    }
  }
  k = j;
}

// ── barajado: el montón que le tocaba a la entrada de hace N meses del MISMO ticker ──
const porTicker = new Map();
for (const idx of orden) {
  const o = obs[idx];
  if (!porTicker.has(o.sym)) porTicker.set(o.sym, []);
  porTicker.get(o.sym).push(idx);
}
for (const lista of porTicker.values()) {
  for (let i = 0; i < lista.length; i++) {
    const o = obs[lista[i]];
    o.baraja = {};
    for (const d of DESPL) {
      const src = i - d >= 0 ? obs[lista[i - d]] : null;
      o.baraja[d] = src ? src.b : null;
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// SANIDAD
// ════════════════════════════════════════════════════════════════════════════
const acc = () => ({ n: 0, win: 0, gan: 0, per: 0, max: 0 });
function suma(a, d) { a.n++; if (d > 0) { a.win++; a.gan += d; if (d > a.max) a.max = d; } else a.per += -d; }
const ratio = (a) => (a.per > 0 ? a.gan / a.per : (a.gan > 0 ? Infinity : NaN));
const acierto = (a) => (a.n ? a.win / a.n : NaN);

console.log(`\n${"=".repeat(104)}`);
console.log("  SANIDAD — antes de mirar ningun ratio");
console.log(`${"=".repeat(104)}`);
console.log(`  dias de entrada usados (uno al mes por ticker) : ${num(entradas)}`);
console.log(`  descartados sin cadena ${num(sinCadenaEntrada)} · sin spot por paridad ${num(sinSpot)} · sin los tramos de la curva ${num(sinTramo)}`);
console.log(`  observaciones de curva : ${num(obs.length)}`);
console.log(`  operaciones medidas    : ${num(ops.length)}`);
console.log(`  HUECOS descartados     : ${num(huecos)} (${pct(huecos / (huecos + ops.length))}) — ${num(huecoGrupo)} por faltar el vencimiento entero en la cadena de salida`);
console.log(`  descartadas por caer la salida tras el vencimiento: ${num(trasVto)}`);
console.log(`  combinaciones sin contrato que encaje (strike lejos o ask < $${ASK_MIN.toFixed(2)}): ${num(sinContrato)}`);
console.log(`  ficheros de cadena leidos ${num(lecturas)} · no encontrados ${num(noExiste)}`);

const baseline = {};
for (const en of ["A", "B"]) {
  const l = ops.filter((o) => o.env === en);
  const a = acc();
  let coste = 0, horq = 0, sv = 0;
  for (const o of l) { suma(a, APUESTA * o.ret); coste += o.coste; horq += o.horq; sv += o.sinValor; }
  baseline[en] = { a, coste: coste / l.length, horq: horq / l.length, sv: sv / l.length };
}
console.log(`\n  EL ENVASE VACIO — sin ninguna senal (tiene que salir A = 1.11 y 17.3%, n≈6,960)`);
console.log(`  | envase | n | acierta | RATIO | ganador medio | perdedor medio | prima/accion | horquilla | vence sin valor |`);
console.log(`  |---|---|---|---|---|---|---|---|---|`);
for (const en of ["A", "B"]) {
  const b = baseline[en], a = b.a;
  console.log(`  | ${en} | ${num(a.n)} | ${pct(acierto(a))} | **${ratio(a).toFixed(2)}** | ${usd(a.gan / a.win)} | ${usd(a.per / (a.n - a.win))} | ${pct(b.coste)} | ${pct(b.horq)} | ${pct(b.sv)} |`);
}

// distribución del cociente (informativa, se imprime DESPUÉS de medir)
{
  console.log(`\n  Como se reparte el cociente frente/fondo (informativo — los cortes NO salen de aqui):`);
  console.log(`  | cociente | n | minimo | 10% | mediana | 90% | maximo | fraccion invertida (>1) |`);
  console.log(`  |---|---|---|---|---|---|---|---|`);
  for (const [nom] of COCIENTES) {
    const v = obs.map((o) => o.coc[nom]).filter((x) => x > 0).sort((a, b) => a - b);
    if (!v.length) continue;
    const q = (p) => v[Math.min(v.length - 1, Math.floor(v.length * p))];
    console.log(`  | ${nom} | ${num(v.length)} | ${q(0).toFixed(2)} | ${q(0.10).toFixed(2)} | ${q(0.50).toFixed(2)} | ${q(0.90).toFixed(2)} | ${v[v.length - 1].toFixed(2)} | ${pct(v.filter((x) => x > 1).length / v.length)} |`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// LA ESCALERA — cinco montones, los dos envases, los tres cocientes
// ════════════════════════════════════════════════════════════════════════════
const ANOS = [...new Set(ops.map((o) => o.ano))].sort();
const CRISIS = ["2018", "2020", "2022", "2025"];
const anosDeDatos = (ANOS.length ? (Number(ANOS[ANOS.length - 1]) - Number(ANOS[0]) + 1) : 1);

function escalera(en, nom, met, sel = (o) => true, fuente = "b") {
  const B = Array.from({ length: NB }, acc);
  const nulos = acc();
  for (const o of ops) {
    if (o.env !== en) continue;
    if (!sel(o)) continue;
    const ob = obs[o.idxObs];
    const src = fuente === "b" ? ob.b : (ob.baraja?.[fuente] ?? null);
    const bs = src ? src[nom] : null;
    const q = bs ? bs[met] : null;
    const d = APUESTA * o.ret;
    if (q == null) { suma(nulos, d); continue; }
    suma(B[q], d);
  }
  return { B, nulos };
}

const ETIQ = ["1 (frente MAS BARATO)", "2", "3", "4", "5 (frente MAS CARO)"];
for (const [nom] of COCIENTES) {
  for (const met of METODOS) {
    console.log(`\n${"=".repeat(104)}`);
    const NOMMET = { todos: "la historia de TODOS los tickers", propio: "la historia del PROPIO ticker", residuo: "el propio ticker, QUITANDO su estacionalidad de mes" };
    console.log(`  ESCALERA — cociente ${nom} · montones cortados contra ${NOMMET[met]}`);
    console.log(`${"=".repeat(104)}`);
    console.log(`  | monton | envase A: n | acierta | RATIO | envase B: n | acierta | RATIO |`);
    console.log(`  |---|---|---|---|---|---|---|`);
    const eA = escalera("A", nom, met), eB = escalera("B", nom, met);
    for (let q = 0; q < NB; q++) {
      const a = eA.B[q], b = eB.B[q];
      console.log(`  | ${ETIQ[q].padEnd(22)} | ${num(a.n).padStart(5)} | ${pct(acierto(a)).padStart(6)} | **${ratio(a).toFixed(2)}** | ${num(b.n).padStart(5)} | ${pct(acierto(b)).padStart(6)} | **${ratio(b).toFixed(2)}** |`);
    }
    console.log(`  | sin bastante pasado    | ${num(eA.nulos.n).padStart(5)} | ${pct(acierto(eA.nulos)).padStart(6)} | ${ratio(eA.nulos).toFixed(2)} | ${num(eB.nulos.n).padStart(5)} | ${pct(acierto(eB.nulos)).padStart(6)} | ${ratio(eB.nulos).toFixed(2)} |`);
    console.log(`  | EL ENVASE ENTERO       | ${num(baseline.A.a.n).padStart(5)} | ${pct(acierto(baseline.A.a)).padStart(6)} | ${ratio(baseline.A.a).toFixed(2)} | ${num(baseline.B.a.n).padStart(5)} | ${pct(acierto(baseline.B.a)).padStart(6)} | ${ratio(baseline.B.a).toFixed(2)} |`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ¿QUIEN ES LA MEJOR? — y a examen
// ════════════════════════════════════════════════════════════════════════════
const cands = [];
for (const [nom] of COCIENTES) for (const met of METODOS) {
  const eA = escalera("A", nom, met);
  for (let q = 0; q < NB; q++) {
    const a = eA.B[q];
    if (a.n < 200) continue;
    cands.push({ nom, met, q, r: ratio(a), acc: acierto(a), n: a.n });
  }
}
cands.sort((a, b) => b.r - a.r);
console.log(`\n${"=".repeat(104)}`);
console.log("  LAS 8 MEJORES CELDAS DEL ENVASE A (de las 30 con muestra suficiente)");
console.log(`${"=".repeat(104)}`);
console.log(`  | cociente | cortes | monton | n | ops/ano | acierta | RATIO |`);
console.log(`  |---|---|---|---|---|---|---|`);
for (const x of cands.slice(0, 8)) {
  console.log(`  | ${x.nom} | ${x.met} | ${ETIQ[x.q]} | ${num(x.n)} | ${Math.round(x.n / anosDeDatos)} | ${pct(x.acc)} | **${x.r.toFixed(2)}** |`);
}
console.log(`  ... y la peor: ${cands.length ? `${cands[cands.length - 1].nom} / ${cands[cands.length - 1].met} / ${ETIQ[cands[cands.length - 1].q]} → ${cands[cands.length - 1].r.toFixed(2)}` : "—"}`);

const mejor = cands[0];

function examen(en, nom, met, qq, titulo) {
  const qs = Array.isArray(qq) ? qq : [qq];
  const q = qs[qs.length - 1];
  const sel = (o) => { const bs = obs[o.idxObs].b[nom]; return bs && bs[met] != null && qs.includes(bs[met]); };
  const T = acc(), anos = new Map(), tks = new Map();
  let coste = 0, horq = 0, sv = 0, m = 0;
  let mayor = null;
  for (const o of ops) {
    if (o.env !== en || !sel(o)) continue;
    const d = APUESTA * o.ret;
    suma(T, d); coste += o.coste; horq += o.horq; sv += o.sinValor; m++;
    if (!anos.has(o.ano)) anos.set(o.ano, acc());
    suma(anos.get(o.ano), d);
    if (!tks.has(o.sym)) tks.set(o.sym, acc());
    suma(tks.get(o.sym), d);
    if (!mayor || d > mayor.d) mayor = { d, sym: o.sym, dia: o.dia, tipo: o.tipo };
  }
  console.log(`\n${"=".repeat(104)}`);
  console.log(`  ${titulo} — envase ${en} · cociente ${nom} · cortes contra ${met} · montones ${qs.map((x) => x + 1).join("+")} (${ETIQ[q]})`);
  console.log(`${"=".repeat(104)}`);
  // OJO: los anos al aire libre. El metodo "residuo" no existe antes de 2019, asi que dividir por
  // los 11 anos del fichero INFRAVALORA la frecuencia. Se divide por los anos en que la senal vive.
  const diasSenal = [];
  for (const o of ops) { if (o.env === en && sel(o)) diasSenal.push(o.dia); }
  diasSenal.sort();
  const spanAnos = diasSenal.length > 1 ? Math.max(1, (Date.parse(`${diasSenal[diasSenal.length - 1].slice(0, 4)}-${diasSenal[diasSenal.length - 1].slice(4, 6)}-${diasSenal[diasSenal.length - 1].slice(6, 8)}`) - Date.parse(`${diasSenal[0].slice(0, 4)}-${diasSenal[0].slice(4, 6)}-${diasSenal[0].slice(6, 8)}`)) / (365.25 * 86400000)) : 1;
  const opsAno = Math.round(T.n / spanAnos);
  console.log(`  n=${num(T.n)} · la senal vive de ${diasSenal[0]} a ${diasSenal[diasSenal.length - 1]} (${spanAnos.toFixed(1)} anos) → ${opsAno} operaciones al ano`);
  console.log(`  acierta ${pct(acierto(T))} (el envase entero: ${pct(acierto(baseline[en].a))})`);
  console.log(`  gana ${usd(T.gan)} · pierde ${usd(T.per)} · RATIO ${ratio(T).toFixed(2)} (el envase entero: ${ratio(baseline[en].a).toFixed(2)})`);
  console.log(`  ganador medio ${usd(T.gan / Math.max(1, T.win))} · perdedor medio ${usd(T.per / Math.max(1, T.n - T.win))} · prima ${pct(coste / m)} de la accion · vence sin valor ${pct(sv / m)}`);
  if (mayor) {
    console.log(`  mayor billete ${usd(mayor.d)} (${mayor.sym} ${mayor.tipo}, entrada ${mayor.dia}) · ratio sin ese unico evento: ${((T.gan - mayor.d) / T.per).toFixed(2)}`);
  }
  console.log(`\n  Ano a ano:`);
  console.log(`  | ano | n | acierta | RATIO |`);
  console.log(`  |---|---|---|---|`);
  let malos = 0, cuentan = 0;
  for (const a of ANOS) {
    const y = anos.get(a);
    if (!y || y.n < 20) { console.log(`  | ${a} | ${y ? y.n : 0} | — | muestra corta |`); continue; }
    cuentan++;
    if (ratio(y) < 1) malos++;
    console.log(`  | ${a} | ${y.n} | ${pct(acierto(y))} | **${ratio(y).toFixed(2)}** |`);
  }
  console.log(`  → ${malos} de ${cuentan} anos por debajo de 1`);
  console.log(`  crisis por separado: ` + CRISIS.map((a) => { const y = anos.get(a); return `${a}=${y && y.n >= 12 ? ratio(y).toFixed(2) : "—"}${y ? `(n=${y.n})` : ""}`; }).join(" · "));

  // sin febrero-mayo de 2020
  {
    const s = acc();
    for (const o of ops) {
      if (o.env !== en || !sel(o)) continue;
      const ym = o.dia.slice(0, 6);
      if (ym >= "202002" && ym <= "202005") continue;
      suma(s, APUESTA * o.ret);
    }
    console.log(`  quitando febrero-mayo de 2020: n=${num(s.n)} · acierta ${pct(acierto(s))} · RATIO ${ratio(s).toFixed(2)}`);
  }

  // concentración por ticker
  const lista = [...tks.entries()].map(([t, v]) => ({ t, v, r: ratio(v) })).sort((a, b) => b.v.gan - a.v.gan);
  let ac = 0, cuantos = 0;
  for (const x of lista) { if (x.v.gan <= 0) break; ac += x.v.gan; cuantos++; if (ac >= T.gan / 2) break; }
  console.log(`\n  Por ticker: ${lista.length} tickers · ${lista.filter((x) => x.r > 1).length} con ratio > 1 · ${cuantos} hacen falta para juntar la mitad del dinero ganado`);
  console.log(`  mejores: ${lista.slice(0, 5).map((x) => `${x.t} ${x.r.toFixed(2)}`).join(" · ")}`);
  console.log(`  ratio quitando ${lista[0].t} entero: ${((T.gan - lista[0].v.gan) / (T.per - lista[0].v.per)).toFixed(2)}`);

  // mitades del tiempo
  {
    const A1 = acc(), A2 = acc();
    for (const [a, v] of anos) { const d = Number(a) <= 2020 ? A1 : A2; d.n += v.n; d.win += v.win; d.gan += v.gan; d.per += v.per; }
    console.log(`  dos mitades del tiempo: 2016-2020 → ${ratio(A1).toFixed(2)} (n=${A1.n}) · 2021-2026 → ${ratio(A2).toFixed(2)} (n=${A2.n})`);
  }

  // calls vs puts
  {
    const C = acc(), P = acc();
    for (const o of ops) { if (o.env !== en || !sel(o)) continue; suma(o.tipo === "C" ? C : P, APUESTA * o.ret); }
    console.log(`  calls ${ratio(C).toFixed(2)} (acierta ${pct(acierto(C))}, n=${C.n}) · puts ${ratio(P).toFixed(2)} (acierta ${pct(acierto(P))}, n=${P.n})`);
  }
  return { T, malos, cuentan, cuantos, anos, opsAno, spanAnos };
}

let infoMejor = null;
if (mejor) infoMejor = examen("A", mejor.nom, mejor.met, mejor.q, "LA MEJOR CELDA, A EXAMEN");

// la misma regla en el envase B
let ratioB = NaN, accB = NaN;
if (mejor) {
  const eB = escalera("B", mejor.nom, mejor.met);
  ratioB = ratio(eB.B[mejor.q]); accB = acierto(eB.B[mejor.q]);
  console.log(`\n  LA MISMA REGLA EN EL ENVASE B: n=${num(eB.B[mejor.q].n)} · acierta ${pct(accB)} (envase B entero ${pct(acierto(baseline.B.a))}) · RATIO ${ratioB.toFixed(2)} (envase B entero ${ratio(baseline.B.a).toFixed(2)})`);
}

// ════════════════════════════════════════════════════════════════════════════
// EL BARAJADO — la misma senal con el dia equivocado
// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"=".repeat(104)}`);
console.log("  EL BARAJADO — la misma senal, pero la del mes equivocado del mismo ticker");
console.log(`${"=".repeat(104)}`);
console.log(`  (desplazamiento de 7 meses ROMPE el calendario de resultados; el de 12 lo CONSERVA.`);
console.log(`   Si el de 12 mantiene el efecto y el de 7 no, la senal es earnings disfrazado.)`);
const barajados = {};
if (mejor) {
  console.log(`\n  | version | envase A: n | acierta | RATIO |`);
  console.log(`  |---|---|---|---|`);
  const real = escalera("A", mejor.nom, mejor.met).B[mejor.q];
  console.log(`  | de verdad | ${num(real.n)} | ${pct(acierto(real))} | **${ratio(real).toFixed(2)}** |`);
  for (const d of DESPL) {
    const e = escalera("A", mejor.nom, mejor.met, () => true, d).B[mejor.q];
    barajados[d] = ratio(e);
    console.log(`  | barajado ${d} meses | ${num(e.n)} | ${pct(acierto(e))} | ${ratio(e).toFixed(2)} |`);
  }
  // escalera entera barajada, para ver si la monotonia sobrevive
  for (const d of DESPL) {
    const e = escalera("A", mejor.nom, mejor.met, () => true, d);
    console.log(`  escalera entera barajada ${d} meses: ` + e.B.map((x, q) => `${q + 1}=${ratio(x).toFixed(2)}`).join(" · "));
  }
}

// ════════════════════════════════════════════════════════════════════════════
// EL SESGO DE EARNINGS — ¿dispara cuatro veces al ano y siempre en las mismas semanas?
// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"=".repeat(104)}`);
console.log("  EL SESGO DE EARNINGS — periodicidad de los disparos");
console.log(`${"=".repeat(104)}`);
// Generador reproducible (nada de Math.random: el control tiene que poder repetirse igual).
function rng(semilla) {
  let s = semilla >>> 0;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const top4frac = (meses) => {
  const cnt = new Map();
  for (const m of meses) cnt.set(m, (cnt.get(m) ?? 0) + 1);
  return [...cnt.values()].sort((a, b) => b - a).slice(0, 4).reduce((a, b) => a + b, 0) / meses.length;
};
/** OJO: "al azar seria 33,3%" ES FALSO. Con ~23 disparos repartidos en 12 meses, los 4 meses mas
 *  cargados se llevan bastante mas de un tercio SOLO POR AZAR. El liston honesto se saca
 *  repescando, para cada ticker, el mismo numero de disparos de entre SUS PROPIOS meses de
 *  observacion, 400 veces con semilla fija. */
function periodicidad(nom, met, q, etiqueta) {
  const porT = new Map(), universoT = new Map();
  for (const o of obs) {
    if (!(o.coc[nom] > 0)) continue;
    if (!universoT.has(o.sym)) universoT.set(o.sym, []);
    universoT.get(o.sym).push(o.dia.slice(4, 6));
    const bs = o.b[nom];
    if (!bs || bs[met] !== q) continue;
    if (!porT.has(o.sym)) porT.set(o.sym, []);
    porT.get(o.sym).push(o.dia);
  }
  const r0 = rng(20260824);
  let totalDisp = 0, tks = 0, sumFrac4 = 0, sumPorAno = 0, sumNulo = 0;
  for (const [t, ds] of porT) {
    if (ds.length < 8) continue;
    tks++;
    totalDisp += ds.length;
    const anosT = new Set(ds.map((d) => d.slice(0, 4))).size;
    sumPorAno += ds.length / anosT;
    sumFrac4 += top4frac(ds.map((d) => d.slice(4, 6)));
    // el listón por azar, con los propios meses de observación de ESE ticker
    const U = universoT.get(t);
    let acu = 0;
    for (let it = 0; it < 400; it++) {
      const c = [...U];
      for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(r0() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
      acu += top4frac(c.slice(0, ds.length));
    }
    sumNulo += acu / 400;
  }
  if (!tks) { console.log(`  ${etiqueta}: menos de 8 disparos en todos los tickers, no se puede medir la periodicidad.`); return null; }
  const r = { disparosPorTickerAno: sumPorAno / tks, frac4: sumFrac4 / tks, frac4Azar: sumNulo / tks, tks, totalDisp };
  console.log(`  ${etiqueta}:`);
  console.log(`    ${tks} tickers con 8+ disparos · ${num(totalDisp)} disparos · ${r.disparosPorTickerAno.toFixed(1)} disparos por ticker y ano`);
  console.log(`    disparos en los 4 meses de calendario favoritos del ticker: ${pct(r.frac4)} · POR PURO AZAR saldria ${pct(r.frac4Azar)} · exceso ${pct(r.frac4 - r.frac4Azar)}`);
  console.log(`    veredicto: ${r.frac4 - r.frac4Azar > 0.15 && r.disparosPorTickerAno >= 3 && r.disparosPorTickerAno <= 6 ? "HUELE A EARNINGS" : r.frac4 - r.frac4Azar > 0.10 ? "hay estacionalidad de calendario, aunque no cuadra con 4 al ano" : "NO parece el calendario de resultados"}`);
  return r;
}
/** Parte el monton en DENTRO / FUERA de los 4 meses favoritos del ticker.
 *  Es un DIAGNOSTICO a toro pasado (los meses favoritos se sacan de toda la muestra): no es una
 *  regla operable, sirve para ver si el efecto vive solo en las semanas de resultados. */
function dentroFuera(en, nom, met, q) {
  const porT = new Map();
  for (const o of obs) {
    const bs = o.b[nom];
    if (!bs || bs[met] !== q) continue;
    if (!porT.has(o.sym)) porT.set(o.sym, []);
    porT.get(o.sym).push(o.dia.slice(4, 6));
  }
  const fav = new Map();
  for (const [t, ms_] of porT) {
    const cnt = new Map();
    for (const m of ms_) cnt.set(m, (cnt.get(m) ?? 0) + 1);
    fav.set(t, new Set([...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map((x) => x[0])));
  }
  const D = acc(), F = acc();
  for (const o of ops) {
    if (o.env !== en) continue;
    const bs = obs[o.idxObs].b[nom];
    if (!bs || bs[met] !== q) continue;
    const s = fav.get(o.sym);
    suma(s && s.has(o.dia.slice(4, 6)) ? D : F, APUESTA * o.ret);
  }
  console.log(`\n  El monton ganador partido por el calendario (diagnostico, no regla operable):`);
  console.log(`    DENTRO de los 4 meses favoritos del ticker: n=${num(D.n)} · acierta ${pct(acierto(D))} · RATIO ${ratio(D).toFixed(2)}`);
  console.log(`    FUERA  de los 4 meses favoritos del ticker: n=${num(F.n)} · acierta ${pct(acierto(F))} · RATIO ${ratio(F).toFixed(2)}`);
  console.log(`    (si el efecto solo esta DENTRO, es el calendario de resultados disfrazado)`);
  return { dentro: { n: D.n, acierto: acierto(D), ratio: ratio(D) }, fuera: { n: F.n, acierto: acierto(F), ratio: ratio(F) } };
}
let peri = null, dfMejor = null;
if (mejor) {
  peri = periodicidad(mejor.nom, mejor.met, mejor.q, `monton ganador (${mejor.nom} / ${mejor.met} / ${ETIQ[mejor.q]})`);
  dfMejor = dentroFuera("A", mejor.nom, mejor.met, mejor.q);
}
// y el montón más invertido y el más normal, siempre, por si el ganador no es un extremo
for (const [nom] of [["30/90"]]) for (const met of METODOS) {
  periodicidad(nom, met, NB - 1, `${nom} / ${met} / ${ETIQ[NB - 1]}`);
  periodicidad(nom, met, 0, `${nom} / ${met} / ${ETIQ[0]}`);
}

// ════════════════════════════════════════════════════════════════════════════
// EL CORTE ANCHO — el quinto montón solo deja pocas operaciones al año. ¿Aguanta el ratio si se
// abre la puerta a los DOS montones de arriba (el 40% con el frente más caro)? NO es una puerta
// nueva de búsqueda: es la MISMA señal con el listón más bajo, y lo que se gana es FRECUENCIA,
// que es lo que decide si esto se puede operar de verdad.
// ════════════════════════════════════════════════════════════════════════════
function ancho(en, nom, met, qs) {
  const a = acc();
  for (const o of ops) {
    if (o.env !== en) continue;
    const bs = obs[o.idxObs].b[nom];
    if (!bs || bs[met] == null || !qs.includes(bs[met])) continue;
    suma(a, APUESTA * o.ret);
  }
  return a;
}
console.log(`\n${"=".repeat(104)}`);
console.log("  EL CORTE ANCHO — los dos montones de arriba juntos (el 40% con el frente mas caro)");
console.log(`${"=".repeat(104)}`);
console.log(`  | cociente | cortes | envase A: n | ops/ano | acierta | RATIO | envase B: n | acierta | RATIO |`);
console.log(`  |---|---|---|---|---|---|---|---|---|`);
const anchos = [];
for (const [nom] of COCIENTES) for (const met of METODOS) {
  const a = ancho("A", nom, met, [3, 4]), b = ancho("B", nom, met, [3, 4]);
  anchos.push({ nom, met, r: ratio(a), acc: acierto(a), n: a.n, rB: ratio(b), accB: acierto(b), nB: b.n });
  console.log(`  | ${nom} | ${met} | ${num(a.n)} | ${Math.round(a.n / anosDeDatos)} | ${pct(acierto(a))} | **${ratio(a).toFixed(2)}** | ${num(b.n)} | ${pct(acierto(b))} | **${ratio(b).toFixed(2)}** |`);
}
const mejorAncho = [...anchos].sort((a, b) => b.r - a.r)[0];

/** EL LISTON JUSTO. El metodo "residuo" necesita 2 anos anteriores del mismo mes, asi que no
 *  existe antes de 2019. Compararlo contra el 1.10 de 2016-2026 seria hacer trampa: hay que
 *  medir el envase VACIO sobre EXACTAMENTE los mismos dias en los que la senal esta viva. */
function universo(en, nom, met) {
  const a = acc(), anos = new Map(), sin20 = acc();
  for (const o of ops) {
    if (o.env !== en) continue;
    const bs = obs[o.idxObs].b[nom];
    if (!bs || bs[met] == null) continue;
    const d = APUESTA * o.ret;
    suma(a, d);
    if (!anos.has(o.ano)) anos.set(o.ano, acc());
    suma(anos.get(o.ano), d);
    const ym = o.dia.slice(0, 6);
    if (!(ym >= "202002" && ym <= "202005")) suma(sin20, d);
  }
  return { a, anos, sin20 };
}
{
  console.log(`\n${"=".repeat(104)}`);
  console.log("  EL LISTON JUSTO — el envase VACIO medido sobre los MISMOS dias en que la senal esta viva");
  console.log(`${"=".repeat(104)}`);
  console.log(`  | universo | envase | n | acierta | RATIO | anos por debajo de 1 | sin feb-may 2020 |`);
  console.log(`  |---|---|---|---|---|---|---|`);
  for (const en of ["A", "B"]) {
    const b = baseline[en].a;
    const s = acc();
    for (const o of ops) { if (o.env !== en) continue; const ym = o.dia.slice(0, 6); if (ym >= "202002" && ym <= "202005") continue; suma(s, APUESTA * o.ret); }
    const anosB = new Map();
    for (const o of ops) { if (o.env !== en) continue; if (!anosB.has(o.ano)) anosB.set(o.ano, acc()); suma(anosB.get(o.ano), APUESTA * o.ret); }
    const malosB = [...anosB.values()].filter((y) => y.n >= 20 && ratio(y) < 1).length;
    const cuentaB = [...anosB.values()].filter((y) => y.n >= 20).length;
    console.log(`  | TODO 2016-2026 | ${en} | ${num(b.n)} | ${pct(acierto(b))} | ${ratio(b).toFixed(2)} | ${malosB} de ${cuentaB} | ${ratio(s).toFixed(2)} |`);
  }
  for (const en of ["A", "B"]) {
    const u = universo(en, mejorAncho.nom, mejorAncho.met);
    const malos = [...u.anos.values()].filter((y) => y.n >= 20 && ratio(y) < 1).length;
    const cuenta = [...u.anos.values()].filter((y) => y.n >= 20).length;
    console.log(`  | solo los dias de la senal | ${en} | ${num(u.a.n)} | ${pct(acierto(u.a))} | ${ratio(u.a).toFixed(2)} | ${malos} de ${cuenta} | ${ratio(u.sin20).toFixed(2)} |`);
    if (en === "A") { mejorAncho.listonJusto = ratio(u.a); mejorAncho.listonJustoAcc = acierto(u.a); mejorAncho.listonJustoSin20 = ratio(u.sin20); }
    else { mejorAncho.listonJustoB = ratio(u.a); mejorAncho.listonJustoAccB = acierto(u.a); }
  }
  console.log(`  (asi se ve cuanto pone la SENAL y cuanto pone simplemente el trozo de historia que le toca)`);
}
const infoAncho = examen("A", mejorAncho.nom, mejorAncho.met, [3, 4], "EL CORTE ANCHO GANADOR, A EXAMEN");
const barajAncho = {};
{
  const eB = ancho("B", mejorAncho.nom, mejorAncho.met, [3, 4]);
  console.log(`\n  LA MISMA REGLA ANCHA EN EL ENVASE B: n=${num(eB.n)} · acierta ${pct(acierto(eB))} · RATIO ${ratio(eB).toFixed(2)}`);
  mejorAncho.rB = ratio(eB); mejorAncho.accB = acierto(eB); mejorAncho.nB = eB.n;
  console.log(`  Barajado del corte ancho:`);
  for (const d of DESPL) {
    const e = escalera("A", mejorAncho.nom, mejorAncho.met, () => true, d);
    const a = acc();
    for (const q of [3, 4]) { a.n += e.B[q].n; a.win += e.B[q].win; a.gan += e.B[q].gan; a.per += e.B[q].per; }
    barajAncho[d] = ratio(a);
    console.log(`    barajado ${d} meses: n=${num(a.n)} · acierta ${pct(acierto(a))} · RATIO ${ratio(a).toFixed(2)}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// LOS DOS EXTREMOS, DIRECTOS — las dos lecturas que pedia el encargo
// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"=".repeat(104)}`);
console.log("  LAS DOS LECTURAS, CARA A CARA (cociente 30/90)");
console.log(`${"=".repeat(104)}`);
console.log(`  | cortes | envase | frente BARATO (monton 1) | frente CARO (monton 5) | envase entero |`);
console.log(`  |---|---|---|---|---|`);
for (const met of METODOS) for (const en of ["A", "B"]) {
  const e = escalera(en, "30/90", met);
  const b1 = e.B[0], b5 = e.B[NB - 1];
  console.log(`  | ${met} | ${en} | ${ratio(b1).toFixed(2)} (acierta ${pct(acierto(b1))}, n=${num(b1.n)}) | ${ratio(b5).toFixed(2)} (acierta ${pct(acierto(b5))}, n=${num(b5.n)}) | ${ratio(baseline[en].a).toFixed(2)} (acierta ${pct(acierto(baseline[en].a))}) |`);
}

// ════════════════════════════════════════════════════════════════════════════
// RESUMEN
// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"=".repeat(104)}`);
console.log("  RESUMEN");
console.log(`${"=".repeat(104)}`);
console.log(`  celdas medidas: ${COCIENTES.length * METODOS.length * NB * 2} (+ ${DESPL.length} barajados)`);
if (mejor) {
  console.log(`  mejor celda del envase A: cociente ${mejor.nom} · cortes contra ${mejor.met} · ${ETIQ[mejor.q]}`);
  console.log(`  RATIO ${mejor.r.toFixed(2)} (hace falta 1.40; el envase vacio da ${ratio(baseline.A.a).toFixed(2)})`);
  console.log(`  acierto ${pct(mejor.acc)} (hace falta 21%; el envase vacio da ${pct(acierto(baseline.A.a))})`);
  console.log(`  operaciones al ano: ${infoMejor.opsAno} (la senal vive ${infoMejor.spanAnos.toFixed(1)} anos, no los 11 del fichero)`);
  console.log(`  barajados: ` + DESPL.map((d) => `${d} meses → ${barajados[d].toFixed(2)}`).join(" · "));
  console.log(`  envase B con la misma regla: RATIO ${ratioB.toFixed(2)} · acierta ${pct(accB)}`);
  console.log(`  anos por debajo de 1: ${infoMejor.malos} de ${infoMejor.cuentan} · tickers para la mitad del dinero: ${infoMejor.cuantos}`);
  if (peri) console.log(`  earnings: ${peri.disparosPorTickerAno.toFixed(1)} disparos por ticker y ano · ${pct(peri.frac4)} en los 4 meses favoritos (por azar ${pct(peri.frac4Azar)})`);
  if (dfMejor) console.log(`  dentro de esos meses ${dfMejor.dentro.ratio.toFixed(2)} (n=${num(dfMejor.dentro.n)}) · fuera ${dfMejor.fuera.ratio.toFixed(2)} (n=${num(dfMejor.fuera.n)})`);
  // la misma senal SIN estacionalidad de calendario, en el mismo cociente y monton
  const eR = escalera("A", mejor.nom, "residuo").B[mejor.q];
  console.log(`  el mismo monton con la estacionalidad de mes QUITADA: n=${num(eR.n)} · acierta ${pct(acierto(eR))} · RATIO ${ratio(eR).toFixed(2)}`);
  console.log(`\n  EL CORTE ANCHO (40% de arriba) — el que de verdad da para operar:`);
  console.log(`  cociente ${mejorAncho.nom} · cortes contra ${mejorAncho.met} · RATIO ${mejorAncho.r.toFixed(2)} · acierta ${pct(mejorAncho.acc)} · n=${num(mejorAncho.n)} (${infoAncho.opsAno} al ano, sobre ${infoAncho.spanAnos.toFixed(1)} anos)`);
  console.log(`  el LISTON JUSTO en esos mismos dias: RATIO ${mejorAncho.listonJusto.toFixed(2)} · acierta ${pct(mejorAncho.listonJustoAcc)} (envase B: ${mejorAncho.listonJustoB.toFixed(2)} / ${pct(mejorAncho.listonJustoAccB)})`);
  console.log(`  barajados: ` + DESPL.map((d) => `${d} meses → ${barajAncho[d].toFixed(2)}`).join(" · "));
  console.log(`  envase B: RATIO ${mejorAncho.rB.toFixed(2)} · acierta ${pct(mejorAncho.accB)}`);
  console.log(`  anos por debajo de 1: ${infoAncho.malos} de ${infoAncho.cuentan} · tickers para la mitad del dinero: ${infoAncho.cuantos}`);
}
console.log(`  minutos: ${((Date.now() - t0) / 60000).toFixed(1)}`);
console.log(`${"=".repeat(104)}\n`);

// ── volcado ─────────────────────────────────────────────────────────────────
writeFileSync("scripts/y4-la-curva-del-ticker.json", JSON.stringify({
  envaseVacio: Object.fromEntries(["A", "B"].map((e) => [e, { n: baseline[e].a.n, acierto: acierto(baseline[e].a), ratio: ratio(baseline[e].a) }])),
  escaleras: COCIENTES.flatMap(([nom]) => METODOS.flatMap((met) => ["A", "B"].map((en) => {
    const e = escalera(en, nom, met);
    return { cociente: nom, cortes: met, envase: en, montones: e.B.map((a) => ({ n: a.n, acierto: acierto(a), ratio: ratio(a) })) };
  }))),
  mejor, barajados, periodicidad: peri, dentroFuera: dfMejor, anchos, mejorAncho, barajAncho,
}, null, 1), "utf8");
console.log("escrito scripts/y4-la-curva-del-ticker.json");
