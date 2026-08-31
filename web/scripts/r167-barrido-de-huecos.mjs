// ══ ¿CUÁNTOS HUECOS HACEN FALTA PARA QUE EL BANCO MIDA ALGO? ══ Lester, 2026-08-30
//
// El examen del grupo A destapó que el control y la hipótesis del 3% comparten **CERO**
// operaciones de ~49. Con 2 huecos el primer día elegible ocupa la plaza y bloquea 120 sesiones,
// así que mover el disparador unas décimas baraja la década entera. No se estaba midiendo el
// umbral: se comparaban dos muestras distintas del mismo bombo.
//
// ⚠️ EL CONFUSOR: subir `huecos` con `tam` fijo sube también el DINERO invertido, así que
//    mejoraría por apalancamiento y no por diversificación. Aquí la exposición total se mantiene
//    CONSTANTE en 24% (= los 2 huecos × 12% de la regla congelada) y sólo se reparte:
//       tam = 0,24 / huecos
//    Así lo único que cambia es en cuántos trozos va el mismo dinero.
//
// Se mide, para cada número de huecos:
//   · rendimiento, caída y Sharpe (mediana de 41 capitales)
//   · SOLAPE entre correr con umbral 0 y con umbral −3% ← la prueba del banco
//   · cuánto pesa la operación más grande
const G = process.argv[2] === "SC" ? { n: "los 27, SIN mínimo de coste", f: "sincoste-p25-d400.json", cm: 0 }
      : process.argv[2] === "A"
  ? { n: "GRUPO A (24 nuevos)", f: "caminos-A.json", cm: 5000 }
  : { n: "los 27 PUBLICADOS",   f: "largo-p25-d400.json", cm: 5000 };
process.env.CAMINOS = G.f;
const M = await import("./motor-cartera.mjs");

const CAP = 60000, CAST = 0.0138, EXPO = 0.24;
const MA0 = M.OPS.map((o) => o.ma);
const poner = (u) => { for (let i = 0; i < M.OPS.length; i++) {
  const g = MA0[i]; M.OPS[i].ma = (g >= u || g < -0.30) ? 999 : g; } };
const base = (h) => ({ tam: EXPO / h, huecos: h, modo: "spy", plazo: 120,
                       castigo: CAST, suelo: 0.50, costeMin: G.cm });

console.log("");
console.log("  ══ BARRIDO DE HUECOS · " + G.n + " ══");
console.log("  exposición total constante al " + (100*EXPO).toFixed(0) + "% · tam = 24%/huecos · mediana de 41 capitales");
console.log("");
console.log("  " + "huecos".padEnd(8) + "tam".padStart(7) + "al año".padStart(9) + "caída".padStart(8) +
  "Sharpe".padStart(8) + "ops".padStart(6) + "  la mayor" + "   solape control↔3%");
for (const h of [2, 3, 4, 5, 6, 8, 10, 12, 16, 20]) {
  poner(0);
  const A = [], C = [], S = [], O = [];
  for (let i = 0; i < 41; i++) {
    const q = M.simular({ ...base(h), capital: CAP * (1 + (i - 20) * 0.005) });
    A.push(q.cagr); C.push(q.caida); S.push(q.sharpe); O.push(q.ops); }
  const q0 = M.simular({ ...base(h), capital: CAP });
  const g0 = q0.tom.map((x) => ({ k: x.tk + x.dC, g: x.dinero * (x.mult - 1) }));
  const tot = g0.reduce((a, x) => a + x.g, 0);
  const mayor = tot > 0 ? 100 * Math.max(...g0.map((x) => x.g)) / tot : NaN;
  poner(-0.03);
  const q3 = M.simular({ ...base(h), capital: CAP });
  const s3 = new Set(q3.tom.map((x) => x.tk + x.dC));
  const com = g0.filter((x) => s3.has(x.k)).length;
  const sol = 100 * com / Math.max(g0.length, 1);
  console.log("  " + String(h).padEnd(8) + ((100*EXPO/h).toFixed(1)+"%").padStart(7) +
    (M.med(A).toFixed(1)+"%").padStart(9) + ("−"+M.med(C).toFixed(0)+"%").padStart(8) +
    M.med(S).toFixed(2).padStart(8) + String(Math.round(M.med(O))).padStart(6) +
    (isNaN(mayor) ? "      —" : (mayor.toFixed(0)+"%").padStart(9)) +
    (com + "/" + g0.length + " = " + sol.toFixed(0) + "%").padStart(20));
}
const spy = M.spyApalancado(1);
console.log("");
console.log("  comprar SPY y dormir:  " + spy.cagr.toFixed(1) + "% · −" + spy.caida.toFixed(0) +
  "% · Sharpe " + spy.sharpe.toFixed(2));
console.log("");
