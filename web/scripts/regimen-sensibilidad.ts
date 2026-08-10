// ¿EL -15% ES REAL O LO ELEGÍ YO?
//
// La idea de Lester (filtro de tendencia + comprar el desplome) dio +15,3% contra +14,2% de SPY,
// con MENOS caída. Pero el umbral del desplome lo elegí yo, y ese es justo el tipo de parámetro
// que nos ha enganado cinco veces hoy.
//
// DOS PRUEBAS:
//   1. Barrer el umbral. Si solo funciona en -15% y se cae en -10% y -20%, es un pico estrecho
//      = ajuste a los datos. Si funciona en TODO el rango, es una propiedad real.
//   2. Partir el periodo. Descubrir en la mitad vieja, medir en la nueva.
//
// Uso: node --import tsx scripts/regimen-sensibilidad.ts

import { readFileSync, readdirSync } from "node:fs";
const DIR = "scripts/cache-theta";
const leer = <T,>(p: string): T | null => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const tr: { time: string; close: number }[] = [];
for (const f of readdirSync(DIR)) if (f.startsWith("SPY_barsPAR_y_")) for (const x of leer<{ time: string; close: number }[]>(`${DIR}/${f}`) ?? []) tr.push(x);
const bars = [...new Map(tr.map((x) => [x.time, x] as const)).values()].sort((a, b) => (a.time < b.time ? -1 : 1));
const c = bars.map((b) => b.close);
const ma = (i: number, n: number) => (i < n ? null : c.slice(i - n, i).reduce((s, x) => s + x, 0) / n);
const rCash = Math.pow(1.02, 1 / 252) - 1;

/** Simula desde `desde` hasta `hasta` (índices) y devuelve CAGR y caída máxima. */
// `nMa = 0` significa COMPRAR Y MANTENER: siempre invertido. El atajo anterior (nMa=1) hacia
// "invertir solo si ayer subio", que no es lo mismo y daba +5,0% en vez de +14,2% — inutilizando
// todas las comparaciones. Un numero que no cuadra con una medicion previa es un bug, no un dato.
function sim(desde: number, hasta: number, nMa: number, umbralDip: number | null) {
  let v = 100, pico = 100, dd = 0, maxHist = c[desde];
  for (let i = desde + 1; i < hasta; i++) {
    const m = nMa > 0 ? ma(i - 1, nMa) : null;
    const arriba = nMa === 0 ? true : (m != null && c[i - 1] > m);
    maxHist = Math.max(maxHist, c[i - 1]);
    const dip = umbralDip != null && (maxHist - c[i - 1]) / maxHist >= umbralDip;
    const r = arriba || dip ? c[i] / c[i - 1] - 1 : rCash;
    v *= 1 + r; pico = Math.max(pico, v); dd = Math.max(dd, (pico - v) / pico);
  }
  const años = (hasta - desde) / 252;
  return { cagr: (Math.pow(v / 100, 1 / años) - 1) * 100, dd: dd * 100 };
}

const ini = 210, fin = bars.length, mitad = Math.floor((ini + fin) / 2);
const spyTot = sim(ini, fin, 0, null);   // nMa=0 => SIEMPRE invertido = comprar y mantener
console.log(`\n## ¿El -15% es real o lo elegí yo?\n`);
console.log(`Referencia — SPY comprar y mantener: +${spyTot.cagr.toFixed(1)}% · caída ${spyTot.dd.toFixed(1)}%\n`);
console.log("| Umbral del desplome | CAGR completo | caída | vieja | nueva |");
console.log("|---|---|---|---|---|");
for (const u of [null, 0.05, 0.10, 0.125, 0.15, 0.175, 0.20, 0.25]) {
  const t = sim(ini, fin, 200, u), v = sim(ini, mitad, 200, u), n = sim(mitad, fin, 200, u);
  const et = t.cagr > spyTot.cagr, ev = v.cagr > sim(ini, mitad, 0, null).cagr, en = n.cagr > sim(mitad, fin, 0, null).cagr;
  console.log(`| ${u == null ? "sin comprar el dip" : `-${(u * 100).toFixed(1)}%`} | ${et ? "**" : ""}+${t.cagr.toFixed(1)}%${et ? "**" : ""} | ${t.dd.toFixed(1)}% | ${ev ? "gana" : "pierde"} | ${en ? "**gana**" : "pierde"} |`);
}
console.log(`\n"vieja"/"nueva" = si le gana a comprar y mantener EN ESE TRAMO.`);
console.log(`Si solo gana con -15% y falla al lado, es un pico estrecho = ajuste a los datos.\n`);
console.log("| Media móvil | CAGR (con dip -15%) | caída |");
console.log("|---|---|---|");
for (const n of [100, 150, 200, 250]) {
  const t = sim(ini, fin, n, 0.15);
  console.log(`| ${n} días | ${t.cagr > spyTot.cagr ? "**" : ""}+${t.cagr.toFixed(1)}%${t.cagr > spyTot.cagr ? "**" : ""} | ${t.dd.toFixed(1)}% |`);
}
