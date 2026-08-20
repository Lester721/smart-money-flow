// POR QUE AYER NO SIRVE — el mecanismo, no la correlacion. Y que le faltaria para servir.
//
// Tres cosas:
//   1. EL LISTON DEL AZAR: cuanto tiene que cortar un filtro de "ayer" para ser distinguible de
//      tirar un dado. Sin este numero, "reduce la peor racha $3.000" no significa nada.
//   2. LA CADENA: ayer -> rango de hoy -> credito de hoy -> P&L de hoy. Si el rango se hereda y
//      el credito lo acompaña, el P&L no se mueve, y eso EXPLICA los 19 fracasos.
//   3. LA POTENCIA: si no hay efecto, ¿es que no lo hay o es que la muestra no lo veria?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/dia-anterior-4-mecanismo.mjs

import { readFileSync } from "node:fs";
import { potencia, listonT } from "../lib/barreraHallazgos";

const F = JSON.parse(readFileSync("scripts/dia-anterior-base.json", "utf8"));
let r = 0;
for (let i = 0; i < F.length; i++) { F[i].rachaHasta = r; r = F[i].pl < 0 ? r + 1 : 0; }
for (let i = 0; i < F.length; i++) {
  const a = F[i - 1], b = F[i - 3], c = F[i - 5];
  F[i].rangoPct = (F[i].hi - F[i].lo) / F[i].sp11 * 100;
  F[i].S = a && b && c ? {
    plAyer: a.pl, plAyerRel: a.pl / a.credD, rotoAyer: a.roto, rotoIntraAyer: a.rotoIntra,
    rangoAyerPct: (a.hi - a.lo) / a.sp11 * 100, rangoAyerSig: (a.hi - a.lo) / a.straddle,
    penAyerSig: a.penCierre / a.straddle, racha: F[i].rachaHasta,
    mov3Pct: Math.abs(a.cierre / b.cierre - 1) * 100, mov5Pct: Math.abs(a.cierre / c.cierre - 1) * 100,
    mov3Sig: Math.abs(a.cierre - b.cierre) / a.straddle, mov5Sig: Math.abs(a.cierre - c.cierre) / a.straddle,
    caida3Pct: (a.cierre / b.cierre - 1) * 100,
    camino3Pct: [1, 2, 3].reduce((s, k) => s + (F[i - k] && F[i - k - 1] ? Math.abs(F[i - k].cierre / F[i - k - 1].cierre - 1) * 100 : 0), 0),
    ivAyer: a.ivATM,
  } : null;
}
const BASE = F.filter((d) => d.S);
const A = BASE.filter((d) => d.fecha < "2024-01-01");
const B = BASE.filter((d) => d.fecha >= "2024-01-01");

const eur = (x) => (x == null || !Number.isFinite(x)) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const varz = (v) => { const m = media(v); return v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1); };
const rachaMax = (v) => { let c = 0, p = 0; for (const x of v) { c = Math.min(0, c + x); p = Math.min(p, c); } return p; };
const corr = (a, b) => { const ma = media(a), mb = media(b); let n = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return n / Math.sqrt(da * db); };
const tCorr = (r, n) => r * Math.sqrt(n - 2) / Math.sqrt(1 - r * r);
const LISTON = listonT(240);

// ═══ 1 · EL LISTON DEL AZAR ═══════════════════════════════════════════════════
console.log("\n" + "=".repeat(104));
console.log("  1 · EL LISTON DEL AZAR — cuanto corta la caida el simple hecho de operar menos dias");
console.log("=".repeat(104));
console.log("\n  Quitar dias AL AZAR ya reduce la peor racha. Un filtro de 'ayer' solo cuenta si corta MAS");
console.log("  que el percentil 95 de esos sorteos. Ese es el numero que hay que batir.\n");
let semilla = 20260820;
const rnd = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; };
console.log("| periodo | peor racha base | % dias saltados | mediana del azar | p95 del azar | LISTON: hay que cortar mas de |");
console.log("|---|---|---|---|---|---|");
const LISTONES = {};
for (const [et, P] of [["A = 2022-2023", A], ["B = 2024-2026", B], ["TODO", BASE]]) {
  const pls = P.map((d) => d.pl);
  const base = rachaMax(pls);
  for (const frac of [0.10, 0.20, 0.30, 0.40]) {
    const k = Math.round(pls.length * frac);
    const sim = [];
    for (let s = 0; s < 1000; s++) {
      const idx = [...pls.keys()];
      for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      const q = new Set(idx.slice(0, k));
      sim.push(rachaMax(pls.filter((_, i) => !q.has(i))));
    }
    sim.sort((a, b) => a - b);
    const p95 = sim[949], med = sim[499];
    LISTONES[et + "|" + frac] = Math.abs(base) - Math.abs(p95);
    console.log(`| ${et} | ${eur(base)} | ${Math.round(frac * 100)}% | ${eur(med)} (corta ${eur(Math.abs(base) - Math.abs(med))}) | ${eur(p95)} | **${eur(Math.abs(base) - Math.abs(p95))}** |`);
  }
}

// ═══ 2 · LA CADENA: ayer -> rango de hoy -> credito -> P&L ════════════════════
console.log("\n" + "=".repeat(104));
console.log("  2 · LA CADENA — se hereda la VOLATILIDAD, pero el credito la cobra y el P&L no se entera");
console.log("=".repeat(104));
console.log("\n| periodo | corr(rango ayer, rango HOY) | t | corr(rango ayer, credito HOY) | t | corr(rango ayer, P&L HOY) | t |");
console.log("|---|---|---|---|---|---|---|");
for (const [et, P] of [["A = 2022-2023", A], ["B = 2024-2026", B], ["TODO", BASE]]) {
  const x = P.map((d) => d.S.rangoAyerPct);
  const c1 = corr(x, P.map((d) => d.rangoPct));
  const c2 = corr(x, P.map((d) => d.credD));
  const c3 = corr(x, P.map((d) => d.pl));
  console.log(`| ${et} | ${c1.toFixed(3)} | ${tCorr(c1, x.length).toFixed(2)} | ${c2.toFixed(3)} | ${tCorr(c2, x.length).toFixed(2)} | ${c3.toFixed(3)} | ${tCorr(c3, x.length).toFixed(2)} |`);
}
console.log(`\n  liston |t| = ${LISTON} (240 pruebas)\n`);

console.log("\n  TERCIOS POR EL RANGO DE AYER — que hereda cada tercio\n");
console.log("| periodo | tercio del rango de ayer | n | rango de HOY (%) | credito de HOY | penetracion max HOY | P&L HOY | P&L / credito | P(perdida>$2.000) |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const [et, P] of [["A = 2022-2023", A], ["B = 2024-2026", B]]) {
  const ord = [...P].sort((a, b) => a.S.rangoAyerPct - b.S.rangoAyerPct);
  const k = Math.floor(ord.length / 3);
  for (const [nom, g] of [["1 mas tranquilo", ord.slice(0, k)], ["2 medio", ord.slice(k, 2 * k)], ["3 mas movido", ord.slice(2 * k)]]) {
    console.log(`| ${et} | ${nom} | ${g.length} | ${media(g.map((d) => d.rangoPct)).toFixed(2)}% | ${eur(media(g.map((d) => d.credD)))} | ${media(g.map((d) => d.penMax)).toFixed(1)} pts | ${eur(media(g.map((d) => d.pl)))} | ${(media(g.map((d) => d.pl)) / media(g.map((d) => d.credD))).toFixed(2)} | ${(g.filter((d) => d.pl < -2000).length / g.length * 100).toFixed(1)}% |`);
  }
}

// ═══ 3 · LA POTENCIA ══════════════════════════════════════════════════════════
console.log("\n" + "=".repeat(104));
console.log("  3 · POTENCIA — si no vemos nada, ¿es que no hay nada o es que la muestra no lo veria?");
console.log("=".repeat(104));
for (const [et, P] of [["A = 2022-2023", A], ["B = 2024-2026", B], ["TODO", BASE]]) {
  const filas = P.map((d) => ({ pnl: d.pl, ticker: "SPXW", fecha: d.fecha }));
  // el efecto que importaria: separar $250/dia entre el tercio bueno y el malo (~$63.000/anio)
  const p = potencia(filas, 250);
  console.log(`\n  ${et} (n=${P.length}): separacion minima detectable entre tercios = ${eur(p.detectable)}/dia` +
    `  ->  ${eur(p.detectable * 252 / 3)}/anio de diferencia`);
  console.log(`     ${p.concluyente ? "un negativo AQUI SI es concluyente" : "un negativo aqui NO es concluyente"} frente a un efecto de $250/dia`);
}

// ═══ 4 · EL DIAGNOSTICO ARREGLADO ═════════════════════════════════════════════
const SEÑALES = [["plAyer", "P&L de ayer ($)"], ["plAyerRel", "P&L de ayer / credito"],
  ["rotoAyer", "ayer rompio una pata"], ["rotoIntraAyer", "ayer toco un corto intradia"],
  ["rangoAyerPct", "rango de ayer (%)"], ["rangoAyerSig", "rango de ayer / straddle"],
  ["penAyerSig", "penetracion de ayer / straddle"], ["racha", "dias seguidos perdiendo"],
  ["mov3Pct", "|mov 3 dias| (%)"], ["mov5Pct", "|mov 5 dias| (%)"],
  ["mov3Sig", "|mov 3 dias| / straddle"], ["mov5Sig", "|mov 5 dias| / straddle"],
  ["caida3Pct", "mov 3 dias CON SIGNO (%)"], ["camino3Pct", "camino de 3 dias (%)"],
  ["ivAyer", "IV del dinero de ayer"]];
const CUANTILES = [0.10, 0.20, 0.30, 0.40];
const cuant = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };

console.log("\n" + "=".repeat(104));
console.log("  4 · QUE DIRECCION ELIGE CADA PERIODO — si A dice 'salta los movidos' y B dice 'salta los");
console.log("      tranquilos' para la misma señal, no hay patron: hay ruido con dos caras.");
console.log("=".repeat(104));
console.log("\n| señal | A elige | corta en A | B elige | corta en B | coinciden? |");
console.log("|---|---|---|---|---|---|");
let coinciden = 0, total = 0;
for (const [k, nom] of SEÑALES) {
  const mejorEn = (P) => {
    const pls = P.map((d) => d.pl), base = rachaMax(pls);
    let best = null;
    for (const dir of ["alto", "bajo"]) for (const q of CUANTILES) {
      const u = dir === "alto" ? cuant(P.map((d) => d.S[k]), 1 - q) : cuant(P.map((d) => d.S[k]), q);
      const dentro = P.filter((d) => (dir === "alto" ? d.S[k] < u : d.S[k] > u));
      if (dentro.length < P.length * 0.5) continue;
      const corta = Math.abs(base) - Math.abs(rachaMax(dentro.map((d) => d.pl)));
      if (!best || corta > best.corta) best = { dir, q, corta };
    }
    return best;
  };
  const ea = mejorEn(A), eb = mejorEn(B);
  if (!ea || !eb) continue;
  total++;
  const ok = ea.dir === eb.dir;
  if (ok) coinciden++;
  console.log(`| ${nom} | salta ${ea.dir} q${Math.round(ea.q * 100)} | ${eur(ea.corta)} | salta ${eb.dir} q${Math.round(eb.q * 100)} | ${eur(eb.corta)} | ${ok ? "si" : "NO"} |`);
}
console.log(`\n  coinciden ${coinciden} de ${total} (si fuese moneda al aire se esperarian ~${(total / 2).toFixed(1)})`);
