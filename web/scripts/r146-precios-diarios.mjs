// ══ EL PRECIO DIARIO DE CADA TICKER ══ Lester, 2026-08-29.
//
// Para barrer el LARGO DE LA MEDIA hace falta el precio de TODOS los días, no sólo de los que
// produjeron operación. Reconstruirlo desde el fichero de operaciones daba sólo el 40% de los
// días: una «media de 20 sesiones» que en realidad abarcaba unos 50 días de calendario, y por
// eso el punto de partida salía 13,1% en vez de 21,4%.
//
// Esto lo saca del mismo sitio que todo lo demás — la paridad put-call de la cadena — y lo
// guarda una vez para siempre. Fichero pequeño, se reutiliza en cualquier barrido futuro.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { abrir } from "./datos.mjs";
import { CACHE } from "./raiz.mjs";
const TK = ["AAPL","AMD","META","MSFT","NVDA","QQQ","SPY","BA","JPM","INTC","F","BAC","DIS","XOM",
  "GE","PYPL","COST","CRM","ORCL","WMT","T","PFE","KO","CSCO","NKE","UNH","WBA"];
const cad = abrir("cadenas", { callado: true });
const ms = d => Date.parse(d.slice(0,4)+"-"+d.slice(4,6)+"-"+d.slice(6,8)+"T00:00:00Z");
const dteDe = (a,b) => Math.round((ms(b)-ms(a))/86400000);
function spotOk(c,hoy){ if(!c) return null; let e0=null,md=Infinity;
  for(const e of Object.keys(c)){const d=dteDe(hoy,e); if(d<1)continue; if(d<md){md=d;e0=e;}}
  if(!e0) return null; const g=c[e0]; let K=null,dm=Infinity;
  for(const cl of Object.keys(g)){ if(cl.slice(-1)!=="C")continue;
    const k=Number(cl.slice(0,-2)); const p=g[k+"|P"]; if(!p)continue;
    const d=Math.abs((g[cl][0]+g[cl][1])/2-(p[0]+p[1])/2); if(d<dm){dm=d;K=k;}}
  if(K==null) return null; const C=g[K+"|C"],P=g[K+"|P"];
  const s=K+(C[0]+C[1])/2-(P[0]+P[1])/2; return s>0?s:null; }
const OUT = {};
process.stdout.write("\n  precio diario: ");
for (const tk of TK) {
  process.stdout.write(tk+" ");
  const m = {};
  for (const d of cad.dias(tk)) { if (d < "20160104" || d > "20260819") continue;
    const s = spotOk(cad.leer(tk,d), d); if (s > 0) m[d] = Math.round(s*100)/100; }
  OUT[tk] = m; }
writeFileSync(join(CACHE, "precios-diarios.json"), JSON.stringify(OUT));
console.log("\n");
console.log("  ══ AUDIT ══");
const N = TK.map(t=>Object.keys(OUT[t]).length);
console.log("  días por ticker: mín " + Math.min(...N) + " · mediana " +
  [...N].sort((a,b)=>a-b)[Math.floor(N.length/2)] + " · máx " + Math.max(...N));
console.log("  días de SPY: " + Object.keys(OUT.SPY).length + "   (deberían ser ~2.640 en 10,6 años)");
// comprobación: la media de 20 aquí tiene que coincidir con la `ma` guardada en el fichero
const { readFileSync } = await import("node:fs");
const OPS = JSON.parse(readFileSync(join(CACHE,"largo-p25-d400.json"),"utf8")).ops;
let ok=0, mal=0, sin=0;
for (const o of OPS.filter((_,i)=>i%37===0)) {
  const D = Object.keys(OUT[o.tk]).sort(); const i = D.indexOf(o.dC);
  if (i < 20) { sin++; continue; }
  const prev = D.slice(i-20,i).map(d=>OUT[o.tk][d]);
  const ma = OUT[o.tk][o.dC] / (prev.reduce((a,b)=>a+b,0)/20) - 1;
  if (Math.abs(ma - o.ma) < 0.002) ok++; else mal++; }
console.log("  ✓ la media de 20 reconstruida contra la GUARDADA: " + ok + " cuadran · " + mal +
  " no cuadran · " + sin + " sin ventana   →  " + (mal <= ok*0.02 ? "CUADRA ✓" : "NO CUADRA ⛔"));
console.log("");
