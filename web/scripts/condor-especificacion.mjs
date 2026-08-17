// LA ESPECIFICACIÓN DEL CÓNDOR — cobrar lo que hace falta, no lo que caiga
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/condor-especificacion.mjs
//
// ═══ EL PROBLEMA, CONCRETO ════════════════════════════════════════════════════════════════
//
// La regla actual vende call a +25 puntos y put a −25 puntos del dinero. PUNTOS FIJOS.
//
// Eso no es una distancia fija en riesgo: es una distancia fija en dólares. Cuando la volatilidad
// implícita cae, los mismos 25 puntos están mucho más lejos en términos de desviaciones típicas y
// pagan mucha menos prima. El forward test lo está enseñando en vivo: crédito mediano $220 contra
// los $725 de la mediana del backtest y los $360 del percentil 10.
//
// La estrategia no está fallando. Está MAL PARAMETRIZADA: cobra lo que le da el régimen.
//
// ═══ QUÉ SE MIDE AQUÍ ═════════════════════════════════════════════════════════════════════
//
// Sobre 654 días de SPXW 0DTE con cadenas cada 5 minutos y bid/ask REALES, se construye el mismo
// cóndor con cinco formas de elegir los strikes y se comparan en lo único que importa: DÓLARES POR
// OPERACIÓN, no porcentaje de aciertos.
//
//   PUNTOS FIJOS ±25    — la de hoy
//   SIGMA 0,50 / 0,75 / 1,00 / 1,25  — a tantas desviaciones del movimiento esperado del día
//
// La sigma sale de la volatilidad implícita del dinero EN EL MOMENTO DE ENTRAR, escalada a lo que
// queda de sesión. Es observable al operar: no hay futuro en ella.
//
// Se cobra el BID de las que se venden y se paga el ASK de las que se compran — las cuatro patas
// con su horquilla. Al cierre se liquida contra el precio real del subyacente.
//
// ⚠️ LO QUE ESTO NO ES: no es una prueba de si el cóndor funciona. Es la elección de su
// especificación. El filtro de GEX y la validación de la estrategia son otra cosa y no se tocan.

import { readFileSync, readdirSync, existsSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = process.env.HORA || "11:00";
const ALA = Number(process.env.ALA || 50);          // ancho de las alas, en puntos
const COMM = 0.03;                                   // por contrato, Robinhood

/** Lee un CSV de cadena 0DTE y devuelve las filas de la hora pedida + el cierre del subyacente. */
function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const iK = cab.indexOf("strike"), iT = cab.indexOf("timestamp"), iB = cab.indexOf("bid");
  const iA = cab.indexOf("ask"), iV = cab.indexOf("implied_vol"), iU = cab.indexOf("underlying_price");
  if ([iK, iT, iB, iA, iV, iU].some((x) => x < 0)) return null;

  const enHora = [];
  let ultimoSpot = 0, ultimaHora = "";
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    const hora = String(c[iT]).slice(11, 16);
    const spot = Number(c[iU]);
    if (spot > 0 && hora >= ultimaHora) { ultimaHora = hora; ultimoSpot = spot; }
    if (hora !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]), iv = Number(c[iV]);
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask, iv, spot });
  }
  return enHora.length ? { filas: enHora, cierre: ultimoSpot, horaCierre: ultimaHora } : null;
}

const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();
console.log(`\n## ESPECIFICACIÓN DEL CÓNDOR · ${fechas.length} días de SPXW 0DTE · entrada ${HORA} ET · alas ${ALA} puntos\n`);

// MÁS AGRESIVO, hasta que deje de pagar. La primera tanda dio un orden perfecto —cuanto más cerca,
// más dinero, aunque baje el acierto— y ±25 era el borde de lo probado. Aquí se baja hasta ±5.
// Se anota la DISTANCIA MEDIA REAL de cada regla, porque comparar "puntos" con "sigmas" sin saber
// a cuántos puntos equivale cada sigma es comparar a ciegas.
const ESPECS = [
  { nombre: "±5 puntos",  tipo: "puntos", v: 5 },
  { nombre: "±10 puntos", tipo: "puntos", v: 10 },
  { nombre: "±15 puntos", tipo: "puntos", v: 15 },
  { nombre: "±20 puntos", tipo: "puntos", v: 20 },
  { nombre: "±25 puntos (la de hoy)", tipo: "puntos", v: 25 },
  { nombre: "±35 puntos", tipo: "puntos", v: 35 },
  { nombre: "±50 puntos", tipo: "puntos", v: 50 },
  { nombre: "0,25 sigma", tipo: "sigma", v: 0.25 },
  { nombre: "0,50 sigma", tipo: "sigma", v: 0.50 },
  { nombre: "0,75 sigma", tipo: "sigma", v: 0.75 },
  { nombre: "1,00 sigma", tipo: "sigma", v: 1.00 },
];
const res = new Map(ESPECS.map((e) => [e.nombre, []]));

/** La opción cuyo strike está más cerca del objetivo. */
const cerca = (filas, obj) => filas.reduce((a, b) => (Math.abs(b.K - obj) < Math.abs(a.K - obj) ? b : a));

for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P || !(C.cierre > 0)) continue;
  const spot = C.filas[0].spot;
  if (!(spot > 0)) continue;

  // σ del día que QUEDA, con la IV del dinero en el momento de entrar. Todo observable al operar.
  const atm = cerca(C.filas, spot);
  const horas = Math.max(0.5, 16 - Number(HORA.slice(0, 2)) - Number(HORA.slice(3)) / 60);
  const iv = atm.iv > 0 ? atm.iv : 0.15;
  const sigma = spot * iv * Math.sqrt(horas / (252 * 6.5));
  if (!(sigma > 0)) continue;

  for (const e of ESPECS) {
    const d = e.tipo === "puntos" ? e.v : e.v * sigma;
    const cCorta = cerca(C.filas, spot + d), pCorta = cerca(P.filas, spot - d);
    const cLarga = cerca(C.filas, cCorta.K + ALA), pLarga = cerca(P.filas, pCorta.K - ALA);
    if (cLarga.K <= cCorta.K || pLarga.K >= pCorta.K) continue;

    // SE COBRA EL BID de lo que se vende y SE PAGA EL ASK de lo que se compra. Las cuatro patas.
    const credito = cCorta.bid + pCorta.bid - cLarga.ask - pLarga.ask;
    if (!(credito > 0)) continue;
    const anchoReal = Math.max(cLarga.K - cCorta.K, pCorta.K - pLarga.K);
    const S = C.cierre;
    const perdCall = Math.min(Math.max(S - cCorta.K, 0), cLarga.K - cCorta.K);
    const perdPut = Math.min(Math.max(pCorta.K - S, 0), pCorta.K - pLarga.K);
    const pl = (credito - perdCall - perdPut) * 100 - 8 * COMM;
    res.get(e.nombre).push({ fecha, credito: credito * 100, pl, riesgo: (anchoReal - credito) * 100, gana: pl > 0, dist: d });
  }
}

const med = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const mediana = (v) => { const s = [...v].sort((a, b) => a - b); return s[s.length >> 1]; };
const eur = (x) => `$${Math.round(x).toLocaleString("es-ES")}`;

console.log("especificación            n    dist.med   crédito med.   acierto    P&L medio    P&L total    s/riesgo");
for (const e of ESPECS) {
  const v = res.get(e.nombre);
  if (v.length < 50) { console.log(`  ${e.nombre}: sólo ${v.length} días`); continue; }
  const pls = v.map((x) => x.pl);
  const sobreRiesgo = med(v.map((x) => x.pl / x.riesgo)) * 100;
  console.log(`${e.nombre.padEnd(24)} ${String(v.length).padStart(4)}  ${med(v.map((x) => x.dist)).toFixed(0).padStart(7)}   ${eur(mediana(v.map((x) => x.credito))).padStart(10)}   ` +
              `${((v.filter((x) => x.gana).length / v.length) * 100).toFixed(0).padStart(5)}%   ${eur(med(pls)).padStart(9)}   ` +
              `${eur(pls.reduce((a, b) => a + b, 0)).padStart(10)}   ${sobreRiesgo.toFixed(2).padStart(8)}%`);
}

console.log(`\n── ¿AGUANTA EN EL TIEMPO? (P&L medio por año) ──`);
const años = [...new Set(fechas.map((f) => f.slice(0, 4)))].sort();
console.log(`especificación            ${años.map((a) => a.padStart(9)).join("")}`);
for (const e of ESPECS) {
  const v = res.get(e.nombre);
  if (v.length < 50) continue;
  const fila = años.map((a) => {
    const g = v.filter((x) => x.fecha.startsWith(a));
    return (g.length ? eur(med(g.map((x) => x.pl))) : "—").padStart(9);
  });
  console.log(`${e.nombre.padEnd(24)} ${fila.join("")}`);
}
console.log(`\n(el crédito de hoy en vivo es ~$220. La especificación buena tiene que cobrar bastante`);
console.log(` más que eso HOY, no sólo de media en el pasado)`);
