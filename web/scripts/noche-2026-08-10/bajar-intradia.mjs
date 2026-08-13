// Intradia: para poder comparar VENDER EN LA APERTURA contra vender al cierre.
// Dos cosas: las barras de 30m del QQQ (para saber el precio a cada hora) y la cadena de
// puts cotizada cada 30m del viernes de entrada.
import fs from 'node:fs';
const S=process.argv[2], SYM='QQQ';
const DIR=S+'/theta-intra'; fs.mkdirSync(DIR,{recursive:true});
const B='http://127.0.0.1:25503/v3';

// 1. barras de 30m del subyacente, por año (poco peso)
for(let y=2020;y<=2026;y++){
  const f=`${DIR}/spot_${y}.csv`;
  if(fs.existsSync(f)&&fs.statSync(f).size>1000) continue;
  const r=await fetch(`${B}/stock/history/ohlc?symbol=${SYM}&start_date=${y}-01-01&end_date=${y}-12-31&interval=30m`,{signal:AbortSignal.timeout(300000)});
  const t=await r.text(); if(r.ok&&t.length>1000){ fs.writeFileSync(f,t); console.log('spot',y,(t.length/1e6).toFixed(1),'MB'); }
}

// 2. cadena de puts cada 30m, cada viernes, para la expiracion del viernes siguiente
const v=[]; { const d=new Date(Date.UTC(2020,0,3));
  while(d<new Date(Date.UTC(2026,7,1))){ v.push(d.toISOString().slice(0,10)); d.setUTCDate(d.getUTCDate()+7);} }
const pares=v.slice(0,-1).map((r,i)=>({rolo:r,exp:v[i+1]}));
let ok=0,mal=0,i=0;
await Promise.all(Array.from({length:4},async()=>{ while(i<pares.length){ const p=pares[i++];
  const f=`${DIR}/${SYM}_${p.rolo}_${p.exp}.csv`;
  if(fs.existsSync(f)&&fs.statSync(f).size>2000){ok++;continue;}
  try{ const r=await fetch(`${B}/option/history/quote?symbol=${SYM}&expiration=${p.exp}&start_date=${p.rolo}&end_date=${p.rolo}&right=P&interval=30m`,{signal:AbortSignal.timeout(180000)});
    const t=await r.text(); if(!r.ok||t.length<2000){mal++;continue;} fs.writeFileSync(f,t); ok++;
    if(ok%50===0) console.log('  ...',ok,'viernes');
  }catch{mal++;} } }));
console.log(`cadena intradia: ${ok} viernes, ${mal} sin datos`);
