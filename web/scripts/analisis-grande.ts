// EL ANÁLISIS GRANDE — ¿qué familia gana dinero en cada régimen?
//
// Todo lo anterior en este proyecto probaba UNA familia (vender verticales) y preguntaba si
// funcionaba. Aquí se invierte: se mide qué habría ganado CADA familia en cada semana, se mira
// qué condiciones había ANTES, y se construye una tabla régimen → familia.
//
// Es la forma más fácil que existe de engañarse: si miras las ganadoras y buscas qué tenían en
// común, SIEMPRE encuentras algo. El control:
//   · las reglas se descubren SOLO en 2016-2021 y se miden en 2022-2026
//   · el régimen se calcula con datos disponibles el día de entrada, nunca después
//
// TODO con precios reales, comisiones de Robinhood ($0,03), strikes y expiraciones listados, y
// los filtros de cotización rota. Las cuatro barreras que costaron un día entero de correcciones.
//
// Uso: node --import tsx scripts/analisis-grande.ts

import { readFileSync, readdirSync } from "node:fs";
import { signals as _s, barIdxOnOrAfter, type DBar } from "../lib/backtestCore";

const DIR = "scripts/cache-theta", CDIR = `${DIR}/cadenas`;
const TICKERS = ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "META", "TSLA", "AMD"];
const HORIZONTES: [string, number][] = [["semanal", 7], ["mensual", 30], ["trimestral", 90]];
const COMM = 0.03;
const CORTE = "2022-01-01";                 // descubrir antes, medir después

const leer = <T,>(p: string): T | null => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const media = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
type CadenaDia = Record<string, Record<string, [number, number]>>;

/** Un resultado: familia, horizonte, régimen y retorno sobre el capital en riesgo. */
interface Res { ymd: string; t: string; fam: string; hor: string; reg: string; r: number }

const FAMILIAS = [
  "comprar call", "comprar put", "comprar straddle",
  "vender put spread", "vender call spread",
] as const;

(async () => {
  const res: Res[] = [];

  for (const t of TICKERS) {
    const trozos: DBar[] = [];
    for (const f of readdirSync(DIR)) if (f.startsWith(`${t}_barsPAR_y_`)) for (const x of leer<DBar[]>(`${DIR}/${f}`) ?? []) trozos.push(x);
    const bars = [...new Map(trozos.map((x) => [x.time, x] as const)).values()].sort((a, b) => (a.time < b.time ? -1 : 1));
    if (bars.length < 300) continue;
    const cierres = bars.map((b) => b.close);

    // Volatilidad realizada 20d y su percentil en el año previo — ambos con datos PASADOS.
    const rvEn = (i: number): number | null => {
      if (i < 21) return null;
      const lr: number[] = [];
      for (let j = i - 20; j <= i; j++) if (cierres[j - 1] > 0 && cierres[j] > 0) lr.push(Math.log(cierres[j] / cierres[j - 1]));
      if (lr.length < 15) return null;
      const m = media(lr);
      return Math.sqrt(lr.reduce((s, x) => s + (x - m) ** 2, 0) / (lr.length - 1)) * Math.sqrt(252);
    };
    const rvSerie = bars.map((_, i) => rvEn(i));

    // Una entrada por SEMANA (lunes o el primer día hábil). Evita solapar 90 posiciones y encaja
    // con el plano que Lester prefiere.
    for (let i = 260; i < bars.length; i++) {
      const d = new Date(`${bars[i].time}T12:00:00Z`).getUTCDay();
      if (d !== 1) continue;                                     // solo lunes
      const rv = rvSerie[i];
      if (rv == null || !(rv > 0)) continue;
      const cad = leer<CadenaDia>(`${CDIR}/${t}_d${bars[i].time.replace(/-/g, "")}.json`);
      if (!cad) continue;
      const spot = cierres[i];

      // ── RÉGIMEN, con lo conocido ESE día ────────────────────────────────────────────────
      const prev = rvSerie.slice(Math.max(0, i - 252), i).filter((x): x is number => x != null && x > 0);
      if (prev.length < 100) continue;
      const pctRv = prev.filter((x) => x < rv).length / prev.length;
      const ma50 = media(cierres.slice(Math.max(0, i - 50), i));
      const tendencia = spot > ma50 * 1.02 ? "alcista" : spot < ma50 * 0.98 ? "bajista" : "lateral";
      const volReg = pctRv > 0.7 ? "vol ALTA" : pctRv < 0.3 ? "vol BAJA" : "vol media";
      const reg = `${volReg} · ${tendencia}`;

      for (const [hor, dte] of HORIZONTES) {
        const objetivo = new Date(Date.parse(`${bars[i].time}T12:00:00Z`) + dte * 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
        const exp = Object.keys(cad).sort().find((e) => e >= objetivo);
        if (!exp) continue;
        const expIdx = barIdxOnOrAfter(bars, Date.parse(`${exp.slice(0, 4)}-${exp.slice(4, 6)}-${exp.slice(6, 8)}T20:00:00Z`));
        if (expIdx <= i || expIdx >= bars.length) continue;
        const sExp = cierres[expIdx];
        const em = spot * rv * Math.sqrt(dte / 365);
        if (!(em > 0)) continue;

        const strikes = (r: "C" | "P") => Object.keys(cad[exp]).filter((x) => x.endsWith(`|${r}`)).map((x) => Number(x.split("|")[0])).sort((a, b) => a - b);
        const cerca = (arr: number[], x: number) => (arr.length ? arr.reduce((b, k) => (Math.abs(k - x) < Math.abs(b - x) ? k : b), arr[0]) : NaN);
        const q = (r: "C" | "P", K: number) => cad[exp][`${K}|${r}`];
        const add = (fam: string, r: number) => { if (Number.isFinite(r)) res.push({ ymd: bars[i].time, t, fam, hor, reg, r }); };

        const kcs = strikes("C"), kps = strikes("P");
        if (kcs.length < 8 || kps.length < 8) continue;

        // ── COMPRAR CALL / PUT (al dinero) — pérdida máxima = la prima ──────────────────
        const kAtmC = cerca(kcs, spot), kAtmP = cerca(kps, spot);
        const qc = q("C", kAtmC), qp = q("P", kAtmP);
        if (qc && qp) {
          const cCall = qc[1] + COMM / 100, cPut = qp[1] + COMM / 100;      // se compra al ask
          if (cCall > 0) add("comprar call", (Math.max(sExp - kAtmC, 0) - cCall) / cCall);
          if (cPut > 0) add("comprar put", (Math.max(kAtmP - sExp, 0) - cPut) / cPut);
          const cStr = cCall + cPut;
          if (cStr > 0) add("comprar straddle", (Math.abs(sExp - kAtmC) - cStr) / cStr);
        }

        // ── VENDER SPREADS a 1σ, ancho de 2 pasos de strike ────────────────────────────
        for (const [fam, right, dir] of [["vender put spread", "P", 1], ["vender call spread", "C", -1]] as const) {
          const ks = right === "P" ? kps : kcs;
          const objK = dir === 1 ? spot - em : spot + em;
          let iC = 0, mejor = Infinity;
          for (let z = 0; z < ks.length; z++) { const dd = Math.abs(ks[z] - objK); if (dd < mejor) { mejor = dd; iC = z; } }
          const iL = dir === 1 ? iC - 2 : iC + 2;
          if (iL < 0 || iL >= ks.length) continue;
          const kC = ks[iC], kL = ks[iL];
          const q1 = q(right, kC), q2 = q(right, kL);
          if (!q1 || !q2) continue;
          const credito = (q1[0] + q1[1]) / 2 - (q2[0] + q2[1]) / 2 - (COMM * 2) / 100;
          const ancho = Math.abs(kL - kC), riesgo = ancho - credito;
          if (!(credito > 0) || !(riesgo > 0)) continue;
          if (credito > 0.5 * ancho) continue;                                   // cotización rota
          if (!((q1[1] - q1[0]) / ((q1[1] + q1[0]) / 2) < 0.5)) continue;         // sin mercado
          const perd = dir === 1 ? Math.max(kC - sExp, 0) - Math.max(kL - sExp, 0) : Math.max(sExp - kC, 0) - Math.max(sExp - kL, 0);
          add(fam, (credito - perd) / riesgo);
        }
      }
    }
  }

  console.log(`\n## ANÁLISIS GRANDE · ${res.length} operaciones simuladas · entrada semanal (lunes)\n`);
  console.log(`Precios reales · comisiones Robinhood · strikes y vencimientos listados.\n`);
  if (res.length < 2000) { console.log(`muestra insuficiente (${res.length})`); return; }

  // ── 1. Qué familia gana, por horizonte (periodo COMPLETO, solo para ver el terreno) ─────
  // ── AUDITORÍA ANTES DE ENSEÑAR NADA ─────────────────────────────────────────────────────
  // Una media de +731% en "comprar call" no es un resultado: es el mismo espejismo que ya cazamos
  // hoy con el "comprador". Comprar una opción tiene el DÉBITO en el denominador, así que una
  // prima diminuta produce retornos de miles por ciento que arrastran la media entera. La
  // MEDIANA y la media sin los extremos lo delatan.
  console.log(`### Auditoría de las medias — ¿las deciden cuatro operaciones?\n`);
  console.log(`| Familia | media | MEDIANA | sin el 1% mejor | sin el 5% mejor | máx |`);
  console.log(`|---|---|---|---|---|---|`);
  for (const fam of FAMILIAS) {
    const g = res.filter((x) => x.fam === fam).map((x) => x.r).sort((a, b) => a - b);
    if (g.length < 100) continue;
    const sinN = (f: number) => { const z = g.slice(0, Math.floor(g.length * (1 - f))); return (z.reduce((a, b) => a + b, 0) / z.length) * 100; };
    console.log(`| ${fam} | ${(media(g) * 100).toFixed(1)}% | **${(g[Math.floor(g.length / 2)] * 100).toFixed(1)}%** | ${sinN(0.01).toFixed(1)}% | ${sinN(0.05).toFixed(1)}% | ${(g[g.length - 1] * 100).toFixed(0)}% |`);
  }
  console.log(`\n   Si la mediana es MUY inferior a la media, la familia no gana: la arrastran unos`);
  console.log(`   pocos aciertos enormes. Eso no se puede operar — tendrías que acertar justo esos.\n`);

  // ── ¿ES EDGE O ES BETA? ─────────────────────────────────────────────────────────────────
  // Vender put spreads es estar LARGO del mercado con un tope. De 2016 a 2026 el mercado subió
  // mucho, así que un resultado positivo puede no ser habilidad: puede ser simplemente haber
  // estado comprado. La prueba está en los años MALOS — 2018 (Q4) y 2022 (bear).
  console.log(`### ¿Edge o beta? — vender put spread, año a año\n`);
  const vps = res.filter((x) => x.fam === "vender put spread");
  const porAno = new Map<string, number[]>();
  for (const x of vps) { const y = x.ymd.slice(0, 4); if (!porAno.has(y)) porAno.set(y, []); porAno.get(y)!.push(x.r); }
  console.log(`| Año | n | media | MEDIANA |`);
  console.log(`|---|---|---|---|`);
  let anosPos = 0, anosTot = 0;
  for (const [y, arr] of [...porAno.entries()].sort()) {
    if (arr.length < 40) continue;
    const or = [...arr].sort((a, b) => a - b);
    const md = or[Math.floor(or.length / 2)] * 100;
    const m = media(arr) * 100;
    anosTot++; if (m > 0) anosPos++;
    console.log(`| ${y} | ${arr.length} | ${m >= 0 ? "+" : ""}${m.toFixed(1)}% | ${md >= 0 ? "+" : ""}${md.toFixed(1)}% |`);
  }
  console.log(`\n   Positivo en ${anosPos}/${anosTot} años. 2018 y 2022 son los bajistas: si pierde ahí,`);
  console.log(`   es BETA (estar largo del mercado) y no edge.\n`);

  console.log(`### Por familia y horizonte — periodo completo\n`);
  console.log(`| Familia | ${HORIZONTES.map(([h]) => h).join(" | ")} |`);
  console.log(`|---|${HORIZONTES.map(() => "---").join("|")}|`);
  for (const fam of FAMILIAS) {
    const cel = HORIZONTES.map(([hor]) => {
      const g = res.filter((x) => x.fam === fam && x.hor === hor);
      if (g.length < 100) return "—";
      const m = media(g.map((x) => x.r)) * 100;
      return `${m >= 0 ? "+" : ""}${m.toFixed(1)}% (${g.length})`;
    });
    console.log(`| ${fam} | ${cel.join(" | ")} |`);
  }

  // ── 2. LA TABLA QUE IMPORTA: régimen → familia, descubierta en la mitad VIEJA ───────────
  console.log(`\n### Régimen → mejor familia · DESCUBIERTO en 2016-2021, MEDIDO en 2022-2026\n`);
  const regimenes = [...new Set(res.map((x) => x.reg))].sort();
  console.log(`| Régimen | Horizonte | Mejor familia (vieja) | en vieja | **en NUEVA** | n nueva |`);
  console.log(`|---|---|---|---|---|---|`);
  let aciertos = 0, total = 0;
  for (const reg of regimenes) {
    for (const [hor] of HORIZONTES) {
      const vieja = res.filter((x) => x.reg === reg && x.hor === hor && x.ymd < CORTE);
      const nueva = res.filter((x) => x.reg === reg && x.hor === hor && x.ymd >= CORTE);
      if (vieja.length < 80 || nueva.length < 40) continue;
      let mejor = "", mejorM = -Infinity;
      for (const fam of FAMILIAS) {
        const g = vieja.filter((x) => x.fam === fam);
        if (g.length < 20) continue;
        // Se elige por MEDIANA, no por media: la media la secuestran los extremos y elegiria
        // siempre "comprar call" por cuatro aciertos gigantes que no se pueden replicar.
        const or = g.map((x) => x.r).sort((a, b) => a - b);
        const m = or[Math.floor(or.length / 2)];
        if (m > mejorM) { mejorM = m; mejor = fam; }
      }
      if (!mejor) continue;
      const gN = nueva.filter((x) => x.fam === mejor);
      if (gN.length < 15) continue;
      const orN = gN.map((x) => x.r).sort((a, b) => a - b);
      const mN = orN[Math.floor(orN.length / 2)] * 100;
      total++; if (mN > 0) aciertos++;
      console.log(`| ${reg} | ${hor} | ${mejor} | ${(mejorM * 100).toFixed(1)}% | ${mN > 0 ? "**" : ""}${mN >= 0 ? "+" : ""}${mN.toFixed(1)}%${mN > 0 ? "**" : ""} | ${gN.length} |`);
    }
  }
  console.log(`\n   La regla elegida en 2016-2021 sale positiva en **${aciertos} de ${total}** regímenes al medirla en 2022-2026.`);
  console.log(`   Si fuera azar, saldría ~la mitad. Si sale casi todo, la tabla tiene valor predictivo.`);
})();
