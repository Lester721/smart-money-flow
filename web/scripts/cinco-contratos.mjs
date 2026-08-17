// 5 CONTRATOS FIJOS, ALAS DE 50 — lo que pidió, año a año, y qué le pasa a la cuenta por el camino.
//
// OJO A LA DIFERENCIA: la regla del 10% que salió mejor en la simulación EMPIEZA con 1 contrato y
// llega a 5 cuando el capital ha crecido. Poner 5 desde el primer día es una cosa distinta y
// bastante más agresiva. Aquí se mide exactamente eso, más el tamaño fijo que sí sobrevive.

import { readFileSync, readdirSync, existsSync } from "node:fs";
const DIR = "scripts/cache-theta/gex-2026", HORA = "11:00", COMM = 0.03, ALA = 50;
const CAP0 = 56389;                                   // valor total real de la cuenta hoy

function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const [iK, iT, iB, iA, iU] = ["strike","timestamp","bid","ask","underlying_price"].map((c) => cab.indexOf(c));
  if ([iK, iT, iB, iA, iU].some((x) => x < 0)) return null;
  const eh = []; let spFin = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(","), h = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && h >= hFin) { hFin = h; spFin = sp; }
    if (h !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (K > 0 && bid >= 0 && ask > 0) eh.push({ K, bid, ask, spot: sp });
  }
  return eh.length ? { filas: eh, cierre: spFin } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));
const eur = (x) => `${x < 0 ? "−" : ""}$${Math.abs(Math.round(x)).toLocaleString("es-ES")}`;
const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();

const ops = [];
for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P || !(C.cierre > 0)) continue;
  const spot = C.filas[0].spot; if (!(spot > 0)) continue;
  const cC = cerca(C.filas, spot + 25), pC = cerca(P.filas, spot - 25);
  const cL = cerca(C.filas, cC.K + ALA), pL = cerca(P.filas, pC.K - ALA);
  if (cL.K <= cC.K || pL.K >= pC.K) continue;
  const cred = cC.bid + pC.bid - cL.ask - pL.ask; if (!(cred > 0)) continue;
  const S = C.cierre;
  const pl = (cred - Math.min(Math.max(S - cC.K, 0), cL.K - cC.K)
                   - Math.min(Math.max(pC.K - S, 0), pC.K - pL.K)) * 100 - 8 * COMM;
  ops.push({ fecha, pl, col: (Math.max(cL.K - cC.K, pC.K - pL.K) - cred) * 100, cred: cred * 100 });
}

/** Recorre la cuenta con N contratos FIJOS. Devuelve el detalle por año y lo que duele. */
function correr(N) {
  let cap = CAP0, pico = CAP0, caida = 0, minCap = CAP0, fechaMin = "";
  const anos = new Map(); const meses = new Map();
  for (const o of ops) {
    const pl = o.pl * N;
    cap += pl;
    const a = o.fecha.slice(0, 4), m = o.fecha.slice(0, 7);
    if (!anos.has(a)) anos.set(a, { pl: 0, n: 0, g: 0, peor: 0, mejor: 0, col: 0 });
    const A = anos.get(a);
    A.pl += pl; A.n++; if (pl > 0) A.g++;
    A.peor = Math.min(A.peor, pl); A.mejor = Math.max(A.mejor, pl);
    A.col = Math.max(A.col, o.col * N);
    meses.set(m, (meses.get(m) ?? 0) + pl);
    if (cap > pico) pico = cap;
    caida = Math.max(caida, pico - cap);
    if (cap < minCap) { minCap = cap; fechaMin = o.fecha; }
  }
  return { cap, caida, minCap, fechaMin, anos, meses };
}

const N = 5;
const r = correr(N);
console.log(`\n## ${N} CONTRATOS FIJOS · alas de ${ALA} · entrada ${HORA} · sin filtro de GEX · ${ops.length} días\n`);
console.log("| año | días | % ganados | **P&L del año** | acumulado | mejor día | peor día | colateral máx |");
console.log("|---|---|---|---|---|---|---|---|");
let ac = 0;
for (const [a, A] of [...r.anos].sort()) {
  ac += A.pl;
  console.log(`| ${a} | ${A.n} | ${((A.g / A.n) * 100).toFixed(0)}% | **${eur(A.pl)}** | ${eur(ac)} | ${eur(A.mejor)} | ${eur(A.peor)} | ${eur(A.col)} |`);
}
console.log(`\n  TOTAL 2024 → hoy: **${eur(ac)}** sobre una cuenta de ${eur(CAP0)}  →  ${((ac / CAP0) * 100).toFixed(0)}%`);
console.log(`  al año: ${eur(ac / (ops.length / 252))}`);
console.log(`\n  ⚠️  PEOR CAÍDA desde máximo: ${eur(-r.caida)}   ·   punto más bajo de la cuenta: ${eur(r.minCap)} (${r.fechaMin})`);

console.log(`\n\n── LOS MESES MALOS (los 8 peores con ${N} contratos) ──\n`);
console.log("| mes | P&L |");
console.log("|---|---|");
for (const [m, v] of [...r.meses].sort((a, b) => a[1] - b[1]).slice(0, 8)) console.log(`| ${m} | ${eur(v)} |`);

console.log(`\n\n── ¿CUÁNTOS CONTRATOS AGUANTA LA CUENTA DE VERDAD? ──\n`);
console.log("| contratos | final | ganancia | peor caída | % de la cuenta | colateral máx | peor día |");
console.log("|---|---|---|---|---|---|---|");
for (const n of [1, 2, 3, 4, 5, 7, 10]) {
  const x = correr(n);
  const peorDia = Math.min(...ops.map((o) => o.pl * n));
  console.log(`| ${n} | ${eur(x.cap)} | ${eur(x.cap - CAP0)} | ${eur(-x.caida)} | ${((x.caida / CAP0) * 100).toFixed(0)}% | ${eur(Math.max(...ops.map((o) => o.col * n)))} | ${eur(peorDia)} |`);
}
