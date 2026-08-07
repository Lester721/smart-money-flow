// ¿Se puede reconstruir el precio DIARIO del subyacente usando SOLO datos de opciones?
//
// POR QUÉ IMPORTA: el flujo de opciones lo tenemos desde 2016 con la suscripción actual, pero
// los precios de acciones solo desde 2021 (Stocks VALUE). Ese hueco es lo único que impide
// validar el crash del COVID (24 feb – 23 mar 2020). Si el precio se puede derivar de las
// opciones, el hueco se cierra sin pagar nada.
//
// CÓMO SE VALIDA (esto es lo importante):
// No se prueba en 2020 —ahí no hay con qué comparar—. Se prueba en **2021-2026, donde SÍ
// tenemos el precio real de la acción**, y se mide el error contra esa verdad conocida. Solo
// si el método reproduce 2021 con error despreciable se aplica a 2020. Al revés sería fe.
//
// Uso:  DATA_PROVIDER=theta node --env-file=.env.thetadata scripts/with-theta.mjs \
//         npx tsx scripts/probe-spot-desde-opciones.ts

import { fetchDailyUnderlying, monthChunks } from "../lib/thetadata";

const TICKER = process.env.PROBE_TICKER || "SPY";
const AÑO_PRUEBA = process.env.PROBE_YEAR || "2021"; // año CON verdad conocida
const BASE = process.env.THETA_BASE || "http://127.0.0.1:25503";

interface Csv { header: string[]; rows: string[][] }
async function getCsv(path: string): Promise<Csv | null> {
  const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) return null;
  const txt = await res.text();
  if (txt.includes("PERMISSION_DENIED") || txt.startsWith("Requesting")) {
    console.error(`  ⚠ ${path.slice(0, 60)}… → ${txt.slice(0, 120)}`);
    return null;
  }
  const lines = txt.trim().split("\n");
  if (lines.length < 2) return null;
  // El CSV entrecomilla los campos de texto: la fila trae `"CALL"`, no `CALL`. Comparar sin
  // quitar las comillas hace que NADA case y el resultado sale vacío sin un solo error —
  // exactamente lo que pasó en el primer intento (5 millones de filas → 0 días derivados).
  const limpia = (s: string) => s.replace(/^"|"$/g, "");
  return { header: lines[0].split(",").map(limpia), rows: lines.slice(1).map((l) => l.split(",").map(limpia)) };
}
const idx = (h: string[], name: string) => h.indexOf(name);

// ── MÉTODO: paridad put-call ────────────────────────────────────────────────────────────────
// Para un mismo strike K y vencimiento, con call C y put P:   S ≈ C − P + K
// (exacto salvo tasas y dividendos, despreciables a pocas semanas). Sale del MISMO volcado EOD
// de opciones que ya bajamos para elegir contratos líquidos: cuesta CERO llamadas extra.
// Se usa el par más cercano al dinero (|C−P| mínimo) porque ahí ambas patas cotizan apretadas.
interface Fila { exp: string; strike: number; right: string; close: number; volume: number; day: string }

function spotPorParidad(filas: Fila[]): Map<string, number> {
  const porDia = new Map<string, Fila[]>();
  for (const f of filas) {
    const a = porDia.get(f.day); if (a) a.push(f); else porDia.set(f.day, [f]);
  }
  const out = new Map<string, number>();
  for (const [day, dayRows] of porDia) {
    const pares = new Map<string, { c?: Fila; p?: Fila }>();
    for (const f of dayRows) {
      if (!(f.close > 0)) continue;
      const k = `${f.exp}|${f.strike}`;
      const e = pares.get(k) ?? {};
      if (f.right === "CALL") e.c = f; else if (f.right === "PUT") e.p = f;
      pares.set(k, e);
    }
    // Candidatos: pares completos y con volumen en AMBAS patas (si no, el "close" está rancio).
    const cand: { s: number; dist: number; vol: number }[] = [];
    for (const [k, e] of pares) {
      if (!e.c || !e.p) continue;
      if (!(e.c.volume > 0) || !(e.p.volume > 0)) continue;
      const K = Number(k.split("|")[1]);
      cand.push({ s: e.c.close - e.p.close + K, dist: Math.abs(e.c.close - e.p.close), vol: e.c.volume + e.p.volume });
    }
    if (!cand.length) continue;
    // Los 5 más cercanos al dinero, y de esos la MEDIANA: un solo par con un cierre raro no manda.
    cand.sort((a, b) => a.dist - b.dist);
    const top = cand.slice(0, 5).map((c) => c.s).sort((a, b) => a - b);
    out.set(day, top[Math.floor(top.length / 2)]);
  }
  return out;
}

async function bajarEodOpciones(symbol: string, ini: string, fin: string): Promise<Fila[]> {
  const filas: Fila[] = [];
  let cabeceraMostrada = false;
  for (const [cs, ce] of monthChunks(ini, fin)) {
    const csv = await getCsv(`/v3/option/history/eod?symbol=${symbol}&expiration=*&start_date=${cs}&end_date=${ce}`);
    if (!csv) continue;
    if (!cabeceraMostrada) { console.log(`  columnas EOD: ${csv.header.join(", ")}\n`); cabeceraMostrada = true; }
    const iE = idx(csv.header, "expiration"), iK = idx(csv.header, "strike"), iR = idx(csv.header, "right"),
      iC = idx(csv.header, "close"), iV = idx(csv.header, "volume");
    const iT = idx(csv.header, "date") >= 0 ? idx(csv.header, "date")
      : idx(csv.header, "last_trade") >= 0 ? idx(csv.header, "last_trade") : idx(csv.header, "created");
    if (iE < 0 || iK < 0 || iR < 0 || iC < 0 || iT < 0) { console.error("  ⚠ faltan columnas esperadas"); continue; }
    for (const r of csv.rows) {
      const day = (r[iT] || "").slice(0, 10).replace(/-/g, "");
      // Filtrar YA: sin volumen o sin cierre la fila no sirve para la paridad, y un año de SPY
      // son ~5 millones de filas. Guardarlas todas es tirar memoria por gusto.
      const close = Number(r[iC]) || 0, volume = Number(r[iV]) || 0;
      if (!day || !(close > 0) || !(volume > 0)) continue;
      filas.push({ exp: r[iE], strike: Number(r[iK]), right: r[iR], close, volume, day });
    }
  }
  return filas;
}

(async () => {
  console.log(`\n=== ¿Precio del subyacente desde OPCIONES? · ${TICKER} · año de prueba ${AÑO_PRUEBA} ===\n`);

  // 1. VERDAD CONOCIDA — el precio real de la acción (solo existe de 2021 en adelante).
  console.log(`1. Bajando la VERDAD (stock EOD) de ${AÑO_PRUEBA}…`);
  const verdad = await fetchDailyUnderlying(TICKER, `${AÑO_PRUEBA}0101`, `${AÑO_PRUEBA}1231`);
  console.log(`   ${verdad.size} días de precio real\n`);
  if (!verdad.size) { console.error("Sin verdad con la que comparar — aborta."); process.exit(1); }

  // 2. EL CANDIDATO — precio derivado por paridad put-call.
  console.log(`2. Bajando EOD de opciones de ${AÑO_PRUEBA} y derivando por paridad put-call…`);
  const filas = await bajarEodOpciones(TICKER, `${AÑO_PRUEBA}0101`, `${AÑO_PRUEBA}1231`);
  console.log(`   ${filas.length} filas de contratos`);
  const derivado = spotPorParidad(filas);
  console.log(`   ${derivado.size} días derivados\n`);

  // 3. EL VEREDICTO — error contra la verdad, día por día.
  const errores: { day: string; real: number; est: number; pct: number }[] = [];
  for (const [day, real] of verdad) {
    const est = derivado.get(day);
    if (est == null || !(real > 0)) continue;
    errores.push({ day, real, est, pct: Math.abs(est - real) / real * 100 });
  }
  if (!errores.length) { console.error("3. Ningún día coincide — el método NO sirve."); process.exit(1); }
  errores.sort((a, b) => a.pct - b.pct);
  const p = (q: number) => errores[Math.min(errores.length - 1, Math.floor(errores.length * q))].pct;
  const cobertura = Math.round(errores.length / verdad.size * 100);

  console.log("3. VEREDICTO\n");
  console.log(`   Días comparados : ${errores.length} de ${verdad.size} (${cobertura}% de cobertura)`);
  console.log(`   Error mediano   : ${p(0.5).toFixed(3)}%`);
  console.log(`   Error p90       : ${p(0.9).toFixed(3)}%`);
  console.log(`   Error máximo    : ${errores[errores.length - 1].pct.toFixed(3)}%  (${errores[errores.length - 1].day})`);
  console.log("\n   peores 5 días:");
  for (const e of errores.slice(-5)) console.log(`     ${e.day}  real ${e.real.toFixed(2)}  est ${e.est.toFixed(2)}  → ${e.pct.toFixed(2)}%`);

  // Umbral: para calcular σ y liquidar spreads, un error mediano <0,5% con >90% de cobertura es
  // usable; por encima de eso el ruido del precio contamina el resultado del backtest.
  const sirve = p(0.5) < 0.5 && cobertura > 90;
  console.log(`\n   ${sirve ? "✅ USABLE" : "❌ NO USABLE"} — criterio: error mediano <0,5% Y cobertura >90%`);
  if (!sirve) console.log("   → el COVID solo se puede validar comprando Stocks Standard.");
})();
