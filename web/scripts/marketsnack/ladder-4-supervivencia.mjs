// ═══ GAMMA LADDER · PASO 4 — LA TRAMPA QUE CAZÓ LA RADIOGRAFÍA ═════════════════════════
//
// El paso 3 se paró en seco: 281 pares ticker-día en vez de miles, y sólo 14 días con escalera.
// Al abrir el fichero, el motivo: el 2026-04-22 el flujo de MU **no contiene ni un contrato que
// venza antes del 2026-08-21**. Ni uno. El más cercano está a 121 días.
//
// LA HIPÓTESIS: el paginador histórico de MarketSnack **sólo devuelve contratos que seguían
// listados el día de la descarga** (2026-08-19). Todo lo que ya había VENCIDO desaparece del
// feed histórico. Es la misma clase de fallo que ya mató un hallazgo en este proyecto:
// "aguantar calls largas da 3,54x" — las que expiran sin valor DESAPARECEN de la caché.
//
// SI ES CIERTO, la predicción es exacta y comprobable: para CUALQUIER día D anterior a la
// descarga, el vencimiento MÍNIMO presente en el flujo tiene que ser ≥ la fecha de descarga,
// no ≥ D. Y sólo en los últimos días, cuando D se acerca a la descarga, deben reaparecer los
// vencimientos cortos.
//
// Esto se comprueba, no se supone. Y decide si la escalera de gamma es medible o no: la gamma
// vive en los vencimientos cortos, así que un flujo sin ellos no tiene escalera.
//
// USO: node --env-file=.env.local --import tsx --max-old-space-size=10240 \
//        scripts/marketsnack/ladder-4-supervivencia.mjs

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const BASE = path.join("scripts", "cache-theta", "marketsnack");
const OCC = /^([A-Z]+)(\d{6})([CP])(\d{8})$/;
const dd = (ms) => new Date(ms).toISOString().slice(0, 10);

function recorrer(DIR, etiqueta) {
  const dias = fs.readdirSync(DIR).filter((f) => f.endsWith(".jsonl.gz")).map((f) => f.slice(0, 10)).sort();
  const filas = [];
  for (const d of dias) {
    const txt = zlib.gunzipSync(fs.readFileSync(path.join(DIR, d + ".jsonl.gz"))).toString("utf8").trim();
    if (!txt) continue;
    const hoyMs = Date.parse(d + "T00:00:00Z");
    let minVenc = Infinity, n = 0, dte0a7 = 0, dte8a30 = 0, dte31a90 = 0, dte91mas = 0;
    const vencs = [];
    for (const l of txt.split("\n")) {
      const f = JSON.parse(l);
      const m = OCC.exec(f.symbol);
      if (!m) continue;
      const vencMs = Date.UTC(2000 + Number(m[2].slice(0, 2)), Number(m[2].slice(2, 4)) - 1, Number(m[2].slice(4, 6)));
      const dte = (vencMs - hoyMs) / 86400000;
      n++;
      if (vencMs < minVenc) minVenc = vencMs;
      vencs.push(dte);
      if (dte <= 7) dte0a7++; else if (dte <= 30) dte8a30++; else if (dte <= 90) dte31a90++; else dte91mas++;
    }
    if (!n) continue;
    vencs.sort((a, b) => a - b);
    filas.push({
      dia: d, n, minVenc: dd(minVenc), minDte: (minVenc - hoyMs) / 86400000,
      p10: vencs[Math.floor(n * 0.1)], p50: vencs[Math.floor(n * 0.5)],
      pct0a7: dte0a7 / n, pct8a30: dte8a30 / n, pct31a90: dte31a90 / n, pct91mas: dte91mas / n,
    });
  }
  console.log("\n" + "═".repeat(110));
  console.log(etiqueta + "  —  " + filas.length + " dias");
  console.log("═".repeat(110));
  console.log("dia          ops     venc mas cercano   DTE min   DTE p10   DTE p50    %0-7d   %8-30d  %31-90d   %>90d");
  console.log("─".repeat(110));
  for (const f of filas) {
    console.log(f.dia + String(f.n).padStart(8) + "      " + f.minVenc + f.minDte.toFixed(0).padStart(10) +
      f.p10.toFixed(0).padStart(10) + f.p50.toFixed(0).padStart(10) +
      (f.pct0a7 * 100).toFixed(1).padStart(9) + "%" + (f.pct8a30 * 100).toFixed(1).padStart(8) + "%" +
      (f.pct31a90 * 100).toFixed(1).padStart(8) + "%" + (f.pct91mas * 100).toFixed(1).padStart(8) + "%");
  }
  return filas;
}

const filas = recorrer(path.join(BASE, "flujo-100k"), "FLUJO A PISO $100k — vencimientos presentes en cada dia de historia");

// ── la prueba de la hipotesis ────────────────────────────────────────────────────────────
const DESCARGA = "2026-08-19";
console.log("\n" + "═".repeat(110));
console.log("LA PRUEBA — si el feed historico solo devuelve contratos VIVOS el dia de la descarga (" + DESCARGA + "),");
console.log("el vencimiento mas cercano de CADA dia tiene que caer DESPUES de la descarga, no despues del propio dia.");
console.log("═".repeat(110));
let cumplen = 0, fallan = 0;
const antesDeDescarga = filas.filter((f) => f.dia < DESCARGA);
for (const f of antesDeDescarga) { if (f.minVenc >= DESCARGA) cumplen++; else fallan++; }
console.log("dias anteriores a la descarga: " + antesDeDescarga.length);
console.log("  con el vencimiento mas cercano YA DESPUES de la descarga: " + cumplen + " (" + (cumplen / antesDeDescarga.length * 100).toFixed(1) + "%)");
console.log("  con algun vencimiento anterior a la descarga (contratos ya vencidos): " + fallan + " (" + (fallan / antesDeDescarga.length * 100).toFixed(1) + "%)");
if (fallan) {
  console.log("\n  los que NO cumplen (por si la hipotesis es solo parcial):");
  for (const f of antesDeDescarga.filter((x) => x.minVenc < DESCARGA)) console.log("    " + f.dia + "  venc mas cercano " + f.minVenc);
}

// ── cuanta gamma se pierde: 0-7 dias y 8-30 dias por tramo del periodo ──────────────────
console.log("\n" + "═".repeat(110));
console.log("LO QUE SE PIERDE — la gamma vive en los vencimientos cortos, y son justo los que faltan");
console.log("═".repeat(110));
const k = Math.floor(filas.length / 3);
const tramos = [["primer tercio", filas.slice(0, k)], ["segundo tercio", filas.slice(k, 2 * k)], ["tercer tercio", filas.slice(2 * k)]];
console.log("tramo                periodo                     ops     %0-7d   %8-30d   %31-90d    %>90d   DTE p50");
for (const [nom, g] of tramos) {
  const s = (c) => g.reduce((a, f) => a + f[c] * f.n, 0) / g.reduce((a, f) => a + f.n, 0);
  const ops = g.reduce((a, f) => a + f.n, 0);
  console.log(nom.padEnd(20) + (g[0].dia + " -> " + g[g.length - 1].dia).padEnd(26) + ops.toLocaleString("es-ES").padStart(10) +
    (s("pct0a7") * 100).toFixed(1).padStart(9) + "%" + (s("pct8a30") * 100).toFixed(1).padStart(8) + "%" +
    (s("pct31a90") * 100).toFixed(1).padStart(9) + "%" + (s("pct91mas") * 100).toFixed(1).padStart(8) + "%" +
    (g.reduce((a, f) => a + f.p50, 0) / g.length).toFixed(0).padStart(10));
}

console.log("\nSi el primer tercio tiene ~0% de vencimientos cortos y el ultimo tiene el grueso, no son");
console.log("dos regimenes de mercado: es el mismo fichero mirado a distinta distancia de la descarga.");
console.log("Una escalera de gamma construida asi mide una cosa distinta en cada tercio del periodo.");

fs.writeFileSync(path.join("scripts", "marketsnack", "ladder-4-salida.json"), JSON.stringify({
  generado: new Date().toISOString(), descarga: DESCARGA,
  diasAntesDeDescarga: antesDeDescarga.length, cumplenHipotesis: cumplen, fallan,
  porDia: filas,
}, null, 1));
console.log("\nguardado en scripts/marketsnack/ladder-4-salida.json");
