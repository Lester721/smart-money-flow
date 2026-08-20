import fs from 'node:fs';
import { radiografia } from '../lib/radiografia.ts';
import { listonT } from '../lib/barreraHallazgos.ts';
const filas = JSON.parse(fs.readFileSync('scripts/cache-theta/_inv-mezcla-filas.json','utf8'));
console.log('\n## Q · radiografia() de las 316 filas\n');
radiografia(filas, ['spot','strike','bid','ask','otmReal','horq'], 'put semanal QQQ 3% OTM a las 12:00');
console.log('\n## R · liston de t');
for (const p of [1,3,5,10]) console.log(`  ${p} prueba(s) → t minimo ${listonT(p).toFixed(2)}`);
