// Chequeo de confianza (PILOTO) — mide el hit rate por sub-agente reusando la lógica EXACTA de Eva.
//
// Para cada ticker: baja el flujo histórico (fetchFlow), clasifica (classifyFlow), y con evaluateFlow
// mide si el precio VALIDÓ la dirección de cada flujo. Luego agrupa por señal de cada sub-agente
// (agresividad, inusualidad, convicción/delta, tamaño) y saca el hit rate por banda.
//
// Rate-limited a propósito: key compartida (Wally + worker de /ideas). Piloto pequeño y honesto.
// Uso: node --env-file=.env.local scripts/... (via tsx). Config por env: BT_TICKERS, BT_DAYS, BT_MIN_PREMIUM.

import { writeFileSync } from "node:fs";
import { fetchFlow } from "../lib/massiveFlow";
import { classifyFlow, unusualTradeScore, type FlowRow } from "../lib/flow";
import { evaluateFlow, adaptiveThreshold, HORIZON_SESSIONS, type FlowLite, type ValBar } from "../lib/validation";
import { fetchDailyBars } from "../lib/massive";

const TICKERS = (process.env.BT_TICKERS || "AAPL,NVDA,QQQ").split(",").map((t) => t.trim()).filter(Boolean);
const DAYS = Number(process.env.BT_DAYS) || 30;
const MIN_PREMIUM = Number(process.env.BT_MIN_PREMIUM) || 1_000_000;
const OUT = process.env.BT_OUT || "scripts/backtest-reporte.md";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toLite(r: FlowRow): FlowLite {
  return {
    id: r.id, timestamp: r.timestamp, type: r.type, strike: r.strike,
    expiration: r.expiration, assetPrice: r.assetPrice, premium: r.premium, aggression: r.aggression,
  };
}

interface Scored { validated: boolean; resolved: boolean; row: FlowRow; unusual: number; }

async function forTicker(ticker: string): Promise<Scored[]> {
  const { trades } = await fetchFlow(ticker, {
    targetDays: DAYS, minPremium: MIN_PREMIUM, contractCap: 25, maxPages: 6,
  });
  const now = new Date();
  const { rows } = classifyFlow(trades, now);
  const bars = (await fetchDailyBars(ticker, 260)) as ValBar[]; // {time,high,low,close} compatible
  const thr = adaptiveThreshold(bars);
  const out: Scored[] = [];
  for (const r of rows) {
    if (!(r.assetPrice > 0)) continue;
    const oc = evaluateFlow(toLite(r), bars, now, thr, HORIZON_SESSIONS);
    if (oc.direction === "neutral") continue;
    out.push({ validated: oc.validated, resolved: oc.resolved, row: r, unusual: unusualTradeScore(r).total });
  }
  return out;
}

interface Rate { n: number; hit: number | null; }
function rate(items: Scored[]): Rate {
  const resolved = items.filter((s) => s.resolved);
  if (resolved.length === 0) return { n: 0, hit: null };
  const val = resolved.filter((s) => s.validated).length;
  return { n: resolved.length, hit: Math.round((val / resolved.length) * 100) };
}
const pct = (r: Rate) => (r.hit == null ? "—" : `${r.hit}%`);

(async () => {
  console.log(`Backtest piloto · tickers=${TICKERS.join(",")} · días=${DAYS} · minPremium=$${(MIN_PREMIUM / 1e6).toFixed(1)}M`);
  const all: Scored[] = [];
  for (const t of TICKERS) {
    try {
      const s = await forTicker(t);
      all.push(...s);
      console.log(`[${t}] flujos: ${s.length} · resueltos: ${s.filter((x) => x.resolved).length}`);
    } catch (e) {
      console.error(`[${t}] ERROR:`, (e as Error).message);
    }
    await sleep(2500); // buen ciudadano en la key compartida
  }

  const overall = rate(all);
  const byAgg = {
    ask: rate(all.filter((s) => s.row.aggression === "ask")),
    bid: rate(all.filter((s) => s.row.aggression === "bid")),
    mid: rate(all.filter((s) => s.row.aggression === "mid")),
  };
  const unusualHi = rate(all.filter((s) => s.unusual >= 7));
  const unusualLo = rate(all.filter((s) => s.unusual < 7));
  const convHi = rate(all.filter((s) => Math.abs(s.row.delta) >= 0.6));
  const convLo = rate(all.filter((s) => Math.abs(s.row.delta) < 0.6));
  const big = rate(all.filter((s) => s.row.premium >= 5_000_000));
  const small = rate(all.filter((s) => s.row.premium < 5_000_000));

  const totalResolved = all.filter((s) => s.resolved).length;

  const md = `# Chequeo de confianza — reporte PILOTO

**Qué mide:** por cada flujo histórico, ¿el precio **validó** su dirección (se movió a favor antes que en contra) en las siguientes ${HORIZON_SESSIONS} sesiones? Reusa la lógica exacta de Eva (\`classifyFlow\` + \`evaluateFlow\`).

**Muestra:** tickers ${TICKERS.join(", ")} · ventana ${DAYS} días · premium ≥ $${(MIN_PREMIUM / 1e6).toFixed(1)}M · **${totalResolved} flujos resueltos** (con tiempo suficiente para juzgar).

## Línea base
- Hit rate global: **${pct(overall)}** (${overall.n} flujos). Un 50% = moneda al aire.

## Por señal de sub-agente (hit rate por banda)

| Señal | Banda | Hit rate | n |
|---|---|---|---|
| **Agresividad** | Compra al ask | ${pct(byAgg.ask)} | ${byAgg.ask.n} |
| | Venta al bid | ${pct(byAgg.bid)} | ${byAgg.bid.n} |
| | Al medio (mid) | ${pct(byAgg.mid)} | ${byAgg.mid.n} |
| **Inusualidad** | Score ≥ 7 (institucional) | ${pct(unusualHi)} | ${unusualHi.n} |
| | Score < 7 | ${pct(unusualLo)} | ${unusualLo.n} |
| **Convicción (delta)** | \\|delta\\| ≥ 0.60 (direccional) | ${pct(convHi)} | ${convHi.n} |
| | \\|delta\\| < 0.60 | ${pct(convLo)} | ${convLo.n} |
| **Tamaño** | ≥ $5M | ${pct(big)} | ${big.n} |
| | < $5M | ${pct(small)} | ${small.n} |

**Cómo leerlo:** si una banda "buena" (ask, inusualidad alta, delta alta, grande) tiene hit rate MAYOR que su banda opuesta, esa señal **sí tiene poder predictivo** en esta muestra. Si son parecidas, la señal no separa (aún).

## Caveats honestos
- Es un **PILOTO** (muestra chica por el rate-limit de la key compartida). Los números pueden moverse con más datos.
- Solo cuentan flujos con ≥${HORIZON_SESSIONS} sesiones adelante para juzgarlos (los muy recientes no resuelven).
- **Estructura** y **Contexto IV** son señales de CONTEXTO (no por-flujo): necesitan un estudio aparte, no salen aquí.
- **Confirmación de Precio** ES esta medición (el outcome), no un predictor separado.
- Un backtest a gran escala (más tickers, ventana más larga, fuera de horario) refina esto.

_Generado por scripts/backtest.ts — no es consejo, es medición honesta contra lo que el precio hizo._
`;

  writeFileSync(OUT, md, "utf-8");
  console.log("=== JSON ===");
  console.log(JSON.stringify({ overall, byAgg, unusualHi, unusualLo, convHi, convLo, big, small, totalResolved }, null, 1));
  console.log("=== reporte escrito en", OUT, "===");
})();
