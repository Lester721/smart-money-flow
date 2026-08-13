// EL WHEEL, con precios reales.
//
// POR QUE ES DISTINTO A TODO LO PROBADO: en un credit spread, si falla pierdes el ancho ENTERO —
// asimetria 15:1 que nos mato todo el dia. En el Wheel la asignacion NO es perdida: te quedas la
// accion al strike, y sigues cobrando primas vendiendo calls encima. La perdida solo se realiza
// si la accion baja Y tu vendes.
//
// EL CICLO:
//   1. Vendes una PUT cubierta con efectivo, ~1 sigma OTM, mensual.
//   2. Si expira fuera del dinero -> te quedas la prima y repites.
//   3. Si te asignan -> compras 100 acciones al strike. Ahora tienes acciones.
//   4. Con acciones, vendes CALLS cubiertas ~1 sigma OTM cada mes.
//   5. Si te ejercen la call -> vendes las acciones al strike y vuelves al paso 1.
//
// LA COMPARACION QUE IMPORTA: contra COMPRAR Y MANTENER la misma accion. Si el Wheel no le gana
// a tener la accion, no vale la pena la complicacion.
//
// Uso: node --import tsx scripts/wheel-backtest.ts

import { readFileSync, readdirSync } from "node:fs";
import { barIdxOnOrAfter, type DBar } from "../lib/backtestCore";

const DIR = "scripts/cache-theta", CDIR = `${DIR}/cadenas`;
const TICKERS = ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "META", "TSLA", "AMD"];
const DTE = Number(process.env.W_DTE ?? 30);
const SIGMA = Number(process.env.W_SIGMA ?? 1);
const COMM = 0.03;

const leer = <T,>(p: string): T | null => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const media = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
type CadenaDia = Record<string, Record<string, [number, number]>>;

interface Fila { t: string; wheel: number; hold: number; años: number; ciclos: number; asignaciones: number; ddW: number; ddH: number }
const filas: Fila[] = [];

for (const t of TICKERS) {
  const trozos: DBar[] = [];
  for (const f of readdirSync(DIR)) if (f.startsWith(`${t}_barsPAR_y_`)) for (const x of leer<DBar[]>(`${DIR}/${f}`) ?? []) trozos.push(x);
  const bars = [...new Map(trozos.map((x) => [x.time, x] as const)).values()].sort((a, b) => (a.time < b.time ? -1 : 1));
  if (bars.length < 500) continue;
  const c = bars.map((b) => b.close);
  const rvEn = (i: number) => {
    if (i < 21) return null;
    const lr: number[] = [];
    for (let j = i - 20; j <= i; j++) if (c[j - 1] > 0 && c[j] > 0) lr.push(Math.log(c[j] / c[j - 1]));
    const m = media(lr);
    return Math.sqrt(lr.reduce((s, x) => s + (x - m) ** 2, 0) / (lr.length - 1)) * Math.sqrt(252);
  };

  // Estado del ciclo: efectivo + (acciones si asignado).
  let cash = 100_000, acciones = 0, baseCoste = 0;
  let i = 260, ciclos = 0, asignaciones = 0;
  let picoW = cash, ddW = 0;
  const iIni = i, cIni = c[i];

  while (i < bars.length - 25) {
    const rv = rvEn(i);
    const cad = leer<CadenaDia>(`${CDIR}/${t}_d${bars[i].time.replace(/-/g, "")}.json`);
    if (!rv || !cad) { i += 5; continue; }
    const objetivo = new Date(Date.parse(`${bars[i].time}T12:00:00Z`) + DTE * 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
    const exp = Object.keys(cad).sort().find((e) => e >= objetivo);
    if (!exp) { i += 5; continue; }
    const expIdx = barIdxOnOrAfter(bars, Date.parse(`${exp.slice(0, 4)}-${exp.slice(4, 6)}-${exp.slice(6, 8)}T20:00:00Z`));
    if (expIdx <= i || expIdx >= bars.length) break;
    const spot = c[i], sExp = c[expIdx];
    const em = spot * rv * Math.sqrt(DTE / 365);
    const right: "C" | "P" = acciones > 0 ? "C" : "P";
    const ks = Object.keys(cad[exp]).filter((x) => x.endsWith(`|${right}`)).map((x) => Number(x.split("|")[0])).sort((a, b) => a - b);
    if (ks.length < 5 || !(em > 0)) { i = expIdx; continue; }
    const objK = right === "P" ? spot - SIGMA * em : spot + SIGMA * em;
    const K = ks.reduce((b, x) => (Math.abs(x - objK) < Math.abs(b - objK) ? x : b), ks[0]);
    const q = cad[exp][`${K}|${right}`];
    if (!q) { i = expIdx; continue; }
    const prima = (q[0] + q[1]) / 2 - COMM / 100;          // se vende al punto medio
    if (!(prima > 0)) { i = expIdx; continue; }

    if (right === "P") {
      // PUT CUBIERTA CON EFECTIVO: hay que tener K x 100 en caja.
      const nContratos = Math.floor(cash / (K * 100));
      if (nContratos < 1) { i = expIdx; continue; }
      cash += prima * 100 * nContratos;
      if (sExp < K) {                                       // ASIGNADO: compras las acciones
        acciones = nContratos * 100;
        cash -= K * acciones;
        baseCoste = K;
        asignaciones++;
      }
      ciclos++;
    } else {
      // CALL CUBIERTA sobre las acciones que tienes.
      const nContratos = Math.floor(acciones / 100);
      cash += prima * 100 * nContratos;
      if (sExp > K) {                                       // EJERCIDA: vendes al strike
        cash += K * acciones;
        acciones = 0; baseCoste = 0;
      }
      ciclos++;
    }
    const valor = cash + acciones * sExp;
    picoW = Math.max(picoW, valor); ddW = Math.max(ddW, (picoW - valor) / picoW);
    i = expIdx;
  }

  const valorFinal = cash + acciones * c[Math.min(i, bars.length - 1)];
  const años = (i - iIni) / 252;
  if (años < 3) continue;
  // COMPRAR Y MANTENER la misma accion, mismo periodo.
  let picoH = 100_000, ddH = 0;
  for (let j = iIni; j <= i && j < bars.length; j++) {
    const v = 100_000 * (c[j] / cIni);
    picoH = Math.max(picoH, v); ddH = Math.max(ddH, (picoH - v) / picoH);
  }
  filas.push({
    t, años, ciclos, asignaciones, ddW: ddW * 100, ddH: ddH * 100,
    wheel: (Math.pow(valorFinal / 100_000, 1 / años) - 1) * 100,
    hold: (Math.pow(c[Math.min(i, bars.length - 1)] / cIni, 1 / años) - 1) * 100,
  });
}

console.log(`\n## EL WHEEL con precios reales · ${DTE} días · corto a ${SIGMA}σ\n`);
console.log(`Put cubierta con efectivo → si te asignan, calls cubiertas hasta que te ejerzan.`);
console.log(`Precios al punto medio (como opera Lester) · comisiones de Robinhood.\n`);
console.log("| Ticker | años | ciclos | asignado | **WHEEL** | comprar y mantener | caída W | caída H |");
console.log("|---|---|---|---|---|---|---|---|");
for (const f of filas.sort((a, b) => b.wheel - a.wheel)) {
  const gana = f.wheel > f.hold;
  console.log(`| ${f.t} | ${f.años.toFixed(1)} | ${f.ciclos} | ${f.asignaciones} | ${gana ? "**" : ""}${f.wheel >= 0 ? "+" : ""}${f.wheel.toFixed(1)}%${gana ? "**" : ""} | ${f.hold >= 0 ? "+" : ""}${f.hold.toFixed(1)}% | ${f.ddW.toFixed(0)}% | ${f.ddH.toFixed(0)}% |`);
}
const g = filas.filter((f) => f.wheel > f.hold).length;
console.log(`\n   El Wheel le gana a tener la acción en **${g} de ${filas.length}** tickers.`);
console.log(`   Media: Wheel ${media(filas.map((f) => f.wheel)).toFixed(1)}%  ·  comprar y mantener ${media(filas.map((f) => f.hold)).toFixed(1)}%`);
console.log(`   Caída media: Wheel ${media(filas.map((f) => f.ddW)).toFixed(0)}%  ·  comprar y mantener ${media(filas.map((f) => f.ddH)).toFixed(0)}%`);
