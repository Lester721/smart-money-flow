// Precalcula el GEX neto de las 11:00 de los 654 días medidos y el desenlace del cóndor.
// Sirve para que la web pueda decir "el GEX de hoy está en el percentil X" y "con este nivel,
// históricamente pasó esto" — que es lo que convierte un número grande en información.
import fs from 'node:fs';
import { obs, mean } from './gex-lib-gex.mjs';
const SEP=25,ALA=50,COMM=0.03;
const nd=x=>{const t=1/(1+0.2316419*Math.abs(x)),d=0.3989423*Math.exp(-x*x/2);
 const p=d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));return x>0?1-p:p;};
const porDia=new Map(); for(const o of obs) if(o.h==='11:00') porDia.set(o.d,o);
const atm=o=>{let K=null,dif=Infinity; for(const k of o.calls.keys()) if(o.puts.has(k)&&Math.abs(k-o.U)<dif){dif=Math.abs(k-o.U);K=k;} return dif<=10?K:null;};
const out=[];
for(const [d,o] of [...porDia.entries()].sort()){
  const red=x=>Math.round(x/5)*5;
  const K=atm(o); let ret=null,cr=null;
  if(K!=null){
    const Kc=red(o.U)+SEP,Kp=red(o.U)-SEP;
    const c=o.calls.get(Kc),cA=o.calls.get(Kc+ALA),p=o.puts.get(Kp),pA=o.puts.get(Kp-ALA);
    if(c&&cA&&p&&pA){
      cr=c.bid+p.bid-cA.ask-pA.ask;
      if(cr>0.2&&cr<ALA){
        const perd=Math.min(Math.max(o.cierre-Kc,0),ALA)+Math.min(Math.max(Kp-o.cierre,0),ALA);
        ret=((cr-perd)*100-8*COMM)/(ALA*100);
      } else cr=null;
    }
  }
  out.push({d, gex:Math.round(o.net1/1e6), spx:Math.round(o.U*100)/100,
            cierre:Math.round(o.cierre*100)/100, mov:Math.round((o.cierre/o.U-1)*10000)/100,
            credito: cr!=null?Math.round(cr*100):null, ret: ret!=null?Math.round(ret*10000)/100:null});
}
const dir='data/gex'; fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(`${dir}/historia.json`, JSON.stringify(out));
const conSeñal=out.filter(x=>x.gex>0&&x.ret!=null);
console.log(`${out.length} días guardados en ${dir}/historia.json`);
console.log(`  con GEX positivo y cóndor operable: ${conSeñal.length}`);
console.log(`  acierto ${(conSeñal.filter(x=>x.ret>0).length/conSeñal.length*100).toFixed(0)}%  ·  media ${mean(conSeñal.map(x=>x.ret)).toFixed(2)}%`);
console.log(`  rango de GEX: ${Math.min(...out.map(x=>x.gex)).toLocaleString('es-ES')}M a ${Math.max(...out.map(x=>x.gex)).toLocaleString('es-ES')}M`);
