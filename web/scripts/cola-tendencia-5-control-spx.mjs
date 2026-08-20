// CONTROL SIN SPY — la misma regla construida SÓLO con cierres reales de SPX.
//
// Los scripts 1–4 construyen las medias con la cinta de minutos de SPY, porque el SPX de este
// proyecto empieza el 2024-01-02 y una media de 200 sesiones necesita 200 sesiones anteriores.
// Aquí se quita SPY del camino por completo: medias de 20 y 50 sesiones hechas con el campo
// `cierre` de scripts/regimen-filas.json, que es el cierre real del SPX, y comparadas con
// `sp11`, el spot real del SPX a las 11:00 (los dos salen de la misma cadena de opciones).
//
// Sólo hacen falta 50 sesiones de precalentamiento, así que se miden 603 de los 653 días.
// NADA DE FUTURO: la media del día D usa los cierres de D−50 a D−1, nunca el de D.

import { readFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { listonT } from "../lib/barreraHallazgos";

const PRUEBAS = 56, LISTON = listonT(PRUEBAS), MALO = 2000;
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const pct = (x) => (x * 100).toFixed(1) + "%";
const media = (v) => v.reduce((a, x) => a + x, 0) / v.length;

const ops = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8"));
const filas = [];
for (let i = 50; i < ops.length; i++) {
  const c = ops.slice(i - 50, i).map((o) => o.cierre);       // cierres de SPX ANTERIORES al día
  filas.push({ fecha: ops[i].fecha, pl: ops[i].pl,
    d20: ops[i].sp11 / media(c.slice(-20)) - 1,
    d50: ops[i].sp11 / media(c) - 1 });
}
radiografia(filas, ["pl", "d20", "d50"], "control SPX nativo", { maxCeros: 0.2 });

const ANOS = filas.length / 252;
const dd = (o) => { let c = 0, p = 0, w = 0; for (const x of o) { c += x.pl; if (c > p) p = c; if (c - p < w) w = c - p; } return w; };
const res = (g) => {
  const pl = g.map((x) => x.pl).sort((a, b) => a - b);
  const n5 = Math.max(1, Math.round(pl.length * 0.05));
  return { n: g.length, total: pl.reduce((a, x) => a + x, 0), ano: pl.reduce((a, x) => a + x, 0) / ANOS,
    nMalo: pl.filter((x) => x <= -MALO).length, pMalo: pl.filter((x) => x <= -MALO).length / pl.length,
    es5: media(pl.slice(0, n5)), p5: pl[Math.floor(pl.length * 0.05)], p1: pl[Math.floor(pl.length * 0.01)],
    peor: pl[0], dd: dd(g) };
};
const B = (x) => x.d20 >= 0 && x.d50 >= 0;
const base = res(filas), dentro = res(filas.filter(B)), fuera = res(filas.filter((x) => !B(x)));

console.log("═".repeat(100));
console.log(`CONTROL SIN SPY — medias de SPX con sus propios cierres · ${filas.length} días desde ${filas[0].fecha}`);
console.log("═".repeat(100));
console.log("\n| serie | días | $/año | P(pérd>$2k) | déficit esp. 5% | pct 5 | pct 1 | peor día | peor racha |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const [n, r] of [["sin filtro", base], ["REGLA B (spot 11:00 ≥ MA20 Y ≥ MA50)", dentro], ["los días que se saltan", fuera]]) {
  console.log(`| ${n} | ${r.n} | ${eur(r.ano)} | ${pct(r.pMalo)} | ${eur(r.es5)} | ${eur(r.p5)} | ${eur(r.p1)} | ${eur(r.peor)} | ${eur(r.dd)} |`);
}
const p = (fuera.nMalo + dentro.nMalo) / filas.length;
const z = (fuera.pMalo - dentro.pMalo) / Math.sqrt(p * (1 - p) * (1 / fuera.n + 1 / dentro.n));
console.log(`\n  z de la tasa de días malos: ${z.toFixed(2)} (listón de Bonferroni con ${PRUEBAS} pruebas: ${LISTON}) → ${Math.abs(z) >= LISTON ? "PASA" : "no pasa"}`);
console.log(`  Retiene ${pct(dentro.total / base.total)} del ingreso operando ${pct(dentro.n / filas.length)} de los días.`);
console.log(`\n  LO QUE SE TIRA: esos ${fuera.n} días, operados por su cuenta, dan ${eur(fuera.total)} EN TOTAL`);
console.log(`  —pierden dinero— y llevan dentro ${fuera.nMalo} de los ${base.nMalo} días malos de toda la muestra (${pct(fuera.nMalo / base.nMalo)}).`);
