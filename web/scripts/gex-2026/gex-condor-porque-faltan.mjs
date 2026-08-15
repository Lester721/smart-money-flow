// ¿POR QUÉ SE CAE EL 61% DE LOS DÍAS? El contador anterior los metía todos en "sin cadena".
// Aquí se separa paso a paso: sin foto, sin strike al dinero, sin corta, sin ala.
import { obs } from './gex-lib-gex.mjs';
const P = new Map(); for (const o of obs) P.set(`${o.d} ${o.h}`, o);
const dias = [...new Set(obs.map(o => o.d))].sort();
const atm = o => { let K=null,d=Infinity;
  for (const k of o.calls.keys()) if (o.puts.has(k) && Math.abs(k-o.U)<d){d=Math.abs(k-o.U);K=k;}
  return {K, dist:d}; };

const c = { sinFoto:0, atmLejos:0, sinCortaC:0, sinCortaP:0, sinAlaC:0, sinAlaP:0, completo:0 };
const distancias = [];
for (const d of dias) {
  const o = P.get(`${d} 11:00`);
  if (!o) { c.sinFoto++; continue; }
  if (!(o.net1 > 0)) continue;
  const { K, dist } = atm(o);
  distancias.push(dist);
  if (K == null || dist > 10) { c.atmLejos++; continue; }
  if (!o.calls.has(K+25)) { c.sinCortaC++; continue; }
  if (!o.puts.has(K-25))  { c.sinCortaP++; continue; }
  if (!o.calls.has(K+75)) { c.sinAlaC++; continue; }
  if (!o.puts.has(K-75))  { c.sinAlaP++; continue; }
  c.completo++;
}
console.log('DÍAS CON GEX POSITIVO A LAS 11:00 — dónde se cae cada uno:\n');
for (const [k,v] of Object.entries(c)) console.log(`  ${k.padEnd(12)} ${String(v).padStart(4)}`);
const ord = distancias.filter(x=>isFinite(x)).sort((a,b)=>a-b);
console.log(`\ndistancia del strike más cercano al índice: mediana ${ord[ord.length>>1]} · ` +
            `p90 ${ord[Math.floor(ord.length*0.9)]} · máx ${ord[ord.length-1]}`);
console.log(`(el filtro exige ≤10 puntos; con el SPX a 7.700, 10 puntos es el 0,13%)`);
