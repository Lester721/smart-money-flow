// TENDENCIA-OTRA-VEZ · PASO 6 — el estrés: null por bloques, año fuera, percentil móvil, caja.
import { readFileSync } from "node:fs";
const { filas } = JSON.parse(readFileSync("scripts/tend-filas.json", "utf8"));
const { tabla, baseA, baseB } = JSON.parse(readFileSync("scripts/tend-rejilla.json", "utf8"));
filas.sort((a, b) => a.fecha.localeCompare(b.fecha));
const eur = (x) => `$${Math.round(x).toLocaleString("es-ES")}`;
const pc = (x) => `${(x * 100).toFixed(0)}%`;
const P = (v, q) => v[Math.min(v.length - 1, Math.max(0, Math.round((v.length - 1) * q)))];
function met(per, mask) {
  const pls = []; let acum = 0, pico = 0, peor = 0;
  for (let i = 0; i < per.length; i++) {
    const p = mask[i] ? per[i].pl : 0; if (mask[i]) pls.push(per[i].pl);
    acum += p; pico = Math.max(pico, acum); peor = Math.min(peor, acum - pico);
  }
  const ord = [...pls].sort((a, b) => a - b), k5 = Math.max(1, Math.floor(pls.length * 0.05));
  return { nOp: pls.length, pctOp: pls.length / per.length, total: pls.reduce((a,b)=>a+b,0),
           ano: pls.reduce((a,b)=>a+b,0) / (per.length / 252), peorRacha: peor, peorDia: ord[0] ?? 0,
           p1: P(ord,0.01), p5: P(ord,0.05), es5: ord.slice(0,k5).reduce((a,b)=>a+b,0)/k5,
           n2000: pls.filter(x=>x<=-2000).length, n4000: pls.filter(x=>x<=-4000).length };
}
const REGLA = (x) => x.d50 * 100 >= 1;            // la que ganó eligiendo en 2022-2023
const REGLA2 = (x) => { const d = x.d25 * 100; return d >= 1.5 && d <= 5; };  // la que ganó al revés

// ═══ 1 · NULL POR BLOQUES — baraja los TRAMOS, no los días ═══
// (el azar día a día rompe el apelotonamiento; una regla de tendencia está apagada en TRAMOS
//  largos, así que hay que compararla contra tramos igual de largos colocados al azar)
function rachasDe(mask) {
  const runs = []; let i = 0;
  while (i < mask.length) { let j = i; while (j < mask.length && mask[j] === mask[i]) j++; runs.push({ v: mask[i], n: j - i }); i = j; }
  return runs;
}
function bloques(per, mask, sorteos = 500) {
  const runs = rachasDe(mask), res = [];
  for (let s = 0; s < sorteos; s++) {
    const r = runs.slice();
    for (let i = r.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [r[i], r[j]] = [r[j], r[i]]; }
    const m = []; for (const x of r) for (let k = 0; k < x.n; k++) m.push(x.v);
    res.push(met(per, m));
  }
  return res;
}
const pctlDe = (arr, v) => arr.filter((x) => x < v).length / arr.length;
console.log("═══ 1 · NULL POR BLOQUES — mismos tramos de apagado, colocados al azar (500 sorteos) ═══");
console.log("  | regla | período | racha regla | racha bloques p50 | pctl | $/año regla | $/año bloques p50 | pctl |");
console.log("  |---|---|---|---|---|---|---|---|");
for (const [nom, f] of [["MA50 ≥ 1%", REGLA], ["MA25 en [1.5%,5%]", REGLA2]]) {
  for (const [et, per] of [["A 22-23", filas.filter(x=>x.fecha<"2024-01-01")], ["B 24-26", filas.filter(x=>x.fecha>="2024-01-01")], ["TODO", filas]]) {
    const mask = per.map(f), m = met(per, mask), sb = bloques(per, mask);
    const R = sb.map(x=>x.peorRacha).sort((a,b)=>a-b), I = sb.map(x=>x.ano).sort((a,b)=>a-b);
    console.log(`  | ${nom} | ${et} | ${eur(m.peorRacha)} | ${eur(P(R,0.5))} | ${(pctlDe(R,m.peorRacha)*100).toFixed(0)}% | ${eur(m.ano)} | ${eur(P(I,0.5))} | ${(pctlDe(I,m.ano)*100).toFixed(0)}% |`);
  }
}

// ═══ 2 · AÑO FUERA — elegir con 4 años y probar en el quinto, cinco veces ═══
console.log("\n═══ 2 · AÑO FUERA — se elige con los otros años y se prueba en el año retirado ═══");
const T = tabla.filter((t) => !t.fam.startsWith("pct"));
function fn(id) {
  let m;
  if ((m = id.match(/^MA(\d+) ≥ (-?[\d.]+)%$/))) { const N=+m[1],u=+m[2]; return (x)=>x["d"+N]*100>=u; }
  if ((m = id.match(/^MA(\d+) ≤ (-?[\d.]+)%$/))) { const N=+m[1],u=+m[2]; return (x)=>x["d"+N]*100<=u; }
  if ((m = id.match(/^MA(\d+) en \[(-?[\d.]+)%,(-?[\d.]+)%\]$/))) { const N=+m[1],lo=+m[2],hi=+m[3]; return (x)=>{const d=x["d"+N]*100; return d>=lo&&d<=hi;}; }
  if ((m = id.match(/^MA(\d+) ≥ (-?[\d.]+)σ$/))) { const N=+m[1],u=+m[2]; return (x)=>x["s"+N]>=u; }
  if ((m = id.match(/^MA(\d+) ≤ (-?[\d.]+)σ$/))) { const N=+m[1],u=+m[2]; return (x)=>x["s"+N]<=u; }
  throw new Error(id);
}
const ids = T.map(t => t.id), fns = ids.map(fn);
const anos = ["2022","2023","2024","2025","2026"];
console.log("  | año retirado | regla elegida fuera de él | opera | $/año regla | $/año base | racha regla | racha base |");
console.log("  |---|---|---|---|---|---|---|");
let ganaRacha = 0, ganaIng = 0;
for (const Y of anos) {
  const ent = filas.filter(x => !x.fecha.startsWith(Y)), pru = filas.filter(x => x.fecha.startsWith(Y));
  let mejor = null;
  for (let i = 0; i < ids.length; i++) {
    const m = met(ent, ent.map(fns[i]));
    if (m.pctOp < 0.40) continue;
    if (!mejor || m.peorRacha > mejor.m.peorRacha) mejor = { i, m };
  }
  const mp = met(pru, pru.map(fns[mejor.i])), bp = met(pru, pru.map(()=>true));
  if (mp.peorRacha > bp.peorRacha) ganaRacha++;
  if (mp.ano >= bp.ano) ganaIng++;
  console.log(`  | ${Y} | ${ids[mejor.i]} | ${pc(mp.pctOp)} | ${eur(mp.ano)} | ${eur(bp.ano)} | ${eur(mp.peorRacha)} | ${eur(bp.peorRacha)} |`);
}
console.log(`  → mejora la racha en ${ganaRacha} de 5 años · aguanta el ingreso en ${ganaIng} de 5`);

// ═══ 3 · LA MISMA REGLA FIJA, AÑO A AÑO ═══
console.log("\n═══ 3 · MA50 ≥ 1% FIJA — año a año, sin reelegir nada ═══");
console.log("  | año | días | opera | $ regla | $ base | racha regla | racha base | peor día regla/base | >$2k regla/base |");
console.log("  |---|---|---|---|---|---|---|---|---|");
let okR = 0, okI = 0;
for (const Y of anos) {
  const per = filas.filter(x => x.fecha.startsWith(Y));
  const m = met(per, per.map(REGLA)), b = met(per, per.map(()=>true));
  if (m.peorRacha > b.peorRacha) okR++; if (m.total >= b.total) okI++;
  console.log(`  | ${Y} | ${per.length} | ${pc(m.pctOp)} | ${eur(m.total)} | ${eur(b.total)} | ${eur(m.peorRacha)} | ${eur(b.peorRacha)} | ${eur(m.peorDia)}/${eur(b.peorDia)} | ${m.n2000}/${b.n2000} |`);
}
console.log(`  → racha mejor en ${okR} de 5 años · dinero igual o mejor en ${okI} de 5`);

// ═══ 4 · EL PERÍODO ENTERO ═══
console.log("\n═══ 4 · LOS 1.121 DÍAS ENTEROS ═══");
console.log("  | estrategia | opera | $ total | $/año | racha | peor día | p1 | p5 | ES5 | >$2k | >$4k |");
console.log("  |---|---|---|---|---|---|---|---|---|---|---|");
const opciones = [["sin filtro", () => true], ["MA50 ≥ 1%", REGLA], ["MA25 en [1.5%,5%]", REGLA2]];
const guardados = {};
for (const [nom, f] of opciones) {
  const m = met(filas, filas.map(f)); guardados[nom] = m;
  console.log(`  | ${nom} | ${pc(m.pctOp)} | ${eur(m.total)} | ${eur(m.ano)} | ${eur(m.peorRacha)} | ${eur(m.peorDia)} | ${eur(m.p1)} | ${eur(m.p5)} | ${eur(m.es5)} | ${m.n2000} | ${m.n4000} |`);
}
console.log("\n  LA MÉTRICA QUE DECIDE — $ de ingreso perdido al año por cada $ de racha eliminado:");
const b0 = guardados["sin filtro"];
for (const [nom] of opciones.slice(1)) {
  const m = guardados[nom];
  const dI = b0.ano - m.ano, dC = b0.peorRacha - m.peorRacha;
  console.log(`    ${nom}: ingreso ${dI <= 0 ? "GANA" : "pierde"} ${eur(Math.abs(dI))}/año · racha eliminada ${eur(dC)} · coste = ${(dI/dC).toFixed(3)} $/$`);
}
