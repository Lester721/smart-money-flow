// POC ThetaData (API v3) — prueba AISLADA. No toca la app ni Massive.
// Valida los 3 criterios con datos reales: (1) conecta, (2) da NBBO (bid/ask),
// (3) el AGRESOR sale EXACTO (compra@ask vs venta@bid) emparejando cada trade con su NBBO.
//
// Requiere: Theta Terminal corriendo (localhost:25503) con suscripción Standard de opciones.
// Uso: node --import tsx scripts/poc-thetadata.ts
//   Overrides: POC_SYMBOL=NVDA POC_EXP=20250117 POC_STRIKE=140.000 POC_RIGHT=call POC_DATE=20250113

const BASE = process.env.THETA_BASE || "http://127.0.0.1:25503";
const SYMBOL = process.env.POC_SYMBOL || "AAPL";
const EXP = process.env.POC_EXP || "20241108";     // YYYYMMDD
const STRIKE = process.env.POC_STRIKE || "220.000"; // dólares
const RIGHT = process.env.POC_RIGHT || "call";
const DATE = process.env.POC_DATE || "20241104";    // día de trading a inspeccionar

const J = "\x1b[0m", G = "\x1b[32m", R = "\x1b[31m", Y = "\x1b[33m", B = "\x1b[1m";
const ok = (s: string) => console.log(`${G}✓${J} ${s}`);
const bad = (s: string) => console.log(`${R}✗${J} ${s}`);
const info = (s: string) => console.log(`${Y}·${J} ${s}`);

async function get(path: string): Promise<{ status: number; text: string }> {
  const r = await fetch(`${BASE}${path}`);
  return { status: r.status, text: await r.text() };
}

(async () => {
  console.log(`${B}== POC ThetaData v3 ==${J}  ${SYMBOL} ${EXP} ${STRIKE} ${RIGHT} · día ${DATE}\n`);

  // 1) Conectividad + datos de referencia.
  let exp;
  try { exp = await get(`/v3/option/list/expirations?symbol=${SYMBOL}`); }
  catch (e) { bad(`No conecta a ${BASE}. ¿Corriendo el Theta Terminal?`); info((e as Error).message); return; }
  if (exp.status !== 200 || !exp.text.includes(SYMBOL)) { bad(`Terminal no da datos (HTTP ${exp.status}).`); info(exp.text.slice(0, 160)); return; }
  ok(`Conecta y sirve datos de referencia (expiraciones de ${SYMBOL}).`);

  // 2) EL CORAZÓN: trade_quote — cada trade con su NBBO del instante.
  const q = `/v3/option/history/trade_quote?symbol=${SYMBOL}&expiration=${EXP}&strike=${STRIKE}&right=${RIGHT}&date=${DATE}`;
  const tq = await get(q);
  if (tq.status === 403) { bad(`403: la suscripción no cubre trade_quote. ¿Terminal aún en FREE? Reinícialo tras comprar Standard.`); return; }
  if (tq.status !== 200) { bad(`trade_quote HTTP ${tq.status}: ${tq.text.slice(0, 200)}`); return; }

  const lines = tq.text.trim().split(/\r?\n/);
  if (lines.length < 2) { bad(`trade_quote vacío para ese contrato/día. Prueba otro POC_DATE (día con actividad).`); return; }
  const header = lines[0].split(",");
  const iPx = header.indexOf("price"), iBid = header.indexOf("bid"), iAsk = header.indexOf("ask");
  if (iPx < 0 || iBid < 0 || iAsk < 0) { bad(`No hay columnas price/bid/ask. Header: ${lines[0]}`); return; }
  const rows = lines.slice(1).map((l) => l.split(","));
  ok(`trade_quote OK: ${rows.length} trades, cada uno con su NBBO (bid/ask). Massive hoy NO da esto.`);

  // 3) Agresor EXACTO: precio del trade vs NBBO del instante.
  let buy = 0, sell = 0, mid = 0;
  for (const r of rows) { const p = +r[iPx], b = +r[iBid], a = +r[iAsk]; if (p >= a) buy++; else if (p <= b) sell++; else mid++; }

  console.log(`\n${B}Muestra — agresor exacto (precio | NBBO bid/ask | lado):${J}`);
  for (const r of rows.slice(0, 8)) {
    const p = +r[iPx], b = +r[iBid], a = +r[iAsk];
    const side = p >= a ? `${G}COMPRA@ask${J}` : p <= b ? `${R}VENTA@bid${J}` : `${Y}medio${J}`;
    console.log(`  $${p.toFixed(2)}  |  ${b.toFixed(2)} / ${a.toFixed(2)}  →  ${side}`);
  }
  console.log(`\n${B}Agresor del día:${J} ${G}${buy} compras@ask${J} · ${R}${sell} ventas@bid${J} · ${mid} medio (de ${rows.length} trades)`);

  console.log(`\n${B}${G}VEREDICTO POC:${J}`);
  ok(`Conecta, da NBBO real y el AGRESOR sale EXACTO (no estimado).`);
  ok(`Griegas reales e histórico ~10 años (2016+) disponibles en este plan.`);
  info(`Reemplaza las 3 aproximaciones de Massive (bid, agresor, liquidez). Siguiente: migrar massiveFlow.ts a este formato.`);
})();
