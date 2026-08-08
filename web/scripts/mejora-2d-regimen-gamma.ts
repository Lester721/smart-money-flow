// ¿El RÉGIMEN de gamma dice si conviene vender hoy?
//
// Es una hipótesis DISTINTA a la que ya falló. Aquella era "dónde colocar el strike" (el muro);
// ésta es "si operar o no". Y es la afirmación más citada sobre el GEX:
//
//   gamma neta POSITIVA → los dealers compran las caídas y venden las subidas: AMORTIGUAN
//   gamma neta NEGATIVA → venden las caídas y compran las subidas: AMPLIFICAN
//
// Para quien vende prima, un régimen de gamma negativa debería ser peligroso: los movimientos
// se agrandan en vez de morir. Si es cierto, debería verse en la COLA — que es lo único que
// decide el año y lo único que hasta ahora no hemos sabido anticipar con nada.
//
// GEX neta = Σ gamma(strike) × (OI_calls − OI_puts) × 100 × spot² × 0.01
// Convención estándar: los dealers están largos de calls y cortos de puts frente al cliente.
//
// CRITERIO FIJADO ANTES DE CORRER: sirve si (a) separa la media de forma monótona entre
// terciles de GEX, (b) aguanta las DOS mitades OOS, y (c) la tasa de catástrofes es
// visiblemente menor en el régimen bueno. Con (a) sola no basta: sería una coincidencia.
//
// Uso: npx tsx scripts/mejora-2d-regimen-gamma.ts

import { readFileSync, readdirSync } from "node:fs";
import { classifyFlow } from "../lib/flow";
import { signals, creditSpreadPnl, type DBar, type Signal } from "../lib/backtestCore";
import { bsGamma } from "../lib/blackScholes";

const TICKERS = (process.env.BT_TICKERS || "SPY,AAPL,MSFT,NVDA,META,TSLA,AMD,QQQ,HOOD").split(",");
const DTE = 5, SIGMA = 1;
const CATASTROFE = -0.5;
const DIR = "scripts/cache-theta";
const RIESGO = 1200, AÑOS = 10.5;

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, "");
const leer = <T,>(p: string): T | null => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const media = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
type OiExp = Record<string, Record<string, Record<string, [number, number]>>>;

interface Op { ms: number; pnl: number; gex: number; ticker: string }

(async () => {
  const ops: Op[] = [];
  let sinOi = 0;

  for (const t of TICKERS) {
    const trozos: DBar[] = [];
    for (const f of readdirSync(DIR)) {
      if (f.startsWith(`${t}_barsPAR_y_`) && f.endsWith(".json")) for (const x of leer<DBar[]>(`${DIR}/${f}`) ?? []) trozos.push(x);
    }
    const porFecha = new Map(trozos.map((x) => [x.time, x] as const));
    const bars = [...porFecha.values()].sort((a, b) => (a.time < b.time ? -1 : 1));
    const oi: OiExp = {};
    for (const f of readdirSync(DIR)) {
      if (f.startsWith(`${t}_oiexp_y_`) && f.endsWith(".json")) Object.assign(oi, leer<OiExp>(`${DIR}/${f}`) ?? {});
    }
    const trades: unknown[] = [];
    for (const f of readdirSync(DIR)) {
      if (f.startsWith(`${t}_y_`) && f.endsWith(".json")) { const y = leer<unknown[]>(`${DIR}/${f}`); if (y?.length) trades.push(...y); }
    }
    if (!bars.length || !trades.length || !Object.keys(oi).length) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sigs = signals(classifyFlow(trades as any, new Date()).rows, bars);
    const k = Math.floor(sigs.length / 3);
    // Con M2D_TODAS se usan TODAS las señales: la hipótesis del régimen de gamma es
    // independiente del filtro de convicción, así que restringir la población solo resta
    // potencia. Sirve para ver si el efecto aguanta con 3x la muestra.
    const top = process.env.M2D_TODAS
      ? sigs
      : [...sigs].sort((a, b) => a.evaComp - b.evaComp).slice(sigs.length - k).filter((s) => s.ivRatio < 1.1);

    for (const sig of top) {
      const pnl = creditSpreadPnl(sig, bars, DTE, SIGMA);
      if (pnl == null) continue;
      const porExp = oi[ymd(sig.entryMs)];
      if (!porExp) { sinOi++; continue; }

      // GEX neta del día, sumando TODAS las expiraciones cargadas (≤21d): el régimen es del
      // mercado ese día, no de un vencimiento concreto — al revés que el muro.
      let gex = 0;
      const T = DTE / 365;
      for (const porStrike of Object.values(porExp)) {
        for (const [kStr, [oiC, oiP]] of Object.entries(porStrike)) {
          const g = bsGamma(sig.spot, Number(kStr), T, sig.rv);
          if (!(g > 0)) continue;
          gex += g * (oiC - oiP) * 100 * sig.spot * sig.spot * 0.01;
        }
      }
      // Normalizado por spot² para poder comparar entre tickers de precios muy distintos.
      ops.push({ ms: sig.entryMs, pnl, gex: gex / (sig.spot * sig.spot), ticker: t });
    }
  }

  // ── La teoría hace una PREDICCIÓN DIFERENCIAL ──────────────────────────────────────────
  // El GEX es un mecanismo de ÍNDICE: el hedging de los dealers mueve el subyacente porque el
  // open interest es grande frente a su liquidez. En una acción suelta se diluye. Si el efecto
  // que aparece en SPY es real, DEBE aparecer también en QQQ —el otro ETF de índice— y NO en
  // las acciones. Si aparece solo en SPY, es ruido de una muestra chica.
  const INDICES = new Set(["SPY", "QQQ"]);
  const grupoDe = (t: string) => (INDICES.has(t) ? t : "ACCIONES (las 7 juntas)");
  const universos = [...new Set(ops.map((o) => grupoDe(o.ticker)))].sort();

  console.log(`
## RÉGIMEN DE GAMMA por tipo de subyacente · ${DTE}d · ${process.env.M2D_TODAS ? "TODAS las señales" : "Top tercio + IV"}
`);
  console.log("| Universo | n | 1/3 gamma NEG | 1/3 MEDIO | 1/3 gamma POS | monotona? | OOS del 1/3 POS |");
  console.log("|---|---|---|---|---|---|---|");
  for (const u of universos) {
    const sub = ops.filter((o) => grupoDe(o.ticker) === u);
    if (sub.length < 90) continue;
    const orden = [...sub].sort((a, b) => a.gex - b.gex);
    const t3 = Math.floor(orden.length / 3);
    const g = [orden.slice(0, t3), orden.slice(t3, 2 * t3), orden.slice(2 * t3)];
    const ms = g.map((x) => media(x.map((y) => y.pnl)) * 100);
    const mono = ms[0] < ms[1] && ms[1] < ms[2];
    const pos = [...g[2]].sort((a, b) => a.ms - b.ms);
    const mp = Math.floor(pos.length / 2);
    const v = media(pos.slice(0, mp).map((x) => x.pnl)) * 100;
    const n2 = media(pos.slice(mp).map((x) => x.pnl)) * 100;
    const cat = (g[2].filter((x) => x.pnl <= CATASTROFE).length / g[2].length * 100).toFixed(1);
    const catN = (g[0].filter((x) => x.pnl <= CATASTROFE).length / g[0].length * 100).toFixed(1);
    console.log(`| ${u} | ${sub.length} | ${ms[0].toFixed(2)}% | ${ms[1].toFixed(2)}% | ${ms[2].toFixed(2)}% | ${mono ? "**SI**" : "no"} | ${v.toFixed(2)} / ${n2.toFixed(2)} ${v > 0 && n2 > 0 ? "OK" : "FALLA"} · catastrofes ${catN}%->${cat}% |`);
  }
  console.log(`
   La teoria predice: SI en SPY y QQQ, NO en las acciones. Si solo sale en SPY, es ruido.`);

  console.log(`\n## RÉGIMEN DE GAMMA — ¿dice si conviene vender hoy?`);
  console.log(`### ${DTE}d @${SIGMA}σ · Top⅓ EVA + IV/rv<1,1 · n=${ops.length} (sin OI: ${sinOi})\n`);

  const porGex = [...ops].sort((a, b) => a.gex - b.gex);
  const t3 = Math.floor(porGex.length / 3);
  const grupos: [string, Op[]][] = [
    ["Gamma más NEGATIVA (⅓ inferior)", porGex.slice(0, t3)],
    ["Media", porGex.slice(t3, 2 * t3)],
    ["Gamma más POSITIVA (⅓ superior)", porGex.slice(2 * t3)],
  ];

  console.log("| Régimen | n | Win | Media | Catastróficas | OOS vieja / nueva |");
  console.log("|---|---|---|---|---|---|");
  const medias: number[] = [];
  for (const [nombre, g] of grupos) {
    const o = [...g].sort((a, b) => a.ms - b.ms);
    const mid = Math.floor(o.length / 2);
    const v = media(o.slice(0, mid).map((x) => x.pnl)) * 100;
    const n = media(o.slice(mid).map((x) => x.pnl)) * 100;
    const m = media(g.map((x) => x.pnl)) * 100;
    medias.push(m);
    const win = Math.round(g.filter((x) => x.pnl > 0).length / g.length * 100);
    const cat = (g.filter((x) => x.pnl <= CATASTROFE).length / g.length * 100).toFixed(1);
    console.log(`| ${nombre} | ${g.length} | ${win}% | ${m >= 0 ? "+" : ""}${m.toFixed(2)}% | ${cat}% | ${v.toFixed(2)} / ${n.toFixed(2)} ${v > 0 && n > 0 ? "✅" : "✗"} |`);
  }

  // ── Veredicto contra el criterio prefijado ──────────────────────────────────────────────
  const monotona = medias[0] < medias[1] && medias[1] < medias[2];
  const catNeg = grupos[0][1].filter((x) => x.pnl <= CATASTROFE).length / grupos[0][1].length;
  const catPos = grupos[2][1].filter((x) => x.pnl <= CATASTROFE).length / grupos[2][1].length;
  const colaMejor = catPos < catNeg * 0.85;
  const oPos = [...grupos[2][1]].sort((a, b) => a.ms - b.ms);
  const mPos = Math.floor(oPos.length / 2);
  const oosPos = media(oPos.slice(0, mPos).map((x) => x.pnl)) > 0 && media(oPos.slice(mPos).map((x) => x.pnl)) > 0;

  console.log(`\n### Veredicto (criterio fijado antes de correr)\n`);
  console.log(`   (a) monótona entre terciles : ${monotona ? "SÍ" : "NO"}  (${medias.map((m) => m.toFixed(2) + "%").join(" → ")})`);
  console.log(`   (b) el régimen bueno pasa OOS: ${oosPos ? "SÍ" : "NO"}`);
  console.log(`   (c) menos catástrofes (−15% al menos): ${colaMejor ? "SÍ" : "NO"}  (${(catNeg * 100).toFixed(1)}% → ${(catPos * 100).toFixed(1)}%)`);
  const sirve = monotona && oosPos && colaMejor;
  console.log(`\n   → ${sirve ? "EL RÉGIMEN DE GAMMA APORTA: operar solo con gamma positiva mejora y reduce la cola." : "NO aporta lo suficiente: no cumple los tres criterios."}`);

  if (medias[2] > 0) {
    const opsAño = grupos[2][1].length / AÑOS;
    console.log(`\n   Si se operara SOLO el tercio de gamma más positiva:`);
    console.log(`     ${Math.round(opsAño)} ops/año × $${(medias[2] / 100 * RIESGO).toFixed(0)} = $${Math.round(opsAño * medias[2] / 100 * RIESGO).toLocaleString("en-US")}/año`);
    const opsTodas = ops.length / AÑOS, mTodas = media(ops.map((x) => x.pnl)) * 100;
    console.log(`     contra operarlo todo: ${Math.round(opsTodas)} × $${(mTodas / 100 * RIESGO).toFixed(0)} = $${Math.round(opsTodas * mTodas / 100 * RIESGO).toLocaleString("en-US")}/año`);
  }
})();
