// 0DTE, PASO 1 — ¿merece la pena bajar datos intradía?
//
// La descarga intradía es cara (horas). Antes de gastarlas, esta prueba usa lo que YA tenemos
// para ver si la hipótesis del 0DTE sobrevive siquiera en su versión más favorable.
//
// LO QUE YA SABEMOS, y no pinta bien:
//   · La literatura: el 0DTE incondicional no tiene edge tras costes; el iron condor pasa de
//     Sharpe bruto +0,77 a NETO −0,20.
//   · Nuestro propio dato: a 1 día el cóndor da −1,98% y el vertical −0,92%. A 5 días, +6,68%
//     y +2,52%. El edge crece con el plazo porque los costes son fijos y la prima se encoge.
//
// LO QUE AÚN DEFIENDE AL 0DTE — y es lo que se prueba aquí:
//   El mecanismo de gamma es MÁS fuerte a plazo corto (+0,354 a 1 día contra +0,171 a 10), y
//   solo existe donde el nocional de OI es enorme (SPY, QQQ; ρ=0,83 con el tamaño). Con gamma
//   POSITIVA los dealers amortiguan y el precio se clava — que es justo lo que un vendedor de
//   prima quiere. Así que la versión defendible del 0DTE no es "vender todos los días", es:
//
//       solo SPY/QQQ  +  solo días de gamma positiva  +  cóndor (el lado no aporta, P2)
//
// SI ESO TAMPOCO GANA A 1 DÍA, no hay nada que buscar intradía y nos ahorramos la descarga.
// SI GANA, la descarga está justificada — con la advertencia de que 1 día carga el hueco de la
// noche que el 0DTE real no tiene, así que aquí el 0DTE juega en desventaja.
//
// Uso: node --import tsx scripts/odte-1-vale-la-pena-bajar-datos.ts

import { readFileSync, readdirSync } from "node:fs";
import { classifyFlow } from "../lib/flow";
import { signals, creditSpreadPnl, type DBar } from "../lib/backtestCore";
import { ironCondorPnl } from "../lib/ironCondor";
import { bsGamma } from "../lib/blackScholes";

const DIR = "scripts/cache-theta";
const INDICES = ["SPY", "QQQ"];
const DTES = [1, 2, 3, 5];
const SIGMA = 1;
const RIESGO = 1200, SLIP = 0.02, COMM = 0.65, CATASTROFE = -0.5;

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, "");
const leer = <T,>(p: string): T | null => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const media = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
type OiExp = Record<string, Record<string, Record<string, [number, number]>>>;

interface Op { ms: number; dte: number; gex: number; condor: number; vertical: number }

(async () => {
  const ops: Op[] = [];
  for (const t of INDICES) {
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
    if (bars.length < 300 || !trades.length || !Object.keys(oi).length) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sigs = signals(classifyFlow(trades as any, new Date()).rows, bars);
    const k = Math.floor(sigs.length / 3);
    const top = [...sigs].sort((a, b) => a.evaComp - b.evaComp).slice(sigs.length - k).filter((s) => s.ivRatio < 1.1);

    for (const sig of top) {
      const porExp = oi[ymd(sig.entryMs)];
      if (!porExp) continue;
      let gex = 0;
      const T = 1 / 365;   // gamma a un día, que es el plazo de la hipótesis
      for (const porStrike of Object.values(porExp)) {
        for (const [kStr, [oiC, oiP]] of Object.entries(porStrike)) {
          const g = bsGamma(sig.spot, Number(kStr), T, sig.rv);
          if (g > 0) gex += g * (oiC - oiP) * 100 * sig.spot * sig.spot * 0.01;
        }
      }
      const gexNorm = gex / (sig.spot * sig.spot);
      for (const dte of DTES) {
        const c = ironCondorPnl(sig, bars, dte, SIGMA, { slip: SLIP, commPerContract: COMM });
        const v = creditSpreadPnl(sig, bars, dte, SIGMA, SLIP, COMM);
        if (c != null && v != null) ops.push({ ms: sig.entryMs, dte, gex: gexNorm, condor: c, vertical: v });
      }
    }
  }

  console.log(`\n## 0DTE paso 1 — ¿vale la pena bajar datos intradía?\n`);
  console.log(`Solo SPY+QQQ (donde el mecanismo de gamma existe) · Top⅓ EVA + IV/rv<1,1 · costes incluidos\n`);
  if (ops.length < 200) { console.log("muestra insuficiente"); return; }

  const años = (a: Op[]) => (Math.max(...a.map((o) => o.ms)) - Math.min(...a.map((o) => o.ms))) / (365.25 * 86_400_000);
  const linea = (a: Op[], sel: (o: Op) => number) => {
    if (!a.length) return { m: 0, cat: 0, porAño: 0, n: 0 };
    const r = a.map(sel), m = media(r) * 100;
    return { n: a.length, m, cat: (r.filter((x) => x <= CATASTROFE).length / r.length) * 100, porAño: (a.length / años(a)) * (m / 100) * RIESGO };
  };

  for (const dte of DTES) {
    const delDte = ops.filter((o) => o.dte === dte);
    // El umbral de gamma positiva se fija en 0: es el signo, no un percentil ajustado.
    const pos = delDte.filter((o) => o.gex > 0);
    const neg = delDte.filter((o) => o.gex <= 0);
    console.log(`### ${dte} día${dte > 1 ? "s" : ""} al vencimiento\n`);
    console.log("| Filtro | n | Media | Catástrofes | $/año |");
    console.log("|---|---|---|---|---|");
    for (const [nom, sub] of [["TODOS los días", delDte], ["**solo gamma POSITIVA**", pos], ["(control) gamma negativa", neg]] as const) {
      const c = linea(sub as Op[], (o) => o.condor);
      console.log(`| ${nom} · cóndor | ${c.n} | ${c.m >= 0 ? "+" : ""}${c.m.toFixed(2)}% | ${c.cat.toFixed(1)}% | $${Math.round(c.porAño).toLocaleString("en-US")} |`);
    }
    console.log("");
  }

  // ── VALIDACIÓN OBLIGADA ─────────────────────────────────────────────────────────────────
  // Se han mirado 4 plazos × 3 filtros = 12 celdas. Con 12 celdas, alguna se ve bien por azar.
  // Lo único que distingue un hallazgo de una casualidad es que aguante en las DOS mitades del
  // período, partidas por fecha. El umbral de gamma es el SIGNO (>0), no un percentil ajustado,
  // así que no hay nada que se pueda haber elegido mirando el resultado.
  console.log(`### VALIDACIÓN fuera de muestra — ¿aguanta en las dos mitades?\n`);
  console.log("| Plazo | vieja (gamma+) | nueva (gamma+) | vieja (gamma−) | nueva (gamma−) | ¿aguanta? |");
  console.log("|---|---|---|---|---|---|");
  for (const dte of DTES) {
    const delDte = ops.filter((o) => o.dte === dte).sort((a, b) => a.ms - b.ms);
    const mid = Math.floor(delDte.length / 2);
    const [vj, nv] = [delDte.slice(0, mid), delDte.slice(mid)];
    const m = (a: Op[], signo: 1 | -1) => {
      const s = a.filter((o) => (signo === 1 ? o.gex > 0 : o.gex <= 0));
      return s.length >= 30 ? media(s.map((o) => o.condor)) * 100 : NaN;
    };
    const [vp, np, vn, nn] = [m(vj, 1), m(nv, 1), m(vj, -1), m(nv, -1)];
    // Para que valga: gamma positiva POSITIVA en las dos mitades, y peor la negativa en las dos.
    const ok = vp > 0 && np > 0 && vp > vn && np > nn;
    const f = (x: number) => (Number.isNaN(x) ? "—" : `${x >= 0 ? "+" : ""}${x.toFixed(2)}%`);
    console.log(`| ${dte}d | ${f(vp)} | ${f(np)} | ${f(vn)} | ${f(nn)} | ${ok ? "**SÍ**" : "no"} |`);
  }
  console.log("");

  // ── El veredicto que decide si se gasta la descarga ──────────────────────────────────────
  const d1 = ops.filter((o) => o.dte === 1 && o.gex > 0);
  const d1c = linea(d1, (o) => o.condor), d1v = linea(d1, (o) => o.vertical);
  console.log(`### Veredicto\n`);
  console.log(`   A 1 día, solo índices, solo gamma positiva, cóndor:`);
  console.log(`     media ${d1c.m >= 0 ? "+" : ""}${d1c.m.toFixed(2)}%  ·  ${Math.round(d1c.porAño).toLocaleString("en-US")} $/año  ·  n=${d1c.n}`);
  console.log(`     (el vertical en las mismas: ${d1v.m >= 0 ? "+" : ""}${d1v.m.toFixed(2)}%)`);
  console.log(`\n   → ${d1c.m > 0
    ? "LA HIPÓTESIS SOBREVIVE en su versión más favorable. Bajar datos intradía está justificado:\n     el 0DTE real NO carga el hueco de la noche que aquí penaliza, así que jugaría con ventaja."
    : "LA HIPÓTESIS NO SOBREVIVE ni en su versión más favorable. Bajar horas de datos intradía\n     para buscar algo que a 1 día ya es negativo sería gastar tiempo contra la evidencia."}`);
})();
