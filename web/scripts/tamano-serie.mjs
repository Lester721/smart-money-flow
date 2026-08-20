// LA SERIE DIARIA DEL CÓNDOR · 1.123 días (2022-01-03 → 2026-08-10)
//
// Construye UNA VEZ, desde las cadenas, el resultado de UN contrato por día. Todo lo demás
// (tamaño, colateral, intereses, rachas) se calcula encima de esta serie.
//
// Reglas fijas, ninguna se ajusta aquí:
//   entrada 11:00 ET · vender call en spot+25 y put en spot−25 · alas 50 puntos más allá
//   se cobra BID de lo vendido y se paga ASK de lo comprado · se aguanta al cierre real de 16:00
//   comisión $0,03 por pata, 8 patas (4 de apertura + 4 de cierre/asignación) = $0,24
//
// NO usa scripts/regimen-filas.json (sólo cubre 653 días de 2024-2026).
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/tamano-serie.mjs

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia.ts";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00", SEP = 25, ALA = 50, COMM = 0.03, PATAS = 8;
// El ANCHO DEL ALA es un dial de TAMAÑO, no de estrategia: el colateral de Robinhood es el ancho
// de la vertical × 100, así que un ala de 25 vale $2.500 de colateral en vez de $5.000. Es la
// única manera de comprar "medio contrato" cuando el mínimo entero ya es el 8,9% de la cuenta.
const ALAS = [10, 15, 20, 25, 30, 40, 50];
export const SALIDA = "scripts/tamano-serie.json";

function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = ["strike", "timestamp", "bid", "ask", "underlying_price"].map((c) => cab.indexOf(c));
  if (idx.some((x) => x < 0)) throw new Error("faltan columnas en " + f); // un campo que no existe se lee como 0
  const [iK, iT, iB, iA, iU] = idx;
  const enHora = [];
  let spot11 = 0, cierre = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    const h = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && h >= hFin) { hFin = h; cierre = sp; }
    if (h !== HORA) continue;
    if (sp > 0 && !spot11) spot11 = sp;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask });
  }
  return enHora.length ? { filas: enHora, spot11, cierre, hFin } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

export function construir() {
  const fechas = [...new Set(readdirSync(DIR)
    .map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean))].sort();
  console.log(`ficheros de calls encontrados: ${fechas.length}`);

  const dias = [], descartes = { sinFichero: 0, sinSpot: 0, sinCierre: 0, sinAla: 0, creditoNoPositivo: 0 };
  for (const fecha of fechas) {
    const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
    if (!C || !P) { descartes.sinFichero++; continue; }
    const spot = C.spot11 || P.spot11;
    if (!(spot > 0)) { descartes.sinSpot++; continue; }
    const S = C.cierre || P.cierre;
    if (!(S > 0)) { descartes.sinCierre++; continue; }
    const cC = cerca(C.filas, spot + SEP), pC = cerca(P.filas, spot - SEP);
    const cL = cerca(C.filas, cC.K + ALA), pL = cerca(P.filas, pC.K - ALA);
    if (cL.K <= cC.K || pL.K >= pC.K) { descartes.sinAla++; continue; }
    const cred = cC.bid + pC.bid - cL.ask - pL.ask;             // precios reales: bid al vender, ask al comprar
    if (!(cred > 0)) { descartes.creditoNoPositivo++; continue; }
    const perdCall = Math.min(Math.max(S - cC.K, 0), cL.K - cC.K);
    const perdPut = Math.min(Math.max(pC.K - S, 0), pC.K - pL.K);
    // Las OTRAS anchuras de ala, con las MISMAS patas cortas. Sólo cambia lo que se compra.
    const porAla = {};
    for (const a of ALAS) {
      const c2 = cerca(C.filas, cC.K + a), p2 = cerca(P.filas, pC.K - a);
      if (c2.K <= cC.K || p2.K >= pC.K) continue;
      const cr = cC.bid + pC.bid - c2.ask - p2.ask;
      const anc = Math.max(c2.K - cC.K, pC.K - p2.K);
      porAla[a] = {
        credito: cr * 100,
        anchoReal: anc,
        colateral: anc * 100,                                    // Robinhood: la vertical al ancho completo
        pl: (cr - Math.min(Math.max(S - cC.K, 0), c2.K - cC.K)
                - Math.min(Math.max(pC.K - S, 0), pC.K - p2.K)) * 100 - PATAS * COMM,
      };
    }
    dias.push({
      porAla,
      fecha,
      spot11: spot,
      cierre: S,
      mov: S - spot,                       // puntos que se movió el índice desde las 11:00
      movPct: ((S - spot) / spot) * 100,
      credito: cred * 100,                 // $ por contrato
      anchoMax: Math.max(cL.K - cC.K, pC.K - pL.K),
      riesgo: (Math.max(cL.K - cC.K, pC.K - pL.K) - cred) * 100, // pérdida máxima teórica, $
      pl: (cred - perdCall - perdPut) * 100 - PATAS * COMM,      // $ por contrato, neto de comisión
      kCallCorta: cC.K, kPutCorta: pC.K, kCallLarga: cL.K, kPutLarga: pL.K,
      horaCierre: C.hFin,
    });
  }
  console.log(`días con operación: ${dias.length} · descartes: ${JSON.stringify(descartes)}`);
  return dias;
}

if (import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  const dias = construir();
  radiografia(dias, ["spot11", "cierre", "mov", "credito", "riesgo", "pl"], "cóndor 0DTE 1.123 días",
    { cerosLegitimos: [] });
  const porAno = {};
  for (const d of dias) (porAno[d.fecha.slice(0, 4)] ??= []).push(d);
  console.log("| año | días | ganados | media $/día | peor día | crédito medio |");
  console.log("|---|---|---|---|---|---|");
  for (const a of Object.keys(porAno).sort()) {
    const g = porAno[a], pls = g.map((x) => x.pl);
    console.log(`| ${a} | ${g.length} | ${((g.filter((x) => x.pl > 0).length / g.length) * 100).toFixed(0)}% |` +
      ` $${(pls.reduce((s, x) => s + x, 0) / g.length).toFixed(0)} | $${Math.round(Math.min(...pls))} |` +
      ` $${(g.reduce((s, x) => s + x.credito, 0) / g.length).toFixed(0)} |`);
  }
  writeFileSync(SALIDA, JSON.stringify(dias));
  console.log(`\nguardado en ${SALIDA} · ${dias.length} días · ${dias[0].fecha} → ${dias[dias.length - 1].fecha}`);
}
