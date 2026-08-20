// TAM-ANCHOS — el tamaño no se mueve sólo con el nº de contratos: se mueve con el ANCHO DEL ALA.
//
// Por qué esto es una pregunta de TAMAÑO y no de estrategia: con alas de 50 puntos el colateral
// es $5.000 y el contrato es indivisible. Sobre una cuenta de $56.389 eso significa que el
// escalón MÁS PEQUEÑO que existe ya es el 8,9% de la cuenta. No hay "medio contrato".
// El ancho del ala SÍ da granularidad: 10 puntos = $1.000 de colateral y $1.000 de pérdida máxima.
//
// Se construyen todos los anchos en UNA pasada por las cadenas, con precios reales.

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00", COMM = 0.03, DIST = 25;
const ANCHOS = [5, 10, 15, 20, 25, 30, 40, 50];

function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const [iK, iT, iB, iA, iU] = ["strike", "timestamp", "bid", "ask", "underlying_price"].map((c) => cab.indexOf(c));
  if ([iK, iT, iB, iA, iU].some((x) => x < 0)) throw new Error(`${f}: faltan columnas`);
  const enHora = []; let hFin = "", spotFin = 0;
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(","), hora = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && hora >= hFin) { hFin = hora; spotFin = sp; }
    if (hora !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (K > 0 && Number.isFinite(bid) && bid >= 0 && ask > 0) enHora.push({ K, bid, ask, spot: sp });
  }
  return enHora.length && spotFin > 0 ? { filas: enHora, cierre: spotFin } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();
const salida = [];
let descartados = 0;

for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P) { descartados++; continue; }
  const spot = C.filas[0].spot;
  const cC = cerca(C.filas, spot + DIST), pC = cerca(P.filas, spot - DIST);
  const S = C.cierre;
  if (!(S > 0) || Math.abs(S / spot - 1) > 0.12) { descartados++; continue; }

  const fila = { fecha, spot11: spot, cierre: S, mov: S - spot, por: {} };
  for (const w of ANCHOS) {
    const cL = cerca(C.filas, cC.K + w), pL = cerca(P.filas, pC.K - w);
    const anchoC = cL.K - cC.K, anchoP = pC.K - pL.K;
    if (anchoC <= 0 || anchoP <= 0) continue;
    const credito = cC.bid + pC.bid - cL.ask - pL.ask;
    if (!(credito > 0)) continue;
    const pl = (credito - Math.min(Math.max(S - cC.K, 0), anchoC) - Math.min(Math.max(pC.K - S, 0), anchoP)) * 100 - 8 * COMM;
    // colateral Robinhood: la vertical más ancha, al ancho pleno (comprobado en pantalla para 50)
    fila.por[w] = { pl: Math.round(pl * 100) / 100, credito: Math.round(credito * 100) / 100, col: Math.max(anchoC, anchoP) * 100, anchoReal: (anchoC + anchoP) / 2 };
  }
  if (Object.keys(fila.por).length) salida.push(fila);
}

console.log(`días: ${salida.length} · descartados: ${descartados}`);
writeFileSync("scripts/tam-anchos.json", JSON.stringify(salida));

const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.round(Math.abs(x)).toLocaleString("es-ES");
const PER = [
  ["A · 2022-2023", (f) => f.fecha < "2024-01-01"],
  ["B · 2024-2026", (f) => f.fecha >= "2024-01-01"],
  ["TODO", () => true],
];

function stats(rows, w) {
  const g = rows.filter((f) => f.por[w]);
  if (g.length < 50) return null;
  const pls = g.map((f) => f.por[w].pl);
  let cum = 0, pico = 0, dd = 0;
  for (const p of pls) { cum += p; if (cum > pico) pico = cum; if (cum - pico < dd) dd = cum - pico; }
  const ord = [...pls].sort((a, b) => a - b);
  const m = pls.reduce((a, b) => a + b, 0) / pls.length;
  const sd = Math.sqrt(pls.reduce((a, b) => a + (b - m) ** 2, 0) / (pls.length - 1));
  const cols = g.map((f) => f.por[w].col).sort((a, b) => a - b);
  return {
    n: g.length, total: cum, porAno: cum / (g.length / 252),
    peor: ord[0], p1: ord[Math.floor(ord.length * 0.01)], p5: ord[Math.floor(ord.length * 0.05)],
    dd, gana: pls.filter((x) => x > 0).length / pls.length,
    t: m / (sd / Math.sqrt(pls.length)),
    col: cols[cols.length >> 1], colMax: cols[cols.length - 1],
    creditoMedio: g.reduce((a, b) => a + b.por[w].credito, 0) / g.length,
  };
}

console.log("\n═══ EL ANCHO DEL ALA — 1 contrato, precios reales, por período ═══");
for (const [nom, f] of PER) {
  const rows = salida.filter(f);
  console.log(`\n── ${nom} · ${rows.length} días ──`);
  console.log("| ala (pts) | colateral | crédito medio | ganados | $/año | peor día | p1 | p5 | peor racha | t | $/año por cada $1.000 de colateral |");
  console.log("|---|---|---|---|---|---|---|---|---|---|---|");
  for (const w of ANCHOS) {
    const s = stats(rows, w); if (!s) continue;
    console.log(`| ${w} | ${eur(s.col)} | ${s.creditoMedio.toFixed(2)} | ${(s.gana * 100).toFixed(1)}% | ${eur(s.porAno)} | ${eur(s.peor)} | ${eur(s.p1)} | ${eur(s.p5)} | ${eur(s.dd)} | ${s.t.toFixed(2)} | ${eur(s.porAno / (s.col / 1000))} |`);
  }
}

// ── LA PRUEBA QUE IMPORTA: elegir el ancho en un período y aplicarlo al otro ──
console.log("\n═══ EL CRUCE — se elige el ancho donde más gana y se aplica al otro período ═══\n");
const A = salida.filter((f) => f.fecha < "2024-01-01"), B = salida.filter((f) => f.fecha >= "2024-01-01");
const mejorEn = (rows) => ANCHOS.map((w) => [w, stats(rows, w)]).filter(([, s]) => s)
  .sort((x, y) => y[1].porAno / (y[1].col / 1000) - x[1].porAno / (x[1].col / 1000))[0];
const [wA] = mejorEn(A), [wB] = mejorEn(B);
console.log("| se elige en | mejor ala | se aplica a | $/año | $/año por $1.000 colateral | peor racha | ¿mismo signo? |");
console.log("|---|---|---|---|---|---|---|");
for (const [de, w, a, rows] of [["A · 2022-2023", wA, "B · 2024-2026", B], ["B · 2024-2026", wB, "A · 2022-2023", A]]) {
  const sIn = stats(de.startsWith("A") ? A : B, w), sOut = stats(rows, w);
  console.log(`| ${de} | ${w} pts | ${a} | ${eur(sOut.porAno)} | ${eur(sOut.porAno / (sOut.col / 1000))} | ${eur(sOut.dd)} | ${Math.sign(sIn.porAno) === Math.sign(sOut.porAno) ? "SÍ" : "NO"} |`);
}
