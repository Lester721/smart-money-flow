// VOLUMEN POR STRIKE DE SPXW, día a día — para pesar la gamma por lo que se opera HOY.
//
// ═══ POR QUÉ ════════════════════════════════════════════════════════════════════════════════
//
// Nuestro GEX pesa la gamma de cada strike por el INTERÉS ABIERTO de ayer. Un documento del
// proyecto (`Proceso 0DTE.md` §8) trae una medición que pone eso en duda:
//
//     SPXW C7450   volumen 66.047   interés abierto 3.039   → 22x
//     SPXW C7440   volumen 44.924   interés abierto 1.617   → 28x
//     SPY  P738    volumen 327.841  interés abierto 8.079   → 41x
//
// El interés abierto se publica con un día de rezago y NO recoge lo que abre y cierra dentro de
// la misma sesión — que en 0DTE es casi todo. Así que puede que llevemos midiendo el GEX con un
// peso que representa una fracción diminuta de la posición real del día.
//
// EL CONTRAARGUMENTO, para no ilusionarse: el GEX es exposición de POSICIÓN, y el volumen no es
// posición — cuenta aperturas y cierres mezclados. Teóricamente el interés abierto es lo correcto.
// Pero si en 0DTE está 20-40 veces por debajo de la actividad real, la teoría puede estar
// describiendo algo que ya no existe. Por eso se mide en vez de discutirlo.
//
// ═══ EL DATO ════════════════════════════════════════════════════════════════════════════════
//
// `option/history/eod` trae `volume` y `count` por contrato. Se guarda por fecha, igual que el
// interés abierto, para poder repetir la medición del GEX vivo cambiando sólo el peso.
//
// Reanudable: lo que ya está en disco no se vuelve a pedir.
//
// Uso: node scripts/bajar-volumen-spxw.mjs

import { writeFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { RAIZ } from "./raiz.mjs";

const B = (process.env.THETA_BASE || "http://127.0.0.1:25503").replace(/\/+$/, "").replace(/\/v3$/, "") + "/v3";
const CADENAS = `${RAIZ}/scripts/cache-theta/gex-2026`;
const DIR = `${RAIZ}/scripts/cache-theta/vol-spxw`;
if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });

const limpia = (s) => String(s ?? "").replace(/"/g, "").trim();
const fechas = [...new Set(readdirSync(CADENAS).map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean))].sort();

console.log(`\n## VOLUMEN POR STRIKE DE SPXW · ${fechas.length} días a cubrir\n`);

let bajados = 0, yaEstaban = 0, vacios = 0;
const fallos = [];
const t0 = Date.now();

for (let i = 0; i < fechas.length; i++) {
  const fecha = fechas[i];
  const destino = `${DIR}/${fecha}.json`;
  if (existsSync(destino)) { yaEstaban++; continue; }

  const ymd = fecha.replace(/-/g, "");
  try {
    const r = await fetch(`${B}/option/history/eod?symbol=SPXW&expiration=${ymd}&start_date=${ymd}&end_date=${ymd}`,
      { signal: AbortSignal.timeout(120_000) });
    if (!r.ok) { fallos.push(`${fecha}: http ${r.status}`); continue; }
    const lin = (await r.text()).trim().split("\n").filter(Boolean);
    // UN 200 CON CUERPO VACÍO NO ES ÉXITO. Se valida por filas.
    if (lin.length < 2) { vacios++; continue; }
    const cab = lin[0].split(",").map(limpia);
    const iK = cab.indexOf("strike"), iR = cab.indexOf("right"), iV = cab.indexOf("volume"), iC = cab.indexOf("count");
    // UNA COLUMNA QUE NO EXISTE SE LEERÍA COMO CERO Y EL FICHERO SALDRÍA "SIN VOLUMEN". Se corta.
    if (iK < 0 || iR < 0 || iV < 0) { fallos.push(`${fecha}: faltan columnas (${cab.join("|")})`); continue; }

    const out = {};
    for (let j = 1; j < lin.length; j++) {
      const c = lin[j].split(",");
      const K = Number(limpia(c[iK])), v = Number(limpia(c[iV]));
      const lado = limpia(c[iR]).toUpperCase().startsWith("C") ? "C" : "P";
      if (K > 0 && v > 0) out[`${K}|${lado}`] = iC >= 0 ? [v, Number(limpia(c[iC])) || 0] : [v, 0];
    }
    if (!Object.keys(out).length) { vacios++; continue; }
    writeFileSync(destino, JSON.stringify(out), "utf8");
    bajados++;
  } catch (e) { fallos.push(`${fecha}: ${e.message.slice(0, 40)}`); }

  if (i % 100 === 0 || i === fechas.length - 1) {
    const min = (Date.now() - t0) / 60000;
    const resto = bajados > 0 ? (min / bajados) * (fechas.length - i - 1) : 0;
    console.log(`   ${String(i + 1).padStart(4)}/${fechas.length} · ${fecha} · bajados ${bajados} · ya estaban ${yaEstaban} · vacíos ${vacios} · fallos ${fallos.length} · quedan ~${resto.toFixed(0)} min`);
  }
}

console.log(`\n### Resultado · bajados ${bajados} · ya estaban ${yaEstaban} · sin datos ${vacios} · fallos ${fallos.length}\n`);
if (fallos.length) for (const f of fallos.slice(0, 15)) console.log(`  ✗ ${f}`);

// ── VALIDACIÓN · abriendo ficheros, no contándolos ─────────────────────────
const hechos = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();
console.log(`\n### Validación · ${hechos.length} ficheros\n`);
for (const f of [hechos[0], hechos[Math.floor(hechos.length / 2)], hechos[hechos.length - 1]].filter(Boolean)) {
  const o = JSON.parse(readFileSync(`${DIR}/${f}`, "utf8"));
  const ks = Object.keys(o);
  const total = ks.reduce((a, k) => a + o[k][0], 0);
  const strikes = [...new Set(ks.map((k) => Number(k.split("|")[0])))].sort((a, b) => a - b);
  console.log(`  ${f.replace(".json", "")} · ${ks.length} contratos con volumen · ${strikes.length} strikes (${strikes[0]}–${strikes[strikes.length - 1]}) · volumen total ${total.toLocaleString("es-ES")}`);
}
console.log(`\n  (un día normal de SPXW mueve del orden de 1-2 millones de contratos. Si sale`);
console.log(`   de tres cifras, el dato está mal y NO se debe usar para pesar nada.)`);
