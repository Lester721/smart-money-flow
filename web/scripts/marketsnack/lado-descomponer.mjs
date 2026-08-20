// ¿DÓNDE ESTÁ EL MOVIMIENTO? El mismo día da t≈9,7 y el tramo corte→cierre da t≈−0,5.
// Se parte el día en tres tramos con PRECIOS REALES y se mira en cuál vive.
//   hueco    : cierre(D-1) → primera impresión del día D (primer asset_price del propio root)
//   mañana   : primera impresión → precio en el corte (primera impresión ≥ 11:00)
//   tarde    : precio en el corte → cierre(D)
// La señal se forma con operaciones ANTERIORES a las 11:00, así que hueco y mañana son PASADO
// respecto a la señal: si el movimiento vive ahí, la señal es un espejo, no un aviso.
import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib";
const RAIZ=path.join("scripts","cache-theta","marketsnack");
const DIR=path.join(RAIZ,"flujo-100k"), CH=path.join(RAIZ,"aux","chart-all");
const CORTE=11*60, MIN_OPS=10;
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
const A=new Map(), PRI=new Map(), COR=new Map();
for(const dia of dias){
  for(const l of zlib.gunzipSync(fs.readFileSync(path.join(DIR,`${dia}.jsonl.gz`))).toString("utf8").split("\n")){
    if(!l)continue; const r=JSON.parse(l); const o=parseOcc(r.symbol); if(!o)continue;
    const T=PROXY[o.u]??o.u; if(APAL.has(T)||!cierres.has(T))continue;
    const min=(Date.parse(r.timestamp)-4*3600e3)/60000%1440, k=`${T}|${dia}`;
    if(o.u===T&&r.asset_price>0){
      const a=PRI.get(k); if(!a||min<a.min) PRI.set(k,{min,px:r.asset_price});
      if(min>=CORTE){ const b=COR.get(k); if(!b||min<b.min) COR.set(k,{min,px:r.asset_price}); } }
    if(min>=CORTE||r.side==null)continue;
    const comp=COMPRA.has(r.side),vend=VENTA.has(r.side); if(!comp&&!vend)continue;
    if(r.ask_price===0||r.bid_price===0)continue;
    const p=r.premium||0,dl=Number.isFinite(r.delta)?r.delta:null,sg=comp?1:-1;
    let a=A.get(k); if(!a){a={T,dia,n:0,Cc:0,Cv:0,Pc:0,Pv:0,dn:0,dnDen:0};A.set(k,a);}
    a.n++; if(o.call){comp?a.Cc+=p:a.Cv+=p;}else{comp?a.Pc+=p:a.Pv+=p;}
    if(dl!=null){a.dn+=sg*dl*p;a.dnDen+=p;} }
}
const filas=[];
for(const a of A.values()){
  if(a.n<MIN_OPS||a.dnDen<=0)continue;
  const Tot=a.Cc+a.Cv+a.Pc+a.Pv; if(!(Tot>0))continue;
  const s=cierres.get(a.T),i=s.idx.get(a.dia); if(i==null||i===0)continue;
  const k=`${a.T}|${a.dia}`, pri=PRI.get(k), cor=COR.get(k); if(!pri||!cor)continue;
  const prev=s.c[i-1], cie=s.c[i];
  if(!(prev>0&&cie>0))continue;
  if(Math.abs(pri.px/cie-1)>0.15||Math.abs(cor.px/cie-1)>0.15)continue;
  filas.push({T:a.T,dia:a.dia,q:a.dn/a.dnDen,
    hueco:pri.px/prev-1, manana:cor.px/pri.px-1, tarde:cie/cor.px-1, total:cie/prev-1});
}
const media=(v)=>v.length?v.reduce((x,y)=>x+y,0)/v.length:0;
const sd=(v)=>{const m=media(v);return Math.sqrt(v.reduce((a,x)=>a+(x-m)**2,0)/(v.length-1));};
const tU=(v)=>media(v)/(sd(v)/Math.sqrt(v.length));
const porDia=new Map(); for(const f of filas){let g=porDia.get(f.dia);if(!g){g=[];porDia.set(f.dia,g);}g.push(f);}
const S={hueco:[],manana:[],tarde:[],total:[]};
for(const [d,g] of porDia){ if(g.length<20)continue;
  const o=[...g].sort((a,b)=>a.q-b.q),k=Math.floor(o.length/3); if(k<5)continue;
  for(const t of ["hueco","manana","tarde","total"])
    S[t].push(media(o.slice(-k).map(x=>x[t]))-media(o.slice(0,k).map(x=>x[t]))); }
console.log(`n=${filas.length} filas · ${S.total.length} días · métrica deltaNeto, corte 11:00 ET\n`);
console.log(`tramo                                   L/S medio      t     días>0`);
const nom={hueco:"hueco  cierre(D-1) → 1ª impresión",manana:"mañana 1ª impresión → 11:00",tarde:"TARDE  11:00 → cierre  (FUTURO)",total:"día entero cierre(D-1)→cierre(D)"};
for(const t of ["hueco","manana","tarde","total"])
  console.log(`${nom[t].padEnd(38)} ${(media(S[t])*100).toFixed(3).padStart(7)}%  ${tU(S[t]).toFixed(2).padStart(6)}   ${S[t].filter(x=>x>0).length}/${S[t].length}`);
console.log(`\nreparto del día entero: hueco ${(100*media(S.hueco)/media(S.total)).toFixed(0)}% · mañana ${(100*media(S.manana)/media(S.total)).toFixed(0)}% · tarde ${(100*media(S.tarde)/media(S.total)).toFixed(0)}%`);
