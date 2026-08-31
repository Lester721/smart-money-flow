// ══ ¿EL MÍNIMO DE $5.000 APORTA ALGO? — LA MEDICIÓN ══
//
// Corre sobre `sincoste-p25-d400.json` (r165: idéntico al publicado salvo COSTE_MIN=0), con la
// regla congelada de LA PALANCA, y enciende el filtro AL MEDIR. Mismas operaciones en todas las
// filas: lo único que cambia es cuáles se dejan pasar.
//
// Se lee el BARRIDO ENTERO, no una casilla. Una casilla ganadora con vecinas malas es ruido —
// es lo que mató seis hallazgos el 29 de agosto.
process.env.CAMINOS = "sincoste-p25-d400.json";
const M = await import("./motor-cartera.mjs");

const CAST = 0.5 * 0.0276, CAP = 60000;
const MA0 = M.OPS.map((o) => o.ma);
for (let i = 0; i < M.OPS.length; i++)                      // la regla publicada: bajo la media
  M.OPS[i].ma = (MA0[i] >= 0 || MA0[i] < -0.30) ? 999 : MA0[i];

const BASE = { tam: 0.12, huecos: 2, modo: "spy", plazo: 120, castigo: CAST, suelo: 0.50 };
function banda(costeMin) {                                   // 41 capitales, como el examen
  const A = [], C = [], S = [], O = [];
  for (let i = 0; i < 41; i++) {
    const q = M.simular({ ...BASE, costeMin, capital: CAP * (1 + (i - 20) * 0.005) });
    A.push(q.cagr); C.push(q.caida); S.push(q.sharpe); O.push(q.ops); }
  return { a: M.med(A), c: M.med(C), s: M.med(S), o: M.med(O) }; }

// ── AUDIT ─────────────────────────────────────────────────────────────────────────────────
const cos = M.OPS.map((o) => o.coste).sort((a, b) => a - b);
const spy = M.spyApalancado(1);
console.log("");
console.log("  ══ AUDIT ══");
console.log("  entradas: " + M.OPS.length.toLocaleString("en-US") +
  "   ·   tickers: " + new Set(M.OPS.map((o) => o.tk)).size);
console.log("  coste del contrato:  p10 $" + Math.round(cos[Math.floor(cos.length*0.1)]).toLocaleString("en-US") +
  "   mediana $" + Math.round(cos[Math.floor(cos.length/2)]).toLocaleString("en-US") +
  "   p90 $" + Math.round(cos[Math.floor(cos.length*0.9)]).toLocaleString("en-US"));
console.log("  por debajo de $5.000: " + (100 * cos.filter((x) => x < 5000).length / cos.length).toFixed(0) +
  "% de las entradas   ← esto es lo que el filtro tiraba");
console.log("  comprar SPY: " + spy.cagr.toFixed(1) + "% al año · caída −" + spy.caida.toFixed(0) +
  "% · Sharpe " + spy.sharpe.toFixed(2));
if (Math.abs(spy.cagr - 14.9) > 0.3) { console.log("  ⛔ SPY no cuadra. No sigo."); process.exit(1); }
console.log("  ✓ SPY cuadra");

// ── EL BARRIDO ────────────────────────────────────────────────────────────────────────────
console.log("");
console.log("  ══ EL MÍNIMO DE COSTE, ENCENDIDO Y APAGADO ══  (mediana de 41 capitales)");
console.log("");
console.log("  " + "mínimo".padEnd(14) + "al año".padStart(9) + "caída".padStart(9) +
  "Sharpe".padStart(9) + "ops".padStart(7));
const R = [];
for (const c of [0, 1000, 2000, 3000, 4000, 5000, 6000, 7500, 10000, 15000]) {
  const r = banda(c); R.push([c, r]);
  console.log("  " + (c === 0 ? "sin mínimo" : "$" + c.toLocaleString("en-US")).padEnd(14) +
    (r.a.toFixed(1) + "%").padStart(9) + ("−" + r.c.toFixed(0) + "%").padStart(9) +
    r.s.toFixed(2).padStart(9) + String(Math.round(r.o)).padStart(7) +
    (c === 5000 ? "   ← el que publiqué" : "")); }

// ── VEREDICTO ─────────────────────────────────────────────────────────────────────────────
const sin = R[0][1], cinco = R.find(([c]) => c === 5000)[1];
const mejorS = R.reduce((a, b) => (b[1].s > a[1].s ? b : a));
const dS = cinco.s - sin.s, dA = cinco.a - sin.a;
console.log("");
console.log("  ══ VEREDICTO ══");
console.log("  sin mínimo ....... " + sin.a.toFixed(1) + "% · −" + sin.c.toFixed(0) + "% · Sharpe " + sin.s.toFixed(2) + " · " + Math.round(sin.o) + " ops");
console.log("  con $5.000 ....... " + cinco.a.toFixed(1) + "% · −" + cinco.c.toFixed(0) + "% · Sharpe " + cinco.s.toFixed(2) + " · " + Math.round(cinco.o) + " ops");
console.log("  diferencia ....... " + (dA >= 0 ? "+" : "") + dA.toFixed(1) + " puntos al año   ·   Sharpe " + (dS >= 0 ? "+" : "") + dS.toFixed(2));
console.log("  el mejor del barrido: " + (mejorS[0] === 0 ? "sin mínimo" : "$" + mejorS[0].toLocaleString("en-US")) +
  " (Sharpe " + mejorS[1].s.toFixed(2) + ")");
const V = Math.abs(dS) < 0.05 ? "INDEPENDIENTE — el filtro no cambia nada"
        : dS > 0 ? "GRACIAS A ÉL — quitarlo empeora"
                 : "A PESAR DE ÉL — quitarlo mejora";
console.log("");
console.log("  ►►► " + V);
console.log("");
