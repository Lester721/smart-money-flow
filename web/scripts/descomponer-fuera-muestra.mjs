// ¿QUÉ FALLÓ FUERA DE MUESTRA: LA DISTANCIA O LAS MEDIAS?
//
// El "filtro de amplitud" son DOS cambios a la vez: vender a ±30 en vez de ±25, y no operar por
// debajo de la MA20/MA50. La prueba fuera de muestra los aplicó JUNTOS, así que dijo "falla" sin
// decir cuál de los dos. Aquí se separan las cuatro combinaciones sobre los mismos días.
//
// NADA SE AJUSTA. Son las mismas reglas ya escritas, sólo desmontadas para ver la pieza rota.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/descomponer-fuera-muestra.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00", ALA = 50, COMM = 0.03;
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const med = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const racha = (v) => { let cur = 0, peor = 0; for (const x of v) { cur = Math.min(0, cur + x); peor = Math.min(peor, cur); } return peor; };

function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = ["strike", "timestamp", "bid", "ask", "underlying_price"].map((c) => cab.indexOf(c));
  if (idx.some((x) => x < 0)) throw new Error("faltan columnas en " + f);
  const [iK, iT, iB, iA, iU] = idx;
  const enHora = [];
  let cierre = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    const h = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && h >= hFin) { hFin = h; cierre = sp; }
    if (h !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask, spot: sp });
  }
  return enHora.length ? { filas: enHora, cierre } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

const fechas = [...new Set(readdirSync(DIR).map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean))].sort();
const dias = [];
for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P || !(C.cierre > 0)) continue;
  const sp11 = C.filas[0].spot;
  if (!(sp11 > 0)) continue;
  const calc = (SEP) => {
    const cC = cerca(C.filas, sp11 + SEP), pC = cerca(P.filas, sp11 - SEP);
    const cL = cerca(C.filas, cC.K + ALA), pL = cerca(P.filas, pC.K - ALA);
    if (cL.K <= cC.K || pL.K >= pC.K) return null;
    const cred = cC.bid + pC.bid - cL.ask - pL.ask;
    if (!(cred > 0)) return null;
    const S = C.cierre;
    return (cred - Math.min(Math.max(S - cC.K, 0), cL.K - cC.K)
                 - Math.min(Math.max(pC.K - S, 0), pC.K - pL.K)) * 100 - 8 * COMM;
  };
  const a = calc(25), b = calc(30);
  if (a == null || b == null) continue;
  dias.push({ fecha, sp11, cierre: C.cierre, pl25: a, pl30: b });
}

// El filtro: medias sobre cierres ESTRICTAMENTE anteriores al día medido.
for (let i = 0; i < dias.length; i++) {
  if (i < 50) { dias[i].opera = null; continue; }
  const c = dias.slice(i - 50, i).map((x) => x.cierre);
  dias[i].opera = dias[i].sp11 >= med(c.slice(-20)) && dias[i].sp11 >= med(c);
}

const VAR = [
  ["base ±25, todos", (b, o) => b.map((d) => d.pl25)],
  ["±30, todos", (b, o) => b.map((d) => d.pl30)],
  ["±25 + medias", (b, o) => o.map((d) => d.pl25)],
  ["±30 + medias", (b, o) => o.map((d) => d.pl30)],
];
const PERIODOS = [
  ["2022-2023 ⟵ FUERA DE MUESTRA", (d) => d.fecha < "2024-01-01"],
  ["2024-2026 (donde se eligió)", (d) => d.fecha >= "2024-01-01"],
  ["TODO 2022-2026", () => true],
  ["  · sólo 2022 (bajista)", (d) => d.fecha < "2023-01-01"],
  ["  · sólo 2023", (d) => d.fecha >= "2023-01-01" && d.fecha < "2024-01-01"],
];

console.log(`\n## LAS CUATRO VARIANTES POR SEPARADO · ${dias.length} días (${dias[0].fecha} → ${dias[dias.length - 1].fecha})\n`);
console.log(`### $/año\n`);
console.log("| período | " + VAR.map((v) => v[0]).join(" | ") + " |");
console.log("|---|---|---|---|---|");
const guarda = [];
for (const [et, f] of PERIODOS) {
  const base = dias.filter(f).filter((d) => d.opera !== null);
  if (base.length < 30) continue;
  const op = base.filter((d) => d.opera === true);
  const anos = base.length / 252;
  const fila = VAR.map(([, g]) => { const v = g(base, op); return { ano: v.reduce((a, x) => a + x, 0) / anos, racha: racha(v), n: v.length }; });
  guarda.push({ et, n: base.length, nOp: op.length, fila });
  console.log("| " + et + " | " + fila.map((x) => eur(x.ano)).join(" | ") + " |");
}

console.log(`\n### peor racha acumulada\n`);
console.log("| período | " + VAR.map((v) => v[0]).join(" | ") + " |");
console.log("|---|---|---|---|---|");
for (const g of guarda) console.log("| " + g.et + " | " + g.fila.map((x) => eur(x.racha)).join(" | ") + " |");

console.log(`\n### días operados\n`);
for (const g of guarda) console.log(`  ${g.et.padEnd(32)} todos ${String(g.n).padStart(4)} · con medias ${String(g.nOp).padStart(4)} (${Math.round(g.nOp / g.n * 100)}%)`);

// ── QUÉ PIEZA FALLA, dicho por los números ─────────────────────────────────
const fm = guarda.find((g) => g.et.includes("FUERA DE MUESTRA"));
if (fm) {
  const [b25, b30, m25, m30] = fm.fila.map((x) => x.ano);
  console.log(`\n${"═".repeat(74)}`);
  console.log(`  FUERA DE MUESTRA · qué aporta cada pieza al ingreso anual:`);
  console.log(`    la DISTANCIA sola (±25 → ±30):  ${eur(b25)} → ${eur(b30)}   ${b30 > b25 ? "mejora" : "EMPEORA"}`);
  console.log(`    las MEDIAS solas (sobre ±25):   ${eur(b25)} → ${eur(m25)}   ${m25 > b25 ? "mejora" : "EMPEORA"}`);
  console.log(`    las dos juntas (la regla):      ${eur(b25)} → ${eur(m30)}   ${m30 > b25 ? "mejora" : "EMPEORA"}`);
  console.log("═".repeat(74));
}
