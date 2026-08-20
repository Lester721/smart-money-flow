// PANEL SUBYACENTE-GAMMA · LOS TRES CONTROLES QUE DECIDEN.
//
// De ug-3 quedaron dos cosas vivas y una muerta:
//   · gammaClasica (call+/put−) separaba la amplitud → MURIÓ al dividir por la vol previa.
//   · centroMny (dónde está la gamma respecto al precio) sobrevivió PERO CAMBIANDO DE SIGNO, y eso
//     huele a artefacto del denominador: centroMny correlaciona +0,22 con la vol previa, así que
//     dividir por ella puede invertir la relación sin que haya nada. El control limpio no es
//     dividir: es COMPARAR DENTRO DE CADA CUBO DE VOLATILIDAD (doble ordenación).
//   · gammaNeta (el LADO REAL) no separaba nada. Falta la prueba directa de la hipótesis clásica
//     y falta saber si ese cero es CONCLUYENTE o sólo falta de muestra.
//
// Y el control definitivo, con dato real y no con un modelo: la VOLATILIDAD IMPLÍCITA que trae
// cada operación del feed. Es el precio que el mercado le pone al movimiento futuro. Si la métrica
// no predice el movimiento POR ENCIMA de la implícita, no hay nada que cobrar: ya está en el precio.
//   realizado/implícito = |retorno demediado| / (IV_del_flujo / √252)
import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib";
import { listonT, pasarBarrera, potencia, tWelch } from "../../lib/barreraHallazgos.ts";
import { radiografia } from "../../lib/radiografia.ts";

const RAIZ=path.join("scripts","cache-theta","marketsnack");
const DIRF=path.join(RAIZ,"flujo-100k"), CH=path.join(RAIZ,"aux","chart-all");
const leer=(p)=>JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString("utf8"));
const CORTES=[11*60,14*60]; const MIN_OPS=8, MIN_SIM=20, VENT=20;
const PRUEBAS=80+20; const LISTON=listonT(PRUEBAS);
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
let leidas=0, sinIV=0;
for(const dia of dias){
  for(const l of zlib.gunzipSync(fs.readFileSync(path.join(DIRF,`${dia}.jsonl.gz`))).toString("utf8").split("\n")){
    if(!l) continue; const r=JSON.parse(l); leidas++;
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
    if(iv==null) sinIV++;
    const p=r.premium||0;
    for(let c=0;c<CORTES.length;c++){ if(min>=CORTES[c]) continue;
      const k=`${T}|${dia}`; let a=AC[c].get(k);
      if(!a){ a={T,dia,n:0,gAbs:0,gD:0,gC:0,gM:0,ivW:0,ivDen:0,prima:0}; AC[c].set(k,a); }
      a.n++; a.gAbs+=gN; a.gD+=(comp?-1:1)*gN; a.gC+=(o.call?1:-1)*gN; a.gM+=mny*gN; a.prima+=p;
      if(iv!=null){ a.ivW+=iv*p; a.ivDen+=p; } }
  }
  process.stdout.write(`\r  ${dia}   `);
}
console.log(`\nleídas ${leidas.toLocaleString("es-ES")} · sin IV utilizable ${sinIV.toLocaleString("es-ES")} (${(100*sinIV/leidas).toFixed(2)}%)`);

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
    filas.push({ticker:a.T,fecha:a.dia,n:a.n,volPrev:vp,ivFlujo:a.ivW/a.ivDen,
      gammaNeta:a.gD/a.gAbs, gammaClasica:a.gC/a.gAbs, centroMny:a.gM/a.gAbs,
      rIntra:cie/e.px-1, r1:ret(a.T,a.dia,1)});
  }
  const porDia=new Map(); for(const f of filas){ let g=porDia.get(f.fecha); if(!g){g=[];porDia.set(f.fecha,g);} g.push(f); }
  const buenos=[];
  for(const [d,g] of porDia){ if(g.length<MIN_SIM) continue;
    for(const campo of ["rIntra","r1"]){
      const v=g.filter(f=>f[campo]!=null).map(f=>f[campo]); if(!v.length) continue;
      const mu=media(v);
      const abs=g.filter(f=>f[campo]!=null).map(f=>Math.abs(f[campo]-mu)), muA=media(abs);
      // realizado/implícito: |mov| dividido por lo que la IV del propio flujo pedía para ese plazo
      const rz=g.filter(f=>f[campo]!=null).map(f=>Math.abs(f[campo]-mu)/(f.ivFlujo/Math.sqrt(252))), muR=media(rz);
      for(const f of g){
        f[`a_${campo}`]=f[campo]!=null?Math.abs(f[campo]-mu)-muA:null;
        f[`iv_${campo}`]=f[campo]!=null?Math.abs(f[campo]-mu)/(f.ivFlujo/Math.sqrt(252))-muR:null;
      }
    }
    buenos.push(...g); }
  paneles[et]=buenos;
  console.log(`corte ${et} → ${buenos.length} filas · ${new Set(buenos.map(f=>f.fecha)).size} días · ${new Set(buenos.map(f=>f.ticker)).size} tickers`);
}

const R=[];
function prueba(nombre,filas,met,res,silencio){
  const f=filas.filter(x=>x[met]!=null&&x[res]!=null).map(x=>({pnl:x[res],ticker:x.ticker,fecha:x.fecha,m:x[met]}));
  if(f.length<200){ if(!silencio) console.log(`  ${nombre.padEnd(56)} SIN MUESTRA (${f.length})`); return null; }
  const v=pasarBarrera(f,x=>x.m,{pruebas:PRUEBAS,nMinimo:200,maxPorTicker:0.2});
  R.push({nombre,n:f.length,sep:v.detalle.sep,t:v.detalle.t,pasa:v.pasa,motivos:v.motivos,tercios:v.detalle.tercios});
  if(!silencio) console.log(`  ${v.pasa?"✅":"  "}${nombre.padEnd(54)} n=${String(f.length).padStart(5)} sep ${(v.detalle.sep??0).toFixed(4).padStart(9)} t=${(v.detalle.t??0).toFixed(2).padStart(6)} ${v.pasa?"PASA":v.motivos.slice(0,1).join("")}`);
  return v;
}

for(const et of Object.keys(paneles)){
  const P=paneles[et];
  radiografia(P,["gammaNeta","gammaClasica","centroMny","ivFlujo","volPrev","a_rIntra","iv_rIntra"],`ug-4 · ${et}`,{maxNulos:0.6});
  console.log(`\n═══════ corte ${et} ET · listón |t| ≥ ${LISTON} (${PRUEBAS} pruebas acumuladas) ═══════`);

  console.log(`\n[A] ¿la implícita del propio flujo ya predice la amplitud? (si sí, el listón es ELLA)`);
  prueba(`${et} ivFlujo → amplitud cruda intradía`, P, "ivFlujo", "a_rIntra");
  prueba(`${et} ivFlujo → amplitud cruda D+1`,      P, "ivFlujo", "a_r1");

  console.log(`\n[B] ¿la métrica bate a la implícita? resultado = realizado/implícito`);
  for(const m of ["centroMny","gammaClasica","gammaNeta"]){
    prueba(`${et} ${m} → realizado/implícito intradía`, P, m, "iv_rIntra");
    prueba(`${et} ${m} → realizado/implícito D+1`,      P, m, "iv_r1");
  }

  console.log(`\n[C] DOBLE ORDENACIÓN — dentro de cada cubo de volatilidad previa (el control limpio)`);
  for(const m of ["centroMny","gammaClasica"]){
    for(const res of ["a_rIntra","a_r1"]){
      const porDia=new Map();
      for(const f of P){ if(f[m]==null||f[res]==null||!(f.volPrev>0)) continue;
        let g=porDia.get(f.fecha); if(!g){g=[];porDia.set(f.fecha,g);} g.push(f); }
      const cubos=[[],[],[]];                       // 0=vol baja, 1=media, 2=alta
      for(const [d,g] of porDia){ if(g.length<24) continue;
        const o=[...g].sort((a,b)=>a.volPrev-b.volPrev), k=Math.floor(o.length/3);
        cubos[0].push(...o.slice(0,k)); cubos[1].push(...o.slice(k,2*k)); cubos[2].push(...o.slice(2*k)); }
      const linea=[];
      for(let b=0;b<3;b++){
        const o=[...cubos[b]].sort((x,y)=>x[m]-y[m]), k=Math.floor(o.length/3);
        if(k<20){ linea.push("—"); continue; }
        const alto=o.slice(-k).map(x=>x[res]), bajo=o.slice(0,k).map(x=>x[res]);
        linea.push(`${((media(alto)-media(bajo))*100).toFixed(3)}% t=${tWelch(alto,bajo).toFixed(2)}`);
      }
      console.log(`  ${m.padEnd(13)} → ${res.padEnd(9)} · vol BAJA ${linea[0].padEnd(20)} vol MEDIA ${linea[1].padEnd(20)} vol ALTA ${linea[2]}`);
    }
  }

  console.log(`\n[D] LA HIPÓTESIS CLÁSICA, DIRECTA, CON EL LADO REAL:`);
  console.log(`    creador CORTO de gamma (gammaNeta<0, el cliente compró) vs LARGO (gammaNeta>0)`);
  for(const res of [["a_rIntra","amplitud cruda intradía"],["iv_rIntra","realizado/implícito intradía"],["a_r1","amplitud cruda D+1"],["iv_r1","realizado/implícito D+1"]]){
    const corto=P.filter(f=>f.gammaNeta<0&&f[res[0]]!=null).map(f=>f[res[0]]);
    const largo=P.filter(f=>f.gammaNeta>0&&f[res[0]]!=null).map(f=>f[res[0]]);
    const t=tWelch(corto,largo);
    console.log(`  ${res[1].padEnd(30)} corto n=${String(corto.length).padStart(5)} media ${(media(corto)).toFixed(4)} · largo n=${String(largo.length).padStart(5)} media ${(media(largo)).toFixed(4)} · dif ${(media(corto)-media(largo)).toFixed(4)} t=${t.toFixed(2)}`);
  }
  // lo mismo con el GEX CLÁSICO (signo supuesto) para ver si el LADO cambia la conclusión
  console.log(`    y con el signo SUPUESTO (GEX clásico: call+/put−), misma muestra:`);
  for(const res of [["a_rIntra","amplitud cruda intradía"],["iv_rIntra","realizado/implícito intradía"]]){
    const neg=P.filter(f=>f.gammaClasica<0&&f[res[0]]!=null).map(f=>f[res[0]]);
    const pos=P.filter(f=>f.gammaClasica>0&&f[res[0]]!=null).map(f=>f[res[0]]);
    console.log(`  ${res[1].padEnd(30)} GEX<0 n=${String(neg.length).padStart(5)} media ${(media(neg)).toFixed(4)} · GEX>0 n=${String(pos.length).padStart(5)} media ${(media(pos)).toFixed(4)} · dif ${(media(neg)-media(pos)).toFixed(4)} t=${tWelch(neg,pos).toFixed(2)}`);
  }

  console.log(`\n[E] ¿EL CERO ES CONCLUYENTE? potencia de la muestra`);
  for(const [m,res,efecto,txt] of [["gammaNeta","a_rIntra",0.001,"amplitud intradía de 0,10 puntos"],
                                    ["gammaNeta","iv_rIntra",0.10,"10% de realizado sobre implícito"],
                                    ["gammaNeta","d_r1",0.002,"dirección de 0,20% a un día"]]){
    const f=P.filter(x=>x[m]!=null&&x[res]!=null).map(x=>({pnl:x[res],ticker:x.ticker,fecha:x.fecha}));
    if(f.length<200) continue;
    const p=potencia(f,efecto);
    console.log(`  ${m} → ${res}: ${p.mensaje}`);
  }
}
fs.writeFileSync("scripts/marketsnack/ug-4-salida.json",JSON.stringify({liston:LISTON,pruebas:PRUEBAS,R},null,1));
fs.writeFileSync("scripts/marketsnack/ug-4-panel.json",JSON.stringify(paneles));
console.log(`\n✓ ug-4-salida.json · ug-4-panel.json`);
