// ════════════════════════════════════════════════════════════════════════════════════════════
// LENTE 2 (tercera parte) — ¿SE ESTÁ APAGANDO? Y ¿CUÁNTO CUESTA LA COLA QUE NO HA PASADO?
// ════════════════════════════════════════════════════════════════════════════════════════════
//
// La superficie de las 78 casillas del puente enseña dos cosas que el informe original no dice:
//
//   · La fila de las 15:00 tiene la caída de caja MÁS PEQUEÑA de toda la tabla ($4.3k–$5.7k)
//     mientras sus vecinas están en $8k–$19k. Eso NO es casualidad de una casilla: es la fila
//     entera, y tiene explicación física — a las 15:00 sólo se está expuesto UNA hora. Menos
//     tiempo, menos movimiento, menos pérdida. La caída pequeña es estructural, no un capricho.
//
//   · PERO las mitades de esa misma fila son 15k/8k: la segunda mitad del período vale la mitad
//     que la primera. Y la vecina de las 15:30 se cae de 12k a 2k. Mientras tanto las filas del
//     mediodía (13:00, 13:30) van al revés: suben. Eso hay que medirlo bien.
//
// Aquí se mide:
//   1. El resultado POR OPERACIÓN año a año, con su t, y una recta sobre el tiempo.
//   2. Los últimos 12 meses sueltos (2025-08-11 → 2026-08-10).
//   3. Lo que costaría la cola que TODAVÍA NO HA PASADO: 0 de 518 días perdieron el riesgo
//      entero. Con la regla de tres, la cota superior al 95% de esa tasa es 3/518. Se traduce
//      a dólares al año y se le resta al hallazgo.
//   4. El listón, con el mismo corte por años, para saber si el desgaste es de la mariposa o
//      del mercado entero.
//
// SE EJECUTA:  node --import tsx scripts/v5d-lente2-decaimiento.mjs
// ════════════════════════════════════════════════════════════════════════════════════════════

import { diasDisponibles, cargarDia, estructura, hayHora, rejilla, condor } from "./lib0dte.mjs";

const mariposa = (c, A) => [
  { K: c, lado: "C", dir: -1 }, { K: c + A, lado: "C", dir: 1 },
  { K: c, lado: "P", dir: -1 }, { K: c - A, lado: "P", dir: 1 },
];

const HORAS = ["13:00", "13:30", "14:00", "14:30", "15:00", "15:30"];
const M = {}; for (const h of HORAS) M[h] = [];
const L = [];
const cierres = [];

for (const d of diasDisponibles()) {
  const dia = cargarDia(d);
  if (!dia) continue;
  let ultima = dia.barras.length - 1;
  const i1305 = hayHora(dia, "13:05");
  if (i1305 >= 0) { const sp = dia.barras.slice(i1305).map((b) => b.spot);
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
      if (r) M[h].push({ dia: d, d: r.dolares, riesgo: r.riesgoMax });
    }
    const iv = hayHora(dia, "11:00");
    if (iv >= 0) {
      const S = dia.barras[iv].spot;
      if (S > ma5 && S > ma50) {
        const r = estructura(dia, iv, "vencimiento", condor(rejilla(S), 45, 50));
        if (r && r.credito * 100 >= 100) L.push({ dia: d, d: r.dolares, riesgo: r.riesgoMax });
      }
    }
  }
  cierres.push(dia.barras[dia.barras.length - 1].spot);
}

const sum = (v) => v.reduce((a, b) => a + b, 0);
function tstat(v) { const n = v.length, m = sum(v) / n;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1));
  return { n, m, sd, t: m * Math.sqrt(n) / sd }; }
// recta de mínimos cuadrados del resultado por operación contra el número de operación
function recta(v) {
  const n = v.length, mx = (n - 1) / 2, my = sum(v) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) { sxy += (i - mx) * (v[i] - my); sxx += (i - mx) ** 2; }
  const b = sxy / sxx;
  let sse = 0;
  for (let i = 0; i < n; i++) sse += (v[i] - (my + b * (i - mx))) ** 2;
  const se = Math.sqrt(sse / (n - 2) / sxx);
  return { pendiente: b, t: b / se, caidaTotal: b * (n - 1) };
}

console.log("═".repeat(96));
console.log("  1) EL RESULTADO POR OPERACIÓN, AÑO A AÑO — ¿se está apagando?");
console.log("═".repeat(96));
console.log("  hora    2022      2023      2024      2025      2026     |  recta sobre el tiempo");
for (const h of [...HORAS]) {
  const filas = M[h];
  const porAno = {};
  for (const f of filas) (porAno[f.dia.slice(0, 4)] ??= []).push(f.d);
  const r = recta(filas.map((f) => f.d));
  console.log(`  ${h}  ` + ["2022", "2023", "2024", "2025", "2026"].map((a) => {
    const xs = porAno[a] ?? [];
    return xs.length ? (`$${Math.round(sum(xs) / xs.length)}`).padStart(9) : "—".padStart(9);
  }).join("") + `  |  $${r.pendiente.toFixed(2)}/op por operación  (t=${r.t.toFixed(2)}, ` +
    `de punta a punta $${Math.round(r.caidaTotal)}/op)`);
}
console.log(`  LISTÓN  ` + ["2022", "2023", "2024", "2025", "2026"].map((a) => {
  const xs = L.filter((f) => f.dia.slice(0, 4) === a).map((f) => f.d);
  return xs.length ? (`$${Math.round(sum(xs) / xs.length)}`).padStart(9) : "—".padStart(9);
}).join("") + `  |  ` + (() => { const r = recta(L.map((f) => f.d));
  return `$${r.pendiente.toFixed(2)}/op por operación  (t=${r.t.toFixed(2)}, de punta a punta $${Math.round(r.caidaTotal)}/op)`; })());

console.log("\n  el mismo corte, pero en tercios del período (que es como manda la casa):");
for (const h of HORAS) {
  const v = M[h].map((f) => f.d), n = v.length, t3 = Math.floor(n / 3);
  const tr = [v.slice(0, t3), v.slice(t3, 2 * t3), v.slice(2 * t3)];
  console.log(`  ${h}  ` + tr.map((xs) => (`$${Math.round(sum(xs) / xs.length)}/op`).padStart(11)).join("") +
    `   (fechas: ${M[h][0].dia} · ${M[h][t3].dia} · ${M[h][2 * t3].dia} · ${M[h][n - 1].dia})`);
}
const vL = L.map((f) => f.d), t3L = Math.floor(vL.length / 3);
console.log(`  LISTÓN  ` + [vL.slice(0, t3L), vL.slice(t3L, 2 * t3L), vL.slice(2 * t3L)]
  .map((xs) => (`$${Math.round(sum(xs) / xs.length)}/op`).padStart(11)).join(""));

console.log("\n" + "═".repeat(96));
console.log("  2) LOS ÚLTIMOS 12 MESES SUELTOS (2025-08-11 → 2026-08-10)");
console.log("═".repeat(96));
for (const h of HORAS) {
  const u = M[h].filter((f) => f.dia >= "2025-08-11");
  const s = tstat(u.map((f) => f.d));
  console.log(`  ${h}  n=${String(s.n).padStart(3)}  $${Math.round(sum(u.map((f) => f.d))).toLocaleString("en-US").padStart(8)} en el año  ` +
    `media/op $${s.m.toFixed(0).padStart(5)}  t=${s.t.toFixed(2).padStart(5)}`);
}
{ const u = L.filter((f) => f.dia >= "2025-08-11"); const s = tstat(u.map((f) => f.d));
  console.log(`  LISTÓN  n=${String(s.n).padStart(3)}  $${Math.round(sum(u.map((f) => f.d))).toLocaleString("en-US").padStart(8)} en el año  media/op $${s.m.toFixed(0).padStart(5)}  t=${s.t.toFixed(2).padStart(5)}`); }

console.log("\n" + "═".repeat(96));
console.log("  3) LA COLA QUE TODAVÍA NO HA PASADO — cuánto cuesta si aparece");
console.log("═".repeat(96));
const F = M["15:00"];
const enteras = F.filter((f) => f.d <= -0.999 * f.riesgo).length;
const riesgoMedio = F.map((f) => f.riesgo).sort((a, b) => a - b)[F.length >> 1];
const opsAno = F.length / 4.60;
const total = sum(F.map((f) => f.d));
console.log(`  días operados: ${F.length}   pérdidas del riesgo ENTERO observadas: ${enteras}`);
console.log(`  regla de tres: con 0 sucesos en ${F.length} tiradas, la cota superior al 95% de la tasa es 3/${F.length} = ${(300 / F.length).toFixed(2)}%`);
const tasaTope = 3 / F.length;
const mediaOp = total / F.length;
const costeUno = riesgoMedio + mediaOp;      // sustituye a un día medio
console.log(`  riesgo máximo mediano: $${Math.round(riesgoMedio).toLocaleString("en-US")}   operaciones al año: ${opsAno.toFixed(0)}`);
console.log(`  en el peor caso creíble caerían ${(tasaTope * opsAno).toFixed(2)} pérdidas enteras al año`);
console.log(`  cada una sustituye a un día medio de $${mediaOp.toFixed(0)}, así que resta $${Math.round(tasaTope * opsAno * costeUno).toLocaleString("en-US")}/año`);
console.log(`  el hallazgo pasaría de $${Math.round(total / 4.60).toLocaleString("en-US")}/año a $${Math.round(total / 4.60 - tasaTope * opsAno * costeUno).toLocaleString("en-US")}/año`);
console.log(`  (a la tasa que se ve en los días DESCARTADOS, 3,70%, restaría $${Math.round(0.037 * opsAno * costeUno).toLocaleString("en-US")}/año y el hallazgo se hunde)`);

console.log("\n" + "═".repeat(96));
console.log("  4) Y SI SE JUNTA TODO: el hallazgo con el desgaste Y con la cola");
console.log("═".repeat(96));
const u12 = F.filter((f) => f.dia >= "2025-08-11");
const dol12 = sum(u12.map((f) => f.d));
console.log(`  medido sobre los 4,6 años enteros ............... $${Math.round(total / 4.60).toLocaleString("en-US")}/año`);
console.log(`  medido sólo sobre los últimos 12 meses ......... $${Math.round(dol12).toLocaleString("en-US")}/año  (n=${u12.length})`);
console.log(`  4,6 años menos la cola del peor caso creíble .... $${Math.round(total / 4.60 - tasaTope * opsAno * costeUno).toLocaleString("en-US")}/año`);
console.log(`  últimos 12 meses menos esa misma cola .......... $${Math.round(dol12 - tasaTope * opsAno * costeUno).toLocaleString("en-US")}/año`);
console.log(`  el listón, sobre estos mismos días ............. $${Math.round(sum(vL) / 4.60).toLocaleString("en-US")}/año  ` +
  `(últimos 12 meses: $${Math.round(sum(L.filter((f) => f.dia >= "2025-08-11").map((f) => f.d))).toLocaleString("en-US")})`);
