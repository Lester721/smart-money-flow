// OI histórico CONSERVANDO LA EXPIRACIÓN — la versión que la primera descarga hizo imposible.
//
// POR QUÉ DE NUEVO: `bajar-oi-historico.ts` sumó todas las expiraciones a ≤60 días en un solo
// número por strike, para ahorrar espacio. Esa agregación BORRA justo la dimensión que la
// teoría del GEX necesita: el efecto imán lo produce el open interest de la expiración que se
// está operando —los market makers cubren gamma contra los contratos que vencen ESE día—, no
// una mezcla de todo lo que vence en dos meses. Un strike con 400.000 contratos a 45 días no
// ancla nada esta semana; los mismos venciendo el viernes sí.
//
// Con la versión agregada el muro perdió contra distancias fijas. Ese resultado solo dice que
// el GEX DIFUMINADO no sirve; el de la expiración concreta sigue sin probarse.
//
// DOS RECORTES que hacen viable el tamaño (guardar date × exp × strike es mucho más pesado):
//   · expiraciones a ≤21 días — cubre los spreads de 5d y 7d con margen; a 60 no hacía falta.
//   · banda ±15% del spot — a 5 días, 1,5σ son ~6%, así que ±15% sobra de largo.
//
// Se guarda en `_oiexp_y_` para NO pisar la caché agregada, que sigue siendo válida para lo que
// se midió con ella.
//
// Uso: DATA_PROVIDER=theta node --env-file=.env.thetadata scripts/with-theta.mjs \
//        npx tsx scripts/bajar-oi-por-expiracion.ts

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { segmentosPorSimbolo } from "../lib/thetadata";

const TICKERS = (process.env.OI_TICKERS || "SPY,AAPL,MSFT,NVDA,META,TSLA,AMD,QQQ,HOOD").split(",");
const START = process.env.OI_START || "20160101";
const END = process.env.OI_END || "20260731";
const MAX_DTE = Number(process.env.OI_MAX_DTE) || 21;
const BANDA = Number(process.env.OI_BANDA) || 0.15;
const BASE = process.env.THETA_BASE || "http://127.0.0.1:25503";
const DIR = "scripts/cache-theta";

const ymdToMs = (y: string) => Date.parse(`${y.slice(0, 4)}-${y.slice(4, 6)}-${y.slice(6, 8)}T00:00:00Z`);
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

/** fecha → expiración → strike → [oiCalls, oiPuts] */
type OiExp = Record<string, Record<string, Record<string, [number, number]>>>;

(async () => {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
  console.log(`OI POR EXPIRACIÓN · ${TICKERS.length} tickers · ${START}→${END} · exp ≤${MAX_DTE}d · banda ±${BANDA * 100}%\n`);

  for (const t of TICKERS) {
    const spot = new Map<string, number>();
    for (const f of readdirSync(DIR)) {
      if (!f.startsWith(`${t}_barsPAR_y_`) || !f.endsWith(".json")) continue;
      for (const x of leer<{ time: string; close: number }[]>(`${DIR}/${f}`) ?? []) spot.set(x.time.replace(/-/g, ""), x.close);
    }
    if (!spot.size) { console.log(`[${t}] sin barras en caché — omitido`); continue; }

    for (const [ys, ye] of yearWindows(START, END)) {
      const dest = `${DIR}/${t}_oiexp_y_${ys}_${ye}.json`;
      if (existsSync(dest)) { console.log(`[${t}] ${ys.slice(0, 4)} ya estaba`); continue; }

      const acc: OiExp = {};
      const t0 = Date.now();
      for (const [cs, ce] of monthChunks(ys, ye)) {
        for (const seg of segmentosPorSimbolo(t, cs, ce)) {
          const csv = await getCsv(`/v3/option/history/open_interest?symbol=${seg.symbol}&expiration=*&start_date=${seg.start}&end_date=${seg.end}`);
          if (!csv) continue;
          const iE = idx(csv.header, "expiration"), iK = idx(csv.header, "strike"), iR = idx(csv.header, "right"),
            iO = idx(csv.header, "open_interest") >= 0 ? idx(csv.header, "open_interest") : idx(csv.header, "oi");
          const iT = ["timestamp", "date", "created"].map((n) => idx(csv.header, n)).find((i) => i >= 0) ?? -1;
          if (iE < 0 || iK < 0 || iR < 0 || iO < 0 || iT < 0) {
            throw new Error(`[${t}] columnas inesperadas: ${csv.header.join(", ")}`);
          }
          for (const r of csv.rows) {
            const dia = (r[iT] || "").slice(0, 10).replace(/-/g, "");
            const s = spot.get(dia);
            if (!dia || !s) continue;
            const oi = Number(r[iO]) || 0;
            if (!(oi > 0)) continue;
            const k = Number(r[iK]);
            if (!(k > 0) || Math.abs(k - s) / s > BANDA) continue;
            const exp = (r[iE] || "").replace(/-/g, "");
            const dte = (ymdToMs(exp) - ymdToMs(dia)) / 86_400_000;
            if (!(dte >= 0 && dte <= MAX_DTE)) continue;
            const porExp = (acc[dia] ??= {});
            const porStrike = (porExp[exp] ??= {});
            const par = (porStrike[String(k)] ??= [0, 0]);
            par[(r[iR] || "").toUpperCase().startsWith("C") ? 0 : 1] += oi;
          }
        }
      }
      const dias = Object.keys(acc).length;
      if (dias === 0) {
        console.error(`[${t}] ⚠⚠ ${ys.slice(0, 4)} salió VACÍO — no se guarda.`);
        continue;
      }
      writeFileSync(dest, JSON.stringify(acc), "utf8");
      const exps = Object.values(acc).reduce((s, d) => s + Object.keys(d).length, 0) / dias;
      console.log(`[${t}] ${ys.slice(0, 4)} → ${dias} días · ${exps.toFixed(1)} expiraciones/día · ${((Date.now() - t0) / 60000).toFixed(1)} min`);
    }
  }
  console.log("\n=== OI por expiración completo ===");
})();
