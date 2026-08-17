// TODA LA CUENTA EN EL CÓNDOR DESDE 2024 — la simulación honesta, con el capital compuesto.
//
// El número tentador es "$55.419 / $5.115 de colateral = 10 contratos, luego 10 x $48.638 = $486k".
// ESO ES FALSO Y ES LA FORMA DE ARRUINARSE: la peor racha también se multiplica por 10 (−$151.760),
// que es casi tres veces la cuenta. Se moriría por el camino y nunca llegaría al final.
//
// Aquí se simula de verdad: cada día se calcula cuántos contratos caben, se aplica el P&L REAL de
// ese día, y el capital del día siguiente es el resultante. Si el capital no da para un contrato,
// ese día NO SE OPERA (que es lo que pasaría en la cuenta de verdad).
//
// Se prueban varias agresividades. La regla es: N = floor(capital * FRACCION / colateral del día).
// FRACCION=1,0 significa "todo el dinero como colateral". Es lo que él pregunta, y sale abajo.

import { readFileSync, readdirSync, existsSync } from "node:fs";
const DIR = "scripts/cache-theta/gex-2026", HORA = "11:00", COMM = 0.03;
const CAPITAL0 = 55419;

function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const [iK, iT, iB, iA, iU] = ["strike","timestamp","bid","ask","underlying_price"].map((c) => cab.indexOf(c));
  if ([iK, iT, iB, iA, iU].some((x) => x < 0)) return null;
  const eh = []; let spFin = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(","), h = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && h >= hFin) { hFin = h; spFin = sp; }
    if (h !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (K > 0 && bid >= 0 && ask > 0) eh.push({ K, bid, ask, spot: sp });
  }
  return eh.length ? { filas: eh, cierre: spFin } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));
const eur = (x) => `$${Math.round(x).toLocaleString("es-ES")}`;
const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();

// Se precalculan las operaciones de 1 contrato para las dos anchuras.
const OPS = {};
for (const ALA of [50, 30]) {
  const ops = [];
  for (const fecha of fechas) {
    const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
    if (!C || !P || !(C.cierre > 0)) continue;
    const spot = C.filas[0].spot; if (!(spot > 0)) continue;
    const cC = cerca(C.filas, spot + 25), pC = cerca(P.filas, spot - 25);
    const cL = cerca(C.filas, cC.K + ALA), pL = cerca(P.filas, pC.K - ALA);
    if (cL.K <= cC.K || pL.K >= pC.K) continue;
    const cred = cC.bid + pC.bid - cL.ask - pL.ask; if (!(cred > 0)) continue;
    const S = C.cierre;
    const pl = (cred - Math.min(Math.max(S - cC.K, 0), cL.K - cC.K)
                     - Math.min(Math.max(pC.K - S, 0), pC.K - pL.K)) * 100 - 8 * COMM;
    ops.push({ fecha, pl, col: (Math.max(cL.K - cC.K, pC.K - pL.K) - cred) * 100 });
  }
  OPS[ALA] = ops;
}

/** Simula la cuenta compuesta. `doble`=true si Robinhood retiene las DOS verticales. */
function simular(ops, fraccion, doble) {
  let cap = CAPITAL0, pico = CAPITAL0, caida = 0, dias = 0, sinOperar = 0, maxN = 0;
  const porAno = new Map();
  for (const o of ops) {
    const col = o.col * (doble ? 2 : 1);
    const N = Math.floor((cap * fraccion) / col);
    if (N < 1) { sinOperar++; continue; }
    maxN = Math.max(maxN, N);
    const pl = o.pl * N;
    cap += pl; dias++;
    const a = o.fecha.slice(0, 4);
    porAno.set(a, (porAno.get(a) ?? 0) + pl);
    if (cap > pico) pico = cap;
    caida = Math.max(caida, (pico - cap) / pico);
    if (cap <= 0) return { cap: 0, caida: 1, ruina: o.fecha, dias, porAno, maxN, sinOperar };
  }
  return { cap, caida, ruina: null, dias, porAno, maxN, sinOperar };
}

for (const doble of [false, true]) {
  console.log(`\n${"═".repeat(78)}`);
  console.log(`  COLATERAL: Robinhood retiene ${doble ? "LAS DOS verticales (el caso malo)" : "UNA vertical (el caso bueno)"}`);
  console.log("═".repeat(78));
  for (const ALA of [50, 30]) {
    console.log(`\n  ── alas de ${ALA} puntos ──`);
    console.log(`  | % del capital como colateral | contratos máx | final | ganancia | caída máx | 2024 | 2025 | 2026 |`);
    console.log(`  |---|---|---|---|---|---|---|---|`);
    for (const fr of [1.0, 0.75, 0.50, 0.30, 0.20, 0.10, 0.05]) {
      const r = simular(OPS[ALA], fr, doble);
      const y = (a) => (r.porAno.has(a) ? eur(r.porAno.get(a)) : "—");
      const fin = r.ruina ? `**ARRUINADO ${r.ruina}**` : eur(r.cap);
      console.log(`  | ${(fr * 100).toFixed(0)}% | ${r.maxN} | ${fin} | ${r.ruina ? "−100%" : `${(((r.cap / CAPITAL0) - 1) * 100).toFixed(0)}%`} | ${(r.caida * 100).toFixed(0)}% | ${y("2024")} | ${y("2025")} | ${y("2026")} |`);
    }
  }
}
