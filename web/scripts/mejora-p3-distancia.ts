// P3 — ¿A QUÉ DISTANCIA VENDER? Barrido con el umbral elegido A CIEGAS.
//
// POR QUÉ AHORA. Hoy vendemos a 1σ. A 5 días con vol del 20%, eso es ~2,7% del subyacente. La
// literatura de venta de prima encuentra el óptimo en 5-10% OTM — bastante más lejos. Ya hicimos
// un barrido de distancia antes, pero en un rango estrecho; esto lo abre hasta 3,5σ.
//
// Y hay una razón nueva para volver: P2 mostró que el LADO no aporta y P5 que el cóndor cobra el
// doble de prima sobre la misma selección de días. Si se venden los dos lados, la DISTANCIA pasa
// a ser la palanca principal — es lo único que queda por ajustar.
//
// EL PROTOCOLO, el mismo que usamos con el GEX:
//   1. Se parte la muestra por FECHA en dos mitades.
//   2. Se elige la mejor distancia usando SOLO la mitad vieja.
//   3. Esa distancia se congela y se mide en la mitad nueva, que no participó en elegirla.
//   4. Se compara contra 1σ, que es lo que hacemos hoy.
// Elegir la distancia mirando toda la muestra daría siempre un ganador — y sería el mismo
// autoengaño que ya nos tumbó cuatro hallazgos.
//
// Uso: node --import tsx scripts/mejora-p3-distancia.ts

import { readFileSync, readdirSync } from "node:fs";
import { classifyFlow } from "../lib/flow";
import { signals, creditSpreadPnl, type DBar, type Signal } from "../lib/backtestCore";
import { ironCondorPnl, distanciaPct } from "../lib/ironCondor";

const DIR = "scripts/cache-theta";
const TICKERS = (process.env.BT_TICKERS || "SPY,QQQ,AAPL,MSFT,NVDA,META,TSLA,AMD,HOOD").split(",");
const DTE = Number(process.env.P3_DTE) || 5;
// La rejilla baja hasta 0,15σ a propósito. En la primera pasada el óptimo salió en 0,50σ, que
// era el BORDE de la rejilla — y un óptimo en el borde no es un óptimo, es un aviso de que no
// has mirado lo suficiente. Si al extender sigue pegado al borde, lo que hay no es una distancia
// buena sino una métrica que premia apalancarse.
const DISTANCIAS = [0.15, 0.25, 0.35, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 2.5, 3.0];
const REFERENCIA = 1.0;       // lo que hacemos hoy
const RIESGO = 1200;
const CATASTROFE = -0.5;
const SLIP = 0.02, COMM = 0.65;

const leer = <T,>(p: string): T | null => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const media = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);

interface Fila { ms: number; pct: number; porDist: Map<number, { condor: number | null; vertical: number | null }> }

(async () => {
  const filas: Fila[] = [];
  for (const t of TICKERS) {
    const trozos: DBar[] = [];
    for (const f of readdirSync(DIR)) {
      if (f.startsWith(`${t}_barsPAR_y_`) && f.endsWith(".json")) for (const x of leer<DBar[]>(`${DIR}/${f}`) ?? []) trozos.push(x);
    }
    const porFecha = new Map(trozos.map((x) => [x.time, x] as const));
    const bars = [...porFecha.values()].sort((a, b) => (a.time < b.time ? -1 : 1));
    const trades: unknown[] = [];
    for (const f of readdirSync(DIR)) {
      if (f.startsWith(`${t}_y_`) && f.endsWith(".json")) { const y = leer<unknown[]>(`${DIR}/${f}`); if (y?.length) trades.push(...y); }
    }
    if (bars.length < 300 || !trades.length) continue;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sigs = signals(classifyFlow(trades as any, new Date()).rows, bars);
    const k = Math.floor(sigs.length / 3);
    const top = [...sigs].sort((a, b) => a.evaComp - b.evaComp).slice(sigs.length - k).filter((s) => s.ivRatio < 1.1);

    for (const sig of top) {
      const m = new Map<number, { condor: number | null; vertical: number | null }>();
      for (const d of DISTANCIAS) {
        m.set(d, {
          condor: ironCondorPnl(sig, bars, DTE, d, { slip: SLIP, commPerContract: COMM }),
          vertical: creditSpreadPnl(sig, bars, DTE, d, SLIP, COMM),
        });
      }
      filas.push({ ms: sig.entryMs, pct: distanciaPct(sig, DTE, 1), porDist: m });
    }
  }
  filas.sort((a, b) => a.ms - b.ms);

  console.log(`\n## P3 — DISTANCIA con el umbral elegido A CIEGAS · ${DTE}d · Top⅓ EVA + IV/rv<1,1\n`);
  console.log(`n=${filas.length} señales · costes incluidos (slippage ${SLIP * 100}%, $${COMM}/contrato)`);
  console.log(`1σ equivale de media a **${(media(filas.map((f) => f.pct)) * 100).toFixed(1)}%** del subyacente a ${DTE} días.`);
  console.log(`La literatura sitúa el óptimo en 5-10% OTM → aquí sería ~${(0.05 / media(filas.map((f) => f.pct))).toFixed(1)}σ a ~${(0.10 / media(filas.map((f) => f.pct))).toFixed(1)}σ.\n`);
  if (filas.length < 400) { console.log("muestra insuficiente"); return; }

  const mit = Math.floor(filas.length / 2);
  const vieja = filas.slice(0, mit), nueva = filas.slice(mit);
  const años = (f: Fila[]) => (f[f.length - 1].ms - f[0].ms) / (365.25 * 86_400_000);

  // Métrica: $/año. Al alejarse, la prima se hace pequeña y muchas operaciones dejan de ser
  // viables tras costes — así que la media por operación NO basta: hay que contar cuántas
  // quedan. $/año captura las dos cosas a la vez.
  const evaluar = (sub: Fila[], d: number, veh: "condor" | "vertical") => {
    const r: number[] = [];
    for (const f of sub) { const v = f.porDist.get(d)?.[veh]; if (v != null) r.push(v); }
    if (!r.length) return { n: 0, m: 0, cat: 0, porAño: 0, dd: 1, porCaida: 0 };
    const m = media(r) * 100;
    // CAÍDA al componer. Sin esto, "más $/año" premia simplemente arriesgar más: vender más
    // cerca cobra más prima y revienta más a menudo, y la media sola no lo distingue de un edge.
    let c = 60_000, pico = c, dd = 0;
    for (const x of r) { c += c * 0.02 * x; if (c <= 0) { dd = 1; break; } pico = Math.max(pico, c); dd = Math.max(dd, (pico - c) / pico); }
    const porAño = (r.length / años(sub)) * (m / 100) * RIESGO;
    return {
      n: r.length, m,
      cat: (r.filter((x) => x <= CATASTROFE).length / r.length) * 100,
      porAño, dd,
      // $/año por cada punto de caída — la métrica que NO se deja engañar por el apalancamiento.
      porCaida: porAño / Math.max(0.01, dd),
    };
  };

  for (const veh of ["vertical", "condor"] as const) {
    console.log(`### ${veh === "condor" ? "IRON CÓNDOR" : "VERTICAL (dirección de EVA)"}\n`);
    console.log("| Distancia | ~% spot | media | $/año NUEVA | caída NUEVA | catástrofes | **$/año por punto de caída** |");
    console.log("|---|---|---|---|---|---|---|");
    for (const d of DISTANCIAS) {
      const n = evaluar(nueva, d, veh);
      const pctAprox = media(filas.map((f) => f.pct)) * d * 100;
      console.log(`| ${d.toFixed(2)}σ${d === REFERENCIA ? " ←hoy" : ""} | ${pctAprox.toFixed(1)}% | ${n.m >= 0 ? "+" : ""}${n.m.toFixed(2)}% | $${Math.round(n.porAño).toLocaleString("en-US")} | ${(n.dd * 100).toFixed(0)}% | ${n.cat.toFixed(1)}% | **$${Math.round(n.porCaida).toLocaleString("en-US")}** |`);
    }
    // Elección A CIEGAS: la mejor de la mitad VIEJA, medida en la NUEVA.
    // Se elige por $/año POR PUNTO DE CAÍDA. Elegir por $/año a secas siempre premia la
    // distancia más corta: cobra más prima y revienta más, y la media no distingue eso de un edge.
    let mejor = DISTANCIAS[0], mejorV = -Infinity;
    for (const d of DISTANCIAS) { const v = evaluar(vieja, d, veh).porCaida; if (v > mejorV) { mejorV = v; mejor = d; } }
    const enNueva = evaluar(nueva, mejor, veh), refNueva = evaluar(nueva, REFERENCIA, veh);
    console.log(`\n   Elegida en la VIEJA por $/año POR PUNTO DE CAÍDA: **${mejor.toFixed(2)}σ**`);
    console.log(`   En la NUEVA (no participó en elegirla): $${Math.round(enNueva.porAño).toLocaleString("en-US")}/año · caída ${(enNueva.dd * 100).toFixed(0)}% · **$${Math.round(enNueva.porCaida).toLocaleString("en-US")} por punto**`);
    console.log(`   1σ (lo de hoy) en esa misma mitad:       $${Math.round(refNueva.porAño).toLocaleString("en-US")}/año · caída ${(refNueva.dd * 100).toFixed(0)}% · **$${Math.round(refNueva.porCaida).toLocaleString("en-US")} por punto**`);
    if (mejor === DISTANCIAS[0]) console.log(`   ⚠ El óptimo cae en el BORDE de la rejilla: eso no es un óptimo, es un aviso.`);
    console.log(`   → ${enNueva.porCaida > refNueva.porCaida
      ? `MEJORA incluso ajustando por riesgo: ${mejor.toFixed(2)}σ aguanta fuera de muestra.`
      : `NO mejora. Gana más dólares brutos pero PEOR por unidad de caída: es apalancamiento, no edge. Nos quedamos en 1σ.`}\n`);
  }

  console.log(`### Nota\n`);
  console.log(`   Si el óptimo a ciegas cae lejos del rango 5-10% de la literatura, no es`);
  console.log(`   contradicción: los papers miden venta de puts DESNUDA sobre índices, y esto es`);
  console.log(`   un spread con la pérdida capada sobre una selección de días. Distinto vehículo.`);
})();
