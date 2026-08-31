// CHEQUEO: el salto entre salir a los 23 y a los 30 días de bolsa, ¿es una rampa o un pico?
// Se mide la MISMA operación (8% fuera, 60 días) vendida en 14 días de salida distintos.
import { readFileSync, readdirSync, existsSync } from "node:fs";
const CDIR = "scripts/cache-theta/cadenas";
const ms = (d) => Date.parse(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}T00:00:00Z`);
const dteDe = (a,b) => Math.round((ms(b)-ms(a))/86400000);
const diasPorSim = new Map();
for (const f of readdirSync(CDIR)) { const m=f.match(/^([A-Z]+)_d(\d{8})\.json$/); if(!m)continue;
  if(!diasPorSim.has(m[1]))diasPorSim.set(m[1],[]); diasPorSim.get(m[1]).push(m[2]); }
for (const v of diasPorSim.values()) v.sort();
const cache=new Map();
function cadena(s,d){const k=s+d; if(cache.has(k))return cache.get(k); const f=`${CDIR}/${s}_d${d}.json`;
  let v=null; if(existsSync(f)){try{v=JSON.parse(readFileSync(f,"utf8"))}catch{}}
  if(cache.size>320)cache.delete(cache.keys().next().value); cache.set(k,v); return v;}
function spotDe(c){let k=null,dm=Infinity;for(const g of Object.values(c))for(const [cl,ba] of Object.entries(g)){
  if(cl.slice(-1)!=="C")continue;const K=Number(cl.slice(0,-2));const p=g[`${K}|P`];if(!p)continue;
  const d=Math.abs((ba[0]+ba[1])/2-(p[0]+p[1])/2);if(d<dm){dm=d;k=K}}return k;}
const SAL=[15,18,20,21,22,23,24,25,26,28,30,33,35,40];
const A=SAL.map(()=>({gan:0,per:0,n:0,win:0,max:0,arg:null}));
for(const sym of [...diasPorSim.keys()].sort()){
  const dias=diasPorSim.get(sym); const vistos=new Set();
  for(let i=0;i<dias.length;i++){ const dia=dias[i]; const mes=dia.slice(0,6);
    if(vistos.has(mes))continue; vistos.add(mes);
    const c=cadena(sym,dia); if(!c)continue; const sp=spotDe(c); if(!sp)continue;
    let exp=null,md=Infinity;
    for(const e of Object.keys(c)){const dt=dteDe(dia,e); if(dt<1)continue; const x=Math.abs(dt-60); if(x<md){md=x;exp=e}}
    if(!exp||md>17)continue;
    for(const tipo of ["C","P"]){
      const obj=tipo==="C"?sp*1.08:sp*0.92; let best=null,bd=Infinity;
      for(const [clave,ba] of Object.entries(c[exp])){ if(clave.slice(-1)!==tipo)continue;
        const K=Number(clave.slice(0,-2)); if(!(ba[1]>=0.10))continue;
        const d=Math.abs(K-obj); if(d<bd){bd=d;best={K,clave,ask:ba[1]}}}
      if(!best)continue;
      const dr=tipo==="C"?best.K/sp-1:1-best.K/sp; if(Math.abs(dr-0.08)>0.04)continue;
      for(let s=0;s<SAL.length;s++){ let ds=dias[i+SAL[s]]; if(!ds)continue; if(ds>=exp)ds=exp;
        const cs=cadena(sym,ds); if(!cs)continue; const g=cs[exp]; if(!g)continue;
        const sal=g[best.clave]?.[0]??0; const d=1000*(sal-best.ask)/best.ask;
        const a=A[s]; a.n++; if(d>0){a.win++;a.gan+=d; if(d>a.max){a.max=d;a.arg=`${sym} ${tipo}${best.K} ${dia}→${ds}`}} else a.per+=-d; }
    }
  }
  cache.clear();
}
console.log("\n  8% fuera · 60 días de plazo · ask ≥ $0,10 · la MISMA operación vendida en 14 días distintos\n");
console.log("  | salir a los N días de bolsa | n | ratio | acierta | gana | pierde | mayor billete |");
console.log("  |---|---|---|---|---|---|---|");
for(let s=0;s<SAL.length;s++){const a=A[s];
  console.log(`  | ${String(SAL[s]).padStart(2)} | ${a.n} | **${(a.gan/a.per).toFixed(3)}** | ${(100*a.win/a.n).toFixed(1)}% | $${Math.round(a.gan).toLocaleString("es-ES")} | $${Math.round(a.per).toLocaleString("es-ES")} | $${Math.round(a.max).toLocaleString("es-ES")} ${a.arg} |`);}
