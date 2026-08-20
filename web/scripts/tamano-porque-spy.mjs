// ¿POR QUÉ SPY×10 GANA $64/DÍA MÁS QUE SPX? · el mecanismo, no la correlación
//
// SPY×10 y SPX son el MISMO trade: correlación día a día 0,984. Pero SPY×10 saca $64/día más,
// con t=9,85. Un trade idéntico no puede rendir distinto por azar; hay una diferencia mecánica.
//
// LA HIPÓTESIS: la horquilla. Ya sabemos que "la horquilla es un % de la PRIMA". SPY cotiza con
// un centavo de horquilla sobre una prima de ~$0,56; SPX cotiza con cinco centavos o más sobre
// una prima de ~$5,05. Si esa es la causa, al valorar LAS DOS al PUNTO MEDIO la diferencia
// tiene que desaparecer. Si no desaparece, la causa es otra y hay que buscarla.
//
// ⚠️ El punto medio NO es un resultado operable — aquí se usa SÓLO como bisturí para separar el
//    coste de ejecución del resto. Todo lo que se reporta como dinero sigue siendo bid/ask real.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/tamano-porque-spy.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { radiografia } from "../lib/radiografia.ts";

const HORA = "11:00", COMM = 0.03, PATAS = 8;
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const eur2 = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(x).toFixed(2);
const med = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const perc = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));
const tDe = (v) => { const m = med(v), s = Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); return m / (s / Math.sqrt(v.length)); };

// ── SPX: releer las cadenas guardando bid, ask Y punto medio de las cuatro patas ──────────────
const DIRX = "scripts/cache-theta/gex-2026";
function leerSPX(fecha, right) {
  const f = `${DIRX}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = ["strike", "timestamp", "bid", "ask", "underlying_price"].map((c) => cab.indexOf(c));
  if (idx.some((x) => x < 0)) throw new Error("faltan columnas en " + f);
  const [iK, iT, iB, iA, iU] = idx;
  const en = []; let spot = 0, cierre = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(","), h = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && h >= hFin) { hFin = h; cierre = sp; }
    if (h !== HORA) continue;
    if (sp > 0 && !spot) spot = sp;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (K > 0 && bid >= 0 && ask > 0) en.push({ K, bid, ask });
  }
  return en.length ? { filas: en, spot, cierre } : null;
}
const fechasX = [...new Set(readdirSync(DIRX).map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean))].sort();
const spx = new Map();
for (const fecha of fechasX) {
  const C = leerSPX(fecha, "C"), P = leerSPX(fecha, "P");
  if (!C || !P || !(C.spot > 0) || !(C.cierre > 0)) continue;
  const s = C.spot, S = C.cierre;
  const cC = cerca(C.filas, s + 25), pC = cerca(P.filas, s - 25);
  const cL = cerca(C.filas, cC.K + 50), pL = cerca(P.filas, pC.K - 50);
  if (cL.K <= cC.K || pL.K >= pC.K) continue;
  const patas = [cC, pC, cL, pL];
  const credReal = cC.bid + pC.bid - cL.ask - pL.ask;
  const credMedio = (cC.bid + cC.ask) / 2 + (pC.bid + pC.ask) / 2 - (cL.bid + cL.ask) / 2 - (pL.bid + pL.ask) / 2;
  if (!(credReal > 0)) continue;
  const perd = Math.min(Math.max(S - cC.K, 0), cL.K - cC.K) + Math.min(Math.max(pC.K - S, 0), pC.K - pL.K);
  spx.set(fecha, {
    fecha, spot: s, cierre: S,
    credReal: credReal * 100, credMedio: credMedio * 100,
    horquilla4: patas.reduce((a, p) => a + (p.ask - p.bid), 0) * 100,
    horquillaCortas: (cC.ask - cC.bid + pC.ask - pC.bid) * 100,
    plReal: (credReal - perd) * 100 - PATAS * COMM,
    plMedio: (credMedio - perd) * 100 - PATAS * COMM,
    distCall: cC.K - s, distPut: s - pC.K,
  });
}

// ── SPY: lo mismo a escala 1/10 ──────────────────────────────────────────────────────────────
const DIRY = "scripts/cache-theta/spy-0dte";
const spy = new Map();
for (const f of readdirSync(DIRY)) {
  const fecha = (f.match(/^(\d{4}-\d{2}-\d{2})\.json$/) || [])[1]; if (!fecha) continue;
  const j = JSON.parse(readFileSync(`${DIRY}/${f}`, "utf8"));
  if (!Array.isArray(j) || !j.length) continue;
  const C = [], P = []; let spot = 0, cierre = 0, hFin = "";
  for (const r of j) {
    const [h, lado, K, bid, ask, , U] = r;
    if (U > 0 && h >= hFin) { hFin = h; cierre = U; }
    if (h !== HORA) continue;
    if (U > 0 && !spot) spot = U;
    if (!(K > 0) || !(bid >= 0) || !(ask > 0)) continue;
    (lado === "C" ? C : P).push({ K, bid, ask });
  }
  if (!(spot > 0) || !(cierre > 0) || !C.length || !P.length) continue;
  const cC = cerca(C, spot + 2.5), pC = cerca(P, spot - 2.5);
  const cL = cerca(C, cC.K + 5), pL = cerca(P, pC.K - 5);
  if (cL.K <= cC.K || pL.K >= pC.K) continue;
  const patas = [cC, pC, cL, pL];
  const credReal = cC.bid + pC.bid - cL.ask - pL.ask;
  const credMedio = (cC.bid + cC.ask) / 2 + (pC.bid + pC.ask) / 2 - (cL.bid + cL.ask) / 2 - (pL.bid + pL.ask) / 2;
  if (!(credReal > 0)) continue;
  const perd = Math.min(Math.max(cierre - cC.K, 0), cL.K - cC.K) + Math.min(Math.max(pC.K - cierre, 0), pC.K - pL.K);
  spy.set(fecha, {
    fecha, spot, cierre,
    credReal: credReal * 100, credMedio: credMedio * 100,
    horquilla4: patas.reduce((a, p) => a + (p.ask - p.bid), 0) * 100,
    horquillaCortas: (cC.ask - cC.bid + pC.ask - pC.bid) * 100,
    plReal: (credReal - perd) * 100 - PATAS * COMM,
    plMedio: (credMedio - perd) * 100 - PATAS * COMM,
    distCall: (cC.K - spot) * 10, distPut: (spot - pC.K) * 10,   // en puntos SPX equivalentes
  });
}

const comunes = [...spx.keys()].filter((f) => spy.has(f)).sort();
console.log(`SPX ${spx.size} días · SPY ${spy.size} días · en común ${comunes.length}`);
const par = comunes.map((f) => ({ fecha: f, x: spx.get(f), y: spy.get(f) }));
radiografia(par.map((p) => ({ credRealX: p.x.credReal, credRealY: p.y.credReal, horqX: p.x.horquilla4, horqY: p.y.horquilla4, difReal: p.y.plReal * 10 - p.x.plReal })),
  ["credRealX", "credRealY", "horqX", "horqY", "difReal"], "SPX vs SPY emparejados");

// ═══ 1 · LA HORQUILLA ════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(100)}\n1 · LA HORQUILLA · lo que cuesta cruzar el diferencial en cada instrumento\n${"═".repeat(100)}\n`);
console.log("| instrumento | crédito medio (real) | horquilla de las 4 patas | horquilla / crédito | horquilla de las 2 cortas |");
console.log("|---|---|---|---|---|");
const hx = par.map((p) => p.x.horquilla4), hy = par.map((p) => p.y.horquilla4 * 10);
const cx = par.map((p) => p.x.credReal), cy = par.map((p) => p.y.credReal * 10);
console.log(`| SPX (ala 50) | ${eur(med(cx))} | ${eur(med(hx))} | ${((med(hx) / med(cx)) * 100).toFixed(1)}% | ${eur(med(par.map((p) => p.x.horquillaCortas)))} |`);
console.log(`| SPY ×10 (ala 5) | ${eur(med(cy))} | ${eur(med(hy))} | ${((med(hy) / med(cy)) * 100).toFixed(1)}% | ${eur(med(par.map((p) => p.y.horquillaCortas * 10)))} |`);
console.log(`| **diferencia** | ${eur(med(cy) - med(cx))} | ${eur(med(hy) - med(hx))} | | |`);
console.log(`\n  mediana de la horquilla de las 4 patas: SPX ${eur(perc(hx, 0.5))} · SPY×10 ${eur(perc(hy, 0.5))}`);
console.log(`  SPX paga ${(med(hx) / med(hy)).toFixed(1)}× lo que paga SPY por el mismo cóndor a la misma escala.`);

// ═══ 2 · EL BISTURÍ: A PUNTO MEDIO ═══════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(100)}\n2 · EL BISTURÍ · ¿desaparece la diferencia si se valoran LAS DOS al punto medio?\n${"═".repeat(100)}\n`);
console.log(`  (el punto medio NO es operable; se usa sólo para aislar el coste de ejecución)\n`);
const PER = [["TODO 22-26", () => true], ["2022-2023", (p) => p.fecha < "2024-01-01"], ["2024-2026", (p) => p.fecha >= "2024-01-01"]];
console.log("| período | días | SPY×10 − SPX con PRECIOS REALES | ... con PUNTO MEDIO | ¿cuánto explica la horquilla? |");
console.log("|---|---|---|---|---|");
for (const [et, f] of PER) {
  const g = par.filter(f); if (g.length < 30) continue;
  const dR = g.map((p) => p.y.plReal * 10 - p.x.plReal);
  const dM = g.map((p) => p.y.plMedio * 10 - p.x.plMedio);
  const explica = (med(dR) - med(dM)) / med(dR);
  console.log(`| ${et} | ${g.length} | ${eur2(med(dR))}/día (t=${tDe(dR).toFixed(2)}) | ${eur2(med(dM))}/día (t=${tDe(dM).toFixed(2)}) | ${(explica * 100).toFixed(0)}% |`);
}

// ═══ 3 · LO QUE QUEDA SIN EXPLICAR ═══════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(100)}\n3 · LO QUE QUEDA · si la horquilla no lo explica todo, ¿qué más difiere?\n${"═".repeat(100)}\n`);
console.log("| medida | SPX | SPY (en puntos SPX equivalentes) | diferencia |");
console.log("|---|---|---|---|");
const filas = [
  ["distancia media de la call corta", (p) => p.x.distCall, (p) => p.y.distCall],
  ["distancia media de la put corta", (p) => p.x.distPut, (p) => p.y.distPut],
  ["crédito bruto al punto medio", (p) => p.x.credMedio, (p) => p.y.credMedio * 10],
  ["crédito real (bid/ask)", (p) => p.x.credReal, (p) => p.y.credReal * 10],
];
for (const [et, fx, fy] of filas) {
  const a = med(par.map(fx)), b = med(par.map(fy));
  console.log(`| ${et} | ${et.includes("distancia") ? a.toFixed(2) + " pts" : eur(a)} | ${et.includes("distancia") ? b.toFixed(2) + " pts" : eur(b)} | ${et.includes("distancia") ? (b - a).toFixed(2) + " pts" : eur(b - a)} |`);
}
console.log(`\n  Reparto de la distancia de la corta (SPX equivalente) — si SPY vende MÁS LEJOS, gana por eso y no por la horquilla:`);
for (const [et, f] of [["SPX call", (p) => p.x.distCall], ["SPY call", (p) => p.y.distCall], ["SPX put", (p) => p.x.distPut], ["SPY put", (p) => p.y.distPut]]) {
  const v = par.map(f);
  console.log(`    ${et.padEnd(9)} p10 ${perc(v, 0.1).toFixed(1)} · p50 ${perc(v, 0.5).toFixed(1)} · p90 ${perc(v, 0.9).toFixed(1)} · media ${med(v).toFixed(2)}`);
}

// ═══ 4 · LA CUENTA FINAL ═════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(100)}\n4 · LA CUENTA · a cuánto sale al año, sobre la cuenta de $56.389\n${"═".repeat(100)}\n`);
for (const [et, f] of PER) {
  const g = par.filter(f); if (g.length < 30) continue;
  const anos = g.length / 252;
  const x = g.reduce((a, p) => a + p.x.plReal, 0), y = g.reduce((a, p) => a + p.y.plReal * 10, 0);
  const xm = g.reduce((a, p) => a + p.x.plMedio, 0), ym = g.reduce((a, p) => a + p.y.plMedio * 10, 0);
  console.log(`  ${et.padEnd(12)} SPX real ${eur(x / anos).padStart(9)}/año · SPY×10 real ${eur(y / anos).padStart(9)}/año` +
    `   ‖ al punto medio (NO operable): SPX ${eur(xm / anos).padStart(9)} · SPY×10 ${eur(ym / anos).padStart(9)}`);
}
console.log(`\n  El peaje anual de la horquilla, por instrumento (real vs punto medio), sobre 252 días:`);
for (const [et, f] of PER) {
  const g = par.filter(f); if (g.length < 30) continue;
  const anos = g.length / 252;
  const px = g.reduce((a, p) => a + (p.x.plMedio - p.x.plReal), 0) / anos;
  const py = g.reduce((a, p) => a + (p.y.plMedio - p.y.plReal) * 10, 0) / anos;
  console.log(`    ${et.padEnd(12)} SPX paga ${eur(px)}/año de horquilla · SPY×10 paga ${eur(py)}/año · SPX paga ${eur(px - py)} de más`);
}
console.log("\n" + "═".repeat(100));
