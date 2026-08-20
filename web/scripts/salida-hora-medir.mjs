// SALIDA POR HORA · PASO 2 — el barrido, el cruce de muestras y la descomposición del coste.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/salida-hora-medir.mjs
//
// REGLA DE HIERRO DE ESTE ENCARGO: se elige en un período y se prueba en el otro. En las dos
// direcciones. Lo que sólo funciona donde se eligió es sobreajuste.
//
// PRUEBAS DECLARADAS: 7 horas × 3 períodos (todo / 2022-23 / 2024-26) = 21, más 2 aplicaciones
// cruzadas = 23. Acumuladas sobre esta familia de datos: 187 previas + 23 = 210. listonT(210)≈3,68.

import { readFileSync, writeFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";
import { radiografia } from "../lib/radiografia";

const SALIDAS = ["12:00", "13:00", "14:00", "14:30", "15:00", "15:30", "15:45"];
const PRUEBAS = 210, LISTON = listonT(PRUEBAS);
const CUENTA = 56389, EFECTIVO = 7977, COLATERAL = 5000, PODER = 73874;

const filas = JSON.parse(readFileSync("scripts/salida-hora-filas.json", "utf8"));

// ── radiografía ANTES de medir nada ──────────────────────────────────────────────────────────
const plano = filas.map((f) => ({
  credito: f.credito, plHold: f.plHold, spot: f.spot, mov: f.mov, intrinseco: f.intrinseco,
  pl1200: f.salidas["12:00"].pl, pl1400: f.salidas["14:00"].pl, pl1500: f.salidas["15:00"].pl,
  pl1545: f.salidas["15:45"].pl, deb1500: f.salidas["15:00"].debEjec, deb1545: f.salidas["15:45"].debEjec,
}));
radiografia(plano, ["credito", "plHold", "spot", "mov", "intrinseco", "pl1200", "pl1400", "pl1500", "pl1545", "deb1500", "deb1545"],
  "salida por hora", { cerosLegitimos: ["intrinseco"] });

// ── utilidades ───────────────────────────────────────────────────────────────────────────────
const media = (v) => v.reduce((a, x) => a + x, 0) / v.length;
const sd = (v) => { const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };
const eur = (x) => (x < 0 ? "-$" : "$") + Math.round(Math.abs(x)).toLocaleString("es-ES");
function maxDD(pls) { let cum = 0, pico = 0, peor = 0; for (const p of pls) { cum += p; if (cum > pico) pico = cum; peor = Math.min(peor, cum - pico); } return peor; }
const tPareado = (d) => media(d) / (sd(d) / Math.sqrt(d.length));

function resumen(pls) {
  const n = pls.length, total = pls.reduce((a, x) => a + x, 0);
  return {
    n, total, alAno: total / (n / 252), media: total / n,
    peor: Math.min(...pls), p1: pct(pls, 0.01), p5: pct(pls, 0.05), dd: maxDD(pls),
    acierto: pls.filter((x) => x > 0).length / n,
  };
}

/** Todas las estrategias sobre un subconjunto de días: aguantar + las 7 horas de salida. */
function barrido(sub) {
  const hold = resumen(sub.map((f) => f.plHold));
  const out = { hold };
  for (const h of SALIDAS) {
    const r = resumen(sub.map((f) => f.salidas[h].pl));
    const dif = sub.map((f) => f.salidas[h].pl - f.plHold);
    r.difAlAno = media(dif) * 252;
    r.t = tPareado(dif);
    // Descomposición: (intrínseco al cierre − punto medio de recompra) = tiempo/camino.
    //                 −(ejecución − punto medio)                        = horquilla de recompra.
    r.tiempoAlAno = media(sub.map((f) => (f.intrinseco - f.salidas[h].debMid) * 100)) * 252;
    r.horquillaAlAno = -media(sub.map((f) => (f.salidas[h].debEjec - f.salidas[h].debMid) * 100)) * 252;
    const dIngreso = hold.alAno - r.alAno;               // $/año que se dejan de ganar
    const dCaida = Math.abs(hold.dd) - Math.abs(r.dd);   // $ de caída que se quitan
    r.dIngreso = dIngreso; r.dCaida = dCaida;
    r.coste = dCaida > 0 ? dIngreso / dCaida : null;
    r.dPeor = Math.abs(hold.peor) - Math.abs(r.peor);
    out[h] = r;
  }
  return out;
}

const A = filas.filter((f) => f.fecha < "2024-01-01");   // 2022-2023
const B = filas.filter((f) => f.fecha >= "2024-01-01");  // 2024-2026

const linea = (nom, r) => "| " + nom.padEnd(8) + " | " + String(r.n).padStart(5) + " | " +
  (r.acierto * 100).toFixed(0).padStart(3) + "% | " + eur(r.alAno).padStart(9) + " | " +
  eur(r.peor).padStart(8) + " | " + eur(r.p1).padStart(8) + " | " + eur(r.p5).padStart(8) + " | " +
  eur(r.dd).padStart(9) + " | " + (r.t != null ? r.t.toFixed(2).padStart(6) : "     -") + " | " +
  (r.coste != null ? r.coste.toFixed(2).padStart(7) : (r.dCaida != null ? " (peor) " : "    -   ")) + " |";

function tabla(titulo, sub) {
  const r = barrido(sub);
  console.log("\n=== " + titulo + " · " + sub.length + " días · " + sub[0].fecha + " -> " + sub[sub.length - 1].fecha + " ===\n");
  console.log("| salida | días | acie | $/año | peor día | p1 | p5 | peor racha | t vs aguantar | $ perdidos por $ de caída quitada |");
  console.log("|---|---|---|---|---|---|---|---|---|---|");
  console.log(linea("AGUANTAR", r.hold));
  for (const h of SALIDAS) console.log(linea(h, r[h]));
  return r;
}

const rTODO = tabla("LOS 1.121 DÍAS", filas);
const rA = tabla("AJUSTE A · 2022-2023", A);
const rB = tabla("AJUSTE B · 2024-2026", B);

// ── LA REGLA DE ELECCIÓN, declarada antes de mirar ───────────────────────────────────────────
// Se queda con las horas que (i) siguen ganando dinero y (ii) reducen la peor racha. Entre ellas
// gana la de MENOR coste: $ de ingreso perdidos por cada $ de caída eliminado.
function elegir(r) {
  const cand = SALIDAS.filter((h) => r[h].alAno > 0 && r[h].dCaida > 0);
  if (!cand.length) return null;
  return cand.sort((x, y) => r[x].coste - r[y].coste)[0];
}
const elegidaA = elegir(rA), elegidaB = elegir(rB);

console.log("\n\n=== EL CRUCE ===");
console.log("\nElegida ajustando en 2022-2023: " + (elegidaA ?? "NINGUNA — ninguna hora gana dinero Y reduce la racha"));
console.log("Elegida ajustando en 2024-2026: " + (elegidaB ?? "NINGUNA — ninguna hora gana dinero Y reduce la racha"));

function aplicar(hora, r, nom) {
  if (!hora) { console.log("  " + nom + ": no hay nada que aplicar."); return null; }
  const x = r[hora];
  const ok = x.alAno > 0 && x.dCaida > 0;
  console.log("  " + nom + " -> " + hora + ": $/año " + eur(x.alAno) + " (aguantar " + eur(r.hold.alAno) +
    ") · peor racha " + eur(x.dd) + " (aguantar " + eur(r.hold.dd) + ") · " + (ok ? "SOBREVIVE" : "NO SOBREVIVE"));
  return ok;
}
const okAB = aplicar(elegidaA, rB, "elegida en 2022-23, probada en 2024-26");
const okBA = aplicar(elegidaB, rA, "elegida en 2024-26, probada en 2022-23");

// ── MECANISMO EN CONTRA: horquilla vs. tiempo, en dólares al año ──────────────────────────────
console.log("\n\n=== POR QUÉ CUESTA — descomposición sobre los 1.121 días ($/año, 1 contrato) ===\n");
console.log("| salida | cambio vs aguantar | de eso: tiempo/camino | de eso: horquilla de recompra |");
console.log("|---|---|---|---|");
for (const h of SALIDAS) {
  const r = rTODO[h];
  console.log("| " + h + " | " + eur(r.difAlAno).padStart(9) + " | " + eur(r.tiempoAlAno).padStart(9) + " | " + eur(r.horquillaAlAno).padStart(9) + " |");
}

// ── MECANISMO A FAVOR: ¿cuánto daño entra DESPUÉS de cada hora? ───────────────────────────────
console.log("\n\n=== MECANISMO A FAVOR — el daño que a cada hora todavía no ha ocurrido ===\n");
console.log("| hora | movimiento medio ya recorrido | días ya fuera de ±25 | días que rompen DESPUÉS de esa hora | del peor 5%, cuántos seguían dentro |");
console.log("|---|---|---|---|---|");
const peor5 = new Set([...filas].sort((a, b) => a.plHold - b.plHold).slice(0, Math.floor(filas.length * 0.05)).map((f) => f.fecha));
for (const h of SALIDAS) {
  const movH = filas.map((f) => Math.abs(f.salidas[h].spot - f.spot));
  const fueraH = filas.filter((f) => Math.abs(f.salidas[h].spot - f.spot) >= 25);
  const rompenDespues = filas.filter((f) => Math.abs(f.salidas[h].spot - f.spot) < 25 && Math.abs(f.cierre - f.spot) >= 25);
  const p5dentro = filas.filter((f) => peor5.has(f.fecha) && Math.abs(f.salidas[h].spot - f.spot) < 25);
  console.log("| " + h + " | " + media(movH).toFixed(1) + " pts | " + (fueraH.length / filas.length * 100).toFixed(0) + "% | " +
    (rompenDespues.length / filas.length * 100).toFixed(0) + "% | " + p5dentro.length + "/" + peor5.size +
    " (" + (p5dentro.length / peor5.size * 100).toFixed(0) + "%) |");
}
console.log("\n  al cierre: " + (filas.filter((f) => Math.abs(f.cierre - f.spot) >= 25).length / filas.length * 100).toFixed(0) +
  "% de los días acaban fuera de ±25 puntos.");

// ── EL PUENTE: el tamaño lo manda el EFECTIVO, no el colateral ────────────────────────────────
console.log("\n\n=== EN DÓLARES SOBRE LA CUENTA — el cuello de botella es el EFECTIVO ($" + EFECTIVO.toLocaleString("es-ES") + ") ===\n");
console.log("| salida | peor día/contrato | contratos que aguanta el efectivo | colateral | $/año a ese tamaño | peor racha a ese tamaño | % de la cuenta al año |");
console.log("|---|---|---|---|---|---|---|");
for (const nom of ["hold", ...SALIDAS]) {
  const r = rTODO[nom];
  const N = Math.min(Math.max(0, Math.floor(EFECTIVO / Math.abs(r.peor))), Math.floor(PODER / COLATERAL));
  console.log("| " + (nom === "hold" ? "AGUANTAR" : nom).padEnd(8) + " | " + eur(r.peor).padStart(8) + " | " + String(N).padStart(3) +
    " | " + eur(N * COLATERAL).padStart(8) + " | " + eur(r.alAno * N).padStart(9) + " | " + eur(r.dd * N).padStart(9) +
    " | " + (r.alAno * N / CUENTA * 100).toFixed(1) + "% |");
}

writeFileSync("scripts/salida-hora-resultado.json", JSON.stringify({
  liston: LISTON, pruebas: PRUEBAS, n: filas.length,
  TODO: rTODO, A: rA, B: rB, elegidaA, elegidaB, okAB, okBA,
}, null, 1));
console.log("\nlistón de t (Bonferroni, " + PRUEBAS + " pruebas) = " + LISTON);
console.log("escrito scripts/salida-hora-resultado.json");
