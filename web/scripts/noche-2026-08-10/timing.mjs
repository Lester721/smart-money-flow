// ¿ELEGIAS EL DIA, o vendias por vender?
//
// El backtest mecanico entra siempre. Lester entraba solo el 43% de los dias. Si sus dias de
// entrada estan sesgados hacia algo medible (caidas recientes, vol alta, etc.), ESE es el
// filtro que hay que copiar — y es replicable. Si no lo estan, su ventaja fue el activo.

import fs from 'node:fs';
const S = process.argv[2];
const bars = JSON.parse(fs.readFileSync(S + '/hood-full.json', 'utf8'));
const idx = new Map(bars.map((b, i) => [b.d, i]));
const filas = JSON.parse(fs.readFileSync(S + '/hood-filas.json', 'utf8'));

const rv = i => { const n = 20; if (i - n < 0) return null; let s = 0, s2 = 0;
  for (let k = i - n + 1; k <= i; k++) { const r = Math.log(bars[k].c / bars[k - 1].c); s += r; s2 += r * r; }
  return Math.sqrt((s2 / n - (s / n) ** 2) * 252); };
const iDe = d => { for (let k = 0; k < 8; k++) { const x = new Date(new Date(d) - k * 864e5).toISOString().slice(0, 10); if (idx.has(x)) return idx.get(x); } return -1; };

const rasgos = i => ({
  r1: bars[i].c / bars[i - 1].c - 1,
  r3: bars[i].c / bars[i - 3].c - 1,
  r5: bars[i].c / bars[i - 5].c - 1,
  r20: bars[i].c / bars[i - 20].c - 1,
  vol: rv(i),
  desdeMax20: bars[i].c / Math.max(...bars.slice(i - 19, i + 1).map(b => b.c)) - 1,
});

const susDias = new Set(filas.filter(f => f.est === 'short_put').map(f => f.f));
const A = [], B = [];   // A = dias que el eligio, B = todos los dias del mismo periodo
const ini = [...susDias].sort()[0], fin = [...susDias].sort().slice(-1)[0];
for (let i = 25; i < bars.length; i++) {
  const d = bars[i].d; if (d < ini || d > fin) continue;
  const r = rasgos(i); if (!r.vol) continue;
  (susDias.has(d) ? A : B).push(r);
}
const med = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;

console.log('=== ¿ELEGIAS EL DIA? — tus dias de venta de put contra el resto ===');
console.log(`   periodo ${ini} a ${fin}.  tus dias: ${A.length}   los otros: ${B.length}\n`);
console.log('rasgo                        TUS DIAS      los otros     ¿distinto?');
for (const [k, etq] of [['r1', 'retorno de ayer'], ['r3', 'retorno 3 dias'], ['r5', 'retorno 5 dias'],
                        ['r20', 'retorno 20 dias'], ['desdeMax20', 'desde el maximo de 20d'], ['vol', 'vol realizada 20d']]) {
  const a = A.map(x => x[k]), b = B.map(x => x[k]);
  // t aproximada
  const va = a.reduce((s, x) => s + (x - mean(a)) ** 2, 0) / (a.length - 1);
  const vb = b.reduce((s, x) => s + (x - mean(b)) ** 2, 0) / (b.length - 1);
  const t = (mean(a) - mean(b)) / Math.sqrt(va / a.length + vb / b.length);
  console.log(`${etq.padEnd(26)} ${(mean(a) * 100).toFixed(2).padStart(8)}%   ${(mean(b) * 100).toFixed(2).padStart(8)}%      t=${t.toFixed(2).padStart(6)}  ${Math.abs(t) > 2 ? '<<< SI' : 'no'}`);
}

// ¿y le fue mejor cuando entraba tras una caida?
console.log('\n=== ¿te FUE mejor entrando tras una caida? (tus puts reales, por retorno previo de 3 dias) ===\n');
const conR = filas.filter(f => f.est === 'short_put').map(f => { const i = iDe(f.f); return i > 25 ? { ...f, r3: bars[i].c / bars[i - 3].c - 1, vol: rv(i) } : null; }).filter(Boolean);
conR.sort((a, b) => a.r3 - b.r3);
const t3 = Math.floor(conR.length / 3);
for (const [n, g] of [['tras CAER (tercio bajo)', conR.slice(0, t3)], ['plano (tercio medio)', conR.slice(t3, 2 * t3)], ['tras SUBIR (tercio alto)', conR.slice(2 * t3)]]) {
  console.log(`  ${n.padEnd(26)} n=${g.length}  retorno previo 3d mediana ${(med(g.map(x => x.r3)) * 100).toFixed(1).padStart(6)}%   prima cobrada mediana $${med(g.map(x => x.prima)).toFixed(0)}`);
}
