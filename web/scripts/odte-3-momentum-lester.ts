// 0DTE, PASO 3 — LA REGLA DE LESTER: seguir la dirección de la mañana.
//
// Su regla, tal como la operaba en 2024:
//   · mañana alcista      → put credit spread  (vende abajo: gana si no se da la vuelta)
//   · mañana bajista      → call credit spread (vende arriba)
//   · mañana consolidando → NO ENTRAR
//
// Y lo que decía que le mataba: las "U" y las "n" — el precio va a un lado por la mañana y
// vuelve por la tarde. Aquí eso no es una anécdota: se MIDE.
//
// POR QUÉ MERECE LA PENA PROBARLO. La dirección de EVA no supera a una moneda al aire (medido a
// 5 días y a 0). Pero la regla de Lester no usa el flujo de ayer: usa lo que el precio YA hizo
// hoy. Es información distinta, disponible al entrar, y no la habíamos probado nunca.
//
// SIN MIRAR EL FUTURO: la clasificación de la mañana usa solo datos hasta la hora de entrada.
// La gamma y la señal de EVA siguen saliendo del cierre ANTERIOR.
//
// Uso: node --import tsx scripts/odte-3-momentum-lester.ts

import { readFileSync, readdirSync } from "node:fs";
import { classifyFlow } from "../lib/flow";
import { signals, WIDTH_EM, type DBar } from "../lib/backtestCore";
import { bsPrice, bsGamma } from "../lib/blackScholes";

const DIR = "scripts/cache-theta";
const TICKER = "SPY";
const ENTRADA = 11 * 60, APERTURA = 9 * 60 + 30, CIERRE = 16 * 60, MIN_SESION = 390;
const SIGMA = 1;
const RIESGO = 1200, COMM = 0.65, CATASTROFE = -0.5;
const SLIP = Number(process.env.ODTE_SLIP ?? 0.02);
// Cuánto tiene que haberse movido la mañana para llamarla "con dirección", en unidades del
// movimiento esperado de esa franja. 0 = operar siempre (sin filtro de consolidación).
const UMBRALES = [0, 0.25, 0.5, 0.75, 1.0];

const leer = <T,>(p: string): T | null => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const media = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
type SerieDia = Record<string, [number, number][]>;
type OiExp = Record<string, Record<string, Record<string, [number, number]>>>;

function spotEn(serie: [number, number][], min: number): number | null {
  let best: number | null = null;
  for (const [m, p] of serie) { if (m > min) break; best = p; }
  return best;
}

function vertical(spot: number, em: number, spotCierre: number, dir: 1 | -1): number | null {
  const T = ((CIERRE - ENTRADA) / MIN_SESION) / 252;
  if (!(em > 0)) return null;
  const rv = em / (spot * Math.sqrt(T));
  const bull = dir === 1;
  const shortK = bull ? spot - SIGMA * em : spot + SIGMA * em;
  const longK = bull ? shortK - WIDTH_EM * em : shortK + WIDTH_EM * em;
  if (longK <= 0) return null;
  const tipo = bull ? "put" : "call";
  const credit = bsPrice(spot, shortK, T, rv, tipo) - bsPrice(spot, longK, T, rv, tipo);
  const width = WIDTH_EM * em;
  const netCredit = credit * (1 - SLIP) - (COMM * 2) / 100;
  const risk = width - netCredit;
  if (!(credit > 0) || !(netCredit > 0) || !(risk > 0)) return null;
  const perd = bull
    ? Math.max(shortK - spotCierre, 0) - Math.max(longK - spotCierre, 0)
    : Math.max(spotCierre - shortK, 0) - Math.max(spotCierre - longK, 0);
  return (netCredit - perd) / risk;
}

(async () => {
  const trozos: DBar[] = [];
  for (const f of readdirSync(DIR)) {
    if (f.startsWith(`${TICKER}_barsPAR_y_`) && f.endsWith(".json")) for (const x of leer<DBar[]>(`${DIR}/${f}`) ?? []) trozos.push(x);
  }
  const bars = [...new Map(trozos.map((x) => [x.time, x] as const)).values()].sort((a, b) => (a.time < b.time ? -1 : 1));
  const idxDe = new Map(bars.map((b, i) => [b.time, i] as const));
  const intradia: SerieDia = {};
  for (const f of readdirSync(DIR)) {
    if (f.startsWith(`${TICKER}_spotmin_y_`) && f.endsWith(".json")) Object.assign(intradia, leer<SerieDia>(`${DIR}/${f}`) ?? {});
  }
  const oi: OiExp = {};
  for (const f of readdirSync(DIR)) {
    if (f.startsWith(`${TICKER}_oiexp_y_`) && f.endsWith(".json")) Object.assign(oi, leer<OiExp>(`${DIR}/${f}`) ?? {});
  }
  const trades: unknown[] = [];
  for (const f of readdirSync(DIR)) {
    if (f.startsWith(`${TICKER}_y_`) && f.endsWith(".json")) { const y = leer<unknown[]>(`${DIR}/${f}`); if (y?.length) trades.push(...y); }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sigs = signals(classifyFlow(trades as any, new Date()).rows, bars);
  const k = Math.floor(sigs.length / 3);
  const top = new Set([...sigs].sort((a, b) => a.evaComp - b.evaComp).slice(sigs.length - k)
    .filter((s) => s.ivRatio < 1.1).map((s) => bars[s.entryIdx].time));
  const rvDe = new Map(sigs.map((s) => [bars[s.entryIdx].time, s.rv] as const));

  interface Caso {
    ymd: string; gex: number; señal: boolean;
    spot11: number; cierre: number; em: number;
    /** movimiento de la MAÑANA en unidades del esperado de esa franja. Signo = dirección. */
    mañana: number;
    /** movimiento de la TARDE, para medir las "U" y las "n". */
    tarde: number;
  }
  const casos: Caso[] = [];
  const ordenFechas = Object.keys(intradia).sort();
  // Histórico de |log(cierre/spot11)| para estimar el movimiento esperado de la tarde con los
  // 20 días PREVIOS. Igual que en el paso 2: nada de extrapolar la volatilidad diaria.
  const hist: { ymd: string; lr: number }[] = [];
  for (const ymd of ordenFechas) {
    const s = spotEn(intradia[ymd], ENTRADA), c = intradia[ymd][intradia[ymd].length - 1]?.[1];
    if (s && c) hist.push({ ymd, lr: Math.log(c / s) });
  }
  const emDe = (ymd: string, spot: number): number | null => {
    const i = hist.findIndex((x) => x.ymd === ymd);
    if (i < 20) return null;
    const prev = hist.slice(i - 20, i).map((x) => x.lr);
    const m = prev.reduce((s, x) => s + x, 0) / prev.length;
    const sd = Math.sqrt(prev.reduce((s, x) => s + (x - m) ** 2, 0) / (prev.length - 1));
    return sd > 0 ? spot * sd : null;
  };
  // Y el esperado de la MAÑANA, para poder decir si se movió "mucho" o "poco".
  const histM: { ymd: string; lr: number }[] = [];
  for (const ymd of ordenFechas) {
    const a = spotEn(intradia[ymd], APERTURA), s = spotEn(intradia[ymd], ENTRADA);
    if (a && s) histM.push({ ymd, lr: Math.log(s / a) });
  }
  const emMañanaDe = (ymd: string): number | null => {
    const i = histM.findIndex((x) => x.ymd === ymd);
    if (i < 20) return null;
    const prev = histM.slice(i - 20, i).map((x) => x.lr);
    const m = prev.reduce((s, x) => s + x, 0) / prev.length;
    const sd = Math.sqrt(prev.reduce((s, x) => s + (x - m) ** 2, 0) / (prev.length - 1));
    return sd > 0 ? sd : null;
  };

  for (const ymd of ordenFechas) {
    const serie = intradia[ymd];
    const iso = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
    const i = idxDe.get(iso);
    if (i == null || i < 1) continue;
    const previo = bars[i - 1].time;
    const rv = rvDe.get(previo);
    if (rv == null || !(rv > 0)) continue;
    const porExp = oi[previo.replace(/-/g, "")];
    if (!porExp) continue;
    const apertura = spotEn(serie, APERTURA), spot11 = spotEn(serie, ENTRADA);
    const cierre = serie[serie.length - 1]?.[1];
    if (!apertura || !spot11 || !cierre) continue;
    const em = emDe(ymd, spot11), emM = emMañanaDe(ymd);
    if (em == null || emM == null) continue;

    const spotPrev = bars[i - 1].close;
    let gex = 0;
    for (const porStrike of Object.values(porExp)) {
      for (const [kStr, [oiC, oiP]] of Object.entries(porStrike)) {
        const g = bsGamma(spotPrev, Number(kStr), 1 / 365, rv);
        if (g > 0) gex += g * (oiC - oiP) * 100 * spotPrev * spotPrev * 0.01;
      }
    }
    casos.push({
      ymd, gex: gex / (spotPrev * spotPrev), señal: top.has(previo),
      spot11, cierre, em,
      mañana: Math.log(spot11 / apertura) / emM,
      tarde: Math.log(cierre / spot11) / (em / spot11),
    });
  }

  console.log(`\n## 0DTE paso 3 — LA REGLA DE LESTER (seguir la mañana) · ${casos.length} días\n`);

  // ── PRIMERO: ¿existen de verdad las "U" y las "n"? ───────────────────────────────────────
  // Si la tarde deshace la mañana, seguir el impulso es justo lo contrario de lo que conviene.
  // Correlación de rangos entre el movimiento de la mañana y el de la tarde.
  const rank = (a: number[]) => { const s = [...a].sort((x, y) => x - y); return a.map((x) => s.indexOf(x) + 1); };
  const rm = rank(casos.map((c) => c.mañana)), rt = rank(casos.map((c) => c.tarde));
  const n = rm.length;
  const d2 = rm.reduce((s, x, i2) => s + (x - rt[i2]) ** 2, 0);
  const rho = 1 - (6 * d2) / (n * (n * n - 1));
  const reversion = casos.filter((c) => Math.abs(c.mañana) > 0.5 && Math.sign(c.tarde) !== Math.sign(c.mañana));
  const conDireccion = casos.filter((c) => Math.abs(c.mañana) > 0.5);
  console.log(`### ¿Existen las "U" y las "n"?\n`);
  console.log(`   Correlación mañana ↔ tarde: **${rho.toFixed(3)}**`);
  console.log(`   De los ${conDireccion.length} días con dirección clara por la mañana, la tarde se dio la vuelta en **${reversion.length}** (${(reversion.length / conDireccion.length * 100).toFixed(0)}%)`);
  console.log(`   → ${rho < -0.05 ? "SÍ: la tarde tiende a DESHACER la mañana. Seguir el impulso juega en contra."
    : rho > 0.05 ? "NO: la tarde tiende a CONTINUAR la mañana. Seguir el impulso juega a favor."
    : "NI UNA COSA NI OTRA: la tarde es independiente de la mañana (≈0). El impulso no informa."}\n`);

  // ── La regla, con y sin filtros ──────────────────────────────────────────────────────────
  const años = (a: Caso[]) => {
    const f = a.map((c) => c.ymd).sort();
    const d = (s: string) => Date.parse(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`);
    return (d(f[f.length - 1]) - d(f[0])) / (365.25 * 86_400_000);
  };
  const evaluar = (sub: Caso[], umbral: number, modo: "lester" | "contra" | "siempreCall") => {
    const r: number[] = [];
    for (const c of sub) {
      if (Math.abs(c.mañana) < umbral) continue;          // consolidando → no se entra
      // Lester: mañana alcista → put spread (dir=1). Bajista → call spread (dir=-1).
      const dir: 1 | -1 = modo === "siempreCall" ? -1
        : modo === "lester" ? (c.mañana > 0 ? 1 : -1)
        : (c.mañana > 0 ? -1 : 1);                        // "contra" = hacer lo contrario
      const p = vertical(c.spot11, c.em, c.cierre, dir);
      if (p != null) r.push(p);
    }
    if (r.length < 25) return null;
    const m = media(r) * 100;
    return { n: r.length, m, cat: (r.filter((x) => x <= CATASTROFE).length / r.length) * 100, porAño: (r.length / años(sub)) * (m / 100) * RIESGO };
  };

  const universos: [string, Caso[]][] = [
    ["TODOS los días", casos],
    ["solo gamma POSITIVA", casos.filter((c) => c.gex > 0)],
    ["gamma+ y señal EVA", casos.filter((c) => c.gex > 0 && c.señal)],
  ];
  for (const [nombre, sub] of universos) {
    console.log(`### ${nombre} — ${sub.length} días\n`);
    console.log("| Umbral de \"con dirección\" | n | REGLA DE LESTER | al revés | siempre call |");
    console.log("|---|---|---|---|---|");
    for (const u of UMBRALES) {
      const l = evaluar(sub, u, "lester"), ct = evaluar(sub, u, "contra"), sc = evaluar(sub, u, "siempreCall");
      if (!l) { console.log(`| ${u.toFixed(2)}σ | — | — | — | — |`); continue; }
      console.log(`| ${u.toFixed(2)}σ${u === 0 ? " (sin filtro)" : ""} | ${l.n} | **${l.m >= 0 ? "+" : ""}${l.m.toFixed(2)}%** (${Math.round(l.porAño).toLocaleString("en-US")} $/año) | ${ct ? `${ct.m >= 0 ? "+" : ""}${ct.m.toFixed(2)}%` : "—"} | ${sc ? `${sc.m >= 0 ? "+" : ""}${sc.m.toFixed(2)}%` : "—"} |`);
    }
    console.log("");
  }

  // ── Validación en las dos mitades ────────────────────────────────────────────────────────
  console.log(`### VALIDACIÓN — la regla en las DOS mitades (umbral 0,5σ)\n`);
  console.log("| Universo | Tramo | Lester | al revés | siempre call |");
  console.log("|---|---|---|---|---|");
  for (const [nombre, sub] of universos) {
    const orden = [...sub].sort((a, b) => (a.ymd < b.ymd ? -1 : 1));
    const mid = Math.floor(orden.length / 2);
    for (const [tramo, g] of [["vieja", orden.slice(0, mid)], ["nueva", orden.slice(mid)]] as const) {
      const l = evaluar(g, 0.5, "lester"), ct = evaluar(g, 0.5, "contra"), sc = evaluar(g, 0.5, "siempreCall");
      console.log(`| ${nombre} | ${tramo} | ${l ? `**${l.m >= 0 ? "+" : ""}${l.m.toFixed(2)}%**` : "—"} | ${ct ? `${ct.m >= 0 ? "+" : ""}${ct.m.toFixed(2)}%` : "—"} | ${sc ? `${sc.m >= 0 ? "+" : ""}${sc.m.toFixed(2)}%` : "—"} |`);
    }
  }
  console.log(`\n   "Al revés" es el control que importa: si hacer lo CONTRARIO rinde igual o más,`);
  console.log(`   la dirección de la mañana no informa y lo que funciona es otra cosa.`);
})();
