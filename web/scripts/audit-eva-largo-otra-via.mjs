// AUDITORIA ADVERSARIA — recalculo independiente del numero de 90 dias, solo SPY y MSFT.
//
// NO lee eva-largo-filas.json. Parte del flujo crudo y de las cadenas crudas.
// Implementacion escrita de cero siguiendo la especificacion de la cabecera de
// scripts/eva-comprar-largo.mjs, sin copiar su codigo.
//
// Uso: node --max-old-space-size=6144 scripts/audit-eva-largo-otra-via.mjs
// Variables: AUDIT_TICKERS (por defecto "SPY,MSFT"), AUDIT_H (90), PRIMA_MIN (3000000)

import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(process.argv[2] || ".");
const DIR_FLUJO = path.join(RAIZ, "scripts/cache-theta/flujo-historico");
const DIR_CAD = path.join(RAIZ, "scripts/cache-theta/cadenas");

const TICKERS = (process.env.AUDIT_TICKERS || "SPY,MSFT").split(",").map((s) => s.trim());
const H = Number(process.env.AUDIT_H || 90);
const PRIMA_MIN = Number(process.env.PRIMA_MIN || 3_000_000);
const EXP_TOL_D = 30;
const PRIMA_LO = 0.5, PRIMA_HI = 2.0;
const CUBO_MIN = 5;
const SALTO_MAX_D = 10;

const DIA = 86_400_000;

// --- utilidades de fecha, escritas aparte a proposito -----------------------
function aMs(ymd) {                       // "20240315" -> epoch ms UTC
  const s = String(ymd);
  return Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8));
}
function aYmd(msv) {                      // epoch ms -> "20240315"
  const d = new Date(msv);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}`;
}
const quitaGuiones = (s) => String(s).split("-").join("");

// --- calendario de cadenas por simbolo -------------------------------------
const calendario = new Map();
for (const f of fs.readdirSync(DIR_CAD)) {
  const m = /^([A-Z]+)_d(\d{8})\.json$/.exec(f);
  if (!m) continue;
  if (!TICKERS.includes(m[1])) continue;
  if (!calendario.has(m[1])) calendario.set(m[1], []);
  calendario.get(m[1]).push(m[2]);
}
for (const arr of calendario.values()) arr.sort();

// ULTIMO_DIA: el original usa el maximo GLOBAL de todos los simbolos en disco.
// Lo replico leyendo el directorio entero (no solo mis tickers) para no cambiar el criterio.
let ULTIMO_GLOBAL = 0;
for (const f of fs.readdirSync(DIR_CAD)) {
  const m = /^([A-Z]+)_d(\d{8})\.json$/.exec(f);
  if (m && Number(m[2]) > ULTIMO_GLOBAL) ULTIMO_GLOBAL = Number(m[2]);
}

/** Primer dia con cadena >= objetivo, si el salto no pasa de SALTO_MAX_D. */
function diaDeSalida(sym, objetivoYmd) {
  const dias = calendario.get(sym);
  if (!dias) return null;
  // busqueda lineal-por-bloques: simple y verificable (no binaria, a proposito)
  let elegido = null;
  for (let i = 0; i < dias.length; i++) {
    if (dias[i] >= objetivoYmd) { elegido = dias[i]; break; }
  }
  if (!elegido) return null;
  const salto = (aMs(elegido) - aMs(objetivoYmd)) / DIA;
  return salto <= SALTO_MAX_D ? elegido : null;
}

// --- cache de cadenas -------------------------------------------------------
const cache = new Map();
const ORDEN = [];
function leeCadena(sym, ymd) {
  const k = sym + ymd;
  if (cache.has(k)) return cache.get(k);
  const f = path.join(DIR_CAD, `${sym}_d${ymd}.json`);
  let v = null;
  if (fs.existsSync(f)) { try { v = JSON.parse(fs.readFileSync(f, "utf8")); } catch { v = null; } }
  cache.set(k, v); ORDEN.push(k);
  while (ORDEN.length > 240) cache.delete(ORDEN.shift());
  return v;
}

/** comprar al ask de entrada, vender al bid de salida. Ausente en salida = 0. */
function retornoContrato(cadIn, cadOut, expYmd, clave) {
  const parIn = cadIn && cadIn[expYmd] && cadIn[expYmd][clave];
  if (!parIn) return null;
  const ask = parIn[1];
  if (!(ask > 0)) return null;
  const parOut = cadOut && cadOut[expYmd] && cadOut[expYmd][clave];
  const bid = parOut ? parOut[0] : 0;
  return (bid - ask) / ask;
}

// --- recorrido --------------------------------------------------------------
const ficherosFlujo = fs.readdirSync(DIR_FLUJO)
  .filter((f) => /\.json$/.test(f) && TICKERS.includes(f.split("_")[0]))
  .sort();

let vistas = 0, sinCadIn = 0, sinPrecioIn = 0, cuboChico = 0, venceAntes = 0,
    futuro = 0, sinSalidaDia = 0, cuboSinVivos = 0, sinRetornoT = 0;

const difs = [];            // pnl pareado
const rT = [], rC = [];     // retornos brutos
const porTicker = new Map();
const porDia = [];          // {dia, d} para tercios
const diagT = [], diagC = [], difsSinAusT = [];

console.log(`audit · tickers=${TICKERS.join(",")} · H=${H}d · prima>=$${(PRIMA_MIN / 1e6).toFixed(0)}M · ficheros=${ficherosFlujo.length}`);

for (const fich of ficherosFlujo) {
  let j;
  try { j = JSON.parse(fs.readFileSync(path.join(DIR_FLUJO, fich), "utf8")); } catch { continue; }
  const sym = j.sym, diaIn = String(j.dia);
  const grandes = (j.notables || []).filter((n) => n.prima >= PRIMA_MIN);
  if (!grandes.length) continue;

  const cadIn = leeCadena(sym, diaIn);
  if (!cadIn) { sinCadIn += grandes.length; continue; }
  const msIn = aMs(diaIn);

  // universo del dia: todo contrato con ask > 0
  const universo = [];
  for (const exp of Object.keys(cadIn)) {
    const msExp = aMs(exp);
    const grupo = cadIn[exp];
    for (const clave of Object.keys(grupo)) {
      const ask = grupo[clave][1];
      if (ask > 0) universo.push({ exp, msExp, clave, right: clave.charAt(clave.length - 1), ask });
    }
  }

  // dia de salida: uno solo por dia de entrada (no depende del contrato)
  const objetivo = aYmd(msIn + H * DIA);
  let cadOut = null, diaOut = null, fueraDeRango = false;
  if (Number(objetivo) > ULTIMO_GLOBAL) fueraDeRango = true;
  else {
    diaOut = diaDeSalida(sym, objetivo);
    if (diaOut) cadOut = leeCadena(sym, diaOut);
  }
  const msObjetivo = aMs(objetivo);

  for (const n of grandes) {
    vistas++;
    const expYmd = quitaGuiones(n.exp);
    const clave = `${n.strike}|${n.right}`;
    const parIn = cadIn[expYmd] && cadIn[expYmd][clave];
    if (!parIn || !(parIn[1] > 0)) { sinPrecioIn++; continue; }
    const askIn = parIn[1];
    const msExp = aMs(expYmd);

    // cubo de control
    const cubo = [];
    for (const u of universo) {
      if (u.right !== n.right) continue;
      if (Math.abs(u.msExp - msExp) > EXP_TOL_D * DIA) continue;
      if (u.ask < askIn * PRIMA_LO || u.ask > askIn * PRIMA_HI) continue;
      if (u.exp === expYmd && u.clave === clave) continue;
      cubo.push(u);
    }
    if (cubo.length < CUBO_MIN) { cuboChico++; continue; }

    if (msExp <= msObjetivo) { venceAntes++; continue; }   // vence antes del horizonte
    if (fueraDeRango) { futuro++; continue; }
    if (!diaOut || !cadOut) { sinSalidaDia++; continue; }

    const ret = retornoContrato(cadIn, cadOut, expYmd, clave);
    if (ret === null) { sinRetornoT++; continue; }

    let suma = 0, cuenta = 0;
    for (const u of cubo) {
      if (u.msExp <= msObjetivo) continue;
      const r = retornoContrato(cadIn, cadOut, u.exp, u.clave);
      if (r === null) continue;
      suma += r; cuenta++;
    }
    if (cuenta < CUBO_MIN) { cuboSinVivos++; continue; }

    const ctrl = suma / cuenta;
    // DIAGNOSTICO: tasa de ausencia (=perdida total) en tratamiento vs control
    const ausT = !(cadOut && cadOut[expYmd] && cadOut[expYmd][clave]);
    let ausC = 0, vivosC = 0;
    for (const u of cubo) {
      if (u.msExp <= msObjetivo) continue;
      if (retornoContrato(cadIn, cadOut, u.exp, u.clave) === null) continue;
      vivosC++;
      if (!(cadOut && cadOut[u.exp] && cadOut[u.exp][u.clave])) ausC++;
    }
    diagT.push(ausT ? 1 : 0); diagC.push(ausC / vivosC);
    if (!ausT) { difsSinAusT.push(ret - ctrl); }
    rT.push(ret); rC.push(ctrl); difs.push(ret - ctrl);
    porTicker.set(sym, (porTicker.get(sym) || 0) + 1);
    porDia.push({ dia: diaIn, d: ret - ctrl });
  }
}

// --- estadistica ------------------------------------------------------------
function media(a) { let s = 0; for (const x of a) s += x; return s / a.length; }
function tStat(a) {
  const n = a.length, m = media(a);
  let s2 = 0; for (const x of a) s2 += (x - m) * (x - m);
  const sd = Math.sqrt(s2 / (n - 1));
  return { m, sd, t: m / (sd / Math.sqrt(n)), n };
}

const n = difs.length;
console.log(`\noperaciones vistas: ${vistas}`);
console.log(`descartes: sinCadIn=${sinCadIn} sinPrecioIn=${sinPrecioIn} cuboChico=${cuboChico} venceAntes=${venceAntes} futuro=${futuro} sinSalidaDia=${sinSalidaDia} cuboSinVivos=${cuboSinVivos} sinRetornoT=${sinRetornoT}`);
console.log(`\nN medible a ${H}d: ${n}`);
if (!n) process.exit(0);
const st = tStat(difs);
console.log(`retorno medio FLUJO : ${(media(rT) * 100).toFixed(2)}%`);
console.log(`retorno medio CUBO  : ${(media(rC) * 100).toFixed(2)}%`);
console.log(`DIFERENCIA (pareada): ${(st.m * 100).toFixed(4)}%   t=${st.t.toFixed(2)}   sd=${(st.sd * 100).toFixed(2)}%`);
console.log(`\npor ticker: ${[...porTicker].map(([k, v]) => `${k}=${v}`).join("  ")}`);
console.log(`\nAUSENCIAS (= perdida total por regla):`);
console.log(`  tratamiento ausente: ${(media(diagT) * 100).toFixed(2)}%   control ausente (medio): ${(media(diagC) * 100).toFixed(2)}%`);
const stSin = tStat(difsSinAusT);
console.log(`  dif quitando los tratamientos ausentes: ${(stSin.m * 100).toFixed(4)}%  t=${stSin.t.toFixed(2)}  n=${stSin.n}`);

// tercios de tiempo
porDia.sort((a, b) => (a.dia < b.dia ? -1 : a.dia > b.dia ? 1 : 0));
const c = Math.floor(porDia.length / 3);
const tercios = [porDia.slice(0, c), porDia.slice(c, 2 * c), porDia.slice(2 * c)];
console.log(`tercios: ${tercios.map((t) => {
  const s = tStat(t.map((x) => x.d));
  return `${t[0].dia}-${t[t.length - 1].dia} d=${(s.m * 100).toFixed(2)}% t=${s.t.toFixed(2)} n=${s.n}`;
}).join(" | ")}`);
