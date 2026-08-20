// LA ÚNICA PUERTA QUE QUEDA. La descomposición dice que el 66% del movimiento pasa entre la
// apertura y las 11:00. Si se corta ANTES, parte de ese tramo todavía es futuro.
// Cortes 09:45 / 10:00 / 10:30 · entrada = primera impresión real ≥ corte · salida = cierre.
import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib";
import { listonT } from "../../lib/barreraHallazgos.ts";
const RAIZ=path.join("scripts","cache-theta","marketsnack");
const DIR=path.join(RAIZ,"flujo-100k"), CH=path.join(RAIZ,"aux","chart-all");
const CORTES=[9*60+45,10*60,10*60+30], MIN_OPS=5, MIN_SIM=20;
const PROXY={SPX:"SPY",SPXW:"SPY",XSP:"SPY",NDX:"QQQ",NDXP:"QQQ",RUT:"IWM"};
const APAL=new Set(["TQQQ","SOXL","SQQQ","SOXS","UVXY","TZA","TNA","SPXU","UPRO","LABU","LABD","YINN","FNGU","NVDL","TSLL","BOIL","KOLD","VXX","SVIX","UVIX"]);
const COMPRA=new Set(["ABOVE_ASK","AT_ASK","ASKSIDE"]), VENTA=new Set(["BELOW_BID","AT_BID","BIDSIDE"]);
const parseOcc=(s)=>{const k=s.slice(-8),t=s.slice(-9,-8),d=s.slice(-15,-9),u=s.slice(0,-15);
  return (/^\d{8}$/.test(k)&&/^[CP]$/.test(t)&&/^\d{6}$/.test(d)&&u)?{u,call:t==="C"}:null;};
const cierres=new Map();
for(const f of fs.readdirSync(CH)){ if(!f.endsWith(".json.gz"))continue; let j;
  try{ j=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CH,f))).toString("utf8")); }catch{continue;}
  const d=j?.data??[]; if(d.length<60)continue;
  cierres.set(f.replace(".json.gz",""),{c:d.map(p=>p.v),idx:new Map(d.map((p,i)=>[p.t.slice(0,10),i]))}); }
const dias=fs.readdirSync(DIR).filter(f=>f.endsWith(".jsonl.gz")).map(f=>f.slice(0,10)).sort();
const A=CORTES.map(()=>new Map()), EN=CORTES.map(()=>new Map());
for(const dia of dias){
  for(const l of zlib.gunzipSync(fs.readFileSync(path.join(DIR,`${dia}.jsonl.gz`))).toString("utf8").split("\n")){
    if(!l)continue; const r=JSON.parse(l); const o=parseOcc(r.symbol); if(!o)continue;
    const T=PROXY[o.u]??o.u; if(APAL.has(T)||!cierres.has(T))continue;
    const min=(Date.parse(r.timestamp)-4*3600e3)/60000%1440, k=`${T}|${dia}`;
    for(let c=0;c<CORTES.length;c++){
      if(o.u===T&&r.asset_price>0&&min>=CORTES[c]){ const b=EN[c].get(k); if(!b||min<b.min) EN[c].set(k,{min,px:r.asset_price}); }
      if(min>=CORTES[c]||r.side==null) continue;
      const comp=COMPRA.has(r.side),vend=VENTA.has(r.side); if(!comp&&!vend)continue;
      if(r.ask_price===0||r.bid_price===0)continue;
      const p=r.premium||0,dl=Number.isFinite(r.delta)?r.delta:null,sg=comp?1:-1;
      let a=A[c].get(k); if(!a){a={T,dia,n:0,Cc:0,Cv:0,Pc:0,Pv:0,dn:0,dnDen:0};A[c].set(k,a);}
      a.n++; if(o.call){comp?a.Cc+=p:a.Cv+=p;}else{comp?a.Pc+=p:a.Pv+=p;}
      if(dl!=null){a.dn+=sg*dl*p;a.dnDen+=p;} } }
}
const media=(v)=>v.length?v.reduce((a,x)=>a+x,0)/v.length:0;
const sd=(v)=>{if(v.length<2)return 0;const m=media(v);return Math.sqrt(v.reduce((a,x)=>a+(x-m)**2,0)/(v.length-1));};
const tU=(v)=>{const s=sd(v);return s>0?media(v)/(s/Math.sqrt(v.length)):0;};
const PRUEBAS=48+4*3; const LIST=listonT(PRUEBAS);
console.log(`PRUEBAS TOTALES DECLARADAS: ${PRUEBAS} → listón |t| = ${LIST}\n`);
console.log(`corte  métrica     días  símb/día  L/S corte→cierre    t    días>0  3 tercios`);
for(let c=0;c<CORTES.length;c++){
  const filas=[];
  for(const a of A[c].values()){
    if(a.n<MIN_OPS)continue; const Tot=a.Cc+a.Cv+a.Pc+a.Pv; if(!(Tot>0))continue;
    const s=cierres.get(a.T),i=s.idx.get(a.dia); if(i==null)continue; const cie=s.c[i];
    const pe=EN[c].get(`${a.T}|${a.dia}`); if(!pe||!(cie>0)||Math.abs(pe.px/cie-1)>0.15)continue;
    filas.push({T:a.T,dia:a.dia,r:cie/pe.px-1,
      netoCall:(a.Cc-a.Cv)/Tot,netoPut:(a.Pc-a.Pv)/Tot,direccion:(a.Cc-a.Cv-a.Pc+a.Pv)/Tot,
      deltaNeto:a.dnDen>0?a.dn/a.dnDen:null}); }
  const porDia=new Map(); for(const f of filas){let g=porDia.get(f.dia);if(!g){g=[];porDia.set(f.dia,g);}g.push(f);}
  const et=`${String(Math.floor(CORTES[c]/60)).padStart(2,"0")}:${String(CORTES[c]%60).padStart(2,"0")}`;
  const tam=[];
  for(const m of ["netoCall","netoPut","direccion","deltaNeto"]){
    const S=[];
    for(const [d,g] of [...porDia].sort()){ const v=g.filter(x=>x[m]!=null); if(v.length<MIN_SIM)continue;
      const o=[...v].sort((a,b)=>a[m]-b[m]),k=Math.floor(o.length/3); if(k<5)continue;
      S.push(media(o.slice(-k).map(x=>x.r))-media(o.slice(0,k).map(x=>x.r)));
      if(m==="deltaNeto") tam.push(v.length); }
    const k=Math.floor(S.length/3);
    const ter=[S.slice(0,k),S.slice(k,2*k),S.slice(2*k)].map(g=>media(g));
    console.log(`${et}  ${m.padEnd(10)} ${String(S.length).padStart(4)}  ${String(Math.round(media(tam)||0)).padStart(6)}   ${(media(S)*100).toFixed(3).padStart(8)}%  ${tU(S).toFixed(2).padStart(6)}  ${String(S.filter(x=>x>0).length).padStart(3)}/${S.length}   ${ter.map(x=>x>=0?"+":"−").join("")} [${ter.map(x=>(x*100).toFixed(2)).join(" ")}]`);
  }
  console.log("");
}
