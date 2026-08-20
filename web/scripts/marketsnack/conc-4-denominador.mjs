// CONCENTRACION · ¿ES REAL O ES EL DENOMINADOR COMPARTIDO?
//
// conc-3 dejo dos supervivientes por encima del liston:
//     sizeSigma -> a_r1n   t = 5,18 (15:45)  y  distSigma -> a_r5n  t = 4,92
// y un patron demasiado limpio para ser inocente:
//     TODA metrica que lleva vol20 en el denominador sale POSITIVA
//     TODA metrica que no lo lleva (concResid, concSize, conc30, cuota30) sale CERO
//
// La sospecha, en una linea:
//     metrica    sizeSigma = distancia / (vol20 * raiz(DTE))     -> baja con vol20
//     resultado  a_r1n     = |retorno D+1| / vol20               -> baja con vol20
// Si vol20 es una estimacion RUIDOSA (20 dias) de una volatilidad que revierte a la media, un
// ticker con vol20 anormalmente BAJA tiende a dar |r1|/vol20 alto sin que nadie haya predicho
// nada. Y a la vez le sube el sizeSigma. Correlacion mecanica, informacion cero.
//
// CINCO CONTROLES. El hallazgo solo sobrevive si pasa los cinco:
//   C1  ordenar por vol20 BAJA, sin ninguna metrica de flujo -> a_r1n.  Si esto ya separa, el
//       "hallazgo" es esto y nada mas.
//   C2  metrica con vol de una ventana DISJUNTA (dias D-40..D-21) y resultado con vol20
//       (dias D-19..D). Los errores de estimacion ya no se comparten.
//   C3  resultado normalizado por la ventana disjunta, metrica con vol20. El espejo de C2.
//   C4  la distancia CRUDA en %, sin vol en la metrica -> a_r1n.
//   C5  ordenar por sizeSigma DENTRO de cubos de vol20 (la volatilidad queda neutralizada).
//       Este es el decisivo: si aqui muere, era el denominador.
//
// PRUEBAS ACUMULADAS: 72 + 12 = 84.

import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib";
import { listonT } from "../../lib/barreraHallazgos.ts";
import { radiografia } from "../../lib/radiografia.ts";

const RAIZ = path.join("scripts", "cache-theta", "marketsnack");
const DIR = path.join(RAIZ, "flujo-100k");
const CH = path.join(RAIZ, "aux", "chart-all");
const RUPTURA = "2026-07-16";
const CORTES = { "12:00": 12*60, "15:45": 15*60+45 };
const PRUEBAS = 84;
const LISTON = listonT(PRUEBAS);
const APAL = new Set(["TQQQ","SOXL","SQQQ","SOXS","UVXY","TZA","TNA","SPXU","UPRO","LABU","LABD","YINN","FNGU","NVDL","TSLL","BOIL","KOLD","VXX","SVIX","UVIX"]);

const media = (v) => (v.length ? v.reduce((a,x)=>a+x,0)/v.length : NaN);
const sd = (v) => { if (v.length<2) return NaN; const m=media(v); return Math.sqrt(v.reduce((a,x)=>a+(x-m)**2,0)/(v.length-1)); };
const tUna = (v) => (v.length>2 ? media(v)/(sd(v)/Math.sqrt(v.length)) : NaN);
const corr = (a,b)=>{const ma=media(a),mb=media(b);let n=0,da=0,db=0;for(let i=0;i<a.length;i++){n+=(a[i]-ma)*(b[i]-mb);da+=(a[i]-ma)**2;db+=(b[i]-mb)**2;}return n/Math.sqrt(da*db);};

const parseOcc = (s) => { const k=s.slice(-8),t=s.slice(-9,-8),d=s.slice(-15,-9),u=s.slice(0,-15);
  if(!/^\d{8}$/.test(k)||!/^[CP]$/.test(t)||!/^\d{6}$/.test(d)||!u) return null;
  return { u, call:t==="C", exp:`20${d.slice(0,2)}-${d.slice(2,4)}-${d.slice(4,6)}`, K:Number(k)/1000 }; };
const dd = (a,b) => Math.round((Date.parse(b)-Date.parse(a))/86400000);

const precios={}, fechasT={}, posT={};
for (const f of fs.readdirSync(CH)) {
  if (!f.endsWith(".json.gz")) continue;
  const T=f.slice(0,-8); if (APAL.has(T)) continue;
  const j=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CH,f))).toString("utf8"));
  const m={}; for(const r of j.data) if(Number.isFinite(r.v)&&r.v>0) m[r.t.slice(0,10)]=r.v;
  const ff=Object.keys(m).sort(); if(ff.length<80) continue;
  precios[T]=m; fechasT[T]=ff; const p={}; ff.forEach((x,i)=>(p[x]=i)); posT[T]=p;
}
/** vol diaria realizada de los `n` dias que terminan `atras` dias antes de `fecha` (inclusive). */
function volVentana(T, fecha, atras, n) {
  const i = posT[T]?.[fecha]; if (i==null) return null;
  const fin = i - atras, ini = fin - n + 1; if (ini < 1) return null;
  const rs=[]; for(let j=ini;j<=fin;j++){ const a=precios[T][fechasT[T][j-1]], b=precios[T][fechasT[T][j]]; if(a>0&&b>0) rs.push(b/a-1); }
  if (rs.length < n-3) return null; const m=media(rs);
  return Math.sqrt(rs.reduce((s,x)=>s+(x-m)**2,0)/(rs.length-1));
}
const cierrePrevio=(T,f)=>{const i=posT[T]?.[f];return i==null||i<1?null:precios[T][fechasT[T][i-1]];};
const ret=(T,f,k)=>{const i=posT[T]?.[f];if(i==null||i+k>=fechasT[T].length)return null;
  const a=precios[T][fechasT[T][i]],b=precios[T][fechasT[T][i+k]];return a>0&&b>0?b/a-1:null;};

// -- panel -----------------------------------------------------------------------------------
const dias = fs.readdirSync(DIR).filter(f=>f.endsWith(".jsonl.gz")).map(f=>f.slice(0,10)).sort();
const panel = { "12:00": [], "15:45": [] };
for (const dia of dias) {
  const txt = zlib.gunzipSync(fs.readFileSync(path.join(DIR,`${dia}.jsonl.gz`))).toString("utf8").trim();
  if (!txt) continue;
  const acc={}; for(const c of Object.keys(CORTES)) acc[c]=new Map();
  for (const l of txt.split("\n")) {
    if(!l) continue; const r=JSON.parse(l);
    const o=parseOcc(r.symbol); if(!o||!precios[o.u]) continue;
    if(!(r.premium>0)||!(r.size>0)) continue;
    const min=((Date.parse(r.timestamp)-4*3600e3)/60000)%1440;
    if(!(min>=0&&min<16*60)) continue;
    for (const [nom,lim] of Object.entries(CORTES)) {
      if(min>=lim) continue;
      let m=acc[nom].get(o.u); if(!m){m={contratos:new Map(),ops:0,prima:0,size:0};acc[nom].set(o.u,m);}
      m.ops++; m.prima+=r.premium; m.size+=r.size;
      let c=m.contratos.get(r.symbol);
      if(!c){c={exp:o.exp,K:o.K,call:o.call,prima:0,size:0};m.contratos.set(r.symbol,c);}
      c.prima+=r.premium; c.size+=r.size;
    }
  }
  for (const [nom,mapa] of Object.entries(acc)) for (const [T,m] of mapa) {
    if(m.ops<5||m.contratos.size<2) continue;
    const S=cierrePrevio(T,dia); const v20=volVentana(T,dia,0,20); const vPrev=volVentana(T,dia,20,20);
    if(!(S>0)||!(v20>0)||!(vPrev>0)) continue;
    const cs=[...m.contratos.values()];
    const ts=[...cs].sort((a,b)=>b.size-a.size)[0];
    const tp=[...cs].sort((a,b)=>b.prima-a.prima)[0];
    const distDe=(c)=>Math.abs(c.call?c.K/S-1:1-c.K/S);
    const dteS=dd(dia,ts.exp), dteP=dd(dia,tp.exp);
    const r1=ret(T,dia,1), r5=ret(T,dia,5);
    panel[nom].push({
      ticker:T, fecha:dia, tramo: dia<RUPTURA?"antes":"despues",
      contratos:m.contratos.size, ops:m.ops, prima:m.prima, vol20:v20, volPrev:vPrev,
      sizeDist:distDe(ts), sizeDTE:dteS, sizeK:ts.K, sizeExp:ts.exp, sizeCall:ts.call?1:0,
      sizeSize:ts.size, sizePrima:ts.prima, S,
      // metricas: misma formula, distinto denominador
      sizeSigma:   dteS>0 ? distDe(ts)/(v20  *Math.sqrt(dteS)) : null,   // vol20 (compartida)
      sizeSigmaDj: dteS>0 ? distDe(ts)/(vPrev*Math.sqrt(dteS)) : null,   // ventana DISJUNTA
      primaSigma:  dteP>0 ? distDe(tp)/(v20  *Math.sqrt(dteP)) : null,
      menosVol20: -v20,                                                  // C1: solo vol baja
      // resultados: |retorno| con tres yardsticks
      a_r1: r1==null?null:Math.abs(r1),
      a_r1n:   r1==null?null:Math.abs(r1)/v20,      // normalizado por vol20 (compartida)
      a_r1nDj: r1==null?null:Math.abs(r1)/vPrev,    // normalizado por la ventana DISJUNTA
      a_r5n:   r5==null?null:Math.abs(r5)/(v20*Math.sqrt(5)),
      a_r5nDj: r5==null?null:Math.abs(r5)/(vPrev*Math.sqrt(5)),
    });
  }
}
// C5: rango de sizeSigma DENTRO de cubos de vol20, dentro del dia
for (const nom of Object.keys(panel)) {
  const cubo=(v)=> v<0.015?0 : v<0.022?1 : v<0.030?2 : v<0.042?3 : v<0.060?4 : 5;
  const g=new Map();
  for(const x of panel[nom]){ const k=`${x.fecha}|${cubo(x.vol20)}`; let a=g.get(k); if(!a){a=[];g.set(k,a);} a.push(x); }
  for(const a of g.values()){
    const o=[...a].filter(x=>x.sizeSigma!=null).sort((p,q)=>p.sizeSigma-q.sizeSigma);
    o.forEach((x,i)=>(x.sigmaEnCubo = o.length>1 ? i/(o.length-1) : null));
  }
}

console.log(`liston |t| >= ${LISTON} (${PRUEBAS} pruebas acumuladas)\n`);
for (const nom of Object.keys(panel))
  radiografia(panel[nom], ["sizeSigma","sizeSigmaDj","sigmaEnCubo","vol20","volPrev","a_r1n","a_r1nDj","sizeDist"], `panel denominador - corte ${nom}`, { maxNulos: 0.6 });

console.log("=".repeat(104));
console.log("EL MECANISMO SOSPECHOSO, MEDIDO");
console.log("=".repeat(104));
{
  const f = panel["15:45"].filter(x=>x.a_r1n!=null);
  console.log(`  correlacion vol20 con volPrev (ventanas disjuntas)   : ${corr(f.map(x=>x.vol20),f.map(x=>x.volPrev)).toFixed(3)}  <- si fuese 1 no habria ruido que explotar`);
  console.log(`  correlacion sizeSigma con 1/vol20                    : ${corr(f.map(x=>x.sizeSigma),f.map(x=>1/x.vol20)).toFixed(3)}`);
  console.log(`  correlacion a_r1n     con 1/vol20                    : ${corr(f.map(x=>x.a_r1n),f.map(x=>1/x.vol20)).toFixed(3)}`);
  // reversion a la media de la volatilidad: E[|r1|/vol20] por decil de vol20
  const o=[...f].sort((a,b)=>a.vol20-b.vol20); const k=Math.floor(o.length/5);
  console.log(`\n  |r1|/vol20 MEDIO por quintil de vol20 (si la vol no revirtiese, seria plano):`);
  for(let i=0;i<5;i++){ const g=o.slice(i*k,(i+1)*k);
    console.log(`    quintil ${i+1} (vol20 ${(100*media(g.map(x=>x.vol20))).toFixed(2)}%): |r1|/vol20 = ${media(g.map(x=>x.a_r1n)).toFixed(3)}  |  |r1|/volPrev = ${media(g.map(x=>x.a_r1nDj)).toFixed(3)}`); }
}

// -- pruebas ---------------------------------------------------------------------------------
const resultados=[];
function prueba(etq, corte, metrica, resultado, filas) {
  const f=filas.filter(x=>x[metrica]!=null&&Number.isFinite(x[metrica])&&x[resultado]!=null);
  const porDia=new Map(); for(const x of f){let g=porDia.get(x.fecha);if(!g){g=[];porDia.set(x.fecha,g);}g.push(x);}
  const serie=[];
  for(const [d,g] of [...porDia].sort()){
    if(g.length<15) continue;
    const o=[...g].sort((a,b)=>b[metrica]-a[metrica]); const k=Math.floor(o.length/3); if(k<5) continue;
    serie.push({fecha:d, sep: media(o.slice(0,k).map(x=>x[resultado]))-media(o.slice(-k).map(x=>x[resultado])),
                alto: media(o.slice(0,k).map(x=>x[resultado])), bajo: media(o.slice(-k).map(x=>x[resultado]))});
  }
  const seps=serie.map(s=>s.sep), t=tUna(seps);
  const k3=Math.floor(serie.length/3);
  const terc=k3>=3?[serie.slice(0,k3),serie.slice(k3,2*k3),serie.slice(2*k3)].map(g=>media(g.map(s=>s.sep))):[];
  const antes=serie.filter(s=>s.fecha<RUPTURA).map(s=>s.sep), desp=serie.filter(s=>s.fecha>=RUPTURA).map(s=>s.sep);
  const r={etq,corte,metrica,resultado,nFilas:f.length,dias:serie.length,sepDia:media(seps),tDia:t,
    positivos:seps.filter(x=>x>0).length,tercios:terc,alto:media(serie.map(s=>s.alto)),bajo:media(serie.map(s=>s.bajo)),
    antesT:tUna(antes),despT:tUna(desp),antesM:media(antes),despM:media(desp)};
  resultados.push(r);
  const marca=Math.abs(t)>=LISTON?"**":Math.abs(t)>=2?"* ":"  ";
  console.log(`  ${marca}${etq.padEnd(9)} ${(metrica+" -> "+resultado).padEnd(28)} n=${String(f.length).padStart(5)} d=${String(serie.length).padStart(3)}  sep ${r.sepDia.toFixed(4).padStart(8)}  tDIA=${t.toFixed(2).padStart(6)}  ${r.positivos}/${serie.length}+  antes t${(r.antesT??0).toFixed(1)} desp t${(r.despT??0).toFixed(1)}  tercios ${terc.map(x=>x.toFixed(3)).join("/")}`);
  return r;
}

console.log("\n" + "=".repeat(104));
console.log("LOS CINCO CONTROLES");
console.log("=".repeat(104));
for (const corte of Object.keys(panel)) {
  const f = panel[corte];
  console.log(`\n-- corte ${corte} ET --`);
  console.log(`  (referencia)`);
  prueba("REF", corte, "sizeSigma", "a_r1n", f);
  console.log(`  C1 - solo vol20 BAJA, ninguna metrica de flujo:`);
  prueba("C1", corte, "menosVol20", "a_r1n", f);
  console.log(`  C2 - metrica con ventana DISJUNTA, resultado con vol20:`);
  prueba("C2", corte, "sizeSigmaDj", "a_r1n", f);
  console.log(`  C3 - metrica con vol20, resultado con ventana DISJUNTA:`);
  prueba("C3", corte, "sizeSigma", "a_r1nDj", f);
  console.log(`  C4 - distancia CRUDA en %, sin vol en la metrica:`);
  prueba("C4", corte, "sizeDist", "a_r1n", f);
  console.log(`  C5 - sizeSigma DENTRO de cubos de vol20 (DECISIVO):`);
  prueba("C5", corte, "sigmaEnCubo", "a_r1n", f);
  console.log(`  C5' - lo mismo contra el resultado con ventana disjunta:`);
  prueba("C5'", corte, "sigmaEnCubo", "a_r1nDj", f);
}

fs.writeFileSync(path.join(RAIZ,"conc-4-salida.json"), JSON.stringify({liston:LISTON,pruebas:PRUEBAS,resultados},null,1));
fs.writeFileSync(path.join(RAIZ,"conc-panel4.json"), JSON.stringify(panel));
console.log(`\nOK ${path.join(RAIZ,"conc-4-salida.json")}`);
