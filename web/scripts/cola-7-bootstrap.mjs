// ¿ES LA CAIDA DEL ASIMETRICO UN ACCIDENTE DEL CAMINO? — bootstrap por bloques.
//
// Una caida acumulada es UNA sola realizacion: se mide una vez y no tiene error estandar. Antes de
// decir "baja la caida un 37%" hay que ver si eso sobrevive a reordenar la historia. Se remuestrean
// bloques de 10 sesiones (con reemplazo) hasta reconstruir la serie, 5.000 veces, y se mira en que
// fraccion de mundos la caida del asimetrico es menor que la del condor de hoy EN EL MISMO MUNDO.
// Los dos se evaluan sobre los MISMOS bloques: la comparacion es pareada.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { metricas, eur, media, DIAS_ANO } from "./cola-lib.mjs";
import { tWelch, listonT } from "../lib/barreraHallazgos";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00", ALA = 50, COMM = 0.03;

function leerDia(fecha, right) {
  const f = DIR + "/iv_" + fecha + "_" + right + ".csv";
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = ["strike", "timestamp", "bid", "ask", "underlying_price"].map((c) => cab.indexOf(c));
  if (idx.some((x) => x < 0)) throw new Error("faltan columnas en " + f);
  const [iK, iT, iB, iA, iU] = idx;
  const enHora = [], camino = new Map();
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    const h = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0) camino.set(h, sp);
    if (h !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask });
  }
  return enHora.length ? { filas: enHora, camino } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));
const exacto = (f, o) => { const x = cerca(f, o); return Math.abs(x.K - o) <= 5 ? x : null; };

const fechas = [...new Set(readdirSync(DIR).map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean))].sort();
const D = [];
for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P) continue;
  const horas = [...C.camino.keys()].sort();
  const cierre = C.camino.get(horas[horas.length - 1]), sp11 = C.camino.get(HORA);
  if (!(cierre > 0) || !(sp11 > 0)) continue;
  const vertical = (filas, kC, kL, esCall) => {
    const co = exacto(filas, kC), la = exacto(filas, kL);
    if (!co || !la) return null;
    const ancho = esCall ? la.K - co.K : co.K - la.K;
    if (ancho <= 0) return null;
    const cred = co.bid - la.ask;
    if (!(cred > 0)) return null;
    const intr = esCall ? Math.max(cierre - co.K, 0) : Math.max(co.K - cierre, 0);
    return (cred - Math.min(intr, ancho)) * 100 - 4 * COMM;
  };
  const c25 = vertical(C.filas, sp11 + 25, sp11 + 25 + ALA, true);
  const p25 = vertical(P.filas, sp11 - 25, sp11 - 25 - ALA, false);
  const p50 = vertical(P.filas, sp11 - 50, sp11 - 50 - ALA, false);
  if (c25 == null || p25 == null || p50 == null) continue;
  D.push({ fecha, hoy: c25 + p25, asim: c25 + p50 });
}
const N = D.length;
const hoy = D.map((d) => d.hoy), asim = D.map((d) => d.asim);
const mH = metricas(hoy, N), mA = metricas(asim, N);
console.log("## " + N + " dias · HOY " + eur(mH.anual) + "/ano caida " + eur(mH.dd) +
            "  ·  ASIM " + eur(mA.anual) + "/ano caida " + eur(mA.dd) + "\n");

// ── diferencia PAREADA de media, dia a dia ──
const dif = D.map((d) => d.asim - d.hoy);
const mDif = media(dif);
const sdDif = Math.sqrt(dif.reduce((a, x) => a + (x - mDif) ** 2, 0) / (dif.length - 1));
const tPar = mDif / (sdDif / Math.sqrt(dif.length));
console.log("## diferencia PAREADA de media (asimetrico − hoy): " + eur(mDif) + "/op · t = " + tPar.toFixed(2) +
            " · liston " + listonT(75));
console.log("   -> el asimetrico " + (mDif < 0 ? "GANA MENOS" : "gana mas") + " por operacion, y la diferencia " +
            (Math.abs(tPar) >= listonT(75) ? "SI" : "no") + " llega al liston.\n");

// ── bootstrap por bloques ──
const BLOQUE = 10, MUNDOS = 5000;
let semilla = 20260819;
const rnd = () => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla / 2147483648; };
const ddDe = (v) => { let a = 0, p = 0, d = 0; for (const x of v) { a += x; if (a > p) p = a; if (p - a > d) d = p - a; } return d; };
let mejorDD = 0, mejorRatio = 0, mejorPeor = 0;
const ddH = [], ddA = [], recorte = [];
for (let s = 0; s < MUNDOS; s++) {
  const ixs = [];
  while (ixs.length < N) { const ini = Math.floor(rnd() * (N - BLOQUE)); for (let j = 0; j < BLOQUE && ixs.length < N; j++) ixs.push(ini + j); }
  const vH = ixs.map((i) => hoy[i]), vA = ixs.map((i) => asim[i]);
  const dH = ddDe(vH), dA = ddDe(vA);
  const sH = vH.reduce((a, b) => a + b, 0), sA = vA.reduce((a, b) => a + b, 0);
  ddH.push(dH); ddA.push(dA); recorte.push(dH > 0 ? 1 - dA / dH : 0);
  if (dA < dH) mejorDD++;
  if (dA > 0 && dH > 0 && sA / dA > sH / dH) mejorRatio++;
  if (Math.min(...vA) > Math.min(...vH)) mejorPeor++;
}
const q = (v, p) => { const x = [...v].sort((a, b) => a - b); return x[Math.floor(x.length * p)]; };
console.log("## BOOTSTRAP POR BLOQUES · " + MUNDOS + " mundos de " + N + " sesiones en bloques de " + BLOQUE + "\n");
console.log("| pregunta | fraccion de mundos en que el ASIMETRICO gana |");
console.log("|---|---|");
console.log("| ¿caida MENOR? | **" + (mejorDD / MUNDOS * 100).toFixed(1) + "%** |");
console.log("| ¿ingreso/caida MAYOR? | **" + (mejorRatio / MUNDOS * 100).toFixed(1) + "%** |");
console.log("| ¿peor dia MENOS malo? | **" + (mejorPeor / MUNDOS * 100).toFixed(1) + "%** |");
console.log("\n  recorte de caida: mediana " + (q(recorte, 0.5) * 100).toFixed(0) + "% · rango 5–95% de " +
            (q(recorte, 0.05) * 100).toFixed(0) + "% a " + (q(recorte, 0.95) * 100).toFixed(0) + "%");
console.log("  caida HOY: mediana " + eur(q(ddH, 0.5)) + " · ASIM: mediana " + eur(q(ddA, 0.5)));

// ── el mecanismo, en una tabla: que hace cada estructura segun el tamano de la bajada ──
console.log("\n## EL MECANISMO · P&L medio segun cuanto se movio el dia (de 11:00 al cierre)\n");
console.log("| movimiento | dias | HOY $/op | ASIM $/op | diferencia |");
console.log("|---|---|---|---|---|");
const cubos = [[-99, -2], [-2, -1.2], [-1.2, -0.5], [-0.5, 0.5], [0.5, 1.2], [1.2, 2], [2, 99]];
const REG = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8"));
const mapa = new Map(REG.map((r) => [r.fecha, r]));
for (const [lo, hi] of cubos) {
  const g = D.filter((d) => { const r = mapa.get(d.fecha); if (!r) return false; const m = (r.cierre / r.sp11 - 1) * 100; return m >= lo && m < hi; });
  if (!g.length) continue;
  const a = media(g.map((d) => d.hoy)), b = media(g.map((d) => d.asim));
  console.log("| " + (lo === -99 ? "menos de −2%" : hi === 99 ? "mas de +2%" : lo.toFixed(1) + "% a " + hi.toFixed(1) + "%") +
              " | " + g.length + " | " + eur(a) + " | " + eur(b) + " | " + eur(b - a) + (b > a ? " gana ASIM" : " gana HOY") + " |");
}
