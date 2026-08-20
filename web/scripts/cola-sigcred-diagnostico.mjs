// SIGMA-CREDITO · FASE 3 — DESMONTAR el candidato antes de creérselo.
//
// `credDesbal` (el desequilibrio put−call del crédito) sale con p de permutación 0,002 y mejora
// la peor racha en los tres años. Antes de llamarlo hallazgo hay que descartar la explicación
// ABURRIDA: los strikes van de 5 en 5 puntos y el spot no cae en la rejilla. Si el spot está en
// 5002, la call vendida queda a +23 y la put a −27. La call está MÁS CERCA → cobra más → el
// desequilibrio baja → y ese día el lado call es de verdad más peligroso.
//
// Si eso lo explica, el hallazgo NO es "hay días que no operar": es que **el cóndor está
// descentrado** y lo que hay que arreglar es la elección de strikes, no el calendario.

import { readFileSync } from "node:fs";
import { media, sd, pct, eur, drawdown } from "./anatomia3-lib.mjs";

const filas = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8")).sort((a, b) => a.fecha.localeCompare(b.fecha));
const CAD = JSON.parse(readFileSync("scripts/cola-sigcred-cadena.json", "utf8"));
const ANOS = (new Date(filas[filas.length - 1].fecha) - new Date(filas[0].fecha)) / (365.25 * 864e5);

for (const f of filas) {
  const c = CAD[f.fecha];
  f.credDesbal = (c.credPut - c.credCall) / f.credito;
  f.dCall = c.kSC - c.sp11;                        // a cuántos puntos quedó la call vendida
  f.dPut = c.sp11 - c.kSP;                         // a cuántos puntos quedó la put vendida
  f.asim = f.dCall - f.dPut;                       // + = la call más lejos (el lado call, más seguro)
  f.credPorSigma = f.credito / f.sigma;
  f.sonrisaCall = c.ivLC - (c.ivAtmC + c.ivAtmP) / 2;
  f.tarde = f.cierre - f.sp11;                     // DESENLACE, sólo para explicar
}

const corr = (a, b) => {
  const ma = media(a), mb = media(b);
  let n = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return n / Math.sqrt(da * db);
};
const col = (c) => filas.map((f) => f[c]);

console.log("═".repeat(100));
console.log("  ¿ES `credDesbal` UNA SEÑAL DE MERCADO O LA REJILLA DE STRIKES?");
console.log("═".repeat(100));
console.log("\n## 1 · CORRELACIONES\n");
console.log("| par | r |");
console.log("|---|---|");
for (const [a, b] of [["credDesbal", "asim"], ["credDesbal", "sigmaPts"], ["credDesbal", "credPorSigma"],
                      ["asim", "sigmaPts"], ["credDesbal", "sonrisaCall"], ["asim", "sonrisaCall"]]) {
  const A = a === "sigmaPts" ? col("sigma") : col(a), B = b === "sigmaPts" ? col("sigma") : col(b);
  console.log(`| ${a} ↔ ${b} | **${corr(A, B).toFixed(3)}** |`);
}

console.log("\n## 2 · LA ASIMETRÍA DE LOS STRIKES, POR SÍ SOLA\n");
console.log("  `asim` = (distancia a la call vendida) − (distancia a la put vendida), en puntos.");
console.log(`  rango: ${Math.min(...col("asim")).toFixed(2)} a ${Math.max(...col("asim")).toFixed(2)} · mediana ${pct(col("asim"), 0.5).toFixed(2)}`);
console.log("\n| tercio de `asim` | n | media P&L | P(>$2k) | peor día | peor racha |");
console.log("|---|---|---|---|---|---|");
{
  const ord = [...filas].sort((a, b) => b.asim - a.asim), k = Math.floor(ord.length / 3);
  for (const [nom, g] of [["ALTO (call lejos)", ord.slice(0, k)], ["medio", ord.slice(k, ord.length - k)], ["BAJO (call cerca)", ord.slice(-k)]]) {
    const pl = g.map((f) => f.pl);
    const cro = filas.filter((f) => g.includes(f)).map((f) => f.pl);
    console.log(`| ${nom} | ${pl.length} | ${eur(media(pl))} | ${(pl.filter((x) => x < -2000).length / pl.length * 100).toFixed(1)}% | ${eur(Math.min(...pl))} | ${eur(drawdown(cro))} |`);
  }
}

console.log("\n## 3 · ¿QUÉ DÍAS TIRA `credDesbal` bajo 20%, Y DE DÓNDE SALE LA MEJORA?\n");
const ord = [...filas].sort((a, b) => a.credDesbal - b.credDesbal);
const nFuera = Math.round(filas.length * 0.20);
const fuera = new Set(ord.slice(0, nFuera).map((f) => f.fecha));
const tirados = filas.filter((f) => fuera.has(f.fecha)), dentro = filas.filter((f) => !fuera.has(f.fecha));
const plT = tirados.map((f) => f.pl), plD = dentro.map((f) => f.pl);
console.log(`  TIRADOS: ${tirados.length} días · suma ${eur(plT.reduce((a, b) => a + b, 0))} · media ${eur(media(plT))} · peor ${eur(Math.min(...plT))}`);
console.log(`  QUEDAN : ${dentro.length} días · suma ${eur(plD.reduce((a, b) => a + b, 0))} · media ${eur(media(plD))} · peor ${eur(Math.min(...plD))}`);
console.log(`  racha base ${eur(drawdown(filas.map((f) => f.pl)))} → filtrada ${eur(drawdown(plD))}`);
console.log(`\n  asim media de los tirados: ${media(tirados.map((f) => f.asim)).toFixed(2)} puntos · de los que quedan: ${media(dentro.map((f) => f.asim)).toFixed(2)}`);
console.log(`  σ media de los tirados: ${media(tirados.map((f) => f.sigma)).toFixed(1)} · de los que quedan: ${media(dentro.map((f) => f.sigma)).toFixed(1)}`);
console.log(`  crédito medio tirados: ${eur(media(tirados.map((f) => f.credito)))} · quedan: ${eur(media(dentro.map((f) => f.credito)))}`);
console.log(`  movimiento de tarde (DESENLACE) tirados: ${media(tirados.map((f) => f.tarde)).toFixed(1)} pts · quedan: ${media(dentro.map((f) => f.tarde)).toFixed(1)} pts`);

console.log("\n  Los 12 peores días TIRADOS por el filtro:");
console.log("\n| fecha | P&L | credDesbal | asim | σ | crédito | mov. tarde |");
console.log("|---|---|---|---|---|---|---|");
for (const f of [...tirados].sort((a, b) => a.pl - b.pl).slice(0, 12))
  console.log(`| ${f.fecha} | ${eur(f.pl)} | ${f.credDesbal.toFixed(3)} | ${f.asim.toFixed(1)} | ${f.sigma.toFixed(0)} | ${eur(f.credito)} | ${f.tarde.toFixed(0)} |`);

console.log("\n  Los 12 peores días que el filtro DEJA PASAR:");
console.log("\n| fecha | P&L | credDesbal | asim | σ | crédito | mov. tarde |");
console.log("|---|---|---|---|---|---|---|");
for (const f of [...dentro].sort((a, b) => a.pl - b.pl).slice(0, 12))
  console.log(`| ${f.fecha} | ${eur(f.pl)} | ${f.credDesbal.toFixed(3)} | ${f.asim.toFixed(1)} | ${f.sigma.toFixed(0)} | ${eur(f.credito)} | ${f.tarde.toFixed(0)} |`);

console.log("\n## 4 · ¿LA MEJORA DE RACHA ES UN SOLO EPISODIO?\n");
// dónde está el valle de la racha base y qué pasa ahí con el filtro
function tramoPeor(fs) {
  let acc = 0, pico = 0, peor = 0, iPico = 0, iIni = 0, iFin = 0;
  for (let i = 0; i < fs.length; i++) {
    acc += fs[i].pl;
    if (acc > pico) { pico = acc; iPico = i; }
    if (acc - pico < peor) { peor = acc - pico; iIni = iPico; iFin = i; }
  }
  return { peor, desde: fs[iIni].fecha, hasta: fs[iFin].fecha };
}
const tb = tramoPeor(filas), tf = tramoPeor(dentro);
console.log(`  base    : ${eur(tb.peor)} entre ${tb.desde} y ${tb.hasta}`);
console.log(`  filtrada: ${eur(tf.peor)} entre ${tf.desde} y ${tf.hasta}`);

console.log("\n## 5 · EL CONTROL DECISIVO — ¿lo hace `asim` sola, sin nada de mercado?\n");
console.log("| filtro | días | $/año | peor día | peor racha | Calmar |");
console.log("|---|---|---|---|---|---|");
const base = { alAno: filas.reduce((a, f) => a + f.pl, 0) / ANOS, dd: drawdown(filas.map((f) => f.pl)), peor: Math.min(...filas.map((f) => f.pl)) };
console.log(`| — sin filtrar — | ${filas.length} | ${eur(base.alAno)} | ${eur(base.peor)} | ${eur(base.dd)} | ${(base.alAno / -base.dd).toFixed(2)} |`);
for (const [nom, orden] of [["`credDesbal` bajo 20%", (a, b) => a.credDesbal - b.credDesbal],
                            ["`asim` bajo 20% (call cerca)", (a, b) => a.asim - b.asim],
                            ["`asim` alto 20% (call lejos)", (a, b) => b.asim - a.asim]]) {
  const o = [...filas].sort(orden), fu = new Set(o.slice(0, nFuera).map((f) => f.fecha));
  const d = filas.filter((f) => !fu.has(f.fecha)).map((f) => f.pl);
  const alAno = d.reduce((a, b) => a + b, 0) / ANOS, dd = drawdown(d);
  console.log(`| ${nom} | ${d.length} | ${eur(alAno)} | ${eur(Math.min(...d))} | ${eur(dd)} | ${(alAno / -dd).toFixed(2)} |`);
}

console.log("\n## 6 · ¿Y SI EN VEZ DE FILTRAR SE CENTRA EL CÓNDOR?\n");
console.log("  Si la asimetría de la rejilla explica algo, la respuesta no es dejar de operar:");
console.log("  es elegir los strikes simétricos respecto al spot redondeado. Eso hay que MEDIRLO");
console.log("  releyendo las cadenas con otra regla de strikes — no se puede deducir de aquí.");
console.log(`\n  Pista: correlación asim ↔ P&L = ${corr(col("asim"), col("pl")).toFixed(3)} · asim ↔ |mov. tarde| = ${corr(col("asim"), filas.map((f) => Math.abs(f.tarde))).toFixed(3)}`);
