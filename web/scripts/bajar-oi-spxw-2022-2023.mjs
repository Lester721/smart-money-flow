// BAJAR EL INTERÉS ABIERTO 0DTE DE SPXW DE 2022 Y 2023.
//
// ═══ POR QUÉ ════════════════════════════════════════════════════════════════════════════════
// scripts/cache-theta/gex-2026 tiene 1.123 días de cadena 0DTE de SPXW cada 5 minutos
// (2022-01-03 → 2026-08-10) pero sólo 654 ficheros de interés abierto (2024-01-02 → 2026-08-10).
// Sin OI no hay GEX. Faltan 470 días — justo los dos años que sirven para PARTIR LA MUESTRA.
//
// ═══ CÓMO ══════════════════════════════════════════════════════════════════════════════════
// · Mismo nombre y mismo formato CRUDO que los oi_*.csv que ya hay, para que los scripts de
//   análisis lean 1.123 días sin tocar una línea.
// · REANUDABLE: lo que ya está en disco no se vuelve a pedir.
// · Un HTTP 200 con cuerpo vacío NO es éxito: se valida por FILAS.
// · Los festivos se caen solos (la API no devuelve filas) y se anotan, no se rellenan.
//
// Uso:  node --import tsx scripts/bajar-oi-spxw-2022-2023.mjs
//       (con el Theta Terminal ya levantado; si no, node scripts/with-theta.mjs node ...)

import { writeFileSync, existsSync, readdirSync, statSync } from "node:fs";

const B = (process.env.THETA_BASE || "http://127.0.0.1:25503").replace(/\/+$/, "").replace(/\/v3$/, "") + "/v3";
const DIR = "scripts/cache-theta/gex-2026";
const PAR = Number(process.env.PAR || 4);        // el Terminal admite 4 peticiones concurrentes

// Los días objetivo NO se inventan con un calendario: son exactamente aquellos para los que ya
// hay cadena de opciones y NO hay interés abierto. Así no se piden festivos ni días sin 0DTE.
const conIV = new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean));
const conOI = new Set(readdirSync(DIR).map((f) => f.match(/^oi_(\d{4}-\d{2}-\d{2})\.csv$/)?.[1]).filter(Boolean));
const dias = [...conIV].filter((d) => !conOI.has(d)).sort();

console.log(`\n## INTERÉS ABIERTO 0DTE DE SPXW`);
console.log(`   días con cadena: ${conIV.size} · con OI ya: ${conOI.size} · A BAJAR: ${dias.length}\n`);

async function bajar(fecha) {
  const destino = `${DIR}/oi_${fecha}.csv`;
  if (existsSync(destino) && statSync(destino).size > 200) return { fecha, r: "ya" };
  const ymd = fecha.replace(/-/g, "");
  try {
    const r = await fetch(
      `${B}/option/history/open_interest?symbol=SPXW&expiration=${ymd}&start_date=${ymd}&end_date=${ymd}`,
      { signal: AbortSignal.timeout(120_000) },
    );
    if (!r.ok) return { fecha, r: `http ${r.status}` };
    const t = await r.text();
    const lineas = t.trim().split("\n").filter(Boolean);
    if (lineas.length < 2) return { fecha, r: "vacío" };
    writeFileSync(destino, t, "utf8");
    return { fecha, r: lineas.length - 1 };
  } catch (e) { return { fecha, r: `error: ${e.message.slice(0, 40)}` }; }
}

let bajados = 0, yaEstaban = 0, vacios = 0;
const fallos = [];
const t0 = Date.now();

for (let i = 0; i < dias.length; i += PAR) {
  const lote = dias.slice(i, i + PAR);
  const res = await Promise.all(lote.map(bajar));
  for (const { fecha, r } of res) {
    if (r === "ya") yaEstaban++;
    else if (typeof r === "number") bajados++;
    else if (r === "vacío") vacios++;
    else fallos.push(`${fecha}: ${r}`);
  }
  if ((i / PAR) % 10 === 0 || i + PAR >= dias.length) {
    const hechos = i + lote.length;
    const seg = (Date.now() - t0) / 1000;
    const eta = hechos ? ((dias.length - hechos) * seg / hechos / 60).toFixed(1) : "?";
    console.log(`  ${String(hechos).padStart(4)}/${dias.length} · bajados ${bajados} · vacíos ${vacios} · fallos ${fallos.length} · ${seg.toFixed(0)}s · ETA ${eta} min`);
  }
}

console.log(`\n── RESUMEN ──`);
console.log(`  bajados      ${bajados}`);
console.log(`  ya estaban   ${yaEstaban}`);
console.log(`  vacíos       ${vacios}   (día sin 0DTE o festivo — NO se rellena)`);
console.log(`  fallos       ${fallos.length}`);
for (const f of fallos.slice(0, 20)) console.log(`     ✗ ${f}`);

// ── VALIDAR ABRIENDO FICHEROS, no contándolos. El recuento miente. ────────────────────────
const ahora = readdirSync(DIR).map((f) => f.match(/^oi_(\d{4}-\d{2}-\d{2})\.csv$/)?.[1]).filter(Boolean).sort();
console.log(`\n── VALIDACIÓN (abriendo 6 ficheros de años distintos) ──`);
console.log(`  ficheros de OI en disco ahora: ${ahora.length}`);
const muestra = ["2022-01-03", "2022-06-15", "2023-03-15", "2023-10-11", "2024-06-14", "2026-08-10"];
for (const d of muestra) {
  const f = `${DIR}/oi_${d}.csv`;
  if (!existsSync(f)) { console.log(`  ${d}  NO EXISTE`); continue; }
  const lin = (await import("node:fs")).readFileSync(f, "utf8").trim().split("\n");
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const iK = cab.indexOf("strike"), iO = cab.indexOf("open_interest"), iR = cab.indexOf("right");
  let ks = [], oiTot = 0, nC = 0, nP = 0, ceros = 0;
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    const oi = +c[iO];
    ks.push(+c[iK]);
    oiTot += oi;
    if (oi === 0) ceros++;
    if (c[iR].replace(/"/g, "") === "CALL") nC++; else nP++;
  }
  console.log(`  ${d}  filas ${String(lin.length - 1).padStart(4)} · calls ${String(nC).padStart(3)} · puts ${String(nP).padStart(3)}` +
              ` · strikes ${Math.min(...ks)}–${Math.max(...ks)} · OI total ${oiTot.toLocaleString("es")} · ceros ${ceros}`);
}
