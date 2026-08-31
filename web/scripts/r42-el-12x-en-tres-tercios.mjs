// EL 12x SOBRE LA ACCIÓN — ¿aguanta partido en tres?
// +0,29% a 5 días con t=3,0 sobre 2.450 golpes. Antes de llamarlo nada: tres tercios de tiempo,
// ticker por ticker, y un control con golpes que NO pasan el 12x el mismo día.
import { cargar } from "./consultar.mjs";
import { abrir } from "./datos.mjs";
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
function mov(tk,d,n){ const ds=cad.dias(tk); const i=ds.indexOf(d); if(i<0||i+n>=ds.length) return null;
  let prev=spotDe(tk,ds[i]); if(!(prev>0)) return null; const a=prev;
  for(let k=i+1;k<=i+n;k++){ const s=spotDe(tk,ds[k]); if(!(s>0)) return null;
    if(Math.abs(s/prev-1)>0.25) return null; prev=s; }
  return prev/a-1; }
const HOR=[3,5,10,15];
const mediaDe=(v)=>v.length?v.reduce((a,b)=>a+b,0)/v.length:null;
const t_de=(v)=>{ if(v.length<3)return null; const m=mediaDe(v);
  const s=Math.sqrt(v.reduce((a,x)=>a+(x-m)*(x-m),0)/(v.length-1)); return s?m/(s/Math.sqrt(v.length)):null; };
const TK=["AAPL","AMD","META","MSFT","NVDA","QQQ","SPY","TSLA"];
const BASE={};
for(const tk of TK){ const ds=cad.dias(tk).filter(d=>d>="20210101"&&d<="20260819"); BASE[tk]={};
  for(const n of HOR){ const v=[]; for(let i=0;i+n<ds.length;i+=3){ const m=mov(tk,ds[i],n); if(m!=null)v.push(m); }
    BASE[tk][n]=mediaDe(v); } }
const SIG=new Map();
for(const [y,M] of AÑOS) for(const f of cargar(M)){
  const k=`${f.tk}|${f.dC}|${f.l}`; const x=SIG.get(k);
  if(x){ x.n++; if(f.vsOI>=12) x.doce=true; if(f.vsOI>=4&&f.vsOI<12) x.flojo=true; }
  else SIG.set(k,{tk:f.tk,dC:f.dC,l:f.l,y,n:1,doce:f.vsOI>=12,flojo:f.vsOI>=4&&f.vsOI<12});
}
const S=[...SIG.values()].filter(x=>BASE[x.tk]);
const DOCE=S.filter(x=>x.doce);
function vent(L,n){ const v=[];
  for(const x of L){ const m=mov(x.tk,x.dC,n); if(m==null) continue;
    v.push((x.l==="P"?-1:1)*(m-BASE[x.tk][n])); } return v; }
function fila(nom,L){
  const cel=HOR.map(n=>{ const v=vent(L,n); if(v.length<20) return "—".padStart(15);
    const m=mediaDe(v), t=t_de(v);
    return `${((100*m)>=0?"+":"")+(100*m).toFixed(2)}%  t=${t.toFixed(1)}`.padStart(15); });
  console.log(`  ${nom.padEnd(28)} ${String(vent(L,5).length).padStart(6)} ${cel.join("")}`);
}
function cab(t){ console.log(`\n  ═══ ${t} ═══\n`);
  console.log(`  ${"".padEnd(28)} ${"n".padStart(6)} ${HOR.map(x=>(x+" días").padStart(15)).join("")}`); }
cab("EL 12x — PARTIDO EN TRES TERCIOS DE TIEMPO");
fila("todo junto",DOCE);
const ord=DOCE.slice().sort((a,b)=>a.dC.localeCompare(b.dC));
const t3=Math.floor(ord.length/3);
fila(`tercio 1 (${ord[0].dC.slice(0,6)}-${ord[t3-1].dC.slice(0,6)})`,ord.slice(0,t3));
fila(`tercio 2 (${ord[t3].dC.slice(0,6)}-${ord[2*t3-1].dC.slice(0,6)})`,ord.slice(t3,2*t3));
fila(`tercio 3 (${ord[2*t3].dC.slice(0,6)}-${ord[ord.length-1].dC.slice(0,6)})`,ord.slice(2*t3));
cab("EL 12x — AÑO POR AÑO");
for(const [y] of AÑOS) fila(y,DOCE.filter(x=>x.y===y));
cab("EL 12x — TICKER POR TICKER");
for(const tk of TK) fila(tk,DOCE.filter(x=>x.tk===tk));
cab("CONTROL — golpes que NO llegan al 12x");
fila("4x a 12x (el flojo)",S.filter(x=>x.flojo&&!x.doce));
fila("por debajo de 4x",S.filter(x=>!x.flojo&&!x.doce));
console.log(`\n  Para que valga: los TRES tercios del mismo signo y la mayoría de los tickers también.\n`);
