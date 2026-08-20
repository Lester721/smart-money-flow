// REFUTACIÓN 3 · EL COJÍN, no la racha en dólares planos.
//
// El informe optimiza la PEOR RACHA en dólares sobre una serie de 1 contrato fijo. Pero la cuenta
// CRECE: una racha de −$15.176 que llega cuando la caja vale $50.000 duele menos que una de
// −$10.455 que llega cuando vale $12.000. Lo que Lester siente es (a) cuánto se acerca la caja a
// cero y (b) qué % del pico se lleva la racha. Aquí se miden las dos, y se cuenta el dinero que
// de verdad queda en la cuenta arrancando en cada uno de los 653 días.
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { media, pct, eur, drawdown } from "./anatomia3-lib.mjs";

const DIR = "scripts/cache-theta/gex-2026";
const SEP = 25, COMM = 0.03;
const VARIANTES = [["11:00", 50], ["13:00", 50], ["13:45", 50], ["14:30", 50], ["11:00", 30], ["13:45", 30]];
const HORAS = [...new Set(VARIANTES.map((v) => v[0]))];
const ALAS = [...new Set(VARIANTES.map((v) => v[1]))];
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

const series = new Map(VARIANTES.map(([h,a]) => [`${h}|${a}`, []]));
for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P || !(C.cierre > 0)) continue;
  const S = C.cierre;
  for (const h of HORAS) {
    const fc = C.filas.get(h), fp = P.filas.get(h), spot = C.spots.get(h);
    if (!fc || !fp || !(spot > 0)) continue;
    const cC = cerca(fc, spot + SEP), pC = cerca(fp, spot - SEP);
    for (const ALA of ALAS) {
      if (!series.has(`${h}|${ALA}`)) continue;
      const cL = cerca(fc, cC.K + ALA), pL = cerca(fp, pC.K - ALA);
      if (cL.K <= cC.K || pL.K >= pC.K) continue;
      const credito = cC.bid + pC.bid - cL.ask - pL.ask;
      if (!(credito > 0)) continue;
      const anchoC = cL.K - cC.K, anchoP = pC.K - pL.K;
      const perdC = Math.min(Math.max(S - cC.K, 0), anchoC);
      const perdP = Math.min(Math.max(pC.K - S, 0), anchoP);
      series.get(`${h}|${ALA}`).push({ fecha, pl: (credito - perdC - perdP) * 100 - 8 * COMM,
        colateral: (Math.max(anchoC, anchoP) - credito) * 100 });
    }
  }
}

/** Caja con 1 contrato: si no hay efectivo para el colateral, ese dia no se opera. */
function caja(v, desde = 0) {
  const s = [...v].sort((a,b)=>a.fecha.localeCompare(b.fecha)).slice(desde);
  let c = CAJA0, pico = CAJA0, minC = CAJA0, ddRel = 0, ddAbs = 0;
  for (const d of s) {
    if (c < d.colateral) continue;
    c += d.pl;
    if (c > pico) pico = c;
    if (c < minC) minC = c;
    const caida = pico - c;
    if (caida > ddAbs) ddAbs = caida;
    if (caida / pico > ddRel) ddRel = caida / pico;
  }
  return { final: c, minC, ddAbs, ddRel, n: s.length };
}

console.log("=".repeat(112));
console.log(`REFUTACION 3 · EL COJIN · caja inicial $${CAJA0.toLocaleString("es-ES")}`);
console.log("=".repeat(112));

console.log("\n-- A · LA RACHA COMO LA VIVE LA CUENTA (arrancando el 2024-01-02) -----------------------------");
console.log("\n| variante | caja final | caja MINIMA (el cojin) | racha en $ sobre la cuenta | racha en % del pico |");
console.log("|---|---|---|---|---|");
const A = {};
for (const [h,a] of VARIANTES) {
  const r = caja(series.get(`${h}|${a}`)); A[`${h}|${a}`] = r;
  console.log(`| ${h} ala ${a}${h==="11:00"&&a===50?" <-- hoy":""} | ${eur(r.final)} | ${eur(r.minC)} | ${eur(-r.ddAbs)} | ${(r.ddRel*100).toFixed(0)}% |`);
}
const b = A["11:00|50"], t = A["13:45|50"];
console.log(`\n  13:45 deja ${eur(t.final - b.final)} en la cuenta frente a las 11:00 y compra ${eur(t.minC - b.minC)} de cojin.`);
console.log(`  => ${((b.final - t.final) / Math.max(1, t.minC - b.minC)).toFixed(1)} $ de dinero renunciado por cada $1 de cojin ganado.`);
console.log(`  (el informe dice $0,56 por $1, midiendo la racha sobre una serie de 1 contrato que NO crece)`);

console.log("\n-- B · ARRANCANDO EN CADA DIA (>=1 año por delante). La fecha de inicio no puede decidir ------");
console.log("\n| variante | arranques | caja final mediana | p5 caja final | cojin mediano | p5 cojin | racha % mediana | gana a 11:00 ala 50 en |");
console.log("|---|---|---|---|---|---|---|---|");
const porArranque = {};
for (const [h,a] of VARIANTES) {
  const v = series.get(`${h}|${a}`);
  const out = [];
  for (let i = 0; i + 250 < v.length; i++) out.push(caja(v, i));
  porArranque[`${h}|${a}`] = out;
}
const base = porArranque["11:00|50"];
for (const [h,a] of VARIANTES) {
  const o = porArranque[`${h}|${a}`];
  const fin = o.map((x)=>x.final), coj = o.map((x)=>x.minC), rel = o.map((x)=>x.ddRel);
  const k = Math.min(o.length, base.length);
  const gana = o.slice(0,k).filter((x,i)=>x.final > base[i].final).length / k;
  console.log(`| ${h} ala ${a} | ${o.length} | ${eur(pct(fin,0.5))} | ${eur(pct(fin,0.05))} | ${eur(pct(coj,0.5))} | ${eur(pct(coj,0.05))} | ${(pct(rel,0.5)*100).toFixed(0)}% | ${(gana*100).toFixed(0)}% de los arranques |`);
}

console.log("\n-- C · ¿Y SI SE COMPARAN A IGUAL COJIN? (lo que Lester puede tocar de verdad: el ANCHO) -------");
console.log("\n  Lo unico que Lester puede ajustar con 1 contrato es el ancho del ala. Si el objetivo es");
console.log("  cortar la cola, hay que comparar 13:45 ala 50 contra 11:00 con el ala estrechada al mismo");
console.log("  colateral, no contra 11:00 ala 50.\n");
console.log("| variante | colateral med | $/ano (1 contrato, sin caja) | peor dia | caja final | cojin |");
console.log("|---|---|---|---|---|---|");
for (const [h,a] of VARIANTES) {
  const v = series.get(`${h}|${a}`);
  const pls = v.map((x)=>x.pl);
  const r = A[`${h}|${a}`];
  console.log(`| ${h} ala ${a} | ${eur(pct(v.map((x)=>x.colateral),0.5))} | ${eur(media(pls)*251)} | ${eur(Math.min(...pls))} | ${eur(r.final)} | ${eur(r.minC)} |`);
}

writeFileSync("scripts/refuta-hora-cojin.json", JSON.stringify({ caja0: CAJA0, desde2024: A,
  arranques: Object.fromEntries(Object.entries(porArranque).map(([k,o]) => [k, {
    n: o.length, finMed: pct(o.map((x)=>x.final),0.5), finP5: pct(o.map((x)=>x.final),0.05),
    cojMed: pct(o.map((x)=>x.minC),0.5), cojP5: pct(o.map((x)=>x.minC),0.05),
    ddRelMed: pct(o.map((x)=>x.ddRel),0.5) }])) }, null, 2));
console.log("\n-> scripts/refuta-hora-cojin.json");
