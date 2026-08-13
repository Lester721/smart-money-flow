// El precio del QQQ cada 30 min en 2020, que la suscripcion de ACCIONES no da.
// Se saca del endpoint de griegas de OPCIONES, que si llega a 2020 y trae la columna
// underlying_price. Filtrado a UN strike: 2 KB por peticion en vez de 18 MB.
import fs from 'node:fs';
const S=process.argv[2]; const DIR=S+'/theta-intra';
const B='http://127.0.0.1:25503/v3';
const P=JSON.parse(fs.readFileSync(S+'/precios.json','utf8')).QQQ;
const px=new Map(P.map(b=>[b.d,b.c]));

const v=[]; { const d=new Date(Date.UTC(2020,0,3));
  while(d<new Date(Date.UTC(2021,0,8))){ v.push(d.toISOString().slice(0,10)); d.setUTCDate(d.getUTCDate()+7);} }
const pares=v.slice(0,-1).map((r,i)=>({rolo:r,exp:v[i+1]}));

let ok=0,mal=0,i=0;
const filas=[];
await Promise.all(Array.from({length:4},async()=>{ while(i<pares.length){ const p=pares[i++];
  const S0=px.get(p.rolo); if(S0==null){mal++;continue;}
  // se prueban varios strikes cercanos: no todos existen en cada vencimiento
  let hecho=false;
  for(const k of [Math.round(S0), Math.round(S0)+1, Math.round(S0)-1, Math.round(S0/5)*5]){
    if(hecho) break;
    try{
      const r=await fetch(`${B}/option/history/greeks/implied_volatility?symbol=QQQ&expiration=${p.exp}&start_date=${p.rolo}&end_date=${p.rolo}&right=P&strike=${k}&interval=30m`,{signal:AbortSignal.timeout(120000)});
      const t=await r.text(); if(!r.ok||t.length<300) continue;
      const lin=t.split('\n'), cab=lin[0].split(',');
      const iT=cab.indexOf('timestamp'), iU=cab.indexOf('underlying_price');
      if(iU<0) continue;
      let n=0;
      for(let x=1;x<lin.length;x++){ const c=lin[x].split(','); if(c.length<cab.length) continue;
        const u=+c[iU]; if(!(u>0)) continue;
        filas.push(`${c[iT]},${u}`); n++; }
      if(n>5){ hecho=true; ok++; }
    }catch{}
  }
  if(!hecho) mal++;
} }));
fs.writeFileSync(`${DIR}/spot_2020-porGriegas.csv`,'timestamp,close\n'+filas.join('\n'));
console.log(`spot 2020 via griegas: ${ok} viernes, ${mal} sin datos, ${filas.length} barras`);
