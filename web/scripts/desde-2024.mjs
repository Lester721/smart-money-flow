// ¿CUÁNTO HABRÍA DADO EL CÓNDOR EMPEZANDO EN 2024? — la cuenta de caja, día a día.
//
// Sin filtro de GEX (los agentes midieron que el filtro RESTA), entrada 11:00, ±25 puntos.
// Se prueban las dos anchuras: 50 (la de hoy) y 30 (la que cabe en su cuenta).
// Se cobra BID de lo vendido, se paga ASK de lo comprado, comisión de Robinhood. Un contrato.

import { readFileSync, readdirSync, existsSync } from "node:fs";
const DIR = "scripts/cache-theta/gex-2026", HORA = "11:00", COMM = 0.03;

function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const [iK, iT, iB, iA, iU] = ["strike","timestamp","bid","ask","underlying_price"].map((c) => cab.indexOf(c));
  if ([iK, iT, iB, iA, iU].some((x) => x < 0)) return null;
  const enHora = []; let spotFin = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(","), hora = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && hora >= hFin) { hFin = hora; spotFin = sp; }
    if (hora !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask, spot: sp });
  }
  return enHora.length ? { filas: enHora, cierre: spotFin } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));
const eur = (x) => `$${Math.round(x).toLocaleString("es-ES")}`;
const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();

for (const ALA of [50, 30]) {
  const ops = [];
  for (const fecha of fechas) {
    const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
    if (!C || !P || !(C.cierre > 0)) continue;
    const spot = C.filas[0].spot; if (!(spot > 0)) continue;
    const cC = cerca(C.filas, spot + 25), pC = cerca(P.filas, spot - 25);
    const cL = cerca(C.filas, cC.K + ALA), pL = cerca(P.filas, pC.K - ALA);
    if (cL.K <= cC.K || pL.K >= pC.K) continue;
    const cred = cC.bid + pC.bid - cL.ask - pL.ask;
    if (!(cred > 0)) continue;
    const S = C.cierre;
    const pl = (cred - Math.min(Math.max(S - cC.K, 0), cL.K - cC.K)
                     - Math.min(Math.max(pC.K - S, 0), pC.K - pL.K)) * 100 - 8 * COMM;
    ops.push({ fecha, pl, colateral: (Math.max(cL.K - cC.K, pC.K - pL.K) - cred) * 100 });
  }
  console.log(`\n═══ ALAS DE ${ALA} PUNTOS · 1 contrato · ${ops.length} días · sin filtro de GEX ═══\n`);
  console.log("| año | días | ganados | P&L del año | acumulado | mejor día | peor día |");
  console.log("|---|---|---|---|---|---|---|");
  let acum = 0;
  for (const a of ["2024", "2025", "2026"]) {
    const g = ops.filter((x) => x.fecha.startsWith(a)); if (!g.length) continue;
    const s = g.reduce((t, x) => t + x.pl, 0); acum += s;
    const pls = g.map((x) => x.pl);
    console.log(`| ${a} | ${g.length} | ${((g.filter((x)=>x.pl>0).length/g.length)*100).toFixed(0)}% | ${eur(s)} | ${eur(acum)} | ${eur(Math.max(...pls))} | ${eur(Math.min(...pls))} |`);
  }
  // La racha peor y el colateral que pide
  let peor = 0, cur = 0;
  for (const o of ops) { cur = Math.min(0, cur + o.pl); peor = Math.min(peor, cur); }
  const col = ops.map((x) => x.colateral).sort((a, b) => a - b);
  console.log(`\n  TOTAL 2024→hoy: ${eur(acum)} · ${eur(acum / (ops.length / 252))}/año · media ${eur(acum / ops.length)}/día`);
  console.log(`  peor racha acumulada: ${eur(peor)} · colateral mediano ${eur(col[col.length >> 1])} · máximo ${eur(col[col.length - 1])}`);
}
