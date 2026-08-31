// ══ ¿SIRVEN LOS CONTRATOS BARATOS? ══ Lester, 2026-08-29: «hazlo y repórtame si encontramos
// optimización».
//
// ═══ LA PREDICCIÓN, ESCRITA ANTES DE MEDIR ═════════════════════════════════════════════════
//   · rendimiento: SIN CAMBIO, 19-22%. No hay alfa que ganar repartiendo el mismo dinero.
//   · Sharpe: de 0,71 a **0,74-0,78**, por diluir el riesgo de empresa (R²=65% → un tercio de
//     la varianza es idiosincrática y se divide entre el número de posiciones).
//   · si sale mucho más alto, es una casilla afortunada.
//
// ═══ CÓMO SE COMPARA, Y ES LO QUE FALLÓ AYER ═══════════════════════════════════════════════
// **A LA MISMA EXPOSICIÓN.** 2 huecos al 12% y 6 al 4% ponen el MISMO dinero en juego; lo único
// que cambia es en cuántos trozos. Comparar 2 huecos contra 6 sin igualar el dinero sería
// repetir exactamente el error que obligó a retirar «quitar las 25 empresas».
//
// Y todo con castigo de ejecución, banda de 41 capitales, y la horquilla de los contratos
// baratos MEDIDA — que es el riesgo conocido de esta idea.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";
const FB = "barato-p25-d400.json";
if (!existsSync(join(CACHE, FB))) { console.log("\n  ⛔ falta " + FB + ". Corre r148 primero.\n"); process.exit(1); }
process.env.CAMINOS = FB;
const M = await import("./motor-cartera.mjs");
process.env.CAMINOS = "largo-p25-d400.json";
const V = await import("./motor-cartera.mjs?v=viejo");     // el de $5.000, para comparar
for (const o of M.OPS) if (o.ma >= 0) o.ma = 999;
for (const o of V.OPS) if (o.ma >= 0) o.ma = 999;
const CAST = 0.5 * 0.0276, CAP = 60000;
const D = (x) => (x<0?"−$":"$")+Math.abs(Math.round(x)).toLocaleString("en-US");
const q = (X,p) => { const S=[...X].sort((a,b)=>a-b); return S[Math.floor(p*(S.length-1))]; };
const med = (X) => q(X, 0.5);
const spy1 = V.spyApalancado(1);

// banda de 41 capitales: es la única forma honesta de leer esto (ver [[las-mitades-son-una-loteria]])
function banda41(mod, cfg) {
  const S=[],A=[],C=[],O=[],F=[],E=[];
  for (let i=0;i<41;i++) { const r = mod.simular({...cfg, capital: CAP*(1+(i-20)*0.005)});
    S.push(r.sharpe); A.push(r.cagr); C.push(r.caida); O.push(r.ops); F.push(r.final); E.push(r.invertido); }
  return { s:med(S), sMin:q(S,0), sMax:q(S,1), a:med(A), aMin:q(A,0), aMax:q(A,1),
           c:med(C), ops:med(O), fin:med(F), exp:med(E) }; }

console.log("");
console.log("  ══ AUDIT ══");
console.log("  entradas con mínimo $1.500: " + M.OPS.length.toLocaleString("en-US") +
  "   ·   con mínimo $5.000: " + V.OPS.length.toLocaleString("en-US"));
const CB = M.OPS.map(o=>o.coste);
console.log("  coste del contrato barato:  p10 " + D(q(CB,0.1)) + " · MEDIANA " + D(q(CB,0.5)) +
  " · p90 " + D(q(CB,0.9)));
console.log("  ¿cuántos por debajo de $5.000? " + (100*CB.filter(x=>x<5000).length/CB.length).toFixed(0) + "%");
console.log("  EL LISTÓN — comprar SPY: " + spy1.cagr.toFixed(1) + "% · −" + spy1.caida.toFixed(0) +
  "% · Sharpe " + spy1.sharpe.toFixed(2) + " → " + D(spy1.final));
console.log("");
const REF = banda41(V, { tam:0.12, huecos:2, modo:"spy", plazo:120, castigo:CAST });
console.log("  LA PALANCA DE HOY (mínimo $5.000, 2 huecos al 12%):");
console.log("    " + REF.a.toFixed(1) + "% al año (" + REF.aMin.toFixed(1) + "-" + REF.aMax.toFixed(1) +
  ") · caída −" + REF.c.toFixed(0) + "% · Sharpe " + REF.s.toFixed(2) + " (" + REF.sMin.toFixed(2) +
  "-" + REF.sMax.toFixed(2) + ") · " + REF.ops + " ops · expuesto " + REF.exp.toFixed(0) + "%");
console.log("");

// ── LA COMPARACIÓN QUE IMPORTA: MISMA EXPOSICIÓN, MÁS TROZOS ──────────────────────────────
console.log("  ══ 1 · MISMA EXPOSICIÓN, MÁS POSICIONES ══");
console.log("");
console.log("  " + "config".padEnd(22) + "expuesto".padStart(10) + "al año (mín-máx)".padStart(21) +
  "caída".padStart(8) + "Sharpe (mín-máx)".padStart(21) + "ops".padStart(6) + "$60.000 →".padStart(13));
const OBJ = 0.24;              // 2 × 12% = 24% de exposición nominal
const RES = [];
for (const h of [2, 3, 4, 6, 8, 10, 12]) {
  const t = Math.round((OBJ/h)*1000)/1000;
  const r = banda41(M, { tam:t, huecos:h, modo:"spy", plazo:120, castigo:CAST, costeMin:0 });
  RES.push({ h, t, r });
  console.log("  " + (h + " huecos × " + (100*t).toFixed(1) + "%").padEnd(22) +
    (r.exp.toFixed(0)+"%").padStart(10) +
    (r.a.toFixed(1)+"%  ("+r.aMin.toFixed(1)+"-"+r.aMax.toFixed(1)+")").padStart(21) +
    ("−"+r.c.toFixed(0)+"%").padStart(8) +
    (r.s.toFixed(2)+"  ("+r.sMin.toFixed(2)+"-"+r.sMax.toFixed(2)+")").padStart(21) +
    String(r.ops).padStart(6) + D(r.fin).padStart(13)); }
console.log("  " + "── el de $5.000 ──".padEnd(22) + (REF.exp.toFixed(0)+"%").padStart(10) +
  (REF.a.toFixed(1)+"%  ("+REF.aMin.toFixed(1)+"-"+REF.aMax.toFixed(1)+")").padStart(21) +
  ("−"+REF.c.toFixed(0)+"%").padStart(8) +
  (REF.s.toFixed(2)+"  ("+REF.sMin.toFixed(2)+"-"+REF.sMax.toFixed(2)+")").padStart(21) +
  String(REF.ops).padStart(6) + D(REF.fin).padStart(13));
console.log("  " + "comprar SPY".padEnd(22) + "100%".padStart(10) +
  (spy1.cagr.toFixed(1)+"%").padStart(21) + ("−"+spy1.caida.toFixed(0)+"%").padStart(8) +
  spy1.sharpe.toFixed(2).padStart(21) + "—".padStart(6) + D(spy1.final).padStart(13));
console.log("");

// ── ¿Y SI SUBIMOS LA EXPOSICIÓN CON MUCHAS POSICIONES? ────────────────────────────────────
console.log("  ══ 2 · LA FRONTERA CON MUCHOS HUECOS ══  (¿deja el reparto poner MÁS dinero?)");
console.log("");
console.log("  " + "config".padEnd(22) + "expuesto".padStart(10) + "al año".padStart(9) +
  "caída".padStart(8) + "Sharpe".padStart(9) + "ops".padStart(6) + "$60.000 →".padStart(13));
for (const [h,t] of [[6,0.04],[6,0.06],[6,0.08],[8,0.05],[8,0.06],[10,0.04],[10,0.05],[10,0.06],[12,0.05]]) {
  const r = banda41(M, { tam:t, huecos:h, modo:"spy", plazo:120, castigo:CAST });
  console.log("  " + (h + " × " + (100*t).toFixed(0) + "%").padEnd(22) + (r.exp.toFixed(0)+"%").padStart(10) +
    (r.a.toFixed(1)+"%").padStart(9) + ("−"+r.c.toFixed(0)+"%").padStart(8) + r.s.toFixed(2).padStart(9) +
    String(r.ops).padStart(6) + D(r.fin).padStart(13)); }
console.log("");

// ── ¿SIGUEN SIENDO UNA LOTERÍA LAS MITADES? ───────────────────────────────────────────────
console.log("  ══ 3 · ¿SE ARREGLA EL CAOS? ══  el rango del Sharpe de cada mitad, 41 capitales");
console.log("");
console.log("  " + "config".padEnd(22) + "TODO (rango)".padStart(20) + "2016-2020 (rango)".padStart(22) +
  "2021-2026 (rango)".padStart(22));
for (const [nom, mod, h, t] of [["$5.000 · 2 huecos", V, 2, 0.12],
                                 ["$1.500 · 6 huecos", M, 6, 0.04],
                                 ["$1.500 · 10 huecos", M, 10, 0.024]]) {
  const cf = { tam:t, huecos:h, modo:"spy", plazo:120, castigo:CAST };
  const T=[],A=[],B=[];
  for (let i=0;i<41;i++){ const cap=CAP*(1+(i-20)*0.005);
    T.push(mod.simular({...cf,capital:cap}).sharpe);
    A.push(mod.simular({...cf,capital:cap,hasta:"20201231"}).sharpe);
    B.push(mod.simular({...cf,capital:cap,desdeD:"20210101"}).sharpe); }
  const rg = X => q(X,0.5).toFixed(2)+" ("+(q(X,1)-q(X,0)).toFixed(2)+")";
  console.log("  " + nom.padEnd(22) + rg(T).padStart(20) + rg(A).padStart(22) + rg(B).padStart(22)); }
console.log("");
console.log("  (el rango entre paréntesis es lo que baila. Antes: 0,03 el total y 0,56 la mitad reciente)");
console.log("");
