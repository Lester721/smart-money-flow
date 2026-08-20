// URGENCIA · MEDICIÓN — dos preguntas separadas, dos respuestas.
//   (a) ¿la prima pagada CON PRISA predice el TAMAÑO del movimiento?  → objetivo d_mov{h}
//   (b) ¿predice el SIGNO?                                            → objetivo d_ret{h}
//
// LA n EFECTIVA. Las filas del panel NO son independientes: dentro de un día los tickers se mueven
// juntos, y a 5 y 20 días las ventanas de días distintos se SOLAPAN. Por eso, además del t
// agrupado de siempre (que infla), se calcula el t con la separación medida DÍA A DÍA y error
// estándar de Newey-West con h−1 retardos. Ese es el honesto, y su n es DÍAS/h, no filas.
//
// EL CASO DE `urgPut`. La radiografía lo declara MUERTO como ranker: el 51,4% de los (ticker, día)
// tienen CERO prima urgente en puts, incluso con ≥50 operaciones en la celda. No se le concede
// excepción — se mide como lo que realmente es, un contraste BINARIO (hubo / no hubo prisa
// vendiendo o comprando puts), que es la única pregunta que ese campo puede contestar.
import fs from "node:fs"; import path from "node:path";
import { pasarBarrera, listonT, tWelch, informe, potencia } from "../../lib/barreraHallazgos.ts";
import { radiografia } from "../../lib/radiografia.ts";

const RAIZ = path.join("scripts","cache-theta","marketsnack");
const P = JSON.parse(fs.readFileSync(path.join(RAIZ, process.env.PANEL ?? "urg-panel.json"),"utf8"));

const TAMANO = ["urgShare","urgCall","urgPut","urgSurge","urgDirAbs","totSurge"];
const SIGNO  = ["urgDir","urgCP"];
const HORIZ  = [1,5,20];
const PRUEBAS = (TAMANO.length + SIGNO.length) * HORIZ.length;   // 24, DECLARADAS ANTES DE MIRAR
const LISTON = listonT(PRUEBAS);
console.log(`PANEL: ${P.length} filas · ${new Set(P.map(f=>f.fecha)).size} dias · ${new Set(P.map(f=>f.ticker)).size} tickers`);
console.log(`PRUEBAS DECLARADAS: ${PRUEBAS}  ->  liston de |t| = ${LISTON}  (Bonferroni)\n`);

// ── ceros por campo: la razón por la que urgPut sale del ranking ─────────────────────────────
console.log("ceros exactos por campo (por que urgPut no puede ordenar):");
for(const c of ["urgShare","urgCall","urgPut","urgDirAbs","urgSurge"])
  console.log(`  ${c.padEnd(10)} ${((P.filter(f=>f[c]===0).length/P.length)*100).toFixed(1)}% de las ${P.length} celdas valen CERO`);

// urgPut NO entra aquí: está muerto como ranker y se mide aparte, en binario.
radiografia(P, ["urgShare","urgCall","urgDir","urgDirAbs","urgSurge","totSurge","rvPrev","mov1","mov5","mov20","ret1"],
  "panel URGENCIA sesion completa", { maxNulos: 0.4 });

const media=(v)=>v.length?v.reduce((a,x)=>a+x,0)/v.length:0;
const sdv=(v)=>{ if(v.length<2) return 0; const m=media(v); return Math.sqrt(v.reduce((a,x)=>a+(x-m)**2,0)/(v.length-1)); };

// ── separación DÍA A DÍA + Newey-West ────────────────────────────────────────────────────────
// binario=true → compara celdas con métrica>0 contra celdas con métrica=0 DEL MISMO DÍA.
function porDias(filas, metrica, objetivo, binario=false){
  const g = new Map();
  for(const f of filas){
    if(f[metrica]==null || !Number.isFinite(f[metrica])) continue;
    if(f[objetivo]==null || !Number.isFinite(f[objetivo])) continue;
    let a=g.get(f.fecha); if(!a){a=[];g.set(f.fecha,a);} a.push(f);
  }
  const dias=[...g.keys()].sort(); const seps=[]; const usados=[]; let nAlto=0,nBajo=0;
  for(const d of dias){
    const arr=g.get(d);
    let alto,bajo;
    if(binario){
      alto=arr.filter(f=>f[metrica]>0).map(f=>f[objetivo]);
      bajo=arr.filter(f=>f[metrica]===0).map(f=>f[objetivo]);
      if(alto.length<5 || bajo.length<5) continue;
    } else {
      const o=[...arr].sort((x,y)=>y[metrica]-x[metrica]);
      const k=Math.floor(o.length/3); if(k<5) continue;
      alto=o.slice(0,k).map(f=>f[objetivo]); bajo=o.slice(-k).map(f=>f[objetivo]);
    }
    seps.push(media(alto)-media(bajo)); usados.push(d); nAlto+=alto.length; nBajo+=bajo.length;
  }
  return { seps, dias: usados, nAlto, nBajo };
}
function neweyWest(s, L){
  const D=s.length; if(D<5) return { m:null,t:null,D };
  const m=media(s); const e=s.map(x=>x-m);
  let v=e.reduce((a,x)=>a+x*x,0)/D;
  for(let j=1;j<=L;j++){
    let c=0; for(let d=j;d<D;d++) c+=e[d]*e[d-j];
    v += 2*(1-j/(L+1))*(c/D);
  }
  if(!(v>0)) return { m, t:null, D };
  return { m, t: m/Math.sqrt(v/D), D };
}

const res=[];
for(const [grupo, metricas, obj] of [["TAMANO",TAMANO,"d_mov"],["SIGNO",SIGNO,"d_ret"]]){
  for(const m of metricas){
    const binario = (m==="urgPut");
    for(const h of HORIZ){
      const objetivo = `${obj}${h}`;
      const crit = binario ? (f)=> (f.urgPut>0?1:0) : (f)=> f[`q_${m}`];
      const filas = P.filter(f=>f[objetivo]!=null && Number.isFinite(f[objetivo]) && (binario || f[`q_${m}`]!=null))
                     .map(f=>({ pnl:f[objetivo], ticker:f.ticker, fecha:f.fecha, q:crit(f) }));
      if(filas.length<200){ console.log(`${m} ${h}d -> solo ${filas.length} filas`); continue; }
      const v = pasarBarrera(filas, f=>f.q, { pruebas:PRUEBAS, nMinimo:200, maxPorTicker:0.2 });
      const dd = porDias(P, m, objetivo, binario);
      const nw = neweyWest(dd.seps, Math.max(0,h-1));
      res.push({ grupo, m, h, binario, n:filas.length, sep:v.detalle.sep, t:v.detalle.t, pasa:v.pasa,
                 tercios:v.detalle.tercios.map(x=>x.sep), motivos:v.motivos,
                 nDias:nw.D, sepDia:nw.m, tNW:nw.t, nEfectiva: nw.D/h, mayor:v.detalle.tickerMayor });
    }
  }
}

console.log(`\n${"=".repeat(116)}`);
console.log(`LAS ${res.length} PRUEBAS  (sep = tercio ALTO - tercio BAJO del MISMO dia; urgPut = con prisa vs sin prisa)`);
console.log(`${"=".repeat(116)}`);
console.log(`grupo   metrica       h  nFilas    sep     t(agrup)  nDias   sep/dia    t(NW)  nEfec  3tercios  ?`);
for(const r of [...res].sort((a,b)=>Math.abs(b.tNW??0)-Math.abs(a.tNW??0))){
  const sg=r.tercios.map(s=>s>=0?"+":"-").join("");
  const u = r.grupo==="TAMANO" ? "x" : "%";
  const f = (x)=> x==null ? "  n/d" : (r.grupo==="TAMANO" ? x.toFixed(4) : (x*100).toFixed(3));
  console.log(`${r.grupo.padEnd(7)} ${(r.m+(r.binario?"*":"")).padEnd(11)} ${String(r.h).padStart(2)}d ${String(r.n).padStart(6)} ${f(r.sep).padStart(8)}${u} ${r.t.toFixed(2).padStart(7)}  ${String(r.nDias).padStart(4)}  ${f(r.sepDia).padStart(8)}${u} ${(r.tNW??0).toFixed(2).padStart(6)} ${r.nEfectiva.toFixed(1).padStart(5)}   ${sg}    ${r.pasa?"PASA":"-"}`);
}
console.log(`* urgPut es un contraste binario (51,4% de las celdas valen cero): no ordena, solo dice si hubo prisa o no.`);
fs.writeFileSync(path.join(RAIZ,"urg-resultados.json"), JSON.stringify(res,null,1));

// ── el mejor de cada grupo, en detalle ───────────────────────────────────────────────────────
for(const grupo of ["TAMANO","SIGNO"]){
  const mej=res.filter(r=>r.grupo===grupo).sort((a,b)=>Math.abs(b.tNW??0)-Math.abs(a.tNW??0))[0];
  const objetivo = (grupo==="TAMANO"?"d_mov":"d_ret")+mej.h;
  console.log(`\n${"=".repeat(116)}\nDETALLE del mayor |t(NW)| de ${grupo}: ${mej.m} -> ${objetivo}`);
  const crit = mej.binario ? (f)=>(f.urgPut>0?1:0) : (f)=>f[`q_${mej.m}`];
  const filas = P.filter(f=>f[objetivo]!=null && (mej.binario || f[`q_${mej.m}`]!=null))
                 .map(f=>({ pnl:f[objetivo], ticker:f.ticker, fecha:f.fecha, q:crit(f) }));
  const v = pasarBarrera(filas, f=>f.q, { pruebas:PRUEBAS, nMinimo:200, maxPorTicker:0.2 });
  console.log(informe(v, `${mej.m} -> ${objetivo}`));
  console.log(potencia(filas, grupo==="TAMANO" ? 0.05 : 0.005).mensaje);
}

// ── monotonía por quintiles ──────────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(116)}\nMONOTONIA por quintiles del rango transversal (media del objetivo demediado dentro del dia)`);
for(const [grupo, metricas, obj] of [["TAMANO",TAMANO,"d_mov"],["SIGNO",SIGNO,"d_ret"]]){
  for(const m of metricas){ if(m==="urgPut") continue; for(const h of HORIZ){
    const objetivo=`${obj}${h}`;
    const f=P.filter(x=>x[`q_${m}`]!=null && x[objetivo]!=null);
    if(f.length<500) continue;
    const q=[0,1,2,3,4].map(k=> f.filter(x=> x[`q_${m}`]>=k/5 && x[`q_${m}`]<(k+1)/5+(k===4?0.001:0)));
    const fmt=(g)=> g.length<20 ? "  pocos" : (grupo==="TAMANO" ? media(g.map(x=>x[objetivo])).toFixed(4) : (media(g.map(x=>x[objetivo]))*100).toFixed(3)+"%");
    console.log(`${m.padEnd(10)} ${String(h).padStart(2)}d  ` + q.map((g,i)=>`Q${i+1} ${fmt(g).padStart(8)}`).join("  ") + `   n/Q~${Math.round(f.length/5)}`);
  }}
}

// ── ruptura del 2026-07-16 ───────────────────────────────────────────────────────────────────
console.log(`\n${"=".repeat(116)}\nANTES vs DESPUES del 2026-07-16 (la ruptura de la tuberia de MS). Dos poblaciones distintas.`);
for(const [grupo, metricas, obj] of [["TAMANO",TAMANO,"d_mov"],["SIGNO",SIGNO,"d_ret"]]){
  for(const m of metricas) for(const h of HORIZ){
    const objetivo=`${obj}${h}`; const bin=(m==="urgPut");
    const parte=(sub)=>{
      const dd=porDias(sub, m, objetivo, bin); const nw=neweyWest(dd.seps, Math.max(0,h-1));
      if(nw.t==null) return "sin muestra";
      const u = grupo==="TAMANO" ? (nw.m).toFixed(4)+"x" : (nw.m*100).toFixed(3)+"%";
      return `${u.padStart(9)} t=${nw.t.toFixed(2).padStart(6)} (${nw.D}d)`;
    };
    console.log(`${grupo.padEnd(7)} ${m.padEnd(10)} ${String(h).padStart(2)}d  antes ${parte(P.filter(x=>x.fecha<"2026-07-16")).padEnd(28)} despues ${parte(P.filter(x=>x.fecha>="2026-07-16"))}`);
  }
}

// ── LA TAUTOLOGIA: lo mismo contra |retorno| CRUDO, sin normalizar por la volatilidad propia ──
console.log(`\n${"=".repeat(116)}\nCONTROL — el mismo test contra |retorno| CRUDO (sin dividir por la volatilidad propia del ticker).`);
console.log(`Si sale fuerte aqui y muere normalizado, la senal solo elegia tickers volatiles — y eso ya esta en la prima.`);
for(const m of TAMANO) for(const h of HORIZ){
  const bin=(m==="urgPut");
  const nw =neweyWest(porDias(P,m,`d_abs${h}`,bin).seps, Math.max(0,h-1));
  const nwn=neweyWest(porDias(P,m,`d_mov${h}`,bin).seps, Math.max(0,h-1));
  if(nw.t==null) continue;
  console.log(`${m.padEnd(10)} ${String(h).padStart(2)}d  CRUDO ${(nw.m*100).toFixed(3).padStart(7)}pp t=${nw.t.toFixed(2).padStart(6)}   NORMALIZADO ${nwn.m.toFixed(4).padStart(8)}x t=${(nwn.t??0).toFixed(2).padStart(6)}`);
}

// ── potencia: con los dias que hay, .que se habria podido ver? ────────────────────────────────
console.log(`\n${"=".repeat(116)}\nPOTENCIA — con los dias que hay, .que separacion se habria podido detectar?`);
for(const h of HORIZ){
  const s=porDias(P,"urgShare",`d_mov${h}`).seps; const D=s.length;
  const bloques=D/h;
  console.log(`  ${String(h).padStart(2)}d: ${D} dias (n EFECTIVA ~${bloques.toFixed(1)} bloques sin solape) · desv. tipica de la sep. diaria ${sdv(s).toFixed(4)}x · minima detectable al 80% ${(2.8*sdv(s)/Math.sqrt(bloques)).toFixed(4)}x`);
}
