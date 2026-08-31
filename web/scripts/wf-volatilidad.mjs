// ══════════════════════════════════════════════════════════════════════════════════════════
// wf-volatilidad.mjs — ¿la VOLATILIDAD dice cuánto tamaño poner en LA PALANCA?
//
// LA PREGUNTA: el efecto del tamaño cambia de signo entre 2016-2020 y 2021-2026. ¿Hay alguna
// variable, conocida EN EL MOMENTO, que diga en qué régimen estamos para graduar el tamaño?
//
// LA FAMILIA QUE ME TOCA: volatilidad realizada e implícita.
//   · realizada a 20, 60 y 120 días (de precios-diarios.json)
//   · implícita: straddle ATM de SPY a ~30 días / spot / 0,8 × sqrt(365/dte)
//   · estructura temporal: implícita 30d contra ~90d
//   · prima de riesgo: implícita menos realizada
//
// DISCIPLINAS (se cumplen y se dice dónde):
//   1. SOLO DATOS PASADOS. Toda variable en la fecha t se calcula con datos ESTRICTAMENTE
//      anteriores a t (retardo de un día completo). Percentiles con ventana MÓVIL de 2 años.
//   2. EL LISTÓN ES EL TAMAÑO CONSTANTE, no cero. Y además comprar SPY.
//   3. Nunca se cita media muestra. Período completo y banda de 41 capitales.
//   4. Se enseña el BARRIDO ENTERO con su dispersión, no el pico.
//   5. Se comprueba que el mando MUEVE algo (valores extremos).
//   6. Se EMPAREJA por exposición media: cada regla se compara con el tamaño constante que
//      pone el mismo dinero en la calle.
//   7. Castigo de ejecución 0,0138 siempre.
// ══════════════════════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";
import { abrir } from "./datos.mjs";

process.env.CAMINOS = "largo-p25-d400.json";
const M = await import("./motor-cartera.mjs");
for (const o of M.OPS) if (o.ma >= 0) o.ma = 999;      // sólo días bajo la media de 20

const CAST = 0.0138, HUECOS = 2, PLAZO = 120, CAP = 60000;
const f2 = (x, n = 2) => (x == null || !isFinite(x) ? "  n/d" : x.toFixed(n));
const rell = (s, n) => String(s).padStart(n);

// ══════════════════════════════════════════════════════════════════════════════════════════
// 1. LAS VARIABLES
// ══════════════════════════════════════════════════════════════════════════════════════════
const CACHE_SERIE = join(CACHE, "_wf-vol-series.json");

function construirSerie() {
  console.log("  construyendo la serie de volatilidad desde las cadenas de SPY…");
  const P = JSON.parse(readFileSync(join(CACHE, "precios-diarios.json"), "utf8")).SPY;
  const D = Object.keys(P).sort();

  // ── volatilidad REALIZADA. r[i] = log(P[i]/P[i-1]). rvN en el día D[i] usa los N retornos
  //    que TERMINAN en D[i] (el último usa el cierre de D[i]). El retardo de un día se aplica
  //    después, al consumirla.
  const r = [0];
  for (let i = 1; i < D.length; i++) r.push(Math.log(P[D[i]] / P[D[i - 1]]));
  const rv = (i, N) => {
    if (i < N) return null;
    let s = 0, s2 = 0;
    for (let j = i - N + 1; j <= i; j++) { s += r[j]; s2 += r[j] * r[j]; }
    const m = s / N;
    return Math.sqrt(Math.max(0, (s2 - N * m * m) / (N - 1))) * Math.sqrt(252) * 100;
  };

  // ── volatilidad IMPLÍCITA del straddle ATM. Fórmula ya validada contra el VIX (r=0,986).
  const cad = abrir("cadenas", { callado: true });
  const diasCad = new Set(cad.dias("SPY"));
  const ms = (d) => Date.parse(d.slice(0, 4) + "-" + d.slice(4, 6) + "-" + d.slice(6, 8) + "T00:00:00Z");
  const DIA = 86400000;

  function ivDe(dia, spot, objetivo, lo, hi) {
    const c = cad.leer("SPY", dia);
    if (!c) return null;
    let mejorExp = null, mejorD = 1e9;
    for (const exp of Object.keys(c)) {
      const dte = Math.round((ms(exp) - ms(dia)) / DIA);
      if (dte < lo || dte > hi) continue;
      const d = Math.abs(dte - objetivo);
      if (d < mejorD) { mejorD = d; mejorExp = exp; }
    }
    if (!mejorExp) return null;
    const dte = Math.round((ms(mejorExp) - ms(dia)) / DIA);
    // strike más cercano al spot con call Y put cotizadas por los dos lados
    const filas = c[mejorExp];
    let K = null, dK = 1e9;
    for (const k of Object.keys(filas)) {
      const [sK, tipo] = k.split("|");
      if (tipo !== "C") continue;
      const cc = filas[k], pp = filas[sK + "|P"];
      if (!cc || !pp) continue;
      if (!(cc[0] > 0 && cc[1] > cc[0] && pp[0] > 0 && pp[1] > pp[0])) continue;
      const d = Math.abs(Number(sK) - spot);
      if (d < dK) { dK = d; K = sK; }
    }
    if (K == null || dK > spot * 0.03) return null;
    const strad = (filas[K + "|C"][0] + filas[K + "|C"][1]) / 2 + (filas[K + "|P"][0] + filas[K + "|P"][1]) / 2;
    return { iv: strad / spot / 0.8 * Math.sqrt(365 / dte) * 100, dte, K: Number(K) };
  }

  const S = [];
  for (let i = 0; i < D.length; i++) {
    const d = D[i];
    const a = diasCad.has(d) ? ivDe(d, P[d], 30, 15, 60) : null;
    const b = diasCad.has(d) ? ivDe(d, P[d], 90, 60, 150) : null;
    S.push({ d, px: P[d], rv20: rv(i, 20), rv60: rv(i, 60), rv120: rv(i, 120),
             iv30: a ? a.iv : null, dte30: a ? a.dte : null,
             iv90: b ? b.iv : null, dte90: b ? b.dte : null });
    if (i % 400 === 0) process.stdout.write(".");
  }
  console.log("");
  writeFileSync(CACHE_SERIE, JSON.stringify(S));
  return S;
}

const S = existsSync(CACHE_SERIE) && !process.argv.includes("--rehacer")
  ? JSON.parse(readFileSync(CACHE_SERIE, "utf8")) : construirSerie();

// rellenar huecos de la implícita arrastrando el último valor conocido (nunca el siguiente)
let ult30 = null, ult90 = null;
for (const s of S) {
  if (s.iv30 != null) ult30 = s.iv30; else s.iv30 = ult30;
  if (s.iv90 != null) ult90 = s.iv90; else s.iv90 = ult90;
}

// variables derivadas
for (const s of S) {
  s.term = (s.iv30 != null && s.iv90 != null) ? s.iv90 - s.iv30 : null;   // contango > 0
  s.vrp  = (s.iv30 != null && s.rv20 != null) ? s.iv30 - s.rv20 : null;   // prima de riesgo
  s.ivrv = (s.iv30 != null && s.rv60 != null && s.rv60 > 0) ? s.iv30 / s.rv60 : null;
}

const VARS = ["rv20", "rv60", "rv120", "iv30", "iv90", "term", "vrp", "ivrv"];

// ══════════════════════════════════════════════════════════════════════════════════════════
// 2. PERCENTILES CON VENTANA MÓVIL DE 2 AÑOS (504 sesiones), sólo con el PASADO
//    pct[v][d] = en qué percentil de las 504 observaciones ANTERIORES cae el valor de AYER.
//    Doble retardo: la observación de hoy no entra en su propia ventana, y el valor que se
//    consume es el del día anterior. Mínimo 250 observaciones para emitir señal.
// ══════════════════════════════════════════════════════════════════════════════════════════
const VENT = 504, MIN_OBS = 250;
const PCT = {};                        // PCT[v] = Map(fecha -> percentil 0..1 o null)
for (const v of VARS) {
  const m = new Map(), hist = [];
  for (let i = 0; i < S.length; i++) {
    // señal disponible al ABRIR el día S[i].d: se usa el valor de S[i-1] contra la ventana
    // que termina en S[i-2]. Nada de S[i] entra.
    const x = i >= 1 ? S[i - 1][v] : null;
    let p = null;
    if (x != null && hist.length >= MIN_OBS) {
      const w = hist.slice(-VENT);
      let c = 0; for (const y of w) if (y < x) c++;
      p = c / w.length;
    }
    m.set(S[i].d, p);
    if (i >= 2 && S[i - 2][v] != null) hist.push(S[i - 2][v]);
  }
  PCT[v] = m;
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// 3. EL MOTOR CON TAMAÑO VARIABLE.
//    Copia LITERAL de M.simular salvo una línea: `tam` puede ser una función de la fecha.
//    Se verifica abajo que con tam constante da EXACTAMENTE lo mismo que el motor original.
// ══════════════════════════════════════════════════════════════════════════════════════════
const SPY = M.SPY, DD = M.DD, OPS = M.OPS, SECTOR = M.SECTOR;
const POR_DIA = new Map();
for (const o of OPS) { if (!POR_DIA.has(o.dC)) POR_DIA.set(o.dC, []); POR_DIA.get(o.dC).push(o); }
const msf = (d) => Date.parse(d.slice(0, 4) + "-" + d.slice(4, 6) + "-" + d.slice(6, 8) + "T00:00:00Z");
const DIV_SPY = 0.013;

function simVar({ capital = CAP, tam = 0.12, huecos = HUECOS, plazo = PLAZO, castigo = CAST } = {}) {
  const TAM = typeof tam === "function" ? tam : () => tam;
  const kC = 1 + castigo / 2, kM = (1 - castigo / 2) / (1 + castigo / 2);
  const divD = Math.pow(1 + DIV_SPY, 1 / 252) - 1;
  const dias = DD;
  let caja = capital, acc = 0, ab = [];
  const V = []; let pico = capital, peor = 0, sInv = 0, nOps = 0, sTam = 0;

  for (let t = 0; t < dias.length; t++) {
    const hoy = dias[t], p = SPY[hoy];
    acc *= (1 + divD);
    for (const o of ab) { const m = o.m.get(hoy); if (m != null) o.ultMult = m * kM; }
    for (let i = ab.length - 1; i >= 0; i--) if (ab[i].dSal <= hoy) { caja += ab[i].dinero * ab[i].ultMult; ab.splice(i, 1); }

    const tamHoy = TAM(hoy); sTam += tamHoy;
    for (const x of (POR_DIA.get(hoy) || []).slice().sort((a, b) => a.ma - b.ma)) {
      if (ab.length >= huecos) break;
      if (x.ma >= 0) continue;
      if (ab.some((o) => o.tk === x.tk)) continue;
      const libro = ab.reduce((a, o) => a + o.dinero * o.ultMult, 0);
      const patr = caja + acc * p + libro;
      const tope = patr * tamHoy;
      { const falta = Math.min(tope, patr) - caja;
        if (falta > 0 && acc > 0) { const v = Math.min(acc, falta / p); acc -= v; caja += v * p; } }
      const costeR = x.coste * kC;
      const n = Math.floor(Math.min(tope, caja) / costeR);
      if (n < 1) continue;
      const dinero = n * costeR;
      caja -= dinero;
      const iFin = (plazo > 0 && plazo < x.camino.length) ? plazo - 1 : x.camino.length - 1;
      ab.push({ ...x, dinero, ultMult: kM, dSal: x.camino[iFin][0] });
      nOps++;
    }
    if (caja > 0) { acc += caja / p; caja = 0; }
    const libro = ab.reduce((a, o) => a + o.dinero * o.ultMult, 0);
    const v = caja + acc * p + libro;
    V.push(v); sInv += libro / v;
    if (v > pico) pico = v; const dd = 1 - v / pico; if (dd > peor) peor = dd;
  }
  const final = V[V.length - 1];
  const R = []; for (let i = 1; i < V.length; i++) R.push(V[i] / V[i - 1] - 1);
  const m = R.reduce((a, x) => a + x, 0) / R.length;
  const sd = Math.sqrt(R.reduce((a, x) => a + (x - m) ** 2, 0) / (R.length - 1));
  const anos = (msf(dias[dias.length - 1]) - msf(dias[0])) / (365.25 * 86400000);
  return { final, cagr: 100 * (Math.pow(Math.max(final, 1) / capital, 1 / anos) - 1),
    caida: 100 * peor, sharpe: sd > 0 ? (m * 252 - 0.033) / (sd * Math.sqrt(252)) : 0,
    ops: nOps, invertido: 100 * sInv / V.length, tamMedio: sTam / V.length, V };
}

// BANDA DE 41 CAPITALES — mediana, como manda la disciplina 3
const mediana = (X) => { const B = [...X].sort((a, b) => a - b); return B[Math.floor(B.length / 2)]; };
function banda41(cfg) {
  const A = [], C = [], Sh = [], I = [], O = [];
  for (let i = 0; i <= 40; i++) {
    const q = simVar({ ...cfg, capital: 60000 * (1 + (i - 20) * 0.005) });
    A.push(q.cagr); C.push(q.caida); Sh.push(q.sharpe); I.push(q.invertido); O.push(q.ops);
  }
  const p10 = (X) => [...X].sort((a, b) => a - b)[4], p90 = (X) => [...X].sort((a, b) => a - b)[36];
  return { a: mediana(A), c: mediana(C), s: mediana(Sh), inv: mediana(I), ops: mediana(O),
           sMin: Math.min(...Sh), sMax: Math.max(...Sh), s10: p10(Sh), s90: p90(Sh),
           aMin: Math.min(...A), aMax: Math.max(...A) };
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// SALIDA
// ══════════════════════════════════════════════════════════════════════════════════════════
const PRINCIPAL = process.argv[1] && process.argv[1].replace(/\\/g, "/").endsWith("wf-volatilidad.mjs");
const fase = process.argv[2] || "todo";

if (PRINCIPAL && (fase === "vars" || fase === "todo")) {
  console.log("\n══ 1. LAS VARIABLES ═══════════════════════════════════════════════════════════");
  const con = (v) => S.filter((s) => s[v] != null).length;
  console.log(`  días totales: ${S.length}  (${S[0].d} → ${S[S.length - 1].d})`);
  for (const v of VARS) console.log(`   ${rell(v, 6)}: ${con(v)} días con valor`);
  const brutos = S.filter((s) => s.dte30 != null);
  console.log(`   días con cadena SPY leída: ${brutos.length}`);
  console.log("\n  ── validación de la implícita: máximos y mínimos de iv30 por año");
  const porAno = {};
  for (const s of S) { if (s.iv30 == null) continue; const y = s.d.slice(0, 4);
    (porAno[y] ||= []).push(s.iv30); }
  for (const y of Object.keys(porAno).sort()) {
    const X = porAno[y].sort((a, b) => a - b);
    console.log(`   ${y}  min ${f2(X[0], 1)}  mediana ${f2(X[Math.floor(X.length / 2)], 1)}  max ${f2(X[X.length - 1], 1)}`);
  }
  const covid = S.filter((s) => s.d >= "20200301" && s.d <= "20200331" && s.iv30 != null);
  console.log(`\n   marzo 2020 (control): iv30 max ${f2(Math.max(...covid.map((s) => s.iv30)), 1)}  rv20 max ${f2(Math.max(...covid.map((s) => s.rv20)), 1)}`);
  const abr17 = S.filter((s) => s.d >= "20170601" && s.d <= "20170630" && s.iv30 != null);
  console.log(`   junio 2017 (control): iv30 mediana ${f2(mediana(abr17.map((s) => s.iv30)), 1)}`);
  const ago24 = S.filter((s) => s.d >= "20240805" && s.d <= "20240807" && s.iv30 != null);
  console.log(`   5-7 ago 2024 (control): iv30 ${ago24.map((s) => f2(s.iv30, 1)).join(" ")}`);
  // correlación entre iv30 y rv20 (cordura)
  const par = S.filter((s) => s.iv30 != null && s.rv20 != null);
  const cor = (A, B) => { const n = A.length, ma = A.reduce((a, x) => a + x, 0) / n, mb = B.reduce((a, x) => a + x, 0) / n;
    let nu = 0, da = 0, db = 0; for (let i = 0; i < n; i++) { nu += (A[i] - ma) * (B[i] - mb); da += (A[i] - ma) ** 2; db += (B[i] - mb) ** 2; }
    return nu / Math.sqrt(da * db); };
  console.log(`   corr(iv30, rv20) = ${f2(cor(par.map((s) => s.iv30), par.map((s) => s.rv20)), 3)}   (debe ser alta y positiva)`);
  const primerPct = {};
  for (const v of VARS) { const d = S.find((s) => PCT[v].get(s.d) != null); primerPct[v] = d ? d.d : "nunca"; }
  console.log(`\n  primer día con percentil: ${Object.entries(primerPct).map(([k, x]) => k + "=" + x).join("  ")}`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// 4. ¿LLEVA INFORMACIÓN LA VARIABLE? — test de potencia sobre las 10.841 operaciones
//    ELEGIBLES (no sólo las 47 que caben en la cartera). Si la volatilidad al entrar dijera
//    algo del resultado de la call a 120 días, aquí se vería con n grande.
// ══════════════════════════════════════════════════════════════════════════════════════════
const ELEG = OPS.filter((o) => o.ma < 0).map((o) => ({
  tk: o.tk, dC: o.dC, mes: o.dC.slice(0, 6),
  mult: o.camino[Math.min(PLAZO, o.camino.length) - 1][1],
}));

function tercilesDe(v) {
  const F = ELEG.filter((e) => PCT[v].get(e.dC) != null).map((e) => ({ ...e, p: PCT[v].get(e.dC) }));
  const B = [[], [], []];
  for (const e of F) B[e.p < 1 / 3 ? 0 : e.p < 2 / 3 ? 1 : 2].push(e);
  const est = (X) => {
    const n = X.length, m = X.reduce((a, e) => a + e.mult, 0) / n;
    const sd = Math.sqrt(X.reduce((a, e) => a + (e.mult - m) ** 2, 0) / (n - 1));
    return { n, m, sd, gan: 100 * X.filter((e) => e.mult > 1).length / n };
  };
  const E = B.map(est);
  const t = (E[2].m - E[0].m) / Math.sqrt(E[2].sd ** 2 / E[2].n + E[0].sd ** 2 / E[0].n);
  // agregado POR MES: mata casi todo el solapamiento (ops del mismo día son la misma apuesta)
  const porMes = B.map((X) => { const M2 = new Map();
    for (const e of X) { if (!M2.has(e.mes)) M2.set(e.mes, []); M2.get(e.mes).push(e.mult); }
    return [...M2.values()].map((A) => A.reduce((a, x) => a + x, 0) / A.length); });
  const estM = (A) => { const n = A.length, m = A.reduce((a, x) => a + x, 0) / n;
    const sd = Math.sqrt(A.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1)); return { n, m, sd }; };
  const EM = porMes.map(estM);
  const tM = (EM[2].m - EM[0].m) / Math.sqrt(EM[2].sd ** 2 / EM[2].n + EM[0].sd ** 2 / EM[0].n);
  return { E, t, EM, tM, n: F.length };
}

if (PRINCIPAL && (fase === "info" || fase === "todo")) {
  console.log("\n══ 2. ¿LLEVA INFORMACIÓN? — multiplicador a 120 días de las ops ELEGIBLES ══════");
  console.log("   (test de potencia con n grande; el portafolio sólo llega a coger ~47)");
  console.log("   var    n     T1(vol baja)      T2             T3(vol alta)   t(T3−T1)  t por MES");
  for (const v of VARS) {
    const r = tercilesDe(v);
    const c = (e) => `${f2(e.m, 3)}(${f2(e.gan, 0)}%)`;
    console.log(`  ${rell(v, 5)} ${rell(r.n, 5)}   ${c(r.E[0])}      ${c(r.E[1])}      ${c(r.E[2])}      ${rell(f2(r.t, 2), 6)}   ${rell(f2(r.tM, 2), 6)}  (n mes ${r.EM[0].n}/${r.EM[2].n})`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// 5. EL BARRIDO PRINCIPAL — TAMAÑO CONTINUO GUIADO POR EL PERCENTIL
//      tam(t) = base × (1 + k × 2 × (0,5 − percentil))     recortado a [0, 2×base]
//    k = 0  →  EXACTAMENTE el tamaño constante (el LISTÓN).
//    k > 0  →  la hipótesis: volatilidad alta ⇒ tamaño pequeño.
//    k < 0  →  el control invertido.
//    Como el percentil es uniforme por construcción, la exposición media apenas cambia con k:
//    la comparación queda EMPAREJADA (disciplina 6). Se imprime `inv` para comprobarlo.
// ══════════════════════════════════════════════════════════════════════════════════════════
function reglaContinua(v, base, k) {
  const m = PCT[v];
  return (d) => { const p = m.get(d); if (p == null) return base;
    return Math.max(0, Math.min(2 * base, base * (1 + k * 2 * (0.5 - p)))); };
}

const KS = [-1, -0.75, -0.5, -0.25, 0, 0.25, 0.5, 0.75, 1];

if (PRINCIPAL && (fase === "barrido" || fase === "todo")) {
  console.log("\n══ 3. LISTÓN — TAMAÑO CONSTANTE (banda de 41 capitales, mediana) ══════════════");
  console.log("   tam    CAGR%   caída%  Sharpe   exposición%  ops   Sharpe[min..max]");
  for (const tam of [0.04, 0.06, 0.08, 0.10, 0.12, 0.15, 0.20, 0.25, 0.30]) {
    const b = banda41({ tam });
    console.log(`  ${f2(tam, 2)}  ${rell(f2(b.a, 2), 6)}  ${rell(f2(b.c, 1), 6)}  ${rell(f2(b.s, 3), 6)}   ${rell(f2(b.inv, 1), 6)}     ${rell(b.ops, 3)}   [${f2(b.sMin, 3)}..${f2(b.sMax, 3)}]`);
  }
  const sp = M.spyApalancado(1);
  console.log(`  COMPRAR SPY:  ${f2(sp.cagr, 2)}   ${f2(sp.caida, 1)}   ${f2(sp.sharpe, 3)}`);

  for (const base of [0.06, 0.12, 0.20]) {
    console.log(`\n══ 4. BARRIDO COMPLETO · base ${base} ═════════════════════════════════════════`);
    console.log("        k:   " + KS.map((k) => rell(f2(k, 2), 7)).join("") + "   |  disp.Sharpe");
    for (const v of VARS) {
      const fil = [], filA = [], filI = [];
      for (const k of KS) {
        const b = banda41({ tam: reglaContinua(v, base, k) });
        fil.push(b.s); filA.push(b.a); filI.push(b.inv);
      }
      const disp = Math.max(...fil) - Math.min(...fil);
      console.log(` ${rell(v, 5)} Sh: ` + fil.map((x) => rell(f2(x, 3), 7)).join("") + `   |  ${f2(disp, 3)}`);
      console.log("       CAGR: " + filA.map((x) => rell(f2(x, 1), 7)).join(""));
      console.log("       expo: " + filI.map((x) => rell(f2(x, 1), 7)).join(""));
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// 6. BARRIDO DISCRETO DE TRES CUBOS — la forma que pidió el encargo, con umbrales barridos
// ══════════════════════════════════════════════════════════════════════════════════════════
function reglaCubos(v, c1, c2, tBajo, tMed, tAlto) {
  const m = PCT[v];
  return (d) => { const p = m.get(d); if (p == null) return tMed;
    return p < c1 ? tAlto : p < c2 ? tMed : tBajo; };   // percentil ALTO de vol ⇒ tamaño BAJO
}

if (PRINCIPAL && (fase === "cubos" || fase === "todo")) {
  console.log("\n══ 5. TRES CUBOS · barrido de umbrales · tamaños (0,20 / 0,12 / 0,06) ═════════");
  console.log("   la hipótesis: percentil de vol BAJO ⇒ 0,20 · medio ⇒ 0,12 · ALTO ⇒ 0,06");
  console.log("   listón emparejado = el constante con la misma exposición (ver tabla 3)");
  const CORTES = [[0.20, 0.80], [0.25, 0.75], [0.33, 0.67], [0.40, 0.60], [0.50, 0.50]];
  console.log("        cortes:" + CORTES.map((c) => rell(c[0] + "/" + c[1], 10)).join("") + "   disp.");
  for (const v of VARS) {
    const F = [], A = [], I = [];
    for (const [c1, c2] of CORTES) {
      const b = banda41({ tam: reglaCubos(v, c1, c2, 0.06, 0.12, 0.20) });
      F.push(b.s); A.push(b.a); I.push(b.inv);
    }
    console.log(` ${rell(v, 5)}   Sh: ` + F.map((x) => rell(f2(x, 3), 10)).join("") + `   ${f2(Math.max(...F) - Math.min(...F), 3)}`);
    console.log("        CAGR: " + A.map((x) => rell(f2(x, 1), 10)).join(""));
    console.log("        expo: " + I.map((x) => rell(f2(x, 1), 10)).join(""));
  }
  console.log("\n   ── CONTROL INVERTIDO (vol ALTA ⇒ 0,20). Si gana, la hipótesis va del revés.");
  for (const v of VARS) {
    const F = [];
    for (const [c1, c2] of CORTES) F.push(banda41({ tam: reglaCubos(v, c1, c2, 0.20, 0.12, 0.06) }).s);
    console.log(` ${rell(v, 5)}   Sh: ` + F.map((x) => rell(f2(x, 3), 10)).join(""));
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// 7. COMPROBACIÓN DE QUE EL MANDO MUEVE ALGO (disciplina 5)
// ══════════════════════════════════════════════════════════════════════════════════════════
if (PRINCIPAL && (fase === "mando" || fase === "todo")) {
  console.log("\n══ 6. ¿EL MANDO MUEVE ALGO? — valores extremos ════════════════════════════════");
  const pruebas = [
    ["constante 0,12", 0.12],
    ["iv30 k=+1", reglaContinua("iv30", 0.12, 1)],
    ["iv30 k=−1", reglaContinua("iv30", 0.12, -1)],
    ["iv30 cubos 0/0,12/0,40", reglaCubos("iv30", 0.33, 0.67, 0.0, 0.12, 0.40)],
    ["iv30 cubos 0,40/0,12/0", reglaCubos("iv30", 0.33, 0.67, 0.40, 0.12, 0.0)],
  ];
  for (const [nom, tam] of pruebas) {
    const q = simVar({ tam });
    console.log(`  ${rell(nom, 24)}  final $${Math.round(q.final).toLocaleString("en-US")}  Sharpe ${f2(q.sharpe, 3)}  caída ${f2(q.caida, 1)}  ops ${q.ops}  expo ${f2(q.invertido, 1)}  tam medio ${f2(q.tamMedio, 3)}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// 8. LA AUDITORÍA — aquí es donde se decide, no en el barrido de arriba.
//    A) curva fina del listón, para EMPAREJAR por exposición (disciplina 6)
//    B) todo el barrido convertido a ΔSharpe contra el constante de la MISMA exposición
//    C) consistencia del signo entre las tres bases
//    D) ¿puede un percentil móvil marcar un régimen de años?
//    E) ¿ensancha la vol el resultado de la opción? (lo único que justificaría la hipótesis)
//    F) control de PRECIO: la misma regla con la caída de SPY en vez de la volatilidad
//    G) PLACEBO: el percentil barajado por bloques, 300 veces
// ══════════════════════════════════════════════════════════════════════════════════════════
let _G = null;
function curvaListon() {
  if (_G) return _G;
  _G = []; for (let t = 0.02; t <= 0.52001; t += 0.01) _G.push({ tam: t, ...banda41({ tam: t }) });
  return _G;
}
function listonEn(e, campo) {
  const G = curvaListon();
  if (e <= G[0].inv) return G[0][campo];
  for (let i = 1; i < G.length; i++) if (G[i].inv >= e) {
    const w = (e - G[i - 1].inv) / (G[i].inv - G[i - 1].inv);
    return G[i - 1][campo] + w * (G[i][campo] - G[i - 1][campo]); }
  return G[G.length - 1][campo];
}
const delta = (tam) => { const b = banda41({ tam }); return { d: b.s - listonEn(b.inv, "s"), b }; };

if (PRINCIPAL && (fase === "auditoria" || fase === "todo")) {
  console.log("\n══ 7. BARRIDO EMPAREJADO — ΔSharpe contra el constante de la MISMA exposición ══");
  console.log("   k>0 = LA HIPÓTESIS (vol alta ⇒ menos tamaño) · k<0 = el control invertido");
  for (const base of [0.06, 0.12, 0.20]) {
    console.log(`\n  base ${base}      ` + KS.map((k) => rell(f2(k, 2), 7)).join(""));
    for (const v of VARS) {
      const d = KS.map((k) => delta(reglaContinua(v, base, k)).d);
      console.log(`  ${rell(v, 5)} ΔSh: ` + d.map((x) => rell((x >= 0 ? "+" : "") + f2(x, 3), 7)).join(""));
    }
  }

  console.log("\n══ 8. ¿EL PERCENTIL MÓVIL SEPARA LOS DOS REGÍMENES? ═══════════════════════════");
  console.log("   var    media pct 2016-2020   media pct 2021-2026   diferencia");
  for (const v of VARS) {
    const a = [], b = [];
    for (const s of S) { const p = PCT[v].get(s.d); if (p == null) continue; (s.d < "20210101" ? a : b).push(p); }
    const m = (X) => X.reduce((q, x) => q + x, 0) / X.length;
    console.log(`  ${rell(v, 5)}        ${f2(m(a), 3)}                 ${f2(m(b), 3)}            ${f2(m(b) - m(a), 3)}`);
  }
  console.log("   → un percentil de ventana móvil se RENORMALIZA solo: vale ~0,5 en cualquier");
  console.log("     período largo. Por construcción NO puede marcar un régimen de varios años.");

  console.log("\n══ 9. ¿LA VOL AL ENTRAR ENSANCHA EL RESULTADO? (lo que exigiría la hipótesis) ═");
  console.log("   var    T1 vol baja: media  sd  |  T3 vol alta: media  sd  |  sd(T3)/sd(T1)");
  for (const v of VARS) {
    const F = ELEG.filter((e) => PCT[v].get(e.dC) != null).map((e) => ({ ...e, p: PCT[v].get(e.dC) }));
    const B = [[], [], []]; for (const e of F) B[e.p < 1 / 3 ? 0 : e.p < 2 / 3 ? 1 : 2].push(e.mult);
    const st = (A) => { const n = A.length, m = A.reduce((a, x) => a + x, 0) / n;
      return { m, sd: Math.sqrt(A.reduce((a, x) => a + (x - m) ** 2, 0) / (n - 1)) }; };
    const a = st(B[0]), c = st(B[2]);
    console.log(`  ${rell(v, 5)}        ${f2(a.m, 3)}  ${f2(a.sd, 3)}  |          ${f2(c.m, 3)}  ${f2(c.sd, 3)}  |   ${f2(c.sd / a.sd, 3)}`);
  }
  console.log("   → si el ratio no pasa de ~1, la vol al entrar NO ensancha la cola de la call");
  console.log("     de 25% dentro del dinero, y la hipótesis se queda sin mecanismo.");
}

// serie de precio para el control (sólo pasado)
const _D = S.map((s) => s.d), _PX = S.map((s) => s.px);
const _caida = _PX.map((p, i) => i < 252 ? null : 1 - p / Math.max(..._PX.slice(i - 252, i + 1)));
const _bajoMA = _PX.map((p, i) => i < 50 ? null : -(p / (_PX.slice(i - 50, i).reduce((a, x) => a + x, 0) / 50) - 1));
function pctDeSerie(serie) {
  const m = new Map(), hist = [];
  for (let i = 0; i < _D.length; i++) { const x = i >= 1 ? serie[i - 1] : null; let p = null;
    if (x != null && hist.length >= MIN_OBS) { const w = hist.slice(-VENT); let c = 0;
      for (const y of w) if (y < x) c++; p = c / w.length; }
    m.set(_D[i], p); if (i >= 2 && serie[i - 2] != null) hist.push(serie[i - 2]); }
  return m;
}
const reglaMapa = (mapa, base, k) => (d) => { const p = mapa.get(d); if (p == null) return base;
  return Math.max(0, Math.min(2 * base, base * (1 + k * 2 * (0.5 - p)))); };

if (PRINCIPAL && (fase === "control" || fase === "todo")) {
  const PC = pctDeSerie(_caida), PM = pctDeSerie(_bajoMA);
  console.log("\n══ 10. CONTROL DE PRECIO — ¿aporta la VOLATILIDAD algo sobre el PRECIO? ══════");
  console.log("   'más tamaño cuando la vol está alta' ≈ 'más tamaño cuando acaba de caer'.");
  const KF = [-0.5, -0.3, -0.25, -0.2, -0.1, 0, 0.2, 0.5, 1];
  for (const base of [0.12, 0.20]) {
    console.log(`\n  base ${base}                    ` + KF.map((k) => rell(f2(k, 2), 8)).join(""));
    for (const [nom, mapa] of [["caída 252d", PC], ["bajo MA50", PM], ["iv30 (vol)", PCT.iv30],
                               ["iv90 (vol)", PCT.iv90], ["rv20 (vol)", PCT.rv20]])
      console.log(`  ${rell(nom, 12)} ΔSh: ` + KF.map((k) => rell((delta(reglaMapa(mapa, base, k)).d >= 0 ? "+" : "") + f2(delta(reglaMapa(mapa, base, k)).d, 3), 8)).join(""));
  }
}

if (PRINCIPAL && (fase === "placebo" || fase === "todo")) {
  console.log("\n══ 11. PLACEBO — el percentil BARAJADO por bloques de 60 sesiones, 300 veces ══");
  console.log("   misma distribución, misma suavidad, ningún vínculo con la fecha.");
  function barajar(mapa, bloque, semilla) {
    let s = semilla; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    const val = _D.map((d) => mapa.get(d)), bl = [];
    for (let i = 0; i < val.length; i += bloque) bl.push(val.slice(i, i + bloque));
    for (let i = bl.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [bl[i], bl[j]] = [bl[j], bl[i]]; }
    const plano = bl.flat(), m = new Map();
    for (let i = 0; i < _D.length; i++) m.set(_D[i], plano[i]);
    return m;
  }
  console.log("   var  base   ΔSh REAL   nube barajada: p5 · mediana · p95    percentil del real");
  for (const base of [0.12, 0.20]) for (const v of ["rv20", "rv120", "iv30", "iv90"]) {
    const real = delta(reglaContinua(v, base, -0.20)).d, nube = [];
    for (let s = 1; s <= 300; s++) nube.push(delta(reglaMapa(barajar(PCT[v], 60, s * 7919), base, -0.20)).d);
    nube.sort((a, b) => a - b);
    const pc = 100 * nube.filter((x) => x < real).length / nube.length;
    console.log(`  ${rell(v, 5)} ${f2(base, 2)}   ${rell((real >= 0 ? "+" : "") + f2(real, 3), 8)}    ${rell(f2(nube[14], 3), 7)} · ${rell(f2(nube[150], 3), 7)} · ${rell(f2(nube[284], 3), 7)}      ${f2(pc, 0)}%`);
  }
}

if (PRINCIPAL && (fase === "final" || fase === "todo")) {
  console.log("\n══ 12. LA TABLA FINAL ═════════════════════════════════════════════════════════");
  console.log(`  ${rell("regla", 40)} Sharpe   CAGR  caída  expo | listón emparejado Sh/CAGR/caída | banda Sharpe`);
  for (const [n, tam] of [
    ["iv30 k=−0,20 base 0,20 (mejor honesta)", reglaContinua("iv30", 0.20, -0.20)],
    ["iv30 k=−0,20 base 0,12", reglaContinua("iv30", 0.12, -0.20)],
    ["iv30 k=+0,20 base 0,20 (LA HIPÓTESIS)", reglaContinua("iv30", 0.20, 0.20)],
    ["iv30 k=+1 base 0,20 (hipótesis fuerte)", reglaContinua("iv30", 0.20, 1)],
    ["rv20 k=+1 base 0,12 (hipótesis fuerte)", reglaContinua("rv20", 0.12, 1)],
    ["CONSTANTE 0,20", 0.20], ["CONSTANTE 0,12", 0.12]]) {
    const b = banda41({ tam });
    console.log(`  ${rell(n, 40)} ${f2(b.s, 3)}  ${rell(f2(b.a, 2), 5)}  ${rell(f2(b.c, 1), 5)}  ${rell(f2(b.inv, 1), 4)} |   ${f2(listonEn(b.inv, "s"), 3)} / ${f2(listonEn(b.inv, "a"), 2)} / ${f2(listonEn(b.inv, "c"), 1)}   | [${f2(b.sMin, 3)}..${f2(b.sMax, 3)}]`);
  }
  const sp = M.spyApalancado(1);
  console.log(`  ${rell("COMPRAR SPY", 40)} ${f2(sp.sharpe, 3)}  ${f2(sp.cagr, 2)}  ${f2(sp.caida, 1)}`);
}

export { S, PCT, VARS, simVar, banda41, M, mediana, f2, rell, reglaContinua, reglaCubos, ELEG,
         tercilesDe, curvaListon, listonEn, delta, pctDeSerie, reglaMapa };

