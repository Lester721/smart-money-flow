// Cadenas completas de TODOS los días hábiles — la base del análisis de regímenes.
//
// Lo que ya hay en caché son solo los días con señal de EVA. Eso vale para probar la estrategia
// de EVA, pero NO para la pregunta que Lester quiere responder: "¿qué familia de operaciones
// habría ganado dinero cada semana, y qué había en el mercado antes?". Para eso hace falta poder
// evaluar CUALQUIER día, no solo los que a EVA le llamaron la atención — si no, la respuesta
// vendría condicionada por el filtro que precisamente queremos poner a prueba.
//
// Una petición por (ticker, día) con expiration=*: devuelve todas las expiraciones y todos los
// strikes de ese día. De ahí salen todos los plazos y todas las distancias.
//
// Uso: node --import tsx scripts/bajar-cadenas-todos-los-dias.ts [añoDesde] [añoHasta] [ticker...]

import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";

const BASE = process.env.THETA_BASE || "http://127.0.0.1:25503";
const DIR = "scripts/cache-theta", CDIR = `${DIR}/cadenas`;
const AÑO_INI = Number(process.argv[2] || 2016), AÑO_FIN = Number(process.argv[3] || 2026);
const TICKERS = process.argv.slice(4).length ? process.argv.slice(4) : ["SPY", "QQQ", "AAPL", "MSFT", "NVDA", "META", "TSLA", "AMD"];
const CONC = 4;

const leer = <T,>(p: string): T | null => { try { return JSON.parse(readFileSync(p, "utf8")); } catch { return null; } };
const limpia = (s: string) => (s ?? "").replace(/"/g, "").trim();

async function pMap<T>(items: T[], n: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    for (;;) { const k = i++; if (k >= items.length) return; await fn(items[k]); }
  }));
}

/** Descarga y cachea la cadena de un día. Devuelve true si quedó algo utilizable. */
async function bajarDia(sym: string, dia: string): Promise<boolean> {
  const f = `${CDIR}/${sym}_d${dia}.json`;
  if (existsSync(f)) return true;                     // ya estaba: la caché es acumulativa
  const out: Record<string, Record<string, [number, number]>> = {};
  try {
    const r = await fetch(`${BASE}/v3/option/history/eod?symbol=${sym}&expiration=*&start_date=${dia}&end_date=${dia}`,
      { signal: AbortSignal.timeout(120_000) });
    if (!r.ok) return false;
    const l = (await r.text()).trim().split("\n");
    if (l.length < 2) return false;
    const h = l[0].split(",").map((x) => x.trim());
    const iE = h.indexOf("expiration"), iK = h.indexOf("strike"), iR = h.indexOf("right"), iB = h.indexOf("bid"), iA = h.indexOf("ask");
    if (iE < 0 || iK < 0 || iB < 0 || iA < 0) return false;
    for (let j = 1; j < l.length; j++) {
      const c = l[j].split(",");
      const exp = limpia(c[iE]).replace(/-/g, "");
      const b = Number(limpia(c[iB])), a = Number(limpia(c[iA]));
      const K = Number(limpia(c[iK])), right = limpia(c[iR] ?? "").toUpperCase().startsWith("C") ? "C" : "P";
      if (exp.length !== 8 || !(K > 0) || !(b > 0) || !(a > 0) || a < b) continue;
      (out[exp] ??= {})[`${K}|${right}`] = [b, a];
    }
  } catch { return false; }
  // Un día vacío NO se cachea: guardarlo enmascararía el fallo y el siguiente arranque lo daría
  // por bueno. Es el error que costó 75 minutos con el OI.
  if (!Object.keys(out).length) return false;
  writeFileSync(f, JSON.stringify(out), "utf8");
  return true;
}

(async () => {
  if (!existsSync(CDIR)) mkdirSync(CDIR, { recursive: true });
  console.log(`\n## Cadenas de TODOS los días · ${AÑO_INI}-${AÑO_FIN} · ${TICKERS.join(",")}\n`);

  for (const t of TICKERS) {
    // Los días hábiles salen de las barras que ya tenemos.
    const trozos: { time: string }[] = [];
    for (const f of readdirSync(DIR)) {
      if (f.startsWith(`${t}_barsPAR_y_`) && f.endsWith(".json")) for (const x of leer<{ time: string }[]>(`${DIR}/${f}`) ?? []) trozos.push(x);
    }
    const dias = [...new Set(trozos.map((x) => x.time))]
      .filter((d) => Number(d.slice(0, 4)) >= AÑO_INI && Number(d.slice(0, 4)) <= AÑO_FIN)
      .map((d) => d.replace(/-/g, "")).sort();
    if (!dias.length) { console.log(`  ${t}: sin barras`); continue; }

    const faltan = dias.filter((d) => !existsSync(`${CDIR}/${t}_d${d}.json`));
    if (!faltan.length) { console.log(`  ${t}: ${dias.length} días, todos en caché`); continue; }

    const t0 = Date.now();
    let ok = 0, n = 0;
    await pMap(faltan, CONC, async (d) => {
      if (await bajarDia(t, d)) ok++;
      if (++n % 100 === 0) {
        const seg = (Date.now() - t0) / 1000;
        const restan = ((faltan.length - n) * (seg / n) / 60).toFixed(0);
        process.stdout.write(`\r  ${t}: ${n}/${faltan.length} · ${ok} con datos · quedan ~${restan} min   `);
      }
    });
    console.log(`\r  ${t}: ${ok}/${faltan.length} bajados (${dias.length - faltan.length} ya estaban) · ${((Date.now() - t0) / 60000).toFixed(0)} min`);
  }

  // Validación: cuántos días tenemos por año y por ticker.
  console.log(`\n### Cobertura final\n`);
  const archivos = readdirSync(CDIR);
  for (const t of TICKERS) {
    const porAño = new Map<string, number>();
    for (const f of archivos) {
      const m = new RegExp(`^${t}_d(\\d{4})\\d{4}\\.json$`).exec(f);
      if (m) porAño.set(m[1], (porAño.get(m[1]) ?? 0) + 1);
    }
    const años = [...porAño.entries()].sort();
    console.log(`   ${t.padEnd(5)} ${años.map(([a, n2]) => `${a}:${n2}`).join(" ")}`);
  }
  console.log(`\n   Un año hábil completo son ~252 días. Si algún año baja mucho de ahí, falta dato.`);
})();
