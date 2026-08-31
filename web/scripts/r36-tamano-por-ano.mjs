// ¿El cambio de tamaño cambia los resultados AÑO POR AÑO?
// Se compara el 25% por posición (lo que dice la tabla hoy) contra el 5%, en una cuenta de
// $300,000 — que es la mínima con la que el 5% compra al menos un contrato.
// Dos vistas: año a año (cada enero con la caja que traía) y el acumulado real.
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
function salir8(f){ const coste=f.ask; let n=0,ult=null;
  for(const [d,bid] of f.camino){ n++; const m=bid/coste; ult={mult:m,dSal:d};
    if(m>=1.50) return {mult:1.50,dSal:d}; if(m<=0.50) return {mult:0.50,dSal:d};
    const s=spotDe(f.tk,d);
    if(s!=null){ const mov=f.l==="P"?(f.spot-s)/f.spot:(s-f.spot)/f.spot; if(mov>=0.08) return {mult:m,dSal:d}; }
    if(n>=60) return {mult:m,dSal:d}; }
  return ult; }
const con8=(L)=>L.map(f=>{const r=salir8(f); return {...f,camino:[[r.dSal,r.mult*f.ask,r.mult*f.ask]]};});
const O15={objetivo:1.50,suelo:0.50,salirEnDias:15}, O0={objetivo:1.50,suelo:0.50};
const D={};
for(const [y,M] of AÑOS){ D[y]=cargar(M).filter(MAG);
  for(const f of D[y]){ const ds=cad.dias(f.tk); const i=ds.indexOf(f.dC);
    if(i<50){f.sm=null;continue;}
    const prev=ds.slice(i-50,i).map(d=>spotDe(f.tk,d)).filter(x=>x!=null);
    f.sm=prev.length<40?null:f.spot/(prev.reduce((a,b)=>a+b,0)/prev.length)-1; }}
const T50=(f)=>f.prof<=0.50, MED=(f)=>f.sm!=null&&f.sm<0;
const FIL=(y)=>con8(D[y].filter(f=>T50(f)&&MED(f)));
const CRU=(y)=>D[y];

function porAno(nom,sel,op,cap,pct){
  const porOp=cap*pct, maxAb=Math.round(0.9/pct);
  console.log(`\n  ── ${nom} · $${(cap/1000).toFixed(0)}k · ${(100*pct).toFixed(0)}% por posición (${$(porOp)}) · ${maxAb} abiertas ──\n`);
  console.log(`  ${"año".padEnd(6)} ${"ops".padStart(5)} ${"gana".padStart(6)} ${"pierde".padStart(7)} ${"dinero".padStart(13)} ${"% del año".padStart(11)} ${"caja mín".padStart(12)}`);
  let t=0;
  for(const [y] of AÑOS){
    const L=sel(y); if(!L.length){console.log(`  ${y.padEnd(6)}   sin señales`);continue;}
    const q=cuenta(L,{capital:cap,porOp,maxAbiertas:maxAb,...op}); t+=q.ganancia;
    console.log(`  ${y.padEnd(6)} ${String(q.tomadas.length).padStart(5)} ${String(q.gana).padStart(6)} ${String(q.pierde).padStart(7)} ${$(q.ganancia).padStart(13)} ${((100*q.ganancia/cap).toFixed(0)+"%").padStart(11)} ${$(q.minCaja).padStart(12)}`);
  }
  // continua
  const TODO=AÑOS.flatMap(([y])=>sel(y)).sort((a,b)=>a.dC.localeCompare(b.dC));
  const q=cuenta(TODO,{capital:cap,porOp,maxAbiertas:maxAb,...op});
  console.log(`  ${"─".repeat(66)}`);
  console.log(`  suma de los años sueltos: ${$(t)}   ·   CUENTA CONTINUA: ${$(q.final)} (${$(q.ganancia)}, ${(100*(Math.pow(Math.max(q.final,1)/cap,1/5.6)-1)).toFixed(1)}% al año, caja mín ${$(q.minCaja)})`);
}
console.log(`\n  ═══ LA REGLA FILTRADA (techo 50% + media + salida 8%) ═══`);
porAno("como dice la tabla hoy",FIL,O0,300000,0.25);
porAno("con el cambio",FIL,O0,300000,0.05);
console.log(`\n\n  ═══ EN CRUDO — por si el tamaño rescata la versión sin filtro ═══`);
porAno("como dice la tabla hoy",CRU,O15,300000,0.25);
porAno("con el cambio",CRU,O15,300000,0.05);
console.log(`\n  (el listón: SPY hace +14.0% al año en el mismo período)\n`);
