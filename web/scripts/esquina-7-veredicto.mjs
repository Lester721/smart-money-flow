// ESQUINA · PASO 7 — QUE ES REALMENTE Y CUANTO VALE.
//
// Lo medido: los 5 tickers con la prima al ask mas PUTERA (una pata) baten a la moneda comprando
// CALLS y pierden comprando PUTS, a los cinco plazos. Antes de llamarlo hallazgo hay que contestar
// cuatro cosas que pueden tumbarlo:
//   1. ¿es una senal sobre la ACCION o sobre la OPCION? Si predice la accion, el vehiculo barato
//      es la accion y la opcion solo apalanca.
//   2. ¿vive en los INDICES? SPX+SPXW+SPY+QQQ son el 30% de las elecciones.
//   3. ¿aguanta la RUPTURA del 2026-07-16, donde MarketSnack cambio su tuberia?
//   4. ¿cuantos dias de flujo harian falta para poder establecerlo?
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { elegirEsquina, bidSalida, cadena, dias, media, sd, nEfectiva, rng, fmt } from "./print-lib.mjs";
import { listonT } from "../lib/barreraHallazgos.ts";

const CDIR = "scripts/cache-theta/cadenas", CIER = "scripts/cache-theta/cierres";
const D0 = "20260422", D1 = "20260819";
const HOLDS = [5, 10, 16, 23];
const INDICES = new Set(["SPX", "SPXW", "SPY", "QQQ", "NDX"]);
const RUPTURA = "20260716";
const CUENTA = 56389;

const diasCad = new Map();
for (const f of readdirSync(CDIR)) {
  const m = f.match(/^([A-Z]+)_d(\d{8})\.json$/); if (!m) continue;
  if (m[2] < D0 || m[2] > D1) continue;
  if (!diasCad.has(m[1])) diasCad.set(m[1], []);
  diasCad.get(m[1]).push(m[2]);
}
const cc = new Map();
const cierre = (t, y) => {
  if (!cc.has(t)) cc.set(t, existsSync(`${CIER}/${t}.json`) ? JSON.parse(readFileSync(`${CIER}/${t}.json`, "utf8")) : {});
  const v = cc.get(t)[y]; return Number.isFinite(v) && v > 0 ? v : null;
};

const rej = [];
for (const [ticker, ds] of [...diasCad].sort()) {
  ds.sort();
  for (let i = 0; i < ds.length; i++) {
    const ymd = ds[i], S = cierre(ticker, ymd);
    if (!(S > 0)) continue;
    const cad = cadena(ticker, ymd);
    if (!cad) continue;
    const fila = { ticker, ymd, S, acc: {} };
    // retorno de la ACCION a cada plazo, con cierres reales
    for (const h of HOLDS) {
      let sal = null;
      for (let j = i + 1; j < ds.length; j++) { const d = dias(ymd, ds[j]); if (d >= h) { if (d <= h + 6) sal = ds[j]; break; } }
      if (!sal) continue;
      const S2 = cierre(ticker, sal);
      if (S2 > 0) fila.acc[h] = S2 / S - 1;
      fila[`sal${h}`] = sal;
    }
    let algo = false;
    for (const tipo of ["C", "P"]) {
      const e = elegirEsquina(cad, S, 90, 0.05, tipo, ymd, 25, 0.30);
      if (!e) continue;
      const k = tipo === "C" ? "c" : "p";
      fila[k] = { exp: e.exp, K: e.K, ask: e.ask, bidEnt: e.bid, dte: e.dte, rets: {} };
      for (const h of HOLDS) {
        const sal = fila[`sal${h}`]; if (!sal) continue;
        const bid = bidSalida(ticker, sal, e.exp, tipo, e.K);
        if (bid === null) continue;
        fila[k].rets[h] = bid / e.ask - 1; algo = true;
      }
    }
    if (algo || Object.keys(fila.acc).length) rej.push(fila);
  }
}
const grid = new Map(rej.map((f) => [`${f.ticker}|${f.ymd}`, f]));

const sen = JSON.parse(readFileSync("scripts/esquina-2-senales.json", "utf8"));
const filas = [];
for (const s of sen) {
  const g = grid.get(`${s.ticker}|${s.ymd}`);
  if (!g || !Number.isFinite(s.desq)) continue;
  filas.push({ ticker: s.ticker, ymd: s.ymd, desq: s.desq, c: g.c ?? null, p: g.p ?? null, acc: g.acc });
}
const R = (f, der, h) => {
  if (der === "A") { const v = f.acc?.[h]; return Number.isFinite(v) ? v : null; }
  const o = der === "C" ? f.c : f.p; const v = o?.rets?.[h]; return Number.isFinite(v) ? v : null;
};
const eqT = (arr) => {
  const m = new Map();
  for (const o of arr) { if (!m.has(o.ticker)) m.set(o.ticker, []); m.get(o.ticker).push(o.v); }
  const vals = [...m.values()].map(media);
  return { eq: media(vals), t: vals.length >= 3 ? media(vals) / (sd(vals) / Math.sqrt(vals.length)) : 0, nT: vals.length };
};

/** Corre la regla sobre un subconjunto de filas. k=5, desq mas bajo. */
function regla(sub, der, h, k = 5) {
  const dsT = [...new Set(sub.map((f) => f.ymd))].sort();
  const ops = [];
  for (const d of dsT) {
    const cand = sub.filter((f) => f.ymd === d && R(f, der, h) != null);
    if (cand.length < 12) continue;
    const mDia = media(cand.map((r) => R(r, der, h)));
    const ord = [...cand].sort((a, b) => a.desq - b.desq);
    for (const r of ord.slice(0, k)) ops.push({ ticker: r.ticker, ymd: d, v: R(r, der, h) - mDia, ret: R(r, der, h), ask: der === "C" ? r.c?.ask : r.p?.ask });
  }
  if (ops.length < 40) return null;
  const e = eqT(ops), nef = nEfectiva(ops.map((o) => ({ ticker: o.ticker, fechaY: o.ymd })), h);
  return { ...e, n: ops.length, nef: nef.porTicker, ventanas: nef.ventanas, bruto: media(ops.map((o) => o.ret)),
           prima: media(ops.map((o) => o.ask).filter(Number.isFinite)) * 100, ops };
}

console.log("=== 1. ¿SENAL SOBRE LA ACCION O SOBRE LA OPCION? ===");
console.log("    'A' = comprar la ACCION del ticker elegido. Mismo dia, mismo plazo, mismo control.\n");
const acc = [];
for (const h of HOLDS) {
  const a = regla(filas, "A", h), c = regla(filas, "C", h), p = regla(filas, "P", h);
  acc.push({ h, accion: a?.eq, tA: a?.t, call: c?.eq, tC: c?.t, put: p?.eq, tP: p?.t });
  console.log(`  h=${String(h).padStart(2)}d  ACCION ${(a.eq*100).toFixed(2).padStart(6)}% t=${a.t.toFixed(2).padStart(5)}   ·   CALL ${(c.eq*100).toFixed(2).padStart(6)}% t=${c.t.toFixed(2).padStart(5)}   ·   PUT ${(p.eq*100).toFixed(2).padStart(6)}% t=${p.t.toFixed(2).padStart(5)}   ·   apalancamiento call/accion x${(c.eq/a.eq).toFixed(1)}`);
}

console.log("\n=== 2. ¿VIVE EN LOS INDICES? (fuera SPX, SPXW, SPY, QQQ, NDX) ===");
const soloAcciones = filas.filter((f) => !INDICES.has(f.ticker));
const idx = [];
for (const h of HOLDS) {
  const c = regla(soloAcciones, "C", h), p = regla(soloAcciones, "P", h), a = regla(soloAcciones, "A", h);
  idx.push({ h, call: c?.eq, tC: c?.t, put: p?.eq, tP: p?.t, accion: a?.eq, tA: a?.t, nT: c?.nT });
  console.log(`  h=${String(h).padStart(2)}d  sin indices (${c.nT} activos): CALL ${(c.eq*100).toFixed(2).padStart(6)}% t=${c.t.toFixed(2).padStart(5)}  ·  PUT ${(p.eq*100).toFixed(2).padStart(6)}% t=${p.t.toFixed(2).padStart(5)}  ·  ACCION ${(a.eq*100).toFixed(2).padStart(6)}% t=${a.t.toFixed(2).padStart(5)}`);
}

console.log("\n=== 3. LA RUPTURA DEL 2026-07-16 (MarketSnack cambio su tuberia ahi) ===");
const antes = filas.filter((f) => f.ymd < RUPTURA), despues = filas.filter((f) => f.ymd >= RUPTURA);
const rup = [];
for (const h of [5, 10]) {
  for (const der of ["C", "P", "A"]) {
    const a = regla(antes, der, h), b = regla(despues, der, h);
    rup.push({ h, der, antes: a?.eq, tAntes: a?.t, nAntes: a?.n, despues: b?.eq, tDespues: b?.t, nDespues: b?.n });
    console.log(`  h=${h}d ${der}: antes ${a ? (a.eq*100).toFixed(2).padStart(6)+"% (n="+a.n+", t="+a.t.toFixed(2)+")" : "sin muestra"}   ·   despues ${b ? (b.eq*100).toFixed(2).padStart(6)+"% (n="+b.n+", t="+b.t.toFixed(2)+")" : "sin muestra"}`);
  }
}

console.log("\n=== 4. EL DINERO, y cuantos dias faltan ===");
const LISTON = listonT(162);
const dinero = [];
for (const h of HOLDS) {
  const c = regla(filas, "C", h);
  const ciclos = 365 / h;
  const contratos = Math.max(1, Math.round(5639 / c.prima));
  const capital = contratos * c.prima;
  // dias que faltan: t crece con la raiz de las VENTANAS independientes
  const factor = (LISTON / Math.abs(c.t)) ** 2;
  const diasFlujo = Math.ceil(66 * factor);            // dias de bolsa de flujo
  dinero.push({ h, exceso: c.eq, t: c.t, prima: c.prima, contratos, capital, ciclos,
    dolares: c.eq * capital * ciclos, brutoDolares: c.bruto * capital * ciclos,
    pctCuenta: (c.eq * capital * ciclos) / CUENTA, ventanas: c.ventanas, nef: c.nef,
    factor, diasFlujo, diasQueFaltan: diasFlujo - 66 });
  console.log(`  h=${String(h).padStart(2)}d: exceso ${(c.eq*100).toFixed(2)}%/op sobre la prima · prima $${fmt(c.prima)}/contrato · ${contratos} contrato(s) = $${fmt(capital)} comprometidos`);
  console.log(`         ${ciclos.toFixed(1)} ciclos/ano -> exceso $${fmt(c.eq*capital*ciclos)}/ano (bruto $${fmt(c.bruto*capital*ciclos)}/ano, ${(c.bruto*capital*ciclos/CUENTA*100).toFixed(1)}% de la cuenta)`);
  console.log(`         t=${c.t.toFixed(2)} contra un liston de ${LISTON} -> hacen falta x${factor.toFixed(1)} de muestra = ${diasFlujo} dias de bolsa de flujo, o sea ${diasFlujo-66} dias MAS (${((diasFlujo-66)/21).toFixed(0)} meses)`);
}

writeFileSync("scripts/esquina-7-veredicto.json", JSON.stringify({ liston: LISTON, acc, idx, rup, dinero }), "utf8");
console.log("\nescrito scripts/esquina-7-veredicto.json");
