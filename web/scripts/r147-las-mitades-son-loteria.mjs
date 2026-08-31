// ══ ¿CUÁNTO BAILA CADA MITAD? ══ Lester, 2026-08-29.
//
// Con 2 huecos y ~60 operaciones en 10,6 años, la secuencia es CAÓTICA: cambiar la primera
// entrada tres días reordena las diez años enteros. El período completo sale estable; las
// MITADES no. Aquí se mide cuánto bailan de verdad, perturbando el capital de partida
// (que es lo que mueve qué contratos caben y por tanto la secuencia).
process.env.CAMINOS = "largo-p25-d400.json";
const M = await import("./motor-cartera.mjs");
for (const o of M.OPS) if (o.ma >= 0) o.ma = 999;
const CF = { tam:0.12, huecos:2, modo:"spy", plazo:120, castigo:0.5*0.0276 };
const q = (X,p)=>{const S=[...X].sort((a,b)=>a-b); return S[Math.floor(p*(S.length-1))];};
const N = 41;
const T=[], A=[], B=[], CA=[], AN=[];
for (let i=0;i<N;i++) {
  const cap = 60000 * (1 + (i-(N-1)/2)*0.005);        // ±10% de capital de partida
  const t = M.simular({...CF, capital:cap});
  const a = M.simular({...CF, capital:cap, hasta:"20201231"});
  const b = M.simular({...CF, capital:cap, desdeD:"20210101"});
  T.push(t.sharpe); A.push(a.sharpe); B.push(b.sharpe); CA.push(t.caida); AN.push(t.cagr); }
console.log("");
console.log("  41 capitales de partida entre $57.000 y $63.000 · misma regla exacta");
console.log("");
console.log("  " + "".padEnd(24) + "mín".padStart(8) + "p25".padStart(8) + "MEDIANA".padStart(10) +
  "p75".padStart(8) + "máx".padStart(8) + "rango".padStart(9));
const fila = (n,X,d=2) => console.log("  " + n.padEnd(24) + q(X,0).toFixed(d).padStart(8) +
  q(X,0.25).toFixed(d).padStart(8) + q(X,0.5).toFixed(d).padStart(10) + q(X,0.75).toFixed(d).padStart(8) +
  q(X,1).toFixed(d).padStart(8) + (q(X,1)-q(X,0)).toFixed(d).padStart(9));
fila("Sharpe TODO 2016-2026", T);
fila("Sharpe 2016-2020", A);
fila("Sharpe 2021-2026", B);
fila("rendimiento al año %", AN, 1);
fila("caída máxima %", CA, 1);
console.log("");
console.log("  ── lo que esto significa ──");
const rT=q(T,1)-q(T,0), rB=q(B,1)-q(B,0);
console.log("  el período COMPLETO baila " + rT.toFixed(2) + " puntos de Sharpe.");
console.log("  la mitad 2021-2026 baila " + rB.toFixed(2) + " puntos — " + (rB/rT).toFixed(1) + " veces más.");
console.log("  " + (rB > 0.30
  ? "⛔ Cualquier afirmación sobre UNA mitad de este período es una casilla de lotería.\n"
  + "     El único número que se puede citar es el del período COMPLETO."
  : "las mitades son estables y se pueden citar"));
console.log("");
console.log("  comprar SPY: 14,9% al año · caída −34% · Sharpe 0,70");
console.log("  LA PALANCA:  " + q(AN,0.5).toFixed(1) + "% al año · caída −" + q(CA,0.5).toFixed(0) +
  "% · Sharpe " + q(T,0.5).toFixed(2) + "   (rango del Sharpe: " + q(T,0).toFixed(2) + " a " + q(T,1).toFixed(2) + ")");
console.log("");
