// VENDER PUT SPREADS contra COMPRAR SPY, año a año.
// La alternativa real de Lester no es "no hacer nada": es comprar el índice y esperar.
import { readFileSync, readdirSync } from "node:fs";
const DIR = "scripts/cache-theta";
const leer = <T,>(p: string): T | null => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const media = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const tr: { time: string; close: number }[] = [];
for (const f of readdirSync(DIR)) if (f.startsWith("SPY_barsPAR_y_")) for (const x of leer<{ time: string; close: number }[]>(`${DIR}/${f}`) ?? []) tr.push(x);
const bars = [...new Map(tr.map((x) => [x.time, x] as const)).values()].sort((a, b) => (a.time < b.time ? -1 : 1));
// SPY: retorno de cada año natural, y la caída máxima dentro del año.
const porAno = new Map<string, { ini: number; fin: number; pico: number; dd: number }>();
for (const b of bars) {
  const y = b.time.slice(0, 4);
  const e = porAno.get(y);
  if (!e) porAno.set(y, { ini: b.close, fin: b.close, pico: b.close, dd: 0 });
  else { e.fin = b.close; e.pico = Math.max(e.pico, b.close); e.dd = Math.max(e.dd, (e.pico - b.close) / e.pico); }
}
// La estrategia: media por operación x 52 lunes, sobre el 1,5% de la cuenta.
const EST: Record<string, number> = { "2017": 14.1, "2018": -4.1, "2019": 9.5, "2020": 8.7, "2021": 8.6, "2022": -10.5, "2023": 12.3, "2024": 5.3, "2025": 4.7, "2026": 5.5 };
console.log("\n## VENDER PUT SPREADS vs COMPRAR SPY\n");
console.log("La estrategia arriesga 1,5% de la cuenta por operacion, ~52 entradas al ano (un lunes");
console.log("por semana, ocho tickers => se elige uno). Se compara con tener SPY todo el ano.\n");
console.log("| Ano | estrategia | SPY | diferencia | caida SPY en el ano |");
console.log("|---|---|---|---|---|");
const dE: number[] = [], dS: number[] = [];
for (const [y, m] of Object.entries(EST)) {
  const s = porAno.get(y);
  if (!s) continue;
  const rSpy = ((s.fin - s.ini) / s.ini) * 100;
  // 52 operaciones al ano, cada una arriesgando 1,5% => retorno anual = 52 x 1,5% x media
  const rEst = 52 * 0.015 * m;
  dE.push(rEst); dS.push(rSpy);
  const dif = rEst - rSpy;
  console.log(`| ${y} | ${rEst >= 0 ? "+" : ""}${rEst.toFixed(1)}% | ${rSpy >= 0 ? "+" : ""}${rSpy.toFixed(1)}% | ${dif >= 0 ? "+" : ""}${dif.toFixed(1)} pts | ${(s.dd * 100).toFixed(0)}% |`);
}
console.log(`\n   MEDIA anual  estrategia ${media(dE).toFixed(1)}%   ·   SPY ${media(dS).toFixed(1)}%`);
console.log(`   PEOR ano     estrategia ${Math.min(...dE).toFixed(1)}%   ·   SPY ${Math.min(...dS).toFixed(1)}%`);
const gana = dE.filter((x, i) => x > dS[i]).length;
console.log(`   La estrategia le gana a SPY en ${gana}/${dE.length} anos.`);
console.log(`\n   → ${media(dE) > media(dS) ? "GANA a comprar el indice." : Math.min(...dE) > Math.min(...dS) ? "Gana MENOS que el indice, pero su peor ano es MEJOR: mismo juego con menos sustos." : "Gana menos Y su peor ano es peor. No compensa el trabajo."}`);
