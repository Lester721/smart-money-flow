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
// ese instante no hay IV ni griegas, y usar el cierre sería un aproximado. La serie de
// cotizaciones ya trae `underlying_price` en cada marca, así que sale gratis con la misma
// petición. Ninguna estimación en el camino del dinero.
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
function diaSalida(ticker, dia) {
  const l = dias.get(ticker);
  if (!l) return null;
  const i = l.indexOf(dia);
  return i < 0 ? null : (l[i + HOLD] ?? null);
}

async function serieContrato(ticker, expYmd, strike, right, dia) {
  const d = dia.replace(/-/g, "");
  const q = await csv(`/option/history/quote?symbol=${ticker}&expiration=${expYmd}&strike=${strike}&right=${right}&start_date=${d}&end_date=${d}&interval=1m`, 45_000);
  if (q.estado !== "ok") return null;
  const iT = q.cab.indexOf("timestamp"), iB = q.cab.indexOf("bid"), iA = q.cab.indexOf("ask"),
    iU = q.cab.indexOf("underlying_price");
  if (iT < 0 || iB < 0 || iA < 0) return null;
  const s = [];
  for (const f of q.filas) {
    const bid = num(f[iB]), ask = num(f[iA]), u = iU >= 0 ? num(f[iU]) : 0;
    if (!(ask > 0)) continue;
    s.push([Date.parse(txt(f[iT]) + "Z"), bid, ask, u]);
  }
  return s.sort((a, b) => a[0] - b[0]);
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
  let hechas = 0, sinEntrada = 0, sinSalida = 0, sinIV = 0, fallos = 0;
  const t0 = Date.now();

  for (let i = 0; i < muestra.length; i += CONCURRENCIA) {
    const tanda = muestra.slice(i, i + CONCURRENCIA);
    await Promise.all(tanda.map(async (n) => {
      const expYmd = n.exp.replace(/-/g, "");
      const esCall = n.right === "C";
      const salida = diaSalida(n.ticker, n.dia);
      if (!salida) { sinSalida++; return; }

      const [sEnt, sSal] = await Promise.all([
        serieContrato(n.ticker, expYmd, n.strike, n.right, n.dia),
        serieContrato(n.ticker, expYmd, n.strike, n.right, salida),
      ]);
      if (!sEnt) { sinEntrada++; return; }

      const pEnt = asOf(sEnt, Date.parse(n.ts + "Z"));
      if (!pEnt || !(pEnt[3] > 0)) { sinEntrada++; return; }
      const spot = pEnt[3];

      // Tiempo a vencimiento en años, desde la entrada.
      const T = (Date.parse(`${n.exp}T20:00:00Z`) - Date.parse(n.ts + "Z")) / (365 * 24 * 3600 * 1000);
      if (!(T > 0)) { sinIV++; return; }
      const iv = ivDe(n.price, spot, n.strike, T, esCall);
      if (iv == null) { sinIV++; return; }
      const g = griegas(spot, n.strike, T, iv, esCall);

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
        diaSalida: salida, exitBid,
        // P&L de comprar el mismo contrato y venderlo al bid tras HOLD días hábiles.
        pnl: exitBid / n.price - 1,
        variasPatas: !!n.variasPatas,
      });
      hechas++;
    }));

    if ((i / CONCURRENCIA) % 50 === 0 && i > 0) {
      const seg = (Date.now() - t0) / 1000;
      const restan = muestra.length - i;
      log(`  ${i}/${muestra.length} · ${filas.length} filas · ${(seg / i).toFixed(2)}s c/u · faltan ~${((restan * seg / i) / 3600).toFixed(1)} h`);
    }
  }

  mkdirSync(dirname(SALIDA), { recursive: true });
  writeFileSync(SALIDA, JSON.stringify(filas), "utf8");

  log(`LISTO · ${filas.length} filas en ${SALIDA}`);
  log(`descartes → sin subyacente/IV: ${sinEntrada + sinIV} · sin cotización de salida: ${sinSalida} · fallos: ${fallos}`);
  log(`Si los descartes pasan del 20% de la muestra, ESO es un problema y no un resultado.`);
  const porA = {}, porT = {};
  for (const f of filas) { porA[f.dia.slice(0, 4)] = (porA[f.dia.slice(0, 4)] ?? 0) + 1; porT[f.ticker] = (porT[f.ticker] ?? 0) + 1; }
  log(`reparto final por año: ${JSON.stringify(porA)}`);
  log(`reparto final por ticker: ${JSON.stringify(porT)}`);
}

main().catch((e) => { console.error("FALLO:", e.message); process.exit(1); });
