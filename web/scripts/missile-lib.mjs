// ╔══════════════════════════════════════════════════════════════════════════════════════════╗
// ║  MISSILE-LIB — el detector de TSLA's Missile, para que lo usen DOS cuadernos              ║
// ╚══════════════════════════════════════════════════════════════════════════════════════════╝
//
// Sale TAL CUAL de forward-tsla-missile.mjs (lineas 71-208 y 247-285), movido sin reescribir
// una sola linea. Lo usan el cuaderno del Missile a solas y el cuaderno COMBINADO que Lester
// pidio el 2026-08-31 (Missile + La Palanca sobre una unica cuenta de $60.000).
//
// POR QUE UNA LIBRERIA Y NO UNA COPIA: dos copias del mismo detector se separan sin avisar, y
// entonces los dos cuadernos miden reglas distintas creyendo medir la misma. Es el mismo fallo
// que hoy tenia la web — el texto y la tabla saliendo de fuentes distintas.

import fs from 'node:fs';
import path from 'node:path';

const B = (process.env.THETA_BASE || 'http://127.0.0.1:25503').replace(/\/+$/, '').replace(/\/v3$/, '') + '/v3';
const SYM = 'TSLA';
const LEDGER = process.env.MISSILE_LEDGER || 'data/forward/tsla-missile.json';
const REDIS_KEY = process.env.MISSILE_REDIS_KEY || 'forward:tsla-missile';
const STORE = (process.env.MISSILE_STORE || (process.env.REDIS_URL ? 'redis' : 'file')).toLowerCase();
// SECO = mira y NO guarda. Tambien por variable de entorno: en Railway no se puede pasar un
// argumento sin cambiar el startCommand. Sirve para preguntarle a un dia PASADO que habria
// hecho, sin tocar el registro -- que es la unica forma honesta de contestar 'deberiamos
// haber tenido una posicion ese dia?' sin inventar el numero ni ensuciar el forward test.
const SECO = process.argv.includes('--seco') || process.env.THETA_SECO === '1';

// ── parámetros pre-registrados. NO TOCAR. ────────────────────────────────────
const CAPITAL_INICIAL = 60000;
const GOLPE_MIN   = 500000;
const VS_OI_MIN   = 12;
const COSTE_MIN   = 10000;
const DTE_MIN     = 5;
const HORA_MIN    = '14:00';
const MA_DIAS     = 20;
const MA_MIN      = 15;
const HUECOS      = 4;
const TAM         = 0.25;
const OBJETIVO    = 1.50;
const SUELO       = 0.50;
const MOV_CONFIRMA = 0.08;
const MOV_NO      = 0.12;
const TOPE_DIAS   = 60;
const DOM_MIN     = 0.30;
const GOLPES_MIN  = 2, GOLPES_MAX = 9;

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const limpia = (x) => String(x == null ? '' : x).replace(/^"/, '').replace(/"$/, '').trim();
const lado = (x) => { const v = limpia(x).toUpperCase(); return v.startsWith('P') ? 'P' : v.startsWith('C') ? 'C' : null; };
const ymd = (s) => limpia(s).replace(/-/g, '');
const iso = (d) => d.slice(0, 4) + '-' + d.slice(4, 6) + '-' + d.slice(6, 8);
const ms = (d) => Date.parse(iso(d) + 'T00:00:00Z');
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86400000);
const D = (x) => (x < 0 ? '−$' : '$') + Math.abs(Math.round(x)).toLocaleString('en-US');
const dormir = (n) => new Promise((r) => setTimeout(r, n));

async function csv(ruta, intentos = 3, blando = false) {
  let ultimo = '';
  for (let k = 1; k <= intentos; k++) {
    let r, txt;
    try { r = await fetch(B + '/' + ruta); txt = await r.text(); }
    catch (e) { ultimo = e.message; await dormir(3000 * k); continue; }
    if (r.ok) {
      if (/Invalid session ID/i.test(txt.slice(0, 200))) { ultimo = 'Invalid session ID'; await dormir(5000 * k); continue; }
      if (/No data found/i.test(txt.slice(0, 200))) return null;
      const lin = txt.trim().split('\n');
      if (lin.length < 2) return null;
      return { cab: lin[0].split(',').map(limpia), filas: lin.slice(1).map((l) => l.split(',')) };
    }
    ultimo = 'HTTP ' + r.status + ' → ' + txt.slice(0, 100);
    if (r.status === 472) return null;                     // «no hay datos» legítimo
    if (r.status < 500 && r.status !== 478) break;         // un 4xx de verdad no se reintenta
    await dormir(4000 * k);
  }
  // Se LANZA. Sin esto, una sesión caída se ve igual que «hoy no hubo señal».
  if (blando) return null;
  throw new Error(ruta.slice(0, 60) + ' tras ' + intentos + ' intentos → ' + ultimo);
}

async function cadena(dia) {
  const d = await csv('option/history/eod?symbol=' + SYM + '&expiration=*&start_date=' + dia + '&end_date=' + dia);
  if (!d) return null;
  const i = (n) => d.cab.indexOf(n);
  const iE = i('expiration'), iK = i('strike'), iR = i('right'), iB = i('bid'), iA = i('ask');
  if ([iE, iK, iR, iB, iA].some((x) => x < 0))
    throw new Error('la cadena no trae las columnas esperadas: ' + d.cab.join(','));
  const out = {};
  for (const f of d.filas) {
    const exp = ymd(f[iE]), K = Number(limpia(f[iK])), R = lado(f[iR]);
    const bid = Number(limpia(f[iB])), ask = Number(limpia(f[iA]));
    if (!R || !(K > 0) || !(ask > 0)) continue;
    if (!out[exp]) out[exp] = {};
    out[exp][K + '|' + R] = [bid, ask];
  }
  return Object.keys(out).length ? out : null;
}

/** el precio de TSLA por PARIDAD, igual que el backtest */
function spotDeCadena(ch, hoy) {
  if (!ch) return null;
  let e0 = null, md = Infinity;
  for (const e of Object.keys(ch)) { const d = dteDe(hoy, e); if (d < 1) continue; if (d < md) { md = d; e0 = e; } }
  if (!e0) return null;
  const g = ch[e0];
  let K = null, dm = Infinity;
  for (const cl of Object.keys(g)) {
    if (!cl.endsWith('|C')) continue;
    const k = Number(cl.slice(0, -2));
    const p = g[k + '|P']; if (!p) continue;
    const d = Math.abs((g[cl][0] + g[cl][1]) / 2 - (p[0] + p[1]) / 2);
    if (d < dm) { dm = d; K = k; }
  }
  if (K == null) return null;
  const C = g[K + '|C'], P = g[K + '|P'];
  const s = K + (C[0] + C[1]) / 2 - (P[0] + P[1]) / 2;
  return s > 0 ? Math.round(s * 100) / 100 : null;
}

async function golpesDe(dia) {
  const d = await csv('option/history/trade_quote?symbol=' + SYM + '&expiration=*&start_date=' + dia + '&end_date=' + dia);
  if (!d) return [];
  const i = (n) => d.cab.indexOf(n);
  const iE = i('expiration'), iK = i('strike'), iR = i('right'), iP = i('price'), iS = i('size');
  const iB = i('bid'), iA = i('ask');
  const iT = i('trade_timestamp') >= 0 ? i('trade_timestamp') : i('created');
  if ([iE, iK, iR, iP, iS, iB, iA, iT].some((x) => x < 0))
    throw new Error('la cinta no trae las columnas esperadas: ' + d.cab.join(','));
  const out = [];
  for (const f of d.filas) {
    const precio = Number(limpia(f[iP])), tam = Number(limpia(f[iS]));
    const ask = Number(limpia(f[iA])), bid = Number(limpia(f[iB]));
    const R = lado(f[iR]), K = Number(limpia(f[iK]));
    if (!R || !(K > 0) || !(precio > 0 && tam > 0 && ask > 0)) continue;
    out.push({ exp: ymd(f[iE]), K, l: R, precio, tam, prima: precio * tam * 100,
               bid, ask, hora: limpia(f[iT]).slice(11, 16) });
  }
  return out;
}

async function oiDe(dia) {
  const d = await csv('option/history/open_interest?symbol=' + SYM + '&expiration=*&start_date=' + dia + '&end_date=' + dia);
  const m = new Map();
  if (!d) return m;
  const i = (n) => d.cab.indexOf(n);
  const iE = i('expiration'), iK = i('strike'), iR = i('right'), iO = i('open_interest');
  if ([iE, iK, iR, iO].some((x) => x < 0))
    throw new Error('el OI no trae las columnas esperadas: ' + d.cab.join(','));
  for (const f of d.filas) {
    const K = Number(limpia(f[iK])), R = lado(f[iR]);
    if (!R || !(K > 0)) continue;
    m.set(ymd(f[iE]) + '|' + K + '|' + R, Number(limpia(f[iO])) || 0);
  }
  return m;
}

async function diaAnterior(dia) {
  for (let i = 1; i <= 8; i++) {
    const cand = ymd(new Date(ms(dia) - i * 86400000).toISOString().slice(0, 10));
    const c = await csv('option/history/eod?symbol=' + SYM + '&expiration=*&start_date=' + cand + '&end_date=' + cand, 1, true);
    if (c) return cand;
  }
  return null;
}

/** rellena la serie de precios hacia atrás hasta tener los 20 días de la media */
async function sembrarSpots(L, hoy) {
  let d = hoy, faltan = MA_DIAS + 2, puestos = 0;
  while (faltan > 0) {
    const prev = await diaAnterior(d);
    if (!prev) break;
    d = prev;
    if (L.spots[d] == null) {
      const ch = await cadena(d);
      const s = ch ? spotDeCadena(ch, d) : null;
      if (s != null) { L.spots[d] = s; puestos++; }
    }
    faltan--;
  }
  return puestos;
}

// ══════════════════════════════════════════════════════════════════════════════
/** la ultima sesion CERRADA con datos. El dia en curso no existe todavia:
 *  la API responde «Cannot fetch current-day data without specifying an expiration».
 *  Asi el servicio da igual a las 6 de la tarde que un domingo. */
async function ultimaSesion() {
  let d = ymd(new Date().toISOString().slice(0, 10));
  for (let i = 0; i <= 8; i++) {
    const c = await csv('option/history/eod?symbol=' + SYM + '&expiration=*&start_date=' + d + '&end_date=' + d, 1, true);
    if (c) return d;
    d = ymd(new Date(ms(d) - 86400000).toISOString().slice(0, 10));
  }
  return null;
}

export {
  B, SYM, LEDGER, REDIS_KEY, STORE, SECO, CAPITAL_INICIAL, GOLPE_MIN, VS_OI_MIN, COSTE_MIN, DTE_MIN, HORA_MIN, MA_DIAS, MA_MIN, HUECOS, TAM, OBJETIVO, SUELO, MOV_CONFIRMA, MOV_NO, TOPE_DIAS, DOM_MIN, GOLPES_MIN, GOLPES_MAX, arg, limpia, lado, ymd, iso, ms, dteDe, D, dormir, csv, cadena, spotDeCadena, golpesDe, oiDe, diaAnterior, sembrarSpots, ultimaSesion,
};
