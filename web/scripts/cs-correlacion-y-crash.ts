// ¿CUÁNTO DUELE CUANDO CAEN JUNTAS? — correlación entre posiciones y comportamiento en crash.
//
// El +1,31% de 21d @1,5σ trata las 960 operaciones como si fueran apuestas independientes. NO LO
// SON: a 21 días hay ~18 abiertas a la vez, todas cortas de volatilidad sobre el mismo mercado.
// Un desplome las toca TODAS. El "$3.350/año" no dice nada de eso.
//
// Aquí se mide lo que falta antes de ampliar a 25 tickers:
//   1. La CURVA DE CAPITAL real, respetando el solapamiento: cada día se arriesga en las
//      posiciones vivas, no de una en una.
//   2. La caída máxima y el peor mes.
//   3. Qué pasó en los tramos malos que SÍ tenemos (el bear de 2022, abril 2025).
//   4. Correlación media entre los resultados de posiciones que estaban abiertas a la vez.
//
// Uso: node --import tsx scripts/cs-correlacion-y-crash.ts

import { readFileSync, readdirSync } from "node:fs";
import { classifyFlow } from "../lib/flow";
import { signals, WIDTH_EM, barIdxOnOrAfter, type DBar } from "../lib/backtestCore";

const BASE = process.env.THETA_BASE || "http://127.0.0.1:25503";
const DIR = "scripts/cache-theta", CDIR = `${DIR}/cadenas`;
const TICKERS = ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "META", "TSLA", "AMD"];
const DTE = 21, DIST = 1.5;
const COMM = 0.03, CUENTA = 60_000, RIESGO_OP = 1200;

const leer = <T,>(p: string): T | null => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const media = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const limpia = (s: string) => (s ?? "").replace(/"/g, "").trim();
type CadenaDia = Record<string, Record<string, [number, number]>>;

interface Pos { t: string; abre: string; cierra: string; r: number }

(async () => {
  const pos: Pos[] = [];
  for (const t of TICKERS) {
    const trozos: DBar[] = [];
    for (const f of readdirSync(DIR)) if (f.startsWith(`${t}_barsPAR_y_`)) for (const x of leer<DBar[]>(`${DIR}/${f}`) ?? []) trozos.push(x);
    const bars = [...new Map(trozos.map((x) => [x.time, x] as const)).values()].sort((a, b) => (a.time < b.time ? -1 : 1));
    const trades: unknown[] = [];
    for (const f of readdirSync(DIR)) if (f.startsWith(`${t}_y_`) && f.endsWith(".json")) { const y = leer<unknown[]>(`${DIR}/${f}`); if (y?.length) trades.push(...y); }
    if (bars.length < 300 || !trades.length) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sigs = signals(classifyFlow(trades as any, new Date()).rows, bars);
    const k3 = Math.floor(sigs.length / 3);
    const top = [...sigs].sort((a, b) => a.evaComp - b.evaComp).slice(sigs.length - k3)
      .filter((s) => s.ivRatio < 1.1 && bars[s.entryIdx].time >= "2022-01-01");

    let exps: string[] = [];
    try {
      const r = await fetch(`${BASE}/v3/option/list/expirations?symbol=${t}`, { signal: AbortSignal.timeout(60_000) });
      if (r.ok) { const l = (await r.text()).trim().split("\n"); const i = l[0].split(",").map((x) => x.trim()).indexOf("expiration");
        if (i >= 0) exps = l.slice(1).map((x) => limpia(x.split(",")[i] ?? "").replace(/-/g, "")).filter((x) => x.length === 8).sort(); }
    } catch { /* */ }
    if (!exps.length) continue;

    for (const sig of top) {
      const entrada = bars[sig.entryIdx].time.replace(/-/g, "");
      const cad = leer<CadenaDia>(`${CDIR}/${t}_d${entrada}.json`);
      if (!cad) continue;
      const obj = new Date(Date.parse(`${bars[sig.entryIdx].time}T12:00:00Z`) + DTE * 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
      const exp = exps.find((e) => e >= obj);
      if (!exp || !cad[exp]) continue;
      const expIdx = barIdxOnOrAfter(bars, Date.parse(`${exp.slice(0, 4)}-${exp.slice(4, 6)}-${exp.slice(6, 8)}T20:00:00Z`));
      if (expIdx < 0) continue;
      const bull = sig.dir === 1, right = bull ? "P" : "C";
      const em = sig.spot * sig.rv * Math.sqrt(DTE / 365);
      if (!(em > 0)) continue;
      const ks = Object.keys(cad[exp]).filter((x) => x.endsWith(`|${right}`)).map((x) => Number(x.split("|")[0])).sort((a, b) => a - b);
      if (ks.length < 5) continue;
      const cerca = (arr: number[], x: number) => arr.reduce((b, k) => (Math.abs(k - x) < Math.abs(b - x) ? k : b), arr[0]);
      const kC = cerca(ks, bull ? sig.spot - DIST * em : sig.spot + DIST * em);
      const cand = ks.filter((x) => (bull ? x < kC : x > kC));
      if (!cand.length) continue;
      const kL = cerca(cand, bull ? kC - WIDTH_EM * em : kC + WIDTH_EM * em);
      if (kC === kL) continue;
      const q1 = cad[exp][`${kC}|${right}`], q2 = cad[exp][`${kL}|${right}`];
      if (!q1 || !q2) continue;
      const credito = (q1[0] + q1[1]) / 2 - (q2[0] + q2[1]) / 2 - (COMM * 2) / 100;
      const ancho = Math.abs(kL - kC), riesgo = ancho - credito;
      if (!(credito > 0) || !(riesgo > 0)) continue;
      const sExp = bars[expIdx].close;
      const perd = bull ? Math.max(kC - sExp, 0) - Math.max(kL - sExp, 0) : Math.max(sExp - kC, 0) - Math.max(sExp - kL, 0);
      pos.push({ t, abre: entrada, cierra: exp, r: (credito - perd) / riesgo });
    }
  }
  pos.sort((a, b) => (a.abre < b.abre ? -1 : 1));
  console.log(`\n## CORRELACIÓN Y CRASH · ${DTE}d @${DIST}σ · ${pos.length} posiciones\n`);
  if (pos.length < 300) { console.log("muestra insuficiente"); return; }

  // ── 1. Solapamiento real ────────────────────────────────────────────────────────────────
  const fechas = [...new Set(pos.flatMap((p) => [p.abre, p.cierra]))].sort();
  const vivasEn = (f: string) => pos.filter((p) => p.abre <= f && p.cierra > f);
  const sim = fechas.map((f) => vivasEn(f).length);
  console.log(`### Solapamiento\n`);
  console.log(`   posiciones abiertas a la vez: media ${media(sim).toFixed(1)} · máximo **${Math.max(...sim)}**`);
  console.log(`   colateral en el pico: $${(Math.max(...sim) * RIESGO_OP).toLocaleString("en-US")} sobre una cuenta de $${CUENTA.toLocaleString("en-US")}`);
  if (Math.max(...sim) * RIESGO_OP > CUENTA) console.log(`   ⚠ NO CABE: al 2% por operación el pico pide más colateral del que hay.`);

  // ── 2. Correlación entre las que estaban abiertas a la vez ──────────────────────────────
  // Se agrupan por fecha de cierre: las que vencen el mismo día vivieron el mismo mercado.
  const porCierre = new Map<string, number[]>();
  for (const p of pos) { if (!porCierre.has(p.cierra)) porCierre.set(p.cierra, []); porCierre.get(p.cierra)!.push(p.r); }
  const grupos = [...porCierre.values()].filter((g) => g.length >= 3);
  const mediaGlobal = media(pos.map((p) => p.r));
  // Si fueran independientes, la media de cada grupo variaría poco; si van juntas, mucho.
  const dispGrupos = Math.sqrt(media(grupos.map((g) => (media(g) - mediaGlobal) ** 2)));
  const dispIndiv = Math.sqrt(media(pos.map((p) => (p.r - mediaGlobal) ** 2)));
  const nMedio = media(grupos.map((g) => g.length));
  const esperadoSiIndep = dispIndiv / Math.sqrt(nMedio);
  console.log(`\n### ¿Caen juntas?\n`);
  console.log(`   ${grupos.length} grupos de posiciones que vencen el mismo día (${nMedio.toFixed(1)} de media)`);
  console.log(`   dispersión REAL entre grupos      : ${(dispGrupos * 100).toFixed(2)}%`);
  console.log(`   dispersión si fueran independientes: ${(esperadoSiIndep * 100).toFixed(2)}%`);
  const factor = dispGrupos / esperadoSiIndep;
  console.log(`   → factor ${factor.toFixed(2)}×  ${factor > 1.5 ? "— SÍ van juntas: el riesgo real es MAYOR de lo que sugiere la media" : "— apenas se mueven juntas"}`);

  // ── 3. La curva de capital, respetando el solapamiento ─────────────────────────────────
  const porMes = new Map<string, number[]>();
  for (const p of pos) { const m = `${p.cierra.slice(0, 4)}-${p.cierra.slice(4, 6)}`; if (!porMes.has(m)) porMes.set(m, []); porMes.get(m)!.push(p.r); }
  const meses = [...porMes.entries()].sort();
  let c = CUENTA, pico = CUENTA, ddMax = 0; let peorMes = ["", 0] as [string, number];
  const curva: [string, number][] = [];
  for (const [m, rs] of meses) {
    const pnl = rs.reduce((s, x) => s + x * RIESGO_OP, 0);
    c += pnl; pico = Math.max(pico, c); ddMax = Math.max(ddMax, (pico - c) / pico);
    if (pnl < peorMes[1]) peorMes = [m, pnl];
    curva.push([m, c]);
  }
  console.log(`\n### La cuenta mes a mes (riesgo fijo de $${RIESGO_OP} por operación)\n`);
  console.log(`   final $${Math.round(c).toLocaleString("en-US")} desde $${CUENTA.toLocaleString("en-US")} en ${meses.length} meses`);
  console.log(`   **caída máxima ${(ddMax * 100).toFixed(1)}%**  ·  peor mes ${peorMes[0]}: $${Math.round(peorMes[1]).toLocaleString("en-US")}`);
  const negativos = meses.filter(([, rs]) => rs.reduce((s, x) => s + x, 0) < 0).length;
  console.log(`   meses negativos: ${negativos}/${meses.length} (${((negativos / meses.length) * 100).toFixed(0)}%)`);

  // ── 4. Los tramos malos que SÍ tenemos ─────────────────────────────────────────────────
  console.log(`\n### Los tramos malos del periodo\n`);
  for (const [nom, ini, fin] of [["bear de 2022", "202201", "202211"], ["abril 2025", "202503", "202506"], ["resto", "", ""]] as const) {
    const sub = nom === "resto"
      ? pos.filter((p) => !(p.cierra >= "202201" && p.cierra <= "202211") && !(p.cierra >= "202503" && p.cierra <= "202506"))
      : pos.filter((p) => p.cierra >= ini && p.cierra <= fin);
    if (sub.length < 20) { console.log(`   ${nom}: solo ${sub.length} posiciones`); continue; }
    const m = media(sub.map((x) => x.r)) * 100;
    const cat = (sub.filter((x) => x.r <= -0.5).length / sub.length) * 100;
    console.log(`   ${nom.padEnd(14)} ${m >= 0 ? "+" : ""}${m.toFixed(2)}%  ·  catástrofes ${cat.toFixed(1)}%  ·  n=${sub.length}`);
  }
  console.log(`\n   El periodo NO tiene COVID ni 2008. A 21 días la posición está expuesta mucho más`);
  console.log(`   tiempo que a 5, así que un crash de verdad pegaría más fuerte que nada de esto.`);
})();
