// SI EL COMPRADOR PAGA 23,6% MÁS Y SÓLO SE MUEVE 10,3% MÁS, EL QUE COBRA ES EL VENDEDOR.
// Aquí se comprueba en las MISMAS unidades (movimiento diario) y se le pasa el peaje REAL:
// la horquilla bid/ask de los propios contratos del flujo, medida como % de la prima.
//
// implícito diario = ivPond / raíz(252)      realizado = |ret1|
// razón = realizado / implícito  ·  para una normal E|X| = 0,798·σ, así que ~0,80 es "justo".
import { readFileSync } from "node:fs"; import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib";
import { listonT, tWelch, pasarBarrera, informe } from "../../lib/barreraHallazgos";

const PRUEBAS = 19;
const RAIZ = path.join("scripts","cache-theta","marketsnack");
const P = JSON.parse(readFileSync(path.join(RAIZ,"iv-panel.json"),"utf8"));
const MIN_ROOTS_DIA = 20, VENT = 20, MIN_PREV = 10;
const media=v=>v.reduce((a,x)=>a+x,0)/v.length;
const med=v=>{const s=[...v].sort((a,b)=>a-b);return s[Math.floor(s.length/2)];};

P.sort((a,b)=> a.root===b.root ? a.fecha.localeCompare(b.fecha) : a.root.localeCompare(b.root));
const porRoot=new Map(); for(const f of P){ if(!porRoot.has(f.root))porRoot.set(f.root,[]); porRoot.get(f.root).push(f); }
for (const [,fl] of porRoot) for (let i=0;i<fl.length;i++){
  const prev=fl.slice(Math.max(0,i-VENT),i).map(x=>x.ivPond);
  if(prev.length<MIN_PREV){ fl[i].ivZ2=null; continue; }
  const mu=prev.reduce((a,x)=>a+x,0)/prev.length, sd=Math.sqrt(prev.reduce((a,x)=>a+(x-mu)**2,0)/(prev.length-1));
  fl[i].ivZ2 = sd>0 ? (fl[i].ivPond-mu)/sd : null;
}
for (const f of P) { const imp = f.ivPond/Math.sqrt(252);
  f.razon = (f.ret1!=null && imp>0) ? Math.abs(f.ret1)/imp : null; }

const val=P.filter(f=>f.ivZ2!=null&&f.razon!=null);
const porDia=new Map(); for(const f of val){ if(!porDia.has(f.fecha))porDia.set(f.fecha,[]); porDia.get(f.fecha).push(f); }
const filas=[];
for(const [fecha,g] of porDia){ if(g.length<MIN_ROOTS_DIA)continue;
  const ord=[...g].sort((a,b)=>a.ivZ2-b.ivZ2);
  ord.forEach((f,i)=>filas.push({fecha,ticker:f.root,rango:i/(g.length-1),pnl:f.razon})); }
console.log(`n=${filas.length} · días=${porDia.size}`);
const ord=[...filas].sort((a,b)=>a.rango-b.rango); const k=Math.floor(ord.length/3);
const g=[ord.slice(0,k),ord.slice(k,2*k),ord.slice(2*k)]; const et=["BAJO ","MEDIO","ALTO "];
console.log("\n── REALIZADO / IMPLÍCITO por tercio de ivZ (0,80 = precio justo bajo normalidad) ──");
for(let i=0;i<3;i++) console.log(`  ${et[i]} n=${g[i].length}  media ${media(g[i].map(x=>x.pnl)).toFixed(4)}  mediana ${med(g[i].map(x=>x.pnl)).toFixed(4)}`);
const A=g[2].map(x=>x.pnl), B=g[0].map(x=>x.pnl);
console.log(`\n  ALTO − BAJO = ${(media(A)-media(B)).toFixed(4)}  t=${tWelch(A,B).toFixed(2)} (listón ${listonT(PRUEBAS)})`);
console.log(`  ${media(A)<media(B) ? "el tercio ALTO realiza MENOS de lo implícito → ventaja para el VENDEDOR" : "el tercio ALTO realiza MÁS de lo implícito → ventaja para el COMPRADOR"}`);
const v=pasarBarrera(filas,f=>f.rango,{pruebas:PRUEBAS,nMinimo:200,maxPorTicker:0.2});
console.log(informe(v,"ivZ → realizado/implícito a 1d"));

// ── EL PEAJE REAL: horquilla de los contratos del flujo, en % de la prima ──────────────────
const DIRF=path.join(RAIZ,"flujo-100k"); const RE=/^([A-Z0-9.]+?)(\d{6})([CP])(\d{8})$/;
const CHART=path.join(RAIZ,"aux","chart-all");
const tickPrecio=new Set(fs.readdirSync(CHART).map(f=>f.replace(".json.gz","")));
const dias=fs.readdirSync(DIRF).filter(f=>f.endsWith(".jsonl.gz")).sort().filter((_,i)=>i%6===0);
const horq=[], horqCorto=[];
for(const f of dias){
  const L=zlib.gunzipSync(fs.readFileSync(path.join(DIRF,f))).toString("utf8").split("\n");
  for(const ln of L){ if(!ln)continue; const r=JSON.parse(ln);
    if(Number(r.timestamp.slice(11,13))>=19)continue;
    if(!(r.bid_price>0)||!(r.ask_price>0)||r.bid_price>r.ask_price)continue;
    const m=RE.exec(r.symbol); if(!m||!tickPrecio.has(m[1]))continue;
    const mid=(r.bid_price+r.ask_price)/2; if(!(mid>0))continue;
    const h=(r.ask_price-r.bid_price)/mid; horq.push(h);
    // vencimiento a <=7 días naturales: el vehículo de "vender movimiento a 1 día"
    const y=2000+Number(m[2].slice(0,2)), mo=Number(m[2].slice(2,4)), d=Number(m[2].slice(4,6));
    const dte=(Date.UTC(y,mo-1,d)-Date.parse(r.timestamp))/86400000;
    if(dte>=0&&dte<=7) horqCorto.push(h);
  }
}
console.log(`\n── HORQUILLA REAL de los contratos del flujo (${dias.length} días, ida y vuelta = 2×) ──`);
const q=(v,p)=>{const s=[...v].sort((a,b)=>a-b);return s[Math.floor(s.length*p)];};
console.log(`  todos los vencimientos  n=${horq.length}  p25 ${(100*q(horq,.25)).toFixed(1)}%  MEDIANA ${(100*q(horq,.5)).toFixed(1)}%  p75 ${(100*q(horq,.75)).toFixed(1)}% de la prima`);
console.log(`  vencimiento ≤7 días     n=${horqCorto.length}  p25 ${(100*q(horqCorto,.25)).toFixed(1)}%  MEDIANA ${(100*q(horqCorto,.5)).toFixed(1)}%  p75 ${(100*q(horqCorto,.75)).toFixed(1)}% de la prima`);
console.log(`  ida y vuelta al medio de la horquilla: ${(100*q(horqCorto,.5)).toFixed(1)}% de la prima  (media horquilla al entrar + media al salir)`);
console.log(`\n  ventaja medida del vendedor: ${(100*(media(B)-media(A))/media(B)).toFixed(1)}% de la prima implícita`);
console.log(`  peaje: ${(100*q(horqCorto,.5)).toFixed(1)}% de la prima  →  ${((media(B)-media(A))/media(B) > q(horqCorto,.5)) ? "SOBREVIVE" : "NO SOBREVIVE al peaje"}`);
