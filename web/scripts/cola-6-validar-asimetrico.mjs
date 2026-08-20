// VALIDAR EL CANDIDATO ASIMETRICO — call a +25, put a -50, alas de 50. Precios reales.
//
// Lo que hay que descartar antes de contarlo:
//   1. Que los 81 dias que se caen de la muestra sean los malos (seleccion por disponibilidad).
//   2. Que el efecto viva en un tercio del tiempo.
//   3. Que sea la asimetria o simplemente "vender mas lejos" (control simetrico +-50 medido igual).
//   4. Que a IGUAL INGRESO (mas contratos) la caida vuelva a subir.

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { metricas, eur, media, pct, DIAS_ANO } from "./cola-lib.mjs";
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
// exige que el strike exista DE VERDAD donde se pide (tolerancia +-5 puntos). Si no, ese dia no se mide.
const exacto = (f, o) => { const x = cerca(f, o); return Math.abs(x.K - o) <= 5 ? x : null; };

const fechas = [...new Set(readdirSync(DIR).map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean))].sort();
const todos = [], caidos = [];
for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P) { caidos.push({ fecha, motivo: "sin fichero" }); continue; }
  const horas = [...C.camino.keys()].sort();
  const cierre = C.camino.get(horas[horas.length - 1]), sp11 = C.camino.get(HORA);
  if (!(cierre > 0) || !(sp11 > 0)) { caidos.push({ fecha, motivo: "sin spot" }); continue; }

  const vertical = (filas, kCorto, kLargo, esCall) => {
    const corto = exacto(filas, kCorto), largo = exacto(filas, kLargo);
    if (!corto || !largo) return null;
    const ancho = esCall ? largo.K - corto.K : corto.K - largo.K;
    if (ancho <= 0) return null;
    const cred = corto.bid - largo.ask;
    const intr = esCall ? Math.max(cierre - corto.K, 0) : Math.max(corto.K - cierre, 0);
    return { cred, pl: (cred - Math.min(intr, ancho)) * 100 - 4 * COMM, riesgo: ancho * 100 - cred * 100 };
  };
  const c25 = vertical(C.filas, sp11 + 25, sp11 + 25 + ALA, true);
  const p25 = vertical(P.filas, sp11 - 25, sp11 - 25 - ALA, false);
  const p50 = vertical(P.filas, sp11 - 50, sp11 - 50 - ALA, false);
  const c50 = vertical(C.filas, sp11 + 50, sp11 + 50 + ALA, true);
  if (!c25 || !p25 || !p50 || !c50) { caidos.push({ fecha, motivo: "falta algun strike a distancia exacta" }); continue; }
  if (!(c25.cred > 0) || !(p25.cred > 0) || !(p50.cred > 0) || !(c50.cred > 0)) { caidos.push({ fecha, motivo: "credito no positivo en alguna pata" }); continue; }
  todos.push({ fecha, sp11, cierre, mov: (cierre / sp11 - 1) * 100,
    hoy: c25.pl + p25.pl, asim: c25.pl + p50.pl, lejos: c50.pl + p50.pl,
    crHoy: (c25.cred + p25.cred) * 100, crAsim: (c25.cred + p50.cred) * 100 });
}
console.log("## dias medidos: " + todos.length + " de " + fechas.length + " · caidos: " + caidos.length);
const porMotivo = {};
for (const c of caidos) porMotivo[c.motivo] = (porMotivo[c.motivo] || 0) + 1;
console.log("   motivos: " + JSON.stringify(porMotivo));

radiografia(todos, ["hoy", "asim", "lejos", "crHoy", "crAsim", "mov"], "estructuras", { maxCeros: 0.2 });

// ── 1. ¿SON LOS DIAS CAIDOS LOS MALOS? Se comparan con la serie completa de regimen-filas ──
const REG = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8"));
const medidos = new Set(todos.map((d) => d.fecha));
const dentro = REG.filter((r) => medidos.has(r.fecha)).map((r) => r.pl);
const afuera = REG.filter((r) => !medidos.has(r.fecha)).map((r) => r.pl);
console.log("\n## 1 · LOS DIAS QUE SE CAEN DE LA MUESTRA (condor de hoy, +-25/50)\n");
console.log("  " + dentro.length + " dias medidos: media " + eur(media(dentro)) + " · peor " + eur(Math.min(...dentro)));
console.log("  " + afuera.length + " dias caidos : media " + eur(media(afuera)) + " · peor " + eur(afuera.length ? Math.min(...afuera) : 0));
console.log("  " + (media(afuera) < media(dentro)
  ? "  AVISO: los dias caidos son PEORES que los medidos. La comparacion entre estructuras sigue siendo\n" +
    "  valida (mismos dias para todas), pero los $/ano de este fichero estan inflados frente a los 653."
  : "  los dias caidos no son peores que los medidos."));

// ── 2. LAS TRES ESTRUCTURAS ──────────────────────────────────────────────────
const N = todos.length;
const ver = (nom, k) => {
  const m = metricas(todos.map((d) => d[k]), N);
  return { nom, k, m, ratio: m.anual / m.dd };
};
const E = [ver("HOY  · call +25 / put -25", "hoy"), ver("ASIM · call +25 / put -50", "asim"), ver("LEJOS· call +50 / put -50 (control simetrico)", "lejos")];
console.log("\n## 2 · LAS TRES ESTRUCTURAS · mismos " + N + " dias, precios reales\n");
console.log("| estructura | credito mediano | $/ano | media/op | acierto | peor dia | p1 | p5 | caida | ingreso/caida |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const e of E) {
  const cr = e.k === "hoy" ? pct(todos.map((d) => d.crHoy), 0.5) : e.k === "asim" ? pct(todos.map((d) => d.crAsim), 0.5) : NaN;
  console.log("| " + e.nom + " | " + (isFinite(cr) ? eur(cr) : "—") + " | " + eur(e.m.anual) + " | " + eur(e.m.media) + " | " +
              (e.m.acierto * 100).toFixed(1) + "% | " + eur(e.m.peor) + " | " + eur(e.m.p1) + " | " + eur(e.m.p5) +
              " | " + eur(e.m.dd) + " | **" + e.ratio.toFixed(2) + "** |");
}

// ── 3. TERCIOS DE TIEMPO ─────────────────────────────────────────────────────
console.log("\n## 3 · POR TERCIOS DE TIEMPO — el signo tiene que repetirse en los TRES\n");
console.log("| tercio | n | HOY $/op | ASIM $/op | HOY caida | ASIM caida | ¿ASIM baja la caida? | ¿ASIM sube ingreso/caida? |");
console.log("|---|---|---|---|---|---|---|---|");
const k3 = Math.floor(N / 3);
let signosDD = "", signosRatio = "";
for (let i = 0; i < 3; i++) {
  const g = i < 2 ? todos.slice(i * k3, (i + 1) * k3) : todos.slice(2 * k3);
  const mh = metricas(g.map((d) => d.hoy), g.length), ma = metricas(g.map((d) => d.asim), g.length);
  const bajaDD = ma.dd < mh.dd, subeR = (ma.anual / ma.dd) > (mh.anual / mh.dd);
  signosDD += bajaDD ? "+" : "−"; signosRatio += subeR ? "+" : "−";
  console.log("| " + g[0].fecha + "→" + g[g.length - 1].fecha + " | " + g.length + " | " + eur(mh.media) + " | " + eur(ma.media) +
              " | " + eur(mh.dd) + " | " + eur(ma.dd) + " | " + (bajaDD ? "SI" : "no") + " | " + (subeR ? "SI" : "no") + " |");
}
console.log("\n  signo por tercios · baja la caida: " + signosDD + "   ·   sube ingreso/caida: " + signosRatio);

// ── 4. POR ANO NATURAL ───────────────────────────────────────────────────────
console.log("\n## 4 · POR ANO NATURAL\n");
console.log("| ano | n | HOY $/op | ASIM $/op | HOY peor | ASIM peor | HOY caida | ASIM caida |");
console.log("|---|---|---|---|---|---|---|---|");
for (const a of ["2024", "2025", "2026"]) {
  const g = todos.filter((d) => d.fecha.startsWith(a));
  if (g.length < 20) continue;
  const mh = metricas(g.map((d) => d.hoy), g.length), ma = metricas(g.map((d) => d.asim), g.length);
  console.log("| " + a + " | " + g.length + " | " + eur(mh.media) + " | " + eur(ma.media) + " | " + eur(mh.peor) +
              " | " + eur(ma.peor) + " | " + eur(mh.dd) + " | " + eur(ma.dd) + " |");
}

// ── 5. A IGUAL INGRESO ───────────────────────────────────────────────────────
const h = E[0].m, a = E[1].m;
const k = h.anual / a.anual;
console.log("\n## 5 · A IGUAL INGRESO — " + k.toFixed(2) + " contratos del asimetrico dan los mismos " + eur(h.anual) + "/ano\n");
console.log("| | HOY (1 contrato) | ASIM (" + k.toFixed(2) + " contratos) |");
console.log("|---|---|---|");
console.log("| $/ano | " + eur(h.anual) + " | " + eur(a.anual * k) + " |");
console.log("| peor dia | " + eur(h.peor) + " | " + eur(a.peor * k) + " |");
console.log("| p1 | " + eur(h.p1) + " | " + eur(a.p1 * k) + " |");
console.log("| p5 | " + eur(h.p5) + " | " + eur(a.p5 * k) + " |");
console.log("| caida | " + eur(h.dd) + " | " + eur(a.dd * k) + " |");
console.log("| colateral | $5.000 | " + eur(k * 5000) + " |");
console.log("\n  a igual ingreso el asimetrico deja la caida en " + eur(a.dd * k) + " contra " + eur(h.dd) +
            "  ->  " + ((1 - (a.dd * k) / h.dd) * 100).toFixed(0) + "% menos");

// ── 6. LOS PEORES DIAS EN PARALELO ───────────────────────────────────────────
console.log("\n## 6 · LOS 12 PEORES DIAS DEL CONDOR DE HOY, CON EL ASIMETRICO AL LADO\n");
console.log("| fecha | mov 11:00→cierre | HOY | ASIM |");
console.log("|---|---|---|---|");
for (const d of [...todos].sort((x, y) => x.hoy - y.hoy).slice(0, 12))
  console.log("| " + d.fecha + " | " + d.mov.toFixed(2) + "% | " + eur(d.hoy) + " | " + eur(d.asim) + " |");

writeFileSync("scripts/cola-6-resultado.json", JSON.stringify({ n: N, caidos: caidos.length, E: E.map((e) => ({ nom: e.nom, ...e.m, ratio: e.ratio })) }, null, 2), "utf8");
console.log("\n  detalle en scripts/cola-6-resultado.json");
