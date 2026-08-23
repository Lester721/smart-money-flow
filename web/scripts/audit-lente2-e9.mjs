// LENTE 2 - la rejilla eligiendo ruido. Auditoria de e9-prima-barata.mjs
import { diasDisponibles, cargarDia, operar, idxHora, rejilla, compraEn, resumen } from "./lib0dte.mjs";

const ENTRADAS = ["09:45","10:00","10:15","10:30","10:45","11:00","11:15","11:30","12:00"];
const SALIDAS  = ["11:30","12:00","12:30","13:00","14:00","15:00","15:30","15:55"];
const pc = (x)=> Number.isFinite(x) ? (x*100).toFixed(2).replace(".",",")+"%" : "--";
const d0 = (x)=> Number.isFinite(x) ? "$"+Math.round(x).toLocaleString("es-ES") : "--";
const n2 = (x)=> Number.isFinite(x)? x.toFixed(2).replace(".",","):"--";
const media = (v)=> v.reduce((a,b)=>a+b,0)/v.length;
const mediana = (v)=>{const s=[...v].sort((a,b)=>a-b);const m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};

const dias = diasDisponibles();
const fichas = [];
let t0 = Date.now();
for (const d of dias) {
  const D = cargarDia(d); if (!D) continue;
  const i0 = idxHora(D,"09:35"); if (i0<0) continue;
  const b0 = D.barras[i0], spot0 = b0.spot, K0 = rejilla(spot0);
  const aC = compraEn(b0,K0,"C"), aP = compraEn(b0,K0,"P");
  if (aC==null||aP==null||!(aC>0)||!(aP>0)) continue;
  const G = {};
  for (const hE of ENTRADAS) {
    const iE = idxHora(D,hE); if (iE<=i0) continue;
    const bm = D.barras[iE];
    const lado = bm.spot>=spot0 ? "C":"P";
    const Km = rejilla(bm.spot);
    for (const hS of SALIDAS) {
      const iS = idxHora(D,hS); if (iS<=iE) continue;
      const o = operar(D,iE,iS,Km,lado);
      const oi= operar(D,iE,iS,Km,lado==="C"?"P":"C");
      G[hE+">"+hS] = o ? {ret:o.ret, dolares:o.dolares, coste:o.coste, lado} : null;
      G["INV|"+hE+">"+hS] = oi ? {ret:oi.ret, dolares:oi.dolares, coste:oi.coste} : null;
    }
  }
  fichas.push({dia:d, ano:d.slice(0,4), spot0, straddle:aC+aP, rel:(aC+aP)/spot0, G});
}
console.log("fichas: "+fichas.length+"  ("+((Date.now()-t0)/1000).toFixed(0)+" s)");
const ANOS = (new Date(fichas.at(-1).dia)-new Date(fichas[0].dia))/(365.25*24*3600*1000);

function etiquetar(VM, VP, NCUBOS, MIN_HIST){
  MIN_HIST = MIN_HIST || 60;
  const ratio = new Array(fichas.length).fill(null);
  for (let i=0;i<fichas.length;i++){
    const prev = fichas.slice(Math.max(0,i-VM),i).map(f=>f.rel);
    if (prev.length>=VM) ratio[i] = fichas[i].rel/mediana(prev);
  }
  const cubo = new Array(fichas.length).fill(null);
  for (let i=0;i<fichas.length;i++){
    if (ratio[i]==null) continue;
    const hist=[]; for(let j=Math.max(0,i-VP);j<i;j++) if(ratio[j]!=null) hist.push(ratio[j]);
    if (hist.length<MIN_HIST) continue;
    const p = hist.filter(x=>x<ratio[i]).length/hist.length;
    cubo[i]=Math.min(NCUBOS-1, Math.floor(p*NCUBOS));
  }
  return cubo;
}
const CUBO = etiquetar(20,250,5);
for (let i=0;i<fichas.length;i++) fichas[i].cubo = CUBO[i];
const conCubo = fichas.filter(f=>f.cubo!=null);
const barato  = conCubo.filter(f=>f.cubo===0);

function medir(grupo, clave){
  const rets=[], dol=[], costes=[], dds=[]; let nulos=0;
  for (const f of grupo){ const r=f.G[clave]; if(!r){nulos++;continue;} rets.push(r.ret); dol.push(r.dolares); costes.push(r.coste); dds.push(f.dia); }
  if (!rets.length) return {n:0};
  const R = resumen(rets);
  const dm = media(dol);
  const Rd = resumen(dol);
  return {n:R.n, media:R.media, t:R.t, aciertos:R.aciertos, dolMedio:dm, tDol:Rd.t,
          dolAno:(dol.length/ANOS)*dm, medianaRet:mediana(rets), medianaDol:mediana(dol),
          costeMedio:media(costes), nulos, rets, dol, dds};
}

console.log("\n==== A) LA REJILLA COMPLETA - momento en dias de prima BARATA ====");
const celdas=[];
const grid={};
for (const hE of ENTRADAS) for (const hS of SALIDAS){
  const k=hE+">"+hS;
  const mb=medir(barato,k); if(!mb.n) continue;
  const mt=medir(fichas,k);
  const c={k, ...mb, todosMedia:mt.media, todosDol:mt.dolMedio};
  celdas.push(c); grid[k]=c;
}
celdas.sort((a,b)=>b.t-a.t);
console.log("   celdas medidas: "+celdas.length);
console.log("   "+"celda".padEnd(14)+"media%".padStart(9)+"t".padStart(7)+"$/op".padStart(9)+"tDol".padStart(7)+"medianaRet".padStart(12)+"$/ano".padStart(12)+"   (todos: media% / $op)");
for (const c of celdas) console.log("   "+c.k.padEnd(14)+pc(c.media).padStart(9)+n2(c.t).padStart(7)+d0(c.dolMedio).padStart(9)+n2(c.tDol).padStart(7)+pc(c.medianaRet).padStart(12)+d0(c.dolAno).padStart(12)+"   "+pc(c.todosMedia)+" / "+d0(c.todosDol));
const ts = celdas.map(c=>c.t);
console.log("   t: max "+n2(Math.max(...ts))+"  min "+n2(Math.min(...ts))+"  media "+n2(media(ts))+"  celdas con t>2: "+ts.filter(x=>x>2).length+"  celdas con $/op>0: "+celdas.filter(c=>c.dolMedio>0).length+"/"+celdas.length);

console.log("\n==== B) VECINDARIO de la celda del titular (10:00>15:55) ====");
console.log("   filas = entrada, columnas = salida.  celda: media% (t) [$/op]");
let cab = "".padEnd(9); for (const hS of SALIDAS) cab += hS.padStart(24); console.log(cab);
for (const hE of ENTRADAS){
  let ln = hE.padEnd(9);
  for (const hS of SALIDAS){ const c=grid[hE+">"+hS];
    ln += (c? pc(c.media)+"("+n2(c.t)+")["+d0(c.dolMedio)+"]" : "--").padStart(24); }
  console.log(ln);
}

console.log("\n==== C) RECORTE de colas - celda del titular 10:00>15:55, escalon BARATO ====");
{
  const m = medir(barato,"10:00>15:55");
  const idx = m.rets.map((r,i)=>i).sort((a,b)=>m.rets[a]-m.rets[b]);
  function recorta(p){
    const k = Math.max(1, Math.round(m.rets.length*p));
    const quedan = idx.slice(k, idx.length-k);
    const r = quedan.map(i=>m.rets[i]), d = quedan.map(i=>m.dol[i]);
    const R = resumen(r);
    return {n:R.n, media:R.media, t:R.t, dolMedio:media(d), dolAno:(d.length/ANOS)*media(d), k};
  }
  console.log("   sin recorte      n="+m.n+"  media "+pc(m.media)+"  t="+n2(m.t)+"  "+d0(m.dolMedio)+"/op  "+d0(m.dolAno)+"/ano  MEDIANA "+pc(m.medianaRet)+" / "+d0(m.medianaDol));
  for (const p of [0.005,0.01,0.02,0.05]){
    const r=recorta(p);
    console.log("   quitando "+pc(p).padStart(6)+" arriba y abajo ("+r.k+" dias por lado)  n="+r.n+"  media "+pc(r.media).padStart(9)+"  t="+n2(r.t).padStart(6)+"  "+d0(r.dolMedio).padStart(7)+"/op  "+d0(r.dolAno).padStart(10)+"/ano");
  }
  const ord = m.rets.map((r,i)=>({r, d:m.dol[i], dia:m.dds[i]})).sort((a,b)=>b.r-a.r);
  console.log("   los 6 dias que MAS aportan:");
  for (const o of ord.slice(0,6)) console.log("      "+o.dia+"  ret "+pc(o.r).padStart(9)+"  "+d0(o.d).padStart(8));
  const suma = m.rets.reduce((a,b)=>a+b,0);
  console.log("   suma de retornos = "+n2(suma)+" ; los 3 mejores suman "+n2(ord.slice(0,3).reduce((a,o)=>a+o.r,0))+" = "+pc(ord.slice(0,3).reduce((a,o)=>a+o.r,0)/suma)+" del total");
  console.log("   dias con ret>0: "+m.rets.filter(x=>x>0).length+"/"+m.n+" ; dias con ret<=-99% (expira sin valor): "+m.rets.filter(x=>x<=-0.99).length);
}

console.log("\n==== D) EL DENOMINADOR - el % sube porque el billete es mas barato ====");
for (let c=0;c<5;c++){
  const g=conCubo.filter(f=>f.cubo===c);
  const m=medir(g,"10:00>15:55");
  console.log("   escalon "+(c+1)+"  n="+String(m.n).padStart(4)+"  coste medio "+d0(m.costeMedio*100).padStart(7)+"  media "+pc(m.media).padStart(9)+"  t="+n2(m.t).padStart(6)+"  "+d0(m.dolMedio).padStart(7)+"/op  tDol="+n2(m.tDol).padStart(6)+"  "+d0(m.dolAno).padStart(11)+"/ano");
}
{
  const mt=medir(fichas,"10:00>15:55");
  console.log("   TODOS      n="+String(mt.n).padStart(4)+"  coste medio "+d0(mt.costeMedio*100).padStart(7)+"  media "+pc(mt.media).padStart(9)+"  t="+n2(mt.t).padStart(6)+"  "+d0(mt.dolMedio).padStart(7)+"/op  tDol="+n2(mt.tDol).padStart(6)+"  "+d0(mt.dolAno).padStart(11)+"/ano");
}

console.log("\n==== E) BARAJADO EN DOLARES - muchos desplazamientos ====");
{
  const mreal = medir(barato,"10:00>15:55");
  console.log("   REAL  media "+pc(mreal.media)+"  "+d0(mreal.dolMedio)+"/op  "+d0(mreal.dolAno)+"/ano");
  const res=[];
  for (let desp=5; desp<=400; desp+=7){
    const g = conCubo.filter((f,i)=>conCubo[(i+desp)%conCubo.length].cubo===0);
    const m = medir(g,"10:00>15:55"); if(!m.n) continue;
    res.push({desp, media:m.media, dol:m.dolMedio, t:m.t});
  }
  const mejoresPct = res.filter(r=>r.media>mreal.media).length;
  const mejoresDol = res.filter(r=>r.dol>mreal.dolMedio).length;
  console.log("   "+res.length+" barajados: "+mejoresPct+" superan el % real, "+mejoresDol+" superan el $/op real");
  console.log("   barajado: media% p50 "+pc(mediana(res.map(r=>r.media)))+"  max "+pc(Math.max(...res.map(r=>r.media)))+"  |  $/op p50 "+d0(mediana(res.map(r=>r.dol)))+"  max "+d0(Math.max(...res.map(r=>r.dol))));
  console.log("   los 8 barajados con mas %: " + res.slice().sort((a,b)=>b.media-a.media).slice(0,8).map(r=>"d"+r.desp+":"+pc(r.media)+"/"+d0(r.dol)).join("  "));
}

console.log("\n==== F) SENSIBILIDAD DE LOS PARAMETROS DE LA SENAL ====");
const sens=[];
for (const VM of [10,20,40]) for (const VP of [125,250,500]) for (const NC of [3,4,5,10]){
  const cb = etiquetar(VM,VP,NC);
  const g = fichas.filter((f,i)=>cb[i]===0);
  const m = medir(g,"10:00>15:55"); if(!m.n) continue;
  sens.push({VM,VP,NC,n:m.n,media:m.media,t:m.t,dol:m.dolMedio});
}
sens.sort((a,b)=>b.t-a.t);
for (const s of sens) console.log("   mediana "+String(s.VM).padStart(2)+"d - pct "+String(s.VP).padStart(3)+"d - "+String(s.NC).padStart(2)+" cubos   n="+String(s.n).padStart(4)+"  media "+pc(s.media).padStart(9)+"  t="+n2(s.t).padStart(6)+"  "+d0(s.dol).padStart(7)+"/op");
console.log("   combinaciones: "+sens.length+"  con t>2: "+sens.filter(s=>s.t>2).length+"  con $/op>0: "+sens.filter(s=>s.dol>0).length);

console.log("\n==== G) SIMETRIA en la rejilla del 15:55 ====");
for (const hE of ENTRADAS){
  const k=hE+">15:55"; const kI="INV|"+hE+">15:55";
  const m=medir(barato,k), mi=medir(barato,kI); if(!m.n) continue;
  console.log("   "+hE+"  lado del momento "+pc(m.media).padStart(9)+" "+d0(m.dolMedio).padStart(7)+"/op   |   lado CONTRARIO "+pc(mi.media).padStart(9)+" "+d0(mi.dolMedio).padStart(7)+"/op   |   suma $ "+d0(m.dolMedio+mi.dolMedio));
}
