// DESCARGA HONESTA DEL FLUJO — enero 2026, sin preselección de contratos.
//
// El descargador viejo (lib/thetadata.ts, fetchFlowRange) pedía el volumen de TODO EL AÑO,
// ordenaba por volumen x precio FINAL y se quedaba con los 60 mejores. Eso es elegir los
// contratos sabiendo cómo acabaron. Aquí se pide el volcado ENTERO de cada día y se filtra
// sólo por lo que se sabía en ese instante: tamaño de la operación y si se pagó el ask.
//
// Salida: cache-theta/flujo-limpio/TICKER_dAAAAMMDD.json
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";
const B="http://127.0.0.1:25503/v3";
const OUT=join(CACHE,"flujo-limpio"); if(!existsSync(OUT))mkdirSync(OUT,{recursive:true});
const TICKERS=["AAPL","AMD","HOOD","META","MSFT","NVDA","QQQ","SPY","TSLA"];
const MES="202601", MIN=500_000, CONC=4;

// los días de bolsa salen de las cadenas, no de un calendario escrito a mano
const dias=[...new Set(readdirSync(join(CACHE,"cadenas"))
  .map(f=>/^SPY_d(\d{8})\.json$/.exec(f)?.[1]).filter(d=>d&&d.startsWith(MES)))].sort();
console.log(`\n  ${dias.length} días de bolsa en ${MES}: ${dias[0]} a ${dias[dias.length-1]}`);
console.log(`  ${TICKERS.length} tickers · ${dias.length*TICKERS.length} descargas\n`);

const tareas=[]; for(const t of TICKERS) for(const d of dias) tareas.push({t,d});
let hechas=0, filasTot=0, guardadas=0, fallos=[], s478=0;
const t0=Date.now();

async function una({t,d}){
  const f=join(OUT,`${t}_d${d}.json`);
  if(existsSync(f)){ hechas++; return; }
  let txt=null;
  for(let i=0;i<12&&txt==null;i++){
    try{ const r=await fetch(`${B}/option/history/trade_quote?symbol=${t}&expiration=*&start_date=${d}&end_date=${d}`);
      if(r.status===200) txt=await r.text();
      else if(r.status===472||r.status===404){ writeFileSync(f,"[]"); hechas++; return; }  // sin datos ese día
      else if(r.status===478){ await r.text(); s478++; await new Promise(s=>setTimeout(s,20000)); }  // sesion saturada: esperar de verdad
      else { await r.text(); await new Promise(s=>setTimeout(s,3000*(i+1))); }
    }catch(e){ await new Promise(s=>setTimeout(s,3000*(i+1))); }
  }
  if(txt==null){ fallos.push(`${t} ${d}`); hechas++; return; }
  const li=txt.split("\n"); const h=li[0].split(",");
  const iE=h.indexOf("expiration"),iK=h.indexOf("strike"),iR=h.indexOf("right"),
        iP=h.indexOf("price"),iS=h.indexOf("size"),iB=h.indexOf("bid"),iA=h.indexOf("ask"),
        iT=h.indexOf("trade_timestamp");
  if(iE<0||iP<0||iA<0){ fallos.push(`${t} ${d} CABECERA RARA`); hechas++; return; }
  const out=[];
  for(const l of li.slice(1)){
    if(!l) continue;
    const c=l.split(",");
    const p=+c[iP], s=+c[iS];
    if(!(p>0&&s>0)) continue;
    const prima=p*s*100;
    if(prima<MIN) continue;
    out.push({ exp:String(c[iE]).replace(/[",-]/g,""), K:+c[iK], l:String(c[iR]).replace(/"/g,"")[0],
               precio:p, tam:s, prima, bid:+c[iB], ask:+c[iA], hora:c[iT] });
  }
  filasTot+=li.length-1; guardadas+=out.length;
  writeFileSync(f, JSON.stringify(out));
  hechas++;
  if(hechas%15===0){
    const seg=(Date.now()-t0)/1000;
    console.log(`  ${String(hechas).padStart(3)}/${tareas.length} · ${(filasTot/1e6).toFixed(1)}M operaciones leídas · ${guardadas.toLocaleString("en-US")} de $500k+ · ${seg.toFixed(0)}s · quedan ~${((seg/hechas)*(tareas.length-hechas)/60).toFixed(0)} min`);
  }
}
// 4 a la vez, que es el máximo del Terminal
const cola=[...tareas];
await Promise.all(Array.from({length:CONC},async()=>{ while(cola.length) await una(cola.shift()); }));
console.log(`\n  LISTO: ${hechas} descargas · ${(filasTot/1e6).toFixed(1)}M operaciones leídas · ${guardadas.toLocaleString("en-US")} de más de $500,000`);
if(fallos.length) console.log(`  ⚠ FALLARON ${fallos.length}: ${fallos.slice(0,10).join(" · ")}`);
console.log(`  en ${((Date.now()-t0)/60000).toFixed(1)} minutos\n`);
