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

// ── EL TECHO, APRETADO ─────────────────────────────────────────────────────────────────
// El primer oráculo era de tres escalones. Aquí se le da MÁS poder para que el techo sea
// firme: tamaño CONTINUO proporcional al futuro exacto, y varios horizontes.
// Si una variable honesta supera el techo del que hace trampa, no es señal: es ruido.
console.log("  ══ 1 · EL TECHO — cuánto vale saber el futuro ══");
console.log("");
console.log("  " + "oráculo".padEnd(34) + "al año".padStart(9) + "caída".padStart(8) + "Sharpe".padStart(8) + "dSharpe".padStart(10));
const fila = (n,r) => console.log("  " + n.padEnd(34) + (r.cagr.toFixed(1)+"%").padStart(9) +
  ("−"+r.caida.toFixed(0)+"%").padStart(8) + r.sharpe.toFixed(2).padStart(8) +
  ((r.sharpe-base.sharpe>=0?"+":"")+(r.sharpe-base.sharpe).toFixed(3)).padStart(10));
fila("CONSTANTE (el listón)", base);
let techo = 0;
for (const n of [60,120,250]) {
  const f = fut(n);
  // escalones
  for (const [lo,hi] of [[0.5,1.5],[0.25,2],[0,3]]) {
    const r = correr(0.24, (d) => { const x = f(d); return x > 0.05 ? hi : x < -0.05 ? lo : 1; });
    techo = Math.max(techo, r.sharpe - base.sharpe);
    fila("escalones " + n + "d  " + lo + "x/" + hi + "x", r); }
  // CONTINUO: el tamaño es proporcional al retorno futuro exacto. Trampa máxima.
  const r2 = correr(0.24, (d) => Math.max(0, Math.min(3, 1 + 10*f(d))));
  techo = Math.max(techo, r2.sharpe - base.sharpe);
  fila("CONTINUO " + n + "d (trampa máxima)", r2);
}
console.log("");
console.log("  ⇒ EL TECHO ES +" + techo.toFixed(3) + " de Sharpe.");
console.log("     Cualquier variable honesta que dé MÁS que esto es ruido, por definición.");
console.log("");

function porVar(nombre, lo, hi, desp = 0) {
  const P = PCT[nombre]; if (!P) return null;
  return (d) => { const i = iDD.get(d) + desp;
    const dd = DD[Math.max(0, Math.min(DD.length-1, i))];
    const p = P[dd]; if (p == null) return 1;
    return p < 0.33 ? lo : p > 0.67 ? hi : 1; };
}
// BARAJADO CIRCULAR: la misma serie, rotada. Conserva la forma, destruye la alineación.
function rotada(nombre, lo, hi, k) {
  const P = PCT[nombre]; if (!P) return null;
  const L = DD.filter(d => P[d] != null);
  return (d) => { const i = L.indexOf(d); if (i < 0) return 1;
    const p = P[L[(i + k) % L.length]];
    return p < 0.33 ? lo : p > 0.67 ? hi : 1; };
}
// ══════════════════════════════════════════════════════════════════════════════════════════
// LA IDEA DE LESTER: ANÁLOGOS HISTÓRICOS
//   «2026 se parece a 2011 y 2025 — mira qué pasó después de esos años y decide el tamaño»
//
// No es lo mismo que un umbral sobre una variable. Usa TODAS las variables a la vez y busca
// los días históricos más parecidos a hoy. Es lo que hace un humano cuando dice «esto huele
// a 2011». Nunca se ha medido.
//
// ⛔ SÓLO ANÁLOGOS DEL PASADO. Para decidir el 2022-03-15 sólo se miran días anteriores a esa
//    fecha, y su desenlace tiene que haber terminado ANTES de esa fecha (si no, es futuro).
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("  ══ 2 · LOS ANÁLOGOS HISTÓRICOS — la idea de Lester ══");
console.log("");
const VARS = ['CAPE','vol20','caida','credito_baa_aaa','ma200','mom12m','DFF','VIXCLS','NFCI','GPRD_MA30','EPU','pendiente_10_3m'];
const disp = VARS.filter(v => PCT[v]);
console.log("  vector de régimen (" + disp.length + " variables): " + disp.join(", "));

// vector normalizado por día
const VEC = new Map();
for (const d of DD) {
  const v = disp.map(k => PCT[k][d]);
  if (v.every(x => x != null)) VEC.set(d, v);
}
const CONV = [...VEC.keys()].sort();
console.log("  días con vector completo: " + CONV.length + "   (" + CONV[0] + " → " + CONV[CONV.length-1] + ")");

// qué hizo SPY en los 120 días siguientes a cada día histórico
const DES = new Map();
for (let i = 0; i < DD.length - 120; i++) DES.set(DD[i], SPY[DD[i+120]] / SPY[DD[i]] - 1);

function analogo(K) {
  return (d) => {
    const v = VEC.get(d); if (!v) return 1;
    // sólo días ANTERIORES cuyo desenlace de 120 días ya había terminado antes de hoy
    const iHoy = iDD.get(d);
    const cand = [];
    for (const c of CONV) {
      const ic = iDD.get(c);
      if (ic + 120 >= iHoy) break;                 // su desenlace tocaría el futuro
      const w = VEC.get(c);
      let s = 0; for (let j = 0; j < v.length; j++) s += (v[j]-w[j])**2;
      cand.push([s, c]);
    }
    if (cand.length < K * 3) return 1;
    cand.sort((a,b) => a[0]-b[0]);
    const vecinos = cand.slice(0, K).map(x => DES.get(x[1])).filter(x => x != null);
    if (!vecinos.length) return 1;
    const med = vecinos.reduce((a,x)=>a+x,0) / vecinos.length;
    return med > 0.03 ? 1.5 : med < -0.03 ? 0.5 : 1;   // mismos escalones que el oráculo
  };
}
console.log("");
console.log("  " + "cuántos vecinos".padEnd(24) + "al año".padStart(9) + "caída".padStart(8) +
  "Sharpe".padStart(8) + "dSharpe".padStart(10) + "  ¿bajo el techo de +" + techo.toFixed(3) + "?");
const fila2 = (n, r) => { const d = r.sharpe - base.sharpe;
  console.log("  " + n.padEnd(24) + (r.cagr.toFixed(1)+"%").padStart(9) + ("−"+r.caida.toFixed(0)+"%").padStart(8) +
    r.sharpe.toFixed(2).padStart(8) + ((d>=0?"+":"")+d.toFixed(3)).padStart(10) +
    (d > techo ? "        NO, IMPOSIBLE" : "        sí")); return d; };
fila2("CONSTANTE (el listón)", base);
const DS = [];
for (const K of [20, 60, 120, 250, 500]) DS.push({K, d: fila2("los " + K + " más parecidos", correr(0.24, analogo(K)))});
console.log("");
const mejor = DS.slice().sort((a,b)=>b.d-a.d)[0];
console.log("  el mejor: K=" + mejor.K + " con " + (mejor.d>=0?"+":"") + mejor.d.toFixed(3) + " de Sharpe");
console.log("  monótono en K? " + DS.map(x=>x.d.toFixed(3)).join(" → "));
console.log("");
if (mejor.d > 0.02) {
  console.log("  ── controles sobre el mejor K ──");
  const dp = Math.max(...[-25,-10,10,25].map(k => {
    const f = analogo(mejor.K);
    return correr(0.24, (d) => { const i = iDD.get(d)+k; return f(DD[Math.max(0,Math.min(DD.length-1,i))]); }).sharpe - base.sharpe; }));
  console.log("  desplazado ±25 días: " + (dp>=0?"+":"") + dp.toFixed(3) +
    (mejor.d > dp + 0.01 ? "   ✓ la señal alineada gana" : "   ✗ desplazada gana igual → RUIDO"));
} else {
  console.log("  ⇒ los análogos NO ganan nada. La idea, medida, no funciona.");
}
console.log("");
