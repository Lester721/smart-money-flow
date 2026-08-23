// LENTE 2 (parte 4) - si el efecto es solo la cola, un spread (riesgo acotado) lo mata.
// Lester opera 0DTE con SPREADS, no desnudo: esta es la version operable de la regla.
import { diasDisponibles, cargarDia, operar, idxHora, rejilla, compraEn, ventaEn, resumen } from "./lib0dte.mjs";
const pc=(x)=>Number.isFinite(x)?(x*100).toFixed(2).replace(".",",")+"%":"--";
const d0=(x)=>Number.isFinite(x)?"$"+Math.round(x).toLocaleString("es-ES"):"--";
const n2=(x)=>Number.isFinite(x)?x.toFixed(2).replace(".",","):"--";
const media=(v)=>v.reduce((a,b)=>a+b,0)/v.length;
const mediana=(v)=>{const s=[...v].sort((a,b)=>a-b);const m=s.length>>1;return s.length%2?s[m]:(s[m-1]+s[m])/2;};

const ANCHOS=[10,25,50];
const fichas=[];
for (const d of diasDisponibles()){
  const D=cargarDia(d); if(!D) continue;
  const i0=idxHora(D,"09:35"); if(i0<0) continue;
  const b0=D.barras[i0], spot0=b0.spot, K0=rejilla(spot0);
  const aC=compraEn(b0,K0,"C"), aP=compraEn(b0,K0,"P");
  if(aC==null||aP==null||!(aC>0)||!(aP>0)) continue;
  const iE=idxHora(D,"10:00"), iS=idxHora(D,"15:55");
  const f={dia:d, ano:d.slice(0,4), rel:(aC+aP)/spot0, desnudo:null, spread:{}};
  if(iE>i0 && iS>iE){
    const bm=D.barras[iE], bs=D.barras[iS];
    const lado=bm.spot>=spot0?"C":"P", Km=rejilla(bm.spot);
    const o=operar(D,iE,iS,Km,lado);
    if(o) f.desnudo={ret:o.ret,dol:o.dolares};
    for(const w of ANCHOS){
      // vertical de debito: compro la pata pegada, VENDO la de mas afuera
      const Kv = lado==="C" ? Km+w : Km-w;
      const compraLarga = compraEn(bm,Km,lado), ventaCorta = ventaEn(bm,Kv,lado);   // abrir: pago ask, cobro bid
      const cierraLarga = ventaEn(bs,Km,lado), recompraCorta = compraEn(bs,Kv,lado); // cerrar: cobro bid, pago ask
      if(compraLarga==null||ventaCorta==null||cierraLarga==null||recompraCorta==null){ f.spread[w]=null; continue; }
      const coste = compraLarga - ventaCorta;
      if(!(coste>0)){ f.spread[w]=null; continue; }
      const salida = cierraLarga - recompraCorta;
      f.spread[w]={coste, ret:(salida-coste)/coste, dol:(salida-coste)*100, maxDol:(w-coste)*100};
    }
  }
  fichas.push(f);
}
for(let i=0;i<fichas.length;i++){
  const prev=fichas.slice(Math.max(0,i-20),i).map(f=>f.rel);
  fichas[i].ratio = prev.length>=20 ? fichas[i].rel/mediana(prev) : null;
}
for(let i=0;i<fichas.length;i++){
  fichas[i].cubo=null;
  if(fichas[i].ratio==null) continue;
  const h=[]; for(let j=Math.max(0,i-250);j<i;j++) if(fichas[j].ratio!=null) h.push(fichas[j].ratio);
  if(h.length<60) continue;
  fichas[i].cubo=Math.min(4,Math.floor((h.filter(x=>x<fichas[i].ratio).length/h.length)*5));
}
const conCubo=fichas.filter(f=>f.cubo!=null);
const barato=conCubo.filter(f=>f.cubo===0);
const ANOS=(new Date(fichas.at(-1).dia)-new Date(fichas[0].dia))/(365.25*24*3600*1000);

function med(g, sel){
  const r=[],dd=[]; let nul=0;
  for(const f of g){ const o=sel(f); if(!o){nul++;continue;} r.push(o.ret); dd.push(o.dol); }
  if(!r.length) return {n:0,nul};
  const R=resumen(r), Rd=resumen(dd);
  return {n:R.n, media:R.media, t:R.t, dol:media(dd), tDol:Rd.t, dolAno:(dd.length/ANOS)*media(dd), medDol:mediana(dd), nul};
}
console.log("==== LA MISMA REGLA CON RIESGO ACOTADO (vertical de debito 10:00 -> 15:55) ====");
console.log("   dias de prima BARATA, lado por momento; comprar al ask / vender al bid en las CUATRO patas\n");
const dn=med(barato,f=>f.desnudo);
console.log("   DESNUDO (lo del titular)   n="+String(dn.n).padStart(4)+"  media "+pc(dn.media).padStart(9)+"  t="+n2(dn.t).padStart(6)+"  "+d0(dn.dol).padStart(7)+"/op  tDol="+n2(dn.tDol).padStart(6)+"  mediana "+d0(dn.medDol).padStart(7)+"  "+d0(dn.dolAno).padStart(10)+"/ano");
for(const w of ANCHOS){
  const m=med(barato,f=>f.spread[w]);
  const mt=med(fichas.filter(f=>f.desnudo),f=>f.spread[w]);
  console.log("   spread "+String(w).padStart(2)+" puntos        n="+String(m.n).padStart(4)+"  media "+pc(m.media).padStart(9)+"  t="+n2(m.t).padStart(6)+"  "+d0(m.dol).padStart(7)+"/op  tDol="+n2(m.tDol).padStart(6)+"  mediana "+d0(m.medDol).padStart(7)+"  "+d0(m.dolAno).padStart(10)+"/ano   huecos "+m.nul+"   | TODOS: "+pc(mt.media)+" "+d0(mt.dol)+"/op");
}
console.log("\n   escalera por escalon de prima, spread de 25 puntos:");
for(let c=0;c<5;c++){
  const m=med(conCubo.filter(f=>f.cubo===c),f=>f.spread[25]);
  console.log("      escalon "+(c+1)+"  n="+String(m.n).padStart(4)+"  media "+pc(m.media).padStart(9)+"  t="+n2(m.t).padStart(6)+"  "+d0(m.dol).padStart(7)+"/op  "+d0(m.dolAno).padStart(10)+"/ano");
}
console.log("\n   recorte de colas sobre el DESNUDO ya se hizo; aqui el desnudo SIN su mejor dia frente al spread:");
{
  const arr=barato.filter(f=>f.desnudo).map(f=>f.desnudo.dol).sort((a,b)=>b-a);
  console.log("      desnudo: mejor dia "+d0(arr[0])+" de un total acumulado de "+d0(arr.reduce((a,b)=>a+b,0))+"  = "+pc(arr[0]/arr.reduce((a,b)=>a+b,0))+" de TODA la ganancia de 4,6 anos");
  const s=barato.filter(f=>f.spread[25]).map(f=>f.spread[25].dol).sort((a,b)=>b-a);
  console.log("      spread25: mejor dia "+d0(s[0])+" de un total de "+d0(s.reduce((a,b)=>a+b,0)));
}
console.log("\n==== CUANTA MUESTRA HARIA FALTA PARA UN t=4 ====");
{
  const dd=barato.filter(f=>f.desnudo).map(f=>f.desnudo.dol);
  const R=resumen(dd);
  const need=Math.ceil(Math.pow(4*R.sd/R.media,2));
  console.log("   desnudo: media "+d0(R.media)+"/op  desviacion "+d0(R.sd)+"  t="+n2(R.t));
  console.log("   operaciones necesarias para t=4: "+need.toLocaleString("es-ES")+"  ->  a "+n2(dd.length/ANOS)+" ops/ano son "+Math.round(need/(dd.length/ANOS)).toLocaleString("es-ES")+" ANOS de SPX");
}
