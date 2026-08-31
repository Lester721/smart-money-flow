// ══════════════════════════════════════════════════════════════════════════════════════════
// wf-tipos.mjs — ¿EL TIPO DE INTERÉS DICE QUÉ TAMAÑO PONER?
//
// Familia asignada: TIPOS DE INTERÉS Y POLÍTICA MONETARIA.
//
// El tipo libre de riesgo NO se descarga de ningún sitio: se EXTRAE de la paridad put-call
// de nuestras propias cadenas de SPY, vencimiento a ~1 año:
//
//      r = − ln( (S − C_mid + P_mid) / K ) / T
//
// (aviso honesto: en un subyacente con dividendo esto mide r − q, el "carry". Para SPY q va
//  de ~1,9% en 2016 a ~1,2% en 2025, así que el NIVEL lleva un sesgo lento de −1,5 pp y los
//  CAMBIOS llevan un sesgo de ~−0,07 pp/año: despreciable frente a los +4 pp de 2022.)
//
// Hipótesis con mecanismo: subir tipos castiga el apalancamiento largo → encoger el tamaño
// cuando los tipos SUBEN rápido.
//
// DISCIPLINAS: sólo datos pasados (percentiles con ventana móvil de 2 años), el listón es el
// TAMAÑO CONSTANTE (no el cero), se enseña el BARRIDO ENTERO con su dispersión, banda de 41
// capitales de partida, y se comprueba que el mando MUEVE algo.
// ══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";

process.env.CAMINOS = "largo-p25-d400.json";
const M = await import("./motor-cartera.mjs");
for (const o of M.OPS) if (o.ma >= 0) o.ma = 999;      // sólo días bajo la media de 20

const DD = M.DD, SPY = M.SPY;
const ms = (d) => Date.parse(d.slice(0,4)+"-"+d.slice(4,6)+"-"+d.slice(6,8)+"T00:00:00Z");
const med = (X) => { const B=[...X].sort((a,b)=>a-b); return B.length%2 ? B[(B.length-1)/2] : (B[B.length/2-1]+B[B.length/2])/2; };
const sd  = (X) => { const m=X.reduce((a,x)=>a+x,0)/X.length; return Math.sqrt(X.reduce((a,x)=>a+(x-m)**2,0)/Math.max(1,X.length-1)); };
const f2 = (x,n=2)=> (x==null||!isFinite(x)) ? "  --  " : x.toFixed(n).padStart(6);

// ══════════════════════════════════════════════════════════════════════════════════════════
// 1. LA SERIE DE TIPOS — de la paridad put-call de nuestras cadenas de SPY
// ══════════════════════════════════════════════════════════════════════════════════════════
const CACHE_R = join(CACHE, "_wf-tipos-serie.json");

function extraerTipos() {
  const PRE = JSON.parse(readFileSync(join(CACHE, "precios-diarios.json"), "utf8")).SPY;
  const out = {};
  let leidos = 0, sinFichero = 0, sinExp = 0;
  for (const d of DD) {
    const f = join(CACHE, "cadenas", `SPY_d${d}.json`);
    if (!existsSync(f)) { sinFichero++; continue; }
    const S = PRE[d]; if (!S) continue;
    let j; try { j = JSON.parse(readFileSync(f, "utf8")); } catch { continue; }
    leidos++;
    // vencimiento más cercano a 365 días, dentro de [270, 500]
    let best = null, bd = 1e9;
    for (const e of Object.keys(j)) {
      const dte = (ms(e) - ms(d)) / 86400000;
      if (dte < 270 || dte > 500) continue;
      if (Math.abs(dte - 365) < bd) { bd = Math.abs(dte - 365); best = e; }
    }
    if (!best) { sinExp++; continue; }
    const T = (ms(best) - ms(d)) / 86400000 / 365;
    const porK = new Map();
    for (const k of Object.keys(j[best])) {
      const i = k.indexOf("|"); const K = +k.slice(0, i), tipo = k.slice(i + 1);
      if (!porK.has(K)) porK.set(K, {}); porK.get(K)[tipo] = j[best][k];
    }
    const rs = [];
    for (const [K, v] of porK) {
      if (!v.C || !v.P) continue;
      if (!(v.C[0] > 0 && v.P[0] > 0 && v.C[1] > v.C[0] && v.P[1] > v.P[0])) continue;
      if (Math.abs(K / S - 1) > 0.10) continue;                 // cerca del dinero
      const C = (v.C[0] + v.C[1]) / 2, P = (v.P[0] + v.P[1]) / 2;
      const x = (S - C + P) / K;
      if (!(x > 0.5 && x < 1.5)) continue;
      rs.push(-Math.log(x) / T);
    }
    if (rs.length >= 5) out[d] = { r: 100 * med(rs), n: rs.length, exp: best, T: +T.toFixed(3) };
  }
  console.log(`  [tipos] días con cadena ${leidos}/${DD.length} · sin fichero ${sinFichero} · sin venc. ~1a ${sinExp} · serie ${Object.keys(out).length}`);
  return out;
}

let SERIE;
if (existsSync(CACHE_R)) { SERIE = JSON.parse(readFileSync(CACHE_R, "utf8")); console.log(`  [tipos] serie leída de caché (${Object.keys(SERIE).length} días)`); }
else { SERIE = extraerTipos(); writeFileSync(CACHE_R, JSON.stringify(SERIE)); }

// serie densa sobre DD, arrastrando el último valor conocido (nunca el siguiente)
const R = new Array(DD.length).fill(null);
{ let ult = null;
  for (let i = 0; i < DD.length; i++) { const s = SERIE[DD[i]]; if (s) ult = s.r; R[i] = ult; } }

// suavizado de 5 días (mediana) — sólo mira hacia atrás
const RS = R.map((_, i) => { const w = []; for (let k = Math.max(0, i - 4); k <= i; k++) if (R[k] != null) w.push(R[k]); return w.length ? med(w) : null; });

// ── variables derivadas, todas en la fecha i con datos ≤ i ──
const V = {};                                     // nombre -> array alineado a DD
V.nivel  = RS.slice();
V.d3     = RS.map((x, i) => (x == null || i < 63  || RS[i-63]  == null) ? null : x - RS[i-63]);
V.d6     = RS.map((x, i) => (x == null || i < 126 || RS[i-126] == null) ? null : x - RS[i-126]);
V.d12    = RS.map((x, i) => (x == null || i < 252 || RS[i-252] == null) ? null : x - RS[i-252]);
V.acel   = V.d3.map((x, i) => (x == null || i < 63 || V.d3[i-63] == null) ? null : x - V.d3[i-63]);

// percentil con ventana MÓVIL de 2 años (504 sesiones), estrictamente pasado
function percentilMovil(A, ven = 504) {
  return A.map((x, i) => {
    if (x == null || i < ven) return null;
    let n = 0, m = 0;
    for (let k = i - ven; k < i; k++) { const y = A[k]; if (y == null) continue; m++; if (y <= x) n++; }
    return m >= ven * 0.6 ? n / m : null;
  });
}
const P = {}; for (const k of Object.keys(V)) P[k] = percentilMovil(V[k]);

// ══════════════════════════════════════════════════════════════════════════════════════════
// 2. EL MOTOR CON TAMAÑO VARIABLE — copia literal del bucle de motor-cartera.mjs.
//    Lo ÚNICO que cambia: `tam` puede ser una función de la fecha.
//    Se valida abajo que con tam constante da EXACTAMENTE lo mismo que M.simular.
// ══════════════════════════════════════════════════════════════════════════════════════════
const SECTOR = M.SECTOR;
const POR_DIA = new Map();
for (const o of M.OPS) { if (!POR_DIA.has(o.dC)) POR_DIA.set(o.dC, []); POR_DIA.get(o.dC).push(o); }
const DIV_SPY = 0.013;

function simular2({ capital = 60000, tam = 0.15, huecos = 6, modo = "spy", plazo = 0,
                    castigo = 0, suelo = 0, topeGanancia = 0, costeMin = 0, topeSector = 0,
                    cadencia = 0 } = {}) {
  const TAM = (typeof tam === "function") ? tam : () => tam;
  const kC = 1 + castigo / 2, kM = (1 - castigo / 2) / (1 + castigo / 2);
  const intD = Math.pow(1.033, 1/252) - 1, divD = Math.pow(1 + DIV_SPY, 1/252) - 1;
  const dias = DD;
  let caja = capital, acc = 0, ab = [], tom = [];
  const Vc = [], nuevas = [];
  let pico = capital, peor = 0, sInv = 0, sTam = 0;

  for (let t = 0; t < dias.length; t++) {
    const hoy = dias[t], p = SPY[hoy];
    if (modo === "spy") acc *= (1 + divD); else caja *= (1 + intD);

    for (const o of ab) { const m = o.m.get(hoy); if (m != null) o.ultMult = m * kM; }
    for (let i = ab.length - 1; i >= 0; i--) if (ab[i].dSal <= hoy) { caja += ab[i].dinero * ab[i].ultMult; ab.splice(i, 1); }

    const corte = dias[Math.max(0, t - 21)];
    const tamHoy = TAM(t, hoy);
    sTam += tamHoy;
    for (const x of (POR_DIA.get(hoy) || []).slice().sort((a, b) => a.ma - b.ma)) {
      if (ab.length >= huecos) break;
      if (x.ma >= 0) continue;
      if (costeMin > 0 && x.coste < costeMin) continue;
      if (ab.some((o) => o.tk === x.tk)) continue;
      if (cadencia > 0 && nuevas.filter((f) => f > corte).length >= cadencia) break;
      if (topeSector > 0 && ab.filter((o) => SECTOR[o.tk] === SECTOR[x.tk]).length >= topeSector) continue;
      const libro = ab.reduce((a, o) => a + o.dinero * o.ultMult, 0);
      const patr = caja + acc * p + libro;
      const tope = patr * tamHoy;
      if (modo === "spy") { const falta = Math.min(tope, patr) - caja;
        if (falta > 0 && acc > 0) { const v = Math.min(acc, falta / p); acc -= v; caja += v * p; } }
      const costeR = x.coste * kC;
      const n = Math.floor(Math.min(tope, caja) / costeR);
      if (n < 1) continue;
      const dinero = n * costeR;
      caja -= dinero;
      let iFin = (plazo > 0 && plazo < x.camino.length) ? plazo - 1 : x.camino.length - 1;
      if (suelo > 0 || tope > 0) {
        for (let j = 0; j <= iFin; j++) { const m = x.camino[j][1];
          if ((suelo > 0 && m <= suelo) || (topeGanancia > 0 && m >= topeGanancia)) { iFin = j; break; } } }
      const nS = x.camino[iFin][0];
      ab.push({ ...x, dinero, ultMult: kM, dSal: nS });
      tom.push({ tk: x.tk, dC: x.dC, dinero });
      nuevas.push(hoy); }

    if (modo === "spy" && caja > 0) { acc += caja / p; caja = 0; }
    const libro = ab.reduce((a, o) => a + o.dinero * o.ultMult, 0);
    const v = caja + acc * p + libro;
    Vc.push(v); sInv += libro / v;
    if (v > pico) pico = v; const dd = 1 - v / pico; if (dd > peor) peor = dd; }

  const final = Vc[Vc.length - 1];
  const Rr = []; for (let i = 1; i < Vc.length; i++) Rr.push(Vc[i] / Vc[i-1] - 1);
  const m = Rr.reduce((a, x) => a + x, 0) / Rr.length;
  const s = Math.sqrt(Rr.reduce((a, x) => a + (x - m) ** 2, 0) / (Rr.length - 1));
  const anos = (ms(dias[dias.length-1]) - ms(dias[0])) / (365.25 * 86400000);
  return { final, cagr: 100 * (Math.pow(Math.max(final,1)/capital, 1/anos) - 1), caida: 100*peor,
           sharpe: s > 0 ? (m*252 - 0.033)/(s*Math.sqrt(252)) : 0, ops: tom.length,
           invertido: 100*sInv/Vc.length, tamMedio: sTam/dias.length, V: Vc, tom };
}

// banda de 41 capitales de partida — 60000*(1+(i-20)*0.005)
function banda41(cfg) {
  const A = [], C = [], S = [], I = [];
  for (let i = 0; i <= 40; i++) {
    const q = simular2({ ...cfg, capital: 60000 * (1 + (i - 20) * 0.005) });
    A.push(q.cagr); C.push(q.caida); S.push(q.sharpe); I.push(q.invertido); }
  return { a: med(A), c: med(C), s: med(S), inv: med(I),
           sMin: Math.min(...S), sMax: Math.max(...S), sSd: sd(S) };
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// 3. VALIDACIONES OBLIGATORIAS
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n═══ VALIDACIÓN 1 — mi copia del bucle == el motor (tam constante) ═══");
for (const tam of [0.06, 0.12, 0.20]) {
  const a = M.simular({ tam, huecos: 2, modo: "spy", plazo: 120, castigo: 0.0138, capital: 60000 });
  const b = simular2({ tam, huecos: 2, modo: "spy", plazo: 120, castigo: 0.0138, capital: 60000 });
  console.log(`  tam ${tam}: motor cagr ${a.cagr.toFixed(6)} sharpe ${a.sharpe.toFixed(6)} | copia ${b.cagr.toFixed(6)} ${b.sharpe.toFixed(6)}  ${Math.abs(a.cagr-b.cagr)<1e-9 && Math.abs(a.sharpe-b.sharpe)<1e-9 ? "IDÉNTICO ✓" : "⛔ DISTINTO"}`);
}

console.log("\n═══ VALIDACIÓN 2 — el mando de tamaño variable MUEVE algo (valores extremos) ═══");
{
  const mitad = DD[Math.floor(DD.length/2)];
  const a = simular2({ tam: (t,d)=> d < mitad ? 0.02 : 0.40, huecos:2, modo:"spy", plazo:120, castigo:0.0138 });
  const b = simular2({ tam: (t,d)=> d < mitad ? 0.40 : 0.02, huecos:2, modo:"spy", plazo:120, castigo:0.0138 });
  console.log(`  pequeño→grande: cagr ${a.cagr.toFixed(2)} sharpe ${a.sharpe.toFixed(3)} inv ${a.invertido.toFixed(1)}%`);
  console.log(`  grande→pequeño: cagr ${b.cagr.toFixed(2)} sharpe ${b.sharpe.toFixed(3)} inv ${b.invertido.toFixed(1)}%`);
  console.log(`  ${Math.abs(a.cagr-b.cagr) > 0.5 ? "el mando mueve ✓" : "⛔ EL MANDO NO HACE NADA"}`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// 4. LA SERIE DE TIPOS, AÑO A AÑO (para que se pueda auditar de un vistazo)
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n═══ LA SERIE DE TIPOS EXTRAÍDA (mediana por año; es r − q de SPY) ═══");
{
  const porA = new Map();
  for (let i = 0; i < DD.length; i++) if (RS[i] != null) {
    const a = DD[i].slice(0,4); if (!porA.has(a)) porA.set(a, []); porA.get(a).push(RS[i]); }
  const filas = [...porA.entries()].map(([a, X]) => `${a}: ${f2(med(X))}%  (min ${f2(Math.min(...X))} max ${f2(Math.max(...X))}, n=${X.length})`);
  for (const f of filas) console.log("   " + f);
  const nn = SERIE[DD[0]] ? SERIE[DD[0]].n : 0;
  console.log(`   strikes usados el primer día: ${nn} · días de serie: ${RS.filter(x=>x!=null).length}/${DD.length}`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// 5. ¿SEPARA? — el diagnóstico ANTES de las reglas: rendimiento del libro por tercio
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n═══ DIAGNÓSTICO — retorno diario de la ESTRATEGIA (tam fijo 0,12) por tercio de cada variable ═══");
{
  const q = simular2({ tam: 0.12, huecos:2, modo:"spy", plazo:120, castigo:0.0138 });
  const Rd = [0]; for (let i = 1; i < q.V.length; i++) Rd.push(q.V[i]/q.V[i-1]-1);
  const spy = M.spyApalancado(1); const Rs = [0]; for (let i=1;i<spy.V.length;i++) Rs.push(spy.V[i]/spy.V[i-1]-1);
  console.log("  variable   n_bajo n_med n_alto |  exceso vs SPY anualizado por tercio (pp)");
  for (const k of ["nivel","d3","d6","d12","acel"]) {
    const cubos = [[],[],[]];
    for (let i = 1; i < DD.length; i++) { const pc = P[k][i - 1]; if (pc == null) continue;   // ← retardo de 1 día
      const c = pc < 1/3 ? 0 : pc < 2/3 ? 1 : 2; cubos[c].push(Rd[i] - Rs[i]); }
    const mm = cubos.map(X => X.length ? 100*252*X.reduce((a,x)=>a+x,0)/X.length : NaN);
    console.log(`  ${k.padEnd(8)}  ${String(cubos[0].length).padStart(5)} ${String(cubos[1].length).padStart(5)} ${String(cubos[2].length).padStart(5)}  |  bajo ${f2(mm[0],1)}  medio ${f2(mm[1],1)}  alto ${f2(mm[2],1)}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// 6. EL LISTÓN — tamaño constante y comprar SPY, con banda de 41 capitales
// ══════════════════════════════════════════════════════════════════════════════════════════
const BASE = { huecos: 2, modo: "spy", plazo: 120, castigo: 0.0138 };
console.log("\n═══ EL LISTÓN (banda de 41 capitales de partida) ═══");
const LISTON = {};
for (const tam of [0.06, 0.09, 0.12, 0.15, 0.20]) {
  const b = banda41({ ...BASE, tam });
  LISTON[tam] = b;
  console.log(`  tam fijo ${tam.toFixed(2)}: cagr ${f2(b.a)}%  caída ${f2(b.c,1)}%  Sharpe ${f2(b.s,3)}  [min ${f2(b.sMin,3)} max ${f2(b.sMax,3)} sd ${f2(b.sSd,3)}]  inv ${f2(b.inv,1)}%`);
}
{ const s = M.spyApalancado(1);
  console.log(`  comprar SPY    : cagr ${f2(s.cagr)}%  caída ${f2(s.caida,1)}%  Sharpe ${f2(s.sharpe,3)}`); }

// ══════════════════════════════════════════════════════════════════════════════════════════
// 7. LAS REGLAS DE TAMAÑO VARIABLE — barrido entero
// ══════════════════════════════════════════════════════════════════════════════════════════
// Regla de tres tramos por percentil móvil: tam = [tBajo, tMedio, tAlto] según el tercio.
// `signo` = +1 significa "más grande cuando la variable está ALTA".
// Con `u` = umbral de corte simétrico (u, 1−u): u=1/3 son tercios.
function reglaTercios(k, sizes, u, lag = 1) {
  const pc = P[k];
  return (t) => {
    const x = t - lag >= 0 ? pc[t - lag] : null;
    if (x == null) return sizes[1];              // calentamiento: el tamaño medio
    return x < u ? sizes[0] : x > 1 - u ? sizes[2] : sizes[1];
  };
}
// Regla binaria sobre el CAMBIO en bruto (no percentil): "si sube más de `th` pp en 12m, encoger"
function reglaUmbralBruto(k, th, tamAlto, tamBajo, lag = 1) {
  const A = V[k];
  return (t) => { const x = t - lag >= 0 ? A[t - lag] : null; if (x == null) return tamAlto; return x > th ? tamBajo : tamAlto; };
}

console.log("\n═══ BARRIDO A — tres tramos por percentil móvil (2 años), tamaños 0,06 / 0,12 / 0,20 ═══");
console.log("   dirección '+' = MÁS grande con la variable ALTA · '−' = más grande con la variable BAJA");
console.log("   (la hipótesis dice: tipos SUBIENDO → encoger, o sea '−' para d3/d6/d12/acel)");
const RES_A = [];
for (const k of ["nivel","d3","d6","d12","acel"]) {
  for (const signo of [+1, -1]) {
    const S3 = signo > 0 ? [0.06,0.12,0.20] : [0.20,0.12,0.06];
    for (const u of [0.20, 0.25, 1/3, 0.40]) {
      const b = banda41({ ...BASE, tam: reglaTercios(k, S3, u) });
      RES_A.push({ k, signo, u, ...b });
    }
  }
}
{
  console.log("   var    dir   u=0,20            u=0,25            u=0,33            u=0,40");
  for (const k of ["nivel","d3","d6","d12","acel"]) for (const signo of [+1,-1]) {
    const F = RES_A.filter(r => r.k===k && r.signo===signo);
    console.log(`   ${k.padEnd(6)} ${signo>0?"+":"−"}   ` + F.map(r=>`S ${f2(r.s,3)}/c ${f2(r.a,1)}`).join("  "));
  }
  const SS = RES_A.map(r=>r.s);
  console.log(`   → BARRIDO A: Sharpe de ${Math.min(...SS).toFixed(3)} a ${Math.max(...SS).toFixed(3)}, dispersión (sd) ${sd(SS).toFixed(3)}, mediana ${med(SS).toFixed(3)}`);
  console.log(`   → listón (tam fijo 0,12) = ${LISTON[0.12].s.toFixed(3)} · tam fijo 0,06 = ${LISTON[0.06].s.toFixed(3)} · tam fijo 0,20 = ${LISTON[0.20].s.toFixed(3)}`);
}

console.log("\n═══ BARRIDO B — binaria sobre el CAMBIO EN BRUTO a 12 meses (pp), grande 0,20 / pequeña 0,06 ═══");
const RES_B = [];
for (const k of ["d3","d6","d12"]) {
  const linea = [];
  for (const th of [-0.5, 0, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0]) {
    const b = banda41({ ...BASE, tam: reglaUmbralBruto(k, th, 0.20, 0.06) });
    RES_B.push({ k, th, ...b }); linea.push(`${th>=0?"+":""}${th}: S ${f2(b.s,3)}`);
  }
  console.log(`   ${k.padEnd(4)} (encoge si sube más de th) ` + linea.join(" "));
  const linea2 = [];
  for (const th of [-0.5, 0, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0]) {
    const b = banda41({ ...BASE, tam: reglaUmbralBruto(k, th, 0.06, 0.20) });
    RES_B.push({ k, th, inv: true, ...b }); linea2.push(`${th>=0?"+":""}${th}: S ${f2(b.s,3)}`);
  }
  console.log(`   ${k.padEnd(4)} (INVERSA: agranda si sube)  ` + linea2.join(" "));
}
{ const SS = RES_B.map(r=>r.s);
  console.log(`   → BARRIDO B: Sharpe de ${Math.min(...SS).toFixed(3)} a ${Math.max(...SS).toFixed(3)}, dispersión (sd) ${sd(SS).toFixed(3)}, mediana ${med(SS).toFixed(3)}`); }

console.log("\n═══ BARRIDO C — el mejor candidato de A, EMPAREJADO en dinero ═══");
{
  // el mejor por Sharpe del barrido A, y su exposición media, para comparar contra el tam
  // constante que da la MISMA exposición (disciplina 6: emparejar el dinero en juego)
  const mejor = RES_A.slice().sort((a,b)=>b.s-a.s)[0];
  console.log(`   mejor de A: ${mejor.k} dir ${mejor.signo>0?"+":"−"} u=${mejor.u.toFixed(2)} → Sharpe ${mejor.s.toFixed(3)} cagr ${mejor.a.toFixed(2)}% caída ${mejor.c.toFixed(1)}% inv ${mejor.inv.toFixed(1)}%`);
  // busca el tam constante con la misma exposición
  let mejorPar = null, mejorD = 1e9;
  for (let tam = 0.04; tam <= 0.32; tam += 0.005) {
    const b = banda41({ ...BASE, tam });
    const d = Math.abs(b.inv - mejor.inv);
    if (d < mejorD) { mejorD = d; mejorPar = { tam, ...b }; }
  }
  console.log(`   tam CONSTANTE con la misma exposición (${mejorPar.inv.toFixed(1)}% vs ${mejor.inv.toFixed(1)}%): tam ${mejorPar.tam.toFixed(3)} → Sharpe ${mejorPar.s.toFixed(3)} cagr ${mejorPar.a.toFixed(2)}% caída ${mejorPar.c.toFixed(1)}%`);
  console.log(`   VENTAJA DE LA REGLA sobre su gemelo constante: ${(mejor.s - mejorPar.s >= 0 ? "+" : "")}${(mejor.s - mejorPar.s).toFixed(3)} de Sharpe`);
  writeFileSync(join(CACHE, "_wf-tipos-resultado.json"), JSON.stringify({ RES_A, RES_B, LISTON, mejor, mejorPar }, null, 1));
}

console.log("\n═══ COMPROBACIÓN DE VECINDAD — ¿el pico tiene vecinos buenos? ═══");
{
  const orden = RES_A.slice().sort((a,b)=>b.s-a.s).slice(0,6);
  for (const r of orden) {
    const vec = RES_A.filter(x => x.k===r.k && x.signo===r.signo).map(x=>x.s);
    console.log(`   ${r.k.padEnd(6)} ${r.signo>0?"+":"−"} u=${r.u.toFixed(2)}: S ${r.s.toFixed(3)} · sus 4 umbrales: [${vec.map(v=>v.toFixed(3)).join(", ")}]`);
  }
}
console.log("\nFIN");

// ══════════════════════════════════════════════════════════════════════════════════════════
// 8. ROBUSTEZ — ¿la ventaja aguanta si muevo los mandos que NO son la variable?
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n═══ ROBUSTEZ DEL MEJOR CANDIDATO (nivel, dirección −, tercios) ═══");
console.log("   se mueve UN mando cada vez; la ventaja es contra el tam constante de MISMA exposición");
// tabla de gemelos constantes, calculada UNA vez (si no, el placebo tarda media hora)
const TABLA = [];
for (let tam = 0.03; tam <= 0.4001; tam += 0.005) TABLA.push({ tam: +tam.toFixed(3), ...banda41({ ...BASE, tam }) });
console.log(`   [tabla de gemelos: ${TABLA.length} tamaños constantes, exposición de ${TABLA[0].inv.toFixed(1)}% a ${TABLA[TABLA.length-1].inv.toFixed(1)}%]`);
function paridad(inv) {           // tam constante con la misma exposición media
  let mej = null, d0 = 1e9;
  for (const b of TABLA) { const d = Math.abs(b.inv - inv); if (d < d0) { d0 = d; mej = b; } }
  return mej;
}
const ROB = [];
function probar(etiqueta, tamFn) {
  const b = banda41({ ...BASE, tam: tamFn });
  const par = paridad(b.inv);
  ROB.push({ etiqueta, s: b.s, a: b.a, c: b.c, inv: b.inv, sPar: par.s, aPar: par.a, tamPar: par.tam, vent: b.s - par.s });
  console.log(`   ${etiqueta.padEnd(34)} S ${f2(b.s,3)} (gemelo ${f2(par.s,3)}, tam ${par.tam.toFixed(3)}) → ventaja ${(b.s-par.s>=0?"+":"")}${(b.s-par.s).toFixed(3)}  · cagr ${f2(b.a,1)} vs ${f2(par.a,1)} · caída ${f2(b.c,1)} vs ${f2(par.c,1)}`);
}
// tamaños del trío
for (const S3 of [[0.06,0.12,0.20],[0.08,0.12,0.16],[0.04,0.12,0.24],[0.05,0.10,0.16],[0.09,0.15,0.24]])
  probar(`trío ${S3.map(x=>x.toFixed(2)).join("/")} (invertido)`, reglaTercios("nivel", [S3[2],S3[1],S3[0]], 1/3));
// retardo
for (const lag of [1, 5, 21, 63])
  probar(`retardo ${lag} sesiones`, reglaTercios("nivel", [0.20,0.12,0.06], 1/3, lag));
// ventana del percentil móvil
for (const ven of [252, 504, 756]) {
  const Pn = percentilMovil(V.nivel, ven);
  probar(`ventana percentil ${ven} sesiones`, (t) => { const x = t-1 >= 0 ? Pn[t-1] : null; return x == null ? 0.12 : x < 1/3 ? 0.20 : x > 2/3 ? 0.06 : 0.12; });
}
// sin percentil: umbral en BRUTO sobre el nivel (pp)
for (const th of [0, 0.5, 1.0, 1.5, 2.0, 2.5])
  probar(`nivel bruto > ${th.toFixed(1)}pp → 0,06`, reglaUmbralBruto("nivel", th, 0.20, 0.06));

// ══════════════════════════════════════════════════════════════════════════════════════════
// 9. EL PLACEBO DECISIVO — rotar la serie de tipos en el tiempo.
//    Rotar conserva TODO (autocorrelación, forma, cuántos días en cada tercio) y sólo rompe
//    la alineación con el mercado. Si la regla de verdad supiera algo, la serie real tendría
//    que destacar contra las rotaciones. Si no destaca, es una coincidencia de calendario.
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n═══ PLACEBO — 120 rotaciones circulares de la serie de tipos ═══");
{
  const N = DD.length;
  const real = banda41({ ...BASE, tam: reglaTercios("nivel", [0.20,0.12,0.06], 1/3) });
  const par  = paridad(real.inv);
  const ventReal = real.s - par.s;
  const Pn = P.nivel;
  const SS = [], VV = [];
  for (let k = 1; k <= 120; k++) {
    const off = Math.round(k * N / 121);
    const rot = new Array(N); for (let i = 0; i < N; i++) rot[i] = Pn[(i + off) % N];
    const b = banda41({ ...BASE, tam: (t) => { const x = t-1>=0 ? rot[t-1] : null; return x == null ? 0.12 : x < 1/3 ? 0.20 : x > 2/3 ? 0.06 : 0.12; } });
    SS.push(b.s); VV.push(b.s - paridad(b.inv).s);
  }
  const mejores = SS.filter(x => x >= real.s).length;
  const mejoresV = VV.filter(x => x >= ventReal).length;
  console.log(`   Sharpe REAL ${real.s.toFixed(3)} · ventaja real sobre gemelo ${ventReal>=0?"+":""}${ventReal.toFixed(3)}`);
  console.log(`   placebos: Sharpe mediana ${med(SS).toFixed(3)}, sd ${sd(SS).toFixed(3)}, de ${Math.min(...SS).toFixed(3)} a ${Math.max(...SS).toFixed(3)}`);
  console.log(`   ventaja placebo: mediana ${med(VV).toFixed(3)}, sd ${sd(VV).toFixed(3)}, de ${Math.min(...VV).toFixed(3)} a ${Math.max(...VV).toFixed(3)}`);
  console.log(`   ⇒ ${mejores}/120 rotaciones dan un Sharpe IGUAL O MEJOR que la serie real  (p ≈ ${((mejores+1)/121).toFixed(3)})`);
  console.log(`   ⇒ ${mejoresV}/120 rotaciones dan una VENTAJA igual o mejor            (p ≈ ${((mejoresV+1)/121).toFixed(3)})`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// 10. ¿DE DÓNDE SALE LA DIFERENCIA? — cuántas operaciones cambian y qué días pesan
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n═══ ANATOMÍA DE LA DIFERENCIA ═══");
{
  const a = simular2({ ...BASE, tam: reglaTercios("nivel", [0.20,0.12,0.06], 1/3), capital: 60000 });
  const b = simular2({ ...BASE, tam: 0.13, capital: 60000 });
  console.log(`   regla: ${a.ops} operaciones · constante 0,13: ${b.ops} operaciones`);
  // días en cada tramo
  let n0=0,n1=0,n2=0,nn=0;
  for (let i=1;i<DD.length;i++){const x=P.nivel[i-1]; if(x==null){nn++;continue;} if(x<1/3)n0++;else if(x>2/3)n2++;else n1++;}
  console.log(`   días con tipo BAJO (tam 0,20) ${n0} · MEDIO (0,12) ${n1} · ALTO (0,06) ${n2} · sin dato ${nn}`);
  // ¿en cuántos EPISODIOS distintos cambia de tramo?
  let cambios=0, ult=null;
  for (let i=1;i<DD.length;i++){const x=P.nivel[i-1]; const c = x==null?"n":(x<1/3?"B":x>2/3?"A":"M"); if(c!==ult){cambios++;ult=c;}}
  console.log(`   nº de veces que la regla CAMBIA de tramo en 10,6 años: ${cambios}  ← la muestra efectiva`);
  // reparto anual del exceso
  const RA=[0],RB=[0]; for(let i=1;i<a.V.length;i++){RA.push(a.V[i]/a.V[i-1]-1);RB.push(b.V[i]/b.V[i-1]-1);}
  const porA=new Map();
  for(let i=1;i<DD.length;i++){const y=DD[i].slice(0,4); if(!porA.has(y))porA.set(y,0); porA.set(y,porA.get(y)+(RA[i]-RB[i]));}
  console.log("   exceso de la regla sobre el constante, año a año (suma de retornos diarios, pp):");
  console.log("     " + [...porA.entries()].map(([y,v])=>`${y} ${(100*v>=0?"+":"")}${(100*v).toFixed(0)}`).join("  "));
}
console.log("\nFIN-2");

// ══════════════════════════════════════════════════════════════════════════════════════════
// 11. LA PRUEBA DEL FILO — rotaciones FINAS (±1..±25 sesiones).
//     El nivel del tipo a 1 año tiene autocorrelación ~0,99 a 5 días: desplazar la serie una
//     semana la deja PRÁCTICAMENTE IGUAL. Si la ventaja se cae con desplazamientos así de
//     pequeños, no la produce el tipo de interés: la produce la coincidencia de calendario
//     entre dos o tres fechas de apertura y el cambio de tramo.
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n═══ LA PRUEBA DEL FILO — desplazar la serie unos pocos días ═══");
{
  const N = DD.length, Pn = P.nivel;
  const fila = [];
  for (const off of [-25,-20,-15,-10,-8,-6,-5,-4,-3,-2,-1,0,1,2,3,4,5,6,8,10,15,20,25]) {
    const rot = new Array(N); for (let i = 0; i < N; i++) rot[i] = Pn[((i + off) % N + N) % N];
    const b = banda41({ ...BASE, tam: (t) => { const x = t-1>=0 ? rot[t-1] : null; return x == null ? 0.12 : x < 1/3 ? 0.20 : x > 2/3 ? 0.06 : 0.12; } });
    fila.push({ off, s: b.s, v: b.s - paridad(b.inv).s });
  }
  for (let i = 0; i < fila.length; i += 6)
    console.log("   " + fila.slice(i, i+6).map(r=>`${r.off>=0?"+":""}${r.off}d: S ${r.s.toFixed(3)} (v ${r.v>=0?"+":""}${r.v.toFixed(3)})`).join("  "));
  const SS = fila.map(r=>r.s), VV = fila.map(r=>r.v);
  const cero = fila.find(r=>r.off===0);
  console.log(`   ⇒ con desplazamientos de ±25 días el Sharpe va de ${Math.min(...SS).toFixed(3)} a ${Math.max(...SS).toFixed(3)} (sd ${sd(SS).toFixed(3)})`);
  console.log(`   ⇒ ${VV.filter(v=>v<0).length}/${VV.length} de esos desplazamientos casi-idénticos PIERDEN contra el tamaño constante`);
  console.log(`   ⇒ la serie SIN desplazar: S ${cero.s.toFixed(3)}, ventaja ${cero.v>=0?"+":""}${cero.v.toFixed(3)}`);
  const auto = (()=>{ const A=[],B=[]; for(let i=5;i<N;i++){ if(V.nivel[i]==null||V.nivel[i-5]==null)continue; A.push(V.nivel[i]);B.push(V.nivel[i-5]); }
    const ma=A.reduce((a,x)=>a+x,0)/A.length, mb=B.reduce((a,x)=>a+x,0)/B.length;
    let n=0,d1=0,d2=0; for(let i=0;i<A.length;i++){n+=(A[i]-ma)*(B[i]-mb); d1+=(A[i]-ma)**2; d2+=(B[i]-mb)**2;} return n/Math.sqrt(d1*d2); })();
  console.log(`   (correlación del nivel del tipo consigo mismo a 5 sesiones: ${auto.toFixed(4)} — la serie desplazada es la MISMA serie)`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// 12. CUÁNTAS APUESTAS INDEPENDIENTES HAY DE VERDAD
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n═══ LA MUESTRA EFECTIVA ═══");
{
  let ult = null; const eps = [];
  for (let i = 1; i < DD.length; i++) { const x = P.nivel[i-1];
    const c = x == null ? "n" : (x < 1/3 ? "BAJO" : x > 2/3 ? "ALTO" : "MEDIO");
    if (c !== ult) { eps.push({ d: DD[i], c }); ult = c; } }
  console.log("   episodios de régimen (fecha en que cambia de tramo):");
  console.log("     " + eps.filter(e=>e.c!=="n").map(e=>`${e.d.slice(0,4)}-${e.d.slice(4,6)} ${e.c}`).join(" | "));
  const a = simular2({ ...BASE, tam: reglaTercios("nivel", [0.20,0.12,0.06], 1/3), capital: 60000 });
  const porT = new Map();
  for (const o of a.tom||[]) {}
  console.log(`   operaciones totales de la regla en 10,6 años: ${a.ops} (con huecos=2 y una por ticker)`);
}
console.log("\nFIN-3");

// ══════════════════════════════════════════════════════════════════════════════════════════
// 13. EL PUENTE QUE FALTARÍA — regla CONTINUA y suavizada.
//     Si el problema fueran sólo las fronteras de los tercios (una fecha cae a un lado u
//     otro), una regla sin fronteras — el tamaño como función continua y lenta del percentil
//     del tipo — tendría que dar una ventaja ESTABLE frente a desplazar la serie.
//     Es la última oportunidad de la hipótesis. Se mide igual: contra el gemelo constante.
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n═══ EL PUENTE — regla CONTINUA (sin fronteras), y su estabilidad al desplazar ═══");
{
  const N = DD.length;
  // percentil suavizado a 63 sesiones (media móvil, sólo pasado)
  const sua = P.nivel.map((_, i) => { let s = 0, n = 0;
    for (let k = Math.max(0, i - 62); k <= i; k++) if (P.nivel[k] != null) { s += P.nivel[k]; n++; }
    return n >= 40 ? s / n : null; });
  const mk = (arr, lo, hi) => (t) => { const x = t-1>=0 ? arr[t-1] : null; return x == null ? (lo+hi)/2 : hi - (hi-lo)*x; };
  for (const [lo,hi] of [[0.06,0.20],[0.08,0.18],[0.04,0.24],[0.09,0.24]]) {
    const b = banda41({ ...BASE, tam: mk(sua, lo, hi) });
    const par = paridad(b.inv);
    console.log(`   continua ${lo}→${hi}: S ${f2(b.s,3)} (gemelo ${f2(par.s,3)}, tam ${par.tam.toFixed(3)}) → ventaja ${(b.s-par.s>=0?"+":"")}${(b.s-par.s).toFixed(3)} · cagr ${f2(b.a,1)} vs ${f2(par.a,1)} · caída ${f2(b.c,1)} vs ${f2(par.c,1)}`);
  }
  console.log("   estabilidad de la continua 0,06→0,20 al desplazar la serie:");
  const fila = [];
  for (const off of [-25,-15,-10,-5,-2,0,2,5,10,15,25,60,120,250]) {
    const rot = new Array(N); for (let i = 0; i < N; i++) rot[i] = sua[((i+off)%N+N)%N];
    const b = banda41({ ...BASE, tam: mk(rot, 0.06, 0.20) });
    fila.push({ off, s: b.s, v: b.s - paridad(b.inv).s });
  }
  for (let i = 0; i < fila.length; i += 5)
    console.log("     " + fila.slice(i,i+5).map(r=>`${r.off>=0?"+":""}${r.off}d: S ${r.s.toFixed(3)} (v ${r.v>=0?"+":""}${r.v.toFixed(3)})`).join("  "));
  const VV = fila.map(r=>r.v), cero = fila.find(r=>r.off===0);
  console.log(`   ⇒ sin desplazar: ventaja ${cero.v>=0?"+":""}${cero.v.toFixed(3)} · desplazada: mediana ${med(VV.filter((_,i)=>fila[i].off!==0)).toFixed(3)}, de ${Math.min(...VV).toFixed(3)} a ${Math.max(...VV).toFixed(3)}`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// 14. CUÁNTO DE TODO ESTO LO DECIDEN CUATRO OPERACIONES
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n═══ ¿CUÁNTAS OPERACIONES DECIDEN EL RESULTADO? ═══");
{
  const a = simular2({ ...BASE, tam: reglaTercios("nivel",[0.20,0.12,0.06],1/3), capital: 60000 });
  const b = simular2({ ...BASE, tam: 0.130, capital: 60000 });
  const dinA = new Map(), dinB = new Map();
  for (const o of a.tom) dinA.set(o.dC+"|"+o.tk, o.dinero);
  for (const o of b.tom) dinB.set(o.dC+"|"+o.tk, o.dinero);
  const claves = new Set([...dinA.keys(), ...dinB.keys()]);
  let ig = 0, dif = 0;
  for (const k of claves) { const x = dinA.get(k)||0, y = dinB.get(k)||0;
    if (Math.abs(x-y) < 1) ig++; else dif++; }
  console.log(`   posiciones que la regla abre IGUAL que el constante: ${ig} · con dinero DISTINTO o que sólo abre una de las dos: ${dif}`);
  console.log(`   final regla $${Math.round(a.final).toLocaleString("en-US")} · final constante $${Math.round(b.final).toLocaleString("en-US")}`);
}
console.log("\nFIN-4");

// ══════════════════════════════════════════════════════════════════════════════════════════
// 15. LA CONTINUA QUE SÍ "GANABA" (0,09→0,24): ¿es el tipo, o es el rango?
//     Si al desplazar la serie un año la ventaja sigue ahí, no la produce el tipo.
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n═══ ¿LA VENTAJA DE LA CONTINUA 0,09→0,24 VIENE DEL TIPO O DEL RANGO? ═══");
{
  const N = DD.length;
  const sua = P.nivel.map((_, i) => { let s = 0, n = 0;
    for (let k = Math.max(0, i - 62); k <= i; k++) if (P.nivel[k] != null) { s += P.nivel[k]; n++; }
    return n >= 40 ? s / n : null; });
  const mk = (arr, lo, hi) => (t) => { const x = t-1>=0 ? arr[t-1] : null; return x == null ? (lo+hi)/2 : hi - (hi-lo)*x; };
  const fila = [];
  for (const off of [0, 5, 25, 60, 120, 250, 500, 750, 1000, 1300]) {
    const rot = new Array(N); for (let i = 0; i < N; i++) rot[i] = sua[((i+off)%N+N)%N];
    const b = banda41({ ...BASE, tam: mk(rot, 0.09, 0.24) });
    fila.push({ off, s: b.s, v: b.s - paridad(b.inv).s });
  }
  for (let i = 0; i < fila.length; i += 5)
    console.log("   " + fila.slice(i,i+5).map(r=>`+${r.off}d: S ${r.s.toFixed(3)} (v ${r.v>=0?"+":""}${r.v.toFixed(3)})`).join("  "));
  // y el control definitivo: la MISMA forma, pero con la serie INVERTIDA en el tiempo
  const rev = sua.slice().reverse();
  const bR = banda41({ ...BASE, tam: mk(rev, 0.09, 0.24) });
  console.log(`   serie del REVÉS (el futuro donde iba el pasado): S ${bR.s.toFixed(3)} (ventaja ${(bR.s-paridad(bR.inv).s>=0?"+":"")}${(bR.s-paridad(bR.inv).s).toFixed(3)})`);
}

console.log("\n═══ ¿CUÁNTAS OPERACIONES DECIDEN EL RESULTADO? ═══");
{
  const a = simular2({ ...BASE, tam: reglaTercios("nivel",[0.20,0.12,0.06],1/3), capital: 60000 });
  const b = simular2({ ...BASE, tam: 0.130, capital: 60000 });
  const dinA = new Map(), dinB = new Map();
  for (const o of a.tom) dinA.set(o.dC+"|"+o.tk, o.dinero);
  for (const o of b.tom) dinB.set(o.dC+"|"+o.tk, o.dinero);
  const claves = new Set([...dinA.keys(), ...dinB.keys()]);
  let ig = 0, dif = 0, solo = 0;
  for (const k of claves) { const x = dinA.get(k)||0, y = dinB.get(k)||0;
    if (x === 0 || y === 0) solo++; else if (Math.abs(x-y) < 1) ig++; else dif++; }
  console.log(`   posiciones idénticas ${ig} · mismo día distinto dinero ${dif} · que sólo abre una de las dos ${solo}`);
  console.log(`   final regla $${Math.round(a.final).toLocaleString("en-US")} · final constante 0,130 $${Math.round(b.final).toLocaleString("en-US")}`);
  console.log(`   → con ${a.ops} operaciones en 10,6 años y 23 cambios de régimen, la muestra efectiva es de UN DÍGITO`);
}
console.log("\nFIN-5");
