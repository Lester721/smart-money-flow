// VOLUMEN DE SPXW BARRA A BARRA — la versión que NO mira al futuro.
//
// ═══ POR QUÉ ESTA Y NO LA ANTERIOR ══════════════════════════════════════════════════════════
//
// Primero bajé el volumen con `option/history/eod`, que da el total del DÍA ENTERO. Al pesar con
// él la gamma de las 09:35, el "imán" salía prediciendo 2,354 puntos a 30 minutos con t=49.
//
// Era mentira, y la forma del resultado lo delataba: **crecía con el horizonte** (0,406 → 1,208 →
// 2,354). Una señal de verdad se desvanece al alejarse; ésa se hacía más fuerte, que es la firma
// de estar mirando al futuro.
//
// La prueba directa, sobre 120 días: el strike de más volumen del día está a **11 puntos del
// precio de CIERRE** y a **23 del de las 09:35**, y está más cerca del cierre el **75%** de los
// días. El volumen del día entero lleva dentro dónde acabó el precio.
//
// ═══ LO QUE BAJA ESTO ═══════════════════════════════════════════════════════════════════════
//
// `option/history/ohlc` con `interval=5m`: el volumen de cada contrato EN CADA BARRA. Con eso el
// volumen se puede acumular hasta el minuto en que se decide, sin usar ni un dato posterior.
//
// Se guarda disperso —sólo las barras donde hubo volumen— porque la mayoría de los ~600 contratos
// no operan en la mayoría de las 78 barras. Guardar los ceros multiplicaría el fichero por diez
// sin añadir nada.
//
// Reanudable: lo que ya está en disco no se vuelve a pedir.
//
// Uso: node scripts/bajar-volumen-intradia.mjs

import { writeFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { RAIZ } from "./raiz.mjs";

const B = (process.env.THETA_BASE || "http://127.0.0.1:25503").replace(/\/+$/, "").replace(/\/v3$/, "") + "/v3";
const CADENAS = `${RAIZ}/scripts/cache-theta/gex-2026`;
const DIR = `${RAIZ}/scripts/cache-theta/vol-intradia`;
if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });

const limpia = (s) => String(s ?? "").replace(/"/g, "").trim();
const fechas = [...new Set(readdirSync(CADENAS).map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean))].sort();

console.log(`\n## VOLUMEN INTRADÍA DE SPXW · ${fechas.length} días\n`);

let bajados = 0, yaEstaban = 0, vacios = 0;
const fallos = [];
const t0 = Date.now();

for (let i = 0; i < fechas.length; i++) {
  const fecha = fechas[i];
  const destino = `${DIR}/${fecha}.json`;
  if (existsSync(destino)) { yaEstaban++; continue; }

  const ymd = fecha.replace(/-/g, "");
  try {
    const r = await fetch(`${B}/option/history/ohlc?symbol=SPXW&expiration=${ymd}&start_date=${ymd}&end_date=${ymd}&interval=5m`,
      { signal: AbortSignal.timeout(180_000) });
    if (!r.ok) { fallos.push(`${fecha}: http ${r.status}`); continue; }
    const lin = (await r.text()).trim().split("\n").filter(Boolean);
    if (lin.length < 2) { vacios++; continue; }
    const cab = lin[0].split(",").map(limpia);
    const iK = cab.indexOf("strike"), iR = cab.indexOf("right"), iT = cab.indexOf("timestamp"), iV = cab.indexOf("volume");
    // UNA COLUMNA QUE NO EXISTE SE LEERÍA COMO CERO Y EL FICHERO SALDRÍA "SIN VOLUMEN". Se corta.
    if ([iK, iR, iT, iV].some((x) => x < 0)) { fallos.push(`${fecha}: faltan columnas (${cab.join("|")})`); continue; }

    // { "HH:MM": { "strike|lado": volumen } } — sólo lo que operó.
    const out = {};
    for (let j = 1; j < lin.length; j++) {
      const c = lin[j].split(",");
      const v = Number(limpia(c[iV]));
      if (!(v > 0)) continue;
      const K = Number(limpia(c[iK]));
      if (!(K > 0)) continue;
      const h = String(c[iT]).slice(11, 16);
      const lado = limpia(c[iR]).toUpperCase().startsWith("C") ? "C" : "P";
      (out[h] ??= {})[`${K}|${lado}`] = v;
    }
    if (!Object.keys(out).length) { vacios++; continue; }
    writeFileSync(destino, JSON.stringify(out), "utf8");
    bajados++;
  } catch (e) { fallos.push(`${fecha}: ${e.message.slice(0, 40)}`); }

  if (i % 50 === 0 || i === fechas.length - 1) {
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
  const horas = Object.keys(o).sort();
  let total = 0, contratos = new Set();
  for (const h of horas) for (const [k, v] of Object.entries(o[h])) { total += v; contratos.add(k); }
  console.log(`  ${f.replace(".json", "")} · ${horas.length} barras (${horas[0]}–${horas[horas.length - 1]}) · ${contratos.size} contratos · volumen total ${total.toLocaleString("es-ES")}`);
}
console.log(`\n  (tienen que salir ~78 barras de 09:30 a 16:00 y un volumen total de cientos de miles.`);
console.log(`   Si sale UNA barra, el interval no se aplicó y el fichero NO sirve para acumular.)`);
