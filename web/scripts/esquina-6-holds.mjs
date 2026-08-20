// ESQUINA · PASO 6 — EL PROBLEMA NO ES LA SENAL, ES EL SOLAPAMIENTO.
//
// A 23 dias de plazo solo caben 5 ventanas independientes en 66 dias de bolsa. Con 5 ventanas no
// se establece nada por bueno que salga el numero. La salida es medir la MISMA senal con plazos
// mas cortos: a 7 dias caben 13 ventanas, a 14 caben 7. Si el efecto esta a los 7 y a los 14 y a
// los 23, es el mismo efecto visto tres veces con solapamientos distintos — y eso si es evidencia.
// Si solo aparece a 23, es la ventana.
//
// El vehiculo sigue siendo el mismo contrato (5% fuera, ~90 dias): solo cambia cuando se vende.
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { elegirEsquina, bidSalida, cadena, dias, media, sd, nEfectiva, rng, fmt } from "./print-lib.mjs";

const CDIR = "scripts/cache-theta/cadenas", CIER = "scripts/cache-theta/cierres";
const D0 = "20260422", D1 = "20260819";
const HOLDS = [5, 10, 16, 23, 30];
const SORTEOS = 500;

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

// ── rejilla multi-plazo: un solo recorrido de cadenas, todas las salidas a la vez ──
const rej = [];
for (const [ticker, ds] of [...diasCad].sort()) {
  ds.sort();
  for (let i = 0; i < ds.length; i++) {
    const ymd = ds[i], S = cierre(ticker, ymd);
    if (!(S > 0)) continue;
    const cad = cadena(ticker, ymd);
    if (!cad) continue;
    const fila = { ticker, ymd, S };
    let algo = false;
    for (const tipo of ["C", "P"]) {
      const e = elegirEsquina(cad, S, 90, 0.05, tipo, ymd, 25, 0.30);
      if (!e) continue;
      const k = tipo === "C" ? "c" : "p";
      fila[k] = { exp: e.exp, K: e.K, ask: e.ask, rets: {} };
      for (const h of HOLDS) {
        let sal = null;
        for (let j = i + 1; j < ds.length; j++) { const d = dias(ymd, ds[j]); if (d >= h) { if (d <= h + 6) sal = ds[j]; break; } }
        if (!sal) continue;
        const bid = bidSalida(ticker, sal, e.exp, tipo, e.K);
        if (bid === null) continue;
        fila[k].rets[h] = bid / e.ask - 1;
        algo = true;
      }
    }
    if (algo) rej.push(fila);
  }
}
const grid = new Map(rej.map((f) => [`${f.ticker}|${f.ymd}`, f]));

const sen = JSON.parse(readFileSync("scripts/esquina-2-senales.json", "utf8"));
const filas = [];
for (const s of sen) {
  const g = grid.get(`${s.ticker}|${s.ymd}`);
  if (!g || !Number.isFinite(s.desq)) continue;
  filas.push({ ticker: s.ticker, ymd: s.ymd, desq: s.desq, c: g.c ?? null, p: g.p ?? null });
}
const diasT = [...new Set(filas.map((f) => f.ymd))].sort();
const porDia = new Map(diasT.map((d) => [d, filas.filter((f) => f.ymd === d)]));
const R = (f, der, h) => { const o = der === "C" ? f.c : f.p; const v = o?.rets?.[h]; return Number.isFinite(v) ? v : null; };
const ASK = (f, der) => (der === "C" ? f.c?.ask : f.p?.ask);

const eqT = (arr) => {
  const m = new Map();
  for (const o of arr) { if (!m.has(o.ticker)) m.set(o.ticker, []); m.get(o.ticker).push(o.v); }
  const vals = [...m.values()].map(media);
  return { eq: media(vals), t: vals.length >= 3 ? media(vals) / (sd(vals) / Math.sqrt(vals.length)) : 0, nT: vals.length };
};

console.log("=== LA MISMA REGLA A CINCO PLAZOS: los k tickers de desq mas BAJO (mas putero) ===");
console.log("    exceso = retorno de la eleccion menos la media de TODOS los elegibles ese dia y ese derecho");
console.log("    equiponderado por ticker. Precios reales: compra al ask, venta al bid.\n");
const salida = [];
for (const h of HOLDS) {
  for (const der of ["C", "P"]) {
    for (const k of [3, 5]) {
      const ops = [];
      for (const d of diasT) {
        const cand = porDia.get(d).filter((r) => R(r, der, h) != null);
        if (cand.length < 15) continue;
        const mDia = media(cand.map((r) => R(r, der, h)));
        const ord = [...cand].sort((a, b) => a.desq - b.desq);
        for (const r of ord.slice(0, k)) ops.push({ ticker: r.ticker, ymd: d, v: R(r, der, h) - mDia, ret: R(r, der, h), ask: ASK(r, der) });
      }
      if (ops.length < 60) continue;
      const e = eqT(ops);
      const nef = nEfectiva(ops.map((o) => ({ ticker: o.ticker, fechaY: o.ymd })), h);
      const ord = [...ops].sort((a, b) => a.ymd.localeCompare(b.ymd));
      const q = Math.floor(ord.length / 3);
      const ter = [0, 1, 2].map((i) => eqT(i < 2 ? ord.slice(i * q, (i + 1) * q) : ord.slice(2 * q)).eq);
      // sorteo
      const rr = rng(20260820 + h * 31 + k);
      const dist = [];
      const pools = new Map();
      for (const d of diasT) pools.set(d, porDia.get(d).filter((r) => R(r, der, h) != null));
      for (let s = 0; s < SORTEOS; s++) {
        const rep = ops.map((o) => {
          const pool = pools.get(o.ymd), p = pool[Math.floor(rr() * pool.length)];
          const mDia = media(pool.map((x) => R(x, der, h)));
          return { ticker: p.ticker, v: R(p, der, h) - mDia };
        });
        dist.push(eqT(rep).eq);
      }
      dist.sort((a, b) => a - b);
      const pv = (dist.filter((x) => Math.abs(x) >= Math.abs(e.eq)).length + 1) / (SORTEOS + 1);
      const ciclos = 365 / h;
      const prima = media(ops.map((o) => o.ask)) * 100;
      const contratos = Math.max(1, Math.round(5639 / prima));
      const fila = { h, der, k, n: ops.length, nT: e.nT, nef: nef.porTicker, ventanas: nef.ventanas,
        eq: e.eq, t: e.t, bruto: media(ops.map((o) => o.ret)), pv, azar: media(dist),
        tercios: ter, mismoSigno: ter.every((x) => Math.sign(x) === Math.sign(e.eq)),
        prima, contratos, capital: contratos * prima, ciclos, dolares: e.eq * contratos * prima * ciclos };
      salida.push(fila);
      console.log(`  h=${String(h).padStart(2)}d ${der} k=${k}: n=${String(ops.length).padStart(3)} nT=${e.nT} nef=${String(nef.porTicker).padStart(3)} ventanas=${String(nef.ventanas).padStart(2)}  exc ${(e.eq*100).toFixed(2).padStart(7)}%  t=${e.t.toFixed(2).padStart(5)}  azar ${(media(dist)*100).toFixed(2).padStart(6)}%  p=${pv.toFixed(4)}  bruto ${(media(ops.map(o=>o.ret))*100).toFixed(1).padStart(6)}%  tercios ${ter.map(x=>(x*100).toFixed(1).padStart(6)).join(" ")}${fila.mismoSigno?" OK":""}  ->$${fmt(fila.dolares)}/ano`);
    }
  }
  console.log("");
}
writeFileSync("scripts/esquina-6-holds.json", JSON.stringify(salida), "utf8");
console.log("escrito scripts/esquina-6-holds.json");
