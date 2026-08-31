// ¿DÓNDE DEBE ESTAR EL STOP? — con el tamaño nuevo (5% por posición).
// El stop del 50% (suelo: 0.50) YA estaba en todas las mediciones. Aquí se mueve, y además se
// prueba un stop sobre LA ACCIÓN en vez de sobre la opción.
// Regla: techo 50% + media, salida cuando la acción se mueva 8% a favor, tope 60 días.
import { cargar, cuenta, resumir } from "./consultar.mjs";
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
/** Camina en orden. suelo = stop sobre la OPCIÓN. stopAccion = stop sobre LA ACCIÓN. */
function salir(f,{suelo=0.50,stopAccion=null,objetivoAccion=0.08,tope=60}={}){
  const coste=f.ask; let n=0,ult=null;
  for(const [d,bid] of f.camino){
    n++; const m=bid/coste; ult={mult:m,dSal:d,por:"tope"};
    if(m>=1.50) return {mult:1.50,dSal:d,por:"objetivo"};
    if(suelo!=null&&m<=suelo) return {mult:suelo,dSal:d,por:"stop"};
    const s=spotDe(f.tk,d);
    if(s!=null){ const mov=f.l==="P"?(f.spot-s)/f.spot:(s-f.spot)/f.spot;
      if(mov>=objetivoAccion) return {mult:m,dSal:d,por:"acción"};
      if(stopAccion!=null&&mov<=-stopAccion) return {mult:m,dSal:d,por:"stopAcción"}; }
    if(n>=tope) return {mult:m,dSal:d,por:"tope"};
  }
  return ult;
}
const con=(L,op)=>L.map(f=>{const r=salir(f,op); return {...f,camino:[[r.dSal,r.mult*f.ask,r.mult*f.ask]],_por:r.por};});
const O0={objetivo:1.50,suelo:0.50};
const D={};
for(const [y,M] of AÑOS){ D[y]=cargar(M).filter(MAG);
  for(const f of D[y]){ const ds=cad.dias(f.tk); const i=ds.indexOf(f.dC);
    if(i<50){f.sm=null;continue;}
    const prev=ds.slice(i-50,i).map(d=>spotDe(f.tk,d)).filter(x=>x!=null);
    f.sm=prev.length<40?null:f.spot/(prev.reduce((a,b)=>a+b,0)/prev.length)-1; }}
const FIL=(y)=>D[y].filter(f=>f.prof<=0.50&&f.sm!=null&&f.sm<0);
const CAP=300000, POR=15000, AB=18;
function linea(nom,op){
  const cel=[]; let sum=0;
  for(const [y] of AÑOS){
    const L=con(FIL(y),op); if(!L.length){cel.push("—".padStart(12));continue;}
    const q=cuenta(L,{capital:CAP,porOp:POR,maxAbiertas:AB,...O0}); sum+=q.ganancia;
    cel.push($(q.ganancia).padStart(12));
  }
  const TODO=con(AÑOS.flatMap(([y])=>FIL(y)),op).sort((a,b)=>a.dC.localeCompare(b.dC));
  const q=cuenta(TODO,{capital:CAP,porOp:POR,maxAbiertas:AB,...O0});
  const r=resumir(TODO,O0);
  const an=100*(Math.pow(Math.max(q.final,1)/CAP,1/5.6)-1);
  console.log(`  ${nom.padEnd(28)} ${cel.join("")} ${$(q.final).padStart(12)} ${(an.toFixed(1)+"%").padStart(8)} ${r.r.toFixed(2).padStart(6)} ${$(q.minCaja).padStart(11)}`);
}
console.log(`\n  ═══ MOVER EL STOP DE LA OPCIÓN — cuenta de $300,000 · 5% por posición ═══\n`);
console.log(`  ${"".padEnd(28)} ${AÑOS.map(([y])=>y.padStart(12)).join("")} ${"acaba con".padStart(12)} ${"al año".padStart(8)} ${"ratio".padStart(6)} ${"caja mín".padStart(11)}`);
linea("SIN stop",{suelo:null});
linea("stop al −30% (0.70x)",{suelo:0.70});
linea("stop al −40% (0.60x)",{suelo:0.60});
linea("stop al −50% (0.50x) ← el que hay",{suelo:0.50});
linea("stop al −60% (0.40x)",{suelo:0.40});
linea("stop al −70% (0.30x)",{suelo:0.30});
console.log(`\n  ═══ Y UN STOP SOBRE LA ACCIÓN (además del 50% de la opción) ═══\n`);
console.log(`  ${"".padEnd(28)} ${AÑOS.map(([y])=>y.padStart(12)).join("")} ${"acaba con".padStart(12)} ${"al año".padStart(8)} ${"ratio".padStart(6)} ${"caja mín".padStart(11)}`);
linea("sin stop de acción",{suelo:0.50});
linea("la acción va 2% en contra",{suelo:0.50,stopAccion:0.02});
linea("la acción va 3% en contra",{suelo:0.50,stopAccion:0.03});
linea("la acción va 5% en contra",{suelo:0.50,stopAccion:0.05});
console.log(`\n  ═══ ¿POR QUÉ SALE CADA OPERACIÓN? (con el stop al 50%) ═══\n`);
const T=con(AÑOS.flatMap(([y])=>FIL(y)),{suelo:0.50});
const por={}; for(const f of T) por[f._por]=(por[f._por]??0)+1;
console.log(`  ${Object.entries(por).map(([k,v])=>`${k}: ${v}`).join("  ·  ")}   (de ${T.length})`);
console.log(`\n  (el listón: SPY hace +14.0% al año)\n`);
