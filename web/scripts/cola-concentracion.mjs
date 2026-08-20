// ¿De cuántos días vive el "+23%" del gatillo intradía? Un resultado que aparece de COMPRAR
// seguro tiene que ser auditado por concentración antes de contarlo.
import { readFileSync } from "node:fs";
const filas = JSON.parse(readFileSync("scripts/cola-filas.json", "utf8"));
const disp = JSON.parse(readFileSync("scripts/cola-intradia.json", "utf8"));
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const AÑOS = filas.length / 252, COMM = 0.03;
for (const [U, modo] of [[30,"fijo"],[40,"fijo"],[40,"movil"]]) {
  const netos = [];
  for (const f of filas) {
    const g = disp[f.fecha] ? disp[f.fecha]["u"+U] : null;
    if (!g) { netos.push({ fecha: f.fecha, x: 0 }); continue; }
    const K = modo==="fijo"?g.fijoK:g.movilK, ask = modo==="fijo"?g.fijoAsk:g.movilAsk;
    netos.push({ fecha: f.fecha, x: ask>0 ? Math.max(K-f.cierre,0)*100 - ask*100 - COMM : 0 });
  }
  const tot = netos.reduce((a,z)=>a+z.x,0);
  const top = [...netos].sort((a,b)=>b.x-a.x).slice(0,5);
  const gan = netos.filter(z=>z.x>0).length;
  console.log(`\n${modo} U=${U}: neto ${eur(tot)} (${eur(tot/AÑOS)}/año) · ${gan} días en ganancia de ${netos.filter(z=>z.x!==0).length} disparos`);
  for (const t of top) console.log(`   ${t.fecha}  ${eur(t.x)}`);
  console.log(`   sin los 2 mejores: ${eur(tot-top[0].x-top[1].x)} (${eur((tot-top[0].x-top[1].x)/AÑOS)}/año)`);
  console.log(`   sin los 5 mejores: ${eur(tot-top.reduce((a,z)=>a+z.x,0))} (${eur((tot-top.reduce((a,z)=>a+z.x,0))/AÑOS)}/año)`);
  // tercios
  const k = Math.floor(netos.length/3);
  const T = [netos.slice(0,k), netos.slice(k,2*k), netos.slice(2*k)].map(g=>g.reduce((a,z)=>a+z.x,0));
  console.log(`   por tercios: ${T.map(eur).join(" · ")}  → signo ${T.map(x=>x>=0?"+":"−").join("")}`);
}
