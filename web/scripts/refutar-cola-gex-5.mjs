import { readFileSync } from "node:fs";
const g = JSON.parse(readFileSync("scripts/cola-gex-filas.json","utf8")).sort((a,b)=>a.fecha.localeCompare(b.fecha));
const dias = new Map(JSON.parse(readFileSync("scripts/cola-cadena11.json","utf8")).map(d=>[d.fecha,d]));
const eur=(x)=>(x<0?"−":"")+"$"+Math.abs(Math.round(x)).toLocaleString("es-ES");
const cerca=(f,o)=>f.reduce((a,b)=>(Math.abs(b[0]-o)<Math.abs(a[0]-o)?b:a));
function condor(d,ala){const cC=cerca(d.C,d.spot+25),pC=cerca(d.P,d.spot-25);
 const cL=cerca(d.C,cC[0]+ala),pL=cerca(d.P,pC[0]-ala);
 const cr=cC[1]+pC[1]-cL[2]-pL[2];
 return{pl:(cr-Math.min(Math.max(d.cierre-cC[0],0),cL[0]-cC[0])-Math.min(Math.max(pC[0]-d.cierre,0),pC[0]-pL[0]))*100-8*0.03,cr};}
const S=[...dias.keys()].sort().map(f=>{const d=dias.get(f),c=condor(d,50),r=g.find(x=>x.fecha===f);
 return{fecha:f,pl:c.pl,cr:c.cr,zona:r.zonaSobreTotal};});
const met=(o)=>{const p=o.map(x=>x.pl);let pi=0,ac=0,pe=0;for(const x of o){ac+=x.pl;pi=Math.max(pi,ac);pe=Math.min(pe,ac-pi);}
 return{n:o.length,racha:pe,m2k:p.filter(x=>x<-2000).length,tot:p.reduce((a,x)=>a+x,0)};};
function fueraSerie(vals,q,sent){const s=new Set();
 for(let i=0;i<vals.length;i++){const v=vals[i];if(v==null||!isFinite(v))continue;
  const w=vals.slice(Math.max(0,i-60),i).filter(x=>x!=null&&isFinite(x));
  if(w.length<30)continue;const p=w.filter(x=>x<v).length/w.length;
  if(sent==="bajo"?p<q:p>1-q)s.add(i);} return s;}
const FG=fueraSerie(S.map(x=>x.zona),0.20,"bajo");
const dentro=i=>!FG.has(i)&&S[i].cr>=2;
const N=S.length,k=Math.floor(N/3);
console.log("═══ 19. TERCIOS CRONOLÓGICOS (217/217/219 días) contra el nulo de rotación ═══");
console.log("| tercio | fechas | base racha | receta racha | mediana nulo | percentil racha | base<−2k | receta<−2k | percentil |");
console.log("|---|---|---|---|---|---|---|---|---|");
const signos=[];
for(let t=0;t<3;t++){
 const idx=[...S.keys()].filter(i=>t<2?(i>=t*k&&i<(t+1)*k):(i>=2*k));
 const B=met(idx.map(i=>S[i])), R=met(idx.filter(dentro).map(i=>S[i]));
 const nr=[],nm=[];
 for(let kk=13;kk<N-13;kk++){const rot=S.map((_,i)=>S[(i+kk)%N].zona);const F=fueraSerie(rot,0.20,"bajo");
  const o=idx.filter(i=>!F.has(i)&&S[i].cr>=2).map(i=>S[i]); if(o.length<30)continue;const M=met(o);nr.push(M.racha);nm.push(M.m2k);}
 nr.sort((a,b)=>a-b);nm.sort((a,b)=>a-b);
 const pr=nr.filter(x=>x<R.racha).length/nr.length, pm=nm.filter(x=>x<R.m2k).length/nm.length;
 signos.push(pr>0.90?"+":"−");
 console.log(`| T${t+1} | ${S[idx[0]].fecha}→${S[idx[idx.length-1]].fecha} | ${eur(B.racha)} | ${eur(R.racha)} | ${eur(nr[nr.length>>1])} | ${(pr*100).toFixed(1)}% | ${B.m2k} | ${R.m2k} | ${(pm*100).toFixed(1)}% |`);}
console.log(`\n  signo por tercios contra el nulo correcto (racha): ${signos.join("")}`);
