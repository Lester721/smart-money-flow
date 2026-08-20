import fs from 'node:fs';
const C=56389;
const f0=JSON.parse(fs.readFileSync('scripts/cache-theta/_nulo-mezcla-filas.json','utf8'));
const media=a=>a.reduce((x,y)=>x+y,0)/a.length;
const curva=rs=>{let e=1;const c=[1];for(const r of rs){e*=1+r;c.push(e);}return c;};
const mdd=rs=>{const c=curva(rs);let p=c[0],m=0;for(const v of c){if(v>p)p=v;m=Math.max(m,1-v/p);}return m;};
const años=f=>f.reduce((a,x)=>a+x.dur,0)/365.25;
const cagr=(rs,f)=>Math.pow(curva(rs).at(-1),1/años(f))-1;
const peor=rs=>Math.min(...rs);
const casarPeor=(f,o)=>{let lo=0,hi=1;for(let i=0;i<60;i++){const m=(lo+hi)/2;if(peor(f.map(x=>m*x.rQqq))>o)lo=m;else hi=m;}return (lo+hi)/2;};
for(const a of [...new Set(f0.map(x=>x.fecha.slice(0,4)))].sort()){
 const f=f0.filter(x=>x.fecha.startsWith(a));
 const rm=f.map(x=>0.5*x.rQqq+0.5*x.rPut);
 const w=casarPeor(f,peor(rm));
 const rb=f.map(x=>w*x.rQqq);
 const d=cagr(rm,f)-cagr(rb,f);
 console.log(`${a} n=${String(f.length).padStart(3)} mezcla ${(100*cagr(rm,f)).toFixed(1).padStart(6)}%/año caida ${(100*mdd(rm)).toFixed(1).padStart(5)}% ($${Math.round(C*mdd(rm)).toLocaleString('es')}) | indice casado peor-semana ${(100*w).toFixed(0).padStart(3)}% → ventaja ${(d>=0?'+':'')+'$'+Math.round(C*d).toLocaleString('es')}/año`);
}
