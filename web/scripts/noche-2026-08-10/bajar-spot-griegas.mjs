// El precio del QQQ a cada media hora, sacado del MISMO sitio que las cotizaciones de
// opciones: el endpoint de griegas, columna underlying_price.
//
// Motivo: las barras OHLC de acciones se etiquetan por la hora en que EMPIEZA la barra, y su
// campo `close` es el precio de MEDIA HORA DESPUES. Cruzarlas con cotizaciones selladas a las
// 10:00 metia media hora de futuro en la eleccion del strike. Comprobado el 2026-07-17:
// griegas 10:30 = 697,02 y barra "10:00".close = 697,0299 — el mismo instante.
import fs from 'node:fs';
const S=process.argv[2]; const DIR=S+'/theta-griegas'; fs.mkdirSync(DIR,{recursive:true});
const B='http://127.0.0.1:25503/v3';
const P=JSON.parse(fs.readFileSync(S+'/precios.json','utf8')).QQQ;
const px=new Map(P.map(b=>[b.d,b.c]));
const v=[]; { const d=new Date(Date.UTC(2020,0,3));
  while(d<new Date(Date.UTC(2026,7,1))){ v.push(d.toISOString().slice(0,10)); d.setUTCDate(d.getUTCDate()+7);} }
const pares=v.slice(0,-1).map((r,i)=>({rolo:r,exp:v[i+1]}));
let ok=0,mal=0,i=0;
await Promise.all(Array.from({length:4},async()=>{ while(i<pares.length){ const p=pares[i++];
  const f=`${DIR}/QQQ_${p.rolo}.csv`;
  if(fs.existsSync(f)&&fs.statSync(f).size>300){ok++;continue;}
  const S0=px.get(p.rolo); if(S0==null){mal++;continue;}
  let hecho=false;
  for(const k of [Math.round(S0),Math.round(S0)+1,Math.round(S0)-1,Math.round(S0/5)*5]){
    if(hecho) break;
    try{
      const r=await fetch(`${B}/option/history/greeks/implied_volatility?symbol=QQQ&expiration=${p.exp}&start_date=${p.rolo}&end_date=${p.rolo}&right=P&strike=${k}&interval=30m`,{signal:AbortSignal.timeout(120000)});
      const t=await r.text(); if(!r.ok||t.length<300) continue;
      const lin=t.split('\n'), cab=lin[0].split(',');
      const iT=cab.indexOf('timestamp'), iU=cab.indexOf('underlying_price');
      if(iU<0) continue;
      const filas=[];
      for(let x=1;x<lin.length;x++){ const c=lin[x].split(','); if(c.length<cab.length) continue;
        const u=+c[iU]; if(u>0) filas.push(`${c[iT]},${u}`); }
      if(filas.length>5){ fs.writeFileSync(f,'timestamp,close\n'+filas.join('\n')); hecho=true; ok++; }
    }catch{}
  }
  if(!hecho) mal++;
} }));
console.log(`spot por griegas: ${ok} viernes, ${mal} sin datos`);
