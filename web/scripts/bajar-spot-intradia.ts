// Descarga la serie INTRADÍA del subyacente (minuto a minuto) para el backtest de 0DTE.
//
// POR QUÉ SOLO EL SPOT. Valoramos con Black-Scholes, así que no hacen falta precios de opciones:
// basta con saber dónde estaba el subyacente al entrar y dónde acabó al cierre.
//
// EL TRUCO QUE HACE ESTO VIABLE (medido el 2026-08-09, anotado en CLAUDE.md): el endpoint de
// griegas repite `underlying_price` en CADA strike. Sin filtro son 18,5 MB por día; pidiendo UN
// solo strike, 103 KB. 180×. Para 2022-2026 es la diferencia entre 18 GB y ~100 MB.
//
// EL STRIKE NO PUEDE SER FIJO: SPY valía ~380 en 2022 y ~770 en 2026. Se elige a partir del
// cierre del día anterior, que ya tenemos en la caché de barras. Si ese strike no existe en la
// cadena de ese día, se prueban vecinos antes de darse por vencido.
//
// Uso: node --import tsx scripts/bajar-spot-intradia.ts [ticker] [añoDesde] [añoHasta]
//      node --import tsx scripts/bajar-spot-intradia.ts SPY 2022 2026
//
// Requiere el Terminal arriba (ver CLAUDE.md §0 — necesita JAVA_TOOL_OPTIONS, no -D).

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";

const TICKER = process.argv[2] || "SPY";
const AÑO_INI = Number(process.argv[3] || 2022);
const AÑO_FIN = Number(process.argv[4] || 2026);
const BASE = "http://localhost:25503";
const DIR = "scripts/cache-theta";
const CONC = 4;                        // lo que permite el plan Standard; más no acelera

interface Bar { time: string; close: number }
/** fecha YYYYMMDD → [[msDesdeMedianoche, precio], ...] a lo largo del día */
type SerieDia = Record<string, [number, number][]>;

const leer = <T,>(p: string): T | null => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };

async function pMap<T, R>(items: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    for (;;) { const k = i++; if (k >= items.length) return; out[k] = await fn(items[k], k); }
  }));
  return out;
}

/** Descarga la serie de un día. Devuelve null si no hay expiración 0DTE ese día. */
async function serieDelDia(ymd: string, strikeBase: number): Promise<[number, number][] | null> {
  // SPY cotiza strikes de $1 cerca del dinero. Si el elegido no existe, se prueban vecinos:
  // un hueco en la cadena no puede costarnos el día entero.
  for (const delta of [0, 1, -1, 2, -2, 5, -5]) {
    const k = Math.round(strikeBase) + delta;
    const url = `${BASE}/v3/option/history/greeks/implied_volatility`
      + `?symbol=${TICKER}&expiration=${ymd}&date=${ymd}&interval=1m&strike=${k}&right=C`;
    let txt: string;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(90_000) });
      if (!r.ok) continue;
      txt = await r.text();
    } catch { continue; }
    const lineas = txt.trim().split("\n");
    if (lineas.length < 3) continue;                    // solo cabecera → ese strike no existe
    const head = lineas[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
    const iTs = head.indexOf("underlying_timestamp"), iPx = head.indexOf("underlying_price");
    if (iTs < 0 || iPx < 0) continue;

    const vistos = new Set<number>();
    const serie: [number, number][] = [];
    for (let j = 1; j < lineas.length; j++) {
      const c = lineas[j].split(",");
      const ts = (c[iTs] ?? "").replace(/"/g, "");
      const px = Number(c[iPx]);
      if (!ts || !(px > 0)) continue;
      // "2026-08-07T09:31:00.000" → minutos desde medianoche, que es lo único que importa
      const m = /T(\d{2}):(\d{2})/.exec(ts);
      if (!m) continue;
      const min = Number(m[1]) * 60 + Number(m[2]);
      if (vistos.has(min)) continue;
      vistos.add(min);
      serie.push([min, px]);
    }
    if (serie.length >= 100) {           // un día hábil completo son ~390 minutos
      serie.sort((a, b) => a[0] - b[0]);
      return serie;
    }
  }
  return null;
}

(async () => {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });

  // Los días hábiles y el cierre previo salen de las barras que YA tenemos.
  const trozos: Bar[] = [];
  for (const f of readdirSync(DIR)) {
    if (f.startsWith(`${TICKER}_barsPAR_y_`) && f.endsWith(".json")) for (const x of leer<Bar[]>(`${DIR}/${f}`) ?? []) trozos.push(x);
  }
  const bars = [...new Map(trozos.map((x) => [x.time, x] as const)).values()].sort((a, b) => (a.time < b.time ? -1 : 1));
  if (!bars.length) { console.log(`✗ No hay barras de ${TICKER} en ${DIR}. Sin ellas no sé qué días ni qué strike pedir.`); process.exit(1); }

  console.log(`\n## Spot intradía de ${TICKER} · ${AÑO_INI}-${AÑO_FIN} · concurrencia ${CONC}\n`);

  for (let año = AÑO_INI; año <= AÑO_FIN; año++) {
    const salida = `${DIR}/${TICKER}_spotmin_y_${año}.json`;
    if (existsSync(salida)) {
      const ya = leer<SerieDia>(salida);
      if (ya && Object.keys(ya).length) { console.log(`${año}: ya en caché (${Object.keys(ya).length} días) — se salta`); continue; }
    }
    // El cierre del día ANTERIOR fija el strike a pedir (a esa hora aún no se conoce el de hoy).
    const dias: { ymd: string; strike: number }[] = [];
    for (let i = 1; i < bars.length; i++) {
      if (!bars[i].time.startsWith(String(año))) continue;
      dias.push({ ymd: bars[i].time.replace(/-/g, ""), strike: bars[i - 1].close });
    }
    if (!dias.length) { console.log(`${año}: sin días hábiles en las barras`); continue; }

    const t0 = Date.now();
    let ok = 0, sinExp = 0;
    const res = await pMap(dias, CONC, async (d) => {
      const s = await serieDelDia(d.ymd, d.strike);
      if (s) ok++; else sinExp++;
      if ((ok + sinExp) % 50 === 0) process.stdout.write(`\r  ${año}: ${ok + sinExp}/${dias.length}…`);
      return [d.ymd, s] as const;
    });

    const acumulado: SerieDia = {};
    for (const [ymd, s] of res) if (s) acumulado[ymd] = s;

    const cobertura = (ok / dias.length) * 100;
    const seg = ((Date.now() - t0) / 1000).toFixed(0);
    // Un año vacío NO se cachea: guardarlo enmascararía el fallo y el siguiente arranque lo
    // daría por bueno. Es el error que ya nos costó 75 minutos con el OI.
    if (!ok) { console.log(`\r  ${año}: 0 días con datos — NO se cachea (algo va mal, no es un año sin mercado)`); continue; }
    writeFileSync(salida, JSON.stringify(acumulado), "utf8");
    const mb = (JSON.stringify(acumulado).length / 1e6).toFixed(1);
    console.log(`\r  ${año}: ${ok}/${dias.length} días (${cobertura.toFixed(0)}%) · ${mb} MB · ${seg}s${sinExp ? ` · ${sinExp} sin expiración 0DTE` : ""}`);
  }

  // ── Validación, sin esperar a que Lester pregunte ────────────────────────────────────────
  console.log(`\n### Validación\n`);
  let totalDias = 0, totalMin = 0;
  for (let año = AÑO_INI; año <= AÑO_FIN; año++) {
    const d = leer<SerieDia>(`${DIR}/${TICKER}_spotmin_y_${año}.json`);
    if (!d) { console.log(`   ${año}: sin archivo`); continue; }
    const dias = Object.keys(d);
    const mins = dias.map((k) => d[k].length);
    const precios = dias.flatMap((k) => d[k].map(([, p]) => p));
    const medMin = mins.reduce((s, x) => s + x, 0) / Math.max(1, mins.length);
    console.log(`   ${año}: ${dias.length} días · ${medMin.toFixed(0)} min/día de media · precio ${Math.min(...precios).toFixed(0)}-${Math.max(...precios).toFixed(0)}`);
    totalDias += dias.length; totalMin += mins.reduce((s, x) => s + x, 0);
  }
  console.log(`\n   TOTAL: ${totalDias} días · ${(totalMin / 1000).toFixed(0)}k puntos`);
  console.log(`   Un día hábil completo son ~390 minutos: si la media baja mucho de ahí, hay días truncados.`);
})();
