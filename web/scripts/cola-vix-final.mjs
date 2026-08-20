// EL CANDIDATO FINAL, AÑO A AÑO — term3m (VIX/VIX3M del cierre de AYER), corte medio de banda q80.
//
// Por qué este y no otro: en el barrido de 19 cortes (q50–q95), cuántos cumplen a la vez bajar la
// racha ≥25% y conservar ≥85% del ingreso — y qué dice el nulo por desplazamiento circular:
//     term3m 10/19 (p=1,75%) · term9 3/19 (p=12,3%) · vix 1/19 (p=19,8%) · vvix 0/19 (p=100%)
// El corte que se opera es el MEDIO de la banda (q80), no el mejor (q85). Elegir el mejor es elegir
// después de ver el resultado.
//
// Falta la última criba de la casa: el signo en los TRES tercios del período. Un filtro que sólo
// funciona en un año no sirve para operar.

import { readFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";

const VDIR = "scripts/cache-theta/vol-indices";
const DIAS_ANO = 252, WARMUP = 120, Q = 0.80;
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const pct = (x) => (x * 100).toFixed(1) + "%";
const P = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };

const filas = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8"));
filas.sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
const dias = new Set(filas.map((f) => f.fecha.replace(/-/g, "")));
const V = {};
for (const s of ["VIX", "VIX3M"]) {
  const b = JSON.parse(readFileSync(VDIR + "/" + s + ".json", "utf8"));
  V[s] = Object.fromEntries(Object.entries(b).filter(([k]) => dias.has(k)));
}
const ant = (se, fe) => { const d = fe.replace(/-/g, ""), ks = Object.keys(se).filter((k) => k < d).sort(); return ks.length ? se[ks[ks.length - 1]] : null; };
for (const f of filas) { const v = ant(V.VIX, f.fecha), v3 = ant(V.VIX3M, f.fecha); f.vix = v; f.term3m = v && v3 ? v / v3 : null; }
radiografia(filas, ["pl", "credito", "term3m", "vix"], "final", { maxCeros: 0.2 });

const racha = (s) => { let c = 0, p = 0, d = 0; for (const x of s) { c += x; p = Math.max(p, c); d = Math.max(d, p - c); } return d; };
const hist = [], marca = new Map(), umbral = new Map();
for (const f of filas) {
  const v = f.term3m; let opera = true, u = null;
  if (v != null && isFinite(v) && hist.length >= WARMUP) { const s = [...hist].sort((a, b) => a - b); u = s[Math.floor(s.length * Q)]; opera = v < u; }
  if (v != null && isFinite(v)) hist.push(v);
  marca.set(f.fecha, opera); umbral.set(f.fecha, u);
}
let vistos = 0, iOp = filas.length;
for (let i = 0; i < filas.length; i++) { if (filas[i].term3m != null) vistos++; if (vistos >= WARMUP) { iOp = i + 1; break; } }
const OP = filas.slice(iOp);

console.log("\n" + "=".repeat(100));
console.log("  term3m (VIX/VIX3M de AYER) · walk-forward q80 · " + OP[0].fecha + " → " + OP[OP.length - 1].fecha + " · " + OP.length + " días");
console.log("  REGLA: a las 11:00, si VIX_ayer/VIX3M_ayer >= percentil 80 de su propio pasado, NO SE OPERA.");
console.log("  umbral vigente el último día: " + (umbral.get(OP[OP.length - 1].fecha) || 0).toFixed(4) +
            " · valor de ese día: " + OP[OP.length - 1].term3m.toFixed(4));
console.log("=".repeat(100));

console.log("\n## AÑO A AÑO — los tres tercios del período\n");
console.log("| año | días | fuera | ingreso base | ingreso filtro | retenido | racha base | racha filtro | reducción | peor día base | peor día filtro | <−$2k base→filtro |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
const signos = [];
for (const a of [...new Set(OP.map((f) => f.fecha.slice(0, 4)))].sort()) {
  const sub = OP.filter((f) => f.fecha.slice(0, 4) === a);
  const b = sub.map((f) => f.pl), c = sub.map((f) => (marca.get(f.fecha) ? f.pl : 0));
  const cOp = c.filter((x) => x !== 0);
  const ddB = racha(b), ddF = racha(c), red = ddB ? 1 - ddF / ddB : 0;
  signos.push(red > 0 ? "+" : "−");
  console.log("| " + a + " | " + sub.length + " | " + sub.filter((f) => !marca.get(f.fecha)).length + " | " +
    eur(b.reduce((x, y) => x + y, 0)) + " | " + eur(c.reduce((x, y) => x + y, 0)) + " | " +
    pct(c.reduce((x, y) => x + y, 0) / b.reduce((x, y) => x + y, 0)) + " | " + eur(ddB) + " | " + eur(ddF) + " | **" + pct(red) +
    "** | " + eur(Math.min(...b)) + " | " + eur(Math.min(...cOp)) + " | " + b.filter((x) => x < -2000).length + "→" +
    cOp.filter((x) => x < -2000).length + " |");
}
console.log("\nsigno de la reducción de racha por año: **" + signos.join("") + "**");

console.log("\n## TODO EL PERÍODO OPERABLE — lo que Lester pidió reducir\n");
const b = OP.map((f) => f.pl), c = OP.map((f) => (marca.get(f.fecha) ? f.pl : 0)), cOp = c.filter((x) => x !== 0);
const anB = b.reduce((x, y) => x + y, 0) / (OP.length / DIAS_ANO), anF = c.reduce((x, y) => x + y, 0) / (OP.length / DIAS_ANO);
const ddB = racha(b), ddF = racha(c);
console.log("| métrica | base | filtro q80 | cambio |");
console.log("|---|---|---|---|");
const fil = [
  ["PEOR DÍA", Math.min(...b), Math.min(...cOp), true],
  ["percentil 1", P(b, 0.01), P(cOp, 0.01), true],
  ["percentil 5", P(b, 0.05), P(cOp, 0.05), true],
  ["PEOR RACHA", -ddB, -ddF, true],
  ["días < −$2.000", b.filter((x) => x < -2000).length, cOp.filter((x) => x < -2000).length, false],
  ["días < −$4.000", b.filter((x) => x < -4000).length, cOp.filter((x) => x < -4000).length, false],
  ["ingreso/año", anB, anF, true],
  ["días operados", b.length, cOp.length, false],
];
for (const [n, x, y, money] of fil)
  console.log("| " + n + " | " + (money ? eur(x) : x) + " | " + (money ? eur(y) : y) + " | " + pct(Math.abs(y) / Math.abs(x) - 1) + " |");

const perdido = anB - anF, matado = ddB - ddF;
console.log("\n**La métrica que decide:** ingreso anual retenido " + eur(anF) + " · caída eliminada " + eur(matado));
console.log("ingreso ANUAL PERDIDO por el camino: " + eur(perdido) + (perdido <= 0 ? "  → la reducción de caída sale GRATIS" : ""));
console.log("$ de caída eliminada por cada $ de ingreso anual sacrificado: " + (perdido > 0 ? (matado / perdido).toFixed(2) : "∞ (no se sacrifica ingreso)"));
console.log("$/año retenidos por cada $ de caída eliminada: " + (matado > 0 ? (anF / matado).toFixed(2) : "—"));

console.log("\n## LOS DÍAS QUE TIRA — ¿tira días malos o tira días al azar?\n");
const fuera = OP.filter((f) => !marca.get(f.fecha)), dentro = OP.filter((f) => marca.get(f.fecha));
const m = (v) => v.reduce((a, x) => a + x, 0) / v.length;
console.log("| grupo | n | P&L medio | P&L total | crédito medio | VIX ayer medio | días <−$2k | días <−$4k | peor día |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const [n, g] of [["FUERA (no se opera)", fuera], ["DENTRO (se opera)", dentro]])
  console.log("| " + n + " | " + g.length + " | " + eur(m(g.map((f) => f.pl))) + " | " + eur(g.reduce((a, f) => a + f.pl, 0)) + " | " +
    eur(m(g.map((f) => f.credito))) + " | " + m(g.filter((f) => f.vix).map((f) => f.vix)).toFixed(1) + " | " +
    g.filter((f) => f.pl < -2000).length + " | " + g.filter((f) => f.pl < -4000).length + " | " + eur(Math.min(...g.map((f) => f.pl))) + " |");
