// Descarga los PRECIOS REALES (bid/ask) de las dos patas del vertical 0DTE, a la hora de entrada.
//
// POR QUÉ IMPORTA MÁS QUE NADA. Todo el proyecto valora las opciones con Black-Scholes y
// volatilidad realizada. Eso asume que la prima de riesgo de varianza es CERO: que cobras
// exactamente lo que el movimiento va a costar. En la realidad la IV supera a la realizada de
// forma sistemática en índices — así que nuestros números podrían ser un SUELO. O al revés: el
// spread bid/ask real (mediana 4,1%, media 7,2%, p90 15,4%) es el DOBLE del 2% que asumimos.
//
// Con los precios reales las dos incógnitas se resuelven de golpe y el backtest deja de depender
// de un modelo.
//
// QUÉ BAJA: para cada día, el bid/ask a las 11:00 de los DOS strikes del bear call spread —
// corto a 1σ y largo a 1,5σ. Dos peticiones por día, no la cadena entera.
//
// Uso: node --import tsx scripts/bajar-quotes-0dte.ts [añoDesde] [añoHasta]

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";

const BASE = process.env.THETA_BASE || "http://127.0.0.1:25503";
const TICKER = "SPY";
const DIR = "scripts/cache-theta";
const AÑO_INI = Number(process.argv[2] || 2022), AÑO_FIN = Number(process.argv[3] || 2026);
const ENTRADA = 11 * 60, CIERRE = 16 * 60, MIN_SESION = 390;
const SIGMA = 1, ANCHO = 0.5;
const CONC = 4;

type SerieDia = Record<string, [number, number][]>;
/** fecha → { strike → [bid, ask] } a las 11:00 */
type QuotesDia = Record<string, Record<string, [number, number]>>;

const leer = <T,>(p: string): T | null => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const spotEn = (s: [number, number][], m: number) => { let b: number | null = null; for (const [x, p] of s) { if (x > m) break; b = p; } return b; };

async function pMap<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length); let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    for (;;) { const k = i++; if (k >= items.length) return; out[k] = await fn(items[k]); }
  }));
  return out;
}

/** bid/ask de un strike a las 11:00. null si no cotizó. */
async function quoteA11(ymd: string, strike: number): Promise<[number, number] | null> {
  const url = `${BASE}/v3/option/history/quote?symbol=${TICKER}&expiration=${ymd}&date=${ymd}&interval=1m&strike=${strike}&right=C`;
  let txt: string;
  try { const r = await fetch(url, { signal: AbortSignal.timeout(60_000) }); if (!r.ok) return null; txt = await r.text(); }
  catch { return null; }
  const l = txt.trim().split("\n");
  if (l.length < 2) return null;
  const h = l[0].split(",").map((x) => x.trim());
  const iT = h.indexOf("timestamp"), iB = h.indexOf("bid"), iA = h.indexOf("ask");
  if (iT < 0 || iB < 0 || iA < 0) return null;
  // El minuto exacto puede faltar: se toma el último con cotización hasta las 11:00.
  let mejor: [number, number] | null = null;
  for (let j = 1; j < l.length; j++) {
    const c = l[j].split(",");
    const m = /T(\d{2}):(\d{2})/.exec((c[iT] ?? "").replace(/"/g, ""));
    if (!m) continue;
    if (Number(m[1]) * 60 + Number(m[2]) > ENTRADA) break;
    const b = Number(c[iB]), a = Number(c[iA]);
    if (b > 0 && a > 0 && a >= b) mejor = [b, a];
  }
  return mejor;
}

(async () => {
  const intradia: SerieDia = {};
  for (const f of readdirSync(DIR)) {
    if (f.startsWith(`${TICKER}_spotmin_y_`) && f.endsWith(".json")) Object.assign(intradia, leer<SerieDia>(`${DIR}/${f}`) ?? {});
  }
  // El movimiento esperado se estima con los 20 días previos de la MISMA franja, igual que el
  // backtest — no extrapolando la vol diaria, que sobreestima la tarde un 42%.
  const orden = Object.keys(intradia).sort();
  const hist: { ymd: string; lr: number }[] = [];
  for (const y of orden) {
    const s = spotEn(intradia[y], ENTRADA), c = intradia[y][intradia[y].length - 1]?.[1];
    if (s && c) hist.push({ ymd: y, lr: Math.log(c / s) });
  }
  const emDe = (ymd: string, spot: number) => {
    const i = hist.findIndex((x) => x.ymd === ymd);
    if (i < 20) return null;
    const p = hist.slice(i - 20, i).map((x) => x.lr);
    const m = p.reduce((s, x) => s + x, 0) / p.length;
    const sd = Math.sqrt(p.reduce((s, x) => s + (x - m) ** 2, 0) / (p.length - 1));
    return sd > 0 ? spot * sd : null;
  };

  console.log(`\n## Quotes reales del vertical 0DTE · ${TICKER} · ${AÑO_INI}-${AÑO_FIN}\n`);
  for (let año = AÑO_INI; año <= AÑO_FIN; año++) {
    const salida = `${DIR}/${TICKER}_q0dte_y_${año}.json`;
    if (existsSync(salida)) { const ya = leer<QuotesDia>(salida); if (ya && Object.keys(ya).length) { console.log(`${año}: ya en caché (${Object.keys(ya).length} días)`); continue; } }

    const dias = orden.filter((y) => y.startsWith(String(año)));
    const tareas: { ymd: string; ks: number[] }[] = [];
    for (const ymd of dias) {
      const spot = spotEn(intradia[ymd], ENTRADA);
      if (!spot) continue;
      const em = emDe(ymd, spot);
      if (em == null) continue;
      // Strikes reales: SPY cotiza de $1 en $1 cerca del dinero, así que se redondea.
      const kCorto = Math.round(spot + SIGMA * em);
      const kLargo = Math.round(spot + (SIGMA + ANCHO) * em);
      if (kLargo <= kCorto) continue;                 // redondeo los junta: ese día no sirve
      tareas.push({ ymd, ks: [kCorto, kLargo] });
    }
    if (!tareas.length) { console.log(`${año}: sin días utilizables`); continue; }

    const t0 = Date.now();
    let ok = 0;
    const acum: QuotesDia = {};
    await pMap(tareas, CONC, async (t) => {
      const [q1, q2] = await Promise.all(t.ks.map((k) => quoteA11(t.ymd, k)));
      if (q1 && q2) { acum[t.ymd] = { [String(t.ks[0])]: q1, [String(t.ks[1])]: q2 }; ok++; }
      if ((ok % 40) === 0 && ok) process.stdout.write(`\r  ${año}: ${ok}/${tareas.length}…`);
    });
    if (!ok) { console.log(`\r  ${año}: 0 días con quotes — NO se cachea`); continue; }
    writeFileSync(salida, JSON.stringify(acum), "utf8");
    console.log(`\r  ${año}: ${ok}/${tareas.length} días (${((ok / tareas.length) * 100).toFixed(0)}%) · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }

  // Validación inmediata: el spread real, que es el número que lo decide todo.
  console.log(`\n### Validación — spread real de la pata corta\n`);
  for (let año = AÑO_INI; año <= AÑO_FIN; año++) {
    const d = leer<QuotesDia>(`${DIR}/${TICKER}_q0dte_y_${año}.json`);
    if (!d) continue;
    const sp: number[] = [];
    for (const k of Object.keys(d)) {
      const strikes = Object.keys(d[k]).map(Number).sort((a, b) => a - b);
      const [b, a] = d[k][String(strikes[0])];
      if (b > 0 && a > 0) sp.push((a - b) / ((a + b) / 2));
    }
    if (!sp.length) continue;
    sp.sort((x, y) => x - y);
    console.log(`   ${año}: ${sp.length} días · spread mediana ${(sp[Math.floor(sp.length / 2)] * 100).toFixed(1)}% · p90 ${(sp[Math.floor(sp.length * 0.9)] * 100).toFixed(1)}%`);
  }
})();
