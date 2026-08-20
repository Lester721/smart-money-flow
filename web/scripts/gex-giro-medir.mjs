// ═══════════════════════════════════════════════════════════════════════════════════════════
// RESPETAR · GIRO — ¿el PUNTO DE GIRO (gamma flip) cambia el TAMAÑO del movimiento del día?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/gex-giro-medir.mjs
//
// ═══ LA HIPÓTESIS DE VICTOR ════════════════════════════════════════════════════════════════
// Por encima del punto de giro el creador de mercado está largo de gamma: vende fuerza y compra
// debilidad → el día se CALMA. Por debajo está corto: compra fuerza y vende debilidad → el día se
// AMPLIFICA. Se mide el movimiento intradía REALIZADO (rango y |cierre−apertura|) según dónde
// abra el precio respecto al giro.
//
// ═══ LO PRIMERO QUE HAY QUE DECIR ══════════════════════════════════════════════════════════
// "Por encima del giro" es, palabra por palabra, "la gamma neta en el spot es POSITIVA". El giro
// es por definición el precio donde esa gamma cruza cero, y en 1.115 de 1.122 días hay UN solo
// cruce. Así que la clasificación binaria arriba/abajo NO es un nivel nuevo: es el INTERRUPTOR
// que ya se midió dos veces, con otro nombre. Este script lo COMPRUEBA (no lo supone) y por eso
// mide DOS cosas distintas:
//     A) el binario arriba/abajo   → confirmación o refutación del interruptor, en SPX y contra
//        un desenlace nuevo (el tamaño del movimiento, no el P&L de un cóndor).
//     B) la DISTANCIA al giro      → esto sí es información de NIVEL que ningún interruptor lleva
//        dentro: no es "¿de qué lado?" sino "¿a cuántos puntos?".
//
// ═══ REGLAS ════════════════════════════════════════════════════════════════════════════════
//  · Nada del futuro: niveles a las 09:35 con el OI sellado antes de las 09:15 (cierre de ayer).
//  · El desenlace se mide de 09:35 al cierre, nunca antes de la hora de decisión.
//  · CONTROL CONTRA EL AZAR: 500 sorteos de un nivel puesto a LA MISMA DISTANCIA pero de lado al
//    azar. Si el giro no le gana a esa línea, el giro no existe. Semilla fija: reproducible.
//  · MUESTRA PARTIDA: 2022-2023 contra 2024-2026, en las DOS direcciones.
//  · El día vive dentro de su propia volatilidad: se mide también el desenlace DIVIDIDO por el
//    movimiento que el mercado de opciones ya está cobrando esa mañana (el straddle ATM de las
//    09:35, precio real). Si el efecto sólo existe en crudo, es el régimen de volatilidad, no el
//    nivel.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync } from "node:fs";

const ENTRADA = "scripts/gex-niveles.json";
const SALIDA = "scripts/gex-giro-resultado.json";
const CUENTA = 56389;
const SORTEOS = 500;
const PRUEBAS_DECLARADAS = 16;   // 2 lentes × 2 desenlaces × 2 normalizaciones × {binario, distancia}

// ── estadística ────────────────────────────────────────────────────────────────────────────
const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const varianza = (v) => { if (v.length < 2) return NaN; const m = media(v); return v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1); };
const sd = (v) => Math.sqrt(varianza(v));
const pct = (v, p) => { if (!v.length) return NaN; const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))]; };
const mediana = (v) => pct(v, 50);

/** t de Welch (dos muestras, varianzas desiguales). Positiva = a tiene media MAYOR que b. */
function welch(a, b) {
  if (a.length < 3 || b.length < 3) return { t: NaN, dif: NaN, n1: a.length, n2: b.length };
  const va = varianza(a) / a.length, vb = varianza(b) / b.length;
  const se = Math.sqrt(va + vb);
  return { t: se > 0 ? (media(a) - media(b)) / se : NaN, dif: media(a) - media(b), n1: a.length, n2: b.length };
}
/** t de una pendiente OLS de y sobre x. */
function pendiente(x, y) {
  const n = x.length; if (n < 5) return { b: NaN, t: NaN, n };
  const mx = media(x), my = media(y);
  let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; }
  if (!(sxx > 0)) return { b: NaN, t: NaN, n };
  const b = sxy / sxx, a = my - b * mx;
  let sse = 0; for (let i = 0; i < n; i++) { const e = y[i] - (a + b * x[i]); sse += e * e; }
  const s2 = sse / (n - 2);
  return { b, t: b / Math.sqrt(s2 / sxx), n };
}
function listonT(pruebas) {
  if (pruebas <= 1) return 2;
  const p = 0.05 / pruebas / 2;
  const t = Math.sqrt(-2 * Math.log(p));
  return Math.round((t - (2.30753 + 0.27061 * t) / (1 + 0.99229 * t + 0.04481 * t * t)) * 100) / 100;
}
const LISTON = listonT(PRUEBAS_DECLARADAS);

/** Generador reproducible: mismos números en cada corrida. */
function rng(semilla) {
  let a = semilla >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** LANZA si un campo está muerto. Un campo que no existe se lee como 0 y 0 no da error. */
function exigir(cond, msg) { if (!cond) throw new Error(`FALLO CERRADO: ${msg}`); }

// ═══ 1 · RADIOGRAFÍA — mirar el fichero ANTES de medirlo ════════════════════════════════════
const J = JSON.parse(readFileSync(ENTRADA, "utf8"));
const BRUTO = J.filas;

console.log("\n" + "═".repeat(95));
console.log("RESPETAR · GIRO — ¿el punto de giro cambia el TAMAÑO del movimiento intradía de SPX?");
console.log("═".repeat(95));
console.log(`\n## 1 · RADIOGRAFÍA de ${ENTRADA}`);
console.log(`   generado ${J.generado} · hora de decisión ${J.hora} · ${BRUTO.length} días`);

// `constanteEsperada` = campos que DEBEN salir constantes porque su constancia es la prueba de
// salud (barras5min = 78 significa que ningún día viene cortado). Todo lo demás, si sale
// constante o todo ceros, LANZA: es el fallo silencioso de medir un campo que no existe.
function radiografia(filas, campos, constanteEsperada = []) {
  console.log(`\n   ${"campo".padEnd(22)} ${"vivos".padStart(6)} ${"nulos".padStart(6)} ${"ceros".padStart(6)}  ${"p05".padStart(9)} ${"p50".padStart(9)} ${"p95".padStart(9)}`);
  const muertos = [];
  for (const [nombre, fn] of campos) {
    const v = filas.map(fn);
    const vivos = v.filter((x) => x != null && Number.isFinite(x));
    const nulos = v.length - vivos.length;
    const ceros = vivos.filter((x) => x === 0).length;
    const cte = vivos.length > 1 && sd(vivos) === 0;
    console.log(`   ${nombre.padEnd(22)} ${String(vivos.length).padStart(6)} ${String(nulos).padStart(6)} ${String(ceros).padStart(6)}  ` +
      `${pct(vivos, 5).toFixed(3).padStart(9)} ${mediana(vivos).toFixed(3).padStart(9)} ${pct(vivos, 95).toFixed(3).padStart(9)}` +
      `${cte && constanteEsperada.includes(nombre) ? "   (constante ESPERADA: ningún día viene cortado)" : ""}`);
    if (vivos.length === 0 || ceros === vivos.length) muertos.push(nombre);
    if (cte && !constanteEsperada.includes(nombre)) muertos.push(nombre + " (constante)");
  }
  exigir(muertos.length === 0, `campos muertos o constantes: ${muertos.join(", ")}`);
}
radiografia(BRUTO, [
  ["apertura", (f) => f.apertura],
  ["cierre", (f) => f.cierre],
  ["rangoPct", (f) => f.rangoPct],
  ["|movDiaPct|", (f) => Math.abs(f.movDiaPct)],
  ["gam·dFlip", (f) => f.niveles.gam.dFlip?.pts ?? null],
  ["gamD·dFlip", (f) => f.niveles.gamD.dFlip?.pts ?? null],
  ["gam·netPunto", (f) => f.niveles.gam.netPunto],
  ["straddle ATM bid", (f) => (f.peaje.callATM?.bid ?? null)],
  ["horquilla call %", (f) => (f.peaje.callATM?.horquillaPct ?? null)],
  ["barras5min", (f) => f.barras5min],
], ["barras5min"]);

// ═══ 2 · CONSTRUIR LAS FILAS DE MEDIDA ══════════════════════════════════════════════════════
// Desenlaces (09:35 → cierre, muestreado cada 5 min):
//   rango  = (máx − mín) / apertura × 100
//   mov    = |cierre − apertura| / apertura × 100
// Normalizador: el movimiento que YA cobra el mercado esa mañana = straddle ATM (mid) / spot.
// Es precio real de las 09:35, conocido en el momento de decidir. Nunca es el resultado, sólo el
// denominador que quita el régimen de volatilidad de en medio.
const D = [];
const fuera = {};
const cae = (k) => { fuera[k] = (fuera[k] || 0) + 1; };
for (const f of BRUTO) {
  const c = f.peaje.callATM, p = f.peaje.putATM;
  if (!c || !p || !(c.bid > 0) || !(p.bid > 0)) { cae("sin straddle ATM cotizado"); continue; }
  const impl = (((c.bid + c.ask) / 2 + (p.bid + p.ask) / 2) / f.apertura) * 100;
  if (!(impl > 0.05)) { cae("straddle implausible"); continue; }
  const d = {
    fecha: f.fecha, ano: +f.fecha.slice(0, 4), apertura: f.apertura,
    rango: f.rangoPct, mov: Math.abs(f.movDiaPct), impl,
    horquilla: c.horquillaPct,
    spy: f.spy ? { ap: f.spy.apertura, ci: f.spy.cierre, max: f.spy.max, min: f.spy.min } : null,
  };
  d.rangoN = d.rango / impl;
  d.movN = d.mov / impl;
  for (const L of ["gam", "gamD"]) {
    const nv = f.niveles[L];
    d[L] = nv.flip == null ? null
      : { dFlip: nv.dFlip.pts, dFlipPct: nv.dFlip.pct, arriba: nv.dFlip.pts < 0, dist: Math.abs(nv.dFlip.pts), net: nv.netPunto };
  }
  D.push(d);
}
console.log(`\n   filas de medida: ${D.length} de ${BRUTO.length}`);
for (const [k, v] of Object.entries(fuera)) console.log(`     fuera ${String(v).padStart(4)}  ${k}`);
exigir(D.length > 1000, `sólo ${D.length} filas de medida`);

// ── EL CHEQUEO QUE DECIDE CÓMO SE LEE TODO LO DEMÁS ──
console.log(`\n## 2 · ¿ES EL GIRO UN NIVEL NUEVO, O EL INTERRUPTOR CON OTRO NOMBRE?`);
for (const L of ["gam", "gamD"]) {
  const con = D.filter((d) => d[L]);
  const coincide = con.filter((d) => d[L].arriba === (d[L].net > 0)).length;
  console.log(`   ${L.padEnd(5)}  n=${con.length}  "arriba del giro" == "gamma neta > 0" en ${coincide} días = ${((coincide / con.length) * 100).toFixed(1)}%` +
    `   ·  arriba ${con.filter((d) => d[L].arriba).length} / abajo ${con.filter((d) => !d[L].arriba).length}`);
}
{
  const con = D.filter((d) => d.gam && d.gamD);
  const ig = con.filter((d) => d.gam.arriba === d.gamD.arriba).length;
  console.log(`   las dos lentes clasifican igual el ${((ig / con.length) * 100).toFixed(1)}% de los ${con.length} días`);
}

// ═══ 3 · EL BINARIO: arriba vs abajo del giro ═══════════════════════════════════════════════
// Se mide sobre el LOGARITMO del desenlace: el efecto que se busca es multiplicativo ("el día se
// mueve un X% más"), y el rango está muy sesgado a la derecha. La t sale de Welch. El control
// contra el azar usa EXACTAMENTE el mismo estadístico, así que cualquier rareza se cancela.
const PERIODOS = [
  ["TODO      2022-2026", (d) => true],
  ["A ELEGIR  2022-2023", (d) => d.ano <= 2023],
  ["B PROBAR  2024-2026", (d) => d.ano >= 2024],
];
const DESENLACES = [
  ["rango crudo", (d) => d.rango],
  ["rango / implícito", (d) => d.rangoN],
  ["|mov| crudo", (d) => d.mov],
  ["|mov| / implícito", (d) => d.movN],
];

function tBinario(filas, L, val) {
  const ab = filas.filter((d) => d[L] && !d[L].arriba).map((d) => Math.log(val(d)));
  const ar = filas.filter((d) => d[L] && d[L].arriba).map((d) => Math.log(val(d)));
  return { ...welch(ab, ar), medAb: NaN, medAr: NaN, ab, ar };  // positiva = ABAJO se mueve MÁS
}

const RES = { binario: {}, azar: {}, distancia: {}, umbral: {} };

console.log(`\n## 3 · EL BINARIO — ¿se mueve MÁS el día cuando el precio abre por DEBAJO del giro?`);
console.log(`   (t positiva = ABAJO se mueve más, que es lo que dice la hipótesis. Listón |t| ≥ ${LISTON} con ${PRUEBAS_DECLARADAS} pruebas)`);
for (const L of ["gam", "gamD"]) {
  console.log(`\n   ── lente ${L} ──`);
  console.log(`   ${"período".padEnd(20)} ${"desenlace".padEnd(19)} ${"n abajo".padStart(8)} ${"n arriba".padStart(8)}  ${"med abajo".padStart(10)} ${"med arriba".padStart(10)} ${"cociente".padStart(9)} ${"t".padStart(7)}`);
  for (const [pn, pf] of PERIODOS) {
    const filas = D.filter(pf);
    for (const [dn, dv] of DESENLACES) {
      const r = tBinario(filas, L, dv);
      const mAb = mediana(filas.filter((d) => d[L] && !d[L].arriba).map(dv));
      const mAr = mediana(filas.filter((d) => d[L] && d[L].arriba).map(dv));
      RES.binario[`${L}|${pn}|${dn}`] = { t: +r.t.toFixed(3), nAb: r.n1, nAr: r.n2, medAb: +mAb.toFixed(4), medAr: +mAr.toFixed(4), cociente: +(mAb / mAr).toFixed(4) };
      console.log(`   ${pn.padEnd(20)} ${dn.padEnd(19)} ${String(r.n1).padStart(8)} ${String(r.n2).padStart(8)}  ` +
        `${mAb.toFixed(4).padStart(10)} ${mAr.toFixed(4).padStart(10)} ${(mAb / mAr).toFixed(3).padStart(9)} ${r.t.toFixed(2).padStart(7)}` +
        `${Math.abs(r.t) >= LISTON ? "  ← pasa el listón" : ""}`);
    }
  }
}

// ═══ 4 · CONTROL CONTRA EL AZAR ═════════════════════════════════════════════════════════════
// El control que decide: un nivel puesto A LA MISMA DISTANCIA del precio pero de lado al azar.
// Conserva exactamente la distribución de distancias del giro real y destruye SÓLO la
// información de "de qué lado". Si el giro no le gana a esa línea, el giro no existe.
// Segundo control: barajar las etiquetas reales (conserva también el reparto arriba/abajo).
console.log(`\n## 4 · CONTROL CONTRA EL AZAR — ${SORTEOS} sorteos de un nivel a la MISMA distancia, lado al azar`);
console.log(`   ${"lente".padEnd(6)} ${"desenlace".padEnd(19)} ${"t real".padStart(8)} ${"|t| azar p50".padStart(13)} ${"|t| azar p95".padStart(13)} ${"percentil".padStart(10)}  veredicto`);
for (const L of ["gam", "gamD"]) {
  const con = D.filter((d) => d[L]);
  for (const [dn, dv] of DESENLACES) {
    const real = Math.abs(tBinario(con, L, dv).t);
    const ys = con.map((d) => Math.log(dv(d)));
    const azar = [], baraja = [];
    const r1 = rng(20260820), r2 = rng(777);
    const etiquetas = con.map((d) => !d[L].arriba);   // true = abajo
    for (let s = 0; s < SORTEOS; s++) {
      // (a) nivel a la misma distancia, lado al azar
      const a = [], b = [];
      for (let i = 0; i < con.length; i++) (r1() < 0.5 ? a : b).push(ys[i]);
      azar.push(Math.abs(welch(a, b).t));
      // (b) barajar las etiquetas reales (conserva el reparto arriba/abajo)
      const perm = etiquetas.slice();
      for (let i = perm.length - 1; i > 0; i--) { const k = Math.floor(r2() * (i + 1)); [perm[i], perm[k]] = [perm[k], perm[i]]; }
      const c = [], e = [];
      for (let i = 0; i < con.length; i++) (perm[i] ? c : e).push(ys[i]);
      baraja.push(Math.abs(welch(c, e).t));
    }
    azar.sort((x, y) => x - y);
    const percentil = (azar.filter((x) => x < real).length / azar.length) * 100;
    const percBaraja = (baraja.filter((x) => x < real).length / baraja.length) * 100;
    RES.azar[`${L}|${dn}`] = { tReal: +real.toFixed(3), azarP50: +mediana(azar).toFixed(3), azarP95: +pct(azar, 95).toFixed(3), percentil: +percentil.toFixed(1), percentilBaraja: +percBaraja.toFixed(1) };
    console.log(`   ${L.padEnd(6)} ${dn.padEnd(19)} ${real.toFixed(2).padStart(8)} ${mediana(azar).toFixed(2).padStart(13)} ${pct(azar, 95).toFixed(2).padStart(13)} ${(percentil.toFixed(1) + "%").padStart(10)}  ` +
      `${percentil >= 95 ? "LE GANA AL AZAR" : "no le gana al azar"} (barajado ${percBaraja.toFixed(0)}%)`);
  }
}

// ═══ 5 · LA DISTANCIA — lo único que NO lleva dentro el interruptor ═════════════════════════
// x = (giro − apertura) en % del índice. Negativo = el giro está por DEBAJO (precio arriba).
// Si la hipótesis es cierta, cuanto MÁS arriba del giro esté el precio, MÁS calmado el día:
// pendiente POSITIVA de log(desenlace) sobre x.
console.log(`\n## 5 · LA DISTANCIA al giro (esto sí es un NIVEL, no un interruptor)`);
console.log(`   x = (giro − apertura) en % · pendiente positiva = cuanto más ARRIBA del giro, más CALMA`);
console.log(`   ${"lente".padEnd(6)} ${"período".padEnd(20)} ${"desenlace".padEnd(19)} ${"n".padStart(6)} ${"pendiente".padStart(10)} ${"t".padStart(7)}`);
for (const L of ["gam", "gamD"]) {
  for (const [pn, pf] of PERIODOS) {
    const con = D.filter(pf).filter((d) => d[L]);
    for (const [dn, dv] of DESENLACES) {
      const x = con.map((d) => d[L].dFlipPct), y = con.map((d) => Math.log(dv(d)));
      const r = pendiente(x, y);
      RES.distancia[`${L}|${pn}|${dn}`] = { b: +r.b.toFixed(4), t: +r.t.toFixed(3), n: r.n };
      console.log(`   ${L.padEnd(6)} ${pn.padEnd(20)} ${dn.padEnd(19)} ${String(r.n).padStart(6)} ${r.b.toFixed(4).padStart(10)} ${r.t.toFixed(2).padStart(7)}` +
        `${Math.abs(r.t) >= LISTON ? "  ← pasa el listón" : ""}`);
    }
  }
}

// ═══ 6 · UMBRAL ELEGIDO EN UNA MITAD, PROBADO EN LA OTRA ════════════════════════════════════
// Aquí SÍ hay una elección que puede sobreajustar: "sólo cuenta si el precio está a más de X
// puntos del giro". Se elige X en una mitad maximizando |t| y se PRUEBA en la otra. En las dos
// direcciones. Sólo cuenta lo que sobreviva al cruce.
const UMBRALES = [0, 5, 10, 15, 20, 30, 40];
console.log(`\n## 6 · UMBRAL DE DISTANCIA — elegido en una mitad, probado en la otra (las DOS direcciones)`);
function tConUmbral(filas, L, dv, X) {
  const con = filas.filter((d) => d[L] && d[L].dist >= X);
  return { ...tBinario(con, L, dv), n: con.length };
}
for (const L of ["gam", "gamD"]) {
  for (const [dn, dv] of DESENLACES) {
    const A = D.filter((d) => d.ano <= 2023), B = D.filter((d) => d.ano >= 2024);
    const elegir = (m) => { let mej = null; for (const X of UMBRALES) { const r = tConUmbral(m, L, dv, X); if (r.n1 >= 60 && r.n2 >= 60 && (mej === null || Math.abs(r.t) > Math.abs(mej.t))) mej = { X, t: r.t, n: r.n }; } return mej; };
    const eA = elegir(A), eB = elegir(B);
    const pAB = eA ? tConUmbral(B, L, dv, eA.X) : null;
    const pBA = eB ? tConUmbral(A, L, dv, eB.X) : null;
    RES.umbral[`${L}|${dn}`] = {
      elegidoEnA: eA && { X: eA.X, t: +eA.t.toFixed(2), n: eA.n }, probadoEnB: pAB && { t: +pAB.t.toFixed(2), n: pAB.n },
      elegidoEnB: eB && { X: eB.X, t: +eB.t.toFixed(2), n: eB.n }, probadoEnA: pBA && { t: +pBA.t.toFixed(2), n: pBA.n },
      sobrevive: !!(pAB && pBA && Math.sign(eA.t) === Math.sign(pAB.t) && Math.sign(eB.t) === Math.sign(pBA.t) && Math.abs(pAB.t) >= 2 && Math.abs(pBA.t) >= 2),
    };
    const r = RES.umbral[`${L}|${dn}`];
    console.log(`   ${L.padEnd(6)} ${dn.padEnd(19)}  elige en 22-23 X=${String(eA.X).padStart(2)} (t=${eA.t.toFixed(2)}) → prueba en 24-26 t=${pAB.t.toFixed(2)}  ` +
      `|  elige en 24-26 X=${String(eB.X).padStart(2)} (t=${eB.t.toFixed(2)}) → prueba en 22-23 t=${pBA.t.toFixed(2)}  ${r.sobrevive ? "SOBREVIVE" : "no sobrevive"}`);
  }
}

// ═══ 7 · EL VEHÍCULO — qué costaría cobrarlo, con la horquilla REAL ═════════════════════════
// Este script NO monta una estrategia: eso es la fase siguiente. Pero sí pone el efecto medido al
// lado del peaje real, porque un efecto más pequeño que la horquilla no es dinero, es ruido caro.
console.log(`\n## 7 · EL VEHÍCULO — el efecto medido contra el peaje REAL de las 09:35`);
{
  const hs = D.map((d) => d.horquilla).filter((x) => x > 0);
  const impl = D.map((d) => d.impl);
  console.log(`   straddle ATM de 0DTE (movimiento que YA cobra el mercado): mediana ${mediana(impl).toFixed(3)}% del índice`);
  console.log(`   horquilla real de esa call ATM: p25 ${pct(hs, 25).toFixed(2)}% · mediana ${mediana(hs).toFixed(2)}% · p75 ${pct(hs, 75).toFixed(2)}% de la prima`);
  console.log(`   ida y vuelta de un straddle (4 cruces de horquilla): ~${(mediana(hs) * 2).toFixed(1)}% de la prima`);
  for (const L of ["gam", "gamD"]) {
    const con = D.filter((d) => d[L]);
    const ab = con.filter((d) => !d[L].arriba), ar = con.filter((d) => d[L].arriba);
    const difN = mediana(ab.map((d) => d.rangoN)) / mediana(ar.map((d) => d.rangoN)) - 1;
    console.log(`   ${L}: el día de ABAJO se mueve un ${(difN * 100).toFixed(1)}% más que el de arriba DESPUÉS de descontar lo que ya cobra el mercado`);
  }
  console.log(`   base de cuenta: $${CUENTA.toLocaleString("es-ES")}`);
}

// ═══ 8 · VEREDICTO ══════════════════════════════════════════════════════════════════════════
console.log(`\n## 8 · VEREDICTO`);
const pasan = [];
for (const [k, v] of Object.entries(RES.binario)) if (k.startsWith("gam|TODO") || k.startsWith("gamD|TODO")) if (Math.abs(v.t) >= LISTON) pasan.push(`binario ${k} t=${v.t}`);
for (const [k, v] of Object.entries(RES.distancia)) if (k.includes("TODO")) if (Math.abs(v.t) >= LISTON) pasan.push(`distancia ${k} t=${v.t}`);
const ganan = Object.entries(RES.azar).filter(([, v]) => v.percentil >= 95).map(([k, v]) => `${k} p${v.percentil}`);
const cruzan = Object.entries(RES.umbral).filter(([, v]) => v.sobrevive).map(([k]) => k);
console.log(`   pasan el listón (|t| ≥ ${LISTON}): ${pasan.length ? pasan.join(" · ") : "NINGUNO"}`);
console.log(`   le ganan al azar (percentil ≥ 95): ${ganan.length ? ganan.join(" · ") : "NINGUNO"}`);
console.log(`   sobreviven al cruce de mitades: ${cruzan.length ? cruzan.join(" · ") : "NINGUNO"}`);

writeFileSync(SALIDA, JSON.stringify({
  generado: new Date().toISOString(), entrada: ENTRADA, n: D.length,
  liston: LISTON, pruebasDeclaradas: PRUEBAS_DECLARADAS, sorteos: SORTEOS, cuenta: CUENTA,
  nota: "'arriba del giro' es idéntico al signo de la gamma neta: el binario es el interruptor con otro nombre. La DISTANCIA sí es información nueva.",
  ...RES,
}, null, 1), "utf8");
console.log(`\n   escrito: ${SALIDA}\n`);
