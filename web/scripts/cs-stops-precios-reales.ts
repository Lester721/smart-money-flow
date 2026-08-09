// STOPS CON PRECIOS REALES — la prueba que nunca se pudo hacer.
//
// Ya probamos stops y gestión, pero valorando la posición cada día con Black-Scholes y la IV DE
// ENTRADA. Eso subestima la pérdida: en un desplome la IV se expande y el spread vale bastante
// más de lo que el modelo dice, así que el stop saltaría antes y peor de lo simulado. Quedó
// escrito como limitación en `creditSpreadPnl` y nunca se pudo medir.
//
// Aquí la posición se valora cada día con el BID/ASK REAL de las dos patas. Sin modelo.
//
// POR QUÉ IMPORTA AHORA: con precios reales la estrategia da −2,53%, y la autopsia dice que la
// mediana es +7,5% y gana el 84% de las veces — lo que la hunde es el 5% de catástrofes. Si un
// stop recorta esa cola, la estrategia vuelve a estar viva. Si no, el vehículo está muerto.
//
// Uso: node --import tsx scripts/cs-stops-precios-reales.ts [ticker...]

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { classifyFlow } from "../lib/flow";
import { signals, WIDTH_EM, barIdxOnOrAfter, type DBar, type Signal } from "../lib/backtestCore";

const BASE = process.env.THETA_BASE || "http://127.0.0.1:25503";
const DIR = "scripts/cache-theta";
const TICKERS = process.argv.slice(2).length ? process.argv.slice(2) : ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "META", "TSLA", "AMD"];
const DTE = 5, SIGMA = 1;
const RIESGO = 1200, COMM = 0.65, CATASTROFE = -0.5;
const CONC = 4;

const leer = <T,>(p: string): T | null => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const media = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const ymdDe = (iso: string) => iso.replace(/-/g, "");
const limpia = (s: string) => (s ?? "").replace(/"/g, "").trim();

async function pMap<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    for (;;) { const k = i++; if (k >= items.length) return; out[k] = await fn(items[k]); }
  }));
  return out;
}

/** Serie DIARIA de [fecha, bid, ask] de un contrato durante la vida de la posición. */
async function serieEod(sym: string, exp: string, strike: number, right: "C" | "P", desde: string, hasta: string): Promise<[string, number, number][]> {
  const url = `${BASE}/v3/option/history/eod?symbol=${sym}&expiration=${exp}&start_date=${desde}&end_date=${hasta}&strike=${strike}&right=${right}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!r.ok) return [];
    const l = (await r.text()).trim().split("\n");
    if (l.length < 2) return [];
    const h = l[0].split(",").map((x) => x.trim());
    const iF = h.indexOf("created"), iB = h.indexOf("bid"), iA = h.indexOf("ask");
    if (iF < 0 || iB < 0 || iA < 0) return [];
    const out: [string, number, number][] = [];
    for (let j = 1; j < l.length; j++) {
      const c = l[j].split(",");
      const f = limpia(c[iF]).slice(0, 10).replace(/-/g, "");
      const b = Number(limpia(c[iB])), a = Number(limpia(c[iA]));
      if (f && b > 0 && a > 0 && a >= b) out.push([f, b, a]);
    }
    return out.sort((x, y) => (x[0] < y[0] ? -1 : 1));
  } catch { return []; }
}

const cacheStrikes = new Map<string, number[]>(), cacheExp = new Map<string, string[]>();
async function listar(url: string, campo: string): Promise<string[]> {
  try {
    const r = await fetch(`${BASE}${url}`, { signal: AbortSignal.timeout(60_000) });
    if (!r.ok) return [];
    const l = (await r.text()).trim().split("\n");
    const i = l[0].split(",").map((x) => x.trim()).indexOf(campo);
    if (i < 0) return [];
    return l.slice(1).map((x) => limpia(x.split(",")[i] ?? ""));
  } catch { return []; }
}
async function strikesDe(s: string, e: string) {
  const k = `${s}|${e}`; const h = cacheStrikes.get(k); if (h) return h;
  const v = (await listar(`/v3/option/list/strikes?symbol=${s}&expiration=${e}`, "strike")).map(Number).filter((x) => x > 0).sort((a, b) => a - b);
  cacheStrikes.set(k, v); return v;
}
async function expsDe(s: string) {
  const h = cacheExp.get(s); if (h) return h;
  const v = (await listar(`/v3/option/list/expirations?symbol=${s}`, "expiration")).map((x) => x.replace(/-/g, "")).filter((x) => x.length === 8).sort();
  cacheExp.set(s, v); return v;
}
const masCercano = (ks: number[], x: number) => ks.reduce((b, k) => (Math.abs(k - x) < Math.abs(b - x) ? k : b), ks[0]);

/** Resultado de una posición bajo una regla de salida. */
function simular(netCredit: number, ancho: number, dias: { valorMid: number; valorSalida: number }[], perdFinal: number, stop: number | null): number {
  const riesgo = ancho - netCredit;
  if (!(riesgo > 0)) return NaN;
  if (stop != null) {
    for (const d of dias) {
      // Se DECIDE con el mid (lo que ves en pantalla) y se SALE al precio malo (recompras al ask
      // la corta, vendes al bid la larga). Decidir y salir al mismo precio sería regalarse el
      // spread justo en el momento en que más ancho está.
      if (netCredit - d.valorMid <= -stop * riesgo) return (netCredit - d.valorSalida) / riesgo;
    }
  }
  return (netCredit - perdFinal) / riesgo;
}

interface Op { ms: number; base: number; conStop: Record<string, number> }
const STOPS: [string, number | null][] = [["sin stop", null], ["50%", 0.5], ["80%", 0.8], ["100%", 1.0], ["150%", 1.5]];

(async () => {
  const todas: Op[] = [];
  for (const t of TICKERS) {
    const cache = `${DIR}/${t}_stopq_.json`;
    const yaC = existsSync(cache) ? (leer<Record<string, [string, number, number][][]>>(cache) ?? {}) : {};
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

    interface Tarea { sig: Signal; fecha: string; exp: string; kC: number; kL: number; tipo: "C" | "P"; expIdx: number }
    const tareas: Tarea[] = [];
    for (const sig of top) {
      const em = sig.spot * sig.rv * Math.sqrt(DTE / 365);
      if (!(em > 0)) continue;
      const bull = sig.dir === 1;
      const obj = new Date(Date.parse(`${bars[sig.entryIdx].time}T12:00:00Z`) + DTE * 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
      const exp = (await expsDe(t)).find((e) => e >= obj);
      if (!exp) continue;
      const expIdx = barIdxOnOrAfter(bars, Date.parse(`${exp.slice(0, 4)}-${exp.slice(4, 6)}-${exp.slice(6, 8)}T20:00:00Z`));
      if (expIdx < 0) continue;
      const ks = await strikesDe(t, exp);
      if (ks.length < 5) continue;
      const kC = masCercano(ks, bull ? sig.spot - SIGMA * em : sig.spot + SIGMA * em);
      const cand = ks.filter((x) => (bull ? x < kC : x > kC));
      if (!cand.length) continue;
      const kL = masCercano(cand, bull ? kC - WIDTH_EM * em : kC + WIDTH_EM * em);
      if (kC === kL) continue;
      tareas.push({ sig, fecha: ymdDe(bars[sig.entryIdx].time), exp, kC, kL, tipo: bull ? "P" : "C", expIdx });
    }

    let n = 0;
    const res = await pMap(tareas, CONC, async (x) => {
      const clave = `${x.fecha}|${x.exp}|${x.kC}|${x.kL}|${x.tipo}`;
      let par = yaC[clave];
      if (!par) {
        par = await Promise.all([
          serieEod(t, x.exp, x.kC, x.tipo, x.fecha, x.exp),
          serieEod(t, x.exp, x.kL, x.tipo, x.fecha, x.exp),
        ]);
        if (par[0].length && par[1].length) yaC[clave] = par;
      }
      if (++n % 60 === 0) process.stdout.write(`\r  ${t}: ${n}/${tareas.length}…`);
      return { x, par };
    });
    writeFileSync(cache, JSON.stringify(yaC), "utf8");

    let ops = 0;
    for (const { x, par } of res) {
      const [sC, sL] = par ?? [];
      if (!sC?.length || !sL?.length) continue;
      const e0 = sC.find((r) => r[0] === x.fecha), l0 = sL.find((r) => r[0] === x.fecha);
      if (!e0 || !l0) continue;
      const netCredit = (e0[1] + e0[2]) / 2 - (l0[1] + l0[2]) / 2 - (COMM * 2) / 100;
      const ancho = Math.abs(x.kL - x.kC);
      if (!(netCredit > 0) || !(ancho - netCredit > 0)) continue;

      // Valor de la posición cada día POSTERIOR a la entrada, hasta el vencimiento.
      const porFecha = new Map(sL.map((r) => [r[0], r] as const));
      const dias: { valorMid: number; valorSalida: number }[] = [];
      for (const [f, bC, aC] of sC) {
        if (f <= x.fecha || f >= x.exp) continue;
        const rL = porFecha.get(f);
        if (!rL) continue;
        dias.push({
          valorMid: (bC + aC) / 2 - (rL[1] + rL[2]) / 2,
          valorSalida: aC - rL[1] + (COMM * 2) / 100,     // recompra al ask, vende al bid
        });
      }
      const sExp = bars[x.expIdx].close;
      const bull = x.sig.dir === 1;
      const perdFinal = bull
        ? Math.max(x.kC - sExp, 0) - Math.max(x.kL - sExp, 0)
        : Math.max(sExp - x.kC, 0) - Math.max(sExp - x.kL, 0);

      const conStop: Record<string, number> = {};
      for (const [nom, s] of STOPS) conStop[nom] = simular(netCredit, ancho, dias, perdFinal, s);
      if (!Number.isFinite(conStop["sin stop"])) continue;
      todas.push({ ms: x.sig.entryMs, base: conStop["sin stop"], conStop });
      ops++;
    }
    console.log(`\r  ${t}: ${ops} operaciones con serie diaria completa`);
  }

  console.log(`\n## STOPS CON PRECIOS REALES · ${todas.length} operaciones (desde 2022)\n`);
  if (todas.length < 200) { console.log("muestra insuficiente"); return; }
  todas.sort((a, b) => a.ms - b.ms);
  const años = (a: Op[]) => (a[a.length - 1].ms - a[0].ms) / (365.25 * 86_400_000);
  const mid = Math.floor(todas.length / 2);

  console.log("| Stop (% del colateral) | Media | Catástrofes | $/año | vieja | nueva |");
  console.log("|---|---|---|---|---|---|");
  for (const [nom] of STOPS) {
    const r = todas.map((o) => o.conStop[nom]).filter(Number.isFinite);
    if (r.length < 100) continue;
    const m = media(r) * 100;
    const cat = (r.filter((x) => x <= CATASTROFE).length / r.length) * 100;
    const v = media(todas.slice(0, mid).map((o) => o.conStop[nom]).filter(Number.isFinite)) * 100;
    const n2 = media(todas.slice(mid).map((o) => o.conStop[nom]).filter(Number.isFinite)) * 100;
    console.log(`| ${nom} | ${m >= 0 ? "+" : ""}${m.toFixed(2)}% | ${cat.toFixed(1)}% | $${Math.round((r.length / años(todas)) * (m / 100) * RIESGO).toLocaleString("en-US")} | ${v >= 0 ? "+" : ""}${v.toFixed(2)}% | ${n2 >= 0 ? "+" : ""}${n2.toFixed(2)}% |`);
  }
  console.log(`\n   Se DECIDE con el mid y se SALE al precio malo — decidir y salir al mismo precio`);
  console.log(`   sería regalarse el spread justo cuando más ancho está.`);
  console.log(`   Para adoptarlo: tiene que ser positivo en las DOS mitades, no solo en la media.`);
})();
