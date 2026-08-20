// TENDENCIA-OTRA-VEZ · PASO 7 — verificación del dato, barrido bien hecho, y el mecanismo.
import { readFileSync } from "node:fs";
import { tWelch, listonT } from "../lib/barreraHallazgos.ts";
const { filas } = JSON.parse(readFileSync("scripts/tend-filas.json", "utf8"));
const { tabla, baseA, baseB } = JSON.parse(readFileSync("scripts/tend-rejilla.json", "utf8"));
const base = JSON.parse(readFileSync("scripts/tend-base.json", "utf8")).filas;
filas.sort((a,b)=>a.fecha.localeCompare(b.fecha));
const eur = (x) => `$${Math.round(x).toLocaleString("es-ES")}`;
const pc = (x) => `${(x*100).toFixed(0)}%`;
const P = (v,q) => v[Math.min(v.length-1,Math.max(0,Math.round((v.length-1)*q)))];
function met(per, mask) {
  const pls=[]; let ac=0,pi=0,pe=0;
  for (let i=0;i<per.length;i++){const p=mask[i]?per[i].pl:0; if(mask[i])pls.push(per[i].pl); ac+=p;pi=Math.max(pi,ac);pe=Math.min(pe,ac-pi);}
  const o=[...pls].sort((a,b)=>a-b),k5=Math.max(1,Math.floor(pls.length*0.05));
  return {nOp:pls.length,pctOp:pls.length/per.length,total:pls.reduce((a,b)=>a+b,0),
    ano:pls.reduce((a,b)=>a+b,0)/(per.length/252),peorRacha:pe,peorDia:o[0]??0,
    p1:P(o,0.01),p5:P(o,0.05),es5:o.slice(0,k5).reduce((a,b)=>a+b,0)/k5,
    n2000:pls.filter(x=>x<=-2000).length,n4000:pls.filter(x=>x<=-4000).length};
}

// ═══ 0 · VERIFICAR EL DATO A MANO — que la media móvil NO mira al futuro ═══
console.log("═══ 0 · COMPROBACIÓN A MANO de la MA50 (que termina en el cierre de AYER) ═══");
const cierres = new Map(base.map(f=>[f.fecha,f.cierre]));
for (const fecha of ["2024-03-15","2025-04-08","2022-06-16"]) {
  const f = filas.find(x=>x.fecha===fecha); if(!f) continue;
  const maImp = f.spot11 / (1 + f.d50);
  const previos = base.filter(x=>x.fecha<fecha).slice(-50);
  const maCadena = previos.reduce((a,b)=>a+b.cierre,0)/previos.length;
  console.log(`  ${fecha}: spot 11:00 ${f.spot11.toFixed(2)} · MA50 implícita en d50 = ${maImp.toFixed(2)} · MA50 de los 50 cierres de cadena anteriores = ${maCadena.toFixed(2)} (difieren por los días rellenados con SPY) · d50 = ${(f.d50*100).toFixed(2)}%`);
  console.log(`      último cierre usado: ${previos[previos.length-1].fecha} — ES ANTERIOR a ${fecha}: ${previos[previos.length-1].fecha < fecha}`);
}

// ═══ 1 · EL BARRIDO, BIEN HECHO (antes encadené las condiciones y "peor día" mató a todas;
//        el peor día está TOPADO por el ancho del ala y casi nunca puede mejorar) ═══
const T = tabla.filter(t=>!t.fam.startsWith("pct"));
console.log(`\n═══ 1 · BARRIDO CORREGIDO sobre las ${T.length} reglas — condiciones INDEPENDIENTES ═══`);
const conds = [
  ["reduce la peor racha ≥25% en A y en B", t=>t.A.peorRacha>=baseA.peorRacha*0.75 && t.B.peorRacha>=baseB.peorRacha*0.75],
  ["baja el p5 en A y en B",                t=>t.A.p5>baseA.p5 && t.B.p5>baseB.p5],
  ["baja el ES5 en A y en B",               t=>t.A.es5>baseA.es5 && t.B.es5>baseB.es5],
  ["menos días de −$2.000 (tasa) en A y B", t=>t.A.n2000/t.A.nTot<baseA.n2000/baseA.nTot && t.B.n2000/t.B.nTot<baseB.n2000/baseB.nTot],
  ["opera ≥40% de los días en A y en B",    t=>t.A.pctOp>=0.4 && t.B.pctOp>=0.4],
  ["no destruye el ingreso en A ni en B",   t=>t.A.ano>=baseA.ano-2000 && t.B.ano>=baseB.ano-2000],
];
for (const [n,f] of conds) console.log(`  ${String(T.filter(f).length).padStart(5)} / ${T.length} cumplen: ${n}`);
const todas = T.filter(t=>conds.every(([,f])=>f(t)));
console.log(`  ${String(todas.length).padStart(5)} / ${T.length} cumplen LAS SEIS A LA VEZ`);
const porN={},porFam={};
for(const t of todas){porN["MA"+t.N]=(porN["MA"+t.N]??0)+1;porFam[t.fam]=(porFam[t.fam]??0)+1;}
console.log("   por media:",JSON.stringify(porN)); console.log("   por familia:",JSON.stringify(porFam));
todas.sort((x,y)=>(y.A.ano+y.B.ano)-(x.A.ano+x.B.ano));
console.log("  las 12 con más ingreso conjunto:");
console.log("  | regla | opera A/B | $/año A | $/año B | racha A | racha B | p5 A/B |");
console.log("  |---|---|---|---|---|---|---|");
for(const t of todas.slice(0,12))
  console.log(`  | ${t.id} | ${pc(t.A.pctOp)}/${pc(t.B.pctOp)} | ${eur(t.A.ano)} | ${eur(t.B.ano)} | ${eur(t.A.peorRacha)} | ${eur(t.B.peorRacha)} | ${eur(t.A.p5)}/${eur(t.B.p5)} |`);

// ═══ 2 · ¿ES UN FILTRO DE VOLATILIDAD DISFRAZADO? ═══
const REGLA = x => x.d50*100 >= 1;
console.log("\n═══ 2 · ¿ES UN FILTRO DE VOLATILIDAD DISFRAZADO? ═══");
const dentro = filas.filter(REGLA), fuera = filas.filter(x=>!REGLA(x));
const med = v => v.reduce((a,b)=>a+b,0)/v.length;
console.log(`  IV del dinero  · dentro ${(med(dentro.map(x=>x.ivAtm))*100).toFixed(1)}% · fuera ${(med(fuera.map(x=>x.ivAtm))*100).toFixed(1)}% · t=${tWelch(dentro.map(x=>x.ivAtm),fuera.map(x=>x.ivAtm)).toFixed(2)}`);
console.log(`  straddle (σ)   · dentro ${med(dentro.map(x=>x.straddle)).toFixed(1)} pts · fuera ${med(fuera.map(x=>x.straddle)).toFixed(1)} pts`);
console.log(`  crédito cobrado· dentro ${eur(med(dentro.map(x=>x.cred))*100)} · fuera ${eur(med(fuera.map(x=>x.cred))*100)}`);
console.log(`  |mov 11:00→cierre| en σ · dentro ${med(dentro.map(x=>Math.abs(x.cierre-x.spot11)/x.straddle)).toFixed(3)} · fuera ${med(fuera.map(x=>Math.abs(x.cierre-x.spot11)/x.straddle)).toFixed(3)} · t=${tWelch(dentro.map(x=>Math.abs(x.cierre-x.spot11)/x.straddle),fuera.map(x=>Math.abs(x.cierre-x.spot11)/x.straddle)).toFixed(2)}`);
console.log(`  |mov| en PUNTOS · dentro ${med(dentro.map(x=>Math.abs(x.cierre-x.spot11))).toFixed(1)} · fuera ${med(fuera.map(x=>Math.abs(x.cierre-x.spot11))).toFixed(1)} · t=${tWelch(dentro.map(x=>Math.abs(x.cierre-x.spot11)),fuera.map(x=>Math.abs(x.cierre-x.spot11))).toFixed(2)}`);

// ¿sobrevive DENTRO de cubos de IV? (si sólo es un proxy de la IV, dentro del cubo no separa)
console.log("\n  · el mismo filtro DENTRO de cada tercio de IV del dinero (si sólo fuera un proxy de la IV, aquí no quedaría nada):");
const ordIV=[...filas].sort((a,b)=>a.ivAtm-b.ivAtm), k=Math.floor(filas.length/3);
const cubos=[ordIV.slice(0,k),ordIV.slice(k,2*k),ordIV.slice(2*k)];
console.log("  | cubo de IV | rango IV | n | opera | media/día dentro | media/día fuera | t |");
console.log("  |---|---|---|---|---|---|---|");
for(let i=0;i<3;i++){
  const c=cubos[i], d=c.filter(REGLA).map(x=>x.pl), f=c.filter(x=>!REGLA(x)).map(x=>x.pl);
  console.log(`  | ${i+1} | ${(c[0].ivAtm*100).toFixed(0)}–${(c[c.length-1].ivAtm*100).toFixed(0)}% | ${c.length} | ${pc(d.length/c.length)} | ${eur(med(d))} | ${eur(med(f))} | ${tWelch(d,f).toFixed(2)} |`);
}
// control directo: un filtro de IV que opere el MISMO número de días
console.log("\n  · CONTROL — un filtro que opere los mismos días pero eligiéndolos por IV BAJA:");
const nOp=dentro.length, ivOrd=[...filas].sort((a,b)=>a.ivAtm-b.ivAtm).slice(0,nOp);
const setIV=new Set(ivOrd.map(x=>x.fecha));
const mIV=met(filas,filas.map(x=>setIV.has(x.fecha))), mMA=met(filas,filas.map(REGLA)), b0=met(filas,filas.map(()=>true));
console.log("  | filtro | opera | $/año | racha | p5 | >$2k |");
console.log("  |---|---|---|---|---|---|");
for(const [n,m] of [["sin filtro",b0],["IV más baja (mismo nº de días) ⚠ usa toda la historia, NO operable",mIV],["MA50 ≥ 1%",mMA]])
  console.log(`  | ${n} | ${pc(m.pctOp)} | ${eur(m.ano)} | ${eur(m.peorRacha)} | ${eur(m.p5)} | ${m.n2000} |`);
