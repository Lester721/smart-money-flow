// REFUTACION 3 · cuantos cubos del calendario "sobreviven al cruce" con el criterio del informe.
import { readFileSync } from "node:fs";
const DIAS_ANO = 252;
const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
function ddown(pls) { let acc=0,pico=0,peor=0; for (const p of pls){acc+=p; if(acc>pico)pico=acc; const d=acc-pico; if(d<peor)peor=d;} return peor; }
const filas = JSON.parse(readFileSync("scripts/dsem-filas.json", "utf8"));
filas.sort((a,b)=>a.fecha.localeCompare(b.fecha));
const FEST = new Set(["2022-01-17","2022-02-21","2022-04-15","2022-05-30","2022-06-20","2022-07-04","2022-09-05","2022-11-24","2022-12-26",
"2023-01-02","2023-01-16","2023-02-20","2023-04-07","2023-05-29","2023-06-19","2023-07-04","2023-09-04","2023-11-23","2023-12-25",
"2024-01-01","2024-01-15","2024-02-19","2024-03-29","2024-05-27","2024-06-19","2024-07-04","2024-09-02","2024-11-28","2024-12-25",
"2025-01-01","2025-01-09","2025-01-20","2025-02-17","2025-04-18","2025-05-26","2025-06-19","2025-07-04","2025-09-01","2025-11-27","2025-12-25",
"2026-01-01","2026-01-19","2026-02-16","2026-04-03","2026-05-25","2026-06-19","2026-07-03","2026-09-07","2026-11-26","2026-12-25"]);
const iso=(d)=>d.toISOString().slice(0,10); const SESIONES=[];
for(let d=new Date("2021-12-01T00:00:00Z"); iso(d)<="2026-12-31"; d.setUTCDate(d.getUTCDate()+1)){const s=iso(d),w=d.getUTCDay(); if(w!==0&&w!==6&&!FEST.has(s))SESIONES.push(s);}
const POS=new Map(SESIONES.map((s,i)=>[s,i]));
const tercerViernes=(a,m)=>{let n=0;for(let d=1;d<=31;d++){const dt=new Date(Date.UTC(a,m-1,d));if(dt.getUTCMonth()!==m-1)break;if(dt.getUTCDay()===5&&++n===3)return iso(dt);}return null;};
for(const f of filas){const d=new Date(f.fecha+"T00:00:00Z"),i=POS.get(f.fecha),ant=SESIONES[i-1],sig=SESIONES[i+1];
 const ano=+f.fecha.slice(0,4),mes=+f.fecha.slice(5,7),dia=+f.fecha.slice(8,10);
 const salto=(a,b)=>(new Date(b+"T00:00:00Z")-new Date(a+"T00:00:00Z"))/86400000;
 f.dow=d.getUTCDay();f.mes=mes;f.ano=ano;f.semMes=Math.ceil(dia/7);f.domCubo=Math.min(6,Math.ceil(dia/5));
 f.vispFest=sig&&salto(f.fecha,sig)>(f.dow===5?3:1)?1:0; f.postFest=ant&&salto(ant,f.fecha)>(f.dow===1?3:1)?1:0;
 f.primeroMes=ant.slice(5,7)!==f.fecha.slice(5,7)?1:0; f.ultimoMes=sig.slice(5,7)!==f.fecha.slice(5,7)?1:0;
 let k=0; while(SESIONES[i+k+1]&&SESIONES[i+k+1].slice(0,7)===f.fecha.slice(0,7))k++; f.posFin=k; f.ultimos2=k<=1?1:0;
 const tv=tercerViernes(ano,mes),iTv=POS.get(tv); f.opex=f.fecha===tv?1:0; f.opexTrim=f.opex&&[3,6,9,12].includes(mes)?1:0;
 f.dAOpex=iTv!=null?i-iTv:null; f.semOpex=f.dAOpex!=null&&f.dAOpex>=-4&&f.dAOpex<=0?1:0;
 f.finTrim=f.ultimoMes&&[3,6,9,12].includes(mes)?1:0; f.periodo=f.fecha<"2024-01-01"?"A":"B";}
const A=filas.filter(f=>f.periodo==="A"), B=filas.filter(f=>f.periodo==="B");
const DIAS=["dom","LUN","MAR","MIE","JUE","VIE","sab"],MESES=["","ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const FAM=[{id:"dow",cubo:f=>f.dow,et:v=>DIAS[v]},{id:"domCubo",cubo:f=>f.domCubo,et:v=>["","1-5","6-10","11-15","16-20","21-25","26-31"][v]},
 {id:"semMes",cubo:f=>f.semMes,et:v=>"sem"+v},{id:"mes",cubo:f=>f.mes,et:v=>MESES[v]},
 {id:"opex",cubo:f=>f.opex,et:()=>"OPEX",binaria:true},{id:"opexTrim",cubo:f=>f.opexTrim,et:()=>"trim",binaria:true},
 {id:"semOpex",cubo:f=>f.semOpex,et:()=>"semOPEX",binaria:true},{id:"vispFest",cubo:f=>f.vispFest,et:()=>"vispera",binaria:true},
 {id:"postFest",cubo:f=>f.postFest,et:()=>"postFest",binaria:true},{id:"primeroMes",cubo:f=>f.primeroMes,et:()=>"1o",binaria:true},
 {id:"ultimoMes",cubo:f=>f.ultimoMes,et:()=>"ULTIMO",binaria:true},{id:"ultimos2",cubo:f=>f.ultimos2,et:()=>"2ult",binaria:true},
 {id:"finTrim",cubo:f=>f.finTrim,et:()=>"finTrim",binaria:true}];
const ev=(base,fn)=>{const s=base.map(f=>fn(f)?0:f.pl); return {alAno:s.reduce((a,b)=>a+b,0)/(base.length/DIAS_ANO), dd:ddown(s)};};
const bA=ev(A,()=>false), bB=ev(B,()=>false);
const todos=[];
for(const fam of FAM) for(const v of (fam.binaria?[1]:[...new Set(filas.map(fam.cubo))])){
  const nA=A.filter(f=>fam.cubo(f)===v).length, nB=B.filter(f=>fam.cubo(f)===v).length;
  if(nA<8||nB<8) continue;
  const fn=f=>fam.cubo(f)===v;
  const rA=ev(A,fn), rB=ev(B,fn);
  todos.push({id:fam.id+"="+fam.et(v), nA, nB, dA:rA.alAno-bA.alAno, dB:rB.alAno-bB.alAno,
    ddA:Math.abs(bA.dd)-Math.abs(rA.dd), ddB:Math.abs(bB.dd)-Math.abs(rB.dd)});
}
const pasan = todos.filter(x=>x.dA>0&&x.dB>0);
const pasanTodo = todos.filter(x=>x.dA>0&&x.dB>0&&x.ddA>0&&x.ddB>0);
console.log("=".repeat(112));
console.log("CUANTOS CUBOS DEL CALENDARIO PASAN EL CRITERIO DEL INFORME ('mejora en las dos direcciones')");
console.log("=".repeat(112));
console.log("  cubos evaluados: "+todos.length);
console.log("  pasan 'mejora $/año en A Y en B':            "+pasan.length+"  ("+(pasan.length/todos.length*100).toFixed(0)+"%)");
console.log("  pasan ademas 'baja la racha en A Y en B':    "+pasanTodo.length+"  ("+(pasanTodo.length/todos.length*100).toFixed(0)+"%)");
console.log("\n  los que pasan, ordenados por lo que suman en las dos (el informe eligio el 'ultimoMes'):");
pasanTodo.sort((a,b)=>(b.dA+b.dB)-(a.dA+a.dB));
for(const x of pasanTodo) console.log("    "+x.id.padEnd(22)+" nA="+String(x.nA).padStart(3)+" nB="+String(x.nB).padStart(3)+"   +A "+eur(x.dA).padStart(9)+"  +B "+eur(x.dB).padStart(9)+"   suma "+eur(x.dA+x.dB).padStart(9)+(x.id==="ultimoMes=ULTIMO"?"   <<< EL DEL INFORME":""));
