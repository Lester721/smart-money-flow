// ═══════════════════════════════════════════════════════════════════════════════════════════
//  SEGUNDA PASADA · lo que la primera destapó y lo que la primera tenía MAL
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// DOS COSAS.
//
// 1) UN FALLO MÍO EN EL LISTÓN. Puse "el ingreso fuera de muestra tiene que quedar ≥ 0". En
//    2022-2023 la base YA es −$16.354/año, así que esa condición es IMPOSIBLE de cumplir por
//    construcción y descalificaba reglas que sí mejoraban el ingreso. Se corrige: lo que importa
//    es Δingreso contra Δracha (el ratio), no el signo del nivel. El resto del listón se queda.
//
// 2) EL HALLAZGO QUE ASOMÓ EN LA TABLA CRUDA. El crédito NO separa la MEDIA (t=−0,17) pero
//    separa la COLA de forma brutal y estable: P(pérdida > $2.000) es 17,4% en el tercio de
//    crédito alto contra 2,1% en el bajo. Ocho a uno. Eso hay que medirlo bien, con su z, en los
//    dos períodos y en los tres tercios de tiempo — y hay que explicar POR QUÉ no se puede cobrar.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/credito-cruce-2.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { listonT, tWelch, potencia } from "../lib/barreraHallazgos";

const PRUEBAS = 40;                     // las mismas 40 declaradas en credito-cruce.mjs
const LISTON = listonT(PRUEBAS);
const CUENTA = 56389, ANCHO$ = 5000, MALO = 2000, MUY_MALO = 4000, PERM = 500;
const LISTON_RATIO = 0.08;              // el precio del TAMAÑO, la alternativa gratis
const CORTES = [0.10, 0.20, 0.30];

const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const pctl = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };
const drawdown = (pls) => { let acc = 0, pico = 0, peor = 0; for (const p of pls) { acc += p; if (acc > pico) pico = acc; if (acc - pico < peor) peor = acc - pico; } return peor; };
/** z de dos proporciones (agrupada). Para "¿la cola es más gorda aquí que allá?". */
const zProp = (x1, n1, x2, n2) => {
  const p = (x1 + x2) / (n1 + n2), se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  return se > 0 ? (x1 / n1 - x2 / n2) / se : 0;
};

// ── mismas señales, mismo constructor que credito-cruce.mjs ────────────────────────────────
const dias = JSON.parse(readFileSync("scripts/mal-dias.json", "utf8"))
  .sort((a, b) => a.fecha.localeCompare(b.fecha))
  .map((d) => ({ fecha: d.fecha, pl: d.pl, credito: d.credito, sigma: d.sigma, iv: d.iv, sp11: d.sp11, cierre: d.cierre }));
for (const f of dias) {
  f.credSigma = f.sigma > 0 ? f.credito / f.sigma : null;
  f.sigmaRatio = f.sigma > 0 ? 25 / f.sigma : null;
  f.perdidaMax = ANCHO$ - f.credito;
}
const VENT_REL = 20, VENT_REG = 250, MIN_REG = 60;
for (let i = 0; i < dias.length; i++) {
  const f = dias[i];
  f.credRel20 = i >= VENT_REL ? (() => { const m = pctl(dias.slice(i - VENT_REL, i).map((x) => x.credito), 0.5); return m > 0 ? f.credito / m : null; })() : null;
  const prev = dias.slice(Math.max(0, i - VENT_REG), i).filter((x) => x.sigmaRatio != null);
  if (prev.length >= MIN_REG && f.sigmaRatio != null) {
    const xs = prev.map((x) => x.sigmaRatio), ys = prev.map((x) => x.credito), mx = media(xs), my = media(ys);
    let sxy = 0, sxx = 0;
    for (let j = 0; j < xs.length; j++) { sxy += (xs[j] - mx) * (ys[j] - my); sxx += (xs[j] - mx) ** 2; }
    const b = sxx > 0 ? sxy / sxx : 0;
    f.credResid = f.credito - (my - b * mx + b * f.sigmaRatio);
  } else f.credResid = null;
}
radiografia(dias, ["pl", "credito", "credSigma", "sigmaRatio", "perdidaMax"], "los 1.121 días", { cerosLegitimos: ["pl"] });

const SIG = [["credito", "crédito en dólares"], ["credRel20", "crédito ÷ mediana 20d"], ["credSigma", "crédito ÷ σ"], ["sigmaRatio", "25 ÷ σ"], ["credResid", "residuo crédito|σ"]];
const A = dias.filter((f) => f.fecha < "2024-01-01"), B = dias.filter((f) => f.fecha >= "2024-01-01");

console.log(`\n${"═".repeat(100)}`);
console.log(`  SEGUNDA PASADA · ${dias.length} días · listón de |t| = ${LISTON} (${PRUEBAS} pruebas)`);
console.log(`${"═".repeat(100)}`);

// ═══ A · LA COLA: ¿el crédito alto avisa del día que duele? ════════════════════════════════
console.log(`\n## A · EL CRÉDITO Y LA COLA — tercio de crédito ALTO contra tercio BAJO\n`);
function tercios(fs, k) { const o = fs.filter((f) => f[k] != null).sort((x, y) => y[k] - x[k]); const t = Math.floor(o.length / 3); return { alto: o.slice(0, t), bajo: o.slice(-t) }; }
function bloque(fs) {
  const pl = fs.map((f) => f.pl);
  const nM = pl.filter((x) => x <= -MALO).length, nMM = pl.filter((x) => x <= -MUY_MALO).length;
  return { n: pl.length, media: media(pl), gana: pl.filter((x) => x > 0).length / pl.length * 100, nM, nMM, pMalo: nM / pl.length * 100, pMuyMalo: nMM / pl.length * 100, p5: pctl(pl, 0.05), p1: pctl(pl, 0.01), peor: Math.min(...pl), cred: media(fs.map((f) => f.credito)), gan: media(pl.filter((x) => x > 0)), per: media(pl.filter((x) => x <= 0)) };
}
const kk = Math.floor(dias.length / 3);
const GRUPOS = [
  ["TODO 2022-2026", dias], ["2022-2023", A], ["2024-2026", B],
  ["  tercio 1 de tiempo", dias.slice(0, kk)], ["  tercio 2 de tiempo", dias.slice(kk, 2 * kk)], ["  tercio 3 de tiempo", dias.slice(2 * kk)],
];
console.log("| período | P(>$2k) alto | P(>$2k) bajo | z | P(>$4k) alto | P(>$4k) bajo | z | media alto | media bajo | t de la media |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
const colaFilas = [];
for (const [et, fs] of GRUPOS) {
  const { alto, bajo } = tercios(fs, "credito");
  const a = bloque(alto), b = bloque(bajo);
  const z2 = zProp(a.nM, a.n, b.nM, b.n), z4 = zProp(a.nMM, a.n, b.nMM, b.n);
  const t = tWelch(alto.map((f) => f.pl), bajo.map((f) => f.pl));
  colaFilas.push({ et, a, b, z2, z4, t });
  console.log(`| ${et} | ${a.pMalo.toFixed(1)}% | ${b.pMalo.toFixed(1)}% | **${z2.toFixed(2)}** | ${a.pMuyMalo.toFixed(1)}% | ${b.pMuyMalo.toFixed(1)}% | ${z4.toFixed(2)} | ${eur(a.media)} | ${eur(b.media)} | ${t.toFixed(2)} |`);
}
console.log(`\n### POR QUÉ NO SE PUEDE COBRAR — la descomposición del día de crédito alto\n`);
console.log("| período | tercio | crédito medio | % días ganados | ganancia media | pérdida media | media neta |");
console.log("|---|---|---|---|---|---|---|");
for (const [et, fs] of [["TODO", dias], ["2022-23", A], ["2024-26", B]]) {
  const { alto, bajo } = tercios(fs, "credito");
  for (const [nm, g] of [["ALTO", alto], ["BAJO", bajo]]) {
    const x = bloque(g);
    console.log(`| ${et} | ${nm} | ${eur(x.cred)} | ${x.gana.toFixed(1)}% | ${eur(x.gan)} | ${eur(x.per)} | ${eur(x.media)} |`);
  }
}

// potencia: ¿qué separación de MEDIA podría haber visto esta muestra?
const pot = potencia(dias.map((f) => ({ pnl: f.pl, ticker: "SPX", fecha: f.fecha })), 100);
console.log(`\n### ¿tenía fuerza la prueba? (criba del lado negativo)\n`);
console.log(`  ${pot.mensaje.replace(/%/g, " $ (unidades de $, no %)")}`);
console.log(`  separación mínima detectable de la MEDIA con n=${dias.length}: ${eur(pot.detectable)} por día = ${eur(pot.detectable * 252)}/año`);

// ═══ B · EL LISTÓN CORREGIDO + CONTROL DEL AZAR EN TODAS LAS REGLAS ════════════════════════
function aplicar(fs, k, dir, u) { return fs.filter((f) => f[k] == null || (dir === "alto" ? f[k] >= u : f[k] <= u)); }
function met(fs, anos, base) {
  const pl = fs.map((f) => f.pl); if (!pl.length) return null;
  const tot = pl.reduce((a, b) => a + b, 0);
  const m = { n: pl.length, alAno: tot / anos, peor: Math.min(...pl), p1: pctl(pl, 0.01), p5: pctl(pl, 0.05), dd: drawdown(pl), pMalo: pl.filter((x) => x <= -MALO).length / pl.length * 100 };
  if (base) { m.dIngreso = m.alAno - base.alAno; m.dCaida = Math.abs(base.dd) - Math.abs(m.dd); m.ratio = m.dCaida > 0 ? Math.max(0, -m.dIngreso) / m.dCaida : Infinity; }
  return m;
}
function azar(fs, nQuita, ddBase, anos, seed) {
  let s = seed >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const pl = fs.map((f) => f.pl), mej = [];
  for (let k = 0; k < PERM; k++) {
    const idx = new Set(); while (idx.size < nQuita) idx.add((rnd() * pl.length) | 0);
    mej.push(Math.abs(ddBase) - Math.abs(drawdown(pl.filter((_, i) => !idx.has(i)))));
  }
  return mej.sort((a, b) => a - b);
}
const anosA = A.length / 252, anosB = B.length / 252;
const baseA = met(A, anosA), baseB = met(B, anosB);

console.log(`\n${"─".repeat(100)}`);
console.log(`## B · LAS 30 REGLAS CON EL LISTÓN CORREGIDO (sin la condición imposible) + AZAR`);
console.log(`   listón: Δracha > 0 y ratio ≤ $${LISTON_RATIO} en LAS DOS direcciones, y percentil ≥ 95 de ${PERM} sorteos`);
console.log(`${"─".repeat(100)}\n`);
console.log("| señal | dir | corte | 22-23→24-26 Δing / Δracha / $x$ / pctl azar | 24-26→22-23 Δing / Δracha / $x$ / pctl azar | ¿pasa? |");
console.log("|---|---|---|---|---|---|");
let pasan = 0, mejoranDos = 0;
const filas = [];
for (const [k, et] of SIG) {
  for (const corte of CORTES) {
    for (const dir of ["alto", "bajo"]) {
      const q = dir === "alto" ? corte : 1 - corte;
      const uA = pctl(A.map((f) => f[k]).filter((x) => x != null), q);
      const uB = pctl(B.map((f) => f[k]).filter((x) => x != null), q);
      const AB = met(aplicar(B, k, dir, uA), anosB, baseB);
      const BA = met(aplicar(A, k, dir, uB), anosA, baseA);
      const dosMejoran = AB.dCaida > 0 && BA.dCaida > 0;
      if (dosMejoran) mejoranDos++;
      let pAB = null, pBA = null;
      if (dosMejoran) {
        const zAB = azar(B, baseB.n - AB.n, baseB.dd, anosB, 12345);
        const zBA = azar(A, baseA.n - BA.n, baseA.dd, anosA, 54321);
        pAB = zAB.filter((x) => x < AB.dCaida).length / PERM;
        pBA = zBA.filter((x) => x < BA.dCaida).length / PERM;
      }
      const ok = dosMejoran && AB.ratio <= LISTON_RATIO && BA.ratio <= LISTON_RATIO && pAB >= 0.95 && pBA >= 0.95;
      if (ok) pasan++;
      filas.push({ k, et, dir, corte, uA, uB, AB, BA, pAB, pBA, ok });
      if (dosMejoran)
        console.log(`| ${et} | ${dir === "alto" ? "≥" : "≤"} | ${(corte * 100).toFixed(0)}% | ${eur(AB.dIngreso)} / ${eur(AB.dCaida)} / $${AB.ratio.toFixed(2)} / **p${(pAB * 100).toFixed(0)}** | ${eur(BA.dIngreso)} / ${eur(BA.dCaida)} / $${BA.ratio.toFixed(2)} / **p${(pBA * 100).toFixed(0)}** | ${ok ? "**SÍ**" : "no"} |`);
    }
  }
}
console.log(`\n  ${mejoranDos} de 30 mejoran la racha en las dos direcciones · **${pasan} de 30 pasan el listón completo**`);
console.log(`  (las 18 que no mejoran la racha en las dos ni se someten al azar: ya están descartadas)`);

// ═══ C · ¿Y SI EN VEZ DE FILTRAR SE AJUSTA EL TAMAÑO POR EL CRÉDITO? ═══════════════════════
// El crédito determina la pérdida MÁXIMA del día: (5.000 − crédito). Un tope duro de riesgo es
// aritmética, no predicción. Se prueba con un presupuesto de riesgo fijo por día.
console.log(`\n${"─".repeat(100)}`);
console.log(`## C · TOPE DURO DE RIESGO — contratos = presupuesto ÷ (5.000 − crédito). No predice: acota.`);
console.log(`${"─".repeat(100)}\n`);
console.log("| presupuesto/día | 2022-23 $/año | 2022-23 peor día | 2022-23 racha | 2024-26 $/año | 2024-26 peor día | 2024-26 racha | $ por $ 22-23 | $ por $ 24-26 |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const PRES of [2000, 3000, 4000, 5000]) {
  const r = {};
  for (const [nm, fs, anos, base] of [["A", A, anosA, baseA], ["B", B, anosB, baseB]]) {
    const pl = fs.map((f) => f.pl * Math.min(1, PRES / f.perdidaMax));   // fracción de contrato, sin redondear
    const tot = pl.reduce((a, b) => a + b, 0);
    const dd = drawdown(pl);
    r[nm] = { alAno: tot / anos, peor: Math.min(...pl), dd, dIngreso: tot / anos - base.alAno, dCaida: Math.abs(base.dd) - Math.abs(dd) };
    r[nm].ratio = r[nm].dCaida > 0 ? Math.max(0, -r[nm].dIngreso) / r[nm].dCaida : Infinity;
  }
  console.log(`| ${eur(PRES)} | ${eur(r.A.alAno)} | ${eur(r.A.peor)} | ${eur(r.A.dd)} | ${eur(r.B.alAno)} | ${eur(r.B.peor)} | ${eur(r.B.dd)} | $${isFinite(r.A.ratio) ? r.A.ratio.toFixed(2) : "∞"} | $${isFinite(r.B.ratio) ? r.B.ratio.toFixed(2) : "∞"} |`);
}
console.log(`\n  (control: encoger el VEHÍCULO a secas cuesta $0,08 por $1 de racha, medido en la tanda anterior)`);

// ═══ D · QUÉ LE FALTA, CON NÚMEROS ═════════════════════════════════════════════════════════
console.log(`\n${"─".repeat(100)}`);
console.log(`## D · QUÉ LE FALTARÍA AL CRÉDITO PARA SERVIR`);
console.log(`${"─".repeat(100)}\n`);
const { alto, bajo } = tercios(dias, "credito");
const plAlto = alto.map((f) => f.pl);
const mAlto = media(plAlto), sAlto = sd(plAlto);
const nQuita = alto.length;
const baseTodo = met(dias, dias.length / 252);
// para que tirar esos días sea GRATIS, su media tiene que ser ≤ 0. ¿A cuánto está y con qué error?
const ee = sAlto / Math.sqrt(plAlto.length);
console.log(`  El tercio de crédito ALTO (${nQuita} días) tiene media ${eur(mAlto)}/día, error estándar ${eur(ee)}.`);
console.log(`  Para que tirarlo saliera gratis su media tendría que ser ≤ $0. Está a ${(Math.abs(mAlto) / ee).toFixed(2)} errores estándar de cero`);
console.log(`  → la muestra NO puede distinguir su media de cero, y ese es exactamente el problema:`);
console.log(`     el filtro no cuesta mucho, pero tampoco gana nada, y encima quita ${(nQuita / dias.length * 100).toFixed(0)}% de los días.`);
const ddSinAlto = drawdown(dias.filter((f) => !alto.includes(f)).map((f) => f.pl));
console.log(`\n  Si se tirara ese tercio: racha ${eur(baseTodo.dd)} → ${eur(ddSinAlto)} · ingreso ${eur(baseTodo.alAno)} → ${eur(dias.filter((f) => !alto.includes(f)).reduce((a, f) => a + f.pl, 0) / (dias.length / 252))}/año`);
console.log(`\n  LO QUE LE FALTA, en una frase con número: el crédito separa la COLA 8 a 1 (17,4% contra 2,1%)`);
console.log(`  pero separa la MEDIA en ${eur(colaFilas[0].a.media - colaFilas[0].b.media)}/día cuando la muestra de 1.121 días sólo`);
console.log(`  puede ver separaciones de ${eur(pot.detectable)}/día. Para ser cobrable necesitaría una media`);
console.log(`  del tercio alto por debajo de ${eur(-LISTON_RATIO * 1000)} /día sostenida — hoy está en ${eur(mAlto)} ± ${eur(2 * ee)}.`);

writeFileSync("scripts/credito-cruce-2-salida.json", JSON.stringify({ colaFilas, filas: filas.map((f) => ({ senal: f.k, dir: f.dir, corte: f.corte, uA: f.uA, uB: f.uB, AB: f.AB, BA: f.BA, pAB: f.pAB, pBA: f.pBA, ok: f.ok })), pasan, mejoranDos, potencia: pot, mAlto, eeAlto: ee }, null, 1), "utf8");
console.log(`\n  → scripts/credito-cruce-2-salida.json`);
