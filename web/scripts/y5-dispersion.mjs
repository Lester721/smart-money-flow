// EL ÍNDICE CONTRA SUS PIEZAS — la dispersión implícita como señal.
//
// ═══ QUÉ MIDE Y POR QUÉ ═════════════════════════════════════════════════════════════════════
//
// Las mesas que viven de esto no adivinan la dirección: comparan dos precios. Un índice es una
// cesta de acciones, así que lo que cuesta el movimiento del índice y lo que cuesta el
// movimiento medio de sus piezas TIENEN que estar relacionados. Cuando el índice está barato
// respecto a sus piezas, comprar índice es comprar barato. Y al revés.
//
// Cada día se calcula:
//   · la CUÑA del índice = (call + put justo al dinero, a ~60 días) ÷ precio del índice
//   · la CUÑA MEDIA de las piezas = media de esa misma cuenta en cada acción con cadena ese día
//   · el COCIENTE = cuña del índice ÷ cuña media de las piezas   ← la dispersión implícita
//
// El cociente se compara con SU PROPIA historia (los 250 días anteriores, ventana que TERMINA
// EL DÍA ANTES — nada del futuro entra) y se parte en cinco montones.
//
// Y se miden DOS cosas que no son la misma:
//   (a) ¿mejora comprar el ÍNDICE (SPY/QQQ) los días de cociente bajo/alto?
//   (b) ¿mejora comprar las ACCIONES esos mismos días?
//
// ═══ EL ENVASE, YA FIJADO — NO SE TOCA ══════════════════════════════════════════════════════
//   ENVASE A: 10% fuera del dinero · 60 días de plazo · vender a los 30 días de bolsa
//   ENVASE B:  5% fuera del dinero · 90 días de plazo · vender a los 30 días de bolsa
//   Se compra UNA opción suelta al ASK y se vende al BID. Se arriesgan $1,000 siempre.
//   RATIO = dólares ganados ÷ dólares perdidos.  Listón del envase A sin señal: 1.11
//
// ═══ LAS REGLAS DE LA CASA ══════════════════════════════════════════════════════════════════
//   · se COMPRA al ASK y se VENDE al BID. Nunca punto medio para el DINERO.
//     (La señal sí se mide a punto medio: es una MEDIDA de nivel de volatilidad, no un P&L, y
//      usar el punto medio evita que la horquilla —más ancha en acciones que en el índice—
//      contamine el cociente. Se dice explícitamente porque importa.)
//   · ningún modelo de precios. Black-Scholes no aparece. El precio del subyacente sale de la
//     PARIDAD PUT-CALL DEL VENCIMIENTO MÁS CERCANO (identidad de no-arbitraje, no un modelo);
//     mirar toda la cadena a la vez devuelve el precio A FUTURO, inflado, y ése era el fallo.
//   · un HUECO no es un cero. Si falta la cadena del día de salida, la operación se descarta y
//     se cuenta aparte. Si la cadena está y el contrato no aparece, es que no tiene puja: vale
//     0 y se pierde el 100%. Eso es un dato REAL.
//   · sólo el pasado. El percentil se calcula con los 250 días ANTERIORES.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/y5-dispersion.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";

// ── parámetros declarados ANTES de medir ────────────────────────────────────
const INDICES = ["SPY", "QQQ"];
const NO_ACCION = new Set(["SPY", "QQQ", "SPX", "SPXW", "NDX"]);   // no son piezas
const MIN_DIAS_CESTA = 2000;      // sólo entran en la cesta los tickers con historia larga
const MIN_PIEZAS = 18;            // días con menos piezas: no hay señal
const DTE_CUNA = 60;              // la cuña se mide al mismo plazo en todos
const TOL_CUNA = 17;              // ±17 días sobre 60
const TOL_ATM = 0.02;             // el strike "al dinero" no puede estar a más del 2% del precio
const VENTANA = 250;              // historia contra la que se compara el cociente
const MIN_HIST = 150;             // hacen falta al menos 150 días previos para dar percentil
const NB = 5;                     // cinco montones
const DESPL = 125;                // EL BARAJADO: la misma señal con el día equivocado (medio año)

const ENVASES = {
  A: { dist: 0.10, dte: 60, salida: 30 },
  B: { dist: 0.05, dte: 90, salida: 30 },
};
const ASKMIN = 0.10;
const TOLK = 0.50;
const APUESTA = 1000;

const CRISIS = ["2018", "2020", "2022", "2025"];

// ── utilidades ──────────────────────────────────────────────────────────────
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) + "%" : "  n/d");
const usd = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : "n/d");
const num = (n) => (Number.isFinite(n) ? n.toLocaleString("en-US") : "n/d");
const r2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : " n/d");

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

// La CESTA: acciones con historia larga. Ojo — es una elección hecha mirando cuántos días hay en
// disco, no cómo se comportaron. No selecciona ganadoras; selecciona "de cuáles bajamos todo".
const CESTA = TICKERS.filter((t) => !NO_ACCION.has(t) && diasPorSim.get(t).length >= MIN_DIAS_CESTA);
// Sub-cestas para la prueba de fragilidad (orden alfabético, sin elegir a dedo).
const CESTA10 = CESTA.slice(0, 10);
const CESTA20 = CESTA.slice(0, 20);
// Las acciones que se OPERAN: todas las que no son índice (incluidas las de historia corta).
const ACCIONES = TICKERS.filter((t) => !NO_ACCION.has(t));

const TOTDIAS = [...diasPorSim.values()].reduce((a, v) => a + v.length, 0);
console.log(`\n## ${TICKERS.length} tickers · ${num(TOTDIAS)} días de cadena en disco`);
console.log(`## cesta de piezas (${CESTA.length}): ${CESTA.join(" ")}`);
console.log(`## acciones que se operan (${ACCIONES.length}): ${ACCIONES.join(" ")}`);
console.log(`## índices: ${INDICES.join(" ")}\n`);

// ── lectura: cada fichero se abre UNA sola vez ──────────────────────────────
let lecturas = 0, rotos = 0;
function leer(sym, dia) {
  const f = `${CDIR}/${sym}_d${dia}.json`;
  if (!existsSync(f)) return null;
  try { const v = JSON.parse(readFileSync(f, "utf8")); lecturas++; return v; } catch { rotos++; return null; }
}

/** EL PRECIO DEL SUBYACENTE — paridad put-call SÓLO en el vencimiento más cercano.
 *  S = K + mid(call) − mid(put), con K el strike donde call y put valen casi lo mismo.
 *  Mirar toda la cadena a la vez devuelve el precio a futuro (inflado). Ése era el fallo. */
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

/** LA CUÑA AL DINERO, relativa: (call + put al dinero a ~60 días) ÷ precio. A punto medio. */
function cunaRel(c, hoy, S) {
  let exp = null, md = Infinity;
  for (const e of Object.keys(c)) {
    const d = dteDe(hoy, e); if (d < 1) continue;
    const x = Math.abs(d - DTE_CUNA); if (x < md) { md = x; exp = e; }
  }
  if (!exp || md > TOL_CUNA) return null;
  const g = c[exp];
  let K = null, dm = Infinity;
  for (const cl of Object.keys(g)) {
    if (cl.slice(-1) !== "C") continue;
    const k = Number(cl.slice(0, -2));
    if (!g[`${k}|P`]) continue;
    const d = Math.abs(k - S);
    if (d < dm) { dm = d; K = k; }
  }
  if (K == null || Math.abs(K - S) / S > TOL_ATM) return null;
  const C = g[`${K}|C`], P = g[`${K}|P`];
  if (!(C[1] > 0) || !(P[1] > 0)) return null;
  const cuna = (C[0] + C[1]) / 2 + (P[0] + P[1]) / 2;
  return cuna > 0 ? cuna / S : null;
}

const tolDte = (d) => Math.max(6, Math.round(d * 0.28));

/** Elegir el contrato de entrada del envase: `dist` fuera, vencimiento cerca de `dte`. */
function elegir(c, S, dte, dist, tipo, hoy) {
  let exp = null, md = Infinity;
  for (const e of Object.keys(c)) {
    const d = dteDe(hoy, e); if (d < 1) continue;
    const x = Math.abs(d - dte); if (x < md) { md = x; exp = e; }
  }
  if (!exp || md > tolDte(dte)) return null;
  const objetivo = tipo === "C" ? S * (1 + dist) : S * (1 - dist);
  const g = c[exp];
  let best = null, bd = Infinity;
  for (const [cl, ba] of Object.entries(g)) {
    if (cl.slice(-1) !== tipo) continue;
    const ask = ba[1];
    if (!(ask >= ASKMIN)) continue;
    const K = Number(cl.slice(0, -2));
    const d = Math.abs(K - objetivo);
    if (d < bd) { bd = d; best = { K, clave: cl, bid: ba[0], ask }; }
  }
  if (!best) return null;
  const distReal = tipo === "C" ? best.K / S - 1 : 1 - best.K / S;
  if (Math.abs(distReal - dist) > dist * TOLK) return null;
  return { exp, ...best, distReal };
}

// ════════════════════════════════════════════════════════════════════════════
// PASADA ÚNICA — cada fichero se lee una vez. Sale: la señal por día y ticker,
// y todas las operaciones de los dos envases.
// ════════════════════════════════════════════════════════════════════════════
const cunas = new Map();        // ticker -> Map(dia -> cuñaRel)
const ops = [];                 // operaciones cerradas
const sanidad = { entradas: 0, sinSpot: 0, sinCuna: 0, sinContrato: 0, huecos: 0, trunc: 0 };

const t0 = Date.now();
for (const tk of TICKERS) {
  const fechas = diasPorSim.get(tk);
  const mapCuna = new Map();
  const pend = new Map();       // fecha de salida -> [operaciones abiertas]
  const esIdx = INDICES.includes(tk);
  const esAcc = ACCIONES.includes(tk);
  const opera = esIdx || esAcc;
  const enCesta = CESTA.includes(tk);

  for (let i = 0; i < fechas.length; i++) {
    const dia = fechas[i];
    const c = leer(tk, dia);
    if (!c) continue;

    // 1) cerrar lo que vence hoy (antes de abrir nada nuevo)
    const lote = pend.get(dia);
    if (lote) {
      pend.delete(dia);
      for (const o of lote) {
        const g = c[o.exp];
        if (!g) { sanidad.huecos++; continue; }      // el vencimiento entero no está: HUECO
        const salida = g[o.clave]?.[0] ?? 0;         // sin puja = 0. Dato real.
        ops.push({
          tk, dia: o.dia, ano: o.dia.slice(0, 4), env: o.env, tipo: o.tipo,
          pl: APUESTA * (salida - o.ask) / o.ask,
          coste: o.ask / o.S, horq: (o.ask - o.bid) / o.ask,
          distReal: o.distReal, sinValor: salida === 0 ? 1 : 0, trunc: o.trunc,
        });
      }
    }

    // 2) la señal del día
    const S = spotOk(c, dia);
    if (!S) { sanidad.sinSpot++; continue; }
    if (esIdx || enCesta) {
      const u = cunaRel(c, dia, S);
      if (u == null) sanidad.sinCuna++; else mapCuna.set(dia, u);
    }

    // 3) abrir las operaciones de los dos envases
    if (!opera) continue;
    sanidad.entradas++;
    for (const [nom, e] of Object.entries(ENVASES)) {
      const dSal0 = fechas[i + e.salida];
      for (const tipo of ["C", "P"]) {
        const ct = elegir(c, S, e.dte, e.dist, tipo, dia);
        if (!ct) { sanidad.sinContrato++; continue; }
        if (!dSal0) { sanidad.huecos++; continue; }
        let dSal = dSal0, trunc = 0;
        if (dSal >= ct.exp) { dSal = ct.exp; trunc = 1; sanidad.trunc++; }
        if (!pend.has(dSal)) pend.set(dSal, []);
        pend.get(dSal).push({ dia, env: nom, tipo, S, exp: ct.exp, clave: ct.clave, ask: ct.ask, bid: ct.bid, distReal: ct.distReal, trunc });
      }
    }
  }
  // lo que queda abierto es HUECO: la cadena de su día de salida no existe
  for (const v of pend.values()) sanidad.huecos += v.length;
  cunas.set(tk, mapCuna);
  process.stdout.write(`   ${tk} · ${num(ops.length)} operaciones · ${Math.round((Date.now() - t0) / 1000)}s\n`);
}

// ════════════════════════════════════════════════════════════════════════════
// SANIDAD
// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("  SANIDAD");
console.log(`${"═".repeat(104)}`);
console.log(`  ficheros de cadena leídos: ${num(lecturas)} · ilegibles: ${rotos}`);
console.log(`  días de entrada usados (todos los días de bolsa con cadena): ${num(sanidad.entradas)}`);
console.log(`  días sin precio deducible (paridad): ${num(sanidad.sinSpot)} · sin cuña al dinero: ${num(sanidad.sinCuna)}`);
console.log(`  combinaciones sin contrato que encaje: ${num(sanidad.sinContrato)}`);
console.log(`  OPERACIONES cerradas: ${num(ops.length)}`);
console.log(`  HUECOS descartados  : ${num(sanidad.huecos)} (${pct(sanidad.huecos / (sanidad.huecos + ops.length))})`);
console.log(`  salidas truncadas al vencimiento (llega antes el vencimiento que el día 30): ${num(sanidad.trunc)}`);
for (const nom of Object.keys(ENVASES)) {
  for (const [et, univ] of [["índice", INDICES], ["acciones", ACCIONES]]) {
    const v = ops.filter((o) => o.env === nom && univ.includes(o.tk));
    if (!v.length) continue;
    console.log(`  envase ${nom} · ${et.padEnd(8)}: n=${num(v.length).padStart(7)} · prima media ${pct(media(v.map((x) => x.coste)))} del subyacente · horquilla ${pct(media(v.map((x) => x.horq)))} de la prima · distancia real ${pct(media(v.map((x) => x.distReal)))} · vencen sin valor ${pct(media(v.map((x) => x.sinValor)))}`);
  }
}

// ── réplica del listón: UNA entrada al mes por ticker, envase A ──────────────
const primeraDelMes = new Map();   // ticker -> Set(dia)
for (const tk of TICKERS) {
  const s = new Set(); const vistos = new Set();
  for (const d of diasPorSim.get(tk)) { const m = d.slice(0, 6); if (!vistos.has(m)) { vistos.add(m); s.add(d); } }
  primeraDelMes.set(tk, s);
}
const primeraDeSemana = new Map();
for (const tk of TICKERS) {
  const s = new Set(); const vistos = new Set();
  for (const d of diasPorSim.get(tk)) {
    const k = Math.floor(ms(d) / (7 * 86_400_000));
    if (!vistos.has(k)) { vistos.add(k); s.add(d); }
  }
  primeraDeSemana.set(tk, s);
}
const esMensual = (o) => primeraDelMes.get(o.tk).has(o.dia);
const esSemanal = (o) => primeraDeSemana.get(o.tk).has(o.dia);

// ── acumulador y ratio ──────────────────────────────────────────────────────
function agrega(v) {
  let n = 0, win = 0, gan = 0, per = 0;
  for (const o of v) { n++; if (o.pl > 0) { win++; gan += o.pl; } else per += -o.pl; }
  return { n, win, gan, per, ratio: per > 0 ? gan / per : NaN, acierto: n ? win / n : NaN,
           ganMedio: win ? gan / win : NaN, perMedio: n - win ? per / (n - win) : NaN };
}
const A = (v) => agrega(v);

console.log(`\n${"═".repeat(104)}`);
console.log("  EL LISTÓN — ¿reproduce esta tubería el envase ya medido?");
console.log(`${"═".repeat(104)}`);
console.log(`  envase A publicado      : n=6,960 · acierta 17.3% · ganador medio $4,859 · perdedor medio $916 · RATIO 1.11`);
{
  const v = ops.filter((o) => o.env === "A" && esMensual(o));
  const a = A(v);
  console.log(`  reproducido (1 al mes)  : n=${num(a.n)} · acierta ${pct(a.acierto)} · ganador medio $${usd(a.ganMedio)} · perdedor medio $${usd(a.perMedio)} · RATIO ${r2(a.ratio)}`);
}
{
  const v = ops.filter((o) => o.env === "B" && esMensual(o));
  const a = A(v);
  console.log(`  envase B (1 al mes)     : n=${num(a.n)} · acierta ${pct(a.acierto)} · ganador medio $${usd(a.ganMedio)} · perdedor medio $${usd(a.perMedio)} · RATIO ${r2(a.ratio)}`);
}
console.log(`\n  Y el mismo envase con las cadencias que usa este estudio (más entradas = más resolución de señal,`);
console.log(`  pero las operaciones se solapan mucho entre sí; el listón que hay que batir es el de CADA fila):`);
console.log(`  | universo | cadencia | envase A: n / ratio / acierto | envase B: n / ratio / acierto |`);
console.log(`  |---|---|---|---|`);
const CADENCIAS = [["diaria", () => true], ["semanal", esSemanal], ["mensual", esMensual]];
const BASE = {};
for (const [et, univ] of [["índice", INDICES], ["acciones", ACCIONES]]) {
  for (const [cn, cf] of CADENCIAS) {
    const a = A(ops.filter((o) => o.env === "A" && univ.includes(o.tk) && cf(o)));
    const b = A(ops.filter((o) => o.env === "B" && univ.includes(o.tk) && cf(o)));
    BASE[`${et}|${cn}`] = { a, b };
    console.log(`  | ${et} | ${cn} | ${num(a.n)} / **${r2(a.ratio)}** / ${pct(a.acierto)} | ${num(b.n)} / **${r2(b.ratio)}** / ${pct(b.acierto)} |`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// LA SEÑAL — el cociente índice / piezas, y su percentil contra los 250 días
// anteriores (ventana que TERMINA EL DÍA ANTES).
// ════════════════════════════════════════════════════════════════════════════
const DIAS_TODOS = [...new Set([].concat(...INDICES.map((t) => [...cunas.get(t).keys()])))].sort();

function serieCociente(idx, cesta) {
  const ci = cunas.get(idx);
  const out = [];
  for (const d of DIAS_TODOS) {
    const u = ci.get(d);
    if (u == null) continue;
    const piezas = [];
    for (const t of cesta) { const x = cunas.get(t)?.get(d); if (x != null) piezas.push(x); }
    if (piezas.length < Math.min(MIN_PIEZAS, cesta.length)) continue;
    out.push({ d, R: u / media(piezas), piezas: piezas.length, uIdx: u, uPza: media(piezas) });
  }
  return out;
}

/** Percentil contra los VENTANA días ANTERIORES. La ventana termina el día ANTES: nada del
 *  futuro entra. Devuelve Map(dia -> montón 0..4). */
function montones(serie) {
  const m = new Map();
  for (let i = 0; i < serie.length; i++) {
    const desde = Math.max(0, i - VENTANA);
    const hist = serie.slice(desde, i);          // estrictamente ANTERIORES
    if (hist.length < MIN_HIST) continue;
    let menores = 0;
    for (const h of hist) if (h.R < serie[i].R) menores++;
    const p = menores / hist.length;
    m.set(serie[i].d, Math.min(NB - 1, Math.floor(p * NB)));
  }
  return m;
}

/** EL BARAJADO: la misma señal con el día equivocado. Desplazamiento FIJO hacia atrás
 *  (DESPL días de la serie), nunca Math.random. Sigue siendo información del pasado. */
function montonesBarajados(serie, mReal) {
  const m = new Map();
  for (let i = DESPL; i < serie.length; i++) {
    const b = mReal.get(serie[i - DESPL].d);
    if (b != null) m.set(serie[i].d, b);
  }
  return m;
}

const SER = {}, MON = {}, MONB = {};
for (const idx of INDICES) {
  SER[idx] = serieCociente(idx, CESTA);
  MON[idx] = montones(SER[idx]);
  MONB[idx] = montonesBarajados(SER[idx], MON[idx]);
}

console.log(`\n${"═".repeat(104)}`);
console.log("  LA SEÑAL — el cociente índice / piezas");
console.log(`${"═".repeat(104)}`);
console.log(`  AVISO HONESTO: sólo tenemos ${CESTA.length} piezas y NO están ponderadas como el índice. La media simple`);
console.log(`  de las cuñas es una APROXIMACIÓN de la dispersión, no la dispersión de verdad. Abajo se comprueba`);
console.log(`  si el resultado aguanta con 10 piezas, con 20 y con todas.`);
console.log(`\n  | índice | días con cociente | días con montón | piezas/día (media) | cuña índice | cuña piezas | cociente medio | cociente mín-máx |`);
console.log(`  |---|---|---|---|---|---|---|---|`);
for (const idx of INDICES) {
  const s = SER[idx];
  const R = s.map((x) => x.R).sort((a, b) => a - b);
  console.log(`  | ${idx} | ${num(s.length)} | ${num(MON[idx].size)} | ${media(s.map((x) => x.piezas)).toFixed(1)} | ${pct(media(s.map((x) => x.uIdx)))} | ${pct(media(s.map((x) => x.uPza)))} | ${r2(media(R))} | ${r2(R[0])} – ${r2(R[R.length - 1])} |`);
}
{
  const s = SER["SPY"];
  console.log(`\n  Rango de fechas de la señal: ${s[0].d} → ${s[s.length - 1].d}`);
  console.log(`  Media del cociente por año (SPY) — si esto derivara mucho, el percentil móvil de 250 días es justo lo que lo arregla:`);
  const porAno = new Map();
  for (const x of s) { const y = x.d.slice(0, 4); if (!porAno.has(y)) porAno.set(y, []); porAno.get(y).push(x.R); }
  console.log(`  | ${[...porAno.keys()].sort().join(" | ")} |`);
  console.log(`  |${[...porAno.keys()].map(() => "---").join("|")}|`);
  console.log(`  | ${[...porAno.keys()].sort().map((y) => r2(media(porAno.get(y)))).join(" | ")} |`);
}

// ════════════════════════════════════════════════════════════════════════════
// LAS ESCALERAS
// ════════════════════════════════════════════════════════════════════════════
const ETIQ = ["1 índice MÁS BARATO", "2", "3 medio", "4", "5 índice MÁS CARO"];

function escalera(titulo, filtro, mapaMonton, envase, cadencia) {
  const [cn, cf] = cadencia;
  const v = ops.filter((o) => o.env === envase && filtro(o) && cf(o));
  const cubos = Array.from({ length: NB }, () => []);
  let sinMonton = 0;
  for (const o of v) {
    const b = mapaMonton(o);
    if (b == null) { sinMonton++; continue; }
    cubos[b].push(o);
  }
  const tot = A(v.filter((o) => mapaMonton(o) != null));
  console.log(`\n  ── ${titulo} · envase ${envase} · cadencia ${cn} ──`);
  console.log(`  | montón | n | RATIO | acierto | ganador medio | perdedor medio | gana | pierde |`);
  console.log(`  |---|---|---|---|---|---|---|---|`);
  const rs = [];
  for (let b = 0; b < NB; b++) {
    const a = A(cubos[b]);
    rs.push(a.ratio);
    console.log(`  | ${ETIQ[b]} | ${num(a.n)} | **${r2(a.ratio)}** | ${pct(a.acierto)} | $${usd(a.ganMedio)} | $${usd(a.perMedio)} | $${usd(a.gan)} | $${usd(a.per)} |`);
  }
  console.log(`  | TODOS | ${num(tot.n)} | ${r2(tot.ratio)} | ${pct(tot.acierto)} | $${usd(tot.ganMedio)} | $${usd(tot.perMedio)} | $${usd(tot.gan)} | $${usd(tot.per)} |`);
  if (sinMonton) console.log(`  (${num(sinMonton)} operaciones sin montón: aún no había 150 días de historia previa)`);
  return { cubos, rs, tot };
}

const enIdx = (o) => INDICES.includes(o.tk);
const enAcc = (o) => ACCIONES.includes(o.tk);
const DIARIA = ["diaria", () => true];
const SEMANAL = ["semanal", esSemanal];
const MENSUAL = ["mensual", esMensual];

console.log(`\n${"═".repeat(104)}`);
console.log("  (a) ¿MEJORA COMPRAR EL ÍNDICE? — cada índice con SU propio cociente");
console.log(`${"═".repeat(104)}`);
const RES = {};
for (const env of ["A", "B"]) {
  RES[`idx|${env}`] = escalera("SPY y QQQ, cada uno con su señal", enIdx, (o) => MON[o.tk]?.get(o.dia), env, DIARIA);
}
for (const idx of INDICES) {
  for (const env of ["A", "B"]) {
    escalera(`sólo ${idx}`, (o) => o.tk === idx, (o) => MON[idx].get(o.dia), env, DIARIA);
  }
}

console.log(`\n${"═".repeat(104)}`);
console.log("  (b) ¿MEJORA COMPRAR LAS ACCIONES ESOS MISMOS DÍAS?");
console.log(`${"═".repeat(104)}`);
for (const fuente of INDICES) {
  for (const env of ["A", "B"]) {
    RES[`acc|${fuente}|${env}`] = escalera(`acciones, señal de ${fuente}`, enAcc, (o) => MON[fuente].get(o.dia), env, DIARIA);
  }
}

console.log(`\n${"═".repeat(104)}`);
console.log("  EL BARAJADO — la misma señal con el día equivocado (desplazada 125 días de la serie)");
console.log(`  Si el barajado da lo mismo, no hay señal.`);
console.log(`${"═".repeat(104)}`);
for (const env of ["A", "B"]) {
  RES[`idxB|${env}`] = escalera("ÍNDICE — señal BARAJADA", enIdx, (o) => MONB[o.tk]?.get(o.dia), env, DIARIA);
}
for (const fuente of INDICES) {
  for (const env of ["A", "B"]) {
    RES[`accB|${fuente}|${env}`] = escalera(`ACCIONES — señal BARAJADA de ${fuente}`, enAcc, (o) => MONB[fuente].get(o.dia), env, DIARIA);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// FRAGILIDAD DE LA CESTA — 10 piezas, 20 piezas, todas
// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("  ¿AGUANTA CON MENOS PIEZAS? — la misma escalera con cestas de 10, 20 y todas");
console.log(`${"═".repeat(104)}`);
console.log(`  cesta de 10: ${CESTA10.join(" ")}`);
console.log(`  cesta de 20: ${CESTA20.join(" ")}`);
const CESTAS = [["10", CESTA10], ["20", CESTA20], [String(CESTA.length), CESTA]];
for (const [et, univ, filtro, fuente] of [["índice", INDICES, enIdx, null], ["acciones", ACCIONES, enAcc, "SPY"]]) {
  for (const env of ["A", "B"]) {
    console.log(`\n  ── ${et} · envase ${env} — ratio por montón según el tamaño de la cesta ──`);
    console.log(`  | cesta | ${ETIQ.join(" | ")} | todos |`);
    console.log(`  |---|---|---|---|---|---|---|`);
    for (const [cet, cst] of CESTAS) {
      const mons = {};
      for (const idx of INDICES) mons[idx] = montones(serieCociente(idx, cst));
      const mf = fuente ? (o) => mons[fuente].get(o.dia) : (o) => mons[o.tk]?.get(o.dia);
      const v = ops.filter((o) => o.env === env && filtro(o));
      const cubos = Array.from({ length: NB }, () => []);
      for (const o of v) { const b = mf(o); if (b != null) cubos[b].push(o); }
      const tot = A(v.filter((o) => mf(o) != null));
      console.log(`  | ${cet} piezas | ${cubos.map((c) => r2(A(c).ratio)).join(" | ")} | ${r2(tot.ratio)} |`);
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// EL EXAMEN DE LA MEJOR REGLA
// ════════════════════════════════════════════════════════════════════════════
function examen(titulo, v, base) {
  const a = A(v);
  console.log(`\n${"═".repeat(104)}`);
  console.log(`  ${titulo}`);
  console.log(`${"═".repeat(104)}`);
  console.log(`  n=${num(a.n)} · RATIO ${r2(a.ratio)} · acierta ${pct(a.acierto)} · ganador medio $${usd(a.ganMedio)} · perdedor medio $${usd(a.perMedio)}`);
  if (base) console.log(`  sin señal (mismo universo, misma cadencia): RATIO ${r2(base.ratio)} · acierta ${pct(base.acierto)}`);

  // año a año
  const anos = [...new Set(v.map((o) => o.ano))].sort();
  console.log(`\n  Año a año:`);
  console.log(`  | año | ${anos.join(" | ")} |`);
  console.log(`  |---|${anos.map(() => "---").join("|")}|`);
  console.log(`  | n | ${anos.map((y) => num(v.filter((o) => o.ano === y).length)).join(" | ")} |`);
  const rr = anos.map((y) => A(v.filter((o) => o.ano === y)).ratio);
  console.log(`  | ratio | ${rr.map(r2).join(" | ")} |`);
  console.log(`  | acierto | ${anos.map((y) => pct(A(v.filter((o) => o.ano === y)).acierto)).join(" | ")} |`);
  const malos = rr.filter((x) => Number.isFinite(x) && x < 1).length;
  console.log(`  años por debajo de 1.00: ${malos} de ${rr.filter((x) => Number.isFinite(x)).length}`);

  // crisis
  console.log(`\n  Las cuatro crisis por separado: ${CRISIS.map((y) => `${y} → ${r2(A(v.filter((o) => o.ano === y)).ratio)}`).join(" · ")}`);

  // sin febrero-mayo 2020
  const sin20 = A(v.filter((o) => !(o.dia >= "20200201" && o.dia <= "20200531")));
  console.log(`  quitando febrero–mayo de 2020: n=${num(sin20.n)} · RATIO ${r2(sin20.ratio)} · acierta ${pct(sin20.acierto)}`);

  // concentración por ticker
  const porTk = new Map();
  for (const o of v) { if (!porTk.has(o.tk)) porTk.set(o.tk, []); porTk.get(o.tk).push(o); }
  const lst = [...porTk.entries()].map(([k, w]) => ({ k, a: A(w) })).sort((x, y) => y.a.gan - x.a.gan);
  let ac = 0, cuantos = 0;
  for (const t of lst) { if (t.a.gan <= 0) break; ac += t.a.gan; cuantos++; if (ac >= a.gan / 2) break; }
  console.log(`\n  Por ticker: ${lst.length} tickers · ${lst.filter((t) => t.a.ratio > 1).length} con ratio > 1 · **${cuantos} tickers juntan la mitad de todo lo ganado**`);
  console.log(`  mejores: ${lst.slice(0, 5).map((t) => `${t.k} ${r2(t.a.ratio)}`).join(" · ")}`);
  console.log(`  peores : ${lst.slice(-5).map((t) => `${t.k} ${r2(t.a.ratio)}`).join(" · ")}`);
  const sinMejor = { gan: a.gan - lst[0].a.gan, per: a.per - lst[0].a.per };
  console.log(`  ratio quitando ${lst[0].k} entero: ${r2(sinMejor.gan / sinMejor.per)}`);

  // frecuencia
  const dd = [...new Set(v.map((o) => o.dia))].sort();
  const anosSpan = (ms(dd[dd.length - 1]) - ms(dd[0])) / (365.25 * 86_400_000);
  console.log(`\n  Frecuencia: ${num(v.length)} operaciones en ${anosSpan.toFixed(1)} años = **${num(Math.round(v.length / anosSpan))} operaciones al año** (${num(dd.length)} días distintos)`);
  return { a, malos, cuantos, opsAno: Math.round(v.length / anosSpan), sin20 };
}

// La mejor regla se elige mirando los extremos de la escalera, no una casilla suelta.
console.log(`\n${"═".repeat(104)}`);
console.log("  EXAMEN DE LOS EXTREMOS — los dos montones de la punta, en los dos universos y envases");
console.log(`${"═".repeat(104)}`);
const EXAMENES = {};
for (const env of ["A", "B"]) {
  for (const b of [0, NB - 1]) {
    EXAMENES[`idx|${env}|${b}`] = examen(
      `ÍNDICE · envase ${env} · montón "${ETIQ[b]}" (señal propia, cadencia diaria)`,
      ops.filter((o) => o.env === env && enIdx(o) && MON[o.tk]?.get(o.dia) === b),
      BASE[`índice|diaria`][env === "A" ? "a" : "b"]);
  }
}
for (const env of ["A", "B"]) {
  for (const b of [0, NB - 1]) {
    EXAMENES[`acc|${env}|${b}`] = examen(
      `ACCIONES · envase ${env} · montón "${ETIQ[b]}" (señal de SPY, cadencia diaria)`,
      ops.filter((o) => o.env === env && enAcc(o) && MON["SPY"].get(o.dia) === b),
      BASE[`acciones|diaria`][env === "A" ? "a" : "b"]);
  }
}

// ── la misma punta con cadencias no solapadas ───────────────────────────────
console.log(`\n${"═".repeat(104)}`);
console.log("  LOS EXTREMOS CON CADENCIAS QUE SE SOLAPAN MENOS");
console.log(`${"═".repeat(104)}`);
console.log(`  | universo | envase | montón | diaria | semanal | mensual |`);
console.log(`  |---|---|---|---|---|---|`);
for (const [et, filtro, mf] of [["índice", enIdx, (o) => MON[o.tk]?.get(o.dia)], ["acciones", enAcc, (o) => MON["SPY"].get(o.dia)]]) {
  for (const env of ["A", "B"]) {
    for (const b of [0, NB - 1]) {
      const cel = CADENCIAS.map(([, cf]) => {
        const a = A(ops.filter((o) => o.env === env && filtro(o) && cf(o) && mf(o) === b));
        return `${r2(a.ratio)} (n=${num(a.n)})`;
      });
      console.log(`  | ${et} | ${env} | ${ETIQ[b]} | ${cel.join(" | ")} |`);
    }
  }
}

// ── contraste directo: montón 1 contra montón 5 ─────────────────────────────
console.log(`\n${"═".repeat(104)}`);
console.log("  RESUMEN — la punta contra el listón");
console.log(`${"═".repeat(104)}`);
console.log(`  | universo | envase | señal | ratio montón 1 | ratio montón 5 | listón (todos) | BARAJADO m1 | BARAJADO m5 |`);
console.log(`  |---|---|---|---|---|---|---|---|`);
for (const env of ["A", "B"]) {
  const r = RES[`idx|${env}`], rb = RES[`idxB|${env}`];
  console.log(`  | índice | ${env} | propia | ${r2(r.rs[0])} | ${r2(r.rs[NB - 1])} | ${r2(r.tot.ratio)} | ${r2(rb.rs[0])} | ${r2(rb.rs[NB - 1])} |`);
}
for (const fuente of INDICES) for (const env of ["A", "B"]) {
  const r = RES[`acc|${fuente}|${env}`], rb = RES[`accB|${fuente}|${env}`];
  console.log(`  | acciones | ${env} | ${fuente} | ${r2(r.rs[0])} | ${r2(r.rs[NB - 1])} | ${r2(r.tot.ratio)} | ${r2(rb.rs[0])} | ${r2(rb.rs[NB - 1])} |`);
}

// ════════════════════════════════════════════════════════════════════════════
// ¿SON LOS MONTONES OTRA COSA DISFRAZADA? El cociente es MUY persistente, así que
// el percentil contra 250 días puede quedarse pegado meses enteros en el mismo
// montón. Si eso pasa, "montón 5" no es una señal: es "el año 2018".
// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("  ¿LOS MONTONES SON SEÑAL O SON CALENDARIO?");
console.log(`${"═".repeat(104)}`);
const ANOS_TODOS = [...new Set(DIAS_TODOS.map((d) => d.slice(0, 4)))].sort();
for (const idx of INDICES) {
  console.log(`\n  ${idx} — cuántos DÍAS cae cada montón en cada año (ventana de ${VENTANA} días):`);
  console.log(`  | montón | ${ANOS_TODOS.join(" | ")} | rachas seguidas (mediana) |`);
  console.log(`  |---|${ANOS_TODOS.map(() => "---").join("|")}|---|`);
  const dOrd = [...MON[idx].keys()].sort();
  for (let b = 0; b < NB; b++) {
    const fila = ANOS_TODOS.map((y) => dOrd.filter((d) => d.slice(0, 4) === y && MON[idx].get(d) === b).length);
    // rachas: días seguidos en el mismo montón
    const rachas = []; let cur = 0;
    for (const d of dOrd) { if (MON[idx].get(d) === b) cur++; else if (cur) { rachas.push(cur); cur = 0; } }
    if (cur) rachas.push(cur);
    rachas.sort((a, c) => a - c);
    console.log(`  | ${b + 1} | ${fila.join(" | ")} | ${rachas.length ? rachas[rachas.length >> 1] : 0} días (la más larga ${rachas.length ? rachas[rachas.length - 1] : 0}) |`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// SEÑAL RÁPIDA — el mismo cociente contra sólo 60 días. Si el problema era que
// la ventana larga convierte el montón en una etiqueta de época, ésta lo arregla.
// ════════════════════════════════════════════════════════════════════════════
const VENTANA_R = 60, MIN_HIST_R = 40;
function montonesRapidos(serie) {
  const m = new Map();
  for (let i = 0; i < serie.length; i++) {
    const hist = serie.slice(Math.max(0, i - VENTANA_R), i);
    if (hist.length < MIN_HIST_R) continue;
    let menores = 0;
    for (const h of hist) if (h.R < serie[i].R) menores++;
    m.set(serie[i].d, Math.min(NB - 1, Math.floor((menores / hist.length) * NB)));
  }
  return m;
}
const MONR = {}, MONRB = {};
for (const idx of INDICES) { MONR[idx] = montonesRapidos(SER[idx]); MONRB[idx] = montonesBarajados(SER[idx], MONR[idx]); }
console.log(`\n${"═".repeat(104)}`);
console.log(`  SEÑAL RÁPIDA — el cociente contra sólo ${VENTANA_R} días en vez de ${VENTANA}`);
console.log(`${"═".repeat(104)}`);
for (const idx of INDICES) {
  const dOrd = [...MONR[idx].keys()].sort();
  const rachas = []; let cur = 0, ult = null;
  for (const d of dOrd) { const b = MONR[idx].get(d); if (b === ult) cur++; else { if (cur) rachas.push(cur); cur = 1; ult = b; } }
  if (cur) rachas.push(cur);
  rachas.sort((a, c) => a - c);
  console.log(`  ${idx}: ${num(MONR[idx].size)} días con montón · racha mediana en el mismo montón ${rachas[rachas.length >> 1]} días (antes era mucho más larga)`);
}
console.log(`  | universo | envase | señal | m1 | m2 | m3 | m4 | m5 | todos | BARAJADO m1 | BARAJADO m5 |`);
console.log(`  |---|---|---|---|---|---|---|---|---|---|`);
for (const env of ["A", "B"]) {
  for (const [et, filtro, mf, mfb, sn] of [
    ["índice", enIdx, (o) => MONR[o.tk]?.get(o.dia), (o) => MONRB[o.tk]?.get(o.dia), "propia"],
    ["acciones", enAcc, (o) => MONR["SPY"].get(o.dia), (o) => MONRB["SPY"].get(o.dia), "SPY"],
    ["acciones", enAcc, (o) => MONR["QQQ"].get(o.dia), (o) => MONRB["QQQ"].get(o.dia), "QQQ"],
  ]) {
    const v = ops.filter((o) => o.env === env && filtro(o));
    const cel = [], celB = [];
    for (let b = 0; b < NB; b++) { cel.push(r2(A(v.filter((o) => mf(o) === b)).ratio)); celB.push(r2(A(v.filter((o) => mfb(o) === b)).ratio)); }
    const tot = A(v.filter((o) => mf(o) != null));
    console.log(`  | ${et} | ${env} | ${sn} | ${cel.join(" | ")} | ${r2(tot.ratio)} | ${celB[0]} | ${celB[NB - 1]} |`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ¿Y SI LA SEÑAL ELIGE LADO EN VEZ DE ELEGIR DÍA? — calls contra puts
// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("  CALLS CONTRA PUTS EN CADA MONTÓN — por si la dispersión eligiera LADO en vez de día");
console.log(`${"═".repeat(104)}`);
console.log(`  | universo | envase | lado | m1 | m2 | m3 | m4 | m5 |`);
console.log(`  |---|---|---|---|---|---|---|---|`);
for (const [et, filtro, mf] of [["índice", enIdx, (o) => MON[o.tk]?.get(o.dia)], ["acciones", enAcc, (o) => MON["SPY"].get(o.dia)]]) {
  for (const env of ["A", "B"]) {
    for (const lado of ["C", "P"]) {
      const v = ops.filter((o) => o.env === env && filtro(o) && o.tipo === lado);
      const cel = [];
      for (let b = 0; b < NB; b++) cel.push(r2(A(v.filter((o) => mf(o) === b)).ratio));
      console.log(`  | ${et} | ${env} | ${lado === "C" ? "calls" : "puts "} | ${cel.join(" | ")} |`);
    }
  }
}

// ── el barajado también en cadencia mensual, que es donde mejor pinta ────────
console.log(`\n${"═".repeat(104)}`);
console.log("  LA CASILLA QUE MEJOR PINTA, CON SU BARAJADO, EN LAS TRES CADENCIAS");
console.log(`  (acciones · envase A · señal de SPY · montón 5 = índice caro respecto a sus piezas)`);
console.log(`${"═".repeat(104)}`);
console.log(`  | cadencia | señal REAL | señal BARAJADA | listón sin señal |`);
console.log(`  |---|---|---|---|`);
for (const [cn, cf] of CADENCIAS) {
  const real = A(ops.filter((o) => o.env === "A" && enAcc(o) && cf(o) && MON["SPY"].get(o.dia) === NB - 1));
  const bar = A(ops.filter((o) => o.env === "A" && enAcc(o) && cf(o) && MONB["SPY"].get(o.dia) === NB - 1));
  const lis = BASE[`acciones|${cn}`].a;
  console.log(`  | ${cn} | ${r2(real.ratio)} (n=${num(real.n)}, acierta ${pct(real.acierto)}) | ${r2(bar.ratio)} (n=${num(bar.n)}) | ${r2(lis.ratio)} (acierta ${pct(lis.acierto)}) |`);
}

// ════════════════════════════════════════════════════════════════════════════
// AUDITORÍA — ¿estoy comparando los mismos tickers en los dos extremos?
// 9 de las 35 acciones sólo tienen 83 días de cadena (todos de 2026). Si el
// montón 1 los tiene y el montón 5 no, la escalera compara UNIVERSOS distintos,
// no días distintos. Se rehace todo con las 26 de historia larga.
// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("  AUDITORÍA — ¿los dos extremos tienen los MISMOS tickers dentro?");
console.log(`${"═".repeat(104)}`);
console.log(`  | montón | tickers distintos (envase A, señal SPY) | de ellos, de historia corta |`);
console.log(`  |---|---|---|`);
const CORTA = new Set(ACCIONES.filter((t) => diasPorSim.get(t).length < MIN_DIAS_CESTA));
for (let b = 0; b < NB; b++) {
  const tk = new Set(ops.filter((o) => o.env === "A" && enAcc(o) && MON["SPY"].get(o.dia) === b).map((o) => o.tk));
  console.log(`  | ${b + 1} | ${tk.size} | ${[...tk].filter((t) => CORTA.has(t)).length} |`);
}
console.log(`  (de historia corta = menos de ${num(MIN_DIAS_CESTA)} días de cadena, todos de 2026: ${[...CORTA].join(" ")})`);

const enAcc26 = (o) => CESTA.includes(o.tk);
console.log(`\n  MISMA ESCALERA, sólo con las ${CESTA.length} acciones de historia larga (universo idéntico en los cinco montones):`);
console.log(`  | envase | señal | m1 | m2 | m3 | m4 | m5 | listón | BARAJADO m1 | BARAJADO m5 |`);
console.log(`  |---|---|---|---|---|---|---|---|---|---|`);
for (const env of ["A", "B"]) {
  for (const fuente of INDICES) {
    const v = ops.filter((o) => o.env === env && enAcc26(o));
    const cel = [], celB = [];
    for (let b = 0; b < NB; b++) {
      cel.push(r2(A(v.filter((o) => MON[fuente].get(o.dia) === b)).ratio));
      celB.push(r2(A(v.filter((o) => MONB[fuente].get(o.dia) === b)).ratio));
    }
    console.log(`  | ${env} | ${fuente} | ${cel.join(" | ")} | ${r2(A(v).ratio)} | ${celB[0]} | ${celB[NB - 1]} |`);
  }
}
console.log(`\n  Y el acierto, que es la palanca que se buscaba:`);
console.log(`  | envase | señal | m1 | m2 | m3 | m4 | m5 | sin señal |`);
console.log(`  |---|---|---|---|---|---|---|---|`);
for (const env of ["A", "B"]) {
  for (const fuente of INDICES) {
    const v = ops.filter((o) => o.env === env && enAcc26(o));
    const cel = [];
    for (let b = 0; b < NB; b++) cel.push(pct(A(v.filter((o) => MON[fuente].get(o.dia) === b)).acierto));
    console.log(`  | ${env} | ${fuente} | ${cel.join(" | ")} | ${pct(A(v).acierto)} |`);
  }
}

console.log(`\n  PUERTAS ABIERTAS: 2 universos (índice / acciones) × 2 envases (A / B) × 2 fuentes de señal`);
console.log(`  (SPY / QQQ) × 5 montones = 40 casillas de escalera. Más 3 tamaños de cesta y 3 cadencias`);
console.log(`  como comprobación, y el barajado de cada una. La definición de la cuña (al dinero, ~60 días,`);
console.log(`  punto medio) y la ventana de 250 días se fijaron ANTES de mirar ningún resultado.`);
console.log(`  minutos: ${((Date.now() - t0) / 60000).toFixed(1)}`);
console.log(`${"═".repeat(104)}\n`);
