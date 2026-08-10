// LA IDEA DE LESTER, CON LAS PIEZAS INTERCAMBIADAS.
//
// Él proponía: opciones en años buenos, cash en los malos.
// Los datos dicen lo contrario — vender opciones te pone un TECHO:
//
//   2019  opciones +7,4%   SPY +28,6%    <- el techo te cuesta 21 puntos
//   2021  opciones +6,7%   SPY +28,8%
//   2022  opciones -8,2%   SPY -19,7%    <- el mismo techo te ahorra 11
//
// Así que la version que dicen los numeros es:
//   SPY sobre su MA200        -> comprar SPY (aprovechar la subida sin techo)
//   SPY bajo su MA200         -> opciones o cash (el techo protege)
//
// Usa la UNICA regla que resulto estable en el barrido: la media de 200 dias. Sin umbrales de
// desplome, que cambiaban de signo segun el tramo.
//
// LIMITACION DECLARADA: la pata de opciones se modela con el retorno ANUAL medido (analisis
// grande), repartido por dias. El resultado anual es correcto; el camino dentro del ano no. Sirve
// para comparar CAGR y ano a ano, no para leer la caida maxima con precision.
//
// Uso: node --import tsx scripts/regimen-invertido.ts

import { readFileSync, readdirSync } from "node:fs";
const DIR = "scripts/cache-theta";
const leer = <T,>(p: string): T | null => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const tr: { time: string; close: number }[] = [];
for (const f of readdirSync(DIR)) if (f.startsWith("SPY_barsPAR_y_")) for (const x of leer<{ time: string; close: number }[]>(`${DIR}/${f}`) ?? []) tr.push(x);
const bars = [...new Map(tr.map((x) => [x.time, x] as const)).values()].sort((a, b) => (a.time < b.time ? -1 : 1));
const c = bars.map((b) => b.close);
const ma = (i: number, n: number) => (i < n ? null : c.slice(i - n, i).reduce((s, x) => s + x, 0) / n);

// Retorno ANUAL medido de vender put spreads (scripts/analisis-grande.ts, precios reales).
const OPC: Record<string, number> = { "2017": 11.0, "2018": -3.2, "2019": 7.4, "2020": 6.8, "2021": 6.7, "2022": -8.2, "2023": 9.6, "2024": 4.1, "2025": 3.7, "2026": 4.3 };
const dCash = Math.pow(1.02, 1 / 252) - 1;
const dOpc = (y: string) => Math.pow(1 + (OPC[y] ?? 4) / 100, 1 / 252) - 1;

type Modo = "spy" | "ma-cash" | "ma-opc" | "opc-siempre";
function sim(desde: number, hasta: number, modo: Modo) {
  let v = 100, pico = 100, dd = 0;
  const porAno = new Map<string, number>();
  for (let i = desde + 1; i < hasta; i++) {
    const y = bars[i].time.slice(0, 4);
    const m = ma(i - 1, 200);
    const arriba = m != null && c[i - 1] > m;
    const rSpy = c[i] / c[i - 1] - 1;
    let r: number;
    if (modo === "spy") r = rSpy;
    else if (modo === "opc-siempre") r = dOpc(y);
    else if (arriba) r = rSpy;                                  // regimen BUENO -> SPY sin techo
    else r = modo === "ma-cash" ? dCash : dOpc(y);              // regimen MALO -> cash u opciones
    v *= 1 + r; pico = Math.max(pico, v); dd = Math.max(dd, (pico - v) / pico);
    porAno.set(y, (porAno.get(y) ?? 0) + Math.log(1 + r));
  }
  const años = (hasta - desde) / 252;
  return { cagr: (Math.pow(v / 100, 1 / años) - 1) * 100, dd: dd * 100, porAno };
}

const ini = 210, fin = bars.length, mitad = Math.floor((ini + fin) / 2);
const MODOS: [string, Modo][] = [
  ["A) SPY siempre", "spy"],
  ["B) Opciones siempre", "opc-siempre"],
  ["C) SPY sobre MA200, CASH debajo", "ma-cash"],
  ["D) SPY sobre MA200, OPCIONES debajo", "ma-opc"],
];

console.log(`\n## LA IDEA INVERTIDA · ${((fin - ini) / 252).toFixed(1)} años\n`);
console.log(`SPY cuando está sobre su media de 200 días (subida sin techo), y opciones o cash`);
console.log(`cuando está debajo (el techo protege). Sin umbrales de desplome.\n`);
console.log("| Estrategia | CAGR | Caída | Ret/caída | vieja | nueva |");
console.log("|---|---|---|---|---|---|");
for (const [nom, modo] of MODOS) {
  const t = sim(ini, fin, modo), v = sim(ini, mitad, modo), n = sim(mitad, fin, modo);
  console.log(`| ${nom} | ${t.cagr >= 0 ? "+" : ""}${t.cagr.toFixed(1)}% | ${t.dd.toFixed(1)}% | ${(t.cagr / t.dd).toFixed(2)} | +${v.cagr.toFixed(1)}% | +${n.cagr.toFixed(1)}% |`);
}

const spy = sim(ini, fin, "spy"), inv = sim(ini, fin, "ma-opc");
console.log(`\n### Año a año — SPY contra la idea invertida\n`);
console.log("| Año | SPY | D) invertida |");
console.log("|---|---|---|");
for (const y of [...spy.porAno.keys()].sort()) {
  const a = (Math.exp(spy.porAno.get(y)!) - 1) * 100, b = (Math.exp(inv.porAno.get(y) ?? 0) - 1) * 100;
  console.log(`| ${y} | ${a >= 0 ? "+" : ""}${a.toFixed(1)}% | ${b > a ? "**" : ""}${b >= 0 ? "+" : ""}${b.toFixed(1)}%${b > a ? "**" : ""} |`);
}
console.log(`\n   Para adoptarla tiene que ganar a SPY en CAGR o en retorno/caída, y en las DOS mitades.`);
