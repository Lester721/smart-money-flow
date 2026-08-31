// ══════════════════════════════════════════════════════════════════════════════════════════
// wf-tendencia.mjs — ¿la TENDENCIA / CAÍDA / FORMA del mercado dice qué TAMAÑO poner?
//
// LA PALANCA (calls 25% dentro, ~400 días, coste>=$5.000, día bajo la MA20, aguante 120d)
// tiene un solo dial sin respuesta: el TAMAÑO. Su efecto cambia de signo entre 2016-2020 y
// 2021-2026. Aquí se busca una variable CONOCIDA EN EL MOMENTO que diga en qué régimen
// estamos, para graduar el tamaño.
//
// DISCIPLINAS APLICADAS
//  1. Toda variable en la fecha t se calcula con cierres de SPY <= t-1 (estrictamente pasado).
//     Los percentiles van con ventana MOVIL de 2 años (504 sesiones), mínimo 250 obs.
//     Antes de eso la regla NO actúa: cae al tamaño base (y se cuenta cuántas ops afecta).
//  2. El listón es el TAMAÑO CONSTANTE, emparejado por EXPOSICION realizada (no por 'tam',
//     que no es comparable entre reglas). Se interpola la curva constante fina.
//  3. Nunca se cita media muestra. Todo el período, y con banda de 41 capitales.
//  4. Se enseña el barrido ENTERO con su dispersión.
//  5. Comprobación de que el mando mueve algo (valores extremos).
//  7. castigo = 0,0138 siempre.
// ══════════════════════════════════════════════════════════════════════════════════════════
process.env.CAMINOS = "largo-p25-d400.json";
const M = await import("./motor-cartera.mjs");
const { OPS, SPY, DD } = M;

// sólo días bajo la media de 20 sesiones
for (const o of OPS) if (o.ma >= 0) o.ma = 999;

const CASTIGO = 0.0138, HUECOS = 2, PLAZO = 120, CAP0 = 60000, DIV_SPY = 0.013;
const ms = (d) => Date.parse(d.slice(0, 4) + "-" + d.slice(4, 6) + "-" + d.slice(6, 8) + "T00:00:00Z");
const med = (X) => { const B = [...X].sort((a, b) => a - b); return B.length % 2 ? B[(B.length - 1) / 2] : (B[B.length / 2 - 1] + B[B.length / 2]) / 2; };
const f2 = (x, n = 2) => (x == null || !isFinite(x)) ? "  n/a" : x.toFixed(n);

// ══ 1. EL MOTOR CON TAMAÑO VARIABLE ═══════════════════════════════════════════════════════
// copia LITERAL de motor-cartera.simular, con un solo cambio: `tam` pasa de número a una
// tabla fecha→tam. Todo lo demás (orden de compra, marca a mercado, arrastre, caja) se
// conserva palabra por palabra. Abajo se verifica que con tam constante da EXACTAMENTE lo
// mismo que el motor original, hasta el último dígito.
const POR_DIA = new Map();
for (const o of OPS) { if (!POR_DIA.has(o.dC)) POR_DIA.set(o.dC, []); POR_DIA.get(o.dC).push(o); }

function simularVar({ capital = CAP0, tamPorDia, huecos = HUECOS, modo = "spy",
  plazo = PLAZO, castigo = CASTIGO, suelo = 0, topeGanancia = 0, costeMin = 0 } = {}) {
  const kC = 1 + castigo / 2, kM = (1 - castigo / 2) / (1 + castigo / 2);
  const intD = Math.pow(1.033, 1 / 252) - 1, divD = Math.pow(1 + DIV_SPY, 1 / 252) - 1;
  const dias = DD.filter(() => true);
  let caja = capital, acc = 0, ab = [], tom = [];
  const V = []; let pico = capital, peor = 0, sInv = 0;
  const compras = [];

  for (let t = 0; t < dias.length; t++) {
    const hoy = dias[t], p = SPY[hoy];
    if (modo === "spy") acc *= (1 + divD); else caja *= (1 + intD);
    for (const o of ab) { const m = o.m.get(hoy); if (m != null) o.ultMult = m * kM; }
    for (let i = ab.length - 1; i >= 0; i--) if (ab[i].dSal <= hoy) { caja += ab[i].dinero * ab[i].ultMult; ab.splice(i, 1); }

    const tam = tamPorDia.get(hoy);
    for (const x of (POR_DIA.get(hoy) || []).slice().sort((a, b) => a.ma - b.ma)) {
      if (ab.length >= huecos) break;
      if (x.ma >= 0) continue;
      if (costeMin > 0 && x.coste < costeMin) continue;
      if (ab.some((o) => o.tk === x.tk)) continue;
      const libro = ab.reduce((a, o) => a + o.dinero * o.ultMult, 0);
      const patr = caja + acc * p + libro;
      const tope = patr * tam;
      if (modo === "spy") {
        const falta = Math.min(tope, patr) - caja;
        if (falta > 0 && acc > 0) { const v = Math.min(acc, falta / p); acc -= v; caja += v * p; }
      }
      const costeR = x.coste * kC;
      const n = Math.floor(Math.min(tope, caja) / costeR);
      if (n < 1) continue;
      const dinero = n * costeR;
      caja -= dinero;
      let iFin = (plazo > 0 && plazo < x.camino.length) ? plazo - 1 : x.camino.length - 1;
      if (suelo > 0 || tope > 0) {
        for (let j = 0; j <= iFin; j++) {
          const m = x.camino[j][1];
          if ((suelo > 0 && m <= suelo) || (topeGanancia > 0 && m >= topeGanancia)) { iFin = j; break; }
        }
      }
      const nS = x.camino[iFin][0];
      ab.push({ ...x, dinero, ultMult: kM, dSal: nS });
      tom.push({ tk: x.tk, dC: x.dC, dinero, mult: x.camino[iFin][1] });
      compras.push({ d: hoy, tk: x.tk, tam, dinero });
    }
    if (modo === "spy" && caja > 0) { acc += caja / p; caja = 0; }
    const libro = ab.reduce((a, o) => a + o.dinero * o.ultMult, 0);
    const v = caja + acc * p + libro;
    V.push(v); sInv += libro / v;
    if (v > pico) pico = v; const dd = 1 - v / pico; if (dd > peor) peor = dd;
  }
  const final = V[V.length - 1];
  const R = []; for (let i = 1; i < V.length; i++) R.push(V[i] / V[i - 1] - 1);
  const m = R.reduce((a, x) => a + x, 0) / R.length;
  const sd = Math.sqrt(R.reduce((a, x) => a + (x - m) ** 2, 0) / (R.length - 1));
  const anos = (ms(dias[dias.length - 1]) - ms(dias[0])) / (365.25 * 86400000);
  return {
    final, cagr: 100 * (Math.pow(Math.max(final, 1) / capital, 1 / anos) - 1), caida: 100 * peor,
    sharpe: sd > 0 ? (m * 252 - 0.033) / (sd * Math.sqrt(252)) : 0, ops: tom.length,
    invertido: 100 * sInv / V.length, V, compras
  };
}

const tablaConst = (tam) => { const T = new Map(); for (const d of DD) T.set(d, tam); return T; };

// ── banda de 41 capitales de partida: 60000*(1+(i-20)*0.005) ─────────────────────────────
function banda41(tamPorDia) {
  const A = [], C = [], S = [], I = [], O = [];
  for (let i = 0; i <= 40; i++) {
    const q = simularVar({ tamPorDia, capital: 60000 * (1 + (i - 20) * 0.005) });
    A.push(q.cagr); C.push(q.caida); S.push(q.sharpe); I.push(q.invertido); O.push(q.ops);
  }
  const disp = (X) => { const B = [...X].sort((a, b) => a - b); return { p10: B[4], p90: B[36], min: B[0], max: B[40] }; };
  return { a: med(A), c: med(C), s: med(S), inv: med(I), ops: med(O), dS: disp(S), dA: disp(A), dC: disp(C) };
}

// ══ 2. VERIFICACIÓN DE IDENTIDAD ══════════════════════════════════════════════════════════
console.log("═══ VERIFICACION: motor copiado == motor original ═══");
let idOK = true;
for (const tam of [0.06, 0.12, 0.20]) {
  const a = M.simular({ tam, huecos: HUECOS, modo: "spy", plazo: PLAZO, castigo: CASTIGO, capital: CAP0 });
  const b = simularVar({ tamPorDia: tablaConst(tam) });
  const ok = a.final === b.final && a.cagr === b.cagr && a.caida === b.caida && a.sharpe === b.sharpe && a.ops === b.ops;
  if (!ok) idOK = false;
  console.log(`  tam=${tam}  original final=${a.final.toFixed(6)} sharpe=${a.sharpe.toFixed(9)} | copia final=${b.final.toFixed(6)} sharpe=${b.sharpe.toFixed(9)}  ${ok ? "IDENTICO" : "DIFIERE !!"}`);
}
if (!idOK) { console.log("La copia NO reproduce el motor. Abortando."); process.exit(1); }

// ══ 3. VARIABLES DE TENDENCIA / CAIDA / FORMA (sólo pasado) ═══════════════════════════════
const N = DD.length;
const P = DD.map(d => SPY[d]);
const ret = new Array(N).fill(null);
for (let i = 1; i < N; i++) ret[i] = P[i] / P[i - 1] - 1;

const runMax = new Array(N), runMaxIdx = new Array(N);
{ let mx = -1, mi = 0; for (let i = 0; i < N; i++) { if (P[i] > mx) { mx = P[i]; mi = i; } runMax[i] = mx; runMaxIdx[i] = mi; } }

// episodios de caída >=5%: empieza cuando cruza el 5%, acaba cuando recupera el pico previo
const EPIS = [];
{
  let pico = P[0], dentro = false, sIdx = 0;
  for (let i = 0; i < N; i++) {
    if (P[i] >= pico) { if (dentro) { EPIS.push({ s: sIdx, fin: i, largo: i - sIdx }); dentro = false; } pico = P[i]; }
    else { const dd = 1 - P[i] / pico; if (!dentro && dd >= 0.05) { dentro = true; sIdx = i; } }
  }
  if (dentro) EPIS.push({ s: sIdx, fin: null, largo: null });
}
console.log(`\nEpisodios de caida >=5% en SPY 2016-2026: ${EPIS.length} (${EPIS.filter(e => e.fin != null).length} recuperados)`);
for (const e of EPIS) console.log(`   ${DD[e.s]} -> ${e.fin != null ? DD[e.fin] : "ABIERTO"}   ${e.largo != null ? e.largo + " sesiones" : "-"}`);

const mediaVent = (arr, i, n) => { if (i - n + 1 < 0) return null; let s = 0; for (let j = i - n + 1; j <= i; j++) { if (arr[j] == null) return null; s += arr[j]; } return s / n; };

const VARS = {};
const nombres = ["d50", "d100", "d200", "caida", "diasBajoMax", "mom3", "mom6", "mom12", "sesgo126", "recup", "fracAgua", "vol126"];
for (const k of nombres) VARS[k] = new Array(N).fill(null);

for (let t = 1; t < N; t++) {
  const u = t - 1;                                    // último cierre CONOCIDO
  const m50 = mediaVent(P, u, 50), m100 = mediaVent(P, u, 100), m200 = mediaVent(P, u, 200);
  VARS.d50[t] = m50 != null ? P[u] / m50 - 1 : null;
  VARS.d100[t] = m100 != null ? P[u] / m100 - 1 : null;
  VARS.d200[t] = m200 != null ? P[u] / m200 - 1 : null;
  VARS.caida[t] = 1 - P[u] / runMax[u];
  VARS.diasBajoMax[t] = u - runMaxIdx[u];
  VARS.mom3[t] = u - 63 >= 0 ? P[u] / P[u - 63] - 1 : null;
  VARS.mom6[t] = u - 126 >= 0 ? P[u] / P[u - 126] - 1 : null;
  VARS.mom12[t] = u - 252 >= 0 ? P[u] / P[u - 252] - 1 : null;
  if (u - 126 >= 1) {
    const R = ret.slice(u - 125, u + 1);
    const mm = R.reduce((a, x) => a + x, 0) / R.length;
    const sd = Math.sqrt(R.reduce((a, x) => a + (x - mm) ** 2, 0) / (R.length - 1));
    VARS.sesgo126[t] = sd > 0 ? R.reduce((a, x) => a + ((x - mm) / sd) ** 3, 0) / R.length : null;
    VARS.vol126[t] = sd * Math.sqrt(252);
  }
  // RECUPERACION: mediana de sesiones que costó recuperar las caídas del 5% de los últimos
  // 3 años. Los episodios ABIERTOS cuentan con su edad actual (es lo que se sabe en vivo).
  {
    const L = [];
    for (const e of EPIS) {
      if (e.s > u) continue;
      if (e.fin != null && e.fin <= u) { if (e.s >= u - 756) L.push(e.largo); }
      else L.push(u - e.s);                        // episodio todavía abierto a día de hoy
    }
    VARS.recup[t] = L.length ? med(L) : null;
  }
  if (u >= 252) { let c = 0; for (let j = u - 251; j <= u; j++) if (1 - P[j] / runMax[j] > 0.02) c++; VARS.fracAgua[t] = c / 252; }
}

// ── percentil con ventana MOVIL de 2 años (504), mínimo 250 observaciones ────────────────
const VENT = 504, MIN = 250;
const PCT = {};
for (const k of nombres) {
  const v = VARS[k], q = new Array(N).fill(null);
  for (let t = 0; t < N; t++) {
    if (v[t] == null) continue;
    const H = []; for (let j = Math.max(0, t - VENT); j < t; j++) if (v[j] != null) H.push(v[j]);
    if (H.length < MIN) continue;
    let c = 0; for (const x of H) if (x < v[t]) c++;
    q[t] = c / H.length;
  }
  PCT[k] = q;
}

console.log("\n═══ COBERTURA de cada variable (dias con percentil definido) ═══");
console.log("variable        dias  desde        | valor: min / mediana / max");
for (const k of nombres) {
  const idx = []; for (let t = 0; t < N; t++) if (PCT[k][t] != null) idx.push(t);
  const vv = idx.map(t => VARS[k][t]).sort((a, b) => a - b);
  console.log(`${k.padEnd(13)} ${String(idx.length).padStart(5)}  ${idx.length ? DD[idx[0]] : "-"}   | ${f2(vv[0], 3)} / ${f2(vv[Math.floor(vv.length / 2)], 3)} / ${f2(vv[vv.length - 1], 3)}`);
}

// ══ 4. PRE-CRIBA: ¿la variable separa el resultado de las ENTRADAS? (n grande) ════════════
// Las ~47 compras de la cartera son poquísimas para juzgar nada. Antes de simular carteras,
// se mira si la variable separa el multiplicador a 120 días de TODAS las entradas elegibles.
const IDX = new Map(); DD.forEach((d, i) => IDX.set(d, i));
const kM_ = (1 - CASTIGO / 2) / (1 + CASTIGO / 2);
const ELEG = [];
for (const o of OPS) {
  if (o.ma >= 0) continue; const t = IDX.get(o.dC); if (t == null) continue;
  const mult = o.camino[Math.min(PLAZO - 1, o.camino.length - 1)][1] * kM_;
  ELEG.push({ t, tk: o.tk, dC: o.dC, mult });
}
console.log(`\n═══ PRE-CRIBA sobre TODAS las entradas elegibles (n=${ELEG.length}) ═══`);
console.log("multiplicador medio a 120 dias por QUINTIL de la variable (percentil movil 2a)");
console.log("variable        n     Q1     Q2     Q3     Q4     Q5   | Q5-Q1   t(Q5 vs Q1)");
const precriba = {};
for (const k of nombres) {
  const B = [[], [], [], [], []];
  for (const e of ELEG) {
    const q = PCT[k][e.t]; if (q == null) continue;
    B[Math.min(4, Math.floor(q * 5))].push(e.mult);
  }
  const n = B.reduce((a, x) => a + x.length, 0);
  if (n < 500) { console.log(`${k.padEnd(13)} ${String(n).padStart(5)}  (muestra corta)`); continue; }
  const mu = B.map(x => x.length ? x.reduce((a, y) => a + y, 0) / x.length : NaN);
  const sd = B.map(x => { if (x.length < 2) return NaN; const m = x.reduce((a, y) => a + y, 0) / x.length; return Math.sqrt(x.reduce((a, y) => a + (y - m) ** 2, 0) / (x.length - 1)); });
  const tt = (mu[4] - mu[0]) / Math.sqrt(sd[4] ** 2 / B[4].length + sd[0] ** 2 / B[0].length);
  precriba[k] = { n, mu, d: mu[4] - mu[0], t: tt };
  console.log(`${k.padEnd(13)} ${String(n).padStart(5)} ${mu.map(x => f2(x, 3).padStart(6)).join(" ")} | ${f2(mu[4] - mu[0], 3).padStart(6)}  t=${f2(tt, 2)}`);
}
console.log("(ojo: entradas MUY solapadas -> el t esta inflado; sirve para el SIGNO, no el nivel)");

export { simularVar, banda41, tablaConst, VARS, PCT, nombres, DD, N, IDX, ELEG, med, f2, precriba, M, P, EPIS };

// ══════════════════════════════════════════════════════════════════════════════════════════
// PARTE 2 — EL TAMAÑO VARIABLE
// ══════════════════════════════════════════════════════════════════════════════════════════

// ── 5. ¿DÓNDE compra de verdad la cartera? (el tamaño sólo importa esos días) ────────────
const base12 = simularVar({ tamPorDia: tablaConst(0.12) });
console.log(`\n═══ LAS ${base12.ops} COMPRAS REALES (tam=0,12) ═══`);
console.log("Ese es TODO el tamaño de muestra sobre el que decide cualquier regla de tamaño.");
let sinPct = 0;
const lin = [];
for (const c of base12.compras) { const t = IDX.get(c.d);
  const q = PCT.caida[t]; if (q == null) sinPct++;
  lin.push(`${c.d} ${c.tk.padEnd(5)} caida=${f2(VARS.caida[t]*100,1)}% pct=${q==null?"n/a":f2(q,2)}`); }
console.log(lin.join("\n"));
console.log(`compras ANTES de que el percentil exista (la regla no actua): ${sinPct} de ${base12.ops}`);
const porAno = {};
for (const c of base12.compras) porAno[c.d.slice(0,4)] = (porAno[c.d.slice(0,4)]||0)+1;
console.log("compras por año:", JSON.stringify(porAno));

// ── 6. LA CURVA CONSTANTE FINA (el listón, para emparejar por EXPOSICION) ────────────────
console.log("\n═══ LISTON 1: TAMAÑO CONSTANTE (banda de 41 capitales, mediana) ═══");
console.log(" tam   expos%   CAGR%   caida%  Sharpe  | Sharpe p10-p90 de la banda");
const CURVA = [];
for (let tam = 0.03; tam <= 0.4501; tam += 0.01) {
  const b = banda41(tablaConst(tam));
  CURVA.push({ tam, inv: b.inv, a: b.a, c: b.c, s: b.s });
  console.log(`${tam.toFixed(2)}  ${f2(b.inv,1).padStart(6)}  ${f2(b.a,2).padStart(6)}  ${f2(b.c,1).padStart(6)}  ${f2(b.s,3).padStart(6)}  | ${f2(b.dS.p10,3)} .. ${f2(b.dS.p90,3)}`);
}
CURVA.sort((x,y)=>x.inv-y.inv);
function interp(inv, campo) {
  if (inv <= CURVA[0].inv) return CURVA[0][campo];
  if (inv >= CURVA[CURVA.length-1].inv) return CURVA[CURVA.length-1][campo];
  for (let i=1;i<CURVA.length;i++) if (CURVA[i].inv >= inv) {
    const w = (inv - CURVA[i-1].inv)/(CURVA[i].inv - CURVA[i-1].inv);
    return CURVA[i-1][campo]*(1-w) + CURVA[i][campo]*w; }
  return NaN; }

const SPYq = M.spyApalancado(1);
console.log(`\n═══ LISTON 2: COMPRAR SPY ═══  CAGR=${f2(SPYq.cagr,2)}%  caida=${f2(SPYq.caida,1)}%  Sharpe=${f2(SPYq.sharpe,3)}`);

// ── 7. COMPROBACION 5: ¿el mando mueve algo? ────────────────────────────────────────────
console.log("\n═══ COMPROBACION: el mando de tamaño variable MUEVE el resultado ═══");
function tablaRegla({ v, c1, c2, tB, tM, tA, invertir, base = 0.12 }) {
  const T = new Map();
  for (let t = 0; t < N; t++) {
    const q = PCT[v][t]; let tam;
    if (q == null) tam = base;
    else { const z = invertir ? 1 - q : q; tam = z < c1 ? tB : (z < c2 ? tM : tA); }
    T.set(DD[t], tam); }
  return T; }
for (const [tB,tA] of [[0.01,0.45],[0.45,0.01],[0.12,0.12]]) {
  const q = simularVar({ tamPorDia: tablaRegla({ v:"caida", c1:0.33, c2:0.67, tB, tM:0.12, tA, invertir:false }) });
  console.log(`  caida  tB=${tB} tA=${tA}  ->  CAGR=${f2(q.cagr,2)}  Sharpe=${f2(q.sharpe,3)}  expos=${f2(q.invertido,1)}%`); }

// ── 8. EL BARRIDO ENTERO ────────────────────────────────────────────────────────────────
// Regla: tres cubos por percentil móvil de la variable.  z = señal (invertir=true => alto
// percentil es cubo MALO).  tam = tB / 0,12 / tA.  Emparejado por EXPOSICION contra la
// curva constante.  41 capitales de partida en cada casilla.
console.log("\n═══ BARRIDO COMPLETO: 3 cubos por percentil movil ═══");
console.log("var / dir  cortes    tB   tA  | expos%  CAGR%  caida%  Sharpe | const@misma expos | dSharpe  dCAGR");
const RES = [];
const CORTES = [[0.20,0.80],[0.25,0.75],[0.33,0.67],[0.40,0.60]];
const RAZON  = [1.25, 1.5, 2.0, 2.5, 3.0];
for (const v of nombres) {
  for (const invertir of [false, true]) {
    for (const [c1,c2] of CORTES) {
      for (const r of RAZON) {
        const tB = 0.12/r, tA = 0.12*r;
        const T = tablaRegla({ v, c1, c2, tB, tM:0.12, tA, invertir });
        const b = banda41(T);
        const cs = interp(b.inv,"s"), ca = interp(b.inv,"a"), cc = interp(b.inv,"c");
        const row = { v, invertir, c1, c2, r, tB, tA, inv:b.inv, a:b.a, c:b.c, s:b.s,
                      cs, ca, cc, ds: b.s-cs, da: b.a-ca, p10:b.dS.p10, p90:b.dS.p90 };
        RES.push(row);
        console.log(`${v.padEnd(11)}${invertir?"inv":"dir"} ${c1.toFixed(2)}/${c2.toFixed(2)} ${tB.toFixed(3)} ${tA.toFixed(2)} | ${f2(b.inv,1).padStart(6)} ${f2(b.a,2).padStart(6)} ${f2(b.c,1).padStart(6)} ${f2(b.s,3).padStart(7)} | ${f2(cs,3).padStart(6)} ${f2(ca,2).padStart(6)} ${f2(cc,1).padStart(6)} | ${f2(b.s-cs,3).padStart(7)} ${f2(b.a-ca,2).padStart(6)}`);
      } } } }

// ── 9. RESUMEN por variable: media y dispersion del barrido ──────────────────────────────
console.log("\n═══ RESUMEN por variable+direccion (20 casillas cada uno) ═══");
console.log("var / dir   dSharpe: media   sd    min    max  | nº casillas que GANAN al constante");
const RESU = [];
for (const v of nombres) for (const invertir of [false, true]) {
  const G = RES.filter(x=>x.v===v && x.invertir===invertir);
  if (!G.length) continue;
  const d = G.map(x=>x.ds);
  const m = d.reduce((a,x)=>a+x,0)/d.length;
  const sd = Math.sqrt(d.reduce((a,x)=>a+(x-m)**2,0)/(d.length-1));
  const gana = d.filter(x=>x>0).length;
  RESU.push({ v, invertir, m, sd, min:Math.min(...d), max:Math.max(...d), gana, n:d.length });
  console.log(`${v.padEnd(11)}${invertir?"inv":"dir"}   ${f2(m,3).padStart(7)} ${f2(sd,3).padStart(6)} ${f2(Math.min(...d),3).padStart(6)} ${f2(Math.max(...d),3).padStart(6)}  |  ${gana}/${d.length}`);
}
RESU.sort((a,b)=>b.m-a.m);
console.log("\nMEJORES por dSharpe medio del barrido:");
for (const x of RESU.slice(0,5)) console.log(`  ${x.v} ${x.invertir?"inv":"dir"}  media=${f2(x.m,3)}  sd=${f2(x.sd,3)}  gana ${x.gana}/${x.n}`);
console.log("PEORES:");
for (const x of RESU.slice(-3)) console.log(`  ${x.v} ${x.invertir?"inv":"dir"}  media=${f2(x.m,3)}  sd=${f2(x.sd,3)}  gana ${x.gana}/${x.n}`);

// ── 10. LA MEJOR CASILLA y sus VECINAS (¿pico solitario?) ────────────────────────────────
const TOP = [...RES].sort((a,b)=>b.ds-a.ds).slice(0,12);
console.log("\n═══ LAS 12 MEJORES CASILLAS del barrido (dSharpe vs constante emparejado) ═══");
for (const x of TOP) console.log(`  ${x.v.padEnd(11)}${x.invertir?"inv":"dir"} ${x.c1.toFixed(2)}/${x.c2.toFixed(2)} r=${x.r}  expos=${f2(x.inv,1)}%  Sharpe=${f2(x.s,3)} vs const ${f2(x.cs,3)}  dS=${f2(x.ds,3)}  CAGR=${f2(x.a,2)} vs ${f2(x.ca,2)}`);
const mejor = TOP[0];
console.log(`\nVECINAS de la mejor (${mejor.v} ${mejor.invertir?"inv":"dir"}):`);
for (const x of RES.filter(y=>y.v===mejor.v && y.invertir===mejor.invertir).sort((a,b)=>a.c1-b.c1||a.r-b.r))
  console.log(`   cortes ${x.c1.toFixed(2)}/${x.c2.toFixed(2)} r=${x.r}  dS=${f2(x.ds,3)}  Sharpe=${f2(x.s,3)}  expos=${f2(x.inv,1)}%`);
export { RES, RESU, CURVA, interp, tablaRegla, base12, SPYq };

// ── 11. BARRIDOS COMPLETOS de las 4 familias menos malas ─────────────────────────────────
for (const [v,inv] of [["sesgo126",true],["mom12",true],["vol126",false],["caida",false]]) {
  console.log(`\n═══ BARRIDO ENTERO — ${v} ${inv?"inv":"dir"} ═══   (dS = Sharpe menos el constante a la MISMA exposicion)`);
  console.log("cortes      r=1.25    r=1.5     r=2      r=2.5     r=3");
  for (const [c1,c2] of CORTES) {
    const fila = RAZON.map(r => { const x = RES.find(y=>y.v===v&&y.invertir===inv&&y.c1===c1&&y.r===r);
      return `${f2(x.ds,3).padStart(7)}`; });
    console.log(`${c1.toFixed(2)}/${c2.toFixed(2)}  ${fila.join("  ")}`); } }

// ── 12. EL CONTROL BARAJADO: la misma regla, DESALINEADA del mercado ─────────────────────
// Se rota la serie de tamaños circularmente. Conserva su forma y su autocorrelacion; pierde
// la alineacion con el mercado. Si la regla real cae dentro de esa nube, es ruido.
function rota(T, k) { const R = new Map();
  for (let t=0;t<N;t++) R.set(DD[t], T.get(DD[(t+k) % N]));
  return R; }
console.log("\n═══ CONTROL BARAJADO (250 rotaciones circulares) ═══");
console.log("regla                          dS real | nube rotada: p50   p90   p95   max | percentil de la real");
const CANDID = [ {v:"d50",inv:true,c1:0.20,c2:0.80,r:2}, {v:"sesgo126",inv:true,c1:0.33,c2:0.67,r:2},
  {v:"mom12",inv:true,c1:0.33,c2:0.67,r:1.5}, {v:"vol126",inv:false,c1:0.33,c2:0.67,r:1.5},
  {v:"caida",inv:false,c1:0.33,c2:0.67,r:1.5} ];
const BARAJ = [];
for (const cd of CANDID) {
  const T = tablaRegla({ v:cd.v, c1:cd.c1, c2:cd.c2, tB:0.12/cd.r, tM:0.12, tA:0.12*cd.r, invertir:cd.inv });
  const real = simularVar({ tamPorDia: T });
  const dsReal = real.sharpe - interp(real.invertido,"s");
  const nube = [];
  for (let j=1;j<=250;j++) { const k = Math.round(j*N/251);
    const q = simularVar({ tamPorDia: rota(T,k) });
    nube.push(q.sharpe - interp(q.invertido,"s")); }
  nube.sort((a,b)=>a-b);
  const pct = nube.filter(x=>x<dsReal).length/nube.length;
  BARAJ.push({ ...cd, dsReal, p50:nube[125], p90:nube[225], p95:nube[237], max:nube[249], pct });
  console.log(`${(cd.v+" "+(cd.inv?"inv":"dir")+" "+cd.c1+"/"+cd.c2+" r="+cd.r).padEnd(30)} ${f2(dsReal,3).padStart(7)} | ${f2(nube[125],3).padStart(6)} ${f2(nube[225],3).padStart(6)} ${f2(nube[237],3).padStart(6)} ${f2(nube[249],3).padStart(6)} | ${(pct*100).toFixed(0)}%`);
}

// ── 13. VERSION CONTINUA (graduador, no interruptor) ────────────────────────────────────
// tam(t) = 0,12 * (1 + k*(2*z-1)) recortado a [0,02 ; 0,45].  z = percentil movil.
console.log("\n═══ VERSION CONTINUA: tam = 0,12 * (1 + k*(2z-1)) ═══");
console.log("var / dir     k=0.3    k=0.5    k=0.8    k=1.0    k=1.5   (dSharpe vs constante emparejado)");
function tablaCont({ v, k, invertir, base=0.12 }) { const T = new Map();
  for (let t=0;t<N;t++) { const q = PCT[v][t];
    T.set(DD[t], q==null ? base : Math.max(0.02, Math.min(0.45, base*(1 + k*(2*((invertir?1-q:q))-1))))); }
  return T; }
const CONT = [];
for (const v of nombres) for (const invertir of [false,true]) {
  const fila = [0.3,0.5,0.8,1.0,1.5].map(k => { const b = banda41(tablaCont({v,k,invertir}));
    const ds = b.s - interp(b.inv,"s"); CONT.push({v,invertir,k,ds,s:b.s,a:b.a,c:b.c,inv:b.inv});
    return f2(ds,3).padStart(7); });
  console.log(`${v.padEnd(11)}${invertir?"inv":"dir"} ${fila.join("  ")}`); }
const cd = CONT.map(x=>x.ds), cm = cd.reduce((a,x)=>a+x,0)/cd.length;
console.log(`\ncontinuas: ${cd.filter(x=>x>0).length}/${cd.length} ganan al constante; dSharpe medio=${f2(cm,3)}, sd=${f2(Math.sqrt(cd.reduce((a,x)=>a+(x-cm)**2,0)/(cd.length-1)),3)}, max=${f2(Math.max(...cd),3)}`);
export { BARAJ, CONT };

// ── 14. ¿CUANTAS DECISIONES sostienen cada regla? y la BANDA de 41 capitales ─────────────
console.log("\n═══ ANATOMIA de las reglas que ganan ═══");
function anatomia(cd) {
  const T = tablaRegla({ v:cd.v, c1:cd.c1, c2:cd.c2, tB:0.12/cd.r, tM:0.12, tA:0.12*cd.r, invertir:cd.inv });
  const q = simularVar({ tamPorDia: T });
  const cnt = { grande:0, medio:0, pequeno:0, base:0 };
  const tA = 0.12*cd.r, tB = 0.12/cd.r;
  const filas = [];
  for (const c of q.compras) { const t = IDX.get(c.d); const z0 = PCT[cd.v][t];
    const cubo = z0==null ? "base" : (Math.abs(c.tam-tA)<1e-9 ? "grande" : (Math.abs(c.tam-tB)<1e-9 ? "pequeno" : "medio"));
    cnt[cubo]++;
    const op = OPS.find(o=>o.dC===c.d && o.tk===c.tk);
    const mlt = op ? op.camino[Math.min(PLAZO-1, op.camino.length-1)][1] : NaN;
    filas.push(`   ${c.d} ${c.tk.padEnd(5)} tam=${c.tam.toFixed(3)} ${cubo.padEnd(8)} mult120=${f2(mlt,2)}`); }
  // banda de 41: dispersion del dSharpe
  const DS = [];
  for (let i=0;i<=40;i++){ const r2 = simularVar({ tamPorDia:T, capital: 60000*(1+(i-20)*0.005) });
    DS.push(r2.sharpe - interp(r2.invertido,"s")); }
  DS.sort((a,b)=>a-b);
  return { q, cnt, filas, DS, dsMed: DS[20], p10: DS[4], p90: DS[36], min: DS[0], max: DS[40],
           gana: DS.filter(x=>x>0).length };
}
for (const cd of CANDID.slice(0,4)) {
  const A = anatomia(cd);
  console.log(`\n${cd.v} ${cd.inv?"inv":"dir"} ${cd.c1}/${cd.c2} r=${cd.r}   tam grande=${(0.12*cd.r).toFixed(3)} / medio=0.120 / pequeno=${(0.12/cd.r).toFixed(3)}`);
  console.log(`  reparto de las ${A.q.ops} compras: grande=${A.cnt.grande} medio=${A.cnt.medio} pequeno=${A.cnt.pequeno} sin-percentil=${A.cnt.base}`);
  console.log(`  BANDA 41 capitales -> dSharpe mediana=${f2(A.dsMed,3)}  p10=${f2(A.p10,3)}  p90=${f2(A.p90,3)}  min=${f2(A.min,3)}  max=${f2(A.max,3)}  | positivas ${A.gana}/41`);
}
console.log("\nDetalle de las compras de sesgo126 inv 0.33/0.67 r=2:");
console.log(anatomia(CANDID[1]).filas.join("\n"));

// ── 15. INDICE COMPUESTO: las tres que ganan dicen LO MISMO (mercado recien golpeado) ────
console.log("\n═══ INDICE COMPUESTO (media de percentiles de d50, mom12 y sesgo126, todos invertidos) ═══");
const COMP = new Array(N).fill(null);
for (let t=0;t<N;t++) { const a=PCT.d50[t], b=PCT.mom12[t], c=PCT.sesgo126[t];
  const L=[a,b,c].filter(x=>x!=null); if (L.length===3) COMP[t] = 1 - L.reduce((x,y)=>x+y,0)/3; }
PCT.comp = COMP; nombres.push("comp");
console.log("cortes      r=1.25    r=1.5     r=2      r=2.5     r=3");
for (const [c1,c2] of CORTES) {
  const fila = RAZON.map(r => { const b = banda41(tablaRegla({v:"comp",c1,c2,tB:0.12/r,tM:0.12,tA:0.12*r,invertir:false}));
    return f2(b.s - interp(b.inv,"s"),3).padStart(7); });
  console.log(`${c1.toFixed(2)}/${c2.toFixed(2)}  ${fila.join("  ")}`); }
{ const cdc = {v:"comp",inv:false,c1:0.33,c2:0.67,r:1.5};
  const A = anatomia(cdc);
  console.log(`\ncomp 0.33/0.67 r=1.5  reparto: grande=${A.cnt.grande} medio=${A.cnt.medio} pequeno=${A.cnt.pequeno} sin-pct=${A.cnt.base}`);
  console.log(`  BANDA 41 -> dSharpe mediana=${f2(A.dsMed,3)} p10=${f2(A.p10,3)} p90=${f2(A.p90,3)} | positivas ${A.gana}/41`);
  const T = tablaRegla({v:"comp",c1:0.33,c2:0.67,tB:0.08,tM:0.12,tA:0.18,invertir:false});
  const real = simularVar({tamPorDia:T}); const dsReal = real.sharpe - interp(real.invertido,"s");
  const nube=[]; for (let j=1;j<=250;j++){ const k=Math.round(j*N/251); const q2=simularVar({tamPorDia:rota(T,k)});
    nube.push(q2.sharpe - interp(q2.invertido,"s")); }
  nube.sort((a,b)=>a-b);
  console.log(`  CONTROL BARAJADO: real dS=${f2(dsReal,3)} | nube p50=${f2(nube[125],3)} p90=${f2(nube[225],3)} max=${f2(nube[249],3)} | percentil ${(100*nube.filter(x=>x<dsReal).length/250).toFixed(0)}%`); }

// ── 16. LA PREGUNTA DEL PROMPT: ¿el rebote rapido es el mecanismo? ───────────────────────
console.log("\n═══ EL MECANISMO: ¿la VELOCIDAD DE REBOTE explica el resultado? ═══");
console.log("De las 47 compras, resultado a 120 dias segun lo que TARDO despues el mercado");
console.log("en recuperar (esto es MIRAR AL FUTURO: solo sirve para ver si el mecanismo existe)");
{ const F = [];
  for (const c of base12.compras) { const t = IDX.get(c.d);
    // dias hasta que SPY vuelva a su maximo previo, mirando HACIA DELANTE (diagnostico)
    let d = null; const mx = runMax[t];
    for (let j=t;j<Math.min(N,t+400);j++) if (P[j] >= mx) { d = j-t; break; }
    const op = OPS.find(o=>o.dC===c.d && o.tk===c.tk);
    const mlt = op ? op.camino[Math.min(PLAZO-1, op.camino.length-1)][1] : NaN;
    F.push({ d: d==null?400:d, mlt, dd: VARS.caida[t] }); }
  F.sort((a,b)=>a.d-b.d);
  const mitad = Math.floor(F.length/2);
  const mu = (X)=>X.reduce((a,x)=>a+x.mlt,0)/X.length;
  console.log(`  rebote RAPIDO (${F.slice(0,mitad).length} compras, mediana ${med(F.slice(0,mitad).map(x=>x.d))} sesiones): mult120 medio = ${f2(mu(F.slice(0,mitad)),3)}`);
  console.log(`  rebote LENTO  (${F.slice(mitad).length} compras, mediana ${med(F.slice(mitad).map(x=>x.d))} sesiones): mult120 medio = ${f2(mu(F.slice(mitad)),3)}`);
  const G=[[],[],[],[]]; for (const e of ELEG) { const t=e.t; const mx=runMax[t]; let d=null;
    for (let j=t;j<Math.min(N,t+400);j++) if (P[j]>=mx) { d=j-t; break; } if(d==null)d=400;
    G[d<=10?0:d<=40?1:d<=120?2:3].push(e.mult); }
  console.log("  sobre las 10.674 elegibles, por sesiones hasta recuperar el maximo (futuro):");
  const et=["0-10","11-40","41-120","120+"];
  G.forEach((x,i)=>console.log(`     ${et[i].padEnd(7)} n=${String(x.length).padStart(5)}  mult120 medio = ${f2(x.reduce((a,y)=>a+y,0)/x.length,3)}`)); }

// ── 17. ROBUSTEZ de las dos que sobreviven a la banda ───────────────────────────────────
console.log("\n═══ ROBUSTEZ ═══");
const REGLA = { v:"comp", c1:0.33, c2:0.67, r:1.5, inv:false };   // tam 0,08 / 0,12 / 0,18
const Treg = tablaRegla({ v:"comp", c1:0.33, c2:0.67, tB:0.08, tM:0.12, tA:0.18, invertir:false });
{ const b = banda41(Treg);
  console.log(`\nLA REGLA (compuesto, tam 0,08 / 0,12 / 0,18):`);
  console.log(`  CAGR=${f2(b.a,2)}%  caida=${f2(b.c,1)}%  Sharpe=${f2(b.s,3)}  exposicion=${f2(b.inv,1)}%  ops=${b.ops}`);
  console.log(`  constante a la MISMA exposicion: CAGR=${f2(interp(b.inv,"a"),2)}%  caida=${f2(interp(b.inv,"c"),1)}%  Sharpe=${f2(interp(b.inv,"s"),3)}`);
  const b12 = banda41(tablaConst(0.12));
  console.log(`  constante 0,12 (el base):        CAGR=${f2(b12.a,2)}%  caida=${f2(b12.c,1)}%  Sharpe=${f2(b12.s,3)}  exposicion=${f2(b12.inv,1)}%`);
  console.log(`  comprar SPY:                     CAGR=${f2(SPYq.cagr,2)}%  caida=${f2(SPYq.caida,1)}%  Sharpe=${f2(SPYq.sharpe,3)}`); }

// (a) ¿la sostiene UNA sola operacion? — se quita la mejor y se vuelve a medir
console.log("\n(a) JACKKNIFE: se quita 1 operacion (la marcamos no elegible) y se remide");
const guardar = new Map();
const mejores = [...base12.compras].map(c=>({c, op: OPS.find(o=>o.dC===c.d && o.tk===c.tk)}))
  .filter(x=>x.op).map(x=>({...x, m: x.op.camino[Math.min(PLAZO-1,x.op.camino.length-1)][1]}))
  .sort((a,b)=>b.m-a.m).slice(0,6);
console.log("  quitando      dS regla   Sharpe regla  Sharpe const@expos");
for (const x of mejores) {
  const ma0 = x.op.ma; x.op.ma = 999;
  const q = simularVar({ tamPorDia: Treg }); const cs = interp(q.invertido,"s");
  console.log(`  ${x.c.d} ${x.c.tk.padEnd(5)} (x${f2(x.m,2)})  ${f2(q.sharpe-cs,3).padStart(7)}    ${f2(q.sharpe,3)}        ${f2(cs,3)}`);
  x.op.ma = ma0; }

// (b) ¿aguanta si se cambia la ESTRATEGIA de sitio?
console.log("\n(b) PERTURBAR LA ESTRATEGIA (la regla de tamaño no se toca)");
console.log("  variante          expos%  Sharpe regla  Sharpe const@expos   dS");
for (const cfg of [{huecos:1},{huecos:2},{huecos:3},{huecos:4},{plazo:90},{plazo:120},{plazo:150},{plazo:200},{castigo:0.025}]) {
  const et = Object.entries(cfg).map(([k,v])=>k+"="+v).join(" ");
  // curva constante propia de esa variante (el liston tiene que moverse con ella)
  const CV = [];
  for (let tam=0.03; tam<=0.4501; tam+=0.02) { const S=[],I=[];
    for (let i=0;i<=40;i+=4){ const q=simularVar({tamPorDia:tablaConst(tam),capital:60000*(1+(i-20)*0.005),...cfg}); S.push(q.sharpe); I.push(q.invertido); }
    CV.push({inv:med(I), s:med(S)}); }
  CV.sort((a,b)=>a.inv-b.inv);
  const ip=(inv)=>{ if(inv<=CV[0].inv) return CV[0].s; if(inv>=CV[CV.length-1].inv) return CV[CV.length-1].s;
    for(let i=1;i<CV.length;i++) if(CV[i].inv>=inv){ const w=(inv-CV[i-1].inv)/(CV[i].inv-CV[i-1].inv); return CV[i-1].s*(1-w)+CV[i].s*w; } return NaN; };
  const S=[],I=[]; for(let i=0;i<=40;i+=4){ const q=simularVar({tamPorDia:Treg,capital:60000*(1+(i-20)*0.005),...cfg}); S.push(q.sharpe); I.push(q.invertido); }
  const s=med(S), inv=med(I);
  console.log(`  ${et.padEnd(16)}  ${f2(inv,1).padStart(6)}  ${f2(s,3).padStart(11)}  ${f2(ip(inv),3).padStart(16)}  ${f2(s-ip(inv),3).padStart(7)}`); }

// (c) ¿aguanta si se cambia la VARIABLE de sitio? (ventanas del momento y del percentil)
console.log("\n(c) PERTURBAR LA VARIABLE — momento a K meses, percentil con ventana W");
console.log("  K(sesiones)  W=378   W=504   W=630");
for (const K of [126, 189, 252, 315, 378]) {
  const fila = [378,504,630].map(W => {
    const v = new Array(N).fill(null);
    for (let t=1;t<N;t++){ const u=t-1; if (u-K>=0) v[t] = P[u]/P[u-K]-1; }
    const q = new Array(N).fill(null);
    for (let t=0;t<N;t++){ if (v[t]==null) continue; const H=[];
      for (let j=Math.max(0,t-W);j<t;j++) if (v[j]!=null) H.push(v[j]);
      if (H.length < Math.min(250,W/2)) continue; let c=0; for (const x of H) if (x<v[t]) c++; q[t]=c/H.length; }
    PCT.__tmp = q;
    const b = banda41(tablaRegla({ v:"__tmp", c1:0.33, c2:0.67, tB:0.08, tM:0.12, tA:0.18, invertir:true }));
    return f2(b.s - interp(b.inv,"s"),3).padStart(6); });
  console.log(`  ${String(K).padStart(6)}      ${fila.join("  ")}`); }
delete PCT.__tmp;

// ── 18. VEREDICTO NUMERICO ──────────────────────────────────────────────────────────────
const dsTodas = RES.map(x=>x.ds).concat(CONT.map(x=>x.ds));
const dm = dsTodas.reduce((a,x)=>a+x,0)/dsTodas.length;
const dsd = Math.sqrt(dsTodas.reduce((a,x)=>a+(x-dm)**2,0)/(dsTodas.length-1));
console.log(`\n═══ EL BARRIDO ENTERO, DE UN VISTAZO ═══`);
console.log(`  ${dsTodas.length} casillas medidas (480 de 3 cubos + 120 continuas)`);
console.log(`  dSharpe contra el constante emparejado: media=${f2(dm,3)}  sd(DISPERSION)=${f2(dsd,3)}  min=${f2(Math.min(...dsTodas),3)}  max=${f2(Math.max(...dsTodas),3)}`);
console.log(`  casillas que GANAN al tamaño constante: ${dsTodas.filter(x=>x>0).length} de ${dsTodas.length} (${(100*dsTodas.filter(x=>x>0).length/dsTodas.length).toFixed(0)}%)`);

// ── 19. EL TECHO CON BOLA DE CRISTAL ────────────────────────────────────────────────────
// ⚠️ ESTO MIRA AL FUTURO A PROPOSITO. No es una estrategia: es el TECHO de lo que esta
// FORMA de regla (tres cubos de tamaño) puede comprar aunque aciertes el regimen SIEMPRE.
// Si el techo es bajo, el problema no es el predictor: es que el dial no da para mas.
console.log("\n═══ TECHO CON BOLA DE CRISTAL (mira al futuro — solo para saber si vale la pena) ═══");
{ // percentil del multiplicador FUTURO a 120 dias de la mejor op elegible de cada dia
  const futD = new Array(N).fill(null);
  for (const e of ELEG) { const m = e.mult; if (futD[e.t]==null || m > futD[e.t]) futD[e.t] = m; }
  // arrastra el ultimo conocido para que todos los dias tengan valor (da igual: solo importan
  // los dias en que se compra)
  const orden = ELEG.map(e=>e.mult).sort((a,b)=>a-b);
  const rank = (m)=>{ let c=0; for (const x of orden) if (x<m) c++; return c/orden.length; };
  const q = new Array(N).fill(null);
  for (let t=0;t<N;t++) if (futD[t]!=null) q[t] = rank(futD[t]);
  PCT.__oraculo = q;
  console.log("  cortes      r=1.25    r=1.5     r=2      r=2.5     r=3      r=5");
  for (const [c1,c2] of CORTES) {
    const fila = [1.25,1.5,2,2.5,3,5].map(r => { const b = banda41(tablaRegla({v:"__oraculo",c1,c2,tB:0.12/r,tM:0.12,tA:0.12*r,invertir:false}));
      return f2(b.s - interp(b.inv,"s"),3).padStart(7); });
    console.log(`  ${c1.toFixed(2)}/${c2.toFixed(2)}  ${fila.join("  ")}`); }
  const bo = banda41(tablaRegla({v:"__oraculo",c1:0.33,c2:0.67,tB:0.06,tM:0.12,tA:0.24,invertir:false}));
  console.log(`  oraculo 0.33/0.67 r=2: CAGR=${f2(bo.a,2)}% caida=${f2(bo.c,1)}% Sharpe=${f2(bo.s,3)} expos=${f2(bo.inv,1)}% | constante@expos Sharpe=${f2(interp(bo.inv,"s"),3)} -> dS=${f2(bo.s-interp(bo.inv,"s"),3)}`);
  delete PCT.__oraculo; }

// ── 20. ¿Y LA CAIDA? emparejando por CAGR en vez de por exposicion ──────────────────────
console.log("\n═══ ¿ALGUNA REGLA RECORTA LA CAIDA a igual CAGR? ═══");
CURVA.sort((a,b)=>a.a-b.a);
const interpA = (a) => { if (a<=CURVA[0].a) return CURVA[0].c; if (a>=CURVA[CURVA.length-1].a) return CURVA[CURVA.length-1].c;
  for (let i=1;i<CURVA.length;i++) if (CURVA[i].a>=a){ const w=(a-CURVA[i-1].a)/(CURVA[i].a-CURVA[i-1].a); return CURVA[i-1].c*(1-w)+CURVA[i].c*w; } return NaN; };
const MEJ = [...RES].sort((x,y)=>x.c-y.c);
console.log("  las 8 reglas de MENOR caida y su constante al MISMO CAGR:");
for (const x of MEJ.slice(0,8)) console.log(`   ${x.v.padEnd(11)}${x.invertir?"inv":"dir"} ${x.c1}/${x.c2} r=${x.r}  CAGR=${f2(x.a,2)}% caida=${f2(x.c,1)}% | constante al mismo CAGR: caida=${f2(interpA(x.a),1)}%  -> ${x.c<interpA(x.a)?"MEJOR":"peor"} en ${f2(Math.abs(x.c-interpA(x.a)),1)} pts`);
const gan = RES.filter(x=>x.c < interpA(x.a) - 1);
console.log(`  reglas que recortan la caida en >1 punto a igual CAGR: ${gan.length} de ${RES.length}`);
CURVA.sort((a,b)=>a.inv-b.inv);
console.log("\n═══ FIN ═══");
