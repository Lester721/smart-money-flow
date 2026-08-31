// ══ ¿AGUANTA SI NO TE DAN EL PRECIO COTIZADO? ══ Lester, 2026-08-29: «prueba el 1 y optimiza».
//
// r140 midió la horquilla REAL de estos contratos: 2,4-3,0% del punto medio, MEJOR que la call
// al dinero (4,0%). El backtest ya la paga entera (entra al ask, sale al bid).
//
// Pero medir la horquilla COTIZADA no es medir la liquidez: un bid/ask apretado por 1 contrato
// no es liquidez para $11.000. Así que la pregunta que queda es de robustez:
//   **¿cuánto peor te pueden llenar antes de que esto deje de valer la pena?**
// Se castiga con 0, 1/4, 1/2 y 1 horquilla ENTERA de más, en las dos patas.
const M = {}; let v = 0;
const H = { "25|250": 0.0244, "35|250": 0.0258, "25|400": 0.0276, "35|400": 0.0301 };  // medido en r140
for (const k of Object.keys(H)) { const [p,d] = k.split("|");
  process.env.CAMINOS = "largo-p"+p+"-d"+d+".json";
  try { M[k] = await import("./motor-cartera.mjs?v="+(++v)); } catch(e) {} }
const K = Object.keys(M);
for (const k of K) for (const o of M[k].OPS) if (o.ma >= 0) o.ma = 999;
const spy1 = M[K[0]].spyApalancado(1);
const A="20201231", B="20210101";
console.log("");
console.log("  horquilla MEDIDA (mediana, r140): " + K.map(k=>k.replace("|","%×")+"d "+(100*H[k]).toFixed(1)+"%").join("  ·  "));
console.log("  listón: comprar SPY 14,9% · −34% · Sharpe 0,70");
console.log("");
console.log("  " + "configuración".padEnd(30) + "castigo".padStart(10) + "al año".padStart(9) +
  "caída".padStart(8) + "Sharpe".padStart(8) + "2016-20".padStart(9) + "2021-26".padStart(9));
for (const [nom,k,h,t,pl,fr] of [
  ["25%×250d 2×20% ag90 fr3",  "25|250", 2, 0.20, 90, 0.03],
  ["25%×250d 2×20% ag90 SIN freno","25|250", 2, 0.20, 90, 0],
  ["25%×250d 4×15% ag90 SIN freno","25|250", 4, 0.15, 90, 0],
  ["35%×250d 2×20% ag90 SIN freno","35|250", 2, 0.20, 90, 0],
  ["35%×400d 2×20% ag90 SIN freno","35|400", 2, 0.20, 90, 0]]) {
  if (!M[k]) continue;
  for (const mult of [0, 0.25, 0.5, 1.0]) {
    const cf = { tam:t, huecos:h, modo:"spy", plazo:pl, frenoSPY:fr, castigo: mult*H[k] };
    const T = M[k].banda(cf), a = M[k].banda({...cf,hasta:A}), b = M[k].banda({...cf,desdeD:B});
    console.log("  " + (mult===0?nom:"").padEnd(30) +
      (mult===0?"cotizado":"+"+mult+" horq.").padStart(10) +
      (T.a.toFixed(1)+"%").padStart(9) + ("−"+T.c.toFixed(0)+"%").padStart(8) + T.s.toFixed(2).padStart(8) +
      a.s.toFixed(2).padStart(9) + b.s.toFixed(2).padStart(9)); }
  console.log(""); }
console.log("  " + "comprar SPY y dormir".padEnd(30) + "—".padStart(10) + "14.9%".padStart(9) + "−34%".padStart(8) + "0.70".padStart(8));
console.log("");
