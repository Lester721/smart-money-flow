// LOS TRES SITIOS POR DONDE ESTO SE PUEDE CAER MAÑANA. Se miran ANTES de que él opere, no después.
//
// 1) LA LIQUIDACIÓN. El P&L se liquida contra "el último spot del fichero". Si ese último spot no
//    es el cierre de las 16:00, el resultado está medido contra un precio que no es el que liquida.
//    SPXW liquida al cierre del índice. Un desfase de minutos en 0DTE mueve el P&L entero.
//
// 2) EL CRÉDITO CONTRA LA REALIDAD. El forward test en vivo cobra ~$220 de mediana. Si el backtest
//    dice $725, entonces el backtest describe un mercado que ya no existe, y todo lo de arriba es
//    historia, no previsión. ES LA COMPROBACIÓN MÁS IMPORTANTE DE LAS TRES.
//
// 3) LA HORQUILLA Y EL TAMAÑO. Cobrar el bid es conservador para 1 contrato. Se mira si en el bid
//    hay sitio y cuánto de ancha es la horquilla en las patas que se venden.

import { readFileSync, readdirSync, existsSync } from "node:fs";
const DIR = "scripts/cache-theta/gex-2026", HORA = "11:00", ALA = 50;

const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();
const eur = (x) => `${x < 0 ? "−" : ""}$${Math.abs(Math.round(x)).toLocaleString("es-ES")}`;
const mediana = (v) => { const s = [...v].sort((a, b) => a - b); return s[s.length >> 1]; };

function leer(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const [iK, iT, iB, iA, iU] = ["strike","timestamp","bid","ask","underlying_price"].map((c) => cab.indexOf(c));
  if ([iK, iT, iB, iA, iU].some((x) => x < 0)) return null;
  const eh = []; let spFin = 0, hFin = "", horas = new Set();
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(","), h = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    horas.add(h);
    if (sp > 0 && h >= hFin) { hFin = h; spFin = sp; }
    if (h !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (K > 0 && bid >= 0 && ask > 0) eh.push({ K, bid, ask, spot: sp });
  }
  return eh.length ? { filas: eh, cierre: spFin, hFin, horas } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

// ── 1 · ¿A QUÉ HORA SE LIQUIDA? ────────────────────────────────────────────
const horasFin = new Map();
const filas = [];
for (const fecha of fechas) {
  const C = leer(fecha, "C"), P = leer(fecha, "P");
  if (!C || !P || !(C.cierre > 0)) continue;
  horasFin.set(C.hFin, (horasFin.get(C.hFin) ?? 0) + 1);
  const spot = C.filas[0].spot; if (!(spot > 0)) continue;
  const cC = cerca(C.filas, spot + 25), pC = cerca(P.filas, spot - 25);
  const cL = cerca(C.filas, cC.K + ALA), pL = cerca(P.filas, pC.K - ALA);
  if (cL.K <= cC.K || pL.K >= pC.K) continue;
  const cred = cC.bid + pC.bid - cL.ask - pL.ask; if (!(cred > 0)) continue;
  const mid = (cC.bid+cC.ask)/2 + (pC.bid+pC.ask)/2 - (cL.bid+cL.ask)/2 - (pL.bid+pL.ask)/2;
  filas.push({ fecha, cred: cred * 100, mid: mid * 100, spot, cierre: C.cierre,
               hqC: cC.ask - cC.bid, hqP: pC.ask - pC.bid, bidC: cC.bid, bidP: pC.bid });
}
console.log(`\n═══ 1 · ¿A QUÉ HORA ACABA EL DATO CON EL QUE SE LIQUIDA? ═══\n`);
for (const [h, n] of [...horasFin].sort((a, b) => b[1] - a[1]).slice(0, 6)) console.log(`   ${h} ET · ${n} días`);
console.log(`\n   (SPXW liquida al CIERRE del índice, 16:00 ET. Si el dato acaba antes, el precio de`);
console.log(`    liquidación NO es el real y el P&L de los días de movimiento fuerte está mal.)`);

// ── 2 · EL CRÉDITO, AÑO A AÑO Y MES A MES DEL ÚLTIMO AÑO ───────────────────
console.log(`\n\n═══ 2 · EL CRÉDITO — ¿DESCRIBE EL MERCADO DE HOY O UNO QUE YA NO EXISTE? ═══\n`);
console.log("| año | días | crédito mediano | crédito medio | mediana de la horquilla vendida |");
console.log("|---|---|---|---|---|");
for (const a of ["2024", "2025", "2026"]) {
  const g = filas.filter((x) => x.fecha.startsWith(a)); if (!g.length) continue;
  console.log(`| ${a} | ${g.length} | ${eur(mediana(g.map((x) => x.cred)))} | ${eur(g.reduce((t,x)=>t+x.cred,0)/g.length)} | $${mediana(g.map((x) => (x.hqC + x.hqP) / 2)).toFixed(2)} |`);
}
console.log(`\n   Últimos 6 meses con datos, mes a mes:`);
const meses = [...new Set(filas.map((x) => x.fecha.slice(0, 7)))].sort().slice(-6);
for (const m of meses) {
  const g = filas.filter((x) => x.fecha.startsWith(m));
  console.log(`     ${m} · ${String(g.length).padStart(2)} días · crédito mediano ${eur(mediana(g.map((x) => x.cred)))}`);
}
console.log(`\n   ⚠️  EL FORWARD TEST EN VIVO COBRA ~$220 DE MEDIANA. Compara con la última fila.`);

// ── 3 · LA HORQUILLA: cuánto se deja en el peaje ───────────────────────────
console.log(`\n\n═══ 3 · CUÁNTO SE DEJA EN LA HORQUILLA ═══\n`);
const dif = filas.map((x) => x.mid - x.cred);
console.log(`   crédito al BID (lo que se ha usado):  mediana ${eur(mediana(filas.map((x) => x.cred)))}`);
console.log(`   crédito al PUNTO MEDIO (optimista):   mediana ${eur(mediana(filas.map((x) => x.mid)))}`);
console.log(`   diferencia: ${eur(mediana(dif))} por operación — ${((mediana(dif) / mediana(filas.map((x)=>x.mid))) * 100).toFixed(0)}% del crédito medio`);
console.log(`\n   (se ha usado el BID, o sea el lado MALO. Si en vivo se llena al medio, se cobra MÁS.)`);
console.log(`\n   patas vendidas con bid por debajo de $0,50 (poco líquidas): ` +
  `${((filas.filter((x) => x.bidC < 0.5 || x.bidP < 0.5).length / filas.length) * 100).toFixed(1)}%`);
