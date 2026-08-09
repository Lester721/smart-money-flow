// FORWARD-TEST DE 0DTE — grabando, sin decidir nada.
//
// CORRE EN RAILWAY, no en el PC de Lester.
//
// Yo escribí antes que Railway no podía llegar a ThetaData porque `THETA_BASE` apunta a
// localhost. FALSO: `scripts/with-theta.mjs` arranca un Terminal EFÍMERO dentro del contenedor
// antes de cada job, corre el comando y lo apaga. `railway.odte.json` lo usa como startCommand,
// igual que el forward-test de credit spread.
//
// Importa que corra en la nube: la computadora de Lester se enciende de forma irregular — puede
// que por la mañana, por la tarde o ningún día — y este registrador necesita el spot de las
// 11:00 ET de CADA sesión. Una dependencia así perdería días sin avisar.
//
// LA ESTRATEGIA QUE REGISTRA (backtest: 1.053 días de SPY, 2022-2026):
//   SPY · 0DTE · solo días de GAMMA POSITIVA (calculada con el OI del cierre anterior)
//   BEAR CALL SPREAD a 1σ, ancho 0,5σ · entrada ~11:00 ET
//   ~70 días/año · ~+4-5% por operación · ~$3.400/año con $1.200 de riesgo
//
// POR QUÉ ESE VEHÍCULO Y NO OTRO:
//   · Cóndor NO: da más en papel (+8,08%) pero Lester no puede ejecutarlo — en Robinhood mobile
//     hay que armarlo pata por pata y tarda horas en llenarse. Un +8% que no entra vale cero.
//   · El LADO es siempre call: probamos cinco maneras de elegirlo (dirección de EVA a 5d y a 0d,
//     el impulso de la mañana, el impulso con gamma negativa, y al azar) y ninguna supera a
//     vender siempre el call. Gana 4/4 en las dos mitades.
//   · Gamma NEGATIVA no: pierde -5% validado en las dos mitades.
//
// Uso en Railway: railway.odte.json → node scripts/with-theta.mjs npm run odte-forward
// Uso local (para probar, con el Terminal arriba):
//   node --env-file=.env.local --import tsx scripts/odte-forward.ts

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { bsPrice, bsGamma } from "../lib/blackScholes";
import { avisar } from "../lib/telegram";

const BASE = process.env.THETA_BASE || "http://127.0.0.1:25503";
const TICKER = "SPY";
const LEDGER = process.env.ODTE_LEDGER || "data/forward/odte-ledger.json";
const ENTRADA = 11 * 60, CIERRE = 16 * 60, MIN_SESION = 390;
const SIGMA = 1, ANCHO = 0.5;
// ROBINHOOD: $0 de comisión, ~$0,03 de tasas por contrato. Ver CLAUDE.md.
const SLIP = 0.02, COMM = 0.03;
const MAX_DTE_GEX = 21;

interface Pos {
  ymd: string; entrada: string; spot: number; gexNorm: number;
  shortK: number; longK: number; netCredit: number; width: number; em: number;
  estado: "abierta" | "cerrada";
  cierre?: number; retOnRisk?: number;
}

const leerJson = <T,>(p: string, def: T): T => { try { return JSON.parse(readFileSync(p, "utf8")) as T; } catch { return def; } };
function guardar(p: string, d: unknown) { if (!existsSync(dirname(p))) mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, JSON.stringify(d, null, 2), "utf8"); }
const round = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

/** GET al Terminal. LANZA si no responde: un forward-test que falla en silencio no vale nada. */
async function getCsv(ruta: string): Promise<{ head: string[]; rows: string[][] }> {
  const r = await fetch(`${BASE}${ruta}`, { signal: AbortSignal.timeout(90_000) });
  if (!r.ok) throw new Error(`ThetaData ${r.status} en ${ruta}`);
  const t = (await r.text()).trim();
  const l = t.split("\n");
  if (l.length < 2) return { head: [], rows: [] };
  return { head: l[0].split(",").map((h) => h.trim().replace(/^"|"$/g, "")), rows: l.slice(1).map((x) => x.split(",")) };
}
/** El nombre de la columna de fecha CAMBIA por endpoint: EOD usa `created`, el OI usa
 *  `timestamp`, otros usan `date`. Buscar solo uno es como se perdieron 75 minutos con el OI. */
const col = (h: string[], ...ns: string[]) => { for (const n of ns) { const i = h.indexOf(n); if (i >= 0) return i; } return -1; };
const limpia = (s: string) => (s ?? "").replace(/"/g, "").trim();

(async () => {
  // ── El Terminal tiene que estar vivo. Si no, se dice y se para. ─────────────────────────
  // NO hay endpoint de estado: /v3/system/* devuelve 404. Se usa una petición de datos mínima,
  // que además comprueba lo que de verdad importa — que el Terminal está AUTENTICADO, no solo
  // que el puerto acepta conexiones.
  try {
    const r = await fetch(`${BASE}/v3/stock/history/eod?symbol=${TICKER}&start_date=20260731&end_date=20260731`,
      { signal: AbortSignal.timeout(20_000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    if ((await r.text()).trim().split("\n").length < 2) throw new Error("responde pero sin datos (¿sin autenticar?)");
  } catch (e) {
    console.log(`\n✗ El Terminal de ThetaData no responde en ${BASE}`);
    console.log(`  Arráncalo (ver CLAUDE.md §0) y vuelve a correr esto.`);
    console.log(`  Detalle: ${String(e)}\n`);
    await avisar(`<b>0DTE — no se pudo registrar</b>\n\nEl Terminal de ThetaData no responde. Hoy no hay dato.`);
    process.exit(1);
  }

  const hoy = new Date();
  const ymdHoy = hoy.toISOString().slice(0, 10).replace(/-/g, "");
  const ledger = leerJson<Pos[]>(LEDGER, []);

  // ── 1. Liquidar lo que quedó abierto de días anteriores ────────────────────────────────
  // Se hace ANTES de abrir nada: si el proceso muere a media faena, lo pendiente ya está cerrado.
  let liquidadas = 0;
  for (const p of ledger.filter((x) => x.estado === "abierta" && x.ymd < ymdHoy)) {
    const { head, rows } = await getCsv(`/v3/stock/history/eod?symbol=${TICKER}&start_date=${p.ymd}&end_date=${p.ymd}`);
    const iC = col(head, "close");
    const cierre = rows.length && iC >= 0 ? Number(limpia(rows[rows.length - 1][iC])) : NaN;
    if (!(cierre > 0)) { console.log(`  ⚠ ${p.ymd}: sin cierre todavía, se reintenta mañana`); continue; }
    const perd = Math.max(cierre - p.shortK, 0) - Math.max(cierre - p.longK, 0);
    const riesgo = p.width - p.netCredit;
    p.cierre = round(cierre);
    p.retOnRisk = round((riesgo > 0 ? (p.netCredit - perd) / riesgo : 0) * 100, 1);
    p.estado = "cerrada";
    liquidadas++;
  }

  // ── 2. ¿Toca operar hoy? ────────────────────────────────────────────────────────────────
  if (ledger.some((p) => p.ymd === ymdHoy)) { console.log(`\n${ymdHoy}: ya registrado hoy — no se duplica.`); guardar(LEDGER, ledger); return; }

  // Cierres diarios recientes: para la rv y para saber cuál fue el día hábil anterior.
  const desde = new Date(hoy.getTime() - 70 * 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
  const eod = await getCsv(`/v3/stock/history/eod?symbol=${TICKER}&start_date=${desde}&end_date=${ymdHoy}`);
  const iF = col(eod.head, "created", "date", "timestamp"), iC = col(eod.head, "close");
  if (iF < 0 || iC < 0) { console.log(`✗ El EOD no trae fecha/cierre. Columnas: ${eod.head.join(",")}`); process.exit(1); }
  const cierres = eod.rows.map((r) => ({ ymd: limpia(r[iF]).slice(0, 10).replace(/-/g, ""), c: Number(limpia(r[iC])) }))
    .filter((x) => x.ymd && x.c > 0).sort((a, b) => (a.ymd < b.ymd ? -1 : 1));
  const previos = cierres.filter((x) => x.ymd < ymdHoy);
  if (previos.length < 25) { console.log(`✗ Solo ${previos.length} cierres previos: no alcanza para la rv.`); return; }
  const anterior = previos[previos.length - 1];

  const lr: number[] = [];
  for (let i = Math.max(1, previos.length - 20); i < previos.length; i++) lr.push(Math.log(previos[i].c / previos[i - 1].c));
  const mu = lr.reduce((s, x) => s + x, 0) / lr.length;
  const rv = Math.sqrt(lr.reduce((s, x) => s + (x - mu) ** 2, 0) / (lr.length - 1)) * Math.sqrt(252);

  // ── 3. La gamma del CIERRE ANTERIOR — lo único conocido al abrir ────────────────────────
  const oiCsv = await getCsv(`/v3/option/history/open_interest?symbol=${TICKER}&expiration=*&start_date=${anterior.ymd}&end_date=${anterior.ymd}`);
  const iK = col(oiCsv.head, "strike"), iR = col(oiCsv.head, "right"), iO = col(oiCsv.head, "open_interest"), iE = col(oiCsv.head, "expiration");
  if (iK < 0 || iO < 0) { console.log(`✗ El OI no trae las columnas esperadas: ${oiCsv.head.join(",")}`); process.exit(1); }
  let gex = 0, nOi = 0;
  for (const r of oiCsv.rows) {
    const K = Number(limpia(r[iK])) / (limpia(r[iK]).includes(".") ? 1 : 1000);
    const oiV = Number(limpia(r[iO]));
    const exp = limpia(r[iE] ?? "").replace(/-/g, "");
    if (!(K > 0) || !(oiV > 0) || !exp) continue;
    const dte = (Date.parse(`${exp.slice(0, 4)}-${exp.slice(4, 6)}-${exp.slice(6, 8)}`) - Date.parse(`${anterior.ymd.slice(0, 4)}-${anterior.ymd.slice(4, 6)}-${anterior.ymd.slice(6, 8)}`)) / 86_400_000;
    if (dte < 0 || dte > MAX_DTE_GEX) continue;
    if (Math.abs(K - anterior.c) / anterior.c > 0.15) continue;
    const g = bsGamma(anterior.c, K, 1 / 365, rv);
    if (!(g > 0)) continue;
    const signo = limpia(r[iR] ?? "").toUpperCase().startsWith("C") ? 1 : -1;
    gex += g * signo * oiV * 100 * anterior.c * anterior.c * 0.01;
    nOi++;
  }
  if (!nOi) { console.log(`✗ Cero contratos de OI válidos para ${anterior.ymd} — no se registra nada.`); process.exit(1); }
  const gexNorm = gex / (anterior.c * anterior.c);

  console.log(`\n## 0DTE forward · ${ymdHoy}\n`);
  console.log(`   rv 20d: ${(rv * 100).toFixed(1)}%  ·  cierre previo (${anterior.ymd}): $${anterior.c}`);
  console.log(`   GEX normalizado: ${gexNorm > 0 ? "+" : ""}${Math.round(gexNorm).toLocaleString("en-US")}  (${nOi} contratos)`);

  if (gexNorm <= 0) {
    console.log(`\n   → GAMMA NEGATIVA: hoy NO se opera. (En backtest, gamma negativa da −5% validado.)\n`);
    guardar(LEDGER, ledger);
    return;
  }

  // ── 4. Spot a las 11:00 y registro de la posición ───────────────────────────────────────
  // Si hoy no hay sesión (fin de semana, festivo) o SPY no tiene vencimiento hoy, ThetaData
  // devuelve 400. Eso NO es un error del script: es que no toca operar. Se distingue de un fallo
  // real para no llenar el log de falsas alarmas ni disparar avisos por un domingo.
  let gr: { head: string[]; rows: string[][] };
  try {
    gr = await getCsv(`/v3/option/history/greeks/implied_volatility?symbol=${TICKER}&expiration=${ymdHoy}&date=${ymdHoy}&interval=1m&strike=${Math.round(anterior.c)}&right=C`);
  } catch {
    console.log(`\n   → Hoy no hay sesión con vencimiento 0DTE en ${TICKER} (fin de semana o festivo). Nada que registrar.\n`);
    guardar(LEDGER, ledger);
    return;
  }
  if (!gr.rows.length) {
    console.log(`\n   → Sin datos intradía para hoy todavía. Si el mercado está abierto, vuelve a correrlo pasadas las 11:00 ET.\n`);
    guardar(LEDGER, ledger);
    return;
  }
  const iT = col(gr.head, "underlying_timestamp"), iP = col(gr.head, "underlying_price");
  let spot: number | null = null;
  for (const r of gr.rows) {
    const m = /T(\d{2}):(\d{2})/.exec(limpia(r[iT]));
    if (!m) continue;
    const min = Number(m[1]) * 60 + Number(m[2]);
    if (min > ENTRADA) break;
    const px = Number(limpia(r[iP]));
    if (px > 0) spot = px;
  }
  if (spot == null) { console.log(`\n   ✗ Sin spot de las ${ENTRADA / 60}:00 todavía. ¿Corriste esto antes de esa hora?\n`); return; }

  // Movimiento esperado de la tarde. Se usa la rv diaria ESCALADA POR 0,705 — medido sobre
  // 1.053 días: el movimiento real de 11:00 al cierre es 0,563 veces el que predice la vol
  // diaria, cuando debería ser 0,798. Sin ese ajuste los strikes quedan un 40% demasiado lejos.
  const T = ((CIERRE - ENTRADA) / MIN_SESION) / 252;
  const em = spot * rv * Math.sqrt(T) * (0.563 / 0.798);
  const shortK = spot + SIGMA * em, longK = shortK + ANCHO * em;
  const rvAjust = em / (spot * Math.sqrt(T));
  const credit = bsPrice(spot, shortK, T, rvAjust, "call") - bsPrice(spot, longK, T, rvAjust, "call");
  const width = ANCHO * em;
  const netCredit = credit * (1 - SLIP) - (COMM * 2) / 100;
  if (!(netCredit > 0) || !(width - netCredit > 0)) { console.log(`\n   ✗ No queda prima tras costes. No se registra.\n`); guardar(LEDGER, ledger); return; }

  ledger.push({
    ymd: ymdHoy, entrada: `${ENTRADA / 60}:00`, spot: round(spot), gexNorm: Math.round(gexNorm),
    shortK: round(shortK), longK: round(longK), netCredit: round(netCredit, 4), width: round(width), em: round(em),
    estado: "abierta",
  });
  guardar(LEDGER, ledger);

  console.log(`\n   → GAMMA POSITIVA: bear call spread registrado`);
  console.log(`     spot $${round(spot)} · vende $${round(shortK)} / compra $${round(longK)} · crédito $${round(netCredit, 2)}\n`);

  // ── Informe ─────────────────────────────────────────────────────────────────────────────
  const cerradas = ledger.filter((p) => p.estado === "cerrada" && p.retOnRisk != null);
  if (cerradas.length) {
    const rs = cerradas.map((p) => p.retOnRisk!);
    const m = rs.reduce((s, x) => s + x, 0) / rs.length;
    const win = (rs.filter((x) => x > 0).length / rs.length) * 100;
    console.log(`   Acumulado: ${cerradas.length} cerradas · media ${m >= 0 ? "+" : ""}${m.toFixed(1)}% · win ${win.toFixed(0)}%`);
    console.log(`   El backtest esperaba ~+4-5% por operación. Con menos de 30 cierres no se concluye nada.`);
  }
  if (liquidadas) console.log(`   (${liquidadas} posición(es) liquidada(s) en esta pasada)`);
})();
