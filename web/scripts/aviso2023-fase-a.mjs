// FASE A · una sola pasada por los 1.123 días de cadenas 0DTE de SPXW (2022→2026).
// Deja en disco la tabla mínima que necesita el estudio del aviso temprano de 2023.
//
// TODO lo que se guarda es OBSERVABLE a las 11:00 salvo `cierre` y `mov`, que son el RESULTADO
// del día y sólo se usan (a) para el P&L de ese día y (b) como historia de días ANTERIORES.
//
// Precios reales: bid al vender las cortas, ask al comprar las alas. $0,03 por pata.

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00", ALA = 50, COMM = 0.03;
const SALIDA = "scripts/aviso2023-filas.json";

function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = ["strike", "timestamp", "bid", "ask", "underlying_price"].map((c) => cab.indexOf(c));
  if (idx.some((x) => x < 0)) throw new Error("faltan columnas en " + f);
  const [iK, iT, iB, iA, iU] = idx;
  const enHora = [];
  let spotFin = 0, hFin = "", sp11 = 0, ap = 0, hAp = "99:99";
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    const hora = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0) {
      if (hora >= hFin) { hFin = hora; spotFin = sp; }
      if (hora <= hAp) { hAp = hora; ap = sp; }
      if (hora === HORA) sp11 = sp;
    }
    if (hora !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask });
  }
  return enHora.length ? { filas: enHora, cierre: spotFin, sp11, ap, hFin } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

const fechas = [...new Set(readdirSync(DIR)
  .map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean))].sort();
console.log("## " + fechas.length + " días con cadena de CALL");

const filas = [], descartes = [];
for (let i = 0; i < fechas.length; i++) {
  const fecha = fechas[i];
  if (i % 100 === 0) console.log("   " + i + "/" + fechas.length + " · " + fecha);
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P) { descartes.push([fecha, "sin cadena"]); continue; }
  const sp11 = C.sp11 || P.sp11, cierre = C.cierre;
  if (!(sp11 > 0) || !(cierre > 0)) { descartes.push([fecha, "sin spot 11:00 o sin cierre"]); continue; }
  if (C.hFin < "15:55") { descartes.push([fecha, "sesión corta, última marca " + C.hFin]); continue; }

  const cC = cerca(C.filas, sp11 + 25), pC = cerca(P.filas, sp11 - 25);
  const cL = cerca(C.filas, cC.K + ALA), pL = cerca(P.filas, pC.K - ALA);
  if (cL.K <= cC.K || pL.K >= pC.K) { descartes.push([fecha, "sin alas"]); continue; }
  const cred = cC.bid + pC.bid - cL.ask - pL.ask;
  if (!(cred > 0)) { descartes.push([fecha, "crédito no positivo"]); continue; }
  const aC = cL.K - cC.K, aP = pC.K - pL.K;
  const danoC = Math.min(Math.max(cierre - cC.K, 0), aC);
  const danoP = Math.min(Math.max(pC.K - cierre, 0), aP);
  const pl = (cred - danoC - danoP) * 100 - 8 * COMM;

  filas.push({
    fecha,
    pl,                                  // $ del cóndor de 1 contrato
    credito: cred,                       // PUNTOS de SPX cobrados — observable a las 11:00
    colateral: (Math.max(aC, aP) - cred) * 100,
    sp11, ap: C.ap, cierre,
    mov: Math.abs(cierre - sp11),        // PUNTOS que se movió el resto de la sesión (resultado)
    desvC: Math.abs(cC.K - (sp11 + 25)), // cuánto se desvió el strike del ±25 pedido
    desvP: Math.abs(pC.K - (sp11 - 25)),
    anchoC: aC, anchoP: aP,
  });
}
writeFileSync(SALIDA, JSON.stringify(filas), "utf8");
console.log("\n## guardado " + filas.length + " días en " + SALIDA);
console.log("## descartados " + descartes.length);
const porMotivo = {};
for (const [, m] of descartes) porMotivo[m] = (porMotivo[m] || 0) + 1;
console.log(porMotivo);
const porAno = {};
for (const f of filas) porAno[f.fecha.slice(0, 4)] = (porAno[f.fecha.slice(0, 4)] || 0) + 1;
console.log("## días por año:", porAno);
