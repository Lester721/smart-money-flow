// ══ ¿BAJA LA CAÍDA SIN MATAR EL 29%? ══ Lester, 2026-08-29.
//
// La ecuación es:   caída = caída de SPY × BETA × cuánto dinero pones
// El tamaño ya lo sabíamos mover y NO sirve: baja las dos cosas a la vez, en línea recta.
// La BETA no la habíamos tocado nunca, y la fija la PROFUNDIDAD.
//
// Hipótesis, con mecanismo y con predicción concreta que puede fallar:
//   una call 50% dentro cuesta más y apalanca menos → menor beta → se puede poner MÁS dinero
//   → mismo rendimiento con menos caída. Si la frontera de 50% queda POR ENCIMA de la de 15%
//   a la misma caída, la palanca existe. Si queda igual o por debajo, está muerta y se dice.
//
// LO QUE SE MIDE, en este orden (y las dos mitades desde el primer momento):
//   1. la BETA de cada profundidad  → ¿el mecanismo es real, antes de mirar el dinero?
//   2. la FRONTERA de cada una      → ¿le gana a la de 15% a la misma caída?
//   3. las DOS MITADES de la ganadora
//   4. contra el listón: comprar SPY, y SPY a crédito emparejado por caída
import { existsSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";

const PROFS = [15, 25, 35, 50], DTES = [120, 250];
const D = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");

// cada fichero necesita su propia instancia del motor (lee CAMINOS al importarse)
const MOT = {};
let v = 0;
for (const p of PROFS) for (const dt of DTES) {
  const f = "caminos-p" + p + "-d" + dt + ".json";
  if (!existsSync(join(CACHE, f))) { console.log("  falta " + f); continue; }
  process.env.CAMINOS = f;
  MOT[p + "|" + dt] = await import("./motor-cartera.mjs?v=" + (++v)); }
const claves = Object.keys(MOT);
if (!claves.length) { console.log("\n  ⛔ no hay ficheros de caminos. Corre r135 primero.\n"); process.exit(1); }
const M0 = MOT[claves[0]];
const spy1 = M0.spyApalancado(1);

// «siempre puesta» o «bajo la media»: r125 dijo que da igual; se deja bajo la media,
// que es la regla original, para no cambiar dos cosas a la vez.
const bajoMedia = (M) => { for (const o of M.OPS) if (o.ma >= 0) o.ma = 999; };
for (const k of claves) bajoMedia(MOT[k]);

console.log("");
console.log("  ══ AUDIT ══");
console.log("  " + "config".padEnd(16) + "entradas".padStart(10) + "prima/spot".padStart(12) + "apalanca".padStart(10));
for (const k of claves) { const M = MOT[k];
  const P = M.OPS.map((o)=>o.coste/(o.spot*100)).sort((a,b)=>a-b);
  const pv = P[Math.floor(P.length/2)];
  console.log("  " + k.replace("|","% × ").padEnd(16) + M.OPS.length.toLocaleString("en-US").padStart(10) +
    ((100*pv).toFixed(1)+"%").padStart(12) + ((1/pv).toFixed(1)+"x").padStart(10)); }
console.log("  EL LISTÓN — comprar SPY: " + spy1.cagr.toFixed(1) + "% · caída −" + spy1.caida.toFixed(0) +
  "% · Sharpe " + spy1.sharpe.toFixed(2));
console.log("");

// ── 1 · LA BETA DE CADA PROFUNDIDAD ───────────────────────────────────────────────────────
console.log("  ══ 1 · ¿ES REAL EL MECANISMO? ══  la beta tiene que BAJAR al ir más dentro");
console.log("");
function reg(Y,X){ const n=Y.length,my=Y.reduce((a,x)=>a+x,0)/n,mx=X.reduce((a,x)=>a+x,0)/n;
  let nu=0,de=0; for(let i=0;i<n;i++){nu+=(Y[i]-my)*(X[i]-mx); de+=(X[i]-mx)**2;}
  const b=nu/de,a=my-b*mx; let ssr=0,sst=0;
  for(let i=0;i<n;i++){const f=a+b*X[i]; ssr+=(Y[i]-f)**2; sst+=(Y[i]-my)**2;}
  return { b, a, r2:1-ssr/sst, tb:b/Math.sqrt(ssr/(n-2)/de) }; }
console.log("  " + "config".padEnd(16) + "beta del libro".padStart(16) + "R²".padStart(8) + "n".padStart(8));
const BETAS = {};
for (const k of claves) { const M = MOT[k];
  const q = M.simular({ tam:0.15, huecos:6, modo:"efectivo" });
  const r = reg(q.RB, q.RS); BETAS[k] = r.b;
  console.log("  " + k.replace("|","% × ").padEnd(16) + r.b.toFixed(2).padStart(16) +
    ((100*r.r2).toFixed(0)+"%").padStart(8) + String(q.RB.length).padStart(8)); }
const b15 = BETAS["15|120"], b50 = BETAS["50|120"];
console.log("");
console.log("  " + (b15 && b50 && b50 < b15 - 0.3
  ? "→ la beta BAJA de " + b15.toFixed(2) + " a " + b50.toFixed(2) + " al ir más dentro: el mecanismo existe ✓"
  : "→ ⛔ la beta NO baja lo suficiente. La palanca no está donde pensaba."));
console.log("");

// ── 2 · LA FRONTERA ───────────────────────────────────────────────────────────────────────
console.log("  ══ 2 · LA FRONTERA ══  a la MISMA caída, ¿quién rinde más?");
console.log("");
const REJ = [];
for (const h of [2,4,6,8,10,12,15,20]) for (const t of [0.04,0.06,0.08,0.10,0.12,0.15,0.20,0.25,0.30])
  REJ.push([h, t]);
const PT = {};
for (const k of claves) {
  const M = MOT[k];
  PT[k] = [];
  for (const [h,t] of REJ) { const q = M.simular({ tam:t, huecos:h, modo:"spy" });
    if (q.ops < 40) continue;
    const b = M.banda({ tam:t, huecos:h, modo:"spy" });
    PT[k].push({ h, t, a:b.a, c:b.c, s:b.s, ops:q.ops, exp:q.invertido }); } }
const FSPY = []; for (let L=1;L<=3.01;L+=0.05){ const r = M0.spyApalancado(L); FSPY.push({L:Math.round(L*100)/100,a:r.cagr,c:r.caida,s:r.sharpe}); }
const mej = (p,o) => { const ok = p.filter((x)=>x.c<=o); return ok.length ? ok.sort((a,b)=>b.a-a.a)[0] : null; };
const OBJ = [30,40,50,60,70,80];
console.log("  " + "config".padEnd(16) + OBJ.map((o)=>("≤"+o+"%").padStart(10)).join(""));
for (const k of claves) {
  let l = "  " + k.replace("|","% × ").padEnd(16);
  for (const o of OBJ) { const x = mej(PT[k],o); l += (x ? x.a.toFixed(1)+"%" : "—").padStart(10); }
  console.log(l); }
let ls = "  " + "SPY a crédito".padEnd(16);
for (const o of OBJ) { const x = mej(FSPY,o); ls += (x ? x.a.toFixed(1)+"%" : "—").padStart(10); }
console.log(ls);
console.log("  " + "SPY y dormir".padEnd(16) + (spy1.cagr.toFixed(1)+"%").padStart(10) + "  ← su caída: −" + spy1.caida.toFixed(0) + "%");
console.log("");

// ── 3 · LA MEJOR DE CADA CAÍDA, CON DETALLE Y LAS DOS MITADES ─────────────────────────────
console.log("  ══ 3 · LA MEJOR A CADA NIVEL DE SUSTO ══");
console.log("");
console.log("  " + "caída máx".padEnd(12) + "quién gana".padEnd(16) + "config".padEnd(14) + "expuesto".padStart(10) +
  "al año".padStart(9) + "caída".padStart(8) + "Sharpe".padStart(8) + "2016-20".padStart(9) + "2021-26".padStart(9));
for (const o of OBJ) {
  let best = null, bk = null;
  for (const k of claves) { const x = mej(PT[k],o); if (x && (!best || x.a > best.a)) { best = x; bk = k; } }
  if (!best) continue;
  const M = MOT[bk];
  const A = M.banda({ tam:best.t, huecos:best.h, modo:"spy", hasta:"20201231" });
  const B = M.banda({ tam:best.t, huecos:best.h, modo:"spy", desdeD:"20210101" });
  console.log("  " + ("≤"+o+"%").padEnd(12) + bk.replace("|","% × ").padEnd(16) +
    (best.h + " × " + (100*best.t).toFixed(0) + "%").padEnd(14) + (best.exp.toFixed(0)+"%").padStart(10) +
    (best.a.toFixed(1)+"%").padStart(9) + ("−"+best.c.toFixed(0)+"%").padStart(8) + best.s.toFixed(2).padStart(8) +
    A.s.toFixed(2).padStart(9) + B.s.toFixed(2).padStart(9)); }
console.log("");

// ── 4 · ¿EXISTE EL 29% CON MENOS SUSTO? ───────────────────────────────────────────────────
console.log("  ══ 4 · LA PREGUNTA DE LESTER ══  ¿hay 29% al año con menos de −79% de caída?");
console.log("");
const todas = [];
for (const k of claves) for (const x of PT[k]) todas.push({ k, ...x });
const con29 = todas.filter((x)=>x.a >= 28).sort((a,b)=>a.c-b.c);
if (!con29.length) console.log("  ninguna configuración llega al 28% al año.");
else {
  console.log("  las 8 de MENOR caída entre las que dan ≥28% al año:");
  console.log("  " + "config".padEnd(16) + "huecos×tam".padEnd(14) + "expuesto".padStart(10) +
    "al año".padStart(9) + "caída".padStart(8) + "Sharpe".padStart(8) + "$60.000 →".padStart(13));
  for (const x of con29.slice(0,8)) {
    const M = MOT[x.k];
    const q = M.simular({ capital:60000, tam:x.t, huecos:x.h, modo:"spy" });
    console.log("  " + x.k.replace("|","% × ").padEnd(16) + (x.h+" × "+(100*x.t).toFixed(0)+"%").padEnd(14) +
      (x.exp.toFixed(0)+"%").padStart(10) + (x.a.toFixed(1)+"%").padStart(9) +
      ("−"+x.c.toFixed(0)+"%").padStart(8) + x.s.toFixed(2).padStart(8) + D(q.final).padStart(13)); }
  console.log("");
  console.log("  el 15% × 120d (lo que teníamos) daba 29-32% con caída −79% a −83%.");
  const g = con29[0];
  console.log("  la mejor de todas: " + g.k.replace("|","% × ") + " → " + g.a.toFixed(1) + "% con caída −" + g.c.toFixed(0) + "%");
  console.log("  " + (g.c < 70 ? "  ✓ SÍ existe el 29% con menos susto: " + (79-g.c).toFixed(0) + " puntos menos de caída"
                               : "  ⛔ NO: la profundidad no compra caída. Hay que decirlo y buscar otra palanca."));
}
console.log("");
