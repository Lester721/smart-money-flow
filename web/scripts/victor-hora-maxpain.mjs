// ═══════════════════════════════════════════════════════════════════════════════════════════
// VICTOR · LA HORA — el max pain AL REVÉS: ¿señal o deriva disfrazada?
//
// En todas las tablas anteriores el max pain sale con el signo CAMBIADO: el precio se ALEJA de
// él, y lo hace con el mismo signo en las dos mitades del período en 6 de 7 horas de entrada.
// Invertido, sería la celda más consistente de todo el estudio.
//
// Antes de llamarlo hallazgo hay que matar la explicación aburrida: el max pain está POR DEBAJO
// del precio el día típico (mediana −13,3 pts). Si está debajo, "alejarse del max pain" es
// "subir". Y el mercado subió en el período. O sea que la señal invertida podría ser
// simplemente ESTAR LARGO, sin ninguna información del GEX dentro.
//
// LA PRUEBA: comparar la señal invertida contra COMPRAR Y YA ESTÁ, en la misma ventana horaria
// y con el mismo vehículo. Si no le gana a estar largo sin mirar nada, no hay señal.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listonT } from "../lib/barreraHallazgos";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const CAMINO = path.join(
  "C:/Users/leste/AppData/Local/Temp/claude/C--Users-leste-OneDrive-Desktop-Agente-Tito-Metralleta",
  "296b4519-6df7-4f7a-9e53-fef3c87e134d/scratchpad/camino5min.csv",
);
const SORTEOS = 500, LISTON = listonT(200);
const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const varianza = (v) => { if (v.length < 2) return 0; const m = media(v); return v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1); };
const tP = (d) => { if (d.length < 3) return 0; const s = Math.sqrt(varianza(d) / d.length); return s > 0 ? media(d) / s : 0; };
const tWelch = (a, b) => { const s = Math.sqrt(varianza(a) / a.length + varianza(b) / b.length); return s > 0 ? (media(a) - media(b)) / s : 0; };
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : " n/d");
const pc = (x) => (Number.isFinite(x) ? (x * 100).toFixed(1) + "%" : "n/d");

const filasRaw = JSON.parse(fs.readFileSync(path.join(AQUI, "gex-niveles.json"), "utf8")).filas;
const camino = new Map();
for (const l of fs.readFileSync(CAMINO, "utf8").split("\n")) {
  if (!l) continue;
  const [fe, ts, p] = l.split(","); const v = Number(p);
  if (!Number.isFinite(v) || v <= 0) continue;
  if (!camino.has(fe)) camino.set(fe, []);
  camino.get(fe).push([ts.slice(11, 16), v]);
}
const dias = [];
for (const f of filasRaw) {
  const c = camino.get(f.fecha); if (!c || c.length < 70) continue;
  const idx = new Map(c.map(([h], i) => [h, i]));
  dias.push({ fecha: f.fecha, anio: +f.fecha.slice(0, 4), px: c.map((x) => x[1]), idx, maxPain: f.maxPain, A: f.apertura });
}
const P = (d, h) => d.px[d.idx.get(h)];

console.log("═".repeat(100));
console.log(`MAX PAIN AL REVÉS · ¿señal o deriva? · n=${dias.length} · listón |t| ≥ ${LISTON}`);
console.log("═".repeat(100));

const debajo = dias.filter((d) => d.maxPain < P(d, "14:30")).length;
console.log(`\n  el max pain está POR DEBAJO del precio de las 14:30 en ${debajo} de ${dias.length} días (${pc(debajo / dias.length)})`);
console.log(`  → si "alejarse del max pain" es casi siempre "subir", la señal invertida puede ser sólo estar largo.\n`);

const PERIODOS = [["TODO", () => true], ["A·2022-23", (d) => d.anio <= 2023], ["B·2024-26", (d) => d.anio >= 2024]];
for (const h0 of ["12:00", "13:00", "14:00", "14:30", "15:00"]) {
  console.log(`  ── entrada ${h0} → 16:00 ──`);
  console.log("     período    |   n  | señal invertida |  comprar y ya  | diferencia | t de la dif.");
  for (const [pn, filtro] of PERIODOS) {
    const sub = dias.filter(filtro).filter((d) => d.maxPain !== P(d, h0));
    // señal invertida: ir en contra del max pain
    const inv = sub.map((d) => (P(d, "16:00") - P(d, h0)) * -Math.sign(d.maxPain - P(d, h0)));
    // comprar y ya está: siempre largo, misma ventana
    const largo = sub.map((d) => P(d, "16:00") - P(d, h0));
    // la diferencia, día a día: sólo se separan en los días en que el max pain está ARRIBA
    const dif = inv.map((x, i) => x - largo[i]);
    console.log(`     ${pn.padEnd(10)} | ${String(sub.length).padStart(4)} |  ${f2(media(inv)).padStart(6)} pts     |  ${f2(media(largo)).padStart(6)} pts    |` +
                `  ${f2(media(dif)).padStart(6)}    |   ${f2(tP(dif))}`);
  }
  console.log("");
}

console.log("  ── lo mismo, mirando SÓLO los días en que el max pain está ARRIBA del precio ──");
console.log("     (son los únicos en que la señal dice algo distinto de 'comprar')");
console.log("     entrada |   n  | señal (vender) | comprar y ya | dif  |   t");
for (const h0 of ["12:00", "13:00", "14:00", "14:30", "15:00"]) {
  const sub = dias.filter((d) => d.maxPain > P(d, h0));
  const inv = sub.map((d) => -(P(d, "16:00") - P(d, h0)));
  const largo = sub.map((d) => P(d, "16:00") - P(d, h0));
  console.log(`     ${h0}   | ${String(sub.length).padStart(4)} |   ${f2(media(inv)).padStart(6)} pts   |  ${f2(media(largo)).padStart(6)} pts  | ${f2(media(inv) - media(largo)).padStart(5)} | ${f2(tP(inv))}`);
}

console.log("\n  ── y partido en las dos mitades, sólo esos días ──");
console.log("     entrada |  A·2022-23 (n)  |  B·2024-26 (n)  | ¿mismo signo?");
for (const h0 of ["12:00", "13:00", "14:00", "14:30", "15:00"]) {
  const cel = [PERIODOS[1], PERIODOS[2]].map(([, filtro]) => {
    const sub = dias.filter(filtro).filter((d) => d.maxPain > P(d, h0));
    const inv = sub.map((d) => -(P(d, "16:00") - P(d, h0)));
    return { n: sub.length, m: media(inv), t: tP(inv) };
  });
  const mismo = cel[0].m * cel[1].m > 0 ? (cel[0].m > 0 ? "sí ++" : "sí −−") : "NO";
  console.log(`     ${h0}   | ${f2(cel[0].m).padStart(6)} t=${f2(cel[0].t).padStart(5)} (${cel[0].n}) | ${f2(cel[1].m).padStart(6)} t=${f2(cel[1].t).padStart(5)} (${cel[1].n}) | ${mismo}`);
}
