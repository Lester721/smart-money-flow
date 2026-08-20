// ═══════════════════════════════════════════════════════════════════════════════════════════
// RESPETAR · GIRO (3a) — CONSTRUIR el camino de 5 minutos + el precio REAL del straddle ATM
//                        en CADA barra, para poder medir el CRUCE del giro dentro del día.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/gex-giro-camino.mjs
//
// POR QUÉ HACE FALTA: las dos pasadas anteriores clasifican el día por dónde ABRE respecto al
// giro. Eso mide un régimen, y el régimen ya lo cobra el straddle (t≈11–13 entre implícito de
// abajo y de arriba). Lo que NADIE ha medido —y es lo que hace un day trader— es el CRUCE: el
// precio rompe el giro A MEDIA SESIÓN. Ese suceso permite comparar los 60 minutos de DESPUÉS
// con los 60 de ANTES DEL MISMO DÍA, y así el nivel de volatilidad del día se cancela solo.
//
// Se guarda además el bid/ask REAL del straddle ATM en cada barra para poder pagar el peaje de
// una entrada intradía sin inventarse un precio.
// ═══════════════════════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const NIV = "scripts/gex-niveles.json";
const SALIDA = "scripts/gex-giro-camino.json";

/** Índice de columnas por NOMBRE. Lanza si falta una: un campo que no existe se lee como 0. */
function columnas(cabecera, pedidas, f) {
  const h = cabecera.trim().split(",").map((s) => s.replace(/"/g, "").trim());
  const I = {};
  for (const p of pedidas) {
    const i = h.indexOf(p);
    if (i < 0) throw new Error(`FALLO CERRADO: ${f} no tiene la columna "${p}" (tiene: ${h.join("|")})`);
    I[p] = i;
  }
  return I;
}

/** Lee un lado (C o P) y devuelve Map<"hh:mm", {up, strikes: Map<K,[bid,ask]>}> */
function leerLado(f) {
  const lin = readFileSync(f, "utf8").split("\n");
  const I = columnas(lin[0], ["strike", "timestamp", "bid", "ask", "underlying_price"], f);
  const barras = new Map();
  for (let i = 1; i < lin.length; i++) {
    const l = lin[i];
    if (l.length < 20) continue;
    const c = l.split(",");
    const up = +c[I.underlying_price];
    if (!(up > 0)) continue;                       // la barra de 09:30 viene con 0: no ha cotizado
    const h = c[I.timestamp].slice(11, 16);
    let b = barras.get(h);
    if (!b) { b = { up, K: new Map() }; barras.set(h, b); }
    const bid = +c[I.bid], ask = +c[I.ask];
    if (!(bid > 0) || !(ask >= bid)) continue;     // sin puja no hay dónde vender: se salta
    b.K.set(+c[I.strike], [bid, ask]);
  }
  return barras;
}

const J = JSON.parse(readFileSync(NIV, "utf8"));
const FECHAS = J.filas.map((f) => f.fecha);
console.log(`\nconstruyendo el camino de 5 min de ${FECHAS.length} días (los mismos de ${NIV})`);

const OUT = {};
const t0 = Date.now();
let sinC = 0, sinP = 0, hechos = 0;
const nBarras = [], sinStraddle = [];

for (let i = 0; i < FECHAS.length; i++) {
  const d = FECHAS[i];
  const fC = `${DIR}/iv_${d}_C.csv`, fP = `${DIR}/iv_${d}_P.csv`;
  if (!existsSync(fC)) { sinC++; continue; }
  if (!existsSync(fP)) { sinP++; continue; }
  const C = leerLado(fC), P = leerLado(fP);
  const horas = [...C.keys()].filter((h) => h >= "09:35" && h <= "16:00").sort();
  const fila = { h: [], px: [], sBid: [], sAsk: [], sK: [] };
  let faltan = 0;
  for (const h of horas) {
    const bc = C.get(h), bp = P.get(h);
    if (!bc) continue;
    fila.h.push(h);
    fila.px.push(+bc.up.toFixed(2));
    // straddle ATM: el strike MÁS CERCA del subyacente que tiene puja en LAS DOS patas.
    let mejorK = null, mejorD = Infinity;
    if (bp) for (const [K, cv] of bc.K) {
      const pv = bp.K.get(K);
      if (!pv) continue;
      const dist = Math.abs(K - bc.up);
      if (dist < mejorD) { mejorD = dist; mejorK = K; }
    }
    if (mejorK == null) { fila.sBid.push(null); fila.sAsk.push(null); fila.sK.push(null); faltan++; continue; }
    const [cb, ca] = bc.K.get(mejorK), [pb, pa] = bp.K.get(mejorK);
    fila.sK.push(mejorK);
    fila.sBid.push(+(cb + pb).toFixed(2));   // lo que COBRAS si lo vendes
    fila.sAsk.push(+(ca + pa).toFixed(2));   // lo que PAGAS si lo compras
  }
  if (fila.h.length < 60) { sinStraddle.push([d, fila.h.length]); continue; }
  nBarras.push(fila.h.length);
  if (faltan > 0) sinStraddle.push([d, `${faltan} barras sin straddle`]);
  OUT[d] = fila;
  hechos++;
  if ((i + 1) % 200 === 0) console.log(`   ${i + 1}/${FECHAS.length} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

console.log(`\n   días con camino: ${hechos} · sin fichero C: ${sinC} · sin fichero P: ${sinP}`);
console.log(`   barras por día: min ${Math.min(...nBarras)} · mediana ${nBarras.sort((a, b) => a - b)[Math.floor(nBarras.length / 2)]} · max ${Math.max(...nBarras)}`);
console.log(`   días con alguna barra sin straddle cotizado: ${sinStraddle.length}`);
if (sinStraddle.length) console.log(`      ejemplos: ${JSON.stringify(sinStraddle.slice(0, 5))}`);
writeFileSync(SALIDA, JSON.stringify(OUT));
console.log(`   escrito: ${SALIDA} (${(JSON.stringify(OUT).length / 1e6).toFixed(1)} MB) en ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
