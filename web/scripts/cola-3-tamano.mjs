// EL TAMANO — reglas que cambian el numero de contratos con informacion de las 11:00,
// juzgadas por la COLA (peor dia, p1, p5, caida acumulada) y no por la media.
//
// ═══ LOS DOS NULOS ═══════════════════════════════════════════════════════════════════════════
// 1. ESCALA UNIFORME. Operar siempre k contratos multiplica ingreso y caida por k. Su cociente
//    ingreso/caida no cambia: 1,24. Cualquier regla que no MEJORE ese cociente esta haciendo
//    algo que se consigue mas barato operando mas pequeno todos los dias.
// 2. LA MISMA REGLA, BARAJADA. Se toma el vector de tamanos que produce la regla y se reparte
//    al azar entre los 653 dias, 2.000 veces. Eso conserva la exposicion total y destruye SOLO
//    la eleccion de que dia lleva que tamano. Si la regla no bate a su propia baraja, no esta
//    eligiendo: esta recortando.
//
// Todo tamano se decide con datos de las 11:00 o anteriores. El VIX entra con el cierre de AYER.

import { writeFileSync } from "node:fs";
import { cargar, metricas, eur, media, CAPITAL, COLATERAL } from "./cola-lib.mjs";
import { radiografia } from "../lib/radiografia";
import { listonT } from "../lib/barreraHallazgos";

const F = cargar();
const N = F.length;
radiografia(F, ["pl", "credito", "sigmaPct", "vix", "riesgoMax"], "base del tamano", { maxCeros: 0.2 });

const PRUEBAS = 62;   // DECLARADO: 39 cribas por tercios (cola-2) + 20 reglas de tamano + 3 anchos de ala
const LISTON = listonT(PRUEBAS);
const base = metricas(F.map((f) => f.pl), N);
const RATIO0 = base.anual / base.dd;

// ── generador reproducible ────────────────────────────────────────────────────
let semilla = 987654321;
const rnd = () => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla / 2147483648; };

// ── el evaluador: una regla = un vector de tamanos ────────────────────────────
const NPERM = 2000;
function evaluar(nombre, tam, notas) {
  const pls = F.map((f, i) => f.pl * tam[i]);
  const m = metricas(pls, N);
  const expo = tam.reduce((a, b) => a + b, 0);
  const ratio = m.dd > 0 ? m.anual / m.dd : Infinity;
  // eficiencia contra la escala uniforme de MISMO INGRESO
  const perdido = base.anual - m.anual, quitado = base.dd - m.dd;
  const efi = quitado > 0 ? perdido / quitado : (perdido <= 0 ? -Infinity : Infinity);
  // ── permutacion: la MISMA regla barajada ──
  let mejoresDD = 0, mejoresPeor = 0, mejoresRatio = 0;
  const ddP = [], ratioP = [];
  for (let s = 0; s < NPERM; s++) {
    const t = [...tam];
    for (let i = t.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [t[i], t[j]] = [t[j], t[i]]; }
    const mm = metricas(F.map((f, i) => f.pl * t[i]), N);
    ddP.push(mm.dd); ratioP.push(mm.dd > 0 ? mm.anual / mm.dd : Infinity);
    if (mm.dd <= m.dd) mejoresDD++;
    if (mm.peor <= m.peor) mejoresPeor++;
    if ((mm.dd > 0 ? mm.anual / mm.dd : Infinity) >= ratio) mejoresRatio++;
  }
  const q = (v, p) => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length * p)]; };
  return { nombre, notas, m, expo, ratio, efi,
    pDD: mejoresDD / NPERM, pPeor: mejoresPeor / NPERM, pRatio: mejoresRatio / NPERM,
    ddMedianaBaraja: q(ddP, 0.5), ratioMedianaBaraja: q(ratioP, 0.5) };
}

// ── LAS REGLAS ────────────────────────────────────────────────────────────────
// Base 2 contratos donde hay que poder "reducir a la mitad". El cociente ingreso/caida es
// invariante a la escala, asi que las reglas de base 1 y de base 2 se comparan sin trampa.
const reglas = [];
const uno = () => F.map(() => 1);
const dos = () => F.map(() => 2);

reglas.push(["BASE 1 contrato", uno(), "referencia"]);
reglas.push(["BASE 2 contratos", dos(), "referencia a escala"]);

// A · INVERSA AL VIX DE AYER (umbrales redondos, fijados de antemano)
for (const [b, a] of [[16, 22], [15, 20], [18, 25]]) {
  reglas.push(["A · VIX ayer: 2 si <" + b + ", 1 si <" + a + ", 0 si mas",
    F.map((f) => (f.vix == null ? 1 : f.vix < b ? 2 : f.vix < a ? 1 : 0)), "menos miedo, mas tamano"]);
}
reglas.push(["A · VIX ayer: tamano = 32/VIX redondeado (min 0, max 4)",
  F.map((f) => (f.vix == null ? 2 : Math.max(0, Math.min(4, Math.round(32 / f.vix))))), "inversa continua"]);

// B · INVERSA AL SIGMA DEL DIA (observable a las 11:00)
for (const u of [0.8, 1.0, 1.3]) {
  reglas.push(["B · sigma: 2 si <" + u.toFixed(1) + "%, 1 si no",
    F.map((f) => (f.sigmaPct < u ? 2 : 1)), "dia tranquilo, mas tamano"]);
}
reglas.push(["B · sigma: 0 si >1,8%, 1 si no", F.map((f) => (f.sigmaPct > 1.8 ? 0 : 1)), "cortafuegos de sigma"]);

// C · PROPORCIONAL AL CREDITO / PRESUPUESTO DE RIESGO
// riesgoMax = 5.000 - credito = LA PERDIDA MAXIMA POSIBLE del contrato. Se conoce al entrar.
for (const B of [5000, 7500, 10000]) {
  reglas.push(["C · presupuesto de riesgo $" + B.toLocaleString("es-ES") + ": n = floor(B / (5.000 - credito))",
    F.map((f) => Math.max(0, Math.min(11, Math.floor(B / f.riesgoMax)))), "acota el peor dia POR CONSTRUCCION"]);
}
for (const u of [150, 300, 500]) {
  reglas.push(["C · credito: 0 si cobra menos de $" + u + ", 1 si no",
    F.map((f) => (f.credito < u ? 0 : 1)), "no vender barato"]);
}

// D · TRAS PERDIDAS SEGUIDAS (base 2 para poder reducir a la mitad)
for (const k of [2, 3, 5]) for (const g of [1, 2]) {
  const tam = []; let racha = 0, ganadas = 0, reducido = false;
  for (let i = 0; i < N; i++) {
    tam.push(reducido ? 1 : 2);
    if (F[i].pl < 0) { racha++; ganadas = 0; if (racha >= k) reducido = true; }
    else { racha = 0; ganadas++; if (reducido && ganadas >= g) { reducido = false; ganadas = 0; } }
  }
  reglas.push(["D · mitad tras " + k + " perdidas seguidas, vuelta tras " + g + " ganancia" + (g > 1 ? "s" : ""), tam, "la familia vieja"]);
}

// E · FRENO POR CAIDA DE LA CUENTA (equity real, capital $56.389)
for (const x of [0.03, 0.05, 0.10]) for (const mitad of [1, 0]) {
  const tam = []; let acc = 0, pico = 0;
  for (let i = 0; i < N; i++) {
    const equity = CAPITAL + acc;
    if (equity > pico) pico = equity;
    const frenado = equity < pico * (1 - x);
    tam.push(frenado ? mitad : 2);
    acc += F[i].pl * tam[i];
    if (CAPITAL + acc > pico) pico = CAPITAL + acc;
  }
  reglas.push(["E · " + (mitad ? "mitad" : "PARAR") + " si la cuenta esta " + (x * 100).toFixed(0) + "% por debajo de su maximo", tam,
    "freno de equity"]);
}

// F · COMBINACION de las dos con mecanismo (presupuesto de riesgo + freno de equity)
{
  const tam = []; let acc = 0, pico = 0;
  for (let i = 0; i < N; i++) {
    const equity = CAPITAL + acc;
    if (equity > pico) pico = equity;
    const nRiesgo = Math.max(0, Math.min(11, Math.floor(10000 / F[i].riesgoMax)));
    const n = equity < pico * 0.95 ? Math.floor(nRiesgo / 2) : nRiesgo;
    // el colateral tambien manda: $5.000 por contrato contra el capital disponible
    const nFinal = Math.min(n, Math.floor((CAPITAL + acc) / COLATERAL));
    tam.push(Math.max(0, nFinal));
    acc += F[i].pl * tam[i];
  }
  reglas.push(["F · presupuesto $10.000 + mitad si la cuenta cae 5%", tam, "combinacion"]);
}

// ── RESULTADOS ────────────────────────────────────────────────────────────────
console.log("\n" + "=".repeat(120));
console.log("  REGLAS DE TAMANO · " + N + " dias · " + PRUEBAS + " pruebas declaradas · liston de |t| = " + LISTON);
console.log("  BASE 1 contrato: " + eur(base.anual) + "/ano · peor " + eur(base.peor) + " · p1 " + eur(base.p1) +
            " · p5 " + eur(base.p5) + " · caida " + eur(base.dd) + " · ingreso/caida = " + RATIO0.toFixed(2));
console.log("=".repeat(120));
console.log("\n  ingreso/caida es INVARIANTE A LA ESCALA: si una regla no lo sube por encima de " + RATIO0.toFixed(2) + ",");
console.log("  lo mismo se consigue operando mas pequeno todos los dias, sin regla ninguna.\n");

const res = [];
for (const [nombre, tam, notas] of reglas) { console.log("   midiendo: " + nombre); res.push(evaluar(nombre, tam, notas)); }

console.log("\n## TABLA · ordenada por ingreso/caida\n");
console.log("| regla | dias | contratos-dia | $/ano | media/op | peor dia | p1 | p5 | caida | ingreso/caida | vs baraja (p) |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of [...res].sort((a, b) => b.ratio - a.ratio)) {
  console.log("| " + r.nombre + " | " + r.m.n + " | " + r.expo + " | " + eur(r.m.anual) + " | " + eur(r.m.media) +
              " | " + eur(r.m.peor) + " | " + eur(r.m.p1) + " | " + eur(r.m.p5) + " | " + eur(r.m.dd) +
              " | **" + r.ratio.toFixed(2) + "**" + (r.ratio > RATIO0 ? " OK" : "") +
              " | " + r.pRatio.toFixed(3) + " |");
}

console.log("\n## LA PERMUTACION · la misma regla con los tamanos repartidos al azar\n");
console.log("  Si p es alto, la regla NO esta eligiendo dias: cualquier reparto de esos mismos tamanos hace lo mismo.\n");
console.log("| regla | caida real | caida mediana barajada | p(caida) | p(peor dia) | p(ingreso/caida) |");
console.log("|---|---|---|---|---|---|");
for (const r of [...res].sort((a, b) => a.pRatio - b.pRatio)) {
  console.log("| " + r.nombre + " | " + eur(r.m.dd) + " | " + eur(r.ddMedianaBaraja) + " | " + r.pDD.toFixed(3) +
              " | " + r.pPeor.toFixed(3) + " | " + r.pRatio.toFixed(3) + " |");
}

console.log("\n## EFICIENCIA · $ de ingreso anual perdidos por cada $ de caida eliminado (nulo = " + RATIO0.toFixed(2) + ")\n");
console.log("| regla | perdido/ano | caida quitada | eficiencia |");
console.log("|---|---|---|---|");
for (const r of [...res].sort((a, b) => a.efi - b.efi)) {
  const perdido = base.anual - r.m.anual, quitado = base.dd - r.m.dd;
  console.log("| " + r.nombre + " | " + eur(perdido) + " | " + eur(quitado) + " | " +
              (isFinite(r.efi) ? r.efi.toFixed(2) : (r.efi < 0 ? "gana ingreso Y quita caida" : "no quita caida")) + " |");
}

writeFileSync("scripts/cola-3-resultado.json", JSON.stringify(res.map((r) => ({
  nombre: r.nombre, anual: r.m.anual, peor: r.m.peor, p1: r.m.p1, p5: r.m.p5, dd: r.m.dd,
  ratio: r.ratio, efi: r.efi, pDD: r.pDD, pPeor: r.pPeor, pRatio: r.pRatio, expo: r.expo, n: r.m.n,
})), null, 2), "utf8");
console.log("\n  detalle en scripts/cola-3-resultado.json");
