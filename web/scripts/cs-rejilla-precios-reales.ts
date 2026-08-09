// IDEA 2 — LA REJILLA COMPLETA (plazo × distancia) CON PRECIOS REALES.
//
// Todo el barrido de plazos y distancias se hizo con Black-Scholes, y ese modelo ya demostró que
// miente: da +3,20% donde los precios reales dan −2,53%. Con precios reales solo hemos medido
// UNA celda (5d @1σ). Puede que a más plazo, o más lejos, el spread pese menos sobre la prima.
//
// EL TRUCO QUE LO HACE RÁPIDO: el endpoint EOD devuelve la CADENA ENTERA de una expiración en
// una sola petición (822 filas, 113 KB para NVDA a 5 días). Así que se descarga UNA vez por
// (ticker, expiración) y de ahí salen TODOS los plazos y TODAS las distancias. ~2.000 peticiones
// en vez de ~37.000.
//
// Uso: node --import tsx scripts/cs-rejilla-precios-reales.ts [ticker...]

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { classifyFlow } from "../lib/flow";
import { signals, WIDTH_EM, barIdxOnOrAfter, type DBar } from "../lib/backtestCore";

const BASE = process.env.THETA_BASE || "http://127.0.0.1:25503";
const DIR = "scripts/cache-theta";
const CDIR = `${DIR}/cadenas`;
const TICKERS = process.argv.slice(2).length ? process.argv.slice(2) : ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "META", "TSLA", "AMD"];
const DTES = [10, 21, 30];
// Se extiende MAS ALLA de 2s: en la primera rejilla el resultado seguia mejorando al
// llegar a 2s en 5d y 10d, y 2s era el BORDE. Un optimo en el borde no es un optimo.
const DISTS = [1.25, 1.5, 2.0, 2.5, 3.0];
// ROBINHOOD: $0 de comision, ~$0,03 de tasas por contrato. Ver CLAUDE.md.
const RIESGO = 1200, COMM = Number(process.env.CS_COMM ?? 0.03), CATASTROFE = -0.5;
const CONC = 4;

const leer = <T,>(p: string): T | null => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const media = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const limpia = (s: string) => (s ?? "").replace(/"/g, "").trim();
const ymdDe = (iso: string) => iso.replace(/-/g, "");

async function pMap<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    for (;;) { const k = i++; if (k >= items.length) return; out[k] = await fn(items[k]); }
  }));
  return out;
}

/** fecha → "strike|C/P" → [bid, ask]. Toda la cadena de una expiración, por día. */
type Cadena = Record<string, Record<string, [number, number]>>;

// UNA peticion por (ticker, DIA DE ENTRADA) con expiration=*: devuelve TODAS las expiraciones y
// TODOS los strikes de ese dia (14.020 filas para SPY, 6,5s). De ahi salen los 4 plazos y las 5
// distancias a la vez.
//
// La primera version pedia una cadena por (ticker, expiracion) cubriendo entrada->vencimiento.
// Para 45 dias eso son 45 dias x cadena entera y tardaba 9s POR CADENA -> 2,2 horas. Y era
// desperdicio: el vencimiento se liquida con el cierre del SUBYACENTE, no con quotes, asi que
// del rango entero solo se usaba el primer dia.
type CadenaDia = Record<string, Record<string, [number, number]>>;   // exp -> "strike|C/P" -> [bid, ask]
async function cadenaDelDia(sym: string, dia: string): Promise<CadenaDia> {
  if (!existsSync(CDIR)) mkdirSync(CDIR, { recursive: true });
  const f = `${CDIR}/${sym}_d${dia}.json`;
  const hit = leer<CadenaDia>(f);
  if (hit) return hit;
  const out: CadenaDia = {};
  try {
    const r = await fetch(`${BASE}/v3/option/history/eod?symbol=${sym}&expiration=*&start_date=${dia}&end_date=${dia}`,
      { signal: AbortSignal.timeout(120_000) });
    if (r.ok) {
      const l = (await r.text()).trim().split("\n");
      if (l.length > 1) {
        const h = l[0].split(",").map((x) => x.trim());
        const iE = h.indexOf("expiration"), iK = h.indexOf("strike"), iR = h.indexOf("right"), iB = h.indexOf("bid"), iA = h.indexOf("ask");
        if (iE >= 0 && iK >= 0 && iB >= 0 && iA >= 0) {
          for (let j = 1; j < l.length; j++) {
            const c = l[j].split(",");
            const exp = limpia(c[iE]).replace(/-/g, "");
            const b = Number(limpia(c[iB])), a = Number(limpia(c[iA]));
            const K = Number(limpia(c[iK])), right = limpia(c[iR] ?? "").toUpperCase().startsWith("C") ? "C" : "P";
            if (exp.length !== 8 || !(K > 0) || !(b > 0) || !(a > 0) || a < b) continue;
            (out[exp] ??= {})[`${K}|${right}`] = [b, a];
          }
        }
      }
    }
  } catch { /* dia vacio */ }
  if (Object.keys(out).length) writeFileSync(f, JSON.stringify(out), "utf8");
  return out;
}

async function cadenaDe(sym: string, exp: string, desde: string): Promise<Cadena> {
  if (!existsSync(CDIR)) mkdirSync(CDIR, { recursive: true });
  const f = `${CDIR}/${sym}_${exp}.json`;
  const hit = leer<Cadena>(f);
  if (hit) return hit;
  const out: Cadena = {};
  try {
    const r = await fetch(`${BASE}/v3/option/history/eod?symbol=${sym}&expiration=${exp}&start_date=${desde}&end_date=${exp}`,
      { signal: AbortSignal.timeout(90_000) });
    if (r.ok) {
      const l = (await r.text()).trim().split("\n");
      if (l.length > 1) {
        const h = l[0].split(",").map((x) => x.trim());
        const iK = h.indexOf("strike"), iR = h.indexOf("right"), iF = h.indexOf("created"), iB = h.indexOf("bid"), iA = h.indexOf("ask");
        if (iK >= 0 && iF >= 0 && iB >= 0 && iA >= 0) {
          for (let j = 1; j < l.length; j++) {
            const c = l[j].split(",");
            const fecha = limpia(c[iF]).slice(0, 10).replace(/-/g, "");
            const b = Number(limpia(c[iB])), a = Number(limpia(c[iA]));
            const K = Number(limpia(c[iK])), right = limpia(c[iR] ?? "").toUpperCase().startsWith("C") ? "C" : "P";
            if (!fecha || !(K > 0) || !(b > 0) || !(a > 0) || a < b) continue;
            (out[fecha] ??= {})[`${K}|${right}`] = [b, a];
          }
        }
      }
    }
  } catch { /* cadena vacía */ }
  if (Object.keys(out).length) writeFileSync(f, JSON.stringify(out), "utf8");
  return out;
}

interface Celda { dte: number; dist: number; rets: { ms: number; r: number; t: string }[] }

(async () => {
  const celdas = new Map<string, Celda>();
  for (const d of DTES) for (const s of DISTS) celdas.set(`${d}|${s}`, { dte: d, dist: s, rets: [] });

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
      .filter((s) => s.ivRatio < 1.1 && bars[s.entryIdx].time >= (process.env.CS_DESDE ?? "2022-01-01"));
    if (!top.length) continue;

    // Expiraciones listadas, una sola vez por ticker.
    let exps: string[] = [];
    try {
      const r = await fetch(`${BASE}/v3/option/list/expirations?symbol=${t}`, { signal: AbortSignal.timeout(60_000) });
      if (r.ok) {
        const l = (await r.text()).trim().split("\n");
        const i = l[0].split(",").map((x) => x.trim()).indexOf("expiration");
        if (i >= 0) exps = l.slice(1).map((x) => limpia(x.split(",")[i] ?? "").replace(/-/g, "")).filter((x) => x.length === 8).sort();
      }
    } catch { /* sin expiraciones */ }
    if (!exps.length) continue;

    // ── Se descarga UNA cadena por (expiración, fecha de entrada más temprana que la use) ──
    const necesarias = new Map<string, string>();     // exp → fecha más temprana
    const plan: { sig: typeof top[0]; dte: number; exp: string; expIdx: number; entrada: string }[] = [];
    for (const sig of top) {
      const entrada = ymdDe(bars[sig.entryIdx].time);
      for (const dte of DTES) {
        const obj = new Date(Date.parse(`${bars[sig.entryIdx].time}T12:00:00Z`) + dte * 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
        const exp = exps.find((e) => e >= obj);
        if (!exp) continue;
        const expIdx = barIdxOnOrAfter(bars, Date.parse(`${exp.slice(0, 4)}-${exp.slice(4, 6)}-${exp.slice(6, 8)}T20:00:00Z`));
        if (expIdx < 0) continue;
        plan.push({ sig, dte, exp, expIdx, entrada });
        const prev = necesarias.get(exp);
        if (!prev || entrada < prev) necesarias.set(exp, entrada);
      }
    }

    // UNA petición por DÍA DE ENTRADA (expiration=*), no por expiración. De cada día salen los
    // 4 plazos y las 5 distancias, porque la respuesta trae la cadena entera.
    let n = 0;
    const dias = [...new Set(plan.map((p) => p.entrada))].sort();
    const porDia = new Map<string, CadenaDia>();
    await pMap(dias, CONC, async (d) => {
      porDia.set(d, await cadenaDelDia(t, d));
      if (++n % 20 === 0) process.stdout.write(`\r  ${t}: ${n}/${dias.length} días…`);
    });

    let usadas = 0;
    for (const p of plan) {
      const dia = porDia.get(p.entrada)?.[p.exp];
      if (!dia) continue;
      const bull = p.sig.dir === 1;
      const right = bull ? "P" : "C";
      const strikes = Object.keys(dia).filter((x) => x.endsWith(`|${right}`)).map((x) => Number(x.split("|")[0])).sort((a, b) => a - b);
      if (strikes.length < 5) continue;
      const em = p.sig.spot * p.sig.rv * Math.sqrt(p.dte / 365);
      if (!(em > 0)) continue;
      const sExp = bars[p.expIdx].close;

      for (const dist of DISTS) {
        const cerca = (arr: number[], x: number) => arr.reduce((b, k) => (Math.abs(k - x) < Math.abs(b - x) ? k : b), arr[0]);
        const kC = cerca(strikes, bull ? p.sig.spot - dist * em : p.sig.spot + dist * em);
        const cand = strikes.filter((x) => (bull ? x < kC : x > kC));
        if (!cand.length) continue;
        const kL = cerca(cand, bull ? kC - WIDTH_EM * em : kC + WIDTH_EM * em);
        if (kC === kL) continue;
        const q1 = dia[`${kC}|${right}`], q2 = dia[`${kL}|${right}`];
        if (!q1 || !q2) continue;
        const credito = (q1[0] + q1[1]) / 2 - (q2[0] + q2[1]) / 2 - (COMM * 2) / 100;
        const ancho = Math.abs(kL - kC);
        const riesgo = ancho - credito;
        if (!(credito > 0) || !(riesgo > 0)) continue;
        const perd = bull ? Math.max(kC - sExp, 0) - Math.max(kL - sExp, 0) : Math.max(sExp - kC, 0) - Math.max(sExp - kL, 0);
        celdas.get(`${p.dte}|${dist}`)!.rets.push({ ms: p.sig.entryMs, r: (credito - perd) / riesgo, t });
        usadas++;
      }
    }
    console.log(`\r  ${t}: ${dias.length} días · ${usadas} celdas rellenadas`);
  }

  console.log(`\n## REJILLA COMPLETA CON PRECIOS REALES · plazo × distancia\n`);
  console.log(`Media por operación. Entre paréntesis, n. **Negrita** si es positivo en las DOS mitades.\n`);
  console.log(`| Plazo | ${DISTS.map((d) => `${d.toFixed(2)}σ`).join(" | ")} |`);
  console.log(`|---|${DISTS.map(() => "---").join("|")}|`);
  const buenas: string[] = [];
  for (const dte of DTES) {
    const fila: string[] = [];
    for (const dist of DISTS) {
      const c = celdas.get(`${dte}|${dist}`)!;
      if (c.rets.length < 150) { fila.push("—"); continue; }
      const o = [...c.rets].sort((a, b) => a.ms - b.ms);
      const mid = Math.floor(o.length / 2);
      const m = media(o.map((x) => x.r)) * 100;
      const v = media(o.slice(0, mid).map((x) => x.r)) * 100, n2 = media(o.slice(mid).map((x) => x.r)) * 100;
      const ok = v > 0 && n2 > 0;
      if (ok) buenas.push(`${dte}d @${dist}σ: ${m.toFixed(2)}% (vieja ${v.toFixed(2)}%, nueva ${n2.toFixed(2)}%, n=${o.length})`);
      fila.push(`${ok ? "**" : ""}${m >= 0 ? "+" : ""}${m.toFixed(2)}%${ok ? "**" : ""} (${o.length})`);
    }
    console.log(`| **${dte}d** | ${fila.join(" | ")} |`);
  }
  // ── AUTOPSIA de la mejor celda ──────────────────────────────────────────────────────────
  // Las mismas tres preguntas que tumbaron los hallazgos anteriores:
  //   1. ¿lo deciden cuatro operaciones? (quitar el 1% y el 5% mejores)
  //   2. ¿funciona en varios tickers o lo sostiene uno solo?
  //   3. ¿cuánto se gana de verdad al año?
  let mejorK = "", mejorM = -Infinity;
  for (const [k, c] of celdas) {
    if (c.rets.length < 150) continue;
    const o = [...c.rets].sort((a, b) => a.ms - b.ms);
    const mm = Math.floor(o.length / 2);
    if (media(o.slice(0, mm).map((x) => x.r)) > 0 && media(o.slice(mm).map((x) => x.r)) > 0
      && media(c.rets.map((x) => x.r)) > mejorM) { mejorM = media(c.rets.map((x) => x.r)); mejorK = k; }
  }
  if (mejorK) {
    const c = celdas.get(mejorK)!;
    const rs = [...c.rets].sort((a, b) => a.r - b.r);
    const sinN = (f: number) => { const s = rs.slice(0, Math.floor(rs.length * (1 - f))); return (s.reduce((a, b) => a + b.r, 0) / s.length) * 100; };
    console.log(`\n### AUTOPSIA de la mejor celda — ${c.dte}d @${c.dist}σ\n`);
    console.log(`   media ${(mejorM * 100).toFixed(2)}%  ·  mediana ${(rs[Math.floor(rs.length / 2)].r * 100).toFixed(1)}%  ·  gana el ${((rs.filter((x) => x.r > 0).length / rs.length) * 100).toFixed(0)}%  ·  n=${rs.length}`);
    console.log(`   media SIN el 1% mejor: ${sinN(0.01).toFixed(2)}%     ← si se hunde aquí, lo deciden cuatro operaciones`);
    console.log(`   media SIN el 5% mejor: ${sinN(0.05).toFixed(2)}%`);
    const porT = new Map<string, number[]>();
    for (const x of c.rets) { if (!porT.has(x.t)) porT.set(x.t, []); porT.get(x.t)!.push(x.r); }
    console.log(`\n   Por ticker:`);
    for (const [tk, arr] of [...porT.entries()].sort((a, b) => media(b[1]) - media(a[1]))) {
      console.log(`     ${tk.padEnd(5)} ${(media(arr) * 100).toFixed(2).padStart(7)}%   (n=${arr.length})`);
    }
    console.log(`\n   → positivo en ${[...porT.values()].filter((a) => media(a) > 0).length}/${porT.size} tickers`);
    const span = (Math.max(...c.rets.map((x) => x.ms)) - Math.min(...c.rets.map((x) => x.ms))) / (365.25 * 86_400_000);
    const opsAño = c.rets.length / Math.max(0.5, span);
    console.log(`   → ${Math.round(opsAño)} ops/año × $${(mejorM * RIESGO).toFixed(2)} = $${Math.round(opsAño * mejorM * RIESGO).toLocaleString("en-US")}/año  ·  ${((opsAño * mejorM * RIESGO) / 60000 * 100).toFixed(1)}% sobre $60.000`);
  }

  console.log(`\n### Celdas positivas en las DOS mitades\n`);
  if (!buenas.length) console.log(`   NINGUNA. El vehículo no funciona en ningún plazo ni distancia con precios reales.`);
  else for (const b of buenas) console.log(`   · ${b}`);
})();
