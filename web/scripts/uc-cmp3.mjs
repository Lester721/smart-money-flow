import { readFileSync } from 'node:fs';
const E = {}; for (const U of ['AB','27']) for (const P of ['5','10','15','20','25']) E[U+'p'+P]=JSON.parse(readFileSync(`uc-esc-${U}-p${P}.json`,'utf8'));
const VN = Object.keys(E.ABp25).filter(k=>k[0]!=='_');
for (const U of ['AB','27']) {
  console.log(`\n════ ${U} — la escalera del contrato, $/ano por ventana (base = p25) ════`);
  console.log('ventana'.padEnd(14)+['p5','p10','p15','p20','p25'].map(x=>x.padStart(10)).join('')+'   | ratio p10/p25');
  for (const v of VN) { const f = P => Math.round(E[U+'p'+P][v].dol);
    console.log(v.padEnd(14)+['5','10','15','20','25'].map(P=>f(P).toLocaleString('en-US').padStart(10)).join('')+
      '   | '+(f('10')/f('25')).toFixed(2)); }
  console.log('OPS'.padEnd(14)+['5','10','15','20','25'].map(P=>String(Math.round(E[U+'p'+P].TODO.ops)).padStart(10)).join(''));
  console.log('SHARPE'.padEnd(14)+['5','10','15','20','25'].map(P=>E[U+'p'+P].TODO.sharpe.toFixed(3).padStart(10)).join(''));
  console.log('CAIDA'.padEnd(14)+['5','10','15','20','25'].map(P=>E[U+'p'+P].TODO.caida.toFixed(1).padStart(10)).join(''));
  console.log('MAYOR%'.padEnd(14)+['5','10','15','20','25'].map(P=>E[U+'p'+P].TODO.mayor.toFixed(1).padStart(10)).join(''));
  console.log('OPS 2021-24'.padEnd(14)+['5','10','15','20','25'].map(P=>String(Math.round(E[U+'p'+P]['2021-24'].ops)).padStart(10)).join(''));
  console.log('OPS 2020-22'.padEnd(14)+['5','10','15','20','25'].map(P=>String(Math.round(E[U+'p'+P]['2020-22'].ops)).padStart(10)).join(''));
  console.log('OPS 2a mitad'.padEnd(14)+['5','10','15','20','25'].map(P=>String(Math.round(E[U+'p'+P]['2a mitad'].ops)).padStart(10)).join(''));
}
console.log('\n════ ratio contra p25 en CADA ventana, AB/27 ════');
console.log('ventana'.padEnd(14)+['p5','p10','p15','p20'].map(x=>x.padStart(14)).join(''));
for (const v of VN) console.log(v.padEnd(14)+['5','10','15','20'].map(P=>
  ((E['ABp'+P][v].dol/E.ABp25[v].dol).toFixed(2)+'/'+(E['27p'+P][v].dol/E['27p25'][v].dol).toFixed(2)).padStart(14)).join(''));
