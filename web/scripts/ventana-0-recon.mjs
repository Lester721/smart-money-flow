// RECON — ¿qué hay realmente en el flujo para medir "comprar 0-2DTE tras un print urgente"?
// Antes de medir nada: cuántas operaciones, de qué tickers, a qué plazo, y cuántas tienen
// cadena EOD en disco para poder ponerles precio de salida REAL.

import { diasFlujo, leerDia, parseOCC, cadena, CDIR } from "./ventana-lib.mjs";
import { readdirSync } from "node:fs";

const NIVEL = process.argv[2] || "1000k";
const dias = diasFlujo(NIVEL);
console.log(`\n## RECON flujo ${NIVEL} · ${dias.length} días · ${dias[0]} → ${dias[dias.length - 1]}\n`);

const tickersCadena = new Set(readdirSync(CDIR).filter((f) => /_d\d{8}\.json$/.test(f)).map((f) => f.split("_d")[0]));
console.log(`Tickers con cadenas diarias en disco: ${tickersCadena.size} → ${[...tickersCadena].sort().join(" ")}`);

// días de cadena disponibles por ticker (para saber hasta dónde llega)
const diasCad = {};
for (const f of readdirSync(CDIR)) { const m = /^([A-Z]+)_d(\d{8})\.json$/.exec(f); if (m) (diasCad[m[1]] ??= []).push(m[2]); }
for (const t of Object.keys(diasCad)) diasCad[t].sort();

const porTicker = new Map();       // ticker -> {n, prima}
const porDte = new Map();          // dte -> n
const porSide = new Map();
let total = 0, sinParse = 0, conCadena = 0, conCadenaYExp = 0;
let n02 = 0, n02conCadena = 0, n02conCadenaYExp = 0;
const iso = (a) => `${a.slice(0, 4)}-${a.slice(4, 6)}-${a.slice(6, 8)}`;
const dteDe = (exp, diaC) => {
  const d1 = new Date(`${iso(diaC)}T00:00:00Z`).getTime();
  const d2 = new Date(`${iso(exp)}T00:00:00Z`).getTime();
  return Math.round((d2 - d1) / 86400000);
};

const tickers02 = new Map();
for (const dia of dias) {
  const diaC = dia.replace(/-/g, "");
  for (const o of leerDia(dia, NIVEL)) {
    total++;
    const p = parseOCC(o.symbol);
    if (!p) { sinParse++; continue; }
    const t = porTicker.get(p.raiz) ?? { n: 0, prima: 0 };
    t.n++; t.prima += o.premium || 0; porTicker.set(p.raiz, t);
    porSide.set(o.side, (porSide.get(o.side) ?? 0) + 1);
    const dte = dteDe(p.exp, diaC);
    porDte.set(Math.min(dte, 99), (porDte.get(Math.min(dte, 99)) ?? 0) + 1);
    if (dte >= 0 && dte <= 4) {
      n02++;
      const k = tickers02.get(p.raiz) ?? { n: 0, conCad: 0 };
      k.n++;
      const c = cadena(p.raiz, diaC);
      if (c) { n02conCadena++; k.conCad++; if (c[p.exp]) n02conCadenaYExp++; }
      tickers02.set(p.raiz, k);
    }
    const c = cadena(p.raiz, diaC);
    if (c) { conCadena++; if (c[p.exp]) conCadenaYExp++; }
  }
}

console.log(`\nTotal operaciones: ${total} · símbolo ilegible: ${sinParse}`);
console.log(`Con cadena EOD del MISMO día en disco: ${conCadena} (${(100 * conCadena / total).toFixed(1)}%) · y con esa expiración dentro: ${conCadenaYExp} (${(100 * conCadenaYExp / total).toFixed(1)}%)`);

console.log(`\n### Top 15 tickers por nº de operaciones`);
const tt = [...porTicker].sort((a, b) => b[1].n - a[1].n);
for (const [t, v] of tt.slice(0, 15))
  console.log(`  ${t.padEnd(6)} n=${String(v.n).padStart(7)} (${(100 * v.n / total).toFixed(1).padStart(5)}%) · prima $${(v.prima / 1e9).toFixed(2)}B · cadenas: ${tickersCadena.has(t) ? "SÍ" : "no"}`);
console.log(`  ... ${porTicker.size} tickers distintos`);

console.log(`\n### Reparto por DTE (días naturales)`);
const dd = [...porDte].sort((a, b) => a[0] - b[0]);
for (const [d, n] of dd.slice(0, 12)) console.log(`  DTE ${String(d).padStart(2)} : ${String(n).padStart(7)} (${(100 * n / total).toFixed(1)}%)`);
const restos = dd.filter(([d]) => d > 11).reduce((a, [, n]) => a + n, 0);
console.log(`  DTE >11 : ${restos} (${(100 * restos / total).toFixed(1)}%)`);

console.log(`\n### side`);
for (const [s, n] of [...porSide].sort((a, b) => b[1] - a[1])) console.log(`  ${String(s).padEnd(11)} ${String(n).padStart(7)} (${(100 * n / total).toFixed(1)}%)`);

console.log(`\n### 0-4 DTE: ${n02} operaciones (${(100 * n02 / total).toFixed(1)}% del flujo)`);
console.log(`  con cadena del día: ${n02conCadena} (${(100 * n02conCadena / n02).toFixed(1)}%) · y con la expiración dentro: ${n02conCadenaYExp} (${(100 * n02conCadenaYExp / n02).toFixed(1)}%)`);
console.log(`  reparto por ticker:`);
for (const [t, v] of [...tickers02].sort((a, b) => b[1].n - a[1].n).slice(0, 20))
  console.log(`    ${t.padEnd(6)} n=${String(v.n).padStart(6)} · con cadena ${String(v.conCad).padStart(6)} · último día de cadena ${diasCad[t] ? diasCad[t][diasCad[t].length - 1] : "—"}`);
