// Utilidades compartidas para el análisis VENTANA-CORTA (comprar 0-2DTE tras un print grande).
//
// NADA de precios de modelo. Entrada = ask real del propio print de MarketSnack (NBBO en el
// instante del trade). Salida = bid real de la cadena EOD de ThetaData.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";

export const MSDIR = "scripts/cache-theta/marketsnack";
export const CDIR = "scripts/cache-theta/cadenas";
export const CIERRES = "scripts/cache-theta/cierres";

/** Días disponibles de flujo, ordenados. */
export function diasFlujo(nivel = "1000k") {
  return readdirSync(`${MSDIR}/flujo-${nivel}`)
    .filter((f) => f.endsWith(".jsonl.gz"))
    .map((f) => f.replace(".jsonl.gz", ""))
    .sort();
}

/** Operaciones crudas de un día. */
export function leerDia(dia, nivel = "1000k") {
  const p = `${MSDIR}/flujo-${nivel}/${dia}.jsonl.gz`;
  if (!existsSync(p)) return [];
  const txt = gunzipSync(readFileSync(p)).toString("utf8").trim();
  if (!txt) return [];
  const out = [];
  for (const l of txt.split("\n")) { try { out.push(JSON.parse(l)); } catch {} }
  return out;
}

/**
 * OCC: RAIZ + AAMMDD + C/P + strike×1000 en 8 dígitos.
 * Devuelve null si no encaja — NO se adivina.
 */
export function parseOCC(sym) {
  const m = /^([A-Z0-9]{1,6}?)(\d{6})([CP])(\d{8})$/.exec(sym);
  if (!m) return null;
  const [, raiz, ymd, tipo, k] = m;
  const exp = `20${ymd}`;
  return { raiz, exp, tipo, strike: Number(k) / 1000 };
}

/** Días hábiles entre dos AAAAMMDD, contados sobre el calendario real de las cadenas de SPY. */
let _calendario = null;
export function calendario() {
  if (_calendario) return _calendario;
  _calendario = readdirSync(CDIR)
    .filter((f) => /^SPY_d\d{8}\.json$/.test(f))
    .map((f) => f.slice(5, 13))
    .sort();
  return _calendario;
}

const _cacheCad = new Map();
/** Cadena EOD de (ticker, díaAAAAMMDD). null si no está en disco. */
export function cadena(ticker, dia) {
  const k = `${ticker}|${dia}`;
  if (_cacheCad.has(k)) return _cacheCad.get(k);
  const p = `${CDIR}/${ticker}_d${dia}.json`;
  let v = null;
  if (existsSync(p)) { try { v = JSON.parse(readFileSync(p, "utf8")); } catch { v = null; } }
  if (_cacheCad.size > 900) _cacheCad.clear();
  _cacheCad.set(k, v);
  return v;
}

/**
 * Bid/ask EOD reales de un contrato.
 *  · {bid,ask}          → estaba cotizado al cierre
 *  · {bid:0, ask:0, ausente:true} → la cadena de ese día existe y la expiración también, pero el
 *    contrato no: el descargador filtra bid<=0, así que ausente ⇒ el cierre no tenía puja.
 *  · null               → no hay cadena de ese día: NO se puede medir, no se rellena.
 */
export function eod(ticker, dia, exp, tipo, strike) {
  const c = cadena(ticker, dia);
  if (!c) return null;
  const e = c[exp];
  if (!e) return null;                    // esa expiración no aparece: no se infiere nada
  const v = e[`${strike}|${tipo}`];
  if (v) return { bid: v[0], ask: v[1], ausente: false };
  return { bid: 0, ask: 0, ausente: true };
}

const _cacheCierres = new Map();
/** Cierre real del subyacente. Devuelve mapa {AAAA-MM-DD: cierre} o null. */
export function cierres(ticker) {
  if (_cacheCierres.has(ticker)) return _cacheCierres.get(ticker);
  let v = null;
  for (const f of readdirSync(CIERRES)) {
    if (f === `${ticker}.json` || f.startsWith(`${ticker}_`)) {
      try { v = JSON.parse(readFileSync(`${CIERRES}/${f}`, "utf8")); } catch {}
      break;
    }
  }
  _cacheCierres.set(ticker, v);
  return v;
}

export const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : 0);
export const varianza = (v) => {
  if (v.length < 2) return 0;
  const m = media(v);
  return v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1);
};
export const sd = (v) => Math.sqrt(varianza(v));
export const tUna = (v) => (v.length < 3 || sd(v) === 0 ? 0 : media(v) / (sd(v) / Math.sqrt(v.length)));
export const tWelch = (a, b) => {
  if (a.length < 3 || b.length < 3) return 0;
  const se = Math.sqrt(varianza(a) / a.length + varianza(b) / b.length);
  return se > 0 ? (media(a) - media(b)) / se : 0;
};
export const pct = (v, q) => { const s = [...v].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
