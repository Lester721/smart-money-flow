// SEGUIR EL PRINT — el liston contra la moneda: cuantos puntos de acierto hay que ganarle al azar
// para que la operacion empate, en el contrato de la cinta y en la esquina barata.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/seguir-print-liston-moneda.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { media, pctl, fmt, nEfectiva } from "./print-lib.mjs";

const CUENTA = 56389, PLAZA = Math.round(CUENTA * 0.10);
const todo = JSON.parse(readFileSync("scripts/seguir-print-filas.json", "utf8"));
const A = todo.filter((f) => f.lado === 1);
const pc = (x) => (x >= 0 ? "+" : "-") + (Math.abs(x) * 100).toFixed(2) + "%";

console.log("\n" + "=".repeat(104));
console.log("EL LISTON CONTRA LA MONEDA — cuanto hay que acertar para EMPATAR en el contrato de la cinta");
console.log("=".repeat(104));

function analizar(nombre, fs, k) {
  const con = fs.filter((f) => Number.isFinite(f[`r${k}`]) && Number.isFinite(f[`m${k}`]));
  if (con.length < 100) { console.log(`   ${nombre}: n=${con.length}, insuficiente`); return null; }
  const R = con.map((f) => f[`r${k}`]);       // dinero: ask -> bid
  const M = con.map((f) => f[`m${k}`]);       // diagnostico: medio -> medio
  const peaje = media(M) - media(R);          // lo que se lleva la horquilla, en % de la prima
  const gan = M.filter((x) => x > 0), per = M.filter((x) => x <= 0);
  const W = media(gan), L = media(per), p0 = gan.length / M.length;
  // p tal que  p*W + (1-p)*L = peaje   (empatar despues de pagar el peaje)
  const pEmpate = (peaje - L) / (W - L);
  const ne = nEfectiva(con, k);
  console.log(`\n   ${nombre}  (n=${fmt(con.length)}, nEf ${ne.porTicker} por ticker / ${ne.ventanas} ventanas, salida a ${k} dias)`);
  console.log(`     dinero  ask->bid : ${pc(media(R))}      acierto real ${(R.filter((x) => x > 0).length / R.length * 100).toFixed(1)}%`);
  console.log(`     medio a medio    : ${pc(media(M))}      (diagnostico, no es dinero)`);
  console.log(`     PEAJE ida+vuelta : ${(peaje * 100).toFixed(2)}% de la prima`);
  console.log(`     cuando gana, gana ${pc(W)} · cuando pierde, pierde ${pc(L)} · gana el ${(p0 * 100).toFixed(1)}% de las veces`);
  console.log(`     para EMPATAR hay que acertar el ${(pEmpate * 100).toFixed(1)}% -> ${((pEmpate - p0) * 100).toFixed(1)} PUNTOS por encima de lo que sale solo`);
  return { nombre, k, n: con.length, nEf: ne.porTicker, ret: media(R), mid: media(M), peaje, W, L, p0, pEmpate, puntos: pEmpate - p0 };
}

const res = [];
res.push(analizar("EL CONTRATO DE LA CINTA (>=$1M al ask)", A.filter((f) => f.prima >= 1e6), 5));
res.push(analizar("EL CONTRATO DE LA CINTA, asequible (<=$5.639)", A.filter((f) => f.prima >= 1e6 && f.ask * 100 <= PLAZA), 5));
res.push(analizar("EL CONTRATO DE LA CINTA (>=$250k al ask)", A.filter((f) => f.prima >= 250e3), 5));
res.push(analizar("LA ESQUINA BARATA de la cinta (3-8% fuera, 60-120d)", A.filter((f) => f.dist >= 0.03 && f.dist <= 0.08 && f.dte >= 60 && f.dte <= 120), 5));
res.push(analizar("EL CONTRATO DE LA CINTA, salida a 1 dia", A.filter((f) => f.prima >= 1e6), 1));

// ── EL DINERO DE LAS DOS REGLAS ─────────────────────────────────────────────────────────────
console.log("\n\n## EL DINERO — sobre $" + fmt(CUENTA) + ", plaza del 10% = $" + fmt(PLAZA));
const dinero = {};
for (const [nom, filtro, k] of [
  ["SEGUIR EL PRINT >=$1M, asequible, salir a 5 dias", (f) => f.prima >= 1e6 && f.ask * 100 <= PLAZA, 5],
  ["SEGUIR EL PRINT >=$1M, asequible, salir a 1 dia", (f) => f.prima >= 1e6 && f.ask * 100 <= PLAZA, 1],
  ["SEGUIR EL PRINT >=$250k, asequible, salir a 10 dias", (f) => f.prima >= 250e3 && f.ask * 100 <= PLAZA, 10],
]) {
  const fs = A.filter((f) => filtro(f) && Number.isFinite(f[`r${k}`]));
  const ret = media(fs.map((f) => f[`r${k}`]));
  const prima = media(fs.map((f) => f.ask)) * 100;
  const contratos = Math.max(1, Math.floor(PLAZA / prima));
  const capReal = contratos * prima;
  const ciclos = 365 / k;
  const anual = capReal * ret * ciclos;
  const ne = nEfectiva(fs, k);
  dinero[nom] = { n: fs.length, nEf: ne.porTicker, nVent: ne.ventanas, ret, prima, contratos, capReal, ciclos, anual };
  console.log(`   ${nom}`);
  console.log(`     n=${fmt(fs.length)} · nEf ${ne.porTicker}/${ne.ventanas} · prima media $${fmt(prima)} · ${contratos} contrato(s) = $${fmt(capReal)} comprometidos`);
  console.log(`     ret/op ${pc(ret)} · ${ciclos.toFixed(0)} ciclos/ano  =>  ${anual >= 0 ? "+" : "-"}$${fmt(Math.abs(anual))}/ano      (SPY sobre lo mismo: +$${fmt(capReal * 0.14)}/ano)`);
}

// la regla de liquidez
const hh = todo.filter((f) => Number.isFinite(f.horqAzar));
const ah = media(hh.map((f) => f.horqAzar - f.horq));
console.log(`\n   REGLA DE LIQUIDEZ (si ya ibas a comprar una opcion de ese activo):`);
console.log(`     horquilla del contrato de la cinta ${(media(hh.map((f) => f.horq)) * 100).toFixed(2)}% · de uno sorteado del mismo vencimiento ${(media(hh.map((f) => f.horqAzar)) * 100).toFixed(2)}%`);
console.log(`     ahorro ida y vuelta ${(ah * 200).toFixed(2)} puntos de la prima = $${fmt(PLAZA * ah * 2)} por operacion sobre $${fmt(PLAZA)}`);
console.log(`     a 12 op/ano +$${fmt(PLAZA * ah * 2 * 12)}/ano · a 24 op/ano +$${fmt(PLAZA * ah * 2 * 24)}/ano de coste EVITADO (no es beneficio: es peaje que no pagas)`);

writeFileSync("scripts/seguir-print-liston-moneda.json", JSON.stringify({ res, dinero, ahorroLiquidez: ah, plaza: PLAZA }, null, 1));
console.log("\n   -> scripts/seguir-print-liston-moneda.json\n");
