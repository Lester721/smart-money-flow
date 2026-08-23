// ════════════════════════════════════════════════════════════════════════════════════════════
// LENTE 2 (segunda parte) — DE QUÉ VIVE EL NÚMERO, Y SI LA CAJA CABE POR SUERTE
// ════════════════════════════════════════════════════════════════════════════════════════════
//
// La primera parte reprodujo el hallazgo al céntimo. Esta parte ataca las dos cosas que la
// primera deja abiertas:
//
//  A) EL COMPLEMENTO DEL FILTRO. La mariposa SIN filtro da $3.549/año y PIERDE en 2024, 2025 y
//     2026. Con el filtro da $11.405/año y no pierde ningún año. Todo el hallazgo es, entonces,
//     el filtro. Así que hay que medir los días que el filtro DESCARTA: si ahí la mariposa
//     pierde mucho y de forma estable, el filtro está haciendo un trabajo real; si el
//     complemento es plano, el filtro sólo ha tenido suerte con el reparto.
//
//  B) LA CAÍDA MÁXIMA ES UNA SOLA TIRADA. Los $5.321 de caída y el «punto más bajo -$853» son
//     UN camino: el que salió. La misma bolsa de 518 resultados en otro orden da otra caída.
//     Como Lester tiene $7.977 de efectivo y necesita $5.000 para abrir, lo que hay que saber
//     no es la caída que salió, sino CADA CUÁNTO la caja se queda sin efectivo. Se hace con
//     remuestreo POR BLOQUES de 20 operaciones seguidas (así se conservan las rachas, que es
//     justo lo que mata a una cuenta pequeña) y con 10.000 caminos.
//
//  C) LA PÉRDIDA MÁXIMA QUE NO HA PASADO. La mariposa de alas 50 puede perder $5.000 menos el
//     crédito, o sea entre $2.000 y $4.595. En los 518 días filtrados NINGUNO perdió el riesgo
//     entero y sólo uno perdió el 90%. En los 1.058 días sin filtrar sí pasa. Se mide la
//     frecuencia en el complemento para saber si el filtro esquiva de verdad los días de salto.
//
// SE EJECUTA:  node --import tsx scripts/v5c-lente2-cola-b.mjs
// ════════════════════════════════════════════════════════════════════════════════════════════

import { diasDisponibles, cargarDia, estructura, hayHora, rejilla } from "./lib0dte.mjs";

const ANOS = 4.60;
const CAJA = 7977, COLATERAL = 5000;
const mariposa = (c, A) => [
  { K: c, lado: "C", dir: -1 }, { K: c + A, lado: "C", dir: 1 },
  { K: c, lado: "P", dir: -1 }, { K: c - A, lado: "P", dir: 1 },
];

const dias = diasDisponibles();
const cierres = [];
const SI = [], NO = [];                       // días que pasan el filtro y días que no
let huecos = 0;

for (const d of dias) {
  const dia = cargarDia(d);
  if (!dia) continue;
  const cierreHoy = dia.barras[dia.barras.length - 1].spot;
  let ultima = dia.barras.length - 1;
  const i1305 = hayHora(dia, "13:05");
  if (i1305 >= 0) { const sp = dia.barras.slice(i1305).map((b) => b.spot);
    if (sp.every((x) => x === sp[0])) ultima = hayHora(dia, "13:00"); }

  if (cierres.length >= 50) {
    const iE = hayHora(dia, "15:00");
    if (iE >= 0 && iE <= ultima) {
      const S = dia.barras[iE].spot;
      const ma5 = cierres.slice(-5).reduce((a, b) => a + b, 0) / 5;
      const ma50 = cierres.slice(-50).reduce((a, b) => a + b, 0) / 50;
      const pasa = S > ma5 && S > ma50;
      const r = estructura(dia, iE, "vencimiento", mariposa(rejilla(S), 50));
      if (!r) huecos++;
      else (pasa ? SI : NO).push({ dia: d, d: r.dolares, riesgo: r.riesgoMax,
        credito: r.credito * 100, movPct: 100 * (cierreHoy - S) / S });
    }
  }
  cierres.push(cierreHoy);
}

const sum = (v) => v.reduce((a, b) => a + b, 0);
const med = (v) => { const s = [...v].sort((a, b) => a - b); const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
function tstat(v) { const n = v.length, m = sum(v) / n;
  const sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1));
  return { n, m, t: m * Math.sqrt(n) / sd }; }
function caja(v, ini = 0) { let a = ini, p = ini, peor = 0, min = ini;
  for (const x of v) { a += x; if (a > p) p = a; if (p - a > peor) peor = p - a; if (a < min) min = a; }
  return { final: a, caidaMax: peor, min }; }

console.log(`huecos: ${huecos}`);
console.log(`\n${"═".repeat(96)}`);
console.log("  A) ¿QUÉ HACE EL FILTRO? — los días que PASA contra los que DESCARTA");
console.log(`${"═".repeat(96)}`);
for (const [nom, v] of [["PASA el filtro (es lo que se opera)", SI], ["lo DESCARTA el filtro", NO]]) {
  const xs = v.map((f) => f.d), s = tstat(xs);
  const cerca = v.filter((f) => f.d <= -0.90 * f.riesgo).length;
  const entera = v.filter((f) => f.d <= -0.999 * f.riesgo).length;
  console.log(`  ${nom.padEnd(38)} n=${String(s.n).padStart(4)}  total $${Math.round(sum(xs)).toLocaleString("en-US").padStart(8)}  media/op $${s.m.toFixed(0).padStart(5)}  t=${s.t.toFixed(2).padStart(5)}  mediana $${Math.round(med(xs)).toString().padStart(4)}  aciertos ${(100 * xs.filter((x) => x > 0).length / s.n).toFixed(1)}%`);
  console.log(`  ${"".padEnd(38)} pierde ≥90% del riesgo: ${cerca} (${(100 * cerca / s.n).toFixed(2)}%)   pierde el riesgo ENTERO: ${entera} (${(100 * entera / s.n).toFixed(2)}%)   |mov| mediano ${med(v.map((f) => Math.abs(f.movPct))).toFixed(2)}%`);
}
console.log(`\n  el filtro tiene que valer AÑO A AÑO, no sólo en total:`);
console.log(`  año     PASA (n, $/op)          DESCARTA (n, $/op)        diferencia $/op`);
const anos = [...new Set([...SI, ...NO].map((f) => f.dia.slice(0, 4)))].sort();
for (const a of anos) {
  const s = SI.filter((f) => f.dia.slice(0, 4) === a).map((f) => f.d);
  const n = NO.filter((f) => f.dia.slice(0, 4) === a).map((f) => f.d);
  console.log(`  ${a}   n=${String(s.length).padStart(3)}  $${(sum(s) / s.length).toFixed(0).padStart(5)}/op      n=${String(n.length).padStart(3)}  $${(sum(n) / n.length).toFixed(0).padStart(5)}/op       $${((sum(s) / s.length) - (sum(n) / n.length)).toFixed(0).padStart(5)}/op`);
}
// permutación: ¿cuánto de la diferencia es azar?
const todo = [...SI, ...NO].map((f) => f.d);
const difReal = sum(SI.map((f) => f.d)) / SI.length - sum(NO.map((f) => f.d)) / NO.length;
let masExtremos = 0;
for (let it = 0; it < 20000; it++) {
  const c = [...todo];
  for (let i = c.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [c[i], c[j]] = [c[j], c[i]]; }
  const a = c.slice(0, SI.length), b = c.slice(SI.length);
  if (sum(a) / a.length - sum(b) / b.length >= difReal) masExtremos++;
}
console.log(`\n  diferencia real entre los dos grupos: $${difReal.toFixed(0)}/operación`);
console.log(`  barajando la etiqueta 20.000 veces, sale igual o mejor por puro azar: ${masExtremos} veces (${(100 * masExtremos / 20000).toFixed(2)}%)`);

console.log(`\n${"═".repeat(96)}`);
console.log("  B) LA CAJA DE LESTER — 10.000 caminos por bloques de 20 operaciones");
console.log(`${"═".repeat(96)}`);
const xs = SI.map((f) => f.d);
const real = caja(xs, CAJA);
console.log(`  el camino que SALIÓ: caída máxima $${Math.round(caja(xs).caidaMax).toLocaleString("en-US")}, efectivo mínimo $${Math.round(real.min).toLocaleString("en-US")}, nunca por debajo de los $5.000 de colateral`);
for (const CONTRATOS of [1, 2]) {
  const B = 20, N = xs.length;
  const caidas = [], minimos = [];
  let sinEfectivo = 0, negativa = 0;
  for (let it = 0; it < 10000; it++) {
    const cam = [];
    while (cam.length < N) { const s = (Math.random() * (N - B)) | 0;
      for (let k = 0; k < B && cam.length < N; k++) cam.push(xs[s + k] * CONTRATOS); }
    const c = caja(cam, CAJA);
    caidas.push(caja(cam).caidaMax);
    minimos.push(c.min);
    if (c.min < COLATERAL * CONTRATOS) sinEfectivo++;
    if (caja(cam).final <= 0) negativa++;
  }
  caidas.sort((a, b) => a - b); minimos.sort((a, b) => a - b);
  const q = (v, p) => v[Math.floor(p * v.length)];
  console.log(`\n  ── CON ${CONTRATOS} CONTRATO${CONTRATOS > 1 ? "S" : ""} (colateral $${(COLATERAL * CONTRATOS).toLocaleString("en-US")} de los $7.977 de efectivo) ──`);
  console.log(`    caída máxima de la caja: mediana $${Math.round(q(caidas, 0.5)).toLocaleString("en-US")}   p90 $${Math.round(q(caidas, 0.9)).toLocaleString("en-US")}   p95 $${Math.round(q(caidas, 0.95)).toLocaleString("en-US")}   p99 $${Math.round(q(caidas, 0.99)).toLocaleString("en-US")}   peor $${Math.round(caidas[caidas.length - 1]).toLocaleString("en-US")}`);
  console.log(`    efectivo mínimo por el camino: mediana $${Math.round(q(minimos, 0.5)).toLocaleString("en-US")}   p10 $${Math.round(q(minimos, 0.1)).toLocaleString("en-US")}   p5 $${Math.round(q(minimos, 0.05)).toLocaleString("en-US")}   p1 $${Math.round(q(minimos, 0.01)).toLocaleString("en-US")}   peor $${Math.round(minimos[0]).toLocaleString("en-US")}`);
  console.log(`    caminos en que el efectivo baja de los $${(COLATERAL * CONTRATOS).toLocaleString("en-US")} y NO se puede abrir: ${(100 * sinEfectivo / 10000).toFixed(1)}%`);
  console.log(`    caminos que acaban en pérdida a los 4,6 años: ${(100 * negativa / 10000).toFixed(1)}%`);
}

console.log(`\n${"═".repeat(96)}`);
console.log("  C) LA PÉRDIDA MÁXIMA QUE TODAVÍA NO HA PASADO");
console.log(`${"═".repeat(96)}`);
const riesgos = SI.map((f) => f.riesgo);
console.log(`  el peor día posible con estas alas: entre $${Math.round(Math.min(...riesgos)).toLocaleString("en-US")} y $${Math.round(Math.max(...riesgos)).toLocaleString("en-US")} (riesgo máximo = $5.000 − crédito)`);
console.log(`  el peor día que salió: $${Math.round(Math.min(...SI.map((f) => f.d))).toLocaleString("en-US")}  →  sólo el ${(100 * Math.min(...SI.map((f) => f.d)) / -Math.max(...riesgos)).toFixed(0)}% de lo que la estructura puede perder`);
const pNO = NO.filter((f) => f.d <= -0.999 * f.riesgo).length / NO.length;
console.log(`  en los días DESCARTADOS la pérdida entera pasa el ${(100 * pNO).toFixed(2)}% de las veces`);
console.log(`  si en los días operados pasara a esa misma tasa, en 518 días saldrían ${(pNO * 518).toFixed(1)} pérdidas enteras (~$${Math.round(pNO * 518 * 4200).toLocaleString("en-US")}) y salieron 0`);
console.log(`  probabilidad de ver 0 en 518 tiradas a esa tasa: ${(Math.pow(1 - pNO, 518) * 100).toExponential(2)}%`);
console.log(`  → el filtro NO es sólo un reparto afortunado del mismo riesgo: cambia la tasa de días de salto.`);
console.log(`\n  ¿y cuánto movió el índice en la última hora?`);
for (const [nom, v] of [["PASA", SI], ["DESCARTA", NO]]) {
  const m = v.map((f) => Math.abs(f.movPct)).sort((a, b) => a - b);
  console.log(`    ${nom.padEnd(9)} |movimiento de 15:00 al cierre| mediana ${m[m.length >> 1].toFixed(2)}%  p90 ${m[Math.floor(0.9 * m.length)].toFixed(2)}%  p99 ${m[Math.floor(0.99 * m.length)].toFixed(2)}%  máx ${m[m.length - 1].toFixed(2)}%`);
}
