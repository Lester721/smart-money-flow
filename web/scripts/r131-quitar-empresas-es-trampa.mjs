// ══ ¿QUITAR LAS 25 EMPRESAS ES TRAMPA? ══ Lester, 2026-08-29:
//   «¿con qué atributo o característica sabes qué empresas debes remover de antemano?»
//
// ═══ LA ACUSACIÓN, Y ES JUSTA ══════════════════════════════════════════════════════════════
// r123 dijo: quitar las 25 empresas y dejar SPY/QQQ baja la caída de −84% a −41% al mismo
// dinero. Si «qué quitar» se decidió MIRANDO EL RESULTADO, el hallazgo no vale nada.
//
// Mi defensa era: el atributo es «índice o empresa», y eso se sabe el 4 de enero de 2016 sin
// mirar nada. Pero es una defensa DICHA, no MEDIDA. Aquí se mide, y puede salir en contra.
//
// ═══ LAS CUATRO PRUEBAS ════════════════════════════════════════════════════════════════════
//   1. ¿AGUANTA A TODOS LOS TAMAÑOS? el 2 huecos al 8% lo elegí yo barriendo. Si el orden
//      «índice > empresas» sólo aparece en mi casilla, es ajuste mío.
//   2. ¿ES CATEGORÍA O SON CUATRO MANZANAS PODRIDAS? se parten las 25 empresas en mitades
//      AL AZAR, 200 veces. Si «índice gana» sólo con ciertas mitades, es selección.
//   3. ¿DEPENDE DE UN TICKER? se quita cada uno, de uno en uno.
//   4. ¿ES «ÍNDICE» O ES «DIVERSIFICADO»? un cesto de las 25 empresas repartido en muchos
//      huecos pequeños también está diversificado y se sabe de antemano. Si ese cesto iguala
//      al índice, entonces el hallazgo NO es «quita las empresas», es «diversifica» — y eso
//      es otra frase, mucho menos bonita y mucho más honesta.
process.env.CAMINOS = "caminos-120d.json";
const { simular, banda, spyApalancado, OPS, DD, D, pct } = await import("./motor-cartera.mjs");

const IDX = new Set(["SPY", "QQQ"]);
const TODOS = [...new Set(OPS.map((o) => o.tk))].sort();
const EMPRESAS = TODOS.filter((t) => !IDX.has(t));
const g = OPS.map((o) => o.ma);
const marcar = (f) => { for (let i = 0; i < OPS.length; i++) OPS[i].ma = f(OPS[i]) ? g[i] : 999; };
const spy1 = spyApalancado(1);

console.log("");
console.log("  ══ AUDIT ══");
console.log("  tickers: " + TODOS.length + "  ·  índices: " + [...IDX].join(", ") +
  "  ·  empresas: " + EMPRESAS.length);
console.log("  EL LISTÓN — comprar SPY: " + spy1.cagr.toFixed(1) + "% al año · caída −" +
  spy1.caida.toFixed(0) + "% · Sharpe " + spy1.sharpe.toFixed(2));
console.log("");
console.log("  ⚠️ EL UNIVERSO DE 27 SE ELIGIÓ EN 2026 MIRANDO HACIA ATRÁS. No hay ninguna empresa");
console.log("     que quebrara ni que fuera excluida del índice. Ese sesgo favorece a las EMPRESAS,");
console.log("     no al índice — o sea que juega EN CONTRA de lo que se quiere demostrar aquí.");
console.log("");

// ── 1 · ¿AGUANTA A TODOS LOS TAMAÑOS? ─────────────────────────────────────────────────────
console.log("  ══ 1 · ¿SÓLO PASA EN LA CASILLA QUE YO ELEGÍ? ══");
console.log("");
console.log("  " + "huecos × tamaño".padEnd(20) + "SÓLO ÍNDICE".padStart(24) + "SÓLO EMPRESAS".padStart(24));
console.log("  " + " ".repeat(20) + "al año  caída  Sharpe".padStart(24) + "al año  caída  Sharpe".padStart(24));
let gana = 0, total = 0;
for (const [h, t] of [[1,0.08],[2,0.08],[2,0.12],[2,0.20],[3,0.10],[4,0.10],[4,0.15],[6,0.10],[6,0.15],[6,0.20],[8,0.10],[10,0.08]]) {
  marcar((o) => IDX.has(o.tk));
  const a = banda({ tam: t, huecos: h, modo: "spy" });
  marcar((o) => !IDX.has(o.tk));
  const b = banda({ tam: t, huecos: h, modo: "spy" });
  total++; if (a.s > b.s) gana++;
  const cel = (m) => ((m.a.toFixed(1)+"%").padStart(8) + ("−"+m.c.toFixed(0)+"%").padStart(8) + m.s.toFixed(2).padStart(8)).padStart(24);
  console.log("  " + (h + " × " + (100*t).toFixed(0) + "%").padEnd(20) + cel(a) + cel(b) +
    (a.s > b.s ? "  ✓" : "  ✗")); }
console.log("");
console.log("  el índice gana en Sharpe en " + gana + " de " + total + " tamaños  →  " +
  (gana >= total - 1 ? "NO es mi casilla ✓" : gana >= total * 0.7 ? "mayoritario, pero no limpio ⚠" : "ES MI CASILLA ⛔"));
console.log("");

// ── 2 · MITADES AL AZAR DE LAS 25 EMPRESAS ────────────────────────────────────────────────
console.log("  ══ 2 · ¿SON CUATRO MANZANAS PODRIDAS? ══  (200 mitades AL AZAR de las 25 empresas)");
console.log("");
marcar((o) => IDX.has(o.tk));
const refIdx = banda({ tam: 0.08, huecos: 2, modo: "spy" });
// generador reproducible: nada de Math.random, para que esto se pueda repetir igual
let sem = 20260829;
const rnd = () => { sem = (sem * 1103515245 + 12345) % 2147483648; return sem / 2147483648; };
const S = [], C = [];
for (let k = 0; k < 200; k++) {
  const mez = EMPRESAS.slice();
  for (let i = mez.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [mez[i], mez[j]] = [mez[j], mez[i]]; }
  const mitad = new Set(mez.slice(0, Math.floor(EMPRESAS.length / 2)));
  marcar((o) => mitad.has(o.tk));
  const q = simular({ tam: 0.15, huecos: 6, modo: "spy" });
  S.push(q.sharpe); C.push(q.caida); }
S.sort((a,b)=>a-b); C.sort((a,b)=>a-b);
console.log("  Sharpe de una mitad AL AZAR de las empresas (6 huecos al 15%):");
console.log("    peor " + S[0].toFixed(2) + "  ·  p25 " + S[49].toFixed(2) + "  ·  MEDIANA " + S[99].toFixed(2) +
  "  ·  p75 " + S[149].toFixed(2) + "  ·  mejor " + S[199].toFixed(2));
console.log("  caída de esas mismas mitades:");
console.log("    mejor −" + C[0].toFixed(0) + "%  ·  MEDIANA −" + C[99].toFixed(0) + "%  ·  peor −" + C[199].toFixed(0) + "%");
console.log("");
console.log("  sólo índice (2 huecos al 8%): Sharpe " + refIdx.s.toFixed(2) + " · caída −" + refIdx.c.toFixed(0) + "%");
const mejores = S.filter((x) => x >= refIdx.s).length;
console.log("  mitades de empresas que igualan o superan al índice: " + mejores + " de 200  (" +
  (100*mejores/200).toFixed(0) + "%)");
console.log("");

// ── 3 · QUITAR UN TICKER DE UNO EN UNO ────────────────────────────────────────────────────
console.log("  ══ 3 · ¿DEPENDE DE UN SOLO TICKER? ══  (sólo índice, quitando uno de los dos)");
console.log("");
for (const [nom, sel, h] of [["SPY + QQQ", (o) => IDX.has(o.tk), 2],
                             ["sólo SPY", (o) => o.tk === "SPY", 1],
                             ["sólo QQQ", (o) => o.tk === "QQQ", 1]]) {
  marcar(sel);
  const b = banda({ tam: 0.08, huecos: h, modo: "spy" });
  const A = banda({ tam: 0.08, huecos: h, modo: "spy", hasta: "20201231" });
  const B = banda({ tam: 0.08, huecos: h, modo: "spy", desdeD: "20210101" });
  console.log("  " + nom.padEnd(14) + (b.a.toFixed(1)+"%").padStart(8) + ("−"+b.c.toFixed(0)+"%").padStart(7) +
    b.s.toFixed(2).padStart(7) + "     2016-20: " + A.s.toFixed(2) + "   2021-26: " + B.s.toFixed(2)); }
console.log("");

// ── 4 · ¿ES «ÍNDICE» O ES «DIVERSIFICADO»? ────────────────────────────────────────────────
console.log("  ══ 4 · LA PRUEBA QUE DECIDE ══  un CESTO de las 25 empresas también está diversificado");
console.log("     y también se sabe de antemano. Si iguala al índice, el hallazgo no es «quita");
console.log("     las empresas» — es «diversifica», que es otra frase.");
console.log("");
console.log("  " + "estructura".padEnd(30) + "expuesto".padStart(10) + "al año".padStart(9) +
  "caída".padStart(8) + "Sharpe".padStart(8) + "ops".padStart(6));
for (const [nom, sel, h, t] of [
  ["sólo índice, 2 × 8%",        (o) => IDX.has(o.tk), 2, 0.08],
  ["25 empresas, 6 × 15%",       (o) => !IDX.has(o.tk), 6, 0.15],
  ["25 empresas, 10 × 3%",       (o) => !IDX.has(o.tk), 10, 0.03],
  ["25 empresas, 15 × 2%",       (o) => !IDX.has(o.tk), 15, 0.02],
  ["25 empresas, 20 × 1,5%",     (o) => !IDX.has(o.tk), 20, 0.015],
  ["25 empresas, 25 × 1%",       (o) => !IDX.has(o.tk), 25, 0.01],
  ["25 empresas, 20 × 0,5%",     (o) => !IDX.has(o.tk), 20, 0.005]]) {
  marcar(sel);
  const b = banda({ tam: t, huecos: h, modo: "spy" });
  const q = simular({ tam: t, huecos: h, modo: "spy" });
  console.log("  " + nom.padEnd(30) + (q.invertido.toFixed(0)+"%").padStart(10) + (b.a.toFixed(1)+"%").padStart(9) +
    ("−"+b.c.toFixed(0)+"%").padStart(8) + b.s.toFixed(2).padStart(8) + String(q.ops).padStart(6)); }
console.log("  " + "comprar SPY y dormir".padEnd(30) + "100%".padStart(10) + (spy1.cagr.toFixed(1)+"%").padStart(9) +
  ("−"+spy1.caida.toFixed(0)+"%").padStart(8) + spy1.sharpe.toFixed(2).padStart(8));
console.log("");
