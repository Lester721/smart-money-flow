// ══ ¿QUÉ PREDICE LA OPERACIÓN? ══ Lester, 2026-08-29: «usa más variables, no te limites...
// analiza hasta que lo logres. No acepto "no puedo hacerlo"».
//
// ═══ POR QUÉ SE CAMBIA DE BLANCO ═══════════════════════════════════════════════════════════
//
// Llevo toda la tarde preguntando «¿en qué régimen está el MERCADO?» y todo sale ruido.
// La razón es doble y las dos están medidas:
//
//  1. EL TECHO. Un oráculo que sabe el futuro EXACTO de SPY vale +0,093 de Sharpe. Poco.
//     Pero un oráculo que sabe el futuro de LA OPERACIÓN vale +0,19 / +0,35 / +0,48.
//     → lo predecible no es el año, es el contrato.
//
//  2. LA POTENCIA. La decisión de régimen se toma 51 veces en 11 años. Con 51 decisiones
//     nada se distingue del ruido. La pregunta por operación tiene 10.493 casos.
//     → doscientas veces más potencia estadística.
//
// ═══ LA PREGUNTA ═══════════════════════════════════════════════════════════════════════════
// ¿Qué se puede VER EL DÍA DE COMPRAR que prediga cómo acaba esa operación a 120 días?
// Se mide sobre TODAS las candidatas elegibles, no sobre las 51 que entran en cartera.
//
// Se miran cuatro familias, ninguna probada antes:
//   A. EL CONTRATO   profundidad real, prima/spot, plazo, anchura de la horquilla
//   B. LA ACCIÓN     su propia volatilidad, momento, caída, distancia a sus medias
//   C. RELATIVAS     la acción CONTRA el mercado — fuerza relativa, beta, correlación
//   D. EL MERCADO    el estado del índice ese día (el que ya sabemos que no sirve, de control)
//
// ⛔ Todo con datos de ANTES del día de compra. El resultado a 120 días es el objetivo, nunca
//    una entrada.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";

process.env.CAMINOS = "largo-p25-d400.json";
const M = await import("./motor-cartera.mjs");
const PXD = JSON.parse(readFileSync(join(CACHE, "precios-diarios.json"), "utf8"));
const REG = JSON.parse(readFileSync(join(CACHE, "..", "cache-regimen", "percentiles-2015.json"), "utf8"));
const q = (X,p) => { const S=[...X].sort((a,b)=>a-b); return S[Math.floor(p*(S.length-1))]; };
const media = (X) => X.reduce((a,b)=>a+b,0)/X.length;
const sd = (X) => { const m = media(X); return Math.sqrt(X.reduce((a,x)=>a+(x-m)**2,0)/Math.max(1,X.length-1)); };

// ── series por ticker, con todo precalculado ──
const SER = new Map();
for (const tk of Object.keys(PXD)) {
  const D = Object.keys(PXD[tk]).sort(), P = D.map(d => PXD[tk][d]);
  const iD = new Map(D.map((d,i) => [d,i]));
  const ret = P.map((p,i) => i ? p/P[i-1]-1 : 0);
  SER.set(tk, { D, P, iD, ret });
}
const SPYS = SER.get("SPY");

// ── construir la muestra: TODAS las candidatas elegibles (bajo la media, sin splits) ──
const MU = [];
for (const o of M.OPS) {
  if (!(o.ma < 0) || o.ma < -0.30) continue;             // fuera splits
  const S = SER.get(o.tk); if (!S) continue;
  const i = S.iD.get(o.dC); if (i == null || i < 260) continue;
  const j = SPYS.iD.get(o.dC); if (j == null || j < 260) continue;
  const cam = o.camino.slice(0, Math.min(120, o.camino.length));
  if (cam.length < 40) continue;
  const P = S.P, R = S.ret;
  const vol = (n) => sd(R.slice(i-n, i)) * Math.sqrt(252);
  const volSPY = (n) => sd(SPYS.ret.slice(j-n, j)) * Math.sqrt(252);
  const ma = (n) => P[i] / media(P.slice(i-n, i)) - 1;
  const mom = (n) => P[i] / P[i-n] - 1;
  const maxi = Math.max(...P.slice(Math.max(0,i-252), i+1));
  // beta y correlacion de la accion contra SPY, 120 dias
  const a = R.slice(i-120, i), b = SPYS.ret.slice(j-120, j);
  const ma_ = media(a), mb_ = media(b);
  let cov=0, vb=0, va=0;
  for (let k=0;k<Math.min(a.length,b.length);k++){ cov+=(a[k]-ma_)*(b[k]-mb_); vb+=(b[k]-mb_)**2; va+=(a[k]-ma_)**2; }
  MU.push({
    tk:o.tk, dC:o.dC, y:o.dC.slice(0,4),
    // A · EL CONTRATO
    profundidad: (o.spot - o.K) / o.spot,
    prima_spot: o.coste / (o.spot * 100),
    // B · LA ACCIÓN
    vol20: vol(20), vol60: vol(60), vol120: vol(120),
    ma20: ma(20), ma50: ma(50), ma200: ma(200),
    mom60: mom(60), mom250: mom(250),
    caida_52s: P[i] / maxi - 1,
    // C · RELATIVAS AL MERCADO
    vol_rel: vol(60) / Math.max(1e-9, volSPY(60)),
    fuerza_rel_60: mom(60) - (SPYS.P[j]/SPYS.P[j-60] - 1),
    fuerza_rel_250: mom(250) - (SPYS.P[j]/SPYS.P[j-250] - 1),
    beta: vb > 0 ? cov/vb : 1,
    correl: (va>0&&vb>0) ? cov/Math.sqrt(va*vb) : 0,
    ma_rel: ma(20) - (SPYS.P[j]/media(SPYS.P.slice(j-20,j)) - 1),
    // D · EL MERCADO (control: ya sabemos que no sirve)
    mkt_vol: REG.vol20?.[o.dC] ?? null,
    mkt_caida: REG.caida?.[o.dC] ?? null,
    mkt_vix: REG.VIXCLS?.[o.dC] ?? null,
    // OBJETIVO
    mult: cam[cam.length-1][1],
  });
}
console.log("");
console.log("  ══ AUDIT ══");
console.log("  operaciones candidatas: " + MU.length.toLocaleString("en-US") +
  "   (contra 51 decisiones de la pregunta de régimen)");
console.log("  período: " + MU[0].dC + " → " + MU[MU.length-1].dC);
console.log("  resultado medio: " + (100*(media(MU.map(x=>x.mult))-1)).toFixed(2) + "% por operación");
console.log("");

// ══════════════════════════════════════════════════════════════════════════════════════════
// LAS DOS CORRECCIONES QUE DECIDEN
//
// 1. SIN SOLAPAR. Las 10.493 candidatas se pisan: cada día genera una por ticker y las
//    ventanas de 120 días se solapan. Eso infla la t entre 5 y 7 veces — está documentado
//    en este proyecto desde agosto. Aquí se toma UNA operación por ticker cada 120 días.
//
// 2. ¿ES SÓLO BETA? Las más fuertes (correlación, volatilidad, beta) son la misma cosa:
//    más exposición al mercado. Y más beta en un mercado que sube diez años da más dinero
//    POR CONSTRUCCIÓN. Se comprueba mirando el resultado RELATIVO: el multiplicador de la
//    operación menos lo que hizo el propio SPY apalancado en esos mismos 120 días.
//    Si el efecto desaparece, era beta y no hallazgo.
// ══════════════════════════════════════════════════════════════════════════════════════════
const SPYi = SER.get("SPY");
for (const x of MU) {
  const j = SPYi.iD.get(x.dC);
  const k = Math.min(SPYi.P.length-1, j+120);
  x.spy120 = SPYi.P[k]/SPYi.P[j] - 1;
  // el exceso: cuánto batió la operación a la beta del propio contrato aplicada a SPY
  x.exceso = (x.mult - 1) - 3.0 * x.spy120;    // 3,0 = beta medida del libro (r120)
}
// SIN SOLAPAR: una por ticker cada 120 días de negociación
const porTk = new Map();
for (const x of MU) { if (!porTk.has(x.tk)) porTk.set(x.tk, []); porTk.get(x.tk).push(x); }
const INDEP = [];
for (const [tk, L] of porTk) {
  L.sort((a,b) => a.dC.localeCompare(b.dC));
  let ult = "00000000";
  const S = SER.get(tk);
  for (const x of L) {
    const i = S.iD.get(x.dC), iu = S.iD.get(ult);
    if (iu == null || i - iu >= 120) { INDEP.push(x); ult = x.dC; }
  }
}
console.log("  SIN SOLAPAR: " + INDEP.length + " operaciones independientes (de " + MU.length.toLocaleString("en-US") + ")");
console.log("  factor de inflación de la t: " + Math.sqrt(MU.length/INDEP.length).toFixed(1) + "x");
console.log("");

const VARS = [
  ['A · contrato','prima_spot'],
  ['B · acción','vol20'], ['B · acción','vol60'], ['B · acción','ma20'], ['B · acción','ma50'],
  ['B · acción','caida_52s'], ['B · acción','ma200'],
  ['C · relativa','fuerza_rel_60'], ['C · relativa','fuerza_rel_250'], ['C · relativa','beta'],
  ['C · relativa','correl'], ['C · relativa','ma_rel'], ['C · relativa','vol_rel'],
  ['D · mercado','mkt_vol'], ['D · mercado','mkt_caida'],
];
function quintiles(S, v, obj) {
  const F = S.filter(x => x[v] != null && isFinite(x[v]) && isFinite(x[obj]));
  if (F.length < 150) return null;
  F.sort((a,b) => a[v]-b[v]);
  const n5 = Math.floor(F.length/5);
  const Q = [0,1,2,3,4].map(k => F.slice(k*n5, k===4 ? F.length : (k+1)*n5).map(x => x[obj]));
  const m = Q.map(media), s = Q.map(sd), nn = Q.map(x=>x.length);
  const dif = m[4]-m[0];
  const t = dif / Math.sqrt(s[4]**2/nn[4] + s[0]**2/nn[0]);
  const dir = Math.sign(dif);
  const pasos = [0,1,2,3].filter(k => Math.sign(m[k+1]-m[k])===dir).length;
  return { m, dif, t, pasos, n: F.length };
}
console.log("  ══ LAS DOS CORRECCIONES, LADO A LADO ══");
console.log("");
console.log("  " + "variable".padEnd(17) +
  "   SOLAPADO, bruto" + "   SIN SOLAPAR, bruto".padStart(22) + "   SIN SOLAPAR, sin beta".padStart(26));
console.log("  " + " ".repeat(17) + "   Q5−Q1      t   " + "Q5−Q1      t   ".padStart(22) + "Q5−Q1      t  mon".padStart(26));
const FIN = [];
for (const [fam, v] of VARS) {
  const a = quintiles(MU, v, 'mult');
  const b = quintiles(INDEP, v, 'mult');
  const c = quintiles(INDEP, v, 'exceso');
  if (!a || !b || !c) continue;
  FIN.push({ v, fam, a, b, c });
  const f = (r, mon) => ((r.dif>=0?"+":"")+(100*r.dif).toFixed(1)+"%").padStart(8) +
    r.t.toFixed(2).padStart(7) + (mon ? ("  "+r.pasos+"/4") : "   ");
  console.log("  " + v.padEnd(17) + "   " + f(a) + "   " + f(b) + "      " + f(c, true) +
    (Math.abs(c.t) > 2 && c.pasos >= 3 ? "  ★" : ""));
}
console.log("");
const viven = FIN.filter(x => Math.abs(x.c.t) > 2 && x.c.pasos >= 3);
console.log("  ★ = sobrevive a QUITAR EL SOLAPAMIENTO **y** a QUITAR LA BETA");
console.log("");
if (!viven.length) {
  console.log("  ⇒ NINGUNA. Los t de 8-11 eran solapamiento, y lo que quedaba era beta.");
} else {
  console.log("  ⇒ " + viven.length + " sobreviven las dos correcciones:");
  for (const x of viven.sort((p,r)=>Math.abs(r.c.t)-Math.abs(p.c.t)))
    console.log("     " + x.v.padEnd(18) + "exceso Q5−Q1 = " + ((x.c.dif>=0?"+":"")+(100*x.c.dif).toFixed(1)+"%").padStart(8) +
      "   t=" + x.c.t.toFixed(2).padStart(6) + "   monotonía " + x.c.pasos + "/4   [" + x.fam + "]");
}
console.log("");
