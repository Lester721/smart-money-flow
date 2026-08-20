// SALIDA POR HORA · PASO 1 — construir las filas desde las CADENAS, los 1.123 días.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/salida-hora-filas.mjs
//
// Por qué se reconstruye en vez de usar scripts/regimen-filas.json: ese fichero sólo cubre 653
// días (2024-2026). Con 653 días no se puede partir la muestra, y partir la muestra es lo único
// que distingue este encargo de los diecinueve anteriores.
//
// QUÉ SE CONSTRUYE, por día:
//   · entrada 11:00 — vender call a spot+25 y put a spot−25, comprar las alas 50 puntos más allá.
//     Se COBRA EL BID de lo vendido y se PAGA EL ASK de lo comprado. Nunca punto medio.
//   · aguantar al cierre — liquidación contra el underlying_price de las 16:00 de la propia cadena.
//   · cerrar a las 12:00 / 13:00 / 14:00 / 14:30 / 15:00 / 15:30 / 15:45 — se RECOMPRA lo vendido
//     PAGANDO EL ASK y se vende lo comprado COBRANDO EL BID. La horquilla entera, otra vez.
//   · el punto medio de esa misma recompra, SÓLO para descomponer el coste en horquilla vs. tiempo.
//     No se usa como resultado de ninguna estrategia.
//
// Comisión: $0,03 por pata · 4 patas de entrada + 4 de salida (o de liquidación) = 8 × $0,03.
// Es la misma cuenta que aguantar al cierre, para que la comparación sea limpia.

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const ENTRADA = "11:00", CIERRE = "16:00";
const SALIDAS = ["12:00", "13:00", "14:00", "14:30", "15:00", "15:30", "15:45"];
const HORAS = [ENTRADA, ...SALIDAS, CIERRE];
const SET = new Set(HORAS);
const SEP = 25, ALA = 50, COMM = 0.03, PATAS = 8;

/** Lee un fichero de cadena y devuelve, por hora, strike → [bid, ask]; y el spot de cada hora. */
function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const iK = cab.indexOf("strike"), iT = cab.indexOf("timestamp"),
        iB = cab.indexOf("bid"), iA = cab.indexOf("ask"), iU = cab.indexOf("underlying_price");
  if ([iK, iT, iB, iA, iU].some((x) => x < 0)) throw new Error(`faltan columnas en ${f}`);
  if (iT !== 4) throw new Error(`timestamp no es el 5º campo en ${f} — el atajo de parseo no vale`);
  const out = new Map(); for (const h of HORAS) out.set(h, new Map());
  const spot = new Map();
  for (let j = 1; j < lin.length; j++) {
    const L = lin[j]; if (L.length < 30) continue;
    let p = -1; for (let k = 0; k < 4; k++) { p = L.indexOf(",", p + 1); if (p < 0) break; }
    if (p < 0) continue;
    const h = L.substr(p + 12, 5);
    if (!SET.has(h)) continue;
    const c = L.split(",");
    const K = +c[iK]; if (!(K > 0)) continue;
    out.get(h).set(K, [+c[iB], +c[iA]]);
    const sp = +c[iU]; if (sp > 0 && !spot.has(h)) spot.set(h, sp);
  }
  return { out, spot };
}

const cercano = (mapa, objetivo) => {
  let mejor = null, dMejor = Infinity;
  for (const K of mapa.keys()) { const d = Math.abs(K - objetivo); if (d < dMejor) { dMejor = d; mejor = K; } }
  return mejor;
};

const fechas = [...new Set(readdirSync(DIR)
  .map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();

const filas = [];
const descartes = { sinFichero: 0, sinSpot: 0, sinCierre: 0, sinStrike: 0, creditoNoPositivo: 0, huecoSalida: 0 };
let cruzadas = 0, askCeroSalida = 0, celdas = 0;

const t0 = Date.now();
for (let i = 0; i < fechas.length; i++) {
  const fecha = fechas[i];
  if (i % 100 === 0) process.stderr.write(`  ${i}/${fechas.length} ${fecha} (${((Date.now()-t0)/1000).toFixed(0)}s)\n`);
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P) { descartes.sinFichero++; continue; }

  const spot = C.spot.get(ENTRADA) ?? P.spot.get(ENTRADA);
  if (!(spot > 0)) { descartes.sinSpot++; continue; }
  const cierre = C.spot.get(CIERRE) ?? P.spot.get(CIERRE);
  if (!(cierre > 0)) { descartes.sinCierre++; continue; }

  const c11 = C.out.get(ENTRADA), p11 = P.out.get(ENTRADA);
  const kSC = cercano(c11, spot + SEP), kSP = cercano(p11, spot - SEP);
  if (kSC == null || kSP == null) { descartes.sinStrike++; continue; }
  const kLC = cercano(c11, kSC + ALA), kLP = cercano(p11, kSP - ALA);
  if (kLC == null || kLP == null || kLC <= kSC || kLP >= kSP) { descartes.sinStrike++; continue; }

  const [bSC, aSC] = c11.get(kSC), [bSP, aSP] = p11.get(kSP);
  const [bLC, aLC] = c11.get(kLC), [bLP, aLP] = p11.get(kLP);
  // Entrada con precios de ejecución: cobro el BID de lo vendido, pago el ASK de lo comprado.
  if (!(aLC > 0 && aLP > 0 && bSC > 0 && bSP > 0)) { descartes.sinStrike++; continue; }
  const credito = bSC + bSP - aLC - aLP;
  if (!(credito > 0)) { descartes.creditoNoPositivo++; continue; }

  // Aguantar al cierre: liquidación en efectivo contra el precio de las 16:00.
  const intrinseco = Math.min(Math.max(cierre - kSC, 0), kLC - kSC)
                   + Math.min(Math.max(kSP - cierre, 0), kSP - kLP);
  const plHold = (credito - intrinseco) * 100 - PATAS * COMM;

  // Salidas por hora. Se exige que las CUATRO patas coticen en TODAS las horas, para que las
  // siete estrategias se midan sobre exactamente los mismos días.
  const salidas = {}; let hueco = false;
  for (const h of SALIDAS) {
    const ch = C.out.get(h), ph = P.out.get(h);
    const sc = ch.get(kSC), sp_ = ph.get(kSP), lc = ch.get(kLC), lp = ph.get(kLP);
    if (!sc || !sp_ || !lc || !lp) { hueco = true; break; }
    celdas++;
    if (!(sc[1] > 0) || !(sp_[1] > 0)) askCeroSalida++;  // sin oferta = no se puede recomprar
    if (sc[0] > sc[1] || sp_[0] > sp_[1] || lc[0] > lc[1] || lp[0] > lp[1]) cruzadas++;
    // Cerrar: pago el ASK de lo que recompro (las vendidas), cobro el BID de lo que vendo (las alas).
    const debEjec = sc[1] + sp_[1] - lc[0] - lp[0];
    const mid = (x) => (x[0] + x[1]) / 2;
    const debMid = mid(sc) + mid(sp_) - mid(lc) - mid(lp);
    const sh = C.spot.get(h) ?? P.spot.get(h) ?? 0;
    salidas[h] = {
      pl: (credito - debEjec) * 100 - PATAS * COMM,
      debEjec, debMid, spot: sh,
    };
  }
  if (hueco) { descartes.huecoSalida++; continue; }

  filas.push({
    fecha, ticker: "SPXW", spot, cierre,
    kSC, kSP, kLC, kLP, credito, intrinseco, plHold,
    mov: cierre - spot,
    salidas,
  });
}

console.log(`\n1.123 días en disco · ${filas.length} operaciones válidas`);
console.log("descartes:", JSON.stringify(descartes));
console.log(`celdas de salida ${celdas} · sin oferta (ask=0) en una vendida: ${askCeroSalida} (${(askCeroSalida/celdas*100).toFixed(2)}%) · horquillas cruzadas: ${cruzadas}`);
for (const a of ["2022","2023","2024","2025","2026"])
  console.log(`  ${a}: ${filas.filter((f) => f.fecha.startsWith(a)).length}`);

writeFileSync("scripts/salida-hora-filas.json", JSON.stringify(filas));
console.log(`\nescrito scripts/salida-hora-filas.json · ${((Date.now()-t0)/1000).toFixed(0)}s`);
