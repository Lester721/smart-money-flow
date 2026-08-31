// ══ EL DISPARADOR RELATIVO ══ Lester, 2026-08-28: «no es destruir, es construir».
//
// ═══ DE DÓNDE SALE ESTA IDEA ═══════════════════════════════════════════════════════════════
//
// r120 midió que el libro tiene beta 3,11 contra SPY y R²=65%: la cartera es UNA apuesta
// repetida. r121 intentó arreglarlo por fuera (topes de entradas al mes) y NO replicó:
// el pico en «máx 2/mes» tenía vecinos 20 puntos de Sharpe por debajo, y daba 41,3% en
// 2016-2020 contra 8,0% en 2021-2026. Casilla afortunada, retirada.
//
// Pero el mecanismo quedó claro y no se ha tocado: EL DISPARADOR ESTÁ MIDIENDO EL MERCADO.
// «la acción por debajo de su media de 20 días» se cumple en TODAS las acciones el mismo día,
// porque lo que ha caído es el índice. Por eso los 6 huecos se llenan juntos y mueren juntos.
//
// Aquí se cambia el disparador por uno RELATIVO: la acción tiene que estar débil
// CONTRA EL MERCADO, no contra sí misma.
//        maRel = (acción vs su media de 20d) − (SPY vs su media de 20d)
// El día de pánico general maRel ≈ 0 para todos y no dispara nada. Sólo dispara cuando
// una acción se queda atrás de verdad. Eso reparte las entradas sin ningún tope artificial.
//
// ═══ CÓMO SE MIDE PARA NO REPETIR LO DE r121 ═══════════════════════════════════════════════
// Las dos mitades SE ENSEÑAN DESDE EL PRIMER MOMENTO, no al final. Si un umbral sólo funciona
// en una, se dice ahí mismo y no se sigue. Y el listón no es cero: es COMPRAR SPY.
import { simular, banda, spyApalancado, OPS, SPY, DD, ANOS, D, pct, med } from "./motor-cartera.mjs";

// ── la media de 20 días de SPY, con los mismos días de negociación que usa el motor ──
const iDD = new Map(DD.map((d, i) => [d, i]));
const maSPY = new Map();
for (let i = 20; i < DD.length; i++) {
  const p = DD.slice(i - 20, i).map((d) => SPY[d]);
  maSPY.set(DD[i], SPY[DD[i]] / (p.reduce((a, b) => a + b, 0) / p.length) - 1); }

// maRel de cada entrada. Se escribe en el propio OPS: el motor ordena por `ma`, así que
// para probar el disparador relativo hay que reescribir ese campo (y guardar el original).
for (const o of OPS) { o.maAbs = o.ma; o.maRel = o.ma - (maSPY.get(o.dC) ?? 0); }

const spy1 = spyApalancado(1);
const A = "20201231", B = "20210101";
const spyA = (() => { const d = DD.filter((x) => x <= A); const n = (Date.parse("2020-12-31") - Date.parse("2016-01-04")) / (365.25*86400000);
  let pi = 0, pe = 0; for (const x of d) { if (SPY[x] > pi) pi = SPY[x]; const q = 1 - SPY[x]/pi; if (q > pe) pe = q; }
  return { a: 100*(Math.pow(SPY[d[d.length-1]]/SPY[d[0]] * Math.pow(1.013, n), 1/n) - 1), c: 100*pe }; })();
const spyB = (() => { const d = DD.filter((x) => x >= B); const n = (Date.parse("2026-08-19") - Date.parse("2021-01-01")) / (365.25*86400000);
  let pi = 0, pe = 0; for (const x of d) { if (SPY[x] > pi) pi = SPY[x]; const q = 1 - SPY[x]/pi; if (q > pe) pe = q; }
  return { a: 100*(Math.pow(SPY[d[d.length-1]]/SPY[d[0]] * Math.pow(1.013, n), 1/n) - 1), c: 100*pe }; })();

console.log("");
console.log("  ══ AUDIT ══");
console.log("  período: " + DD[0] + " → " + DD[DD.length - 1] + "  ·  entradas: " + OPS.length.toLocaleString("en-US"));
console.log("");
console.log("  EL LISTÓN, y hay uno por mitad:");
console.log("    2016-2026  comprar SPY: " + spy1.cagr.toFixed(1) + "% al año, caída −" + spy1.caida.toFixed(0) + "%, Sharpe " + spy1.sharpe.toFixed(2));
console.log("    2016-2020  comprar SPY: " + spyA.a.toFixed(1) + "% al año, caída −" + spyA.c.toFixed(0) + "%");
console.log("    2021-2026  comprar SPY: " + spyB.a.toFixed(1) + "% al año, caída −" + spyB.c.toFixed(0) + "%");
console.log("");

// ── ¿DE VERDAD SE AMONTONAN? el hecho que motiva todo esto, medido ────────────────────────
console.log("  ══ 0 · ¿SE AMONTONAN LAS ENTRADAS? ══  (el hecho que motiva el cambio)");
const conMA = OPS.filter((o) => maSPY.has(o.dC));
const enPanico = conMA.filter((o) => (maSPY.get(o.dC) ?? 0) < 0).length;
console.log("  entradas disparadas un día con SPY BAJO SU PROPIA media: " +
  (100 * enPanico / conMA.length).toFixed(0) + "%  (" + enPanico.toLocaleString("en-US") + " de " + conMA.length.toLocaleString("en-US") + ")");
const porDia = new Map();
for (const o of conMA) porDia.set(o.dC, (porDia.get(o.dC) || 0) + 1);
const cuentas = [...porDia.values()].sort((a, b) => b - a);
console.log("  días con al menos una señal: " + porDia.size.toLocaleString("en-US") + " de " + DD.length.toLocaleString("en-US"));
console.log("  señales el día más cargado: " + cuentas[0] + "  ·  mediana de los días con señal: " + cuentas[Math.floor(cuentas.length/2)]);
const q1 = OPS.filter((o) => o.maRel < 0).length;
console.log("  con el disparador RELATIVO quedarían " + q1.toLocaleString("en-US") + " entradas (" +
  (100 * q1 / OPS.length).toFixed(0) + "% de las de ahora)");
console.log("");

// ── EL BARRIDO DEL UMBRAL, con las dos mitades DESDE EL PRIMER MOMENTO ────────────────────
console.log("  ══ 1 · EL UMBRAL RELATIVO, Y LAS DOS MITADES A LA VEZ ══");
console.log("  (6 huecos al 15%, el ocioso en SPY; sólo cambia qué entradas se admiten)");
console.log("");
const UMB = [0.00, -0.01, -0.02, -0.03, -0.05, -0.08];
function conFiltro(f) { const G = OPS.filter(f); const M = new Map();
  for (const o of G) { if (!M.has(o.dC)) M.set(o.dC, []); M.get(o.dC).push(o); } return G; }
console.log("  " + "disparador".padEnd(22) + "TODO".padStart(24) + "2016-2020".padStart(24) + "2021-2026".padStart(24));
console.log("  " + " ".repeat(22) + "al año  caída  Sh   ops".padStart(24) + "al año  caída  Sh".padStart(24) + "al año  caída  Sh".padStart(24));
const guarda = OPS.map((o) => o.ma);
function fila(nombre, sel) {
  for (let i = 0; i < OPS.length; i++) OPS[i].ma = sel(OPS[i]) ? OPS[i].maRel : 999;   // 999 = no elegible
  const T = banda({ tam: 0.15, huecos: 6, modo: "spy" });
  const qA = banda({ tam: 0.15, huecos: 6, modo: "spy", hasta: A });
  const qB = banda({ tam: 0.15, huecos: 6, modo: "spy", desdeD: B });
  const q = simular({ tam: 0.15, huecos: 6, modo: "spy" });
  console.log("  " + nombre.padEnd(22) +
    ((T.a.toFixed(1)+"%").padStart(7) + ("−"+T.c.toFixed(0)+"%").padStart(7) + T.s.toFixed(2).padStart(5) + String(q.ops).padStart(5)).padStart(24) +
    ((qA.a.toFixed(1)+"%").padStart(7) + ("−"+qA.c.toFixed(0)+"%").padStart(7) + qA.s.toFixed(2).padStart(5)).padStart(24) +
    ((qB.a.toFixed(1)+"%").padStart(7) + ("−"+qB.c.toFixed(0)+"%").padStart(7) + qB.s.toFixed(2).padStart(5)).padStart(24)); }
// referencia: el disparador de ahora, absoluto
for (let i = 0; i < OPS.length; i++) OPS[i].ma = guarda[i];
{ const T = banda({ tam: 0.15, huecos: 6, modo: "spy" });
  const qA = banda({ tam: 0.15, huecos: 6, modo: "spy", hasta: A });
  const qB = banda({ tam: 0.15, huecos: 6, modo: "spy", desdeD: B });
  const q = simular({ tam: 0.15, huecos: 6, modo: "spy" });
  console.log("  " + "el de ahora (absoluto)".padEnd(22) +
    ((T.a.toFixed(1)+"%").padStart(7) + ("−"+T.c.toFixed(0)+"%").padStart(7) + T.s.toFixed(2).padStart(5) + String(q.ops).padStart(5)).padStart(24) +
    ((qA.a.toFixed(1)+"%").padStart(7) + ("−"+qA.c.toFixed(0)+"%").padStart(7) + qA.s.toFixed(2).padStart(5)).padStart(24) +
    ((qB.a.toFixed(1)+"%").padStart(7) + ("−"+qB.c.toFixed(0)+"%").padStart(7) + qB.s.toFixed(2).padStart(5)).padStart(24)); }
for (const u of UMB) fila("relativo < " + (100*u).toFixed(0) + "%", (o) => o.maRel < u);
console.log("");
