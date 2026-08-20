// EL ÚNICO CANDIDATO VIVO: ivZ → tamaño del movimiento del día siguiente.
// Pasa muestra, concentración y los TRES tercios; sólo se queda corto en el listón (2,53 < 2,99).
//
// Aquí se mira EL MECANISMO, que es lo que decide si se puede cobrar:
//   · ¿es monótono por tercios, o vive en un extremo?
//   · ¿cuánto MÁS caro está lo que se compra (IV del día / IV de sus 20 días previos)?
//   · ¿cuánto MÁS se mueve de verdad?
//   Si se paga 1,25× y se mueve 1,08×, el comprador de movimiento PIERDE aunque la señal exista.
//   · ¿lo sostienen unos pocos días de resultados, o está repartido?
//   · ¿cuánta muestra faltaría para llegar al listón, y de dónde se saca?
import { readFileSync } from "node:fs"; import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib";
import { listonT, tWelch } from "../../lib/barreraHallazgos";

const RAIZ = path.join("scripts","cache-theta","marketsnack");
const P = JSON.parse(readFileSync(path.join(RAIZ,"iv-panel.json"),"utf8"));
const MIN_ROOTS_DIA = 20, VENT = 20, MIN_PREV = 10;

// rvPrev y nivel de IV relativo (ambos SÓLO con días anteriores)
const CHART = path.join(RAIZ,"aux","chart-all"); const serie = new Map();
for (const f of fs.readdirSync(CHART)) { const j=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CHART,f))).toString("utf8"));
  const d=j.data.map(p=>({f:p.t.slice(0,10),v:p.v}));
  serie.set(j.symbol,{c:d.map(x=>x.v), idx:new Map(d.map((x,i)=>[x.f,i]))}); }
function rvPrev(root,fecha,N=20){ const s=serie.get(root); if(!s)return null; const i=s.idx.get(fecha); if(i==null||i<N+1)return null;
  const r=[]; for(let k=i-N+1;k<=i;k++) r.push(s.c[k]/s.c[k-1]-1);
  const mu=r.reduce((a,x)=>a+x,0)/r.length; const sd=Math.sqrt(r.reduce((a,x)=>a+(x-mu)**2,0)/(r.length-1)); return sd>0?sd:null; }

P.sort((a,b)=> a.root===b.root ? a.fecha.localeCompare(b.fecha) : a.root.localeCompare(b.root));
const porRoot=new Map(); for(const f of P){ if(!porRoot.has(f.root))porRoot.set(f.root,[]); porRoot.get(f.root).push(f); }
for (const [,fl] of porRoot) for (let i=0;i<fl.length;i++){
  const prev=fl.slice(Math.max(0,i-VENT),i).map(x=>x.ivPond);
  fl[i].ivRel = prev.length>=MIN_PREV ? fl[i].ivPond/(prev.reduce((a,x)=>a+x,0)/prev.length) : null;  // cuánto MÁS caro que su normal
}
for (const f of P) { const rv=rvPrev(f.root,f.fecha); f.rvPrev=rv; f.mov1=(rv!=null&&f.ret1!=null)?Math.abs(f.ret1)/rv:null; }

// corte transversal por día sobre ivZ
const val=P.filter(f=>f.ivZ!=null&&f.mov1!=null&&f.ivRel!=null);
const porDia=new Map(); for(const f of val){ if(!porDia.has(f.fecha))porDia.set(f.fecha,[]); porDia.get(f.fecha).push(f); }
const filas=[];
for(const [fecha,g] of porDia){ if(g.length<MIN_ROOTS_DIA)continue;
  const ord=[...g].sort((a,b)=>a.ivZ-b.ivZ);
  ord.forEach((f,i)=>filas.push({fecha,ticker:f.root,rango:i/(g.length-1),mov1:f.mov1,ivRel:f.ivRel,ivZ:f.ivZ,ret1:f.ret1})); }
const media=v=>v.reduce((a,x)=>a+x,0)/v.length;
const med=v=>{const s=[...v].sort((a,b)=>a-b);return s[Math.floor(s.length/2)];};

console.log(`n=${filas.length} · días=${porDia.size}\n`);
console.log("── MONOTONÍA por tercios de ivZ (¿escalera o sólo un extremo?) ──");
const ord=[...filas].sort((a,b)=>a.rango-b.rango); const k=Math.floor(ord.length/3);
const grupos=[ord.slice(0,k), ord.slice(k,2*k), ord.slice(2*k)];
const et=["BAJO ","MEDIO","ALTO "];
for(let i=0;i<3;i++){ const g=grupos[i];
  console.log(`  ${et[i]}  n=${g.length}  movimiento ${media(g.map(x=>x.mov1)).toFixed(4)}×  (mediana ${med(g.map(x=>x.mov1)).toFixed(4)}×)  ·  paga IV ${media(g.map(x=>x.ivRel)).toFixed(4)}× su normal  ·  ivZ medio ${media(g.map(x=>x.ivZ)).toFixed(2)}`); }

console.log("\n── LO QUE SE PAGA CONTRA LO QUE SE MUEVE (tercio alto vs bajo) ──");
const A=grupos[2],B=grupos[0];
const pagaA=media(A.map(x=>x.ivRel)), pagaB=media(B.map(x=>x.ivRel));
const mueveA=media(A.map(x=>x.mov1)), mueveB=media(B.map(x=>x.mov1));
console.log(`  ALTO paga ${((pagaA-1)*100).toFixed(2)}% más de IV que su normal y se mueve ${((mueveA/mueveB-1)*100).toFixed(2)}% más que el tercio BAJO`);
console.log(`  BAJO paga ${((pagaB-1)*100).toFixed(2)}% más de IV que su normal`);
console.log(`  sobreprecio relativo ALTO−BAJO: ${(((pagaA/pagaB)-1)*100).toFixed(2)}%  ·  exceso de movimiento: ${((mueveA/mueveB-1)*100).toFixed(2)}%`);
console.log(`  → ${(pagaA/pagaB) > (mueveA/mueveB) ? "SE PAGA MÁS DE LO QUE SE MUEVE — el comprador de movimiento pierde" : "se mueve más de lo que se paga"}`);

console.log("\n── ¿VIVE EN UNOS POCOS DÍAS? separación diaria alto−bajo ──");
const porFecha=new Map(); for(const f of filas){ if(!porFecha.has(f.fecha))porFecha.set(f.fecha,[]); porFecha.get(f.fecha).push(f); }
const seps=[]; for(const [fe,g] of porFecha){ const o=[...g].sort((a,b)=>a.rango-b.rango); const kk=Math.floor(o.length/3); if(kk<3)continue;
  seps.push({fe, s: media(o.slice(-kk).map(x=>x.mov1))-media(o.slice(0,kk).map(x=>x.mov1))}); }
const pos=seps.filter(x=>x.s>0).length;
console.log(`  días medidos ${seps.length} · con separación positiva ${pos} (${(100*pos/seps.length).toFixed(1)}%)`);
const so=[...seps].sort((a,b)=>b.s-a.s);
console.log(`  5 mejores: ${so.slice(0,5).map(x=>x.fe+" "+x.s.toFixed(2)).join(" · ")}`);
console.log(`  5 peores : ${so.slice(-5).map(x=>x.fe+" "+x.s.toFixed(2)).join(" · ")}`);
const sinTop5 = filas.filter(f=>!so.slice(0,5).map(x=>x.fe).includes(f.fecha));
const o2=[...sinTop5].sort((a,b)=>a.rango-b.rango); const k2=Math.floor(o2.length/3);
const aA=o2.slice(-k2).map(x=>x.mov1), bB=o2.slice(0,k2).map(x=>x.mov1);
console.log(`  quitando los 5 mejores días: separación ${(media(aA)-media(bB)).toFixed(4)}× · t=${tWelch(aA,bB).toFixed(2)}`);

console.log("\n── QUÉ FALTA PARA LLEGAR AL LISTÓN ──");
const tObs=2.53, LIS=listonT(18);
console.log(`  t observado ${tObs} · listón ${LIS} (18 pruebas) · listón con UNA sola prueba prerregistrada: ${listonT(1)}`);
console.log(`  la t crece con la raíz de n: hace falta n × (${LIS}/${tObs})² = ${((LIS/tObs)**2).toFixed(2)} → ${Math.ceil(filas.length*(LIS/tObs)**2)} filas (ahora ${filas.length})`);
console.log(`  faltan ${Math.ceil(filas.length*((LIS/tObs)**2-1))} filas ≈ ${Math.ceil(filas.length*((LIS/tObs)**2-1)/(filas.length/porDia.size))} días más al ritmo actual de ${(filas.length/porDia.size).toFixed(0)} tickers/día`);

// ¿de dónde salen más filas SIN más días? bajando el mínimo de operaciones por celda
const DIRF=path.join(RAIZ,"flujo-100k"); const RE=/^([A-Z0-9.]+?)(\d{6})([CP])(\d{8})$/;
const tickPrecio=new Set(fs.readdirSync(CHART).map(f=>f.replace(".json.gz","")));
let celdas={}; const muestraDias=fs.readdirSync(DIRF).filter(f=>f.endsWith(".jsonl.gz")).sort();
for (const f of muestraDias.filter((_,i)=>i%6===0)) {
  const L=zlib.gunzipSync(fs.readFileSync(path.join(DIRF,f))).toString("utf8").split("\n");
  const c=new Map();
  for(const ln of L){ if(!ln)continue; const r=JSON.parse(ln);
    if(Number(r.timestamp.slice(11,13))>=19)continue;
    const iv=r.implied_volatility; if(iv==null||!(iv>0))continue;
    if(!(r.bid_price>0)||!(r.ask_price>0)||r.bid_price>r.ask_price)continue;
    const m=RE.exec(r.symbol); if(!m||!tickPrecio.has(m[1]))continue;
    c.set(m[1],(c.get(m[1])||0)+1); }
  for(const u of [10,15,20,30,50]) celdas[u]=(celdas[u]||0)+[...c.values()].filter(v=>v>=u).length;
}
const nd=muestraDias.filter((_,i)=>i%6===0).length;
console.log(`\n  tickers/día utilizables según el mínimo de operaciones por celda (muestra de ${nd} días):`);
for(const u of [10,15,20,30,50]) console.log(`    ≥${String(u).padStart(2)} ops → ${(celdas[u]/nd).toFixed(1)} tickers/día  (×${(celdas[u]/nd/(celdas[30]/nd)).toFixed(2)} respecto al ≥30 usado)`);
