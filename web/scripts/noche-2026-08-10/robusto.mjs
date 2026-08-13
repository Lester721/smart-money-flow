// ¿Es el 3% fuera un punto con suerte, o aguanta partiendo la muestra?
import { correr, met, P } from './semanal-lib.mjs';
const S = process.argv[2];
const trozos = [['2020-2022 (COVID + oso)', '2020-01-01', '2022-12-31'],
                ['2023-2026 (toro)',        '2023-01-01', '2099'],
                ['TODO',                    '2020-01-01', '2099']];
console.log('=== QQQ semanal, put al dinero y cerca. ¿aguanta al partir la muestra? ===\n');
console.log('distancia    ' + trozos.map(t => t[0].padStart(24)).join(''));
for (const otm of [0, 0.01, 0.02, 0.03, 0.04, 0.05]) {
  const o = correr('theta-sem', 'QQQ', { otm });
  const cel = trozos.map(([, a, b]) => {
    const m = met(o.filter(x => x.rolo >= a && x.rolo <= b));
    return m ? `${m.anual.toFixed(1)}% /c${(m.dd*100).toFixed(0)}%`.padStart(24) : '—'.padStart(24);
  });
  console.log(`${(otm*100).toFixed(0)}% fuera     ` + cel.join(''));
}
console.log('\n=== ¿y con 2 contratos (usando el margen que ya tienes)? ===');
console.log('   OJO: es apalancamiento. Duplica la ganancia Y la perdida. Se muestra para que');
console.log('   veas la aritmetica, no como recomendacion.\n');
for (const otm of [0.02, 0.03]) {
  const o = correr('theta-sem', 'QQQ', { otm });
  for (const lev of [1, 1.5, 2]) {
    let eq=1,pico=1,dd=0;
    for (const x of o) { eq *= (1 + x.ret*lev); pico=Math.max(pico,eq); dd=Math.max(dd,1-eq/pico); }
    const años=(new Date(o[o.length-1].exp)-new Date(o[0].rolo))/365/864e5;
    console.log(`  ${(otm*100).toFixed(0)}% fuera x${lev}   ${((eq**(1/años)-1)*100).toFixed(1).padStart(6)}%/año   caida ${(dd*100).toFixed(0).padStart(3)}%   ret/caida ${(((eq**(1/años)-1)*100)/(dd*100)).toFixed(2)}`);
  }
}
const q=P.QQQ.filter(x=>x.d>='2020-01-10'); let pk=0,dd=0;
for(const x of q){pk=Math.max(pk,x.c);dd=Math.max(dd,1-x.c/pk);}
const a=(new Date(q[q.length-1].d)-new Date(q[0].d))/365/864e5;
const an=((q[q.length-1].c/q[0].c)**(1/a)-1)*100;
console.log(`\n  comprar QQQ      ${an.toFixed(1)}%/año   caida ${(dd*100).toFixed(0)}%   ret/caida ${(an/(dd*100)).toFixed(2)}`);
