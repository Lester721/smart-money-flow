// ANATOMÍA 3 · LA CURVA DE LA DISTANCIA CONTRA LA COLA — el candidato, medido en serio.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/anatomia-distancia-cola.mjs
//
// ═══ QUÉ SE VIENE ARRASTRANDO ═════════════════════════════════════════════════════════════
//
// anatomia-lados.mjs   → el daño está REPARTIDO (46% call / 54% put, t pareada −0,87). No hay
//                        lado malo que quitar. Quitar uno cuesta 3,5–28 $/año por $ de caída.
// anatomia-alas.mjs    → el peor día ES el colateral: pérdida máxima = (ancho − crédito) × 100.
//                        Estrechar alas no reduce la cola A IGUAL CAPITAL, la empeora (hay que
//                        meter más contratos). Lo único que movió la cola fue ALEJAR LOS DOS
//                        STRIKES A LA VEZ, y de forma monótona.
//
// Aquí se mide esa única cosa que quedó viva, con grano fino y con las cribas puestas:
//   · la curva entera de la distancia (±25 … ±50), alas fijas en 50, un contrato
//   · tercio a tercio, para ver si el efecto vive en un solo período
//   · bootstrap por bloques de 10 días, pareado, para saber si la caída menor es real o suerte
//
// Precios reales, entrada 11:00 ET, liquidación al cierre real, $0,03 por pata. Los strikes se
// eligen con el spot de las 11:00: nada de lo que decide la entrada mira al futuro.

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { listonT } from "../lib/barreraHallazgos";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00", COMM = 0.03, ALA = 50;
const DIST = [25, 28, 30, 32, 35, 38, 40, 45, 50];
const PRUEBAS = 11 + 25 + DIST.length;   // lados + rejilla de alas + esta curva

function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const [iK, iT, iB, iA, iU] = ["strike", "timestamp", "bid", "ask", "underlying_price"].map((c) => cab.indexOf(c));
  if ([iK, iT, iB, iA, iU].some((x) => x < 0)) return null;
  const enHora = []; let spotFin = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(","), hora = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && hora >= hFin) { hFin = hora; spotFin = sp; }
    if (hora !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask, spot: sp });
  }
  return enHora.length ? { filas: enHora, cierre: spotFin } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));
const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const sd = (v) => { const m = media(v); return Math.sqrt(suma(v.map((x) => (x - m) ** 2)) / (v.length - 1)); };
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))]; };
const eur = (x) => (x < 0 ? "−$" : "$") + Math.round(Math.abs(x)).toLocaleString("es-ES");
function ddPico(pls) { let a = 0, p = 0, w = 0; for (const x of pls) { a += x; p = Math.max(p, a); w = Math.min(w, a - p); } return w; }
function ddCero(pls) { let c = 0, w = 0; for (const x of pls) { c = Math.min(0, c + x); w = Math.min(w, c); } return w; }

const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();
const serie = new Map(DIST.map((d) => [d, []]));
const dias = [];
for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P || !(C.cierre > 0)) continue;
  const spot = C.filas[0].spot; if (!(spot > 0)) continue;
  const S = C.cierre;
  const fila = {};
  for (const d of DIST) {
    const cC = cerca(C.filas, spot + d), pC = cerca(P.filas, spot - d);
    const cL = cerca(C.filas, cC.K + ALA), pL = cerca(P.filas, pC.K - ALA);
    if (cL.K <= cC.K || pL.K >= pC.K) { fila.malo = true; break; }
    const cred = cC.bid + pC.bid - cL.ask - pL.ask;
    if (!(cred > 0)) { fila.malo = true; break; }
    const aC = cL.K - cC.K, aP = pC.K - pL.K;
    fila[d] = {
      pl: (cred - Math.min(Math.max(S - cC.K, 0), aC) - Math.min(Math.max(pC.K - S, 0), aP)) * 100 - 8 * COMM,
      credito: cred * 100, colateral: (Math.max(aC, aP) - cred) * 100,
      danoCall: Math.min(Math.max(S - cC.K, 0), aC) * 100, danoPut: Math.min(Math.max(pC.K - S, 0), aP) * 100,
    };
  }
  if (fila.malo || DIST.some((d) => !fila[d])) continue;
  dias.push(fecha);
  for (const d of DIST) serie.get(d).push({ fecha, ...fila[d] });
}

console.log(`\n═══ LA CURVA DE LA DISTANCIA CONTRA LA COLA · alas ${ALA} · 1 contrato · entrada ${HORA} ET ═══`);
console.log(`\n${dias.length} días · ${dias[0]} → ${dias[dias.length - 1]}\n`);
radiografia(serie.get(25).map((x) => ({ ...x })), ["pl", "credito", "colateral", "danoCall", "danoPut"], "±25 alas 50",
  { cerosLegitimos: ["danoCall", "danoPut"] });

function stats(ops) {
  const pls = ops.map((x) => x.pl), total = suma(pls);
  return { n: pls.length, total, alAno: total / (pls.length / 252), medio: media(pls),
    acierto: pls.filter((x) => x > 0).length / pls.length, credito: media(ops.map((x) => x.credito)),
    peorDia: Math.min(...pls), p1: pct(pls, 0.01), p5: pct(pls, 0.05), p10: pct(pls, 0.10),
    ddPico: ddPico(pls), ddCero: ddCero(pls), pls };
}
const R = new Map(DIST.map((d) => [d, stats(serie.get(d))]));
const B = R.get(25);

console.log(`\n── LA CURVA ENTERA ──`);
console.log("| distancia | crédito medio | acierto | $/año | % del ingreso base | PEOR día | p1 | p5 | p10 | caída pico-valle | caída desde 0 |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const d of DIST) {
  const r = R.get(d);
  console.log(`| ±${d} | ${eur(r.credito)} | ${(r.acierto * 100).toFixed(0)}% | ${eur(r.alAno)} | ${((r.alAno / B.alAno) * 100).toFixed(0)}% | ${eur(r.peorDia)} | ${eur(r.p1)} | ${eur(r.p5)} | ${eur(r.p10)} | ${eur(r.ddPico)} | ${eur(r.ddCero)} |`);
}

console.log(`\n── LA MÉTRICA QUE DECIDE ($/año perdidos por $ de caída eliminado · negativo = GRATIS, mejora las dos) ──`);
console.log("| distancia | ingreso perdido $/año | caída eliminada | $/año por $ de caída | p5 eliminado | $/año por $ de p5 |");
console.log("|---|---|---|---|---|---|");
for (const d of DIST) {
  if (d === 25) continue;
  const r = R.get(d), perd = B.alAno - r.alAno;
  const elimDD = Math.abs(B.ddPico) - Math.abs(r.ddPico), elimP5 = Math.abs(B.p5) - Math.abs(r.p5);
  console.log(`| ±${d} | ${eur(perd)} | ${eur(elimDD)} | ${elimDD !== 0 ? (perd / elimDD).toFixed(2) : "—"} | ${eur(elimP5)} | ${elimP5 !== 0 ? (perd / elimP5).toFixed(2) : "—"} |`);
}

// ── TERCIOS ──
const k3 = Math.floor(dias.length / 3);
const trozos = [0, 1, 2].map((i) => (i < 2 ? [i * k3, (i + 1) * k3] : [2 * k3, dias.length]));
console.log(`\n── TERCIO A TERCIO (¿vive el efecto en un solo período?) ──`);
console.log(`| distancia | ${trozos.map((t, i) => `T${i + 1} ${dias[t[0]]}→${dias[t[1] - 1]}`).join(" | ")} |`);
console.log(`|---|---|---|---|`);
for (const d of DIST) {
  const r = R.get(d);
  console.log(`| ±${d} $/año | ${trozos.map(([a, b]) => { const g = r.pls.slice(a, b); return eur(suma(g) / (g.length / 252)); }).join(" | ")} |`);
}
console.log(`|---|---|---|---|`);
for (const d of DIST) {
  const r = R.get(d);
  console.log(`| ±${d} caída | ${trozos.map(([a, b]) => eur(ddPico(r.pls.slice(a, b)))).join(" | ")} |`);
}
const signos = {};
for (const d of DIST) {
  if (d === 25) continue;
  const r = R.get(d);
  signos[d] = trozos.map(([a, b]) => (Math.abs(ddPico(r.pls.slice(a, b))) < Math.abs(ddPico(B.pls.slice(a, b))) ? "+" : "−")).join("");
}
console.log(`\nSigno por tercios de la MEJORA DE CAÍDA frente a ±25 (+ = caída menor ese tercio):`);
for (const d of DIST) if (d !== 25) console.log(`  ±${d}: ${signos[d]}`);

// ── BOOTSTRAP POR BLOQUES, pareado ──
function boot(A, C, iter = 6000, bl = 10) {
  const n = A.length, nb = Math.ceil(n / bl);
  let mDD = 0, mPeor = 0, mTot = 0, mP5 = 0;
  for (let it = 0; it < iter; it++) {
    const a = [], c = [];
    for (let b = 0; b < nb; b++) { const i0 = Math.floor(Math.random() * n); for (let j = 0; j < bl && a.length < n; j++) { const i = (i0 + j) % n; a.push(A[i]); c.push(C[i]); } }
    if (Math.abs(ddPico(c)) < Math.abs(ddPico(a))) mDD++;
    if (Math.min(...c) > Math.min(...a)) mPeor++;
    if (suma(c) > suma(a)) mTot++;
    if (pct(c, 0.05) > pct(a, 0.05)) mP5++;
  }
  return { pDD: mDD / iter, pPeor: mPeor / iter, pTot: mTot / iter, pP5: mP5 / iter };
}
console.log(`\n── BOOTSTRAP POR BLOQUES (6.000 remuestreos de bloques de 10 días, pareado contra ±25) ──`);
console.log("| distancia | P(caída menor) | P(p5 menos malo) | P(peor día menos malo) | P(gana MÁS dinero que ±25) |");
console.log("|---|---|---|---|---|");
const boots = {};
for (const d of DIST) {
  if (d === 25) continue;
  const b = boot(B.pls, R.get(d).pls); boots[d] = b;
  console.log(`| ±${d} | ${(b.pDD * 100).toFixed(0)}% | ${(b.pP5 * 100).toFixed(0)}% | ${(b.pPeor * 100).toFixed(0)}% | ${(b.pTot * 100).toFixed(0)}% |`);
}

// ── t pareada del P&L: ¿pierde ingreso de forma medible? ──
console.log(`\n── ¿ES MEDIBLE LA PÉRDIDA DE INGRESO? (t pareada del P&L diario contra ±25) ──`);
console.log(`Listón de Bonferroni con ${PRUEBAS} pruebas: |t| ≥ ${listonT(PRUEBAS)}`);
console.log("| distancia | diferencia media $/día | t pareada | ¿supera el listón? |");
console.log("|---|---|---|---|");
const ts = {};
for (const d of DIST) {
  if (d === 25) continue;
  const dif = R.get(d).pls.map((x, i) => x - B.pls[i]);
  const t = media(dif) / (sd(dif) / Math.sqrt(dif.length)); ts[d] = t;
  console.log(`| ±${d} | ${eur(media(dif))} | ${t.toFixed(2)} | ${Math.abs(t) >= listonT(PRUEBAS) ? "SÍ" : "no"} |`);
}

// ── LOS 10 PEORES DÍAS: ¿los mismos? ──
console.log(`\n── LOS 10 PEORES DÍAS DE ±25 Y QUÉ HABRÍAN DADO A ±35 ──`);
const peores = [...serie.get(25)].map((x, i) => ({ ...x, i })).sort((a, b) => a.pl - b.pl).slice(0, 10);
console.log("| fecha | ±25 | ±30 | ±35 | ±40 | lado que perdió a ±25 |");
console.log("|---|---|---|---|---|---|");
for (const p of peores) {
  console.log(`| ${p.fecha} | ${eur(p.pl)} | ${eur(serie.get(30)[p.i].pl)} | ${eur(serie.get(35)[p.i].pl)} | ${eur(serie.get(40)[p.i].pl)} | ${p.danoCall > p.danoPut ? "CALL (subió)" : "PUT (bajó)"} |`);
}

writeFileSync("scripts/anatomia-distancia-salida.json", JSON.stringify({
  dias: dias.length, periodo: [dias[0], dias[dias.length - 1]], pruebas: PRUEBAS, liston: listonT(PRUEBAS),
  curva: Object.fromEntries(DIST.map((d) => [d, { ...R.get(d), pls: undefined }])),
  signosTercios: signos, bootstrap: boots, tPareada: ts,
}, null, 2));
console.log(`\n(detalle en scripts/anatomia-distancia-salida.json)`);
