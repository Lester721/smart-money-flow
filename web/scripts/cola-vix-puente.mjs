// EL PUENTE — qué SÍ hace la familia VIX, qué NO puede hacer, y qué le falta para hacerlo.
//
// De cola-vix.mjs y cola-vix-control.mjs salen dos hechos que hay que separar:
//   · la familia VIX SÍ anticipa la FRECUENCIA de la cola (P(pérdida>$2k): 11,5% vs 2,8%, z=3,54)
//   · la familia VIX NO toca el PEOR DÍA. Ni un dólar. En ninguna variante. Nunca.
//
// La razón está en la aritmética del cóndor, no en la estadística:
//     pérdida máxima = (ancho_ala − crédito) × 100 = (50 − crédito) × 100
// Los 10 peores días son los 10 con MENOS crédito, en orden exacto. Todos son pérdida máxima.
// Y el crédito sube con el VIX (corr 0,744). El peor día es, por construcción, un día de VIX BAJO.
// Un filtro de VIX alto no puede alcanzarlo: mira justo al otro lado.
//
// Este fichero mide tres cosas:
//   1. EL PERÍODO OPERABLE — la comparación honesta: desde que el walk-forward tiene ventana.
//      Los números de racha del control 2 estaban dominados por 2024, donde el filtro aún no
//      podía actuar. Comparar ahí base contra filtro es comparar contra sí mismo.
//   2. EL SUELO DE CRÉDITO — la única palanca observable a las 11:00 que SÍ mueve el peor día,
//      porque lo fija por aritmética. 4 pruebas NUEVAS, declaradas: total 26.
//   3. LA ESTABILIDAD — ¿es monótono el filtro en la fracción que tira? Si tirar MENOS días
//      pierde MÁS ingreso, el lado del ingreso es ruido y hay que decirlo.

import { readFileSync, writeFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { listonT } from "../lib/barreraHallazgos";

const VDIR = "scripts/cache-theta/vol-indices";
const DIAS_ANO = 252, MALO = 2000, MUYMALO = 4000, WARMUP = 120, PERMS = 5000;
const PRUEBAS = 26;                       // 22 de cola-vix.mjs + 4 del suelo de crédito
const LISTON = listonT(PRUEBAS);

const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const pct = (x) => (x * 100).toFixed(1) + "%";
const perc = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };

const filas = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8"));
filas.sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
const claveDe = (f) => f.replace(/-/g, "");
const diasSesion = new Set(filas.map((f) => claveDe(f.fecha)));
const V = {};
for (const s of ["VIX", "VIX9D", "VIX3M", "VVIX"]) {
  const b = JSON.parse(readFileSync(VDIR + "/" + s + ".json", "utf8"));
  V[s] = Object.fromEntries(Object.entries(b).filter(([k]) => diasSesion.has(k)));
}
const anterior = (serie, fecha) => {
  const d = claveDe(fecha), ks = Object.keys(serie).filter((k) => k < d).sort();
  return ks.length ? serie[ks[ks.length - 1]] : null;
};
for (const f of filas) {
  const vix = anterior(V.VIX, f.fecha), v9 = anterior(V.VIX9D, f.fecha), v3 = anterior(V.VIX3M, f.fecha);
  f.vix = vix; f.term9 = vix && v9 ? v9 / vix : null; f.term3m = vix && v3 ? vix / v3 : null;
  f.vvix = anterior(V.VVIX, f.fecha);
  f.perdidaMax = (50 - f.credito / 100) * 100;          // aritmética pura del cóndor
}
radiografia(filas, ["pl", "credito", "perdidaMax", "vix", "term9"], "puente", { maxCeros: 0.2 });

function racha(s) { let c = 0, p = 0, d = 0; for (const x of s) { c += x; p = Math.max(p, c); d = Math.max(d, p - c); } return d; }
function cartera(pls, nDias) {
  const op = pls.filter((x) => x !== 0), tot = pls.reduce((a, b) => a + b, 0);
  return { total: tot, anual: tot / (nDias / DIAS_ANO), peorDia: op.length ? Math.min(...op) : 0,
           dd: racha(pls), n: op.length, p5: op.length ? perc(op, 0.05) : 0, p1: op.length ? perc(op, 0.01) : 0,
           n2k: op.filter((x) => x < -MALO).length, n4k: op.filter((x) => x < -MUYMALO).length };
}

// ── walk-forward genérico: umbral con el pasado; devuelve el mapa de "opera" ─
function walkForward(campo, q) {
  const hist = [], marca = new Map();
  for (const f of filas) {
    const v = f[campo]; let opera = true;
    if (v != null && isFinite(v) && hist.length >= WARMUP) {
      const s = [...hist].sort((a, b) => a - b); opera = v < s[Math.floor(s.length * q)];
    }
    if (v != null && isFinite(v)) hist.push(v);
    marca.set(f.fecha, opera);
  }
  return marca;
}
// el primer día en que el filtro YA PUEDE actuar (ventana llena)
let vistos = 0, iOperable = filas.length;
for (let i = 0; i < filas.length; i++) { if (filas[i].term9 != null) vistos++; if (vistos >= WARMUP) { iOperable = i + 1; break; } }
const OP = filas.slice(iOperable);
const BASE_OP = cartera(OP.map((f) => f.pl), OP.length);
const BASE_TOT = cartera(filas.map((f) => f.pl), filas.length);

console.log("\n" + "=".repeat(106));
console.log("  EL PUENTE · " + PRUEBAS + " pruebas declaradas · listón |z| = " + LISTON);
console.log("  período COMPLETO   " + filas[0].fecha + " → " + filas[filas.length - 1].fecha + " · " + filas.length + " días · " +
            eur(BASE_TOT.anual) + "/año · peor día " + eur(BASE_TOT.peorDia) + " · racha " + eur(BASE_TOT.dd));
console.log("  período OPERABLE   " + OP[0].fecha + " → " + OP[OP.length - 1].fecha + " · " + OP.length + " días · " +
            eur(BASE_OP.anual) + "/año · peor día " + eur(BASE_OP.peorDia) + " · racha " + eur(BASE_OP.dd));
console.log("  (los 120 primeros días son ventana de calentamiento: ahí el filtro NO PUEDE actuar,");
console.log("   y toda la racha de 2024 cae dentro. Compararlo ahí es compararlo consigo mismo.)");
console.log("=".repeat(106));

// ═══ 1 · EL PERÍODO OPERABLE ════════════════════════════════════════════════
console.log("\n## 1 · SOLO EL PERÍODO OPERABLE — walk-forward, umbral del pasado, " + OP.length + " días\n");
console.log("| señal | corte | días fuera | ingreso/año | % retenido | peor día | racha | delta racha | p5 | p1 | <−$2k | <−$4k | $racha/$año |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
const filas1 = [];
for (const campo of ["term9", "term3m", "vvix", "vix"]) {
  for (const q of [2 / 3, 0.8, 0.9]) {
    const m = walkForward(campo, q);
    const pls = OP.map((f) => (m.get(f.fecha) ? f.pl : 0));
    const c = cartera(pls, OP.length);
    const fuera = OP.filter((f) => !m.get(f.fecha)).length;
    const perdido = BASE_OP.anual - c.anual, matado = BASE_OP.dd - c.dd;
    const ratio = perdido > 0 ? matado / perdido : null;
    filas1.push({ campo, q, fuera, c, perdido, matado, ratio });
    console.log("| `" + campo + "` | q" + (q * 100).toFixed(0) + " | " + fuera + " (" + pct(fuera / OP.length) + ") | " + eur(c.anual) +
      " | " + pct(c.anual / BASE_OP.anual) + " | " + eur(c.peorDia) + " | " + eur(c.dd) + " | " + eur(c.dd - BASE_OP.dd) + " | " +
      eur(c.p5) + " | " + eur(c.p1) + " | " + c.n2k + " | " + c.n4k + " | **" + (perdido > 0 ? ratio.toFixed(2) : "GRATIS") + "** |");
  }
}

// permutación EN EL PERÍODO OPERABLE, con el mismo nº de días fuera
console.log("\n### control de azar en el período operable (5.000 descartes aleatorios del mismo tamaño)\n");
console.log("| señal | corte | ingreso/año | racha | azar racha p50 | azar racha p5 | p conjunto | ¿bate al azar? | ¿pasa Bonferroni (p<" + (0.05 / PRUEBAS * 100).toFixed(2) + "%)? |");
console.log("|---|---|---|---|---|---|---|---|---|");
const plOP = OP.map((f) => f.pl);
let seed = 20260819;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const cachePerm = {};
function perm(nFuera) {
  if (cachePerm[nFuera]) return cachePerm[nFuera];
  const idx = OP.map((_, i) => i), res = [];
  for (let p = 0; p < PERMS; p++) {
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const fu = new Set(idx.slice(0, nFuera));
    const pls = plOP.map((x, i) => (fu.has(i) ? 0 : x));
    res.push({ dd: racha(pls), anual: pls.reduce((a, b) => a + b, 0) / (OP.length / DIAS_ANO) });
  }
  cachePerm[nFuera] = res; return res;
}
const control = [];
for (const { campo, q, fuera, c } of filas1) {
  const ps = perm(fuera);
  const dds = ps.map((p) => p.dd).sort((a, b) => a - b);
  const pv = ps.filter((p) => p.anual >= c.anual && p.dd <= c.dd).length / PERMS;
  control.push({ campo, q, pv });
  console.log("| `" + campo + "` | q" + (q * 100).toFixed(0) + " | " + eur(c.anual) + " | " + eur(c.dd) + " | " + eur(perc(dds, 0.5)) +
    " | " + eur(perc(dds, 0.05)) + " | **" + (pv * 100).toFixed(2) + "%** | " + (pv < 0.05 ? "sí" : "no") + " | " +
    (pv < 0.05 / PRUEBAS ? "🟢 SÍ" : "no") + " |");
}

// ═══ 2 · EL SUELO DE CRÉDITO ════════════════════════════════════════════════
console.log("\n## 2 · EL SUELO DE CRÉDITO — la única palanca observable a las 11:00 que mueve el PEOR DÍA\n");
console.log("pérdida máxima = (50 − crédito) × 100. Es aritmética, no estadística: poner un suelo al");
console.log("crédito PONE UN TECHO A LA PÉRDIDA. 4 pruebas nuevas, declaradas (total " + PRUEBAS + ").\n");
console.log("| regla | días fuera | ingreso/año | % retenido | peor día TEÓRICO | peor día REAL | racha | delta racha | p5 | p1 | <−$2k | <−$4k | $racha/$año |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
const reglas = [
  ["crédito ≥ $300", (f) => f.credito >= 300],
  ["crédito ≥ $500", (f) => f.credito >= 500],
  ["crédito ≥ $800", (f) => f.credito >= 800],
  ["crédito ≥ $500 Y term9 bajo (q67 walk-fwd)", null],
];
const m9 = walkForward("term9", 2 / 3);
reglas[3][1] = (f) => f.credito >= 500 && m9.get(f.fecha);
for (const [nom, test] of reglas) {
  const pls = OP.map((f) => (test(f) ? f.pl : 0));
  const c = cartera(pls, OP.length);
  const dentro = OP.filter(test);
  const teorico = dentro.length ? -Math.max(...dentro.map((f) => f.perdidaMax)) : 0;
  const perdido = BASE_OP.anual - c.anual, matado = BASE_OP.dd - c.dd;
  console.log("| " + nom + " | " + (OP.length - dentro.length) + " (" + pct(1 - dentro.length / OP.length) + ") | " + eur(c.anual) +
    " | " + pct(c.anual / BASE_OP.anual) + " | " + eur(teorico) + " | " + eur(c.peorDia) + " | " + eur(c.dd) + " | " +
    eur(c.dd - BASE_OP.dd) + " | " + eur(c.p5) + " | " + eur(c.p1) + " | " + c.n2k + " | " + c.n4k + " | **" +
    (perdido > 0 ? (matado / perdido).toFixed(2) : "GRATIS") + "** |");
}

// ═══ 3 · ESTABILIDAD ════════════════════════════════════════════════════════
console.log("\n## 3 · ESTABILIDAD — ¿es monótono? Si tirar MENOS días pierde MÁS ingreso, el ingreso es ruido.\n");
console.log("| señal | q67 ingreso | q80 ingreso | q90 ingreso | ¿monótono? | q67 racha | q80 racha | q90 racha | ¿monótona? |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const campo of ["term9", "term3m", "vvix", "vix"]) {
  const r = filas1.filter((x) => x.campo === campo).sort((a, b) => a.q - b.q);
  const ing = r.map((x) => x.c.anual), dd = r.map((x) => x.c.dd);
  const monI = (ing[0] <= ing[1] && ing[1] <= ing[2]) || (ing[0] >= ing[1] && ing[1] >= ing[2]);
  const monD = (dd[0] <= dd[1] && dd[1] <= dd[2]) || (dd[0] >= dd[1] && dd[1] >= dd[2]);
  console.log("| `" + campo + "` | " + ing.map(eur).join(" | ") + " | " + (monI ? "sí" : "**NO**") + " | " +
              dd.map(eur).join(" | ") + " | " + (monD ? "sí" : "**NO**") + " |");
}

// ═══ 4 · LOS 41 DÍAS MALOS, ¿QUIÉN LOS PILLA? ═══════════════════════════════
console.log("\n## 4 · REPARTO DE LOS DÍAS MALOS por tercio de VIX de AYER (todo el período)\n");
const val = filas.filter((f) => f.vix != null);
const ordV = [...val].sort((a, b) => b.vix - a.vix), kv = Math.floor(ordV.length / 3);
console.log("| tercio de VIX ayer | n | VIX medio | crédito medio | P&L medio | días <−$2k | días <−$4k | peor día | pérdida máx posible media |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const [et, g] of [["ALTO", ordV.slice(0, kv)], ["MEDIO", ordV.slice(kv, 2 * kv)], ["BAJO", ordV.slice(-kv)]]) {
  const p = g.map((f) => f.pl);
  console.log("| " + et + " | " + g.length + " | " + media(g.map((f) => f.vix)).toFixed(1) + " | " + eur(media(g.map((f) => f.credito))) +
    " | " + eur(media(p)) + " | " + p.filter((x) => x < -MALO).length + " | " + p.filter((x) => x < -MUYMALO).length + " | " +
    eur(Math.min(...p)) + " | " + eur(-media(g.map((f) => f.perdidaMax))) + " |");
}

writeFileSync("scripts/cola-vix-puente-salida.json", JSON.stringify({
  baseTotal: BASE_TOT, baseOperable: BASE_OP, primerOperable: OP[0].fecha, pruebas: PRUEBAS, liston: LISTON,
  walkForward: filas1.map(({ campo, q, fuera, c, perdido, matado, ratio }) => ({ campo, q, fuera, ...c, perdido, matado, ratio })),
  permutacion: control,
}, null, 1), "utf8");
console.log("\n-> scripts/cola-vix-puente-salida.json");
