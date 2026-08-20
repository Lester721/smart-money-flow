// REFUTACION - la regla elegida a las 11:00, aplicada TAL CUAL a otras horas y a otras alas.
// No se reajusta NADA: +-45, alas 50, por encima de MA5 y MA50. Solo cambia el momento de la foto.
import { readFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";

const CUENTA = 56389;
const PRUEBAS = 60, LISTON = listonT(PRUEBAS);
const eur = (x) => (x == null || !Number.isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const pct = (x) => (x == null || !Number.isFinite(x) ? "—" : (x * 100).toFixed(1) + "%");
const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const { HORAS, dias } = JSON.parse(readFileSync("scripts/refutar-amplitud-horas.json", "utf8"));
function caidaMax(pl){let c=0,p=0,w=0;for(const x of pl){c+=x;p=Math.max(p,c);w=Math.min(w,c-p);}return w;}
function es5de(pl){const o=[...pl].sort((a,b)=>a-b);return media(o.slice(0,Math.max(1,Math.round(pl.length*0.05))));}
const raya=(t)=>{console.log("\n"+"=".repeat(104));console.log("  "+t);console.log("=".repeat(104));};

// medias sobre los cierres de las 1123 sesiones, ESTRICTAMENTE anteriores
const MC=[5,50];
const MA={}; for(const k of MC) MA[k]=dias.map((_,i)=>{if(i<k)return null;let s=0;for(let j=i-k;j<i;j++)s+=dias[j].cierre;return s/k;});
const opera=(d,i)=>{const m1=MA[5][i],m2=MA[50][i];return m1!=null&&m2!=null&&d.sp[HORA]!=null&&d.sp[HORA]>=m1&&d.sp[HORA]>=m2;};

let rng=20260820; const rnd=()=>{rng=(rng*1103515245+12345)&0x7fffffff;return rng/0x7fffffff;};
const REPS=4000;
function nulo(pl,N){const de={e:[],c:[]},orden=pl.map((_,i)=>i);
  for(let r=0;r<REPS;r++){for(let i=orden.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[orden[i],orden[j]]=[orden[j],orden[i]];}
    const m=new Uint8Array(pl.length);for(let i=0;i<N;i++)m[orden[i]]=1;
    const s=pl.map((x,i)=>m[i]?x:0);de.e.push(es5de(s));de.c.push(caidaMax(s));}
  return de;}
const perc=(arr,v)=>arr.filter(x=>x<v).length/arr.length;
const med=(arr)=>{const s=[...arr].sort((a,b)=>a-b);return s[Math.floor(s.length/2)];};

console.log(`\n# LA HORA - el parametro que nadie cruzo\n`);
console.log(`${dias.length} sesiones ${dias[0].fecha} a ${dias[dias.length-1].fecha} - ${PRUEBAS} pruebas - liston |t| ${LISTON}`);
console.log(`Regla FIJA, elegida a las 11:00 y NO reajustada: +-45, alas 50, entrar solo si el indice esta`);
console.log(`sobre MA5 y MA50 (medias de cierres anteriores). Solo se mueve la hora de la foto.`);

let HORA="11:00";
const m2=Math.floor(dias.length/2);
const H=[[0,m2],[m2,dias.length]];

raya("G . LA MISMA REGLA A CINCO HORAS - +-45, alas 50, sin reajustar nada");
console.log("| hora | dias pool | dias op. | $/ano filtro | 5% peor filtro | 5% peor SIN filtro | mediana sorteo | percentil del nulo | caida filtro | caida sin filtro |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
const resHora={};
for(const h of HORAS){
  HORA=h;
  const k=`${h}|45|50`;
  const idx=dias.map((d,i)=>({d,i})).filter(({d})=>d.pnl[k]!=null);
  const pl=idx.map(({d})=>d.pnl[k]);
  const on=idx.map(({d,i})=>opera(d,i));
  const N=on.filter(Boolean).length;
  const fS=pl.map((x,i)=>on[i]?x:0);
  const anos=idx.length/252;
  const de=nulo(pl,N);
  const p=perc(de.e,es5de(fS));
  resHora[h]={p,e:es5de(fS),n:N};
  console.log(`| **${h}** | ${idx.length} | ${N} | ${eur(suma(fS)/anos)} | ${eur(es5de(fS))} | ${eur(es5de(pl))} | ${eur(med(de.e))} | **${(p*100).toFixed(1)}%** | ${eur(caidaMax(fS))} | ${eur(caidaMax(pl))} |`);
}
console.log(`\n  Horas con el filtro en la cola buena del nulo (>=95%): ${Object.entries(resHora).filter(([,v])=>v.p>=0.95).map(([h])=>h).join(", ")||"NINGUNA"}`);

raya("H . CADA HORA, PARTIDA EN DOS MITADES - y sin tocar nada");
console.log("| hora | mitad | dias op. | $/ano | 5% peor filtro | 5% peor sin filtro | percentil del nulo |");
console.log("|---|---|---|---|---|---|---|");
const okMitades={};
for(const h of HORAS){
  HORA=h;
  const k=`${h}|45|50`;
  okMitades[h]=[];
  for(const [ini,fin] of H){
    const idx=dias.slice(ini,fin).map((d,j)=>({d,i:ini+j})).filter(({d})=>d.pnl[k]!=null);
    const pl=idx.map(({d})=>d.pnl[k]);
    const on=idx.map(({d,i})=>opera(d,i));
    const N=on.filter(Boolean).length;
    const fS=pl.map((x,i)=>on[i]?x:0);
    const de=nulo(pl,N), p=perc(de.e,es5de(fS));
    okMitades[h].push(p);
    console.log(`| ${h} | ${dias[ini].fecha} a ${dias[fin-1].fecha} | ${N}/${idx.length} | ${eur(suma(fS)/(idx.length/252))} | ${eur(es5de(fS))} | ${eur(es5de(pl))} | **${(p*100).toFixed(1)}%** |`);
  }
}
console.log(`\n  Horas con percentil >=95% en LAS DOS mitades: ${Object.entries(okMitades).filter(([,v])=>v.every(x=>x>=0.95)).map(([h])=>h).join(", ")||"NINGUNA"}`);

raya("I . OTRAS ALAS - la anchura del ala tampoco se cruzo nunca (alas 25 contra alas 50, a las 11:00)");
console.log("| alas | dias pool | dias op. | $/ano | 5% peor filtro | 5% peor sin filtro | percentil del nulo | peor dia |");
console.log("|---|---|---|---|---|---|---|---|");
HORA="11:00";
for(const ala of [50,25]){
  const k=`11:00|45|${ala}`;
  const idx=dias.map((d,i)=>({d,i})).filter(({d})=>d.pnl[k]!=null);
  const pl=idx.map(({d})=>d.pnl[k]);
  const on=idx.map(({d,i})=>opera(d,i));
  const N=on.filter(Boolean).length;
  const fS=pl.map((x,i)=>on[i]?x:0);
  const de=nulo(pl,N);
  console.log(`| ${ala} | ${idx.length} | ${N} | ${eur(suma(fS)/(idx.length/252))} | ${eur(es5de(fS))} | ${eur(es5de(pl))} | **${(perc(de.e,es5de(fS))*100).toFixed(1)}%** | ${eur(Math.min(...fS))} |`);
}

raya("J . EL MECANISMO A CADA HORA - movimiento hasta el cierre, opera contra salta");
console.log("| hora | mov medio OPERA | mov medio SALTA | dias >1% OPERA | dias >1% SALTA | z de dos proporciones | pasa " + LISTON + "? |");
console.log("|---|---|---|---|---|---|---|");
for(const h of HORAS){
  HORA=h;
  const idx=dias.map((d,i)=>({d,i})).filter(({d})=>d.sp[h]!=null);
  const mv=({d})=>Math.abs(d.cierre/d.sp[h]-1);
  const op=idx.filter(({d,i})=>opera(d,i)), sa=idx.filter(({d,i})=>!opera(d,i)&&MA[50][i]!=null);
  const c1=op.filter(x=>mv(x)>0.01).length, c2=sa.filter(x=>mv(x)>0.01).length;
  const p1=c1/op.length, p2=c2/sa.length, p=(c1+c2)/(op.length+sa.length);
  const z=(p1-p2)/Math.sqrt(p*(1-p)*(1/op.length+1/sa.length));
  console.log(`| ${h} | ${pct(media(op.map(mv)))} | ${pct(media(sa.map(mv)))} | ${c1}/${op.length} (${pct(p1)}) | ${c2}/${sa.length} (${pct(p2)}) | **${z.toFixed(2)}** | ${Math.abs(z)>=LISTON?"si":"NO"} |`);
}
