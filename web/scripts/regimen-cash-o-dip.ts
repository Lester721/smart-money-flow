// LA IDEA DE LESTER: operar opciones en años buenos, irse a CASH en los malos, y comprar el
// desplome de SPY.
//
// El concepto es sólido. El problema es "cuando hay vientos de que no funciona" — eso no es una
// regla, es una intuición, y no se puede ejecutar ni medir. Aquí se convierte en algo mecánico:
//
//   SPY por ENCIMA de su media de 200 días  → régimen bueno
//   SPY por DEBAJO                          → régimen malo
//
// Es el filtro de tendencia más estudiado que existe. Usa SOLO datos pasados y se puede mirar
// cualquier día en dos segundos.
//
// SE COMPARAN CUATRO COSAS:
//   A) comprar SPY y no tocarlo          — la alternativa real
//   B) SPY solo cuando está sobre la MA200, cash el resto
//   C) B + comprar el desplome: entrar cuando cae 15% desde máximos aunque esté bajo la MA
//   D) la estrategia de opciones (4,2%/año) en régimen bueno, cash en el malo
//
// Uso: node --import tsx scripts/regimen-cash-o-dip.ts

import { readFileSync, readdirSync } from "node:fs";

const DIR = "scripts/cache-theta";
const TASA_CASH = Number(process.env.RC_TASA ?? 2.0);   // % anual en letras, media del periodo
const OPC_ANUAL = Number(process.env.RC_OPC ?? 4.2);    // lo que dio nuestra estrategia medida

const leer = <T,>(p: string): T | null => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };

const tr: { time: string; close: number }[] = [];
for (const f of readdirSync(DIR)) if (f.startsWith("SPY_barsPAR_y_")) for (const x of leer<{ time: string; close: number }[]>(`${DIR}/${f}`) ?? []) tr.push(x);
const bars = [...new Map(tr.map((x) => [x.time, x] as const)).values()].sort((a, b) => (a.time < b.time ? -1 : 1));
const c = bars.map((b) => b.close);

// Media de 200 días con datos PASADOS. El día i decide con lo que se sabía al cierre de i.
const ma200 = c.map((_, i) => (i < 200 ? null : c.slice(i - 200, i).reduce((s, x) => s + x, 0) / 200));

interface Est { nom: string; valor: number; pico: number; dd: number; diasFuera: number }
const ests: Est[] = [
  { nom: "A) SPY siempre", valor: 100, pico: 100, dd: 0, diasFuera: 0 },
  { nom: "B) SPY solo sobre MA200", valor: 100, pico: 100, dd: 0, diasFuera: 0 },
  { nom: "C) B + comprar el desplome -15%", valor: 100, pico: 100, dd: 0, diasFuera: 0 },
  { nom: "D) opciones en bueno, cash en malo", valor: 100, pico: 100, dd: 0, diasFuera: 0 },
];
const diario = (anual: number) => Math.pow(1 + anual / 100, 1 / 252) - 1;
const rCash = diario(TASA_CASH), rOpc = diario(OPC_ANUAL);

// Máximo histórico para medir el desplome.
let maxHist = c[200] ?? c[0];
const porAno = new Map<string, number[]>();

for (let i = 201; i < bars.length; i++) {
  const rSpy = c[i] / c[i - 1] - 1;
  const m = ma200[i - 1];                       // la MA de AYER: hoy ya se puede actuar
  const arriba = m != null && c[i - 1] > m;
  maxHist = Math.max(maxHist, c[i - 1]);
  const desplome = (maxHist - c[i - 1]) / maxHist >= 0.15;

  const rets = [
    rSpy,                                        // A
    arriba ? rSpy : rCash,                       // B
    arriba || desplome ? rSpy : rCash,           // C
    arriba ? rOpc : rCash,                       // D
  ];
  for (let k = 0; k < ests.length; k++) {
    const e = ests[k];
    e.valor *= 1 + rets[k];
    e.pico = Math.max(e.pico, e.valor);
    e.dd = Math.max(e.dd, (e.pico - e.valor) / e.pico);
    if (k > 0 && !arriba && !(k === 2 && desplome)) e.diasFuera++;
  }
  const y = bars[i].time.slice(0, 4);
  if (!porAno.has(y)) porAno.set(y, [0, 0, 0, 0]);
  const acc = porAno.get(y)!;
  for (let k = 0; k < 4; k++) acc[k] += Math.log(1 + rets[k]);
}

const años = (bars.length - 201) / 252;
console.log(`\n## ¿Opciones en años buenos y cash en los malos? · ${años.toFixed(1)} años\n`);
console.log(`Regla: SPY sobre su media de 200 días = régimen bueno. Solo datos pasados.`);
console.log(`Cash rinde ${TASA_CASH}% anual · la estrategia de opciones ${OPC_ANUAL}%.\n`);
console.log("| Estrategia | Anual | Caída máxima | Retorno/caída | Días fuera |");
console.log("|---|---|---|---|---|");
for (const e of ests) {
  const cagr = (Math.pow(e.valor / 100, 1 / años) - 1) * 100;
  console.log(`| ${e.nom} | ${cagr >= 0 ? "+" : ""}${cagr.toFixed(1)}% | ${(e.dd * 100).toFixed(1)}% | ${(cagr / (e.dd * 100)).toFixed(2)} | ${e.diasFuera ? Math.round(e.diasFuera / 252 * 10) / 10 + " años" : "—"} |`);
}

console.log(`\n### Los años que a Lester le importan\n`);
console.log("| Año | A) SPY | B) MA200 | C) + desplome | D) opciones |");
console.log("|---|---|---|---|---|");
for (const y of ["2018", "2020", "2022"]) {
  const a = porAno.get(y);
  if (!a) continue;
  console.log(`| **${y}** | ${a.map((x) => { const p = (Math.exp(x) - 1) * 100; return `${p >= 0 ? "+" : ""}${p.toFixed(1)}%`; }).join(" | ")} |`);
}
console.log(`\n   El filtro de tendencia SÍ recorta las caídas — eso está fuera de duda y tiene`);
console.log(`   décadas de literatura. Lo que cuesta son los AÑOS FUERA del mercado y los latigazos:`);
console.log(`   cada vez que SPY cruza la media y vuelve a cruzarla, vendes abajo y recompras arriba.`);
