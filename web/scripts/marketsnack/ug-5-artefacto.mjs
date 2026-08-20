// PANEL SUBYACENTE-GAMMA · EL ÚLTIMO SUPERVIVIENTE, Y SI ES REAL O ES EL DENOMINADOR.
//
// De ug-4 sobrevivió UNA cosa: centroMny (dónde está la gamma del flujo respecto al precio) separa
// el REALIZADO/IMPLÍCITO a un día, con t=−5,48 y −6,51 en los dos cortes y las cuatro cribas.
//
// Pero hay una explicación aburrida antes que cualquier mecanismo: LA SONRISA DE VOLATILIDAD.
// centroMny alto = el flujo compró strikes lejos por encima del precio. Esas opciones tienen, POR
// CONSTRUCCIÓN, una implícita más alta que las del dinero. Como el denominador de realizado/implícito
// es la implícita del propio flujo, un flujo más lejos del dinero infla el denominador y hunde el
// cociente SIN QUE PASE NADA en el subyacente. Sería el mismo fallo que ya invalidó la división por
// la volatilidad previa en ug-3.
//
// LA PRUEBA: rehacer el denominador SÓLO con contratos CERCA DEL DINERO (|moneyness| < 5%), donde
// la sonrisa casi no muerde. Si el efecto vive, es del subyacente. Si muere, era el denominador.
//
// Y de paso lo que faltaba del panel: el CAMBIO DENTRO DEL DÍA (métrica de las 14:00 menos la de
// las 11:00) contra el movimiento de las 14:00 al cierre.
import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib";
import { listonT, pasarBarrera, tWelch, potencia } from "../../lib/barreraHallazgos.ts";
import { radiografia } from "../../lib/radiografia.ts";

const RAIZ=path.join("scripts","cache-theta","marketsnack");
const DIRF=path.join(RAIZ,"flujo-100k"), CH=path.join(RAIZ,"aux","chart-all");
const leer=(p)=>JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString("utf8"));
const CORTES=[11*60,14*60]; const MIN_OPS=8, MIN_SIM=20, VENT=20, ATM=0.05;
const PRUEBAS=100+24; const LISTON=listonT(PRUEBAS);
const PROXY={SPX:"SPY",SPXW:"SPY",XSP:"SPY",NDX:"QQQ",NDXP:"QQQ",RUT:"IWM"};
const APAL=new Set(["TQQQ","SOXL","SQQQ","SOXS","UVXY","TZA","TNA","SPXU","UPRO","LABU","LABD","YINN","FNGU","NVDL","TSLL","BOIL","KOLD","VXX","SVIX","UVIX"]);
const COMPRA=new Set(["ABOVE_ASK","AT_ASK","ASKSIDE"]), VENTA=new Set(["BELOW_BID","AT_BID","BIDSIDE"]);
const parseOcc=(s)=>{ if(!s||s.length<16) return null;
  const k=s.slice(-8),t=s.slice(-9,-8),d=s.slice(-15,-9),u=s.slice(0,-15);
  return (/^\d{8}$/.test(k)&&/^[CP]$/.test(t)&&/^\d{6}$/.test(d)&&u)?{u,call:t==="C",K:Number(k)/1000}:null; };
const RAZ=[2,3,4,5,6,7,8,10,12,15,20,25,30,40,50];
const esSplit=(r)=>RAZ.some(k=>Math.abs(r-k)/k<0.03||Math.abs(r-1/k)*k<0.03);
const media=(v)=>v.length?v.reduce((a,x)=>a+x,0)/v.length:0;
const sd=(v)=>{ if(v.length<2) return 0; const m=media(v); return Math.sqrt(v.reduce((a,x)=>a+(x-m)**2,0)/(v.length-1)); };
const corr=(x,y)=>{ const mx=media(x),my=media(y); return media(x.map((v,i)=>(v-mx)*(y[i]-my)))/(sd(x)*sd(y)); };

const cierres=new Map();
for(const f of fs.readdirSync(CH)){
  if(!f.endsWith(".json.gz")) continue; let j; try{ j=leer(path.join(CH,f)); }catch{ continue; }
  const d=j?.data??[]; if(d.length<60) continue;
  const c=d.map(p=>p.v), fe=d.map(p=>p.t.slice(0,10)), vp=new Array(c.length).fill(null);
  for(let i=VENT+1;i<c.length;i++){ const rs=[];
    for(let k=i-VENT;k<i;k++) if(c[k]>0&&c[k-1]>0) rs.push(c[k]/c[k-1]-1);
    const s=sd(rs.filter(x=>Math.abs(x)<0.25)); vp[i]=s>0?s:null; }
  cierres.set(f.replace(".json.gz",""),{c,idx:new Map(fe.map((x,i)=>[x,i])),vp});
}
function ret(T,dia,h){ const s=cierres.get(T); if(!s) return null; const i=s.idx.get(dia);
  if(i==null||i+h>=s.c.length) return null; const p0=s.c[i],p1=s.c[i+h]; if(!(p0>0)||!(p1>0)) return null;
  for(let j=i;j<i+h;j++){ const r=s.c[j+1]/s.c[j]; if(Math.abs(r-1)>0.25&&esSplit(r)) return null; } return p1/p0-1; }

const dias=fs.readdirSync(DIRF).filter(f=>f.endsWith(".jsonl.gz")).map(f=>f.slice(0,10)).sort();
const AC=CORTES.map(()=>new Map()), EN=new Map();
for(const dia of dias){
  for(const l of zlib.gunzipSync(fs.readFileSync(path.join(DIRF,`${dia}.jsonl.gz`))).toString("utf8").split("\n")){
    if(!l) continue; const r=JSON.parse(l);
    const o=parseOcc(r.symbol); if(!o) continue;
    const T=PROXY[o.u]??o.u; if(APAL.has(T)||!cierres.has(T)) continue;
    const min=(Date.parse(r.timestamp)-4*3600e3)/60000%1440, S=r.asset_price;
    if(o.u===T&&S>0) for(let c=0;c<CORTES.length;c++){ if(min<CORTES[c]) continue;
      const k=`${c}|${T}|${dia}`, b=EN.get(k); if(!b||min<b.min) EN.set(k,{min,px:S}); }
    if(r.side==null) continue;
    const comp=COMPRA.has(r.side), vend=VENTA.has(r.side); if(!comp&&!vend) continue;
    if(r.ask_price===0||r.bid_price===0||(r.ask_price!=null&&r.bid_price!=null&&r.ask_price<r.bid_price)) continue;
    if(!Number.isFinite(r.gamma)||r.gamma<=0||!(S>0)) continue;
    const gN=r.gamma*(r.size||0)*100*S*S*0.01; if(!(gN>0)) continue;
    const mny=(o.K-S)/S; if(!Number.isFinite(mny)||Math.abs(mny)>2) continue;
    const iv=Number.isFinite(r.implied_volatility)&&r.implied_volatility>0&&r.implied_volatility<5?r.implied_volatility:null;
    const p=r.premium||0;
    for(let c=0;c<CORTES.length;c++){ if(min>=CORTES[c]) continue;
      const k=`${T}|${dia}`; let a=AC[c].get(k);
      if(!a){ a={T,dia,n:0,gAbs:0,gD:0,gC:0,gM:0,ivW:0,ivDen:0,ivA:0,ivADen:0,nATM:0,prima:0}; AC[c].set(k,a); }
      a.n++; a.gAbs+=gN; a.gD+=(comp?-1:1)*gN; a.gC+=(o.call?1:-1)*gN; a.gM+=mny*gN; a.prima+=p;
      if(iv!=null){ a.ivW+=iv*p; a.ivDen+=p;
        if(Math.abs(mny)<ATM){ a.ivA+=iv*p; a.ivADen+=p; a.nATM++; } } }
  }
  process.stdout.write(`\r  ${dia}   `);
}
console.log("");

const paneles={};
for(let c=0;c<CORTES.length;c++){
  const et=`${String(Math.floor(CORTES[c]/60)).padStart(2,"0")}:${String(CORTES[c]%60).padStart(2,"0")}`;
  const filas=[];
  for(const a of AC[c].values()){
    if(a.n<MIN_OPS||!(a.gAbs>0)||!(a.ivDen>0)) continue;
    const e=EN.get(`${c}|${a.T}|${a.dia}`); if(!e) continue;
    const s=cierres.get(a.T), i=s.idx.get(a.dia); if(i==null) continue;
    const cie=s.c[i], vp=s.vp[i];
    if(!(cie>0)||!(e.px>0)||Math.abs(e.px/cie-1)>0.15||!(vp>0)) continue;
    filas.push({ticker:a.T,fecha:a.dia,n:a.n,volPrev:vp,
      ivFlujo:a.ivW/a.ivDen, ivATM:a.nATM>=3?a.ivA/a.ivADen:null, nATM:a.nATM,
      gammaNeta:a.gD/a.gAbs, gammaClasica:a.gC/a.gAbs, centroMny:a.gM/a.gAbs,
      precioCorte:e.px, cierreD:cie, rIntra:cie/e.px-1, r1:ret(a.T,a.dia,1)});
  }
  const porDia=new Map(); for(const f of filas){ let g=porDia.get(f.fecha); if(!g){g=[];porDia.set(f.fecha,g);} g.push(f); }
  const buenos=[];
  for(const [d,g] of porDia){ if(g.length<MIN_SIM) continue;
    for(const campo of ["rIntra","r1"]){
      const v=g.filter(f=>f[campo]!=null).map(f=>f[campo]); if(!v.length) continue;
      const mu=media(v);
      const muA=media(g.filter(f=>f[campo]!=null).map(f=>Math.abs(f[campo]-mu)));
      const muF=media(g.filter(f=>f[campo]!=null).map(f=>Math.abs(f[campo]-mu)/(f.ivFlujo/Math.sqrt(252))));
      const conA=g.filter(f=>f[campo]!=null&&f.ivATM>0);
      const muT=media(conA.map(f=>Math.abs(f[campo]-mu)/(f.ivATM/Math.sqrt(252))));
      for(const f of g){
        f[`a_${campo}`]=f[campo]!=null?Math.abs(f[campo]-mu)-muA:null;
        f[`iv_${campo}`]=f[campo]!=null?Math.abs(f[campo]-mu)/(f.ivFlujo/Math.sqrt(252))-muF:null;
        f[`atm_${campo}`]=(f[campo]!=null&&f.ivATM>0)?Math.abs(f[campo]-mu)/(f.ivATM/Math.sqrt(252))-muT:null;
      }
    }
    buenos.push(...g); }
  paneles[et]=buenos;
}

// ── [1] ¿centroMny infla el denominador? ─────────────────────────────────────────────────────
console.log(`\n═══ [1] ¿ES EL DENOMINADOR? centroMny contra la implícita que se usa para dividir ═══`);
for(const et of Object.keys(paneles)){
  const P=paneles[et];
  const conA=P.filter(f=>f.ivATM>0);
  console.log(`  ${et} · corr(centroMny, IV del flujo) = ${corr(P.map(f=>f.centroMny),P.map(f=>f.ivFlujo)).toFixed(3)}` +
              `   ·   corr(centroMny, IV cerca del dinero) = ${corr(conA.map(f=>f.centroMny),conA.map(f=>f.ivATM)).toFixed(3)}   (n con ATM ${conA.length}/${P.length})`);
  const o=[...P].sort((a,b)=>a.centroMny-b.centroMny), k=Math.floor(o.length/3);
  console.log(`     tercio BAJO de centroMny: IV flujo ${(media(o.slice(0,k).map(f=>f.ivFlujo))*100).toFixed(1)}%  ·  tercio ALTO: ${(media(o.slice(-k).map(f=>f.ivFlujo))*100).toFixed(1)}%  → la sonrisa mete ${((media(o.slice(-k).map(f=>f.ivFlujo))/media(o.slice(0,k).map(f=>f.ivFlujo))-1)*100).toFixed(0)}% de diferencia SIN que pase nada en el subyacente`);
}

// ── [2] el mismo test con el denominador limpio ──────────────────────────────────────────────
const R=[];
function prueba(nombre,filas,met,res){
  const f=filas.filter(x=>x[met]!=null&&x[res]!=null).map(x=>({pnl:x[res],ticker:x.ticker,fecha:x.fecha,m:x[met]}));
  if(f.length<200){ console.log(`  ${nombre.padEnd(56)} SIN MUESTRA (${f.length})`); return null; }
  const v=pasarBarrera(f,x=>x.m,{pruebas:PRUEBAS,nMinimo:200,maxPorTicker:0.2});
  R.push({nombre,n:f.length,sep:v.detalle.sep,t:v.detalle.t,pasa:v.pasa,motivos:v.motivos,
    tercios:v.detalle.tercios.map(x=>({p:x.periodo,sep:x.sep,t:x.t}))});
  console.log(`  ${v.pasa?"✅":"  "}${nombre.padEnd(54)} n=${String(f.length).padStart(5)} sep ${(v.detalle.sep??0).toFixed(4).padStart(9)} t=${(v.detalle.t??0).toFixed(2).padStart(6)} ${v.pasa?"PASA":v.motivos.slice(0,1).join("")}`);
  return v;
}
console.log(`\n═══ [2] MISMO TEST, DENOMINADOR LIMPIO (implícita sólo de contratos a menos del 5% del dinero) ═══`);
console.log(`    listón |t| ≥ ${LISTON} (${PRUEBAS} pruebas acumuladas)`);
for(const et of Object.keys(paneles)){
  const P=paneles[et];
  radiografia(P.filter(f=>f.ivATM>0),["centroMny","ivFlujo","ivATM","atm_r1","iv_r1"],`ug-5 · ${et} · con IV del dinero`,{maxNulos:0.6});
  console.log(`  ── corte ${et} ──`);
  prueba(`${et} centroMny → realizado/implícita DEL FLUJO (sucia) D+1`, P, "centroMny", "iv_r1");
  prueba(`${et} centroMny → realizado/implícita DEL DINERO (limpia) D+1`, P, "centroMny", "atm_r1");
  prueba(`${et} centroMny → realizado/implícita DEL DINERO (limpia) intradía`, P, "centroMny", "atm_rIntra");
  prueba(`${et} gammaNeta → realizado/implícita DEL DINERO (limpia) D+1`, P, "gammaNeta", "atm_r1");
  prueba(`${et} gammaClasica → realizado/implícita DEL DINERO (limpia) D+1`, P, "gammaClasica", "atm_r1");
}

// ── [3] doble ordenación del superviviente dentro de cubos de volatilidad ────────────────────
console.log(`\n═══ [3] DOBLE ORDENACIÓN dentro de cubos de volatilidad previa · resultado limpio (atm_r1) ═══`);
for(const et of Object.keys(paneles)){
  for(const m of ["centroMny","gammaNeta"]){
    const porDia=new Map();
    for(const f of paneles[et]){ if(f[m]==null||f.atm_r1==null||!(f.volPrev>0)) continue;
      let g=porDia.get(f.fecha); if(!g){g=[];porDia.set(f.fecha,g);} g.push(f); }
    const cub=[[],[],[]];
    for(const [d,g] of porDia){ if(g.length<24) continue;
      const o=[...g].sort((a,b)=>a.volPrev-b.volPrev), k=Math.floor(o.length/3);
      cub[0].push(...o.slice(0,k)); cub[1].push(...o.slice(k,2*k)); cub[2].push(...o.slice(2*k)); }
    const l=[];
    for(let b=0;b<3;b++){ const o=[...cub[b]].sort((x,y)=>x[m]-y[m]), k=Math.floor(o.length/3);
      if(k<20){ l.push("—"); continue; }
      const A=o.slice(-k).map(x=>x.atm_r1), B=o.slice(0,k).map(x=>x.atm_r1);
      l.push(`${(media(A)-media(B)).toFixed(3)} t=${tWelch(A,B).toFixed(2)}`); }
    console.log(`  ${et} ${m.padEnd(13)} · vol BAJA ${l[0].padEnd(18)} MEDIA ${l[1].padEnd(18)} ALTA ${l[2]}`);
  }
}

// ── [4] lo que faltaba del panel: el CAMBIO DENTRO DEL DÍA ──────────────────────────────────
console.log(`\n═══ [4] EL CAMBIO DENTRO DEL DÍA: métrica(14:00) − métrica(11:00) → movimiento 14:00→cierre ═══`);
const idx11=new Map(paneles["11:00"].map(f=>[`${f.ticker}|${f.fecha}`,f]));
const delta=[];
for(const f of paneles["14:00"]){
  const g=idx11.get(`${f.ticker}|${f.fecha}`); if(!g) continue;
  delta.push({ticker:f.ticker,fecha:f.fecha,
    dCentro:f.centroMny-g.centroMny, dNeta:f.gammaNeta-g.gammaNeta, dClasica:f.gammaClasica-g.gammaClasica,
    rIntra:f.rIntra, a_rIntra:f.a_rIntra, d_rIntra:null, atm_rIntra:f.atm_rIntra});
}
{ const porDia=new Map(); for(const f of delta){ let g=porDia.get(f.fecha); if(!g){g=[];porDia.set(f.fecha,g);} g.push(f); }
  const buenos=[];
  for(const [d,g] of porDia){ if(g.length<MIN_SIM) continue;
    const mu=media(g.map(f=>f.rIntra));
    for(const f of g) f.d_rIntra=f.rIntra-mu;
    buenos.push(...g); }
  console.log(`  pares 11:00↔14:00: ${buenos.length} filas · ${new Set(buenos.map(f=>f.fecha)).size} días`);
  radiografia(buenos,["dCentro","dNeta","dClasica","d_rIntra","a_rIntra"],"ug-5 · cambio dentro del día",{maxNulos:0.6});
  for(const m of ["dCentro","dNeta","dClasica"]){
    prueba(`Δ ${m} → dirección 14:00→cierre`, buenos, m, "d_rIntra");
    prueba(`Δ ${m} → amplitud 14:00→cierre`,  buenos, m, "a_rIntra");
  }
}
fs.writeFileSync("scripts/marketsnack/ug-5-salida.json",JSON.stringify({liston:LISTON,pruebas:PRUEBAS,R},null,1));
fs.writeFileSync("scripts/marketsnack/ug-5-panel.json",JSON.stringify(paneles));
console.log(`\n✓ ug-5-salida.json`);
