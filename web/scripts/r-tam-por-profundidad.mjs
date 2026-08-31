// ══════════════════════════════════════════════════════════════════════════════════════════
//  TAMAÑO SEGÚN LO HUNDIDA QUE ESTÉ LA ACCIÓN
//
//  LA PALANCA abre hoy TODAS las posiciones del mismo tamaño (2,4% del patrimonio), tanto si
//  la acción está un 7% por debajo de su media de 50 como si está un 28%. Pero el rendimiento
//  por señal SÍ depende de la profundidad. Medido sobre TODAS las señales elegibles (no sólo
//  las ejecutadas), con la misma salida de la regla (120 sesiones, suelo 0,50x, castigo 1,38%):
//
//        franja      A+B (n)            los 27 (n)
//        7-9%        1,111  (5.451)     1,070  (2.500)
//        9-11%       1,148  (3.623)     1,059  (1.753)
//        11-13%      1,193  (2.309)     1,063  (1.144)
//        13-15%      1,247  (1.353)     1,084    (789)
//        15-18%      1,251  (1.170)     1,164    (709)
//        18-22%      1,283    (727)     1,231    (478)
//        22-30%      1,332    (589)     1,243    (400)
//
//  En A+B es MONÓTONA. En los 27 es plana hasta el 15% y sube después. En los dos, lo hondo
//  paga más que lo somero. Así que el tamaño escala con la profundidad:
//
//        tam_i = tamBase × (1 + k × (|ma_i| − 0,07) / 0,07)
//
//  `tamBase` NO es 2,4%: se recalibra a la baja para que la EXPOSICIÓN MEDIA de la cartera
//  (q.invertido) siga siendo la misma que la regla plana. Sin eso se estaría comparando una
//  cartera más grande contra una más pequeña, que es apalancarse, no elegir mejor.
//
//  Correr:  UNI=AB node --max-old-space-size=4096 r-tam-por-profundidad.mjs
//           UNI=27 node --max-old-space-size=4096 r-tam-por-profundidad.mjs
// ══════════════════════════════════════════════════════════════════════════════════════════
import {readFileSync} from 'node:fs'; import {join} from 'node:path'; import {CACHE} from './raiz.mjs';
const CAP=60000, UNI=process.env.UNI||'AB';
const P={}; for(const f of (UNI==='AB'?['precios-A.json','precios-B.json']:['precios-ajustados.json']))
  Object.assign(P, JSON.parse(readFileSync(join(CACHE,f),'utf8')));
const PX={},IDX={},SPL={};
for(const tk of Object.keys(P)){const D=Object.keys(P[tk]).sort();
 PX[tk]=D.map(d=>P[tk][d]); IDX[tk]=new Map(D.map((d,i)=>[d,i]));
 const S=new Set(); for(let i=1;i<D.length;i++){const r=PX[tk][i]/PX[tk][i-1]; if(r>1.35||r<0.65)S.add(i);} SPL[tk]=S;}
const maN=(tk,d,N)=>{const i=IDX[tk]?.get(d); if(i==null||i<N)return null;
 for(let j=i-N+1;j<=i;j++) if(SPL[tk].has(j))return null;
 let s=0; for(let j=i-N;j<i;j++)s+=PX[tk][j]; return PX[tk][i]/(s/N)-1;};
process.env.CAMINOS = UNI==='AB' ? 'sincosteAB-p25-d400.json' : 'sincoste-p25-d400.json';
// motor-tam-prof.mjs = COPIA de motor-cartera.mjs con `kProf` (y el P&L por operación).
// motor-cartera.mjs NO se toca: lo usan 400 scripts.
const M=await import('./motor-tam-prof.mjs');
const V=M.OPS.map(o=>maN(o.tk,o.dC,50));
for(let i=0;i<M.OPS.length;i++){const v=V[i]; M.OPS[i].ma=(v!=null&&v<-0.07&&v>=-0.30)?v:999;}
const BASE={tam:0.024,huecos:10,modo:'spy',plazo:120,castigo:0.0138,suelo:0.50,costeMin:0};

const med41=(cfg)=>{const F=[],A=[],C=[],S=[],O=[],I=[];
  for(let i=0;i<41;i++){const cap=CAP*(1+(i-20)*0.005); const q=M.simular({...cfg,capital:cap});
    F.push(q.final-cap);A.push(q.cagr);C.push(q.caida);S.push(q.sharpe);O.push(q.ops);I.push(q.invertido);}
  return {dol:M.med(F)/M.ANOS,cagr:M.med(A),caida:M.med(C),sharpe:M.med(S),ops:M.med(O),inv:M.med(I)};};
// calibra tamBase por bisección hasta igualar la exposición media de la regla plana
const calibra=(cfg,obj)=>{let lo=0.003,hi=0.15;
  for(let i=0;i<26;i++){const m=(lo+hi)/2; if(med41({...cfg,tam:m}).inv<obj) lo=m; else hi=m;}
  const tam=(lo+hi)/2; return {tam,...med41({...cfg,tam})};};
// concentración: peso de la MAYOR ganancia sobre el bruto ganado y sobre el neto
const conc=(cfg)=>{const q=M.simular({...cfg,capital:CAP});
  const T=[...q.cerradas,...q.abiertasFin];
  const pos=T.filter(o=>o.pnl>0).map(o=>o.pnl).sort((a,b)=>b-a);
  const sp=pos.reduce((a,x)=>a+x,0), neto=T.reduce((a,o)=>a+o.pnl,0);
  return {mayorBruto:100*pos[0]/sp, mayorNeto:100*pos[0]/neto, top3:100*(pos[0]+pos[1]+pos[2])/sp};};
const fila=(et,r,c)=>console.log(`${et.padEnd(26)} $/año ${String(Math.round(r.dol)).padStart(7)}  cagr ${r.cagr.toFixed(2)}  caída ${r.caida.toFixed(1)}  sharpe ${r.sharpe.toFixed(3)}  ops ${String(r.ops).padStart(3)}  invertido ${r.inv.toFixed(2)}${c?`  mayor/bruto ${c.mayorBruto.toFixed(1)}%  mayor/neto ${c.mayorNeto.toFixed(1)}%  top3 ${c.top3.toFixed(1)}%`:''}`);

console.log(`═══ ${UNI} ═══`);
const b=med41(BASE); fila('LA PALANCA (plano 2,4%)',b,conc(BASE));
console.log('--- la casilla y SUS VECINAS (k = pendiente del tamaño con la profundidad) ---');
for(const k of [0.5,1,1.5,2,2.5,3,4]){ const cfg={...BASE,kProf:k}; const r=calibra(cfg,b.inv);
  fila(`k ${k}  tamBase ${r.tam.toFixed(4)}`,r,conc({...cfg,tam:r.tam})); }
console.log('--- la candidata k=2, comprobaciones ---');
const tam=calibra({...BASE,kProf:2},b.inv).tam, C2={...BASE,kProf:2,tam};
const g=M.OPS.map(o=>o.ma);
for(let i=0;i<M.OPS.length;i++) if(M.OPS[i].dC.slice(0,4)==='2020') M.OPS[i].ma=999;
fila('sin 2020  plano',med41(BASE)); fila('sin 2020  k=2',med41(C2));
for(let i=0;i<M.OPS.length;i++) M.OPS[i].ma=g[i];
for(const [d,h] of [['20161231','20191231'],['20161231','20241231'],['20191231','20261231'],['20241231','20261231']]){
  fila(`${d.slice(0,4)}-${h.slice(0,4)} plano`,med41({...BASE,desdeD:d,hasta:h}));
  fila(`${d.slice(0,4)}-${h.slice(0,4)} k=2`,med41({...C2,desdeD:d,hasta:h})); }
console.log(`tamaño por franja con k=2 y tamBase ${(tam*100).toFixed(2)}%:`);
for(const p of [0.07,0.10,0.15,0.20,0.30]) console.log(`   ${(p*100).toFixed(0)}% bajo la media → ${(100*tam*(1+2*(p-0.07)/0.07)).toFixed(2)}% del patrimonio`);
