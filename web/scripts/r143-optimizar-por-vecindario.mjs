// ══ OPTIMIZAR POR VECINDARIO ══ Lester, 2026-08-29: «optimiza todo».
//
// ═══ POR QUÉ NO SE OPTIMIZA BUSCANDO EL MÁXIMO ═════════════════════════════════════════════
//
// Todo lo que ha muerto en este proyecto murió de la misma forma: era un PICO con vecinos
// malos, y lo encontramos buscando el máximo.
//
//   · el freno del 3%          0,69 … con un 0,41 pegado un punto más allá
//   · el freno del 5%          la PEOR casilla de su propio barrido
//   · «máx 2 entradas/mes»     0,78 con 0,58 y 0,61 al lado, y 41% vs 8% entre mitades
//   · el plazo de 250d         0,77 con 0,65 y 0,69 al lado
//   · el aguante de 90d        0,83 en el tramo reciente, con 0,16 y 0,26 al lado
//
// Un optimizador que busca el máximo elige EXACTAMENTE esas casillas. Por construcción.
//
// ═══ LA REGLA DE ESTE OPTIMIZADOR ══════════════════════════════════════════════════════════
// La puntuación de una configuración NO es su Sharpe: es la **MEDIANA del Sharpe de su
// vecindario** (ella misma y sus vecinas a un paso en huecos, tamaño y aguante).
//   · un pico rodeado de malos se hunde solo
//   · una meseta sobrevive
//   · y se puede LEER la dispersión del vecindario: si es grande, no te fíes aunque puntúe
//
// Además, siempre y en todas las filas:
//   · CASTIGO de media horquilla sobre la medida en r140 (no la cotizada a secas)
//   · las DOS MITADES a la vista
//   · el freno se elimina del barrido: ya está medido que es ruido en dos configuraciones
import { existsSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";

const H = { "25|250": 0.0244, "25|400": 0.0276, "35|250": 0.0258, "35|400": 0.0301 };  // r140
const M = {}; let v = 0;
for (const k of Object.keys(H)) { const [p,d] = k.split("|");
  const f = "largo-p"+p+"-d"+d+".json";
  if (!existsSync(join(CACHE,f))) continue;
  process.env.CAMINOS = f; M[k] = await import("./motor-cartera.mjs?v="+(++v)); }
const K = Object.keys(M);
for (const k of K) for (const o of M[k].OPS) if (o.ma >= 0) o.ma = 999;
const M0 = M[K[0]], spy1 = M0.spyApalancado(1);
const A = "20201231", B = "20210101";
const D = (x) => (x<0?"−$":"$")+Math.abs(Math.round(x)).toLocaleString("en-US");
const med = (X) => { const S=[...X].sort((a,b)=>a-b); return S[Math.floor(S.length/2)]; };

// mediana de 5 capitales: barata para la rejilla, robusta al salto de contrato entero
function med5(mod, cfg) {
  const S=[], Aa=[], Cc=[];
  for (let i=-2;i<=2;i++) { const q = mod.simular({...cfg, capital: 60000*(1+i*0.02)});
    S.push(q.sharpe); Aa.push(q.cagr); Cc.push(q.caida); }
  return { s: med(S), a: med(Aa), c: med(Cc) }; }

const HUECOS = [2, 3, 4, 6];
const TAMS   = [0.10, 0.12, 0.15, 0.20, 0.25];
const AGUAN  = [60, 90, 120];

console.log("");
console.log("  ══ AUDIT ══");
console.log("  rejilla: " + K.length + " contratos × " + HUECOS.length + " huecos × " + TAMS.length +
  " tamaños × " + AGUAN.length + " aguantes = " + (K.length*HUECOS.length*TAMS.length*AGUAN.length) + " configuraciones");
console.log("  castigo de ejecución: media horquilla MEDIDA en r140, en todas las filas");
console.log("  freno del SPY: FUERA del barrido (medido como ruido en dos configuraciones distintas)");
console.log("  EL LISTÓN — comprar SPY: " + spy1.cagr.toFixed(1) + "% · caída −" + spy1.caida.toFixed(0) +
  "% · Sharpe " + spy1.sharpe.toFixed(2) + "  →  $60.000 llegan a " + D(spy1.final));
console.log("");

// ── la rejilla entera ──
const G = new Map();
for (const k of K) for (const h of HUECOS) for (const t of TAMS) for (const ag of AGUAN) {
  const cfg = { tam:t, huecos:h, modo:"spy", plazo:ag, castigo: 0.5*H[k] };
  const q = M[k].simular({...cfg, capital:60000});
  if (q.ops < 25) continue;
  const T = med5(M[k], cfg);
  G.set(k+"|"+h+"|"+t+"|"+ag, { k,h,t,ag, ...T, ops:q.ops, exp:q.invertido, fin:q.final }); }
console.log("  configuraciones con muestra (≥25 ops): " + G.size);
console.log("");

// ── puntuación por vecindario ──
const iH = (h)=>HUECOS.indexOf(h), iT = (t)=>TAMS.indexOf(t), iA = (a)=>AGUAN.indexOf(a);
for (const [key, x] of G) {
  const V = [x.s];
  for (const [dh,dt,da] of [[-1,0,0],[1,0,0],[0,-1,0],[0,1,0],[0,0,-1],[0,0,1]]) {
    const h2=HUECOS[iH(x.h)+dh], t2=TAMS[iT(x.t)+dt], a2=AGUAN[iA(x.ag)+da];
    if (h2==null||t2==null||a2==null) continue;
    const n = G.get(x.k+"|"+h2+"|"+t2+"|"+a2);
    if (n) V.push(n.s); }
  x.vecinos = V.length - 1;
  x.punt = med(V);
  x.peorVecino = Math.min(...V);
  x.disp = Math.max(...V) - Math.min(...V); }

// sólo se consideran las que tienen vecindario de verdad
const CAND = [...G.values()].filter((x) => x.vecinos >= 4);
console.log("  ══ 1 · LAS 10 MEJORES POR VECINDARIO ══  (no por su propia casilla)");
console.log("");
console.log("  " + "configuración".padEnd(24) + "exp".padStart(6) + "PUNT".padStart(7) + "propia".padStart(8) +
  "peor vec".padStart(10) + "disp".padStart(7) + "al año".padStart(9) + "caída".padStart(8) + "ops".padStart(6));
const top = CAND.slice().sort((a,b)=>b.punt-a.punt).slice(0,10);
for (const x of top)
  console.log("  " + (x.k.replace("|","%×")+"d "+x.h+"×"+(100*x.t).toFixed(0)+"% ag"+x.ag).padEnd(24) +
    (x.exp.toFixed(0)+"%").padStart(6) + x.punt.toFixed(2).padStart(7) + x.s.toFixed(2).padStart(8) +
    x.peorVecino.toFixed(2).padStart(10) + x.disp.toFixed(2).padStart(7) +
    (x.a.toFixed(1)+"%").padStart(9) + ("−"+x.c.toFixed(0)+"%").padStart(8) + String(x.ops).padStart(6));
console.log("");
console.log("  ── para comparar: las 5 mejores por su PROPIA casilla (el optimizador de siempre) ──");
console.log("  " + "configuración".padEnd(24) + "exp".padStart(6) + "propia".padStart(8) + "PUNT".padStart(7) +
  "peor vec".padStart(10) + "disp".padStart(7));
for (const x of CAND.slice().sort((a,b)=>b.s-a.s).slice(0,5))
  console.log("  " + (x.k.replace("|","%×")+"d "+x.h+"×"+(100*x.t).toFixed(0)+"% ag"+x.ag).padEnd(24) +
    (x.exp.toFixed(0)+"%").padStart(6) + x.s.toFixed(2).padStart(8) + x.punt.toFixed(2).padStart(7) +
    x.peorVecino.toFixed(2).padStart(10) + x.disp.toFixed(2).padStart(7) +
    (x.disp > 0.15 ? "   ← vecindario inestable" : ""));
console.log("");

// ── las finalistas, con las 21 bandas y las dos mitades ──
console.log("  ══ 2 · LAS FINALISTAS ══  mediana de 21 capitales · dos mitades · castigo medio");
console.log("");
console.log("  " + "configuración".padEnd(24) + "exp".padStart(6) + "al año".padStart(9) + "caída".padStart(8) +
  "Sharpe".padStart(8) + "2016-20".padStart(9) + "2021-26".padStart(9) + "ops/año".padStart(9) + "$60.000 →".padStart(13));
const FIN = [];
for (const x of top.slice(0,6)) {
  const cfg = { tam:x.t, huecos:x.h, modo:"spy", plazo:x.ag, castigo: 0.5*H[x.k] };
  const T = M[x.k].banda(cfg), a = M[x.k].banda({...cfg,hasta:A}), b = M[x.k].banda({...cfg,desdeD:B});
  const q = M[x.k].simular({...cfg, capital:60000});
  FIN.push({ x, T, a, b, q });
  console.log("  " + (x.k.replace("|","%×")+"d "+x.h+"×"+(100*x.t).toFixed(0)+"% ag"+x.ag).padEnd(24) +
    (q.invertido.toFixed(0)+"%").padStart(6) + (T.a.toFixed(1)+"%").padStart(9) +
    ("−"+T.c.toFixed(0)+"%").padStart(8) + T.s.toFixed(2).padStart(8) +
    a.s.toFixed(2).padStart(9) + b.s.toFixed(2).padStart(9) +
    (q.ops/10.6).toFixed(1).padStart(9) + D(q.final).padStart(13)); }
console.log("  " + "comprar SPY y dormir".padEnd(24) + "100%".padStart(6) + (spy1.cagr.toFixed(1)+"%").padStart(9) +
  ("−"+spy1.caida.toFixed(0)+"%").padStart(8) + spy1.sharpe.toFixed(2).padStart(8) + "".padStart(18) +
  "—".padStart(9) + D(spy1.final).padStart(13));
console.log("");

// ── castigo máximo sobre la ganadora ──
const g = FIN[0];
console.log("  ══ 3 · LA GANADORA, ESTRUJADA ══  " + g.x.k.replace("|","% dentro × ") + "d, " +
  g.x.h + " huecos al " + (100*g.x.t).toFixed(0) + "%, aguante " + g.x.ag + " días");
console.log("");
console.log("  " + "castigo de ejecución".padEnd(26) + "al año".padStart(9) + "caída".padStart(8) +
  "Sharpe".padStart(8) + "2016-20".padStart(9) + "2021-26".padStart(9));
for (const [nom,c] of [["cotizado (sin castigo)",0],["+ media horquilla",0.5],["+ una horquilla",1],["+ dos horquillas",2]]) {
  const cfg = { tam:g.x.t, huecos:g.x.h, modo:"spy", plazo:g.x.ag, castigo: c*H[g.x.k] };
  const T = M[g.x.k].banda(cfg), a = M[g.x.k].banda({...cfg,hasta:A}), b = M[g.x.k].banda({...cfg,desdeD:B});
  console.log("  " + nom.padEnd(26) + (T.a.toFixed(1)+"%").padStart(9) + ("−"+T.c.toFixed(0)+"%").padStart(8) +
    T.s.toFixed(2).padStart(8) + a.s.toFixed(2).padStart(9) + b.s.toFixed(2).padStart(9)); }
console.log("");
console.log("  ── año a año ──");
console.log("  " + "año".padEnd(7) + "la cuenta".padStart(13) + "% del año".padStart(11) + "peor caída".padStart(12) + "ops".padStart(6));
for (const y of ["2016","2017","2018","2019","2020","2021","2022","2023","2024","2025","2026"]) {
  const idx = M[g.x.k].DD.map((d,i)=>[d,i]).filter(([d])=>d.startsWith(y)).map(([,i])=>i);
  if (!idx.length) continue;
  const v0 = idx[0]===0?60000:g.q.V[idx[0]-1], v1 = g.q.V[idx[idx.length-1]];
  let pk=v0,pr=0; for(const i of idx){if(g.q.V[i]>pk)pk=g.q.V[i]; const d=1-g.q.V[i]/pk; if(d>pr)pr=d;}
  console.log("  " + y.padEnd(7) + D(v1).padStart(13) +
    (((v1/v0-1)>=0?"+":"−")+Math.abs(100*(v1/v0-1)).toFixed(0)+"%").padStart(11) +
    ("−"+(100*pr).toFixed(0)+"%").padStart(12) + String(g.q.tom.filter(o=>o.y===y).length).padStart(6)); }
console.log("");
