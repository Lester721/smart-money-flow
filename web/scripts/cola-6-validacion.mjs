// LA VALIDACIÓN — antes de que esto se pueda llamar hallazgo.
//
// Lo que sobrevivió a las 25 pruebas: bajar el tamaño a la mitad los días en que la σ implícita
// de las 11:00 cae en el TERCIO ALTO de los 250 días anteriores. A igual ingreso, el percentil 1
// mejora un 42% y queda por debajo de los 4.000 barajados de su propia serie de tamaños.
//
// Aquí NO se buscan reglas nuevas. Se intenta TUMBAR la que hay, con lo que tumba hallazgos:
//   1. TRES TERCIOS. Si el efecto vive en un período, no es un efecto.
//   2. DESCOMPOSICIÓN. ¿Cuánto es la σ y cuánto el suelo de crédito? El suelo NO validó por
//      tercios (su signo se da la vuelta), así que hay que ver si E5 se sostiene sin él.
//   3. SENSIBILIDAD. Umbral, ventana y multiplicador. Si sólo funciona en un punto del mapa,
//      es un ajuste, no un mecanismo. NOTA: la cifra que se reporta es la del ajuste DECLARADO
//      (tercio alto · 250 días · mitad). El mapa se mira para ver si es una meseta o un pico;
//      no se vuelve a elegir el mejor punto del mapa.
//   4. CONTRATOS ENTEROS. Medio contrato no existe. Con tamaño base 1, "la mitad" es CERO.

import { readFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";

const ALA = 50, CAPITAL = 56389, COLATERAL = 5000;
const filas = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8"));
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const pctl = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
for (const f of filas) f.perdidaMax = ALA * 100 - f.credito;
radiografia(filas, ["pl", "credito", "sigma", "perdidaMax"], "días del cóndor", { maxCeros: 0.2 });

const percentilMovil = (ventana, minCal) => {
  const out = new Array(filas.length).fill(null);
  for (let i = 0; i < filas.length; i++) {
    const h = []; for (let j = Math.max(0, i - ventana); j < i; j++) h.push(filas[j].sigma);
    if (h.length < minCal) continue;
    out[i] = h.filter((x) => x <= filas[i].sigma).length / h.length;
  }
  return out;
};

function met(tams, sub) {
  const idx = sub || filas.map((_, i) => i);
  const p = idx.map((i) => filas[i].pl * tams[i]);
  const tot = p.reduce((a, b) => a + b, 0);
  let pico = 0, ac = 0, dd = 0;
  for (const x of p) { ac += x; pico = Math.max(pico, ac); dd = Math.min(dd, ac - pico); }
  return { anual: tot / (p.length / 252), total: tot, n: p.length, peorDia: Math.min(...p),
           p1: pctl(p, 0.01), p5: pctl(p, 0.05), dd, tamMedio: media(idx.map((i) => tams[i])) };
}
// reescala a los mismos $/año que el fijo del MISMO subconjunto
function aIgualIngreso(tams, sub) {
  const fijo = met(filas.map(() => 1), sub), r = met(tams, sub);
  const k = r.anual > 0 ? fijo.anual / r.anual : null;
  if (!k) return { fijo, r, k: null };
  return { fijo, r, k, dd: r.dd * k, p1: r.p1 * k, p5: r.p5 * k, peorDia: r.peorDia * k };
}

const pS = percentilMovil(250, 60);
const REGLA = (i) => (pS[i] != null && pS[i] > 2 / 3 ? 0.5 : 1);              // la declarada, sin el suelo
const REGLA_SUELO = (i) => (filas[i].credito < 150 ? 0 : REGLA(i));           // E5, con el suelo
const SOLO_SUELO = (i) => (filas[i].credito < 150 ? 0 : 1);

console.log("═".repeat(118));
console.log("  VALIDACIÓN · ¿aguanta «mitad de tamaño cuando la σ de las 11:00 está en el tercio alto»?");
console.log("═".repeat(118));

// ── 1 · TRES TERCIOS ───────────────────────────────────────────────────────
const t3 = Math.floor(filas.length / 3);
const PER = [["1er tercio", 0, t3], ["2º tercio", t3, 2 * t3], ["3er tercio", 2 * t3, filas.length], ["TODO", 0, filas.length]];
console.log("\n## 1 · Tres tercios · todo reescalado al MISMO ingreso que el contrato fijo de ese tercio\n");
console.log("| regla | período | días | fechas | $/año fijo | $/año regla | peor día | p1 | p5 | PEOR RACHA | mejora de la caída |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
for (const [nom, fn] of [["σ sola", REGLA], ["σ + suelo $150", REGLA_SUELO], ["sólo suelo $150", SOLO_SUELO]]) {
  const tams = filas.map((_, i) => fn(i));
  for (const [pn, a, b] of PER) {
    const sub = []; for (let i = a; i < b; i++) sub.push(i);
    const v = aIgualIngreso(tams, sub);
    if (!v.k) { console.log("| " + nom + " | " + pn + " | " + sub.length + " | | ingreso ≤ 0 | | | | | | |"); continue; }
    const mej = (1 - v.dd / v.fijo.dd) * 100;
    console.log("| " + nom + " | " + pn + " | " + sub.length + " | " + filas[a].fecha + "→" + filas[b - 1].fecha +
      " | " + eur(v.fijo.anual) + " | " + eur(v.r.anual) + " | " + eur(v.peorDia) + " | " + eur(v.p1) +
      " | " + eur(v.p5) + " | " + eur(v.dd) + " | " + (mej >= 0 ? "**+" + mej.toFixed(0) + "%**" : mej.toFixed(0) + "%") + " |");
  }
}
console.log("\n  El signo de la mejora en los TRES tercios es lo que decide. Uno negativo y el mecanismo no es general.");

// ── 2 · DESCOMPOSICIÓN ─────────────────────────────────────────────────────
console.log("\n## 2 · ¿Cuánto pone cada pieza? · muestra entera, a igual ingreso\n");
console.log("| pieza | $/año a base 1 | peor día | p1 | p5 | PEOR RACHA | caída/capital |");
console.log("|---|---|---|---|---|---|---|");
for (const [nom, fn] of [["contrato fijo (referencia)", () => 1], ["sólo suelo de crédito $150", SOLO_SUELO],
                         ["sólo mitad si σ tercio alto", REGLA], ["las dos juntas (E5)", REGLA_SUELO]]) {
  const tams = filas.map((_, i) => fn(i));
  const v = aIgualIngreso(tams);
  console.log("| " + nom + " | " + eur(v.r.anual) + " | " + eur(v.peorDia) + " | " + eur(v.p1) + " | " + eur(v.p5) +
    " | " + eur(v.dd) + " | " + ((-v.dd / CAPITAL) * 100).toFixed(1) + "% |");
}

// ── 3 · SENSIBILIDAD ───────────────────────────────────────────────────────
console.log("\n## 3 · ¿meseta o pico? · caída a igual ingreso, en % de mejora sobre " + eur(met(filas.map(() => 1)).dd) + "\n");
console.log("  filas = umbral del percentil móvil de σ · columnas = ventana de días previos\n");
const VENT = [125, 250, 500];
const cache = {}; for (const w of VENT) cache[w] = percentilMovil(w, 60);
console.log("| umbral \\ ventana | " + VENT.map((w) => w + " días").join(" | ") + " |");
console.log("|---|" + VENT.map(() => "---").join("|") + "|");
for (const u of [0.55, 0.60, 2 / 3, 0.70, 0.75, 0.80]) {
  const cel = VENT.map((w) => {
    const p = cache[w], tams = filas.map((_, i) => (p[i] != null && p[i] > u ? 0.5 : 1));
    const v = aIgualIngreso(tams);
    if (!v.k) return "—";
    return ((1 - v.dd / v.fijo.dd) * 100).toFixed(0) + "%";
  });
  console.log("| p" + (u * 100).toFixed(0) + (Math.abs(u - 2 / 3) < 1e-9 ? " ← **declarado**" : "") + " | " + cel.join(" | ") + " |");
}
console.log("\n  y el mismo mapa sobre el PERCENTIL 1 (la medida que pasó la prueba de barajado):\n");
console.log("| umbral \\ ventana | " + VENT.map((w) => w + " días").join(" | ") + " |");
console.log("|---|" + VENT.map(() => "---").join("|") + "|");
for (const u of [0.55, 0.60, 2 / 3, 0.70, 0.75, 0.80]) {
  const cel = VENT.map((w) => {
    const p = cache[w], tams = filas.map((_, i) => (p[i] != null && p[i] > u ? 0.5 : 1));
    const v = aIgualIngreso(tams);
    return v.k ? ((1 - v.p1 / v.fijo.p1) * 100).toFixed(0) + "%" : "—";
  });
  console.log("| p" + (u * 100).toFixed(0) + (Math.abs(u - 2 / 3) < 1e-9 ? " ← **declarado**" : "") + " | " + cel.join(" | ") + " |");
}
console.log("\n  y con multiplicadores distintos (ventana 250, tercio alto):\n");
console.log("| multiplicador en σ alta | $/año | peor día | p1 | p5 | PEOR RACHA | mejora de la caída a igual ingreso |");
console.log("|---|---|---|---|---|---|---|");
for (const m of [0, 0.25, 0.5, 0.75, 1]) {
  const tams = filas.map((_, i) => (pS[i] != null && pS[i] > 2 / 3 ? m : 1));
  const v = aIgualIngreso(tams);
  console.log("| ×" + m + (m === 0.5 ? " ← **declarado**" : "") + " | " + eur(v.r.anual) + " | " + eur(v.peorDia) +
    " | " + eur(v.p1) + " | " + eur(v.p5) + " | " + eur(v.dd) + " | " +
    (v.k ? ((1 - v.dd / v.fijo.dd) * 100).toFixed(0) + "%" : "—") + " |");
}

// ── 4 · CONTRATOS ENTEROS ──────────────────────────────────────────────────
console.log("\n## 4 · Contratos ENTEROS · medio contrato no existe\n");
console.log("| tamaño base | σ normal | σ tercio alto | días fuera | $/año | peor día | p1 | p5 | PEOR RACHA | colateral máx |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const B of [1, 2, 3, 4, 6]) {
  const alto = Math.floor(B / 2);
  const tams = filas.map((_, i) => (pS[i] != null && pS[i] > 2 / 3 ? alto : B));
  const m = met(tams);
  const fuera = tams.filter((t) => t === 0).length;
  console.log("| " + B + " contrato" + (B > 1 ? "s" : "") + " | " + B + " | " + alto + " | " + fuera +
    " | " + eur(m.anual) + " | " + eur(m.peorDia) + " | " + eur(m.p1) + " | " + eur(m.p5) + " | " + eur(m.dd) +
    " | " + eur(B * COLATERAL) + " |");
}
console.log("\n  contraste — el mismo tamaño base SIN la regla:\n");
console.log("| tamaño base | $/año | peor día | p1 | p5 | PEOR RACHA | colateral |");
console.log("|---|---|---|---|---|---|---|");
for (const B of [1, 2, 3, 4, 6]) {
  const m = met(filas.map(() => B));
  console.log("| " + B + " fijo | " + eur(m.anual) + " | " + eur(m.peorDia) + " | " + eur(m.p1) + " | " + eur(m.p5) +
    " | " + eur(m.dd) + " | " + eur(B * COLATERAL) + " |");
}
console.log("\n  El capital de " + eur(CAPITAL) + " a " + eur(COLATERAL) + " por contrato aguanta " +
            Math.floor(CAPITAL / COLATERAL) + " contratos de colateral — pero la caída manda antes que el colateral.");

// ── 5 · la comparación honesta: base 2/1 contra base fijo equivalente ──────
console.log("\n## 5 · Lo que decide: mismo ingreso, ¿quién trae menos caída?\n");
const b2 = met(filas.map((_, i) => (pS[i] != null && pS[i] > 2 / 3 ? 1 : 2)));
const fijoEq = met(filas.map(() => b2.anual / met(filas.map(() => 1)).anual));
console.log("| plan | $/año | peor día | p1 | p5 | PEOR RACHA | caída/capital | colateral máx |");
console.log("|---|---|---|---|---|---|---|---|");
console.log("| **2 contratos, 1 si σ alta** | " + eur(b2.anual) + " | " + eur(b2.peorDia) + " | " + eur(b2.p1) +
  " | " + eur(b2.p5) + " | " + eur(b2.dd) + " | " + ((-b2.dd / CAPITAL) * 100).toFixed(1) + "% | " + eur(2 * COLATERAL) + " |");
console.log("| fijo del mismo ingreso (×" + (b2.anual / met(filas.map(() => 1)).anual).toFixed(2) + ") | " + eur(fijoEq.anual) +
  " | " + eur(fijoEq.peorDia) + " | " + eur(fijoEq.p1) + " | " + eur(fijoEq.p5) + " | " + eur(fijoEq.dd) +
  " | " + ((-fijoEq.dd / CAPITAL) * 100).toFixed(1) + "% | " + eur((b2.anual / met(filas.map(() => 1)).anual) * COLATERAL) + " |");
console.log("\n  ingreso perdido: " + eur(fijoEq.anual - b2.anual) + " · caída quitada: " + eur(-fijoEq.dd - -b2.dd) +
            " · cambio: " + ((fijoEq.anual - b2.anual) / (-fijoEq.dd - -b2.dd)).toFixed(2) + " $/$ (el listón trivial es 1,24)");
