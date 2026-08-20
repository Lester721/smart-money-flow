// ESQUINA · PASO 3 — ¿ELIGE MARKETSNACK MEJOR QUE EL AZAR DENTRO DE LA ESQUINA BARATA?
//
// LA PREGUNTA, exacta: fijado el vehículo (5% fuera, ~90 días, salir a los ~23) y fijado el
// DERECHO (call o put), ¿el TICKER que elige la señal bate al ticker sorteado?
// Fijar el derecho es lo que impide que el resultado sea "en esta ventana subió el mercado".
//
// LA MONEDA tiene dos formas y se dan las dos:
//   · analítica  → la media de TODOS los tickers elegibles ese día (el valor esperado de un sorteo)
//   · empírica   → 500 réplicas sorteando el ticker con las MISMAS reglas y la misma estructura
//                  de solapamiento, para que el p-valor no dependa de una t con días solapados.
import { readFileSync, writeFileSync } from "node:fs";
import { rng, media, sd, nEfectiva, fmt } from "./print-lib.mjs";
import { listonT } from "../lib/barreraHallazgos.ts";
import { radiografia } from "../lib/radiografia.ts";

const CUENTA = 56389, SORTEOS = 500;
const rej = JSON.parse(readFileSync("scripts/esquina-1-rejilla.json", "utf8"));
const sen = JSON.parse(readFileSync("scripts/esquina-2-senales.json", "utf8"));

const grid = new Map(rej.filas.map((f) => [`${f.ticker}|${f.ymd}`, f]));
const filas = [];
for (const s of sen) {
  const g = grid.get(`${s.ticker}|${s.ymd}`);
  if (!g) continue;
  filas.push({ ...s, retC: g.c ? g.c.ret : null, retP: g.p ? g.p.ret : null,
               askC: g.c ? g.c.ask : null, askP: g.p ? g.p.ask : null, salida: g.salida });
}
radiografia(filas, ["desq", "desqNeto", "urgencia", "score", "ivFlujo", "inusual", "prima", "nOps"], "señales de la esquina");

const dias = [...new Set(filas.map((f) => f.ymd))].sort();
const porDia = new Map(dias.map((d) => [d, filas.filter((f) => f.ymd === d)]));

// ── SEÑALES CANDIDATAS ────────────────────────────────────────────────────────────────────────
// `dir:true` = la señal también decide call/put por su signo; entonces el control sortea el
// ticker pero mantiene el MISMO derecho, para aislar la elección de activo.
const SENALES = [
  { id: "desq",     f: (r) => r.desq,     nota: "desequilibrio de prima al ask, una pata" },
  { id: "desqRel",  f: (r) => r.desqRel,  nota: "el desequilibrio contra su propia media de 20 días" },
  { id: "desq1M",   f: (r) => r.desq1M,   nota: "sólo prints de ≥$1M" },
  { id: "desqNeto", f: (r) => r.desqNeto, nota: "ask menos bid sobre toda la prima" },
  { id: "urgencia", f: (r) => r.urgencia, nota: "% de la prima que entra al ask" },
  { id: "inusual",  f: (r) => r.inusual,  nota: "prima de hoy / mediana de sus 20 días previos" },
  { id: "score",    f: (r) => r.score,    nota: "el score propio de MarketSnack" },
  { id: "ivFlujo",  f: (r) => r.ivFlujo,  nota: "IV media ponderada por prima" },
  { id: "prima",    f: (r) => r.prima,    nota: "prima total del día" },
];
const KS = [1, 3, 5];
const N_PRUEBAS = SENALES.length * KS.length * 3 * 2;   // señal × k × {call,put,direccional} × {alto,bajo}
const LISTON = listonT(N_PRUEBAS);

/** Retorno del derecho pedido. */
const ret = (r, d) => (d === "C" ? r.retC : r.retP);
const ask = (r, d) => (d === "C" ? r.askC : r.askP);

/**
 * Corre una regla. `modo` = "C" | "P" | "DIR" (el signo de la señal elige el derecho).
 * `alto` = se compran los k de señal más ALTA (si no, los más BAJA).
 * Devuelve las operaciones y, para cada una, la moneda analítica de ese día y ese derecho.
 */
function correr(sig, k, modo, alto) {
  const ops = [];
  for (const d of dias) {
    const cand = porDia.get(d).filter((r) => Number.isFinite(sig.f(r)));
    if (cand.length < 8) continue;                       // sin plaza no hay elección que medir
    const ord = [...cand].sort((a, b) => (alto ? sig.f(b) - sig.f(a) : sig.f(a) - sig.f(b)));
    for (const r of ord.slice(0, k)) {
      const der = modo === "DIR" ? ((sig.f(r) >= 0) === alto ? "C" : "P") : modo;
      const v = ret(r, der);
      if (!Number.isFinite(v)) continue;
      const pool = cand.filter((x) => Number.isFinite(ret(x, der)));
      if (pool.length < 8) continue;
      ops.push({ ymd: d, ticker: r.ticker, der, ret: v, ask: ask(r, der),
                 moneda: media(pool.map((x) => ret(x, der))), nPool: pool.length });
    }
  }
  return ops;
}

/** 500 réplicas sorteando el ticker con la misma estructura: mismos días, mismo k, mismo derecho. */
function sortear(ops, semilla) {
  const R = rng(semilla);
  const out = [];
  for (let s = 0; s < SORTEOS; s++) {
    const ex = [];
    for (const o of ops) {
      const pool = porDia.get(o.ymd).filter((x) => Number.isFinite(ret(x, o.der)));
      const p = pool[Math.floor(R() * pool.length)];
      ex.push(ret(p, o.der) - o.moneda);
    }
    out.push(media(ex));
  }
  out.sort((a, b) => a - b);
  return out;
}

const resultados = [];
for (const sig of SENALES) for (const k of KS) for (const modo of ["C", "P", "DIR"]) for (const alto of [true, false]) {
  const ops = correr(sig, k, modo, alto);
  if (ops.length < 60) continue;
  const ex = ops.map((o) => o.ret - o.moneda);
  const m = media(ex), t = m / (sd(ex) / Math.sqrt(ex.length));
  const nef = nEfectiva(ops.map((o) => ({ ticker: o.ticker, fechaY: o.ymd })), 23);
  const cuenta = new Map(); for (const o of ops) cuenta.set(o.ticker, (cuenta.get(o.ticker) ?? 0) + 1);
  const may = [...cuenta].sort((a, b) => b[1] - a[1])[0];
  // tercios de tiempo
  const ord = [...ops].sort((a, b) => a.ymd.localeCompare(b.ymd));
  const q = Math.floor(ord.length / 3);
  const ter = [0, 1, 2].map((i) => media((i < 2 ? ord.slice(i * q, (i + 1) * q) : ord.slice(2 * q)).map((o) => o.ret - o.moneda)));
  resultados.push({ sig: sig.id, k, modo, alto, n: ops.length, nefTicker: nef.porTicker, ventanas: nef.ventanas,
    exceso: m, t, bruto: media(ops.map((o) => o.ret)), moneda: media(ops.map((o) => o.moneda)),
    primaMedia: media(ops.map((o) => o.ask)) * 100,
    mayor: may[0], mayorPct: may[1] / ops.length,
    tercios: ter, mismoSigno: ter.every((x) => Math.sign(x) === Math.sign(m)) });
}

resultados.sort((a, b) => b.t - a.t);
console.log(`listón de |t| con ${N_PRUEBAS} pruebas (Bonferroni): ${LISTON}`);
console.log(`plaza: ${filas.length} ticker-día · ${dias.length} días · ${new Set(filas.map(f=>f.ticker)).size} tickers\n`);
console.log("señal      k modo  alt   n  nef  exceso%   t     bruto%  moneda%  mayor      3 tercios");
for (const r of resultados.slice(0, 22))
  console.log(`${r.sig.padEnd(9)} ${r.k} ${r.modo.padEnd(4)} ${r.alto ? "↑" : "↓"} ${String(r.n).padStart(4)} ${String(r.nefTicker).padStart(4)} ${(r.exceso*100).toFixed(2).padStart(7)} ${r.t.toFixed(2).padStart(6)} ${(r.bruto*100).toFixed(2).padStart(8)} ${(r.moneda*100).toFixed(2).padStart(8)}  ${(r.mayor+" "+(r.mayorPct*100).toFixed(0)+"%").padEnd(10)} ${r.tercios.map(x=>(x*100).toFixed(1).padStart(6)).join(" ")}${r.mismoSigno?"  ✓":""}`);
console.log("  ...");
for (const r of resultados.slice(-6))
  console.log(`${r.sig.padEnd(9)} ${r.k} ${r.modo.padEnd(4)} ${r.alto ? "↑" : "↓"} ${String(r.n).padStart(4)} ${String(r.nefTicker).padStart(4)} ${(r.exceso*100).toFixed(2).padStart(7)} ${r.t.toFixed(2).padStart(6)} ${(r.bruto*100).toFixed(2).padStart(8)} ${(r.moneda*100).toFixed(2).padStart(8)}  ${(r.mayor+" "+(r.mayorPct*100).toFixed(0)+"%").padEnd(10)} ${r.tercios.map(x=>(x*100).toFixed(1).padStart(6)).join(" ")}${r.mismoSigno?"  ✓":""}`);

writeFileSync("scripts/esquina-3-veredicto.json", JSON.stringify({ liston: LISTON, nPruebas: N_PRUEBAS, resultados }), "utf8");
console.log("\nescrito scripts/esquina-3-veredicto.json");
