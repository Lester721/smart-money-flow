// AUDITORÍA del backtest (protocolo obligatorio de CLAUDE.md).
//
// Reconstruye las señales con EXACTAMENTE el mismo código que el backtest (lib/backtestCore),
// no con una copia, y responde las preguntas que el reporte no contesta:
//
//   1. ¿Cómo se reparten las señales por AÑO? ¿Hay muestra en el crash de 2020?
//   2. ¿En qué FECHA cae el corte OOS? (se parte por CANTIDAD de señales, no por calendario:
//      como el flujo crece con los años, la "mitad vieja" puede llegar mucho más tarde de lo
//      que uno supone — y de ahí salen afirmaciones falsas tipo "la mitad vieja incluye COVID")
//   3. ¿Cuántas señales del Top⅓ caen DENTRO del crash, y cómo les fue?
//   4. ¿Por qué hay menos señales que días con flujo?
//
// Uso: DATA_PROVIDER=theta BT_SPOT=parity npx tsx scripts/auditar-backtest.ts

import { readFileSync } from "node:fs";
import { classifyFlow } from "../lib/flow";
import { signals, creditSpreadPnl, type DBar, type Signal, type MotivosDescarte } from "../lib/backtestCore";

const TICKERS = (process.env.BT_TICKERS || "SPY,AAPL,MSFT,NVDA,META,TSLA,AMD,QQQ,HOOD").split(",");
const BT_START = process.env.BT_START || "20160101";
const BT_END = process.env.BT_END || "20260731";
const SPOT_SRC = (process.env.BT_SPOT || "parity").toLowerCase();
const DIR = "scripts/cache-theta";

// El crash: del máximo (19 feb 2020) al fondo (23 mar 2020), con margen para las que
// seguían abiertas cuando reventó.
const CRASH_INI = "2020-02-01", CRASH_FIN = "2020-04-30";

const shiftYmd = (y: string, d: number) =>
  new Date(Date.parse(`${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}T00:00:00Z`) + d * 86_400_000)
    .toISOString().slice(0, 10).replace(/-/g, "");

function yearWindows(s0: string, e0: string): [string, string][] {
  const out: [string, string][] = [];
  let s = s0;
  while (Number(s) <= Number(e0)) {
    const e = String(Math.min(Number(`${s.slice(0, 4)}1231`), Number(e0)));
    out.push([s, e]); s = `${Number(s.slice(0, 4)) + 1}0101`;
  }
  return out;
}
const leer = <T,>(p: string): T | null => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

(async () => {
  const todas: { sig: Signal; bars: DBar[]; ticker: string }[] = [];
  const cobertura: { t: string; diasFlujo: number; señales: number; m: MotivosDescarte }[] = [];
  const sufijo = SPOT_SRC === "parity" ? "PAR" : "";
  const vIni = shiftYmd(BT_START, -40), vFin = shiftYmd(BT_END, 220);

  for (const t of TICKERS) {
    const trades: unknown[] = [];
    for (const [ys, ye] of yearWindows(BT_START, BT_END)) {
      const y = leer<unknown[]>(`${DIR}/${t}_y_${ys}_${ye}.json`);
      if (y?.length) trades.push(...y);
    }
    const trozos: DBar[] = [];
    for (const [ys, ye] of yearWindows(vIni, vFin)) {
      const b = leer<DBar[]>(`${DIR}/${t}_bars${sufijo}_y_${ys}_${ye}.json`);
      if (b?.length) trozos.push(...b);
    }
    const porFecha = new Map(trozos.map((x) => [x.time, x] as const));
    const bars = [...porFecha.values()].sort((a, b) => (a.time < b.time ? -1 : 1));
    if (!trades.length || !bars.length) { console.log(`[${t}] sin caché — omitido`); continue; }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = classifyFlow(trades as any, new Date()).rows;
    const m: MotivosDescarte = { sin_barra: 0, sin_20_barras: 0, sin_volatilidad: 0, neto_cero: 0, sin_premium: 0, ok: 0 };
    const sigs = signals(rows, bars, m);
    for (const sig of sigs) todas.push({ sig, bars, ticker: t });
    cobertura.push({ t, diasFlujo: new Set(rows.map((r) => r.timestamp.slice(0, 10))).size, señales: sigs.length, m });
  }

  console.log(`\n=== AUDITORÍA · ${todas.length} señales · precio ${SPOT_SRC} ===\n`);

  // ── 1. Reparto por año ────────────────────────────────────────────────────────────────
  const porAño = new Map<string, number>();
  for (const { sig } of todas) {
    const a = ymd(sig.entryMs).slice(0, 4);
    porAño.set(a, (porAño.get(a) ?? 0) + 1);
  }
  console.log("1. SEÑALES POR AÑO\n");
  console.log("| Año | Señales | % |");
  console.log("|---|---|---|");
  for (const a of [...porAño.keys()].sort()) {
    const n = porAño.get(a)!;
    console.log(`| ${a} | ${n} | ${(n / todas.length * 100).toFixed(1)}% |`);
  }

  // ── 2. Dónde cae el corte OOS (celda 5d @1σ, Top⅓ EVA) ────────────────────────────────
  const rec = todas
    .map(({ sig, bars, ticker }) => ({ eva: sig.evaComp, ms: sig.entryMs, ticker, pnl: creditSpreadPnl(sig, bars, 5, 1) }))
    .filter((x): x is { eva: number; ms: number; ticker: string; pnl: number } => x.pnl != null);
  const k = Math.max(1, Math.floor(rec.length / 3));
  const topEva = [...rec].sort((a, b) => a.eva - b.eva).slice(rec.length - k);
  const orden = [...topEva].sort((a, b) => a.ms - b.ms);
  const mid = Math.floor(orden.length / 2);

  console.log(`\n2. CORTE OOS — celda 5d @1σ, Top⅓ EVA (n=${orden.length})\n`);
  console.log(`   mitad VIEJA: ${ymd(orden[0].ms)} → ${ymd(orden[mid - 1].ms)}`);
  console.log(`   mitad NUEVA: ${ymd(orden[mid].ms)} → ${ymd(orden[orden.length - 1].ms)}`);
  const corte = ymd(orden[mid].ms);
  console.log(`\n   → El corte cae en ${corte}. El crash del COVID (feb-mar 2020) está en la mitad ${corte > "2020-04-30" ? "VIEJA ✅" : "NUEVA ⚠️"}.`);

  // ── 3. Rendimiento DURANTE el crash ───────────────────────────────────────────────────
  const enCrash = topEva.filter((x) => ymd(x.ms) >= CRASH_INI && ymd(x.ms) <= CRASH_FIN);
  const fuera = topEva.filter((x) => !(ymd(x.ms) >= CRASH_INI && ymd(x.ms) <= CRASH_FIN));
  const st = (a: { pnl: number }[]) => {
    if (!a.length) return "sin señales";
    const p = a.map((x) => x.pnl);
    const win = Math.round(p.filter((x) => x > 0).length / p.length * 100);
    const media = (p.reduce((s, x) => s + x, 0) / p.length * 100).toFixed(1);
    const peor = (Math.min(...p) * 100).toFixed(0);
    return `win ${win}% · media ${media}% · peor ${peor}% (n=${p.length})`;
  };
  console.log(`\n3. DENTRO DEL CRASH (${CRASH_INI} → ${CRASH_FIN})\n`);
  console.log(`   en el crash : ${st(enCrash)}`);
  console.log(`   fuera       : ${st(fuera)}`);

  // ── 4. Días con flujo que NO llegan a señal ───────────────────────────────────────────
  console.log("\n4. POR QUÉ SE PIERDEN LOS DÍAS\n");
  console.log("| Ticker | Días | Señal | Sin barra | Sin 20 barras | Sin vol | Neto CERO | Sin premium |");
  console.log("|---|---|---|---|---|---|---|---|");
  const tot: Record<string, number> = { dias: 0, ok: 0, sin_barra: 0, sin_20_barras: 0, sin_volatilidad: 0, neto_cero: 0, sin_premium: 0 };
  for (const c of cobertura) {
    const m = c.m;
    console.log(`| ${c.t} | ${c.diasFlujo} | ${m.ok} | ${m.sin_barra} | ${m.sin_20_barras} | ${m.sin_volatilidad} | ${m.neto_cero} | ${m.sin_premium} |`);
    tot.dias += c.diasFlujo; tot.ok += m.ok; tot.sin_barra += m.sin_barra; tot.sin_20_barras += m.sin_20_barras;
    tot.sin_volatilidad += m.sin_volatilidad; tot.neto_cero += m.neto_cero; tot.sin_premium += m.sin_premium;
  }
  const perdidos = tot.dias - tot.ok;
  console.log(`| **TOTAL** | **${tot.dias}** | **${tot.ok}** | ${tot.sin_barra} | ${tot.sin_20_barras} | ${tot.sin_volatilidad} | ${tot.neto_cero} | ${tot.sin_premium} |`);
  console.log(`\n   Días perdidos: ${perdidos} de ${tot.dias} (${(perdidos / tot.dias * 100).toFixed(0)}%)`);
  console.log("   Reparto de la pérdida:");
  const reparto: [string, number][] = [["sin barra de precio", tot.sin_barra], ["sin 20 barras previas", tot.sin_20_barras], ["sin volatilidad", tot.sin_volatilidad], ["flujo neto CERO", tot.neto_cero], ["sin premium válido", tot.sin_premium]];
  for (const [k, v] of reparto) {
    if (v > 0) console.log(`     ${k.padEnd(24)} ${String(v).padStart(5)}  (${(v / perdidos * 100).toFixed(1)}% de lo perdido)`);
  }
})();
