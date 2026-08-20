// REFUTACIÓN 2 · LA CAJA DE VERDAD. $7.977 de efectivo libre, cuenta de margen de $56.389.
//
// Ni el barrido de la hora ni ningún filtro anterior ha simulado la CAJA. En Robinhood el
// colateral de un cóndor de 50 puntos son (ancho − crédito) × 100 y se RETIENE en efectivo.
// Si el efectivo no llega, ese día NO SE OPERA. Un día de pérdida máxima deja el efectivo por
// debajo del colateral del día siguiente, así que la estrategia se apaga sola y vuelve cuando
// las ganancias la reconstruyen. Eso es lo que Lester va a vivir, y nadie lo ha medido.
//
// Se comparan, con la MISMA caja inicial:
//   · 11:00 ala 50 (lo de hoy)      · 13:45 ala 50 (el hallazgo)
//   · 11:00 ala 30 (bajar tamaño sin cambiar de hora — la alternativa que el informe descarta)
//   · 13:45 ala 30
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { media, pct, eur, drawdown } from "./anatomia3-lib.mjs";

const DIR = "scripts/cache-theta/gex-2026";
const SEP = 25, COMM = 0.03;
const HORAS = ["11:00", "13:00", "13:45", "14:30"];
const ALAS = [50, 30];
const CAJA0 = 7977;

function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").split("\n");
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const iK = cab.indexOf("strike"), iT = cab.indexOf("timestamp"), iB = cab.indexOf("bid");
  const iA = cab.indexOf("ask"), iU = cab.indexOf("underlying_price");
  if ([iK,iT,iB,iA,iU].some((x) => x < 0)) throw new Error("faltan columnas en " + f);
  const set = new Set(HORAS), filas = new Map(), spots = new Map();
  let cierre = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const L = lin[j]; if (L.length < 20) continue;
    const c = L.split(",");
    const h = c[iT].slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && h >= hFin) { hFin = h; cierre = sp; }
    if (!set.has(h)) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (!(K > 0) || !(ask > 0) || !(bid >= 0)) continue;
    if (!filas.has(h)) filas.set(h, []);
    filas.get(h).push({ K, bid, ask });
    if (sp > 0) spots.set(h, sp);
  }
  return { filas, spots, cierre };
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));
const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();

const series = new Map();               // "hora|ala" -> [{fecha, pl, colateral}]
for (const h of HORAS) for (const a of ALAS) series.set(`${h}|${a}`, []);

for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P || !(C.cierre > 0)) continue;
  const S = C.cierre;
  for (const h of HORAS) {
    const fc = C.filas.get(h), fp = P.filas.get(h), spot = C.spots.get(h);
    if (!fc || !fp || !(spot > 0)) continue;
    const cC = cerca(fc, spot + SEP), pC = cerca(fp, spot - SEP);
    for (const ALA of ALAS) {
      const cL = cerca(fc, cC.K + ALA), pL = cerca(fp, pC.K - ALA);
      if (cL.K <= cC.K || pL.K >= pC.K) continue;
      const credito = cC.bid + pC.bid - cL.ask - pL.ask;
      if (!(credito > 0)) continue;
      const anchoC = cL.K - cC.K, anchoP = pC.K - pL.K;
      const perdC = Math.min(Math.max(S - cC.K, 0), anchoC);
      const perdP = Math.min(Math.max(pC.K - S, 0), anchoP);
      series.get(`${h}|${ALA}`).push({
        fecha, pl: (credito - perdC - perdP) * 100 - 8 * COMM,
        colateral: (Math.max(anchoC, anchoP) - credito) * 100,
      });
    }
  }
}

/** Simula la caja: cada dia hay que poder retener el colateral o no se opera. */
function simular(v, caja0, nMax = 1) {
  const s = [...v].sort((a,b)=>a.fecha.localeCompare(b.fecha));
  let caja = caja0, saltados = 0, operados = 0, minCaja = caja0, quiebra = null;
  const curva = [];
  for (const d of s) {
    const n = Math.min(nMax, Math.floor(caja / d.colateral));
    if (n < 1) { saltados++; curva.push(caja); continue; }
    caja += n * d.pl; operados++;
    if (caja < minCaja) minCaja = caja;
    if (caja <= 0 && !quiebra) quiebra = d.fecha;
    curva.push(caja);
  }
  const anos = s.length / 251;
  return { operados, saltados, caja, minCaja, quiebra, anos,
           alAno: (caja - caja0) / anos, dd: drawdown(curva.map((c,i)=> i ? c - curva[i-1] : c - caja0)),
           colMed: pct(s.map((x)=>x.colateral), 0.5) };
}

console.log("=".repeat(112));
console.log(`REFUTACION 2 · LA CAJA · efectivo inicial $${CAJA0.toLocaleString("es-ES")} · ${fechas.length} dias`);
console.log("=".repeat(112));

console.log("\n-- A · 1 CONTRATO, EFECTIVO REAL: dias que la caja NO deja operar ------------------------------");
console.log("\n| variante | colateral med | dias operados | dias SALTADOS por falta de caja | caja final | caja minima | $/ano efectivos | quiebra |");
console.log("|---|---|---|---|---|---|---|---|");
const res = {};
for (const h of HORAS) for (const a of ALAS) {
  const v = series.get(`${h}|${a}`); if (v.length < 100) continue;
  const r = simular(v, CAJA0, 1);
  res[`${h}|${a}`] = r;
  console.log(`| ${h} ala ${a}${h==="11:00"&&a===50?" <-- hoy":""} | ${eur(r.colMed)} | ${r.operados} | ${r.saltados} | ${eur(r.caja)} | ${eur(r.minCaja)} | ${eur(r.alAno)} | ${r.quiebra || "no"} |`);
}

console.log("\n-- B · SIN LA RESTRICCION DE CAJA (colateral infinito) para ver cuanto cuesta la caja ----------");
console.log("\n| variante | $/ano sin restriccion | $/ano con la caja de $7.977 | lo que se come la caja |");
console.log("|---|---|---|---|");
for (const h of HORAS) for (const a of ALAS) {
  const v = series.get(`${h}|${a}`); if (v.length < 100) continue;
  const libre = simular(v, 1e9, 1);
  const r = res[`${h}|${a}`];
  console.log(`| ${h} ala ${a} | ${eur(libre.alAno)} | ${eur(r.alAno)} | ${eur(r.alAno - libre.alAno)} |`);
}

console.log("\n-- C · ARRANCANDO EN CADA UNO DE LOS 653 DIAS (la fecha de inicio no puede decidir) -----------");
console.log("\n| variante | % de arranques que NO quiebran | peor caja minima | mediana caja final | % arranques con caja final > inicial |");
console.log("|---|---|---|---|---|");
const arranques = {};
for (const h of HORAS) for (const a of ALAS) {
  const v = [...series.get(`${h}|${a}`)].sort((x,y)=>x.fecha.localeCompare(y.fecha));
  if (v.length < 100) continue;
  const finales = [], minimos = []; let vivos = 0, gana = 0, n = 0;
  for (let i = 0; i + 250 < v.length; i++) {         // ventanas de al menos un año
    const r = simular(v.slice(i), CAJA0, 1);
    n++; if (!r.quiebra) vivos++; if (r.caja > CAJA0) gana++;
    finales.push(r.caja); minimos.push(r.minCaja);
  }
  arranques[`${h}|${a}`] = { n, vivos: vivos/n, gana: gana/n, peorMin: Math.min(...minimos), medFinal: pct(finales, 0.5) };
  const A = arranques[`${h}|${a}`];
  console.log(`| ${h} ala ${a} | ${(A.vivos*100).toFixed(0)}% | ${eur(A.peorMin)} | ${eur(A.medFinal)} | ${(A.gana*100).toFixed(0)}% |`);
}

console.log("\n-- D · EL DIA DESPUES DE UNA PERDIDA MAXIMA: ¿puede volver a operar? --------------------------");
console.log("\n| variante | dias de perdida > $3.000 | veces que el dia siguiente NO puede operar | dias apagado de media tras el golpe |");
console.log("|---|---|---|---|");
for (const h of HORAS) for (const a of ALAS) {
  const v = [...series.get(`${h}|${a}`)].sort((x,y)=>x.fecha.localeCompare(y.fecha));
  if (v.length < 100) continue;
  let caja = CAJA0, golpes = 0, bloqueos = 0, apagados = 0, contando = 0;
  for (let i = 0; i < v.length; i++) {
    const d = v[i];
    if (caja < d.colateral) { apagados++; contando++; continue; }
    caja += d.pl;
    if (d.pl < -3000) { golpes++; const sig = v[i+1]; if (sig && caja < sig.colateral) bloqueos++; }
  }
  console.log(`| ${h} ala ${a} | ${golpes} | ${bloqueos} | ${golpes ? (apagados/golpes).toFixed(1) : "—"} |`);
}

writeFileSync("scripts/refuta-hora-caja.json", JSON.stringify({ caja0: CAJA0, res, arranques }, null, 2));
console.log("\n-> scripts/refuta-hora-caja.json");
