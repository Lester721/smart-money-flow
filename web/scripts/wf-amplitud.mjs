// ══════════════════════════════════════════════════════════════════════════════════════════
// wf-amplitud.mjs — ¿EL ESTADO DEL MERCADO (amplitud / dispersión / correlación) DICE
//                   QUÉ TAMAÑO PONER EN "LA PALANCA"?
//
// Familia: variables CROSS-SECTIONALES construidas con los 27 tickers de precios-diarios.json
//   · AMPLITUD  : fracción de los 27 por debajo de su media de 20 / 50 / 200
//   · DISPERSIÓN: desviación típica ENTRE nombres de los retornos a 20 días
//   · CORRELACIÓN media por pares, ventana móvil de 60 días
//   · MÁX/MÍN   : (# en máximos de 52 semanas − # en mínimos) / N
//
// Mecanismo propuesto: correlación alta ⇒ la cartera de 2 posiciones es UNA sola apuesta
//   ⇒ ir pequeño.  Dispersión alta ⇒ "las 2 más hundidas" discrimina más ⇒ ir grande.
//
// ⛔ DISCIPLINAS APLICADAS
//   1. Todo dato de la fecha t se calcula con cierres ESTRICTAMENTE < t (desfase de 1 día).
//      Percentiles con ventana MÓVIL de 504 sesiones (2 años). Nunca sobre toda la historia.
//   2. El listón es el TAMAÑO CONSTANTE, EMPAREJADO POR EXPOSICIÓN, no el cero.
//   3. Nunca se cita media muestra. Período completo y banda de 41 capitales.
//   4. Se enseña el BARRIDO ENTERO con su dispersión. Un pico con vecinos malos es ruido.
//   5. Se comprueba que el mando MUEVE algo (valores extremos) y que la copia del bucle
//      reproduce M.simular al último dígito cuando el tamaño es constante.
//
// ⚠️ LIMPIEZA DE DATOS — precios-diarios.json viene SIN AJUSTAR por splits.
//   Se neutraliza CAUSALMENTE (el día que pasa, con el dato de ese día, nunca hacia atrás)
//   cualquier retorno diario con |r| ≥ 45 %. Ver el bloque LIMPIEZA.
// ══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";

process.env.CAMINOS = "largo-p25-d400.json";
const M = await import("./motor-cartera.mjs");
const { OPS, SPY, DD } = M;

// sólo días por debajo de la media de 20 (marca de r122: 999 = no elegible)
for (const o of OPS) if (o.ma >= 0) o.ma = 999;

const f2 = (x, n = 2) => (x == null || !isFinite(x) ? "  n/a" : x.toFixed(n));
const med = (X) => { const B = [...X].sort((a, b) => a - b); return B[Math.floor(B.length / 2)]; };
const sd = (X) => { const m = X.reduce((a, x) => a + x, 0) / X.length;
  return Math.sqrt(X.reduce((a, x) => a + (x - m) ** 2, 0) / Math.max(1, X.length - 1)); };
const linea = (s) => console.log("\n" + s + "\n" + "─".repeat(Math.max(60, s.length)));

// ══════════════════════════════════════════════════════════════════════════════════════════
// 0. COPIA DEL BUCLE DE CARTERA, con el tamaño como FUNCIÓN DEL DÍA
//    Copiada de motor-cartera.mjs línea a línea. El ÚNICO cambio: `tam` pasa de número a
//    tamF(fecha). Se verifica abajo que con tamF constante da el mismo número que M.simular.
// ══════════════════════════════════════════════════════════════════════════════════════════
const POR_DIA = new Map();
for (const o of OPS) { if (!POR_DIA.has(o.dC)) POR_DIA.set(o.dC, []); POR_DIA.get(o.dC).push(o); }
const msf = (d) => Date.parse(d.slice(0, 4) + "-" + d.slice(4, 6) + "-" + d.slice(6, 8) + "T00:00:00Z");
const DIV_SPY = 0.013;

function simVar({ capital = 60000, tamF, huecos = 2, plazo = 120, castigo = 0.0138 } = {}) {
  const kC = 1 + castigo / 2, kM = (1 - castigo / 2) / (1 + castigo / 2);
  const divD = Math.pow(1 + DIV_SPY, 1 / 252) - 1;
  const dias = DD;
  let caja = capital, acc = 0, ab = [];
  const V = []; let pico = capital, peor = 0, sInv = 0, nOps = 0;
  const abiertas = [];                       // registro: fecha + tamaño usado

  for (let t = 0; t < dias.length; t++) {
    const hoy = dias[t], p = SPY[hoy];
    acc *= (1 + divD);
    for (const o of ab) { const m = o.m.get(hoy); if (m != null) o.ultMult = m * kM; }
    for (let i = ab.length - 1; i >= 0; i--) if (ab[i].dSal <= hoy) { caja += ab[i].dinero * ab[i].ultMult; ab.splice(i, 1); }

    const tam = tamF(hoy, t);
    for (const x of (POR_DIA.get(hoy) || []).slice().sort((a, b) => a.ma - b.ma)) {
      if (ab.length >= huecos) break;
      if (x.ma >= 0) continue;
      if (ab.some((o) => o.tk === x.tk)) continue;
      const libro = ab.reduce((a, o) => a + o.dinero * o.ultMult, 0);
      const patr = caja + acc * p + libro;
      const tope = patr * tam;
      const falta = Math.min(tope, patr) - caja;
      if (falta > 0 && acc > 0) { const v = Math.min(acc, falta / p); acc -= v; caja += v * p; }
      const costeR = x.coste * kC;
      const n = Math.floor(Math.min(tope, caja) / costeR);
      if (n < 1) continue;
      const dinero = n * costeR;
      caja -= dinero;
      let iFin = (plazo > 0 && plazo < x.camino.length) ? plazo - 1 : x.camino.length - 1;
      const nS = x.camino[iFin][0];
      ab.push({ ...x, dinero, ultMult: kM, dSal: nS });
      nOps++; abiertas.push({ d: hoy, tk: x.tk, tam, dinero }); }

    if (caja > 0) { acc += caja / p; caja = 0; }
    const libro = ab.reduce((a, o) => a + o.dinero * o.ultMult, 0);
    const v = caja + acc * p + libro;
    V.push(v); sInv += libro / v;
    if (v > pico) pico = v; const dd = 1 - v / pico; if (dd > peor) peor = dd; }

  const final = V[V.length - 1];
  const R = []; for (let i = 1; i < V.length; i++) R.push(V[i] / V[i - 1] - 1);
  const m = R.reduce((a, x) => a + x, 0) / R.length;
  const s = Math.sqrt(R.reduce((a, x) => a + (x - m) ** 2, 0) / (R.length - 1));
  const anos = (msf(dias[dias.length - 1]) - msf(dias[0])) / (365.25 * 86400000);
  return { final, cagr: 100 * (Math.pow(Math.max(final, 1) / capital, 1 / anos) - 1),
    caida: 100 * peor, sharpe: s > 0 ? (m * 252 - 0.033) / (s * Math.sqrt(252)) : 0,
    ops: nOps, invertido: 100 * sInv / V.length, V, abiertas }; }

// banda de 41 capitales: 60000*(1+(i-20)*0.005)  ⇒  de 0,90× a 1,10×
function banda41(tamF, extra = {}) {
  const A = [], C = [], S = [], I = [], O = [];
  for (let i = 0; i <= 40; i++) {
    const q = simVar({ ...extra, tamF, capital: 60000 * (1 + (i - 20) * 0.005) });
    A.push(q.cagr); C.push(q.caida); S.push(q.sharpe); I.push(q.invertido); O.push(q.ops); }
  return { a: med(A), c: med(C), s: med(S), inv: med(I), ops: med(O),
    sMin: Math.min(...S), sMax: Math.max(...S), aMin: Math.min(...A), aMax: Math.max(...A) }; }

// ── verificación 1: la copia == el motor, con tamaño constante ──
linea("VERIFICACIÓN 1 — la copia del bucle reproduce M.simular (tamaño constante)");
for (const tam of [0.06, 0.12, 0.20]) {
  const a = M.simular({ tam, huecos: 2, modo: "spy", plazo: 120, castigo: 0.0138, capital: 60000 });
  const b = simVar({ tamF: () => tam, capital: 60000 });
  console.log(`tam ${tam}  motor: cagr ${a.cagr.toFixed(6)} caida ${a.caida.toFixed(6)} sharpe ${a.sharpe.toFixed(6)} ops ${a.ops}`);
  console.log(`          copia: cagr ${b.cagr.toFixed(6)} caida ${b.caida.toFixed(6)} sharpe ${b.sharpe.toFixed(6)} ops ${b.ops}   ${Math.abs(a.final - b.final) < 1e-6 ? "IDÉNTICO ✓" : "⚠️ DIFIERE"}`); }

// ══════════════════════════════════════════════════════════════════════════════════════════
// 1. LIMPIEZA DE PRECIOS — causal, mirando sólo el día en curso
// ══════════════════════════════════════════════════════════════════════════════════════════
const PRE = JSON.parse(readFileSync(join(CACHE, "precios-diarios.json"), "utf8"));
const TK = Object.keys(PRE);
const iDD = new Map(DD.map((d, i) => [d, i]));

// índice AJUSTADO: producto acumulado de retornos limpios. Un retorno con |r| ≥ 45 % se
// declara corporativo/print malo EL MISMO DÍA (dato de hoy, no del futuro) y se pone a 0.
// Cuesta neutralizar algún movimiento real enorme; a cambio mata los splits sin tabla previa.
const UMBRAL_SALTO = 0.45;
const ADJ = {}, saltos = [];
for (const tk of TK) {
  const dias = Object.keys(PRE[tk]).sort();
  const idx = {}; let nivel = 1, prev = null;
  for (const d of dias) {
    const p = PRE[tk][d];
    if (!(p > 0)) { prev = null; continue; }
    if (prev != null) { let r = p / prev - 1;
      if (Math.abs(r) >= UMBRAL_SALTO) { saltos.push([tk, d, r]); r = 0; }
      nivel *= (1 + r); }
    idx[d] = nivel; prev = p; }
  ADJ[tk] = idx; }
linea(`LIMPIEZA — retornos |r| ≥ ${(100 * UMBRAL_SALTO).toFixed(0)} % neutralizados (splits y prints malos)`);
console.log(`${saltos.length} eventos:`);
for (const [tk, d, r] of saltos) console.log(`   ${tk.padEnd(5)} ${d}  ${(100 * r).toFixed(0)} %`);

// ══════════════════════════════════════════════════════════════════════════════════════════
// 2. LAS VARIABLES, día a día, con datos de AYER hacia atrás
// ══════════════════════════════════════════════════════════════════════════════════════════
// serie alineada a DD por ticker (null donde no cotiza)
const S = {}; for (const tk of TK) S[tk] = DD.map((d) => ADJ[tk][d] ?? null);
// retornos diarios alineados
const RET = {}; for (const tk of TK) { const v = S[tk], r = new Array(DD.length).fill(null);
  for (let i = 1; i < DD.length; i++) if (v[i] != null && v[i - 1] != null) r[i] = v[i] / v[i - 1] - 1;
  RET[tk] = r; }

function mediaMovil(v, i, n) { let s = 0, k = 0;
  for (let j = i; j > i - n && j >= 0; j--) { if (v[j] == null) return null; s += v[j]; k++; }
  return k === n ? s / n : null; }

// VAR[nombre][i] con datos hasta el cierre del día i (luego se usa DESFASADO en i+1)
const VAR = { AMP20: [], AMP50: [], AMP200: [], DISP: [], CORR60: [], MAXMIN: [] };
for (let i = 0; i < DD.length; i++) {
  let n20 = 0, b20 = 0, n50 = 0, b50 = 0, n200 = 0, b200 = 0, nH = 0, nL = 0, nHL = 0;
  const r20 = [];
  for (const tk of TK) {
    const v = S[tk], p = v[i]; if (p == null) continue;
    const m20 = mediaMovil(v, i, 20); if (m20 != null) { n20++; if (p < m20) b20++; }
    const m50 = mediaMovil(v, i, 50); if (m50 != null) { n50++; if (p < m50) b50++; }
    const m200 = mediaMovil(v, i, 200); if (m200 != null) { n200++; if (p < m200) b200++; }
    if (i >= 20 && v[i - 20] != null) r20.push(p / v[i - 20] - 1);
    if (i >= 251) { let hi = -Infinity, lo = Infinity, ok = true;
      for (let j = i; j > i - 252; j--) { if (v[j] == null) { ok = false; break; } if (v[j] > hi) hi = v[j]; if (v[j] < lo) lo = v[j]; }
      if (ok) { nHL++; if (p >= hi * 0.999) nH++; if (p <= lo * 1.001) nL++; } } }
  VAR.AMP20.push(n20 >= 20 ? b20 / n20 : null);
  VAR.AMP50.push(n50 >= 20 ? b50 / n50 : null);
  VAR.AMP200.push(n200 >= 20 ? b200 / n200 : null);
  VAR.DISP.push(r20.length >= 20 ? sd(r20) : null);
  VAR.MAXMIN.push(nHL >= 20 ? (nH - nL) / nHL : null);

  // correlación media por pares en 60 días, por el truco de los retornos estandarizados:
  //   Σ_{i,j} corr_ij = (1/T) Σ_t (Σ_i z_it)²   ⇒   media fuera de la diagonal
  if (i < 60) { VAR.CORR60.push(null); continue; }
  const Z = [];
  for (const tk of TK) { const r = RET[tk]; const w = [];
    let ok = true; for (let j = i - 59; j <= i; j++) { if (r[j] == null) { ok = false; break; } w.push(r[j]); }
    if (!ok) continue;
    const m = w.reduce((a, x) => a + x, 0) / w.length;
    const s = Math.sqrt(w.reduce((a, x) => a + (x - m) ** 2, 0) / w.length);
    if (!(s > 0)) continue;
    Z.push(w.map((x) => (x - m) / s)); }
  if (Z.length < 15) { VAR.CORR60.push(null); continue; }
  const n = Z.length; let tot = 0;
  for (let t = 0; t < 60; t++) { let s = 0; for (let k = 0; k < n; k++) s += Z[k][t]; tot += s * s; }
  tot /= 60;
  VAR.CORR60.push((tot - n) / (n * (n - 1))); }

const NOMBRES = Object.keys(VAR);
linea("LAS VARIABLES — cobertura y estadística descriptiva");
console.log("variable   primer día   n     mín    p25    mediana   p75    máx");
for (const k of NOMBRES) {
  const v = VAR[k].map((x, i) => [x, i]).filter(([x]) => x != null);
  const val = v.map(([x]) => x).sort((a, b) => a - b);
  console.log(`${k.padEnd(9)}  ${DD[v[0][1]]}  ${String(val.length).padStart(4)}  ${f2(val[0], 3)}  ${f2(val[Math.floor(val.length * 0.25)], 3)}  ${f2(val[Math.floor(val.length * 0.5)], 3)}   ${f2(val[Math.floor(val.length * 0.75)], 3)}  ${f2(val[val.length - 1], 3)}`); }

// ── verificación 2: la correlación media, contra el cálculo por fuerza bruta, en 3 fechas ──
linea("VERIFICACIÓN 2 — CORR60 por el truco vs. fuerza bruta");
for (const i of [700, 1500, 2400]) {
  const cols = [];
  for (const tk of TK) { const r = RET[tk]; const w = []; let ok = true;
    for (let j = i - 59; j <= i; j++) { if (r[j] == null) { ok = false; break; } w.push(r[j]); }
    if (ok) cols.push(w); }
  let s = 0, c = 0;
  for (let a = 0; a < cols.length; a++) for (let b = a + 1; b < cols.length; b++) {
    const x = cols[a], y = cols[b];
    const mx = x.reduce((p, q) => p + q, 0) / 60, my = y.reduce((p, q) => p + q, 0) / 60;
    let nu = 0, dx = 0, dy = 0;
    for (let t = 0; t < 60; t++) { nu += (x[t] - mx) * (y[t] - my); dx += (x[t] - mx) ** 2; dy += (y[t] - my) ** 2; }
    s += nu / Math.sqrt(dx * dy); c++; }
  console.log(`${DD[i]}  truco ${f2(VAR.CORR60[i], 5)}   fuerza bruta ${f2(s / c, 5)}   pares ${c}`); }

// ══════════════════════════════════════════════════════════════════════════════════════════
// 3. PERCENTIL CON VENTANA MÓVIL DE 2 AÑOS, Y DESFASE DE 1 DÍA
// ══════════════════════════════════════════════════════════════════════════════════════════
const W = 504;
const PCT = {};
for (const k of NOMBRES) {
  const v = VAR[k], p = new Array(DD.length).fill(null);
  for (let i = 0; i < DD.length; i++) {
    if (v[i] == null) continue;
    const w = [];
    for (let j = i; j > i - W && j >= 0; j--) if (v[j] != null) w.push(v[j]);
    if (w.length < W) continue;                    // exige 2 años COMPLETOS de historia
    let c = 0; for (const x of w) if (x < v[i]) c++;
    p[i] = c / w.length; }
  // DESFASE: el percentil que se usa el día i es el calculado con el cierre del día i−1
  const q = new Array(DD.length).fill(null);
  for (let i = 1; i < DD.length; i++) q[i] = p[i - 1];
  PCT[k] = q; }

linea("ARRANQUE de cada regla (primer día con percentil disponible) y reparto de las 47 aperturas");
const cte12 = simVar({ tamF: () => 0.12, capital: 60000 });
const APER = cte12.abiertas.map((x) => x.d);
console.log(`aperturas del tamaño constante 0,12 : ${APER.length}  (${APER[0]} … ${APER[APER.length - 1]})`);
for (const k of NOMBRES) {
  const i0 = PCT[k].findIndex((x) => x != null);
  const dentro = APER.filter((d) => PCT[k][iDD.get(d)] != null).length;
  console.log(`${k.padEnd(8)} arranca ${DD[i0]}   aperturas CON señal: ${String(dentro).padStart(2)} / ${APER.length}   (${APER.length - dentro} caen en el calentamiento)`); }

// ══════════════════════════════════════════════════════════════════════════════════════════
// 4. MECANISMO — ¿la variable predice el resultado de la OPERACIÓN? (n grande, no 47)
//    Se mira sobre TODAS las operaciones elegibles, no sólo las 47 que la cartera coge.
// ══════════════════════════════════════════════════════════════════════════════════════════
linea("MECANISMO — percentil de la variable vs. multiplicador a 120 días de CADA operación elegible");
const ELEG = OPS.filter((o) => o.ma < 0).map((o) => ({ d: o.dC,
  mult: o.camino[Math.min(119, o.camino.length - 1)][1] }));
console.log(`operaciones elegibles con camino: ${ELEG.length}`);
console.log("variable   n      t1(bajo)  t2       t3(alto)   pendiente(corr de rangos)");
for (const k of NOMBRES) {
  const X = [];
  for (const e of ELEG) { const i = iDD.get(e.d); if (i == null) continue;
    const p = PCT[k][i]; if (p == null) continue; X.push([p, e.mult]); }
  if (X.length < 100) { console.log(`${k.padEnd(9)}  n=${X.length} insuficiente`); continue; }
  X.sort((a, b) => a[0] - b[0]);
  const n = X.length, t = Math.floor(n / 3);
  const mm = (A) => A.reduce((a, x) => a + x[1], 0) / A.length;
  const m1 = mm(X.slice(0, t)), m2 = mm(X.slice(t, 2 * t)), m3 = mm(X.slice(2 * t));
  // correlación de Spearman entre percentil y multiplicador
  const rx = X.map((_, i) => i);
  const Y = X.map((x, i) => [x[1], i]).sort((a, b) => a[0] - b[0]);
  const ry = new Array(n); Y.forEach(([, i], r) => ry[i] = r);
  const mrx = (n - 1) / 2; let nu = 0, dxx = 0, dyy = 0;
  for (let i = 0; i < n; i++) { nu += (rx[i] - mrx) * (ry[i] - mrx); dxx += (rx[i] - mrx) ** 2; dyy += (ry[i] - mrx) ** 2; }
  const rho = nu / Math.sqrt(dxx * dyy);
  console.log(`${k.padEnd(9)} ${String(n).padStart(5)}  ${f2(m1, 3)}     ${f2(m2, 3)}    ${f2(m3, 3)}      ρ=${f2(rho, 3)}  (t≈${f2(rho * Math.sqrt(n - 2) / Math.sqrt(1 - rho * rho), 1)})`); }

// ══════════════════════════════════════════════════════════════════════════════════════════
// 5. EL LISTÓN — tamaño CONSTANTE en malla fina, con banda de 41 capitales
// ══════════════════════════════════════════════════════════════════════════════════════════
linea("EL LISTÓN — tamaño CONSTANTE (banda de 41 capitales, mediana)");
console.log("tam    exposición%  CAGR%   caída%  Sharpe   [Sharpe mín…máx de la banda]");
const CTE = [];
for (let tam = 0.02; tam <= 0.4001; tam += 0.02) {
  const b = banda41(() => tam);
  CTE.push({ tam, ...b });
  console.log(`${tam.toFixed(2)}   ${f2(b.inv, 1).padStart(9)}   ${f2(b.a, 2).padStart(6)}  ${f2(b.c, 1).padStart(6)}  ${f2(b.s, 3)}    [${f2(b.sMin, 3)} … ${f2(b.sMax, 3)}]`); }
const spy = M.spyApalancado(1);
console.log(`\ncomprar SPY:  CAGR ${spy.cagr.toFixed(2)} %  caída ${spy.caida.toFixed(1)} %  Sharpe ${spy.sharpe.toFixed(3)}`);

// interpolación del listón por EXPOSICIÓN (para emparejar dinero en juego)
CTE.sort((a, b) => a.inv - b.inv);
function listonEn(inv) {
  if (inv <= CTE[0].inv) return CTE[0];
  if (inv >= CTE[CTE.length - 1].inv) return CTE[CTE.length - 1];
  for (let i = 1; i < CTE.length; i++) if (CTE[i].inv >= inv) {
    const A = CTE[i - 1], B = CTE[i], w = (inv - A.inv) / (B.inv - A.inv);
    return { tam: A.tam + w * (B.tam - A.tam), a: A.a + w * (B.a - A.a),
      c: A.c + w * (B.c - A.c), s: A.s + w * (B.s - A.s), inv }; } }

// ══════════════════════════════════════════════════════════════════════════════════════════
// 6. LAS REGLAS DE TAMAÑO VARIABLE — barrido COMPLETO
// ══════════════════════════════════════════════════════════════════════════════════════════
const NEUTRO = 0.12;                              // tamaño durante el calentamiento
function reglaTres(k, a, b, lo, hi) {             // 3 escalones por percentil
  const P = PCT[k];
  return (d, i) => { const p = P[i]; if (p == null) return NEUTRO;
    return p < a ? lo : (p >= b ? hi : NEUTRO); }; }

const CORTES = [[0.20, 0.80], [0.25, 0.75], [0.30, 0.70], [1 / 3, 2 / 3], [0.40, 0.60]];
const PARES = [[0.06, 0.20], [0.08, 0.18], [0.04, 0.24]];   // (lo, hi) — y su inverso

const RES = [];
for (const k of NOMBRES) {
  linea(`BARRIDO — ${k}`);
  console.log("dirección                corte      lo→hi        exp%   CAGR%   caída%  Sharpe   listón@misma exp.   Δ Sharpe");
  for (const [lo, hi] of PARES) for (const dir of ["alto⇒GRANDE", "alto⇒pequeño"]) {
    for (const [a, b] of CORTES) {
      const L = dir === "alto⇒GRANDE" ? lo : hi, H = dir === "alto⇒GRANDE" ? hi : lo;
      const q = banda41(reglaTres(k, a, b, L, H));
      const li = listonEn(q.inv);
      const dS = q.s - li.s;
      // ⚠️ los cortes se guardan como ca/cb: `a` y `c` los pisa el spread de q (cagr/caída).
      //    Con `a`/`b` el resumen imprimía el CAGR donde debía ir el corte.
      RES.push({ k, dir, ca: a, cb: b, lo, hi, ...q, liS: li.s, liA: li.a, liC: li.c, dS });
      console.log(`${dir.padEnd(14)}  ${a.toFixed(2)}/${b.toFixed(2)}  ${lo.toFixed(2)}→${hi.toFixed(2)}   ` +
        `${f2(q.inv, 1).padStart(6)}  ${f2(q.a, 2).padStart(6)}  ${f2(q.c, 1).padStart(6)}  ${f2(q.s, 3)}    ` +
        `tam≈${f2(li.tam, 3)} S=${f2(li.s, 3)} C=${f2(li.a, 2)}    ${(dS >= 0 ? "+" : "") + f2(dS, 3)}`); } } }

// ══════════════════════════════════════════════════════════════════════════════════════════
// 7. RESUMEN — el mejor de cada variable, y la DISPERSIÓN de su vecindario
// ══════════════════════════════════════════════════════════════════════════════════════════
linea("RESUMEN — mejor regla por variable, y qué hacen sus VECINOS (¿pico o meseta?)");
console.log("variable   mejor Δ Sharpe   Sharpe regla   listón   |  Δ de las 5 reglas de la misma dirección/pareja");
for (const k of NOMBRES) {
  const G = RES.filter((r) => r.k === k);
  const best = G.reduce((a, b) => (b.dS > a.dS ? b : a));
  const vec = G.filter((r) => r.dir === best.dir && r.lo === best.lo).map((r) => r.dS);
  console.log(`${k.padEnd(9)}  ${(best.dS >= 0 ? "+" : "") + f2(best.dS, 3)}  (${best.dir} ${best.ca.toFixed(2)}/${best.cb.toFixed(2)} ${best.lo}→${best.hi})   ` +
    `S=${f2(best.s, 3)}  listón=${f2(best.liS, 3)}  | vecinos: ${vec.map((x) => f2(x, 3)).join(" ")}   media=${f2(vec.reduce((a, x) => a + x, 0) / vec.length, 3)}  sd=${f2(sd(vec), 3)}`); }

// media por FAMILIA (dirección × pareja): 5 cortes juntos. Mucho más robusto que el pico.
linea("MEDIA POR FAMILIA (los 5 cortes juntos) — el pico no vale, la meseta sí");
console.log("variable   dirección        lo→hi        media Δ    sd     cortes");
const FAM = [];
for (const k of NOMBRES) for (const dir of ["alto⇒GRANDE", "alto⇒pequeño"]) for (const [lo, hi] of PARES) {
  const G = RES.filter((r) => r.k === k && r.dir === dir && r.lo === lo && r.hi === hi).map((r) => r.dS);
  const m = G.reduce((a, x) => a + x, 0) / G.length;
  FAM.push({ k, dir, lo, hi, m });
  console.log(`${k.padEnd(9)}  ${dir.padEnd(14)}  ${lo.toFixed(2)}→${hi.toFixed(2)}   ${(m >= 0 ? "+" : "") + f2(m, 3)}   ${f2(sd(G), 3)}   ${G.map((x) => f2(x, 3)).join(" ")}`); }
const MEJOR_FAM = FAM.reduce((a, b) => (b.m > a.m ? b : a));
console.log(`\nmejor familia: ${MEJOR_FAM.k} ${MEJOR_FAM.dir} ${MEJOR_FAM.lo}→${MEJOR_FAM.hi}  media Δ = ${f2(MEJOR_FAM.m, 3)}`);

linea("DISPERSIÓN DEL BARRIDO ENTERO");
const todos = RES.map((r) => r.dS);
console.log(`${todos.length} reglas.  Δ Sharpe vs. listón emparejado:  mín ${f2(Math.min(...todos), 3)}  ` +
  `p25 ${f2([...todos].sort((a, b) => a - b)[Math.floor(todos.length * 0.25)], 3)}  ` +
  `mediana ${f2(med(todos), 3)}  p75 ${f2([...todos].sort((a, b) => a - b)[Math.floor(todos.length * 0.75)], 3)}  ` +
  `máx ${f2(Math.max(...todos), 3)}  sd ${f2(sd(todos), 3)}`);
console.log(`reglas que GANAN al listón emparejado: ${todos.filter((x) => x > 0).length} de ${todos.length}`);

// ══════════════════════════════════════════════════════════════════════════════════════════
// 8. VERIFICACIÓN 3 — el mando MUEVE algo (valores extremos)
// ══════════════════════════════════════════════════════════════════════════════════════════
linea("VERIFICACIÓN 3 — el mando mueve la cartera (extremos)");
for (const k of ["CORR60", "DISP"]) {
  const A = banda41(reglaTres(k, 1 / 3, 2 / 3, 0.02, 0.40));
  const B = banda41(reglaTres(k, 1 / 3, 2 / 3, 0.40, 0.02));
  console.log(`${k}: 0,02→0,40  exp ${f2(A.inv, 1)}  CAGR ${f2(A.a, 2)}  S ${f2(A.s, 3)}   |   0,40→0,02  exp ${f2(B.inv, 1)}  CAGR ${f2(B.a, 2)}  S ${f2(B.s, 3)}`); }

// ══════════════════════════════════════════════════════════════════════════════════════════
// 9. REPARTO — ¿sobre cuántas DECISIONES actúa realmente la regla?
// ══════════════════════════════════════════════════════════════════════════════════════════
linea("REPARTO — de las 47 aperturas, cuántas caen en cada cubo (cortes 1/3-2/3)");
console.log("variable   calentamiento   cubo bajo   cubo medio   cubo alto");
for (const k of NOMBRES) {
  let cal = 0, b = 0, m = 0, al = 0;
  for (const d of APER) { const p = PCT[k][iDD.get(d)];
    if (p == null) cal++; else if (p < 1 / 3) b++; else if (p >= 2 / 3) al++; else m++; }
  console.log(`${k.padEnd(9)}  ${String(cal).padStart(9)}   ${String(b).padStart(9)}   ${String(m).padStart(10)}   ${String(al).padStart(9)}`); }

// ══════════════════════════════════════════════════════════════════════════════════════════
// 10. HALLAZGO COLATERAL — los SPLITS contaminan la SELECCIÓN de la estrategia base
//     `ma` viene de la misma serie sin ajustar: el día del split el ticker aparece un 75 %
//     "por debajo de su media de 20", y el motor ordena por `ma` ASCENDENTE (el más hundido
//     primero). Un split es, literalmente, la señal más fuerte posible.
// ══════════════════════════════════════════════════════════════════════════════════════════
linea("HALLAZGO COLATERAL — contaminación por SPLITS en la estrategia base");
const VENT = new Map();                       // tk -> [i0, i1] ventana de 20 sesiones tras el salto
for (const [tk, d] of saltos) { const i = iDD.get(d); if (i == null) continue;
  if (!VENT.has(tk)) VENT.set(tk, []); VENT.get(tk).push([i, i + 19]); }
const sucio = (tk, d) => { const V = VENT.get(tk); if (!V) return false; const i = iDD.get(d);
  return i != null && V.some(([a, b]) => i >= a && i <= b); };
const elegSucias = OPS.filter((o) => o.ma < 0 && sucio(o.tk, o.dC));
console.log(`operaciones ELEGIBLES dentro de los 20 días posteriores a un split: ${elegSucias.length} de ${ELEG.length}`);
const maSucias = elegSucias.map((o) => o.ma).sort((a, b) => a - b);
if (maSucias.length) console.log(`   su 'ma' va de ${f2(maSucias[0], 3)} a ${f2(maSucias[maSucias.length - 1], 3)} (mediana ${f2(med(maSucias), 3)})`);
const tomSucias = cte12.abiertas.filter((x) => sucio(x.tk, x.d));
console.log(`de las 47 aperturas de la cartera, contaminadas: ${tomSucias.length}`);
for (const x of tomSucias) console.log(`   ${x.d}  ${x.tk}  $${Math.round(x.dinero).toLocaleString("en-US")}`);
// la cartera SIN esas entradas (exclusión causal: el salto se ve el mismo día)
const guardaMa = OPS.map((o) => o.ma);
for (const o of OPS) if (o.ma < 0 && sucio(o.tk, o.dC)) o.ma = 999;
for (const tam of [0.06, 0.12, 0.20]) {
  const b = banda41(() => tam);
  console.log(`SIN entradas de split  tam ${tam}:  exp ${f2(b.inv, 1)}  CAGR ${f2(b.a, 2)}  caída ${f2(b.c, 1)}  Sharpe ${f2(b.s, 3)}  (ops ${b.ops})`); }
OPS.forEach((o, i) => o.ma = guardaMa[i]);    // restaurar

// ══════════════════════════════════════════════════════════════════════════════════════════
// 11. EL PLACEBO — la prueba que decide
//     Se rota CIRCULARMENTE la serie de percentiles: misma distribución, misma persistencia,
//     pero desalineada del mercado. Si un "régimen" inventado saca lo mismo que el de verdad,
//     lo de verdad es ruido. Es el contraste correcto para "el mejor de 30 reglas".
// ══════════════════════════════════════════════════════════════════════════════════════════
linea("EL PLACEBO — 40 series de régimen FALSAS (rotación circular), mismo barrido de 30 reglas");
function rotar(P, off) {
  const idx = [], val = [];
  for (let i = 0; i < P.length; i++) if (P[i] != null) { idx.push(i); val.push(P[i]); }
  const n = val.length, out = new Array(P.length).fill(null);
  for (let j = 0; j < n; j++) out[idx[j]] = val[(j + off) % n];
  return out; }
function barrer(P) {                       // devuelve los 30 Δ y las 6 medias de familia
  const D = [], fam = [];
  const regla = (a, b, L, H) => (d, i) => { const p = P[i]; if (p == null) return NEUTRO;
    return p < a ? L : (p >= b ? H : NEUTRO); };
  for (const [lo, hi] of PARES) for (const dir of ["alto⇒GRANDE", "alto⇒pequeño"]) {
    const g = [];
    for (const [a, b] of CORTES) {
      const L = dir === "alto⇒GRANDE" ? lo : hi, H = dir === "alto⇒GRANDE" ? hi : lo;
      const q = banda41(regla(a, b, L, H));
      const d = q.s - listonEn(q.inv).s; D.push(d); g.push(d); }
    fam.push(g.reduce((x, y) => x + y, 0) / g.length); }
  return { max: Math.max(...D), fam: Math.max(...fam), todos: D }; }

const NSUR = 40;
const nulMax = [], nulFam = [];
const baseP = PCT.AMP50;                     // la de mecanismo más limpio; la rotación la desliga igual
const nVal = baseP.filter((x) => x != null).length;
for (let s = 0; s < NSUR; s++) {
  const off = Math.floor(((s + 1) * nVal) / (NSUR + 1));    // desplazamientos repartidos, reproducible
  const r = barrer(rotar(baseP, off));
  nulMax.push(r.max); nulFam.push(r.fam);
  process.stdout.write(`\r   placebo ${s + 1}/${NSUR}  máx ${f2(r.max, 3)}  fam ${f2(r.fam, 3)}      `); }
console.log("");
const ord = (X) => [...X].sort((a, b) => a - b);
const q = (X, p) => ord(X)[Math.floor((X.length - 1) * p)];
console.log(`\nNULO de "el mejor de 30 reglas":   mediana ${f2(med(nulMax), 3)}  p75 ${f2(q(nulMax, 0.75), 3)}  p90 ${f2(q(nulMax, 0.90), 3)}  máx ${f2(Math.max(...nulMax), 3)}`);
console.log(`NULO de "la mejor familia de 5":   mediana ${f2(med(nulFam), 3)}  p75 ${f2(q(nulFam, 0.75), 3)}  p90 ${f2(q(nulFam, 0.90), 3)}  máx ${f2(Math.max(...nulFam), 3)}`);
console.log("\nREAL, para comparar:");
for (const k of NOMBRES) {
  const G = RES.filter((r) => r.k === k);
  const mx = Math.max(...G.map((r) => r.dS));
  const fm = Math.max(...FAM.filter((f) => f.k === k).map((f) => f.m));
  const pMax = nulMax.filter((x) => x >= mx).length / NSUR;
  const pFam = nulFam.filter((x) => x >= fm).length / NSUR;
  console.log(`${k.padEnd(9)} mejor de 30 = ${(mx >= 0 ? "+" : "") + f2(mx, 3)}  (p=${pMax.toFixed(2)})    mejor familia = ${(fm >= 0 ? "+" : "") + f2(fm, 3)}  (p=${pFam.toFixed(2)})`); }

// ══════════════════════════════════════════════════════════════════════════════════════════
// 12. EL TECHO — ¿cuánto Sharpe hay ahí arriba, COMO MÁXIMO, para una variable de mercado?
//     ⚠️ ESTOS DOS ORÁCULOS MIRAN AL FUTURO A PROPÓSITO. No son una estrategia: son la cota
//     superior. Si el que ADIVINA saca poco, ninguna variable honesta puede sacar más.
// ══════════════════════════════════════════════════════════════════════════════════════════
linea("EL TECHO — oráculos que MIRAN AL FUTURO (cota superior, NO operables)");

// (a) oráculo de RÉGIMEN DE MERCADO: sabe el retorno de SPY a 120 días vista.
//     Es el techo exacto de MI familia: mis variables son de mercado, no de nombre.
const FWD = new Array(DD.length).fill(null);
for (let i = 0; i + 120 < DD.length; i++) FWD[i] = SPY[DD[i + 120]] / SPY[DD[i]] - 1;
const fwdOrd = FWD.filter((x) => x != null).sort((a, b) => a - b);
const fq = (p) => fwdOrd[Math.floor((fwdOrd.length - 1) * p)];

// (b) oráculo de OPERACIÓN: sabe cómo acaba la propia call que va a comprar hoy.
const MULT_DIA = new Map();
for (const o of OPS) { if (o.ma >= 0) continue;
  const m = o.camino[Math.min(119, o.camino.length - 1)][1];
  if (!MULT_DIA.has(o.dC) || o.ma < MULT_DIA.get(o.dC).ma) MULT_DIA.set(o.dC, { ma: o.ma, m }); }

console.log("oráculo                        lo→hi        exp%   CAGR%   caída%  Sharpe   listón@misma exp.  Δ Sharpe");
for (const [lo, hi] of [[0.06, 0.20], [0.04, 0.24], [0.02, 0.30]]) {
  const oRe = banda41((d, i) => { const f = FWD[i]; if (f == null) return NEUTRO;
    return f < fq(1 / 3) ? lo : (f >= fq(2 / 3) ? hi : NEUTRO); });
  const lRe = listonEn(oRe.inv);
  console.log(`régimen de mercado (SPY+120d)  ${lo.toFixed(2)}→${hi.toFixed(2)}   ${f2(oRe.inv, 1).padStart(6)}  ${f2(oRe.a, 2).padStart(6)}  ${f2(oRe.c, 1).padStart(6)}  ${f2(oRe.s, 3)}    S=${f2(lRe.s, 3)}  C=${f2(lRe.a, 2)}    ${(oRe.s - lRe.s >= 0 ? "+" : "") + f2(oRe.s - lRe.s, 3)}`);
  const oOp = banda41((d, i) => { const x = MULT_DIA.get(d); if (!x) return NEUTRO;
    return x.m < 1 ? lo : (x.m > 1.6 ? hi : NEUTRO); });
  const lOp = listonEn(oOp.inv);
  console.log(`operación concreta (mult 120d) ${lo.toFixed(2)}→${hi.toFixed(2)}   ${f2(oOp.inv, 1).padStart(6)}  ${f2(oOp.a, 2).padStart(6)}  ${f2(oOp.c, 1).padStart(6)}  ${f2(oOp.s, 3)}    S=${f2(lOp.s, 3)}  C=${f2(lOp.a, 2)}    ${(oOp.s - lOp.s >= 0 ? "+" : "") + f2(oOp.s - lOp.s, 3)}`); }

// ══════════════════════════════════════════════════════════════════════════════════════════
// 13. LA ENTRADA DE NVDA — comprobación del artefacto de split
// ══════════════════════════════════════════════════════════════════════════════════════════
linea("LA ENTRADA CONTAMINADA — NVDA 2021-08-06 (split 4:1 el 2021-07-20)");
const nv = OPS.filter((o) => o.tk === "NVDA" && o.dC >= "20210715" && o.dC <= "20210812");
const vistos = new Set();
for (const o of nv) { if (vistos.has(o.dC)) continue; vistos.add(o.dC);
  console.log(`   ${o.dC}  ma=${f2(o.ma, 4)}  spot=${o.spot}   (precio sin ajustar ${PRE.NVDA[o.dC]})`); }
console.log("\nel motor ordena por `ma` ASCENDENTE: el más 'hundido' entra primero.");
console.log("un split 4:1 mete un −75 % falso en la media de 20 ⇒ es la señal más fuerte que existe.");
