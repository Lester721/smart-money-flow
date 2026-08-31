// ══ ¿EL −10% OPTIMIZA LA PALANCA? ══ Lester, 2026-08-30: «mídelo. Y contéstame si la
// optimizamos, sí o no.»
//
// DOS pruebas, porque una sola no basta:
//   (1) OPERACIÓN, SIN SOLAPAR — ¿el 1,31x es real o son las mismas tres semanas contadas 370
//       veces? Se coge UNA entrada por ticker y se prohíbe otra hasta que la anterior habría
//       vencido (180 días naturales). Y se parte el período en dos mitades: si una mitad se
//       come a la otra, no hay nada.
//   (2) CARTERA — meter el −10% como disparador en el motor y compararlo con la regla congelada.
//       El nivel de operación puede brillar y no llegar a la cartera: los huecos mandan.
const CAST = 0.0138, kM = (1 - CAST/2) / (1 + CAST/2);
const mf = (cam) => { let i = Math.min(120, cam.length) - 1;
  for (let j = 0; j <= i; j++) if (cam[j][1] <= 0.50) { i = j; break; } return cam[i][1] * kM; };
const ms = (d) => Date.parse(d.slice(0,4)+"-"+d.slice(4,6)+"-"+d.slice(6,8));

function sinSolapar(L) {                      // una por ticker cada 180 días naturales
  const porTk = {}; for (const x of L) (porTk[x.tk] = porTk[x.tk] || []).push(x);
  const out = [];
  for (const tk of Object.keys(porTk)) { const S = porTk[tk].sort((a,b) => a.dC.localeCompare(b.dC));
    let ult = -1e15;
    for (const x of S) { const t = ms(x.dC); if (t - ult < 180*86400000) continue; ult = t; out.push(x); } }
  return out; }
const est = (V) => { const m = V.reduce((a,b)=>a+b,0)/V.length;
  const sd = Math.sqrt(V.reduce((a,b)=>a+(b-m)**2,0)/(V.length-1));
  return { m, t: (m-1)/(sd/Math.sqrt(V.length)) }; };

for (const [n, f] of [["los 27","largo-p25-d400.json"], ["GRUPO A","caminos-A.json"]]) {
  process.env.CAMINOS = f;
  const M = await import("./motor-cartera.mjs?q=" + f);
  const D = M.OPS.filter((o) => o.ma > -0.30 && o.camino && o.camino.length >= 15)
                 .map((o) => ({ ...o, m: mf(o.camino) }));
  console.log("");
  console.log("  ══════ " + n + " ══════");
  console.log("");
  console.log("  (1) OPERACIÓN, SIN SOLAPAR (una por ticker cada 180 días)");
  console.log("      " + "regla de entrada".padEnd(24) + "n".padStart(6) + "x medio".padStart(10) +
    "t".padStart(7) + "   1ª mitad   2ª mitad");
  for (const [et, fl] of [["cualquiera", () => true],
                          ["bajo la media (la regla)", (x) => x.ma < 0],
                          ["más de 3% abajo", (x) => x.ma < -0.03],
                          ["más de 5% abajo", (x) => x.ma < -0.05],
                          ["MÁS DE 10% ABAJO", (x) => x.ma <= -0.10]]) {
    const S = sinSolapar(D.filter(fl)); if (S.length < 20) { console.log("      " + et.padEnd(24) + String(S.length).padStart(6) + "  (pocas)"); continue; }
    const F = S.map(x=>x.dC).sort(); const corte = F[Math.floor(F.length/2)];
    const e = est(S.map(x=>x.m));
    const h1 = est(S.filter(x=>x.dC< corte).map(x=>x.m)), h2 = est(S.filter(x=>x.dC>=corte).map(x=>x.m));
    console.log("      " + et.padEnd(24) + String(S.length).padStart(6) + e.m.toFixed(3).padStart(10) +
      e.t.toFixed(2).padStart(7) + "     " + h1.m.toFixed(3) + "      " + h2.m.toFixed(3)); }

  console.log("");
  console.log("  (2) CARTERA — mediana de 41 capitales, 2 huecos, todo lo demás igual");
  console.log("      " + "regla de entrada".padEnd(24) + "al año".padStart(9) + "caída".padStart(8) +
    "Sharpe".padStart(8) + "ops".padStart(6));
  const MA0 = M.OPS.map((o) => o.ma);
  for (const [et, u] of [["bajo la media (la regla)", 0], ["más de 3% abajo", -0.03],
                         ["más de 5% abajo", -0.05], ["MÁS DE 10% ABAJO", -0.10]]) {
    for (let i = 0; i < M.OPS.length; i++) { const g = MA0[i];
      M.OPS[i].ma = (g >= u || g < -0.30) ? 999 : g; }
    const A=[],C=[],S=[],O=[];
    for (let i = 0; i < 41; i++) { const q = M.simular({ tam:0.12, huecos:2, modo:"spy", plazo:120,
        castigo:CAST, suelo:0.50, costeMin:5000, capital: 60000*(1+(i-20)*0.005) });
      A.push(q.cagr); C.push(q.caida); S.push(q.sharpe); O.push(q.ops); }
    console.log("      " + et.padEnd(24) + (M.med(A).toFixed(1)+"%").padStart(9) +
      ("−"+M.med(C).toFixed(0)+"%").padStart(8) + M.med(S).toFixed(2).padStart(8) +
      String(Math.round(M.med(O))).padStart(6)); }
  const spy = M.spyApalancado(1);
  console.log("      " + "comprar SPY y dormir".padEnd(24) + (spy.cagr.toFixed(1)+"%").padStart(9) +
    ("−"+spy.caida.toFixed(0)+"%").padStart(8) + spy.sharpe.toFixed(2).padStart(8));
}
console.log("");
