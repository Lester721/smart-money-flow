// QUÉ LE FALTA — el filtro de tendencia corta la FRECUENCIA de los días malos, no su TAMAÑO.
//
// Con la regla B (spot de las 11:00 por encima de sus medias de 20 y 50) los días con pérdida
// mayor de $2.000 caen del 6,3% al 2,6% y la peor racha se parte casi por la mitad. Pero el
// PEOR DÍA no se mueve: −$4.900 el 2024-04-04, con el mercado tranquilo y por encima de todo.
//
// Los 12–14 días malos que sobreviven tienen UNA cosa en común y no es la tendencia: la σ
// implícita del dinero a las 11:00 vale 82 puntos de media contra 58 de los días buenos. Aquí
// se mide si esa pieza, ENCIMA de la tendencia, cierra el hueco — y qué cuesta.
//
// También se comprueba la regla B en los tres tercios del período y año a año.

import { readFileSync, writeFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";

const PRUEBAS = 56;
const LISTON = listonT(PRUEBAS);
const MALO = 2000;
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const pct = (x) => (x * 100).toFixed(1) + "%";
const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : 0);
const percentil = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };

const dias = [];
for (const y of [2023, 2024, 2025, 2026]) {
  const j = JSON.parse(readFileSync(`scripts/cache-theta/SPY_spotmin_y_${y}.json`, "utf8"));
  for (const [d, arr] of Object.entries(j)) {
    const m = new Map(arr.map(([mi, p]) => [mi, p]));
    const c = m.get(960), p11 = m.get(660);
    if (!(c > 0) || !(p11 > 0)) continue;
    dias.push({ fecha: `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, c, p11 });
  }
}
dias.sort((a, b) => a.fecha.localeCompare(b.fecha));
const idx = new Map(dias.map((d, i) => [d.fecha, i]));
const opsBase = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8"));
const filas = [];
for (const op of opsBase) {
  const i = idx.get(op.fecha);
  if (i === undefined || i < 200) continue;
  const cierres = dias.slice(i - 200, i).map((d) => d.c);
  filas.push({ fecha: op.fecha, pl: op.pl, credito: op.credito, sigma: op.sigma,
    dma20: dias[i].p11 / media(cierres.slice(-20)) - 1,
    dma50: dias[i].p11 / media(cierres.slice(-50)) - 1,
    rangoMan: (op.maxM - op.minM) / op.sp11 });
}
filas.sort((a, b) => a.fecha.localeCompare(b.fecha));
const ANOS = filas.length / 252;
const dd = (ops) => { let c = 0, p = 0, w = 0; for (const o of ops) { c += o.pl; if (c > p) p = c; if (c - p < w) w = c - p; } return w; };
function res(ops) {
  const pl = ops.map((o) => o.pl).sort((a, b) => a - b);
  const n5 = Math.max(1, Math.round(pl.length * 0.05));
  return { n: ops.length, total: pl.reduce((a, x) => a + x, 0), ano: pl.reduce((a, x) => a + x, 0) / ANOS,
    nMalo: pl.filter((x) => x <= -MALO).length, pMalo: pl.filter((x) => x <= -MALO).length / pl.length,
    es5: media(pl.slice(0, n5)), p5: percentil(pl, 0.05), peor: pl[0], dd: dd(ops), credito: media(ops.map((o) => o.credito)) };
}
const B = (f) => f.dma20 >= 0 && f.dma50 >= 0;
const BASE = res(filas), RB = res(filas.filter(B));

console.log("═".repeat(104));
console.log("QUÉ LE FALTA · la tendencia corta la FRECUENCIA de los días malos, no su TAMAÑO");
console.log("═".repeat(104));

// ═══ 1 · LA REGLA B EN LOS TRES TERCIOS Y AÑO A AÑO ════════════════════════════════════════
const kk = Math.floor(filas.length / 3);
const bloques = [filas.slice(0, kk), filas.slice(kk, 2 * kk), filas.slice(2 * kk)];
console.log("\nTABLA 1 · LA REGLA B EN LOS TRES TERCIOS DEL PERÍODO");
console.log("\n| tercio | días | operados | P(malo) operando | P(malo) saltando | P&L sin filtro | P&L con filtro | peor racha sin | peor racha con |");
console.log("|---|---|---|---|---|---|---|---|---|");
const signos = [];
for (const b of bloques) {
  const d = b.filter(B), f = b.filter((x) => !B(x));
  const rd = res(d), rf = res(f), rb = res(b);
  signos.push(Math.sign(rf.pMalo - rd.pMalo));
  console.log(`| ${b[0].fecha}→${b[b.length - 1].fecha} | ${b.length} | ${d.length} | ${pct(rd.pMalo)} | ${pct(rf.pMalo)} | ${eur(rb.total)} | ${eur(rd.total)} | ${eur(rb.dd)} | ${eur(rd.dd)} |`);
}
console.log(`\n  signos de la diferencia: ${signos.map((s) => (s > 0 ? "+" : s < 0 ? "−" : "0")).join("")} → ${signos.every((s) => s > 0) ? "MISMO SIGNO EN LOS TRES" : "NO se repite"}`);

console.log("\nTABLA 2 · AÑO A AÑO");
console.log("\n| año | días | operados | P&L sin filtro | P&L con filtro | días malos sin | días malos con | peor racha sin | peor racha con |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const a of ["2024", "2025", "2026"]) {
  const g = filas.filter((f) => f.fecha.startsWith(a)), gf = g.filter(B);
  const s = res(g), c = res(gf);
  console.log(`| ${a} | ${g.length} | ${gf.length} | ${eur(s.total)} | ${eur(c.total)} | ${s.nMalo} | ${c.nMalo} | ${eur(s.dd)} | ${eur(c.dd)} |`);
}

// ═══ 2 · LA PIEZA QUE FALTA: σ IMPLÍCITA ENCIMA DE LA TENDENCIA ════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("TABLA 3 · AÑADIR σ IMPLÍCITA ENCIMA DE LA REGLA B (no operar si la σ del dinero a las 11:00 pasa de X)");
console.log("═".repeat(104));
console.log(`\nσ mediana de los días que pasan la regla B: ${percentil(filas.filter(B).map((f) => f.sigma), 0.5).toFixed(0)} puntos. El cóndor vende a ±25.\n`);
console.log("| tope de σ | días | % del año | $/año | retiene sobre B | crédito medio | días malos | P(malo) | déficit esp. 5% | peor día | peor racha |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
console.log(`| — (sólo regla B) | ${RB.n} | ${(RB.n / ANOS).toFixed(0)} | ${eur(RB.ano)} | 100.0% | ${eur(RB.credito)} | ${RB.nMalo} | ${pct(RB.pMalo)} | ${eur(RB.es5)} | ${eur(RB.peor)} | ${eur(RB.dd)} |`);
const sigmas = [];
for (const tope of [110, 100, 90, 80, 70, 60, 50]) {
  const g = filas.filter((f) => B(f) && f.sigma <= tope);
  if (g.length < 80) { console.log(`| ≤ ${tope} pts | ${g.length} | — deja demasiado poco, no se mide |`); continue; }
  const r = res(g); sigmas.push({ tope, ...r });
  console.log(`| ≤ ${tope} pts | ${r.n} | ${(r.n / ANOS).toFixed(0)} | ${eur(r.ano)} | ${pct(r.total / RB.total)} | ${eur(r.credito)} | ${r.nMalo} | ${pct(r.pMalo)} | ${eur(r.es5)} | ${eur(r.peor)} | ${eur(r.dd)} |`);
}

// ═══ 3 · Y EL RANGO DE LA MAÑANA ═══════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("TABLA 4 · AÑADIR EL RANGO DE 09:30 A 11:00 ENCIMA DE LA REGLA B");
console.log("═".repeat(104));
console.log("\n| tope de rango | días | $/año | retiene sobre B | días malos | P(malo) | déficit esp. 5% | peor día | peor racha |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const tope of [0.01, 0.008, 0.006, 0.005, 0.004]) {
  const g = filas.filter((f) => B(f) && f.rangoMan <= tope);
  if (g.length < 80) { console.log(`| ≤ ${(tope * 100).toFixed(1)}% | ${g.length} | — deja demasiado poco |`); continue; }
  const r = res(g);
  console.log(`| ≤ ${(tope * 100).toFixed(1)}% | ${r.n} | ${eur(r.ano)} | ${pct(r.total / RB.total)} | ${r.nMalo} | ${pct(r.pMalo)} | ${eur(r.es5)} | ${eur(r.peor)} | ${eur(r.dd)} |`);
}

// ═══ 4 · POR QUÉ LA σ NO CIERRA EL HUECO: LO QUE SE COBRA VA CON ELLA ══════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("POR QUÉ · el crédito sube con la σ, así que cortar la σ corta el ingreso");
console.log("═".repeat(104));
const conB = filas.filter(B);
const ordS = [...conB].sort((a, b) => a.sigma - b.sigma), k3 = Math.floor(ordS.length / 3);
console.log("\n| tercio de σ (dentro de la regla B) | n | σ media | crédito medio | P&L medio | días malos | peor día |");
console.log("|---|---|---|---|---|---|---|");
for (const [nom, g] of [["bajo", ordS.slice(0, k3)], ["medio", ordS.slice(k3, ordS.length - k3)], ["alto", ordS.slice(-k3)]]) {
  const r = res(g);
  console.log(`| ${nom} | ${g.length} | ${media(g.map((f) => f.sigma)).toFixed(0)} pts | ${eur(r.credito)} | ${eur(r.total / g.length)} | ${r.nMalo} | ${eur(r.peor)} |`);
}
console.log(`\n  Listón de Bonferroni con ${PRUEBAS} pruebas acumuladas: |z| ≥ ${LISTON}`);

writeFileSync("scripts/cola-tendencia-4-salida.json", JSON.stringify({
  generado: new Date().toISOString(), pruebas: PRUEBAS, listonZ: LISTON,
  base: BASE, reglaB: RB, sigmaEncima: sigmas, signosTercios: signos,
}, null, 2));
console.log("\nDetalle en scripts/cola-tendencia-4-salida.json");
