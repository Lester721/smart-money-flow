// ¿QUÉ ATRIBUTO SE PUEDE RELAJAR SIN ROMPER LA ESTRATEGIA?
//
// Lester: «si nos ponemos más laxos en los requisitos generamos pérdida, pero quizás tenemos que
// ponernos laxos en un atributo DIFERENTE que no sea el interés abierto (12x). O quizás debo
// intentar 10x.»
//
// La medida que importa NO es «cuántas señales más». Es **cuántas caen en la sequía**: de abril a
// agosto la tabla mágica sólo disparó 3 veces. Un cambio que añade 40 señales todas en marzo no
// arregla nada.
//
// Por eso cada fila trae:
//   n · ratio · dinero · señales en ENE-MAR · señales en ABR-AGO · ratio en ABR-AGO

import { cargar, resumir } from "./consultar.mjs";

const R = { objetivo: 1.50, suelo: 0.50 };
const $ = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const T = cargar();
const SEQ = (f) => f.dC >= "202604";                  // la sequía: abril a agosto

function fila(nom, filtro) {
  const L = T.filter(filtro);
  const r = resumir(L, R);
  if (!r) { console.log(`  ${nom.padEnd(40)}    0`); return; }
  const q = L.filter(SEQ), p = L.filter((f) => !SEQ(f));
  const rq = resumir(q, R), rp = resumir(p, R);
  console.log(`  ${nom.padEnd(40)} ${String(r.n).padStart(4)}  ${(r.r === Infinity ? "∞" : r.r.toFixed(2)).padStart(6)}  ${$(r.neto).padStart(11)}  ${String(p.length).padStart(7)}  ${String(q.length).padStart(7)}  ${(rq ? (rq.r === Infinity ? "∞" : rq.r.toFixed(2)) : "—").padStart(9)}  ${(rq ? $(rq.neto) : "—").padStart(11)}`);
}
const cab = () => console.log(`  ${"regla".padEnd(40)}    n   RATIO       dinero   ene-mar  abr-ago   RATIO seq   dinero seq`);

// la tabla mágica tal cual
const BASE = (f) => f.dentro && f.dte >= 5 && f.dte <= 90 && f.ask * 100 >= 10000 && f.hora >= "14:00";

console.log(`\n═══ 1. MOVER SÓLO EL LISTÓN DEL INTERÉS ABIERTO ═══\n`);
cab();
for (const u of [20, 15, 12, 10, 8, 6, 4]) fila(`${u}x  (todo lo demás igual)`, (f) => BASE(f) && f.vsOI >= u);

console.log(`\n═══ 2. DEJANDO EL 12x FIJO, RELAJAR OTRA COSA ═══\n`);
cab();
fila("12x · la tabla mágica tal cual", (f) => BASE(f) && f.vsOI >= 12);
console.log(`  ${"".padEnd(40)}`);
fila("  ...pero contrato de $7,000+", (f) => f.dentro && f.dte >= 5 && f.dte <= 90 && f.ask * 100 >= 7000 && f.hora >= "14:00" && f.vsOI >= 12);
fila("  ...pero contrato de $5,000+", (f) => f.dentro && f.dte >= 5 && f.dte <= 90 && f.ask * 100 >= 5000 && f.hora >= "14:00" && f.vsOI >= 12);
fila("  ...pero contrato de cualquier precio", (f) => f.dentro && f.dte >= 5 && f.dte <= 90 && f.hora >= "14:00" && f.vsOI >= 12);
console.log(`  ${"".padEnd(40)}`);
fila("  ...pero a cualquier hora", (f) => f.dentro && f.dte >= 5 && f.dte <= 90 && f.ask * 100 >= 10000 && f.vsOI >= 12);
console.log(`  ${"".padEnd(40)}`);
fila("  ...pero hasta 180 días", (f) => f.dentro && f.dte >= 5 && f.dte <= 180 && f.ask * 100 >= 10000 && f.hora >= "14:00" && f.vsOI >= 12);
fila("  ...pero sin límite de plazo", (f) => f.dentro && f.dte >= 5 && f.ask * 100 >= 10000 && f.hora >= "14:00" && f.vsOI >= 12);
console.log(`  ${"".padEnd(40)}`);
fila("  ...aceptando FUERA del dinero también", (f) => f.dte >= 5 && f.dte <= 90 && f.ask * 100 >= 10000 && f.hora >= "14:00" && f.vsOI >= 12);
fila("  ...SÓLO fuera del dinero", (f) => !f.dentro && f.dte >= 5 && f.dte <= 90 && f.ask * 100 >= 10000 && f.hora >= "14:00" && f.vsOI >= 12);

console.log(`\n═══ 3. LAS COMBINACIONES QUE MÁS SEÑALES DAN EN LA SEQUÍA ═══\n`);
cab();
fila("10x · $7,000+ · cualquier hora", (f) => f.dentro && f.dte >= 5 && f.dte <= 90 && f.ask * 100 >= 7000 && f.vsOI >= 10);
fila("10x · $5,000+ · cualquier hora", (f) => f.dentro && f.dte >= 5 && f.dte <= 90 && f.ask * 100 >= 5000 && f.vsOI >= 10);
fila("8x · $7,000+ · cualquier hora", (f) => f.dentro && f.dte >= 5 && f.dte <= 90 && f.ask * 100 >= 7000 && f.vsOI >= 8);
fila("12x · $5,000+ · sin límite de plazo", (f) => f.dentro && f.dte >= 5 && f.ask * 100 >= 5000 && f.vsOI >= 12);
fila("15x · cualquier precio · cualquier hora", (f) => f.dentro && f.dte >= 5 && f.dte <= 90 && f.vsOI >= 15);
fila("20x · cualquier precio · sin plazo", (f) => f.dentro && f.dte >= 5 && f.vsOI >= 20);

console.log(`\n═══ 4. ¿Y SI EL PROBLEMA ES EL TAMAÑO MÍNIMO DEL GOLPE? ═══\n`);
console.log(`  El golpe mediano pasó de $3.8M en marzo a $883k en mayo. Quizás en la sequía hay`);
console.log(`  urgencia, pero más barata. Se prueba pidiendo un golpe GRANDE en vez de OI alto:\n`);
cab();
for (const p of [1e6, 2e6, 3e6, 5e6]) {
  fila(`golpe de $${(p / 1e6).toFixed(0)}M+ · sin filtro de OI`, (f) => f.dentro && f.dte >= 5 && f.dte <= 90 && f.ask * 100 >= 10000 && f.prima >= p);
}
console.log("");
for (const p of [1e6, 2e6, 3e6]) {
  fila(`golpe de $${(p / 1e6).toFixed(0)}M+ · y 4x de OI`, (f) => f.dentro && f.dte >= 5 && f.dte <= 90 && f.ask * 100 >= 10000 && f.prima >= p && f.vsOI >= 4);
}
console.log("");
