// Controles duros sobre el finalista: barrido de CAPITAL de partida (x0,25 .. x8),
// castigo de ejecucion doblado y cuadruplicado, y auditoria del fichero de caminos.
import { writeFileSync } from 'node:fs';
import { M, marcar, correr, UNI, PROF, OPS } from './uc-lab.mjs';
const CF = { tam:0.024, huecos:10, modo:'spy', plazo:120, castigo:0.0138, suelo:0.50, costeMin:0 };
marcar({ hoyo:-0.07 });
const R = { cap:{}, cast:{}, aud:{} };
for (const mult of [0.25,0.5,1,1.23,2,4,8]) R.cap[mult] = correr(CF, 60000*mult);
for (const c of [0.0138,0.0276,0.0552]) R.cast[c] = correr({ ...CF, castigo:c });
// ── auditoria del fichero ──
const E = OPS.filter(o=>o.ma<0);
const num = (f)=>{const v=E.map(f).filter(x=>x!=null&&isFinite(x)).sort((a,b)=>a-b); return v.length?{n:v.length,med:v[Math.floor(v.length/2)],p10:v[Math.floor(v.length*.1)],p90:v[Math.floor(v.length*.9)]}:null;};
R.aud = { totalOps: OPS.length, elegibles: E.length,
  coste: num(o=>o.coste), profReal: num(o=>o.prof??o.profReal), dte: num(o=>o.dte??o.dteReal),
  largoCamino: num(o=>o.camino.length), campos: Object.keys(OPS[0]).filter(k=>k!=='m'&&k!=='camino'),
  multFinal: num(o=>o.camino[o.camino.length-1][1]),
  mult120: num(o=>o.camino[Math.min(119,o.camino.length-1)][1]) };
writeFileSync(`uc-ctrl-${UNI}-p${PROF}.json`, JSON.stringify(R));
console.log(`\n=== ${UNI} p${PROF} ===`);
console.log('CAPITAL x:', Object.entries(R.cap).map(([k,v])=>`${k}: $${Math.round(v.dol).toLocaleString('en-US')}/${Math.round(v.ops)}ops`).join('  '));
console.log('CASTIGO :', Object.entries(R.cast).map(([k,v])=>`${(k*100).toFixed(2)}%: $${Math.round(v.dol).toLocaleString('en-US')}`).join('  '));
console.log('AUDIT   : campos', R.aud.campos.join(','));
console.log('          coste med', Math.round(R.aud.coste.med), '| prof real med', R.aud.profReal?.med, '| dte med', R.aud.dte?.med, '| largo camino med', R.aud.largoCamino.med);
