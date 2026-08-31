// Factorial: hoyo x profundidad-del-tamano x SPYmod x huecos, en la ventana completa.
// Escribe JSON para poder comparar entre procesos (cada PROF es un fichero distinto).
import { writeFileSync } from 'node:fs';
import { M, marcar, correr, UNI, PROF } from './uc-lab.mjs';
const EXP = 0.24;
const B0 = { modo:'spy', plazo:120, castigo:0.0138, suelo:0.50, costeMin:0 };
// la calibracion de exposicion se hace con UN capital (60.000): es un ajuste de escala,
// no una medicion de resultado, y con 41 capitales cuesta 40 veces mas sin cambiar el numero.
function inv(cfg){ return M.simular({...cfg,capital:60000}).invertido; }
function calibrar(cfg, refInv){ let lo=0.0002, hi=0.30;
  for(let k=0;k<18;k++){ const mid=(lo+hi)/2; if (inv({...cfg, tam:mid}) < refInv) lo=mid; else hi=mid; }
  return (lo+hi)/2; }

const R = {};
for (const hoyo of [-0.07, -0.05]) { marcar({ hoyo });
  for (const h of [10, 13, 16]) { const tam = EXP/h;
    for (const sp of [0, 1]) {
      const cf0 = { ...B0, huecos:h, tam, ...(sp?{kBajo:1.15,kAlto:0.90}:{}) };
      const ref = inv(cf0);
      for (const pr of [0, 1]) {
        let cf = cf0;
        if (pr) { const c1 = { ...cf0, kProf:2, topeProf:2, umbralProf:0.07 };
                  cf = { ...c1, tam: calibrar(c1, ref) }; }
        const k = `h${(hoyo*-100).toFixed(0)}_H${h}${sp?'_spy':''}${pr?'_prof':''}`;
        R[k] = { ...correr(cf), cfg: cf };
      } } } }
writeFileSync(`uc-combo-${UNI}-p${PROF}.json`, JSON.stringify(R));
const ord = Object.entries(R).sort((a,b)=>b[1].dol-a[1].dol);
console.log(`\n═══ ${UNI} p${PROF} ═══`);
for (const [k,v] of ord) console.log(k.padEnd(22), `$${Math.round(v.dol).toLocaleString('en-US').padStart(7)}`, `Sh ${v.sharpe.toFixed(3)}`, `cai ${v.caida.toFixed(1)}`, `ops ${Math.round(v.ops)}`, `may ${v.mayor.toFixed(1)}%`);
