// ════════════════════════════════════════════════════════════════════════════════════════════
// LENTE 2 (cuarta parte) — EL PRECIO DE LIQUIDACIÓN, Y QUÉ HORA CABE DE VERDAD EN LA CAJA
// ════════════════════════════════════════════════════════════════════════════════════════════
//
// A) EL PRECIO CON EL QUE SE LIQUIDA
//    La mariposa al dinero pierde $100 por cada punto que el índice se aleje del centro. La
//    mediana del movimiento de las 15:00 al cierre es de sólo el 0,11% (unos 7 puntos), o sea
//    que la mediana de la operación entera ($226) se juega en menos de diez puntos de índice.
//    Con esos márgenes hay que saber cuánto vale el precio de cierre que usa el banco. El banco
//    liquida contra `barras[77].spot`, que es la columna underlying_price de la barra de las
//    16:00. Se comprueba con PARIDAD PUT-CALL sobre las opciones de esa misma barra: a la hora
//    del vencimiento las opciones YA valen su intrínseco, así que call − put debe dar S − K en
//    todos los strikes. Si la paridad cuadra, el spot y las opciones cuentan la misma historia
//    y la liquidación es coherente; si no, hay un desfase y hay que decir cuánto vale en dinero.
//
// B) QUÉ HORA CABE EN LOS $7.977
//    La caída de $5.321 de las 15:00 es UN camino. Se remuestrea por bloques de 20 operaciones
//    (para conservar las rachas) las horas 13:00, 13:30, 14:00, 14:30 y 15:00 y se cuenta en
//    qué porcentaje de caminos el efectivo se queda por debajo de los $5.000 que hacen falta
//    para abrir. Ésa es la pregunta de verdad: no cuánto ganó, sino cada cuánto se queda sin
//    combustible.
//
// SE EJECUTA:  node --import tsx scripts/v5e-lente2-liquidacion-y-caja.mjs
// ════════════════════════════════════════════════════════════════════════════════════════════

import { diasDisponibles, cargarDia, estructura, hayHora, rejilla } from "./lib0dte.mjs";

const mariposa = (c, A) => [
  { K: c, lado: "C", dir: -1 }, { K: c + A, lado: "C", dir: 1 },
  { K: c, lado: "P", dir: -1 }, { K: c - A, lado: "P", dir: 1 },
];
const HORAS = ["13:00", "13:30", "14:00", "14:30", "15:00"];
const M = {}; for (const h of HORAS) M[h] = [];
const cierres = [];
const paridad = [];          // error del spot deducido por paridad contra el spot del fichero

for (const d of diasDisponibles()) {
  const dia = cargarDia(d);
  if (!dia) continue;
  const ult = dia.barras[dia.barras.length - 1];

  // ── A) paridad put-call en la barra de las 16:00 ────────────────────────────────────────
  // a punto medio, y sólo strikes cercanos: S = K + call − put
  const difs = [];
  for (let k = rejilla(ult.spot) - 30; k <= rejilla(ult.spot) + 30; k += 5) {
    const c = ult.o.get(k + "C"), p = ult.o.get(k + "P");
    if (!c || !p) continue;
    const mc = (c[0] + c[1]) / 2, mp = (p[0] + p[1]) / 2;
    difs.push(k + mc - mp);
  }
  if (difs.length >= 5) {
    difs.sort((a, b) => a - b);
    paridad.push({ dia: d, sFichero: ult.spot, sParidad: difs[difs.length >> 1],
      err: difs[difs.length >> 1] - ult.spot, t: ult.t });
  }

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
      if (r) M[h].push(r.dolares);
    }
  }
  cierres.push(ult.spot);
}

const sum = (v) => v.reduce((a, b) => a + b, 0);
const q = (v, p) => { const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

console.log("═".repeat(96));
console.log("  A) ¿CON QUÉ PRECIO SE LIQUIDA? — paridad put-call en la barra de las 16:00");
console.log("═".repeat(96));
console.log(`  días comprobados: ${paridad.length}`);
const err = paridad.map((x) => x.err);
console.log(`  la barra que usa el banco para liquidar es siempre las «${paridad[0].t}»`);
console.log(`  error (spot deducido por paridad − spot del fichero), en PUNTOS de índice:`);
console.log(`    mediana ${q(err, 0.5).toFixed(2)}   media ${(sum(err) / err.length).toFixed(2)}   p5 ${q(err, 0.05).toFixed(2)}   p95 ${q(err, 0.95).toFixed(2)}   |máx| ${Math.max(...err.map(Math.abs)).toFixed(2)}`);
const ae = err.map(Math.abs);
console.log(`    |error| mediano ${q(ae, 0.5).toFixed(2)} puntos = $${Math.round(100 * q(ae, 0.5))} por mariposa   p95 ${q(ae, 0.95).toFixed(2)} puntos = $${Math.round(100 * q(ae, 0.95))}`);
console.log(`    → la mariposa pierde $100 por punto, así que el error de liquidación vale $${Math.round(100 * sum(ae) / ae.length)} de media por operación.`);
console.log(`    Como el error MEDIO con signo es ${(sum(err) / err.length).toFixed(2)} puntos, no empuja el resultado en una dirección:`);
console.log(`    sobre 518 operaciones el sesgo sería de $${Math.round(100 * Math.abs(sum(err) / err.length))}/op y el ruido de $${Math.round(100 * Math.sqrt(sum(err.map((x) => x * x)) / err.length) / Math.sqrt(518))}/op.`);

console.log("\n" + "═".repeat(96));
console.log("  B) QUÉ HORA CABE EN LOS $7.977 — 10.000 caminos, bloques de 20 operaciones");
console.log("═".repeat(96));
const CAJA = 7977, COL = 5000, B = 20;
console.log("  hora     $/año   caída real   caída p95   efectivo mín p5   caminos sin combustible");
for (const h of HORAS) {
  const xs = M[h], N = xs.length;
  let a = 0, pico = 0, peor = 0;
  for (const x of xs) { a += x; if (a > pico) pico = a; if (pico - a > peor) peor = pico - a; }
  const caidas = [], mins = []; let sin = 0;
  for (let it = 0; it < 10000; it++) {
    const cam = [];
    while (cam.length < N) { const s = (Math.random() * (N - B)) | 0;
      for (let k = 0; k < B && cam.length < N; k++) cam.push(xs[s + k]); }
    let c = CAJA, p = CAJA, pe = 0, mn = CAJA;
    for (const x of cam) { c += x; if (c > p) p = c; if (p - c > pe) pe = p - c; if (c < mn) mn = c; }
    caidas.push(pe); mins.push(mn); if (mn < COL) sin++;
  }
  console.log(`  ${h}  ${("$" + Math.round(sum(xs) / 4.6).toLocaleString("en-US")).padStart(8)}  ` +
    `${("$" + Math.round(peor).toLocaleString("en-US")).padStart(10)}  ` +
    `${("$" + Math.round(q(caidas, 0.95)).toLocaleString("en-US")).padStart(10)}  ` +
    `${("$" + Math.round(q(mins, 0.05)).toLocaleString("en-US")).padStart(16)}  ` +
    `${(100 * sin / 10000).toFixed(1).padStart(10)}%`);
}
console.log("\n  «sin combustible» = en algún momento del camino el efectivo baja de $5.000 y no se");
console.log("  puede abrir la siguiente mariposa. Con 1 contrato. Con 2 no cabe ninguna: el colateral");
console.log("  serían $10.000 y sólo hay $7.977.");
