// AMPLITUD COMO RIESGO · PASO 0 — construir la tabla de días UNA vez y guardarla.
//
// Para cada sesión con cadena 0DTE de SPXW: precio a las 11:00, cierre, straddle del dinero,
// P&L real del cóndor a varias distancias (alas 50) y las medias móviles de 20 y 50 sesiones
// calculadas SÓLO con cierres estrictamente anteriores.
//
// Precios reales en las cuatro patas: bid al vender, ask al comprar. $0,03 por pata.
// Uso: node --import tsx --max-old-space-size=10240 scripts/amplitud-riesgo-datos.mjs

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00", COMM = 0.03;
const DIST = [15, 20, 25, 30, 35, 40, 45, 50];
const ALA = 50;
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);

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
  let cierre = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    const h = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && h >= hFin) { hFin = h; cierre = sp; }
    if (h !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask, spot: sp });
  }
  return enHora.length ? { filas: enHora, cierre } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

const fechas = [...new Set(readdirSync(DIR).map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean))].sort();
console.log(`${fechas.length} sesiones con fichero de calls en ${DIR}`);

const dias = [];
for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P || !(C.cierre > 0)) continue;
  const sp11 = C.filas[0].spot;
  if (!(sp11 > 0)) continue;

  const kA = cerca(C.filas, sp11), pA = P.filas.find((x) => x.K === kA.K) ?? cerca(P.filas, sp11);
  const straddle = (kA.bid + kA.ask) / 2 + (pA.bid + pA.ask) / 2;

  const condor = (dist, ala) => {
    if (!(dist > 0)) return null;
    const cC = cerca(C.filas, sp11 + dist), pC = cerca(P.filas, sp11 - dist);
    const cL = cerca(C.filas, cC.K + ala), pL = cerca(P.filas, pC.K - ala);
    if (cL.K <= cC.K || pL.K >= pC.K) return null;
    const cred = cC.bid + pC.bid - cL.ask - pL.ask;
    if (!(cred > 0)) return null;
    const S = C.cierre;
    const pl = (cred - Math.min(Math.max(S - cC.K, 0), cL.K - cC.K)
                     - Math.min(Math.max(pC.K - S, 0), pC.K - pL.K)) * 100 - 8 * COMM;
    return { pl, cred: cred * 100 };
  };

  // Un día entra si las DOS geometrías del debate (±25 y ±30) tienen crédito real. Las demás
  // distancias se guardan como null cuando no lo tienen — no se rellenan ni se descarta el día,
  // porque descartar por la distancia más lejana echaría fuera justo las sesiones más calmadas.
  const pnl = {}, cred = {};
  for (const d of DIST) {
    const r = condor(d, ALA);
    pnl[d] = r ? r.pl : null; cred[d] = r ? r.cred : null;
  }
  if (pnl[25] == null || pnl[30] == null) continue;

  dias.push({ fecha, ano: fecha.slice(0, 4), sp11, cierre: C.cierre, straddle, pnl, cred });
}

// medias móviles con cierres ESTRICTAMENTE anteriores (nada del día de hoy entra en la decisión)
for (let i = 0; i < dias.length; i++) {
  if (i < 50) { dias[i].ma20 = null; dias[i].ma50 = null; continue; }
  const c = dias.slice(i - 50, i).map((x) => x.cierre);
  dias[i].ma20 = media(c.slice(-20));
  dias[i].ma50 = media(c);
}

const usables = dias.filter((d) => d.ma50 != null);
writeFileSync("scripts/amplitud-riesgo-dias.json", JSON.stringify({ DIST, ALA, HORA, dias: usables }));
console.log(`${usables.length} días usables · ${usables[0].fecha} → ${usables[usables.length - 1].fecha}`);
console.log(`sobre MA20 y MA50: ${usables.filter((d) => d.sp11 >= d.ma20 && d.sp11 >= d.ma50).length}`);
