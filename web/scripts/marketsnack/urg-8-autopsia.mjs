// AUTOPSIA DEL +6,35% — el cono ATM aguantado a vencimiento salio positivo. Antes de decir nada:
//   1. .cuantas operaciones INDEPENDIENTES hay de verdad? (ventanas de 7 dias que se solapan)
//   2. .vive en un ticker? .en un mes? .en un puñado de resultados trimestrales?
//   3. .cual es la MEDIANA? un pago de loteria tiene media positiva y mediana ruinosa
//   4. .es la subida del mercado? se separan la pata call y la pata put
import fs from "node:fs"; import path from "node:path";
import { listonT } from "../../lib/barreraHallazgos.ts";
const CDIR=path.join("scripts","cache-theta","cadenas");
const CIERRES=path.join("scripts","cache-theta","cierres");
const RAIZ=path.join("scripts","cache-theta","marketsnack");
const DTE_OBJ=7,TOL_DTE=4,TOL_ATM=0.02,CUENTA=56389;
const P=JSON.parse(fs.readFileSync(path.join(RAIZ,"urg-panel.json"),"utf8"));
const ymd=(s)=>s.replace(/-/g,""); const iso=(y)=>`${y.slice(0,4)}-${y.slice(4,6)}-${y.slice(6,8)}`;
const ddias=(a,b)=>Math.round((Date.parse(iso(b))-Date.parse(iso(a)))/86400000);
const media=(v)=>v.length?v.reduce((a,x)=>a+x,0)/v.length:NaN;
const sdv=(v)=>{const m=media(v);return Math.sqrt(v.reduce((a,x)=>a+(x-m)**2,0)/(v.length-1));};
const pctl=(v,q)=>{const s=[...v].sort((a,b)=>a-b);return s[Math.min(s.length-1,Math.floor(s.length*q))];};
const tickersCad=new Set(fs.readdirSync(CDIR).filter(f=>/^[A-Z]+_d\d{8}\.json$/.test(f)).map(f=>f.split("_d")[0]));
const cierres={}; for(const t of tickersCad){const p=path.join(CIERRES,`${t}.json`); if(fs.existsSync(p)) cierres[t]=JSON.parse(fs.readFileSync(p,"utf8"));}
const cache=new Map();
function cadena(t,d){const k=`${t}|${d}`; if(cache.has(k))return cache.get(k);
  const p=path.join(CDIR,`${t}_d${d}.json`); let v=null;
  if(fs.existsSync(p)){try{v=JSON.parse(fs.readFileSync(p,"utf8"));}catch{}}
  if(cache.size>4000)cache.clear(); cache.set(k,v); return v;}
function cono(cad,S,hoy){let exp=null,dd=Infinity;
  for(const e of Object.keys(cad)){const d=ddias(hoy,e); if(d<1)continue; const x=Math.abs(d-DTE_OBJ); if(x<dd){dd=x;exp=e;}}
  if(!exp||dd>TOL_DTE)return null;
  let K=null,kd=Infinity;
  for(const c of Object.keys(cad[exp])){const[ks,r]=c.split("|"); if(r!=="C")continue;
    const k=Number(ks); if(!cad[exp][`${k}|P`])continue; const x=Math.abs(k-S); if(x<kd){kd=x;K=k;}}
  if(K==null||Math.abs(K/S-1)>TOL_ATM)return null;
  const c=cad[exp][`${K}|C`],p=cad[exp][`${K}|P`];
  if(!c||!p||!(c[1]>0)||!(p[1]>0))return null;
  return {exp,K,askC:c[1],bidC:c[0],askP:p[1],bidP:p[0],dte:ddias(hoy,exp)};}

const ops=[];
for(const f of P){
  if(!tickersCad.has(f.ticker)||!cierres[f.ticker])continue;
  const d0=ymd(f.fecha); const S=cierres[f.ticker][d0]; if(!(S>0))continue;
  const cad=cadena(f.ticker,d0); if(!cad)continue;
  const c=cono(cad,S,d0); if(!c)continue;
  const Sexp=cierres[f.ticker][c.exp]; if(!(Sexp>0))continue;
  const coste=(c.askC+c.askP)*100; if(!(coste>0))continue;
  const pagoC=Math.max(0,Sexp-c.K)*100, pagoP=Math.max(0,c.K-Sexp)*100;
  ops.push({ticker:f.ticker,fecha:f.fecha,exp:c.exp,coste,dte:c.dte,
    ret:(pagoC+pagoP)/coste-1,
    retC:pagoC/(c.askC*100)-1, retP:pagoP/(c.askP*100)-1,
    mov:Math.abs(Sexp/S-1), empate:(c.askC+c.askP)/S,
    mes:f.fecha.slice(0,7)});
}
const R=ops.map(o=>o.ret);
console.log(`${ops.length} conos aguantados a vencimiento · ${new Set(ops.map(o=>o.fecha)).size} dias de entrada · ${new Set(ops.map(o=>o.ticker)).size} tickers`);
console.log(`\n1. MEDIA vs MEDIANA`);
console.log(`   media ${(media(R)*100).toFixed(2)}%  ·  MEDIANA ${(pctl(R,.5)*100).toFixed(2)}%  ·  p10 ${(pctl(R,.1)*100).toFixed(1)}%  p25 ${(pctl(R,.25)*100).toFixed(1)}%  p75 ${(pctl(R,.75)*100).toFixed(1)}%  p90 ${(pctl(R,.9)*100).toFixed(1)}%  max ${(pctl(R,1)*100).toFixed(0)}%`);
console.log(`   ganadoras ${(ops.filter(o=>o.ret>0).length/ops.length*100).toFixed(1)}%`);
const ord=[...ops].sort((a,b)=>b.ret-a.ret);
const top5=ord.slice(0,Math.ceil(ops.length*0.05));
console.log(`   el 5% mejor (${top5.length} ops) aporta ${((top5.reduce((a,o)=>a+o.ret,0))/(R.reduce((a,x)=>a+x,0))*100).toFixed(0)}% de todo el resultado`);
console.log(`   sin ese 5%: media ${(media(ord.slice(top5.length).map(o=>o.ret))*100).toFixed(2)}%`);

console.log(`\n2. .DONDE VIVE?  por ticker (los que aportan mas):`);
const porT=new Map();
for(const o of ops){ let g=porT.get(o.ticker); if(!g){g={n:0,s:0};porT.set(o.ticker,g);} g.n++; g.s+=o.ret; }
for(const [t,g] of [...porT].sort((a,b)=>b[1].s-a[1].s).slice(0,8))
  console.log(`   ${t.padEnd(6)} n=${String(g.n).padStart(3)} media ${((g.s/g.n)*100).toFixed(2).padStart(7)}% · aporta ${(g.s/R.reduce((a,x)=>a+x,0)*100).toFixed(0)}% del total`);
console.log(`   por mes:`);
const porM=new Map();
for(const o of ops){ let g=porM.get(o.mes); if(!g){g={n:0,s:0};porM.set(o.mes,g);} g.n++; g.s+=o.ret; }
for(const [m,g] of [...porM].sort())
  console.log(`   ${m}  n=${String(g.n).padStart(3)} media ${((g.s/g.n)*100).toFixed(2).padStart(7)}%`);

console.log(`\n3. n EFECTIVA — ventanas de ~7 dias que NO se solapan`);
const dias=[...new Set(ops.map(o=>o.fecha))].sort();
const bloques=[]; let ini=null;
for(const d of dias){ if(ini==null || (Date.parse(d)-Date.parse(ini))/86400000 >= 9){ bloques.push([]); ini=d; } bloques[bloques.length-1].push(d); }
const rBloque=bloques.map(b=>media(ops.filter(o=>b.includes(o.fecha)).map(o=>o.ret)));
console.log(`   ${dias.length} dias de entrada -> ${bloques.length} bloques sin solape`);
console.log(`   media por bloque: ${rBloque.map(r=>(r*100).toFixed(1)+"%").join(" · ")}`);
const tB=media(rBloque)/(sdv(rBloque)/Math.sqrt(rBloque.length));
console.log(`   t sobre los ${rBloque.length} bloques independientes = ${tB.toFixed(2)}  (liston para 1 sola prueba: 2 · para 24: ${listonT(24)})`);
console.log(`   bloques positivos: ${rBloque.filter(r=>r>0).length} de ${rBloque.length}`);

console.log(`\n4. .ES LA SUBIDA DEL MERCADO? las dos patas por separado`);
console.log(`   pata CALL sola: ${(media(ops.map(o=>o.retC))*100).toFixed(2)}%  ·  pata PUT sola: ${(media(ops.map(o=>o.retP))*100).toFixed(2)}%`);
console.log(`   (si la call sola explica casi todo, no es volatilidad: es que el mercado subio)`);
console.log(`\n5. MOVIMIENTO REAL vs LO QUE COSTABA`);
console.log(`   movimiento medio a vencimiento ${(media(ops.map(o=>o.mov))*100).toFixed(2)}% · movimiento de empate ${(media(ops.map(o=>o.empate))*100).toFixed(2)}%`);
console.log(`   mediana del movimiento ${(pctl(ops.map(o=>o.mov),.5)*100).toFixed(2)}% · mediana del empate ${(pctl(ops.map(o=>o.empate),.5)*100).toFixed(2)}%`);
console.log(`\n6. AVISO DE SALIDA: el pago a vencimiento se cobra por INTRINSECO. En la vida real la pata`);
console.log(`   ganadora hay que venderla al BID (o aceptar la asignacion de 100 acciones). Un descuento`);
console.log(`   del 5% sobre el pago deja la media en ${((media(ops.map(o=>(o.ret+1)*0.95-1)))*100).toFixed(2)}% y del 10% en ${((media(ops.map(o=>(o.ret+1)*0.90-1)))*100).toFixed(2)}%.`);
