// ANATOMÍA 2 · ADDENDUM — LO QUE SEÑALA LA ANATOMÍA: el ANCHO DEL ALA.
//
// ═══ POR QUÉ ESTE ADDENDUM ════════════════════════════════════════════════════════════════════
// La anatomía (scripts/anatomia-2-cola.mjs) encuentra que la cola NO es una distribución gorda:
// es un TOPE MECÁNICO. La pérdida máxima del cóndor es (ala × 100 − crédito). 23 días de 653
// (3,5%) tocaron ese tope y aportan el 34,7% de toda la pérdida. Y los 20 peores días NO vienen
// en racimos (p≈0,70-1,00 contra el azar), así que ningún filtro de "hoy no opero" los va a
// esquivar: llegan sueltos.
//
// Si la cola es un tope, el tope se mueve moviendo el ALA. Eso no es un filtro de régimen ni una
// regla de gestión — son las 17 y las 30 cosas que ya se midieron y fallaron. Es la ESPECIFICACIÓN.
//
// ═══ QUÉ SE MIDE ══════════════════════════════════════════════════════════════════════════════
// El mismo cóndor, los mismos 653 días, la misma entrada a las 11:00 y el mismo cierre real de
// las 16:00. Sólo cambia el ala: 10, 15, 20, 25, 30, 40 y 50 puntos (50 = la base actual).
// Precios REALES: bid de lo vendido, ask de lo comprado, las cuatro patas. $0,03 por pata.
//
// Un ala más estrecha cuesta dinero: el largo está más cerca del dinero y su ASK es más caro.
// La pregunta es exactamente la del encargo: **$/año retenidos por cada dólar de caída eliminado**.
//
// PRUEBAS: 6 anchos nuevos (10/15/20/25/30/40) sobre los 6 ya declarados en anatomia-2-cola.mjs
// → divisor total 12. El listón se recalcula con 12, no con 6.

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";
import { radiografia } from "../lib/radiografia";

const DIR = "scripts/cache-theta/gex-2026";
const CACHE = "scripts/anatomia-2-ala-filas.json";
const HORA = "11:00", SEP = 25, COMM = 0.03, DIAS_ANO = 252;
const ALAS = [10, 15, 20, 25, 30, 40, 50];
const PRUEBAS = 12;
const LISTON = listonT(PRUEBAS);

const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const pct = (x) => (x * 100).toFixed(1) + "%";
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);

function leerDia(fecha, right) {
  const f = DIR + "/iv_" + fecha + "_" + right + ".csv";
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = ["strike", "timestamp", "bid", "ask", "implied_vol", "underlying_price"].map((c) => cab.indexOf(c));
  if (idx.some((x) => x < 0)) throw new Error("faltan columnas en " + f);
  const [iK, iT, iB, iA, iV, iU] = idx;
  const enHora = [], camino = new Map();
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    const h = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0) camino.set(h, sp);
    if (h !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]), iv = Number(c[iV]);
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask, iv });
  }
  return enHora.length ? { filas: enHora, camino } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

let filas;
if (existsSync(CACHE)) {
  filas = JSON.parse(readFileSync(CACHE, "utf8"));
  console.log("## " + filas.length + " días leídos de caché");
} else {
  const fechas = [...new Set(readdirSync(DIR).map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean))].sort();
  console.log("## leyendo " + fechas.length + " días de cadenas crudas…");
  filas = [];
  for (let i = 0; i < fechas.length; i++) {
    const fecha = fechas[i];
    if (i % 100 === 0) console.log("   " + i + "/" + fechas.length + " · " + fecha);
    const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
    if (!C || !P) continue;
    const horas = [...C.camino.keys()].sort();
    const cierre = C.camino.get(horas[horas.length - 1]), sp11 = C.camino.get(HORA);
    if (!(cierre > 0) || !(sp11 > 0)) continue;
    const cC = cerca(C.filas, sp11 + SEP), pC = cerca(P.filas, sp11 - SEP);
    const fila = { fecha, cierre, sp11, kC: cC.K, kP: pC.K };
    for (const ALA of ALAS) {
      const cL = cerca(C.filas, cC.K + ALA), pL = cerca(P.filas, pC.K - ALA);
      // el ala TIENE que estar por fuera del corto; si la cadena no llega, se dice, no se rellena
      if (cL.K <= cC.K || pL.K >= pC.K) { fila["a" + ALA] = null; continue; }
      const anchoC = cL.K - cC.K, anchoP = pC.K - pL.K;
      const cred = cC.bid + pC.bid - cL.ask - pL.ask;
      const pl = (cred - Math.min(Math.max(cierre - cC.K, 0), anchoC)
                       - Math.min(Math.max(pC.K - cierre, 0), anchoP)) * 100 - 8 * COMM;
      fila["a" + ALA] = { pl, cred: cred * 100, anchoC, anchoP };
    }
    filas.push(fila);
  }
  writeFileSync(CACHE, JSON.stringify(filas), "utf8");
  console.log("   guardado: " + filas.length + " días");
}

// EL GUARDIÁN sobre los campos planos que van a decidir
const planas = filas.map((f) => ({ cierre: f.cierre, sp11: f.sp11, kC: f.kC, kP: f.kP,
  pl50: f["a50"] ? f["a50"].pl : null, cred50: f["a50"] ? f["a50"].cred : null,
  pl10: f["a10"] ? f["a10"].pl : null, cred10: f["a10"] ? f["a10"].cred : null }));
radiografia(planas, ["cierre", "sp11", "kC", "kP", "pl50", "cred50", "pl10", "cred10"], "cóndor por ancho de ala", { maxCeros: 0.2 });

// ── control de paridad con la medición original ──────────────────────────────
const base = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8"));
const porFechaBase = new Map(base.map((f) => [f.fecha, f]));
let maxD = 0, comparados = 0;
for (const f of filas) {
  const b = porFechaBase.get(f.fecha);
  if (!b || !f["a50"]) continue;
  maxD = Math.max(maxD, Math.abs(f["a50"].pl - b.pl)); comparados++;
}
console.log("\n## PARIDAD con regimen-filas.json (ala 50): " + comparados + " días comparados, Δ máximo " + maxD.toFixed(6));
if (maxD > 0.01) throw new Error("el ala 50 NO reproduce la medición original. Se para aquí.");

// ── métricas por ancho ───────────────────────────────────────────────────────
const ANOS = filas.length / DIAS_ANO;
function metricas(campo) {
  const ops = [], saltados = [];
  for (const f of filas) {
    const x = f[campo];
    if (!x) { saltados.push({ fecha: f.fecha, por: "la cadena no llega al ala" }); continue; }
    if (!(x.cred > 0)) { saltados.push({ fecha: f.fecha, por: "crédito ≤ 0" }); continue; }
    ops.push({ fecha: f.fecha, pl: x.pl, cred: x.cred });
  }
  const v = ops.map((o) => o.pl);
  const total = v.reduce((a, b) => a + b, 0);
  const ord = [...v].sort((a, b) => a - b);
  const q = (p) => ord[Math.max(0, Math.min(ord.length - 1, Math.floor(ord.length * p)))];
  // curva sobre el CALENDARIO COMPLETO: los días sin operación suman 0
  const m = new Map(ops.map((o) => [o.fecha, o.pl]));
  let acc = 0, pico = 0, peor = 0, ini = null, fin = null, picoF = filas[0].fecha, iniF = null;
  for (const f of filas) {
    acc += m.get(f.fecha) ?? 0;
    if (acc > pico) { pico = acc; picoF = f.fecha; }
    if (acc - pico < peor) { peor = acc - pico; iniF = picoF; fin = f.fecha; }
  }
  ini = iniF;
  return { n: ops.length, saltados: saltados.length, motivos: saltados, total, alAno: total / ANOS,
    media: total / ops.length, peorDia: ord[0], p1: q(0.01), p5: q(0.05), dd: peor, ddIni: ini, ddFin: fin,
    acierto: v.filter((x) => x > 0).length / v.length, credMedio: media(ops.map((o) => o.cred)),
    ops };
}

const M = {};
for (const A of ALAS) M[A] = metricas("a" + A);
const B = M[50];

console.log("\n" + "═".repeat(112));
console.log("  EL ANCHO DEL ALA · mismos 653 días, misma entrada 11:00, precios reales · listón |t| = " + LISTON + " (12 pruebas)");
console.log("═".repeat(112));
console.log("\n| ala | días operados | días SIN operar (crédito ≤0) | crédito medio | pérdida MÁX teórica | acierto | por op | **al año** | peor día | p1 | p5 | **peor racha** |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const A of ALAS) {
  const m = M[A];
  console.log("| " + A + " pts | " + m.n + " | " + m.saltados + " | " + eur(m.credMedio) + " | " + eur(-(A * 100 - m.credMedio)) + " | " +
    pct(m.acierto) + " | " + eur(m.media) + " | **" + eur(m.alAno) + "** | " + eur(m.peorDia) + " | " + eur(m.p1) + " | " + eur(m.p5) +
    " | **" + eur(m.dd) + "** |");
}

console.log("\n## LA MÉTRICA QUE DECIDE — $/año retenidos por cada dólar de caída eliminado\n");
console.log("| ala | al año | $/año PERDIDOS vs base | peor racha | $ de racha ELIMINADOS | **$ de racha por cada $/año pagado** | peor día | $ de peor día eliminados |");
console.log("|---|---|---|---|---|---|---|---|");
for (const A of ALAS) {
  const m = M[A];
  const costeIngreso = B.alAno - m.alAno;
  const ddElim = m.dd - B.dd;                 // >0 = racha menos honda
  const pdElim = m.peorDia - B.peorDia;
  const ratio = costeIngreso > 0 ? ddElim / costeIngreso : (ddElim > 0 ? Infinity : NaN);
  console.log("| " + A + " pts | " + eur(m.alAno) + " | " + (costeIngreso >= 0 ? eur(costeIngreso) : "**gana " + eur(-costeIngreso) + "**") +
    " | " + eur(m.dd) + " | " + eur(ddElim) + " | " + (A === 50 ? "— (base)" : (isFinite(ratio) ? ratio.toFixed(2) + "$/$" : (ddElim > 0 ? "∞ (sale gratis)" : "—"))) +
    " | " + eur(m.peorDia) + " | " + eur(pdElim) + " |");
}

console.log("\n## ¿DÓNDE SE PIERDE EL INGRESO? — crédito cobrado contra pérdida evitada\n");
console.log("| ala | crédito medio | Δ crédito vs ala 50 | días al TOPE (ala rota entera) | pérdida de esos días | % de la pérdida bruta |");
console.log("|---|---|---|---|---|---|");
for (const A of ALAS) {
  const m = M[A];
  const tope = m.ops.filter((o) => o.pl <= o.cred - A * 100 - 0.24 + 1);
  const perdBruta = m.ops.filter((o) => o.pl < 0).reduce((a, o) => a + o.pl, 0);
  console.log("| " + A + " pts | " + eur(m.credMedio) + " | " + eur(m.credMedio - B.credMedio) + " | " + tope.length + " (" + pct(tope.length / m.n) + ") | " +
    eur(tope.reduce((a, o) => a + o.pl, 0)) + " | " + pct(tope.reduce((a, o) => a + o.pl, 0) / perdBruta) + " |");
}

console.log("\n## LOS TRES TERCIOS DEL PERÍODO — ¿el ala estrecho aguanta en los tres?\n");
const k = Math.floor(filas.length / 3);
const tercios = [filas.slice(0, k), filas.slice(k, 2 * k), filas.slice(2 * k)];
console.log("| ala | " + tercios.map((t) => t[0].fecha.slice(0, 7) + "→" + t[t.length - 1].fecha.slice(0, 7)).join(" | ") + " | signo |");
console.log("|---|---|---|---|---|");
const signos = {};
for (const A of ALAS) {
  const cel = tercios.map((t) => {
    const v = t.map((f) => f["a" + A]).filter((x) => x && x.cred > 0).map((x) => x.pl);
    return { s: v.reduce((a, b) => a + b, 0), n: v.length };
  });
  signos[A] = cel.map((c) => (c.s >= 0 ? "+" : "−")).join("");
  console.log("| " + A + " pts | " + cel.map((c) => eur(c.s) + " (n=" + c.n + ")").join(" | ") + " | **" + signos[A] + "** |");
}

console.log("\n## RESUMEN-JSON");
console.log(JSON.stringify(Object.fromEntries(ALAS.map((A) => [A, {
  n: M[A].n, saltados: M[A].saltados, alAno: M[A].alAno, media: M[A].media, acierto: M[A].acierto,
  peorDia: M[A].peorDia, p1: M[A].p1, p5: M[A].p5, dd: M[A].dd, ddIni: M[A].ddIni, ddFin: M[A].ddFin,
  credMedio: M[A].credMedio, signos: signos[A],
}])), null, 1));
