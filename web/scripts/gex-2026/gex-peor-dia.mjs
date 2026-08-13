// ¿POR QUÉ EL STOP NUNCA CORTÓ EL PEOR DÍA? — el peor día es −$4.135 con stop y sin stop.
// Si el stop salta al 25% del riesgo, tendría que haber cortado. Aquí se mira qué pasó.
import fs from 'node:fs';
const DIR='scripts/cache-theta/gex-2026';
const SEP=25,ALA=50,COMM=0.03,HORA='11:00',PASO=5;
const nd=x=>{const t=1/(1+0.2316419*Math.abs(x)),d=0.3989423*Math.exp(-x*x/2);
 const p=d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));return x>0?1-p:p;};
const phi=x=>0.3989423*Math.exp(-x*x/2);
const d1f=(S,K,T,v)=>(Math.log(S/K)+(v*v/2)*T)/(v*Math.sqrt(T));
const gam=(S,K,T,v)=>phi(d1f(S,K,T,v))/(S*v*Math.sqrt(T));
function lado(dia,l){const f=`${DIR}/iv_${dia}_${l}.csv`; if(!fs.existsSync(f))return null;
 const lin=fs.readFileSync(f,'utf8').split('\n'),cab=lin[0].split(',');
 const iK=cab.indexOf('strike'),iT=cab.indexOf('timestamp'),iB=cab.indexOf('bid'),iA=cab.indexOf('ask'),iM=cab.indexOf('midpoint'),iV=cab.indexOf('implied_vol'),iU=cab.indexOf('underlying_price');
 const m=new Map();
 for(let n=1;n<lin.length;n++){const c=lin[n].split(','); if(c.length<cab.length)continue;
  const h=c[iT].slice(11,16),U=+c[iU]; if(!m.has(h))m.set(h,{U:0,q:new Map(),crudo:new Map()});
  const g=m.get(h); if(U>0)g.U=U;
  const bid=+c[iB],ask=+c[iA],mid=+c[iM],iv=+c[iV];
  g.crudo.set(+c[iK],{bid,ask,mid,iv});
  if(!(bid>0)||!(ask>0)||ask<bid||!(mid>0)||!(iv>0.01)||iv>4)continue;
  if((ask-bid)/mid>0.5)continue;
  g.q.set(+c[iK],{bid,ask,mid,iv});}
 return m;}
function oiDe(dia){const f=`${DIR}/oi_${dia}.csv`; if(!fs.existsSync(f))return null;
 const lin=fs.readFileSync(f,'utf8').split('\n'),cab=lin[0].split(',');
 const iK=cab.indexOf('strike'),iT=cab.indexOf('timestamp'),iO=cab.indexOf('open_interest'),iR=cab.indexOf('right');
 const oi={C:new Map(),P:new Map()};
 for(let n=1;n<lin.length;n++){const c=lin[n].split(','); if(c.length<cab.length)continue;
  if(c[iT].slice(0,10)!==dia)continue; const v=+c[iO]; if(v>0) oi[c[iR].replace(/"/g,'')==='CALL'?'C':'P'].set(+c[iK],v);}
 return oi;}

// encontrar el peor día
const dias=fs.readdirSync(DIR).filter(f=>f.startsWith('oi_')).map(f=>f.slice(3,13)).sort();
let peor=null;
for(const dia of dias){
 const P=lado(dia,'P'),C=lado(dia,'C'),oi=oiDe(dia); if(!P||!C||!oi)continue;
 const gP=P.get(HORA),gC=C.get(HORA); if(!gP||!gC||!(gC.U>0))continue;
 const U=gC.U,T0=(16*60-660)/60/24/365;
 let a=0,b=0;
 for(const [l,mp,om] of [['C',gC.q,oi.C],['P',gP.q,oi.P]]) for(const [K,q] of mp){const o=om.get(K); if(!o)continue;
  const g=gam(U,K,T0,q.iv); if(!isFinite(g)||g<=0)continue; const $=g*o*100*U*U*0.01; if(!isFinite($))continue; if(l==='C')a+=$; else b+=$;}
 if(a-b<=0)continue;
 const red=x=>Math.round(x/PASO)*PASO, Kc=red(U)+SEP, Kp=red(U)-SEP;
 const c0=gC.q.get(Kc),cA0=gC.q.get(Kc+ALA),p0=gP.q.get(Kp),pA0=gP.q.get(Kp-ALA);
 if(!c0||!cA0||!p0||!pA0)continue;
 const cr=c0.bid+p0.bid-cA0.ask-pA0.ask; if(!(cr>0.2)||cr>ALA)continue;
 const horas=[...C.keys()].filter(h=>h>HORA).sort();
 const S=C.get(horas[horas.length-1])?.U??U;
 const perd=Math.min(Math.max(S-Kc,0),ALA)+Math.min(Math.max(Kp-S,0),ALA);
 const pl=(cr-perd)*100-8*COMM;
 if(!peor||pl<peor.pl) peor={dia,U,S,Kc,Kp,cr,pl,P,C,horas};
}
const p=peor;
console.log(`═══ EL PEOR DÍA: ${p.dia} ═══\n`);
console.log(`  SPX a las 11:00: ${p.U.toFixed(2)}  ->  al cierre: ${p.S.toFixed(2)}   (${((p.S/p.U-1)*100).toFixed(2)}%)`);
console.log(`  cóndor: call ${p.Kc}/${p.Kc+ALA}  ·  put ${p.Kp}/${p.Kp-ALA}   crédito $${(p.cr*100).toFixed(0)}`);
console.log(`  P&L final: $${p.pl.toFixed(0)}\n`);
console.log('  recorrido del día (cada 30 min):');
console.log('   hora    SPX      ¿se puede valorar?   coste de deshacer   pérdida abierta   % del riesgo');
const riesgo=ALA-p.cr;
for(const h of p.horas){
  if(!h.endsWith(':00')&&!h.endsWith(':30'))continue;
  const gc=p.C.get(h),gp=p.P.get(h); if(!gc)continue;
  const c=gc.q.get(p.Kc),cA=gc.q.get(p.Kc+ALA),pu=gp?.q.get(p.Kp),pA=gp?.q.get(p.Kp-ALA);
  if(!c||!cA||!pu||!pA){
    const cr2=gc.crudo.get(p.Kc),pr2=gp?.crudo.get(p.Kp);
    const falta=[!c&&'call corta',!cA&&'call larga',!pu&&'put corta',!pA&&'put larga'].filter(Boolean).join(', ');
    console.log(`   ${h}  ${gc.U.toFixed(2)}   NO — sin cotización usable en: ${falta}`);
    continue;}
  const coste=c.ask+pu.ask-cA.bid-pA.bid;
  const pa=coste-p.cr;
  console.log(`   ${h}  ${gc.U.toFixed(2)}   sí                  $${(coste*100).toFixed(0).padStart(6)}          $${(pa*100).toFixed(0).padStart(6)}         ${(pa/riesgo*100).toFixed(0).padStart(4)}%`);
}
