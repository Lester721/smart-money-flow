// ══ BAJAR EL GRUPO A ══ Lester, 2026-08-29: «baja los 60 tickers y corre el examen».
//
// EL GRUPO B — los 36 que quedan. Lester: «sigue bajalo todo».
//
// ⛔ BAJARLOS NO ES MIRARLOS. Estos 36 son el SEGUNDO examen: no se corre nada sobre ellos
//    hasta que Lester haya visto el resultado del grupo A y haya decidido si ajusta la regla.
//    Tener los datos en disco no contamina nada; ejecutar una medición sobre ellos, sí.
//
// ═══ CÓMO ═════════════════════════════════════════════════════════════════════════════════
// El endpoint acepta RANGO de fechas: un ticker-año en una llamada (68 s, 37 MB, 253 días)
// contra 253 llamadas sueltas. El Terminal admite 4 peticiones concurrentes (lo dice su log).
//   → 24 tickers × 11 años = 264 llamadas ≈ 75 minutos.
//
// Se guarda en el MISMO formato que `cadenas/`: un JSON por ticker-día,
//   { "20260619": { "680|C": [bid, ask], "680|P": [bid, ask] } }
// para que `datos.mjs` y los 405 scripts que ya existen lo lean sin tocar una línea.
//
// ═══ VALIDACIÓN, mientras baja ════════════════════════════════════════════════════════════
// Cada ticker-año se comprueba ANTES de escribirse:
//   · filas > 0 y cabecera correcta
//   · días distintos plausibles (240-256 al año)
//   · bid <= ask en todas las filas usables
//   · algún vencimiento a más de 300 días (si no, no habrá contratos de 400d y el ticker no sirve)
// Lo que no pasa se marca y se reporta. No se escribe basura en silencio.
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";
import { GRUPO_B } from "./EXAMEN-grupo-A.mjs";

const DIR = join(CACHE, "cadenas-B");
if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
const ANIOS = [2016,2017,2018,2019,2020,2021,2022,2023,2024,2025,2026];
const BASE = "http://127.0.0.1:25503/v3/option/history/eod";
const CONC = 4;                                   // el máximo que admite el Terminal

const estado = { ok: 0, vacio: 0, malo: 0, dias: 0, bytes: 0, fallos: [] };

async function unTickerAnio(tk, anio) {
  const fin = anio === 2026 ? "20260819" : anio + "1231";
  const url = `${BASE}?symbol=${tk}&expiration=*&start_date=${anio}0101&end_date=${fin}`;
  let txt;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(900000) });
    if (!r.ok) { estado.fallos.push(`${tk} ${anio}: HTTP ${r.status}`); estado.malo++; return; }
    txt = await r.text();
  } catch (e) { estado.fallos.push(`${tk} ${anio}: ${String(e).slice(0,60)}`); estado.malo++; return; }

  // ⚠️ EL FALLO DEL HTTP 200 VACÍO: ya nos pasó con Massive. Se comprueba el CONTENIDO.
  const lin = txt.split("\n");
  if (lin.length < 10 || !lin[0].includes("strike") || !lin[0].includes("bid")) {
    estado.vacio++; estado.fallos.push(`${tk} ${anio}: respuesta sin datos (${lin.length} líneas)`); return; }
  const cab = lin[0].split(",");
  const iE = cab.indexOf("expiration"), iK = cab.indexOf("strike"), iR = cab.indexOf("right"),
        iC = cab.indexOf("created"), iB = cab.indexOf("bid"), iA = cab.indexOf("ask");
  if ([iE,iK,iR,iC,iB,iA].some(x => x < 0)) {
    estado.malo++; estado.fallos.push(`${tk} ${anio}: faltan columnas`); return; }

  const porDia = new Map();
  let cruzadas = 0, usables = 0, maxDte = 0;
  for (let n = 1; n < lin.length; n++) {
    const c = lin[n].split(","); if (c.length < cab.length) continue;
    const q = (s) => String(s ?? "").replace(/^"|"$/g, "");
    const exp = q(c[iE]).replace(/-/g, "");
    const d = q(c[iC]).slice(0, 10).replace(/-/g, "");
    if (!/^\d{8}$/.test(exp) || !/^\d{8}$/.test(d)) continue;
    const bid = +c[iB], ask = +c[iA];
    if (!(bid > 0) || !(ask > 0)) continue;
    if (ask < bid) { cruzadas++; continue; }
    usables++;
    const dte = (Date.parse(exp.slice(0,4)+"-"+exp.slice(4,6)+"-"+exp.slice(6,8)) -
                 Date.parse(d.slice(0,4)+"-"+d.slice(4,6)+"-"+d.slice(6,8))) / 86400000;
    if (dte > maxDte) maxDte = dte;
    const lado = q(c[iR]).toUpperCase().startsWith("P") ? "P" : "C";
    if (!porDia.has(d)) porDia.set(d, {});
    const g = porDia.get(d);
    if (!g[exp]) g[exp] = {};
    g[exp][Math.round(+c[iK] * 1000) / 1000 + "|" + lado] = [bid, ask];
  }
  if (porDia.size < 200 && anio !== 2026) {
    estado.fallos.push(`${tk} ${anio}: sólo ${porDia.size} días (esperados ~250)`); }
  if (maxDte < 300) {
    estado.fallos.push(`${tk} ${anio}: ningún vencimiento a más de 300 días (máx ${Math.round(maxDte)}) — sin contratos de 400d`); }
  for (const [d, g] of porDia) {
    const f = join(DIR, `${tk}_d${d}.json`);
    const s = JSON.stringify(g);
    writeFileSync(f, s); estado.bytes += s.length; }
  estado.ok++; estado.dias += porDia.size;
  return { tk, anio, dias: porDia.size, usables, cruzadas, maxDte: Math.round(maxDte) };
}

const tareas = [];
for (const tk of GRUPO_B) for (const a of ANIOS) tareas.push([tk, a]);
console.log("");
console.log("  ══ BAJANDO EL GRUPO B ══");
console.log("  " + GRUPO_B.length + " tickers × " + ANIOS.length + " años = " + tareas.length + " llamadas");
console.log("  " + CONC + " en paralelo · ~68 s cada una · estimado " +
  Math.round(tareas.length * 68 / CONC / 60) + " minutos");
console.log("  destino: cache-theta/cadenas-B/   (formato idéntico a cadenas/)");
console.log("");
const t0 = Date.now();
let i = 0, hechas = 0;
async function obrero(id) {
  while (i < tareas.length) {
    const k = i++; const [tk, a] = tareas[k];
    const r = await unTickerAnio(tk, a);
    hechas++;
    const min = (Date.now() - t0) / 60000;
    const queda = hechas > 3 ? (min / hechas) * (tareas.length - hechas) : null;
    process.stdout.write(`  [${String(hechas).padStart(3)}/${tareas.length}] ${tk} ${a}  ` +
      (r ? `${String(r.dias).padStart(3)} días · máx ${r.maxDte}d` : "SIN DATOS") +
      (queda ? `   ·  quedan ~${queda.toFixed(0)} min` : "") + "\n");
  }
}
await Promise.all(Array.from({length: CONC}, (_, k) => obrero(k)));

console.log("");
console.log("  ══ AUDIT ══");
console.log("  ticker-años bajados: " + estado.ok + " de " + tareas.length +
  "   ·   vacíos: " + estado.vacio + "   ·   con error: " + estado.malo);
console.log("  días-ticker escritos: " + estado.dias.toLocaleString("en-US"));
console.log("  tamaño en bruto: " + (estado.bytes / 1073741824).toFixed(1) + " GB");
console.log("  tiempo: " + ((Date.now() - t0) / 60000).toFixed(0) + " minutos");
if (estado.fallos.length) {
  console.log("");
  console.log("  ⚠️ AVISOS (" + estado.fallos.length + "):");
  for (const f of estado.fallos.slice(0, 25)) console.log("     " + f);
  if (estado.fallos.length > 25) console.log("     ... y " + (estado.fallos.length - 25) + " más");
}
console.log("");
