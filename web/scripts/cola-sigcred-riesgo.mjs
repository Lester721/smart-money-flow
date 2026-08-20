// SIGMA-CREDITO · FASE 4 — LA TRAMPA DEL UMBRAL FIJO, y el techo mecánico de la pérdida.
//
// ═══ POR QUÉ EXISTE ESTE FICHERO ══════════════════════════════════════════════════════════════
// En la fase 2 salieron once señales con z > 3,49 sobre "P(pérdida > $2.000)". Todas apuntaban
// al mismo sitio: cuando la volatilidad implícita es alta, hay más días de pérdida grande. Pero
// hay una explicación mecánica que hace ese resultado inevitable y VACÍO:
//
//     pérdida máxima posible del día = ANCHO($5.000) − crédito cobrado
//
// Un día de crédito $100 no puede perder más de $4.900; uno de crédito $1.800, no más de $3.200.
// Un umbral FIJO de $2.000 es, por tanto, una fracción distinta del riesgo cada día: el 41% del
// riesgo cuando el crédito es alto y el 65% cuando es bajo. Contar cruces de una línea fija sobre
// distribuciones de anchura distinta mide la ANCHURA, no la mala suerte.
//
// Aquí se repite todo con el día malo definido como FRACCIÓN DEL RIESGO REAL de ese día. Si las
// once señales sobreviven, el hallazgo era de verdad. Si se caen, era el umbral.
//
// PRUEBAS: se declaran 34 nuevas sobre las 104 de la fase 2 → 138. El divisor sube, no baja.

import { readFileSync, writeFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";
import { radiografia } from "../lib/radiografia";
import { media, sd, pct, eur, drawdown } from "./anatomia3-lib.mjs";

const PRUEBAS_PREVIAS = 104;
const PRUEBAS_NUEVAS = 13 * 2 + 6 + 2;              // 13 señales × 2 umbrales + 6 suelos + 2 combinados
const PRUEBAS = PRUEBAS_PREVIAS + PRUEBAS_NUEVAS;   // 138
const LISTON = listonT(PRUEBAS);
const PERM = 4000;
const ANCHO_$ = 5000;

const filas = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8")).sort((a, b) => a.fecha.localeCompare(b.fecha));
const CAD = JSON.parse(readFileSync("scripts/cola-sigcred-cadena.json", "utf8"));
const ANOS = (new Date(filas[filas.length - 1].fecha) - new Date(filas[0].fecha)) / (365.25 * 864e5);

const credHist = [];
for (const f of filas) {
  const c = CAD[f.fecha];
  const ivAtm = (c.ivAtmC + c.ivAtmP) / 2;
  f.riesgoMax = ANCHO_$ - f.credito;                 // lo máximo que se puede perder ESE día
  f.plFrac = f.pl / f.riesgoMax;                     // P&L en fracción del riesgo del día
  f.sigmaPts = f.sigma;
  f.sigmaRatio = 25 / f.sigma;
  f.sigmaPct = (f.sigma / f.sp11) * 100;
  f.cred = f.credito;
  f.credPct = (f.credito / ANCHO_$) * 100;
  f.credPorSigma = f.credito / f.sigma;
  const prev = credHist.slice(-60);
  f.credRel60 = prev.length >= 30 ? f.credito / pct(prev, 0.5) : null;
  credHist.push(f.credito);
  f.credDesbal = (c.credPut - c.credCall) / f.credito;
  f.skew = c.ivSP - c.ivSC;
  f.sonrisa = (c.ivLC + c.ivLP) / 2 - ivAtm;
  f.sonrisaCall = c.ivLC - ivAtm;
  f.sonrisaPut = c.ivLP - ivAtm;
  f.ivAtm = ivAtm;
  f.tarde = f.cierre - f.sp11;                       // DESENLACE
  f.tardeSigmas = Math.abs(f.tarde) / f.sigma;       // DESENLACE
}
const CAMPOS = ["sigmaPts", "sigmaRatio", "sigmaPct", "cred", "credPct", "credPorSigma", "credRel60",
                "credDesbal", "skew", "sonrisa", "sonrisaCall", "sonrisaPut", "ivAtm"];
radiografia(filas, ["plFrac", "riesgoMax", ...CAMPOS], "riesgo normalizado", { maxCeros: 0.2, cerosLegitimos: ["plFrac"] });

const zProp = (x1, n1, x2, n2) => {
  const p = (x1 + x2) / (n1 + n2), se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  return se > 0 ? (x1 / n1 - x2 / n2) / se : NaN;
};

console.log("═".repeat(104));
console.log("  EL UMBRAL FIJO ERA LA SEÑAL · el día malo, ahora en fracción del riesgo de ESE día");
console.log(`  ${filas.length} días · ${PRUEBAS} pruebas declaradas · listón |z| ≥ ${LISTON}`);
console.log("═".repeat(104));

// ═══ 1 · EL TECHO MECÁNICO ═════════════════════════════════════════════════════════════════
console.log("\n## 1 · LA PÉRDIDA MÁXIMA LA FIJA EL CRÉDITO, NO EL MERCADO\n");
console.log("| tercio de crédito | n | crédito medio | riesgo máx. | peor día real | ¿tocó el techo? | P(pérd>$2.000) | P(pérd > 50% riesgo) |");
console.log("|---|---|---|---|---|---|---|---|");
{
  const ord = [...filas].sort((a, b) => b.credito - a.credito), k = Math.floor(ord.length / 3);
  for (const [nom, g] of [["ALTO", ord.slice(0, k)], ["medio", ord.slice(k, ord.length - k)], ["BAJO", ord.slice(-k)]]) {
    const peor = Math.min(...g.map((f) => f.pl));
    const rm = media(g.map((f) => f.riesgoMax));
    const techo = g.filter((f) => f.pl < -0.95 * f.riesgoMax).length;
    console.log(`| ${nom} | ${g.length} | ${eur(media(g.map((f) => f.credito)))} | ${eur(rm)} | ${eur(peor)} | ${techo} días | ${(g.filter((f) => f.pl < -2000).length / g.length * 100).toFixed(1)}% | ${(g.filter((f) => f.plFrac < -0.5).length / g.length * 100).toFixed(1)}% |`);
  }
}
console.log(`\n  El umbral fijo de $2.000 vale, según el día, entre el ${(2000 / Math.max(...filas.map((f) => f.riesgoMax)) * 100).toFixed(0)}% y el ${(2000 / Math.min(...filas.map((f) => f.riesgoMax)) * 100).toFixed(0)}% del riesgo del día.`);
console.log("  Por eso la fase 2 encontró once señales: todas eran el mismo termómetro de volatilidad,");
console.log("  y una línea fija cruza más veces una distribución ancha que una estrecha.");

// ═══ 2 · LAS 13 SEÑALES, CON EL DÍA MALO NORMALIZADO ═══════════════════════════════════════
const UMB = [[0.5, "pérdida > 50% del riesgo"], [0.9, "pérdida > 90% del riesgo (casi total)"]];
console.log("\n## 2 · LAS MISMAS 13 SEÑALES, CON EL DÍA MALO EN FRACCIÓN DEL RIESGO\n");
console.log("| señal | z con umbral FIJO $2.000 | z con >50% riesgo | z con >90% riesgo | ¿sobrevive? |");
console.log("|---|---|---|---|---|");
const norm = [];
for (const campo of CAMPOS) {
  const val = filas.filter((f) => f[campo] != null && isFinite(f[campo]));
  const ord = [...val].sort((a, b) => b[campo] - a[campo]), k = Math.floor(ord.length / 3);
  const A = ord.slice(0, k), B = ord.slice(-k);
  const zFijo = zProp(A.filter((f) => f.pl < -2000).length, A.length, B.filter((f) => f.pl < -2000).length, B.length);
  const zs = UMB.map(([u]) => zProp(A.filter((f) => f.plFrac < -u).length, A.length, B.filter((f) => f.plFrac < -u).length, B.length));
  const sobrevive = Math.abs(zs[0]) >= LISTON && Math.sign(zs[0]) === Math.sign(zFijo);
  norm.push({ campo, zFijo, z50: zs[0], z90: zs[1], sobrevive });
  console.log(`| \`${campo}\` | ${zFijo.toFixed(2)} | **${zs[0].toFixed(2)}** | ${zs[1].toFixed(2)} | ${sobrevive ? "🟢 sí" : "no"} |`);
}
console.log(`\n  Sobreviven ${norm.filter((n) => n.sobrevive).length} de 13. Listón: |z| ≥ ${LISTON}.`);

// ═══ 3 · ¿DÓNDE VIVEN LOS DÍAS DE PÉRDIDA CASI TOTAL? ══════════════════════════════════════
const totales = filas.filter((f) => f.plFrac < -0.9);
console.log(`\n## 3 · LOS ${totales.length} DÍAS DE PÉRDIDA CASI TOTAL (> 90% del riesgo)\n`);
console.log("| fecha | P&L | crédito | σ | mov. tarde | en σ | tercio de σ |");
console.log("|---|---|---|---|---|---|---|");
const ordS = [...filas].sort((a, b) => b.sigma - a.sigma), kS = Math.floor(filas.length / 3);
const tercioDe = (f) => (ordS.indexOf(f) < kS ? "ALTO" : ordS.indexOf(f) >= filas.length - kS ? "BAJO" : "medio");
for (const f of [...totales].sort((a, b) => a.pl - b.pl))
  console.log(`| ${f.fecha} | ${eur(f.pl)} | ${eur(f.credito)} | ${f.sigma.toFixed(0)} | ${f.tarde.toFixed(0)} pts | ${f.tardeSigmas.toFixed(2)}σ | ${tercioDe(f)} |`);
console.log(`\n  crédito medio de esos días: ${eur(media(totales.map((f) => f.credito)))} · del resto: ${eur(media(filas.filter((f) => f.plFrac >= -0.9).map((f) => f.credito)))}`);
console.log(`  σ media de esos días: ${media(totales.map((f) => f.sigma)).toFixed(1)} · del resto: ${media(filas.filter((f) => f.plFrac >= -0.9).map((f) => f.sigma)).toFixed(1)}`);
console.log(`  el movimiento de tarde que los causa, en σ: mediana ${pct(totales.map((f) => f.tardeSigmas), 0.5).toFixed(2)}σ`);
console.log("\n  LEE ESTO: los días que se comen el riesgo entero son los de crédito BAJO y σ BAJA —");
console.log("  justo los que ninguna señal de volatilidad marca, porque para la señal son los días buenos.");

// ═══ 4 · EL SUELO DE CRÉDITO — la única palanca que ataca el techo ═════════════════════════
function permP(val, nFuera, obs, semilla, metrica) {
  let s = (semilla >>> 0) || 1;
  const r = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const idx = val.map((_, i) => i);
  let iguala = 0;
  for (let p = 0; p < PERM; p++) {
    const a = [...idx];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    const q = new Set(a.slice(0, nFuera));
    const pls = [];
    for (let i = 0; i < val.length; i++) if (!q.has(i)) pls.push(val[i].pl);
    if (metrica(pls) >= obs) iguala++;
  }
  return iguala / PERM;
}
const baseP = filas.map((f) => f.pl);
const BASE = { alAno: baseP.reduce((a, b) => a + b, 0) / ANOS, dd: drawdown(baseP), peor: Math.min(...baseP) };

console.log("\n## 4 · SUELO DE CRÉDITO — no entrar si pagan menos de X\n");
console.log(`  Es la ÚNICA palanca de las medidas que ataca el techo: si no entras cuando el crédito`);
console.log(`  es mínimo, eliminas los días cuyo riesgo máximo estaba cerca de los $5.000 enteros.\n`);
console.log("| suelo | días | % ingreso | $/año | peor día | peor racha | Calmar | p perm. (peor día) | p perm. (racha) | años |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
const SUELOS = [100, 150, 200, 250, 300, 400];
const ANOS_L = [...new Set(filas.map((f) => f.fecha.slice(0, 4)))].sort();
const suelos = [];
for (const s of SUELOS) {
  const dentro = filas.filter((f) => f.credito >= s);
  const pl = dentro.map((f) => f.pl);
  const nFuera = filas.length - dentro.length;
  const peor = Math.min(...pl), dd = drawdown(pl), alAno = pl.reduce((a, b) => a + b, 0) / ANOS;
  const pPeor = permP(filas, nFuera, peor, 991 + s, (v) => Math.min(...v));
  const pDD = permP(filas, nFuera, dd, 5501 + s, (v) => drawdown(v));
  const sg = ANOS_L.map((y) => {
    const v = filas.filter((f) => f.fecha.slice(0, 4) === y), d = v.filter((f) => f.credito >= s);
    return d.length && drawdown(d.map((f) => f.pl)) > drawdown(v.map((f) => f.pl)) ? "+" : "−";
  }).join("");
  suelos.push({ s, n: dentro.length, alAno, peor, dd, pPeor, pDD, sg, pct: pl.reduce((a, b) => a + b, 0) / baseP.reduce((a, b) => a + b, 0) });
  console.log(`| ≥ $${s} | ${dentro.length} | ${(pl.reduce((a, b) => a + b, 0) / baseP.reduce((a, b) => a + b, 0) * 100).toFixed(0)}% | ${eur(alAno)} | ${eur(peor)} | ${eur(dd)} | ${(alAno / -dd).toFixed(2)} | ${pPeor.toFixed(4)} | ${pDD.toFixed(4)} | ${sg} |`);
}

// ═══ 5 · LOS DOS COMBINADOS DECLARADOS ═════════════════════════════════════════════════════
console.log("\n## 5 · LOS DOS COMBINADOS DECLARADOS\n");
console.log("| regla | días | % ingreso | $/año | peor día | peor racha | Calmar | p perm. (peor día) | p perm. (racha) |");
console.log("|---|---|---|---|---|---|---|---|---|");
const COMB = [
  ["crédito ≥ $200 **y** σ ≥ 40 pts", (f) => f.credito >= 200 && f.sigma >= 40],
  ["crédito ≥ $200 **y** credPorSigma ≥ 4", (f) => f.credito >= 200 && f.credPorSigma >= 4],
];
for (const [nom, regla] of COMB) {
  const dentro = filas.filter(regla), pl = dentro.map((f) => f.pl);
  const peor = Math.min(...pl), dd = drawdown(pl), alAno = pl.reduce((a, b) => a + b, 0) / ANOS;
  const pPeor = permP(filas, filas.length - dentro.length, peor, 7717 + nom.length, (v) => Math.min(...v));
  const pDD = permP(filas, filas.length - dentro.length, dd, 3313 + nom.length, (v) => drawdown(v));
  console.log(`| ${nom} | ${dentro.length} | ${(pl.reduce((a, b) => a + b, 0) / baseP.reduce((a, b) => a + b, 0) * 100).toFixed(0)}% | ${eur(alAno)} | ${eur(peor)} | ${eur(dd)} | ${(alAno / -dd).toFixed(2)} | ${pPeor.toFixed(4)} | ${pDD.toFixed(4)} |`);
}

console.log("\n" + "═".repeat(104));
console.log(`  LÍNEA BASE: ${eur(BASE.alAno)}/año · peor día ${eur(BASE.peor)} · peor racha ${eur(BASE.dd)} · Calmar ${(BASE.alAno / -BASE.dd).toFixed(2)}`);
console.log("═".repeat(104));

writeFileSync("scripts/cola-sigcred-riesgo-salida.json", JSON.stringify({
  liston: LISTON, pruebas: PRUEBAS, base: BASE, normalizado: norm, suelos,
  perdidaCasiTotal: totales.map((f) => ({ fecha: f.fecha, pl: f.pl, credito: f.credito, sigma: f.sigma, tarde: f.tarde, tardeSigmas: f.tardeSigmas })),
}, null, 2), "utf8");
console.log("\n  detalle en scripts/cola-sigcred-riesgo-salida.json");
