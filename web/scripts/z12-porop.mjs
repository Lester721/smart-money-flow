// Medición POR OPERACIÓN, sin motor de cartera: ¿la volatilidad ex-ante separa el
// multiplicador realizado? Sin solapar (una entrada por ticker cada 180 sesiones) para que
// las operaciones sean independientes y la t signifique algo.
import {M,OPS,UNI} from './z1-rescate27.mjs';
const kM=(1-0.0138/2)/(1+0.0138/2);
const real=(o)=>{ const n=Math.min(120, o.camino.length); let m=o.camino[n-1][1];
  for(let j=0;j<n;j++) if(o.camino[j][1]<=0.50){ m=o.camino[j][1]; break; }
  return m*kM; };
const el=OPS.filter(o=>o._dev!=null&&o._dev<-0.05&&o._dev>=-0.30&&o._vol!=null)
            .sort((a,b)=>a.dC<b.dC?-1:1);
const ult={}, sel=[];
for(const o of el){ const i=o.camino.length&&ult[o.tk]; // separación por fecha
  const d=Date.parse(o.dC.slice(0,4)+'-'+o.dC.slice(4,6)+'-'+o.dC.slice(6,8));
  if(ult[o.tk]&&(d-ult[o.tk])<180*86400000) continue;
  ult[o.tk]=d; sel.push({...o, x:real(o)}); }
const est=(A)=>{ const m=A.reduce((a,b)=>a+b,0)/A.length;
  const s=Math.sqrt(A.reduce((a,b)=>a+(b-m)**2,0)/(A.length-1)); return {m,s,n:A.length,se:s/Math.sqrt(A.length)}; };
console.log('\n══ UNIVERSO '+UNI+' ══   operaciones independientes (1 por ticker cada 180 días), hoyo −5%');
console.log('   n total = '+sel.length);
for(const v of [0.28,0.30,0.32]){
  const A=sel.filter(o=>o._vol>v).map(o=>o.x), B=sel.filter(o=>o._vol<=v).map(o=>o.x);
  const a=est(A), b=est(B);
  const t=(a.m-b.m)/Math.sqrt(a.se**2+b.se**2);
  console.log('   vol>'+(100*v).toFixed(0)+'%  dentro x̄='+a.m.toFixed(3)+' (n='+a.n+')   fuera x̄='+b.m.toFixed(3)+
    ' (n='+b.n+')   dif '+(a.m-b.m>=0?'+':'')+(a.m-b.m).toFixed(3)+'   t='+t.toFixed(2)); }
console.log('\n   quintiles de volatilidad ex-ante:');
const S=[...sel].sort((a,b)=>a._vol-b._vol); const q=Math.floor(S.length/5);
for(let k=0;k<5;k++){ const s=S.slice(k*q, k===4?S.length:(k+1)*q); const e=est(s.map(o=>o.x));
  console.log('    Q'+(k+1)+'  vol '+(100*s[0]._vol).toFixed(0)+'–'+(100*s[s.length-1]._vol).toFixed(0)+
    '%   n='+String(e.n).padStart(4)+'   x̄='+e.m.toFixed(3)+'   ganan >1x: '+
    (100*s.filter(o=>o.x>1).length/s.length).toFixed(0)+'%'); }
// las dos mitades del calendario
console.log('\n   la misma separación (vol>30%) en cada mitad del calendario:');
for(const [n,f] of [['2016-2020',o=>o.dC<'20210101'],['2021-2026',o=>o.dC>='20210101']]){
  const s=sel.filter(f); const A=est(s.filter(o=>o._vol>0.30).map(o=>o.x)), B=est(s.filter(o=>o._vol<=0.30).map(o=>o.x));
  const t=(A.m-B.m)/Math.sqrt(A.se**2+B.se**2);
  console.log('    '+n+'   dentro '+A.m.toFixed(3)+' (n='+A.n+')   fuera '+B.m.toFixed(3)+' (n='+B.n+')   dif '+
    (A.m-B.m>=0?'+':'')+(A.m-B.m).toFixed(3)+'   t='+t.toFixed(2)); }
