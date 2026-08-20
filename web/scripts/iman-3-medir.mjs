// ═══════════════════════════════════════════════════════════════════════════════════════════
// RESPETAR · IMANES (2) — arreglar los controles y apretar al único candidato
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/iman-3-medir.mjs
//
// ═══ QUÉ ARREGLA ESTE PASO ═════════════════════════════════════════════════════════════════
// En iman-2-medir.mjs los controles B y C salieron en percentil 99-100 y NO son de fiar: barajan
// DESPLAZAMIENTOS EN PUNTOS entre días con SPX de 3.800 a 7.400 y con el movimiento implícito
// variando de 8 a 28 puntos. Un desplazamiento de 60 puntos es "lejos" en 2022 y "cerca" en 2026.
// Ese desajuste de escala, por sí solo, empeora el control y hace parecer bueno al imán. Aquí se
// barajan desplazamientos RELATIVOS (en unidades del straddle ATM de esa mañana, precio real
// conocido a las 09:35) y se convierten de vuelta a puntos con la escala del día que los recibe.
//
// También arregla dos estadísticos:
//   · TOQUE y FIJACIÓN se medían con una t de proporción binomial. Está mal: en muchos días el
//     nivel real y sus dos espejos dan el MISMO resultado (los tres tocan o ninguno toca), así
//     que esos días no aportan varianza. La binomial la cuenta igual y subestima la señal. Se
//     pasa a t PAREADA sobre la diferencia día a día contra la esperanza exacta de los dos lados.
//   · DIRECCIÓN necesita un control propio: el imán cae por encima de la apertura el 64% de los
//     días y el mercado subió en el período. "Adivinar el lado" puede ser sólo la DERIVA. El
//     control D baraja los SIGNOS reales entre días: conserva ese sesgo de lado y la deriva, y
//     deja fuera sólo el emparejamiento día-a-día.
//
// ═══ AÑADE ═════════════════════════════════════════════════════════════════════════════════
//   · FIJACIÓN (pinning): ¿el cierre acaba PEGADO al imán (±5 y ±10 puntos) más que el azar?
//     Es la forma fuerte de la hipótesis del imán: no "se acerca", sino "acaba ahí".
//   · TASA DE VICTORIA: en qué % de días el cierre queda más cerca del imán que del nivel al
//     azar. Robusta a la cola: un solo día de −150 puntos no la mueve.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync } from "node:fs";

const ENTRADA = "scripts/gex-niveles.json";
const SALIDA  = "scripts/iman-3-resultado.json";
const SORTEOS = 500;
const PRUEBAS_DECLARADAS = 24;

const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const varianza = (v) => { if (v.length < 2) return NaN; const m = media(v); return v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1); };
const sd = (v) => Math.sqrt(varianza(v));
const pct = (v, p) => { if (!v.length) return NaN; const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.round((p / 100) * (s.length - 1))))]; };
const mediana = (v) => pct(v, 50);
function tPareada(d) {
  if (d.length < 3) return { t: NaN, m: NaN, n: d.length };
  const m = media(d), s = sd(d);
  return { t: s > 0 ? m / (s / Math.sqrt(d.length)) : NaN, m, n: d.length };
}
function listonT(pruebas) {
  if (pruebas <= 1) return 2;
  const p = 0.05 / pruebas / 2;
  const t = Math.sqrt(-2 * Math.log(p));
  return Math.round((t - (2.30753 + 0.27061 * t) / (1 + 0.99229 * t + 0.04481 * t * t)) * 100) / 100;
}
const LISTON = listonT(PRUEBAS_DECLARADAS);
function rng(semilla) {
  let a = semilla >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const percentilEnNube = (real, nube) => +(100 * nube.filter((x) => x < real).length / nube.length).toFixed(1);
function exigir(cond, msg) { if (!cond) throw new Error(`FALLO CERRADO: ${msg}`); }

const J = JSON.parse(readFileSync(ENTRADA, "utf8"));
console.log("\n" + "═".repeat(95));
console.log("RESPETAR · IMANES (2) — controles arreglados y el candidato apretado");
console.log("═".repeat(95));
console.log(`   ${J.filas.length} días · decisión 09:35 · listón |t| ≥ ${LISTON} (${PRUEBAS_DECLARADAS} pruebas)`);

const IMANES = [
  ["gam.imanBruto",  (f) => f.niveles.gam?.imanBruto],
  ["gam.imanNeto",   (f) => f.niveles.gam?.imanNeto],
  ["gamD.imanBruto", (f) => f.niveles.gamD?.imanBruto],
  ["gamD.imanNeto",  (f) => f.niveles.gamD?.imanNeto],
  ["oi.imanBruto",   (f) => f.niveles.oi?.imanBruto],
  ["maxPain",        (f) => f.maxPain],
];

const D = [];
for (const f of J.filas) {
  const c = f.peaje.callATM, p = f.peaje.putATM;
  if (!(f.apertura > 0) || !(f.cierre > 0) || !c || !p || !(c.bid > 0) || !(p.bid > 0)) continue;
  const straddlePts = (c.bid + c.ask) / 2 + (p.bid + p.ask) / 2;
  if (!(straddlePts > 2)) continue;
  const d = { fecha: f.fecha, ano: +f.fecha.slice(0, 4), ap: f.apertura, ci: f.cierre,
    max: f.maxMuestreado, min: f.minMuestreado, straddlePts, netPunto: f.niveles.gam?.netPunto ?? null, imanes: {} };
  let ok = true;
  for (const [nombre, fn] of IMANES) { const K = fn(f); if (!(K > 0)) { ok = false; break; } d.imanes[nombre] = K; }
  if (ok) D.push(d);
}
exigir(D.length > 900, `muestra pequeña: ${D.length}`);
const MITAD_A = D.filter((d) => d.ano <= 2023), MITAD_B = D.filter((d) => d.ano >= 2024);

// ═══ EL PISO: ¿cuánto vale "adivinar" sin ningún nivel? ═════════════════════════════════════
const subioPct = 100 * D.filter((d) => d.ci > d.ap).length / D.length;
console.log(`\n## 0 · EL PISO — antes de mirar ningún nivel`);
console.log(`   Días que cerraron por ENCIMA de su apertura de las 09:35: ${subioPct.toFixed(1)}%  (n=${D.length})`);
console.log(`   → "siempre arriba" acierta el lado el ${subioPct.toFixed(1)}% de los días SIN mirar gamma ninguna.`);
console.log(`   Movimiento |cierre−apertura| mediano: ${mediana(D.map((d) => Math.abs(d.ci - d.ap))).toFixed(1)} pts · straddle mediano ${mediana(D.map((d) => d.straddlePts)).toFixed(1)} pts`);

// ═══ DESENLACES ════════════════════════════════════════════════════════════════════════════
function desenlaces(d, L) {
  const dAp = Math.abs(d.ap - L), dCi = Math.abs(d.ci - L);
  const sL = Math.sign(L - d.ap), sC = Math.sign(d.ci - d.ap);
  return {
    dAp, dCi, acerc: dAp - dCi,
    toque: (L >= d.min && L <= d.max) ? 1 : 0,
    fija5: dCi <= 5 ? 1 : 0, fija10: dCi <= 10 ? 1 : 0,
    direcc: (sL === 0 || sC === 0) ? null : (sL === sC ? 1 : 0),
  };
}

// ═══ CONTROL A (obligatorio) · misma |distancia|, lado al azar ══════════════════════════════
// Esperanza EXACTA sobre los dos lados (no hace falta sortear para la t pareada) + nube de 500.
function controlA(filas, nombre, semilla) {
  const dAcerc = [], dAcercN = [], dToque = [], dFija5 = [], dFija10 = [];
  let realToque = 0, realFija5 = 0, realFija10 = 0, realDir = 0, conDir = 0, realAcerc = 0;
  for (const d of filas) {
    const L = d.imanes[nombre], dist = Math.abs(L - d.ap);
    const r = desenlaces(d, L), u = desenlaces(d, d.ap + dist), b = desenlaces(d, d.ap - dist);
    dAcerc.push(r.acerc - (u.acerc + b.acerc) / 2);
    dAcercN.push((r.acerc - (u.acerc + b.acerc) / 2) / d.straddlePts);
    dToque.push(r.toque - (u.toque + b.toque) / 2);
    dFija5.push(r.fija5 - (u.fija5 + b.fija5) / 2);
    dFija10.push(r.fija10 - (u.fija10 + b.fija10) / 2);
    realAcerc += r.acerc; realToque += r.toque; realFija5 += r.fija5; realFija10 += r.fija10;
    if (r.direcc != null) { conDir++; realDir += r.direcc; }
  }
  const n = filas.length;
  const rnd = rng(semilla);
  const nubeAcerc = [], nubeGana = [];
  let ganaAcum = 0, ganaN = 0;
  for (let s = 0; s < SORTEOS; s++) {
    let sa = 0, g = 0, gn = 0;
    for (const d of filas) {
      const L = d.imanes[nombre], dist = Math.abs(L - d.ap);
      const Lc = d.ap + (rnd() < 0.5 ? -dist : dist);
      sa += desenlaces(d, Lc).acerc;
      const dCiReal = Math.abs(d.ci - L), dCiCtrl = Math.abs(d.ci - Lc);
      if (dCiReal !== dCiCtrl) { gn++; if (dCiReal < dCiCtrl) g++; }
    }
    nubeAcerc.push(sa / n); if (gn) { nubeGana.push(100 * g / gn); ganaAcum += g; ganaN += gn; }
  }
  const tA = tPareada(dAcerc), tAN = tPareada(dAcercN), tT = tPareada(dToque), tF5 = tPareada(dFija5), tF10 = tPareada(dFija10);
  return { n,
    acercReal: realAcerc / n, acercAzar: media(nubeAcerc), acercPctil: percentilEnNube(realAcerc / n, nubeAcerc),
    ventajaPts: tA.m, tAcerc: tA.t, tAcercN: tAN.t,
    toquePct: 100 * realToque / n, toqueVentaja: 100 * tT.m, tToque: tT.t,
    fija5Pct: 100 * realFija5 / n, fija5Ventaja: 100 * tF5.m, tFija5: tF5.t,
    fija10Pct: 100 * realFija10 / n, fija10Ventaja: 100 * tF10.m, tFija10: tF10.t,
    dirPct: 100 * realDir / conDir, conDir, realDir,
    ganaPct: ganaN ? 100 * ganaAcum / ganaN : NaN, ganaPctil: percentilEnNube(50, nubeGana),
  };
}

// ═══ CONTROL B' · barajar días con la ESCALA ARREGLADA ══════════════════════════════════════
// Se baraja el desplazamiento RELATIVO (imán−apertura)/straddle y se devuelve a puntos con el
// straddle del día que lo recibe. Así un "60 puntos de 2022" no se convierte en "60 puntos de
// 2026": viaja como "2,1 straddles" y aterriza en los puntos que eso valga ese día.
function controlBprima(filas, nombre, semilla) {
  const rnd = rng(semilla);
  const rel = filas.map((d) => (d.imanes[nombre] - d.ap) / d.straddlePts);
  let realAcerc = 0, realToque = 0, realDir = 0, conDir = 0;
  for (const d of filas) { const r = desenlaces(d, d.imanes[nombre]); realAcerc += r.acerc; realToque += r.toque; if (r.direcc != null) { conDir++; realDir += r.direcc; } }
  const n = filas.length;
  const nubeA = [], nubeT = [], nubeD = [];
  for (let s = 0; s < SORTEOS; s++) {
    let sa = 0, st = 0, sd_ = 0, nd = 0;
    for (const d of filas) {
      const L = d.ap + rel[Math.floor(rnd() * rel.length)] * d.straddlePts;
      const r = desenlaces(d, L);
      sa += r.acerc; st += r.toque; if (r.direcc != null) { nd++; sd_ += r.direcc; }
    }
    nubeA.push(sa / n); nubeT.push(100 * st / n); nubeD.push(nd ? 100 * sd_ / nd : NaN);
  }
  return { acercReal: realAcerc / n, acercAzar: media(nubeA), acercPctil: percentilEnNube(realAcerc / n, nubeA),
    toqueReal: 100 * realToque / n, toqueAzar: media(nubeT), toquePctil: percentilEnNube(100 * realToque / n, nubeT),
    dirReal: 100 * realDir / conDir, dirAzar: media(nubeD.filter(Number.isFinite)), dirPctil: percentilEnNube(100 * realDir / conDir, nubeD) };
}

// ═══ CONTROL C' · MISMO lado, distancia relativa al azar ════════════════════════════════════
function controlCprima(filas, nombre, semilla) {
  const rnd = rng(semilla);
  const distRel = filas.map((d) => Math.abs(d.imanes[nombre] - d.ap) / d.straddlePts);
  let realAcerc = 0; for (const d of filas) realAcerc += desenlaces(d, d.imanes[nombre]).acerc;
  const n = filas.length, nubeA = [];
  for (let s = 0; s < SORTEOS; s++) {
    let sa = 0;
    for (const d of filas) {
      const lado = Math.sign(d.imanes[nombre] - d.ap) || 1;
      sa += desenlaces(d, d.ap + lado * distRel[Math.floor(rnd() * distRel.length)] * d.straddlePts).acerc;
    }
    nubeA.push(sa / n);
  }
  return { acercAzar: media(nubeA), acercPctil: percentilEnNube(realAcerc / n, nubeA) };
}

// ═══ CONTROL D · SÓLO para dirección: barajar los SIGNOS reales ═════════════════════════════
// Conserva el sesgo de lado del imán (64% arriba) y la deriva del mercado. Si el imán acierta el
// lado sólo porque suele apuntar arriba y el mercado subió, este control acierta LO MISMO.
function controlD(filas, nombre, semilla) {
  const rnd = rng(semilla);
  const signos = filas.map((d) => Math.sign(d.imanes[nombre] - d.ap)).filter((s) => s !== 0);
  let realDir = 0, conDir = 0;
  for (const d of filas) { const r = desenlaces(d, d.imanes[nombre]); if (r.direcc != null) { conDir++; realDir += r.direcc; } }
  const nube = [];
  for (let s = 0; s < SORTEOS; s++) {
    let ac = 0, nd = 0;
    for (const d of filas) {
      const sC = Math.sign(d.ci - d.ap); if (sC === 0) continue;
      const sL = signos[Math.floor(rnd() * signos.length)];
      nd++; if (sL === sC) ac++;
    }
    nube.push(100 * ac / nd);
  }
  const real = 100 * realDir / conDir;
  return { real, azar: media(nube), pctil: percentilEnNube(real, nube), sdAzar: sd(nube), n: conDir };
}

// ═══ MEDIDA ════════════════════════════════════════════════════════════════════════════════
console.log(`\n## 1 · ACERCAMIENTO — control A (misma distancia, lado al azar) y controles B'/C' con la ESCALA ARREGLADA`);
console.log(`\n   ${"imán".padEnd(16)} ${"ventaja".padStart(8)} ${"t".padStart(6)} ${"tNorm".padStart(6)} ${"pctilA".padStart(7)} │ ${"pctilB'".padStart(8)} ${"pctilC'".padStart(8)} │ ${"gana%".padStart(7)}`);
const RES = {};
let sem = 20260821;
for (const [nombre] of IMANES) {
  const a = controlA(D, nombre, sem++);
  const b = controlBprima(D, nombre, sem++);
  const c = controlCprima(D, nombre, sem++);
  RES[nombre] = { A: a, B: b, C: c };
  console.log(`   ${nombre.padEnd(16)} ${a.ventajaPts.toFixed(2).padStart(8)} ${a.tAcerc.toFixed(2).padStart(6)} ${a.tAcercN.toFixed(2).padStart(6)} ${String(a.acercPctil).padStart(7)} │ ` +
    `${String(b.acercPctil).padStart(8)} ${String(c.acercPctil).padStart(8)} │ ${a.ganaPct.toFixed(1).padStart(7)}`);
}
console.log(`   gana% = días en que el cierre queda más cerca del imán que del nivel al azar (50 = empate).`);
console.log(`   ANTES, con la escala rota, B y C daban percentil 99-100. Arreglada la escala, esto es lo que hay.`);

console.log(`\n## 2 · TOQUE y FIJACIÓN — con t PAREADA (la binomial subestimaba)`);
console.log(`\n   ${"imán".padEnd(16)} ${"toca".padStart(7)} ${"vent".padStart(6)} ${"t".padStart(6)} │ ${"±5pt".padStart(6)} ${"vent".padStart(6)} ${"t".padStart(6)} │ ${"±10pt".padStart(6)} ${"vent".padStart(6)} ${"t".padStart(6)}`);
for (const [nombre] of IMANES) {
  const a = RES[nombre].A;
  console.log(`   ${nombre.padEnd(16)} ${(a.toquePct.toFixed(1) + "%").padStart(7)} ${a.toqueVentaja.toFixed(1).padStart(6)} ${a.tToque.toFixed(2).padStart(6)} │ ` +
    `${(a.fija5Pct.toFixed(1) + "%").padStart(6)} ${a.fija5Ventaja.toFixed(1).padStart(6)} ${a.tFija5.toFixed(2).padStart(6)} │ ` +
    `${(a.fija10Pct.toFixed(1) + "%").padStart(6)} ${a.fija10Ventaja.toFixed(1).padStart(6)} ${a.tFija10.toFixed(2).padStart(6)}`);
}
console.log(`   vent = puntos porcentuales POR ENCIMA del nivel al azar a la misma distancia. Negativo = el precio lo evita.`);

console.log(`\n## 3 · DIRECCIÓN — contra el azar (A) y contra la DERIVA (D)`);
console.log(`\n   ${"imán".padEnd(16)} ${"acierto".padStart(8)} │ ${"D: azar".padStart(8)} ${"±sd".padStart(6)} ${"pctil".padStart(6)} ${"ventaja".padStart(8)} ${"z".padStart(6)}`);
for (const [nombre] of IMANES) {
  const a = RES[nombre].A;
  const d = controlD(D, nombre, sem++);
  RES[nombre].D = d;
  const z = (d.real - d.azar) / d.sdAzar;
  RES[nombre].dirZ = z;
  console.log(`   ${nombre.padEnd(16)} ${(a.dirPct.toFixed(1) + "%").padStart(8)} │ ${(d.azar.toFixed(1) + "%").padStart(8)} ${d.sdAzar.toFixed(2).padStart(6)} ${String(d.pctil).padStart(6)} ${(d.real - d.azar).toFixed(1).padStart(8)} ${z.toFixed(2).padStart(6)}`);
}
console.log(`   D conserva el sesgo de lado del imán Y la deriva del mercado: sólo rompe el emparejamiento día-a-día.`);

// ═══ EL CANDIDATO: gamD.imanNeto en dirección ═══════════════════════════════════════════════
console.log(`\n## 4 · EL ÚNICO CON PULSO — gamD.imanNeto en DIRECCIÓN, apretado`);
const CAND = "gamD.imanNeto";
const bloques = [
  ["2022", D.filter((d) => d.ano === 2022)], ["2023", D.filter((d) => d.ano === 2023)],
  ["2024", D.filter((d) => d.ano === 2024)], ["2025", D.filter((d) => d.ano === 2025)],
  ["2026", D.filter((d) => d.ano === 2026)],
  ["22-23", MITAD_A], ["24-26", MITAD_B],
  ["γ>0", D.filter((d) => d.netPunto > 0)], ["γ<0", D.filter((d) => d.netPunto < 0)],
];
console.log(`\n   ${"bloque".padEnd(8)} ${"n".padStart(5)} ${"acierto".padStart(8)} ${"deriva".padStart(8)} ${"ventaja".padStart(8)} ${"z".padStart(6)}`);
const detalleCand = [];
for (const [et, g] of bloques) {
  if (g.length < 40) { console.log(`   ${et.padEnd(8)} ${String(g.length).padStart(5)}   (muestra corta, no se mide)`); continue; }
  const d = controlD(g, CAND, sem++);
  const z = (d.real - d.azar) / d.sdAzar;
  detalleCand.push({ bloque: et, n: g.length, acierto: +d.real.toFixed(1), deriva: +d.azar.toFixed(1), ventaja: +(d.real - d.azar).toFixed(1), z: +z.toFixed(2) });
  console.log(`   ${et.padEnd(8)} ${String(g.length).padStart(5)} ${(d.real.toFixed(1) + "%").padStart(8)} ${(d.azar.toFixed(1) + "%").padStart(8)} ${(d.real - d.azar).toFixed(1).padStart(8)} ${z.toFixed(2).padStart(6)}`);
}
const anos = detalleCand.filter((x) => x.bloque.length === 4);
console.log(`\n   Años con ventaja positiva: ${anos.filter((x) => x.ventaja > 0).length} de ${anos.length}`);
console.log(`   Rango de la ventaja año a año: ${Math.min(...anos.map((x) => x.ventaja)).toFixed(1)} a ${Math.max(...anos.map((x) => x.ventaja)).toFixed(1)} puntos porcentuales`);

// ¿y si el acierto direccional se traduce en TAMAÑO? el lado sólo vale si el día se mueve.
console.log(`\n## 5 · ¿EL LADO ACERTADO TRAE MOVIMIENTO? (si acierta el lado en días planos, no vale nada)`);
const acer = [], falla = [];
for (const d of D) {
  const r = desenlaces(d, d.imanes[CAND]); if (r.direcc == null) continue;
  const movN = Math.abs(d.ci - d.ap) / d.straddlePts;
  (r.direcc ? acer : falla).push(movN);
}
console.log(`   días con el lado ACERTADO: n=${acer.length} · |mov|/straddle mediano ${mediana(acer).toFixed(3)} · medio ${media(acer).toFixed(3)}`);
console.log(`   días con el lado FALLADO : n=${falla.length} · |mov|/straddle mediano ${mediana(falla).toFixed(3)} · medio ${media(falla).toFixed(3)}`);
// esperanza direccional cruda: (+mov si acierta, −mov si falla), en unidades de straddle
const esperanza = [];
for (const d of D) {
  const L = d.imanes[CAND], sL = Math.sign(L - d.ap); if (sL === 0) continue;
  esperanza.push(sL * (d.ci - d.ap) / d.straddlePts);
}
const tE = tPareada(esperanza);
console.log(`\n   Esperanza de seguir al imán (largo si está arriba, corto si abajo), en straddles por día:`);
console.log(`      media ${tE.m.toFixed(4)} · t=${tE.t.toFixed(2)} · n=${tE.n} · mediana ${mediana(esperanza).toFixed(4)}`);
console.log(`      en PUNTOS de SPX por día: ${media(D.map((d) => { const sL = Math.sign(d.imanes[CAND] - d.ap); return sL * (d.ci - d.ap); })).toFixed(2)}`);
const espPts = D.map((d) => { const sL = Math.sign(d.imanes[CAND] - d.ap) || 0; return sL * (d.ci - d.ap); }).filter((x) => x !== 0);
const tEP = tPareada(espPts);
console.log(`      t de esa media en puntos: ${tEP.t.toFixed(2)} (n=${tEP.n})`);

// mismo, por mitades
for (const [et, g] of [["22-23", MITAD_A], ["24-26", MITAD_B]]) {
  const e = g.map((d) => { const sL = Math.sign(d.imanes[CAND] - d.ap) || 0; return sL * (d.ci - d.ap) / d.straddlePts; }).filter((x) => x !== 0);
  const t = tPareada(e);
  console.log(`      ${et}: media ${t.m.toFixed(4)} straddles/día · t=${t.t.toFixed(2)} · n=${t.n}`);
}
// y la deriva pura, para comparar: comprar y aguantar de 09:35 al cierre
const derivaPts = D.map((d) => d.ci - d.ap);
const tD = tPareada(derivaPts);
console.log(`\n   COMPARACIÓN — comprar el índice a las 09:35 y cerrar al final, sin mirar nada:`);
console.log(`      media ${tD.m.toFixed(2)} pts/día · t=${tD.t.toFixed(2)} · n=${tD.n}`);

console.log(`\n${"═".repeat(95)}`);
console.log(`## 6 · VEREDICTO`);
console.log("═".repeat(95));
for (const [nombre] of IMANES) {
  const r = RES[nombre];
  const pasa = Math.abs(r.A.tAcerc) >= LISTON || Math.abs(r.A.tFija5) >= LISTON || Math.abs(r.dirZ) >= LISTON;
  console.log(`   ${nombre.padEnd(16)} acerc t=${r.A.tAcerc.toFixed(2).padStart(6)} · fija±5 t=${r.A.tFija5.toFixed(2).padStart(6)} · dir z=${r.dirZ.toFixed(2).padStart(6)}  →  ${pasa ? "**PASA**" : "no pasa"}`);
}

writeFileSync(SALIDA, JSON.stringify({ generado: new Date().toISOString(), dias: D.length, liston: LISTON,
  sorteos: SORTEOS, subioPct: +subioPct.toFixed(1), resultados: RES, candidato: CAND, detalleCand,
  derivaPtsDia: +tD.m.toFixed(2), derivaT: +tD.t.toFixed(2) }, null, 1));
console.log(`\n   → ${SALIDA}\n`);
