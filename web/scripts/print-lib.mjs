// SEGUIR EL PRINT — motor compartido.
//
// Todo lo que toca dinero pasa por aquí, para que las reglas de arriba no puedan saltárselo:
//   · se COMPRA al ASK real de la cadena de cierre y se VENDE al BID real. Nunca punto medio,
//     nunca Black-Scholes (bsPrice ni siquiera se exporta ya).
//   · si al salir el contrato no tiene puja, vale CERO. No se rellena, no se interpola.
//   · nada posterior al instante de decidir entra en la decisión: el print es de antes de las
//     15:00 ET y la compra es al cierre de ESE MISMO día.

import { readFileSync, existsSync, readdirSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const CIERRES = "scripts/cache-theta/cierres";

export const iso = (y) => `${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}`;
export const dias = (a, b) => Math.round((Date.parse(iso(b)) - Date.parse(iso(a))) / 86400000);
export const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
export const varianza = (v) => { if (v.length < 2) return NaN; const m = media(v); return v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1); };
export const sd = (v) => Math.sqrt(varianza(v));
export const tUna = (v) => (v.length < 3 || !(sd(v) > 0) ? 0 : media(v) / (sd(v) / Math.sqrt(v.length)));
export const pctl = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
export const fmt = (n) => Math.round(n).toLocaleString("es-ES");

/** Tickers con cadena en disco. */
export function tickersConCadena() {
  return [...new Set(readdirSync(CDIR).map((f) => /^([A-Z]+)_d\d{8}\.json$/.exec(f)?.[1]).filter(Boolean))].sort();
}
/** Días con cadena de un ticker, AAAAMMDD ordenados. */
export function diasDe(ticker) {
  return readdirSync(CDIR).filter((f) => new RegExp(`^${ticker}_d\\d{8}\\.json$`).test(f))
    .map((f) => f.slice(ticker.length + 2, ticker.length + 10)).sort();
}

// Caché acotada: las cadenas de SPX pesan ~20 MB en memoria cada una. Con 900 dentro, el proceso
// muere. Se limita a pocas y se recorre por ticker para que el acierto sea alto igualmente.
const _cache = new Map();
const MAX_CACHE = Number(process.env.CACHE_CADENAS || 60);
export function cadena(ticker, dY) {
  const k = `${ticker}|${dY}`;
  if (_cache.has(k)) { const v = _cache.get(k); _cache.delete(k); _cache.set(k, v); return v; }
  const p = `${CDIR}/${ticker}_d${dY}.json`;
  let v = null;
  if (existsSync(p)) { try { v = JSON.parse(readFileSync(p, "utf8")); } catch { v = null; } }
  if (_cache.size >= MAX_CACHE) _cache.delete(_cache.keys().next().value);
  _cache.set(k, v);
  return v;
}
export function limpiarCache() { _cache.clear(); }

const _cl = new Map();
/** Cierre real del subyacente: {AAAAMMDD: precio} o null. */
export function cierres(ticker) {
  if (_cl.has(ticker)) return _cl.get(ticker);
  let v = null;
  const p = `${CIERRES}/${ticker}.json`;
  if (existsSync(p)) { try { v = JSON.parse(readFileSync(p, "utf8")); } catch {} }
  _cl.set(ticker, v);
  return v;
}

/**
 * Elige el contrato de LA ESQUINA BARATA: `dist` fuera del dinero, vencimiento lo más cerca de
 * `dteObj` días. Devuelve bid/ask REALES de cierre, o null si no hay nada que encaje.
 *
 * `tolK` = cuánto se permite que el strike disponible se aparte de la distancia pedida, en
 * fracción de la propia distancia. Sin este tope, en un ticker con strikes gruesos "el 5% fuera"
 * acabaría siendo el 15% y la medida sería de otra cosa.
 */
export function elegirEsquina(cad, S, dteObj, dist, tipo, hoy, tolDte, tolK = 0.30) {
  if (!cad || !(S > 0)) return null;
  let exp = null, dd = Infinity;
  for (const e of Object.keys(cad)) {
    const d = dias(hoy, e);
    if (d < 1) continue;
    const x = Math.abs(d - dteObj);
    if (x < dd) { dd = x; exp = e; }
  }
  if (!exp || dd > tolDte) return null;
  const objetivo = tipo === "C" ? S * (1 + dist) : S * (1 - dist);
  let K = null, kd = Infinity;
  for (const clave of Object.keys(cad[exp])) {
    const [ks, r] = clave.split("|");
    if (r !== tipo) continue;
    const k = Number(ks), d = Math.abs(k - objetivo);
    if (d < kd) { kd = d; K = k; }
  }
  if (K == null) return null;
  const distReal = tipo === "C" ? K / S - 1 : 1 - K / S;
  if (Math.abs(distReal - dist) > dist * tolK) return null;
  const [bid, ask] = cad[exp][`${K}|${tipo}`];
  if (!(ask > 0) || !(bid > 0)) return null;
  return { exp, K, bid, ask, dte: dias(hoy, exp), distReal };
}

/**
 * Valor de salida REAL de un contrato: el BID de la cadena del día de salida.
 *  · número  → había puja
 *  · 0       → la cadena de ese día existe y la expiración también, pero el contrato ya no está.
 *              El descargador filtra bid<=0, así que "no está" significa "sin comprador": vale 0.
 *  · null    → NO hay cadena de ese día. No se puede medir. NO se rellena.
 */
export function bidSalida(ticker, dSalida, exp, tipo, K) {
  const c = cadena(ticker, dSalida);
  if (!c) return null;
  const e = c[exp];
  if (!e) return 0;
  const v = e[`${K}|${tipo}`];
  return v ? v[0] : 0;
}

/** Generador reproducible — el control contra el azar tiene que poder repetirse igual. */
export function rng(semilla) {
  let s = semilla >>> 0;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

/**
 * n EFECTIVA. Las filas MIENTEN: dos entradas del mismo ticker separadas por dos días comparten
 * casi todo el camino, y los días distintos se solapan entre sí.
 * Se cuenta greedy por ticker: dentro de un ticker, una entrada nueva sólo cuenta si empieza
 * después de que la anterior haya cerrado. Además se devuelve el nº de VENTANAS DE CALENDARIO
 * independientes, que es el techo real cuando el mercado se mueve todo junto.
 */
export function nEfectiva(filas, diasHold) {
  const porTk = new Map();
  for (const f of filas) { if (!porTk.has(f.ticker)) porTk.set(f.ticker, []); porTk.get(f.ticker).push(f.fechaY); }
  let n = 0;
  for (const v of porTk.values()) {
    v.sort();
    let ult = null;
    for (const d of v) if (ult === null || dias(ult, d) >= diasHold) { n++; ult = d; }
  }
  const fechas = [...new Set(filas.map((f) => f.fechaY))].sort();
  let ventanas = 0, ult = null;
  for (const d of fechas) if (ult === null || dias(ult, d) >= diasHold) { ventanas++; ult = d; }
  return { porTicker: n, ventanas };
}
