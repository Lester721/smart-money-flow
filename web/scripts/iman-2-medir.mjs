// ═══════════════════════════════════════════════════════════════════════════════════════════
// RESPETAR · IMANES — ¿el precio TIENDE al strike de máxima gamma?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/iman-2-medir.mjs
//
// ═══ LA HIPÓTESIS ══════════════════════════════════════════════════════════════════════════
// La hipótesis clásica del "imán de gamma": el creador de mercado, largo de gamma alrededor del
// strike de mayor gamma, vende fuerza y compra debilidad ahí; el precio queda ATRAPADO y el día
// cierra más cerca del imán de lo que abrió.
//
// ═══ LO QUE SE MIDE ════════════════════════════════════════════════════════════════════════
// Para cada día y cada definición de imán, con el nivel calculado a las 09:35 y el OI de AYER:
//   dAp  = |apertura − imán|         (distancia al abrir, conocida al decidir)
//   dCi  = |cierre   − imán|         (distancia al cerrar, el desenlace)
//   ACERCAMIENTO A = dAp − dCi       (>0 = el día se acercó al imán)
// y además:
//   TOQUE     = ¿el imán queda dentro del recorrido muestreado del día? (barras de 5 min)
//   DIRECCIÓN = ¿el cierre acaba del MISMO lado de la apertura que el imán?
//
// ═══ POR QUÉ HACE FALTA UN CONTROL Y NO BASTA "se acercó el 55% de los días" ════════════════
// El acercamiento NO es una moneda. Si el imán está lejos, cualquier paseo aleatorio se acerca
// la mitad de las veces y la mitad se aleja, pero si está PEGADO a la apertura el precio sólo
// puede alejarse. La media cruda de A mide la geometría, no el imán. Por eso el control es un
// nivel puesto a LA MISMA DISTANCIA de la apertura: comparte la geometría entera y sólo se
// diferencia en que la elección del strike es al azar.
//
// TRES controles, porque cada uno mata una explicación alternativa distinta:
//   A (el obligatorio) · misma |distancia|, LADO al azar. Mata "el imán está lejos/cerca".
//   B · barajar los días: la geometría del imán del día j contra el desenlace del día i. Mata
//       "los imanes caen sistemáticamente abajo y el mercado sube" (sesgo de lado + deriva).
//   C · MISMO lado, distancia sorteada del conjunto de días. Mata "acertar el lado ya basta":
//       aísla si el strike concreto tiene algo o si sólo lleva dentro una dirección.
//
// ═══ REGLAS ════════════════════════════════════════════════════════════════════════════════
//  · Nada del futuro: nivel de las 09:35 con OI sellado antes de las 09:15 (cierre de ayer).
//  · El desenlace se mide de 09:35 al cierre. La apertura de referencia ES la hora de decisión.
//  · 500 sorteos por control, semilla fija: reproducible.
//  · MUESTRA PARTIDA: 2022-2023 contra 2024-2026, en las DOS direcciones. Sólo cuenta lo que
//    sale en las dos.
//  · Régimen: gamma neta positiva contra negativa (netPunto de la lente gam, $ por punto).
//  · Esto NO es dinero todavía: es saber si el NIVEL existe.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync } from "node:fs";

const ENTRADA = "scripts/gex-niveles.json";
const SALIDA  = "scripts/iman-2-resultado.json";
const CUENTA  = 56389;
const SORTEOS = 500;
// 6 imanes × 3 desenlaces (acercamiento, toque, dirección) = 18, + 6 contrastes de régimen = 24
const PRUEBAS_DECLARADAS = 24;

// ── estadística ────────────────────────────────────────────────────────────────────────────
const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const varianza = (v) => { if (v.length < 2) return NaN; const m = media(v); return v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1); };
const sd = (v) => Math.sqrt(varianza(v));
const pct = (v, p) => { if (!v.length) return NaN; const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))]; };
const mediana = (v) => pct(v, 50);

/** t pareada de una serie de diferencias contra 0. */
function tPareada(d) {
  if (d.length < 3) return { t: NaN, m: NaN, n: d.length };
  const m = media(d), s = sd(d);
  return { t: s > 0 ? m / (s / Math.sqrt(d.length)) : NaN, m, n: d.length };
}
/** t de Welch (dos muestras). Positiva = a tiene media MAYOR que b. */
function welch(a, b) {
  if (a.length < 3 || b.length < 3) return { t: NaN, dif: NaN, n1: a.length, n2: b.length };
  const va = varianza(a) / a.length, vb = varianza(b) / b.length;
  const se = Math.sqrt(va + vb);
  return { t: se > 0 ? (media(a) - media(b)) / se : NaN, dif: media(a) - media(b), n1: a.length, n2: b.length };
}
/** t de una proporción contra p0. */
function tProp(k, n, p0) {
  if (n < 5) return { t: NaN, p: NaN, n };
  const p = k / n, se = Math.sqrt(p0 * (1 - p0) / n);
  return { t: (p - p0) / se, p, n };
}
function listonT(pruebas) {
  if (pruebas <= 1) return 2;
  const p = 0.05 / pruebas / 2;
  const t = Math.sqrt(-2 * Math.log(p));
  return Math.round((t - (2.30753 + 0.27061 * t) / (1 + 0.99229 * t + 0.04481 * t * t)) * 100) / 100;
}
const LISTON = listonT(PRUEBAS_DECLARADAS);

/** Generador reproducible. */
function rng(semilla) {
  let a = semilla >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Percentil del valor real dentro de la nube del azar (0-100). */
function percentilEnNube(real, nube) {
  const menores = nube.filter((x) => x < real).length;
  return +(100 * menores / nube.length).toFixed(1);
}
function exigir(cond, msg) { if (!cond) throw new Error(`FALLO CERRADO: ${msg}`); }

// ═══ 1 · RADIOGRAFÍA — mirar el fichero ANTES de medirlo ════════════════════════════════════
const J = JSON.parse(readFileSync(ENTRADA, "utf8"));
const BRUTO = J.filas;

console.log("\n" + "═".repeat(95));
console.log("RESPETAR · IMANES — ¿el precio tiende al strike de máxima gamma?");
console.log("═".repeat(95));
console.log(`\n## 1 · RADIOGRAFÍA de ${ENTRADA}`);
console.log(`   generado ${J.generado} · hora de decisión ${J.hora} · ${BRUTO.length} días · listón |t| ≥ ${LISTON} (${PRUEBAS_DECLARADAS} pruebas)`);

function radiografia(filas, campos, constanteEsperada = []) {
  console.log(`\n   ${"campo".padEnd(24)} ${"vivos".padStart(6)} ${"nulos".padStart(6)} ${"ceros".padStart(6)}  ${"p05".padStart(11)} ${"p50".padStart(11)} ${"p95".padStart(11)}`);
  const muertos = [];
  for (const [nombre, fn] of campos) {
    const v = filas.map(fn);
    const vivos = v.filter((x) => x != null && Number.isFinite(x));
    const nulos = v.length - vivos.length;
    const ceros = vivos.filter((x) => x === 0).length;
    const cte = vivos.length > 1 && sd(vivos) === 0;
    console.log(`   ${nombre.padEnd(24)} ${String(vivos.length).padStart(6)} ${String(nulos).padStart(6)} ${String(ceros).padStart(6)}  ` +
      `${pct(vivos, 5).toFixed(2).padStart(11)} ${mediana(vivos).toFixed(2).padStart(11)} ${pct(vivos, 95).toFixed(2).padStart(11)}` +
      `${cte && constanteEsperada.includes(nombre) ? "   (constante ESPERADA)" : ""}`);
    if (vivos.length === 0 || ceros === vivos.length) muertos.push(nombre);
    if (cte && !constanteEsperada.includes(nombre)) muertos.push(nombre + " (constante)");
  }
  exigir(muertos.length === 0, `campos muertos o constantes: ${muertos.join(", ")}`);
}

radiografia(BRUTO, [
  ["apertura",            (f) => f.apertura],
  ["cierre",              (f) => f.cierre],
  ["maxMuestreado",       (f) => f.maxMuestreado],
  ["minMuestreado",       (f) => f.minMuestreado],
  ["gam.imanBruto",       (f) => f.niveles.gam?.imanBruto ?? null],
  ["gam.imanNeto",        (f) => f.niveles.gam?.imanNeto ?? null],
  ["gamD.imanBruto",      (f) => f.niveles.gamD?.imanBruto ?? null],
  ["gamD.imanNeto",       (f) => f.niveles.gamD?.imanNeto ?? null],
  ["oi.imanBruto",        (f) => f.niveles.oi?.imanBruto ?? null],
  ["maxPain",             (f) => f.maxPain],
  ["gam.netPunto ($/pt)", (f) => f.niveles.gam?.netPunto ?? null],
  ["straddle ATM bid",    (f) => f.peaje.callATM?.bid ?? null],
  ["barras5min",          (f) => f.barras5min],
], ["barras5min"]);

// Comprobación de coherencia del recorrido: la apertura tiene que caer DENTRO del rango
// muestreado, porque la primera barra muestreada ES la de las 09:35. Si no, el rango vendría de
// antes de la hora de decisión y sería mirar al futuro por la puerta de atrás.
let fueraDeRango = 0;
for (const f of BRUTO) {
  if (!(f.minMuestreado <= f.apertura + 1e-6 && f.apertura <= f.maxMuestreado + 1e-6)) fueraDeRango++;
  if (!(f.minMuestreado <= f.cierre + 1e-6 && f.cierre <= f.maxMuestreado + 1e-6)) fueraDeRango++;
}
exigir(fueraDeRango === 0, `${fueraDeRango} días con apertura/cierre fuera del rango muestreado`);
console.log(`\n   ✓ apertura y cierre caen dentro del rango muestreado en los ${BRUTO.length} días (el recorrido empieza en la hora de decisión, no antes)`);

// ═══ 2 · LAS SEIS DEFINICIONES DE IMÁN ══════════════════════════════════════════════════════
const IMANES = [
  ["gam.imanBruto",  (f) => f.niveles.gam?.imanBruto,  "max gamma TOTAL, T real de 0DTE (6h25)"],
  ["gam.imanNeto",   (f) => f.niveles.gam?.imanNeto,   "max |gamma NETA| del creador, T real"],
  ["gamD.imanBruto", (f) => f.niveles.gamD?.imanBruto, "max gamma TOTAL, T = 1 día"],
  ["gamD.imanNeto",  (f) => f.niveles.gamD?.imanNeto,  "max |gamma NETA| del creador, T = 1 día"],
  ["oi.imanBruto",   (f) => f.niveles.oi?.imanBruto,   "strike de mayor interés abierto (sin gamma)"],
  ["maxPain",        (f) => f.maxPain,                 "max pain clásico"],
];

// ═══ 3 · CONSTRUIR LAS FILAS ════════════════════════════════════════════════════════════════
const D = [];
const fuera = {};
const cae = (k) => { fuera[k] = (fuera[k] || 0) + 1; };
for (const f of BRUTO) {
  const c = f.peaje.callATM, p = f.peaje.putATM;
  if (!(f.apertura > 0) || !(f.cierre > 0)) { cae("sin apertura/cierre"); continue; }
  if (!c || !p || !(c.bid > 0) || !(p.bid > 0)) { cae("sin straddle ATM cotizado"); continue; }
  const straddlePts = (c.bid + c.ask) / 2 + (p.bid + p.ask) / 2;   // movimiento que YA cobra el mercado, en PUNTOS
  if (!(straddlePts > 2)) { cae("straddle implausible"); continue; }
  const d = {
    fecha: f.fecha, ano: +f.fecha.slice(0, 4),
    ap: f.apertura, ci: f.cierre, max: f.maxMuestreado, min: f.minMuestreado,
    straddlePts,
    netPunto: f.niveles.gam?.netPunto ?? null,
    horquillaCall: c.horquillaPct, horquillaPut: p.horquillaPct,
    imanes: {},
  };
  for (const [nombre, fn] of IMANES) {
    const K = fn(f);
    if (K == null || !Number.isFinite(K) || K <= 0) continue;
    d.imanes[nombre] = K;
  }
  if (Object.keys(d.imanes).length !== IMANES.length) { cae("falta alguna definición de imán"); continue; }
  D.push(d);
}
console.log(`\n## 2 · FILAS DE MEDIDA: ${D.length} de ${BRUTO.length} días`);
for (const [k, v] of Object.entries(fuera)) console.log(`   descartados por ${k}: ${v}`);
exigir(D.length > 900, `muestra demasiado pequeña: ${D.length}`);

const MITAD_A = D.filter((d) => d.ano <= 2023);
const MITAD_B = D.filter((d) => d.ano >= 2024);
console.log(`   mitad A 2022-2023: ${MITAD_A.length} días · mitad B 2024-2026: ${MITAD_B.length} días`);

// ═══ 4 · ¿EL IMÁN ES "EL PRECIO CON OTRO NOMBRE"? ═══════════════════════════════════════════
// Si el imán cayera siempre en el strike pegado a la apertura, no sería un nivel: sería el
// precio redondeado. Se mide antes de nada, porque si eso pasara el resto no significaría nada.
console.log(`\n## 3 · ¿SON NIVELES DE VERDAD, O EL PRECIO REDONDEADO?`);
console.log(`   ${"imán".padEnd(16)} ${"=strike ATM".padStart(11)} ${"|dAp| p25".padStart(10)} ${"p50".padStart(8)} ${"p75".padStart(8)} ${"p95".padStart(8)}  ${"% arriba".padStart(9)}`);
const geometria = {};
for (const [nombre] of IMANES) {
  const dist = [], arriba = [];
  let pegado = 0;
  for (const d of D) {
    const K = d.imanes[nombre];
    const atm = Math.round(d.ap / 5) * 5;
    if (K === atm) pegado++;
    dist.push(Math.abs(K - d.ap));
    arriba.push(K > d.ap ? 1 : 0);
  }
  geometria[nombre] = {
    pegadoATMPct: +(100 * pegado / D.length).toFixed(1),
    distP25: +pct(dist, 25).toFixed(1), distP50: +mediana(dist).toFixed(1),
    distP75: +pct(dist, 75).toFixed(1), distP95: +pct(dist, 95).toFixed(1),
    arribaPct: +(100 * media(arriba)).toFixed(1),
  };
  const g = geometria[nombre];
  console.log(`   ${nombre.padEnd(16)} ${(g.pegadoATMPct + "%").padStart(11)} ${g.distP25.toFixed(1).padStart(10)} ${g.distP50.toFixed(1).padStart(8)} ${g.distP75.toFixed(1).padStart(8)} ${g.distP95.toFixed(1).padStart(8)}  ${(g.arribaPct + "%").padStart(9)}`);
}
console.log(`   (distancias en PUNTOS de SPX. "% arriba" = días en que el imán queda por encima de la apertura.)`);

// ═══ 5 · EL MOTOR DE MEDIDA ═════════════════════════════════════════════════════════════════
/**
 * Los tres desenlaces de un nivel L para un día d.
 *   acerc  = |ap−L| − |ci−L|      puntos ganados de acercamiento (>0 se acercó)
 *   acercN = acerc / straddlePts  lo mismo, en unidades del movimiento que cobra el mercado
 *   toque  = el nivel cae dentro del recorrido muestreado
 *   direcc = el cierre acaba del mismo lado de la apertura que el nivel
 */
function desenlaces(d, L) {
  const dAp = Math.abs(d.ap - L), dCi = Math.abs(d.ci - L);
  const acerc = dAp - dCi;
  const toque = (L >= d.min && L <= d.max) ? 1 : 0;
  const sL = Math.sign(L - d.ap), sC = Math.sign(d.ci - d.ap);
  const direcc = (sL === 0 || sC === 0) ? null : (sL === sC ? 1 : 0);
  return { dAp, dCi, acerc, acercN: acerc / d.straddlePts, toque, direcc };
}

/** Resumen de una lista de días con un nivel elegido por `dame(d)`. */
function resumen(filas, dame) {
  const acerc = [], acercN = [];
  let toques = 0, aciertos = 0, conDir = 0;
  for (const d of filas) {
    const L = dame(d);
    if (L == null || !Number.isFinite(L)) continue;
    const r = desenlaces(d, L);
    acerc.push(r.acerc); acercN.push(r.acercN);
    toques += r.toque;
    if (r.direcc != null) { conDir++; aciertos += r.direcc; }
  }
  return {
    n: acerc.length,
    acercMedio: media(acerc), acercMediana: mediana(acerc),
    acercNMedio: media(acercN),
    toquePct: 100 * toques / acerc.length, toques,
    dirPct: conDir ? 100 * aciertos / conDir : NaN, aciertos, conDir,
    serieAcerc: acerc, serieAcercN: acercN,
  };
}

/**
 * CONTROL A · misma |distancia|, lado al azar.
 * La esperanza EXACTA sobre los dos lados se puede calcular sin sortear (es sólo una media de
 * dos casos), así que se hace las dos cosas: la t PAREADA exacta contra esa esperanza, y la nube
 * de 500 sorteos para el percentil. Si las dos dicen lo mismo, no es un artefacto del sorteo.
 */
function controlA(filas, nombre, semilla) {
  // — esperanza exacta día a día —
  const difAcerc = [], difAcercN = [];
  let toqueReal = 0, toqueEsp = 0, dirReal = 0, conDir = 0;
  for (const d of filas) {
    const L = d.imanes[nombre];
    const dAp = Math.abs(L - d.ap);
    const Lup = d.ap + dAp, Ldn = d.ap - dAp;
    const r = desenlaces(d, L);
    const ru = desenlaces(d, Lup), rd = desenlaces(d, Ldn);
    const espAcerc = (ru.acerc + rd.acerc) / 2;
    difAcerc.push(r.acerc - espAcerc);
    difAcercN.push((r.acerc - espAcerc) / d.straddlePts);
    toqueReal += r.toque; toqueEsp += (ru.toque + rd.toque) / 2;
    if (r.direcc != null) { conDir++; dirReal += r.direcc; }
  }
  const tAc = tPareada(difAcerc), tAcN = tPareada(difAcercN);
  // — nube de 500 sorteos —
  const rnd = rng(semilla);
  const nubeAcerc = [], nubeToque = [], nubeDir = [];
  for (let s = 0; s < SORTEOS; s++) {
    let sa = 0, st = 0, sd_ = 0, nd = 0, n = 0;
    for (const d of filas) {
      const L = d.imanes[nombre];
      const dAp = Math.abs(L - d.ap);
      const Lc = d.ap + (rnd() < 0.5 ? -dAp : dAp);
      const r = desenlaces(d, Lc);
      sa += r.acerc; st += r.toque; n++;
      if (r.direcc != null) { nd++; sd_ += r.direcc; }
    }
    nubeAcerc.push(sa / n); nubeToque.push(100 * st / n); nubeDir.push(nd ? 100 * sd_ / nd : NaN);
  }
  const real = resumen(filas, (d) => d.imanes[nombre]);
  return {
    n: real.n,
    acercReal: real.acercMedio, acercAzar: media(nubeAcerc),
    acercPercentil: percentilEnNube(real.acercMedio, nubeAcerc),
    tAcerc: tAc.t, tAcercN: tAcN.t, ventajaPts: tAc.m,
    toqueRealPct: real.toquePct, toqueEspPct: 100 * toqueEsp / real.n,
    toquePercentil: percentilEnNube(real.toquePct, nubeToque),
    tToque: tProp(real.toques, real.n, toqueEsp / real.n).t,
    dirRealPct: real.dirPct, dirAzarPct: media(nubeDir.filter(Number.isFinite)),
    dirPercentil: percentilEnNube(real.dirPct, nubeDir),
    tDir: tProp(dirReal, conDir, 0.5).t,
  };
}

/** CONTROL B · barajar días: geometría del imán de otro día contra el desenlace de éste. */
function controlB(filas, nombre, semilla) {
  const rnd = rng(semilla);
  const real = resumen(filas, (d) => d.imanes[nombre]);
  const off = filas.map((d) => d.imanes[nombre] - d.ap);   // desplazamiento imán−apertura
  const nube = [], nubeT = [], nubeD = [];
  for (let s = 0; s < SORTEOS; s++) {
    let sa = 0, st = 0, sd_ = 0, nd = 0, n = 0;
    for (const d of filas) {
      const L = d.ap + off[Math.floor(rnd() * off.length)];
      const r = desenlaces(d, L);
      sa += r.acerc; st += r.toque; n++;
      if (r.direcc != null) { nd++; sd_ += r.direcc; }
    }
    nube.push(sa / n); nubeT.push(100 * st / n); nubeD.push(nd ? 100 * sd_ / nd : NaN);
  }
  return {
    acercReal: real.acercMedio, acercAzar: media(nube), acercPercentil: percentilEnNube(real.acercMedio, nube),
    toqueRealPct: real.toquePct, toqueAzarPct: media(nubeT), toquePercentil: percentilEnNube(real.toquePct, nubeT),
    dirRealPct: real.dirPct, dirAzarPct: media(nubeD.filter(Number.isFinite)), dirPercentil: percentilEnNube(real.dirPct, nubeD),
  };
}

/** CONTROL C · MISMO lado que el imán real, distancia sorteada del conjunto de días. */
function controlC(filas, nombre, semilla) {
  const rnd = rng(semilla);
  const real = resumen(filas, (d) => d.imanes[nombre]);
  const dists = filas.map((d) => Math.abs(d.imanes[nombre] - d.ap));
  const nube = [], nubeT = [];
  for (let s = 0; s < SORTEOS; s++) {
    let sa = 0, st = 0, n = 0;
    for (const d of filas) {
      const lado = Math.sign(d.imanes[nombre] - d.ap) || 1;
      const L = d.ap + lado * dists[Math.floor(rnd() * dists.length)];
      const r = desenlaces(d, L);
      sa += r.acerc; st += r.toque; n++;
    }
    nube.push(sa / n); nubeT.push(100 * st / n);
  }
  return {
    acercReal: real.acercMedio, acercAzar: media(nube), acercPercentil: percentilEnNube(real.acercMedio, nube),
    toqueRealPct: real.toquePct, toqueAzarPct: media(nubeT), toquePercentil: percentilEnNube(real.toquePct, nubeT),
  };
}

// ═══ 6 · MEDIDA PRINCIPAL — los 1.122 días enteros ══════════════════════════════════════════
console.log(`\n## 4 · ACERCAMIENTO — ¿el cierre queda más cerca del imán que la apertura?`);
console.log(`   Contra CONTROL A: nivel a la MISMA distancia, lado al azar (${SORTEOS} sorteos + t pareada exacta).`);
console.log(`\n   ${"imán".padEnd(16)} ${"n".padStart(5)} ${"real pts".padStart(9)} ${"azar pts".padStart(9)} ${"ventaja".padStart(8)} ${"t".padStart(7)} ${"tNorm".padStart(7)} ${"pctil".padStart(6)}  veredicto`);
const RES = {};
let semilla = 20260820;
for (const [nombre] of IMANES) {
  const a = controlA(D, nombre, semilla++);
  RES[nombre] = { total: { A: a } };
  const pasa = Math.abs(a.tAcerc) >= LISTON && Math.abs(a.tAcercN) >= LISTON;
  console.log(`   ${nombre.padEnd(16)} ${String(a.n).padStart(5)} ${a.acercReal.toFixed(2).padStart(9)} ${a.acercAzar.toFixed(2).padStart(9)} ` +
    `${a.ventajaPts.toFixed(2).padStart(8)} ${a.tAcerc.toFixed(2).padStart(7)} ${a.tAcercN.toFixed(2).padStart(7)} ${String(a.acercPercentil).padStart(6)}  ` +
    `${pasa ? (a.ventajaPts > 0 ? "SÍ acerca" : "REPELE") : "no pasa el listón"}`);
}
console.log(`   (ventaja = puntos de SPX que el imán se acerca DE MÁS respecto a la línea al azar. listón |t| ≥ ${LISTON})`);

console.log(`\n## 5 · TOQUE — ¿el precio llega al imán durante el día?`);
console.log(`\n   ${"imán".padEnd(16)} ${"toca real".padStart(10)} ${"azar".padStart(8)} ${"dif".padStart(7)} ${"t".padStart(7)} ${"pctil".padStart(6)}`);
for (const [nombre] of IMANES) {
  const a = RES[nombre].total.A;
  console.log(`   ${nombre.padEnd(16)} ${(a.toqueRealPct.toFixed(1) + "%").padStart(10)} ${(a.toqueEspPct.toFixed(1) + "%").padStart(8)} ` +
    `${(a.toqueRealPct - a.toqueEspPct).toFixed(1).padStart(7)} ${a.tToque.toFixed(2).padStart(7)} ${String(a.toquePercentil).padStart(6)}`);
}

console.log(`\n## 6 · DIRECCIÓN — ¿el cierre acaba del lado del imán?`);
console.log(`\n   ${"imán".padEnd(16)} ${"acierto".padStart(9)} ${"n".padStart(6)} ${"t vs 50%".padStart(9)} ${"pctil".padStart(6)}`);
for (const [nombre] of IMANES) {
  const a = RES[nombre].total.A;
  console.log(`   ${nombre.padEnd(16)} ${(a.dirRealPct.toFixed(1) + "%").padStart(9)} ${String(a.n).padStart(6)} ${a.tDir.toFixed(2).padStart(9)} ${String(a.dirPercentil).padStart(6)}`);
}

// ═══ 7 · LOS OTROS DOS CONTROLES ════════════════════════════════════════════════════════════
console.log(`\n## 7 · CONTROLES B y C — matar las otras dos explicaciones`);
console.log(`\n   ${"imán".padEnd(16)} │ ${"B: azar".padStart(8)} ${"pctil".padStart(6)} │ ${"C: azar".padStart(8)} ${"pctil".padStart(6)} │ ${"real".padStart(8)}`);
for (const [nombre] of IMANES) {
  const b = controlB(D, nombre, semilla++);
  const c = controlC(D, nombre, semilla++);
  RES[nombre].total.B = b; RES[nombre].total.C = c;
  console.log(`   ${nombre.padEnd(16)} │ ${b.acercAzar.toFixed(2).padStart(8)} ${String(b.acercPercentil).padStart(6)} │ ${c.acercAzar.toFixed(2).padStart(8)} ${String(c.acercPercentil).padStart(6)} │ ${b.acercReal.toFixed(2).padStart(8)}`);
}
console.log(`   B = días barajados (mata el sesgo de lado + la deriva) · C = mismo lado, distancia al azar (mata "basta con el lado")`);
console.log(`   percentil = dónde cae el imán REAL dentro de la nube de ${SORTEOS} sorteos. 50 = indistinguible del azar.`);

// ═══ 8 · MUESTRA PARTIDA — 2022-2023 contra 2024-2026, en las DOS direcciones ═══════════════
console.log(`\n## 8 · MUESTRA PARTIDA — sólo cuenta lo que sale en las DOS mitades`);
console.log(`\n   ${"imán".padEnd(16)} │ ${"A 22-23 vent".padStart(12)} ${"t".padStart(6)} ${"pctil".padStart(6)} │ ${"B 24-26 vent".padStart(12)} ${"t".padStart(6)} ${"pctil".padStart(6)} │ mismo signo`);
for (const [nombre] of IMANES) {
  const a = controlA(MITAD_A, nombre, semilla++);
  const b = controlA(MITAD_B, nombre, semilla++);
  RES[nombre].mitadA = a; RES[nombre].mitadB = b;
  const mismo = Math.sign(a.ventajaPts) === Math.sign(b.ventajaPts);
  RES[nombre].mismoSigno = mismo;
  RES[nombre].pasaCruce = mismo && Math.abs(a.tAcerc) >= 2 && Math.abs(b.tAcerc) >= 2;
  console.log(`   ${nombre.padEnd(16)} │ ${a.ventajaPts.toFixed(2).padStart(12)} ${a.tAcerc.toFixed(2).padStart(6)} ${String(a.acercPercentil).padStart(6)} │ ` +
    `${b.ventajaPts.toFixed(2).padStart(12)} ${b.tAcerc.toFixed(2).padStart(6)} ${String(b.acercPercentil).padStart(6)} │ ${mismo ? "SÍ" : "NO"}${RES[nombre].pasaCruce ? "  ← sobrevive al cruce" : ""}`);
}

// dirección y toque también partidos
console.log(`\n   Dirección y toque partidos:`);
console.log(`   ${"imán".padEnd(16)} │ ${"dir 22-23".padStart(9)} ${"dir 24-26".padStart(9)} │ ${"toque 22-23".padStart(11)} ${"toque 24-26".padStart(11)}`);
for (const [nombre] of IMANES) {
  const a = RES[nombre].mitadA, b = RES[nombre].mitadB;
  console.log(`   ${nombre.padEnd(16)} │ ${(a.dirRealPct.toFixed(1) + "%").padStart(9)} ${(b.dirRealPct.toFixed(1) + "%").padStart(9)} │ ` +
    `${(a.toqueRealPct.toFixed(1) + "% vs " + a.toqueEspPct.toFixed(1)).padStart(11)} ${(b.toqueRealPct.toFixed(1) + "% vs " + b.toqueEspPct.toFixed(1)).padStart(11)}`);
}

// ═══ 9 · RÉGIMEN — ¿el imán sólo funciona con gamma neta positiva? ══════════════════════════
console.log(`\n## 9 · RÉGIMEN — ¿el imán sólo tira cuando la gamma neta es POSITIVA?`);
const POS = D.filter((d) => d.netPunto > 0);
const NEG = D.filter((d) => d.netPunto < 0);
console.log(`   gamma neta > 0: ${POS.length} días · < 0: ${NEG.length} días (netPunto de la lente gam, $ por punto)`);
console.log(`\n   ${"imán".padEnd(16)} │ ${"γ>0 vent".padStart(9)} ${"t".padStart(6)} ${"pctil".padStart(6)} │ ${"γ<0 vent".padStart(9)} ${"t".padStart(6)} ${"pctil".padStart(6)} │ ${"t contraste".padStart(11)}`);
for (const [nombre] of IMANES) {
  const p = controlA(POS, nombre, semilla++);
  const n = controlA(NEG, nombre, semilla++);
  // contraste directo: acercamiento normalizado en γ>0 contra γ<0
  const sp = resumen(POS, (d) => d.imanes[nombre]).serieAcercN;
  const sn = resumen(NEG, (d) => d.imanes[nombre]).serieAcercN;
  const w = welch(sp, sn);
  RES[nombre].regimen = { pos: p, neg: n, contraste: w.t };
  console.log(`   ${nombre.padEnd(16)} │ ${p.ventajaPts.toFixed(2).padStart(9)} ${p.tAcerc.toFixed(2).padStart(6)} ${String(p.acercPercentil).padStart(6)} │ ` +
    `${n.ventajaPts.toFixed(2).padStart(9)} ${n.tAcerc.toFixed(2).padStart(6)} ${String(n.acercPercentil).padStart(6)} │ ${w.t.toFixed(2).padStart(11)}`);
}

// ═══ 10 · ¿Y SI EL IMÁN ESTÁ LEJOS? terciles de distancia ═══════════════════════════════════
console.log(`\n## 10 · POR DISTANCIA — el imán cercano no tiene nada que tirar; ¿y el lejano?`);
for (const [nombre] of IMANES) {
  const dists = D.map((d) => Math.abs(d.imanes[nombre] - d.ap));
  const c1 = pct(dists, 33), c2 = pct(dists, 67);
  const grupos = [
    [`cerca (<${c1.toFixed(0)}pt)`, D.filter((d) => Math.abs(d.imanes[nombre] - d.ap) < c1)],
    [`medio`, D.filter((d) => { const x = Math.abs(d.imanes[nombre] - d.ap); return x >= c1 && x < c2; })],
    [`lejos (≥${c2.toFixed(0)}pt)`, D.filter((d) => Math.abs(d.imanes[nombre] - d.ap) >= c2)],
  ];
  const partes = [];
  for (const [et, g] of grupos) {
    if (g.length < 30) { partes.push(`${et}: n=${g.length}`); continue; }
    const a = controlA(g, nombre, semilla++);
    partes.push(`${et}: ${a.ventajaPts >= 0 ? "+" : ""}${a.ventajaPts.toFixed(2)}pt t=${a.tAcerc.toFixed(2)} dir=${a.dirRealPct.toFixed(0)}%`);
  }
  RES[nombre].distancia = partes;
  console.log(`   ${nombre.padEnd(16)} ${partes.join(" · ")}`);
}

// ═══ 11 · VEREDICTO ═════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(95)}`);
console.log(`## 11 · VEREDICTO`);
console.log("═".repeat(95));
const ganadores = [];
for (const [nombre] of IMANES) {
  const r = RES[nombre];
  const a = r.total.A;
  const superaListon = Math.abs(a.tAcerc) >= LISTON;
  const superaAzarA = a.acercPercentil >= 97.5 || a.acercPercentil <= 2.5;
  const superaAzarB = r.total.B.acercPercentil >= 97.5 || r.total.B.acercPercentil <= 2.5;
  const superaAzarC = r.total.C.acercPercentil >= 97.5 || r.total.C.acercPercentil <= 2.5;
  const ok = superaListon && superaAzarA && superaAzarB && superaAzarC && r.pasaCruce;
  r.veredicto = { superaListon, superaAzarA, superaAzarB, superaAzarC, pasaCruce: r.pasaCruce, ok };
  if (ok) ganadores.push(nombre);
  console.log(`   ${nombre.padEnd(16)} listón:${superaListon ? "SÍ" : "no"}  azarA:${superaAzarA ? "SÍ" : "no"}  azarB:${superaAzarB ? "SÍ" : "no"}  azarC:${superaAzarC ? "SÍ" : "no"}  cruce:${r.pasaCruce ? "SÍ" : "no"}  →  ${ok ? "**PASA**" : "no pasa"}`);
}
console.log(`\n   Imanes que pasan las cinco: ${ganadores.length ? ganadores.join(", ") : "NINGUNO"}`);

// contexto de peaje, para la fase de dinero
const hq = D.map((d) => d.horquillaCall).filter(Number.isFinite);
const hqP = D.map((d) => d.horquillaPut).filter(Number.isFinite);
console.log(`\n   Peaje real medido a las 09:35 (horquilla como % de la prima, opción ATM de SPXW):`);
console.log(`      call ATM: p25 ${pct(hq, 25).toFixed(2)}% · p50 ${mediana(hq).toFixed(2)}% · p75 ${pct(hq, 75).toFixed(2)}% · p95 ${pct(hq, 95).toFixed(2)}%`);
console.log(`      put  ATM: p25 ${pct(hqP, 25).toFixed(2)}% · p50 ${mediana(hqP).toFixed(2)}% · p75 ${pct(hqP, 75).toFixed(2)}% · p95 ${pct(hqP, 95).toFixed(2)}%`);
console.log(`      straddle ATM mediano: ${mediana(D.map((d) => d.straddlePts)).toFixed(1)} pts de SPX (lo que el mercado ya cobra por el día)`);

writeFileSync(SALIDA, JSON.stringify({
  generado: new Date().toISOString(), entrada: ENTRADA, dias: D.length,
  liston: LISTON, pruebasDeclaradas: PRUEBAS_DECLARADAS, sorteos: SORTEOS, cuenta: CUENTA,
  mitadA: MITAD_A.length, mitadB: MITAD_B.length, gammaPos: POS.length, gammaNeg: NEG.length,
  geometria, resultados: RES, ganadores,
  peaje: { callP50: +mediana(hq).toFixed(2), callP95: +pct(hq, 95).toFixed(2), putP50: +mediana(hqP).toFixed(2), straddleP50Pts: +mediana(D.map((d) => d.straddlePts)).toFixed(1) },
}, null, 1));
console.log(`\n   → ${SALIDA}\n`);
