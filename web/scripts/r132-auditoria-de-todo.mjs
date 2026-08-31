// ══ AUDITORÍA DE TODO LO QUE DIJE QUE FUNCIONABA ══ Lester, 2026-08-29: «audita todo lo demás».
//
// ═══ POR QUÉ ═══════════════════════════════════════════════════════════════════════════════
// El 2026-08-29 se retiró «quitar las 25 empresas baja la caída»: comparaba 79% de dinero
// expuesto contra 12%, y la diferencia era el TAMAÑO, no los tickers. Todo lo demás que dije
// ayer sale del mismo motor y del mismo estilo de comparación. Se audita entero.
//
// La lente es una sola pregunta, la que falló: **¿está la comparación emparejada en lo obvio
// que mueve el resultado?** Y una segunda, por orden permanente de Lester: ¿maté algo con
// una comparación mal hecha? ([[backtest-para-construir-no-para-destruir]])
process.env.CAMINOS = "caminos-120d.json";
const { simular, banda, spyApalancado, OPS, SPY, DD, D, pct } = await import("./motor-cartera.mjs");
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";

const CRUDO = JSON.parse(readFileSync(join(CACHE, "caminos-120d.json"), "utf8"));
const spy1 = spyApalancado(1);
const g = OPS.map((o) => o.ma);
const rest = () => { for (let i = 0; i < OPS.length; i++) OPS[i].ma = g[i]; };

console.log("");
console.log("  ══════════ 1 · ¿ESTÁ BIEN EL MOTOR? ══════════");
console.log("  (si falla esto, TODO lo de ayer es falso, no sólo lo retirado)");
console.log("");

// 1a. sin señales tiene que ser SPY exacto
const c0 = simular({ tam: 0, huecos: 0, modo: "spy" });
const ANOS = (Date.parse(DD[DD.length-1].slice(0,4)+"-"+DD[DD.length-1].slice(4,6)+"-"+DD[DD.length-1].slice(6,8)) -
              Date.parse(DD[0].slice(0,4)+"-"+DD[0].slice(4,6)+"-"+DD[0].slice(6,8))) / (365.25*86400000);
const spyTeorico = 60000 * (SPY[DD[DD.length-1]] / SPY[DD[0]]) * Math.pow(1.013, ANOS);
console.log("  a) sin señales = SPY con dividendos:  " + D(c0.final) + " vs " + D(spyTeorico) +
  "   error " + (100*Math.abs(c0.final-spyTeorico)/spyTeorico).toFixed(2) + "%  " +
  (Math.abs(c0.final-spyTeorico)/spyTeorico < 0.005 ? "✓" : "⛔"));

// 1b. ¿mira al futuro? el arrastre del último multiplicador conocido es el punto delicado
let huecosEnCamino = 0, saltosGrandes = 0;
for (const o of CRUDO.ops) {
  const f = o.camino.map((x) => x[0]);
  for (let i = 1; i < f.length; i++) { const idx = DD.indexOf(f[i]), pre = DD.indexOf(f[i-1]);
    if (idx - pre > 1) huecosEnCamino++; }
  for (let i = 1; i < o.camino.length; i++) if (Math.abs(o.camino[i][1]/o.camino[i-1][1] - 1) > 1.0) saltosGrandes++; }
console.log("  b) huecos dentro de los caminos (donde actúa el arrastre): " + huecosEnCamino.toLocaleString("en-US") +
  " de " + CRUDO.ops.reduce((a,o)=>a+o.camino.length,0).toLocaleString("en-US") + " puntos  (" +
  (100*huecosEnCamino/CRUDO.ops.reduce((a,o)=>a+o.camino.length,0)).toFixed(2) + "%)");
console.log("     todos los caminos empiezan DESPUÉS de comprar: " +
  (CRUDO.ops.every((o) => o.camino[0][0] > o.dC) ? "sí ✓" : "NO ⛔"));
console.log("     saltos de más del 100% en un día: " + saltosGrandes + (saltosGrandes < 50 ? "  ✓" : "  ⚠ mirar"));

// 1c. una operación a mano, contra el fichero crudo
const ej = CRUDO.ops.find((o) => o.tk === "SPY" && o.dC > "20200301" && o.camino.length > 60);
console.log("  c) una operación a mano: " + ej.tk + " comprada " + ej.dC + " strike " + ej.K + " vence " + ej.exp);
console.log("     coste " + D(ej.coste) + "  ·  spot " + ej.spot + "  ·  " + ej.camino.length + " días de camino");
console.log("     multiplicador: día 1 = " + ej.camino[0][1] + "  ·  final = " + ej.camino[ej.camino.length-1][1] +
  "  →  " + D(ej.coste * ej.camino[ej.camino.length-1][1]) + " al salir");
console.log("     ¿el strike está un ~15% bajo el spot? " + (100*(ej.spot-ej.K)/ej.spot).toFixed(1) + "%  " +
  (Math.abs((ej.spot-ej.K)/ej.spot - 0.15) < 0.06 ? "✓" : "⚠"));

// 1d. la caída marcada a mercado NO puede ser menor que la realizada
const q6 = simular({ tam: 0.15, huecos: 6, modo: "spy" });
console.log("  d) caída marcada a mercado −" + q6.caida.toFixed(0) + "%  (r109, valorando al coste, daba −64%)");
console.log("     marcar a mercado sólo puede EMPEORARLA: " + (q6.caida >= 64 ? "coherente ✓" : "INCOHERENTE ⛔"));
console.log("");

console.log("  ══════════ 2 · LA REGRESIÓN: ¿beta 3,11 y alfa cero? ══════════");
console.log("");
const base = simular({ tam: 0.15, huecos: 6, modo: "efectivo" });
function reg(Y, X) {
  const n = Y.length, my = Y.reduce((a,x)=>a+x,0)/n, mx = X.reduce((a,x)=>a+x,0)/n;
  let num=0, den=0; for (let i=0;i<n;i++){num+=(Y[i]-my)*(X[i]-mx); den+=(X[i]-mx)**2;}
  const b=num/den, a=my-b*mx;
  let ssr=0, sst=0; for (let i=0;i<n;i++){const f=a+b*X[i]; ssr+=(Y[i]-f)**2; sst+=(Y[i]-my)**2;}
  const s2=ssr/(n-2);
  return { a, b, r2:1-ssr/sst, tb:b/Math.sqrt(s2/den), ta:a/Math.sqrt(s2*(1/n+mx*mx/den)), n, sa:Math.sqrt(s2*(1/n+mx*mx/den)) }; }
console.log("  a) ¿están alineados los días? RB tiene " + base.RB.length + " valores y RS " + base.RS.length +
  "  →  " + (base.RB.length === base.RS.length ? "sí ✓" : "NO ⛔"));
const r = reg(base.RB, base.RS);
console.log("  b) beta del libro = " + r.b.toFixed(2) + "  (t=" + r.tb.toFixed(1) + ")   R² = " + (100*r.r2).toFixed(0) + "%");
// ¿es plausible? una call 15% dentro cuesta ~17,5% del spot y su delta ronda 0,85
const primaMed = (() => { const P = CRUDO.ops.map((o) => o.coste/(o.spot*100)).sort((a,b)=>a-b); return P[Math.floor(P.length/2)]; })();
console.log("     comprobación independiente: la prima mediana es el " + (100*primaMed).toFixed(1) +
  "% del spot → apalancamiento máximo " + (1/primaMed).toFixed(1) + "x");
console.log("     beta medida " + r.b.toFixed(2) + " sobre un máximo teórico de " + (1/primaMed).toFixed(1) +
  "x  →  " + (r.b > 1 && r.b < 1/primaMed ? "dentro del rango posible ✓" : "IMPOSIBLE ⛔"));
console.log("  c) alfa = " + (100*r.a*252).toFixed(1) + "% al año, t=" + r.ta.toFixed(2) +
  "   intervalo 95%: de " + (100*(r.a-1.96*r.sa)*252).toFixed(0) + "% a " + (100*(r.a+1.96*r.sa)*252).toFixed(0) + "%");
console.log("     → " + (Math.abs(r.ta) < 2 ? "NO se distingue de cero. Pero el intervalo es enorme:" : "distinto de cero:"));
console.log("       con este ruido, un alfa real de +10%/año tampoco se vería. **No es «no hay alfa»,");
console.log("       es «no lo podemos medir».** Decirlo como «alfa cero» fue de más.");
console.log("");

console.log("  ══════════ 3 · ¿LA CONVEXIDAD ES REAL? ══════════");
console.log("  (dije beta 3,17 los días de subida contra 2,83 los de bajada)");
console.log("");
const sube=[], subeS=[], baja=[], bajaS=[];
for (let i=0;i<base.RB.length;i++){ if(base.RS[i]>0){sube.push(base.RB[i]);subeS.push(base.RS[i]);}
  else if(base.RS[i]<0){baja.push(base.RB[i]);bajaS.push(base.RS[i]);} }
const rU=reg(sube,subeS), rD=reg(baja,bajaS);
console.log("  a) beta subiendo " + rU.b.toFixed(2) + " (n=" + rU.n + ")  ·  bajando " + rD.b.toFixed(2) + " (n=" + rD.n + ")");
const seDif = Math.sqrt((rU.b/rU.tb)**2 + (rD.b/rD.tb)**2);
console.log("     diferencia " + (rU.b-rD.b).toFixed(2) + " ± " + seDif.toFixed(2) +
  "  →  t=" + ((rU.b-rD.b)/seDif).toFixed(2) + "  " + (Math.abs((rU.b-rD.b)/seDif) > 2 ? "✓ real" : "⚠ NO se distingue de cero"));
// prueba independiente: término cuadrático
const X = base.RS, Y = base.RB;
{ const n=X.length; let sx=0,sx2=0,sx3=0,sx4=0,sy=0,sxy=0,sx2y=0;
  for(let i=0;i<n;i++){const x=X[i],y=Y[i];sx+=x;sx2+=x*x;sx3+=x**3;sx4+=x**4;sy+=y;sxy+=x*y;sx2y+=x*x*y;}
  // resolver [n sx sx2; sx sx2 sx3; sx2 sx3 sx4] [a b c] = [sy sxy sx2y]
  const M=[[n,sx,sx2],[sx,sx2,sx3],[sx2,sx3,sx4]], V=[sy,sxy,sx2y];
  for(let i=0;i<3;i++){ let p=i; for(let k=i+1;k<3;k++) if(Math.abs(M[k][i])>Math.abs(M[p][i])) p=k;
    [M[i],M[p]]=[M[p],M[i]]; [V[i],V[p]]=[V[p],V[i]];
    for(let k=i+1;k<3;k++){ const f=M[k][i]/M[i][i]; for(let j=i;j<3;j++) M[k][j]-=f*M[i][j]; V[k]-=f*V[i]; } }
  const C=[0,0,0]; for(let i=2;i>=0;i--){ let s=V[i]; for(let j=i+1;j<3;j++) s-=M[i][j]*C[j]; C[i]=s/M[i][i]; }
  console.log("  b) prueba independiente — término CUADRÁTICO de la regresión: " + C[2].toFixed(2));
  console.log("     " + (C[2] > 0 ? "positivo → la curva se dobla hacia arriba, que es lo que hace una call ✓"
                                  : "negativo o cero → NO hay convexidad ⛔")); }
console.log("");

console.log("  ══════════ 4 · «LA MEDIA DE 20 DÍAS NO APORTA» ══════════");
console.log("  (¿estaba emparejado por dinero expuesto? es el fallo que se retiró)");
console.log("");
process.env.CAMINOS = "caminos-indice.json";
const M2 = await import("./motor-cartera.mjs?v=2");
const g2 = M2.OPS.map((o) => o.ma);
const marcar2 = (f, v) => { for (let i=0;i<M2.OPS.length;i++) M2.OPS[i].ma = f(M2.OPS[i], g2[i]) ? (v ? v(M2.OPS[i], g2[i]) : g2[i]) : 999; };
console.log("  " + "cuándo se entra".padEnd(24) + "expuesto".padStart(10) + "al año".padStart(9) +
  "caída".padStart(8) + "Sharpe".padStart(8) + "ops".padStart(6));
for (const [nom, sel] of [["bajo la media", (o,m) => m < 0], ["SIEMPRE", () => true], ["sobre la media", (o,m) => m >= 0]]) {
  for (const [h,t] of [[1,0.08],[2,0.08],[2,0.12]]) {
    marcar2(sel, () => -1);
    const b = M2.banda({ tam:t, huecos:h, modo:"spy" });
    const q = M2.simular({ tam:t, huecos:h, modo:"spy" });
    console.log("  " + (nom + "  " + h + "×" + (100*t).toFixed(0) + "%").padEnd(24) +
      (q.invertido.toFixed(0)+"%").padStart(10) + (b.a.toFixed(1)+"%").padStart(9) +
      ("−"+b.c.toFixed(0)+"%").padStart(8) + b.s.toFixed(2).padStart(8) + String(q.ops).padStart(6)); } }
console.log("");
