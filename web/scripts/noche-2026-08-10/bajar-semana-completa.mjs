// Toda la semana de cotizaciones de cada vencimiento semanal de QQQ: hace falta para poder
// probar un STOP LOSS (saber cuánto costaba recomprar el martes, el miércoles...).
// Una peticion por semana trae los 5-6 dias de esa expiracion.
import fs from 'node:fs';
const S=process.argv[2]; const DIR=S+'/theta-semana'; fs.mkdirSync(DIR,{recursive:true});
const B='http://127.0.0.1:25503/v3';
const v=[]; {const d=new Date(Date.UTC(2020,0,3));
 while(d<new Date(Date.UTC(2026,7,8))){v.push(d.toISOString().slice(0,10)); d.setUTCDate(d.getUTCDate()+7);}}
const pares=v.slice(0,-1).map((r,i)=>({rolo:r,exp:v[i+1]}));
let ok=0,mal=0,i=0;
await Promise.all(Array.from({length:4},async()=>{ while(i<pares.length){ const p=pares[i++];
  const f=`${DIR}/QQQ_${p.rolo}_${p.exp}.csv`;
  if(fs.existsSync(f)&&fs.statSync(f).size>2000){ok++;continue;}
  try{ const r=await fetch(`${B}/option/history/eod?symbol=QQQ&expiration=${p.exp}&start_date=${p.rolo}&end_date=${p.exp}&right=P`,{signal:AbortSignal.timeout(180000)});
    const t=await r.text(); if(!r.ok||t.length<2000){mal++;continue;} fs.writeFileSync(f,t); ok++;
    if(ok%50===0) console.log('  ...',ok);
  }catch{mal++;} } }));
console.log(`semana completa: ${ok} semanas, ${mal} sin datos`);
