// AUDITORÍA DEL DATO ANTES DE CREERSE EL RESULTADO.
//
// El retrato dice que el cóndor PIERDE −$16.354/año en 2022-23 y GANA +$18.770/año en 2024-26.
// Eso es demasiado grande para aceptarlo sin mirar de qué está hecha la cadena de 2022:
//   1. ¿Los strikes están a 5 puntos cerca del dinero, o la rejilla era más gruesa y el "corto
//      a +25" cayó a +40? Un strike mal colocado cambia la posición, no el mercado.
//   2. ¿El ala está de verdad a 50 puntos, o el fichero no llega y se compró a 100?
//   3. ¿La horquilla de 2022 es tan ancha que el crédito es peaje y no prima?
//   4. ¿Hay días con bid = 0 en las patas vendidas (sin mercado) colados como operables?

import { readFileSync } from "node:fs";
const dias = JSON.parse(readFileSync("scripts/mal-dias.json", "utf8")).sort((a, b) => a.fecha.localeCompare(b.fecha));
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };
const n2 = (x) => (x == null || !isFinite(x) ? "—" : x.toFixed(2));

for (const d of dias) {
  d.ano = d.fecha.slice(0, 4);
  d.distC = d.kcC - d.sp11;          // a cuántos puntos quedó el corto de call (ideal +25)
  d.distP = d.sp11 - d.kpC;          // ideal +25
  d.errC = Math.abs(d.distC - 25);
  d.errP = Math.abs(d.distP - 25);
  d.anchoC = d.kcL - d.kcC;
  d.anchoP = d.kpC - d.kpL;
  d.bidCeroC = d.bidC === 0 ? 1 : 0;
  d.bidCeroP = d.bidP === 0 ? 1 : 0;
}

console.log("\n====== A · ¿DÓNDE CAYERON DE VERDAD LOS STRIKES? ======\n");
console.log("| año | días | dist. corto CALL (p50) | error vs 25 (p50) | error (p95) | dist. corto PUT (p50) | error (p50) | error (p95) | ancho ala C (p50) | ancho ala P (p50) | alas != 50 |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const a of ["2022", "2023", "2024", "2025", "2026"]) {
  const g = dias.filter((d) => d.ano === a);
  const raras = g.filter((d) => d.anchoC !== 50 || d.anchoP !== 50).length;
  console.log(`| ${a} | ${g.length} | ${n2(pct(g.map((x) => x.distC), 0.5))} | ${n2(pct(g.map((x) => x.errC), 0.5))} | ${n2(pct(g.map((x) => x.errC), 0.95))} | ${n2(pct(g.map((x) => x.distP), 0.5))} | ${n2(pct(g.map((x) => x.errP), 0.5))} | ${n2(pct(g.map((x) => x.errP), 0.95))} | ${n2(pct(g.map((x) => x.anchoC), 0.5))} | ${n2(pct(g.map((x) => x.anchoP), 0.5))} | ${raras} |`);
}

console.log("\n====== B · EL CRÉDITO Y LA HORQUILLA ======\n");
console.log("| año | crédito p50 | crédito p10 | crédito p90 | bid corto CALL p50 | bid corto PUT p50 | ask ala C p50 | ask ala P p50 | bid=0 en corto C | bid=0 en corto P |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const a of ["2022", "2023", "2024", "2025", "2026"]) {
  const g = dias.filter((d) => d.ano === a);
  console.log(`| ${a} | ${n2(pct(g.map((x) => x.credito), 0.5))} | ${n2(pct(g.map((x) => x.credito), 0.1))} | ${n2(pct(g.map((x) => x.credito), 0.9))} | ${n2(pct(g.map((x) => x.bidC), 0.5))} | ${n2(pct(g.map((x) => x.bidP), 0.5))} | ${n2(pct(g.map((x) => x.askCL), 0.5))} | ${n2(pct(g.map((x) => x.askPL), 0.5))} | ${g.reduce((s, x) => s + x.bidCeroC, 0)} | ${g.reduce((s, x) => s + x.bidCeroP, 0)} |`);
}

console.log("\n====== C · ¿EL 2022 ES UN MERCADO O UN FICHERO? · densidad de la cadena ======\n");
// se vuelve a abrir el CSV para contar strikes distintos a las 11:00 y el paso cerca del dinero
import { existsSync } from "node:fs";
const DIR = "scripts/cache-theta/gex-2026";
function densidad(fecha) {
  const f = `${DIR}/iv_${fecha}_C.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").split("\n");
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const iK = cab.indexOf("strike"), iT = cab.indexOf("timestamp"), iB = cab.indexOf("bid"), iA = cab.indexOf("ask"), iU = cab.indexOf("underlying_price");
  const ks = [], conQuote = [];
  let spot = 0;
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    if (String(c[iT]).slice(11, 16) !== "11:00") continue;
    const K = +c[iK]; if (!(K > 0)) continue;
    ks.push(K);
    if (+c[iA] > 0) conQuote.push(K);
    if (+c[iU] > 0) spot = +c[iU];
  }
  if (!ks.length || !spot) return null;
  const cerca = [...new Set(conQuote.filter((k) => Math.abs(k - spot) <= 100))].sort((a, b) => a - b);
  let paso = null;
  if (cerca.length > 2) { const ds = []; for (let i = 1; i < cerca.length; i++) ds.push(cerca[i] - cerca[i - 1]); paso = pct(ds, 0.5); }
  return { nStrikes: new Set(ks).size, nQuote: new Set(conQuote).size, paso, cercaN: cerca.length, spot };
}
console.log("| fecha | strikes a las 11:00 | con ask>0 | paso mediano a ±100 pts | strikes usables a ±100 |");
console.log("|---|---|---|---|---|");
for (const f of ["2022-01-03", "2022-03-14", "2022-06-28", "2022-09-02", "2022-12-15",
                 "2023-03-09", "2023-06-15", "2023-12-20", "2024-04-04", "2025-01-31", "2026-06-05", "2026-08-10"]) {
  const d = densidad(f);
  console.log(d ? `| ${f} | ${d.nStrikes} | ${d.nQuote} | ${d.paso} | ${d.cercaN} |` : `| ${f} | SIN DATO |`);
}

console.log("\n====== D · ¿EL RESULTADO DE 2022-23 VIVE EN UNOS POCOS DÍAS? ======\n");
const A = dias.filter((d) => d.fecha < "2024-01-01");
const B = dias.filter((d) => d.fecha >= "2024-01-01");
for (const [nom, g] of [["2022-23", A], ["2024-26", B]]) {
  const orden = [...g].sort((x, y) => x.pl - y.pl);
  const tot = g.reduce((s, x) => s + x.pl, 0);
  for (const k of [1, 3, 5, 10, 20]) {
    const sinPeores = tot - orden.slice(0, k).reduce((s, x) => s + x.pl, 0);
    console.log(`  ${nom}: total $${Math.round(tot)} · quitando los ${String(k).padStart(2)} peores días → $${Math.round(sinPeores)}  (${Math.round(sinPeores / (g.length / 252))}/año)`);
  }
  console.log("");
}

console.log("====== E · MITADES DE CADA PERÍODO — ¿es el período o es un trozo? ======\n");
console.log("| tramo | días | P&L | $/año | TOPE | % ganados |");
console.log("|---|---|---|---|---|---|");
const tramos = [["2022 S1", "2022-01-01", "2022-07-01"], ["2022 S2", "2022-07-01", "2023-01-01"],
                ["2023 S1", "2023-01-01", "2023-07-01"], ["2023 S2", "2023-07-01", "2024-01-01"],
                ["2024 S1", "2024-01-01", "2024-07-01"], ["2024 S2", "2024-07-01", "2025-01-01"],
                ["2025 S1", "2025-01-01", "2025-07-01"], ["2025 S2", "2025-07-01", "2026-01-01"],
                ["2026 S1", "2026-01-01", "2026-07-01"], ["2026 S2", "2026-07-01", "2027-01-01"]];
for (const [nom, i, f] of tramos) {
  const g = dias.filter((d) => d.fecha >= i && d.fecha < f);
  if (!g.length) continue;
  const tot = g.reduce((s, x) => s + x.pl, 0);
  const tope = g.filter((x) => Math.min(Math.max(x.cierre - x.kcC, 0), x.kcL - x.kcC) >= x.kcL - x.kcC - 0.001 || Math.min(Math.max(x.kpC - x.cierre, 0), x.kpC - x.kpL) >= x.kpC - x.kpL - 0.001).length;
  console.log(`| ${nom} | ${g.length} | $${Math.round(tot)} | $${Math.round(tot / (g.length / 252))} | ${tope} | ${((g.filter((x) => x.pl > 0).length / g.length) * 100).toFixed(0)}% |`);
}
