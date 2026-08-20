// ESQUINA · PASO 1 — LA PLAZA.
// Construye, para CADA ticker y CADA día del período de MarketSnack, la operación estándar de la
// ESQUINA BARATA: 5% fuera del dinero, vencimiento lo más cerca de 90 días, salida a los ~23.
// Se compra al ASK real de la cadena de cierre y se vende al BID real de la cadena de salida.
// Nunca punto medio, nunca Black-Scholes.
//
// Esto es LA MONEDA: el conjunto del que tanto la señal como el sorteo tienen que elegir.
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { elegirEsquina, bidSalida, cadena, dias, iso, media, fmt } from "./print-lib.mjs";

const CDIR = "scripts/cache-theta/cadenas", CIER = "scripts/cache-theta/cierres";
const D0 = "20260422", D1 = "20260819";        // ventana de MarketSnack
const DTE_OBJ = 90, TOL_DTE = 25, DIST = 0.05, TOL_K = 0.30;
const HOLD = 23;                                // días de calendario hasta salir
const HOLD_TOL = 6;                             // margen para caer en día hábil con cadena

const diasCad = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/); if (!m) continue;
  if (m[2] < D0 || m[2] > D1) continue;
  (diasCad.get(m[1]) ?? diasCad.set(m[1], []).get(m[1])).push(m[2]);
}
const cierresC = new Map();
const cierre = (t, y) => {
  if (!cierresC.has(t)) cierresC.set(t, existsSync(`${CIER}/${t}.json`) ? JSON.parse(readFileSync(`${CIER}/${t}.json`, "utf8")) : {});
  const v = cierresC.get(t)[y]; return Number.isFinite(v) && v > 0 ? v : null;
};

const filas = [];
const censo = [];
for (const [ticker, ds] of [...diasCad].sort()) {
  ds.sort();
  let ok = 0, sinCierre = 0, sinContrato = 0, sinSalida = 0;
  for (let i = 0; i < ds.length; i++) {
    const ymd = ds[i];
    const S = cierre(ticker, ymd);
    if (!(S > 0)) { sinCierre++; continue; }
    // salida: primer día con cadena a >= HOLD días de calendario
    let sal = null;
    for (let j = i + 1; j < ds.length; j++) { const d = dias(ymd, ds[j]); if (d >= HOLD) { if (d <= HOLD + HOLD_TOL) sal = ds[j]; break; } }
    if (!sal) { sinSalida++; continue; }
    const cad = cadena(ticker, ymd);
    if (!cad) { sinContrato++; continue; }
    const fila = { ticker, ymd, salida: sal, S, holdReal: dias(ymd, sal) };
    let algo = false;
    for (const tipo of ["C", "P"]) {
      const e = elegirEsquina(cad, S, DTE_OBJ, DIST, tipo, ymd, TOL_DTE, TOL_K);
      if (!e) continue;
      const bid = bidSalida(ticker, sal, e.exp, tipo, e.K);
      if (bid === null) continue;                       // sin cadena de salida: NO se rellena
      algo = true;
      const k = tipo === "C" ? "c" : "p";
      fila[k] = { exp: e.exp, K: e.K, ask: e.ask, bidEnt: e.bid, dte: e.dte, dist: e.distReal, bidSal: bid, ret: bid / e.ask - 1, peaje: 1 - e.bid / e.ask };
    }
    if (!algo) { sinContrato++; continue; }
    ok++; filas.push(fila);
  }
  censo.push({ ticker, dias: ds.length, ok, sinCierre, sinContrato, sinSalida });
}

console.log(`filas ${filas.length} · tickers ${new Set(filas.map(f=>f.ticker)).size} · días ${new Set(filas.map(f=>f.ymd)).size}`);
const conC = filas.filter(f=>f.c), conP = filas.filter(f=>f.p);
console.log(`con CALL ${conC.length} · con PUT ${conP.length}`);
console.log(`retorno medio CALL ${(media(conC.map(f=>f.c.ret))*100).toFixed(2)}% · PUT ${(media(conP.map(f=>f.p.ret))*100).toFixed(2)}%`);
console.log(`peaje medio (horquilla/ask) CALL ${(media(conC.map(f=>f.c.peaje))*100).toFixed(2)}% · PUT ${(media(conP.map(f=>f.p.peaje))*100).toFixed(2)}%`);
console.log(`prima media por contrato CALL $${fmt(media(conC.map(f=>f.c.ask))*100)} · PUT $${fmt(media(conP.map(f=>f.p.ask))*100)}`);
console.log(`dte medio ${media(conC.map(f=>f.c.dte)).toFixed(1)} · hold real medio ${media(filas.map(f=>f.holdReal)).toFixed(1)} días`);
console.log(`distancia real media CALL ${(media(conC.map(f=>f.c.dist))*100).toFixed(2)}% · PUT ${(media(conP.map(f=>f.p.dist))*100).toFixed(2)}%`);
console.log("\nCENSO por ticker (dias / usables / sin cierre / sin contrato / sin salida):");
for (const c of censo) console.log(`  ${c.ticker.padEnd(6)} ${String(c.dias).padStart(3)} ${String(c.ok).padStart(4)} ${String(c.sinCierre).padStart(4)} ${String(c.sinContrato).padStart(4)} ${String(c.sinSalida).padStart(4)}`);
writeFileSync("scripts/esquina-1-rejilla.json", JSON.stringify({ censo, filas }), "utf8");
console.log("\nescrito scripts/esquina-1-rejilla.json");
