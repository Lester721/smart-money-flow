// Cada mejora SOLA y luego todas juntas. Un proceso = un universo x una profundidad.
import { M, marcar, correr, fila, UNI, PROF } from './uc-lab.mjs';
const EXP = 0.24;                     // exposicion nominal congelada: huecos * tam = 24%
const BASE = { tam:0.024, huecos:10, modo:'spy', plazo:120, castigo:0.0138, suelo:0.50, costeMin:0 };

// invertido MEDIO (mediana de 41 capitales) — el liston para calibrar el escalado
function inv(cfg){ const X=[]; for(let i=0;i<41;i++){const c=60000*(1+(i-20)*0.005);
  X.push(M.simular({...cfg,capital:c}).invertido);} return M.med(X); }

/** bisecciona `tam` de cfg para que su exposicion media iguale la de refInv */
export function calibrar(cfg, refInv){ let lo=0.0005, hi=0.25;
  for(let k=0;k<26;k++){ const mid=(lo+hi)/2; const v=inv({...cfg, tam:mid});
    if (v < refInv) lo=mid; else hi=mid; }
  return (lo+hi)/2; }

console.log(`\n════ UNI=${UNI}  PROF=p${PROF}  (contrato ${PROF}% dentro del dinero) ════`);

for (const hoyo of [-0.07, -0.05]) {
  const n = marcar({ hoyo });
  console.log(`\n--- hoyo ${(hoyo*100).toFixed(0)}%  (${n} senales elegibles) ---`);
  const ref = inv(BASE);
  console.log(fila('plana (10 huecos, 2,4%)', correr(BASE)));
  // 1. modulacion por estado de SPY (x1,15 si SPY<MA50 · x0,90 si no)
  console.log(fila('+ SPYmod 1,15/0,90', correr({...BASE, kBajo:1.15, kAlto:0.90})));
  // 2. escalado por profundidad con TOPE 2x, exposicion recalibrada
  for (const anc of [0.07, Math.abs(hoyo)]) {
    const c0 = {...BASE, kProf:2, topeProf:2, umbralProf:anc};
    const tb = calibrar(c0, ref);
    console.log(fila(`+ profundidad tope2x anc${(anc*100).toFixed(0)} (tam ${(tb*100).toFixed(3)}%)`, correr({...c0, tam:tb})));
  }
  // 3. mas huecos y mas pequenos, una posicion por ticker
  for (const h of [13, 16, 19]) console.log(fila(`+ huecos ${h} (tam ${(100*EXP/h).toFixed(2)}%)`, correr({...BASE, huecos:h, tam:EXP/h})));
}
