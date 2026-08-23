// LENTE 3 — auditoría de contabilidad de e9-prima-barata.mjs
// Reconstruye EXACTAMENTE la regla titular y saca un libro mayor operación a operación.
import { diasDisponibles, cargarDia, operar, idxHora, rejilla, compraEn, ventaEn, resumen } from "./lib0dte.mjs";
import { writeFileSync } from "node:fs";

const HORA_ENTRADA = "09:35";
const dias = diasDisponibles();
const fichas = [];
const huecos = { straddleEntrada: 0, sinBarra0935: 0, diasIncompletos: 0 };

for (const d of dias) {
  const D = cargarDia(d);
  if (!D) { huecos.diasIncompletos++; continue; }
  const i0 = idxHora(D, HORA_ENTRADA);
  if (i0 < 0) { huecos.sinBarra0935++; continue; }
  const b0 = D.barras[i0];
  const spot0 = b0.spot;
  const K = rejilla(spot0);
  const askC = compraEn(b0, K, "C"), askP = compraEn(b0, K, "P");
  if (askC == null || askP == null || !(askC > 0) || !(askP > 0)) { huecos.straddleEntrada++; continue; }
  const iUlt = D.barras.length - 1;
  const iFin = idxHora(D, "15:55") >= 0 ? idxHora(D, "15:55") : iUlt;

  let mom = null;
  const iE = idxHora(D, "10:00");
  if (iE > i0) {
    const bm = D.barras[iE];
    const lado = bm.spot >= spot0 ? "C" : "P";
    const Km = rejilla(bm.spot);
    mom = {
      lado, Km, iE, iFin, tE: bm.t, tS: D.barras[iFin].t,
      spot10: bm.spot,
      askEntrada: compraEn(bm, Km, lado),
      bidEntrada: ventaEn(bm, Km, lado),
      bidSalida: ventaEn(D.barras[iFin], Km, lado),
      op: operar(D, iE, iFin, Km, lado),
    };
  }
  fichas.push({ dia: d, spot0, K, askC, askP, rel: (askC + askP) / spot0, mom });
}

const mediana = (v) => { const s=[...v].sort((a,b)=>a-b); const m=s.length>>1; return s.length%2?s[m]:(s[m-1]+s[m])/2; };
for (let i=0;i<fichas.length;i++){ const p=fichas.slice(Math.max(0,i-20),i).map(f=>f.rel); fichas[i].ratio = p.length>=20 ? fichas[i].rel/mediana(p) : null; }
for (let i=0;i<fichas.length;i++){
  if (fichas[i].ratio==null){fichas[i].cubo=null;continue;}
  const h=[]; for(let j=Math.max(0,i-250);j<i;j++) if(fichas[j].ratio!=null) h.push(fichas[j].ratio);
  if (h.length<60){fichas[i].cubo=null;continue;}
  fichas[i].cubo = Math.min(4, Math.floor(h.filter(x=>x<fichas[i].ratio).length/h.length*5));
}
const conCubo = fichas.filter(f=>f.cubo!=null);
const barato = conCubo.filter(f=>f.cubo===0);

// ── libro mayor ──────────────────────────────────────────────────────────
const lineas = ["dia,spot0935,spot1000,lado,strike,horaEntrada,askEntrada,horaSalida,bidSalida,dolares,ret"];
let nulos = 0;
const dol = [], rets = [];
for (const f of barato) {
  const m = f.mom;
  if (!m || !m.op) { nulos++; lineas.push(`${f.dia},${f.spot0},,,,,,,,HUECO,`); continue; }
  lineas.push([f.dia, f.spot0, m.spot10, m.lado, m.Km, m.tE, m.askEntrada, m.tS, m.bidSalida,
               m.op.dolares.toFixed(2), m.op.ret.toFixed(6)].join(","));
  dol.push(m.op.dolares); rets.push(m.op.ret);
}
writeFileSync("scripts/z-lente3-libro.csv", lineas.join("\n"));

const media = v=>v.reduce((a,b)=>a+b,0)/v.length;
const R = resumen(rets);
const ANOS_E9 = (new Date(fichas.at(-1).dia)-new Date(fichas[0].dia))/(365.25*24*3600*1000);
const ANOS_SENAL = (new Date(conCubo.at(-1).dia)-new Date(conCubo[0].dia))/(365.25*24*3600*1000);

console.log(`barato n=${barato.length}  operaciones válidas=${dol.length}  HUECOS=${nulos}`);
console.log(`media ret = ${(R.media*100).toFixed(2)}%   t = ${R.t.toFixed(2)}   aciertos ${(R.aciertos*100).toFixed(2)}%`);
console.log(`$/op = ${media(dol).toFixed(2)}   suma total = ${dol.reduce((a,b)=>a+b,0).toFixed(0)}`);
console.log(`\nAÑOS: e9 usa la ventana COMPLETA ${ANOS_E9.toFixed(3)} (${fichas[0].dia}→${fichas.at(-1).dia})`);
console.log(`      la SEÑAL sólo existe desde ${conCubo[0].dia} → ${conCubo.at(-1).dia} = ${ANOS_SENAL.toFixed(3)} años`);
console.log(`$/año con años e9    : ${((dol.length/ANOS_E9)*media(dol)).toFixed(0)}   (ops/año ${(dol.length/ANOS_E9).toFixed(2)})`);
console.log(`$/año con años señal : ${((dol.length/ANOS_SENAL)*media(dol)).toFixed(0)}   (ops/año ${(dol.length/ANOS_SENAL).toFixed(2)})`);

// ── por año, ops/año REALES ──────────────────────────────────────────────
console.log(`\n── POR AÑO: lo que imprime e9 vs las ops/año de verdad ──`);
const anos=[...new Set(barato.map(f=>f.dia.slice(0,4)))].sort();
for (const a of anos){
  const g = barato.filter(f=>f.dia.slice(0,4)===a && f.mom?.op);
  const dg = g.map(f=>f.mom.op.dolares);
  const dias_a = fichas.filter(f=>f.dia.slice(0,4)===a).length;      // sesiones de ese año en la muestra
  const frac = dias_a/252;
  console.log(`  ${a}: n=${String(g.length).padStart(3)}  $/op ${media(dg).toFixed(0).padStart(6)}  ` +
              `e9 imprime ${((g.length/ANOS_E9)*media(dg)).toFixed(0).padStart(7)}/año  |  real ${((g.length/frac)*media(dg)).toFixed(0).padStart(8)}/año  (año cubierto ${frac.toFixed(2)})`);
}
