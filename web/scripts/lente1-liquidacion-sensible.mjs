// LENTE 1 (c) — LOS DÍAS EN QUE EL PRECIO DE LIQUIDACIÓN DECIDE EL RESULTADO
//
// El cóndor se liquida al intrínseco contra el spot de las 16:00 del propio fichero de cadenas.
// Pero SPXW no liquida contra la foto de las 16:00:00 — liquida contra el VALOR DE CIERRE oficial
// del SPX, que se calcula con los precios de cierre de los componentes y sale unos segundos
// después. Comprobado en cuatro días sueltos contra el histórico del bróker, la diferencia va de
// −0,8 a +3,1 puntos. Como cada punto de SPX vale $100 en este cóndor, esa diferencia sólo es
// inocua mientras el índice acabe LEJOS de los strikes vendidos.
//
// Aquí se localizan los días en que NO acaba lejos: los que cierran dentro de una banda estrecha
// alrededor de un strike vendido o comprado. En esos días la foto de las 16:00 y el cierre oficial
// pueden dar resultados distintos, y hay que saber cuánto del $8.365/año depende de ellos.
//
// Uso: node --import tsx scripts/lente1-liquidacion-sensible.mjs

import { diasDisponibles, cargarDia, rejilla, condor, estructura, hayHora } from "./lib0dte.mjs";

const ANCHO = 45, ALA = 50, COMISION = 0.24, MA_CORTA = 5, MA_LARGA = 50, DIAS_ANO = 244;
const media = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const suma = (v) => v.reduce((a, b) => a + b, 0);

const R = [];
for (const d of diasDisponibles()) {
  const dia = cargarDia(d);
  if (!dia) continue;
  const i = hayHora(dia, "11:00");
  let c = null;
  if (i >= 0) {
    const spot = dia.barras[i].spot, centro = rejilla(spot);
    const patas = condor(centro, ANCHO, ALA);
    const r = estructura(dia, i, "vencimiento", patas);
    if (r) c = { spot, centro, patas, credito: r.credito * 100, dolares: r.dolares - COMISION };
  }
  R.push({ dia: d, cierre: dia.barras[dia.barras.length - 1].spot, c });
}
const cierres = R.map((x) => x.cierre);
for (let i = 0; i < R.length; i++) {
  if (i < MA_LARGA) { R[i].ma50 = null; continue; }
  R[i].ma5 = media(cierres.slice(i - MA_CORTA, i));
  R[i].ma50 = media(cierres.slice(i - MA_LARGA, i));
}
const CONMA = R.filter((x) => x.ma50 != null);
const ANOS = CONMA.length / DIAS_ANO;
const OPS = CONMA.filter((x) => x.c && x.c.spot > x.ma5 && x.c.spot > x.ma50 && x.c.credito >= 50)
                 .map((x) => ({ dia: x.dia, cierre: x.cierre, ...x.c }));
const TOT = suma(OPS.map((o) => o.dolares));
console.log(`n=${OPS.length} · total $${TOT.toFixed(0)} · $${(TOT / ANOS).toFixed(0)}/año · ${ANOS.toFixed(2)} años\n`);

// distancia del cierre al strike más cercano de los cuatro
function dist(o) {
  return Math.min(...o.patas.map((p) => Math.abs(o.cierre - p.K)));
}

console.log("=".repeat(105));
console.log("  ¿A QUÉ DISTANCIA DE UN STRIKE ACABA EL ÍNDICE? — cada punto vale $100");
console.log("=".repeat(105) + "\n");
const bandas = [1, 2, 3, 5, 10, 20];
console.log("| cierra a menos de | días | su P&L | % del total | si la liquidación fuese 3 pts distinta |");
console.log("|---|---|---|---|---|");
for (const b of bandas) {
  const s = OPS.filter((o) => dist(o) < b);
  if (!s.length) { console.log(`| ${b} pts | 0 | — | — | — |`); continue; }
  const pl = suma(s.map((o) => o.dolares));
  // recalcular esos días con ±3 puntos
  const alt = [-3, 3].map((dS) => suma(s.map((o) => {
    const S = o.cierre + dS;
    let cierre = 0;
    for (const p of o.patas) {
      const intr = p.lado === "C" ? Math.max(0, S - p.K) : Math.max(0, p.K - S);
      cierre += p.dir === -1 ? intr : -intr;
    }
    return (o.credito / 100 - cierre) * 100 - COMISION;
  })));
  console.log(`| ${b} pts | ${s.length} | $${pl.toFixed(0)} | ${(100 * pl / TOT).toFixed(1)}% | −3pts: $${alt[0].toFixed(0)} · +3pts: $${alt[1].toFixed(0)} |`);
}

console.log("\n" + "=".repeat(105));
console.log("  LOS DÍAS QUE ACABAN A MENOS DE 5 PUNTOS DE UN STRIKE — uno a uno");
console.log("=".repeat(105) + "\n");
console.log("| día | cierre (fichero) | strike más cerca | distancia | crédito | P&L |");
console.log("|---|---|---|---|---|---|");
for (const o of OPS.filter((x) => dist(x) < 5).sort((a, b) => dist(a) - dist(b))) {
  const K = o.patas.map((p) => p.K).sort((a, b) => Math.abs(o.cierre - a) - Math.abs(o.cierre - b))[0];
  console.log(`| ${o.dia} | ${o.cierre} | ${K} | ${(o.cierre - K).toFixed(2)} | $${o.credito.toFixed(0)} | $${o.dolares.toFixed(0)} |`);
}

console.log("\n" + "=".repeat(105));
console.log("  LAS 23 PÉRDIDAS PARCIALES — donde el intrínseco decide, comprobadas a mano");
console.log("=".repeat(105) + "\n");
console.log("| día | centro | cierre | pata rota | intrínseco neto | crédito | P&L | comprobación |");
console.log("|---|---|---|---|---|---|---|---|");
let malas = 0;
for (const o of OPS) {
  const S = o.cierre, c = o.centro;
  const dentro = S <= c + ANCHO && S >= c - ANCHO;
  const total = S >= c + ANCHO + ALA || S <= c - ANCHO - ALA;
  if (dentro || total) continue;
  let intrNeto = 0;
  for (const p of o.patas) {
    const intr = p.lado === "C" ? Math.max(0, S - p.K) : Math.max(0, p.K - S);
    intrNeto += p.dir === -1 ? intr : -intr;
  }
  const esperado = (o.credito / 100 - intrNeto) * 100 - COMISION;
  const ok = Math.abs(esperado - o.dolares) < 1e-6;
  if (!ok) malas++;
  const rota = S > c ? `${c + ANCHO}C` : `${c - ANCHO}P`;
  console.log(`| ${o.dia} | ${c} | ${S} | ${rota} | ${intrNeto.toFixed(2)} | $${o.credito.toFixed(0)} | $${o.dolares.toFixed(0)} | ${ok ? "ok" : "**MAL**"} |`);
}
console.log(`\n  desajustes: ${malas} (tiene que ser 0)\n`);

// ¿cuánto pesan las pérdidas parciales + totales en el total?
const perd = OPS.filter((o) => o.dolares < 0);
console.log(`  Operaciones perdedoras: ${perd.length} de ${OPS.length} · suman $${suma(perd.map((o) => o.dolares)).toFixed(0)}`);
console.log(`  Operaciones ganadoras: ${OPS.length - perd.length} · suman $${suma(OPS.filter((o) => o.dolares >= 0).map((o) => o.dolares)).toFixed(0)}`);
console.log(`  El neto ($${TOT.toFixed(0)}) es la diferencia de dos números grandes: cualquier sesgo en la`);
console.log(`  liquidación de las perdedoras se lleva una tajada desproporcionada.\n`);
