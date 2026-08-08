// ¿EXISTE el mecanismo del GEX? — prueba directa, independiente de nuestra estrategia.
//
// EL PROBLEMA: el régimen de gamma pareció funcionar en SPY (media −6,25% → +1,81% entre
// terciles) pero no en QQQ. Lester señala, con razón, que SPY no es comparable: las opciones
// del S&P son el mercado de opciones más grande del mundo y QQQ es tecnología concentrada. Eso
// puede ser cierto — pero deja la hipótesis sin poder refutarse por comparación entre tickers.
//
// LA SALIDA: probar el MECANISMO en vez del P&L. La teoría no dice "vender prima rinde más";
// dice algo concreto y medible:
//
//     gamma NEGATIVA → los dealers amplifican los movimientos → el precio se mueve MÁS
//     gamma POSITIVA → los amortiguan                        → el precio se mueve MENOS
//
// Eso se mide sobre TODOS los días con OI (~2.630 en SPY), no solo los 331 de señal, y no
// depende del credit spread, ni del filtro de EVA, ni de Black-Scholes. O el precio se mueve
// más, o no. No hay margen para acomodar el resultado.
//
// CRITERIO FIJADO ANTES DE CORRER:
//   (a) el movimiento a 5 días debe CRECER de forma monótona del tercil de gamma más positiva
//       al más negativo;
//   (b) debe aguantar en CUATRO sub-períodos independientes, no en dos — con dos, un patrón
//       tiene 25% de salir por azar; con cuatro, ~6%;
//   (c) el efecto debe ser mayor en SPY que en las acciones (es la predicción de la teoría).
//
// Uso: npx tsx scripts/mejora-2e-gex-mecanismo.ts

import { readFileSync, readdirSync } from "node:fs";
import { bsGamma } from "../lib/blackScholes";

const TICKERS = (process.env.BT_TICKERS || "SPY,QQQ,AAPL,MSFT,NVDA,META,TSLA,AMD").split(",");
const HORIZONTE = Number(process.env.ME_DTE) || 5;
const DIR = "scripts/cache-theta";
const SUBPERIODOS = 4;

const leer = <T,>(p: string): T | null => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const media = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
type OiExp = Record<string, Record<string, Record<string, [number, number]>>>;

interface Dia { ymd: string; gex: number; movAbs: number; movFirmado: number }

/** Volatilidad realizada 20d hasta el índice dado — el mismo cálculo que usa el backtest. */
function rvHasta(cierres: number[], i: number): number | null {
  const ini = Math.max(1, i - 20);
  const r: number[] = [];
  for (let j = ini; j <= i; j++) if (cierres[j - 1] > 0 && cierres[j] > 0) r.push(Math.log(cierres[j] / cierres[j - 1]));
  if (r.length < 5) return null;
  const m = media(r);
  return Math.sqrt(r.reduce((s, x) => s + (x - m) ** 2, 0) / (r.length - 1)) * Math.sqrt(252);
}

(async () => {
  console.log(`\n## ¿EXISTE el mecanismo del GEX? — movimiento realizado a ${HORIZONTE} días\n`);
  console.log("| Ticker | n días | ⅓ gamma POS | ⅓ MEDIO | ⅓ gamma NEG | ¿crece? | sub-períodos OK |");
  console.log("|---|---|---|---|---|---|---|");

  for (const t of TICKERS) {
    const trozos: { time: string; close: number }[] = [];
    for (const f of readdirSync(DIR)) {
      if (f.startsWith(`${t}_barsPAR_y_`) && f.endsWith(".json")) for (const x of leer<{ time: string; close: number }[]>(`${DIR}/${f}`) ?? []) trozos.push(x);
    }
    const porFecha = new Map(trozos.map((x) => [x.time, x] as const));
    const bars = [...porFecha.values()].sort((a, b) => (a.time < b.time ? -1 : 1));
    const cierres = bars.map((b) => b.close);
    const idxDe = new Map(bars.map((b, i) => [b.time.replace(/-/g, ""), i] as const));

    const oi: OiExp = {};
    for (const f of readdirSync(DIR)) {
      if (f.startsWith(`${t}_oiexp_y_`) && f.endsWith(".json")) Object.assign(oi, leer<OiExp>(`${DIR}/${f}`) ?? {});
    }
    if (!bars.length || !Object.keys(oi).length) continue;

    const dias: Dia[] = [];
    for (const [ymd, porExp] of Object.entries(oi)) {
      const i = idxDe.get(ymd);
      if (i == null || i < 21 || i + HORIZONTE >= bars.length) continue;
      const spot = cierres[i];
      const rv = rvHasta(cierres, i);
      if (rv == null || !(rv > 0) || !(spot > 0)) continue;

      let gex = 0;
      const T = HORIZONTE / 365;
      for (const porStrike of Object.values(porExp)) {
        for (const [kStr, [oiC, oiP]] of Object.entries(porStrike)) {
          const g = bsGamma(spot, Number(kStr), T, rv);
          if (g > 0) gex += g * (oiC - oiP) * 100 * spot * spot * 0.01;
        }
      }
      // El movimiento se mide en unidades de σ ESPERADA: así un día volátil y uno tranquilo son
      // comparables, y no estamos midiendo simplemente "los días volátiles se mueven más".
      const esperado = spot * rv * Math.sqrt(HORIZONTE / 365);
      const real = cierres[i + HORIZONTE] - spot;
      dias.push({ ymd, gex: gex / (spot * spot), movAbs: Math.abs(real) / esperado, movFirmado: real / esperado });
    }
    if (dias.length < 300) continue;

    const evalua = (sub: Dia[]) => {
      const o = [...sub].sort((a, b) => b.gex - a.gex);   // de más POSITIVA a más NEGATIVA
      const k = Math.floor(o.length / 3);
      return [media(o.slice(0, k).map((x) => x.movAbs)), media(o.slice(k, 2 * k).map((x) => x.movAbs)), media(o.slice(2 * k).map((x) => x.movAbs))];
    };
    const m = evalua(dias);
    const crece = m[0] < m[1] && m[1] < m[2];

    // Cuatro sub-períodos independientes por fecha.
    const porTiempo = [...dias].sort((a, b) => (a.ymd < b.ymd ? -1 : 1));
    const tam = Math.floor(porTiempo.length / SUBPERIODOS);
    let ok = 0;
    for (let s = 0; s < SUBPERIODOS; s++) {
      const sub = porTiempo.slice(s * tam, (s + 1) * tam);
      const ms = evalua(sub);
      if (ms[0] < ms[2]) ok++;   // basta con que el extremo negativo se mueva más que el positivo
    }
    console.log(`| ${t} | ${dias.length} | ${m[0].toFixed(3)} | ${m[1].toFixed(3)} | ${m[2].toFixed(3)} | ${crece ? "**SÍ**" : "no"} | ${ok}/${SUBPERIODOS} |`);
  }

  console.log(`\nEl movimiento va en unidades de σ esperada (1.00 = se movió exactamente lo previsto).`);
  console.log(`La teoría predice que la columna crezca de izquierda a derecha: gamma negativa`);
  console.log(`amplifica. Y que el efecto sea MAYOR en SPY que en las acciones sueltas.`);
})();
