// CIERRE — los numeros finales del mejor candidato sobre los 651 dias completos, y el resumen
// de las 75 pruebas. Sin subconjuntos convenientes: aqui se mide con TODOS los dias que tienen
// las tres verticales con precio real.

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { metricas, eur, media, pct } from "./cola-lib.mjs";
import { listonT } from "../lib/barreraHallazgos";
import { radiografia } from "../lib/radiografia";

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
    return { pl: (cred - Math.min(intr, ancho)) * 100 - 4 * COMM, cred: cred * 100 };
  };
  const c25 = vertical(C.filas, sp11 + 25, sp11 + 25 + ALA, true);
  const p25 = vertical(P.filas, sp11 - 25, sp11 - 25 - ALA, false);
  const p50 = vertical(P.filas, sp11 - 50, sp11 - 50 - ALA, false);
  if (!c25 || !p25 || !p50) continue;
  D.push({ fecha, hoy: c25.pl + p25.pl, asim: c25.pl + p50.pl,
           crHoy: c25.cred + p25.cred, crAsim: c25.cred + p50.cred });
}
radiografia(D, ["hoy", "asim", "crHoy", "crAsim"], "cierre", { maxCeros: 0.2 });

const N = D.length;
const H = metricas(D.map((d) => d.hoy), N), A = metricas(D.map((d) => d.asim), N);
console.log("\n## LOS DOS, SOBRE LOS " + N + " DIAS COMPLETOS\n");
console.log("| | HOY (call +25 / put −25) | ASIM (call +25 / put −50) |");
console.log("|---|---|---|");
console.log("| credito mediano | " + eur(pct(D.map((d) => d.crHoy), 0.5)) + " | " + eur(pct(D.map((d) => d.crAsim), 0.5)) + " |");
console.log("| $/ano | " + eur(H.anual) + " | " + eur(A.anual) + " |");
console.log("| media/op | " + eur(H.media) + " | " + eur(A.media) + " |");
console.log("| acierto | " + (H.acierto * 100).toFixed(1) + "% | " + (A.acierto * 100).toFixed(1) + "% |");
console.log("| peor dia | " + eur(H.peor) + " | " + eur(A.peor) + " |");
console.log("| p1 | " + eur(H.p1) + " | " + eur(A.p1) + " |");
console.log("| p5 | " + eur(H.p5) + " | " + eur(A.p5) + " |");
console.log("| caida acumulada | " + eur(H.dd) + " | " + eur(A.dd) + " |");
console.log("| ingreso/caida | **" + (H.anual / H.dd).toFixed(2) + "** | **" + (A.anual / A.dd).toFixed(2) + "** |");

const k = H.anual / A.anual;
console.log("\n## A IGUAL INGRESO · " + k.toFixed(2) + " contratos del asimetrico\n");
console.log("| | HOY 1 contrato | ASIM " + k.toFixed(2) + " contratos |");
console.log("|---|---|---|");
console.log("| $/ano | " + eur(H.anual) + " | " + eur(A.anual * k) + " |");
console.log("| peor dia | " + eur(H.peor) + " | " + eur(A.peor * k) + " |");
console.log("| p1 | " + eur(H.p1) + " | " + eur(A.p1 * k) + " |");
console.log("| p5 | " + eur(H.p5) + " | " + eur(A.p5 * k) + " |");
console.log("| caida | " + eur(H.dd) + " | " + eur(A.dd * k) + " |");
console.log("| colateral | $5.000 | " + eur(k * 5000) + " |");
const quitado = H.dd - A.dd * k, perdido = H.anual - A.anual * k;
console.log("\n  caida eliminada a igual ingreso: " + eur(quitado) + " (" + (quitado / H.dd * 100).toFixed(0) + "%)");

console.log("\n## POR TERCIOS DE TIEMPO\n");
console.log("| tercio | n | HOY $/op | ASIM $/op | HOY caida | ASIM caida | HOY peor | ASIM peor | ¿ASIM baja caida? | ¿ASIM sube ingreso/caida? |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
const k3 = Math.floor(N / 3);
let sDD = "", sR = "", sPeor = "";
for (let i = 0; i < 3; i++) {
  const g = i < 2 ? D.slice(i * k3, (i + 1) * k3) : D.slice(2 * k3);
  const mh = metricas(g.map((d) => d.hoy), g.length), ma = metricas(g.map((d) => d.asim), g.length);
  const bDD = ma.dd < mh.dd, bR = ma.anual / ma.dd > mh.anual / mh.dd, bP = ma.peor > mh.peor;
  sDD += bDD ? "+" : "−"; sR += bR ? "+" : "−"; sPeor += bP ? "+" : "−";
  console.log("| " + g[0].fecha + "→" + g[g.length - 1].fecha + " | " + g.length + " | " + eur(mh.media) + " | " + eur(ma.media) +
              " | " + eur(mh.dd) + " | " + eur(ma.dd) + " | " + eur(mh.peor) + " | " + eur(ma.peor) +
              " | " + (bDD ? "SI" : "no") + " | " + (bR ? "SI" : "no") + " |");
}
console.log("\n  signo por tercios · baja la caida " + sDD + " · sube ingreso/caida " + sR + " · mejora el peor dia " + sPeor);

console.log("\n## EL TECHO ESTRUCTURAL · perdida maxima posible del condor de hoy\n");
const riesgo = D.map((d) => 5000 - d.crHoy);
console.log("  5.000 − credito · mediana " + eur(pct(riesgo, 0.5)) + " · p90 " + eur(pct(riesgo, 0.9)) +
            " · maximo " + eur(Math.max(...riesgo)));
console.log("  el credito es el " + (pct(D.map((d) => d.crHoy), 0.5) / 5000 * 100).toFixed(1) +
            "% del ancho en la mediana: no hay casi nada que recortar por ahi.");

writeFileSync("scripts/cola-8-resultado.json", JSON.stringify({ n: N, HOY: H, ASIM: A, k, sDD, sR, sPeor }, null, 2), "utf8");
console.log("\n  detalle en scripts/cola-8-resultado.json · liston de |t| para 75 pruebas = " + listonT(75));
