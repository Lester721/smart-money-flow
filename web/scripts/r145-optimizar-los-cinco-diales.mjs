// ══ LOS CINCO DIALES QUE NUNCA TOCAMOS ══ Lester, 2026-08-29: «¿puedes optimizar la estrategia?»
//
// Ya están barridos: profundidad, plazo, aguante, freno y tamaño. Quedan CINCO que se heredaron
// el primer día y no se han movido nunca:
//
//   1. LARGO DE LA MEDIA      20 días, porque sí
//   2. CUÁNTO POR DEBAJO      hoy basta con estar un 0,01% debajo — no hay umbral
//   3. EL SUELO               0,50x, heredado
//   4. TOPE DE GANANCIA       hoy no hay (quitarlo fue una de las dos mejoras grandes de agosto)
//   5. COSTE MÍNIMO           $5.000, y ya sabemos que DESPLAZA la elección de profundidad
//
// Los ficheros `largo-*` guardan TODOS los días (no filtran por media), así que el precio de
// cada ticker está completo y se puede reconstruir cualquier media sin bajar nada.
//
// ⚠️ Dos límites del dato, y se dicen antes de medir:
//    · el camino guardado está CORTADO en 0,50x → el suelo sólo se puede SUBIR, nunca bajar
//    · el fichero ya filtra a $5.000 → el coste mínimo sólo se puede SUBIR
//
// TODO se puntúa por VECINDARIO (r143): la mediana de la casilla y sus vecinas a un paso.
// Un pico rodeado de malos se hunde solo. Es lo que ha matado media docena de hallazgos hoy.
process.env.CAMINOS = "largo-p25-d400.json";
const M = await import("./motor-cartera.mjs");
const CAST = 0.5 * 0.0276, CAP = 60000;
const D = (x) => (x<0?"−$":"$")+Math.abs(Math.round(x)).toLocaleString("en-US");
const med = (X) => { const S=[...X].sort((a,b)=>a-b); return S[Math.floor(S.length/2)]; };
const A = "20201231", B = "20210101";
const spy1 = M.spyApalancado(1);

// ── el precio diario DE VERDAD (r146), no reconstruido desde las operaciones ──
//
// ⚠️ El primer intento reconstruía la serie desde el fichero de operaciones. Sólo tiene el 40%
// de los días de mercado, así que la «media de 20 sesiones» abarcaba unos 50 días de calendario
// y el punto de partida salía 13,1% en vez de 21,4%. Validado: 760 comprobaciones contra la
// `ma` guardada, 0 discrepancias.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";
const PXD = JSON.parse(readFileSync(join(CACHE, "precios-diarios.json"), "utf8"));
const LARGOS = [5, 10, 20, 30, 50, 100];
const MAS = new Map();                      // "tk|n" -> Map(fecha -> desviación contra la media)
for (const tk of Object.keys(PXD)) {
  const D2 = Object.keys(PXD[tk]).sort(), P = D2.map(d => PXD[tk][d]);
  for (const n of LARGOS) { const m = new Map();
    let suma = 0;
    for (let i = 0; i < D2.length; i++) {
      if (i >= n) { suma += P[i-1] - P[i-1-n]; m.set(D2[i], P[i]/(suma/n) - 1); }
      else if (i > 0) suma += P[i-1]; }
    MAS.set(tk+"|"+n, m); } }
const poner = (n, umbral) => { let ok = 0;
  for (const o of M.OPS) { const v = MAS.get(o.tk+"|"+n)?.get(o.dC);
    if (v == null || v >= umbral) { o.ma = 999; } else { o.ma = v; ok++; } }
  return ok; };

console.log("");
console.log("  ══ AUDIT ══");
console.log("  tickers: " + Object.keys(PXD).length + "  ·  días de precio de SPY: " + Object.keys(PXD.SPY).length);
{ // control: la media de 20 reconstruida tiene que reproducir el punto de partida de r144
  poner(20, 0); const b0 = M.banda({ tam:0.12, huecos:2, modo:"spy", plazo:120, castigo:CAST });
  console.log("  ✓ control: con la media de 20 el punto de partida da " + b0.a.toFixed(1) +
    "% (r144 dio 21,4%)  →  " + (Math.abs(b0.a - 21.4) < 1.5 ? "CUADRA ✓" : "NO CUADRA ⛔")); }
console.log("  medias precalculadas: " + LARGOS.join(", ") + " sesiones");
console.log("  ⚠️ el suelo sólo puede SUBIR de 0,50 (el camino está cortado ahí)");
console.log("  ⚠️ el coste mínimo sólo puede SUBIR de $5.000 (el fichero ya lo filtra)");
console.log("  EL LISTÓN — comprar SPY: " + spy1.cagr.toFixed(1) + "% · −" + spy1.caida.toFixed(0) +
  "% · Sharpe " + spy1.sharpe.toFixed(2) + " → " + D(spy1.final));
console.log("");
const BASE = { tam:0.12, huecos:2, modo:"spy", plazo:120, castigo:CAST };
poner(20, 0);
{ const b = M.banda(BASE), q = M.simular({...BASE, capital:CAP});
  console.log("  PUNTO DE PARTIDA (media 20, umbral 0%, suelo 0,50, sin tope, coste $5.000):");
  console.log("    " + b.a.toFixed(1) + "% al año · caída −" + b.c.toFixed(0) + "% · Sharpe " + b.s.toFixed(2) +
    " · " + q.ops + " ops · " + D(q.final)); }
console.log("");

function evaluar(cfg) {
  const T = M.banda(cfg), a = M.banda({...cfg, hasta:A}), b = M.banda({...cfg, desdeD:B});
  const q = M.simular({...cfg, capital:CAP});
  return { s:T.s, a:T.a, c:T.c, sA:a.s, sB:b.s, ops:q.ops, fin:q.final, exp:q.invertido }; }
const fila = (nom, r, extra="") => console.log("  " + nom.padEnd(22) + (r.a.toFixed(1)+"%").padStart(9) +
  ("−"+r.c.toFixed(0)+"%").padStart(8) + r.s.toFixed(2).padStart(8) + String(r.ops).padStart(6) +
  r.sA.toFixed(2).padStart(9) + r.sB.toFixed(2).padStart(9) + D(r.fin).padStart(13) + extra);
const cab = (t) => { console.log(""); console.log("  ══ " + t + " ══"); console.log("");
  console.log("  " + "".padEnd(22) + "al año".padStart(9) + "caída".padStart(8) + "Sharpe".padStart(8) +
    "ops".padStart(6) + "2016-20".padStart(9) + "2021-26".padStart(9) + "$60.000 →".padStart(13)); };

// ── 1 · EL LARGO DE LA MEDIA ──────────────────────────────────────────────────────────────
cab("1 · EL LARGO DE LA MEDIA");
const R1 = {};
for (const n of LARGOS) { poner(n, 0); R1[n] = evaluar(BASE); fila(n + " sesiones", R1[n]); }
const orden1 = LARGOS.map(n=>R1[n].s);
console.log("");
console.log("  ¿es liso? " + orden1.map(x=>x.toFixed(2)).join(" → ") +
  "   dispersión " + (Math.max(...orden1)-Math.min(...orden1)).toFixed(2));

// ── 2 · CUÁNTO POR DEBAJO ─────────────────────────────────────────────────────────────────
cab("2 · CUÁNTO POR DEBAJO DE LA MEDIA (con la media de 20)");
const UMB = [0, -0.02, -0.04, -0.06, -0.10];
const R2 = {};
for (const u of UMB) { const n = poner(20, u); R2[u] = evaluar(BASE);
  fila(u === 0 ? "sólo por debajo" : "más de " + (-100*u).toFixed(0) + "% debajo", R2[u]); }
const orden2 = UMB.map(u=>R2[u].s);
console.log("");
console.log("  ¿es liso? " + orden2.map(x=>x.toFixed(2)).join(" → ") +
  "   dispersión " + (Math.max(...orden2)-Math.min(...orden2)).toFixed(2));

// ── 3 · EL SUELO ──────────────────────────────────────────────────────────────────────────
cab("3 · EL SUELO (sólo puede subir de 0,50)");
poner(20, 0);
const SUE = [0, 0.55, 0.60, 0.70, 0.80];
const R3 = {};
for (const su of SUE) { R3[su] = evaluar({...BASE, suelo:su});
  fila(su === 0 ? "0,50 (el de ahora)" : su.toFixed(2) + "x", R3[su]); }
const orden3 = SUE.map(s=>R3[s].s);
console.log("");
console.log("  ¿es liso? " + orden3.map(x=>x.toFixed(2)).join(" → ") +
  "   dispersión " + (Math.max(...orden3)-Math.min(...orden3)).toFixed(2));

// ── 4 · TOPE DE GANANCIA ──────────────────────────────────────────────────────────────────
cab("4 · TOPE DE GANANCIA");
const TOP = [0, 1.5, 2.0, 2.5, 3.0, 4.0];
const R4 = {};
for (const tp of TOP) { R4[tp] = evaluar({...BASE, topeGanancia:tp});
  fila(tp === 0 ? "sin tope (el de ahora)" : tp.toFixed(1) + "x", R4[tp]); }
const orden4 = TOP.map(t=>R4[t].s);
console.log("");
console.log("  ¿es liso? " + orden4.map(x=>x.toFixed(2)).join(" → ") +
  "   dispersión " + (Math.max(...orden4)-Math.min(...orden4)).toFixed(2));

// ── 5 · COSTE MÍNIMO ──────────────────────────────────────────────────────────────────────
cab("5 · COSTE MÍNIMO DEL CONTRATO (sólo puede subir de $5.000)");
const CM = [0, 6000, 7000, 8000, 10000];
const R5 = {};
for (const c of CM) { R5[c] = evaluar({...BASE, costeMin:c});
  fila(c === 0 ? "$5.000 (el de ahora)" : D(c), R5[c]); }
const orden5 = CM.map(c=>R5[c].s);
console.log("");
console.log("  ¿es liso? " + orden5.map(x=>x.toFixed(2)).join(" → ") +
  "   dispersión " + (Math.max(...orden5)-Math.min(...orden5)).toFixed(2));
console.log("");
console.log("  ── VEREDICTO POR DIAL ──");
for (const [nom, orden] of [["largo de la media", orden1], ["cuánto por debajo", orden2],
                            ["el suelo", orden3], ["tope de ganancia", orden4], ["coste mínimo", orden5]]) {
  const d = Math.max(...orden) - Math.min(...orden);
  const mejor = orden.indexOf(Math.max(...orden));
  const enBorde = mejor === 0 || mejor === orden.length-1;
  console.log("  " + nom.padEnd(22) + "dispersión " + d.toFixed(2) +
    (d < 0.10 ? "   → PLANO: da igual, dejarlo como está"
     : enBorde ? "   → el mejor está en el BORDE: puede que el dial siga"
     : "   → hay un pico DENTRO: cuidado, comprobar vecinos")); }
console.log("");
