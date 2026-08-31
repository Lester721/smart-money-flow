// ¿La tabla mágica es un detector de CRASH? Tres preguntas, tres medidas.
// 1) ¿El resultado de cada señal lo explica el movimiento del subyacente en los 15 días?
// 2) ¿Las señales que ganan están en ventanas de caída y las que pierden no?
// 3) LO IMPORTANTE: ¿un RACIMO de señales PRECEDE una caída? (eso sería predictivo)
import { cargar, resumir, simular } from "./consultar.mjs";
import { abrir } from "./datos.mjs";
const O={objetivo:1.50,suelo:0.50,salirEnDias:15};
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
const memo=new Map();
const spotDe=(tk,d)=>{const k=tk+d; if(memo.has(k))return memo.get(k);
  const c=cad.leer(tk,d); const s=c?spotOk(c,d):null; memo.set(k,s); return s;};
const med=(v)=>v.length?v.slice().sort((a,b)=>a-b)[Math.floor(v.length/2)]:null;

const D={}; for(const [y,M] of AÑOS) D[y]=cargar(M).filter(MAG);
const TODO=Object.values(D).flat();

// ── movimiento del subyacente durante la tenencia ──
console.log(`\n  ═══ 1. ¿QUÉ HIZO EL SUBYACENTE MIENTRAS TENÍAMOS LA OPCIÓN? ═══\n`);
for(const f of TODO){
  const r=simular(f,O); f._r=r;
  const s0=f.spot, s1=spotDe(f.tk,r.dSal);
  f._mv=(s0>0&&s1>0)?s1/s0-1:null;
}
console.log(`  ${"año".padEnd(6)} ${"n".padStart(4)} ${"mov. del subyacente".padStart(20)} ${"mov. si GANA".padStart(14)} ${"mov. si PIERDE".padStart(15)} ${"dinero".padStart(12)}`);
for(const [y] of AÑOS){
  const L=D[y].filter(f=>f._mv!=null); if(!L.length)continue;
  const g=L.filter(f=>f._r.mult>1), p=L.filter(f=>f._r.mult<=1);
  const P=(v)=>v==null?"—":((v>=0?"+":"")+(100*v).toFixed(1)+"%");
  console.log(`  ${y.padEnd(6)} ${String(L.length).padStart(4)} ${P(med(L.map(f=>f._mv))).padStart(20)} ${P(med(g.map(f=>f._mv))).padStart(14)} ${P(med(p.map(f=>f._mv))).padStart(15)} ${$(resumir(D[y],O).neto).padStart(12)}`);
}

// ── ventanas de caída ──
console.log(`\n  ═══ 2. ¿GANAN SÓLO EN VENTANAS DE CAÍDA? (SPY en los 15 días) ═══\n`);
const spyDias=cad.dias("SPY");
function spyMov(d,n){ const i=spyDias.findIndex(x=>x>=d); if(i<0||i+n>=spyDias.length) return null;
  const a=spotDe("SPY",spyDias[i]), b=spotDe("SPY",spyDias[i+n]); return (a>0&&b>0)?b/a-1:null; }
for(const f of TODO) f._spy=spyMov(f.dC,15);
const TR=[[-99,-0.05,"SPY cae más de 5%"],[-0.05,-0.02,"SPY cae 2% a 5%"],[-0.02,0.02,"SPY plano (±2%)"],[0.02,99,"SPY sube más de 2%"]];
console.log(`  ${"ventana".padEnd(22)} ${"n".padStart(4)} ${"gana".padStart(6)} ${"ratio".padStart(7)} ${"dinero".padStart(12)}`);
for(const [a,b,nom] of TR){
  const L=TODO.filter(f=>f._spy!=null&&f._spy>=a&&f._spy<b); if(!L.length){console.log(`  ${nom.padEnd(22)}    0`);continue;}
  const r=resumir(L,O);
  console.log(`  ${nom.padEnd(22)} ${String(r.n).padStart(4)} ${String(r.gana).padStart(6)} ${(r.r===Infinity?"∞":r.r.toFixed(2)).padStart(7)} ${$(r.neto).padStart(12)}`);
}

// ── 3. ¿el racimo PRECEDE la caída? ──
console.log(`\n  ═══ 3. ¿UN RACIMO DE SEÑALES AVISA DE UNA CAÍDA? — lo que valdría dinero ═══\n`);
const porDia={}; for(const f of TODO) (porDia[f.dC]??=[]).push(f);
const dias=Object.keys(porDia).sort();
const base=[]; for(let i=0;i+15<spyDias.length;i+=1){ const m=spyMov(spyDias[i],15); if(m!=null) base.push(m); }
console.log(`  listón: los ${base.length} tramos de 15 días de SPY con datos · mediana ${((100*med(base))>=0?"+":"")+(100*med(base)).toFixed(2)}% · cae en el ${(100*base.filter(x=>x<0).length/base.length).toFixed(0)}% de ellos\n`);
console.log(`  ${"racimo".padEnd(24)} ${"días".padStart(6)} ${"SPY 15d después".padStart(17)} ${"% que caen".padStart(11)} ${"contra el listón".padStart(17)}`);
for(const N of [1,2,3,5,8,12,16]){
  const ds=dias.filter(d=>porDia[d].length>=N);
  const mv=ds.map(d=>spyMov(d,15)).filter(x=>x!=null);
  if(!mv.length){console.log(`  ${(N+" o más señales el mismo día").padEnd(24)} ${"0".padStart(6)}`);continue;}
  const m=med(mv), cae=100*mv.filter(x=>x<0).length/mv.length;
  console.log(`  ${(N+" o más el mismo día").padEnd(24)} ${String(mv.length).padStart(6)} ${(((100*m)>=0?"+":"")+(100*m).toFixed(2)+"%").padStart(17)} ${(cae.toFixed(0)+"%").padStart(11)} ${(((100*(m-med(base)))>=0?"+":"")+(100*(m-med(base))).toFixed(2)+" pts").padStart(17)}`);
}
console.log("");
