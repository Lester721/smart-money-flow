// AUDITORÍA de las 5 reglas que le ganaron al azar en cola-parar-y-volver.mjs
//
// ═══ POR QUÉ HACE FALTA ══════════════════════════════════════════════════════════════════════
// El control del azar del primer script para D días SUELTOS, elegidos uniformemente. Pero las
// reglas que "pasaron" no paran días sueltos: paran BLOQUES CONTIGUOS (el resto del mes, N días
// seguidos). Y la caída máxima es un estadístico de CAMINO: quitar 142 días desperdigados apenas
// deforma la curva acumulada, mientras que quitar 142 días en 20 tramos seguidos la deforma mucho.
// Comparar un bloque contra confeti es comparar contra un control más flojo, y eso infla el
// resultado exactamente igual que un dato con look-ahead.
//
// Aquí se añaden:
//   1. CONTROL DE BLOQUES — mismo número de días parados Y mismo reparto de longitudes de tramo,
//      colocados al azar. Es el control honesto para una regla que para en bloque.
//   2. BONFERRONI SOBRE EL p DEL CONTROL — se hicieron 35 pruebas: el listón es 0,05/35 = 0,0014.
//   3. ANATOMÍA DE LA CAÍDA — de qué está hecho el −$15.176 y si una parada puede tocarlo.
//   4. LOS PEORES DÍAS — qué se veía a las 11:00 de cada uno.

import { readFileSync } from "node:fs";

const SORTEOS = 2000, SEMILLA = 424242, DIAS_ANO = 252, PRUEBAS = 35;
const LISTON_P = 0.05 / PRUEBAS;

const eur = (x) => (x == null || !isFinite(x)) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const pct = (x) => (x * 100).toFixed(2) + "%";

const filas = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8"));
const PL = filas.map((f) => f.pl), N = PL.length;

function metricas(mask) {
  let acum = 0, pico = 0, dd = 0, tot = 0, iPico = 0, iValle = 0, pI = 0;
  const d = [];
  for (let i = 0; i < N; i++) {
    if (mask[i]) { d.push(PL[i]); tot += PL[i]; acum += PL[i]; }
    if (acum > pico) { pico = acum; pI = i; }
    if (pico - acum > dd) { dd = pico - acum; iPico = pI; iValle = i; }
  }
  const o = [...d].sort((a, b) => a - b);
  const q = (p) => (o.length ? o[Math.min(o.length - 1, Math.floor(o.length * p))] : NaN);
  return { opera: d.length, para: N - d.length, tot, porAno: (tot / N) * DIAS_ANO,
           peorDia: o.length ? o[0] : NaN, p1: q(0.01), p5: q(0.05), dd, iPico, iValle };
}
const TODO = new Array(N).fill(true), BASE = metricas(TODO);

// ── LAS MISMAS 5 REGLAS ─────────────────────────────────────────────────────
function mesMalo(X) { const m = new Array(N).fill(true); let mes = "", a = 0, p = false;
  for (let i = 0; i < N; i++) { const k = filas[i].fecha.slice(0, 7);
    if (k !== mes) { mes = k; a = 0; p = false; }
    if (p) { m[i] = false; continue; } m[i] = true; a += PL[i]; if (a < -X) p = true; } return m; }
function trasRacha(R, dias) { const m = new Array(N).fill(true); let r = 0, p = 0;
  for (let i = 0; i < N; i++) { if (p > 0) { m[i] = false; p--; continue; } m[i] = true;
    if (PL[i] < 0) r++; else r = 0; if (r >= R) { p = dias; r = 0; } } return m; }

const CANDIDATAS = [
  { nom: "cerrar el mes tras perder >$2.000 en él", mask: mesMalo(2000) },
  { nom: "cerrar el mes tras perder >$3.000 en él", mask: mesMalo(3000) },
  { nom: "parar 1d tras 3 días perdedores seguidos", mask: trasRacha(3, 1) },
  { nom: "parar 3d tras 3 días perdedores seguidos", mask: trasRacha(3, 3) },
  { nom: "parar 5d tras 3 días perdedores seguidos", mask: trasRacha(3, 5) },
];

// ── CONTROLES ───────────────────────────────────────────────────────────────
let sem = SEMILLA;
const rnd = () => { sem |= 0; sem = (sem + 0x6D2B79F5) | 0;
  let t = Math.imul(sem ^ (sem >>> 15), 1 | sem);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/** Longitudes de los tramos contiguos parados. */
function tramos(mask) {
  const L = []; let c = 0;
  for (let i = 0; i < N; i++) { if (!mask[i]) c++; else if (c) { L.push(c); c = 0; } }
  if (c) L.push(c);
  return L;
}
/** Azar de días SUELTOS (el control del primer script). */
function azarSuelto(k) {
  const idx = [...Array(N).keys()], out = [];
  for (let s = 0; s < SORTEOS; s++) {
    for (let j = 0; j < k; j++) { const r = j + Math.floor(rnd() * (N - j)); const t = idx[j]; idx[j] = idx[r]; idx[r] = t; }
    const m = new Array(N).fill(true); for (let j = 0; j < k; j++) m[idx[j]] = false;
    out.push(metricas(m));
  } return out;
}
/** Azar de BLOQUES: mismas longitudes de tramo, colocadas al azar sin solaparse. */
function azarBloques(L) {
  const out = [];
  for (let s = 0; s < SORTEOS; s++) {
    const m = new Array(N).fill(true);
    for (const len of L) {
      let ok = false;
      for (let intento = 0; intento < 200 && !ok; intento++) {
        const a = Math.floor(rnd() * (N - len + 1));
        let libre = true;
        for (let i = a; i < a + len; i++) if (!m[i]) { libre = false; break; }
        if (libre) { for (let i = a; i < a + len; i++) m[i] = false; ok = true; }
      }
    }
    out.push(metricas(m));
  } return out;
}

console.log("═".repeat(118));
console.log("  AUDITORÍA · " + SORTEOS + " sorteos por control · listón de p con Bonferroni sobre " + PRUEBAS + " pruebas = " + LISTON_P.toFixed(4));
console.log("═".repeat(118));
console.log("\n  BASE: " + eur(BASE.porAno) + "/año · peor día " + eur(BASE.peorDia) + " · peor racha " + eur(BASE.dd) +
            " (" + filas[BASE.iPico].fecha + " → " + filas[BASE.iValle].fecha + ")\n");

console.log("| regla | tramos | días | $/año | peor día | peor racha | p (azar suelto) | p (azar EN BLOQUES) | ¿sobrevive? |");
console.log("|---|---|---|---|---|---|---|---|---|");
const audit = [];
for (const c of CANDIDATAS) {
  const m = metricas(c.mask), L = tramos(c.mask);
  const dom = (ctrl) => ctrl.filter((x) => x.dd <= m.dd && x.porAno >= m.porAno).length / ctrl.length;
  const pS = dom(azarSuelto(m.para)), pB = dom(azarBloques(L));
  const vive = pB < LISTON_P;
  audit.push({ nom: c.nom, m, L, pS, pB, vive });
  console.log("| " + c.nom + " | " + L.length + " (mediana " + [...L].sort((a, b) => a - b)[Math.floor(L.length / 2)] + "d) | " + m.para +
    " | " + eur(m.porAno) + " | " + eur(m.peorDia) + " | " + eur(m.dd) + " | " + pct(pS) + " | **" + pct(pB) + "** | " +
    (vive ? "🟢 SÍ" : "no") + " |");
}

// ── ANATOMÍA DE LA CAÍDA ────────────────────────────────────────────────────
console.log("\n## DE QUÉ ESTÁ HECHA LA PEOR RACHA (" + eur(BASE.dd) + ")\n");
const tramo = filas.slice(BASE.iPico + 1, BASE.iValle + 1);
const plT = tramo.map((f) => f.pl).sort((a, b) => a - b);
const perd = plT.filter((x) => x < 0);
console.log("| medida | valor |");
console.log("|---|---|");
console.log("| días que dura el tramo | " + tramo.length + " (" + tramo[0].fecha + " → " + tramo[tramo.length - 1].fecha + ") |");
console.log("| días perdedores dentro | " + perd.length + " de " + tramo.length + " |");
console.log("| suma de los " + Math.min(3, perd.length) + " peores días del tramo | " + eur(plT.slice(0, 3).reduce((a, b) => a + b, 0)) + " |");
console.log("| ...sobre el total de la caída | " + pct(Math.abs(plT.slice(0, 3).reduce((a, b) => a + b, 0)) / BASE.dd) + " |");
console.log("| días entre el peor y el segundo peor del tramo | " + (() => {
  const ord = tramo.map((f, i) => ({ i, pl: f.pl })).sort((a, b) => a.pl - b.pl);
  return Math.abs(ord[0].i - ord[1].i) + " sesiones"; })() + " |");

console.log("\n## LOS 10 PEORES DÍAS DE LOS 653 — ¿avisaban a las 11:00?\n");
console.log("| fecha | P&L | crédito | mov. mañana % | σ resto sesión | ±25 en σ | VIX ayer | día siguiente |");
console.log("|---|---|---|---|---|---|---|---|");
const VIX = JSON.parse(readFileSync("scripts/cache-theta/vol-indices/VIX.json", "utf8"));
const antVix = (f) => { const d = f.replace(/-/g, ""); const k = Object.keys(VIX).filter((x) => x < d).sort(); return k.length ? VIX[k[k.length - 1]] : null; };
const peores = filas.map((f, i) => ({ ...f, i })).sort((a, b) => a.pl - b.pl).slice(0, 10);
for (const p of peores) {
  const sig = filas[p.i + 1];
  console.log("| " + p.fecha + " | **" + eur(p.pl) + "** | " + eur(p.credito) + " | " + (Math.abs(p.sp11 / p.ap - 1) * 100).toFixed(2) +
    "% | " + p.sigma.toFixed(1) + " | " + (25 / p.sigma).toFixed(2) + "σ | " + (antVix(p.fecha)?.toFixed(2) ?? "—") +
    " | " + (sig ? eur(sig.pl) : "—") + " |");
}
const peorEnRacha = peores.filter((p) => { const a = filas[p.i - 1], b = filas[p.i - 2];
  return a && b && a.pl < 0 && b.pl < 0; }).length;
console.log("\n  De los 10 peores días, " + peorEnRacha + " llegaron después de 2 días perdedores seguidos.");
const trasGrande = peores.filter((p) => filas[p.i - 1] && filas[p.i - 1].pl < -1000).length;
console.log("  De los 10 peores días, " + trasGrande + " llegaron el día después de una pérdida mayor de $1.000.");

console.log("\n## CONCENTRACIÓN: cuánto pesan los peores días sobre el total\n");
const ord = [...PL].sort((a, b) => a - b);
const total = PL.reduce((a, b) => a + b, 0);
console.log("| los N peores días | pierden | % del beneficio total (" + eur(total) + ") |");
console.log("|---|---|---|");
for (const n of [1, 3, 5, 10, 20]) {
  const s = ord.slice(0, n).reduce((a, b) => a + b, 0);
  console.log("| " + n + " | " + eur(s) + " | " + pct(Math.abs(s) / total) + " |");
}

// ── EL TECHO: qué pasaría si un oráculo perfecto quitase los N peores días ──
console.log("\n## EL TECHO DE CUALQUIER REGLA DE PARADA — un oráculo que supiera los peores días\n");
console.log("| oráculo quita | $/año | peor día | peor racha |");
console.log("|---|---|---|---|");
const porPl = filas.map((f, i) => ({ i, pl: f.pl })).sort((a, b) => a.pl - b.pl);
for (const n of [0, 5, 10, 20]) {
  const m = new Array(N).fill(true);
  for (let j = 0; j < n; j++) m[porPl[j].i] = false;
  const x = metricas(m);
  console.log("| los " + n + " peores | " + eur(x.porAno) + " | " + eur(x.peorDia) + " | " + eur(x.dd) + " |");
}
console.log("\n  Ese es el TECHO absoluto, con información del futuro. Ninguna regla real puede pasar de ahí.");
