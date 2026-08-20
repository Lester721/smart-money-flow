// ANATOMÍA 3 · LAS REGLAS CANDIDATAS — medidas como se deben medir.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/anatomia3-reglas.mjs
//
// ═══ DOS ARREGLOS SOBRE EL BARRIDO ═══════════════════════════════════════════════════════════
//
// 1) LA MÉTRICA DEL BARRIDO ESTABA MAL PLANTEADA. "$/año retenidos por cada $ de racha
//    eliminado" premia a quien no quita casi nada de racha: `term9` BAJO salía primero con 228
//    porque sólo quitaba $60 de caída. La pregunta útil es la inversa —
//        COSTE = $/año que se DEJAN DE GANAR por cada $ de peor racha eliminado
//    y cuanto MÁS BAJO, mejor. Si el tercio que se deja de operar ganaba dinero, el filtro se
//    paga con ingreso; si perdía, el filtro es gratis y además reduce el susto.
//
// 2) UNA PEOR RACHA ES UN SOLO NÚMERO DE UN SOLO CAMINO. Quitar 217 días de 653 cambia la curva
//    entera y puede mejorar la racha POR SUERTE. Por eso cada regla lleva una PRUEBA DE
//    PERMUTACIÓN: 5.000 sorteos que quitan exactamente los mismos DÍAS AL AZAR, y se mira qué
//    fracción de esos sorteos consigue una racha igual de buena. Si el azar lo consigue el 30%
//    de las veces, la regla no ha hecho nada.
//    Se añaden dos medidas de cola que no dependen del camino: la media del 5% peor (CVaR) y la
//    suma de los 20 peores días.
//
// ═══ LAS TRES REGLAS, DECLARADAS ═════════════════════════════════════════════════════════════
//   R1  no operar si el índice YA CAYÓ en la mañana (movManana en su tercio bajo)
//   R2  no operar el último día del mes
//   R3  R1 + R2
// Salen del barrido de 84 celdas, así que el listón sigue siendo listonT(180) ≈ 3,64 y NO baja
// por haberlas elegido después: elegir mirando es exactamente lo que el listón está pagando.
// (Se declaran 3 y se corren 5: R1r y R1c son el MISMO corte con umbrales redondos, y están para
//  ver si R1 depende de dónde se puso la frontera. Cuentan igual en el divisor.)

import { writeFileSync } from "node:fs";
import { tWelch, listonT } from "../lib/barreraHallazgos";
import { cargar, resumen, drawdown, media, sd, pct, eur } from "./anatomia3-lib.mjs";

const PRUEBAS = 180, LISTON = listonT(PRUEBAS), SORTEOS = 5000;
const { filas } = cargar();
const ANOS = filas.length / 251;
const BASE = resumen(filas, ANOS);

const cvar = (fs, q = 0.05) => { const p = fs.map((f) => f.pl).sort((a, b) => a - b); return media(p.slice(0, Math.max(1, Math.floor(p.length * q)))); };
const suma20 = (fs) => fs.map((f) => f.pl).sort((a, b) => a - b).slice(0, 20).reduce((a, b) => a + b, 0);

// ── umbral de R1: la frontera del tercio bajo de movManana, DICHA en claro ──
const porMov = [...filas].sort((a, b) => a.movManana - b.movManana);
const UMBRAL = porMov[Math.floor(porMov.length / 3)].movManana;

const REGLAS = [
  ["R1", `movManana < ${UMBRAL.toFixed(3)}%  (el índice ya cayó de la apertura a las 11:00)`, (f) => f.movManana < UMBRAL],
  ["R2", "último día del mes", (f) => f.finMes === 1],
  ["R3", "R1 o R2", (f) => f.movManana < UMBRAL || f.finMes === 1],
  ["R1r", "movManana < −0,20% (número redondo, para ver si el umbral está ajustado)", (f) => f.movManana < -0.20],
  ["R1c", "movManana < 0% (mitad, el corte más tosco posible)", (f) => f.movManana < 0],
];

console.log("═".repeat(104));
console.log(`  REGLAS CANDIDATAS · base ${BASE.n} días · ${eur(BASE.alAno)}/año · peor día ${eur(BASE.peor)} · peor racha ${eur(BASE.dd)}`);
console.log(`  CVaR5 base ${eur(cvar(filas))} · suma de los 20 peores ${eur(suma20(filas))} · listón |t| ≥ ${LISTON}`);
console.log("═".repeat(104));

const salida = [];
for (const [nom, desc, fn] of REGLAS) {
  const fuera = filas.filter(fn), dentro = filas.filter((f) => !fn(f));
  const r = resumen(dentro, ANOS);
  const rf = resumen(fuera, ANOS);
  const ddElim = r.dd - BASE.dd;                       // > 0 = racha menos profunda
  const ingresoPerdido = BASE.alAno - r.alAno;
  const coste = ddElim > 0 ? ingresoPerdido / ddElim : null;

  // ── permutación: ¿lo consigue el azar quitando los mismos días? ──
  const n = fuera.length;
  const idx = filas.map((_, i) => i);
  let mejorDD = 0, mejorPeor = 0, mejorCvar = 0;
  for (let s = 0; s < SORTEOS; s++) {
    for (let i = idx.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
    const quita = new Set(idx.slice(0, n));
    const q = filas.filter((_, i) => !quita.has(i));
    if (drawdown(q.map((f) => f.pl)) >= r.dd) mejorDD++;
    if (Math.min(...q.map((f) => f.pl)) >= r.peor) mejorPeor++;
    if (cvar(q) >= cvar(dentro)) mejorCvar++;
  }

  // ── ¿se repite en los TRES tercios de tiempo? ──
  const k = Math.floor(filas.length / 3), signos = [], tercDet = [];
  for (let i = 0; i < 3; i++) {
    const g = i < 2 ? filas.slice(i * k, (i + 1) * k) : filas.slice(2 * k);
    const gf = g.filter(fn), gd = g.filter((f) => !fn(f));
    if (gf.length < 5 || gd.length < 5) { signos.push("?"); continue; }
    const dif = media(gd.map((f) => f.pl)) - media(gf.map((f) => f.pl));   // >0 = los días filtrados eran peores
    signos.push(dif >= 0 ? "+" : "−");
    tercDet.push({ periodo: `${g[0].fecha}→${g[g.length - 1].fecha}`, n: g.length, nFuera: gf.length, dif, mediaFuera: media(gf.map((f) => f.pl)) });
  }
  const t = tWelch(dentro.map((f) => f.pl), fuera.map((f) => f.pl));

  console.log(`\n── ${nom} · ${desc}`);
  console.log(`   días fuera ${fuera.length} de ${filas.length} (${((fuera.length / filas.length) * 100).toFixed(0)}%) · lo que ganaban esos días: ${eur(rf.media)}/día (${eur(rf.total)} en total)`);
  console.log(`   OPERANDO EL RESTO: ${eur(r.alAno)}/año (${((r.total / BASE.total) * 100).toFixed(0)}% del ingreso) · media ${eur(r.media)}/op · acierto ${(r.acierto * 100).toFixed(1)}%`);
  console.log(`   PEOR DÍA   ${eur(BASE.peor)} → ${eur(r.peor)}   (el azar lo iguala en el ${((mejorPeor / SORTEOS) * 100).toFixed(1)}% de ${SORTEOS} sorteos)`);
  console.log(`   p1         ${eur(BASE.p1)} → ${eur(r.p1)}`);
  console.log(`   p5         ${eur(BASE.p5)} → ${eur(r.p5)}`);
  console.log(`   CVaR5      ${eur(cvar(filas))} → ${eur(cvar(dentro))}   (el azar lo iguala en el ${((mejorCvar / SORTEOS) * 100).toFixed(1)}%)`);
  console.log(`   20 peores  ${eur(suma20(filas))} → ${eur(suma20(dentro))}`);
  console.log(`   PEOR RACHA ${eur(BASE.dd)} → ${eur(r.dd)}   (elimina ${eur(ddElim)}; el azar lo iguala en el ${((mejorDD / SORTEOS) * 100).toFixed(1)}%)`);
  console.log(`   COSTE: ${coste != null ? eur(ingresoPerdido) + "/año perdidos por " + eur(ddElim) + " de racha quitada = $" + coste.toFixed(2) + " al año por cada $ de caída" : "no reduce la racha"}`);
  console.log(`   t (días operados contra días filtrados) = ${t.toFixed(2)} · listón ${LISTON} · signo por tercios ${signos.join("")}`);
  for (const d of tercDet) console.log(`      ${d.periodo}  n=${d.n}  fuera ${d.nFuera}  esos días ganaban ${eur(d.mediaFuera)}/día  diferencia ${eur(d.dif)}`);

  salida.push({ nom, desc, nFuera: fuera.length, mediaFuera: rf.media, totalFuera: rf.total,
    alAno: r.alAno, retenido: r.total / BASE.total, peor: r.peor, p1: r.p1, p5: r.p5,
    cvar5: cvar(dentro), suma20: suma20(dentro), dd: r.dd, ddElim, ingresoPerdido, coste, t, signos: signos.join(""),
    pAzarDD: mejorDD / SORTEOS, pAzarPeor: mejorPeor / SORTEOS, pAzarCvar: mejorCvar / SORTEOS, tercDet });
}

// ── ¿y si en vez de filtrar días se opera MENOS TAMAÑO todos los días? ──────
// El listón honesto de cualquier filtro: bajar el tamaño reduce la caída EXACTAMENTE en la misma
// proporción que el ingreso, sin ninguna hipótesis, sin ajustar nada y sin riesgo de sobreajuste.
// Un filtro sólo merece la pena si bate esta línea.
console.log("\n" + "═".repeat(104));
console.log("  EL LISTÓN QUE HAY QUE BATIR: operar menos tamaño");
console.log("═".repeat(104));
console.log("  Reducir el tamaño un x% baja el ingreso un x% y la caída un x%. Coste exacto: " +
  (BASE.alAno / Math.abs(BASE.dd)).toFixed(2) + " $/año por cada $ de caída quitado.");
console.log("  Cualquier filtro con un coste MAYOR que ese está peor que simplemente operar más pequeño.\n");
console.log("| regla | coste ($/año por $ de caída) | ¿bate al tamaño? |");
console.log("|---|---|---|");
const listonTamano = BASE.alAno / Math.abs(BASE.dd);
for (const s of salida) {
  console.log(`| ${s.nom} | ${s.coste != null ? "$" + s.coste.toFixed(2) : "no reduce la racha"} | ${s.coste != null && s.coste < listonTamano ? "🟢 SÍ" : "no"} |`);
}

writeFileSync("scripts/anatomia3-reglas.json", JSON.stringify({ BASE, umbral: UMBRAL, listonTamano, salida }, null, 2), "utf8");
console.log("\n  detalle en scripts/anatomia3-reglas.json");
