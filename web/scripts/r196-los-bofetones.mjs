// ══ LOS BOFETONES ══ Lester, 30-ago-2026:
//   «no tengo tanto problema de perder en SPY porque siempre vuelve a subir, es más, puedo
//    comprar el bajón. Pero los trades me cuestan, porque es como salir a la calle y recibir un
//    bofetón todo el tiempo: va a llegar un momento que no vas a querer salir.»
//
// Llevo todo el día optimizando SHARPE, que mide el zarandeo de la CUENTA. Él no sufre eso:
// sufre la FRECUENCIA y la RACHA de operaciones perdedoras. Y una estrategia que se abandona
// vale cero. Así que hay que medir otra cosa:
//   · cuántos bofetones al año
//   · cuál es la peor racha seguida
//   · cuánto tiempo pasa sin ver una ganadora
//   · cuánto duele cada uno
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";
import { abrir } from "./datos.mjs";
const CAP=60000, CAST=0.0275;
function pre(fs){const P={}; for(const f of fs) Object.assign(P,JSON.parse(readFileSync(join(CACHE,f),"utf8")));
  const PX={},IDX={},SPL={};
  for(const tk of Object.keys(P)){const D=Object.keys(P[tk]).sort();
    PX[tk]=D.map(d=>P[tk][d]); IDX[tk]=new Map(D.map((d,i)=>[d,i]));
    const S=new Set(); for(let i=1;i<D.length;i++){const r=PX[tk][i]/PX[tk][i-1]; if(r>1.35||r<0.65)S.add(i);}
    SPL[tk]=S;}
  return {PX,IDX,SPL};}
const E=pre(["precios-A.json","precios-B.json"]);
const ma50=(tk,d)=>{const i=E.IDX[tk]?.get(d); if(i==null||i<50)return null;
  for(let j=i-49;j<=i;j++) if(E.SPL[tk].has(j))return null;
  let s=0; for(let j=i-50;j<i;j++)s+=E.PX[tk][j]; return E.PX[tk][i]/(s/50)-1;};
const med=(V)=>{const B=[...V].sort((a,b)=>a-b); return B.length?B[Math.floor(B.length/2)]:null;};
function historia(f,cads){const O=JSON.parse(readFileSync(join(CACHE,f),"utf8")).ops;
  const m=new Map(); for(const o of O){const k=o.tk+"|"+o.dC.slice(0,6); if(!m.has(k))m.set(k,o);}
  const H={}; for(const [,o] of m){let q=null;
    for(const c of cads){let ch; try{ch=c.leer(o.tk,o.dC);}catch{continue;}
      if(!ch||!ch[o.exp])continue; const x=ch[o.exp][o.K+"|C"]; if(x&&x[0]>0&&x[1]>0){q=x;break;}}
    if(!q)continue; (H[o.tk]=H[o.tk]||[]).push([o.dC.slice(0,6),2*(q[1]-q[0])/(q[1]+q[0])]);}
  for(const t of Object.keys(H))H[t].sort((a,b)=>a[0].localeCompare(b[0])); return H;}
const hasta=(H,tk,dC)=>{const S=H[tk]; if(!S)return null; const m=dC.slice(0,6); const V=[];
  for(const [mm,h] of S){if(mm>=m)break; V.push(h);} return V.length>=6?med(V):null;};
const CADS=[abrir("cadenas-A",{callado:true}),abrir("cadenas-B",{callado:true})];

// las operaciones se ordenan por FECHA DE SALIDA: el bofetón se siente cuando se cierra
function perfil(q, anos) {
  const L = q.tom.map(x=>({dC:x.dC, g:x.dinero*(x.mult-1), pct:x.mult-1}))
                 .sort((a,b)=>a.dC.localeCompare(b.dC));
  const perd = L.filter(x=>x.g<0);
  let racha=0, peorRacha=0;
  for (const x of L){ if(x.g<0){racha++; if(racha>peorRacha)peorRacha=racha;} else racha=0; }
  // sequía más larga sin una ganadora, en meses
  let seq=0, peorSeq=0, ultGan=null;
  const ms=(d)=>Date.parse(d.slice(0,4)+"-"+d.slice(4,6)+"-"+d.slice(6,8));
  for (const x of L){ if(x.g>0){ if(ultGan!=null){const m=(ms(x.dC)-ultGan)/2629800; if(m>peorSeq)peorSeq=m;} ultGan=ms(x.dC);} }
  return { ops:L.length, alAno:L.length/anos, pctPerd:100*perd.length/L.length,
           perdAno:perd.length/anos, peorRacha, peorSeq,
           perdMed: perd.length?med(perd.map(x=>-x.g)):0,
           perdPct: perd.length?100*med(perd.map(x=>-x.pct)):0,
           peorUna: perd.length?Math.round(-Math.min(...perd.map(x=>x.g))):0 }; }

const CONF = [
  ["10% dentro · 10 huecos (la actual)", "sincosteAB-p10-d400.json", {tam:0.024,huecos:10}, 0],
  ["25% dentro · 10 huecos (la de antes)","sincosteAB-p25-d400.json", {tam:0.024,huecos:10}, 0],
  ["10% dentro · 5 huecos",               "sincosteAB-p10-d400.json", {tam:0.048,huecos:5},  0],
  ["10% dentro · 3 huecos",               "sincosteAB-p10-d400.json", {tam:0.08,huecos:3},   0],
  ["10% dentro · sólo horquilla <3%",     "sincosteAB-p10-d400.json", {tam:0.024,huecos:10}, 0.03],
];
console.log("");
console.log("  ══ EL PERFIL DE BOFETONES ══   (cartera de $60.000, 60 empresas)");
console.log("  " + "".padEnd(36)+"ops/año".padStart(9)+"pierden".padStart(9)+"BOFETONES".padStart(11)+
  "peor racha".padStart(12)+"meses sin".padStart(11)+"duele".padStart(10)+"  al año   Sharpe");
console.log("  " + "".padEnd(36)+"".padStart(9)+"".padStart(9)+"AL AÑO".padStart(11)+
  "seguida".padStart(12)+"ganar".padStart(11)+"la mediana".padStart(10));
let H=null;
for (const [et, f, cfg, tope] of CONF) {
  process.env.CAMINOS=f;
  const M=await import("./motor-cartera.mjs?bf="+f+tope);
  if (tope>0 && !H) H=historia(f,CADS);
  const V=M.OPS.map(o=>ma50(o.tk,o.dC));
  for(let i=0;i<M.OPS.length;i++){ const v=V[i];
    let ok = v!=null && v<-0.07 && v>=-0.30;
    if (ok && tope>0){ const h=hasta(H,M.OPS[i].tk,M.OPS[i].dC); if(h!=null&&h>tope) ok=false; }
    M.OPS[i].ma = ok ? v : 999; }
  const CF={...cfg,modo:"spy",plazo:120,castigo:CAST,suelo:0.50,costeMin:0};
  const F=[],S=[];
  for(let i=0;i<41;i++){const cap=CAP*(1+(i-20)*0.005);
    const q=M.simular({...CF,capital:cap}); F.push(q.final-cap); S.push(q.sharpe);}
  const q=M.simular({...CF,capital:CAP});
  const p=perfil(q, M.ANOS);
  console.log("  " + et.padEnd(36)+p.alAno.toFixed(0).padStart(9)+(p.pctPerd.toFixed(0)+"%").padStart(9)+
    p.perdAno.toFixed(0).padStart(11)+String(p.peorRacha).padStart(12)+
    p.peorSeq.toFixed(0).padStart(11)+("-"+p.perdPct.toFixed(0)+"%").padStart(10)+
    ("  $"+Math.round(M.med(F)/M.ANOS/1000)+"k").padStart(9)+M.med(S).toFixed(2).padStart(8)); }
console.log("");
