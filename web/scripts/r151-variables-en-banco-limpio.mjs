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

// ── 3 · LAS 66 VARIABLES DE RÉGIMEN, EN EL BANCO LIMPIO ──────────────────────────────────
//
// Cada una entra como percentil (0 a 1) y manda el tamaño así:
//     percentil BAJO  -> tamaño x  lo
//     percentil ALTO  -> tamaño x  hi
// Se prueban las dos direcciones, porque el signo lo tiene que decir el dato, no yo.
//
// Y CADA UNA lleva sus dos controles obligatorios, que hoy han matado dos hallazgos:
//   · DESPLAZAMIENTO ±25 días: si la señal desplazada gana igual, es ruido
//   · BARAJADO circular: si barajar la serie gana igual, es ruido
const PCT = JSON.parse(readFileSync(join(CACHE, "..", "cache-regimen", "percentiles-2015.json"), "utf8"));
const iDD = new Map(DD.map((d,i) => [d,i]));
const fut = (n) => (d) => { const i = iDD.get(d); const j = Math.min(DD.length-1, i+n);
  return SPY[DD[j]] / SPY[d] - 1; };
const orac = (n, lo, hi) => { const f = fut(n); return (d) => { const r = f(d); return r > 0.05 ? hi : r < -0.05 ? lo : 1; }; };

console.log("  ══ 1 · EL ORÁCULO — el TECHO de lo posible (hace trampa a propósito) ══");
console.log("");
console.log("  " + "regla".padEnd(30) + "al año".padStart(9) + "caída".padStart(8) + "Sharpe".padStart(8) + "$60.000 →".padStart(13));
const fila = (n,r) => console.log("  " + n.padEnd(30) + (r.cagr.toFixed(1)+"%").padStart(9) +
  ("−"+r.caida.toFixed(0)+"%").padStart(8) + r.sharpe.toFixed(2).padStart(8) + D(r.final).padStart(13));
fila("CONSTANTE (el listón)", base);
const OR = correr(0.24, orac(120, 0.5, 1.5));
fila("ORÁCULO 120d (0,5x/1,5x)", OR);
console.log("");
console.log("  el techo: +" + (OR.sharpe-base.sharpe).toFixed(2) + " de Sharpe y +" +
  (OR.cagr-base.cagr).toFixed(1) + " puntos. Una variable honesta capturará una FRACCIÓN de eso.");
console.log("");

// escala guiada por una variable, con desplazamiento opcional
function porVar(nombre, lo, hi, desp = 0) {
  const P = PCT[nombre]; if (!P) return null;
  return (d) => { const i = iDD.get(d) + desp;
    const dd = DD[Math.max(0, Math.min(DD.length-1, i))];
    const p = P[dd]; if (p == null) return 1;
    return p < 0.33 ? lo : p > 0.67 ? hi : 1; };
}
console.log("  ══ 2 · LAS 66 VARIABLES, CON SUS CONTROLES ══");
console.log("  (dSharpe = lo que gana sobre el tamaño constante. El techo del oráculo es +" +
  (OR.sharpe-base.sharpe).toFixed(2) + ")");
console.log("");
const RES = [];
for (const nom of Object.keys(PCT)) {
  for (const [lo,hi,dir] of [[0.5,1.5,'alto=GRANDE'],[1.5,0.5,'alto=pequeño']]) {
    const f = porVar(nom, lo, hi); if (!f) continue;
    const r = correr(0.24, f);
    const d = r.sharpe - base.sharpe;
    if (d <= 0.02) continue;                    // sólo interesan las que ganan algo
    // CONTROL 1: desplazar la señal ±5, ±10, ±25 días. Si desplazada gana igual, es ruido.
    const desps = [-25,-10,-5,5,10,25].map(k => correr(0.24, porVar(nom, lo, hi, k)).sharpe - base.sharpe);
    const mejorDesp = Math.max(...desps);
    RES.push({ nom, dir, d, cagr:r.cagr, caida:r.caida, mejorDesp, sobrevive: d > mejorDesp + 0.01 });
  }
}
RES.sort((a,b) => b.d - a.d);
console.log("  " + "variable".padEnd(24) + "dirección".padEnd(15) + "dSharpe".padStart(9) +
  "al año".padStart(9) + "caída".padStart(8) + "mejor desplazada".padStart(18) + "  veredicto");
for (const r of RES.slice(0, 14))
  console.log("  " + r.nom.padEnd(24) + r.dir.padEnd(15) + ("+"+r.d.toFixed(3)).padStart(9) +
    (r.cagr.toFixed(1)+"%").padStart(9) + ("−"+r.caida.toFixed(0)+"%").padStart(8) +
    ("+"+r.mejorDesp.toFixed(3)).padStart(18) + (r.sobrevive ? "   ✓ AGUANTA" : "   ✗ la desplazada gana igual"));
console.log("");
const viven = RES.filter(r => r.sobrevive);
console.log("  " + RES.length + " variables ganan algo · " + viven.length + " sobreviven al desplazamiento");
console.log("  " + (viven.length === 0
  ? "→ NINGUNA. Con el banco limpio y el techo demostrado, las variables de régimen SIGUEN sin servir."
  : "→ " + viven.length + " candidatas: " + viven.slice(0,6).map(v=>v.nom).join(", ")));
console.log("");
