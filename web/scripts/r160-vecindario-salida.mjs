// ══ ¿ES MESETA O PICO? ══ «30% tras 1,5x» dio Sharpe 0,76 con vecinos en 0,70 y 0,66.
// Es la criba que ha matado hoy el freno del 3%, el del 5%, el aguante de 90d, el plazo de
// 250d y los análogos. Se aplica también a esto, aunque sea mío y me guste.
process.env.CAMINOS = "largo-p25-d400.json";
const M = await import("./motor-cartera.mjs");
const gm = M.OPS.map(o=>o.ma);
for(let i=0;i<M.OPS.length;i++) M.OPS[i].ma=(gm[i]>=0||gm[i]<-0.30)?999:gm[i];
const q=(X,p)=>{const S=[...X].sort((a,b)=>a-b);return S[Math.floor(p*(S.length-1))];};
const b41=(cf)=>{const S=[],A=[],C=[],F=[];
  for(let i=0;i<41;i++){const r=M.simular({...cf,capital:60000*(1+(i-20)*0.005)});
    S.push(r.sharpe);A.push(r.cagr);C.push(r.caida);F.push(r.final);}
  return {s:q(S,0.5),a:q(A,0.5),c:q(C,0.5),fin:q(F,0.5)};};
const CF={tam:0.12,huecos:2,modo:"spy",plazo:250,castigo:0.5*0.0276};
const base=b41({tam:0.12,huecos:2,modo:"spy",plazo:120,castigo:0.5*0.0276});
console.log("");
console.log("  base (120 días fijos): Sharpe "+base.s.toFixed(2)+" · "+base.a.toFixed(1)+"% · −"+base.c.toFixed(0)+"%");
console.log("");
const ARR=[0.20,0.25,0.30,0.35,0.40], MIN=[1.2,1.35,1.5,1.65,1.8,2.0];
console.log("  Sharpe · filas = arrastre, columnas = a partir de qué multiplicador se arma");
console.log("");
console.log("  "+"".padEnd(10)+MIN.map(m=>(m+"x").padStart(8)).join(""));
const T={};
for (const a of ARR){ let l="  "+((100*a).toFixed(0)+"%").padEnd(10);
  for (const m of MIN){ const r=b41({...CF,arrastre:a,minArrastre:m}); T[a+"|"+m]=r;
    l+=(r.s.toFixed(2)+(r.s>base.s+0.02?"*":" ")).padStart(8); }
  console.log(l); }
console.log("");
console.log("  * = gana al de hoy (Sharpe "+base.s.toFixed(2)+")");
const todas=Object.values(T).map(x=>x.s);
const gan=todas.filter(x=>x>base.s+0.02).length;
console.log("");
console.log("  ganan "+gan+" de "+todas.length+" casillas   ·   rango del Sharpe: "+
  Math.min(...todas).toFixed(2)+" a "+Math.max(...todas).toFixed(2));
// ¿los vecinos de la mejor también ganan?
const mejor=Object.entries(T).sort((a,b)=>b[1].s-a[1].s)[0];
const [ma_,mm_]=mejor[0].split("|").map(Number);
const ia=ARR.indexOf(ma_), im=MIN.indexOf(mm_);
const vec=[];
for(const [da,dm] of [[-1,0],[1,0],[0,-1],[0,1]]){ const a2=ARR[ia+da], m2=MIN[im+dm];
  if(a2!=null&&m2!=null&&T[a2+"|"+m2]) vec.push(T[a2+"|"+m2].s); }
console.log("");
console.log("  la mejor: arrastre "+(100*ma_).toFixed(0)+"% tras "+mm_+"x → Sharpe "+mejor[1].s.toFixed(2)+
  " · "+mejor[1].a.toFixed(1)+"% · caída −"+mejor[1].c.toFixed(0)+"%");
console.log("  sus 4 vecinos: "+vec.map(x=>x.toFixed(2)).join(", ")+"   (mediana "+q(vec,0.5).toFixed(2)+")");
console.log("");
const vecOK=vec.filter(x=>x>base.s+0.02).length;
console.log("  "+(gan>=12 && vecOK>=3
  ? "⇒ MESETA REAL: gana en "+gan+" de "+todas.length+" y sus vecinos también. Esto se queda."
  : gan>=8
  ? "⇒ media meseta: "+gan+" de "+todas.length+" ganan pero sólo "+vecOK+" de 4 vecinos. Dudoso."
  : "⇒ PICO. "+gan+" de "+todas.length+" ganan y "+vecOK+" de 4 vecinos. Misma firma que todo lo\n"+
    "     que ha muerto hoy. NO se toca la regla."));
console.log("");
