import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib";
const RAIZ=path.join("scripts","cache-theta","marketsnack");
const DIR=path.join(RAIZ,"flujo-100k"), CH=path.join(RAIZ,"aux","chart-all");
const CORTE=9*60+45, MIN_OPS=5, MIN_SIM=20;
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
const A=new Map(), EN=new Map();
for(const dia of dias){
  for(const l of zlib.gunzipSync(fs.readFileSync(path.join(DIR,`${dia}.jsonl.gz`))).toString("utf8").split("\n")){
    if(!l)continue; const r=JSON.parse(l); const o=parseOcc(r.symbol); if(!o)continue;
    const T=PROXY[o.u]??o.u; if(APAL.has(T)||!cierres.has(T))continue;
    const min=(Date.parse(r.timestamp)-4*3600e3)/60000%1440, k=`${T}|${dia}`;
    if(o.u===T&&r.asset_price>0&&min>=CORTE){ const b=EN.get(k); if(!b||min<b.min) EN.set(k,{min,px:r.asset_price}); }
    if(min>=CORTE||r.side==null)continue;
    const comp=COMPRA.has(r.side),vend=VENTA.has(r.side); if(!comp&&!vend)continue;
    if(r.ask_price===0||r.bid_price===0)continue;
    const p=r.premium||0,dl=Number.isFinite(r.delta)?r.delta:null,sg=comp?1:-1;
    let a=A.get(k); if(!a){a={T,dia,n:0,Cc:0,Cv:0,Pc:0,Pv:0,dn:0,dnDen:0};A.set(k,a);}
    a.n++; if(o.call){comp?a.Cc+=p:a.Cv+=p;}else{comp?a.Pc+=p:a.Pv+=p;}
    if(dl!=null){a.dn+=sg*dl*p;a.dnDen+=p;} } }
const filas=[];
for(const a of A.values()){ if(a.n<MIN_OPS)continue; const Tot=a.Cc+a.Cv+a.Pc+a.Pv; if(!(Tot>0))continue;
  const s=cierres.get(a.T),i=s.idx.get(a.dia); if(i==null)continue; const cie=s.c[i];
  const pe=EN.get(`${a.T}|${a.dia}`); if(!pe||!(cie>0)||Math.abs(pe.px/cie-1)>0.15)continue;
  filas.push({T:a.T,dia:a.dia,r:cie/pe.px-1,retraso:pe.min-CORTE,
    direccion:(a.Cc-a.Cv-a.Pc+a.Pv)/Tot}); }
const media=(v)=>v.length?v.reduce((a,x)=>a+x,0)/v.length:0;
const sd=(v)=>{const m=media(v);return Math.sqrt(v.reduce((a,x)=>a+(x-m)**2,0)/(v.length-1));};
const tU=(v)=>media(v)/(sd(v)/Math.sqrt(v.length));
const porDia=new Map(); for(const f of filas){let g=porDia.get(f.dia);if(!g){g=[];porDia.set(f.dia,g);}g.push(f);}
const LS=[],LG=[],TAM=[];
for(const [d,g] of [...porDia].sort()){ if(g.length<MIN_SIM)continue;
  const o=[...g].sort((a,b)=>a.direccion-b.direccion),k=Math.floor(o.length/3); if(k<5)continue;
  const alto=media(o.slice(-k).map(x=>x.r)),bajo=media(o.slice(0,k).map(x=>x.r)),todo=media(o.map(x=>x.r));
  LS.push(alto-bajo); LG.push(alto-todo); TAM.push(g.length); }
const rz=filas.map(f=>f.retraso).sort((a,b)=>a-b);
console.log(`═══ 09:45 ET · direccion · entrada real ≥09:45 → cierre ═══`);
console.log(`filas ${filas.length} · días ${LS.length} · símbolos/día mediana ${TAM.sort((a,b)=>a-b)[Math.floor(TAM.length/2)]} · tickers ${new Set(filas.map(f=>f.T)).size}`);
console.log(`retraso de la entrada tras el corte: p50 ${rz[Math.floor(rz.length/2)].toFixed(1)}min · p90 ${rz[Math.floor(rz.length*0.9)].toFixed(1)}min`);
console.log(`L/S  media ${(media(LS)*100).toFixed(3)}% · sd ${(sd(LS)*100).toFixed(3)}% · t=${tU(LS).toFixed(2)} · días>0 ${LS.filter(x=>x>0).length}/${LS.length}`);
console.log(`largo-solo (tercio alto − universo del día): ${(media(LG)*100).toFixed(3)}% · t=${tU(LG).toFixed(2)} · días>0 ${LG.filter(x=>x>0).length}/${LG.length}`);
const k3=Math.floor(LS.length/3);
console.log(`tercios: ${[LS.slice(0,k3),LS.slice(k3,2*k3),LS.slice(2*k3)].map(g=>(media(g)*100).toFixed(3)+"%").join(" · ")}`);
const C=56389, SP=5.1e-4;
for(const [nom,br] of [["L/S (largo+corto)",media(LS)],["largo-solo + cobertura de índice",media(LG)]]){
  const neto=br-SP;
  console.log(`\n${nom}: bruto ${(br*100).toFixed(3)}%/día → $${Math.round(br*250*C).toLocaleString("es-ES")}/año`);
  console.log(`   − peaje ${(SP*100).toFixed(3)}%/día (horquilla real 5,1 pb, rotación 100%) = neto ${(neto*100).toFixed(3)}%/día → $${Math.round(neto*250*C).toLocaleString("es-ES")}/año`);
}
const need=(2/tU(LS))**2*LS.length;
console.log(`\nSi se PREINSCRIBE esta única regla (listón 2,0, sin Bonferroni): el forward-test necesita`);
console.log(`   ${Math.ceil(need)} días de mercado para t=2,0 → faltan ${Math.ceil(need-LS.length)} ≈ ${((need-LS.length)/21).toFixed(1)} meses en vivo.`);
console.log(`Si hay que pasar el listón de 3,34 de las 60 pruebas: ${Math.ceil((3.34/tU(LS))**2*LS.length)} días (faltan ${Math.ceil((3.34/tU(LS))**2*LS.length-LS.length)} ≈ ${(((3.34/tU(LS))**2*LS.length-LS.length)/21).toFixed(1)} meses).`);
