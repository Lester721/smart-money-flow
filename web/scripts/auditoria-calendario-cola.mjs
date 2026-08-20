// AUDITORÍA INDEPENDIENTE del hallazgo "fin de mes + ala estrecha".
// Uso: node --import tsx --max-old-space-size=10240 scripts/auditoria-calendario-cola.mjs
import { readFileSync } from "node:fs";
import { listonT, tWelch } from "../lib/barreraHallazgos";
import { cargar, resumen, media, eur, drawdown } from "./anatomia3-lib.mjs";

const { filas } = cargar();
filas.sort((a,b)=>a.fecha.localeCompare(b.fecha));
const N = filas.length, ANOS = N/251;
const BASE = resumen(filas, ANOS);
const src = readFileSync("scripts/regimen-fomc.mjs","utf8");
const i0 = src.indexOf("const FOMC = new Set([");
const FOMC = new Set(src.slice(i0, src.indexOf("]);", i0)).match(/\d{4}-\d{2}-\d{2}/g)||[]);
const mes = f => f.fecha.slice(0,7);
// posición desde el final del mes: 0 = último día hábil
for (let i=0;i<N;i++){
  const f=filas[i]; let u=0;
  for(let k=i+1;k<N && mes(filas[k])===mes(f);k++) u++;
  const completo = filas.some(g=>mes(g)>mes(f));
  f.posFin = completo ? u : null;
  f.cFomc = FOMC.has(f.fecha)?1:0;
  f.cUlt2 = f.posFin!=null && f.posFin<=1 ?1:0;
  f.marcado = (f.cUlt2===1||f.cFomc===1)?1:0;
  f.ano = f.fecha.slice(0,4);
}
const pc=x=>(x==null||!isFinite(x)?"—":(x*100).toFixed(0)+"%");

console.log("═".repeat(120));
console.log("1 · ¿AGUANTA POR AÑOS?  (el filtro «2 últimos del mes + FOMC»)");
console.log("═".repeat(120));
console.log("| año | días | marcados | media marcados | media resto | dif | t | cola<−2k marcados | cola resto | z | $/año con filtro | $/año sin |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const a of ["2024","2025","2026"]) {
  const g = filas.filter(f=>f.ano===a);
  const si=g.filter(f=>f.marcado), no=g.filter(f=>!f.marcado);
  const anos=g.length/251;
  const tS=si.filter(f=>f.pl<-2000).length/si.length, p0=no.filter(f=>f.pl<-2000).length/no.length;
  const z=(tS-p0)/Math.sqrt(p0*(1-p0)/si.length);
  const t=tWelch(si.map(f=>f.pl), no.map(f=>f.pl));
  console.log(`| ${a} | ${g.length} | ${si.length} | ${eur(media(si.map(f=>f.pl)))} | ${eur(media(no.map(f=>f.pl)))} | ${eur(media(si.map(f=>f.pl))-media(no.map(f=>f.pl)))} | ${t.toFixed(2)} | ${pc(tS)} (${si.filter(f=>f.pl<-2000).length}) | ${pc(p0)} | ${z.toFixed(2)} | ${eur(resumen(no,anos).alAno)} | ${eur(resumen(g,anos).alAno)} |`);
}

console.log("\n" + "═".repeat(120));
console.log("2 · ¿LO SOSTIENEN POCOS DÍAS?  (quitar los k días marcados que MÁS aportan al filtro)");
console.log("═".repeat(120));
// el beneficio del filtro = −suma(P&L de los días marcados). Los que más aportan = los más negativos.
const marc = filas.filter(f=>f.marcado).sort((a,b)=>a.pl-b.pl);
console.log("  los 8 días marcados que más aportan (los más negativos):");
for (const f of marc.slice(0,8)) console.log(`    ${f.fecha}  ${eur(f.pl)}  ${f.cUlt2?"últimos2":""} ${f.cFomc?"FOMC":""}  posFin=${f.posFin}`);
const totalMarc = marc.reduce((a,f)=>a+f.pl,0);
console.log(`\n  suma de P&L de los ${marc.length} días marcados: ${eur(totalMarc)}  (por eso quitarlos SUBE el ingreso)`);
console.log("\n| días quitados de la muestra | media marcados | media resto | t | $/año base | $/año filtrado | ganancia del filtro |");
console.log("|---|---|---|---|---|---|---|");
for (const k of [0,1,2,3,5]) {
  const fuera = new Set(marc.slice(0,k).map(f=>f.fecha));
  const g = filas.filter(f=>!fuera.has(f.fecha));
  const anos=g.length/251;
  const si=g.filter(f=>f.marcado), no=g.filter(f=>!f.marcado);
  const t=tWelch(si.map(f=>f.pl), no.map(f=>f.pl));
  const b=resumen(g,anos), fi=resumen(no,anos);
  console.log(`| ${k} | ${eur(media(si.map(f=>f.pl)))} | ${eur(media(no.map(f=>f.pl)))} | ${t.toFixed(2)} | ${eur(b.alAno)} | ${eur(fi.alAno)} | ${eur(fi.alAno-b.alAno)} |`);
}

console.log("\n" + "═".repeat(120));
console.log("3 · SENSIBILIDAD DEL UMBRAL: ¿cuántos días del final del mes?");
console.log("═".repeat(120));
console.log("| regla | días | media marcados | media resto | t | cola<−2k | resto | z | caída elim. | $/año |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const [nom,fn] of [
  ["sólo el ÚLTIMO (pos 0)", f=>f.posFin===0],
  ["sólo el PENÚLTIMO (pos 1)", f=>f.posFin===1],
  ["sólo el ANTEPENÚLTIMO (pos 2)", f=>f.posFin===2],
  ["últimos 2 (pos 0-1)", f=>f.posFin!=null&&f.posFin<=1],
  ["últimos 3 (pos 0-2)", f=>f.posFin!=null&&f.posFin<=2],
  ["últimos 4 (pos 0-3)", f=>f.posFin!=null&&f.posFin<=3],
  ["últimos 5 (pos 0-4)", f=>f.posFin!=null&&f.posFin<=4],
  ["últimos 2 + FOMC", f=>(f.posFin!=null&&f.posFin<=1)||f.cFomc===1],
  ["últimos 3 + FOMC", f=>(f.posFin!=null&&f.posFin<=2)||f.cFomc===1],
]) {
  const si=filas.filter(fn), no=filas.filter(f=>!fn(f));
  const t=tWelch(si.map(f=>f.pl),no.map(f=>f.pl));
  const kS=si.filter(f=>f.pl<-2000).length, p0=no.filter(f=>f.pl<-2000).length/no.length;
  const z=(kS/si.length-p0)/Math.sqrt(p0*(1-p0)/si.length);
  const r=resumen(no,ANOS);
  console.log(`| ${nom} | ${si.length} | ${eur(media(si.map(f=>f.pl)))} | ${eur(media(no.map(f=>f.pl)))} | ${t.toFixed(2)} | ${pc(kS/si.length)} (${kS}) | ${pc(p0)} | ${z.toFixed(2)} | ${eur(Math.abs(BASE.dd)-Math.abs(r.dd))} | ${eur(r.alAno)} |`);
}

console.log("\n" + "═".repeat(120));
console.log("4 · EL NULO HONESTO: sólo hay ~21 POSICIONES DE MES, no 652 desplazamientos");
console.log("═".repeat(120));
console.log("  El desplazamiento circular de una plantilla MENSUAL no da 652 muestras independientes:");
console.log("  da ~21 fases distintas repetidas. El nulo correcto es comparar contra las OTRAS posiciones del mes.\n");
console.log("| posición desde fin de mes | días | media | cola<−2k | z | caída eliminada si se salta | $/año si se salta |");
console.log("|---|---|---|---|---|---|---|");
const filasPos = [];
for (let p=0;p<=20;p++){
  const fn = f=>f.posFin===p||f.posFin===p+1;   // MISMA plantilla: dos días consecutivos
  const si=filas.filter(fn), no=filas.filter(f=>!fn(f));
  if (si.length<20) continue;
  const kS=si.filter(f=>f.pl<-2000).length, p0=no.filter(f=>f.pl<-2000).length/no.length;
  const z=(kS/si.length-p0)/Math.sqrt(p0*(1-p0)/si.length);
  const r=resumen(no,ANOS);
  const dd=Math.abs(BASE.dd)-Math.abs(r.dd);
  filasPos.push({p,n:si.length,m:media(si.map(f=>f.pl)),z,dd,alAno:r.alAno});
  console.log(`| ${p}–${p+1} ${p===0?"← LA ELEGIDA":""} | ${si.length} | ${eur(media(si.map(f=>f.pl)))} | ${pc(kS/si.length)} (${kS}) | ${z.toFixed(2)} | ${eur(dd)} | ${eur(r.alAno)} |`);
}
const mejorZ = [...filasPos].sort((a,b)=>b.z-a.z);
const mejorDd = [...filasPos].sort((a,b)=>b.dd-a.dd);
const mejorAno= [...filasPos].sort((a,b)=>b.alAno-a.alAno);
console.log(`\n  posiciones probadas: ${filasPos.length}`);
console.log(`  ranking de la elegida (pos 0-1) por z de cola:       ${mejorZ.findIndex(x=>x.p===0)+1} de ${filasPos.length}  → p ≈ ${((mejorZ.findIndex(x=>x.p===0)+1)/filasPos.length).toFixed(3)}`);
console.log(`  ranking por caída eliminada:                          ${mejorDd.findIndex(x=>x.p===0)+1} de ${filasPos.length}  → p ≈ ${((mejorDd.findIndex(x=>x.p===0)+1)/filasPos.length).toFixed(3)}`);
console.log(`  ranking por $/año:                                    ${mejorAno.findIndex(x=>x.p===0)+1} de ${filasPos.length}  → p ≈ ${((mejorAno.findIndex(x=>x.p===0)+1)/filasPos.length).toFixed(3)}`);
console.log(`  listón de Bonferroni con 26 pruebas: p ≤ ${(0.05/26).toFixed(4)}`);
