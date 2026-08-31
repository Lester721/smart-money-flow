import { readFileSync } from 'node:fs';
const H = {}; for (const U of ['AB','27']) for (const P of ['25','10']) H[U+'p'+P] = JSON.parse(readFileSync(`uc-huec-${U}-p${P}.json`,'utf8'));
const bA = H['ABp25'].H10, b2 = H['27p25'].H10;
const VN = Object.keys(bA);
const rows = [];
for (const P of ['25','10']) for (const k of Object.keys(H['ABp'+P])) {
  const a = H['ABp'+P][k], c = H['27p'+P][k];
  const rA = VN.map(v=>a[v].dol/bA[v].dol), r2 = VN.map(v=>c[v].dol/b2[v].dol);
  rows.push({n:'p'+P+' '+k, rA, r2, minA:Math.min(...rA), min2:Math.min(...r2), a:a.TODO, c:c.TODO}); }
console.log('RATIO $/ano contra la REGLA ACTUAL. AB/27. (base p25 H10 = 1,00)');
console.log(''.padEnd(16)+VN.map(v=>v.padStart(11)).join('')+'    opsAB ops27');
for (const r of rows) console.log(r.n.padEnd(16)+r.rA.map((x,i)=>(x.toFixed(2)+'/'+r.r2[i].toFixed(2)).padStart(11)).join('')+
  '  MIN '+r.minA.toFixed(2)+'/'+r.min2.toFixed(2)+'  '+String(Math.round(r.a.ops)).padStart(4)+'/'+String(Math.round(r.c.ops)).padStart(4)+
  '  Sh '+r.a.sharpe.toFixed(2)+'/'+r.c.sharpe.toFixed(2)+'  cai '+r.a.caida.toFixed(0)+'/'+r.c.caida.toFixed(0));
