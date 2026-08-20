// TENDENCIA-OTRA-VEZ · PASO 1 — reconstruir la base de 1.123 días desde las cadenas.
// Sale: fecha, spot 11:00, cierre real, strikes, crédito real (bid vendido / ask comprado), P&L.
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026", HORA = "11:00", COMM = 0.03, ALA = 50, DIST = 25;

function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const txt = readFileSync(f, "utf8");
  const nl = txt.indexOf("\n");
  const cab = txt.slice(0, nl).split(",").map((x) => x.replace(/"/g, "").trim());
  const iK = cab.indexOf("strike"), iT = cab.indexOf("timestamp"), iB = cab.indexOf("bid"),
        iA = cab.indexOf("ask"), iM = cab.indexOf("midpoint"), iIV = cab.indexOf("implied_vol"),
        iU = cab.indexOf("underlying_price");
  if ([iK, iT, iB, iA, iM, iIV, iU].some((x) => x < 0))
    throw new Error(`${f}: faltan columnas. Cabecera: ${cab.join(",")}`);
  const enHora = [];
  let spotFin = 0, hFin = "", spot11 = 0;
  let pos = nl + 1;
  while (pos < txt.length) {
    let fin = txt.indexOf("\n", pos); if (fin < 0) fin = txt.length;
    const linea = txt.slice(pos, fin); pos = fin + 1;
    if (!linea) continue;
    const c = linea.split(",");
    const ts = c[iT]; if (!ts || ts.length < 16) continue;
    const hora = ts.slice(11, 16);
    const sp = +c[iU];
    if (sp > 0 && hora >= hFin) { hFin = hora; spotFin = sp; }
    if (hora !== HORA) continue;
    if (sp > 0) spot11 = sp;
    const K = +c[iK], bid = +c[iB], ask = +c[iA];
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask, mid: +c[iM], iv: +c[iIV], sp });
  }
  return enHora.length ? { filas: enHora, cierre: spotFin, hFin, spot11 } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

const fechas = [...new Set(readdirSync(DIR)
  .map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();
console.log(`ficheros de CALL encontrados: ${fechas.length}`);

const filas = [], problemas = [];
let hecho = 0;
for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (++hecho % 100 === 0) process.stdout.write(`  ${hecho}/${fechas.length}\r`);
  if (!C) { problemas.push({ fecha, por: "sin CALLs cotizadas a las 11:00" }); continue; }
  if (!P) { problemas.push({ fecha, por: "sin PUTs cotizadas a las 11:00" }); continue; }
  const spot = C.spot11 || P.spot11;
  const cierre = Math.max(C.cierre, P.cierre) > 0 ? (C.cierre || P.cierre) : 0;
  if (!(spot > 0)) { problemas.push({ fecha, por: "sin precio del subyacente a las 11:00" }); continue; }
  if (!(cierre > 0)) { problemas.push({ fecha, por: "sin precio de cierre" }); continue; }
  const cC = cerca(C.filas, spot + DIST), pC = cerca(P.filas, spot - DIST);
  const cL = cerca(C.filas, cC.K + ALA), pL = cerca(P.filas, pC.K - ALA);
  if (cL.K <= cC.K || pL.K >= pC.K) { problemas.push({ fecha, por: "no hay strike para el ala" }); continue; }
  const cred = cC.bid + pC.bid - cL.ask - pL.ask;
  if (!(cred > 0)) { problemas.push({ fecha, por: `crédito ${cred.toFixed(2)} ≤ 0` }); continue; }
  const S = cierre;
  const pl = (cred - Math.min(Math.max(S - cC.K, 0), cL.K - cC.K)
                   - Math.min(Math.max(pC.K - S, 0), pC.K - pL.K)) * 100 - 8 * COMM;
  // straddle ATM a las 11:00 = movimiento esperado del día, en PUNTOS (para la forma adimensional)
  const aC = cerca(C.filas, spot), aP = cerca(P.filas, spot);
  const straddle = aC.mid + aP.mid;
  const ivAtm = (aC.iv > 0 && aP.iv > 0) ? (aC.iv + aP.iv) / 2 : (aC.iv || aP.iv || 0);
  filas.push({ fecha, spot11: spot, cierre, hFin: C.hFin, kC: cC.K, kP: pC.K, kCL: cL.K, kPL: pL.K,
               cred: +cred.toFixed(2), pl: +pl.toFixed(2), straddle: +straddle.toFixed(2), ivAtm: +ivAtm.toFixed(4) });
}
console.log(`\ndías utilizables: ${filas.length} · descartados: ${problemas.length}`);
for (const p of problemas) console.log(`   ✗ ${p.fecha} — ${p.por}`);
const porAno = {};
for (const f of filas) porAno[f.fecha.slice(0, 4)] = (porAno[f.fecha.slice(0, 4)] ?? 0) + 1;
console.log("por año:", JSON.stringify(porAno));
writeFileSync("scripts/tend-base.json", JSON.stringify({ filas, problemas }));
console.log("escrito scripts/tend-base.json");
