// ¿CUÁNTAS VECES AGUANTA UN MURO? — lo que ninguna de estas herramientas te dice.
//
// Dibujar "muro de calls en 7.730" no vale nada si no sabes si eso aguanta 9 de cada 10 veces
// o 5. Aquí se cuenta con los 654 días: dónde estaba el muro a las 11:00 y si el índice acabó
// cerrando más allá.
//
// Y se parte por DISTANCIA, porque un muro al 0,2% y otro al 1,5% no son lo mismo.
import fs from 'node:fs';
import { obs, mean } from './gex-lib-gex.mjs';

const porDia=new Map(); for(const o of obs) if(o.h==='11:00') porDia.set(o.d,o);
const nd=x=>{const t=1/(1+0.2316419*Math.abs(x)),d=0.3989423*Math.exp(-x*x/2);
 const p=d*t*(0.3193815+t*(-0.3565638+t*(1.781478+t*(-1.821256+t*1.330274))));return x>0?1-p:p;};
const phi=x=>0.3989423*Math.exp(-x*x/2);
const d1f=(S,K,T,v)=>(Math.log(S/K)+(v*v/2)*T)/(v*Math.sqrt(T));
const gam=(S,K,T,v)=>phi(d1f(S,K,T,v))/(S*v*Math.sqrt(T));

const filas=[];
for(const [d,o] of [...porDia.entries()].sort()){
  const U=o.U, T=(16*60-660)/60/24/365;
  // gamma en dólares por strike
  let mejorC=null,gC=0, mejorP=null,gP=0;
  for(const [K,q] of o.calls){ const oi=o.oiCalls?.get(K); if(!oi)continue; if(K<=U)continue;
    if(Math.abs(K-U)/U>0.03)continue;
    const g=gam(U,K,T,q.iv); if(!isFinite(g)||g<=0)continue; const $=g*oi*100*U*U*0.01;
    if($>gC){gC=$;mejorC=K;} }
  // para las puts hace falta el OI de puts, que no viaja en obs -> se lee del fichero
  const f=`scripts/cache-theta/gex-2026/oi_${d}.csv`;
  if(!fs.existsSync(f))continue;
  const lin=fs.readFileSync(f,'utf8').split('\n'),cab=lin[0].split(',');
  const iK=cab.indexOf('strike'),iT=cab.indexOf('timestamp'),iO=cab.indexOf('open_interest'),iR=cab.indexOf('right');
  const oiP=new Map();
  for(let n=1;n<lin.length;n++){const c=lin[n].split(','); if(c.length<cab.length)continue;
    if(c[iT].slice(0,10)!==d)continue; if(c[iR].replace(/"/g,'')!=='PUT')continue;
    const v=+c[iO]; if(v>0) oiP.set(+c[iK],v);}
  for(const [K,q] of o.puts){ const oi=oiP.get(K); if(!oi)continue; if(K>=U)continue;
    if(Math.abs(K-U)/U>0.03)continue;
    const g=gam(U,K,T,q.iv); if(!isFinite(g)||g<=0)continue; const $=g*oi*100*U*U*0.01;
    if($>gP){gP=$;mejorP=K;} }
  if(mejorC==null||mejorP==null)continue;
  filas.push({d, U, cierre:o.cierre, gex:o.net1,
    muroC:mejorC, distC:(mejorC-U)/U*100, rotoC: o.cierre>mejorC,
    muroP:mejorP, distP:(U-mejorP)/U*100, rotoP: o.cierre<mejorP});
}

const pct=a=>a.length?Math.round(a.filter(Boolean).length/a.length*100):null;
console.log(`═══ ¿AGUANTAN LOS MUROS? — ${filas.length} días, 2024-2026 ═══\n`);
console.log('  muro de CALLS: el índice cerró POR ENCIMA (roto) en '+pct(filas.map(x=>x.rotoC))+'% de los días');
console.log('  muro de PUTS : cerró POR DEBAJO (roto) en '+pct(filas.map(x=>x.rotoP))+'%\n');
console.log('  por distancia del muro al precio:');
console.log('  distancia        n     muro de calls aguanta   muro de puts aguanta');
const cubos=[[0,0.3],[0.3,0.6],[0.6,1.0],[1.0,2.0],[2.0,99]];
const tabla=[];
for(const [a,b] of cubos){
  const c=filas.filter(x=>x.distC>=a&&x.distC<b), p=filas.filter(x=>x.distP>=a&&x.distP<b);
  const ac=c.length?100-pct(c.map(x=>x.rotoC)):null, ap=p.length?100-pct(p.map(x=>x.rotoP)):null;
  tabla.push({desde:a,hasta:b,nC:c.length,aguantaC:ac,nP:p.length,aguantaP:ap});
  console.log(`  ${a.toFixed(1)}%-${b===99?'+':b.toFixed(1)+'%'}      ${String(c.length).padStart(3)}/${String(p.length).padStart(3)}        ${ac!=null?ac+'%':'—'}                    ${ap!=null?ap+'%':'—'}`);
}
console.log('\n  y separando por el signo del GEX:');
for(const [n,f] of [['GEX positivo',x=>x.gex>0],['GEX negativo',x=>x.gex<=0]]){
  const g=filas.filter(f);
  console.log(`     ${n}: calls aguantan ${100-pct(g.map(x=>x.rotoC))}%  ·  puts aguantan ${100-pct(g.map(x=>x.rotoP))}%   (n=${g.length})`);
}
fs.mkdirSync('data/gex',{recursive:true});
fs.writeFileSync('data/gex/muros.json',JSON.stringify({n:filas.length,tabla,
  porGex:{positivo:{calls:100-pct(filas.filter(x=>x.gex>0).map(x=>x.rotoC)),puts:100-pct(filas.filter(x=>x.gex>0).map(x=>x.rotoP)),n:filas.filter(x=>x.gex>0).length},
          negativo:{calls:100-pct(filas.filter(x=>x.gex<=0).map(x=>x.rotoC)),puts:100-pct(filas.filter(x=>x.gex<=0).map(x=>x.rotoP)),n:filas.filter(x=>x.gex<=0).length}}}));
console.log('\n  guardado en data/gex/muros.json');
