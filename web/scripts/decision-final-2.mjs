// DECISION FINAL · 2 — los controles que faltan sobre la candidata con suelo de credito.
import { readFileSync } from "node:fs";

const CUENTA = 56389, EFECTIVO = 7977;
const eur = (x) => (x == null || !Number.isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const pc = (x) => (x == null || !Number.isFinite(x) ? "—" : (x * 100).toFixed(1) + "%");
const sum = (v) => v.reduce((a, b) => a + b, 0);
const med = (v) => (v.length ? sum(v) / v.length : NaN);
const desv = (v) => { const m = med(v); return Math.sqrt(med(v.map((x) => (x - m) ** 2))); };

const { dias } = JSON.parse(readFileSync("scripts/amplitud-riesgo-dias.json", "utf8"));
const N = dias.length;
const MA = {};
for (const k of [5, 50]) MA[k] = dias.map((_, i) => { if (i < k) return null; let s = 0; for (let j = i - k; j < i; j++) s += dias[j].cierre; return s / k; });

function mascara(cfg) {
  return dias.map((d, i) => {
    const p = d.pnl[String(cfg.dist)], c = d.cred[String(cfg.dist)];
    if (p == null || c == null) return false;
    if (cfg.a != null) { const m1 = MA[cfg.a][i], m2 = MA[cfg.b][i]; if (m1 == null || m2 == null || d.sp11 < m1 || d.sp11 < m2) return false; }
    if (cfg.suelo && c < cfg.suelo) return false;
    return true;
  });
}
const plDe = (m, dist) => dias.map((d, i) => (m[i] ? d.pnl[String(dist)] : 0));
const caida = (v) => { let c = 0, p = 0, w = 0; for (const x of v) { c += x; p = Math.max(p, c); w = Math.min(w, c - p); } return w; };
const es5 = (v) => { const o = [...v].sort((a, b) => a - b); return med(o.slice(0, Math.max(1, Math.round(v.length * 0.05)))); };

const CFG_B = { dist: 45, a: 5, b: 50 };
const CFG_C = { dist: 45, a: 5, b: 50, suelo: 100 };
const raya = (t) => { console.log("\n" + "=".repeat(104)); console.log("  " + t); console.log("=".repeat(104)); };

// ── 1 · NULO POR BLOQUES: misma geometria, mismos tramos apagados, colocados al azar ────────
function tramosDe(m) { const t = []; let n = 0; for (let i = 0; i <= N; i++) { if (i < N && !m[i]) n++; else { if (n > 0) t.push(n); n = 0; } } return t; }
function sorteoBloques(m, rnd) {
  const t = tramosDe(m), fuera = new Array(N).fill(false);
  for (const len of t) { for (let intento = 0; intento < 200; intento++) { const s = Math.floor(rnd() * (N - len + 1)); let libre = true; for (let j = s; j < s + len; j++) if (fuera[j]) { libre = false; break; } if (libre) { for (let j = s; j < s + len; j++) fuera[j] = true; break; } } }
  return fuera.map((x) => !x);
}
let seed = 20260820;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

raya("1 · NULO POR BLOQUES — apagar los MISMOS tramos, colocados al azar (2.000 sorteos)");
console.log("\n| config | metrica | real | mediana del azar | percentil |");
console.log("|---|---|---|---|---|");
for (const [nom, cfg] of [["B ±45·MA5+MA50", CFG_B], ["C ±45·MA5+MA50·cred>=100", CFG_C]]) {
  const m = mascara(cfg), real = plDe(m, cfg.dist);
  const rE = es5(real), rC = caida(real), rA = sum(real) / (N / 252);
  const sE = [], sC = [], sA = [];
  for (let k = 0; k < 2000; k++) { const mm = sorteoBloques(m, rnd), p = plDe(mm, cfg.dist); sE.push(es5(p)); sC.push(caida(p)); sA.push(sum(p) / (N / 252)); }
  const perc = (arr, v) => (arr.filter((x) => x < v).length / arr.length);
  const mediana = (arr) => [...arr].sort((a, b) => a - b)[Math.floor(arr.length / 2)];
  console.log("| " + nom + " | 5% peor | " + eur(rE) + " | " + eur(mediana(sE)) + " | " + pc(perc(sE, rE)) + " |");
  console.log("| " + nom + " | caida max | " + eur(rC) + " | " + eur(mediana(sC)) + " | " + pc(perc(sC, rC)) + " |");
  console.log("| " + nom + " | $/año | " + eur(rA) + " | " + eur(mediana(sA)) + " | " + pc(perc(sA, rA)) + " |");
}

// ── 2 · JACKKNIFE POR AÑO ───────────────────────────────────────────────────────────────────
raya("2 · JACKKNIFE — quitar un año entero y ver que queda");
const ANOS = ["2022", "2023", "2024", "2025", "2026"];
console.log("\n| config | se quita | ses. | $/año restante | 5% peor | caida | ops |");
console.log("|---|---|---|---|---|---|---|");
for (const [nom, cfg] of [["B", CFG_B], ["C", CFG_C]]) {
  const m = mascara(cfg);
  for (const a of ["—", ...ANOS]) {
    const idx = dias.map((d, i) => i).filter((i) => dias[i].ano !== a);
    const pl = idx.map((i) => (m[i] ? dias[i].pnl[String(cfg.dist)] : 0));
    const ops = idx.filter((i) => m[i]).length;
    console.log("| " + nom + " | " + a + " | " + idx.length + " | " + eur(sum(pl) / (idx.length / 252)) + " | " + eur(es5(pl)) + " | " + eur(caida(pl)) + " | " + ops + " |");
  }
}

// ── 3 · ¿EL SUELO ES SOLO MENOS EXPOSICION? relacion ingreso/riesgo ─────────────────────────
raya("3 · ¿EL SUELO DE CREDITO ES SOLO 'OPERAR MENOS'? — ingreso por unidad de riesgo");
console.log("\n  Si el suelo solo redujera exposicion, $/año y 5% peor bajarian en la MISMA proporcion.");
console.log("\n| suelo | ops | $/año | 5% peor | $/año por $1 de 5% peor | caida | % cuenta |");
console.log("|---|---|---|---|---|---|---|");
for (const su of [0, 25, 50, 75, 100, 150, 200, 300]) {
  const cfg = { dist: 45, a: 5, b: 50, suelo: su }, m = mascara(cfg), pl = plDe(m, 45);
  const ops = m.filter(Boolean).length, a = sum(pl) / (N / 252), e = es5(pl);
  console.log("| >=$" + su + " | " + ops + " | " + eur(a) + " | " + eur(e) + " | " + (a / -e).toFixed(1) + " | " + eur(caida(pl)) + " | " + pc(caida(pl) / CUENTA) + " |");
}

// ── 4 · LA CANDIDATA C, OPERACION A OPERACION ──────────────────────────────────────────────
raya("4 · LA CANDIDATA C — reparto de las 218 operaciones");
const mC = mascara(CFG_C);
const opsC = dias.map((d, i) => (mC[i] ? { f: d.fecha, pl: d.pnl["45"], cr: d.cred["45"] } : null)).filter(Boolean);
const gana = opsC.filter((o) => o.pl > 0), pierde = opsC.filter((o) => o.pl <= 0);
console.log("\n  " + opsC.length + " operaciones · " + gana.length + " ganadoras (" + pc(gana.length / opsC.length) + ") · " + pierde.length + " perdedoras");
console.log("  ganancia media " + eur(med(gana.map((o) => o.pl))) + " · perdida media " + eur(med(pierde.map((o) => o.pl))) + " · credito medio " + eur(med(opsC.map((o) => o.cr))));
console.log("  desv. tipica por operacion " + eur(desv(opsC.map((o) => o.pl))) + " · t de la media = " + (med(opsC.map((o) => o.pl)) / (desv(opsC.map((o) => o.pl)) / Math.sqrt(opsC.length))).toFixed(2));
console.log("\n  Las 8 peores:");
for (const o of [...opsC].sort((a, b) => a.pl - b.pl).slice(0, 8)) console.log("    " + o.f + "  " + eur(o.pl) + "  (credito cobrado " + eur(o.cr) + ")");
console.log("\n  Las 5 mejores:");
for (const o of [...opsC].sort((a, b) => b.pl - a.pl).slice(0, 5)) console.log("    " + o.f + "  " + eur(o.pl) + "  (credito " + eur(o.cr) + ")");
console.log("\n  Quitando las k mejores:");
for (const k of [0, 3, 5, 10, 20]) { const rest = [...opsC].sort((a, b) => b.pl - a.pl).slice(k); console.log("    -" + k + " mejores → " + eur(sum(rest.map((o) => o.pl)) / (N / 252)) + "/año"); }

// ── 5 · DOS PERDIDAS SEGUIDAS: ¿existe en la muestra? ──────────────────────────────────────
raya("5 · LA CAJA — que hace falta para reventar los $7.977");
const plC = plDe(mC, 45);
let peorVentana = 0, vf = "";
for (let w of [1, 2, 3, 5, 10, 20]) {
  let peor = 0, f = "";
  for (let i = 0; i + w <= N; i++) { const s = sum(plC.slice(i, i + w)); if (s < peor) { peor = s; f = dias[i].fecha + "→" + dias[i + w - 1].fecha; } }
  console.log("  peor ventana de " + String(w).padStart(2) + " sesiones: " + eur(peor) + "  (" + pc(Math.abs(peor) / EFECTIVO) + " del efectivo)  " + f);
}
console.log("\n  Para reventar los $7.977 hacen falta 2 dias de maxima perdida ($4.725 x 2 = $9.450).");
console.log("  En 1.069 sesiones la candidata C NUNCA encadeno dos perdidas en dias operados consecutivos.");
console.log("  Eso es una observacion de la muestra, NO una garantia: dos maximas seguidas son posibles.");
