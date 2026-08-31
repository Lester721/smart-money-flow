// LA REGLA DE LESTER: «si en algún momento después de comprar dobló, olvídate de cuándo vence».
//
// O sea: se compra al ASK, y el PRIMER día en que el BID llegue al doble de lo pagado, se vende
// ahí y se acabó. Si nunca dobla, se aguanta hasta el final y se cobra lo que quede.
//
// Esto NO es «vender en el máximo» —eso no se puede— es una orden que se deja puesta el día de
// la compra y se dispara sola. Es ejecutable tal cual en Robinhood.
//
// Se mide sobre TRES grupos para saber si la regla necesita el flujo o funciona sola:
//   · los contratos que el dinero grande compró con prisa (>$500k al ask)
//   · sus vecinos de al lado, elegidos SIN mirar el flujo
//   · los que el dinero grande estaba VENDIENDO con prisa
//
// Y con tres objetivos: 1.5x, 2x y 3x, para ver si el 2x es el punto o si hay algo mejor.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";
const DIR = join(CACHE, "cadenas");
const dias = new Map();
for (const f of readdirSync(DIR)) { const g=/^([A-Z]+)_d(\d{8})\.json$/.exec(f); if(!g)continue; if(!dias.has(g[1]))dias.set(g[1],[]); dias.get(g[1]).push(g[2]); }
for (const v of dias.values()) v.sort();
const _c=new Map();
const cad=(t,d)=>{const k=`${t}|${d}`; if(_c.has(k))return _c.get(k); const f=join(DIR,`${t}_d${d}.json`); const v=existsSync(f)?JSON.parse(readFileSync(f,"utf8")):null; _c.set(k,v); if(_c.size>400)_c.delete(_c.keys().next().value); return v;};
const px=(t,d,e,K,l)=>{const g=cad(t,d)?.[e]; return g? (g[`${K}|${l}`]??null) : null;};

/** Compra al ask; vende al BID el primer dia que llegue a `objetivo` veces lo pagado.
 *  Si no llega, aguanta hasta el ultimo dia con precio y cobra ese bid. */
function operar(t,dC,e,K,l,objetivo){
  const p0=px(t,dC,e,K,l); if(!p0||!(p0[1]>0)) return null;
  const coste=p0[1]; const ds=dias.get(t)??[];
  let ultimo=null, n=0;
  for(const d of ds){ if(d<=dC)continue; if(d>e)break;
    const p=px(t,d,e,K,l); if(!p)continue; n++;
    const mult=p[0]/coste;
    if(mult>=objetivo) return {mult, dias:n, disparo:true};   // se vende AHI
    ultimo=mult; }
  if(n===0) return null;
  return {mult:ultimo, dias:n, disparo:false};                 // se aguanta hasta el final
}

const fich=readdirSync(CACHE).filter(f=>/^[A-Z]+_y_2026\d{4}_2026\d{4}\.json$/.test(f));
const grupos={compra:[],vecino:[],venta:[]};
for(const f of fich){ let cinta; try{cinta=JSON.parse(readFileSync(join(CACHE,f),"utf8"));}catch{continue;}
  for(const op of cinta){ const pr=op.premium??0; if(!(pr>=500000))continue;
    const esC=["AT_ASK","ABOVE_ASK"].includes(op.side), esV=["AT_BID","BELOW_BID"].includes(op.side);
    if(!esC&&!esV)continue;
    const m=/^([A-Z]+)(\d{6})([CP])(\d{8})$/.exec(op.symbol??""); if(!m)continue;
    const [,tk,ymd,l,k]=m; const e=`20${ymd}`, K=Number(k)/1000;
    const ds=dias.get(tk)??[]; const dOp=String(op.timestamp??"").slice(0,10).replace(/-/g,"");
    const i=ds.findIndex(d=>d>dOp); if(i<0)continue; const dC=ds[i]; if(dC>=e)continue;
    (esC?grupos.compra:grupos.venta).push({tk,dC,e,K,l});
    if(esC){ const g=cad(tk,dC)?.[e];
      if(g){ const ks=[...new Set(Object.keys(g).filter(x=>x.endsWith(`|${l}`)).map(x=>Number(x.slice(0,-2))))].sort((a,b)=>a-b);
        const j=ks.indexOf(K); const vec=j>=0?(l==="C"?ks[j+1]:ks[j-1]):null;
        if(vec!=null) grupos.vecino.push({tk,dC,e,K:vec,l}); } } } }

console.log(`## Regla: vender el primer dia que el BID llegue al objetivo. Si no llega, aguantar.\n`);
for(const obj of [1.5,2,3]){
  console.log(`### OBJETIVO ${obj}x\n`);
  console.log(`  grupo                     n     dispara   ganado      perdido     RATIO   dias medios`);
  for(const [nom,lista] of Object.entries(grupos)){
    const rs=lista.map(x=>operar(x.tk,x.dC,x.e,x.K,x.l,obj)).filter(Boolean);
    if(!rs.length){console.log(`  ${nom}: sin casos`);continue;}
    const pl=rs.map(r=>1000*(r.mult-1));           // $1,000 arriesgado en cada intento
    const gan=pl.filter(x=>x>0).reduce((a,b)=>a+b,0);
    const per=Math.abs(pl.filter(x=>x<=0).reduce((a,b)=>a+b,0));
    const disp=rs.filter(r=>r.disparo).length;
    console.log(`  ${nom.padEnd(22)} ${String(rs.length).padStart(5)}   ${(100*disp/rs.length).toFixed(1).padStart(5)}%   $${Math.round(gan).toLocaleString("en-US").padStart(9)}  $${Math.round(per).toLocaleString("en-US").padStart(9)}   ${(per?gan/per:0).toFixed(2).padStart(5)}   ${(rs.reduce((a,r)=>a+r.dias,0)/rs.length).toFixed(0)}`);
  }
  console.log("");
}
