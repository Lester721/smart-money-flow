// ════════════════════════════════════════════════════════════════════════════════════════════
// LENTE 2 (quinta parte) — CUÁNTO EFECTIVO HACE FALTA PARA QUE ESTO SE PUEDA OPERAR
// ════════════════════════════════════════════════════════════════════════════════════════════
//
// Matar una idea es donde empieza el trabajo. La mariposa de las 15:00 cabe en los $7.977 en el
// camino que salió, pero se queda sin combustible en el 15% de los caminos posibles. Y la de
// las 13:30 gana un 43% más y va al alza, pero se queda sin combustible en el 30%.
//
// La pregunta útil no es «¿cabe?» sino «¿CUÁNTO EFECTIVO haría falta para que quepa?». Eso es
// un número que Lester puede decidir: vender acciones de HOOD hasta ahí, o no operarlo.
//
// Se mide con el mismo remuestreo por bloques de 20 operaciones, barriendo el efectivo inicial,
// y se busca el nivel en que menos del 5% de los caminos se quedan sin poder abrir.
//
// SE EJECUTA:  node --import tsx scripts/v5f-lente2-cuanto-efectivo.mjs
// ════════════════════════════════════════════════════════════════════════════════════════════

import { diasDisponibles, cargarDia, estructura, hayHora, rejilla } from "./lib0dte.mjs";

const mariposa = (c, A) => [
  { K: c, lado: "C", dir: -1 }, { K: c + A, lado: "C", dir: 1 },
  { K: c, lado: "P", dir: -1 }, { K: c - A, lado: "P", dir: 1 },
];
const HORAS = ["13:30", "15:00"];
const M = {}; for (const h of HORAS) M[h] = [];
const cierres = [];

for (const d of diasDisponibles()) {
  const dia = cargarDia(d);
  if (!dia) continue;
  let ultima = dia.barras.length - 1;
  const i = hayHora(dia, "13:05");
  if (i >= 0) { const sp = dia.barras.slice(i).map((b) => b.spot);
    if (sp.every((x) => x === sp[0])) ultima = hayHora(dia, "13:00"); }
  if (cierres.length >= 50) {
    const ma5 = cierres.slice(-5).reduce((a, b) => a + b, 0) / 5;
    const ma50 = cierres.slice(-50).reduce((a, b) => a + b, 0) / 50;
    for (const h of HORAS) {
      const iE = hayHora(dia, h);
      if (iE < 0 || iE > ultima) continue;
      const S = dia.barras[iE].spot;
      if (!(S > ma5 && S > ma50)) continue;
      const r = estructura(dia, iE, "vencimiento", mariposa(rejilla(S), 50));
      if (r) M[h].push(r.dolares);
    }
  }
  cierres.push(dia.barras[dia.barras.length - 1].spot);
}

const sum = (v) => v.reduce((a, b) => a + b, 0);
const COL = 5000, B = 20, IT = 10000;

function sinCombustible(xs, inicial, contratos) {
  const N = xs.length, col = COL * contratos;
  let sin = 0;
  for (let it = 0; it < IT; it++) {
    let c = inicial, roto = false;
    for (let n = 0; n < N;) {
      const s = (Math.random() * (N - B)) | 0;
      for (let k = 0; k < B && n < N; k++, n++) { if (c < col) { roto = true; break; } c += xs[s + k] * contratos; }
      if (roto) break;
    }
    if (roto) sin++;
  }
  return sin / IT;
}

console.log("═".repeat(96));
console.log("  ¿CUÁNTO EFECTIVO HACE FALTA? — % de caminos que se quedan sin poder abrir");
console.log("═".repeat(96));
console.log("  (remuestreo por bloques de 20 operaciones, 10.000 caminos, alas de 50 → $5.000 de colateral por contrato)");
const NIVELES = [7977, 10000, 12500, 15000, 20000, 25000, 30000, 40000];
for (const contratos of [1, 2]) {
  console.log(`\n  ── ${contratos} CONTRATO${contratos > 1 ? "S" : ""} ──`);
  console.log("  efectivo   " + HORAS.map((h) => `mariposa ${h}`.padStart(18)).join("") + "     $/año 13:30      $/año 15:00");
  for (const ini of NIVELES) {
    if (ini < COL * contratos) continue;
    const fila = HORAS.map((h) => `${(100 * sinCombustible(M[h], ini, contratos)).toFixed(1)}%`.padStart(18)).join("");
    console.log(`  $${ini.toLocaleString("en-US").padEnd(9)}` + fila +
      (ini === NIVELES[0] || true ? `   $${Math.round(contratos * sum(M["13:30"]) / 4.6).toLocaleString("en-US").padStart(10)}   $${Math.round(contratos * sum(M["15:00"]) / 4.6).toLocaleString("en-US").padStart(14)}` : ""));
  }
}
console.log("\n  LO QUE LESTER TIENE HOY: $7.977 de efectivo. Sus 500 acciones de HOOD son el 85% de");
console.log("  la cuenta; vender 100 le daría aproximadamente $11.000 más de efectivo.");
