// EL ANCHO DEL ALA — la unica palanca que acota el peor dia POR CONSTRUCCION.
//
// ═══ POR QUE ESTE FICHERO EXISTE ══════════════════════════════════════════════════════════════
// La perdida maxima de un condor de un contrato es EXACTAMENTE  ancho x 100 - credito.
// Con alas de 50 puntos eso son $5.000 menos un credito cuya mediana son $500: el peor dia
// posible esta en -$4.500 y ningun filtro lo puede bajar, porque no lo decide el dia, lo decide
// la estructura. Cerrar el ala es la unica forma de mover ese techo.
//
// Precios REALES: bid al vender, ask al comprar, las cuatro patas. Comision $0,03 por pata.
// Mismos strikes cortos de siempre (+-25 del spot de las 11:00). Solo cambia el ala.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/cola-4-ala.mjs

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { metricas, eur, media, pct } from "./cola-lib.mjs";
import { radiografia } from "../lib/radiografia";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00", SEP = 25, COMM = 0.03;
const ALAS = [10, 15, 25, 50];

function leerDia(fecha, right) {
  const f = DIR + "/iv_" + fecha + "_" + right + ".csv";
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = ["strike", "timestamp", "bid", "ask", "implied_vol", "underlying_price"].map((c) => cab.indexOf(c));
  if (idx.some((x) => x < 0)) throw new Error("faltan columnas en " + f);
  const [iK, iT, iB, iA, iV, iU] = idx;
  const enHora = [], camino = new Map();
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    const h = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0) camino.set(h, sp);
    if (h !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]), iv = Number(c[iV]);
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask, iv });
  }
  return enHora.length ? { filas: enHora, camino } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

const fechas = [...new Set(readdirSync(DIR).map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean))].sort();
console.log("## " + fechas.length + " dias en disco · entrada " + HORA + " ET · cortos a +-" + SEP + " puntos\n");

const dias = [];
for (let i = 0; i < fechas.length; i++) {
  const fecha = fechas[i];
  if (i % 150 === 0) console.log("   " + i + "/" + fechas.length + " · " + fecha);
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P) continue;
  const horas = [...C.camino.keys()].sort();
  const cierre = C.camino.get(horas[horas.length - 1]), sp11 = C.camino.get(HORA);
  if (!(cierre > 0) || !(sp11 > 0)) continue;
  const cC = cerca(C.filas, sp11 + SEP), pC = cerca(P.filas, sp11 - SEP);
  const fila = { fecha, sp11, cierre, kC: cC.K, kP: pC.K };
  let completo = true;
  for (const ALA of ALAS) {
    const cL = cerca(C.filas, cC.K + ALA), pL = cerca(P.filas, pC.K - ALA);
    // el ala TIENE que existir de verdad y estar donde toca: si el strike mas cercano no esta a
    // la distancia pedida (+-5 puntos de tolerancia), ese ancho NO se mide ese dia. No se rellena.
    if (cL.K <= cC.K || pL.K >= pC.K || Math.abs(cL.K - cC.K - ALA) > 5 || Math.abs(pC.K - pL.K - ALA) > 5) { completo = false; break; }
    const anchoC = cL.K - cC.K, anchoP = pC.K - pL.K;
    const cred = cC.bid + pC.bid - cL.ask - pL.ask;
    if (!(cred > 0)) { completo = false; break; }
    const pl = (cred - Math.min(Math.max(cierre - cC.K, 0), anchoC) - Math.min(Math.max(pC.K - cierre, 0), anchoP)) * 100 - 8 * COMM;
    fila["pl" + ALA] = pl;
    fila["cr" + ALA] = cred * 100;
    fila["riesgo" + ALA] = Math.max(anchoC, anchoP) * 100 - cred * 100;
  }
  if (completo) dias.push(fila);
}
console.log("\n   dias con LAS CUATRO anchuras disponibles y crédito positivo: " + dias.length + " de " + fechas.length);
if (dias.length < 400) console.log("   AVISO: se han caido dias. Los anchos se comparan solo sobre los que tienen las cuatro.");

radiografia(dias, ALAS.flatMap((a) => ["pl" + a, "cr" + a, "riesgo" + a]), "anchos de ala", { maxCeros: 0.2 });

const N = dias.length;
console.log("\n## LOS CUATRO ANCHOS · mismos dias, mismos cortos, precios reales\n");
console.log("| ala | credito mediano | perdida maxima posible (mediana) | $/ano | media/op | acierto | peor dia | p1 | p5 | caida |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
const res = {};
for (const A of ALAS) {
  const pls = dias.map((d) => d["pl" + A]);
  const m = metricas(pls, N);
  res[A] = m;
  console.log("| " + A + " puntos" + (A === 50 ? " (la de hoy)" : "") + " | " + eur(pct(dias.map((d) => d["cr" + A]), 0.5)) +
              " | " + eur(pct(dias.map((d) => d["riesgo" + A]), 0.5)) + " | " + eur(m.anual) + " | " + eur(m.media) +
              " | " + (m.acierto * 100).toFixed(1) + "% | " + eur(m.peor) + " | " + eur(m.p1) + " | " + eur(m.p5) + " | " + eur(m.dd) + " |");
}

const b = res[50];
console.log("\n## A IGUAL INGRESO — cuantos contratos del ala estrecha dan los mismos $/ano que 1 del ala de 50\n");
console.log("| ala | contratos para igualar " + eur(b.anual) + "/ano | colateral necesario | peor dia | p1 | p5 | caida |");
console.log("|---|---|---|---|---|---|---|");
for (const A of ALAS) {
  const k = b.anual / res[A].anual;
  const cont = k;
  console.log("| " + A + " puntos | " + k.toFixed(2) + " | " + eur(cont * A * 100) + " | " + eur(res[A].peor * k) +
              " | " + eur(res[A].p1 * k) + " | " + eur(res[A].p5 * k) + " | " + eur(res[A].dd * k) + " |");
}

console.log("\n## POR TERCIOS DE TIEMPO — ¿aguanta el orden en los tres?\n");
console.log("| tercio | " + ALAS.map((a) => "ala " + a).join(" | ") + " |");
console.log("|---|" + ALAS.map(() => "---").join("|") + "|");
const k3 = Math.floor(N / 3);
for (let t = 0; t < 3; t++) {
  const g = t < 2 ? dias.slice(t * k3, (t + 1) * k3) : dias.slice(2 * k3);
  const linea = ALAS.map((A) => {
    const m = metricas(g.map((d) => d["pl" + A]), g.length);
    return eur(m.media) + "/op · caida " + eur(m.dd);
  });
  console.log("| " + g[0].fecha + "→" + g[g.length - 1].fecha + " | " + linea.join(" | ") + " |");
}

console.log("\n## LOS 10 PEORES DIAS, LOS CUATRO ANCHOS EN PARALELO\n");
console.log("| fecha | mov. del dia | " + ALAS.map((a) => "ala " + a).join(" | ") + " |");
console.log("|---|---|" + ALAS.map(() => "---").join("|") + "|");
for (const d of [...dias].sort((x, y) => x.pl50 - y.pl50).slice(0, 10)) {
  console.log("| " + d.fecha + " | " + ((d.cierre / d.sp11 - 1) * 100).toFixed(2) + "% | " +
              ALAS.map((A) => eur(d["pl" + A])).join(" | ") + " |");
}

writeFileSync("scripts/cola-4-resultado.json", JSON.stringify({ n: N, res }, null, 2), "utf8");
console.log("\n  detalle en scripts/cola-4-resultado.json");
