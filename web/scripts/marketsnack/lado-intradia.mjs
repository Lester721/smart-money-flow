// ENTRAR EN EL CORTE, NO EN EL CIERRE.
// El placebo destapó que la co-variación del MISMO DÍA es t≈9,7 y +1,7%, mientras que el
// desbordamiento al día siguiente es sólo +0,37%. O sea: casi toda la información del lado ya
// está en el precio al cierre. La pregunta que queda es si se puede cobrar el trozo de ese
// movimiento que va DEL CORTE AL CIERRE — que sí es futuro respecto a la señal.
//
// PRECIO DE ENTRADA REAL, NO INVENTADO: cada fila del flujo trae `asset_price`, el precio del
// subyacente EN EL INSTANTE de esa operación. Se usa el de la PRIMERA operación con hora ≥ CORTE
// (no la última anterior: ésa ya pasó y sería optimista). Salida = cierre del día, verificado
// contra ThetaData. Ningún precio de modelo en el camino.
import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib";
const RAIZ=path.join("scripts","cache-theta","marketsnack");
const DIR=path.join(RAIZ,"flujo-100k"), CH=path.join(RAIZ,"aux","chart-all");
const CORTES=[11*60,12*60,14*60], MIN_OPS=10, MIN_SIM=20;
const PROXY={SPX:"SPY",SPXW:"SPY",XSP:"SPY",NDX:"QQQ",NDXP:"QQQ",RUT:"IWM"};
const APAL=new Set(["TQQQ","SOXL","SQQQ","SOXS","UVXY","TZA","TNA","SPXU","UPRO","LABU","LABD","YINN","FNGU","NVDL","TSLL","BOIL","KOLD","VXX","SVIX","UVIX"]);
const COMPRA=new Set(["ABOVE_ASK","AT_ASK","ASKSIDE"]), VENTA=new Set(["BELOW_BID","AT_BID","BIDSIDE"]);
const parseOcc=(s)=>{ if(!s||s.length<16)return null; const k=s.slice(-8),t=s.slice(-9,-8),d=s.slice(-15,-9),u=s.slice(0,-15);
  if(!/^\d{8}$/.test(k)||!/^[CP]$/.test(t)||!/^\d{6}$/.test(d)||!u)return null; return {u,call:t==="C"}; };

const cierres=new Map();
for(const f of fs.readdirSync(CH)){ if(!f.endsWith(".json.gz"))continue;
  let j; try{ j=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CH,f))).toString("utf8")); }catch{continue;}
  const d=j?.data??[]; if(d.length<60)continue;
  cierres.set(f.replace(".json.gz",""),{c:d.map(p=>p.v),idx:new Map(d.map((p,i)=>[p.t.slice(0,10),i]))}); }

const dias=fs.readdirSync(DIR).filter(f=>f.endsWith(".jsonl.gz")).map(f=>f.slice(0,10)).sort();
const A=CORTES.map(()=>new Map());
// NOTA: PROXY manda el flujo de SPX/SPXW al SPY, pero el asset_price de una fila de SPX es el
// nivel del ÍNDICE, no el del ETF. Para el precio de entrada se guarda por ROOT ORIGINAL.
const precioEntrada=CORTES.map(()=>new Map());   // `${root}|${dia}` -> {min, px}
let sinEntrada=0;

for(const dia of dias){
  const ls=zlib.gunzipSync(fs.readFileSync(path.join(DIR,`${dia}.jsonl.gz`))).toString("utf8").split("\n");
  for(const l of ls){ if(!l)continue; const r=JSON.parse(l);
    const o=parseOcc(r.symbol); if(!o) continue;
    const T=PROXY[o.u]??o.u; if(APAL.has(T)||!cierres.has(T)) continue;
    const minET=(Date.parse(r.timestamp)-4*3600e3)/60000%1440;
    // precio de entrada: primera operación DEL PROPIO ROOT del ETF/acción con hora ≥ corte
    if(o.u===T && r.asset_price>0){
      for(let c=0;c<CORTES.length;c++){ if(minET<CORTES[c]) continue;
        const k=`${T}|${dia}`; const p=precioEntrada[c].get(k);
        if(!p||minET<p.min) precioEntrada[c].set(k,{min:minET,px:r.asset_price}); } }
    if(r.side==null) continue;
    const comp=COMPRA.has(r.side), vend=VENTA.has(r.side); if(!comp&&!vend) continue;
    if(r.ask_price===0||r.bid_price===0||(r.ask_price!=null&&r.bid_price!=null&&r.ask_price<r.bid_price)) continue;
    const p=r.premium||0, dl=Number.isFinite(r.delta)?r.delta:null, sg=comp?1:-1;
    for(let c=0;c<CORTES.length;c++){ if(minET>=CORTES[c])continue;
      const k=`${T}|${dia}`; let a=A[c].get(k); if(!a){a={T,dia,n:0,Cc:0,Cv:0,Pc:0,Pv:0,dn:0,dnDen:0};A[c].set(k,a);}
      a.n++; if(o.call){ if(comp)a.Cc+=p; else a.Cv+=p; } else { if(comp)a.Pc+=p; else a.Pv+=p; }
      if(dl!=null){ a.dn+=sg*dl*p; a.dnDen+=p; } }
  }
  process.stdout.write(`\r  ${dia}   `);
}
console.log("");

const salida={};
for(let c=0;c<CORTES.length;c++){
  const filas=[];
  for(const a of A[c].values()){
    if(a.n<MIN_OPS) continue;
    const Tot=a.Cc+a.Cv+a.Pc+a.Pv; if(!(Tot>0)) continue;
    const s=cierres.get(a.T), i=s.idx.get(a.dia); if(i==null) continue;
    const cierre=s.c[i]; if(!(cierre>0)) continue;
    const pe=precioEntrada[c].get(`${a.T}|${a.dia}`);
    if(!pe){ sinEntrada++; continue; }                        // sin precio real de entrada NO se inventa
    // cordura: el precio de entrada tiene que estar cerca del cierre del día (mismo instrumento)
    if(Math.abs(pe.px/cierre-1)>0.15) { sinEntrada++; continue; }
    filas.push({ ticker:a.T, fecha:a.dia, n:a.n, minEntrada:pe.min, pxEntrada:pe.px,
      netoCall:(a.Cc-a.Cv)/Tot, netoPut:(a.Pc-a.Pv)/Tot, direccion:(a.Cc-a.Cv-a.Pc+a.Pv)/Tot,
      deltaNeto:a.dnDen>0?a.dn/a.dnDen:null, rIntra: cierre/pe.px-1 });
  }
  const porDia=new Map(); for(const f of filas){ let g=porDia.get(f.fecha); if(!g){g=[];porDia.set(f.fecha,g);} g.push(f); }
  const buenos=[];
  for(const [d,g] of porDia){ if(g.length<MIN_SIM) continue;
    for(const m of ["netoCall","netoPut","direccion","deltaNeto"]){
      const v=g.filter(f=>f[m]!=null).sort((x,y)=>x[m]-y[m]); v.forEach((f,i)=>{f[`q_${m}`]=v.length>1?i/(v.length-1):0.5;}); }
    buenos.push(...g); }
  const et=`${String(Math.floor(CORTES[c]/60)).padStart(2,"0")}:00`;
  const rez=buenos.map(f=>f.minEntrada-CORTES[c]).sort((a,b)=>a-b);
  console.log(`corte ${et} → ${buenos.length} filas · ${new Set(buenos.map(f=>f.fecha)).size} días · ${new Set(buenos.map(f=>f.ticker)).size} tickers · retraso de la entrada p50 ${rez[Math.floor(rez.length/2)]}min p90 ${rez[Math.floor(rez.length*0.9)]}min`);
  salida[et]=buenos;
}
console.log(`descartadas por no tener precio real de entrada: ${sinEntrada}`);
fs.writeFileSync("scripts/marketsnack/lado-intradia.json", JSON.stringify(salida));
