// ESQUINA · PASO 5 — ¿ES ELECCION O ES UN GUSTO FIJO POR CIERTOS ACTIVOS?
//
// Lo que salio del paso 4: los 5 tickers con el desequilibrio de prima MAS PUTERO (mas prima al
// ask en puts que en calls, una pata) dan +18,9 puntos comprando CALLS y -10,0 comprando PUTS.
// Los dos lados dicen lo mismo, que es mas dificil de conseguir por casualidad que uno solo.
//
// Pero hay dos explicaciones y solo una sirve:
//   (A) ELECCION: la senal dice CUANDO un ticker esta barato/caro. Sirve.
//   (B) GUSTO FIJO: la senal siempre senala a los mismos activos, y esos activos lo hicieron bien
//       en estos 3 meses. NO sirve — es una apuesta de 4 ventanas independientes disfrazada.
//
// Se separan restando tambien la media DEL PROPIO TICKER (efecto fijo por activo). Si el exceso
// sobrevive a la doble resta, es eleccion. Si se evapora, era gusto fijo.
//
// Y ademas: si es una senal de verdad, tiene que ser MONOTONA por quintiles, no solo en la punta.
import { readFileSync, writeFileSync } from "node:fs";
import { rng, media, sd, nEfectiva, fmt } from "./print-lib.mjs";

const rej = JSON.parse(readFileSync("scripts/esquina-1-rejilla.json", "utf8"));
const sen = JSON.parse(readFileSync("scripts/esquina-2-senales.json", "utf8"));
const grid = new Map(rej.filas.map((f) => [`${f.ticker}|${f.ymd}`, f]));

const filas = [];
for (const s of sen) {
  const g = grid.get(`${s.ticker}|${s.ymd}`);
  if (!g || !Number.isFinite(s.desq)) continue;
  filas.push({ ticker: s.ticker, ymd: s.ymd, desq: s.desq, desqRel: s.desqRel,
               retC: g.c ? g.c.ret : null, retP: g.p ? g.p.ret : null,
               askC: g.c ? g.c.ask : null, askP: g.p ? g.p.ask : null });
}
const dias = [...new Set(filas.map((f) => f.ymd))].sort();
const porDia = new Map(dias.map((d) => [d, filas.filter((f) => f.ymd === d)]));
const ret = (r, d) => (d === "C" ? r.retC : r.retP);

// ── residuos: por dia (quita el mercado) y por dia+ticker (quita ademas el gusto fijo) ──
const media1 = new Map(), media2 = new Map();
for (const der of ["C", "P"]) {
  for (const d of dias) {
    const v = porDia.get(d).map((r) => ret(r, der)).filter(Number.isFinite);
    if (v.length >= 8) media1.set(`${d}|${der}`, media(v));
  }
  const porT = new Map();
  for (const f of filas) {
    const m1 = media1.get(`${f.ymd}|${der}`), v = ret(f, der);
    if (m1 == null || !Number.isFinite(v)) continue;
    if (!porT.has(f.ticker)) porT.set(f.ticker, []);
    porT.get(f.ticker).push(v - m1);
  }
  for (const [t, v] of porT) media2.set(`${t}|${der}`, media(v));
}
// exceso simple (vs la moneda del dia) y exceso doble (vs la moneda del dia Y la media del ticker)
const ex1 = (f, der) => { const m = media1.get(`${f.ymd}|${der}`), v = ret(f, der); return m == null || !Number.isFinite(v) ? null : v - m; };
const ex2 = (f, der) => { const a = ex1(f, der), b = media2.get(`${f.ticker}|${der}`); return a == null || b == null ? null : a - b; };

// ── 1. MONOTONIA por quintiles de desq, dentro de cada dia ──
console.log("=== 1. QUINTILES de desq DENTRO DEL DIA (Q1 = el mas putero, Q5 = el mas callero) ===");
console.log("      exceso vs la moneda del dia, equiponderado por ticker\n");
const cubos = { C: [[], [], [], [], []], P: [[], [], [], [], []] };
const cubos2 = { C: [[], [], [], [], []], P: [[], [], [], [], []] };
for (const d of dias) {
  const cand = porDia.get(d);
  if (cand.length < 15) continue;
  const ord = [...cand].sort((a, b) => a.desq - b.desq);
  for (let i = 0; i < ord.length; i++) {
    const q = Math.min(4, Math.floor((i / ord.length) * 5));
    for (const der of ["C", "P"]) {
      const a = ex1(ord[i], der), b = ex2(ord[i], der);
      if (a != null) cubos[der][q].push({ ticker: ord[i].ticker, ymd: d, v: a });
      if (b != null) cubos2[der][q].push({ ticker: ord[i].ticker, ymd: d, v: b });
    }
  }
}
const eqPorTicker = (arr) => {
  const m = new Map();
  for (const o of arr) { if (!m.has(o.ticker)) m.set(o.ticker, []); m.get(o.ticker).push(o.v); }
  const vals = [...m.values()].map(media);
  return { eq: media(vals), t: vals.length >= 3 ? media(vals) / (sd(vals) / Math.sqrt(vals.length)) : 0, nT: vals.length, n: arr.length };
};
const tabla = { simple: {}, doble: {} };
for (const der of ["C", "P"]) {
  const l1 = [], l2 = [];
  for (let q = 0; q < 5; q++) {
    const a = eqPorTicker(cubos[der][q]), b = eqPorTicker(cubos2[der][q]);
    l1.push(a); l2.push(b);
  }
  tabla.simple[der] = l1; tabla.doble[der] = l2;
  console.log(`  ${der === "C" ? "CALLS" : "PUTS "}  simple: ` + l1.map((x, i) => `Q${i+1} ${(x.eq*100).toFixed(1).padStart(6)}%`).join("  ") + `   Q1-Q5 = ${((l1[0].eq - l1[4].eq)*100).toFixed(1)} pts`);
  console.log(`         doble : ` + l2.map((x, i) => `Q${i+1} ${(x.eq*100).toFixed(1).padStart(6)}%`).join("  ") + `   Q1-Q5 = ${((l2[0].eq - l2[4].eq)*100).toFixed(1)} pts`);
  console.log(`         n por cubo ${l1.map(x=>x.n).join("/")}  ·  tickers ${l1.map(x=>x.nT).join("/")}`);
}

// ── 2. LA REGLA del paso 4, con y sin efecto fijo de ticker ──
console.log("\n=== 2. LA REGLA: los k tickers de desq MAS BAJO, comprar CALL ===");
const KS = [1, 3, 5, 8];
const reglas = [];
for (const k of KS) for (const der of ["C", "P"]) {
  const ops = [];
  for (const d of dias) {
    const cand = porDia.get(d).filter((r) => Number.isFinite(ret(r, der)));
    if (cand.length < 15) continue;
    const ord = [...cand].sort((a, b) => a.desq - b.desq);
    for (const r of ord.slice(0, k)) {
      const a = ex1(r, der), b = ex2(r, der);
      if (a == null || b == null) continue;
      ops.push({ ticker: r.ticker, ymd: d, v: a, v2: b, ret: ret(r, der), ask: der === "C" ? r.askC : r.askP });
    }
  }
  const s = eqPorTicker(ops);
  const dd = eqPorTicker(ops.map((o) => ({ ...o, v: o.v2 })));
  const nef = nEfectiva(ops.map((o) => ({ ticker: o.ticker, fechaY: o.ymd })), 23);
  const cuenta = new Map(); for (const o of ops) cuenta.set(o.ticker, (cuenta.get(o.ticker) ?? 0) + 1);
  const may = [...cuenta].sort((a, b) => b[1] - a[1]).slice(0, 4);
  reglas.push({ k, der, n: ops.length, nT: s.nT, nef: nef.porTicker, ventanas: nef.ventanas,
    simple: s.eq, tSimple: s.t, doble: dd.eq, tDoble: dd.t,
    bruto: media(ops.map((o) => o.ret)), prima: media(ops.map((o) => o.ask)) * 100,
    top: may.map(([t, n]) => `${t} ${(n/ops.length*100).toFixed(0)}%`) });
  console.log(`  k=${k} ${der}: n=${ops.length} nT=${s.nT} nef=${nef.porTicker} (${nef.ventanas} ventanas)  simple ${(s.eq*100).toFixed(2)}% t=${s.t.toFixed(2)}  ·  DOBLE ${(dd.eq*100).toFixed(2)}% t=${dd.t.toFixed(2)}  ·  bruto ${(media(ops.map(o=>o.ret))*100).toFixed(1)}%  ·  mas elegidos: ${may.map(([t,n])=>`${t} ${(n/ops.length*100).toFixed(0)}%`).join(" ")}`);
}

// ── 3. ¿la senal es estable en el tiempo dentro de un ticker? ──
console.log("\n=== 3. AUTOCORRELACION de desq: si es casi fija por ticker, no es una senal, es una etiqueta ===");
const porT = new Map();
for (const f of filas) { if (!porT.has(f.ticker)) porT.set(f.ticker, []); porT.get(f.ticker).push(f); }
let dentro = [], entre = [];
for (const [t, v] of porT) {
  v.sort((a, b) => a.ymd.localeCompare(b.ymd));
  const m = media(v.map((x) => x.desq));
  entre.push(m);
  for (const x of v) dentro.push(x.desq - m);
}
const varTotal = sd(filas.map((f) => f.desq)) ** 2;
console.log(`  varianza total de desq ${varTotal.toFixed(4)} · ENTRE tickers ${(sd(entre)**2).toFixed(4)} (${(sd(entre)**2/varTotal*100).toFixed(0)}%) · DENTRO de cada ticker ${(sd(dentro)**2).toFixed(4)} (${(sd(dentro)**2/varTotal*100).toFixed(0)}%)`);
console.log("  media de desq por ticker (los 8 mas puteros y los 8 mas calleros):");
const mt = [...porT].map(([t, v]) => [t, media(v.map((x) => x.desq)), v.length]).sort((a, b) => a[1] - b[1]);
console.log("    puteros : " + mt.slice(0, 8).map(([t, m]) => `${t} ${m.toFixed(2)}`).join("  "));
console.log("    calleros: " + mt.slice(-8).map(([t, m]) => `${t} ${m.toFixed(2)}`).join("  "));

writeFileSync("scripts/esquina-5-mecanismo.json", JSON.stringify({ tabla, reglas, mt }), "utf8");
console.log("\nescrito scripts/esquina-5-mecanismo.json");
