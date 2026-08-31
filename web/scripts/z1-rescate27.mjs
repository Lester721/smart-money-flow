// z1 — RESCATAR LOS 27.  Base común: precios, deviación vs MA50, sigma ex-ante, vol realizada.
// Se usa motor-cartera.mjs SIN TOCARLO. Todo lo nuevo va en `ma` (elegibilidad+prioridad) e `iRec`.
import {readFileSync} from 'node:fs'; import {join} from 'node:path'; import {CACHE} from './raiz.mjs';

const UNI = process.argv[2] || '27';
const FICH = UNI==='AB' ? 'sincosteAB-p25-d400.json' : 'sincoste-p25-d400.json';
const PREC = UNI==='AB' ? ['precios-A.json','precios-B.json'] : ['precios-ajustados.json'];
const CAP=60000;

const P={}; for(const f of PREC) Object.assign(P, JSON.parse(readFileSync(join(CACHE,f),'utf8')));
const PX={},IDX={},SPL={},DEV={},SIG={},VOL={},ADJ={},T200={},T100={},MOM={};
for(const tk of Object.keys(P)){
  const D=Object.keys(P[tk]).sort();
  const px=D.map(d=>P[tk][d]); PX[tk]=px; IDX[tk]=new Map(D.map((d,i)=>[d,i]));
  const S=new Set(); for(let i=1;i<px.length;i++){const r=px[i]/px[i-1]; if(r>1.35||r<0.65)S.add(i);} SPL[tk]=S;
  // deviación vs MA50 (null si hay split en la ventana)
  const dev=new Array(px.length).fill(null);
  for(let i=50;i<px.length;i++){ let ok=true;
    for(let j=i-50+1;j<=i;j++) if(S.has(j)){ok=false;break;}
    if(!ok) continue; let s=0; for(let j=i-50;j<i;j++)s+=px[j]; dev[i]=px[i]/(s/50)-1; }
  DEV[tk]=dev;
  // sigma EX-ANTE de esa misma deviación: desviación típica de los 500 días ANTERIORES
  const sig=new Array(px.length).fill(null);
  for(let i=0;i<px.length;i++){ const a=Math.max(0,i-500), v=[];
    for(let j=a;j<i;j++) if(dev[j]!=null) v.push(dev[j]);
    if(v.length<150) continue;
    const m=v.reduce((x,y)=>x+y,0)/v.length;
    sig[i]=Math.sqrt(v.reduce((x,y)=>x+(y-m)**2,0)/(v.length-1)); }
  SIG[tk]=sig;
  // volatilidad realizada anualizada de los 100 días anteriores (saltando splits)
  const vol=new Array(px.length).fill(null);
  const lr=new Array(px.length).fill(null);
  for(let i=1;i<px.length;i++) if(!S.has(i)) lr[i]=Math.log(px[i]/px[i-1]);
  for(let i=100;i<px.length;i++){ const v=[];
    for(let j=i-100;j<i;j++) if(lr[j]!=null) v.push(lr[j]);
    if(v.length<80) continue;
    const m=v.reduce((x,y)=>x+y,0)/v.length;
    vol[i]=Math.sqrt(v.reduce((x,y)=>x+(y-m)**2,0)/(v.length-1))*Math.sqrt(252); }
  VOL[tk]=vol;
  // ── serie ENCADENADA por splits, construida HACIA DELANTE (nada de futuro): en el día del
  //    salto se multiplica por el factor que lo cancela, y ese factor sólo usa px[i-1] y px[i].
  //    Sin esto, cualquier ventana larga (200 o 252 sesiones) que contenga un split sale nula
  //    y NVDA/AAPL/AMD se quedan sin tendencia justo en los años que importan.
  const adj=new Array(px.length); let k=1;
  for(let i=0;i<px.length;i++){ if(S.has(i)) k*=px[i-1]/px[i]; adj[i]=px[i]*k; }
  ADJ[tk]=adj;
  const t200=new Array(px.length).fill(null), t100=new Array(px.length).fill(null), mom=new Array(px.length).fill(null);
  for(let i=200;i<px.length;i++){ let s2=0; for(let j=i-200;j<i;j++)s2+=adj[j]; t200[i]=adj[i]/(s2/200)-1; }
  for(let i=100;i<px.length;i++){ let s2=0; for(let j=i-100;j<i;j++)s2+=adj[j]; t100[i]=adj[i]/(s2/100)-1; }
  for(let i=252;i<px.length;i++) mom[i]=adj[i]/adj[i-252]-1;
  T200[tk]=t200; T100[tk]=t100; MOM[tk]=mom; }

process.env.CAMINOS=FICH;
const M=await import('./motor-z.mjs');
const OPS=M.OPS;
// campos ex-ante por operación
for(const o of OPS){ const i=IDX[o.tk]?.get(o.dC);
  o._i=i; o._dev=(i!=null)?DEV[o.tk][i]:null; o._sig=(i!=null)?SIG[o.tk][i]:null;
  o._vol=(i!=null)?VOL[o.tk][i]:null;
  o._t200=(i!=null)?T200[o.tk][i]:null; o._t100=(i!=null)?T100[o.tk][i]:null;
  o._mom=(i!=null)?MOM[o.tk][i]:null;
  o._z=(o._dev!=null&&o._sig!=null&&o._sig>0)?o._dev/o._sig:null; }

// ── VOL RELATIVA: la vol del nombre dividida por la MEDIANA de la vol de todos los nombres
//    ESE MISMO DÍA. Quita el componente de RÉGIMEN: en 2020 todo pasa de 30% y un corte
//    absoluto se convierte en un filtro de calendario disfrazado de filtro de acción.
{ const porDia=new Map();
  for(const tk of Object.keys(VOL)){ const D=Object.keys(P[tk]).sort();
    for(let i=0;i<D.length;i++){ const v=VOL[tk][i]; if(v==null) continue;
      if(!porDia.has(D[i])) porDia.set(D[i],[]); porDia.get(D[i]).push(v); } }
  const medDia=new Map();
  for(const [d,v] of porDia){ if(v.length<5) continue; v.sort((a,b)=>a-b); medDia.set(d, v[Math.floor(v.length/2)]); }
  for(const o of OPS){ const m=medDia.get(o.dC);
    o._volR=(o._vol!=null&&m!=null&&m>0)?o._vol/m:null; } }

// ── VOL CONTRA EL ÍNDICE: vol del nombre / vol del SPY ese mismo día. Es la versión
//    PORTÁTIL: no necesita una cesta de comparación, no depende de qué 27 o qué 60 mires,
//    y el régimen se va en la división (en 2020 sube el numerador y el denominador).
{ const iS=IDX['SPY'], vS=VOL['SPY'];
  for(const o of OPS){ o._volS=null; if(!iS||!vS||o._vol==null) continue;
    const i=iS.get(o.dC); if(i==null||vS[i]==null||vS[i]<=0) continue;
    o._volS=o._vol/vS[i]; } }

// iRec: primer día del camino en que la acción vuelve a estar por encima de su MA50 + margen
export function marcarRec(margen=0, espera=0){
  for(const o of OPS){ o.iRec=null; const dev=DEV[o.tk], idx=IDX[o.tk]; if(!dev||!idx) continue;
    for(let j=0;j<o.camino.length;j++){ const i=idx.get(o.camino[j][0]);
      if(i==null||dev[i]==null) continue;
      if(dev[i]>margen){ o.iRec=Math.min(o.camino.length-1, j+espera); break; } } } }

export function poner(fn){ let n=0; for(const o of OPS){ const v=fn(o); o.ma=(v==null)?999:v; if(v!=null)n++; } return n; }

export function medir(CF){ const F=[],A=[],C=[],S=[],O=[],T=[];
  for(let i=0;i<41;i++){ const cap=CAP*(1+(i-20)*0.005);
    const q=M.simular({...CF,capital:cap});
    F.push(q.final-cap);A.push(q.cagr);C.push(q.caida);S.push(q.sharpe);O.push(q.ops);T.push(q); }
  const j=Math.floor(41/2);
  return {dol:M.med(F)/M.ANOS, cagr:M.med(A), caida:M.med(C), sh:M.med(S), ops:M.med(O),
          q:T.sort((a,b)=>a.final-b.final)[j]}; }

// % del DINERO TOTAL GANADO que hace la operación mayor (sólo las ganadoras suman el total,
// que es la lectura conservadora: si una sola aporta casi todo lo ganado, es lotería).
export function mayor(q){
  if(!q.tom||!q.tom.length) return 0;
  const g=q.tom.map(t=>t.dinero*(t.mult-1)).sort((a,b)=>b-a);
  const pos=g.filter(x=>x>0).reduce((a,b)=>a+b,0);
  return pos>0?100*g[0]/pos:0; }

export const CFBASE={tam:0.024,huecos:10,modo:'spy',plazo:120,castigo:0.0138,suelo:0.50,costeMin:0};
export {M, OPS, DEV, SIG, VOL, IDX, UNI, ADJ, T200, T100, MOM};
export const fila=(nom,r,q)=> nom.padEnd(30)+('$'+Math.round(r.dol).toLocaleString('en-US')).padStart(11)+
  (r.cagr.toFixed(1)+'%').padStart(8)+('−'+r.caida.toFixed(0)+'%').padStart(7)+
  r.sh.toFixed(2).padStart(7)+String(r.ops).padStart(6)+(q!=null?(mayor(q).toFixed(0)+'%').padStart(7):'');
