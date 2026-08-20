// REFUTACIÓN parte 2 — nulos, concentración en pocos días, año a año, señales rivales
import { readFileSync } from "node:fs";
const g = JSON.parse(readFileSync("scripts/cola-gex-filas.json","utf8")).sort((a,b)=>a.fecha.localeCompare(b.fecha));
const dias = new Map(JSON.parse(readFileSync("scripts/cola-cadena11.json","utf8")).map(d=>[d.fecha,d]));
const eur=(x)=>(x<0?"−":"")+"$"+Math.abs(Math.round(x)).toLocaleString("es-ES");
const cerca=(f,o)=>f.reduce((a,b)=>(Math.abs(b[0]-o)<Math.abs(a[0]-o)?b:a));
const A=653/252;
function condor(d,ala){const cC=cerca(d.C,d.spot+25),pC=cerca(d.P,d.spot-25);
 const cL=cerca(d.C,cC[0]+ala),pL=cerca(d.P,pC[0]-ala);
 if(cL[0]<=cC[0]||pL[0]>=pC[0])return null;
 const cr=cC[1]+pC[1]-cL[2]-pL[2]; if(!(cr>0))return null;
 const pl=(cr-Math.min(Math.max(d.cierre-cC[0],0),cL[0]-cC[0])-Math.min(Math.max(pC[0]-d.cierre,0),pC[0]-pL[0]))*100-8*0.03;
 return{pl,cr};}
const fechas=[...dias.keys()].sort();
const S=fechas.map(f=>{const d=dias.get(f),c=condor(d,50),r=g.find(x=>x.fecha===f);
 return{fecha:f,pl:c.pl,cr:c.cr,zona:r.zonaSobreTotal,iv:r.ivATM,sigma:r.sigmaPts,ancho:r.anchoRel,gexRatio:r.gexRatio,gexNet:r.gexNetSuave};});

const met=(o)=>{const p=o.map(x=>x.pl),t=p.reduce((s,x)=>s+x,0);let pi=0,ac=0,pe=0;
 for(const x of o){ac+=x.pl;pi=Math.max(pi,ac);pe=Math.min(pe,ac-pi);}
 const s=[...p].sort((a,b)=>a-b);
 return{n:o.length,anio:t/A,peor:s[0],p5:s[Math.floor(s.length*0.05)],racha:pe,m2k:p.filter(x=>x<-2000).length};};
function fueraSerie(vals,q,sent,ven=60,minv=30){const s=new Set();
 for(let i=0;i<vals.length;i++){const v=vals[i];if(v==null||!isFinite(v))continue;
  const w=vals.slice(Math.max(0,i-ven),i).filter(x=>x!=null&&isFinite(x));
  if(w.length<minv)continue;const p=w.filter(x=>x<v).length/w.length;
  if(sent==="bajo"?p<q:p>1-q)s.add(i);} return s;}
const aplic=(exc,cmin)=>met(S.filter((x,i)=>!exc.has(i)&&x.cr>=cmin));

const FG=fueraSerie(S.map(x=>x.zona),0.20,"bajo");
const base=met(S), real=aplic(FG,2), soloGex=aplic(FG,0);

// ═══ 3. ¿DÓNDE ESTÁ LA CAÍDA? ═══
function rachaDetalle(o){let pi=0,ac=0,pe=0,ini=null,fin=null,cur=null;
 for(const x of o){ac+=x.pl;if(ac>=pi){pi=ac;cur=null;}else{if(cur===null)cur=x.fecha;
  if(ac-pi<pe){pe=ac-pi;ini=cur;fin=x.fecha;}}}
 return{pe,ini,fin};}
console.log("═══ 3. DÓNDE VIVE LA CAÍDA ═══");
const rb=rachaDetalle(S), rr=rachaDetalle(S.filter((x,i)=>!FG.has(i)&&x.cr>=2));
console.log(`base:     ${eur(rb.pe)}  ${rb.ini} → ${rb.fin}`);
console.log(`filtrada: ${eur(rr.pe)}  ${rr.ini} → ${rr.fin}`);
// los 10 peores días y si el filtro los quita
console.log("\n10 peores días de la base — ¿los quita el filtro?");
[...S.keys()].sort((a,b)=>S[a].pl-S[b].pl).slice(0,10).forEach(i=>{
 const q=FG.has(i)?"GEX":(S[i].cr<2?"créd":"— PASA");
 console.log(`  ${S[i].fecha} ${eur(S[i].pl)}  créd $${S[i].cr.toFixed(2)}  zona ${S[i].zona.toFixed(3)}  → ${q}`);});

// ═══ 4. NULO POR ROTACIÓN CIRCULAR DE LA SEÑAL ═══
console.log("\n═══ 4. NULO — rotar la señal (zona) k días; misma autocorrelación, alineación destruida ═══");
const N=S.length; const nulos=[];
for(let k=25;k<N-25;k++){
 const rot=S.map((_,i)=>S[(i+k)%N].zona);
 const F=fueraSerie(rot,0.20,"bajo");
 nulos.push(aplic(F,2));}
const pct=(arr,v)=>arr.filter(x=>x<=v).length/arr.length;
for(const [nom,key,mejorEsMenor] of [["racha","racha",false],["p5","p5",false],["<−2k","m2k",true],["$/año","anio",false]]){
 const vals=nulos.map(x=>x[key]).sort((a,b)=>a-b); const v=real[key];
 const p=vals.filter(x=>x<v).length/vals.length;
 const med=vals[Math.floor(vals.length/2)];
 console.log(`  ${nom.padEnd(7)} real=${typeof v==="number"&&Math.abs(v)>50?eur(v):v}  ·  nulo mediana=${Math.abs(med)>50?eur(med):med}  ·  p5nulo=${Math.abs(vals[Math.floor(vals.length*0.05)])>50?eur(vals[Math.floor(vals.length*0.05)]):vals[Math.floor(vals.length*0.05)]}  ·  percentil del real=${(p*100).toFixed(1)}%`);}
console.log(`  (n rotaciones = ${nulos.length}; días retenidos por el nulo: mediana ${nulos.map(x=>x.n).sort((a,b)=>a-b)[nulos.length>>1]} vs real ${real.n})`);

// ═══ 5. NULO ALEATORIO iid a la misma tasa ═══
console.log("\n═══ 5. NULO — subconjunto aleatorio del mismo tamaño ═══");
let semilla=12345; const rnd=()=>{semilla=(semilla*1664525+1013904223)>>>0;return semilla/4294967296;};
const NA=[]; for(let it=0;it<4000;it++){
 const idx=[...S.keys()].map(i=>[rnd(),i]).sort((a,b)=>a[0]-b[0]).slice(0,real.n).map(x=>x[1]).sort((a,b)=>a-b);
 NA.push(met(idx.map(i=>S[i])));}
for(const key of ["racha","p5","m2k","anio"]){
 const vals=NA.map(x=>x[key]).sort((a,b)=>a-b); const v=real[key];
 console.log(`  ${key.padEnd(6)} real=${Math.abs(v)>50?eur(v):v} · nulo mediana=${Math.abs(vals[2000])>50?eur(vals[2000]):vals[2000]} · percentil=${(vals.filter(x=>x<v).length/vals.length*100).toFixed(1)}%`);}

// ═══ 6. QUITAR LOS 3 DÍAS QUE MÁS APORTAN ═══
console.log("\n═══ 6. QUITAR LOS 3 DÍAS EVITADOS MÁS GRANDES (devolverlos a la cartera) ═══");
const evitados=[...S.keys()].filter(i=>FG.has(i)||S[i].cr<2).sort((a,b)=>S[a].pl-S[b].pl);
console.log("  los 5 mayores rescates:",evitados.slice(0,5).map(i=>`${S[i].fecha} ${eur(S[i].pl)}`).join(" · "));
for(const k of [1,2,3,5]){
 const devolver=new Set(evitados.slice(0,k));
 const o=S.filter((x,i)=>devolver.has(i)||(!FG.has(i)&&x.cr>=2));
 const R=met(o); console.log(`  devolviendo los ${k} peores evitados → racha ${eur(R.racha)} · p5 ${eur(R.p5)} · <−2k ${R.m2k} · $/año ${eur(R.anio)}`);}

// ═══ 7. AÑO A AÑO, sólo el filtro GEX (ala 50, sin el truco del ala) ═══
console.log("\n═══ 7. AÑO A AÑO — filtro GEX rod 20% + créd≥2, ALA 50 ═══");
console.log("| año | base n | base $/año | base racha | base <−2k | filtr n | filtr $ | filtr racha | filtr <−2k |");
console.log("|---|---|---|---|---|---|---|---|---|");
for(const a of ["2024","2025","2026"]){
 const b=met(S.filter(x=>x.fecha.startsWith(a)));
 const f=met(S.filter((x,i)=>x.fecha.startsWith(a)&&!FG.has(i)&&x.cr>=2));
 console.log(`| ${a} | ${b.n} | ${eur(b.anio*A/ (b.n/252))} | ${eur(b.racha)} | ${b.m2k} | ${f.n} | — | ${eur(f.racha)} | ${f.m2k} |`);}

// ═══ 8. SEÑALES RIVALES: ¿aporta el GEX algo sobre la IV o el crédito? ═══
console.log("\n═══ 8. SEÑALES RIVALES (mismo filtro rodante 20%, mismo suelo de crédito $2) ═══");
console.log("| señal (se excluye el 20% rodante) | días | $/año | peor | p5 | racha | <−2k |");
console.log("|---|---|---|---|---|---|---|");
const RIV=[["zona (el del hallazgo) bajo","zona","bajo"],["ivATM alto","iv","alto"],["sigmaPts alto","sigma","alto"],
 ["crédito alto","cr","alto"],["anchoRel bajo (25pts/σ)","ancho","bajo"],["gexRatio bajo","gexRatio","bajo"],["gexNetSuave bajo","gexNet","bajo"]];
for(const [nom,campo,sent] of RIV){
 const F=fueraSerie(S.map(x=>x[campo]),0.20,sent); const R=aplic(F,2);
 console.log(`| ${nom} | ${R.n} | ${eur(R.anio)} | ${eur(R.peor)} | ${eur(R.p5)} | ${eur(R.racha)} | ${R.m2k} |`);}
// solape
const FIV=fueraSerie(S.map(x=>x.iv),0.20,"alto"), FCR=fueraSerie(S.map(x=>x.cr),0.20,"alto");
const inter=(a,b)=>[...a].filter(x=>b.has(x)).length;
console.log(`\nsolape GEX∩IValta = ${inter(FG,FIV)}/${FG.size}  ·  GEX∩créditoAlto = ${inter(FG,FCR)}/${FG.size}`);
const FC2=new Set([...S.keys()].filter(i=>S[i].cr<2));
console.log(`solape GEX∩(créd<$2) = ${inter(FG,FC2)}/${FG.size}   (el hallazgo afirma 80% de solape)`);
