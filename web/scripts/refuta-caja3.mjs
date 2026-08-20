// REFUTACIÓN CAJA · PARTE 3 — el supuesto que nadie ha tocado, y una relectura del CSV crudo.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/refuta-caja3.mjs
//
// 1. EL MANTENIMIENTO DEL 30%. Toda la conclusión "no hay llamada de margen" cuelga de un número
//    que el autor escribe sin fuente: MANT = 0,30, o sea que Robinhood te deja pedir prestado el
//    70% del valor de HOOD. HOOD es el 85% de la cuenta y es una acción volátil; los brókers
//    suben el mantenimiento en posiciones concentradas. Aquí se barre 30-40-50-60-75%.
// 2. EL PERCENTIL DE LO REPORTADO. ¿Dónde cae "caja mínima −$766" entre los 1.049 arranques?
// 3. RELECTURA DEL CSV CRUDO. Se recalcula el P&L de los 10 peores días y de 10 al azar, pata a
//    pata, desde scripts/cache-theta/gex-2026/, sin tocar la caché.
//
// PRUEBAS DECLARADAS: 3 geometrías × 2 tamaños × 5 mantenimientos = 30.

import { readFileSync, existsSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";

const EFECTIVO = 7977, HOOD_HOY = 48135, BP0 = 73874, INT = 0.05, PRUEBAS = 30;
const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const D = JSON.parse(readFileSync("scripts/cuanto-aguanta-dias.json", "utf8")).dias;
console.log(`Listón con ${PRUEBAS} pruebas declaradas: |t| ≥ ${listonT(PRUEBAS).toFixed(2)}\n`);

const CFG = [
  { id: "A", nom: "cóndor de HOY  ±25/50", ala: 50, pl: (d) => d.A.pl, abre: () => true },
  { id: "B", nom: "FILTRO AMPLITUD ±30/50", ala: 50, pl: (d) => d.B.pl, abre: (d) => d.opera === true },
  { id: "C", nom: "por STRADDLE 2,3×/30", ala: 30, pl: (d) => d.C.pl, abre: () => true },
];

function caja(cfg, n, dias, mant) {
  const linea = -(1 - mant) * HOOD_HOY, colat = cfg.ala * 100 * n;
  let c = EFECTIVO, min = EFECTIVO, fMin = dias[0].fecha, interes = 0, diasRojo = 0, llam = null, prev = dias[0].fecha;
  for (const d of dias) {
    const nd = Math.max(0, (new Date(d.fecha + "T00:00:00Z") - new Date(prev + "T00:00:00Z")) / 86400000); prev = d.fecha;
    if (c < 0 && nd > 0) { const i2 = c * INT * nd / 365; interes += i2; c += i2; }
    if (cfg.abre(d) && colat <= BP0 + (c - EFECTIVO)) c += cfg.pl(d) * n;
    if (c < min) { min = c; fMin = d.fecha; }
    if (c < 0) diasRojo++;
    if (c < linea && !llam) llam = d.fecha;
  }
  return { min, fMin, interes, diasRojo, llam, final: c };
}

// ── 1 · EL BARRIDO DE MANTENIMIENTO ─────────────────────────────────────────────────────────
console.log("### 1 · ¿DE QUÉ DEPENDE «no hay llamada»? DEL 30% QUE EL AUTOR ESCRIBIÓ SIN FUENTE\n");
const MANTS = [0.30, 0.40, 0.50, 0.60, 0.75];
console.log("| geometría | ctr | " + MANTS.map((m) => `mant. ${m * 100}% (línea ${eur(-(1 - m) * HOOD_HOY)})`).join(" | ") + " |");
console.log("|---|---|" + MANTS.map(() => "---").join("|") + "|");
for (const cfg of CFG) for (const n of [1, 2]) {
  const fila = MANTS.map((m) => {
    // el peor de los 1.049 arranques con ese mantenimiento
    let peorLlam = null, cuantos = 0;
    for (let i = 0; i < D.length - 20; i++) { const r = caja(cfg, n, D.slice(i), m); if (r.llam) { cuantos++; if (!peorLlam) peorLlam = r.llam; } }
    const base = caja(cfg, n, D, m);
    return cuantos ? `**${cuantos}/1049**${base.llam ? " (y el original)" : ""}` : "0/1049";
  });
  console.log(`| ${cfg.nom} | ${n} | ${fila.join(" | ")} |`);
}

// ── 2 · EL PERCENTIL DE LO REPORTADO ────────────────────────────────────────────────────────
console.log("\n\n### 2 · DÓNDE CAE EL NÚMERO QUE SE REPORTA ENTRE LOS 1.049 ARRANQUES POSIBLES\n");
console.log("| geometría | ctr | reportado | percentil de esa caja mínima | mediana | peor | días en rojo reportados | días en rojo p90 |");
console.log("|---|---|---|---|---|---|---|---|");
for (const cfg of CFG) for (const n of [1, 2]) {
  const mins = [], rojos = [];
  for (let i = 0; i < D.length - 20; i++) { const r = caja(cfg, n, D.slice(i), 0.30); mins.push(r.min); rojos.push(r.diasRojo); }
  const base = caja(cfg, n, D, 0.30);
  const peores = mins.filter((x) => x < base.min).length;
  const sm = [...mins].sort((a, b) => a - b), sr = [...rojos].sort((a, b) => a - b);
  console.log(`| ${cfg.nom} | ${n} | ${eur(base.min)} | **p${(peores / mins.length * 100).toFixed(0)}** (${peores} arranques son peores) | ${eur(sm[Math.floor(sm.length / 2)])} | ${eur(sm[0])} | ${base.diasRojo} | ${sr[Math.floor(sr.length * 0.9)]} |`);
}

// ── 3 · RELECTURA DEL CSV CRUDO ─────────────────────────────────────────────────────────────
console.log("\n\n### 3 · RELECTURA DEL CSV CRUDO — se recalcula el cóndor ±25/50 pata a pata, sin la caché\n");
const DIR = "scripts/cache-theta/gex-2026", HORA = "11:00", COMM = 0.03;
function crudo(fecha) {
  const lee = (r) => {
    const f = `${DIR}/iv_${fecha}_${r}.csv`;
    if (!existsSync(f)) return null;
    const lin = readFileSync(f, "utf8").trim().split("\n");
    const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
    const [iK, iT, iB, iA, iU] = ["strike", "timestamp", "bid", "ask", "underlying_price"].map((c) => cab.indexOf(c));
    const filas = []; let cierre = 0, hFin = "";
    for (let j = 1; j < lin.length; j++) {
      const c = lin[j].split(","), h = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
      if (sp > 0 && h >= hFin) { hFin = h; cierre = sp; }
      if (h === HORA) { const K = Number(c[iK]), b = Number(c[iB]), a = Number(c[iA]); if (K > 0 && b >= 0 && a > 0) filas.push({ K, b, a, sp }); }
    }
    return { filas, cierre, hFin };
  };
  const C = lee("C"), P = lee("P");
  if (!C || !P || !C.filas.length) return null;
  const sp = C.filas[0].sp, cerca = (f, o) => f.reduce((x, y) => (Math.abs(y.K - o) < Math.abs(x.K - o) ? y : x));
  const cC = cerca(C.filas, sp + 25), pC = cerca(P.filas, sp - 25);
  const cL = cerca(C.filas, cC.K + 50), pL = cerca(P.filas, pC.K - 50);
  const cred = cC.b + pC.b - cL.a - pL.a, S = C.cierre;
  const perdC = Math.min(Math.max(S - cC.K, 0), cL.K - cC.K), perdP = Math.min(Math.max(pC.K - S, 0), pC.K - pL.K);
  return { pl: (cred - perdC - perdP) * 100 - 8 * COMM, sp, cierre: S, hFin: C.hFin, kc: cC.K, kp: pC.K, cred: cred * 100 };
}

const orden = [...D].sort((a, b) => a.A.pl - b.A.pl);
const muestra = [...orden.slice(0, 10), ...Array.from({ length: 10 }, (_, i) => D[Math.floor((i + 0.5) * D.length / 10)])];
console.log("| fecha | P&L en caché | P&L releído del CSV | dif | hora de la última marca | spot 11:00 | cierre usado |");
console.log("|---|---|---|---|---|---|---|");
let maxDif = 0;
for (const d of muestra) {
  const r = crudo(d.fecha);
  const dif = r ? Math.abs(r.pl - d.A.pl) : NaN;
  if (isFinite(dif) && dif > maxDif) maxDif = dif;
  console.log(`| ${d.fecha} | ${eur(d.A.pl)} | ${r ? eur(r.pl) : "—"} | ${isFinite(dif) ? dif.toFixed(4) : "—"} | ${r ? r.hFin : "—"} | ${r ? r.sp.toFixed(2) : "—"} | ${r ? r.cierre.toFixed(2) : "—"} |`);
}
console.log(`\n**diferencia máxima en ${muestra.length} días releídos: ${maxDif.toFixed(4)}**`);

// ── 4 · ¿A QUÉ HORA ACABA EL FICHERO? (el "cierre" no es la liquidación oficial) ─────────────
console.log("\n\n### 4 · LA MARCA QUE SE USA COMO CIERRE — reparto de la hora de la última cotización\n");
const horas = {};
for (const d of muestra) { const r = crudo(d.fecha); if (r) horas[r.hFin] = (horas[r.hFin] || 0) + 1; }
console.log(Object.entries(horas).sort().map(([h, c]) => `${h}: ${c}`).join(" · "));
console.log("(SPXW liquida con el valor del índice al cierre; si la última marca no es la de las 16:00 el P&L usa un índice distinto del de liquidación)");

// ── 5 · EL COSTE QUE NO ESTÁ EN NINGUNA TABLA: Robinhood Gold ───────────────────────────────
console.log("\n\n### 5 · UN COSTE REAL QUE NO APARECE EN NINGUNA TABLA DEL HALLAZGO\n");
const anos = (new Date(D[D.length - 1].fecha) - new Date(D[0].fecha)) / 86400000 / 365.25;
console.log(`El interés del 5% es la tarifa de Robinhood **Gold**, que cuesta $5/mes. En ${anos.toFixed(2)} años son ${eur(5 * 12 * anos)}`);
console.log(`= ${eur(5 * 12)}/año. Sobre el cóndor de 1 contrato (${eur(caja(CFG[0], 1, D, 0.30).final - EFECTIVO)} en total) es un ${(5 * 12 * anos / (caja(CFG[0], 1, D, 0.30).final - EFECTIVO) * 100).toFixed(2)}%.`);
console.log(`Es pequeño, pero el hallazgo presume de contar $0,03 de tasas por pata y este no está.`);
