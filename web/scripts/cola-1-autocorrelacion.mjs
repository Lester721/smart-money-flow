// ¿SE AGRUPAN LAS PÉRDIDAS DEL CÓNDOR? — la pregunta que decide si toda una familia de reglas
// de tamaño está condenada antes de escribirla.
//
// "Reducir tamaño tras N pérdidas seguidas" SÓLO puede funcionar si una pérdida hoy hace más
// probable una pérdida mañana. Si las pérdidas son independientes, la regla vende barato
// (opera pequeño justo después de la pérdida, cuando el siguiente día es igual de bueno que
// cualquier otro) y compra caro (vuelve al tamaño lleno tras ganancias, que tampoco predicen).
// El resultado es tamaño medio menor con la misma forma: trading más pequeño disfrazado de
// gestión de riesgo.
//
// Aquí NO se mide ninguna regla todavía. Se mide el dato: autocorrelación, tabla de transición,
// prueba de rachas y la anatomía de la peor racha acumulada.
//
// Todo lo que se lee es histórico (P&L ya realizado). No hay decisión de entrada aquí, así que
// no hay riesgo de mirar al futuro: es descripción de la serie, no una señal.

import { readFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";

const filas = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8"));
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const desv = (v) => { const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };

radiografia(filas, ["pl", "credito", "cierre", "ap", "sp11", "sigma"], "días del cóndor", { maxCeros: 0.2 });

const pl = filas.map((f) => f.pl);
const n = pl.length;
const orden = [...pl].sort((a, b) => a - b);
const pct = (q) => orden[Math.min(n - 1, Math.floor(n * q))];
const total = pl.reduce((a, b) => a + b, 0);
const porAno = total / (n / 252);

console.log("═".repeat(100));
console.log("  ANATOMÍA DE LA COLA · " + n + " días · " + filas[0].fecha + " → " + filas[n - 1].fecha);
console.log("═".repeat(100));
console.log("\n| medida | valor |\n|---|---|");
console.log("| total acumulado (1 contrato) | " + eur(total) + " |");
console.log("| $/año | " + eur(porAno) + " |");
console.log("| media/día | " + eur(media(pl)) + " |");
console.log("| desviación típica/día | " + eur(desv(pl)) + " |");
console.log("| días ganadores | " + ((pl.filter((x) => x > 0).length / n) * 100).toFixed(1) + "% |");
console.log("| PEOR DÍA | " + eur(Math.min(...pl)) + " |");
console.log("| percentil 1 | " + eur(pct(0.01)) + " |");
console.log("| percentil 5 | " + eur(pct(0.05)) + " |");
console.log("| percentil 10 | " + eur(pct(0.10)) + " |");
console.log("| mediana | " + eur(pct(0.5)) + " |");
console.log("| mejor día | " + eur(Math.max(...pl)) + " |");

// ── cuánto pesa la cola ────────────────────────────────────────────────────
console.log("\n## Cuánto del resultado se juega en unos pocos días\n");
console.log("| corte | días | suma | % del acumulado |\n|---|---|---|---|");
for (const k of [5, 10, 20, 33, 65]) {
  const peores = orden.slice(0, k).reduce((a, b) => a + b, 0);
  console.log("| los " + k + " peores días | " + k + " | " + eur(peores) + " | " + ((peores / total) * 100).toFixed(0) + "% |");
}
const ganancia = pl.filter((x) => x > 0).reduce((a, b) => a + b, 0);
const perdida = pl.filter((x) => x <= 0).reduce((a, b) => a + b, 0);
console.log("| TODAS las ganancias | " + pl.filter((x) => x > 0).length + " | " + eur(ganancia) + " | |");
console.log("| TODAS las pérdidas | " + pl.filter((x) => x <= 0).length + " | " + eur(perdida) + " | |");

// ── la peor racha acumulada, con su anatomía ───────────────────────────────
let pico = 0, acum = 0, peorDD = 0, iniDD = 0, finDD = 0, iniCur = 0;
const eq = [];
for (let i = 0; i < n; i++) {
  acum += pl[i]; eq.push(acum);
  if (acum > pico) { pico = acum; iniCur = i + 1; }
  const dd = acum - pico;
  if (dd < peorDD) { peorDD = dd; iniDD = iniCur; finDD = i; }
}
const tramo = filas.slice(iniDD, finDD + 1);
console.log("\n## La peor racha acumulada (1 contrato)\n");
console.log("| medida | valor |\n|---|---|");
console.log("| profundidad | " + eur(peorDD) + " |");
console.log("| desde | " + (tramo[0] ? tramo[0].fecha : "—") + " |");
console.log("| hasta | " + (tramo[tramo.length - 1] ? tramo[tramo.length - 1].fecha : "—") + " |");
console.log("| días de duración | " + tramo.length + " |");
console.log("| días perdedores dentro | " + tramo.filter((f) => f.pl < 0).length + " |");
console.log("| días ganadores dentro | " + tramo.filter((f) => f.pl > 0).length + " |");
const perdTramo = tramo.filter((f) => f.pl < 0).sort((a, b) => a.pl - b.pl).slice(0, 6);
console.log("\n  las peores del tramo: " + perdTramo.map((f) => f.fecha + " " + eur(f.pl)).join(" · "));

// ── AUTOCORRELACIÓN ────────────────────────────────────────────────────────
// t aproximada de un coeficiente de autocorrelación: r * sqrt(n)
console.log("\n## Autocorrelación del P&L diario\n");
console.log("| retardo | r | t≈r·√n | ¿significativo? |\n|---|---|---|---|");
const m = media(pl), sd = desv(pl);
for (let L = 1; L <= 5; L++) {
  let s = 0;
  for (let i = L; i < n; i++) s += (pl[i] - m) * (pl[i - L] - m);
  const r = s / ((n - L) * sd * sd);
  const t = r * Math.sqrt(n - L);
  console.log("| " + L + " | " + r.toFixed(4) + " | " + t.toFixed(2) + " | " + (Math.abs(t) >= 2 ? "**sí**" : "no") + " |");
}

// ── TABLA DE TRANSICIÓN: ¿una pérdida anuncia otra? ────────────────────────
const esPerd = pl.map((x) => x < 0);
const base = esPerd.filter(Boolean).length / n;
console.log("\n## ¿Una pérdida anuncia otra?\n");
console.log("  tasa base de día perdedor: " + (base * 100).toFixed(1) + "%\n");
console.log("| condición (ayer y antes) | n | % perdedor hoy | media de hoy | diferencia vs base |\n|---|---|---|---|---|");
const filaCond = (nombre, cond) => {
  const idx = []; for (let i = 0; i < n; i++) if (cond(i)) idx.push(i);
  if (idx.length < 5) { console.log("| " + nombre + " | " + idx.length + " | — | — | muestra corta |"); return null; }
  const p = idx.filter((i) => esPerd[i]).length / idx.length;
  const mm = media(idx.map((i) => pl[i]));
  console.log("| " + nombre + " | " + idx.length + " | " + (p * 100).toFixed(1) + "% | " + eur(mm) +
              " | " + ((p - base) * 100).toFixed(1) + " pts |");
  return { idx, p, mm };
};
filaCond("día CUALQUIERA (base)", (i) => i >= 1);
filaCond("tras 1 pérdida", (i) => i >= 1 && esPerd[i - 1]);
filaCond("tras 2 pérdidas seguidas", (i) => i >= 2 && esPerd[i - 1] && esPerd[i - 2]);
filaCond("tras 3 pérdidas seguidas", (i) => i >= 3 && esPerd[i - 1] && esPerd[i - 2] && esPerd[i - 3]);
filaCond("tras 1 ganancia", (i) => i >= 1 && !esPerd[i - 1]);
filaCond("tras 3 ganancias seguidas", (i) => i >= 3 && !esPerd[i - 1] && !esPerd[i - 2] && !esPerd[i - 3]);
// pérdida GRANDE = peor que el percentil 10
const umbGrande = pct(0.10);
const esGrande = pl.map((x) => x <= umbGrande);
const baseG = esGrande.filter(Boolean).length / n;
console.log("\n  pérdida GRANDE = peor que el percentil 10 (" + eur(umbGrande) + ") · tasa base " + (baseG * 100).toFixed(1) + "%\n");
console.log("| condición | n | % GRANDE hoy | media de hoy |\n|---|---|---|---|");
for (const [nom, cond] of [
  ["tras pérdida grande ayer", (i) => i >= 1 && esGrande[i - 1]],
  ["tras 2 grandes seguidas", (i) => i >= 2 && esGrande[i - 1] && esGrande[i - 2]],
  ["tras día normal ayer", (i) => i >= 1 && !esGrande[i - 1]],
]) {
  const idx = []; for (let i = 0; i < n; i++) if (cond(i)) idx.push(i);
  if (idx.length < 5) { console.log("| " + nom + " | " + idx.length + " | — | muestra corta |"); continue; }
  console.log("| " + nom + " | " + idx.length + " | " + ((idx.filter((i) => esGrande[i]).length / idx.length) * 100).toFixed(1) +
              "% | " + eur(media(idx.map((i) => pl[i]))) + " |");
}

// ── PRUEBA DE RACHAS (Wald–Wolfowitz) sobre el signo ───────────────────────
let rachas = 1;
for (let i = 1; i < n; i++) if (esPerd[i] !== esPerd[i - 1]) rachas++;
const n1 = esPerd.filter(Boolean).length, n2 = n - n1;
const muR = (2 * n1 * n2) / n + 1;
const varR = (2 * n1 * n2 * (2 * n1 * n2 - n)) / (n * n * (n - 1));
const zR = (rachas - muR) / Math.sqrt(varR);
console.log("\n## Prueba de rachas (Wald–Wolfowitz) sobre el signo del día\n");
console.log("| medida | valor |\n|---|---|");
console.log("| rachas observadas | " + rachas + " |");
console.log("| rachas esperadas si es independiente | " + muR.toFixed(1) + " |");
console.log("| z | " + zR.toFixed(2) + " |");
console.log("| lectura | " + (Math.abs(zR) < 2 ? "**indistinguible de una moneda**: las pérdidas NO se agrupan" :
                               zR < 0 ? "menos rachas de lo esperado: SÍ se agrupan" : "más rachas: alternan") + " |");

// ── la racha más larga observada vs la esperada al azar ────────────────────
let larga = 0, cur = 0;
for (const p of esPerd) { cur = p ? cur + 1 : 0; larga = Math.max(larga, cur); }
// simulación de barajado: rompe cualquier orden y conserva la distribución
let semilla = 12345;
const rnd = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; };
const largasSim = [], ddSim = [];
for (let s = 0; s < 2000; s++) {
  const c = [...pl];
  for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; }
  let l = 0, cu = 0; for (const x of c) { cu = x < 0 ? cu + 1 : 0; l = Math.max(l, cu); }
  largasSim.push(l);
  let pk = 0, ac = 0, dd = 0;
  for (const x of c) { ac += x; pk = Math.max(pk, ac); dd = Math.min(dd, ac - pk); }
  ddSim.push(dd);
}
largasSim.sort((a, b) => a - b); ddSim.sort((a, b) => a - b);
console.log("\n## La racha real contra 2.000 barajados de los MISMOS días\n");
console.log("| medida | real | barajado p5 | barajado mediana | barajado p95 | ¿la real es rara? |\n|---|---|---|---|---|---|");
console.log("| racha de pérdidas más larga | " + larga + " | " + largasSim[100] + " | " + largasSim[1000] + " | " + largasSim[1900] +
            " | " + (larga > largasSim[1900] ? "**sí, más larga**" : larga < largasSim[100] ? "sí, más corta" : "no") + " |");
console.log("| peor racha acumulada | " + eur(peorDD) + " | " + eur(ddSim[100]) + " | " + eur(ddSim[1000]) + " | " + eur(ddSim[1900]) +
            " | " + (peorDD < ddSim[100] ? "**sí, más profunda**" : peorDD > ddSim[1900] ? "sí, más suave" : "no") + " |");
console.log("\n  Si la caída real cabe dentro del rango de los barajados, la CAÍDA ES ORDEN, no agrupamiento:");
console.log("  la misma distribución de días, puesta en cualquier orden, produce caídas parecidas.");
