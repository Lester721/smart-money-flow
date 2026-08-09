// LA VÍA RELATIVA — la última que le queda a EVA.
//
// Ya sabemos dos cosas:
//   1. EVA predice el movimiento realizado, limpio y monótono (0,751 / 0,948 / 1,039).
//   2. El mercado YA lo cobra: la brecha mov-real/mov-implícito es 0,980 en los tres tercios.
//
// Pero (2) se midió mezclando días y tickers. Si un día entero es volátil, TODAS las opciones de
// ese día cotizan caras y la comparación se contamina con el régimen del mercado.
//
// LA VÍA RELATIVA controla eso: el MISMO DÍA, se compara el ticker de mayor convicción contra el
// de menor. Se vende volatilidad en el que EVA dice que se moverá poco y se compra en el que dice
// que se moverá mucho. Ahí no se compite contra el precio absoluto de cada opción —que el mercado
// clava— sino contra la DIFERENCIA entre dos, donde tiene menos incentivo a ser eficiente.
//
// VEHÍCULO: straddle (call + put al mismo strike, el más cercano al dinero). Es la apuesta pura a
// volatilidad, sin dirección — que es lo único que EVA sabe predecir.
//
// Uso: node --import tsx scripts/eva-par-relativo.ts

import { readFileSync, readdirSync } from "node:fs";
import { classifyFlow } from "../lib/flow";
import { signals, barIdxOnOrAfter, type DBar, type Signal } from "../lib/backtestCore";

const DIR = "scripts/cache-theta", CDIR = `${DIR}/cadenas`;
const TICKERS = ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "META", "TSLA", "AMD"];
const DTE = Number(process.env.PR_DTE ?? 21);
const COMM = 0.03;

const leer = <T,>(p: string): T | null => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const media = (a: number[]) => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
type CadenaDia = Record<string, Record<string, [number, number]>>;

/** Un straddle valorado con bid/ask reales: coste al comprar, ingreso al vender, y su valor final. */
interface Straddle { ticker: string; eva: number; costeCompra: number; ingresoVenta: number; valorFinal: number; spot: number }

(async () => {
  // día → straddles disponibles ese día
  const porDia = new Map<string, Straddle[]>();

  for (const t of TICKERS) {
    const trozos: DBar[] = [];
    for (const f of readdirSync(DIR)) if (f.startsWith(`${t}_barsPAR_y_`)) for (const x of leer<DBar[]>(`${DIR}/${f}`) ?? []) trozos.push(x);
    const bars = [...new Map(trozos.map((x) => [x.time, x] as const)).values()].sort((a, b) => (a.time < b.time ? -1 : 1));
    const trades: unknown[] = [];
    for (const f of readdirSync(DIR)) if (f.startsWith(`${t}_y_`) && f.endsWith(".json")) { const y = leer<unknown[]>(`${DIR}/${f}`); if (y?.length) trades.push(...y); }
    if (bars.length < 300 || !trades.length) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sigs: Signal[] = signals(classifyFlow(trades as any, new Date()).rows, bars);

    for (const sig of sigs) {
      const dia = bars[sig.entryIdx].time.replace(/-/g, "");
      const cad = leer<CadenaDia>(`${CDIR}/${t}_d${dia}.json`);
      if (!cad) continue;
      const objetivo = new Date(Date.parse(`${bars[sig.entryIdx].time}T12:00:00Z`) + DTE * 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
      const exp = Object.keys(cad).sort().find((e) => e >= objetivo);
      if (!exp) continue;
      const expIdx = barIdxOnOrAfter(bars, Date.parse(`${exp.slice(0, 4)}-${exp.slice(4, 6)}-${exp.slice(6, 8)}T20:00:00Z`));
      if (expIdx <= sig.entryIdx) continue;

      const calls = Object.keys(cad[exp]).filter((x) => x.endsWith("|C")).map((x) => Number(x.split("|")[0]));
      if (calls.length < 5) continue;
      const K = calls.reduce((b, x) => (Math.abs(x - sig.spot) < Math.abs(b - sig.spot) ? x : b), calls[0]);
      const qc = cad[exp][`${K}|C`], qp = cad[exp][`${K}|P`];
      if (!qc || !qp) continue;
      // Comprar cuesta el ASK de las dos patas; vender ingresa el BID de las dos.
      const costeCompra = qc[1] + qp[1] + (COMM * 2) / 100;
      const ingresoVenta = qc[0] + qp[0] - (COMM * 2) / 100;
      if (!(costeCompra > 0) || !(ingresoVenta > 0)) continue;
      // Al vencimiento el straddle vale |S − K|.
      const valorFinal = Math.abs(bars[expIdx].close - K);
      if (!porDia.has(dia)) porDia.set(dia, []);
      porDia.get(dia)!.push({ ticker: t, eva: sig.evaComp, costeCompra, ingresoVenta, valorFinal, spot: sig.spot });
    }
  }

  // ── El par: vender vol en el de MAYOR convicción, comprarla en el de MENOR ──────────────
  // Se normaliza cada pata por su propio coste para que un subyacente caro no domine al par.
  interface Par { dia: string; retVenta: number; retCompra: number; retPar: number; retCompraAlto: number; retCompraAzar: number }
  const pares: Par[] = [];
  for (const [dia, lista] of porDia) {
    if (lista.length < 2) continue;
    const orden = [...lista].sort((a, b) => a.eva - b.eva);
    const bajo = orden[0], alto = orden[orden.length - 1];
    if (bajo.ticker === alto.ticker || alto.eva - bajo.eva < 1) continue;   // sin contraste, no hay par
    // VENDE el de alta convicción (espera poco movimiento): gana ingreso − valorFinal.
    const retVenta = (alto.ingresoVenta - alto.valorFinal) / alto.ingresoVenta;
    // COMPRA el de baja convicción (espera mucho movimiento): gana valorFinal − coste.
    const retCompra = (bajo.valorFinal - bajo.costeCompra) / bajo.costeCompra;
    // CONTROL: comprar el straddle del ticker de ALTA convicción, y uno AL AZAR del día. Si
    // rinden lo mismo que comprar el de baja convicción, el +14% no es de EVA — es que comprar
    // straddles funcionó en este periodo y punto.
    const retCompraAlto = (alto.valorFinal - alto.costeCompra) / alto.costeCompra;
    const azar = lista[Math.floor(((pares.length * 9301 + 49297) % 233280) / 233280 * lista.length)];
    const retCompraAzar = (azar.valorFinal - azar.costeCompra) / azar.costeCompra;
    pares.push({ dia, retVenta, retCompra, retPar: (retVenta + retCompra) / 2, retCompraAlto, retCompraAzar });
  }

  console.log(`\n## VÍA RELATIVA · straddles a ${DTE} días · ${pares.length} pares\n`);
  console.log(`El mismo DÍA: vender volatilidad en el ticker de MAYOR convicción de EVA y comprarla`);
  console.log(`en el de MENOR. Precios reales (compra al ask, venta al bid).\n`);
  if (pares.length < 200) { console.log(`muestra insuficiente (${pares.length})`); return; }

  const orden = [...pares].sort((a, b) => (a.dia < b.dia ? -1 : 1));
  const mid = Math.floor(orden.length / 2);
  console.log("| Pata | Media | vieja | nueva | gana |");
  console.log("|---|---|---|---|---|");
  for (const [nom, sel] of [["Vender vol en Top (sola)", (p: Par) => p.retVenta],
                            ["Comprar vol en Bottom (sola)", (p: Par) => p.retCompra],
                            ["**EL PAR (las dos)**", (p: Par) => p.retPar],
                            ["CONTROL — comprar el de ALTA convicción", (p: Par) => p.retCompraAlto],
                            ["CONTROL — comprar uno AL AZAR", (p: Par) => p.retCompraAzar]] as const) {
    const m = media(pares.map(sel)) * 100;
    const v = media(orden.slice(0, mid).map(sel)) * 100, n = media(orden.slice(mid).map(sel)) * 100;
    const win = (pares.filter((p) => sel(p) > 0).length / pares.length) * 100;
    console.log(`| ${nom} | ${m >= 0 ? "+" : ""}${m.toFixed(2)}% | ${v >= 0 ? "+" : ""}${v.toFixed(2)}% | ${n >= 0 ? "+" : ""}${n.toFixed(2)}% | ${win.toFixed(0)}% |`);
  }

  const mPar = media(pares.map((p) => p.retPar)) * 100;
  const vPar = media(orden.slice(0, mid).map((p) => p.retPar)) * 100;
  const nPar = media(orden.slice(mid).map((p) => p.retPar)) * 100;
  console.log(`\n### Veredicto\n`);
  console.log(`   → ${mPar > 0 && vPar > 0 && nPar > 0
    ? "EL PAR FUNCIONA en las DOS mitades. La ventaja de EVA es RELATIVA: el mercado clava el\n     precio absoluto de cada opcion, pero no el orden entre subyacentes el mismo dia."
    : mPar > 0 ? "Positivo de media pero NO en las dos mitades — no se sostiene."
    : "NO FUNCIONA. Ni siquiera la comparacion relativa el mismo dia le saca nada al mercado."}`);
  console.log(`\n   Ojo: el par NO es neutral al mercado. Un dia de panico mueve los dos subyacentes,`);
  console.log(`   asi que la pata comprada gana y la vendida pierde — parte del resultado puede ser`);
  console.log(`   simplemente estar largo de volatilidad, no la señal de EVA.`);
})();
