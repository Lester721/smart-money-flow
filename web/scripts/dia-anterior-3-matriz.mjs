// LA MATRIZ COMPLETA DEL CRUCE — todas las señales de ayer, las dos direcciones, los dos sentidos.
//
// El script 2 elige UN ganador por periodo y eso ya es una decision. Aqui no se elige: se aplica
// TODO a TODO y se enseña la matriz entera, con el control del azar en cada casilla.
//
// Una señal solo cuenta si, con el umbral fijado en un periodo y aplicado sin tocar al otro:
//   (a) reduce la cola en LAS DOS DIRECCIONES, y
//   (b) le gana al azar (percentil >= 95 sobre 500 sorteos que quitan el mismo numero de dias).
// Si (a) sin (b), lo unico que hacia era operar menos — y eso se consigue gratis con menos contratos.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/dia-anterior-3-matriz.mjs

import { readFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";

const F = JSON.parse(readFileSync("scripts/dia-anterior-base.json", "utf8"));

let r = 0;
for (let i = 0; i < F.length; i++) { F[i].rachaHasta = r; r = F[i].pl < 0 ? r + 1 : 0; }
for (let i = 0; i < F.length; i++) {
  const a = F[i - 1], b = F[i - 3], c = F[i - 5];
  F[i].S = {
    plAyer: a ? a.pl : null,
    plAyerRel: a ? a.pl / a.credD : null,
    rotoAyer: a ? a.roto : null,
    rotoIntraAyer: a ? a.rotoIntra : null,
    rangoAyerPct: a ? (a.hi - a.lo) / a.sp11 * 100 : null,
    rangoAyerSig: a ? (a.hi - a.lo) / a.straddle : null,
    penAyerSig: a ? a.penCierre / a.straddle : null,
    racha: F[i].rachaHasta,
    mov3Pct: (a && b) ? Math.abs(a.cierre / b.cierre - 1) * 100 : null,
    mov5Pct: (a && c) ? Math.abs(a.cierre / c.cierre - 1) * 100 : null,
    mov3Sig: (a && b) ? Math.abs(a.cierre - b.cierre) / a.straddle : null,
    mov5Sig: (a && c) ? Math.abs(a.cierre - c.cierre) / a.straddle : null,
    caida3Pct: (a && b) ? (a.cierre / b.cierre - 1) * 100 : null,
    camino3Pct: (a && b) ? [1, 2, 3].reduce((s, k) => s + (F[i - k] && F[i - k - 1] ? Math.abs(F[i - k].cierre / F[i - k - 1].cierre - 1) * 100 : 0), 0) : null,
    ivAyer: a ? a.ivATM : null,
  };
}
const BASE = F.filter((d) => Object.values(d.S).every((v) => v != null));

const eur = (x) => (x == null || !Number.isFinite(x)) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const rachaMax = (v) => { let c = 0, p = 0; for (const x of v) { c = Math.min(0, c + x); p = Math.min(p, c); } return p; };
const cuant = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };

function metricas(pl, nTotal) {
  const o = [...pl].sort((a, b) => a - b);
  const k5 = Math.max(1, Math.floor(o.length * 0.05));
  return {
    n: pl.length,
    ano: pl.reduce((a, b) => a + b, 0) / (nTotal / 252),
    peor: o[0] ?? 0,
    p1: o[Math.floor(o.length * 0.01)] ?? 0,
    p5: o[Math.floor(o.length * 0.05)] ?? 0,
    es5: media(o.slice(0, k5)),
    p2000: pl.filter((x) => x < -2000).length / nTotal,
    racha: rachaMax(pl),
  };
}

const SEÑALES = [
  ["plAyer", "P&L de ayer ($)"],
  ["plAyerRel", "P&L de ayer / credito"],
  ["rotoAyer", "ayer rompio una pata"],
  ["rotoIntraAyer", "ayer toco un corto intradia"],
  ["rangoAyerPct", "rango de ayer (%)"],
  ["rangoAyerSig", "rango de ayer / straddle"],
  ["penAyerSig", "penetracion de ayer / straddle"],
  ["racha", "dias seguidos perdiendo"],
  ["mov3Pct", "|mov 3 dias| (%)"],
  ["mov5Pct", "|mov 5 dias| (%)"],
  ["mov3Sig", "|mov 3 dias| / straddle"],
  ["mov5Sig", "|mov 5 dias| / straddle"],
  ["caida3Pct", "mov 3 dias CON SIGNO (%)"],
  ["camino3Pct", "camino de 3 dias (%)"],
  ["ivAyer", "IV del dinero de ayer"],
];
const CUANTILES = [0.10, 0.20, 0.30, 0.40];
const PRUEBAS = SEÑALES.length * 2 * CUANTILES.length * 2;
const LISTON = listonT(PRUEBAS);

const A = BASE.filter((d) => d.fecha < "2024-01-01");
const B = BASE.filter((d) => d.fecha >= "2024-01-01");

// ── control del azar, cacheado por (periodo, nº de dias quitados) ──────────────
let semilla = 20260820;
const rnd = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; };
const cacheAzar = new Map();
function azar(P, etiqueta, k) {
  const key = etiqueta + "|" + k;
  if (cacheAzar.has(key)) return cacheAzar.get(key);
  const pls = P.map((d) => d.pl);
  const out = { racha: [], p5: [], es5: [], ano: [], p2000: [] };
  for (let s = 0; s < 500; s++) {
    const idx = [...pls.keys()];
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const quitar = new Set(idx.slice(0, k));
    const m = metricas(pls.filter((_, i) => !quitar.has(i)), pls.length);
    out.racha.push(m.racha); out.p5.push(m.p5); out.es5.push(m.es5); out.ano.push(m.ano); out.p2000.push(m.p2000);
  }
  for (const kk of Object.keys(out)) out[kk].sort((a, b) => a - b);
  cacheAzar.set(key, out);
  return out;
}
const percentil = (arr, v, mayorEsMejor) => {
  const menores = arr.filter((x) => x < v).length / arr.length;
  return mayorEsMejor ? menores : 1 - menores;
};

function evaluar(k, dir, u, Q, etq) {
  const opera = (d) => (dir === "alto" ? d.S[k] < u : d.S[k] > u);
  const dentro = Q.filter(opera), fuera = Q.filter((d) => !opera(d));
  if (fuera.length < 5 || dentro.length < Q.length * 0.3) return null;
  const base = metricas(Q.map((d) => d.pl), Q.length);
  const m = metricas(dentro.map((d) => d.pl), Q.length);
  const az = azar(Q, etq, fuera.length);
  return {
    nSalta: fuera.length, base, m,
    dRacha: Math.abs(base.racha) - Math.abs(m.racha),
    dAno: m.ano - base.ano,
    dEs5: m.es5 - base.es5,
    dP2000: base.p2000 - m.p2000,
    ratio: (Math.abs(base.racha) - Math.abs(m.racha)) > 0 ? (base.ano - m.ano) / (Math.abs(base.racha) - Math.abs(m.racha)) : Infinity,
    pctRacha: percentil(az.racha, m.racha, true),
    pctEs5: percentil(az.es5, m.es5, true),
    pctAno: percentil(az.ano, m.ano, true),
  };
}

console.log("\n" + "=".repeat(120));
console.log(`  MATRIZ DEL CRUCE · A = 2022-2023 (${A.length} dias) · B = 2024-2026 (${B.length}) · ${PRUEBAS} pruebas -> liston |t| = ${LISTON}`);
console.log("  Umbral fijado en un periodo (NUMERO, no cuantil) y aplicado sin tocar al otro.");
console.log("=".repeat(120));

const filas = [];
for (const [k, nom] of SEÑALES) {
  for (const dir of ["alto", "bajo"]) {
    for (const q of CUANTILES) {
      const uA = dir === "alto" ? cuant(A.map((d) => d.S[k]), 1 - q) : cuant(A.map((d) => d.S[k]), q);
      const uB = dir === "alto" ? cuant(B.map((d) => d.S[k]), 1 - q) : cuant(B.map((d) => d.S[k]), q);
      const AB = evaluar(k, dir, uA, B, "B");     // ajustado en A, probado en B
      const BA = evaluar(k, dir, uB, A, "A");     // ajustado en B, probado en A
      if (!AB || !BA) continue;
      filas.push({ k, nom, dir, q, uA, uB, AB, BA });
    }
  }
}

// ── criterio de supervivencia, escrito antes de mirar ─────────────────────────
const sobrevive = (f) =>
  f.AB.dRacha > 0 && f.BA.dRacha > 0 &&                   // corta la caida en las dos direcciones
  f.AB.dEs5 > 0 && f.BA.dEs5 > 0 &&                       // corta la cola (ES5) en las dos
  f.AB.pctRacha >= 0.95 && f.BA.pctRacha >= 0.95;         // y le gana al azar en las dos

console.log(`\n## TODAS LAS CASILLAS QUE CORTAN LA CAIDA EN LAS DOS DIRECCIONES\n`);
const dosDir = filas.filter((f) => f.AB.dRacha > 0 && f.BA.dRacha > 0);
console.log(`  ${dosDir.length} de ${filas.length} casillas reducen la peor racha en los DOS sentidos del cruce.\n`);
console.log("| señal | salta | q | umbral A | A->B racha | A->B $/anio | A->B pct azar | umbral B | B->A racha | B->A $/anio | B->A pct azar | sobrevive |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const f of dosDir) {
  console.log(`| ${f.nom} | ${f.dir} | ${Math.round(f.q * 100)}% | ${f.uA.toFixed(3)} | ${eur(f.AB.dRacha)} | ${eur(f.AB.dAno)} | ${(f.AB.pctRacha * 100).toFixed(0)}% | ${f.uB.toFixed(3)} | ${eur(f.BA.dRacha)} | ${eur(f.BA.dAno)} | ${(f.BA.pctRacha * 100).toFixed(0)}% | ${sobrevive(f) ? "SI" : "no"} |`);
}

const ganadores = filas.filter(sobrevive);
console.log(`\n  CASILLAS QUE SOBREVIVEN LAS TRES CONDICIONES (racha + cola + azar, en las dos direcciones): ${ganadores.length}`);
for (const f of ganadores) console.log(`    -> ${f.nom} · salta ${f.dir} · q${Math.round(f.q * 100)}`);

// ── las señales que Lester nombro, dichas una por una ─────────────────────────
console.log(`\n## LAS SEÑALES QUE PIDIO, UNA POR UNA (mejor casilla de cada una, la que mas caida corta en A->B)\n`);
console.log("| señal | mejor direccion | A->B: racha | cola ES5 | $/anio | pct azar | B->A: racha | cola ES5 | $/anio | pct azar |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const [k, nom] of SEÑALES) {
  const c = filas.filter((f) => f.k === k).sort((a, b) => b.AB.dRacha - a.AB.dRacha)[0];
  if (!c) { console.log(`| ${nom} | — | — | — | — | — | — | — | — | — |`); continue; }
  console.log(`| ${nom} | salta ${c.dir} q${Math.round(c.q * 100)} | ${eur(c.AB.dRacha)} | ${eur(c.AB.dEs5)} | ${eur(c.AB.dAno)} | ${(c.AB.pctRacha * 100).toFixed(0)}% | ${eur(c.BA.dRacha)} | ${eur(c.BA.dEs5)} | ${eur(c.BA.dAno)} | ${(c.BA.pctRacha * 100).toFixed(0)}% |`);
}

// ── el diagnostico: ¿la direccion elegida en A coincide con la elegida en B? ───
console.log(`\n## EL DIAGNOSTICO — la direccion que elige cada periodo, señal por señal\n`);
console.log("  Si A dice 'salta alto' y B dice 'salta bajo' para la misma señal, no hay patron: hay ruido con dos caras.\n");
console.log("| señal | A prefiere | mejora racha en A | B prefiere | mejora racha en B | coinciden? |");
console.log("|---|---|---|---|---|---|");
let coinciden = 0, total = 0;
for (const [k, nom] of SEÑALES) {
  const mejorEn = (P, etq) => {
    let best = null;
    for (const dir of ["alto", "bajo"]) for (const q of CUANTILES) {
      const u = dir === "alto" ? cuant(P.map((d) => d.S[k]), 1 - q) : cuant(P.map((d) => d.S[k]), q);
      const e = evaluar(k, dir, u, P, etq);
      if (e && (!best || e.dRacha > best.dRacha)) best = { dir, q, e };
    }
    return best;
  };
  const ea = mejorEn(A, "A"), eb = mejorEn(B, "B");
  if (!ea || !eb) continue;
  total++;
  const ok = ea.dir === eb.dir;
  if (ok) coinciden++;
  console.log(`| ${nom} | salta ${ea.dir} | ${eur(ea.e.dRacha)} | salta ${eb.dir} | ${eur(eb.e.dRacha)} | ${ok ? "si" : "NO"} |`);
}
console.log(`\n  coinciden ${coinciden} de ${total} señales (si fuese azar puro se esperaria ~${(total / 2).toFixed(0)})`);
