// ESQUINA · PASO 4 — LA MISMA PREGUNTA, PERO CON LA BARRERA PUESTA Y EL SORTEO CORRIENDO.
//
// El barrido del paso 3 dejó arriba a `ivFlujo` con exceso +24% y t=4,10. No vale: SNDK era el
// 22% de las operaciones y los tres tercios daban 91 / 36 / -54. Aquí:
//   · el estimador principal se EQUIPONDERA POR TICKER (media de medias), que es lo que impide
//     que un activo mande;
//   · la t se calcula sobre las medias por ticker (n = nº de activos), que es el número honesto
//     con 66 días solapados;
//   · y el sorteo se corre de verdad: 500 réplicas con la misma estructura.
import { readFileSync, writeFileSync } from "node:fs";
import { rng, media, sd, nEfectiva, fmt } from "./print-lib.mjs";
import { listonT } from "../lib/barreraHallazgos.ts";

const SORTEOS = 500;
const rej = JSON.parse(readFileSync("scripts/esquina-1-rejilla.json", "utf8"));
const sen = JSON.parse(readFileSync("scripts/esquina-2-senales.json", "utf8"));
const grid = new Map(rej.filas.map((f) => [`${f.ticker}|${f.ymd}`, f]));

const filas = [];
for (const s of sen) {
  const g = grid.get(`${s.ticker}|${s.ymd}`);
  if (!g) continue;
  filas.push({ ...s, retC: g.c ? g.c.ret : null, retP: g.p ? g.p.ret : null,
               askC: g.c ? g.c.ask : null, askP: g.p ? g.p.ask : null });
}
const dias = [...new Set(filas.map((f) => f.ymd))].sort();
const porDia = new Map(dias.map((d) => [d, filas.filter((f) => f.ymd === d)]));

const SENALES = [
  { id: "desq",     f: (r) => r.desq },
  { id: "desqRel",  f: (r) => r.desqRel },
  { id: "desq1M",   f: (r) => r.desq1M },
  { id: "desqNeto", f: (r) => r.desqNeto },
  { id: "urgencia", f: (r) => r.urgencia },
  { id: "inusual",  f: (r) => r.inusual },
  { id: "score",    f: (r) => r.score },
  { id: "ivFlujo",  f: (r) => r.ivFlujo },
  { id: "prima",    f: (r) => r.prima },
];
const KS = [1, 3, 5];
const N_PRUEBAS = SENALES.length * KS.length * 3 * 2;
const LISTON = listonT(N_PRUEBAS);

const ret = (r, d) => (d === "C" ? r.retC : r.retP);
const ask = (r, d) => (d === "C" ? r.askC : r.askP);
const mediana = (v) => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

// modo "DIR": el pivote es la MEDIANA DEL DIA, no el cero — si no, una señal siempre positiva
// como ivFlujo "decide" comprar calls siempre y el modo direccional no mide nada.
function correr(sig, k, modo, alto) {
  const ops = [];
  for (const d of dias) {
    const cand = porDia.get(d).filter((r) => Number.isFinite(sig.f(r)));
    if (cand.length < 8) continue;
    const med = mediana(cand.map(sig.f));
    const ord = [...cand].sort((a, b) => (alto ? sig.f(b) - sig.f(a) : sig.f(a) - sig.f(b)));
    for (const r of ord.slice(0, k)) {
      const der = modo === "DIR" ? ((sig.f(r) >= med) === alto ? "C" : "P") : modo;
      const v = ret(r, der);
      if (!Number.isFinite(v)) continue;
      const pool = cand.filter((x) => Number.isFinite(ret(x, der)));
      if (pool.length < 8) continue;
      ops.push({ ymd: d, ticker: r.ticker, der, ret: v, ask: ask(r, der), moneda: media(pool.map((x) => ret(x, der))) });
    }
  }
  return ops;
}

// Media de medias por activo. Ningún ticker manda por tener más filas.
function equipo(ops) {
  const m = new Map();
  for (const o of ops) { if (!m.has(o.ticker)) m.set(o.ticker, []); m.get(o.ticker).push(o.ret - o.moneda); }
  const porT = [...m].map(([t, v]) => ({ t, n: v.length, m: media(v) }));
  const vals = porT.map((x) => x.m);
  return { porT, eq: media(vals), tEq: vals.length >= 3 ? media(vals) / (sd(vals) / Math.sqrt(vals.length)) : 0, nT: vals.length };
}

// 500 réplicas: mismo día, mismo derecho, TICKER SORTEADO.
function sortear(ops, semilla) {
  const R = rng(semilla), out = [];
  const pools = new Map();
  for (const o of ops) {
    const k = `${o.ymd}|${o.der}`;
    if (!pools.has(k)) pools.set(k, porDia.get(o.ymd).filter((x) => Number.isFinite(ret(x, o.der))));
  }
  for (let s = 0; s < SORTEOS; s++) {
    const rep = ops.map((o) => {
      const pool = pools.get(`${o.ymd}|${o.der}`);
      const p = pool[Math.floor(R() * pool.length)];
      return { ticker: p.ticker, ret: ret(p, o.der), moneda: o.moneda };
    });
    out.push(equipo(rep).eq);
  }
  out.sort((a, b) => a - b);
  return out;
}

const res = [];
for (const sig of SENALES) for (const k of KS) for (const modo of ["C", "P", "DIR"]) for (const alto of [true, false]) {
  const ops = correr(sig, k, modo, alto);
  if (ops.length < 60) continue;
  const e = equipo(ops);
  const ord = [...ops].sort((a, b) => a.ymd.localeCompare(b.ymd));
  const q = Math.floor(ord.length / 3);
  const ter = [0, 1, 2].map((i) => equipo(i < 2 ? ord.slice(i * q, (i + 1) * q) : ord.slice(2 * q)).eq);
  const cuenta = new Map(); for (const o of ops) cuenta.set(o.ticker, (cuenta.get(o.ticker) ?? 0) + 1);
  const may = [...cuenta].sort((a, b) => b[1] - a[1])[0];
  const nef = nEfectiva(ops.map((o) => ({ ticker: o.ticker, fechaY: o.ymd })), 23);
  const crudo = ops.map((o) => o.ret - o.moneda);
  res.push({ sig: sig.id, k, modo, alto, n: ops.length, nT: e.nT, nefTicker: nef.porTicker, ventanas: nef.ventanas,
    eq: e.eq, tEq: e.tEq, crudo: media(crudo), tCrudo: media(crudo) / (sd(crudo) / Math.sqrt(crudo.length)),
    bruto: media(ops.map((o) => o.ret)), moneda: media(ops.map((o) => o.moneda)),
    prima: media(ops.map((o) => o.ask)) * 100, mayor: may[0], mayorPct: may[1] / ops.length,
    tercios: ter, mismoSigno: ter.every((x) => Math.sign(x) === Math.sign(e.eq)) });
}

const cribado = res.filter((r) => r.mayorPct <= 0.20 && r.mismoSigno && r.nT >= 10);
cribado.sort((a, b) => Math.abs(b.tEq) - Math.abs(a.tEq));
res.sort((a, b) => Math.abs(b.tEq) - Math.abs(a.tEq));

const linea = (r) => `${r.sig.padEnd(9)} ${r.k} ${r.modo.padEnd(4)} ${r.alto ? "A" : "B"} ${String(r.n).padStart(4)} ${String(r.nT).padStart(3)} ${String(r.nefTicker).padStart(4)} ${(r.eq*100).toFixed(2).padStart(7)} ${r.tEq.toFixed(2).padStart(6)} ${(r.crudo*100).toFixed(2).padStart(7)} ${(r.bruto*100).toFixed(2).padStart(8)} ${(r.moneda*100).toFixed(2).padStart(8)}  ${(r.mayor+" "+(r.mayorPct*100).toFixed(0)+"%").padEnd(10)} ${r.tercios.map(x=>(x*100).toFixed(1).padStart(6)).join(" ")}${r.mismoSigno?" OK":""}`;

console.log(`liston de |t| con ${N_PRUEBAS} pruebas: ${LISTON}   ·   reglas corridas ${res.length}`);
console.log("\n=== TODO, ordenado por |t| equiponderada ===");
console.log("senal      k modo  alt   n  nT  nef  exc.eq%   t    crudo%  bruto%  moneda%  mayor      3 tercios");
for (const r of res.slice(0, 12)) console.log(linea(r));
console.log(`\n=== LO QUE PASA CONCENTRACION (<20%) + TERCIOS (mismo signo) ===  ${cribado.length} de ${res.length}`);
console.log("senal      k modo  alt   n  nT  nef  exc.eq%   t    crudo%  bruto%  moneda%  mayor      3 tercios");
for (const r of cribado.slice(0, 12)) console.log(linea(r));

console.log("\n=== CONTRA EL AZAR — 500 sorteos de ticker con las mismas reglas ===");
const conSorteo = [];
for (const r of cribado.slice(0, 6)) {
  const sig = SENALES.find((s) => s.id === r.sig);
  const ops = correr(sig, r.k, r.modo, r.alto);
  const dist = sortear(ops, 987654321 + r.k * 7 + r.sig.length);
  const p = (dist.filter((x) => Math.abs(x) >= Math.abs(r.eq)).length + 1) / (SORTEOS + 1);
  const ciclos = 365 / 23;
  const contratos = Math.max(1, Math.round(5639 / r.prima));
  const capital = contratos * r.prima;
  const dolares = r.eq * capital * ciclos;
  conSorteo.push({ sig: r.sig, k: r.k, modo: r.modo, alto: r.alto, eq: r.eq, tEq: r.tEq, n: r.n, nefTicker: r.nefTicker,
    azarMedia: media(dist), azarP05: dist[Math.floor(SORTEOS*0.05)], azarP95: dist[Math.floor(SORTEOS*0.95)], p,
    prima: r.prima, contratos, capital, dolares, ciclos });
  console.log(`${r.sig} k=${r.k} ${r.modo}${r.alto?"A":"B"}: senal ${(r.eq*100).toFixed(2)}%  ·  azar ${(media(dist)*100).toFixed(2)}% [p5 ${(dist[25]*100).toFixed(2)}, p95 ${(dist[475]*100).toFixed(2)}]  ·  p=${p.toFixed(4)}  ·  ${contratos} contrato(s) $${fmt(capital)} -> $${fmt(dolares)}/ano`);
}
writeFileSync("scripts/esquina-4-barrera.json", JSON.stringify({ liston: LISTON, nPruebas: N_PRUEBAS, res, conSorteo }), "utf8");
console.log("\nescrito scripts/esquina-4-barrera.json");
