// ¿ES SOBREAJUSTE O ES EL RÉGIMEN? La prueba que los separa.
// Se optimiza DENTRO de 2021-2026 — haciendo trampa a mi favor, mirando el resultado para
// elegir. Si ni así le gano a SPY en ese período, no es sobreajuste: es estructural, y la
// intuición de Lester sobre el régimen ES el hallazgo.
const D = x => (x<0?"−$":"$")+Math.abs(Math.round(x)).toLocaleString("en-US");
import { existsSync } from "node:fs"; import { join } from "node:path"; import { CACHE } from "./raiz.mjs";
const M = {}; let v = 0;
for (const p of [25,35]) for (const d of [250,400]) {
  const f = "largo-p"+p+"-d"+d+".json";
  if (!existsSync(join(CACHE,f))) continue;
  process.env.CAMINOS = f; M[p+"|"+d] = await import("./motor-cartera.mjs?v="+(++v)); }
const K = Object.keys(M);
for (const k of K) for (const o of M[k].OPS) if (o.ma >= 0) o.ma = 999;
const B = "20210101";
console.log("");
console.log("  ══ EL MEJOR CASO POSIBLE EN 2021-2026 ══  (optimizando DENTRO del período: trampa a mi favor)");
console.log("  listón: comprar SPY en 2021-2026 = 15,4% al año con caída −25%");
console.log("");
const R = [];
for (const k of K) for (const h of [2,4,6,8,10,12]) for (const t of [0.05,0.08,0.10,0.15,0.20,0.25])
  for (const pl of [60,90,120,150,200,250]) for (const fr of [0,0.03,0.05,0.08,0.10,0.15]) {
    const cf = { tam:t, huecos:h, modo:"spy", plazo:pl, frenoSPY:fr, desdeD:B };
    const q = M[k].simular(cf);
    if (q.ops < 20) continue;
    const b = M[k].banda(cf);
    R.push({ k,h,t,pl,fr, a:b.a, c:b.c, s:b.s, ops:q.ops, exp:q.invertido }); }
console.log("  configuraciones con muestra: " + R.length.toLocaleString("en-US") + " de 1.728");
console.log("");
const cfg = x => x.k.replace("|","%×")+"d "+x.h+"×"+(100*x.t).toFixed(0)+"% ag"+x.pl+(x.fr?" fr"+(100*x.fr).toFixed(0):" sinfr");
console.log("  " + "criterio".padEnd(30) + "configuración".padEnd(30) + "al año".padStart(9) + "caída".padStart(8) + "Sharpe".padStart(8) + "expuesto".padStart(10));
for (const [n,f] of [["mejor Sharpe", x=>x.s], ["mejor rendimiento", x=>x.a],
                     ["mejor rendimiento/caída", x=>x.a/Math.max(1,x.c)],
                     ["caída mínima", x=>-x.c],
                     ["caída mínima con ≥15,4%/año", x=>x.a>=15.4?-x.c:-999]]) {
  const g = R.slice().sort((a,b)=>f(b)-f(a))[0]; if (!g) continue;
  console.log("  " + n.padEnd(30) + cfg(g).padEnd(30) + (g.a.toFixed(1)+"%").padStart(9) +
    ("−"+g.c.toFixed(0)+"%").padStart(8) + g.s.toFixed(2).padStart(8) + (g.exp.toFixed(0)+"%").padStart(10)); }
console.log("  " + "comprar SPY y dormir".padEnd(60) + "15.4%".padStart(9) + "−25%".padStart(8) + "".padStart(8) + "100%".padStart(10));
console.log("");
const ganan = R.filter(x => x.a > 15.4 && x.c < 25);
const ganaRet = R.filter(x => x.a > 15.4);
const ganaSh  = R.filter(x => x.s > 0.75);
console.log("  de las " + R.length.toLocaleString("en-US") + " configuraciones, en 2021-2026:");
console.log("    superan a SPY en RENDIMIENTO (>15,4%):        " + ganaRet.length + "  (" + (100*ganaRet.length/R.length).toFixed(1) + "%)");
console.log("    superan a SPY en las DOS columnas:            " + ganan.length + "  (" + (100*ganan.length/R.length).toFixed(1) + "%)");
console.log("    con Sharpe por encima de 0,75:               " + ganaSh.length);
console.log("");
console.log("  " + (ganan.length === 0
  ? "⛔ NI HACIENDO TRAMPA. Ninguna de las " + R.length.toLocaleString("en-US") + " configuraciones bate a SPY\n"
  + "     en las dos columnas dentro de 2021-2026. NO es sobreajuste: es el régimen."
  : "✓ existen " + ganan.length + " configuraciones que baten a SPY en las dos columnas DENTRO del período.\n"
  + "     Entonces sí es sobreajuste de la elección, no imposibilidad. Merece otra vuelta."));
console.log("");
// ¿y qué pasa en 2022 en el mejor caso?
const mejor = R.slice().sort((a,b)=>b.s-a.s)[0];
const q = M[mejor.k].simular({ tam:mejor.t, huecos:mejor.h, modo:"spy", plazo:mejor.pl, frenoSPY:mejor.fr, capital:60000 });
console.log("  ── año a año del MEJOR caso de 2021-2026 (" + cfg(mejor) + ") ──");
console.log("  " + "año".padEnd(7) + "la cuenta".padStart(13) + "% del año".padStart(11) + "peor caída".padStart(12));
let v0 = 60000;
for (const y of ["2016","2017","2018","2019","2020","2021","2022","2023","2024","2025","2026"]) {
  const idx = M[mejor.k].DD.map((d,i)=>[d,i]).filter(([d])=>d.startsWith(y)).map(([,i])=>i);
  if (!idx.length) continue;
  const a = idx[0]===0?60000:q.V[idx[0]-1], b2 = q.V[idx[idx.length-1]];
  let pk=a,pr=0; for(const i of idx){ if(q.V[i]>pk)pk=q.V[i]; const d=1-q.V[i]/pk; if(d>pr)pr=d; }
  console.log("  " + y.padEnd(7) + D(b2).padStart(13) +
    (((b2/a-1)>=0?"+":"−")+Math.abs(100*(b2/a-1)).toFixed(0)+"%").padStart(11) +
    ("−"+(100*pr).toFixed(0)+"%").padStart(12));
  v0 = b2; }
console.log("");
