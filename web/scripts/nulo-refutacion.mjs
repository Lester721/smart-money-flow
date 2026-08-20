// REFUTACIÓN CON LA LENTE "NULO" — ¿existe la regla, o el control tonto la iguala?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/nulo-refutacion.mjs
//
// El informe afirma: (1) la cuenta aguanta las TRES geometrías a 1 y 2 contratos sin llamada de
// margen; (2) el suelo de CAJA ordena al revés que la caída; (3) el filtro de amplitud no aporta.
//
// Aquí se pregunta lo único que importa para creerse (1) y (2):
//   · ¿la pregunta "¿aguanta?" DISTINGUE algo, o cualquier cosa la pasa a 1-2 contratos?
//   · ¿el suelo de caja y la caída máxima son SEÑAL, o son un sorteo del ORDEN de los días?
//   · ¿la reducción de exposición del filtro se consigue igual con MENOS TAMAÑO o con EFECTIVO?
//
// PRUEBAS DECLARADAS aquí: 12 (3 geometrías × 2 tamaños × 2 métricas contra su nulo de camino).

import { readFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { listonT } from "../lib/barreraHallazgos";

const EFECTIVO = 7977, CUENTA = 56389, HOOD = 48135, LINEA = -0.70 * HOOD, BP0 = 73874, INT = 0.05;
const PRUEBAS = 12;

const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const pct = (x) => (x < 0 ? "−" : "") + Math.abs(x * 100).toFixed(1) + "%";
const anosEntre = (a, b) => (new Date(b + "T00:00:00Z") - new Date(a + "T00:00:00Z")) / 86400000 / 365.25;
const q = (v, p) => { const s = [...v].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * p)))]; };

// RNG reproducible (el control del informe usa Math.random(), que no se puede repetir)
let _s = 20260820 >>> 0;
const rnd = () => (_s = (_s * 1664525 + 1013904223) >>> 0) / 4294967296;

const D = JSON.parse(readFileSync("scripts/cuanto-aguanta-dias.json", "utf8")).dias;
const ANOS = anosEntre(D[0].fecha, D[D.length - 1].fecha);

radiografia(
  D.map((d) => ({ sp11: d.sp11, cierre: d.cierre, plA: d.A.pl, plB: d.B.pl, plC: d.C.pl, credA: d.A.cred })),
  ["sp11", "cierre", "plA", "plB", "plC", "credA"], "nulo · 3 geometrías del informe",
);
console.log(`  filtro: ${D.filter((d) => d.opera).length} sí · ${D.filter((d) => !d.opera).length} no`);
console.log(`\n  ${D.length} sesiones · ${D[0].fecha} → ${D[D.length - 1].fecha} · listón con ${PRUEBAS} pruebas: |t| ≥ ${listonT(PRUEBAS).toFixed(2)}\n`);

/** La caja día a día sobre una serie de P&L ya decidida (mismo modelo que el informe). */
function caja(pls, fechas) {
  let ef = EFECTIVO, interes = 0, minC = EFECTIVO, pico = EFECTIVO, dd = 0;
  let rojo = null, llamada = null, prev = fechas[0], diasRojo = 0;
  for (let i = 0; i < pls.length; i++) {
    const nd = Math.max(0, (new Date(fechas[i] + "T00:00:00Z") - new Date(prev + "T00:00:00Z")) / 86400000);
    prev = fechas[i];
    if (ef < 0 && nd > 0) { const it = ef * INT * nd / 365; interes += it; ef += it; }
    ef += pls[i];
    if (ef > pico) pico = ef;
    if (pico - ef > dd) dd = pico - ef;
    if (ef < minC) minC = ef;
    if (ef < 0) { diasRojo++; if (!rojo) rojo = fechas[i]; }
    if (ef < LINEA && !llamada) llamada = fechas[i];
  }
  return { final: ef, anual: (ef - EFECTIVO) / ANOS, interes, minC, dd, ddPct: dd / CUENTA, rojo, llamada, diasRojo };
}

const FECHAS = D.map((d) => d.fecha);
const serie = (g, n, filtro) => D.map((d) => (filtro && !d.opera ? 0 : d[g].pl * n));
const G = { A: "cóndor HOY ±25/50", B: "filtro amplitud ±30/50", C: "straddle 2,3×/30" };

// ══════════════════════════════════════════════════════════════════════════════════════════
// 1 · ¿CUÁNTA POTENCIA TIENE LA PREGUNTA "¿AGUANTA LA CUENTA?"
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(110));
console.log("### 1 · ¿DISTINGUE ALGO LA PREGUNTA? — cuánto margen sobra hasta la llamada");
console.log("═".repeat(110) + "\n");
console.log(`Margen total desde el arranque hasta la llamada: $${EFECTIVO.toLocaleString("es-ES")} + ${eur(-LINEA)} = **${eur(EFECTIVO - LINEA)}**`);
console.log("La llamada sólo llega si la PÉRDIDA ACUMULADA DESDE EL INICIO baja de ese número.\n");
console.log("| geometría | ctr | peor punto acumulado desde el inicio (fecha) | margen que sobraba | ¿cuántas veces peor tendría que haber ido? |");
console.log("|---|---|---|---|---|");
for (const g of ["A", "B", "C"]) for (const n of [1, 2]) {
  const f = g === "B";
  let acc = 0, min = 0, fecha = "—";
  const s = serie(g === "B" ? "B" : g, n, f);
  s.forEach((p, i) => { acc += p; if (acc < min) { min = acc; fecha = FECHAS[i]; } });
  const sobra = (EFECTIVO - LINEA) + min;
  console.log(`| ${G[g]} | ${n} | ${eur(min)} (${fecha}) | ${eur(sobra)} | **${(( EFECTIVO - LINEA) / -min).toFixed(1)}×** |`);
}
console.log("\nUn test que ni a 2 contratos se acerca a la mitad de su umbral no está midiendo la estrategia: mide la distancia al umbral.");

// ══════════════════════════════════════════════════════════════════════════════════════════
// 2 · NULO DE CAMINO — barajar el ORDEN de los días
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n\n" + "═".repeat(110));
console.log("### 2 · NULO DE CAMINO — mismas ganancias y pérdidas, ORDEN barajado (2.000 sorteos)");
console.log("═".repeat(110) + "\n");
console.log("La caída máxima, el suelo de caja y la llamada dependen del ORDEN. Si al barajar salen");
console.log("los mismos números, la historia de \"abril de 2024\" y del pico del 2022-06-27 es relato sobre ruido.\n");
console.log("| geometría | ctr | caída REAL | caída barajada p10 / mediana / p90 | percentil de la real | suelo caja REAL | suelo barajado p10 / mediana | percentil | llamadas en 2.000 sorteos |");
console.log("|---|---|---|---|---|---|---|---|---|");
const REAL = {};
for (const g of ["A", "B", "C"]) for (const n of [1, 2]) {
  const s = serie(g, n, g === "B");
  const real = caja(s, FECHAS); REAL[g + n] = real;
  const dds = [], mins = []; let calls = 0;
  for (let it = 0; it < 2000; it++) {
    const p = s.slice();
    for (let i = p.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [p[i], p[j]] = [p[j], p[i]]; }
    const r = caja(p, FECHAS); dds.push(r.dd); mins.push(r.minC); if (r.llamada) calls++;
  }
  const pctlDD = dds.filter((x) => x <= real.dd).length / 20;
  const pctlMin = mins.filter((x) => x >= real.minC).length / 20;
  console.log(`| ${G[g]} | ${n} | ${eur(-real.dd)} | ${eur(-q(dds, 0.10))} / ${eur(-q(dds, 0.5))} / ${eur(-q(dds, 0.90))} | ${pctlDD.toFixed(0)}% | ${eur(real.minC)} | ${eur(q(mins, 0.10))} / ${eur(q(mins, 0.5))} | ${pctlMin.toFixed(0)}% | ${calls} |`);
}
console.log("\n(percentil = qué % de los sorteos sale igual o mejor que lo real. Cerca de 50% ⇒ lo real es un sorteo más.)");

// ══════════════════════════════════════════════════════════════════════════════════════════
// 3 · EL CONTROL TONTO — la misma exposición, con TAMAÑO en vez de con la regla
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n\n" + "═".repeat(110));
console.log("### 3 · CONTROL TONTO · MISMA EXPOSICIÓN — filtro con k contratos vs. SIN filtro con j");
console.log("═".repeat(110) + "\n");
const nOp = D.filter((d) => d.opera).length, nTot = D.length;
console.log(`Exposición = contratos × días operados. El filtro opera ${nOp}/${nTot} días (${(nOp / nTot * 100).toFixed(1)}%).`);
console.log(`Se empareja cada tamaño del filtro con el tamaño SIN filtro de exposición más parecida.\n`);
console.log("| filtro ±30/50 | contrato-días | ≈ sin filtro ±30/50 | contrato-días | caída filtro | caída sin filtro | ¿gana el filtro? | $/año filtro | $/año sin filtro |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (let k = 1; k <= 5; k++) {
  const expF = nOp * k;
  let mejor = 1, dif = Infinity;
  for (let j = 1; j <= 6; j++) if (Math.abs(nTot * j - expF) < dif) { dif = Math.abs(nTot * j - expF); mejor = j; }
  const rF = caja(serie("B", k, true), FECHAS);
  const rS = caja(serie("B", mejor, false), FECHAS);
  console.log(`| ${k} ctr | ${expF} | ${mejor} ctr | ${nTot * mejor} | ${eur(-rF.dd)} | ${eur(-rS.dd)} | ${rF.dd < rS.dd ? "**sí**" : "no"} | ${eur(rF.anual)} | ${eur(rS.anual)} |`);
}

// 3b · el control tonto en su versión más pura: dejar EFECTIVO parado
console.log("\n**Y el control tonto de verdad — EFECTIVO parado y nada más:** caída $0 · suelo de caja $7.977 · $0/año · llamada NO.");
console.log("Cualquier geometría a cualquier tamaño pierde contra el efectivo en caída y en suelo de caja. La pregunta");
console.log("\"¿aguanta la cuenta?\" siempre la gana el que no opera: por eso su respuesta no elige entre estrategias.\n");

// 3c · misma reducción de caída con TAMAÑO: ¿cuánto cuesta comprar la caída del filtro sin el filtro?
console.log("| variante ±30/50, 1 contrato | caída máxima | $/año | $ por cada $1.000 de caída evitada |");
console.log("|---|---|---|---|");
const base = caja(serie("B", 1, false), FECHAS);
const filt = caja(serie("B", 1, true), FECHAS);
console.log(`| SIN filtro (base) | ${eur(-base.dd)} | ${eur(base.anual)} | — |`);
console.log(`| CON filtro de amplitud | ${eur(-filt.dd)} | ${eur(filt.anual)} | ${eur((base.anual - filt.anual) / ((base.dd - filt.dd) / 1000))} |`);

// ══════════════════════════════════════════════════════════════════════════════════════════
// 4 · LA REGLA DE HIERRO sobre lo que el informe sí presenta como ordenado
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n\n" + "═".repeat(110));
console.log("### 4 · ¿SE HEREDA EL ORDEN? — mitad A elige, mitad B comprueba, y al revés");
console.log("═".repeat(110) + "\n");
const iA = D.map((d, i) => i).filter((i) => D[i].ano <= 2023);
const iB = D.map((d, i) => i).filter((i) => D[i].ano >= 2024);
const sub = (idx, g, n, f) => ({ pls: idx.map((i) => (f && !D[i].opera ? 0 : D[i][g].pl * n)), fec: idx.map((i) => D[i].fecha) });
console.log("| métrica | orden en MITAD A (2022-23) | orden en MITAD B (2024-26) | ¿mismo orden? |");
console.log("|---|---|---|---|");
for (const [met, f] of [["caída máxima", (r) => r.dd], ["suelo de caja", (r) => -r.minC], ["$/año", (r) => -r.anual]]) {
  const orden = (idx) => ["A", "B", "C"].map((g) => {
    const { pls, fec } = sub(idx, g, 1, g === "B"); return { g, v: f(caja(pls, fec)) };
  }).sort((x, y) => x.v - y.v).map((x) => G[x.g]);
  const oA = orden(iA), oB = orden(iB);
  console.log(`| ${met} (mejor → peor) | ${oA.join(" · ")} | ${oB.join(" · ")} | ${oA.join() === oB.join() ? "**SÍ**" : "**NO**"} |`);
}
