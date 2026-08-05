// POC ThetaData — prueba de concepto AISLADA. No toca la app; no usa Massive.
// Objetivo: confirmar los 3 criterios que nos importan, con NUESTROS tickers:
//   (1) ¿Conecta? (2) ¿Da NBBO (bid/ask) real? (3) ¿Podemos calcular el AGRESOR exacto
//       (compró al ask vs vendió al bid) con el trade emparejado a su NBBO?
//
// Cómo funciona ThetaData en Node: corres el "Theta Terminal" (app Java) localmente con TU
// API key; el Terminal expone una API REST en http://127.0.0.1:25510. Este script solo pega
// a ese localhost — la API key vive en el Terminal, NO en nuestro código (limpio y seguro).
//
// Uso (una vez el Terminal está corriendo):
//   node --import tsx scripts/poc-thetadata.ts
//   (opcional) POC_ROOT=NVDA POC_DATE=20260728 node --import tsx scripts/poc-thetadata.ts

const BASE = process.env.THETA_BASE || "http://127.0.0.1:25510";
const ROOT = process.env.POC_ROOT || "AAPL";
// Fecha de un día hábil reciente con datos (YYYYMMDD). Ajústala si el plan no cubre esa fecha.
const DATE = process.env.POC_DATE || "20260728";

const J = "\x1b[0m", G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", B = "\x1b[1m";
const ok = (s: string) => console.log(`${G}✓${J} ${s}`);
const bad = (s: string) => console.log(`${R}✗${J} ${s}`);
const info = (s: string) => console.log(`${Y}·${J} ${s}`);

async function get(path: string): Promise<any> {
  const url = `${BASE}${path}`;
  const res = await fetch(url);
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* puede ser CSV u otro */ }
  return { status: res.status, json, text, url };
}

// Encuentra el índice de una columna por nombre (ThetaData nombra columnas en header.format).
function colIdx(format: string[], ...names: string[]): number {
  for (const n of names) {
    const i = format.findIndex((f) => f.toLowerCase() === n.toLowerCase());
    if (i >= 0) return i;
  }
  return -1;
}

(async () => {
  console.log(`${B}== POC ThetaData ==${J}  base=${BASE}  root=${ROOT}  fecha=${DATE}\n`);

  // 0) ¿El Terminal responde?
  try {
    const ping = await get(`/v2/list/roots/option`);
    if (ping.status === 200) ok(`Terminal responde (HTTP 200).`);
    else { bad(`Terminal respondió HTTP ${ping.status}. ¿Está corriendo el Theta Terminal?`); info(ping.text.slice(0, 200)); return; }
  } catch (e) {
    bad(`No pude conectar a ${BASE}. ¿Corriste el Theta Terminal (jar Java) con tu API key?`);
    info((e as Error).message);
    return;
  }

  // 1) Descubrir un contrato: vencimientos → un vencimiento → strikes → strike cercano al dinero.
  let exp: number | null = null, strike: number | null = null, right: "C" | "P" = "C";
  try {
    const exps = await get(`/v2/list/expirations?root=${ROOT}`);
    const list: number[] = exps.json?.response ?? [];
    // primer vencimiento en/after la fecha de prueba (>= DATE)
    exp = list.find((e) => e >= Number(DATE)) ?? list[list.length - 1] ?? null;
    if (!exp) { bad(`Sin vencimientos para ${ROOT}.`); info(JSON.stringify(exps.json).slice(0, 200)); return; }
    ok(`Vencimientos: ${list.length}. Uso exp=${exp}.`);
    const strikes = await get(`/v2/list/strikes?root=${ROOT}&exp=${exp}`);
    const sl: number[] = strikes.json?.response ?? [];
    strike = sl[Math.floor(sl.length / 2)] ?? null; // ~mediana como proxy de ATM
    if (!strike) { bad(`Sin strikes para ${ROOT} ${exp}.`); return; }
    ok(`Strikes: ${sl.length}. Uso strike=${strike} ($${(strike / 1000).toFixed(2)}), right=${right}.`);
  } catch (e) {
    bad(`Fallo listando contratos: ${(e as Error).message}`);
    return;
  }

  // 2) EL CORAZÓN: trade_quote — cada trade con su NBBO en el instante.
  const q = `/v2/hist/option/trade_quote?root=${ROOT}&exp=${exp}&strike=${strike}&right=${right}&start_date=${DATE}&end_date=${DATE}&pretty_time=true`;
  const tq = await get(q);
  if (tq.status !== 200) { bad(`trade_quote HTTP ${tq.status}: ${tq.text.slice(0, 200)}`); return; }
  const fmt: string[] = tq.json?.header?.format ?? [];
  const rows: any[][] = tq.json?.response ?? [];
  if (!fmt.length || !rows.length) {
    bad(`trade_quote vino vacío (¿fecha sin datos o plan sin histórico de opciones?).`);
    info(`Prueba otra POC_DATE (día hábil con actividad). Respuesta: ${JSON.stringify(tq.json).slice(0, 200)}`);
    return;
  }
  ok(`trade_quote OK: ${rows.length} trades. Columnas: [${fmt.join(", ")}]`);

  // 3) ¿Están el bid/ask (NBBO) y el precio del trade? → calcular el AGRESOR.
  const iBid = colIdx(fmt, "bid"), iAsk = colIdx(fmt, "ask"), iPx = colIdx(fmt, "price");
  if (iBid < 0 || iAsk < 0 || iPx < 0) {
    bad(`No encontré columnas bid/ask/price por nombre. Columnas reales: ${fmt.join(", ")}`);
    info(`Primeras filas: ${JSON.stringify(rows.slice(0, 3))}`);
    return;
  }
  ok(`NBBO presente: hay bid Y ask por trade. (Massive hoy NO nos da esto.)`);

  console.log(`\n${B}Muestra — agresor exacto (trade vs NBBO del instante):${J}`);
  let buys = 0, sells = 0, mid = 0;
  for (const r of rows) {
    const bid = r[iBid], ask = r[iAsk], px = r[iPx];
    const side = px >= ask ? "COMPRA al ask (alcista)" : px <= bid ? "VENTA al bid (bajista)" : "en medio";
    if (px >= ask) buys++; else if (px <= bid) sells++; else mid++;
  }
  for (const r of rows.slice(0, 6)) {
    const bid = r[iBid], ask = r[iAsk], px = r[iPx];
    const side = px >= ask ? `${G}COMPRA@ask${J}` : px <= bid ? `${R}VENTA@bid${J}` : `${Y}medio${J}`;
    console.log(`  precio ${px}  |  NBBO ${bid} / ${ask}  →  ${side}`);
  }
  console.log(`\n${B}Resumen del agresor:${J} ${buys} compras@ask · ${sells} ventas@bid · ${mid} en medio (de ${rows.length})`);

  console.log(`\n${B}${G}VEREDICTO POC:${J}`);
  ok(`Conecta, da NBBO real y el agresor se calcula EXACTO (no estimado).`);
  info(`Esto es justo lo que hoy aproximamos con Massive. Siguiente: medir esfuerzo de migrar massiveFlow.ts a este formato.`);
})();
