// ══ LA PIEZA QUE SOBREVIVE ══ Lester, 2026-08-28: «no es destruir, es construir».
//
// ═══ LO QUE LAS TRES MEDICIONES DE HOY DEJAN EN PIE ════════════════════════════════════════
//
//   r120: el libro tiene beta 3,11 contra SPY, R²=65% y alfa ≈ 0 (t=−0,60).
//         Cubrir la beta deja EXACTAMENTE el rendimiento del aparcadero: debajo no hay nada.
//   r121: repartir las entradas por tope mensual → no replica (41,3% vs 8,0% entre mitades).
//   r122: disparador relativo al mercado → ningún umbral monótono, todos por debajo de SPY.
//
// Queda UNA cosa medida y en pie: LA CONVEXIDAD.
//   beta 3,17 los días que SPY sube · 2,83 los días que baja
//   sesgo mensual +0,11 contra −0,37 de un SPY apalancado a la misma caída
//   mejor mes +36% contra +27% · peor mes −24% contra −27%
//
// ═══ LO QUE ESO IMPLICA, Y ES LO QUE SE PRUEBA AQUÍ ════════════════════════════════════════
//
// Si el alfa de elegir acciones es CERO pero la convexidad es real, entonces los 25 nombres
// sueltos están metiendo varianza a cambio de nada: riesgo de empresa sin prima por él.
// La forma limpia de cobrar la convexidad sin pagar ese riesgo es comprarla SOBRE EL ÍNDICE.
//
// Esto NO es «aparcar en SPY» (eso es el efectivo ocioso y sigue siendo un suplemento).
// Es una pregunta sobre EL INSTRUMENTO: ¿la call sobre índice o la call sobre la empresa?
// Y tiene una respuesta que puede salir en contra, que es lo que la hace una prueba.
import { simular, banda, spyApalancado, OPS, SPY, DD, D, pct } from "./motor-cartera.mjs";

const spy1 = spyApalancado(1);
const A = "20201231", B = "20210101";
const IDX = new Set(["SPY", "QQQ"]);
const guarda = OPS.map((o) => o.ma);
const restaurar = () => { for (let i = 0; i < OPS.length; i++) OPS[i].ma = guarda[i]; };
const soloEstos = (f) => { for (let i = 0; i < OPS.length; i++) OPS[i].ma = f(OPS[i]) ? guarda[i] : 999; };

console.log("");
console.log("  ══ AUDIT ══");
console.log("  entradas: " + OPS.length.toLocaleString("en-US") + "  ·  de índice (SPY/QQQ): " +
  OPS.filter((o) => IDX.has(o.tk)).length.toLocaleString("en-US") +
  "  ·  de empresa: " + OPS.filter((o) => !IDX.has(o.tk)).length.toLocaleString("en-US"));
console.log("  EL LISTÓN — comprar SPY y dormir: " + spy1.cagr.toFixed(1) + "% al año, caída −" +
  spy1.caida.toFixed(0) + "%, Sharpe " + spy1.sharpe.toFixed(2));
console.log("");

// ── ¿APORTA ALGO ELEGIR EMPRESAS? ─────────────────────────────────────────────────────────
console.log("  ══ 1 · ¿APORTA ALGO ELEGIR EMPRESAS? ══  (6 huecos al 15%, el ocioso en SPY)");
console.log("");
console.log("  " + "universo".padEnd(24) + "TODO".padStart(26) + "2016-2020".padStart(22) + "2021-2026".padStart(22));
console.log("  " + " ".repeat(24) + "al año  caída   Sh   ops".padStart(26) + "al año  caída   Sh".padStart(22) + "al año  caída   Sh".padStart(22));
function linea(nombre, sel, huecos = 6, tam = 0.15) {
  soloEstos(sel);
  const T = banda({ tam, huecos, modo: "spy" });
  const qA = banda({ tam, huecos, modo: "spy", hasta: A });
  const qB = banda({ tam, huecos, modo: "spy", desdeD: B });
  const q = simular({ tam, huecos, modo: "spy" });
  console.log("  " + nombre.padEnd(24) +
    ((T.a.toFixed(1)+"%").padStart(7) + ("−"+T.c.toFixed(0)+"%").padStart(7) + T.s.toFixed(2).padStart(6) + String(q.ops).padStart(6)).padStart(26) +
    ((qA.a.toFixed(1)+"%").padStart(7) + ("−"+qA.c.toFixed(0)+"%").padStart(7) + qA.s.toFixed(2).padStart(6)).padStart(22) +
    ((qB.a.toFixed(1)+"%").padStart(7) + ("−"+qB.c.toFixed(0)+"%").padStart(7) + qB.s.toFixed(2).padStart(6)).padStart(22));
  return { T, qA, qB, q }; }
linea("los 27 (como ahora)", () => true);
linea("sólo empresas (25)", (o) => !IDX.has(o.tk));
linea("sólo índice (SPY+QQQ)", (o) => IDX.has(o.tk), 2, 0.30);
linea("sólo índice, 2 al 20%", (o) => IDX.has(o.tk), 2, 0.20);
linea("sólo índice, 2 al 12%", (o) => IDX.has(o.tk), 2, 0.12);
linea("sólo índice, 2 al 8%", (o) => IDX.has(o.tk), 2, 0.08);
console.log("");

// ── LA FRONTERA DEL ÍNDICE CONTRA EL LISTÓN ───────────────────────────────────────────────
console.log("  ══ 2 · LA FRONTERA ══  ¿le gana a comprar SPY, y a SPY a crédito?");
console.log("");
const FSPY = []; for (let L = 1; L <= 3.01; L += 0.05) { const r = spyApalancado(L); FSPY.push({ L: Math.round(L*100)/100, a: r.cagr, c: r.caida, s: r.sharpe }); }
const mejorEn = (p, o) => { const ok = p.filter((x) => x.c <= o); return ok.length ? ok.sort((a,b)=>b.a-a.a)[0] : null; };
const REJ = [];
for (const h of [1, 2]) for (let tm = 0.04; tm <= 0.401; tm += 0.02) REJ.push([h, Math.round(tm*1000)/1000]);
const conjuntos = [["los 27", () => true], ["sólo empresas", (o) => !IDX.has(o.tk)], ["sólo índice", (o) => IDX.has(o.tk)]];
const PT = {};
for (const [nom, sel] of conjuntos) {
  soloEstos(sel);
  const rej = nom === "sólo índice" ? REJ : [];
  const base = nom === "sólo índice" ? rej : [];
  const lista = nom === "sólo índice" ? REJ : [[4,0.04],[6,0.04],[6,0.06],[8,0.06],[6,0.08],[10,0.08],[6,0.10],[8,0.12],[6,0.15],[10,0.15],[6,0.20],[4,0.25]];
  PT[nom] = lista.map(([h, tm]) => ({ h, tm, ...banda({ tam: tm, huecos: h, modo: "spy" }) })); }
const OBJ = [25, 30, 40, 50, 60];
console.log("  " + "".padEnd(18) + OBJ.map((o) => ("caída ≤" + o + "%").padStart(12)).join(""));
for (const [nom] of conjuntos) {
  let l = "  " + nom.padEnd(18);
  for (const o of OBJ) { const x = mejorEn(PT[nom], o); l += (x ? x.a.toFixed(1)+"%" : "—").padStart(12); }
  console.log(l); }
let l = "  " + "SPY a crédito".padEnd(18);
for (const o of OBJ) { const x = mejorEn(FSPY, o); l += (x ? x.a.toFixed(1)+"%" : "—").padStart(12); }
console.log(l);
console.log("  " + "SPY y dormir".padEnd(18) + (spy1.cagr.toFixed(1)+"%").padStart(12) + "   (su caída: −" + spy1.caida.toFixed(0) + "%)");
console.log("");
console.log("  mejor Sharpe de cada universo:");
for (const [nom] of conjuntos) { const x = PT[nom].slice().sort((a,b)=>b.s-a.s)[0];
  console.log("    " + nom.padEnd(18) + x.s.toFixed(2) + "   (" + x.h + " huecos al " + (100*x.tm).toFixed(0) +
    "%, " + x.a.toFixed(1) + "% al año, caída −" + x.c.toFixed(0) + "%)"); }
console.log("    " + "SPY y dormir".padEnd(18) + spy1.sharpe.toFixed(2) + "   ← el listón");
console.log("");
restaurar();
