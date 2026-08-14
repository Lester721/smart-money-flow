// DESCARGADOR DE FLUJO HISTÓRICO DE OPCIONES — ThetaData, día a día, desde 2024.
//
// Uso:  node --env-file=.env.local scripts/with-theta.mjs node scripts/bajar-flujo-historico.mjs
// Env:  FLUJO_DESDE=20240102  FLUJO_HASTA=20260813  FLUJO_TICKERS=AAPL,MSFT,...
//       FLUJO_MIN_PRIMA=1000000   FLUJO_DIR=scripts/cache-theta/flujo-historico
//
// POR QUÉ EXISTE
//
// El scorecard de Victor y EVA se construye sobre FLUJO —operaciones individuales con su tamaño,
// su precio y su lado— y hasta hoy sólo teníamos flujo desde 2026-01-13, que es donde empieza
// Massive. Sin flujo de 2024 no hay backtest de EVA que valga: no se mide un scorecard de flujo
// con datos que no existen. Ver la regla de Lester del 2026-08-14.
//
// LA CLAVE QUE LO HACE VIABLE (medido el 2026-08-14)
//
//   /option/history/trade?symbol=AAPL&expiration=*&start_date=D&end_date=D
//     → 179.291 filas en 6,9 s. TODO el día de un ticker, todas las expiraciones, UNA llamada.
//
// Nuestro `fetchFlow` de `lib/thetadata.ts` iba **contrato por contrato**. Por eso tardaba una
// eternidad y acababa devolviendo 0. El comodín `expiration=*` es la diferencia entre días de
// descarga y horas.
//
// EL BID/ASK NO VIENE EN EL TRADE
//
// Los campos son: symbol, expiration, strike, right, timestamp, sequence, ext_condition1..4,
// condition, size, exchange, price. **No hay bid ni ask**, y sin ellos no se puede saber si la
// operación se cruzó contra la oferta o contra la demanda — o sea, no hay Agresividad ni
// Convicción. Hay que cruzar con la cotización de ese instante.
//
// Eso sería carísimo para las ~180.000 operaciones del día... pero sólo hace falta para las
// NOTABLES (prima ≥ $1M), que son un puñado. Así que: se baja el día entero de golpe, se filtra,
// y sólo se pide cotización de las que importan.
//
// NADA SE RELLENA. Si una operación notable no consigue su cotización, se guarda con bid/ask
// null y se marca. El que analice decide si la descarta; aquí no se inventa un precio.

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const B = (process.env.THETA_BASE || "http://127.0.0.1:25503").replace(/\/+$/, "").replace(/\/v3$/, "") + "/v3";
const DESDE = process.env.FLUJO_DESDE || "20240102";
const HASTA = process.env.FLUJO_HASTA || new Date().toISOString().slice(0, 10).replace(/-/g, "");
const TICKERS = (process.env.FLUJO_TICKERS || "AAPL,MSFT,NVDA,TSLA,META,AMD,QQQ,SPY").split(",").map((t) => t.trim()).filter(Boolean);
const MIN_PRIMA = Number(process.env.FLUJO_MIN_PRIMA || 1_000_000);
const DIR = process.env.FLUJO_DIR || "scripts/cache-theta/flujo-historico";

mkdirSync(DIR, { recursive: true });

const ahora = () => new Date().toLocaleTimeString("en-US", { hour12: false });
const log = (m) => console.log(`[${ahora()}] ${m}`);

async function csv(ruta, ms = 120_000) {
  try {
    const r = await fetch(`${B}${ruta}`, { signal: AbortSignal.timeout(ms), cache: "no-store" });
    if (!r.ok) return null;
    const t = await r.text();
    const l = t.trim().split("\n");
    if (l.length < 2 || l[0].includes(" ")) return null;      // cabecera con espacios = mensaje de error, no CSV
    const cab = l[0].split(",");
    return { cab, filas: l.slice(1).map((x) => x.split(",")) };
  } catch { return null; }
}

const num = (s) => Number(String(s).replace(/"/g, ""));
const txt = (s) => String(s).replace(/"/g, "");

/** Días hábiles entre dos AAAAMMDD. Sin festivos: si un día no tiene datos, el fichero sale vacío
 *  y se marca como hecho — que es la respuesta correcta, no un hueco silencioso. */
function diasHabiles(desde, hasta) {
  const p = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
  const out = [];
  for (let t = p(desde); t <= p(hasta); t += 86_400_000) {
    const d = new Date(t);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    out.push(d.toISOString().slice(0, 10).replace(/-/g, ""));
  }
  return out;
}

/** Cotización del contrato a lo largo del día, para cruzar por tiempo con cada operación. */
async function cotizaciones(sym, exp, strike, right, dia) {
  const d = await csv(`/option/history/quote?symbol=${sym}&expiration=${exp}&strike=${strike}&right=${right}&start_date=${dia}&end_date=${dia}&interval=1m`, 45_000);
  if (!d) return null;
  const iT = d.cab.indexOf("timestamp"), iB = d.cab.indexOf("bid"), iA = d.cab.indexOf("ask");
  if (iT < 0 || iB < 0 || iA < 0) return null;
  const out = [];
  for (const f of d.filas) {
    const bid = num(f[iB]), ask = num(f[iA]);
    if (!(ask > 0)) continue;
    out.push([Date.parse(txt(f[iT]) + "Z"), bid, ask]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/** Última cotización EN O ANTES del instante de la operación. Nunca posterior: usar una de después
 *  sería mirar al futuro, que es lo que nos selló un hallazgo falso en julio. */
function bboAsOf(serie, ms) {
  let lo = 0, hi = serie.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (serie[m][0] <= ms) { r = m; lo = m + 1; } else hi = m - 1; }
  return r < 0 ? null : { bid: serie[r][1], ask: serie[r][2] };
}

async function bajarDia(sym, dia) {
  const fichero = join(DIR, `${sym}_${dia}.json`);
  if (existsSync(fichero)) return { saltado: true };

  // 1. TODAS las operaciones del día, una llamada.
  const tr = await csv(`/option/history/trade?symbol=${sym}&expiration=*&start_date=${dia}&end_date=${dia}`, 180_000);
  if (!tr) { writeFileSync(fichero, JSON.stringify({ dia, sym, sinDatos: true, notables: [] })); return { sinDatos: true }; }

  const c = Object.fromEntries(tr.cab.map((k, i) => [k, i]));
  const notables = [];
  for (const f of tr.filas) {
    const size = num(f[c.size]), price = num(f[c.price]);
    if (!(size > 0) || !(price > 0)) continue;
    const prima = size * price * 100;
    if (prima < MIN_PRIMA) continue;
    notables.push({
      exp: txt(f[c.expiration]), strike: num(f[c.strike]), right: txt(f[c.right]).startsWith("C") ? "C" : "P",
      ts: txt(f[c.timestamp]), size, price, prima: Math.round(prima),
      condition: num(f[c.condition]), exchange: num(f[c.exchange]),
    });
  }

  // 2. Open interest de todas las expiraciones (para Inusualidad y Estructura), una llamada.
  const oiMap = {};
  const oi = await csv(`/option/history/open_interest?symbol=${sym}&expiration=*&start_date=${dia}&end_date=${dia}`, 90_000);
  if (oi) {
    const o = Object.fromEntries(oi.cab.map((k, i) => [k, i]));
    for (const f of oi.filas) {
      const v = num(f[o.open_interest]);
      if (v > 0) oiMap[`${txt(f[o.expiration])}|${num(f[o.strike])}|${txt(f[o.right]).startsWith("C") ? "C" : "P"}`] = v;
    }
  }

  // 3. Bid/ask SÓLO de los contratos notables. Se agrupa por contrato para no pedir dos veces
  //    la misma serie cuando hay varias operaciones grandes en el mismo strike.
  const porContrato = new Map();
  for (const n of notables) {
    const k = `${n.exp}|${n.strike}|${n.right}`;
    if (!porContrato.has(k)) porContrato.set(k, []);
    porContrato.get(k).push(n);
  }
  let conBBO = 0;
  for (const [k, lista] of porContrato) {
    const [exp, strike, right] = k.split("|");
    const serie = await cotizaciones(sym, exp.replace(/-/g, ""), strike, right, dia);
    for (const n of lista) {
      const q = serie ? bboAsOf(serie, Date.parse(n.ts + "Z")) : null;
      // Sin cotización se guarda null y se marca. NO se rellena con el precio del trade ni con
      // una media: un hueco tapado no se distingue de un dato bueno.
      n.bid = q ? q.bid : null;
      n.ask = q ? q.ask : null;
      n.oi = oiMap[k] ?? null;
      if (q) conBBO++;
    }
  }

  writeFileSync(fichero, JSON.stringify({ dia, sym, minPrima: MIN_PRIMA, notables, conBBO, contratos: porContrato.size }));
  return { notables: notables.length, conBBO, contratos: porContrato.size };
}

async function main() {
  const dias = diasHabiles(DESDE, HASTA);
  const total = dias.length * TICKERS.length;
  log(`FLUJO HISTÓRICO · ${TICKERS.length} tickers × ${dias.length} días hábiles = ${total} descargas`);
  log(`rango ${DESDE} → ${HASTA} · prima mínima $${(MIN_PRIMA / 1e6).toFixed(1)}M · destino ${DIR}`);
  const yaHay = readdirSync(DIR).filter((f) => f.endsWith(".json")).length;
  if (yaHay) log(`ya hay ${yaHay} ficheros: se reanuda donde se quedó, no se repite ninguno`);

  let hechos = 0, saltados = 0, sinDatos = 0, notablesTot = 0, sinBBO = 0;
  const t0 = Date.now();
  for (const sym of TICKERS) {
    for (const dia of dias) {
      const r = await bajarDia(sym, dia);
      if (r.saltado) { saltados++; continue; }
      hechos++;
      if (r.sinDatos) sinDatos++;
      else { notablesTot += r.notables; sinBBO += r.notables - r.conBBO; }
      if (hechos % 25 === 0) {
        const seg = (Date.now() - t0) / 1000;
        const restan = total - saltados - hechos;
        log(`  ${sym} ${dia} · hechos ${hechos} · ${notablesTot} notables · ${(seg / hechos).toFixed(1)}s cada uno · faltan ~${((restan * seg / hechos) / 3600).toFixed(1)} h`);
      }
    }
  }
  log(`LISTO · ${hechos} descargados, ${saltados} ya estaban, ${sinDatos} sin datos (festivos)`);
  log(`${notablesTot} operaciones notables · ${sinBBO} sin bid/ask (guardadas con null, NO rellenadas)`);
}

main().catch((e) => { console.error("FALLO:", e.message); process.exit(1); });
