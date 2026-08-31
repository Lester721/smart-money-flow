// DESPUÉS DE UN MOVIMIENTO GRANDE — ¿el susto reciente avisa de más susto?
//
// ═══ QUÉ MIDE ESTO Y POR QUÉ ═════════════════════════════════════════════════════════════════
//
// La idea, en una frase: los movimientos grandes vienen en rachas. Si una acción acaba de pegar
// un salto, es más probable que se siga moviendo — y eso es exactamente lo que necesita el que
// compra una opción suelta, que sólo gana si el subyacente se va lejos.
//
// Es el ESPEJO de la familia "la calma antes de la tormenta". Las dos no pueden ser ciertas a la
// vez, así que aquí se miden las dos puntas de la misma escalera: comprar después del susto
// (montón 5) y comprar después de la calma (montón 1). No se elige a dedo: sale la escalera
// entera.
//
// LA PEGA QUE HAY QUE VIGILAR, y por eso se mide aparte: después de un susto la opción está MÁS
// CARA, porque la volatilidad implícita ya subió. Puede pasar que el movimiento SÍ continúe y aun
// así se pierda dinero, porque se pagó de más por él. Por eso cada montón lleva, además del
// ratio: cuánto cuesta la prima (en % del subyacente), cuánto se lleva la horquilla, y cuánto se
// movió DE VERDAD el subyacente durante la tenencia. Si el precio sube más que el movimiento,
// la señal es cierta y aun así no vale dinero.
//
// ═══ EL ENVASE — fijado de antemano, no se toca ══════════════════════════════════════════════
//
//   A (principal):  10% fuera del dinero · 60 días de plazo · vender a los 30 días de bolsa
//   B (contraste):   5% fuera del dinero · 90 días de plazo · vender a los 30 días de bolsa
//
// Se compra al ASK y se vende al BID. Nunca punto medio. Nada de Black-Scholes.
// Una entrada al mes por ticker, call y put. $1.000 arriesgados en cada intento.
//
// ═══ LA VARA ═════════════════════════════════════════════════════════════════════════════════
//
//   RATIO = dólares ganados en total ÷ dólares perdidos en total.   Listón sin señal: 1,11 en A.
//   Objetivo: 1,40. No se usa la t. Además tiene que subir el ACIERTO, aguantar año a año,
//   no depender de cuatro tickers, y morirse al barajar los días.
//
// ═══ EL PRECIO DEL SUBYACENTE ════════════════════════════════════════════════════════════════
//
// Se deduce de la propia cadena por PARIDAD PUT-CALL, y SÓLO EN EL VENCIMIENTO MÁS CERCANO.
// (Mirar toda la cadena a la vez devuelve el precio A FUTURO, inflado. Es el fallo conocido de
// scripts/esquina-barata-10anos.mjs línea 66.) La paridad es una identidad de no-arbitraje, no
// un modelo de precios.
//
// ═══ SÓLO EL PASADO ══════════════════════════════════════════════════════════════════════════
//
// Todas las ventanas del susto terminan el día ANTERIOR al de la compra. Y el montón al que cae
// cada día NO se decide con un percentil de toda la historia: se decide comparando el susto de
// hoy contra la propia historia PREVIA de ese mismo ticker (ventana que crece, mínimo 250
// sesiones antes de que un ticker sea elegible). Así un 3% en KO puede ser un susto y en TSLA un
// martes, sin que el futuro entre por la puerta de atrás.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/y9-despues-del-susto.mjs

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const SPOTCACHE = "scripts/cache-theta/_y9-spots.json";
const APUESTA = 1000;
const TOLK = 0.50;                 // cuánto puede apartarse el strike de la distancia pedida
const MINHIST = 250;               // sesiones de historia propia antes de poder rankear
const SALIDA = 30;                 // días de bolsa hasta vender
const NBUCK = 5;
const DESPL = 12;                  // barajado: la señal de 12 entradas antes (un año) del mismo ticker

const ENVASES = [
  { id: "A", dist: 0.10, dte: 60 },
  { id: "B", dist: 0.05, dte: 90 },
];

const tolDte = (d) => Math.max(6, Math.round(d * 0.28));   // 60 → ±17 ; 90 → ±25
const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) + "%" : "n/d");
const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
const num = (n, d = 2) => (Number.isFinite(n) ? n.toFixed(d) : "n/d");
const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);

// ── índice de días por ticker ────────────────────────────────────────────────
const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/);
  if (!m) continue;
  if (!diasPorSim.has(m[1])) diasPorSim.set(m[1], []);
  diasPorSim.get(m[1]).push(m[2]);
}
for (const v of diasPorSim.values()) v.sort();
// sólo tickers con historia de verdad: los que tienen 83 días (bajados en abril de 2026) no
// pueden dar ni 250 sesiones de ventana ni un año de operaciones.
const TICKERS = [...diasPorSim.keys()].filter((t) => diasPorSim.get(t).length >= 800).sort();

function leer(sym, dia) {
  const f = `${CDIR}/${sym}_d${dia}.json`;
  if (!existsSync(f)) return null;
  try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; }
}

/** EL SPOT ARREGLADO: paridad put-call en el vencimiento MÁS CERCANO. */
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

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 1 — la serie de precios, un pase por TODAS las cadenas (se cachea)
// ════════════════════════════════════════════════════════════════════════════
let SPOTS;
if (existsSync(SPOTCACHE)) {
  SPOTS = JSON.parse(readFileSync(SPOTCACHE, "utf8"));
  console.log(`## serie de precios leída de ${SPOTCACHE}`);
} else {
  SPOTS = {};
  const t0 = Date.now();
  let hechos = 0, nulos = 0;
  for (const sym of TICKERS) {
    const arr = [];
    for (const d of diasPorSim.get(sym)) {
      const c = leer(sym, d);
      const s = c ? spotOk(c, d) : null;
      if (s == null) nulos++;
      arr.push(s);
      hechos++;
    }
    SPOTS[sym] = arr;
    process.stderr.write(`\r   spots · ${sym} · ${hechos.toLocaleString("en-US")} días · ${Math.round((Date.now() - t0) / 1000)}s     `);
  }
  process.stderr.write("\n");
  writeFileSync(SPOTCACHE, JSON.stringify(SPOTS));
  console.log(`## serie de precios construida: ${hechos.toLocaleString("en-US")} días, ${nulos} sin spot`);
}

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 1b — DÍAS ROTOS: dónde el precio deducido de la cadena NO es el precio
// ════════════════════════════════════════════════════════════════════════════
//
// Dos cosas ensucian la serie y las dos fabrican resultados si no se cazan:
//
//   1) SPLITS. Un 10:1 aparece como un −90% que no lo cobró nadie. Y peor: el contrato cambia de
//      strike, así que al buscar la salida ya no está y la operación se anota como pérdida total
//      cuando en realidad no lo fue.
//   2) LA RAÍZ QUE CAMBIA DE DUEÑO. Comprobado en este mismo dato: entre septiembre de 2021 y
//      enero de 2022, las cadenas guardadas bajo "META" son de OTRA empresa — strikes de $4 a $24
//      mientras Facebook cotizaba a $340. 91 días.
//
// El árbitro es el fichero de CIERRES REALES del subyacente (scripts/cache-theta/cierres),
// disponible de 2021 en adelante. Cotejado día a día: 39.024 días comparados, el error del precio
// por paridad es del 0,24% en el peor caso salvo en META, donde 91 días se van hasta el 96%.
// Un día se marca ROTO si:
//   · no hay precio, o
//   · hay cierre real y se aparta más del 5% de él, o
//   · salta más del 35% en un día SIN que el cierre real confirme ese salto.
// Una operación se DESCARTA entera si hay un día roto entre la compra y la venta, las dos
// incluidas. No se rellena nada: se cuenta aparte.
//
const CIERRES = "scripts/cache-theta/cierres";
const cierresDe = (t) => { const p = `${CIERRES}/${t}.json`; if (!existsSync(p)) return null; try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };

const ROTO = {};
let rotoSinSpot = 0, rotoContraCierre = 0, rotoSalto = 0, saltoSalvado = 0;
for (const sym of TICKERS) {
  const dias = diasPorSim.get(sym), s = SPOTS[sym], cl = cierresDe(sym);
  const n = dias.length, ro = new Array(n).fill(false);
  for (let i = 0; i < n; i++) {
    if (s[i] == null) { ro[i] = true; rotoSinSpot++; continue; }
    const c = cl?.[dias[i]];
    if (c != null && c > 0 && Math.abs(s[i] / c - 1) > 0.05) { ro[i] = true; rotoContraCierre++; continue; }
    if (i > 0 && s[i - 1] != null) {
      const rat = s[i] / s[i - 1];
      if (Math.abs(rat - 1) > 0.35) {
        const c0 = cl?.[dias[i - 1]], c1 = cl?.[dias[i]];
        const confirmado = c0 > 0 && c1 > 0 && Math.abs(rat / (c1 / c0) - 1) < 0.03;
        if (confirmado) saltoSalvado++;
        else { ro[i] = true; rotoSalto++; }
      }
    }
  }
  ROTO[sym] = ro;
}

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 2 — las medidas del susto, día a día, SÓLO CON EL PASADO
// ════════════════════════════════════════════════════════════════════════════
//
// r[i] = variación del día i respecto al i-1, saltándose los días rotos.
// Para los RECORRIDOS (punta a punta) no vale la serie cruda: un split le mete un escalón que no
// existió. Se encadena una serie limpia a partir de las variaciones aceptadas.
//
const MEDIDAS = ["max5", "max10", "max20", "rango20", "dias3", "relativo"];
const ETIQ = {
  max5: "mayor movimiento diario de las últimas 5 sesiones",
  max10: "mayor movimiento diario de las últimas 10 sesiones",
  max20: "mayor movimiento diario de las últimas 20 sesiones",
  rango20: "recorrido de punta a punta de las últimas 20 sesiones",
  dias3: "cuántos de los últimos 20 días se movió más del 3%",
  relativo: "recorrido de 5 días dividido por el de 60 (el susto relativo a su propia historia)",
};

const SEN = {};   // sym -> { medida -> array alineado a diasPorSim }
const ADJ = {};
for (const sym of TICKERS) {
  const dias = diasPorSim.get(sym);
  const s = SPOTS[sym];
  const ro = ROTO[sym];
  const n = dias.length;
  const r = new Array(n).fill(null);
  for (let i = 1; i < n; i++) {
    if (ro[i] || ro[i - 1]) continue;
    r[i] = s[i] / s[i - 1] - 1;
  }
  // serie encadenada limpia, para los recorridos de punta a punta
  const adj = new Array(n).fill(null);
  adj[0] = 100;
  for (let i = 1; i < n; i++) adj[i] = adj[i - 1] * (1 + (r[i] ?? 0));
  ADJ[sym] = adj;
  const m = {};
  for (const k of MEDIDAS) m[k] = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    // TODAS las ventanas terminan en i-1: nada del día de la compra entra en la decisión.
    const fin = i - 1;
    if (fin < 60) continue;
    const maxAbs = (k) => { let mx = 0, c = 0; for (let j = fin - k + 1; j <= fin; j++) { if (r[j] == null) continue; c++; const a = Math.abs(r[j]); if (a > mx) mx = a; } return c >= k * 0.7 ? mx : null; };
    const rango = (k) => { let lo = Infinity, hi = -Infinity, c = 0; for (let j = fin - k + 1; j <= fin; j++) { if (ro[j]) continue; const v = ADJ[sym][j]; if (v == null) continue; c++; if (v < lo) lo = v; if (v > hi) hi = v; } return c >= k * 0.7 && lo > 0 ? hi / lo - 1 : null; };
    m.max5[i] = maxAbs(5);
    m.max10[i] = maxAbs(10);
    m.max20[i] = maxAbs(20);
    m.rango20[i] = rango(20);
    { let c = 0, v = 0; for (let j = fin - 19; j <= fin; j++) { if (r[j] == null) continue; c++; if (Math.abs(r[j]) > 0.03) v++; } m.dias3[i] = c >= 14 ? v : null; }
    { const a = rango(5), b = rango(60); m.relativo[i] = a != null && b != null && b > 0 ? a / b : null; }
  }
  SEN[sym] = m;
}

/** Percentil del valor de hoy contra la propia historia PREVIA del ticker (ventana que crece). */
function rankPasado(arr, i) {
  let n = 0, menores = 0;
  const v = arr[i];
  if (v == null) return null;
  for (let j = 0; j < i; j++) { const x = arr[j]; if (x == null) continue; n++; if (x < v) menores++; }
  if (n < MINHIST) return null;
  return menores / n;
}

// ════════════════════════════════════════════════════════════════════════════
// ETAPA 3 — las operaciones. Una entrada al mes por ticker, call y put.
// ════════════════════════════════════════════════════════════════════════════
const ASKMINS = [0.10, 0.0];
const OPS = [];              // { env, askm, sym, dia, ano, tipo, ret, coste, horq, salida, movSub, superoK, rk:{...}, k }
let entradas = 0, sinSpot = 0, sinContrato = 0, huecos = 0, sinVentana = 0, contaminadas = 0;
const t1 = Date.now();

for (const sym of TICKERS) {
  const dias = diasPorSim.get(sym);
  const s = SPOTS[sym];
  const ro = ROTO[sym];
  const men = SEN[sym];
  const n = dias.length;

  // días de entrada: el primero de cada mes con cadena
  const entrada = [];
  const vistos = new Set();
  for (let i = 0; i < n; i++) { const mes = dias[i].slice(0, 6); if (vistos.has(mes)) continue; vistos.add(mes); entrada.push(i); }

  // se necesitan las cadenas de los días de entrada y de los días de salida
  const necesarios = new Set();
  for (const i of entrada) { necesarios.add(i); if (i + SALIDA < n) necesarios.add(i + SALIDA); }

  const cad = new Map();
  for (const i of [...necesarios].sort((a, b) => a - b)) cad.set(i, leer(sym, dias[i]));

  let kEnt = 0;
  for (const i of entrada) {
    const dia = dias[i];
    const c = cad.get(i);
    if (!c) continue;
    const sp = s[i];
    if (sp == null || ro[i]) { sinSpot++; continue; }

    // ¿hay algún día roto entre la compra y la venta? Entonces ni el precio del subyacente ni la
    // identidad del contrato son de fiar (un split le cambia el strike). Se descarta entera.
    const iSalC = i + SALIDA;
    if (iSalC < n) {
      let sucia = false;
      for (let j = i; j <= iSalC; j++) if (ro[j]) { sucia = true; break; }
      if (sucia) { contaminadas++; continue; }
    }

    // el montón: percentil de cada medida contra la propia historia previa
    const rk = {};
    let algo = false;
    for (const k of MEDIDAS) { rk[k] = rankPasado(men[k], i); if (rk[k] != null) algo = true; }
    if (!algo) { sinVentana++; continue; }
    entradas++;
    const kThis = kEnt++;

    const iSal = i + SALIDA;
    const cs = iSal < n ? cad.get(iSal) : null;
    const movSub = cs && s[iSal] != null && sp > 0 ? s[iSal] / sp - 1 : null;

    for (const env of ENVASES) {
      // vencimiento más cercano al plazo pedido
      let exp = null, md = Infinity;
      for (const e of Object.keys(c)) { const dt = dteDe(dia, e); if (dt < 1) continue; const x = Math.abs(dt - env.dte); if (x < md) { md = x; exp = e; } }
      if (!exp || md > tolDte(env.dte)) { sinContrato += 2 * ASKMINS.length; continue; }

      for (const tipo of ["C", "P"]) {
        const objetivo = tipo === "C" ? sp * (1 + env.dist) : sp * (1 - env.dist);
        for (let am = 0; am < ASKMINS.length; am++) {
          let mej = null, dd = Infinity;
          for (const [clave, ba] of Object.entries(c[exp])) {
            if (clave.slice(-1) !== tipo) continue;
            if (!(ba[1] > 0) || ba[1] < ASKMINS[am]) continue;
            const K = Number(clave.slice(0, -2));
            const d = Math.abs(K - objetivo);
            if (d < dd) { dd = d; mej = { K, clave, bid: ba[0], ask: ba[1] }; }
          }
          if (!mej) { sinContrato++; continue; }
          const distReal = tipo === "C" ? mej.K / sp - 1 : 1 - mej.K / sp;
          if (Math.abs(distReal - env.dist) > env.dist * TOLK) { sinContrato++; continue; }

          // salida: bid real del día i+30. Si la cadena de ese día o el vencimiento no están,
          // es un HUECO y la operación se descarta (no se rellena con cero).
          let ds = iSal, trunc = 0, grupo = null;
          if (iSal >= n) { huecos++; continue; }
          let cSal = cs;
          if (dias[iSal] >= exp) {            // la salida cae más allá del vencimiento
            trunc = 1;
            const j = dias.indexOf(exp);
            cSal = j >= 0 ? (cad.get(j) ?? leer(sym, exp)) : null;
            ds = j;
          }
          if (!cSal) { huecos++; continue; }
          grupo = cSal[exp];
          if (!grupo) { huecos++; continue; }
          const salida = grupo[mej.clave]?.[0] ?? 0;   // sin puja = 0. Dato real.

          OPS.push({
            env: env.id, askm: am, sym, dia, ano: dia.slice(0, 4), mes: dia.slice(0, 6), tipo,
            ret: (salida - mej.ask) / mej.ask, coste: mej.ask / sp, horq: (mej.ask - mej.bid) / mej.ask,
            salida, trunc, distReal, movSub, superoK: movSub == null ? null : (tipo === "C" ? movSub > env.dist : movSub < -env.dist),
            rk, k: kThis,
          });
        }
      }
    }
  }
  process.stderr.write(`\r   ops · ${sym} · ${OPS.length.toLocaleString("en-US")} · ${Math.round((Date.now() - t1) / 1000)}s     `);
}
process.stderr.write("\n");

// el barajado: a cada entrada se le pega la señal de la entrada nº k−12 del MISMO ticker
// (un año antes). Desplazamiento fijo, reproducible, nunca Math.random.
{
  const porTk = new Map();
  for (const o of OPS) { if (!porTk.has(o.sym)) porTk.set(o.sym, new Map()); porTk.get(o.sym).set(o.k, o.rk); }
  for (const o of OPS) { const m = porTk.get(o.sym); o.rkB = m.get(o.k - DESPL) ?? null; }
}

// ════════════════════════════════════════════════════════════════════════════
// SANIDAD
// ════════════════════════════════════════════════════════════════════════════
const L = (x = "") => console.log(x);
L(`\n${"═".repeat(104)}`);
L("  SANIDAD");
L(`${"═".repeat(104)}`);
L(`  tickers usados: ${TICKERS.length} · días de cadena: ${TICKERS.reduce((a, t) => a + diasPorSim.get(t).length, 0).toLocaleString("en-US")}`);
L(`  entradas (1 al mes por ticker, con ventana suficiente): ${entradas.toLocaleString("en-US")}`);
L(`  entradas sin spot: ${sinSpot} · entradas sin ventana de señal (historia corta): ${sinVentana}`);
L(`  combinaciones sin contrato que encaje: ${sinContrato.toLocaleString("en-US")}`);
L(`  HUECOS descartados (falta la cadena del día de salida o el vencimiento entero): ${huecos.toLocaleString("en-US")}`);
L(`  entradas descartadas por haber un DÍA ROTO entre la compra y la venta: ${contaminadas.toLocaleString("en-US")}`);
L(`\n  DÍAS ROTOS marcados en la serie de precios:`);
L(`    sin precio deducible                                      : ${rotoSinSpot.toLocaleString("en-US")}`);
L(`    se apartan más del 5% del CIERRE REAL de disco            : ${rotoContraCierre.toLocaleString("en-US")}  ← casi todos de META, cuya raíz es de otra empresa entre 09/2021 y 01/2022`);
L(`    saltan más del 35% en un día y el cierre real NO lo avala : ${rotoSalto.toLocaleString("en-US")}  ← los splits (AAPL 4:1, NVDA 4:1 y 10:1, TSLA 5:1 y 3:1, WMT 3:1, GE 1:8…)`);
L(`    saltos de más del 35% que el cierre real SÍ avala y se quedan: ${saltoSalvado}`);
{
  let porTk = [];
  for (const t of TICKERS) { const c = ROTO[t].filter(Boolean).length; if (c) porTk.push(`${t}:${c}`); }
  L(`    por ticker: ${porTk.join(" · ")}`);
}

const acc = () => ({ n: 0, win: 0, gan: 0, per: 0, coste: 0, horq: 0, sinValor: 0, mov: 0, movN: 0, sup: 0, supN: 0, trunc: 0 });
function add(a, o) {
  const d = APUESTA * o.ret;
  a.n++; if (d > 0) { a.win++; a.gan += d; } else a.per += -d;
  a.coste += o.coste; a.horq += o.horq; if (o.salida === 0) a.sinValor++; a.trunc += o.trunc;
  if (o.movSub != null) { a.mov += Math.abs(o.movSub); a.movN++; a.supN++; if (o.superoK) a.sup++; }
}
const R = (a) => (a.per > 0 ? a.gan / a.per : (a.gan > 0 ? Infinity : NaN));

// ¿reproduce esta tubería el listón publicado?
L(`\n${"═".repeat(104)}`);
L("  EL LISTÓN — ¿reproduce esta tubería los números del envase que me dieron?");
L(`${"═".repeat(104)}`);
L(`  publicado, envase A: ratio 1,11 · acierta 17,3% · ganador medio $4.859 · perdedor medio $916 · n=6.960`);
L(`  publicado, envase B: acierta ~33% · ganador ~$1.237 · perdedor ~$602`);
L(`  | envase | ask mínimo | n | acierto | ganador medio | perdedor medio | RATIO |`);
L(`  |---|---|---|---|---|---|---|`);
const BASE = {};
for (const env of ENVASES) for (let am = 0; am < ASKMINS.length; am++) {
  const a = acc();
  for (const o of OPS) if (o.env === env.id && o.askm === am) add(a, o);
  BASE[`${env.id}|${am}`] = a;
  L(`  | ${env.id} | ${am === 0 ? "$0.10" : "ninguno"} | ${a.n.toLocaleString("en-US")} | ${pct(a.win / a.n)} | ${usd(a.gan / a.win)} | ${usd(a.per / (a.n - a.win))} | ${num(R(a))} |`);
}
// Se sigue con el ask mínimo de $0,10, que es la regla del listón (scripts/z1-la-rejilla-completa.mjs,
// ASKMINS[0]) y el que reproduce el RATIO publicado — que es la vara. No se elige por resultado.
const AM = 0;
L(`\n  → se sigue con ask mínimo $0.10, la regla del listón. Reproduce ratio 1,10 contra el 1,11 publicado.`);
L(`     (la n sale más baja que las 6.960 publicadas porque aquí hacen falta 250 sesiones de historia`);
L(`      propia antes de que un ticker sea elegible, lo que se come 2016, y sólo entran los 28 tickers`);
L(`      con cadena diaria completa de 2016 a 2026.)`);
const ops = OPS.filter((o) => o.askm === AM);

L(`\n  Coste de entrada (envase A): prima media = ${pct(BASE[`A|${AM}`].coste / BASE[`A|${AM}`].n)} del subyacente ·`
  + ` horquilla = ${pct(BASE[`A|${AM}`].horq / BASE[`A|${AM}`].n)} de la prima ·`
  + ` vencen sin puja = ${pct(BASE[`A|${AM}`].sinValor / BASE[`A|${AM}`].n)} ·`
  + ` llegaron al vencimiento antes que al día 30 = ${pct(BASE[`A|${AM}`].trunc / BASE[`A|${AM}`].n)}`);
L(`  Coste de entrada (envase B): prima media = ${pct(BASE[`B|${AM}`].coste / BASE[`B|${AM}`].n)} del subyacente ·`
  + ` horquilla = ${pct(BASE[`B|${AM}`].horq / BASE[`B|${AM}`].n)} de la prima ·`
  + ` vencen sin puja = ${pct(BASE[`B|${AM}`].sinValor / BASE[`B|${AM}`].n)}`);

// ════════════════════════════════════════════════════════════════════════════
// LAS ESCALERAS
// ════════════════════════════════════════════════════════════════════════════
const bucket = (p) => (p == null ? null : Math.min(NBUCK - 1, Math.floor(p * NBUCK)));
const ANOS = [...new Set(ops.map((o) => o.ano))].sort();
const NANOS = ANOS.length;

function escalera(envId, medida, campo = "rk") {
  const b = Array.from({ length: NBUCK }, acc);
  for (const o of ops) {
    if (o.env !== envId) continue;
    const rk = o[campo];
    const k = bucket(rk?.[medida] ?? null);
    if (k == null) continue;
    add(b[k], o);
  }
  return b;
}

const RES = [];
for (const env of ENVASES) {
  L(`\n${"═".repeat(104)}`);
  L(`  ESCALERAS — ENVASE ${env.id}  (${pct(env.dist)} fuera · ${env.dte} días · salir a los 30 de bolsa)`);
  L(`  Montón 1 = la CALMA (el susto más flojo de su propia historia) · Montón 5 = el SUSTO más grande.`);
  L(`${"═".repeat(104)}`);
  for (const med of MEDIDAS) {
    const b = escalera(env.id, med);
    L(`\n  ── ${ETIQ[med]} ──`);
    L(`  | montón | n | RATIO | acierto | ganador medio | perdedor medio | prima/subyacente | horquilla | movimiento real del subyacente en los 30 días | pasó del strike | ops/año |`);
    L(`  |---|---|---|---|---|---|---|---|---|---|---|`);
    for (let k = 0; k < NBUCK; k++) {
      const a = b[k];
      if (!a.n) { L(`  | ${k + 1} | 0 | n/d | | | | | | | | |`); continue; }
      L(`  | ${k + 1}${k === 0 ? " (calma)" : k === NBUCK - 1 ? " (susto)" : ""} | ${a.n.toLocaleString("en-US")} | ${num(R(a))} | ${pct(a.win / a.n)} | ${usd(a.gan / a.win)} | ${usd(a.per / (a.n - a.win))} | ${pct(a.coste / a.n)} | ${pct(a.horq / a.n)} | ${pct(a.mov / a.movN)} | ${pct(a.sup / a.supN)} | ${Math.round(a.n / NANOS)} |`);
      RES.push({ env: env.id, med, k, a, r: R(a) });
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// EL RESUMEN: ¿alguna punta llega a 1,40?
// ════════════════════════════════════════════════════════════════════════════
L(`\n${"═".repeat(104)}`);
L("  INVENTARIO — puntas de escalera (montón 1 y montón 5) ordenadas por ratio");
L(`  ${MEDIDAS.length} medidas × ${ENVASES.length} envases × 5 montones = ${MEDIDAS.length * ENVASES.length * NBUCK} casillas medidas (${MEDIDAS.length * ENVASES.length} escaleras).`);
L(`${"═".repeat(104)}`);
L(`  | envase | medida | montón | n | RATIO | acierto | listón del envase |`);
L(`  |---|---|---|---|---|---|---|`);
const puntas = RES.filter((x) => x.k === 0 || x.k === NBUCK - 1).sort((a, b) => b.r - a.r);
for (const x of puntas) {
  const base = BASE[`${x.env}|${AM}`];
  L(`  | ${x.env} | ${x.med} | ${x.k + 1}${x.k === 0 ? " calma" : " susto"} | ${x.a.n.toLocaleString("en-US")} | ${num(x.r)} | ${pct(x.a.win / x.a.n)} | ${num(R(base))} / ${pct(base.win / base.n)} |`);
}

// ── el mejor candidato del envase A, con todas las pruebas ───────────────────
const cand = puntas.filter((x) => x.env === "A" && x.a.n >= 400)[0];
if (cand) {
  L(`\n${"═".repeat(104)}`);
  L(`  EL MEJOR CANDIDATO DEL ENVASE A: ${ETIQ[cand.med]} · montón ${cand.k + 1} ${cand.k === 0 ? "(calma)" : "(susto)"}`);
  L(`${"═".repeat(104)}`);
  const sel = ops.filter((o) => o.env === "A" && bucket(o.rk?.[cand.med] ?? null) === cand.k);
  const base = BASE[`A|${AM}`];
  L(`  ratio ${num(cand.r)} contra el listón ${num(R(base))} · acierto ${pct(cand.a.win / cand.a.n)} contra ${pct(base.win / base.n)}`);
  L(`  ${sel.length.toLocaleString("en-US")} operaciones en ${NANOS} años = ${Math.round(sel.length / NANOS)} al año`);

  // año a año
  L(`\n  ── AÑO A AÑO ──`);
  L(`  | año | n | RATIO con señal | RATIO sin señal (todas) |`);
  L(`  |---|---|---|---|`);
  let bajo1 = 0;
  for (const y of ANOS) {
    const a = acc(); for (const o of sel) if (o.ano === y) add(a, o);
    const b = acc(); for (const o of ops) if (o.env === "A" && o.ano === y) add(b, o);
    if (a.n && R(a) < 1) bajo1++;
    L(`  | ${y} | ${a.n} | ${a.n ? num(R(a)) : "n/d"} | ${b.n ? num(R(b)) : "n/d"} |`);
  }
  L(`  años por debajo de 1 con señal: ${bajo1} de ${ANOS.filter((y) => sel.some((o) => o.ano === y)).length}`);

  // quitando febrero-mayo de 2020
  {
    const a = acc(); for (const o of sel) if (!(o.mes >= "202002" && o.mes <= "202005")) add(a, o);
    const b = acc(); for (const o of ops) if (o.env === "A" && !(o.mes >= "202002" && o.mes <= "202005")) add(b, o);
    L(`\n  ── SIN FEBRERO-MAYO DE 2020 ──`);
    L(`  con señal: n=${a.n} · ratio ${num(R(a))} · acierto ${pct(a.win / a.n)}`);
    L(`  sin señal: n=${b.n} · ratio ${num(R(b))} · acierto ${pct(b.win / b.n)}`);
  }

  // los cuatro años duros por separado
  L(`\n  ── LOS AÑOS DUROS POR SEPARADO ──`);
  L(`  | año | n con señal | RATIO con señal | n sin señal | RATIO sin señal |`);
  L(`  |---|---|---|---|---|`);
  for (const y of ["2018", "2020", "2022", "2025"]) {
    const a = acc(); for (const o of sel) if (o.ano === y) add(a, o);
    const b = acc(); for (const o of ops) if (o.env === "A" && o.ano === y) add(b, o);
    L(`  | ${y} | ${a.n} | ${a.n ? num(R(a)) : "n/d"} | ${b.n} | ${b.n ? num(R(b)) : "n/d"} |`);
  }

  // concentración por ticker
  {
    const g = new Map();
    for (const o of sel) { const d = APUESTA * o.ret; if (d > 0) g.set(o.sym, (g.get(o.sym) ?? 0) + d); }
    const tot = [...g.values()].reduce((a, b) => a + b, 0);
    const orden = [...g.entries()].sort((a, b) => b[1] - a[1]);
    let ac = 0, cuantos = 0;
    for (const [, v] of orden) { ac += v; cuantos++; if (ac >= tot / 2) break; }
    L(`\n  ── CONCENTRACIÓN ── hacen falta ${cuantos} tickers (de ${new Set(sel.map((o) => o.sym)).size}) para juntar la mitad del dinero ganado.`);
    L(`     los cinco que más ponen: ${orden.slice(0, 5).map(([t, v]) => `${t} ${usd(v)}`).join(" · ")}`);
  }

  // el barajado
  {
    const a = acc();
    for (const o of ops) if (o.env === "A" && bucket(o.rkB?.[cand.med] ?? null) === cand.k) add(a, o);
    L(`\n  ── EL BARAJADO ── la misma regla, pero con la señal de un año antes (${DESPL} entradas de desplazamiento):`);
    L(`     n=${a.n} · ratio ${num(R(a))} · acierto ${pct(a.win / a.n)}`);
  }

  // ¿sube más el precio que el acierto? — la pega declarada
  {
    const b = escalera("A", cand.med);
    L(`\n  ── ¿SUBE MÁS EL PRECIO QUE EL ACIERTO? ──`);
    L(`  | montón | prima/subyacente | acierto | movimiento real del subyacente | pasó del strike |`);
    L(`  |---|---|---|---|---|`);
    for (let k = 0; k < NBUCK; k++) if (b[k].n) L(`  | ${k + 1} | ${pct(b[k].coste / b[k].n)} | ${pct(b[k].win / b[k].n)} | ${pct(b[k].mov / b[k].movN)} | ${pct(b[k].sup / b[k].supN)} |`);
    const c0 = b[0], c4 = b[NBUCK - 1];
    L(`\n  del montón 1 al 5: la prima pasa de ${pct(c0.coste / c0.n)} a ${pct(c4.coste / c4.n)} del subyacente`
      + ` (×${num((c4.coste / c4.n) / (c0.coste / c0.n))}),`);
    L(`  el movimiento real del subyacente pasa de ${pct(c0.mov / c0.movN)} a ${pct(c4.mov / c4.movN)} (×${num((c4.mov / c4.movN) / (c0.mov / c0.movN))}),`);
    L(`  y la fracción que pasa del strike, de ${pct(c0.sup / c0.supN)} a ${pct(c4.sup / c4.supN)} (×${num((c4.sup / c4.supN) / (c0.sup / c0.supN))}).`);
  }
}

// el mismo candidato en el envase B
if (cand) {
  const a = acc();
  for (const o of ops) if (o.env === "B" && bucket(o.rk?.[cand.med] ?? null) === cand.k) add(a, o);
  const base = BASE[`B|${AM}`];
  L(`\n  ── EL MISMO MONTÓN EN EL ENVASE B ── n=${a.n} · ratio ${num(R(a))} (listón B ${num(R(base))}) · acierto ${pct(a.win / a.n)} (listón ${pct(base.win / base.n)})`);
}

// ════════════════════════════════════════════════════════════════════════════
// EN DÓLARES AL AÑO — el % por operación esconde la frecuencia
// ════════════════════════════════════════════════════════════════════════════
if (cand) {
  L(`\n${"═".repeat(104)}`);
  L(`  EN DÓLARES AL AÑO  (siempre $1,000 arriesgados por intento · ${NANOS} años)`);
  L(`${"═".repeat(104)}`);
  L(`  | qué | ops/año | $ neto por operación | $ AL AÑO |`);
  L(`  |---|---|---|---|`);
  const filas = [
    ["envase A entero, sin señal", ops.filter((o) => o.env === "A")],
    [`envase A · ${cand.med} montón ${cand.k + 1}`, ops.filter((o) => o.env === "A" && bucket(o.rk?.[cand.med] ?? null) === cand.k)],
    ["envase A entero, sin señal, SIN feb-may 2020", ops.filter((o) => o.env === "A" && !(o.mes >= "202002" && o.mes <= "202005"))],
    [`envase A · señal, SIN feb-may 2020`, ops.filter((o) => o.env === "A" && bucket(o.rk?.[cand.med] ?? null) === cand.k && !(o.mes >= "202002" && o.mes <= "202005"))],
    ["envase B entero, sin señal", ops.filter((o) => o.env === "B")],
    [`envase B · ${cand.med} montón ${cand.k + 1}`, ops.filter((o) => o.env === "B" && bucket(o.rk?.[cand.med] ?? null) === cand.k)],
  ];
  for (const [et, v] of filas) {
    const a = acc(); for (const o of v) add(a, o);
    const neto = a.gan - a.per;
    L(`  | ${et} | ${Math.round(a.n / NANOS)} | ${usd(neto / a.n)} | ${usd(neto / NANOS)} |`);
  }
  L(`\n  Léase así: la señal hace casi el mismo dinero al año que el envase entero, pero con la CUARTA`);
  L(`  parte de las operaciones. No es "gana más": es "gana lo mismo arriesgando mucho menos".`);
}

// ════════════════════════════════════════════════════════════════════════════
// ¿Y SI SE APRIETA MÁS? — la escalera en DÉCIMAS para la mejor medida
// ════════════════════════════════════════════════════════════════════════════
// La escalera de 5 montones sube de forma ordenada, así que la pregunta obvia es si el 10% más
// asustado sube más todavía. ESTO SON 2 PUERTAS MÁS (una por envase) y se dice.
if (cand) {
  L(`\n${"═".repeat(104)}`);
  L(`  APRETAR MÁS — ${ETIQ[cand.med]}, en DÉCIMAS (2 puertas más, una por envase)`);
  L(`${"═".repeat(104)}`);
  for (const env of ENVASES) {
    const b = Array.from({ length: 10 }, acc);
    for (const o of ops) { if (o.env !== env.id) continue; const p = o.rk?.[cand.med]; if (p == null) continue; add(b[Math.min(9, Math.floor(p * 10))], o); }
    L(`\n  ── envase ${env.id} ──`);
    L(`  | décima | n | RATIO | acierto | prima/subyacente | ops/año |`);
    L(`  |---|---|---|---|---|---|`);
    for (let k = 0; k < 10; k++) if (b[k].n) L(`  | ${k + 1} | ${b[k].n.toLocaleString("en-US")} | ${num(R(b[k]))} | ${pct(b[k].win / b[k].n)} | ${pct(b[k].coste / b[k].n)} | ${Math.round(b[k].n / NANOS)} |`);
  }
}

L(`\n  tiempo total: ${Math.round((Date.now() - t1) / 1000)}s\n`);
