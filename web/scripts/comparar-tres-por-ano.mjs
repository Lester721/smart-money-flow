// LAS TRES VERSIONES, AÑO A AÑO — lo que Lester pidió ver antes de decidir.
//
//   A · CÓNDOR DE HOY        ±25 puntos fijos · alas 50 · todos los días
//   B · FILTRO DE AMPLITUD   ±30 puntos fijos · alas 50 · sólo si el spot ≥ MA20 y ≥ MA50
//   C · POR STRADDLE         distancia = 2,3 × straddle del dinero a las 11:00 · alas 30
//
// La diferencia de fondo entre B y C: B es un FILTRO (decide si operar) y murió fuera de muestra.
// C es una UNIDAD (decide dónde poner los strikes) y no puede morir igual, porque no predice
// nada: sólo deja de usar una vara de medir que se encogía sola. ±25 puntos era el 0,62% del
// índice en 2022 y el 0,35% en 2026 — la misma regla apostando cada vez más fuerte sin que nadie
// lo decidiera.
//
// Precios reales en las cuatro patas: bid al vender, ask al comprar. Comisión $0,03 por pata.
// Uso: node --import tsx --max-old-space-size=10240 scripts/comparar-tres-por-ano.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00", COMM = 0.03;
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const racha = (v) => { let cur = 0, peor = 0; for (const x of v) { cur = Math.min(0, cur + x); peor = Math.min(peor, cur); } return peor; };

function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = ["strike", "timestamp", "bid", "ask", "underlying_price"].map((c) => cab.indexOf(c));
  if (idx.some((x) => x < 0)) throw new Error("faltan columnas en " + f);
  const [iK, iT, iB, iA, iU] = idx;
  const enHora = [];
  let cierre = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    const h = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && h >= hFin) { hFin = h; cierre = sp; }
    if (h !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask, spot: sp });
  }
  return enHora.length ? { filas: enHora, cierre } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

const fechas = [...new Set(readdirSync(DIR).map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean))].sort();
const dias = [];
for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P || !(C.cierre > 0)) continue;
  const sp11 = C.filas[0].spot;
  if (!(sp11 > 0)) continue;

  // EL STRADDLE DEL DINERO: lo que el mercado dice que se va a mover hoy. Punto medio de la call
  // y la put del strike más cercano al precio. Es observable a las 11:00, no se estima nada.
  const kA = cerca(C.filas, sp11), pA = P.filas.find((x) => x.K === kA.K) ?? cerca(P.filas, sp11);
  const straddle = (kA.bid + kA.ask) / 2 + (pA.bid + pA.ask) / 2;

  /** El cóndor a una distancia y un ancho de ala dados. Precios reales en las cuatro patas. */
  const condor = (dist, ala) => {
    if (!(dist > 0)) return null;
    const cC = cerca(C.filas, sp11 + dist), pC = cerca(P.filas, sp11 - dist);
    const cL = cerca(C.filas, cC.K + ala), pL = cerca(P.filas, pC.K - ala);
    if (cL.K <= cC.K || pL.K >= pC.K) return null;
    const cred = cC.bid + pC.bid - cL.ask - pL.ask;
    if (!(cred > 0)) return null;
    const S = C.cierre;
    return (cred - Math.min(Math.max(S - cC.K, 0), cL.K - cC.K)
                 - Math.min(Math.max(pC.K - S, 0), pC.K - pL.K)) * 100 - 8 * COMM;
  };

  const A = condor(25, 50), B = condor(30, 50), Cc = straddle > 0 ? condor(2.3 * straddle, 30) : null;
  if (A == null || B == null || Cc == null) continue;
  dias.push({ fecha, ano: fecha.slice(0, 4), sp11, cierre: C.cierre, straddle, A, B, C: Cc });
}

// El filtro de amplitud: medias con cierres ESTRICTAMENTE anteriores.
for (let i = 0; i < dias.length; i++) {
  if (i < 50) { dias[i].opera = null; continue; }
  const c = dias.slice(i - 50, i).map((x) => x.cierre);
  dias[i].opera = dias[i].sp11 >= media(c.slice(-20)) && dias[i].sp11 >= media(c);
}

const usables = dias.filter((d) => d.opera !== null);
const anos = [...new Set(usables.map((d) => d.ano))].sort();

// Las tres series de P&L de un subconjunto de días.
const series = (ds) => ({
  "cóndor de hoy (±25)": ds.map((d) => d.A),
  "filtro de amplitud (±30 + medias)": ds.filter((d) => d.opera === true).map((d) => d.B),
  "por STRADDLE (2,3× · alas 30)": ds.map((d) => d.C),
});
const NOM = Object.keys(series([]));

console.log(`\n## ${usables.length} días medidos · ${usables[0].fecha} → ${usables[usables.length - 1].fecha}\n`);

for (const met of ["ganancia del año", "peor día", "peor racha del año", "días operados"]) {
  console.log(`### ${met.toUpperCase()}\n`);
  console.log("| año | " + NOM.join(" | ") + " |");
  console.log("|---|---|---|---|");
  for (const a of anos) {
    const s = series(usables.filter((d) => d.ano === a));
    const cel = NOM.map((k) => {
      const v = s[k];
      if (!v.length) return "—";
      if (met === "ganancia del año") return eur(v.reduce((x, y) => x + y, 0));
      if (met === "peor día") return eur(Math.min(...v));
      if (met === "peor racha del año") return eur(racha(v));
      return String(v.length);
    });
    console.log(`| **${a}** | ${cel.join(" | ")} |`);
  }
  // el total, sobre todo el período seguido (la racha NO es la suma de las anuales)
  const t = series(usables);
  const cel = NOM.map((k) => {
    const v = t[k];
    if (met === "ganancia del año") return eur(v.reduce((x, y) => x + y, 0) / (usables.length / 252));
    if (met === "peor día") return eur(Math.min(...v));
    if (met === "peor racha del año") return eur(racha(v));
    return String(v.length);
  });
  console.log(`| **TOTAL** | ${cel.join(" | ")} |` + (met === "ganancia del año" ? "  ← $/año" : met === "peor racha del año" ? "  ← racha de todo el período" : ""));
  console.log("");
}

console.log(`### Acierto y colateral\n`);
const t = series(usables);
console.log("| | acierto | colateral por contrato |");
console.log("|---|---|---|");
for (const [i, k] of NOM.entries()) {
  const v = t[k];
  console.log(`| ${k} | ${((v.filter((x) => x > 0).length / v.length) * 100).toFixed(1)}% | ${i === 2 ? "$3.000" : "$5.000"} |`);
}
console.log(`\n(el colateral sale del ancho del ala: 50 puntos = $5.000, 30 puntos = $3.000)`);
