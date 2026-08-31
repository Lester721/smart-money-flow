// LOS 20 TICKERS QUE FALTAN — flujo 2021-2026.
//
// Lester (2026-08-27): *"lanza la descarga de los 20 tickers"*. Las CADENAS y el INTERES ABIERTO
// ya estan en disco para los 28 nombres; lo unico que falta es el FLUJO de estos 20.
//
// POR QUE AHORA Y NO ANTES: cuando la tecnica no separaba, mas tickers no arreglaba nada y Lester
// lo veto con razon. Ahora que separa, el cuello de botella son 13 señales al año con la cuenta
// al 87% parada. Mas tickers no mejora la señal: la ALIMENTA. Y ademas son datos que ninguna de
// nuestras cinco elecciones ha visto -> prueba fuera de muestra de regalo.
//
// Mismo descargador honesto: volcado del dia entero, filtrado SOLO por tamaño de la operacion.
//
// NO TOCAR EL TERMINAL MIENTRAS CORRE: 4 ranuras, la quinta peticion rompe la sesion (478).
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { spawn, execSync } from "node:child_process";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";
const B = "http://127.0.0.1:25503/v3";
const OUT = join(CACHE, "flujo-limpio"); if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
// ordenados por tamaño del mercado de opciones: si hay que parar a medias, lo bajado sirve
const TICKERS = ["BA", "JPM", "INTC", "F", "BAC", "DIS", "XOM", "GE", "PYPL", "COST",
                 "CRM", "ORCL", "WMT", "T", "PFE", "KO", "CSCO", "NKE", "UNH", "WBA"];
const MESES = [];
for (let a = 2021; a <= 2026; a++) for (let m = 1; m <= 12; m++) MESES.push(String(a) + String(m).padStart(2, "0"));
const MIN = 500_000, CONC = 4;

const todosLosDias = [...new Set(readdirSync(join(CACHE, "cadenas"))
  .map((f) => /^SPY_d(\d{8})\.json$/.exec(f)?.[1]).filter(Boolean))].sort();
const tareas = [];
for (const m of MESES) for (const d of todosLosDias.filter((x) => x.startsWith(m))) for (const t of TICKERS) tareas.push({ t, d });
const pendientes = tareas.filter(({ t, d }) => !existsSync(join(OUT, `${t}_d${d}.json`)));
console.log(`\n  ${MESES.length} meses · ${TICKERS.length} tickers · ${tareas.length} descargas, ${pendientes.length} pendientes\n`);


// ── AUTO-RECUPERACIÓN ──────────────────────────────────────────────────────
// La sesión del Terminal se cae sola cada pocas horas (pasó el 25-ago a las 12:00 por caída de
// red y otra vez a las 18:53 sin causa visible). En una descarga de 5 h eso la mata. Aquí, si
// llegan muchos 478 seguidos, se reinicia el Terminal y se sigue.
let reiniciando = false, reinicios = 0;
async function reiniciarTerminal() {
  if (reiniciando) { await new Promise((s) => setTimeout(s, 30000)); return; }
  reiniciando = true; reinicios++;
  console.log(`  ⟳ sesión muerta — reiniciando el Terminal (nº ${reinicios})`);
  try { execSync("taskkill /F /IM java.exe", { stdio: "ignore" }); } catch { /* puede no haber */ }
  await new Promise((s) => setTimeout(s, 4000));
  let clave = null;
  for (const linea of readFileSync(".env.local", "utf8").split(String.fromCharCode(10))) {
    if (linea.startsWith("THETADATA_API_KEY=")) {
      clave = linea.slice(18).trim().replace(new RegExp(String.fromCharCode(34), "g"), "")
                   .replace(new RegExp(String.fromCharCode(39), "g"), "")
                   .replace(new RegExp(String.fromCharCode(13), "g"), "");
    }
  }
  spawn("java", ["-jar", "ThetaTerminalv3.jar", clave], { detached: true, stdio: "ignore" }).unref();
  // esperar a que abra el puerto Y responda de verdad
  for (let i = 0; i < 40; i++) {
    await new Promise((s) => setTimeout(s, 3000));
    try {
      const r = await fetch(`${B}/option/history/eod?symbol=AAPL&expiration=*&start_date=20260203&end_date=20260203`);
      await r.text();
      if (r.status === 200) { console.log(`  ⟳ Terminal de vuelta tras ${(i + 1) * 3}s`); break; }
    } catch { /* aún no */ }
  }
  reiniciando = false;
}

let hechas = 0, filas = 0, guardadas = 0, s478 = 0; const fallos = [];
const t0 = Date.now();
async function una({ t, d }) {
  const f = join(OUT, `${t}_d${d}.json`);
  if (existsSync(f)) { hechas++; return; }
  let txt = null;
  for (let i = 0; i < 20 && txt == null; i++) {
    try {
      const r = await fetch(`${B}/option/history/trade_quote?symbol=${t}&expiration=*&start_date=${d}&end_date=${d}`);
      if (r.status === 200) txt = await r.text();
      else if (r.status === 472 || r.status === 404) { writeFileSync(f, "[]"); hechas++; return; }
      else if (r.status === 478) {
        await r.text(); s478++;
        if (i >= 1) await reiniciarTerminal();               // al segundo 478 seguido, se reinicia
        else await new Promise((s) => setTimeout(s, 10000));
      }
      else { await r.text(); await new Promise((s) => setTimeout(s, 3000 * (i + 1))); }
    } catch { await new Promise((s) => setTimeout(s, 3000 * (i + 1))); }
  }
  if (txt == null) { fallos.push(`${t} ${d}`); hechas++; return; }
  const li = txt.split("\n"), h = li[0].split(",");
  const iE = h.indexOf("expiration"), iK = h.indexOf("strike"), iR = h.indexOf("right"),
        iP = h.indexOf("price"), iS = h.indexOf("size"), iB = h.indexOf("bid"), iA = h.indexOf("ask"),
        iT = h.indexOf("trade_timestamp");
  if (iE < 0 || iP < 0 || iA < 0) { fallos.push(`${t} ${d} CABECERA RARA`); hechas++; return; }
  const out = [];
  for (const l of li.slice(1)) {
    if (!l) continue;
    const c = l.split(",");
    const p = +c[iP], s = +c[iS];
    if (!(p > 0 && s > 0)) continue;
    const prima = p * s * 100;
    if (prima < MIN) continue;
    out.push({ exp: String(c[iE]).replace(/[",-]/g, ""), K: +c[iK], l: String(c[iR]).replace(/"/g, "")[0],
               precio: p, tam: s, prima, bid: +c[iB], ask: +c[iA], hora: c[iT] });
  }
  filas += li.length - 1; guardadas += out.length;
  writeFileSync(f, JSON.stringify(out)); hechas++;
  if (hechas % 25 === 0) {
    const seg = (Date.now() - t0) / 1000;
    console.log(`  ${String(hechas).padStart(4)}/${tareas.length} · ${(filas / 1e6).toFixed(1)}M leídas · ${guardadas.toLocaleString("en-US")} de $500k+ · ${(seg / 60).toFixed(0)} min · quedan ~${((seg / Math.max(1, hechas - (tareas.length - pendientes.length))) * (tareas.length - hechas) / 60).toFixed(0)} min`);
  }
}
const cola = [...tareas];
await Promise.all(Array.from({ length: CONC }, async () => { while (cola.length) await una(cola.shift()); }));
console.log(`\n  LISTO: ${hechas} descargas · ${(filas / 1e6).toFixed(1)}M operaciones leídas · ${guardadas.toLocaleString("en-US")} de más de $500,000`);
console.log(`  sesiones caídas: ${s478} respuestas 478 · ${reinicios} reinicios del Terminal`);
if (fallos.length) console.log(`  ⚠ FALLARON ${fallos.length}: ${fallos.slice(0, 15).join(" · ")}`);
console.log(`  en ${((Date.now() - t0) / 3600000).toFixed(1)} horas\n`);
