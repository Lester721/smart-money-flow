// INTERÉS ABIERTO DE SPXW, día a día — sin esto el GEX no es GEX.
//
// ═══ POR QUÉ HACE FALTA ═════════════════════════════════════════════════════════════════════
//
// La gamma de un strike hay que PESARLA por cuántos contratos hay abiertos ahí. Sin ese peso,
// todos los strikes valen igual y el "imán" acaba siendo, por pura aritmética, el strike más
// cercano al dinero — que sigue al precio por construcción.
//
// Eso ya me pasó hoy: medí el GEX vivo sin OI y salió una correlación de 0,761 entre el imán y
// el precio. No era un hallazgo, era una tautología de mi propio script.
//
// ═══ EL DATO ════════════════════════════════════════════════════════════════════════════════
//
// ThetaData sirve `option/history/open_interest` para SPXW y llega hasta 2020 (comprobado).
// El OI se publica ANTES de abrir y no cambia durante la sesión: el de un día es lo último
// conocido mientras se opera al día siguiente. Por eso el que se usa para las decisiones de
// HOY es el de AYER — y por eso este fichero se guarda por fecha de publicación, no de uso.
//
// Reanudable: lo que ya está en disco no se vuelve a pedir.
//
// Uso: node scripts/with-theta.mjs node scripts/bajar-oi-spxw.mjs

import { writeFileSync, existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";

const B = (process.env.THETA_BASE || "http://127.0.0.1:25503").replace(/\/+$/, "").replace(/\/v3$/, "") + "/v3";
const CADENAS = "scripts/cache-theta/gex-2026";
const DIR = "scripts/cache-theta/oi-spxw";
if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });

const limpia = (s) => String(s ?? "").replace(/"/g, "").trim();
const fechas = [...new Set(readdirSync(CADENAS).map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean))].sort();

console.log(`\n## INTERÉS ABIERTO DE SPXW · ${fechas.length} días a cubrir\n`);

let bajados = 0, yaEstaban = 0, vacios = 0;
const fallos = [];
const t0 = Date.now();

for (let i = 0; i < fechas.length; i++) {
  const fecha = fechas[i];
  const destino = `${DIR}/${fecha}.json`;
  if (existsSync(destino)) { yaEstaban++; continue; }

  const ymd = fecha.replace(/-/g, "");
  try {
    // El 0DTE: el vencimiento es el mismo día. Es la cadena que mueve la gamma intradía.
    const r = await fetch(`${B}/option/history/open_interest?symbol=SPXW&expiration=${ymd}&start_date=${ymd}&end_date=${ymd}`,
      { signal: AbortSignal.timeout(120_000) });
    if (!r.ok) { fallos.push(`${fecha}: http ${r.status}`); continue; }
    const lin = (await r.text()).trim().split("\n").filter(Boolean);
    // UN 200 CON CUERPO VACÍO NO ES ÉXITO. Se valida por filas.
    if (lin.length < 2) { vacios++; continue; }
    const cab = lin[0].split(",").map(limpia);
    const iK = cab.indexOf("strike"), iR = cab.indexOf("right"), iO = cab.indexOf("open_interest");
    if (iK < 0 || iR < 0 || iO < 0) { fallos.push(`${fecha}: faltan columnas (${cab.join("|")})`); continue; }

    const out = {};
    for (let j = 1; j < lin.length; j++) {
      const c = lin[j].split(",");
      const K = Number(limpia(c[iK])), n = Number(limpia(c[iO]));
      const lado = limpia(c[iR]).toUpperCase().startsWith("C") ? "C" : "P";
      if (K > 0 && n > 0) out[`${K}|${lado}`] = n;
    }
    if (!Object.keys(out).length) { vacios++; continue; }
    writeFileSync(destino, JSON.stringify(out), "utf8");
    bajados++;
  } catch (e) { fallos.push(`${fecha}: ${e.message.slice(0, 40)}`); }

  if (i % 100 === 0 || i === fechas.length - 1) {
    const min = (Date.now() - t0) / 60000;
    const resto = i > 0 ? (min / (i + 1)) * (fechas.length - i - 1) : 0;
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
  const strikes = [...new Set(ks.map((k) => Number(k.split("|")[0])))].sort((a, b) => a - b);
  const total = ks.reduce((a, k) => a + o[k], 0);
  console.log(`  ${f.replace(".json", "")} · ${ks.length} contratos · ${strikes.length} strikes (${strikes[0]}–${strikes[strikes.length - 1]}) · OI total ${total.toLocaleString("es-ES")}`);
}
console.log(`\n  (si el rango de strikes cubre el precio del día y el OI total es de decenas de miles,`);
console.log(`   el dato está bien. Un OI total de tres cifras sería una cadena casi vacía.)`);
