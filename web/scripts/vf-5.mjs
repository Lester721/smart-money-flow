import {M,BASE,med41,fila,UNI,CAP,restaura} from './vf-base.mjs';
// calibracion rapida: `invertido` casi no depende del capital de partida. Se biseca con UNA
// corrida y luego se REPORTA el inv de la mediana de 41 para ver si cuadra.
const inv1=(cfg)=>M.simular({...cfg,capital:CAP}).invertido;
const cal=(cfg,obj)=>{let lo=0.0005,hi=0.25; for(let i=0;i<24;i++){const m=(lo+hi)/2; if(inv1({...cfg,tam:m})<obj)lo=m;else hi=m;} return (lo+hi)/2;};
const quita=(A)=>{restaura(); for(const o of M.OPS) if(A.includes(o.dC.slice(0,4))) o.ma=999;};
const umbral=(u)=>{restaura(); for(const o of M.OPS) if(o.ma<0 && -o.ma<u) o.ma=999;};
const VAR=[
 ['plana',           {}],
 ['k=1 sin tope',    {kv:1}],
 ['k=1 tope 2x',     {kv:1,topeMult:2}],
 ['k=2 tope 2x',     {kv:2,topeMult:2}],
 ['k=2 tope 3x',     {kv:2,topeMult:3}],
 ['k=2 sin tope',    {kv:2}],
];
const bloque=(et,cfgW,pre)=>{ if(pre)pre(); const obj=inv1({...BASE,...cfgW});
  console.log(`--- ${et} (objetivo inv ${obj.toFixed(2)}) ---`);
  const b=med41({...BASE,...cfgW});
  for(const [n,v] of VAR){ const tam=Object.keys(v).length?cal({...BASE,...cfgW,...v},obj):BASE.tam;
    const r=med41({...BASE,...cfgW,...v,tam});
    console.log(`  ${n.padEnd(14)} tb ${(tam*100).toFixed(3)}%  $/año ${String(Math.round(r.dol)).padStart(7)}  ratio ${(r.dol/b.dol).toFixed(2)}  sharpe ${r.sharpe.toFixed(3)}  caida ${r.caida.toFixed(1)}  ops ${String(r.ops).padStart(4)}  inv ${r.inv.toFixed(2)}`); } };
console.log(`═══ ${UNI} — variantes con TOPE al multiplicador ═══`);
bloque('TODO',{},restaura);
bloque('sin 2020+2025',{},()=>quita(['2020','2025']));
restaura();
bloque('16-19',{desdeD:'20160101',hasta:'20191231'},restaura);
bloque('20-22',{desdeD:'20200101',hasta:'20221231'},restaura);
bloque('23-26',{desdeD:'20230101',hasta:'20261231'},restaura);
// CONTROL: sin escalar el tamaño, solo subiendo el UMBRAL de elegibilidad (misma exposicion)
restaura(); const obj=inv1(BASE); const b=med41(BASE);
console.log(`--- CONTROL: umbral mas exigente, tamaño PLANO (objetivo inv ${obj.toFixed(2)}) ---`);
for(const u of [0.07,0.09,0.11,0.13]){ umbral(u); const tam=cal(BASE,obj); const r=med41({...BASE,tam});
  console.log(`  umbral ${(u*100).toFixed(0)}%  tam ${(tam*100).toFixed(3)}%  $/año ${String(Math.round(r.dol)).padStart(7)}  ratio ${(r.dol/b.dol).toFixed(2)}  sharpe ${r.sharpe.toFixed(3)}  caida ${r.caida.toFixed(1)}  ops ${String(r.ops).padStart(4)}  inv ${r.inv.toFixed(2)}`); }
