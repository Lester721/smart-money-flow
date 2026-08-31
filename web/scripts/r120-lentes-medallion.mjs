// ══ LOS LENTES DEL MEDALLION ══ Lester, 2026-08-28: «no encontramos cómo evitar la caída».
//
// ═══ POR QUÉ ESTO ES DISTINTO A LOS DIEZ INTENTOS ANTERIORES ═══════════════════════════════
//
// Régimen, miedo, frescura, freno del SPY, stops: TODOS eran «elegir cuándo operar».
// Un fondo de ese tipo no hace eso. Se come todas las señales y arregla LA CARTERA.
// Nosotros nunca hemos hecho construcción de cartera. Aquí se hace, con cuatro cosas:
//
//   0. MARCAR A MERCADO. r109 valoraba lo abierto AL COSTE (línea 111): la caída del −43%
//      era realizada, no la de pantalla. Primero hay que medir la de verdad.
//   1. DESCOMPONER EL FACTOR. ¿el +12,21% es alfa o es el mercado apalancado?
//      Regresión de la cartera contra SPY. Si es todo beta, la única palanca es el tamaño
//      y se acabó el camino. Eso también es una respuesta.
//   2. CUBRIR LA BETA. Vender SPY por la beta medida en ventana MÓVIL (sin mirar al futuro).
//   3. OBJETIVO DE VOLATILIDAD. Encoger cuando la volatilidad sube. Ojo: en r118 medimos
//      lo CONTRARIO (doblar con miedo alto). Esto nunca se probó.
//   4. REPARTIR LAS ENTRADAS. Hoy los 6 huecos se llenan el mismo día de caída y resuelven
//      juntos: la cartera es UNA sola apuesta. Un tope de entradas nuevas por semana la parte.
//
// ═══ EL LISTÓN, Y ES EL QUE IMPORTA ════════════════════════════════════════════════════════
//
// Ninguna de esas cuatro vale nada si no le gana a PONER MENOS DINERO. Por eso no se comparan
// puntos sueltos: se barre el tamaño de cada idea y se dibuja su FRONTERA rendimiento/caída.
// Una idea sólo sirve si su frontera queda POR ENCIMA de la del caso base a la misma caída.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";

const { ops: OPS, spy: SPY } = JSON.parse(readFileSync(join(CACHE, "caminos-120d.json"), "utf8"));
const DD = Object.keys(SPY).sort();
const ms = (d) => Date.parse(d.slice(0,4) + "-" + d.slice(4,6) + "-" + d.slice(6,8) + "T00:00:00Z");
const ANOS = (ms(DD[DD.length - 1]) - ms(DD[0])) / (365.25 * 86400000);
const DIV_SPY = 0.013;
const D = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const pct = (x, n = 1) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(n) + "%";
const med = (X) => { const B = [...X].sort((a, b) => a - b); return B[Math.floor(B.length / 2)]; };

const SECTOR = { AAPL:"tec", AMD:"tec", MSFT:"tec", NVDA:"tec", INTC:"tec", CSCO:"tec", ORCL:"tec",
  CRM:"tec", META:"tec", PYPL:"tec", QQQ:"idx", SPY:"idx", JPM:"fin", BAC:"fin", BA:"ind", GE:"ind",
  DIS:"con", COST:"con", WMT:"con", NKE:"con", KO:"con", F:"con", XOM:"ene", PFE:"sal", UNH:"sal",
  WBA:"sal", T:"tel" };

// cada camino, indexado por fecha, para poder marcar a mercado cualquier día
for (const o of OPS) { o.m = new Map(o.camino); o.dSal = o.camino[o.camino.length - 1][0]; }
const POR_DIA = new Map();
for (const o of OPS) { if (!POR_DIA.has(o.dC)) POR_DIA.set(o.dC, []); POR_DIA.get(o.dC).push(o); }

// ══════════════════════════════════════════════════════════════════════════════════════════
// EL MOTOR. Idéntico a r109 en cómo elige y compra. Lo que cambia: las posiciones abiertas
// se valoran al PRECIO DE HOY, no a lo que costaron.
// ══════════════════════════════════════════════════════════════════════════════════════════
function simular({ capital = 60000, tam = 0.15, huecos = 6, modo = "spy",
                   cubrir = false, volObj = 0, cadencia = 0, topeSector = 0, hasta = null } = {}) {
  const intD = Math.pow(1.033, 1 / 252) - 1, divD = Math.pow(1 + DIV_SPY, 1 / 252) - 1;
  const dias = hasta ? DD.filter((d) => d <= hasta) : DD;
  let caja = capital, acc = 0, ab = [], tom = [];
  let cortoSPY = 0, betaHat = 0;
  const V = [], RB = [], RS = [], nuevas = [];
  let pico = capital, peor = 0, sInv = 0;

  for (let t = 0; t < dias.length; t++) {
    const hoy = dias[t], p = SPY[hoy];
    if (modo === "spy") acc *= (1 + divD); else caja *= (1 + intD);
    if (cubrir && t > 0) caja += cortoSPY * (SPY[dias[t - 1]] - p);   // P&L del corto de SPY

    // ── 1. marcar a mercado. Si un día falta en el camino se ARRASTRA el último conocido:
    //       coger el multiplicador final sería mirar al futuro.
    const antes = ab.reduce((a, o) => a + o.dinero * o.ultMult, 0);
    for (const o of ab) { const m = o.m.get(hoy); if (m != null) o.ultMult = m; }
    const despues = ab.reduce((a, o) => a + o.dinero * o.ultMult, 0);
    if (antes > 0) { RB.push(despues / antes - 1); RS.push(t > 0 ? p / SPY[dias[t - 1]] - 1 : 0); }

    // ── 2. cerrar lo que sale hoy ──
    for (let i = ab.length - 1; i >= 0; i--) if (ab[i].dSal <= hoy) { caja += ab[i].dinero * ab[i].ultMult; ab.splice(i, 1); }

    // ── 3. recolocar la cobertura los lunes, con beta de ventana MÓVIL ──
    if (cubrir) {
      if (t % 5 === 0 && RB.length >= 120) {
        const b = RB.slice(-120), s = RS.slice(-120);
        const mb = b.reduce((a, x) => a + x, 0) / b.length, msp = s.reduce((a, x) => a + x, 0) / s.length;
        let num = 0, den = 0;
        for (let i = 0; i < b.length; i++) { num += (b[i] - mb) * (s[i] - msp); den += (s[i] - msp) ** 2; }
        betaHat = den > 0 ? Math.max(0, num / den) : 0; }
      cortoSPY = betaHat * ab.reduce((a, o) => a + o.dinero * o.ultMult, 0) / p; }

    // ── 4. objetivo de volatilidad: encoger lo NUEVO cuando la cuenta va agitada ──
    let escala = 1;
    if (volObj > 0 && V.length >= 60) {
      const r = [];
      for (let i = V.length - 59; i < V.length; i++) r.push(V[i] / V[i - 1] - 1);
      const m = r.reduce((a, x) => a + x, 0) / r.length;
      const sd = Math.sqrt(r.reduce((a, x) => a + (x - m) ** 2, 0) / (r.length - 1)) * Math.sqrt(252);
      escala = Math.max(0.20, Math.min(1, volObj / Math.max(0.01, sd))); }

    // ── 5. abrir ──
    const corte = dias[Math.max(0, t - 21)];
    for (const x of (POR_DIA.get(hoy) || []).slice().sort((a, b) => a.ma - b.ma)) {
      if (ab.length >= huecos) break;
      if (ab.some((o) => o.tk === x.tk)) continue;
      if (cadencia > 0 && nuevas.filter((f) => f > corte).length >= cadencia) break;
      if (topeSector > 0 && ab.filter((o) => SECTOR[o.tk] === SECTOR[x.tk]).length >= topeSector) continue;
      const libro = ab.reduce((a, o) => a + o.dinero * o.ultMult, 0);
      const patr = caja + acc * p + libro;
      const tope = patr * tam * escala;
      if (modo === "spy") { const falta = Math.min(tope, patr) - caja;
        if (falta > 0 && acc > 0) { const v = Math.min(acc, falta / p); acc -= v; caja += v * p; } }
      const n = Math.floor(Math.min(tope, caja) / x.coste);
      if (n < 1) continue;
      const dinero = n * x.coste;
      caja -= dinero;
      ab.push({ ...x, dinero, ultMult: 1 });
      tom.push({ tk: x.tk, dC: x.dC, y: x.dC.slice(0, 4), dinero, mult: x.camino[x.camino.length - 1][1] });
      nuevas.push(hoy); }

    if (modo === "spy" && caja > 0) { acc += caja / p; caja = 0; }
    const libro = ab.reduce((a, o) => a + o.dinero * o.ultMult, 0);
    const v = caja + acc * p + libro;     // el corto ya está contado: su P&L entra en caja cada día
    V.push(v); sInv += libro / v;
    if (v > pico) pico = v; const dd = 1 - v / pico; if (dd > peor) peor = dd; }

  const final = V[V.length - 1];
  const R = []; for (let i = 1; i < V.length; i++) R.push(V[i] / V[i - 1] - 1);
  const m = R.reduce((a, x) => a + x, 0) / R.length;
  const sd = Math.sqrt(R.reduce((a, x) => a + (x - m) ** 2, 0) / (R.length - 1));
  return { final, cagr: 100 * (Math.pow(Math.max(final, 1) / capital, 1 / ANOS) - 1), caida: 100 * peor,
    sharpe: sd > 0 ? (m * 252 - 0.033) / (sd * Math.sqrt(252)) : 0, ops: tom.length, tom,
    invertido: 100 * sInv / V.length, V, R, RB, RS, betaHat }; }

// mediana de 21 capitales de partida: un solo punto baila hasta 4 puntos
function banda(cfg) {
  const A = [], C = [], S = [];
  for (let k = -10; k <= 10; k++) { const q = simular({ ...cfg, capital: 60000 * (1 + k * 0.0083) });
    A.push(q.cagr); C.push(q.caida); S.push(q.sharpe); }
  return { a: med(A), c: med(C), s: med(S) }; }

console.log("");
console.log("  ══ AUDIT ══");
console.log("  período: " + DD[0] + " → " + DD[DD.length - 1] + "  (" + ANOS.toFixed(1) + " años)");
console.log("  entradas disponibles: " + OPS.length.toLocaleString("en-US"));
const ctrl = simular({ tam: 0.15, huecos: 6, modo: "spy" });
const spySolo = 60000 * (SPY[DD[DD.length - 1]] / SPY[DD[0]]) * Math.pow(1 + DIV_SPY, ANOS);
const ctrl0 = simular({ tam: 0, huecos: 0, modo: "spy" });
console.log("  control sin señales = SPY con dividendos: " + D(ctrl0.final) + " vs " + D(spySolo) +
  (Math.abs(ctrl0.final - spySolo) < 900 ? "  ✓" : "  ⚠"));
console.log("  SPY solo: " + (100 * (Math.pow(spySolo / 60000, 1 / ANOS) - 1)).toFixed(1) +
  "% al año  ·  caída −" + (100 * (() => { let pi = 0, pe = 0; for (const d of DD) { if (SPY[d] > pi) pi = SPY[d];
    const x = 1 - SPY[d] / pi; if (x > pe) pe = x; } return pe; })()).toFixed(0) + "%");
console.log("");

// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("  ══ 0 · LA CAÍDA DE VERDAD ══  (r109 valoraba lo abierto al coste)");
console.log("");
console.log("  " + "configuración".padEnd(26) + "al año".padStart(9) + "caída REAL".padStart(12) +
  "caída r109".padStart(12) + "Sharpe".padStart(8));
for (const [nom, cfg] of [["6 huecos al 15%", { tam: 0.15, huecos: 6 }],
                          ["4 huecos al 25%", { tam: 0.25, huecos: 4 }],
                          ["10 huecos al 8%", { tam: 0.08, huecos: 10 }]]) {
  const b = banda({ ...cfg, modo: "spy" });
  console.log("  " + nom.padEnd(26) + (b.a.toFixed(1) + "%").padStart(9) +
    ("−" + b.c.toFixed(0) + "%").padStart(12) + "—".padStart(12) + b.s.toFixed(2).padStart(8)); }
console.log("");

// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("  ══ 1 · ¿ES ALFA O ES EL MERCADO APALANCADO? ══");
console.log("");
const base = simular({ tam: 0.15, huecos: 6, modo: "efectivo" });
function regresion(Y, X) {
  const n = Y.length, my = Y.reduce((a,x)=>a+x,0)/n, mx = X.reduce((a,x)=>a+x,0)/n;
  let num = 0, den = 0; for (let i = 0; i < n; i++) { num += (Y[i]-my)*(X[i]-mx); den += (X[i]-mx)**2; }
  const b = num/den, a = my - b*mx;
  let ssr = 0, sst = 0; for (let i = 0; i < n; i++) { const f = a + b*X[i]; ssr += (Y[i]-f)**2; sst += (Y[i]-my)**2; }
  const s2 = ssr/(n-2);
  return { alfa: a, beta: b, r2: 1 - ssr/sst, tb: b/Math.sqrt(s2/den),
           ta: a/Math.sqrt(s2*(1/n + mx*mx/den)), n }; }

// SPY alineado día a día con la cuenta
const RSPY = []; for (let i = 1; i < DD.length; i++) RSPY.push(SPY[DD[i]] / SPY[DD[i-1]] - 1);
const rg = regresion(base.R, RSPY);
console.log("  LA CUENTA ENTERA contra SPY, día a día (n=" + rg.n.toLocaleString("en-US") + "):");
console.log("    beta = " + rg.beta.toFixed(2) + "   → si SPY se mueve 1%, la cuenta se mueve " + rg.beta.toFixed(2) + "%");
console.log("    alfa = " + (100 * rg.alfa * 252).toFixed(1) + "% al año   (t=" + rg.ta.toFixed(2) +
  ")   → lo que queda al quitarle el mercado");
console.log("    R²   = " + (100 * rg.r2).toFixed(0) + "%   → SPY solo explica el " + (100 * rg.r2).toFixed(0) + "%");
console.log("");
const rgL = regresion(base.RB, base.RS);
console.log("  SÓLO EL LIBRO de opciones (n=" + rgL.n.toLocaleString("en-US") + "):");
console.log("    beta = " + rgL.beta.toFixed(2) + "   alfa = " + (100 * rgL.alfa * 252).toFixed(1) +
  "% al año (t=" + rgL.ta.toFixed(2) + ")   R² = " + (100 * rgL.r2).toFixed(0) + "%");
console.log("");
// ── LA PREGUNTA QUE DECIDE: ¿son convexas? Una call debería subir más de lo que baja.
//    Si la beta de subida es MAYOR que la de bajada, la convexidad es real y sobrevive a
//    una cobertura lineal. Si no, esto es peor que un ETF apalancado.
const sub = [], subS = [], baj = [], bajS = [];
for (let i = 0; i < base.RB.length; i++) {
  if (base.RS[i] > 0) { sub.push(base.RB[i]); subS.push(base.RS[i]); }
  else if (base.RS[i] < 0) { baj.push(base.RB[i]); bajS.push(base.RS[i]); } }
const rU = regresion(sub, subS), rD = regresion(baj, bajS);
console.log("  ¿SON CONVEXAS? (una call tiene que subir más de lo que baja)");
console.log("    beta los días que SPY SUBE : " + rU.beta.toFixed(2) + "   (n=" + rU.n.toLocaleString("en-US") + ")");
console.log("    beta los días que SPY BAJA : " + rD.beta.toFixed(2) + "   (n=" + rD.n.toLocaleString("en-US") + ")");
console.log("    diferencia = " + (rU.beta - rD.beta).toFixed(2) +
  (rU.beta > rD.beta ? "   → sí hay convexidad: sube más de lo que baja"
                     : "   → NO hay convexidad: baja igual o más de lo que sube ⛔"));
console.log("");

// ══ VALIDACIÓN DE LA CAÍDA DEL −84% ══
console.log("  ══ VALIDAR LA CAÍDA ══  ¿cuándo pasa, y cuadra con la aritmética?");
const q = simular({ tam: 0.15, huecos: 6, modo: "spy" });
let pico = 60000, iPico = 0, peor = 0, dIni = "", dFin = "";
for (let i = 0; i < q.V.length; i++) { if (q.V[i] > pico) { pico = q.V[i]; iPico = i; }
  const dd = 1 - q.V[i] / pico; if (dd > peor) { peor = dd; dIni = DD[iPico]; dFin = DD[i]; } }
console.log("  peor tramo: " + dIni + " → " + dFin + "   " + D(pico) + " → " + D(pico * (1 - peor)) +
  "   (−" + (100 * peor).toFixed(0) + "%)");
console.log("  aritmética: SPY cayó −34% · beta del libro " + rgL.beta.toFixed(2) + " · invertido de media " +
  q.invertido.toFixed(0) + "%  →  −" + Math.min(99, 34 * rgL.beta * q.invertido / 100).toFixed(0) + "% esperado");
console.log("");
console.log("  " + "año".padEnd(7) + "valor".padStart(13) + "% del año".padStart(11) + "peor caída del año".padStart(20));
for (const y of ["2016","2017","2018","2019","2020","2021","2022","2023","2024","2025","2026"]) {
  const idx = DD.map((d, i) => [d, i]).filter(([d]) => d.startsWith(y)).map(([, i]) => i);
  if (!idx.length) continue;
  const v0 = idx[0] === 0 ? 60000 : q.V[idx[0] - 1], v1 = q.V[idx[idx.length - 1]];
  let pk = v0, pr = 0; for (const i of idx) { if (q.V[i] > pk) pk = q.V[i]; const d = 1 - q.V[i] / pk; if (d > pr) pr = d; }
  console.log("  " + y.padEnd(7) + D(v1).padStart(13) + pct(100 * (v1 / v0 - 1), 0).padStart(11) +
    ("−" + (100 * pr).toFixed(0) + "%").padStart(20)); }
console.log("");

// ══════════════════════════════════════════════════════════════════════════════════════════
// EL CONTROL QUE LO DECIDE TODO: SPY APALANCADO CON MARGEN AL 5%.
// Si un ETF comprado a crédito da lo mismo con la misma caída, la estrategia no aporta nada.
// Se reajusta el apalancamiento cada mes (como haría cualquiera) y se paga el interés del margen.
// ══════════════════════════════════════════════════════════════════════════════════════════
function spyApalancado(L) {
  const iD = Math.pow(1.05, 1/252) - 1, divD = Math.pow(1 + DIV_SPY, 1/252) - 1;
  let cap = 60000, exp = cap * L, deuda = exp - cap;
  const V = [cap]; let pico = cap, peor = 0;
  for (let t = 1; t < DD.length; t++) {
    const r = SPY[DD[t]] / SPY[DD[t-1]] - 1 + divD;
    exp *= (1 + r); deuda *= (1 + iD);
    cap = exp - deuda;
    if (cap <= 0) { for (let k = t; k < DD.length; k++) V.push(0); return { V, cagr: -100, caida: 100 }; }
    if (t % 21 === 0) { exp = cap * L; deuda = exp - cap; }
    V.push(cap);
    if (cap > pico) pico = cap; const dd = 1 - cap / pico; if (dd > peor) peor = dd; }
  const R = []; for (let i = 1; i < V.length; i++) R.push(V[i] / V[i-1] - 1);
  const m = R.reduce((a,x)=>a+x,0)/R.length;
  const sd = Math.sqrt(R.reduce((a,x)=>a+(x-m)**2,0)/(R.length-1));
  return { V, final: cap, cagr: 100 * (Math.pow(cap/60000, 1/ANOS) - 1), caida: 100 * peor,
           sharpe: (m*252 - 0.033)/(sd*Math.sqrt(252)) }; }

console.log("  ══ 2 · EL CONTROL: SPY A CRÉDITO (margen al 5%, reajustado cada mes) ══");
console.log("");
console.log("  " + "apalancamiento".padEnd(18) + "al año".padStart(9) + "caída".padStart(9) + "Sharpe".padStart(9) + "final".padStart(13));
for (const L of [1, 1.5, 2, 2.5, 3]) {
  const r = spyApalancado(L);
  console.log("  " + (L.toFixed(1) + "x SPY").padEnd(18) + (r.cagr.toFixed(1) + "%").padStart(9) +
    ("−" + r.caida.toFixed(0) + "%").padStart(9) + r.sharpe.toFixed(2).padStart(9) + D(r.final).padStart(13)); }
console.log("");

// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("  ══ 3 · LA FRONTERA ══  cada idea barrida por tamaño. Sólo sirve si a la MISMA caída rinde más.");
console.log("");
const IDEAS = [
  ["base",                     {}],
  ["cubrir la beta",           { cubrir: true }],
  ["objetivo de vol 25%",      { volObj: 0.25 }],
  ["objetivo de vol 40%",      { volObj: 0.40 }],
  ["máx 2 entradas/mes",       { cadencia: 2 }],
  ["máx 4 entradas/mes",       { cadencia: 4 }],
  ["máx 2 por sector",         { topeSector: 2 }],
];
const TAM = [[4,0.04],[6,0.04],[8,0.04],[10,0.04],[10,0.06],[10,0.08],[8,0.10],[6,0.10],[10,0.12],[6,0.15],[8,0.15],[4,0.25]];
const FRONT = {};
for (const [nom, cfg] of IDEAS) {
  const pts = [];
  for (const [h, tm] of TAM) {
    const b = banda({ ...cfg, tam: tm, huecos: h, modo: "spy" });
    pts.push({ h, tm, a: b.a, c: b.c, s: b.s }); }
  FRONT[nom] = pts; }
// la frontera de SPY apalancado, para tenerla en la misma escala
const FSPY = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 3].map((L) => { const r = spyApalancado(L); return { L, a: r.cagr, c: r.caida }; });

function alACaida(pts, obj) {   // mejor rendimiento entre las configuraciones que NO pasan de esa caída
  const ok = pts.filter((x) => x.c <= obj); if (!ok.length) return null;
  return ok.sort((a, b) => b.a - a.a)[0]; }

console.log("  " + "idea".padEnd(24) + "caída ≤40%".padStart(13) + "caída ≤50%".padStart(13) +
  "caída ≤60%".padStart(13) + "caída ≤70%".padStart(13));
for (const [nom] of IDEAS) {
  let l = "  " + nom.padEnd(24);
  for (const obj of [40, 50, 60, 70]) { const x = alACaida(FRONT[nom], obj);
    l += (x ? x.a.toFixed(1) + "%" : "—").padStart(13); }
  console.log(l); }
let l = "  " + "SPY a crédito".padEnd(24);
for (const obj of [40, 50, 60, 70]) { const x = alACaida(FSPY, obj); l += (x ? x.a.toFixed(1) + "%" : "—").padStart(13); }
console.log(l);
console.log("  " + "comprar SPY y dormir".padEnd(24) + "14.9%".padStart(13) + " (caída −34%)".padStart(13));
console.log("");
console.log("  detalle de las mejores configuraciones de cada idea a caída ≤50%:");
console.log("  " + "idea".padEnd(24) + "huecos".padStart(8) + "tamaño".padStart(8) + "al año".padStart(9) + "caída".padStart(8) + "Sharpe".padStart(8));
for (const [nom] of IDEAS) { const x = alACaida(FRONT[nom], 50); if (!x) continue;
  console.log("  " + nom.padEnd(24) + String(x.h).padStart(8) + ((100*x.tm).toFixed(0)+"%").padStart(8) +
    (x.a.toFixed(1)+"%").padStart(9) + ("−"+x.c.toFixed(0)+"%").padStart(8) + x.s.toFixed(2).padStart(8)); }
console.log("");

// ══════════════════════════════════════════════════════════════════════════════════════════
// EL CARA A CARA. La rejilla anterior era gruesa: saltaba de −36% a −70% sin nada en medio,
// y eso deja rendimiento sin contar en las casillas de ≤50% y ≤60%. Aquí se barre fino
// y se compara contra SPY a crédito EMPAREJADO POR CAÍDA, no por apalancamiento.
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("  ══ 4 · CARA A CARA, EMPAREJADOS POR CAÍDA ══  (rejilla fina)");
console.log("");
const FINO = [];
for (const h of [4, 6, 8, 10, 12]) for (let tm = 0.03; tm <= 0.261; tm += 0.01) FINO.push([h, Math.round(tm*1000)/1000]);
const PTS = {};
for (const [nom, cfg] of IDEAS) {
  const pts = [];
  for (const [h, tm] of FINO) { const b = banda({ ...cfg, tam: tm, huecos: h, modo: "spy" });
    pts.push({ h, tm, a: b.a, c: b.c, s: b.s }); }
  PTS[nom] = pts; }
const FSPY2 = [];
for (let L = 1; L <= 3.01; L += 0.05) { const r = spyApalancado(L); FSPY2.push({ L: Math.round(L*100)/100, a: r.cagr, c: r.caida, s: r.sharpe }); }
const mejorEn = (pts, obj) => { const ok = pts.filter((x) => x.c <= obj); return ok.length ? ok.sort((a,b)=>b.a-a.a)[0] : null; };

console.log("  " + "idea".padEnd(24) + ["≤35%","≤45%","≤55%","≤65%","≤75%","≤85%"].map(x=>x.padStart(9)).join(""));
for (const [nom] of IDEAS) {
  let l = "  " + nom.padEnd(24);
  for (const obj of [35,45,55,65,75,85]) { const x = mejorEn(PTS[nom], obj); l += (x ? x.a.toFixed(1)+"%" : "—").padStart(9); }
  console.log(l); }
let ls = "  " + "SPY A CRÉDITO".padEnd(24);
for (const obj of [35,45,55,65,75,85]) { const x = mejorEn(FSPY2, obj); ls += (x ? x.a.toFixed(1)+"%" : "—").padStart(9); }
console.log(ls);
console.log("");
console.log("  ⚠️ ojo: en Robinhood el margen sobre acciones llega a 2x, no a 3x. Por encima de 2x");
console.log("     haría falta un ETF apalancado (SPXL), que reajusta A DIARIO y se desgasta más que esto.");
console.log("");

// ── Sharpe: no depende de dónde caiga la rejilla ──
console.log("  ══ SHARPE (esto no depende de la rejilla) ══");
const mejSh = {};
for (const [nom] of IDEAS) mejSh[nom] = PTS[nom].slice().sort((a,b)=>b.s-a.s)[0];
const shSPY = FSPY2.slice().sort((a,b)=>b.s-a.s)[0];
console.log("  " + "comprar SPY y dormir".padEnd(24) + (1.0).toFixed(2).padStart(8) + "  ← el listón");
for (const [nom] of IDEAS) { const x = mejSh[nom];
  console.log("  " + nom.padEnd(24) + (x.s / shSPY.s * shSPY.s).toFixed(2).padStart(8) +
    ("  (" + x.h + " huecos al " + (100*x.tm).toFixed(0) + "%, " + x.a.toFixed(1) + "% al año, −" + x.c.toFixed(0) + "%)")); }
console.log("  " + "SPY a crédito, mejor".padEnd(24) + shSPY.s.toFixed(2).padStart(8) + ("  (" + shSPY.L + "x)"));
console.log("");

// ══════════════════════════════════════════════════════════════════════════════════════════
// ¿Y LA CONVEXIDAD? Emparejados por caída, ¿tiene la estrategia mejor FORMA que el ETF?
// Eso es lo único que un apalancamiento lineal no puede copiar.
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("  ══ 5 · LA FORMA ══  emparejados a la misma caída, ¿quién tiene mejor cola?");
console.log("");
const objC = 62;
const eA = PTS["base"].filter((x) => x.c <= objC).sort((a,b)=>b.a-a.a)[0];
const qA = simular({ tam: eA.tm, huecos: eA.h, modo: "spy" });
const Lm = FSPY2.filter((x) => x.c <= objC).sort((a,b)=>b.a-a.a)[0];
const qB = spyApalancado(Lm.L);
function mensual(V) { const M = new Map();
  for (let i = 0; i < DD.length; i++) M.set(DD[i].slice(0,6), V[i]);
  const K = [...M.keys()].sort(), R = [];
  for (let i = 1; i < K.length; i++) R.push(100 * (M.get(K[i]) / M.get(K[i-1]) - 1));
  return R; }
const mA = mensual(qA.V), mB = mensual(qB.V);
function forma(R) { const n = R.length, m = R.reduce((a,x)=>a+x,0)/n;
  const sd = Math.sqrt(R.reduce((a,x)=>a+(x-m)**2,0)/(n-1));
  const sk = R.reduce((a,x)=>a+((x-m)/sd)**3,0)/n;
  const S = [...R].sort((a,b)=>a-b);
  return { m, sd, sk, p5: S[Math.floor(n*0.05)], p95: S[Math.floor(n*0.95)], peor: S[0], mejor: S[n-1],
    gan: 100 * R.filter((x)=>x>0).length / n }; }
const fA = forma(mA), fB = forma(mB);
console.log("  " + " ".repeat(26) + "la estrategia".padStart(16) + ("SPY a " + Lm.L + "x").padStart(16));
const fila = (n, a, b, d = 1) => console.log("  " + n.padEnd(26) + a.toFixed(d).padStart(16) + b.toFixed(d).padStart(16));
fila("rendimiento al año %", eA.a, Lm.a);
fila("caída máxima %", -eA.c, -Lm.c, 0);
fila("meses ganadores %", fA.gan, fB.gan, 0);
fila("mes mediano %", fA.m, fB.m, 2);
fila("SESGO (cola derecha)", fA.sk, fB.sk, 2);
fila("mejor mes %", fA.mejor, fB.mejor, 0);
fila("peor mes %", fA.peor, fB.peor, 0);
fila("mes malo típico (p5) %", fA.p5, fB.p5, 0);
fila("mes bueno típico (p95) %", fA.p95, fB.p95, 0);
console.log("");
console.log("  la estrategia = " + eA.h + " huecos al " + (100*eA.tm).toFixed(0) + "%   ·   n=" + mA.length + " meses");
console.log("");
