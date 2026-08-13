// Descarga el OPEN INTEREST histórico por strike y fecha — la materia prima del GEX.
//
// POR QUÉ: para probar la mejora #2 (colocar el strike en un muro de gamma en vez de en 1σ)
// hace falta el OI por strike en CADA fecha de señal. La caché actual solo tiene una foto del
// OI al final de cada rango, que no sirve para 10 años de historia.
//
// QUÉ GUARDA (agregado, no crudo): por fecha y strike, el OI de calls y de puts sumado sobre
// las expiraciones a ≤ MAX_DTE días. Guardar el volcado crudo serían millones de filas por
// ticker-año; esto es lo único que el GEX necesita y cabe en unos megas.
//
// Se cachea POR (ticker, AÑO) igual que todo lo demás: interrumpirlo cuesta el año en curso.
// Un año que vuelva vacío se guarda vacío — es una respuesta, no un fallo (ver el mismo
// razonamiento en backtest-strategy.ts).
//
// Uso: DATA_PROVIDER=theta node --env-file=.env.local scripts/with-theta.mjs \
//        npx tsx scripts/bajar-oi-historico.ts

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
// El mismo mapeo de nombres del cliente: META era FB antes del 2022-06-09 y pedirla por su
// nombre de hoy devuelve VACÍO para los años anteriores. Se importa en vez de reimplementarse
// — la primera versión de este script no lo usó y META perdió 6 de sus 11 años en silencio.
import { segmentosPorSimbolo } from "../lib/thetadata";

const TICKERS = (process.env.OI_TICKERS || "SPY,AAPL,MSFT,NVDA,META,TSLA,AMD,QQQ,HOOD").split(",");
const START = process.env.OI_START || "20160101";
const END = process.env.OI_END || "20260731";
const MAX_DTE = Number(process.env.OI_MAX_DTE) || 60;   // expiraciones que importan para el GEX
const BANDA = Number(process.env.OI_BANDA) || 0.25;     // strikes dentro del ±25% del spot
const BASE = process.env.THETA_BASE || "http://127.0.0.1:25503";
const DIR = "scripts/cache-theta";

const ymdToMs = (y: string) => Date.parse(`${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}T00:00:00Z`);
const shiftYmd = (y: string, d: number) => new Date(ymdToMs(y) + d * 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
function yearWindows(s0: string, e0: string): [string, string][] {
  const out: [string, string][] = [];
  let s = s0;
  while (Number(s) <= Number(e0)) {
    const e = String(Math.min(Number(`${s.slice(0, 4)}1231`), Number(e0)));
    out.push([s, e]); s = `${Number(s.slice(0, 4)) + 1}0101`;
  }
  return out;
}
function monthChunks(s0: string, e0: string): [string, string][] {
  const out: [string, string][] = [];
  let s = ymdToMs(s0); const e = ymdToMs(e0);
  const toY = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, "");
  while (s <= e) { const c = Math.min(s + 27 * 86_400_000, e); out.push([toY(s), toY(c)]); s = c + 86_400_000; }
  return out;
}
const leer = <T,>(p: string): T | null => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };

interface Csv { header: string[]; rows: string[][] }
async function getCsv(path: string): Promise<Csv | null> {
  try {
    const res = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(180_000) });
    if (!res.ok) return null;
    const txt = await res.text();
    const lines = txt.trim().split(/\r?\n/);
    if (lines.length < 2 || lines[0].includes(" ") || lines[0].includes("<")) return null;
    const unq = (x: string) => x.replace(/^"|"$/g, "");
    return { header: lines[0].split(",").map(unq), rows: lines.slice(1).map((l) => l.split(",").map(unq)) };
  } catch { return null; }
}
const idx = (h: string[], n: string) => h.indexOf(n);

/** Por fecha → strike → [oiCalls, oiPuts]. Compacto a propósito. */
type OiDia = Record<string, Record<string, [number, number]>>;

(async () => {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  console.log(`OI histórico · ${TICKERS.length} tickers · ${START}→${END} · exp ≤${MAX_DTE}d · banda ±${BANDA * 100}%\n`);
  let cabecera = false;

  for (const t of TICKERS) {
    // Spot por fecha, de las barras ya cacheadas: sirve para recortar la banda de strikes.
    //
    // Se LEE EL DIRECTORIO en vez de reconstruir los nombres. Reconstruirlos falla en cuanto el
    // rango pedido no coincide con el que generó la caché: pidiendo un trimestre, la última
    // ventana se recorta y el nombre pasa a ser `..._20200101_20201107` cuando en disco está
    // `..._20200101_20201231`. La caché estaba entera y el script decía "sin barras".
    const spot = new Map<string, number>();
    for (const f of readdirSync(DIR)) {
      if (!f.startsWith(`${t}_barsPAR_y_`) || !f.endsWith(".json")) continue;
      for (const x of leer<{ time: string; close: number }[]>(`${DIR}/${f}`) ?? []) {
        spot.set(x.time.replace(/-/g, ""), x.close);
      }
    }
    if (!spot.size) { console.log(`[${t}] sin barras en caché — omitido (hace falta el backtest antes)`); continue; }

    for (const [ys, ye] of yearWindows(START, END)) {
      const dest = `${DIR}/${t}_oi_y_${ys}_${ye}.json`;
      if (existsSync(dest)) { console.log(`[${t}] ${ys.slice(0, 4)} ya estaba`); continue; }

      const acc: OiDia = {};
      const t0 = Date.now();
      for (const [cs, ce] of monthChunks(ys, ye)) {
        // Un trozo puede cruzar un cambio de nombre, así que se piden todos sus tramos.
        for (const seg of segmentosPorSimbolo(t, cs, ce)) {
        const csv = await getCsv(`/v3/option/history/open_interest?symbol=${seg.symbol}&expiration=*&start_date=${seg.start}&end_date=${seg.end}`);
        if (!csv) continue;
        if (!cabecera) { console.log(`   columnas: ${csv.header.join(", ")}\n`); cabecera = true; }
        const iE = idx(csv.header, "expiration"), iK = idx(csv.header, "strike"), iR = idx(csv.header, "right"),
          iO = idx(csv.header, "open_interest") >= 0 ? idx(csv.header, "open_interest") : idx(csv.header, "oi");
        // La columna de fecha de ESTE endpoint es `timestamp` (no `date` ni `created`, que es lo
        // que usan los de EOD). Lo aprendimos por las malas: la primera versión buscaba los
        // nombres equivocados y, al no encontrarlos, hacía `continue` — 75 minutos escribiendo
        // archivos vacíos sin un solo error.
        const iT = ["timestamp", "date", "created", "ms_of_day"].map((n) => idx(csv.header, n)).find((i) => i >= 0) ?? -1;
        if (iE < 0 || iK < 0 || iR < 0 || iO < 0 || iT < 0) {
          // FALLAR RUIDOSO, no seguir: si las columnas no son las esperadas, todo lo que venga
          // detrás es basura silenciosa. Mejor parar y que alguien mire.
          throw new Error(
            `[${t}] columnas inesperadas en open_interest: ${csv.header.join(", ")} — ` +
            `faltan ${[["expiration", iE], ["strike", iK], ["right", iR], ["open_interest", iO], ["fecha", iT]].filter(([, i]) => (i as number) < 0).map(([n]) => n).join(", ")}`,
          );
        }

        for (const r of csv.rows) {
          const dia = (r[iT] || "").slice(0, 10).replace(/-/g, "");
          const s = spot.get(dia);
          if (!dia || !s) continue;
          const oi = Number(r[iO]) || 0;
          if (!(oi > 0)) continue;
          const k = Number(r[iK]);
          if (!(k > 0) || Math.abs(k - s) / s > BANDA) continue;      // fuera de la banda útil
          const dte = (ymdToMs((r[iE] || "").replace(/-/g, "")) - ymdToMs(dia)) / 86_400_000;
          if (!(dte >= 0 && dte <= MAX_DTE)) continue;                 // expiraciones lejanas no mueven el GEX
          const esCall = (r[iR] || "").toUpperCase().startsWith("C");
          const porStrike = (acc[dia] ??= {});
          const par = (porStrike[String(k)] ??= [0, 0]);
          par[esCall ? 0 : 1] += oi;
        }
        }
      }
      const dias = Object.keys(acc).length;
      if (dias === 0) {
        // Un año con CERO días es sospechoso, no normal: significa que el filtro o el parseo
        // están mal. No se cachea —cachearlo congelaría el fallo— y se avisa a gritos.
        console.error(`[${t}] ⚠⚠ ${ys.slice(0, 4)} salió VACÍO — no se guarda. Revisa el parseo antes de seguir.`);
        continue;
      }
      writeFileSync(dest, JSON.stringify(acc), "utf8");
      console.log(`[${t}] ${ys.slice(0, 4)} → ${dias} días con OI · ${((Date.now() - t0) / 60000).toFixed(1)} min`);
    }
  }
  console.log("\n=== OI histórico completo ===");
})();
