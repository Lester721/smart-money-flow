import { readFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";
const G = JSON.parse(readFileSync("scripts/dm-grid.json", "utf8"));
const D = G.dias, V = G.variantes, N = D.length;
const suma = (v) => v.reduce((a, x) => a + x, 0);
const media = (v) => (v.length ? suma(v) / v.length : 0);
const sd = (v) => Math.sqrt(suma(v.map((x) => (x - media(v)) ** 2)) / (v.length - 1));
const anosEntre = (a, b) => (new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000 / 365.25;
const AN_T = anosEntre(D[0].fecha, D[N - 1].fecha);
const serie = (vid, fm) => D.map((d, i) => { const r = V[vid].serie[i]; return (r && !(fm && d.finMes)) ? r.pl : 0; });
const CUENTA = 56389, EFECTIVO = 7977;

const cfg = [
  ["CONDOR DE HOY  +-25 pts / ala 50", serie("p25_a50", false), 5000],
  ["PROPUESTA sin la regla de fin de mes", serie("s0.80_a30", false), 3000],
  ["PROPUESTA  +-0,80sig / ala 30 + finmes", serie("s0.80_a30", true), 3000],
];
console.log(`=== CIERRE - 1 contrato de SPXW, ${N} dias, ${AN_T.toFixed(2)} anos, cuenta $${CUENTA}, efectivo $${EFECTIVO} ===\n`);
for (const [nom, s, col] of cfg) {
  const op = s.filter((x) => x !== 0);
  let acc = 0, pico = 0, dd = 0, ddIni = "", ddFin = "", picoF = D[0].fecha, curIni = "";
  for (let i = 0; i < N; i++) { acc += s[i]; if (acc > pico) { pico = acc; picoF = D[i].fecha; } if (pico - acc > dd) { dd = pico - acc; ddIni = picoF; ddFin = D[i].fecha; } }
  const t = media(op) / (sd(op) / Math.sqrt(op.length));
  const so = [...op].sort((a, b) => a - b);
  let peorAno = 0, peor252 = 0;
  for (let i = 0; i + 252 <= N; i++) { const v = suma(s.slice(i, i + 252)); if (v < peor252) peor252 = v; }
  console.log(`${nom}`);
  console.log(`   $/ano bruto            $${(suma(s) / AN_T).toFixed(0)}   (total $${suma(s).toFixed(0)} en ${AN_T.toFixed(2)} anos)`);
  console.log(`   % de la cuenta          ${((suma(s) / AN_T) / CUENTA * 100).toFixed(2)}%/ano`);
  console.log(`   dias que opera          ${op.length} de ${N}   (acierto ${(op.filter((x) => x > 0).length / op.length * 100).toFixed(1)}%)`);
  console.log(`   colateral por contrato $${col}  (${(col / 73874 * 100).toFixed(1)}% del poder de compra)`);
  console.log(`   peor dia               $${Math.min(...s).toFixed(0)}   (${(Math.min(...s) / EFECTIVO * 100).toFixed(0)}% del efectivo)`);
  console.log(`   p1 / p5 diarios        $${so[Math.floor(so.length * .01)].toFixed(0)} / $${so[Math.floor(so.length * .05)].toFixed(0)}`);
  console.log(`   ES5 (media del 5% peor)$${(suma(so.slice(0, Math.floor(so.length * .05))) / Math.floor(so.length * .05)).toFixed(0)}`);
  console.log(`   peor racha             $${(-dd).toFixed(0)}  (${(dd / EFECTIVO * 100).toFixed(0)}% del efectivo, ${(dd / CUENTA * 100).toFixed(1)}% de la cuenta)  ${ddIni} -> ${ddFin}`);
  console.log(`   peor ventana de 252 d. $${peor252.toFixed(0)}`);
  console.log(`   t del P&L diario        ${t.toFixed(2)}   (liston Bonferroni 90 pruebas: ${listonT(90)})`);
  console.log("");
}
// la diferencia entre propuesta y base, dia a dia, emparejada
const b = serie("p25_a50", false), p = serie("s0.80_a30", true);
const dif = D.map((_, i) => p[i] - b[i]);
console.log(`Diferencia PROPUESTA - HOY, emparejada dia a dia: media $${media(dif).toFixed(1)}/dia = $${(suma(dif) / AN_T).toFixed(0)}/ano - t=${(media(dif) / (sd(dif) / Math.sqrt(N))).toFixed(2)}`);
const dif2 = D.map((_, i) => serie("s0.80_a30", false)[i] - b[i]);
console.log(`Diferencia PROPUESTA-sin-finmes - HOY:            media $${media(dif2).toFixed(1)}/dia = $${(suma(dif2) / AN_T).toFixed(0)}/ano - t=${(media(dif2) / (sd(dif2) / Math.sqrt(N))).toFixed(2)}`);
