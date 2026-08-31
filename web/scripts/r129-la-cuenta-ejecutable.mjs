// ══ LA CUENTA QUE SÍ SE PUEDE EJECUTAR ══ Lester, 2026-08-28.
//
// ═══ LA CADENA DE HOY ══════════════════════════════════════════════════════════════════════
// r120  la caída real era −84%, no −43%: r109 valoraba lo abierto al coste
// r123  quitar las 25 empresas y dejar índice: −84% → −41% al mismo dinero
// r125  la media de 20 días no aporta nada → «siempre puesta»
// r127  mezclar con la put semanal: 16,4% y −16% contra SPY 15,1% y −32%. Y no vive del
//       reequilibrio (semanal, anual y NUNCA dan lo mismo) → es diversificación de verdad
// r128  PERO la put cubierta pide $67.100 de colateral: el 121% de la cuenta. NO CABE.
//       Y la vertical, medida sobre su propio colateral, es la misma apuesta apalancada:
//       79,7% al año con peor semana −91,7%, y cruzar dos horquillas cuesta 22 puntos.
//
// ═══ LO QUE SE MIDE AQUÍ ═══════════════════════════════════════════════════════════════════
// Medir la vertical «sobre su colateral» no dice nada: el colateral es una elección, no un
// riesgo. Lo que importa es LA CUENTA ENTERA, en dólares, con el número de contratos que
// Lester puede poner de verdad. Se barre ese número.
//
// Todo cruzando la horquilla (vender al bid, comprar al ask). Nada a punto medio.
// El listón sigue siendo comprar SPY en la MISMA ventana, no cero.
process.argv[2] = new URL("./cache-theta/noche-2026-08-10", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
process.env.CAMINOS = "caminos-indice.json";
const { simular, OPS, SPY, DD, D, pct } = await import("./motor-cartera.mjs");
const { serieVertical } = await import("./r128-lib.mjs");

const CAP = 55419;
const sinGuion = (d) => d.replace(/-/g, "");

// ── pata 1: calls de índice, curva diaria, config de r126 ──
for (const o of OPS) o.ma = -1;
const calls = simular({ tam: 0.08, huecos: 2, modo: "spy" });
const vCalls = new Map(DD.map((d, i) => [d, calls.V[i]]));

// ── pata 2: la vertical, CRUZANDO la horquilla ──
const VERT = new Map(serieVertical(30, true).map((o) => [o.rolo, o]));
const CSP  = new Map(serieVertical(0, true).map((o) => [o.rolo, o]));   // la cubierta, para comparar

const viernes = [];
{ const d = new Date(Date.UTC(2020, 0, 3));
  while (d < new Date(Date.UTC(2026, 7, 1))) { viernes.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 7); } }
const haciaAtras = (iso) => { const d = sinGuion(iso); const c = DD.filter((x) => x <= d); return c.length ? c[c.length-1] : null; };

const SEM = [];
for (let i = 0; i < viernes.length - 1; i++) {
  const a = haciaAtras(viernes[i]), b = haciaAtras(viernes[i + 1]);
  if (!a || !b || a === b) continue;
  const va = vCalls.get(a), vb = vCalls.get(b);
  if (va == null || vb == null) continue;
  SEM.push({ f: viernes[i], rCall: vb / va - 1, rSPY: SPY[b] / SPY[a] - 1 + 0.013 * 7 / 365,
    vert: VERT.get(viernes[i]) || null, csp: CSP.get(viernes[i]) || null }); }
const ANOS = (Date.parse(SEM[SEM.length-1].f) - Date.parse(SEM[0].f)) / (365.25 * 86400000);
const RATE = Math.pow(1.033, 7 / 365) - 1;

// ══════════════════════════════════════════════════════════════════════════════════════════
// LA CUENTA. N verticales por semana; el colateral (N × anchura × 100) apartado en efectivo.
// Lo que sobra va a la estrategia de calls de índice. En dólares, no en porcentajes.
// ══════════════════════════════════════════════════════════════════════════════════════════
function cuenta(peso, ancho = 30, cubierta = false) {
  // ⚠️ La primera versión ponía el colateral en DÓLARES FIJOS. Al crecer la cuenta de $55k a
  // $495k la pata de verticales se volvía insignificante y la caída no se movía: artefacto de
  // escala, no resultado. Aquí los contratos ESCALAN con la cuenta, que es lo que se haría.
  let v = CAP; let pico = CAP, peor = 0; const C = [CAP];
  let maxN = 0, sinDato = 0, semanasSinCaber = 0;
  for (const s of SEM) {
    const op = cubierta ? s.csp : s.vert;
    const unidad = cubierta ? (op ? op.capital : Infinity) : ancho * 100;
    const N = Math.floor(v * peso / unidad);
    if (N < 1) semanasSinCaber++;
    maxN = Math.max(maxN, N);
    const col = N * unidad;
    const resto = v - col;
    let pl = 0;
    if (op && N > 0) pl = op.pl * N; else { pl = col * RATE; if (!op) sinDato++; }
    v = resto * (1 + s.rCall) + col + pl;
    C.push(v);
    if (v > pico) pico = v; const dd = 1 - v / pico; if (dd > peor) peor = dd; }
  const R = []; for (let i = 1; i < C.length; i++) R.push(C[i] / C[i-1] - 1);
  const m = R.reduce((a,x)=>a+x,0)/R.length;
  const sd = Math.sqrt(R.reduce((a,x)=>a+(x-m)**2,0)/(R.length-1));
  return { final: v, anual: 100*(Math.pow(v/CAP, 1/ANOS)-1), caida: 100*peor,
    sharpe: (m*52-0.033)/(sd*Math.sqrt(52)), R, C, maxN, semanasSinCaber,
    peorSem: 100*Math.min(...R), gan: 100*R.filter((x)=>x>0).length/R.length }; }

function soloIndice(R) {
  let v = CAP, pico = CAP, peor = 0; const C = [CAP];
  for (const s of SEM) { v *= (1 + s[R]); C.push(v); if (v > pico) pico = v; const d = 1 - v/pico; if (d > peor) peor = d; }
  const Rr = []; for (let i = 1; i < C.length; i++) Rr.push(C[i]/C[i-1]-1);
  const m = Rr.reduce((a,x)=>a+x,0)/Rr.length;
  const sd = Math.sqrt(Rr.reduce((a,x)=>a+(x-m)**2,0)/(Rr.length-1));
  return { final: v, anual: 100*(Math.pow(v/CAP,1/ANOS)-1), caida: 100*peor,
    sharpe: (m*52-0.033)/(sd*Math.sqrt(52)), peorSem: 100*Math.min(...Rr), R: Rr,
    gan: 100*Rr.filter((x)=>x>0).length/Rr.length }; }

console.log("");
console.log("  ══ AUDIT ══");
console.log("  ventana: " + SEM[0].f + " → " + SEM[SEM.length-1].f + "  ·  " + ANOS.toFixed(1) + " años · " +
  SEM.length + " semanas  ·  " + SEM.filter((s)=>!s.vert).length + " sin vertical (en efectivo)");
console.log("  capital: " + D(CAP) + " (el de verdad)  ·  TODO cruzando la horquilla");
const bSPY = soloIndice("rSPY"), bCall = soloIndice("rCall");
console.log("  ✓ control comprar SPY: " + bSPY.anual.toFixed(1) + "% al año, caída −" + bSPY.caida.toFixed(0) + "%");
console.log("  ⚠️ caída medida los VIERNES: la diaria es ~2 puntos peor");
console.log("");

console.log("  ══ 1 · CUÁNTO PESO EN VERTICALES ══  (anchura $30 = $3.000 por contrato; los contratos ESCALAN con la cuenta)");
console.log("");
console.log("  " + "estructura".padEnd(30) + "contratos".padStart(11) + "al año".padStart(9) + "caída".padStart(8) +
  "Sharpe".padStart(8) + "peor sem".padStart(10) + D(CAP).padStart(12));
console.log("  " + "comprar SPY y dormir".padEnd(30) + "—".padStart(11) + (bSPY.anual.toFixed(1)+"%").padStart(9) +
  ("−"+bSPY.caida.toFixed(0)+"%").padStart(8) + bSPY.sharpe.toFixed(2).padStart(8) +
  pct(bSPY.peorSem,1).padStart(10) + D(bSPY.final).padStart(12));
console.log("  " + "sólo calls de índice".padEnd(30) + "—".padStart(11) + (bCall.anual.toFixed(1)+"%").padStart(9) +
  ("−"+bCall.caida.toFixed(0)+"%").padStart(8) + bCall.sharpe.toFixed(2).padStart(8) +
  pct(bCall.peorSem,1).padStart(10) + D(bCall.final).padStart(12));
const RES = [];
for (const w of [0.02, 0.05, 0.10, 0.15, 0.20, 0.30, 0.40]) {
  const q = cuenta(w); if (!q) continue;
  RES.push({ N: w, q });
  console.log("  " + ((100*w).toFixed(0) + "% en verticales + calls").padEnd(30) +
    ("1→" + q.maxN).padStart(11) + (q.anual.toFixed(1)+"%").padStart(9) + ("−"+q.caida.toFixed(0)+"%").padStart(8) +
    q.sharpe.toFixed(2).padStart(8) + pct(q.peorSem,1).padStart(10) + D(q.final).padStart(12)); }
for (const w of [0.5, 1.0]) { const q = cuenta(w, 0, true); if (!q) continue;
  console.log("  " + ((100*w).toFixed(0) + "% en put CUBIERTA + calls").padEnd(30) +
    ("1→" + q.maxN).padStart(11) + (q.anual.toFixed(1)+"%").padStart(9) + ("−"+q.caida.toFixed(0)+"%").padStart(8) +
    q.sharpe.toFixed(2).padStart(8) + pct(q.peorSem,1).padStart(10) + D(q.final).padStart(12) +
    (q.semanasSinCaber ? "   (" + q.semanasSinCaber + " semanas sin caber)" : "")); }
console.log("");

console.log("  ══ 2 · LAS DOS MITADES ══");
console.log("");
function mitades(R) { const c = Math.floor(R.length/2);
  const m = (X) => { let e = 1, p = 1, d = 0; for (const x of X) { e *= (1+x); p = Math.max(p,e); d = Math.max(d, 1-e/p); }
    return { a: 100*(Math.pow(e, 2/ANOS)-1), c: 100*d }; };
  return [m(R.slice(0,c)), m(R.slice(c))]; }
console.log("  " + "estructura".padEnd(30) + ("1ª: " + SEM[0].f).padStart(20) + ("2ª: " + SEM[Math.floor(SEM.length/2)].f).padStart(20));
for (const [nom, R] of [["comprar SPY", bSPY.R], ["sólo calls", bCall.R],
                        ...RES.filter((x)=>[0.05,0.10,0.20,0.40].includes(x.N)).map((x)=>[(100*x.N).toFixed(0) + "% verticales + calls", x.q.R])]) {
  const [a, b] = mitades(R);
  console.log("  " + nom.padEnd(30) + ((a.a.toFixed(1)+"%").padStart(9) + ("−"+a.c.toFixed(0)+"%").padStart(8)).padStart(20) +
    ((b.a.toFixed(1)+"%").padStart(9) + ("−"+b.c.toFixed(0)+"%").padStart(8)).padStart(20)); }
console.log("");

console.log("  ══ 3 · AÑO A AÑO ══");
console.log("");
const elegida = RES.filter((x) => x.q.anual > bSPY.anual && x.q.caida < bSPY.caida).sort((a,b)=>b.q.sharpe-a.q.sharpe)[0];
if (!elegida) { console.log("  ⛔ NINGUNA configuración bate a SPY en las dos columnas."); }
else {
  console.log("  " + (100*elegida.N).toFixed(0) + "% en verticales + calls de índice   (bate a SPY en las DOS columnas, mejor Sharpe)");
  console.log("");
  console.log("  " + "año".padEnd(7) + "la mezcla".padStart(12) + "sólo calls".padStart(12) + "SPY".padStart(10) + "sem".padStart(6));
  for (const y of ["2020","2021","2022","2023","2024","2025","2026"]) {
    const I = SEM.map((s,i)=>[s.f,i]).filter(([f])=>f.startsWith(y)).map(([,i])=>i);
    if (I.length < 5) continue;
    const ac = (R) => 100 * (I.reduce((a,i)=>a*(1+R[i]),1) - 1);
    console.log("  " + y.padEnd(7) + pct(ac(elegida.q.R),1).padStart(12) + pct(ac(bCall.R),1).padStart(12) +
      pct(ac(bSPY.R),1).padStart(10) + String(I.length).padStart(6)); } }
console.log("");
