// EL DIA ANTERIOR, CON LA REGLA DE HIERRO — se elige en un periodo y se aplica TAL CUAL al otro.
//
// Señales, todas observables ANTES de las 11:00 de hoy y todas ADIMENSIONALES (la lección del
// filtro de amplitud: un umbral en puntos se endurece solo porque el indice va de 4.000 a 7.000):
//   · P&L de ayer ($ y en multiplos del credito de ayer)
//   · si ayer se rompio una pata (al cierre y en intradia)
//   · rango de ayer (% del indice y en multiplos del straddle de ayer)
//   · racha de dias seguidos perdiendo
//   · movimiento acumulado de 3 y 5 dias (neto y de camino)
//
// PROTOCOLO, escrito antes de mirar nada:
//   1. En el periodo de AJUSTE, para cada señal y cada direccion, se prueban los umbrales en los
//      cuantiles 10/20/30/40% de ese periodo. Se guarda el NUMERO, no el cuantil.
//   2. Gana el que MINIMIZA "$ de ingreso perdido por $ de peor racha eliminada", exigiendo que
//      la peor racha mejore al menos un 10%.
//   3. Ese NUMERO se aplica tal cual al otro periodo. Sin tocar nada.
//   4. Se repite al reves.
//   5. Control: quitar el MISMO NUMERO de dias al azar, 500 sorteos, en el periodo de prueba.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/dia-anterior-2-cruce.mjs

import { readFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { listonT } from "../lib/barreraHallazgos";

const F = JSON.parse(readFileSync("scripts/dia-anterior-base.json", "utf8"));
const CUENTA = 56389;

// ── construir las señales del DIA ANTERIOR ────────────────────────────────────
// racha de perdidas terminada AYER
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
console.log(`dias con las 15 señales completas: ${BASE.length} de ${F.length} (se pierden los primeros por el retardo de 5 dias)`);

const plano = BASE.map((d) => ({ ...d.S, pl: d.pl, fecha: d.fecha, ticker: "SPXW" }));
radiografia(plano, ["plAyer", "plAyerRel", "rangoAyerPct", "rangoAyerSig", "penAyerSig",
  "mov3Pct", "mov5Pct", "mov3Sig", "mov5Sig", "caida3Pct", "camino3Pct", "ivAyer", "pl"],
  "señales del dia anterior", { maxCeros: 0.35, cerosLegitimos: ["penAyerSig"] });

// ── utilidades ────────────────────────────────────────────────────────────────
const eur = (x) => (x == null || !Number.isFinite(x)) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const varz = (v) => { const m = media(v); return v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1); };
const tW = (a, b) => (a.length < 3 || b.length < 3) ? NaN : (media(a) - media(b)) / Math.sqrt(varz(a) / a.length + varz(b) / b.length);
const rachaMax = (v) => { let c = 0, p = 0; for (const x of v) { c = Math.min(0, c + x); p = Math.min(p, c); } return p; };
const cuant = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };

function metricas(dias, nTotal) {
  const pl = dias.map((d) => d.pl);
  const anos = nTotal / 252;
  const o = [...pl].sort((a, b) => a - b);
  return {
    n: pl.length,
    ano: pl.reduce((a, b) => a + b, 0) / anos,
    peor: o.length ? o[0] : 0,
    p1: o.length ? o[Math.floor(o.length * 0.01)] : 0,
    p5: o.length ? o[Math.floor(o.length * 0.05)] : 0,
    p2000: pl.filter((x) => x < -2000).length / nTotal,   // sobre el calendario, no sobre los operados
    p4000: pl.filter((x) => x < -4000).length / nTotal,
    racha: rachaMax(pl),
  };
}

const SEÑALES = [
  ["plAyer", "P&L de ayer ($)"],
  ["plAyerRel", "P&L de ayer / credito de ayer"],
  ["rotoAyer", "ayer rompio una pata al cierre (0/1)"],
  ["rotoIntraAyer", "ayer toco un corto intradia (0/1)"],
  ["rangoAyerPct", "rango de ayer (% del indice)"],
  ["rangoAyerSig", "rango de ayer / straddle de ayer"],
  ["penAyerSig", "penetracion de ayer / straddle de ayer"],
  ["racha", "dias seguidos perdiendo"],
  ["mov3Pct", "|movimiento 3 dias| (%)"],
  ["mov5Pct", "|movimiento 5 dias| (%)"],
  ["mov3Sig", "|movimiento 3 dias| / straddle"],
  ["mov5Sig", "|movimiento 5 dias| / straddle"],
  ["caida3Pct", "movimiento 3 dias CON SIGNO (%)"],
  ["camino3Pct", "camino recorrido en 3 dias (%)"],
  ["ivAyer", "IV del dinero de ayer"],
];
const CUANTILES = [0.10, 0.20, 0.30, 0.40];
const PRUEBAS = SEÑALES.length * 2 * CUANTILES.length * 2;   // señales x direcciones x umbrales x 2 sentidos del cruce
const LISTON = listonT(PRUEBAS);

const A = BASE.filter((d) => d.fecha < "2024-01-01");
const B = BASE.filter((d) => d.fecha >= "2024-01-01");

console.log("\n" + "=".repeat(104));
console.log(`  REGLA DE HIERRO · A = 2022-2023 (${A.length} dias) · B = 2024-2026 (${B.length} dias) · ${PRUEBAS} pruebas -> liston |t| = ${LISTON}`);
console.log("=".repeat(104));

// ── el ajuste dentro de un periodo ────────────────────────────────────────────
function ajustar(P, etiqueta) {
  const base = metricas(P, P.length);
  const cands = [];
  for (const [k, nom] of SEÑALES) {
    const vals = P.map((d) => d.S[k]);
    for (const dir of ["alto", "bajo"]) {
      for (const q of CUANTILES) {
        // "alto": se SALTA el tramo alto de la señal -> umbral = cuantil (1-q)
        // "bajo": se SALTA el tramo bajo -> umbral = cuantil q
        const u = dir === "alto" ? cuant(vals, 1 - q) : cuant(vals, q);
        const opera = (d) => (dir === "alto" ? d.S[k] < u : d.S[k] > u);
        const dentro = P.filter(opera);
        const fuera = P.filter((d) => !opera(d));
        if (dentro.length < P.length * 0.5 || fuera.length < 10) continue;
        const m = metricas(dentro, P.length);
        const caidaElim = Math.abs(base.racha) - Math.abs(m.racha);
        const ingPerd = base.ano - m.ano;
        cands.push({
          k, nom, dir, q, u, m, caidaElim, ingPerd,
          ratio: caidaElim > 0 ? ingPerd / caidaElim : Infinity,
          nSalta: fuera.length,
          t: tW(dentro.map((d) => d.pl), fuera.map((d) => d.pl)),
        });
      }
    }
  }
  // criterio declarado: mejora la peor racha >= 10% y minimiza $ perdidos por $ de caida eliminada
  const validos = cands.filter((c) => c.caidaElim >= Math.abs(base.racha) * 0.10);
  validos.sort((a, b) => a.ratio - b.ratio);
  console.log(`\n### AJUSTE EN ${etiqueta} · base: ${eur(base.ano)}/anio · peor racha ${eur(base.racha)} · p5 ${eur(base.p5)}\n`);
  console.log(`  candidatos que reducen la peor racha >=10%: ${validos.length} de ${cands.length}`);
  console.log("\n| # | señal | direccion | salta | umbral | $/anio | peor racha | p5 | $perdido / $caida |");
  console.log("|---|---|---|---|---|---|---|---|---|");
  for (const c of validos.slice(0, 8)) {
    console.log(`| ${validos.indexOf(c) + 1} | ${c.nom} | salta ${c.dir} | ${c.nSalta} (${Math.round(c.nSalta / P.length * 100)}%) | ${c.u.toFixed(4)} | ${eur(c.m.ano)} | ${eur(c.m.racha)} | ${eur(c.m.p5)} | ${c.ratio === Infinity ? "—" : "$" + c.ratio.toFixed(2)} |`);
  }
  return { base, elegido: validos[0] ?? null, cands };
}

// ── aplicar tal cual ──────────────────────────────────────────────────────────
let semilla = 20260820;
const rnd = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; };

function aplicar(c, Q, etiqueta) {
  const baseQ = metricas(Q, Q.length);
  const opera = (d) => (c.dir === "alto" ? d.S[c.k] < c.u : d.S[c.k] > c.u);
  const dentro = Q.filter(opera), fuera = Q.filter((d) => !opera(d));
  const m = metricas(dentro, Q.length);
  const caidaElim = Math.abs(baseQ.racha) - Math.abs(m.racha);
  const ingPerd = baseQ.ano - m.ano;

  console.log(`\n### APLICADO TAL CUAL A ${etiqueta}  —  ${c.nom} · salta ${c.dir} · umbral ${c.u.toFixed(4)}\n`);
  console.log("| metrica | base | con el filtro | cambio |");
  console.log("|---|---|---|---|");
  const fila = (nom, a, b, fmt = eur, mejorSiSube = true) => {
    const mejor = mejorSiSube ? b > a : b < a;
    console.log(`| ${nom} | ${fmt(a)} | ${fmt(b)} | ${b === a ? "=" : mejor ? "MEJORA" : "empeora"} |`);
  };
  const pc = (x) => (x * 100).toFixed(2) + "%";
  console.log(`| dias operados | ${baseQ.n} | ${m.n} (salta ${fuera.length}) | — |`);
  fila("$/anio", baseQ.ano, m.ano);
  fila("peor dia", baseQ.peor, m.peor);
  fila("p1", baseQ.p1, m.p1);
  fila("p5", baseQ.p5, m.p5);
  fila("P(perdida > $2.000)", baseQ.p2000, m.p2000, pc, false);
  fila("P(perdida > $4.000)", baseQ.p4000, m.p4000, pc, false);
  fila("peor racha", baseQ.racha, m.racha);
  console.log(`\n  $ de ingreso perdido por $ de caida eliminada: ${caidaElim > 0 ? "$" + (ingPerd / caidaElim).toFixed(2) : "la caida NO mejora (" + eur(caidaElim) + ")"}`);
  console.log(`  t (dias operados vs saltados) = ${c.t != null ? tW(dentro.map((d) => d.pl), fuera.map((d) => d.pl)).toFixed(2) : "—"}  ·  liston ${LISTON}`);

  // ── control del azar: quitar el MISMO numero de dias, 500 sorteos ────────────
  const k = fuera.length;
  const sim = { racha: [], p5: [], ano: [], p2000: [] };
  for (let s = 0; s < 500; s++) {
    const idx = [...Q.keys()];
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const quitar = new Set(idx.slice(0, k));
    const dd = Q.filter((_, i) => !quitar.has(i));
    const mm = metricas(dd, Q.length);
    sim.racha.push(mm.racha); sim.p5.push(mm.p5); sim.ano.push(mm.ano); sim.p2000.push(mm.p2000);
  }
  const pct = (arr, v, mayorEsMejor) => {
    const s = [...arr].sort((a, b) => a - b);
    const menores = s.filter((x) => x < v).length;
    return mayorEsMejor ? menores / s.length : 1 - menores / s.length;
  };
  console.log(`\n  CONTROL DEL AZAR — quitar ${k} dias al azar, 500 sorteos (percentil = que fraccion del azar bate el filtro)`);
  console.log("\n| metrica | filtro | mediana del azar | mejor sorteo del azar | percentil del filtro |");
  console.log("|---|---|---|---|---|");
  const sr = [...sim.racha].sort((a, b) => a - b), sp = [...sim.p5].sort((a, b) => a - b), sa = [...sim.ano].sort((a, b) => a - b);
  console.log(`| peor racha | ${eur(m.racha)} | ${eur(sr[250])} | ${eur(sr[499])} | ${(pct(sim.racha, m.racha, true) * 100).toFixed(0)}% |`);
  console.log(`| p5 | ${eur(m.p5)} | ${eur(sp[250])} | ${eur(sp[499])} | ${(pct(sim.p5, m.p5, true) * 100).toFixed(0)}% |`);
  console.log(`| $/anio | ${eur(m.ano)} | ${eur(sa[250])} | ${eur(sa[499])} | ${(pct(sim.ano, m.ano, true) * 100).toFixed(0)}% |`);

  return { baseQ, m, caidaElim, ingPerd, ratio: caidaElim > 0 ? ingPerd / caidaElim : Infinity,
    pctRacha: pct(sim.racha, m.racha, true), pctAno: pct(sim.ano, m.ano, true) };
}

const rA = ajustar(A, "A = 2022-2023");
const oAB = rA.elegido ? aplicar(rA.elegido, B, "B = 2024-2026") : null;
const rB = ajustar(B, "B = 2024-2026");
const oBA = rB.elegido ? aplicar(rB.elegido, A, "A = 2022-2023") : null;

console.log("\n" + "=".repeat(104));
console.log("  VEREDICTO DEL CRUCE");
console.log("=".repeat(104));
const ok = (o) => o && o.caidaElim > 0 && o.ingPerd < Math.abs(o.baseQ.ano) * 0.5;
console.log(`  A -> B : ${rA.elegido ? rA.elegido.nom + " (salta " + rA.elegido.dir + ", umbral " + rA.elegido.u.toFixed(4) + ")" : "ningun candidato"}`);
if (oAB) console.log(`           caida eliminada ${eur(oAB.caidaElim)} · ingreso perdido ${eur(oAB.ingPerd)}/anio · ${ok(oAB) ? "FUNCIONA" : "NO FUNCIONA"}`);
console.log(`  B -> A : ${rB.elegido ? rB.elegido.nom + " (salta " + rB.elegido.dir + ", umbral " + rB.elegido.u.toFixed(4) + ")" : "ningun candidato"}`);
if (oBA) console.log(`           caida eliminada ${eur(oBA.caidaElim)} · ingreso perdido ${eur(oBA.ingPerd)}/anio · ${ok(oBA) ? "FUNCIONA" : "NO FUNCIONA"}`);
console.log(`\n  SOBREVIVE AL CRUCE EN LAS DOS DIRECCIONES: ${ok(oAB) && ok(oBA) ? "SI" : "NO"}`);
console.log(`\n  (cuenta de referencia $${CUENTA.toLocaleString("es-ES")})`);
