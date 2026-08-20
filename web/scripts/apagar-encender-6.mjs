// APAGAR-Y-ENCENDER · PARTE 6 — ¿HAY MECANISMO, O SÓLO SEIS DÍAS?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/apagar-encender-6.mjs
//
// El P&L del cóndor tiene colas gordas: 6 días de 55 mandan sobre el resultado y por eso el t es
// ciego. Pero si el último día del mes fuera DE VERDAD distinto —flujos de rebalanceo al cierre—
// eso tendría que verse en el MOVIMIENTO, que es una variable continua y sin colas de opción:
//
//     movSig = |cierre − precio a las 11:00| / σ   (σ = la del resto de sesión, de la IV del dinero)
//
// Con movSig se usan los 55 rangos, no sólo la cola. Si el mes-fin mueve más, la distribución
// ENTERA se desplaza y se ve con n=55. Si no se ve, no hay mecanismo: hay seis días.
//
// Se mide también cuántos años harían falta para que la señal cruzara su listón.

import { readFileSync } from "node:fs";
import { tWelch, listonT } from "../lib/barreraHallazgos";
import { radiografia } from "../lib/radiografia";

const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");

const G = JSON.parse(readFileSync("scripts/dm-grid.json", "utf8"));
const filas = [];
for (let i = 0; i < G.dias.length; i++) {
  const a = G.variantes["s0.80_a30"].serie[i]; if (!a) continue;
  const d = G.dias[i];
  filas.push({ fecha: d.fecha, ano: d.ano, finMes: d.finMes, movSig: d.movSig, rangoMan: d.rangoMan,
    iv: d.iv, credito: a.credito, pl: a.pl, rompe: a.rompe });
}
radiografia(filas, ["movSig", "rangoMan", "iv", "credito"], "mecanismo de fin de mes");

const SI = filas.filter((f) => f.finMes), NO = filas.filter((f) => !f.finMes);
console.log("\n═".repeat(1) + "═".repeat(103));
console.log("  PARTE 6 · ¿MECANISMO O SEIS DÍAS? · " + SI.length + " días de fin de mes contra " + NO.length);
console.log("═".repeat(104));

// ── A · la distribución ENTERA del movimiento ───────────────────────────────────────────────
function mannWhitney(a, b) {
  const todos = [...a.map((x) => [x, 0]), ...b.map((x) => [x, 1])].sort((p, q) => p[0] - q[0]);
  let r = 0; for (let i = 0; i < todos.length; i++) if (todos[i][1] === 0) r += i + 1;
  const n1 = a.length, n2 = b.length;
  const U = r - n1 * (n1 + 1) / 2;
  const mu = n1 * n2 / 2, sd = Math.sqrt(n1 * n2 * (n1 + n2 + 1) / 12);
  return { U, z: (U - mu) / sd, auc: U / (n1 * n2) };
}
const q = (v, p) => { const s = [...v].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

console.log("\n### A · EL MOVIMIENTO — la distribución entera, no sólo la cola\n");
console.log("| variable | fin de mes (n=" + SI.length + ") | resto (n=" + NO.length + ") | t de Welch | z de Mann-Whitney | AUC |");
console.log("|---|---|---|---|---|---|");
for (const [nom, campo] of [["movSig (movimiento 11:00→cierre, en σ)", "movSig"], ["rangoMan (rango de la mañana, en σ)", "rangoMan"], ["IV del dinero a las 11:00", "iv"], ["crédito cobrado ($)", "credito"]]) {
  const a = SI.map((f) => f[campo]), b = NO.map((f) => f[campo]);
  const mw = mannWhitney(a, b);
  console.log("| " + nom + " | mediana " + q(a, 0.5).toFixed(3) + " · media " + media(a).toFixed(3) +
    " | mediana " + q(b, 0.5).toFixed(3) + " · media " + media(b).toFixed(3) +
    " | " + tWelch(a, b).toFixed(2) + " | **" + mw.z.toFixed(2) + "** | " + mw.auc.toFixed(3) + " |");
}
console.log("\n   (AUC 0,500 = las dos distribuciones son la misma. Listón: |z| ≥ " + listonT(4) + " con 4 pruebas.)");

// ── B · percentiles del movimiento, lado a lado ─────────────────────────────────────────────
console.log("\n### B · PERCENTILES DE movSig — ¿se desplaza la distribución o sólo asoma la cola?\n");
console.log("| grupo | p10 | p25 | mediana | p75 | p90 | p95 | máx | % que pasa de 0,80σ (= rompe el cóndor) |");
console.log("|---|---|---|---|---|---|---|---|");
for (const [nom, g] of [["fin de mes", SI], ["resto", NO]]) {
  const v = g.map((f) => f.movSig);
  console.log("| " + nom + " | " + [0.10, 0.25, 0.50, 0.75, 0.90, 0.95].map((p) => q(v, p).toFixed(2)).join(" | ") +
    " | " + Math.max(...v).toFixed(2) + " | **" + (v.filter((x) => x > 0.80).length / v.length * 100).toFixed(1) + "%** |");
}

// ── C · el mismo corte, año a año: ¿los 6 días son de años distintos? ────────────────────────
console.log("\n### C · LOS DÍAS QUE ROMPEN, AÑO A AÑO\n");
console.log("| año | fin de mes: rompen / total | resto: rompen / total |");
console.log("|---|---|---|");
for (const a of [...new Set(filas.map((f) => f.ano))].sort()) {
  const s = SI.filter((f) => f.ano === a), n = NO.filter((f) => f.ano === a);
  console.log("| " + a + " | " + s.filter((f) => f.rompe).length + " / " + s.length + " | " + n.filter((f) => f.rompe).length + " / " + n.length + " |");
}
console.log("| **TOTAL** | **" + SI.filter((f) => f.rompe).length + " / " + SI.length + " (" + (SI.filter((f) => f.rompe).length / SI.length * 100).toFixed(1) +
  "%)** | **" + NO.filter((f) => f.rompe).length + " / " + NO.length + " (" + (NO.filter((f) => f.rompe).length / NO.length * 100).toFixed(1) + "%)** |");

// ── D · cuántos años faltan para cruzar el listón ───────────────────────────────────────────
const t = tWelch(SI.map((f) => f.pl), NO.map((f) => f.pl));
console.log("\n### D · QUÉ LE FALTA — cuántos meses más para que esto se establezca\n");
for (const [nom, lis] of [["1 prueba", listonT(1)], ["12 declaradas aquí", listonT(12)], ["18 del panel donde se eligió", listonT(18)], ["53 del menú de calendario", listonT(53)]]) {
  const nNec = Math.ceil(SI.length * (lis / Math.abs(t)) ** 2);
  console.log("   listón " + nom.padEnd(30) + " |t| ≥ " + lis.toFixed(2) + "  →  hacen falta " + String(nNec).padStart(4) +
    " meses de datos (" + (nNec / 12).toFixed(1) + " años) · faltan " + ((nNec - SI.length) / 12).toFixed(1) + " años");
}
console.log("\n   (t actual = " + t.toFixed(2) + " con " + SI.length + " meses. El cálculo supone que el efecto observado es el real.)");
