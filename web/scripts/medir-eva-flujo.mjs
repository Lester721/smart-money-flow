// MEDICIÓN DE EVA SOBRE EL FLUJO REAL DE 2024-2026.
//
// Uso: node --env-file=.env.local scripts/with-theta.mjs node scripts/medir-eva-flujo.mjs
// Env: EVA_MIN_PRIMA=5000000  EVA_TOPE_TICKER=4000  EVA_HOLD=10  EVA_SALIDA=scripts/eva-filas-2024.json
//
// QUÉ HACE. Coge las operaciones notables bajadas por `bajar-flujo-historico.mjs`, elige la
// muestra, y para cada una pide a ThetaData **el precio del subyacente en el instante de la
// operación** y **la cotización del día de salida**. Con eso quedan medibles cuatro de las seis
// categorías del scorecard, y el P&L sale de precios reales de punta a punta.
//
// LA MUESTRA (aprobada por Lester el 2026-08-15, con el inventario delante):
//   · prima ≥ $5M            → 32.631 operaciones de las 191.838
//   · tope de 4.000 por ticker → ningún ticker pasa del ~15%
// El tope importa: sin él TSLA sería el 27% y a ≥$10M el 30%. Lo que tumbó el hallazgo de agosto
// fue exactamente eso — NFLX era el 25% de la muestra.
//
// POR QUÉ SE PIDE EL SUBYACENTE Y NO SE USA EL CIERRE DEL DÍA. Sin el precio del subyacente en
// ese instante no hay IV ni griegas, y usar el cierre sería un aproximado. Se pide con
// `/stock/history/quote`, UNA vez por ticker+día y cacheada, y se toma el punto medio de la
// horquilla en la marca vigente en el instante de la operación.
//
// ⚠ AQUÍ SE PERDIERON 45 MINUTOS EL 2026-08-15, Y LA LECCIÓN SE QUEDA ESCRITA.
// La primera versión sacaba el subyacente de `underlying_price` en la cotización de la OPCIÓN.
// Esa columna **no existe** en `/v3/option/history/quote` (tiene 13: symbol, expiration, strike,
// right, timestamp, bid/ask con size, exchange y condition — ninguna más). `indexOf` devolvía −1,
// el precio salía 0, y el filtro `spot > 0` tiraba las 27.672 operaciones. El contador marcaba
// "0 filas" durante 45 minutos sin un solo error. Un campo que no existe se lee como 0, y el 0 se
// lee como "no hay datos". Por eso ahora hay un CORTE TEMPRANO abajo: si al principio casi nada
// produce fila, el proceso muere en el primer minuto en vez de en el cuadragésimo quinto.
//
// LO QUE NO MIDE, y hay que decirlo cada vez que se lea el resultado:
//   · ESTRUCTURA (15% del peso) — necesita el open interest de TODA la cadena, no sólo el del
//     contrato operado. Se puede añadir con una pasada mensual (33 llamadas por ticker), barata.
//   · CONFIRMACIÓN (10%) — se calcula con las barras POSTERIORES al flujo. Meterla tal cual sería
//     mirar al futuro. Hay que medirla con entrada posterior a la ventana de confirmación.
// O sea: esto mide el 75% del peso del scorecard, y lo dice.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const B = (process.env.THETA_BASE || "http://127.0.0.1:25503").replace(/\/+$/, "").replace(/\/v3$/, "") + "/v3";
const DIR = process.env.FLUJO_DIR || "scripts/cache-theta/flujo-historico";
const MIN_PRIMA = Number(process.env.EVA_MIN_PRIMA || 5_000_000);
const TOPE_TICKER = Number(process.env.EVA_TOPE_TICKER || 4000);
const HOLD = Number(process.env.EVA_HOLD || 10);
const SALIDA = process.env.EVA_SALIDA || "scripts/eva-filas-2024.json";
const CONCURRENCIA = 4;                       // el Terminal admite 4 a la vez

const ahora = () => new Date().toLocaleTimeString("en-US", { hour12: false });
const log = (m) => console.log(`[${ahora()}] ${m}`);
const num = (s) => Number(String(s).replace(/"/g, ""));
const txt = (s) => String(s).replace(/"/g, "");

async function csv(ruta, ms = 60_000) {
  try {
    const r = await fetch(`${B}${ruta}`, { signal: AbortSignal.timeout(ms), cache: "no-store" });
    if (r.status === 472) return { estado: "vacio" };
    if (!r.ok) return { estado: "fallo", codigo: `HTTP ${r.status}` };
    const t = await r.text();
    const l = t.trim().split("\n");
    if (l.length < 2) return { estado: "vacio" };
    if (l[0].includes(" ")) return { estado: "fallo", codigo: "no-CSV" };
    return { estado: "ok", cab: l[0].split(","), filas: l.slice(1).map((x) => x.split(",")) };
  } catch (e) { return { estado: "fallo", codigo: e.name === "TimeoutError" ? "timeout" : "red" }; }
}

// ── Black-Scholes SÓLO en la dirección legítima: precio de mercado → IV → griegas ────────────
const nd = (x) => { const t = 1 / (1 + 0.2316419 * Math.abs(x)), d = 0.3989423 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p; };
const phi = (x) => 0.3989423 * Math.exp(-x * x / 2);
const d1f = (S, K, T, v) => (Math.log(S / K) + (v * v / 2) * T) / (v * Math.sqrt(T));
const bsCall = (S, K, T, v) => S * nd(d1f(S, K, T, v)) - K * nd(d1f(S, K, T, v) - v * Math.sqrt(T));
const bsPut = (S, K, T, v) => bsCall(S, K, T, v) - S + K;
/** IV implícita por bisección a partir del precio REAL. Devuelve null si no converge. */
function ivDe(precio, S, K, T, esCall) {
  if (!(precio > 0) || !(S > 0) || !(K > 0) || !(T > 0)) return null;
  let lo = 0.01, hi = 5;
  for (let i = 0; i < 60; i++) {
    const m = (lo + hi) / 2;
    const v = esCall ? bsCall(S, K, T, m) : bsPut(S, K, T, m);
    if (v > precio) hi = m; else lo = m;
  }
  const iv = (lo + hi) / 2;
  return iv > 0.011 && iv < 4.9 ? iv : null;
}
const griegas = (S, K, T, v, esCall) => {
  const d1 = d1f(S, K, T, v);
  return {
    delta: esCall ? nd(d1) : nd(d1) - 1,
    gamma: phi(d1) / (S * v * Math.sqrt(T)),
    theta: -(S * phi(d1) * v) / (2 * Math.sqrt(T)) / 365,
  };
};

// ── 1. ELEGIR LA MUESTRA ──────────────────────────────────────────────────────
function elegirMuestra() {
  const porTicker = {};
  for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
    const d = JSON.parse(readFileSync(join(DIR, f), "utf8"));
    if (d.sinDatos) continue;
    const t = d.sym ?? f.split("_")[0];
    porTicker[t] ??= [];
    for (const n of d.notables ?? []) {
      // Sin bid/ask o sin OI no se puede puntuar: se descarta y se cuenta. No se rellena.
      if (n.prima < MIN_PRIMA || n.bid == null || n.ask == null || n.oi == null) continue;
      porTicker[t].push({ ...n, ticker: t, dia: d.dia });
    }
  }
  const muestra = [];
  for (const [t, ops] of Object.entries(porTicker)) {
    if (ops.length <= TOPE_TICKER) { muestra.push(...ops); continue; }
    // El tope se aplica REPARTIENDO EN EL TIEMPO, no cogiendo las mayores: quedarse con las más
    // grandes sesgaría la muestra hacia los días de pánico, que no son representativos.
    ops.sort((a, b) => a.dia.localeCompare(b.dia) || a.ts.localeCompare(b.ts));
    const paso = ops.length / TOPE_TICKER;
    for (let i = 0; i < TOPE_TICKER; i++) muestra.push(ops[Math.floor(i * paso)]);
  }
  return muestra;
}

// ── 2. ENRIQUECER: subyacente en la entrada + cotización de salida ────────────
const dias = new Map();          // ticker → [días hábiles con datos]
/** Salida a los HOLD días hábiles, PERO nunca después del vencimiento: un contrato que vence en
 *  3 días no cotiza 10 días después. Antes se pedía igual y devolvía NOT_FOUND — miles de
 *  peticiones tiradas. Si vence antes, se sale el último día que cotiza, que es una salida
 *  ejecutable de verdad. Se cuentan las dos por separado y se reportan. */
function diaSalida(ticker, dia, exp) {
  const l = dias.get(ticker);
  if (!l) return null;
  const i = l.indexOf(dia);
  if (i < 0) return null;
  const porPlazo = l[i + HOLD] ?? null;
  const expCompacto = String(exp).replace(/-/g, "");
  if (porPlazo && porPlazo <= expCompacto) return porPlazo;
  // Vence antes: el último día hábil con datos que no pasa del vencimiento.
  for (let k = Math.min(i + HOLD, l.length - 1); k > i; k--) if (l[k] <= expCompacto) return l[k];
  return null;
}

/** Exige que las columnas existan. Un `indexOf` a −1 leído como 0 fue el bug de las 27.672. */
function columnas(cab, pedidas, endpoint) {
  const idx = {};
  for (const c of pedidas) {
    const i = cab.indexOf(c);
    if (i < 0) {
      throw new Error(
        `${endpoint}: no existe la columna "${c}". Las que hay: ${cab.join(", ")}.\n` +
        `  Eso NO es "no hay datos": es que estoy pidiendo un campo que ese endpoint no devuelve.`);
    }
    idx[c] = i;
  }
  return idx;
}

async function serieContrato(ticker, expYmd, strike, right, dia) {
  const d = dia.replace(/-/g, "");
  const q = await csv(`/option/history/quote?symbol=${ticker}&expiration=${expYmd}&strike=${strike}&right=${right}&start_date=${d}&end_date=${d}&interval=1m`, 45_000);
  if (q.estado !== "ok") return null;
  const c = columnas(q.cab, ["timestamp", "bid", "ask"], "option/history/quote");
  const s = [];
  for (const f of q.filas) {
    const bid = num(f[c.bid]), ask = num(f[c.ask]);
    if (!(ask > 0)) continue;
    s.push([Date.parse(txt(f[c.timestamp]) + "Z"), bid, ask]);
  }
  return s.sort((a, b) => a[0] - b[0]);
}

// ── Subyacente: UNA petición por ticker+día, cacheada ─────────────────────────
// El punto medio de la horquilla del subyacente en la marca vigente. Es dato real de mercado,
// no un cierre ni un aproximado. 8 tickers × 683 días = 5.464 peticiones como mucho, frente a
// las 27.672 que haría una por operación.
const cacheSpot = new Map();
async function serieSubyacente(ticker, dia) {
  const clave = `${ticker}|${dia}`;
  if (cacheSpot.has(clave)) return cacheSpot.get(clave);
  const p = (async () => {
    const d = dia.replace(/-/g, "");
    const q = await csv(`/stock/history/quote?symbol=${ticker}&start_date=${d}&end_date=${d}&interval=1m`, 45_000);
    if (q.estado !== "ok") return null;
    const c = columnas(q.cab, ["timestamp", "bid", "ask"], "stock/history/quote");
    const ts = [], px = [];
    for (const f of q.filas) {
      const bid = num(f[c.bid]), ask = num(f[c.ask]);
      if (!(bid > 0) || !(ask > 0)) continue;
      ts.push(Date.parse(txt(f[c.timestamp]) + "Z"));
      px.push((bid + ask) / 2);
    }
    return ts.length ? { ts: Float64Array.from(ts), px: Float64Array.from(px) } : null;
  })();
  cacheSpot.set(clave, p);
  return p;
}
/** Precio del subyacente vigente EN O ANTES de `ms`. Nunca posterior. */
function spotEn(serie, ms) {
  if (!serie) return null;
  let lo = 0, hi = serie.ts.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (serie.ts[m] <= ms) { r = m; lo = m + 1; } else hi = m - 1; }
  return r < 0 ? null : serie.px[r];
}
/** Última marca EN O ANTES. Nunca posterior: sería mirar al futuro. */
function asOf(serie, ms) {
  let lo = 0, hi = serie.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (serie[m][0] <= ms) { r = m; lo = m + 1; } else hi = m - 1; }
  return r < 0 ? null : serie[r];
}

async function main() {
  if (!existsSync(DIR)) { console.error(`No existe ${DIR}`); process.exit(1); }
  log(`eligiendo muestra · prima ≥ $${(MIN_PRIMA / 1e6).toFixed(0)}M · tope ${TOPE_TICKER}/ticker`);
  const muestra = elegirMuestra();
  const cuenta = {};
  for (const x of muestra) cuenta[x.ticker] = (cuenta[x.ticker] ?? 0) + 1;
  log(`muestra: ${muestra.length} operaciones · ${JSON.stringify(cuenta)}`);
  const anios = {};
  for (const x of muestra) anios[x.dia.slice(0, 4)] = (anios[x.dia.slice(0, 4)] ?? 0) + 1;
  log(`por año: ${JSON.stringify(anios)}`);

  // Calendario de días hábiles CON DATOS, por ticker: para saber cuál es el día de salida.
  for (const f of readdirSync(DIR).filter((x) => x.endsWith(".json"))) {
    const d = JSON.parse(readFileSync(join(DIR, f), "utf8"));
    const t = d.sym ?? f.split("_")[0];
    if (!dias.has(t)) dias.set(t, []);
    if (!d.sinDatos) dias.get(t).push(d.dia);
  }
  for (const l of dias.values()) l.sort();

  const filas = [];
  let hechas = 0, sinEntrada = 0, sinSalida = 0, sinIV = 0, sinSpot = 0, fallos = 0;
  let filasSinIV = 0;   // filas VÁLIDAS a las que no se les pudo sacar IV. NO son descartes.
  const t0 = Date.now();

  // ── CORTE TEMPRANO ───────────────────────────────────────────────────────────
  // Si de las primeras CATA operaciones casi ninguna produce fila, esto NO es un resultado:
  // es un bug. Muere aquí, en el primer minuto, diciendo qué contador se las comió — en vez de
  // llegar al final con un fichero vacío. El 2026-08-15 esta comprobación habría ahorrado 45 min.
  const CATA = 300, MIN_VIVAS = 0.05;
  const revisarCata = () => {
    const vistas = filas.length + sinEntrada + sinSalida + sinIV + sinSpot + fallos;
    if (vistas < CATA) return;
    if (filas.length >= Math.ceil(CATA * MIN_VIVAS)) return;
    const culpables = Object.entries({ sinEntrada, sinSalida, sinIV, sinSpot, fallos })
      .filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}=${v}`).join(" · ");
    throw new Error(
      `CORTE TEMPRANO: ${filas.length} filas de las primeras ${vistas} operaciones ` +
      `(mínimo ${Math.round(MIN_VIVAS * 100)}%).\n` +
      `  Se las comió: ${culpables}\n` +
      `  Un descarte casi total NO es un resultado, es un bug. Arreglar antes de volver a correr.`);
  };

  for (let i = 0; i < muestra.length; i += CONCURRENCIA) {
    const tanda = muestra.slice(i, i + CONCURRENCIA);
    await Promise.all(tanda.map(async (n) => {
      const expYmd = n.exp.replace(/-/g, "");
      const esCall = n.right === "C";
      const salida = diaSalida(n.ticker, n.dia, n.exp);
      if (!salida) { sinSalida++; return; }
      const l = dias.get(n.ticker);
      const adelantada = salida !== (l[l.indexOf(n.dia) + HOLD] ?? null);

      const [sEnt, sSal, sSpot] = await Promise.all([
        serieContrato(n.ticker, expYmd, n.strike, n.right, n.dia),
        serieContrato(n.ticker, expYmd, n.strike, n.right, salida),
        serieSubyacente(n.ticker, n.dia),
      ]);
      if (!sEnt) { sinEntrada++; return; }

      const msEnt = Date.parse(n.ts + "Z");
      const spot = spotEn(sSpot, msEnt);
      if (!(spot > 0)) { sinSpot++; return; }

      // Tiempo a vencimiento en años, desde la entrada.
      const T = (Date.parse(`${n.exp}T20:00:00Z`) - msEnt) / (365 * 24 * 3600 * 1000);
      if (!(T > 0)) { sinIV++; return; }

      // IV Y GRIEGAS: SE CALCULAN SI SE PUEDE, Y SI NO SE DEJA null. NO SE TIRA LA FILA.
      // El 29% de las operaciones grandes están muy dentro del dinero y cotizan POR DEBAJO del
      // valor intrínseco — cosa real cuando hay dividendo esperado, no un error del dato. Este
      // Black-Scholes no lleva dividendos, así que ahí no hay IV que sacar. Tirarlas dejaría
      // fuera justo el flujo de reemplazo de acciones y sesgaría la muestra hacia lo que está
      // fuera del dinero. Se quedan, marcadas, y al puntuar se dice con cuántas se pudo.
      const iv = ivDe(n.price, spot, n.strike, T, esCall);
      const g = iv == null ? { delta: null, gamma: null, theta: null }
                           : griegas(spot, n.strike, T, iv, esCall);
      if (iv == null) filasSinIV++;

      // SALIDA A PRECIO REAL: se vende al BID. Sin cotización de salida no se inventa nada.
      let exitBid = null;
      if (sSal) {
        const ult = sSal[sSal.length - 1];
        if (ult && ult[1] > 0) exitBid = ult[1];
      }
      if (exitBid == null) { sinSalida++; return; }

      filas.push({
        ticker: n.ticker, dia: n.dia, ts: n.ts, exp: n.exp, strike: n.strike, right: n.right,
        size: n.size, price: n.price, prima: n.prima, bid: n.bid, ask: n.ask, oi: n.oi,
        spot, iv, delta: g.delta, gamma: g.gamma, theta: g.theta,
        dte: Math.round((Date.parse(`${n.exp}T20:00:00Z`) - Date.parse(`${n.dia}T20:00:00Z`)) / 86_400_000),
        diaSalida: salida, exitBid, salidaAdelantada: adelantada,
        // P&L de comprar el mismo contrato y venderlo al bid tras HOLD días hábiles.
        pnl: exitBid / n.price - 1,
        variasPatas: !!n.variasPatas,
      });
      hechas++;
    }));

    revisarCata();

    if ((i / CONCURRENCIA) % 50 === 0 && i > 0) {
      const seg = (Date.now() - t0) / 1000;
      const restan = muestra.length - i;
      log(`  ${i}/${muestra.length} · ${filas.length} filas · ${(seg / i).toFixed(2)}s c/u · faltan ~${((restan * seg / i) / 3600).toFixed(1)} h`);
    }
  }

  mkdirSync(dirname(SALIDA), { recursive: true });
  writeFileSync(SALIDA, JSON.stringify(filas), "utf8");

  log(`LISTO · ${filas.length} filas en ${SALIDA}`);
  log(`descartes → sin cotización de entrada: ${sinEntrada} · sin subyacente: ${sinSpot} · ` +
      `sin plazo válido: ${sinIV} · sin cotización de salida: ${sinSalida} · fallos: ${fallos}`);
  log(`cobertura de IV/griegas → ${filas.length - filasSinIV} de ${filas.length} filas ` +
      `(${(100 * (filas.length - filasSinIV) / Math.max(1, filas.length)).toFixed(0)}%). ` +
      `Las otras ${filasSinIV} cotizan por debajo del intrínseco: se miden en P&L, no en griegas.`);
  const adelantadas = filas.filter((f) => f.salidaAdelantada).length;
  log(`salidas → a los ${HOLD} días hábiles: ${filas.length - adelantadas} · ` +
      `adelantadas por vencimiento: ${adelantadas}`);
  const descartadas = muestra.length - filas.length;
  if (descartadas / muestra.length >= 0.9) {
    log(`⚠ SE DESCARTÓ EL ${(100 * descartadas / muestra.length).toFixed(0)}% de la muestra. ` +
        `Eso hay que explicarlo antes de leer ningún número de aquí.`);
  }
  log(`Si los descartes pasan del 20% de la muestra, ESO es un problema y no un resultado.`);
  const porA = {}, porT = {};
  for (const f of filas) { porA[f.dia.slice(0, 4)] = (porA[f.dia.slice(0, 4)] ?? 0) + 1; porT[f.ticker] = (porT[f.ticker] ?? 0) + 1; }
  log(`reparto final por año: ${JSON.stringify(porA)}`);
  log(`reparto final por ticker: ${JSON.stringify(porT)}`);
}

main().catch((e) => { console.error("FALLO:", e.message); process.exit(1); });
