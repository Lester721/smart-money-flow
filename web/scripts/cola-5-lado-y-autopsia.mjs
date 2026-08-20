// DOS COSAS QUE FALTABAN
//
// A · ¿DE QUE LADO ES LA COLA? Los 10 peores dias: 9 son bajadas. Si la cola vive en la pata de
//     puts, moverla o quitarla es una palanca de cola que NO depende de predecir nada.
//     Se miden, con precios reales: cada pata por separado y condores asimetricos.
//
// B · AUTOPSIA de la unica regla cuya caida batio a su propia baraja (p=0,003): reducir a la
//     mitad tras 2 perdidas seguidas. Amortigua el CAMINO por construccion; la pregunta es
//     cuanto ingreso cuesta y en que dias se apaga.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/cola-5-lado-y-autopsia.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { cargar, metricas, eur, media, pct } from "./cola-lib.mjs";
import { radiografia } from "../lib/radiografia";
import { tWelch, listonT } from "../lib/barreraHallazgos";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00", ALA = 50, COMM = 0.03;
const PRUEBAS = 75;
console.log("PRUEBAS DECLARADAS EN TODO EL ENCARGO: " + PRUEBAS + " · liston de |t| = " + listonT(PRUEBAS) + "\n");

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

// ── A · LADOS ─────────────────────────────────────────────────────────────────
const fechas = [...new Set(readdirSync(DIR).map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean))].sort();
const D = [];
for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P) continue;
  const horas = [...C.camino.keys()].sort();
  const cierre = C.camino.get(horas[horas.length - 1]), sp11 = C.camino.get(HORA);
  if (!(cierre > 0) || !(sp11 > 0)) continue;
  const fila = { fecha, sp11, cierre };
  let ok = true;
  // pata de CALL a distintas distancias, y pata de PUT a distintas distancias. Ala siempre 50.
  for (const dist of [25, 35, 50]) {
    const cC = cerca(C.filas, sp11 + dist), cL = cerca(C.filas, cC.K + ALA);
    const pC = cerca(P.filas, sp11 - dist), pL = cerca(P.filas, pC.K - ALA);
    if (cL.K <= cC.K || pL.K >= pC.K) { ok = false; break; }
    const crC = cC.bid - cL.ask, crP = pC.bid - pL.ask;
    if (!(crC > 0) || !(crP > 0)) { ok = false; break; }
    // 4 comisiones por vertical
    fila["call" + dist] = (crC - Math.min(Math.max(cierre - cC.K, 0), cL.K - cC.K)) * 100 - 4 * COMM;
    fila["put" + dist] = (crP - Math.min(Math.max(pC.K - cierre, 0), pC.K - pL.K)) * 100 - 4 * COMM;
  }
  if (ok) D.push(fila);
}
console.log("## A · DE QUE LADO ES LA COLA · " + D.length + " dias con las dos patas a las tres distancias\n");
radiografia(D, ["call25", "put25", "call35", "put35", "call50", "put50"], "patas por separado", { maxCeros: 0.2 });

const N = D.length;
const ver = (nom, pls) => {
  const m = metricas(pls, N);
  console.log("| " + nom + " | " + eur(m.anual) + " | " + eur(m.media) + " | " + (m.acierto * 100).toFixed(1) +
              "% | " + eur(m.peor) + " | " + eur(m.p1) + " | " + eur(m.p5) + " | " + eur(m.dd) +
              " | **" + (m.dd > 0 ? (m.anual / m.dd).toFixed(2) : "—") + "** |");
  return m;
};
console.log("\n| estructura | $/ano | media/op | acierto | peor dia | p1 | p5 | caida | ingreso/caida |");
console.log("|---|---|---|---|---|---|---|---|---|");
const base = ver("CONDOR +-25 (la de hoy)", D.map((d) => d.call25 + d.put25 - 8 * COMM + 8 * COMM));
ver("solo la pata de CALL, +25", D.map((d) => d.call25));
ver("solo la pata de PUT, -25", D.map((d) => d.put25));
ver("asimetrico: call +25 / put -35", D.map((d) => d.call25 + d.put35));
ver("asimetrico: call +25 / put -50", D.map((d) => d.call25 + d.put50));
ver("simetrico +-35", D.map((d) => d.call35 + d.put35));
ver("simetrico +-50", D.map((d) => d.call50 + d.put50));

console.log("\n  ¿donde caen los 20 peores dias del condor? (signo del movimiento de 11:00 al cierre)");
const peores = [...D].sort((a, b) => (a.call25 + a.put25) - (b.call25 + b.put25)).slice(0, 20);
const bajadas = peores.filter((d) => d.cierre < d.sp11).length;
console.log("    " + bajadas + " de 20 son BAJADAS · la pata de put pierde en " + peores.filter((d) => d.put25 < 0).length +
            " de 20, la de call en " + peores.filter((d) => d.call25 < 0).length + " de 20");
console.log("    peor dia de la pata de PUT: " + eur(Math.min(...D.map((d) => d.put25))) +
            " · peor dia de la pata de CALL: " + eur(Math.min(...D.map((d) => d.call25))));

// ── B · AUTOPSIA DE "REDUCIR TRAS PERDER" ─────────────────────────────────────
const F = cargar();
console.log("\n\n## B · AUTOPSIA · reducir a la mitad tras 2 perdidas seguidas\n");
const tam = []; let racha = 0, reducido = false;
for (let i = 0; i < F.length; i++) {
  tam.push(reducido ? 1 : 2);
  if (F[i].pl < 0) { racha++; if (racha >= 2) reducido = true; }
  else { racha = 0; if (reducido) reducido = false; }
}
const dentro = F.filter((_, i) => tam[i] === 1).map((f) => f.pl);
const fuera = F.filter((_, i) => tam[i] === 2).map((f) => f.pl);
console.log("| estado | dias | media/op (1 contrato) | % que gana | peor dia |");
console.log("|---|---|---|---|---|");
console.log("| REDUCIDO (tras 2 perdidas) | " + dentro.length + " | " + eur(media(dentro)) + " | " +
            (dentro.filter((x) => x > 0).length / dentro.length * 100).toFixed(1) + "% | " + eur(Math.min(...dentro)) + " |");
console.log("| tamano completo | " + fuera.length + " | " + eur(media(fuera)) + " | " +
            (fuera.filter((x) => x > 0).length / fuera.length * 100).toFixed(1) + "% | " + eur(Math.min(...fuera)) + " |");
const t = tWelch(dentro, fuera);
console.log("\n  diferencia de media: " + eur(media(dentro) - media(fuera)) + " · t = " + t.toFixed(2) +
            " (liston " + listonT(PRUEBAS) + ")");
console.log("  " + (media(dentro) > media(fuera)
  ? "  -> los dias que la regla APAGA son MEJORES que la media. La regla apuesta menos justo donde mas paga."
  : "  -> los dias que la regla apaga son peores que la media."));

console.log("\n  ¿y en los tres tercios de tiempo?");
const k3 = Math.floor(F.length / 3);
for (let i = 0; i < 3; i++) {
  const ini = i * k3, fin = i < 2 ? (i + 1) * k3 : F.length;
  const d = [], f2 = [];
  for (let j = ini; j < fin; j++) (tam[j] === 1 ? d : f2).push(F[j].pl);
  console.log("    " + F[ini].fecha + "→" + F[fin - 1].fecha + "  reducido " + String(d.length).padStart(3) +
              " dias " + eur(media(d)).padStart(7) + "/op  ·  completo " + String(f2.length).padStart(3) +
              " dias " + eur(media(f2)).padStart(7) + "/op  ·  " + (media(d) > media(f2) ? "APAGA LOS BUENOS" : "apaga los malos"));
}
