// ══ COMPRAR BARATA LA CONVEXIDAD ══ Lester, 2026-08-28.
//
// ═══ DÓNDE ESTAMOS ═════════════════════════════════════════════════════════════════════════
// r120: el libro de 27 nombres es beta 3,11 contra SPY, R²=65%, alfa ≈ 0. Caída REAL −84%.
// r121: repartir entradas → no replica.   r122: disparador relativo → no replica.
// r123: quitar las empresas y dejar el índice → caída −84% → −41% al MISMO rendimiento.
// r125: y la media de 20 días no aporta nada: «siempre puesta» da lo mismo (0,71 vs 0,71).
//
// Lo que queda es esto: una forma de tomar apalancamiento con Sharpe 0,71 contra 0,70 de
// comprar SPY. Un EMPATE en riesgo/rendimiento, con dos cosas a favor que sí son reales:
// la cola (sesgo +0,11 contra −0,37) y que una call NO PUEDE dar llamada de margen.
//
// ═══ EL ÚLTIMO CABO CON MECANISMO ══════════════════════════════════════════════════════════
// Si lo que compras es convexidad, lo único que mecánicamente la mejora es PAGARLA BARATA.
// No es un filtro de mercado (esos han fallado siete veces): es un filtro sobre el PRECIO
// DE LO QUE COMPRAS, que es la variable que controlas.
//
// Y se mide SIN MODELO: la prima de una call 15% dentro a ~120 días, como % del spot, es
// directamente comparable consigo misma a lo largo del tiempo. Nada de Black-Scholes.
// Percentil con ventana MÓVIL de 2 años, como el medidor de miedo de r114 — el percentil
// sobre toda la historia sería mirar al futuro.
//
// ⚠️ Esto es UN PARÁMETRO NUEVO afinado sobre los mismos datos. Las dos mitades se enseñan
// desde el primer momento y si el barrido no es monótono, se retira. Como en r121.
process.env.CAMINOS = "caminos-indice.json";
const { simular, banda, spyApalancado, OPS, SPY, DD, D, pct } = await import("./motor-cartera.mjs");

const spy1 = spyApalancado(1);
const A = "20201231", B = "20210101";
const guarda = OPS.map((o) => o.ma);

// ── la prima como % del spot, y su percentil en ventana MÓVIL de 2 años ──
for (const o of OPS) o.prima = o.coste / (o.spot * 100);
const porTk = new Map();
for (const o of OPS) { if (!porTk.has(o.tk)) porTk.set(o.tk, []); porTk.get(o.tk).push(o); }
for (const [tk, L] of porTk) {
  L.sort((a, b) => a.dC.localeCompare(b.dC));
  for (let i = 0; i < L.length; i++) {
    const d0 = String(Number(L[i].dC.slice(0,4)) - 2) + L[i].dC.slice(4);
    const prev = [];
    for (let j = i - 1; j >= 0 && L[j].dC >= d0; j--) prev.push(L[j].prima);
    L[i].pct = prev.length >= 120 ? prev.filter((x) => x < L[i].prima).length / prev.length : null; } }

console.log("");
console.log("  ══ AUDIT ══");
console.log("  entradas: " + OPS.length.toLocaleString("en-US") + "  ·  con percentil de 2 años: " +
  OPS.filter((o) => o.pct != null).length.toLocaleString("en-US"));
const P = OPS.map((o) => o.prima).sort((a,b)=>a-b);
console.log("  prima de la call como % del spot: mediana " + (100*P[Math.floor(P.length/2)]).toFixed(1) +
  "%  ·  p10 " + (100*P[Math.floor(P.length*0.1)]).toFixed(1) + "%  ·  p90 " + (100*P[Math.floor(P.length*0.9)]).toFixed(1) + "%");
console.log("  EL LISTÓN — comprar SPY y dormir: " + spy1.cagr.toFixed(1) + "% · caída −" + spy1.caida.toFixed(0) +
  "% · Sharpe " + spy1.sharpe.toFixed(2));
console.log("");

// ── ¿la prima barata predice el resultado de la operación? antes de meterla en la cartera ──
console.log("  ══ 1 · ¿LA PRIMA BARATA PREDICE? ══  (crudo, por operación, antes de tocar la cartera)");
console.log("");
const conP = OPS.filter((o) => o.pct != null);
console.log("  " + "percentil de la prima".padEnd(26) + "n".padStart(7) + "resultado medio".padStart(17) + "% que ganan".padStart(13));
for (const [nom, lo, hi] of [["p0-20 (la más barata)",0,0.2],["p20-40",0.2,0.4],["p40-60",0.4,0.6],
                             ["p60-80",0.6,0.8],["p80-100 (la más cara)",0.8,1.01]]) {
  const G = conP.filter((o) => o.pct >= lo && o.pct < hi);
  const R = G.map((o) => o.camino[o.camino.length-1][1] - 1);
  const m = R.reduce((a,x)=>a+x,0) / Math.max(1, R.length);
  console.log("  " + nom.padEnd(26) + String(G.length).padStart(7) + (pct(100*m, 2)).padStart(17) +
    ((100 * R.filter((x)=>x>0).length / Math.max(1,R.length)).toFixed(0) + "%").padStart(13)); }
console.log("");

// ── y ahora en la cartera, con las dos mitades a la vista ──
console.log("  ══ 2 · EN LA CARTERA ══  (siempre puesta, 2 huecos al 8%, el ocioso en SPY)");
console.log("");
console.log("  " + "sólo si la prima está".padEnd(26) + "TODO".padStart(26) + "2016-2020".padStart(22) + "2021-2026".padStart(22));
console.log("  " + " ".repeat(26) + "al año  caída   Sh   ops".padStart(26) + "al año  caída   Sh".padStart(22) + "al año  caída   Sh".padStart(22));
function linea(nombre, sel, tam = 0.08, huecos = 2) {
  for (let i = 0; i < OPS.length; i++) OPS[i].ma = sel(OPS[i]) ? -1 : 999;
  const T = banda({ tam, huecos, modo: "spy" });
  const qA = banda({ tam, huecos, modo: "spy", hasta: A });
  const qB = banda({ tam, huecos, modo: "spy", desdeD: B });
  const q = simular({ tam, huecos, modo: "spy" });
  console.log("  " + nombre.padEnd(26) +
    ((T.a.toFixed(1)+"%").padStart(7) + ("−"+T.c.toFixed(0)+"%").padStart(7) + T.s.toFixed(2).padStart(6) + String(q.ops).padStart(6)).padStart(26) +
    ((qA.a.toFixed(1)+"%").padStart(7) + ("−"+qA.c.toFixed(0)+"%").padStart(7) + qA.s.toFixed(2).padStart(6)).padStart(22) +
    ((qB.a.toFixed(1)+"%").padStart(7) + ("−"+qB.c.toFixed(0)+"%").padStart(7) + qB.s.toFixed(2).padStart(6)).padStart(22)); }
linea("sin filtro (siempre)", () => true);
for (const u of [0.8, 0.6, 0.4, 0.2]) linea("por debajo del p" + (100*u).toFixed(0), (o) => o.pct != null && o.pct < u);
console.log("");

// ── LO QUE SE LLEVA A CASA: el cara a cara final, con la forma y la llamada de margen ──
console.log("  ══ 3 · EL CARA A CARA FINAL ══");
console.log("");
for (let i = 0; i < OPS.length; i++) OPS[i].ma = -1;
const q = simular({ tam: 0.08, huecos: 2, modo: "spy" });
const FSPY = []; for (let L = 1; L <= 3.01; L += 0.05) { const r = spyApalancado(L); FSPY.push({ L: Math.round(L*100)/100, ...r }); }
const rival = FSPY.filter((x) => x.caida <= q.caida).sort((a,b)=>b.cagr-a.cagr)[0];
function mensual(V) { const M = new Map(); for (let i = 0; i < DD.length; i++) M.set(DD[i].slice(0,6), V[i]);
  const K = [...M.keys()].sort(), R = []; for (let i = 1; i < K.length; i++) R.push(100*(M.get(K[i])/M.get(K[i-1])-1)); return R; }
function forma(R) { const n = R.length, m = R.reduce((a,x)=>a+x,0)/n;
  const sd = Math.sqrt(R.reduce((a,x)=>a+(x-m)**2,0)/(n-1)); const S=[...R].sort((a,b)=>a-b);
  return { sk: R.reduce((a,x)=>a+((x-m)/sd)**3,0)/n, peor: S[0], mejor: S[n-1], gan: 100*R.filter((x)=>x>0).length/n }; }
const fa = forma(mensual(q.V)), fb = forma(mensual(rival.V)), fc = forma(mensual(spyApalancado(1).V));
console.log("  " + " ".repeat(26) + "calls de índice".padStart(17) + ("SPY a " + rival.L + "x").padStart(15) + "SPY y dormir".padStart(15));
const fila = (n, a, b, c, d = 1) => console.log("  " + n.padEnd(26) + a.toFixed(d).padStart(17) + b.toFixed(d).padStart(15) + c.toFixed(d).padStart(15));
fila("al año %", q.cagr, rival.cagr, spy1.cagr);
fila("caída máxima %", -q.caida, -rival.caida, -spy1.caida, 0);
fila("Sharpe", q.sharpe, rival.sharpe, spy1.sharpe, 2);
fila("meses ganadores %", fa.gan, fb.gan, fc.gan, 0);
fila("SESGO (cola derecha)", fa.sk, fb.sk, fc.sk, 2);
fila("mejor mes %", fa.mejor, fb.mejor, fc.mejor, 0);
fila("peor mes %", fa.peor, fb.peor, fc.peor, 0);
fila("final con $60.000 (miles)", q.final/1000, rival.final/1000, spy1.final/1000, 0);
console.log("");
console.log("  ¿puede haber llamada de margen? calls: NO (lo máximo que se pierde es la prima)");
console.log("                                  SPY a " + rival.L + "x: SÍ, si el índice cae más del " +
  (100 * (1 - 1/rival.L) * 0.75).toFixed(0) + "% entre reajustes");
console.log("");
console.log("  " + "año".padEnd(7) + "valor".padStart(13) + "% del año".padStart(11) + "peor caída".padStart(12) + "ops".padStart(6));
for (const y of ["2016","2017","2018","2019","2020","2021","2022","2023","2024","2025","2026"]) {
  const idx = DD.map((d,i)=>[d,i]).filter(([d])=>d.startsWith(y)).map(([,i])=>i); if (!idx.length) continue;
  const v0 = idx[0]===0 ? 60000 : q.V[idx[0]-1], v1 = q.V[idx[idx.length-1]];
  let pk = v0, pr = 0; for (const i of idx) { if (q.V[i]>pk) pk=q.V[i]; const d=1-q.V[i]/pk; if (d>pr) pr=d; }
  console.log("  " + y.padEnd(7) + D(v1).padStart(13) + pct(100*(v1/v0-1),0).padStart(11) +
    ("−"+(100*pr).toFixed(0)+"%").padStart(12) + String(q.tom.filter((x)=>x.y===y).length).padStart(6)); }
console.log("");
