// TAM-BASE — la serie diaria del cóndor 0DTE sobre los 1.123 días. Un contrato, precios reales.
//
// Reglas: entrada 11:00 ET. Vender call en spot+25 y put en spot−25; comprar alas 50 puntos más
// allá. BID de lo vendido, ASK de lo comprado, las cuatro patas. Comisión $0,03 por pata.
// Liquidación contra el precio real de las 16:00. Nada que se observe después de las 11:00 decide
// la entrada.
//
// Guarda scripts/tam-base.json con una fila por día, más el contexto de las 11:00 (sólo cosas
// observables ANTES de entrar) para poder mirar después de qué están hechos los días malos.

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00";
const COMM = 0.03;
const DIST = 25;   // distancia del corto al spot
const ALA = 50;    // anchura del ala

/** Lee un fichero de cadena y devuelve las filas de las 11:00, el camino del spot y el cierre. */
function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = ["strike", "timestamp", "bid", "ask", "underlying_price", "implied_vol"].map((c) => cab.indexOf(c));
  // Un campo que no existe se lee como 0 — aquí se lanza en vez de medir cero en silencio.
  if (idx.slice(0, 5).some((x) => x < 0)) throw new Error(`${f}: faltan columnas (${cab.join("|")})`);
  const [iK, iT, iB, iA, iU, iIV] = idx;

  const enHora = [];
  const camino = new Map();   // hora -> spot (para la volatilidad realizada de la mañana)
  let hFin = "", spotFin = 0;

  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    const ts = String(c[iT]);
    const hora = ts.slice(11, 16);
    const sp = Number(c[iU]);
    if (sp > 0) {
      if (!camino.has(hora)) camino.set(hora, sp);
      if (hora >= hFin) { hFin = hora; spotFin = sp; }
    }
    if (hora !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    const iv = iIV >= 0 ? Number(c[iIV]) : NaN;
    if (K > 0 && Number.isFinite(bid) && bid >= 0 && ask > 0) enHora.push({ K, bid, ask, spot: sp, iv });
  }
  if (!enHora.length || !(spotFin > 0)) return null;
  return { filas: enHora, cierre: spotFin, horaCierre: hFin, camino };
}

const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

const fechas = [...new Set(
  readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean),
)].sort();
console.log(`ficheros de calls encontrados: ${fechas.length}`);

const filas = [];
const descartes = { sinFichero: 0, sinSpot11: 0, sinAla: 0, creditoNoPositivo: 0, cierreRaro: 0 };

for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P) { descartes.sinFichero++; continue; }
  const spot = C.filas[0].spot;
  if (!(spot > 0)) { descartes.sinSpot11++; continue; }

  const cC = cerca(C.filas, spot + DIST), pC = cerca(P.filas, spot - DIST);
  const cL = cerca(C.filas, cC.K + ALA), pL = cerca(P.filas, pC.K - ALA);
  if (cL.K <= cC.K || pL.K >= pC.K) { descartes.sinAla++; continue; }

  const credito = cC.bid + pC.bid - cL.ask - pL.ask;
  if (!(credito > 0)) { descartes.creditoNoPositivo++; continue; }

  const S = C.cierre;
  if (!(S > 0) || Math.abs(S / spot - 1) > 0.12) { descartes.cierreRaro++; continue; }

  const anchoC = cL.K - cC.K, anchoP = pC.K - pL.K;
  const perdC = Math.min(Math.max(S - cC.K, 0), anchoC);
  const perdP = Math.min(Math.max(pC.K - S, 0), anchoP);
  const pl = (credito - perdC - perdP) * 100 - 8 * COMM;   // 4 patas de entrada + 4 de salida

  // ── contexto observable ANTES de las 11:00 ──
  const abre = C.camino.get("09:35") ?? C.camino.get("09:40") ?? spot;
  const rets = [];
  const horas = [...C.camino.keys()].filter((h) => h >= "09:35" && h <= HORA).sort();
  for (let i = 1; i < horas.length; i++) {
    const a = C.camino.get(horas[i - 1]), b = C.camino.get(horas[i]);
    if (a > 0 && b > 0) rets.push(Math.log(b / a));
  }
  const m = rets.length ? rets.reduce((x, y) => x + y, 0) / rets.length : 0;
  const rv = rets.length > 3
    ? Math.sqrt(rets.reduce((x, y) => x + (y - m) ** 2, 0) / (rets.length - 1)) * Math.sqrt(78) * Math.sqrt(252) * 100
    : null;
  const ivs = [cC.iv, pC.iv].filter((x) => Number.isFinite(x) && x > 0.01 && x < 5);
  const ivAtm = ivs.length ? (ivs.reduce((a, b) => a + b, 0) / ivs.length) * 100 : null;

  filas.push({
    fecha,
    spot11: Math.round(spot * 100) / 100,
    cierre: Math.round(S * 100) / 100,
    horaCierre: C.horaCierre,
    kCallCorto: cC.K, kCallLargo: cL.K, kPutCorto: pC.K, kPutLargo: pL.K,
    credito: Math.round(credito * 100) / 100,
    pl: Math.round(pl * 100) / 100,
    mov: Math.round((S - spot) * 100) / 100,                       // movimiento 11:00 → cierre
    movPct: Math.round((S / spot - 1) * 1e6) / 1e4,
    movManana: Math.round((spot / abre - 1) * 1e6) / 1e4,          // 09:35 → 11:00 (observable)
    rvManana: rv == null ? null : Math.round(rv * 100) / 100,      // vol realizada de la mañana, anualizada %
    ivAtm: ivAtm == null ? null : Math.round(ivAtm * 100) / 100,
    colateral: Math.max(anchoC, anchoP) * 100,                     // el ancho pleno: lo que retiene Robinhood
  });
}

console.log(`días construidos: ${filas.length}`);
console.log(`descartes:`, descartes);
const porAno = {};
for (const f of filas) porAno[f.fecha.slice(0, 4)] = (porAno[f.fecha.slice(0, 4)] ?? 0) + 1;
console.log(`por año:`, porAno);

writeFileSync("scripts/tam-base.json", JSON.stringify(filas));
console.log(`\nescrito scripts/tam-base.json`);

// ── comprobaciones de sanidad, en voz alta ──
const pls = filas.map((f) => f.pl).sort((a, b) => a - b);
const total = pls.reduce((a, b) => a + b, 0);
console.log(`\nP&L total 1 contrato: $${Math.round(total).toLocaleString("es-ES")}`);
console.log(`ganados ${((pls.filter((x) => x > 0).length / pls.length) * 100).toFixed(1)}%`);
console.log(`peor día $${Math.round(pls[0])} · p1 $${Math.round(pls[Math.floor(pls.length * 0.01)])} · p5 $${Math.round(pls[Math.floor(pls.length * 0.05)])} · mediana $${Math.round(pls[pls.length >> 1])} · mejor $${Math.round(pls[pls.length - 1])}`);
const cred = filas.map((f) => f.credito).sort((a, b) => a - b);
console.log(`crédito: min ${cred[0].toFixed(2)} · p50 ${cred[cred.length >> 1].toFixed(2)} · max ${cred[cred.length - 1].toFixed(2)}`);
const colSet = new Set(filas.map((f) => f.colateral));
console.log(`colateral (ancho pleno) valores distintos: ${[...colSet].sort((a, b) => a - b).join(", ")}`);
const horas = new Set(filas.map((f) => f.horaCierre));
console.log(`hora del último dato: ${[...horas].sort().join(", ")}`);
