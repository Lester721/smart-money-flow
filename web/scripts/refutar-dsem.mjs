// REFUTACION · el CRUCE se hizo de verdad?  Uso:
//   node --import tsx --max-old-space-size=10240 scripts/refutar-dsem.mjs
import { readFileSync } from "node:fs";
import { tWelch, listonT } from "../lib/barreraHallazgos";
import { radiografia } from "../lib/radiografia";

const DIAS_ANO = 252, EFECTIVO = 7977;
const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))] : NaN; };
function ddown(pls) { let acc = 0, pico = 0, peor = 0; for (const p of pls) { acc += p; if (acc > pico) pico = acc; const d = acc - pico; if (d < peor) peor = d; } return peor; }

const filas = JSON.parse(readFileSync("scripts/dsem-filas.json", "utf8"));
filas.sort((a, b) => a.fecha.localeCompare(b.fecha));
const FEST = new Set(["2022-01-17","2022-02-21","2022-04-15","2022-05-30","2022-06-20","2022-07-04","2022-09-05","2022-11-24","2022-12-26",
"2023-01-02","2023-01-16","2023-02-20","2023-04-07","2023-05-29","2023-06-19","2023-07-04","2023-09-04","2023-11-23","2023-12-25",
"2024-01-01","2024-01-15","2024-02-19","2024-03-29","2024-05-27","2024-06-19","2024-07-04","2024-09-02","2024-11-28","2024-12-25",
"2025-01-01","2025-01-09","2025-01-20","2025-02-17","2025-04-18","2025-05-26","2025-06-19","2025-07-04","2025-09-01","2025-11-27","2025-12-25",
"2026-01-01","2026-01-19","2026-02-16","2026-04-03","2026-05-25","2026-06-19","2026-07-03","2026-09-07","2026-11-26","2026-12-25"]);
const iso = (d) => d.toISOString().slice(0, 10);
const SESIONES = [];
for (let d = new Date("2021-12-01T00:00:00Z"); iso(d) <= "2026-12-31"; d.setUTCDate(d.getUTCDate() + 1)) {
  const s = iso(d), w = d.getUTCDay(); if (w !== 0 && w !== 6 && !FEST.has(s)) SESIONES.push(s);
}
const POS = new Map(SESIONES.map((s, i) => [s, i]));
const tercerViernes = (a, m) => { let n = 0; for (let d = 1; d <= 31; d++) { const dt = new Date(Date.UTC(a, m - 1, d)); if (dt.getUTCMonth() !== m - 1) break; if (dt.getUTCDay() === 5 && ++n === 3) return iso(dt); } return null; };
for (const f of filas) {
  const d = new Date(f.fecha + "T00:00:00Z"), i = POS.get(f.fecha);
  const ant = SESIONES[i - 1], sig = SESIONES[i + 1];
  const ano = +f.fecha.slice(0, 4), mes = +f.fecha.slice(5, 7), dia = +f.fecha.slice(8, 10);
  const salto = (a, b) => (new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000;
  f.dow = d.getUTCDay(); f.mes = mes; f.ano = ano; f.semMes = Math.ceil(dia / 7); f.domCubo = Math.min(6, Math.ceil(dia / 5));
  f.vispFest = sig && salto(f.fecha, sig) > (f.dow === 5 ? 3 : 1) ? 1 : 0;
  f.postFest = ant && salto(ant, f.fecha) > (f.dow === 1 ? 3 : 1) ? 1 : 0;
  f.primeroMes = ant.slice(5, 7) !== f.fecha.slice(5, 7) ? 1 : 0;
  f.ultimoMes = sig.slice(5, 7) !== f.fecha.slice(5, 7) ? 1 : 0;
  let k = 0; while (SESIONES[i + k + 1] && SESIONES[i + k + 1].slice(0, 7) === f.fecha.slice(0, 7)) k++;
  f.posFin = k; f.ultimos2 = k <= 1 ? 1 : 0;
  const tv = tercerViernes(ano, mes), iTv = POS.get(tv);
  f.opex = f.fecha === tv ? 1 : 0; f.opexTrim = f.opex && [3,6,9,12].includes(mes) ? 1 : 0;
  f.dAOpex = iTv != null ? i - iTv : null;
  f.semOpex = f.dAOpex != null && f.dAOpex >= -4 && f.dAOpex <= 0 ? 1 : 0;
  f.finTrim = f.ultimoMes && [3,6,9,12].includes(mes) ? 1 : 0;
  f.periodo = f.fecha < "2024-01-01" ? "A" : "B";
}
radiografia(filas, ["pl", "credito", "sp11", "cierre", "ivAtm"], "dsem-filas");

const A = filas.filter((f) => f.periodo === "A"), B = filas.filter((f) => f.periodo === "B");
const DIAS = ["dom","LUN","MAR","MIE","JUE","VIE","sab"], MESES = ["","ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const FAM = [
  { id:"dow", cubo:(f)=>f.dow, et:(v)=>DIAS[v] },
  { id:"domCubo", cubo:(f)=>f.domCubo, et:(v)=>["","1-5","6-10","11-15","16-20","21-25","26-31"][v] },
  { id:"semMes", cubo:(f)=>f.semMes, et:(v)=>"sem"+v },
  { id:"mes", cubo:(f)=>f.mes, et:(v)=>MESES[v] },
  { id:"opex", cubo:(f)=>f.opex, et:()=>"OPEX", binaria:true },
  { id:"opexTrim", cubo:(f)=>f.opexTrim, et:()=>"trimestral", binaria:true },
  { id:"semOpex", cubo:(f)=>f.semOpex, et:()=>"semOPEX", binaria:true },
  { id:"vispFest", cubo:(f)=>f.vispFest, et:()=>"vispera", binaria:true },
  { id:"postFest", cubo:(f)=>f.postFest, et:()=>"postFest", binaria:true },
  { id:"primeroMes", cubo:(f)=>f.primeroMes, et:()=>"1o", binaria:true },
  { id:"ultimoMes", cubo:(f)=>f.ultimoMes, et:()=>"ULTIMO", binaria:true },
  { id:"ultimos2", cubo:(f)=>f.ultimos2, et:()=>"2ult", binaria:true },
  { id:"finTrim", cubo:(f)=>f.finTrim, et:()=>"finTrim", binaria:true },
];
function ev(base, filtro) {
  const serie = base.map((f) => (filtro(f) ? 0 : f.pl));
  const op = base.filter((f) => !filtro(f)).map((f) => f.pl);
  return { nOp: op.length, alAno: serie.reduce((a,b)=>a+b,0) / (base.length/DIAS_ANO), dd: ddown(serie),
           peor: op.length?Math.min(...op):0, p1: pct(serie,0.01), p5: pct(serie,0.05) };
}
function ranking(per, minN) {
  const base = media(per.map((f)=>f.pl)); const out=[];
  for (const fam of FAM) for (const v of (fam.binaria?[1]:[...new Set(per.map(fam.cubo))])) {
    const g = per.filter((f)=>fam.cubo(f)===v); if (g.length < minN) continue;
    out.push({ id: fam.id+"="+fam.et(v), fam, v, n:g.length, exceso: media(g.map((f)=>f.pl))-base });
  }
  return out.sort((a,b)=>a.exceso-b.exceso);
}
console.log("=".repeat(112));
console.log("1 · SELECCION CIEGA DE **UNA SOLA REGLA** — lo que un procedimiento sin conocer el otro periodo elegiria");
console.log("=".repeat(112));
for (const minN of [20, 30, 40, 55]) {
  for (const [nom, aj, pr, nomPr] of [["2022-2023", A, B, "2024-2026"], ["2024-2026", B, A, "2022-2023"]]) {
    const r = ranking(aj, minN);
    const top = r.slice(0, 5).map((x)=>x.id+"(n="+x.n+","+eur(x.exceso)+")").join("  ");
    const el = r[0];
    const filtro = (f) => el.fam.cubo(f) === el.v;
    const b0 = ev(pr, ()=>false), b1 = ev(pr, filtro);
    console.log("\n  minN="+minN+"  ajuste en "+nom+":  ELIGE -> "+el.id);
    console.log("     top5: "+top);
    console.log("     aplicado a "+nomPr+":  "+eur(b0.alAno)+"/año -> "+eur(b1.alAno)+"/año  ("+(b1.alAno>b0.alAno?"MEJORA":"EMPEORA")+" "+eur(Math.abs(b1.alAno-b0.alAno))+")  ·  racha "+eur(b0.dd)+" -> "+eur(b1.dd)+"  ·  p5 "+eur(b0.p5)+" -> "+eur(b1.p5));
  }
}
console.log("\n" + "=".repeat(112));
console.log("2 · EN QUE PUESTO QUEDA 'ultimo dia del mes' EN CADA PERIODO? (ranking ciego, n>=20)");
console.log("=".repeat(112));
for (const [nom, per] of [["2022-2023", A], ["2024-2026", B], ["TODO", filas]]) {
  const r = ranking(per, 20);
  const i = r.findIndex((x)=>x.fam.id==="ultimoMes");
  console.log("  "+nom.padEnd(12)+" puesto "+(i+1)+" de "+r.length+"   ·   los 5 peores: "+r.slice(0,5).map((x)=>x.id).join(" · "));
}
console.log("\n" + "=".repeat(112));
console.log("3 · LA REGLA PROPUESTA (saltarse el ultimo dia habil del mes), MEDIDA EN CADA PERIODO");
console.log("=".repeat(112));
const RU = (f)=>f.ultimoMes===1;
console.log("| periodo | $/año sin | $/año con | racha sin | racha con | peor dia sin | peor dia con | p5 sin | p5 con |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const [nom, g] of [["2022-2023",A],["2024-2026",B],["TODO",filas]]) {
  const a=ev(g,()=>false), b=ev(g,RU);
  console.log("| "+nom+" | "+eur(a.alAno)+" | "+eur(b.alAno)+" | "+eur(a.dd)+" | "+eur(b.dd)+" | "+eur(a.peor)+" | "+eur(b.peor)+" | "+eur(a.p5)+" | "+eur(b.p5)+" |");
}
console.log("\n" + "=".repeat(112));
console.log("4 · CONCENTRACION: de que dias vive el efecto?");
console.log("=".repeat(112));
const ult = filas.filter(RU).sort((a,b)=>a.pl-b.pl);
const rest = filas.filter((f)=>!RU(f));
console.log("  n="+ult.length+"  media "+eur(media(ult.map(f=>f.pl)))+"  mediana "+eur(pct(ult.map(f=>f.pl),0.5))+"  resto media "+eur(media(rest.map(f=>f.pl)))+" mediana "+eur(pct(rest.map(f=>f.pl),0.5)));
console.log("  los 5 peores ultimos-dias: "+ult.slice(0,5).map(f=>f.fecha+" "+eur(f.pl)).join(" · "));
for (const k of [1,2,3,5]) {
  const sinK = ult.slice(k);
  console.log("  quitando los "+k+" peores -> media "+eur(media(sinK.map(f=>f.pl)))+"  dif vs resto "+eur(media(sinK.map(f=>f.pl))-media(rest.map(f=>f.pl)))+"  t="+tWelch(sinK.map(f=>f.pl), rest.map(f=>f.pl)).toFixed(2));
}
console.log("\n  año a año:");
for (const y of [2022,2023,2024,2025,2026]) {
  const g=filas.filter(f=>f.ano===y&&RU(f)), r=filas.filter(f=>f.ano===y&&!RU(f));
  console.log("    "+y+"  n="+g.length+"  media "+eur(media(g.map(f=>f.pl))).padStart(8)+"  resto "+eur(media(r.map(f=>f.pl))).padStart(7)+"  dif "+eur(media(g.map(f=>f.pl))-media(r.map(f=>f.pl))).padStart(8)+"  "+(media(g.map(f=>f.pl))<media(r.map(f=>f.pl))?"MALO":"bueno"));
}
console.log("\n" + "=".repeat(112));
console.log("5 · CONTROL: los OTROS candidatos que tambien repiten signo, medidos igual");
console.log("=".repeat(112));
const CAND = [["ultimoMes",(f)=>f.ultimoMes===1],["ultimos2",(f)=>f.ultimos2===1],["JUEVES",(f)=>f.dow===4],["MIERCOLES",(f)=>f.dow===3],
  ["mes=ene",(f)=>f.mes===1],["mes=mar",(f)=>f.mes===3],["mes=abr",(f)=>f.mes===4],["domCubo 26-31",(f)=>f.domCubo===6],["domCubo 6-10",(f)=>f.domCubo===2],["domCubo 21-25",(f)=>f.domCubo===5]];
console.log("| regla | A base->regla | B base->regla | mejora A | mejora B | mejora en las DOS |");
console.log("|---|---|---|---|---|---|");
for (const [nom, fn] of CAND) {
  const aA=ev(A,()=>false), bA=ev(A,fn), aB=ev(B,()=>false), bB=ev(B,fn);
  const dA=bA.alAno-aA.alAno, dB=bB.alAno-aB.alAno;
  console.log("| "+nom+" | "+eur(aA.alAno)+"->"+eur(bA.alAno)+" | "+eur(aB.alAno)+"->"+eur(bB.alAno)+" | "+eur(dA)+" | "+eur(dB)+" | "+(dA>0&&dB>0?"SI":"no")+" |");
}
console.log("\n  -> si TODAS las candidatas 'mejoran en las dos', la prueba no distingue nada.");
