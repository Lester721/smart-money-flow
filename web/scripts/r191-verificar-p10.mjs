// ══ VERIFICACIÓN PROPIA DEL HALLAZGO DEL ULTRACODE ══
// El sintetizador dice que comprar la call 10% dentro en vez de 25% mejora las dos cosas.
// No me fío de un subagente más de lo que me fío de mí: se remide desde cero.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";
const CAP=60000, CAST=0.0138;
function pre(fs){const P={}; for(const f of fs) Object.assign(P,JSON.parse(readFileSync(join(CACHE,f),"utf8")));
  const PX={},IDX={},SPL={};
  for(const tk of Object.keys(P)){const D=Object.keys(P[tk]).sort();
    PX[tk]=D.map(d=>P[tk][d]); IDX[tk]=new Map(D.map((d,i)=>[d,i]));
    const S=new Set(); for(let i=1;i<D.length;i++){const r=PX[tk][i]/PX[tk][i-1]; if(r>1.35||r<0.65)S.add(i);}
    SPL[tk]=S;}
  return {PX,IDX,SPL};}
const ma50=(E,tk,d)=>{const i=E.IDX[tk]?.get(d); if(i==null||i<50)return null;
  for(let j=i-49;j<=i;j++) if(E.SPL[tk].has(j))return null;
  let s=0; for(let j=i-50;j<i;j++)s+=E.PX[tk][j]; return E.PX[tk][i]/(s/50)-1;};
const CF={tam:0.024,huecos:10,modo:"spy",plazo:120,castigo:CAST,suelo:0.50,costeMin:0};

for (const [n, E, FS] of [["A+B (60)", pre(["precios-A.json","precios-B.json"]),
                            [["25% dentro (la publicada)","sincosteAB-p25-d400.json"],
                             ["10% dentro (el hallazgo)","sincosteAB-p10-d400.json"]]],
                          ["los 27",  pre(["precios-ajustados.json"]),
                            [["25% dentro (la publicada)","sincoste-p25-d400.json"],
                             ["10% dentro (el hallazgo)","sincoste-p10-d400.json"]]]]) {
  console.log("");
  console.log("  ══════ " + n + " ══════   (mediana de 41 capitales)");
  console.log("  " + "".padEnd(28)+"al año".padStart(11)+"%/año".padStart(8)+"caída".padStart(8)+
    "Sharpe".padStart(8)+"ops".padStart(6)+" acierta"+" mayor"+"  sin2020"+"  sin20y25");
  for (const [et, f] of FS) {
    process.env.CAMINOS=f;
    const M=await import("./motor-cartera.mjs?p10="+f);
    const V=M.OPS.map(o=>ma50(E,o.tk,o.dC));
    for(let i=0;i<M.OPS.length;i++){const v=V[i]; M.OPS[i].ma=(v!=null&&v<-0.07&&v>=-0.30)?v:999;}
    const F=[],A=[],C=[],S=[],O=[];
    for(let i=0;i<41;i++){const cap=CAP*(1+(i-20)*0.005);
      const q=M.simular({...CF,capital:cap});
      F.push(q.final-cap);A.push(q.cagr);C.push(q.caida);S.push(q.sharpe);O.push(q.ops);}
    const q=M.simular({...CF,capital:CAP});
    const L=q.tom.map(x=>x.dinero*(x.mult-1)); const tot=L.reduce((a,b)=>a+b,0);
    let may=0; for(const x of L) if(x>may)may=x;
    const ac=100*L.filter(x=>x>0).length/L.length;
    // ventanas sin 2020 y sin 2020 ni 2025: se mide el $/año del período recortado
    const gan=(sinA)=>{ let s=0;
      for(let t=1;t<q.dias.length;t++){const y=q.dias[t].slice(0,4);
        if(sinA.includes(y))continue; s+=q.pnlS[t]+q.pnlO[t];}
      const nAnos=M.ANOS-sinA.length; return s/nAnos; };
    console.log("  " + et.padEnd(28)+("$"+Math.round(M.med(F)/M.ANOS).toLocaleString("en-US")).padStart(11)+
      (M.med(A).toFixed(1)+"%").padStart(8)+("−"+M.med(C).toFixed(0)+"%").padStart(8)+
      M.med(S).toFixed(2).padStart(8)+String(Math.round(M.med(O))).padStart(6)+
      (ac.toFixed(0)+"%").padStart(8)+((100*may/tot).toFixed(0)+"%").padStart(6)+
      ("$"+Math.round(gan(["2020"])/1000)+"k").padStart(9)+
      ("$"+Math.round(gan(["2020","2025"])/1000)+"k").padStart(11));
  }
  process.env.CAMINOS=FS[0][1];
  const M=await import("./motor-cartera.mjs?p10="+FS[0][1]);
  const spy=M.spyApalancado(1);
  console.log("  " + "comprar SPY y dormir".padEnd(28)+
    ("$"+Math.round((spy.final-CAP)/M.ANOS).toLocaleString("en-US")).padStart(11)+
    (spy.cagr.toFixed(1)+"%").padStart(8)+("−"+spy.caida.toFixed(0)+"%").padStart(8)+
    spy.sharpe.toFixed(2).padStart(8));
}
console.log("");
