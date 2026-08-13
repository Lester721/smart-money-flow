// La cadena del PROPIO dia de vencimiento: para poder valorar recomprar la put el viernes
// antes del cierre, en vez de dejar que te asignen.
import fs from 'node:fs';
const S=process.argv[2], SYM=process.argv[3]||'QQQ';
const DIR=S+'/theta-venc'; fs.mkdirSync(DIR,{recursive:true});
const B='http://127.0.0.1:25503/v3';
const v=[]; { const d=new Date(Date.UTC(2020,0,3));
  while(d<new Date(Date.UTC(2026,7,1))){ v.push(d.toISOString().slice(0,10)); d.setUTCDate(d.getUTCDate()+7);} }
let ok=0,mal=0,i=0;
await Promise.all(Array.from({length:4},async()=>{ while(i<v.length){ const f=v[i++];
  const fn=`${DIR}/${SYM}_${f}_P.csv`;
  if(fs.existsSync(fn)&&fs.statSync(fn).size>300){ok++;continue;}
  try{ const r=await fetch(`${B}/option/history/eod?symbol=${SYM}&expiration=${f}&start_date=${f}&end_date=${f}&right=P`,{signal:AbortSignal.timeout(120000)});
    const t=await r.text(); if(!r.ok||t.length<300){mal++;continue;} fs.writeFileSync(fn,t); ok++; }catch{mal++;} } }));
console.log(`${SYM}: ${ok} viernes con cadena de su propio vencimiento, ${mal} sin datos`);
