// PLACEBOS. Un +0,37%/día bruto (93% anual) es del tamaño que en este proyecto ya fue tres veces
// un escape de futuro. Antes de creerse nada: ¿el mismo número aparece donde NO puede haber señal?
import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib";
const P = JSON.parse(fs.readFileSync("scripts/marketsnack/lado-panel.json","utf8"));
const CH = path.join("scripts","cache-theta","marketsnack","aux","chart-all");
const cierres = new Map();
for(const f of fs.readdirSync(CH)){ if(!f.endsWith(".json.gz")) continue;
  let j; try{ j=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CH,f))).toString("utf8")); }catch{ continue; }
  const d=j?.data??[]; if(d.length<60) continue;
  cierres.set(f.replace(".json.gz",""), { c:d.map(p=>p.v), idx:new Map(d.map((p,i)=>[p.t.slice(0,10),i])), fechas:d.map(p=>p.t.slice(0,10)) });
}
const media=(v)=>v.length?v.reduce((a,x)=>a+x,0)/v.length:0;
const sd=(v)=>{ if(v.length<2)return 0; const m=media(v); return Math.sqrt(v.reduce((a,x)=>a+(x-m)**2,0)/(v.length-1)); };
const tUna=(v)=>{ const s=sd(v); return s>0? media(v)/(s/Math.sqrt(v.length)) : 0; };

// retorno entre desplazamientos a y b respecto al día de la señal (a<b). a=0,b=1 → el futuro real.
function ret(f,a,b){ const s=cierres.get(f.ticker); if(!s) return null; const i=s.idx.get(f.fecha); if(i==null) return null;
  const x=i+a, y=i+b; if(x<0||y<0||x>=s.c.length||y>=s.c.length) return null; return s.c[y]/s.c[x]-1; }

function carteraDiaria(filas, m, fr, mezclar=false, semilla=1){
  const porDia=new Map();
  for(const f of filas){ if(f[`q_${m}`]==null) continue; const r=fr(f); if(r==null) continue;
    let g=porDia.get(f.fecha); if(!g){g=[];porDia.set(f.fecha,g);} g.push({q:f[`q_${m}`],r}); }
  let sem=semilla; const rnd=()=>{ sem=(sem*1103515245+12345)&0x7fffffff; return sem/0x7fffffff; };
  const out=[];
  for(const [dia,g] of [...porDia].sort()){
    if(g.length<20) continue;
    if(mezclar){ const qs=g.map(x=>x.q); for(let i=qs.length-1;i>0;i--){const j=Math.floor(rnd()*(i+1));[qs[i],qs[j]]=[qs[j],qs[i]];} g.forEach((x,i)=>x.q=qs[i]); }
    const o=[...g].sort((a,b)=>a.q-b.q); const k=Math.floor(o.length/3); if(k<5) continue;
    out.push(media(o.slice(-k).map(x=>x.r))-media(o.slice(0,k).map(x=>x.r)));
  }
  return out;
}

const casos = [
  ["FUTURO REAL   cierre(D)→cierre(D+1)",   (f)=>ret(f,0,1),  false],
  ["mismo día     cierre(D-1)→cierre(D)",   (f)=>ret(f,-1,0), false],
  ["PLACEBO pasado cierre(D-5)→cierre(D-4)",(f)=>ret(f,-5,-4),false],
  ["PLACEBO pasado cierre(D-10)→cierre(D-9)",(f)=>ret(f,-10,-9),false],
  ["PLACEBO futuro lejano c(D+9)→c(D+10)",  (f)=>ret(f,9,10), false],
  ["PLACEBO barajado (futuro real, q mezclada)",(f)=>ret(f,0,1), true],
];
for(const [c,m] of [["11:00","deltaNeto"],["12:00","direccion"],["12:00","netoCall"]]){
  console.log(`\n═══ corte ${c} · ${m} ═══`);
  for(const [nombre,fr,mez] of casos){
    if(mez){ const ts=[]; for(let s=1;s<=20;s++) ts.push(tUna(carteraDiaria(P[c],m,fr,true,s*7919)));
      console.log(`  ${nombre.padEnd(44)} t de 20 barajadas: media ${media(ts).toFixed(2)} · |t| máx ${Math.max(...ts.map(Math.abs)).toFixed(2)} · ${ts.filter(x=>Math.abs(x)>2).length}/20 pasan |t|>2`);
      continue; }
    const v=carteraDiaria(P[c],m,fr);
    console.log(`  ${nombre.padEnd(44)} n=${String(v.length).padStart(3)} · media ${(media(v)*100).toFixed(3).padStart(7)}% · t=${tUna(v).toFixed(2).padStart(6)}`);
  }
}
