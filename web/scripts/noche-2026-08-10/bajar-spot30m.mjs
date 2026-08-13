// El precio del QQQ cada 30 minutos. La API limita a 1 MES por peticion — por eso fallo
// silenciosamente la primera vez (devolvia un texto de error, no datos, y mi comprobacion
// de tamaño lo descarto sin decir nada).
import fs from 'node:fs';
const S=process.argv[2]; const DIR=S+'/theta-intra'; fs.mkdirSync(DIR,{recursive:true});
const B='http://127.0.0.1:25503/v3';
const meses=[];
for(let y=2020;y<=2026;y++) for(let m=1;m<=12;m++){
  const k=`${y}-${String(m).padStart(2,'0')}`; if(k>'2026-08') continue;
  meses.push({k, ini:`${k}-01`, fin:new Date(Date.UTC(y,m,0)).toISOString().slice(0,10)});
}
let ok=0,mal=0,i=0;
await Promise.all(Array.from({length:4},async()=>{ while(i<meses.length){ const m=meses[i++];
  const f=`${DIR}/spot_${m.k}.csv`;
  if(fs.existsSync(f)&&fs.statSync(f).size>1000){ok++;continue;}
  try{ const r=await fetch(`${B}/stock/history/ohlc?symbol=QQQ&start_date=${m.ini}&end_date=${m.fin}&interval=30m`,{signal:AbortSignal.timeout(120000)});
    const t=await r.text();
    if(!r.ok||t.length<1000||t.startsWith('Bulk')){ mal++; console.log('FALLO',m.k,t.slice(0,60)); continue; }
    fs.writeFileSync(f,t); ok++;
  }catch(e){ mal++; console.log('ERROR',m.k,String(e).slice(0,60)); } } }));
console.log(`spot 30m: ${ok} meses, ${mal} fallos`);
