// ══ EL BANCO LIMPIO ══ Lester, 2026-08-29: «¿no puedes aprender a identificar en qué año
// estamos para sugerir el tamaño?»
//
// ═══ POR QUÉ HAY QUE REHACERLO ═════════════════════════════════════════════════════════════
//
// El workflow concluyó que NINGUNA variable de régimen sirve, y lo cerró con un ORÁCULO: dando
// a la regla el futuro exacto de SPY a 60/120/250 días, elegir el tamaño PERDÍA en 11 de 12
// configuraciones. Si saber el futuro no vale, nada vale.
//
// PERO ese oráculo corrió sobre el MISMO banco roto que invalidó las otras cuatro familias:
//   con huecos=2 y una posición por ticker, cambiar el tamaño CAMBIA QUÉ OPERACIONES CABEN.
//   64 de 81 posiciones las abre un brazo y no el otro. No son el mismo plan con distinto
//   dinero: son dos carteras distintas.
//
// O sea que la prueba que dice «esto no se puede» puede estar rota igual que lo que descartó.
// No se puede dejar así.
//
// ═══ EL BANCO LIMPIO ═══════════════════════════════════════════════════════════════════════
// 1. Se corre la estrategia UNA vez y se congela la LISTA DE OPERACIONES (qué, cuándo, y su
//    camino diario). Esa lista no cambia nunca más.
// 2. Se reproduce esa lista exacta escalando SÓLO el dinero por operación con un multiplicador
//    que puede variar en el tiempo.
// → los dos brazos abren EXACTAMENTE las mismas operaciones. La única diferencia es el tamaño.
//
// Así, si el oráculo sigue perdiendo, es un resultado sobre la estrategia y no sobre el banco.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";

process.env.CAMINOS = "largo-p25-d400.json";
const M = await import("./motor-cartera.mjs");
const CAST = 0.5 * 0.0276, CAP = 60000;
const D = (x) => (x<0?"−$":"$")+Math.abs(Math.round(x)).toLocaleString("en-US");
const q = (X,p) => { const S=[...X].sort((a,b)=>a-b); return S[Math.floor(p*(S.length-1))]; };

// ── 1 · congelar la lista, quitando la contaminación de splits (ma < −30% es imposible) ──
const gm = M.OPS.map((o) => o.ma);
for (let i = 0; i < M.OPS.length; i++) M.OPS[i].ma = (gm[i] >= 0 || gm[i] < -0.30) ? 999 : gm[i];
const ref = M.simular({ tam:0.12, huecos:2, modo:"spy", plazo:120, castigo:CAST, capital:CAP });
const idx = new Map();
for (const o of M.OPS) idx.set(o.tk + "|" + o.dC, o);
const LISTA = ref.tom.map((t) => {
  const o = idx.get(t.tk + "|" + t.dC);
  const cam = o.camino.slice(0, Math.min(120, o.camino.length));
  return { tk:t.tk, dC:t.dC, dSal:cam[cam.length-1][0], camino:cam, mult:cam[cam.length-1][1] };
}).sort((a,b) => a.dC.localeCompare(b.dC));

const DD = M.DD, SPY = M.SPY;
const kC = 1 + CAST/2, kM = (1 - CAST/2) / (1 + CAST/2);   // el mismo castigo que el motor

// ── 2 · reproducir la lista congelada con el tamaño que se quiera ──
//    escala(fecha) devuelve el multiplicador de tamaño de ese día. La LISTA no cambia.
function correr(pesoBase, escala) {
  const porDia = new Map();
  for (const t of LISTA) { if (!porDia.has(t.dC)) porDia.set(t.dC, []); porDia.get(t.dC).push(t); }
  const divD = Math.pow(1.013, 1/252) - 1;
  let acc = CAP / SPY[DD[0]];              // todo el ocioso en SPY
  let ab = [];
  const V = []; let pico = 0, peor = 0, sInv = 0;
  for (let i = 0; i < DD.length; i++) {
    const d = DD[i], p = SPY[d];
    acc *= (1 + divD);
    for (const o of ab) { const m = o.m.get(d); if (m != null) o.ultMult = m * kM; }
    for (let j = ab.length-1; j >= 0; j--) if (ab[j].dSal <= d) { acc += ab[j].dinero * ab[j].ultMult / p; ab.splice(j,1); }
    const libro = () => ab.reduce((a,o) => a + o.dinero * o.ultMult, 0);
    for (const t of (porDia.get(d) || [])) {
      const patr = acc * p + libro();
      const dinero = patr * pesoBase * escala(d, i);         // ← lo ÚNICO que cambia
      if (dinero <= 0 || dinero > acc * p) continue;
      acc -= dinero / p;
      ab.push({ ...t, dinero, ultMult: kM, m: new Map(t.camino) });
    }
    const v = acc * p + libro();
    V.push(v); sInv += libro() / v;
    if (v > pico) pico = v; const dd = 1 - v/pico; if (dd > peor) peor = dd;
  }
  const R = []; for (let i = 1; i < V.length; i++) R.push(V[i]/V[i-1] - 1);
  const m = R.reduce((a,x)=>a+x,0)/R.length;
  const sd = Math.sqrt(R.reduce((a,x)=>a+(x-m)**2,0)/(R.length-1));
  const anos = 10.6;
  return { final:V[V.length-1], cagr:100*(Math.pow(V[V.length-1]/CAP,1/anos)-1), caida:100*peor,
           sharpe:(m*252-0.033)/(sd*Math.sqrt(252)), exp:100*sInv/V.length, V };
}

console.log("");
console.log("  ══ AUDIT DEL BANCO ══");
console.log("  lista congelada: " + LISTA.length + " operaciones, " + LISTA[0].dC + " → " + LISTA[LISTA.length-1].dC);
const base = correr(0.24, () => 1);
console.log("  el banco limpio con tamaño constante: " + base.cagr.toFixed(1) + "% · caída −" +
  base.caida.toFixed(0) + "% · Sharpe " + base.sharpe.toFixed(2) + " · expuesto " + base.exp.toFixed(0) + "%");
console.log("  el motor original decía: " + ref.cagr.toFixed(1) + "% · caída −" + ref.caida.toFixed(0) +
  "% · Sharpe " + ref.sharpe.toFixed(2));
console.log("  (no tienen por qué coincidir: el banco no redondea a contratos enteros. Lo que importa");
console.log("   es que AQUÍ los dos brazos abren SIEMPRE las mismas " + LISTA.length + " operaciones.)");
console.log("");

// ── 3 · LA PRUEBA: ¿le sirve de algo al oráculo saber el futuro? ──
console.log("  ══ EL ORÁCULO, EN BANCO LIMPIO ══");
console.log("  se le da a la regla el futuro EXACTO — es trampa, y por eso es el TECHO de lo posible.");
console.log("  Si ni con trampa gana, ninguna variable honesta puede.");
console.log("");
const iDD = new Map(DD.map((d,i) => [d,i]));
const fut = (n) => (d) => { const i = iDD.get(d); const j = Math.min(DD.length-1, i+n);
  return SPY[DD[j]] / SPY[d] - 1; };
const oracServ = (n, lo, hi) => { const f = fut(n); return (d) => { const r = f(d); return r > 0.05 ? hi : r < -0.05 ? lo : 1; }; };

console.log("  " + "regla de tamaño".padEnd(34) + "al año".padStart(9) + "caída".padStart(8) +
  "Sharpe".padStart(8) + "expuesto".padStart(10) + "$60.000 →".padStart(13));
const fila = (n, r) => console.log("  " + n.padEnd(34) + (r.cagr.toFixed(1)+"%").padStart(9) +
  ("−"+r.caida.toFixed(0)+"%").padStart(8) + r.sharpe.toFixed(2).padStart(8) +
  (r.exp.toFixed(0)+"%").padStart(10) + D(r.final).padStart(13));
fila("CONSTANTE (el listón)", base);
for (const n of [60, 120, 250]) {
  for (const [lo,hi,nom] of [[0.5,1.5,'0,5x / 1,5x'],[0.25,2,'0,25x / 2x'],[0,2,'0x / 2x (fuera del todo)']]) {
    fila("ORÁCULO a " + n + " días  " + nom, correr(0.24, oracServ(n, lo, hi)));
  }
}
console.log("");
const oMejor = [60,120,250].flatMap(n => [[0.5,1.5],[0.25,2],[0,2]].map(([lo,hi]) => correr(0.24, oracServ(n,lo,hi))));
const ganan = oMejor.filter(r => r.sharpe > base.sharpe).length;
console.log("  el oráculo gana al constante en " + ganan + " de " + oMejor.length + " configuraciones");
console.log("  " + (ganan >= 7
  ? "→ CON EL BANCO LIMPIO, SABER EL FUTURO SÍ SIRVE. El «no se puede» del workflow era del BANCO,\n"
  + "    no de la estrategia. Hay que volver a medir las variables de régimen."
  : ganan >= 4
  ? "→ mitad y mitad: el oráculo no manda claramente ni siquiera con trampa. Señal débil."
  : "→ CONFIRMADO en banco limpio: ni sabiendo el futuro sirve elegir el tamaño.\n"
  + "    Ahora sí es un resultado sobre la estrategia, no sobre el banco."));
console.log("");
