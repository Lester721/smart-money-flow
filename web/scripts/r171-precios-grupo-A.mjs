// ══ SERIE DIARIA DE PRECIOS DEL GRUPO A ══ Lester, 2026-08-30
// Para medir la media de 50 o 100 días hace falta el precio de TODOS los días, no sólo de los
// que produjeron operación. Sacarlo de caminos-A.json da 2% de cobertura en C y 0% en EBAY,
// porque allí sólo hay entrada si el contrato pasaba de $5.000. Reconstruir la media con eso es
// el fallo que ya invalidó una medición entera (13,1% contra el 21,4% real).
// Aquí el precio sale por PARIDAD PUT-CALL del vencimiento más cercano, igual que en r137.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { abrir } from "./datos.mjs";
import { CACHE } from "./raiz.mjs";
import { GRUPO_A } from "./EXAMEN-grupo-A.mjs";
const cad = abrir("cadenas-A", { callado: true });
const ms = (d) => Date.parse(d.slice(0,4)+"-"+d.slice(4,6)+"-"+d.slice(6,8)+"T00:00:00Z");
function spot(c, hoy) { if (!c) return null;
  let e0=null, md=Infinity;
  for (const e of Object.keys(c)) { const d=(ms(e)-ms(hoy))/86400000; if (d<1) continue; if (d<md){md=d;e0=e;} }
  if (!e0) return null; const g=c[e0]; let K=null, dm=Infinity;
  for (const cl of Object.keys(g)) { if (cl.slice(-1)!=="C") continue;
    const k=Number(cl.slice(0,-2)); const p=g[k+"|P"]; if(!p) continue;
    const d=Math.abs((g[cl][0]+g[cl][1])/2-(p[0]+p[1])/2); if(d<dm){dm=d;K=k;} }
  if (K==null) return null; const C=g[K+"|C"], P=g[K+"|P"];
  const s=K+(C[0]+C[1])/2-(P[0]+P[1])/2; return s>0 ? Math.round(s*100)/100 : null; }
const OUT = {};
process.stdout.write("\n  ");
for (const tk of GRUPO_A) { const D = cad.dias(tk); if (!D.length) continue;
  const S = {}; for (const d of D) { const s = spot(cad.leer(tk,d), d); if (s) S[d]=s; }
  OUT[tk] = S; process.stdout.write(tk + ":" + Object.keys(S).length + " "); }
writeFileSync(join(CACHE, "precios-A.json"), JSON.stringify(OUT));
console.log("\n");
console.log("  ══ AUDIT ══");
for (const tk of Object.keys(OUT)) { const n = Object.keys(OUT[tk]).length;
  if (n < 2000) console.log("  ⚠️ " + tk + ": sólo " + n + " días"); }
console.log("  tickers: " + Object.keys(OUT).length + "  ·  días totales: " +
  Object.values(OUT).reduce((a,x)=>a+Object.keys(x).length,0).toLocaleString("en-US"));
