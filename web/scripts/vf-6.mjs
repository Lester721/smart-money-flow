import {M,BASE,med41,conc,UNI,CAP} from './vf-base.mjs';
const inv1=(c)=>M.simular({...c,capital:CAP}).invertido;
const cal=(c,o)=>{let lo=0.0005,hi=0.25;for(let i=0;i<24;i++){const m=(lo+hi)/2;if(inv1({...c,tam:m})<o)lo=m;else hi=m;}return (lo+hi)/2;};
const obj=inv1(BASE);
console.log(`═══ ${UNI} — concentracion ═══`);
for(const [n,v] of [['plana',{}],['k=2 tope 2x',{kv:2,topeMult:2}],['k=2 sin tope',{kv:2}]]){
  const tam=Object.keys(v).length?cal({...BASE,...v},obj):BASE.tam;
  const cfg={...BASE,...v,tam}; const c=conc(cfg); const r=med41(cfg);
  // sin la operacion MAYOR: se anula esa señal y se vuelve a correr
  const q=M.simular({...cfg,capital:CAP});
  const g=q.LIB.slice().sort((a,b)=>b.pnl-a.pnl)[0];
  const idx=[]; for(let i=0;i<M.OPS.length;i++) if(M.OPS[i].tk===g.tk&&M.OPS[i].dC===g.dC){idx.push(i);}
  const sv=idx.map(i=>M.OPS[i].ma); for(const i of idx)M.OPS[i].ma=999;
  const r2=med41(cfg); idx.forEach((i,j)=>M.OPS[i].ma=sv[j]);
  console.log(`  ${n.padEnd(13)} $/año ${String(Math.round(r.dol)).padStart(7)}  may/bruto ${c.mayorBruto.toFixed(1)}%  may/neto ${c.mayorNeto.toFixed(1)}%  top3 ${c.top3.toFixed(1)}%  mayor posicion ${c.mayorPos.toFixed(1)}% del cap inicial  | sin la mayor (${g.tk} ${g.dC}): $/año ${String(Math.round(r2.dol)).padStart(7)} (${(100*r2.dol/r.dol).toFixed(0)}%)`);
}
