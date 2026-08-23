// LENTE 2 (4ª parte) — ¿EL PUENTE DE LAS ALAS ESTRECHAS ES LÍQUIDO?
//
// El ala de 15 sale como la única versión que cabe en los $7.977 de Lester sin pararse nunca.
// Pero un ala estrecha compra la protección MÁS LEJOS en términos relativos de precio: la pata
// comprada de la de 15 vale céntimos. Y en este proyecto la regla de la casa es que antes de
// interpretar nada se mira la liquidez. Aquí se mide, en las MISMAS barras de entrada:
//
//   · la horquilla (ask−bid) de cada una de las cuatro patas, en dólares y en % del crédito;
//   · cuántas veces falta el precio de una pata (huecos) por ala;
//   · cuántas veces la pata comprada cotiza a $0,05 o menos (protección de céntimos: si no hay
//     nadie al otro lado, esa pata no se compra al precio del papel);
//   · el peaje total pagado por operación, que ya está dentro del resultado pero no se ve.
//
// Uso: node --import tsx scripts/v2-lente2-liquidez-alas.mjs

import { diasDisponibles, cargarDia, rejilla, condor, estructura, hayHora } from "./lib0dte.mjs";

const ANCHO = 45, HORA = "11:00", MA_CORTA = 5, MA_LARGA = 50, DIAS_ANO = 244, COMISION = 0.24;
const ALAS = [50, 25, 20, 15];
const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const eur = (x) => (x < 0 ? "−$" : "$") + Math.round(Math.abs(x)).toLocaleString("es-ES");
function pct(v, p) { const s = [...v].sort((a, b) => a - b); const i = (s.length - 1) * p; const lo = Math.floor(i), hi = Math.ceil(i); return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo); }

const dias = diasDisponibles();
const R = [];
const L = {};                                  // liquidez por ala
for (const a of ALAS) L[a] = { huecos: 0, intentos: 0, horqTotal: [], horqPorPata: [[], [], [], []], centavos: 0, largasBid0: 0, credito: [] };

for (const d of dias) {
  const dia = cargarDia(d);
  if (!dia) continue;
  const cierre = dia.barras[dia.barras.length - 1].spot;
  const i = hayHora(dia, HORA);
  const porAla = {};
  if (i >= 0) {
    const b = dia.barras[i], spot = b.spot, centro = rejilla(spot);
    for (const ala of ALAS) {
      L[ala].intentos++;
      const patas = condor(centro, ANCHO, ala);
      const pares = patas.map((p) => b.o.get(p.K + p.lado));
      const r = estructura(dia, i, "vencimiento", patas);
      if (!r || pares.some((x) => !x)) { L[ala].huecos++; porAla[ala] = null; continue; }
      const horq = pares.map(([bid, ask]) => ask - bid);
      L[ala].horqTotal.push(suma(horq) * 100);
      horq.forEach((h, k) => L[ala].horqPorPata[k].push(h * 100));
      // patas compradas (índices 1 y 3 en condor(): las alas)
      for (const k of [1, 3]) if (pares[k][1] <= 0.05) L[ala].centavos++;
      for (const k of [1, 3]) if (pares[k][0] <= 0) L[ala].largasBid0++;
      L[ala].credito.push(r.credito * 100);
      porAla[ala] = { spot, credito: r.credito * 100, dolares: r.dolares - COMISION, horq: suma(horq) * 100 };
    }
  }
  R.push({ dia: d, cierre, porAla });
}

const cierres = R.map((x) => x.cierre);
for (let i = 0; i < R.length; i++) {
  if (i < MA_LARGA) { R[i].ma50 = null; continue; }
  R[i].ma5 = media(cierres.slice(i - MA_CORTA, i));
  R[i].ma50 = media(cierres.slice(i - MA_LARGA, i));
}
const CONMA = R.filter((x) => x.ma50 != null);

console.log("=".repeat(102));
console.log("  LIQUIDEZ DE CADA ALA, en la barra de las 11:00 de los 1.123 días");
console.log("=".repeat(102) + "\n");
console.log("| ala | huecos | horquilla total mediana (4 patas) | vendida C | comprada C | vendida P | comprada P | pata comprada a ≤$0,05 | pata comprada con bid $0 |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const a of ALAS) {
  const x = L[a];
  console.log(`| ${a} | ${x.huecos}/${x.intentos} (${(100 * x.huecos / x.intentos).toFixed(2)}%) | ${eur(pct(x.horqTotal, 0.5))} | ${eur(pct(x.horqPorPata[0], 0.5))} | ${eur(pct(x.horqPorPata[1], 0.5))} | ${eur(pct(x.horqPorPata[2], 0.5))} | ${eur(pct(x.horqPorPata[3], 0.5))} | ${x.centavos} de ${2 * (x.intentos - x.huecos)} (${(100 * x.centavos / (2 * (x.intentos - x.huecos))).toFixed(1)}%) | ${x.largasBid0} (${(100 * x.largasBid0 / (2 * (x.intentos - x.huecos))).toFixed(1)}%) |`);
}

console.log("\n### El peaje como porcentaje del crédito — lo que se paga sólo por entrar y salir\n");
console.log("| ala | crédito mediano | horquilla mediana ida | peaje ida+vuelta | peaje / crédito |");
console.log("|---|---|---|---|---|");
for (const a of ALAS) {
  const x = L[a];
  const cm = pct(x.credito, 0.5), hm = pct(x.horqTotal, 0.5);
  console.log(`| ${a} | ${eur(cm)} | ${eur(hm)} | ${eur(hm)} (se liquida al intrínseco, sólo se paga la ida) | ${(100 * hm / cm).toFixed(0)}% |`);
}

// ── el peaje sobre las operaciones que la REGLA de verdad hace ──────────────────────────────
console.log("\n### Sólo sobre las operaciones que la regla ejecuta (sobre MA5 y MA50, crédito ≥ umbral)\n");
console.log("| ala/umbral | ops | crédito mediano | horquilla mediana | peaje/crédito | $/año |");
console.log("|---|---|---|---|---|---|");
const ANOS = CONMA.length / DIAS_ANO;
for (const [a, u] of [[50, 50], [50, 100], [25, 25], [20, 20], [15, 15], [15, 30]]) {
  const ops = CONMA.filter((x) => x.porAla[a] && x.porAla[a].spot > x.ma5 && x.porAla[a].spot > x.ma50 && x.porAla[a].credito >= u).map((x) => x.porAla[a]);
  console.log(`| ${a}/$${u} | ${ops.length} | ${eur(pct(ops.map((o) => o.credito), 0.5))} | ${eur(pct(ops.map((o) => o.horq), 0.5))} | ${(100 * pct(ops.map((o) => o.horq), 0.5) / pct(ops.map((o) => o.credito), 0.5)).toFixed(0)}% | ${eur(suma(ops.map((o) => o.dolares)) / ANOS)} |`);
}

// ── ¿y si la ejecución es un 10% peor de lo que dice el papel? ──────────────────────────────
console.log("\n### PRUEBA DE ESTRÉS: media horquilla más de peaje por pata (ejecución peor de lo que dice el papel)\n");
console.log("  Se resta media horquilla extra por pata al entrar. Es el mismo castigo que ya");
console.log("  hundió a la mariposa de hierro del encargo anterior (+4,49% → +0,49%).\n");
console.log("| ala/umbral | $/año en el papel | $/año con media horquilla más | pierde |");
console.log("|---|---|---|---|");
for (const [a, u] of [[50, 50], [50, 100], [25, 25], [20, 20], [15, 15]]) {
  const ops = CONMA.filter((x) => x.porAla[a] && x.porAla[a].spot > x.ma5 && x.porAla[a].spot > x.ma50 && x.porAla[a].credito >= u).map((x) => x.porAla[a]);
  const base = suma(ops.map((o) => o.dolares)) / ANOS;
  const cast = suma(ops.map((o) => o.dolares - o.horq / 2)) / ANOS;
  console.log(`| ${a}/$${u} | ${eur(base)} | ${eur(cast)} | ${(100 * (1 - cast / base)).toFixed(0)}% |`);
}
console.log("");
