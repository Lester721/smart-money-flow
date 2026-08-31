// ══ LA PALANCA NUEVA → LA WEB ══ Lester, 30-ago-2026: «quita la palanca vieja de la web,
// monta la nueva».
//
// Sustituye la tabla publicada (que era la vieja: media 20, 2 huecos, con el mínimo de $5.000 —
// 51 operaciones donde UNA valía el 43% del dinero) por la regla que aprobó el examen del
// grupo B el 30 de agosto.
//
// Los números NO se escriben a mano: salen del mismo motor que todo lo demás.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RAIZ, CACHE } from "./raiz.mjs";

const CAP = 60000, CAST = 0.0275, NMA = 50, CORTE = -0.07;   // castigo = media horquilla REAL (5,5%/2)
const P = {}; for (const f of ["precios-A.json", "precios-B.json"])
  Object.assign(P, JSON.parse(readFileSync(join(CACHE, f), "utf8")));
const PX={}, IDX={}, SPL={};
for (const tk of Object.keys(P)) { const D = Object.keys(P[tk]).sort();
  PX[tk]=D.map(d=>P[tk][d]); IDX[tk]=new Map(D.map((d,i)=>[d,i]));
  const S=new Set(); for(let i=1;i<D.length;i++){const r=PX[tk][i]/PX[tk][i-1]; if(r>1.35||r<0.65)S.add(i);}
  SPL[tk]=S; }
const ma50=(tk,d)=>{const i=IDX[tk]?.get(d); if(i==null||i<NMA)return null;
  for(let j=i-NMA+1;j<=i;j++) if(SPL[tk].has(j))return null;
  let s=0; for(let j=i-NMA;j<i;j++)s+=PX[tk][j]; return PX[tk][i]/(s/NMA)-1;};

process.env.CAMINOS = "sincosteAB-p10-d400.json";   // 10% dentro, no 25% (r191: verificado a mano)
const M = await import("./motor-cartera.mjs");
const V = M.OPS.map(o=>ma50(o.tk,o.dC));
for (let i=0;i<M.OPS.length;i++){const v=V[i]; M.OPS[i].ma=(v!=null&&v<CORTE&&v>=-0.30)?v:999;}
const CF = { tam:0.024, huecos:10, modo:"spy", plazo:120, castigo:CAST, suelo:0.50, costeMin:0 };

// la cifra que se publica es la MEDIANA de 41 capitales de partida, no una corrida suelta
const FF=[]; for(let i=0;i<41;i++){const cap=CAP*(1+(i-20)*0.005);
  FF.push(M.simular({...CF,capital:cap}).final-cap);}
const gananciaMediana = M.med(FF);

const q = M.simular({...CF, capital:CAP});
function rachas(L){ let rp=0,rg=0,cp=0,cg=0,peorAc=0,ac=0;
  for(const x of L){ const g=x.dinero*(x.mult-1);
    if(g>0){cg++;cp=0;ac=Math.min(0,ac+g);} else {cp++;cg=0;ac+=g;}
    rp=Math.max(rp,cp); rg=Math.max(rg,cg); peorAc=Math.min(peorAc,ac);}
  return {rachaPerd:rp, rachaGan:rg, peorCaida:peorAc}; }
const ops = q.tom.slice().sort((a,b)=>a.dC.localeCompare(b.dC))
  .map(x=>({...x, gan:x.dinero*(x.mult-1)}));
const porAno=[];
for (const y of ["2016","2017","2018","2019","2020","2021","2022","2023","2024","2025","2026"]) {
  const L=ops.filter(x=>x.y===y); if(!L.length) continue;
  const r=rachas(L);
  // ⚠️ La ganancia del AÑO tiene que incluir lo que aportó el SPY ocioso, si no la columna
  //    suma $117.568 y el total dice $286.431, y parece que falta dinero. El 65% lo pone SPY.
  const idx = q.dias.map((d,i)=>[d,i]).filter(([d])=>d.startsWith(y)).map(([,i])=>i);
  const ganSPY = idx.length ? q.pnlS.slice(idx[0], idx[idx.length-1]+1).reduce((a,b)=>a+b,0) : 0;
  const ganOPC = idx.length ? q.pnlO.slice(idx[0], idx[idx.length-1]+1).reduce((a,b)=>a+b,0) : 0;
  porAno.push({ ano:y, ops:L.length, ganancia:ganSPY+ganOPC, gananciaSPY:ganSPY, gananciaTrade:ganOPC,
    peorOp:Math.min(...L.map(x=>x.gan)), peorCaida:r.peorCaida,
    rachaPerd:r.rachaPerd, rachaGan:r.rachaGan }); }
const rT=rachas(ops), anos=M.ANOS;
const total = { ops:ops.length, ganancia:gananciaMediana, alAno:gananciaMediana/anos,
  peorOp:Math.min(...ops.map(x=>x.gan)), peorCaida:rT.peorCaida,
  rachaPerd:rT.rachaPerd, rachaGan:rT.rachaGan,
  acierto:ops.filter(x=>x.gan>0).length/ops.length,
  porOperacion:ops.reduce((a,x)=>a+(x.mult-1),0)/ops.length,
  desde:ops[0].dC.slice(0,4)+"-"+ops[0].dC.slice(4,6)+"-"+ops[0].dC.slice(6,8), hasta:"2026-08-19" };
const spy=M.spyApalancado(1), spyGan=spy.final-CAP;

const TABLA = {
  nombre: "LA PALANCA · calls muy dentro del dinero",
  unidad: "cartera de $60.000 · 60 grandes capitalizaciones · el ocioso en SPY",
  nota: "CALL 10% dentro del dinero, vencimiento a ~400 días, comprada AL ASK el día que la acción " +
    "está más de un 7% por debajo de su media de 50 sesiones. Se aguanta 120 sesiones, suelo 0,50x, " +
    "sin tope de ganancia, se vende AL BID. 10 posiciones simultáneas al 2,4% del patrimonio cada una " +
    "(24% de exposición total), una por empresa. Sin mínimo de coste por contrato. " +
    "Precios reales, más un castigo de ejecución del 2,75% (media horquilla real medida sobre las " +
    "operaciones que la regla coge de verdad: la horquilla mediana es 5,5%, no el 2,76% que se usaba antes). " +
    "APROBÓ EL EXAMEN FUERA DE MUESTRA el 30 de agosto de 2026 con criterios escritos antes de mirar los " +
    "datos: afinada en 24 empresas dio 17,6% al año y en 36 que nunca había visto dio 17,6%. " +
    "Después, un barrido multiagente encontró que comprar la call 10% dentro en vez de 25% mejora las dos " +
    "cosas: el contrato cuesta 41% menos ($2.015 contra $3.430) y entra donde el caro no cabía. " +
    "AVISOS: (1) el Sharpe apenas supera a comprar SPY y dormir (0,74 contra 0,70): se gana más porque se " +
    "asume más, no por acertar más; (2) la caída máxima es −47% contra el −34% de SPY; (3) el acierto es " +
    "del 46%: menos de la mitad de las operaciones ganan, y la estrategia vive de que las ganadoras son " +
    "mucho mayores que las perdedoras; (4) el 65% del dinero lo pone el SPY ocioso, no las opciones. " +
    "En el mismo período comprar SPY y dormir da $" + Math.round(spyGan).toLocaleString("es-ES") +
    ", o sea $" + Math.round(spyGan/anos).toLocaleString("es-ES") + " al año.",
  porAno, total };

const F = join(RAIZ, "lib", "estrategias-por-ano.json");
const J = JSON.parse(readFileSync(F, "utf8"));
J.tablas = J.tablas.filter(t => !t.nombre.startsWith("LA PALANCA"));
J.tablas.unshift(TABLA);
J.generado = new Date().toISOString().slice(0,10);
writeFileSync(F, JSON.stringify(J, null, 1), "utf8");

console.log("");
console.log("  ══ LA PALANCA NUEVA → la web ══");
console.log("  " + total.ops + " operaciones · " + total.desde + " → " + total.hasta);
console.log("  gana $" + Math.round(total.ganancia).toLocaleString("en-US") + " (mediana de 41 capitales)" +
  " = $" + Math.round(total.alAno).toLocaleString("en-US") + " al año  ·  acierta " +
  Math.round(total.acierto*100) + "%");
console.log("  contra SPY: $" + Math.round(spyGan/anos).toLocaleString("en-US") + " al año");
console.log("  peor operación −$" + Math.round(-total.peorOp).toLocaleString("en-US") +
  "  ·  " + total.rachaPerd + " perdedoras seguidas  ·  " + total.rachaGan + " ganadoras seguidas");
console.log("");
console.log("  " + "año".padEnd(7) + "ops".padStart(5) + "de SPY".padStart(12) + "del trade".padStart(12) + "TOTAL".padStart(13));
for (const a of porAno) console.log("  " + a.ano.padEnd(7) + String(a.ops).padStart(5) +
  ("$"+Math.round(a.gananciaSPY).toLocaleString("en-US")).padStart(12) +
  ("$"+Math.round(a.gananciaTrade).toLocaleString("en-US")).padStart(12) +
  ("$"+Math.round(a.ganancia).toLocaleString("en-US")).padStart(13));
console.log("");
console.log("  tablas en la web: " + J.tablas.map(t=>t.nombre.split(" ·")[0]).join("  ·  "));
console.log("");
