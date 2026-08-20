// ESTRUCTURA 2 · VERIFICACION — comprobar a mano las dos afirmaciones que sostienen el informe.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/estructura2-verificar.mjs
//
// 1. "A IGUAL INGRESO, la base gana a las 26 estructuras en peor día Y en caída." Se comprueba
//    contando, no mirando la tabla.
// 2. El oráculo de estructura2-techo.mjs sólo estrechaba la put los días de TOPE COMPLETO. Es
//    conservador: hay días de daño PARCIAL grande donde el ala estrecha también habría ayudado.
//    Aquí se calcula el techo de verdad (estrechar siempre que hubiera convenido) para no
//    vender el hallazgo por debajo de lo que es.
// 3. El coste de operar la señal: cuántas veces al año habría que cambiar la estructura.

import { readFileSync } from "node:fs";

const A = JSON.parse(readFileSync("scripts/estructura2-asimetria.json", "utf8"));
const eur = (x) => (x < 0 ? "-$" : "$") + Math.round(Math.abs(x)).toLocaleString("es-ES");

// ── 1 · el recuento ──
const base = A.variantes.base;
console.log(`\n═══ 1 · A IGUAL INGRESO, ¿alguna estructura mejora la cola de la base? ═══\n`);
console.log(`Base: ${eur(base.alAno)}/año · peor día ${eur(base.peorDia)} · p1 ${eur(base.p1)} · p5 ${eur(base.p5)} · caída ${eur(base.dd)}\n`);
let mejorPeor = 0, mejorDD = 0, mejorP5 = 0, total = 0;
const ganadoras = [];
for (const [id, v] of Object.entries(A.variantes)) {
  if (id === "base") continue;
  if (!v.igualIngreso) { console.log(`  ${v.nom}: no gana dinero, no escalable`); continue; }
  total++;
  const g = v.igualIngreso;
  const bP = g.peorDia > base.peorDia, bD = Math.abs(g.dd) < Math.abs(base.dd), b5 = g.p5 > base.p5;
  if (bP) mejorPeor++; if (bD) mejorDD++; if (b5) mejorP5++;
  if (bP || bD) ganadoras.push(`${v.nom} (${bP ? "peor día" : ""}${bP && bD ? " y " : ""}${bD ? "caída" : ""})`);
}
console.log(`De ${total} estructuras escaladas a los mismos ${eur(base.alAno)}/año:`);
console.log(`  · mejoran el PEOR DIA: ${mejorPeor}`);
console.log(`  · mejoran la CAIDA:    ${mejorDD}`);
console.log(`  · mejoran el p5:       ${mejorP5}`);
console.log(ganadoras.length ? `  ganadoras: ${ganadoras.join(" · ")}` : `  NINGUNA gana en peor día ni en caída.`);

// ── el mejor ratio de todas ──
const conRatio = Object.entries(A.variantes).filter(([id, v]) => id !== "base" && Math.abs(v.dd) < Math.abs(base.dd))
  .map(([, v]) => ({ nom: v.nom, ratio: (base.alAno - v.alAno) / (Math.abs(base.dd) - Math.abs(v.dd)), alAno: v.alAno, dd: v.dd, peorDia: v.peorDia }))
  .sort((a, b) => a.ratio - b.ratio);
console.log(`\nMejor ratio de las ${conRatio.length} que sí reducen la caída a 1 contrato:`);
for (const c of conRatio.slice(0, 4)) console.log(`  ${c.ratio.toFixed(2)} $/año por $ de caída · ${c.nom} (${eur(c.alAno)}/año, peor día ${eur(c.peorDia)}, caída ${eur(c.dd)})`);
console.log(`\nEl listón de la familia para que un cambio se pague solo es 0,30. El mejor es ${conRatio[0].ratio.toFixed(2)}: ${(conRatio[0].ratio / 0.3).toFixed(1)}x demasiado caro.`);

// ── 2 · el techo de verdad ──
const T = JSON.parse(readFileSync("scripts/estructura2-techo.json", "utf8"));
console.log(`\n\n═══ 2 · EL TECHO DE VERDAD (oráculo sin restringir a los topes completos) ═══\n`);
const M = JSON.parse(readFileSync("scripts/estructura2-techo-max.json", "utf8"));
console.log(`El oráculo publicado sólo estrechaba los ${T.diasTope.length} días de TOPE COMPLETO: ${eur(T.oraculo.alAno)}/año, caída ${eur(T.oraculo.dd)}.`);
console.log(`Era conservador. Los oráculos sin restringir (estructura2-techo-max.mjs):\n`);
console.log("| oráculo | días que cambia | $/año | peor día | caída |");
console.log("|---|---|---|---|---|");
for (const [nom, o] of Object.entries(M.oraculos))
  console.log(`| ${nom} | ${o.diasCambia} (${((o.diasCambia / M.n) * 100).toFixed(0)}%) | ${eur(o.alAno)} | ${eur(o.peorDia)} | ${eur(o.dd)} |`);
console.log(`\nEl de "no operar los días perdedores" está puesto a propósito como VARA DE MEDIR: es el`);
console.log(`oráculo de la ENTRADA, y da ${eur(M.oraculos["NO OPERAR los días perdedores"].alAno)}/año con caída cero. Cualquier oráculo de la FORMA`);
console.log(`queda muy por debajo. La forma no es donde está el dinero; el cuándo, sí.`);

// ── 3 · el coste operativo de la señal ──
console.log(`\n\n═══ 3 · COSTE OPERATIVO DE UNA SEÑAL CONDICIONAL ═══\n`);
const p = T.presupuesto;
console.log(`Tasa base de días de tope: ${p.tasaBase.toFixed(1)}% (${T.diasTope.length} en ${T.n} días = ${(T.diasTope.length / (T.n / 252)).toFixed(1)} al año)`);
console.log(`Coste de estrechar un día normal: ${eur(p.costeDiaNormal)} · ahorro un día de tope: ${eur(p.ahorroDiaTope)} · ${p.ratio.toFixed(1)}x`);
console.log(`Precisión mínima para no perder dinero: ${p.precisionMinima.toFixed(1)}% (la tasa base es ${p.tasaBase.toFixed(1)}%, hace falta ${(p.precisionMinima / p.tasaBase).toFixed(1)}x de mejora)`);
console.log(`\nSi la señal dispara el 10% de los días son ${Math.round(0.1 * 252)} cambios de estructura al año.`);
console.log(`En Robinhood eso NO cuesta comisión extra (mismo número de patas), sólo la horquilla de un strike distinto.`);
console.log(`Coste anual de disparar en falso el 10% de los días: ${eur(0.1 * 252 * p.costeDiaNormal)}/año.`);
console.log(`Ahorro anual si capta los ${T.diasTope.length} topes: ${eur((T.diasTope.length / (T.n / 252)) * p.ahorroDiaTope)}/año.`);
