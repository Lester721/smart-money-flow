// LENTE 2, EL CIERRE — las cuentas que faltaban, sobre el libro ya construido.
//
// Cuatro cosas:
//   1) LA COBERTURA: la señal "dispara en 28 tickers" — ¿son 28 porque la señal elige, o porque
//      sólo 28 tickers tienen historia suficiente para que la señal exista? No es lo mismo.
//   2) EL CALENDARIO REAL: se venden "127 operaciones al año", pero todas las compras caen el
//      primer día del mes. ¿En cuántos DÍAS distintos al año se está apostando de verdad?
//   3) LA CONCENTRACIÓN POR MES, contra las 12 tiradas barajadas del MISMO tamaño. Que 9 meses
//      de 74 junten la mitad del dinero sólo es una pega si un montón parecido barajado necesita
//      bastantes más.
//   4) EL PESO DEL MES MÁS GORDO y del ticker más gordo, en porcentaje de todo lo ganado, con y
//      sin señal.
//
// Lee scripts/_y2lente2-ops.json, que deja escrito y2-lente2-sin2020-y-tickers.mjs.
// Uso: node --import tsx scripts/y2-lente2-cierre.mjs

import { readFileSync } from "node:fs";

const { OPS } = JSON.parse(readFileSync("scripts/_y2lente2-ops.json", "utf8"));
const APUESTA = 1000;
const DESPLS = [3, 5, 7, 11, 13, 17, 19, 23, 25, 29, 31, 37];
const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) + "%" : "n/d");
const usd = (n) => "$" + Math.round(n).toLocaleString("en-US");
const num = (n) => Math.round(n).toLocaleString("en-US");

const mide = (v) => {
  const a = { n: 0, win: 0, gan: 0, per: 0 };
  for (const o of v) { const d = APUESTA * o.ret; a.n++; if (d > 0) { a.win++; a.gan += d; } else a.per += -d; }
  return a;
};
const ratio = (a) => (a.per > 0 ? a.gan / a.per : NaN);

const A = OPS.filter((o) => o.env === "A");
const base = A.filter((o) => o.s60 != null);
const sel = base.filter((o) => o.s60 > 0.80);

console.log(`\n══ 1) LA COBERTURA — ¿por qué sólo 28 tickers? ══`);
{
  const todos = new Set(A.map((o) => o.sym));
  const conSenal = new Set(base.map((o) => o.sym));
  const disparan = new Set(sel.map((o) => o.sym));
  console.log(`  tickers con operaciones en el envase A          : ${todos.size}`);
  console.log(`  tickers donde la señal llega a existir (250 días de calentamiento): ${conSenal.size}`);
  console.log(`  tickers donde la señal llega a dispararse       : ${disparan.size}`);
  console.log(`  los que se quedan fuera por falta de historia   : ${[...todos].filter((t) => !conSenal.has(t)).sort().join(", ")}`);
  console.log(`  → la señal dispara en TODOS los tickers donde puede existir. No elige nombres.`);
  const porTk = [...disparan].map((s) => ({ s, n: sel.filter((o) => o.sym === s).length, nb: base.filter((o) => o.sym === s).length }));
  const tasa = porTk.map((x) => x.n / x.nb).sort((a, b) => a - b);
  console.log(`  cada cuánto dispara dentro de cada ticker: la más baja ${pct(tasa[0])} · la mediana ${pct(tasa[tasa.length >> 1])} · la más alta ${pct(tasa[tasa.length - 1])}`);
  console.log(`  (debería rondar el 20% en todos: es el quinto más caro de la propia historia de cada uno)`);
}

console.log(`\n══ 2) EL CALENDARIO DE VERDAD — cuántos DÍAS al año se apuesta ══`);
{
  const dias = new Set(sel.map((o) => o.dia));
  const diasB = new Set(base.map((o) => o.dia));
  const anos = new Set(sel.map((o) => o.ano)).size;
  console.log(`  operaciones con señal: ${num(sel.length)} en ${dias.size} días de bolsa distintos, repartidos en ${new Set(sel.map((o) => o.mes)).size} meses`);
  console.log(`  o sea ${(sel.length / anos).toFixed(0)} operaciones al año pero sólo ${(dias.size / anos).toFixed(0)} días de compra al año`);
  console.log(`  sin señal: ${num(base.length)} operaciones en ${diasB.size} días`);
  const porMes = new Map();
  for (const o of sel) porMes.set(o.mes, (porMes.get(o.mes) ?? 0) + 1);
  const v = [...porMes.values()].sort((a, b) => a - b);
  console.log(`  operaciones por mes en que dispara: mediana ${v[v.length >> 1]} · máximo ${v[v.length - 1]}`);
  console.log(`  → cada mes que dispara son unas ${v[v.length >> 1]} apuestas puestas EL MISMO DÍA. No son`);
  console.log(`    ${(sel.length / anos).toFixed(0)} apuestas independientes al año: son ${(new Set(sel.map((o) => o.mes)).size / anos).toFixed(0)} días de mercado al año con varias encima.`);
}

console.log(`\n══ 3) LA CONCENTRACIÓN POR MES, contra 12 barajados del MISMO tamaño ══`);
{
  const cuantos = (v, clave) => {
    const a = mide(v);
    if (!(a.gan > 0)) return NaN;
    const m = new Map();
    for (const o of v) { const g = APUESTA * o.ret; if (g > 0) m.set(clave(o), (m.get(clave(o)) ?? 0) + g); }
    let ac = 0, c = 0;
    for (const [, g] of [...m.values()].map((g) => [0, g]).sort((x, y) => y[1] - x[1])) { ac += g; c++; if (ac >= a.gan / 2) break; }
    return c;
  };
  console.log(`  | montón | n | meses para la mitad | tickers para la mitad | operaciones para la mitad |`);
  console.log(`  |---|---|---|---|---|`);
  console.log(`  | **LA SEÑAL DE VERDAD** | ${num(sel.length)} | **${cuantos(sel, (o) => o.mes)}** | **${cuantos(sel, (o) => o.sym)}** | **${cuantos(sel, (o) => o.sym + o.dia + o.tipo)}** |`);
  const cm = [], ct = [], co = [];
  for (const dp of DESPLS) {
    const s = base.filter((o) => o.b[dp]?.s60 != null && o.b[dp].s60 > 0.80);
    if (s.length < 300) continue;
    const a = cuantos(s, (o) => o.mes), b = cuantos(s, (o) => o.sym), c = cuantos(s, (o) => o.sym + o.dia + o.tipo);
    cm.push(a); ct.push(b); co.push(c);
    console.log(`  | barajado ${dp} meses | ${num(s.length)} | ${a} | ${b} | ${c} |`);
  }
  cm.sort((a, b) => a - b); ct.sort((a, b) => a - b); co.sort((a, b) => a - b);
  console.log(`  barajados: meses para la mitad de ${cm[0]} a ${cm[cm.length - 1]} (mediana ${cm[cm.length >> 1]}) · tickers de ${ct[0]} a ${ct[ct.length - 1]} (mediana ${ct[ct.length >> 1]}) · operaciones de ${co[0]} a ${co[co.length - 1]} (mediana ${co[co.length >> 1]})`);
  console.log(`  → si la señal de verdad está DENTRO de ese abanico, no está más concentrada que el azar.`);
}

console.log(`\n══ 4) EL PESO DEL MES Y DEL TICKER MÁS GORDOS ══`);
{
  const peso = (v, clave, et) => {
    const a = mide(v);
    const m = new Map();
    for (const o of v) { const g = APUESTA * o.ret; if (g > 0) m.set(clave(o), (m.get(clave(o)) ?? 0) + g); }
    const ord = [...m.entries()].sort((x, y) => y[1] - x[1]);
    console.log(`  ${et}: total ganado ${usd(a.gan)} · el mayor ${ord[0][0]} aporta ${usd(ord[0][1])} = ${pct(ord[0][1] / a.gan)} · los 3 mayores ${pct((ord[0][1] + ord[1][1] + ord[2][1]) / a.gan)}`);
  };
  peso(sel, (o) => o.mes, "con señal, por MES     ");
  peso(base, (o) => o.mes, "sin señal, por MES     ");
  peso(sel, (o) => o.sym, "con señal, por TICKER  ");
  peso(base, (o) => o.sym, "sin señal, por TICKER  ");
  peso(sel, (o) => o.ano, "con señal, por AÑO     ");
  peso(base, (o) => o.ano, "sin señal, por AÑO     ");
}

console.log(`\n══ 5) EL RESUMEN EN UNA TABLA — la mejora en cada corte que se le ha quitado ══`);
{
  const cortes = [
    ["todo, 2016-2026", () => true],
    ["sin feb-mayo 2020", (o) => !(o.dia >= "20200201" && o.dia <= "20200531")],
    ["sin todo 2020", (o) => o.ano !== "2020"],
    ["sin 2020 y sin 2016", (o) => o.ano !== "2020" && o.ano !== "2016"],
    ["sin los 3 mejores tickers", (o) => !["JPM", "XOM", "BAC"].includes(o.sym)],
    ["sin 2020 y sin los 3 mejores tickers", (o) => o.ano !== "2020" && !["JPM", "XOM", "BAC"].includes(o.sym)],
    ["sin el mes más gordo (feb 2020)", (o) => o.mes !== "202002"],
    ["sin los 3 meses más gordos", (o) => !["202002", "201611", "202311"].includes(o.mes)],
    ["sólo 2021-2026", (o) => o.ano >= "2021"],
    ["sólo 2023-2026", (o) => o.ano >= "2023"],
  ];
  console.log(`  | corte | n | CON señal | acierta | SIN señal | acierta | mejora | ¿llega a 1.40? |`);
  console.log(`  |---|---|---|---|---|---|---|---|`);
  for (const [et, f] of cortes) {
    const s = mide(sel.filter(f)), l = mide(base.filter(f));
    console.log(`  | ${et} | ${num(s.n)} | **${ratio(s).toFixed(2)}** | ${pct(s.win / s.n)} | ${ratio(l).toFixed(2)} | ${pct(l.win / l.n)} | ${(ratio(s) - ratio(l) >= 0 ? "+" : "") + (ratio(s) - ratio(l)).toFixed(2)} | ${ratio(s) >= 1.40 ? "sí" : "NO"} |`);
  }
}
console.log("");
