// BAJAR LAS CADENAS 0DTE DE SPXW DE 2022 Y 2023 — para duplicar la muestra del cóndor.
//
// ═══ POR QUÉ ════════════════════════════════════════════════════════════════════════════════
//
// El cóndor está medido sobre 653 días (2024-01 → 2026-08) y su ventaja tiene t=1,66: el
// intervalo toca el cero. Con 2022 y 2023 dentro la muestra pasa a ~1.155 días y la t a ≈2,2,
// que cruza el listón sin esperar un año de mercado.
//
// Y hay algo que vale más que la t: **2022 fue un mercado bajista de verdad** (SPX −25%). El
// filtro de amplitud —no operar por debajo de la MA20 y la MA50— NUNCA ha visto uno. Hoy sólo
// puedo suponer qué hace ahí. Con 2022 dentro deja de ser suposición.
//
// ═══ POR QUÉ NO SE PUEDE IR MÁS ATRÁS ═══════════════════════════════════════════════════════
//
// Comprobado con scripts/sonda-0dte-diario.mjs, una semana entera de cada año:
//   2020: LUN ✅ MAR ❌ MIÉ ✅ JUE ❌ VIE ✅   → 3/5, el cóndor DIARIO no existía
//   2021: LUN ✅ MAR ❌ MIÉ ✅ JUE ❌ VIE ✅   → 3/5, tampoco
//   2022: 5/5 ✅   ·   2023: 5/5 ✅
// SPX no tuvo vencimiento todos los días hasta 2022. No es que falte el dato: es que no había
// contrato que vender los martes ni los jueves.
//
// ═══ CÓMO ══════════════════════════════════════════════════════════════════════════════════
//
// · Se guarda la respuesta CRUDA de la API, con el mismo nombre y formato que gex-2026, para que
//   TODOS los scripts de análisis funcionen sin tocar una línea.
// · REANUDABLE: si se corta, al relanzarlo salta lo que ya está en disco.
// · Los festivos se detectan solos (la API no devuelve filas) y se anotan, no se rellenan.
// · Valida al final ABRIENDO ficheros, no contándolos. El recuento miente.
//
// Uso:  node scripts/with-theta.mjs node scripts/bajar-0dte-2022-2023.mjs

import { writeFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync } from "node:fs";

const B = (process.env.THETA_BASE || "http://127.0.0.1:25503").replace(/\/+$/, "").replace(/\/v3$/, "") + "/v3";
const DIR = "scripts/cache-theta/gex-2026";        // el MISMO directorio: los análisis ya lo leen
const DESDE = process.env.DESDE || "2022-01-01";
const HASTA = process.env.HASTA || "2023-12-31";

if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });

/** Todos los días de lunes a viernes del rango. Los festivos se caen solos al no devolver filas. */
function diasHabiles(desde, hasta) {
  const out = [];
  for (let d = new Date(desde + "T12:00:00Z"); d <= new Date(hasta + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

async function bajar(fecha, right) {
  const destino = `${DIR}/iv_${fecha}_${right}.csv`;
  // REANUDABLE: si ya está y no es un fichero vacío, no se vuelve a pedir.
  if (existsSync(destino) && statSync(destino).size > 500) return "ya";
  const ymd = fecha.replace(/-/g, "");
  try {
    const r = await fetch(
      `${B}/option/history/greeks/implied_volatility?symbol=SPXW&expiration=${ymd}&start_date=${ymd}&end_date=${ymd}&right=${right}&interval=5m`,
      { signal: AbortSignal.timeout(300_000) },
    );
    if (!r.ok) return `http ${r.status}`;
    const t = await r.text();
    const lineas = t.trim().split("\n").filter(Boolean);
    // UN 200 CON CUERPO VACÍO NO ES ÉXITO. Se valida por FILAS. (Ese error costó semanas aquí.)
    if (lineas.length < 2) return "vacío";
    writeFileSync(destino, t, "utf8");
    return lineas.length - 1;
  } catch (e) { return `error: ${e.message.slice(0, 40)}`; }
}

const dias = diasHabiles(DESDE, HASTA);
console.log(`\n## CADENAS 0DTE DE SPXW · ${DESDE} → ${HASTA} · ${dias.length} días hábiles a probar\n`);

let bajados = 0, yaEstaban = 0, festivos = 0, fallos = [];
const t0 = Date.now();
for (let i = 0; i < dias.length; i++) {
  const fecha = dias[i];
  const [c, p] = [await bajar(fecha, "C"), await bajar(fecha, "P")];
  const ok = typeof c === "number" && typeof p === "number";
  if (c === "ya" && p === "ya") yaEstaban++;
  else if (ok) bajados++;
  else if (c === "vacío" || p === "vacío") festivos++;
  else fallos.push(`${fecha}: C=${c} P=${p}`);

  if (i % 25 === 0 || i === dias.length - 1) {
    const min = (Date.now() - t0) / 60000;
    const resto = i > 0 ? (min / (i + 1)) * (dias.length - i - 1) : 0;
    console.log(`   ${String(i + 1).padStart(3)}/${dias.length} · ${fecha} · bajados ${bajados} · ya estaban ${yaEstaban} · ` +
                `festivos ${festivos} · fallos ${fallos.length} · quedan ~${resto.toFixed(0)} min`);
  }
}

console.log(`\n### Resultado\n`);
console.log(`  bajados ahora: ${bajados} · ya estaban: ${yaEstaban} · sin datos (festivo): ${festivos} · fallos: ${fallos.length}`);
if (fallos.length) { console.log(`\n  FALLOS — se dicen, no se rellenan:`); for (const f of fallos.slice(0, 20)) console.log(`    ${f}`); }

// ── VALIDACIÓN · abriendo ficheros, no contándolos ──────────────────────────
console.log(`\n### Validación\n`);
const porAno = {};
for (const f of readdirSync(DIR)) {
  const m = f.match(/^iv_(\d{4})-\d{2}-\d{2}_C\.csv$/);
  if (m) (porAno[m[1]] = porAno[m[1]] || []).push(f);
}
for (const [ano, fs_] of Object.entries(porAno).sort()) {
  // se abre UNO de cada año y se comprueba que trae lo que los análisis esperan
  const muestra = `${DIR}/${fs_[Math.floor(fs_.length / 2)]}`;
  const lin = readFileSync(muestra, "utf8").trim().split("\n");
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const faltan = ["strike", "timestamp", "bid", "ask", "implied_vol", "underlying_price"].filter((c) => !cab.includes(c));
  const horas = new Set(lin.slice(1).map((l) => l.split(",")[cab.indexOf("timestamp")]?.slice(11, 16)));
  const spots = lin.slice(1).map((l) => Number(l.split(",")[cab.indexOf("underlying_price")])).filter((x) => x > 0);
  console.log(`  ${ano}: ${String(fs_.length).padStart(3)} días · muestra ${lin.length - 1} filas · ` +
              `${horas.size} marcas de 5 min · SPX ${Math.min(...spots).toFixed(0)}–${Math.max(...spots).toFixed(0)} · ` +
              (faltan.length ? `❌ FALTAN COLUMNAS: ${faltan.join(", ")}` : `✅ columnas completas`));
}
console.log(`\n  (si 2022 y 2023 tienen ~250 días cada uno y las columnas están, el análisis se puede correr tal cual)`);
