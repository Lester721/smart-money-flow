// ESTRUCTURA 2 · EL TECHO — cuánto queda por ganar si el ala se estrechara SOLO cuando toca.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/estructura2-techo.mjs
//
// De dónde sale esto. estructura2-asimetria.mjs midió 27 formas: ninguna mejora la cola a igual
// ingreso. estructura2-mecanismo.mjs explicó por qué: estrechar el ala recorta el crédito y el
// daño CASI EN LA MISMA PROPORCION, porque el mercado cobra el ala a precio justo.
//
// Pero también encontró dónde vive la caída: de los -$15.176 de peor racha, -$11.846 (78%) son
// TRES días, los tres de TOPE por el lado PUT, los tres en cinco semanas de 2025. Eso cambia la
// pregunta. La geometría FIJA es un mal negocio porque paga el ala estrecha los 653 días. Una
// geometría CONDICIONAL la pagaría sólo los días que hacen falta.
//
// Aquí NO se propone ninguna señal. Se mide el TECHO: qué daría un oráculo con visión perfecta.
// Es la cota superior de lo que cualquier señal podría cobrar. Si el techo es bajo, no hay nada
// que buscar y se cierra la línea. Si es alto, dice cuánta precisión hace falta.
//
// ⚠️⚠️ EL ORACULO MIRA AL FUTURO A PROPOSITO. NO ES UNA ESTRATEGIA Y NO SE PUEDE OPERAR.
//    Es un presupuesto: el número que ninguna señal real puede superar.

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";

const DIR = "scripts/cache-theta/gex-2026", HORA = "11:00", COMM = 0.03;

function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const [iK, iT, iB, iA, iU] = ["strike", "timestamp", "bid", "ask", "underlying_price"].map((c) => cab.indexOf(c));
  if ([iK, iT, iB, iA, iU].some((x) => x < 0)) throw new Error(`faltan columnas en ${f}`);
  const enHora = []; let spotFin = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(","), hora = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && hora >= hFin) { hFin = hora; spotFin = sp; }
    if (hora !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask, spot: sp });
  }
  return enHora.length ? { filas: enHora, cierre: spotFin } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));
const suma = (a) => a.reduce((x, y) => x + y, 0);
const media = (a) => (a.length ? suma(a) / a.length : NaN);
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))]; };
const eur = (x) => (x < 0 ? "-$" : "$") + Math.round(Math.abs(x)).toLocaleString("es-ES");
function dd(pls) { let ac = 0, p = 0, w = 0; for (const x of pls) { ac += x; p = Math.max(p, ac); w = Math.min(w, ac - p); } return w; }
function resumen(pls) {
  return { alAno: suma(pls) / (pls.length / 252), peorDia: Math.min(...pls), p1: pct(pls, 0.01), p5: pct(pls, 0.05), dd: dd(pls),
    acierto: pls.filter((x) => x > 0).length / pls.length };
}

function condor(fC, fP, spot, S, aC, aP) {
  const cc = cerca(fC, spot + 25), cl = cerca(fC, cc.K + aC);
  const pc = cerca(fP, spot - 25), pl = cerca(fP, pc.K - aP);
  if (cl.K <= cc.K || pl.K >= pc.K) return null;
  const anchoC = cl.K - cc.K, anchoP = pc.K - pl.K;
  const credito = cc.bid + pc.bid - cl.ask - pl.ask;
  const danoCall = Math.min(Math.max(S - cc.K, 0), anchoC), danoPut = Math.min(Math.max(pc.K - S, 0), anchoP);
  return { credito: credito * 100, danoCall: danoCall * 100, danoPut: danoPut * 100,
    pl: (credito - danoCall - danoPut) * 100 - 8 * COMM,
    topePut: danoPut >= anchoP - 1e-9 && danoPut > 0, colateral: (Math.max(anchoC, anchoP) - credito) * 100 };
}

const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();
const dat = [];
for (const f of fechas) {
  const C = leerDia(f, "C"), P = leerDia(f, "P");
  if (!C || !P || !(C.cierre > 0)) continue;
  const spot = C.filas[0].spot; if (!(spot > 0)) continue;
  const ancha = condor(C.filas, P.filas, spot, C.cierre, 50, 50);
  const estrecha = condor(C.filas, P.filas, spot, C.cierre, 50, 25);   // sólo la PUT estrecha
  if (!ancha || !estrecha || !(ancha.credito > 0) || !(estrecha.credito > 0)) continue;
  dat.push({ fecha: f, spot, cierre: C.cierre, ancha, estrecha, caida: C.cierre - spot });
}
console.log(`\n═══ EL TECHO · ${dat.length} días · ${dat[0].fecha} -> ${dat[dat.length - 1].fecha} ═══`);
radiografia(dat.map((d) => ({ plA: d.ancha.pl, plE: d.estrecha.pl, credA: d.ancha.credito, credE: d.estrecha.credito, caida: d.caida })),
  ["plA", "plE", "credA", "credE", "caida"], "ancha vs estrecha");

const A = dat.map((d) => d.ancha.pl), E = dat.map((d) => d.estrecha.pl);
const rA = resumen(A), rE = resumen(E);

// ═════════════════════════════════════════════════════════════════════════════════════════
// 1 · LA PROPORCIONALIDAD — el número que explica el "no"
// ═════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n═══ 1 · POR QUE NO SE PUEDE COMPRAR COLA BARATA: crédito y daño caen a la vez ═══\n`);
console.log("| ala de la put | crédito cobrado (total) | daño pagado (total) | P&L neto | crédito perdido | daño evitado | evitado / perdido |");
console.log("|---|---|---|---|---|---|---|");
const credA = suma(dat.map((d) => d.ancha.credito)), danA = suma(dat.map((d) => d.ancha.danoCall + d.ancha.danoPut));
for (const [nom, k] of [["50 (la de hoy)", "ancha"], ["25", "estrecha"]]) {
  const cr = suma(dat.map((d) => d[k].credito)), da = suma(dat.map((d) => d[k].danoCall + d[k].danoPut));
  const pl = suma(dat.map((d) => d[k].pl));
  const perdC = credA - cr, evitD = danA - da;
  console.log(`| ${nom} | ${eur(cr)} | ${eur(-da)} | ${eur(pl)} | ${perdC ? eur(perdC) : "-"} | ${evitD ? eur(evitD) : "-"} | ${perdC ? (evitD / perdC).toFixed(2) : "-"} |`);
}
console.log(`\nLa razón "daño evitado / crédito perdido" es la que decide. Por encima de 1 el ala estrecha`);
console.log(`sería un regalo; por debajo de 1, un peaje. El mercado la deja donde tiene que estar.`);

// ═════════════════════════════════════════════════════════════════════════════════════════
// 2 · EL ORACULO — estrechar la put SOLO los días que van a topar
// ═════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n═══ 2 · EL TECHO: ORACULO CON VISION PERFECTA (⚠️ MIRA AL FUTURO, NO ES OPERABLE) ═══\n`);
const idxTope = dat.map((d, i) => (d.ancha.topePut ? i : -1)).filter((i) => i >= 0);
console.log(`Días en que la put ancha TOPA: ${idxTope.length} de ${dat.length} (${((idxTope.length / dat.length) * 100).toFixed(1)}%)`);
const oraculo = dat.map((d) => (d.ancha.topePut ? d.estrecha.pl : d.ancha.pl));
const rO = resumen(oraculo);
console.log(`\n| estrategia | $/año | peor día | p1 | p5 | caída | acierto |`);
console.log("|---|---|---|---|---|---|---|");
console.log(`| BASE (put ancha siempre) | ${eur(rA.alAno)} | ${eur(rA.peorDia)} | ${eur(rA.p1)} | ${eur(rA.p5)} | ${eur(rA.dd)} | ${(rA.acierto * 100).toFixed(0)}% |`);
console.log(`| put estrecha SIEMPRE | ${eur(rE.alAno)} | ${eur(rE.peorDia)} | ${eur(rE.p1)} | ${eur(rE.p5)} | ${eur(rE.dd)} | ${(rE.acierto * 100).toFixed(0)}% |`);
console.log(`| ORACULO (estrecha sólo los ${idxTope.length} días de tope) | ${eur(rO.alAno)} | ${eur(rO.peorDia)} | ${eur(rO.p1)} | ${eur(rO.p5)} | ${eur(rO.dd)} | ${(rO.acierto * 100).toFixed(0)}% |`);
const ddElimO = Math.abs(rA.dd) - Math.abs(rO.dd), perdO = rA.alAno - rO.alAno;
console.log(`\nEl oráculo ${perdO <= 0 ? "GANA" : "pierde"} ${eur(Math.abs(perdO))}/año y elimina ${eur(ddElimO)} de caída.`);
console.log(`Ratio del oráculo: ${ddElimO > 0 ? (perdO / ddElimO).toFixed(2) : "-"} $/año por $ de caída (el listón de la familia es 0,30).`);

// ═════════════════════════════════════════════════════════════════════════════════════════
// 3 · ¿CUANTA PUNTERIA HACE FALTA? — el oráculo se degrada con ruido
//     Se simula una señal que acierta el `r` % de los días de tope y además dispara en falso
//     sobre el `q` % de los días normales. Es la cuenta que decide si vale la pena buscarla.
// ═════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n═══ 3 · CUANTA PUNTERIA HARIA FALTA (media de 400 sorteos por casilla) ═══\n`);
console.log(`Cada casilla: $/año de la estrategia condicional. La base da ${eur(rA.alAno)}/año con caída ${eur(rA.dd)}.\n`);
const setTope = new Set(idxTope);
const normales = dat.map((_, i) => i).filter((i) => !setTope.has(i));
const RECALLS = [1.0, 0.67, 0.33], FALSOS = [0, 0.02, 0.05, 0.10, 0.25, 0.50, 1.0];
console.log("| capta de los días de tope | " + FALSOS.map((q) => `falsos ${(q * 100).toFixed(0)}%`).join(" | ") + " |");
console.log("|---" + FALSOS.map(() => "|---").join("") + "|");
const rejilla = [];
for (const r of RECALLS) {
  const celdas = [];
  for (const q of FALSOS) {
    let sAn = 0, sDD = 0;
    for (let it = 0; it < 400; it++) {
      const usa = new Set();
      for (const i of idxTope) if (Math.random() < r) usa.add(i);
      for (const i of normales) if (Math.random() < q) usa.add(i);
      const pls = dat.map((d, i) => (usa.has(i) ? d.estrecha.pl : d.ancha.pl));
      sAn += suma(pls) / (pls.length / 252); sDD += dd(pls);
    }
    const an = sAn / 400, ddm = sDD / 400;
    rejilla.push({ recall: r, falsos: q, alAno: an, dd: ddm });
    celdas.push(`${eur(an)} / ${eur(ddm)}`);
  }
  console.log(`| ${(r * 100).toFixed(0)}% | ${celdas.join(" | ")} |`);
}
console.log(`\n(cada casilla es "$/año / caída")`);

// ═════════════════════════════════════════════════════════════════════════════════════════
// 4 · EL PRESUPUESTO: cuánto cuesta estrechar la put UN día cualquiera
// ═════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n═══ 4 · EL PRESUPUESTO DE LA SEÑAL ═══\n`);
const costeDiaNormal = media(normales.map((i) => A[i] - E[i]));
const ahorroDiaTope = media(idxTope.map((i) => E[i] - A[i]));
console.log(`Estrechar la put un día NORMAL cuesta ${eur(costeDiaNormal)} de media (${normales.length} días).`);
console.log(`Estrechar la put un día de TOPE ahorra ${eur(ahorroDiaTope)} de media (${idxTope.length} días).`);
console.log(`Relación ahorro/coste = ${(ahorroDiaTope / costeDiaNormal).toFixed(1)}x`);
console.log(`\n=> UMBRAL: una señal es rentable en dinero si, de cada ${Math.round(ahorroDiaTope / costeDiaNormal)} días que marca,`);
console.log(`   al menos 1 es de tope. Es decir: precisión mínima ${(100 / (ahorroDiaTope / costeDiaNormal)).toFixed(1)}%.`);
console.log(`   La tasa base es ${((idxTope.length / dat.length) * 100).toFixed(1)}%, así que la señal tiene que multiplicarla por`);
console.log(`   ${((100 / (ahorroDiaTope / costeDiaNormal)) / ((idxTope.length / dat.length) * 100)).toFixed(1)}x sólo para no perder dinero.`);

// ¿Qué pinta tienen esos días? (descriptivo, NO una señal)
console.log(`\n-- los ${idxTope.length} días de tope por la put, para quien busque la señal --`);
console.log("| fecha | spot 11:00 | cierre | caída pts | caída % | P&L ancha | P&L estrecha | ahorro |");
console.log("|---|---|---|---|---|---|---|---|");
for (const i of idxTope)
  console.log(`| ${dat[i].fecha} | ${dat[i].spot.toFixed(0)} | ${dat[i].cierre.toFixed(0)} | ${dat[i].caida.toFixed(0)} | ${((dat[i].caida / dat[i].spot) * 100).toFixed(2)}% | ${eur(A[i])} | ${eur(E[i])} | ${eur(E[i] - A[i])} |`);
const porAno = {};
for (const i of idxTope) { const a = dat[i].fecha.slice(0, 4); porAno[a] = (porAno[a] ?? 0) + 1; }
console.log(`\nReparto por año: ${Object.entries(porAno).map(([a, n]) => `${a}: ${n}`).join(" · ")}`);
const porMes = {};
for (const i of idxTope) { const m = dat[i].fecha.slice(0, 7); porMes[m] = (porMes[m] ?? 0) + 1; }
console.log(`Meses con más de uno: ${Object.entries(porMes).filter(([, n]) => n > 1).map(([m, n]) => `${m} (${n})`).join(" · ") || "ninguno"}`);

writeFileSync("scripts/estructura2-techo.json", JSON.stringify({
  n: dat.length, periodo: [dat[0].fecha, dat[dat.length - 1].fecha],
  base: rA, estrechaSiempre: rE, oraculo: rO,
  proporcionalidad: { creditoPerdido: credA - suma(dat.map((d) => d.estrecha.credito)), danoEvitado: danA - suma(dat.map((d) => d.estrecha.danoCall + d.estrecha.danoPut)) },
  diasTope: idxTope.map((i) => ({ fecha: dat[i].fecha, caidaPts: dat[i].caida, plAncha: A[i], plEstrecha: E[i] })),
  presupuesto: { costeDiaNormal, ahorroDiaTope, ratio: ahorroDiaTope / costeDiaNormal, precisionMinima: 100 / (ahorroDiaTope / costeDiaNormal), tasaBase: (idxTope.length / dat.length) * 100 },
  rejilla,
}, null, 2));
console.log(`\n(detalle en scripts/estructura2-techo.json)`);
