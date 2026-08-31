// EL ESTADO DE LA TABLA MÁGICA, TAL COMO ESTÁ GRABADA HOY (2026-08-26).
//   cuenta grande  → techo 50% de profundidad + acción bajo su media de 50 días + salida al 8%
//   cuenta Lester  → en crudo, soltar a los 15 días
// Seis años, precios reales, peaje dentro.
import { cargar, resumir, cuenta, simular } from "./consultar.mjs";
import { abrir } from "./datos.mjs";
const $=(x)=>(x<0?"−$":"$")+Math.abs(Math.round(x)).toLocaleString("en-US");
const MAG=(f)=>f.dentro&&f.dte>=5&&f.ask*100>=10000&&f.hora>="14:00"&&f.vsOI>=12;
const yr=(y)=>[...Array(12)].map((_,i)=>y+String(i+1).padStart(2,"0"));
const AÑOS=[["2021",yr("2021")],["2022",yr("2022")],["2023",yr("2023")],["2024",yr("2024")],
            ["2025",yr("2025")],["2026",["202601","202602","202603","202604","202605","202606","202607","202608"]]];
const cad=abrir("cadenas",{callado:true});
const ms=(d)=>Date.parse(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T00:00:00Z`);
const dteDe=(a,b)=>Math.round((ms(b)-ms(a))/86400000);
function spotOk(c,hoy){let e0=null,md=Infinity;
  for(const e of Object.keys(c)){const d=dteDe(hoy,e); if(d<1)continue; if(d<md){md=d;e0=e;}}
  if(!e0)return null; const g=c[e0]; let K=null,dm=Infinity;
  for(const cl of Object.keys(g)){ if(cl.slice(-1)!=="C")continue;
    const k=Number(cl.slice(0,-2)); const p=g[`${k}|P`]; if(!p)continue;
    const d=Math.abs((g[cl][0]+g[cl][1])/2-(p[0]+p[1])/2); if(d<dm){dm=d;K=k;}}
  if(K==null)return null; const C=g[`${K}|C`],P=g[`${K}|P`];
  const s=K+(C[0]+C[1])/2-(P[0]+P[1])/2; return s>0?s:null;}
const SM=new Map();
const spotDe=(tk,d)=>{const k=tk+d; if(SM.has(k))return SM.get(k);
  const c=cad.leer(tk,d); const s=c?spotOk(c,d):null; SM.set(k,s); return s;};
function salir8(f,{tope=60}={}){
  const coste=f.ask; let n=0,ult=null;
  for(const [d,bid] of f.camino){
    n++; const m=bid/coste; ult={mult:m,dSal:d,dias:n};
    if(m>=1.50) return {mult:1.50,dSal:d,dias:n};
    if(m<=0.50) return {mult:0.50,dSal:d,dias:n};
    const s=spotDe(f.tk,d);
    if(s!=null){ const mov=f.l==="P"?(f.spot-s)/f.spot:(s-f.spot)/f.spot;
      if(mov>=0.08) return {mult:m,dSal:d,dias:n}; }
    if(n>=tope) return {mult:m,dSal:d,dias:n};
  }
  return ult;
}
const con8=(L)=>L.map(f=>{const r=salir8(f); return {...f,camino:[[r.dSal,r.mult*f.ask,r.mult*f.ask]]};});
const O0={objetivo:1.50,suelo:0.50};
const O15={objetivo:1.50,suelo:0.50,salirEnDias:15};

const D={};
for(const [y,M] of AÑOS){ D[y]=cargar(M).filter(MAG);
  for(const f of D[y]){ const ds=cad.dias(f.tk); const i=ds.indexOf(f.dC);
    if(i<50){f.sm=null;continue;}
    const prev=ds.slice(i-50,i).map(d=>spotDe(f.tk,d)).filter(x=>x!=null);
    f.sm=prev.length<40?null:f.spot/(prev.reduce((a,b)=>a+b,0)/prev.length)-1; }}
const GRANDE=(f)=>f.prof<=0.50&&f.sm!=null&&f.sm<0;

console.log(`\n  ═══ AUDITORÍA ═══\n`);
const tot=Object.values(D).flat();
console.log(`  señales de la tabla mágica ...... ${tot.length}`);
console.log(`  pasan el filtro de cuenta grande  ${tot.filter(GRANDE).length}`);
let mal=0; for(const [y] of AÑOS) for(const f of con8(D[y].filter(GRANDE))) if(f.camino[0][0]<=f.dC) mal++;
console.log(`  salidas anteriores a la compra .. ${mal} ${mal?"⚠":"✓ ninguna"}`);
console.log(`  con media calculable ............ ${tot.filter(f=>f.sm!=null).length} de ${tot.length}`);

console.log(`\n  ═══ CUENTA GRANDE — techo 50% + bajo la media + salida al 8% ═══\n`);
console.log(`  ${"año".padEnd(6)} ${"señales".padStart(8)} ${"gana".padStart(6)} ${"pierde".padStart(7)} ${"ratio".padStart(7)} ${"dinero".padStart(12)} ${"capital".padStart(12)} ${"%".padStart(6)} ${"acumulado".padStart(12)}`);
let ac=0;
for(const [y] of AÑOS){
  const L=con8(D[y].filter(GRANDE));
  if(!L.length){console.log(`  ${y.padEnd(6)} ${"0".padStart(8)}   sin señales`);continue;}
  const r=resumir(L,O0); ac+=r.neto;
  console.log(`  ${y.padEnd(6)} ${String(r.n).padStart(8)} ${String(r.gana).padStart(6)} ${String(r.pierde).padStart(7)} ${(r.r===Infinity?"∞":r.r.toFixed(2)).padStart(7)} ${$(r.neto).padStart(12)} ${$(r.pico).padStart(12)} ${((100*r.neto/r.pico).toFixed(0)+"%").padStart(6)} ${$(ac).padStart(12)}`);
}
const TG=con8(Object.values(D).flat().filter(GRANDE)); const rg=resumir(TG,O0);
console.log(`  ${"─".repeat(90)}`);
console.log(`  ${"TOTAL".padEnd(6)} ${String(rg.n).padStart(8)} ${String(rg.gana).padStart(6)} ${String(rg.pierde).padStart(7)} ${rg.r.toFixed(2).padStart(7)} ${$(rg.neto).padStart(12)} ${$(rg.pico).padStart(12)} ${((100*rg.neto/rg.pico).toFixed(0)+"%").padStart(6)}`);

console.log(`\n  ═══ TU CUENTA — en crudo, soltar a los 15 días, $60,000 cada año ═══\n`);
console.log(`  ${"año".padEnd(6)} ${"ops".padStart(5)} ${"gana".padStart(6)} ${"pierde".padStart(7)} ${"dinero".padStart(12)} ${"sobre $60,000".padStart(14)}`);
let ac2=0;
for(const [y] of AÑOS){
  const q=cuenta(D[y],{capital:60000,porOp:15000,maxAbiertas:4,...O15}); ac2+=q.ganancia;
  console.log(`  ${y.padEnd(6)} ${String(q.tomadas.length).padStart(5)} ${String(q.gana).padStart(6)} ${String(q.pierde).padStart(7)} ${$(q.ganancia).padStart(12)} ${((100*q.ganancia/60000).toFixed(0)+"%").padStart(14)}`);
}
console.log(`  ${"─".repeat(54)}`);
console.log(`  ${"TOTAL".padEnd(6)} ${"".padStart(5)} ${"".padStart(6)} ${"".padStart(7)} ${$(ac2).padStart(12)}`);

console.log(`\n  ═══ Y LO QUE DE VERDAD TE PASARÍA — una sola cuenta, los seis años seguidos ═══\n`);
const TODO=Object.values(D).flat().sort((a,b)=>a.dC.localeCompare(b.dC));
const q=cuenta(TODO,{capital:60000,porOp:15000,maxAbiertas:4,...O15});
console.log(`  empiezas con ................ $60,000`);
console.log(`  acabas con .................. ${$(q.final)}`);
console.log(`  ganancia .................... ${$(q.ganancia)}  (${q.pct.toFixed(0)}% en seis años · ${(100*(Math.pow(q.final/60000,1/5.6)-1)).toFixed(1)}% al año)`);
console.log(`  operaciones ................. ${q.tomadas.length}  (${q.gana} ganan · ${q.pierde} pierden)`);
console.log(`  lo más bajo que llegó la caja ${$(q.minCaja)}`);
console.log(`\n  el listón: $60,000 en SPY los mismos seis años ...`);
const dS=cad.dias("SPY").filter(d=>d>="20210101"&&d<="20260819");
const a=spotDe("SPY",dS[0]), b=spotDe("SPY",dS[dS.length-1]);
console.log(`  $60,000 → ${$(60000*b/a)}  (${(100*(b/a-1)).toFixed(0)}% · ${(100*(Math.pow(b/a,1/5.6)-1)).toFixed(1)}% al año, sin contar dividendos)\n`);
