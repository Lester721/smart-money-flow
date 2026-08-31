// ══════════════════════════════════════════════════════════════════════════════════════════
// EJECUTOR DEL EXAMEN DEL GRUPO A
// ══════════════════════════════════════════════════════════════════════════════════════════
//
// NO decide nada: sólo aplica lo que ya está firmado en EXAMEN-grupo-A.mjs. Los criterios se
// leen de allí, no se escriben aquí, para que no se puedan mover mirando el resultado.
//
// La banda de capitales se escribe AQUÍ y no se usa `banda()` del motor: el motor promedia 21
// capitales con paso 0,83% y el examen congelado exige **41 con paso 0,5%**. Usar la del motor
// sería correr un examen distinto del que se firmó.
//
// El umbral se aplica marcando con 999 lo que no es elegible — que es como el motor lo entiende
// (línea 110: `if (x.ma >= 0) continue`). Se guarda el `ma` original y se restaura entre
// corridas, porque si no la segunda corrida hereda el filtro de la primera y todo sale igual.
import { REGLA, CRITERIOS, GRUPO_A } from "./EXAMEN-grupo-A.mjs";
process.env.CAMINOS = "caminos-A.json";
const M = await import("./motor-cartera.mjs");

const MA0 = M.OPS.map((o) => o.ma);                       // el original, intacto

function conUmbral(u) {                                    // u = 0, −0,03, …
  for (let i = 0; i < M.OPS.length; i++) {
    const g = MA0[i];
    M.OPS[i].ma = (g >= u || g < REGLA.descarteRoto) ? 999 : g;
  }
}
const CFG = { tam: REGLA.tam, huecos: REGLA.huecos, modo: REGLA.ocioso,
              plazo: REGLA.aguante, castigo: REGLA.castigo,
              suelo: REGLA.suelo, topeGanancia: REGLA.topeGanancia, arrastre: REGLA.arrastre,
              costeMin: REGLA.costeMin };

// las 41 bandas del examen: 60.000 × (1 + (i−20) × 0,005)
function banda41() {
  const A = [], C = [], S = [], O = [];
  for (let i = 0; i < REGLA.bandas; i++) {
    const q = M.simular({ ...CFG, capital: REGLA.capital * (1 + (i - 20) * 0.005) });
    A.push(q.cagr); C.push(q.caida); S.push(q.sharpe); O.push(q.ops);
  }
  return { a: M.med(A), c: M.med(C), s: M.med(S), ops: M.med(O) };
}
function correr(u) { conUmbral(u); return banda41(); }

// ── AUDIT antes de mirar nada ─────────────────────────────────────────────────────────────
const tks = [...new Set(M.OPS.map((o) => o.tk))].sort();
const fchs = M.OPS.map((o) => o.dC).sort();
const spy = M.spyApalancado(1);
console.log("");
console.log("  ══ AUDIT ══");
console.log("  entradas: " + M.OPS.length.toLocaleString("en-US") +
            "   ·   tickers con datos: " + tks.length + " de " + GRUPO_A.length);
console.log("  período: " + fchs[0] + " → " + fchs[fchs.length - 1] +
            "   ·   días de mercado: " + M.DD.length);
console.log("  sin datos: " + GRUPO_A.filter((t) => !tks.includes(t)).join(" ") || "(ninguno)");
console.log("  control comprar SPY: " + spy.cagr.toFixed(1) + "% al año · caída −" +
            spy.caida.toFixed(0) + "% · Sharpe " + spy.sharpe.toFixed(2));
if (Math.abs(spy.cagr - 14.9) > 0.3) {
  console.log("  ⛔ SPY no cuadra con el fichero de los 27 (14,9%). No sigo."); process.exit(1); }
console.log("  ✓ SPY cuadra con el fichero de los 27");

// ── EL EXAMEN ─────────────────────────────────────────────────────────────────────────────
const ctrl = correr(0);
const hip  = correr(REGLA.umbral);

console.log("");
console.log("  ══ EL EXAMEN ══   (mediana de " + REGLA.bandas + " capitales de partida)");
console.log("");
console.log("  " + "".padEnd(34) + "al año".padStart(9) + "caída".padStart(9) +
            "Sharpe".padStart(9) + "ops".padStart(7));
const fila = (n, r) => console.log("  " + n.padEnd(34) +
  (r.a.toFixed(1) + "%").padStart(9) + ("−" + r.c.toFixed(0) + "%").padStart(9) +
  r.s.toFixed(2).padStart(9) + String(Math.round(r.ops)).padStart(7));
fila("control · sólo bajo la media", ctrl);
fila("HIPÓTESIS · más de 3% debajo", hip);
fila("comprar SPY y dormir", { a: spy.cagr, c: spy.caida, s: spy.sharpe, ops: 0 });

// ── EL BARRIDO (no decide; sirve para ver si la FORMA se parece a la de los 27) ────────────
console.log("");
console.log("  ══ el barrido del umbral — NO decide, sólo enseña la forma ══");
console.log("  " + "umbral".padEnd(12) + "al año".padStart(9) + "caída".padStart(9) +
            "Sharpe".padStart(9) + "ops".padStart(7));
for (const u of [0, -0.01, -0.02, -0.03, -0.04, -0.05, -0.06]) {
  const r = correr(u);
  console.log("  " + (u === 0 ? "sólo debajo" : (100 * u).toFixed(0) + "%").padEnd(12) +
    (r.a.toFixed(1) + "%").padStart(9) + ("−" + r.c.toFixed(0) + "%").padStart(9) +
    r.s.toFixed(2).padStart(9) + String(Math.round(r.ops)).padStart(7) +
    (u === REGLA.umbral ? "   ← la firmada" : ""));
}

// ── EL VEREDICTO ──────────────────────────────────────────────────────────────────────────
const c1 = hip.s >= ctrl.s + CRITERIOS.margenSharpe;
const c2 = hip.a > spy.cagr;
const cN = hip.ops >= CRITERIOS.minOperaciones;
console.log("");
console.log("  ══ VEREDICTO ══");
console.log("  (1) Sharpe ≥ control + " + CRITERIOS.margenSharpe + " ......... " +
  hip.s.toFixed(2) + " contra " + (ctrl.s + CRITERIOS.margenSharpe).toFixed(2) +
  "   " + (c1 ? "✓ SÍ" : "✗ NO"));
console.log("  (2) bate a comprar SPY ................. " +
  hip.a.toFixed(1) + "% contra " + spy.cagr.toFixed(1) + "%   " + (c2 ? "✓ SÍ" : "✗ NO"));
console.log("  (—) muestra suficiente (≥" + CRITERIOS.minOperaciones + " ops) ....... " +
  Math.round(hip.ops) + "   " + (cN ? "✓ sí" : "✗ NO — nada de esto decide"));
console.log("");
console.log("  ►►► " + (c1 && c2 && cN ? "APRUEBA" : "SUSPENDE") +
  (c1 && c2 && cN ? "" : "  — el umbral del 3% se RETIRA. No se ajusta."));
console.log("");
