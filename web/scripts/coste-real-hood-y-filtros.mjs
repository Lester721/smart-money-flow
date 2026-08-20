// COSTE-REAL - dos cosas que faltaban:
//   (a) la misma caja pero con el PRECIO REAL de HOOD, no con los $48.412 de hoy congelados
//   (b) filtros observables a las 11:00, elegidos en un periodo y aplicados AL OTRO, medidos con
//       la metrica que pidio Lester: $ de ingreso perdidos por cada $ de caida eliminado
import { readFileSync } from "node:fs";
import { listonT, tWelch } from "../lib/barreraHallazgos.ts";

const F = JSON.parse(readFileSync("scripts/coste-real-base.json", "utf8")).sort((a, b) => a.fecha.localeCompare(b.fecha));
const EFECTIVO0 = 7977, PC0 = 73874, TASA = 0.05;
const eur = (x) => (x == null || !isFinite(x) ? "-" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const pctl = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(s.length * q)))]; };
const dd = (v) => { let a = 0, p = 0, w = 0; for (const x of v) { a += x; if (a > p) p = a; w = Math.min(w, a - p); } return w; };
const dias = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const anos = (g) => dias(g[0].fecha, g[g.length - 1].fecha) / 365.25;

// ---------- (a) HOOD DE VERDAD ----------
// cierres MENSUALES reales de HOOD (Robinhood MCP, get_equity_historicals, ajustado por splits).
// Se usa el cierre del mes ANTERIOR durante todo el mes siguiente: asi nada mira al futuro.
const HOODMES = {
  "2021-12": 17.76, "2022-01": 14.15, "2022-02": 12.01, "2022-03": 13.51, "2022-04": 9.805, "2022-05": 10.06,
  "2022-06": 8.22, "2022-07": 9.05, "2022-08": 9.55, "2022-09": 10.10, "2022-10": 11.68, "2022-11": 9.59,
  "2022-12": 8.14, "2023-01": 10.41, "2023-02": 10.07, "2023-03": 9.71, "2023-04": 8.85, "2023-05": 8.92,
  "2023-06": 9.98, "2023-07": 12.865, "2023-08": 10.89, "2023-09": 9.81, "2023-10": 9.14, "2023-11": 8.80,
  "2023-12": 12.74, "2024-01": 10.74, "2024-02": 16.31, "2024-03": 20.13, "2024-04": 16.49, "2024-05": 20.91,
  "2024-06": 22.71, "2024-07": 20.57, "2024-08": 20.12, "2024-09": 23.42, "2024-10": 23.49, "2024-11": 37.54,
  "2024-12": 37.26, "2025-01": 51.95, "2025-02": 50.10, "2025-03": 41.62, "2025-04": 49.11, "2025-05": 66.15,
  "2025-06": 93.63, "2025-07": 103.05, "2025-08": 104.03, "2025-09": 143.18, "2025-10": 146.78, "2025-11": 128.49,
  "2025-12": 113.10, "2026-01": 99.48, "2026-02": 75.85, "2026-03": 69.30, "2026-04": 72.89, "2026-05": 94.30,
  "2026-06": 100.28, "2026-07": 86.56,
};
const mesAnterior = (f) => { const [y, m] = f.slice(0, 7).split("-").map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`; };
function hoodEn(fecha) { const k = mesAnterior(fecha); return (HOODMES[k] ?? 96.82) * 500; }

function simular(filas, N, W = 50, { mant = 0.30, lambda = 1.31, hoodFijo = 48412, hoodReal = false, filtro = null } = {}) {
  let ef = EFECTIVO0, int = 0, acum = 0, pico = 0, peorDD = 0, maxPrest = 0, sinEf = null, llamada = null, sinPoder = 0, ops = 0, saltados = 0;
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i], a = f.porAncho[W];
    if (!a) continue;
    if (i > 0 && ef < 0) { const d = dias(filas[i - 1].fecha, f.fecha); const c = (-ef) * TASA / 360 * d; int += c; ef -= c; }
    if (ef < 0) maxPrest = Math.max(maxPrest, -ef);
    const hood = hoodReal ? hoodEn(f.fecha) : hoodFijo;
    // patrimonio = HOOD + efectivo; llamada si patrimonio/HOOD < mantenimiento
    if (ef < hood * (mant - 1)) { llamada ??= f.fecha; break; }
    const pcBase = hoodReal ? (hood + EFECTIVO0) * (PC0 / (48412 + EFECTIVO0)) : PC0;
    const pc = pcBase + lambda * (ef - EFECTIVO0);
    if (N * W * 100 > pc) { sinPoder++; continue; }
    if (filtro && !filtro(f)) { saltados++; continue; }
    const pl = N * a.pl; ef += pl; ops++; acum += pl; if (acum > pico) pico = acum; peorDD = Math.min(peorDD, acum - pico);
    if (ef < 0 && !sinEf) sinEf = f.fecha;
    if (ef < 0) maxPrest = Math.max(maxPrest, -ef);
  }
  return { N, W, ops, saltados, bruto: acum, interes: int, neto: acum - int, alAno: (acum - int) / anos(filas), sinEf, llamada, maxPrest, peorDD, sinPoder, efFinal: ef };
}

console.log(`=== (a) LA MISMA CAJA, PERO CON EL PRECIO REAL DE HOOD ===`);
console.log(`500 acciones de HOOD valian: ene-2022 ${eur(14.15 * 500)} - jun-2022 ${eur(8.22 * 500)} (minimo del mes $6,81 = ${eur(6.81 * 500)}) - dic-2023 ${eur(12.74 * 500)} - dic-2024 ${eur(37.26 * 500)} - hoy ${eur(48412)}`);
console.log(`Es decir: la garantia sobre la que se apoya todo VALIA ${(48412 / (14.15 * 500)).toFixed(1)} VECES MENOS justo en el ano que mas duele.\n`);
console.log("| ala | contratos | HOOD congelado en $48.412 | HOOD al precio real de cada mes |");
console.log("|---|---|---|---|");
for (const [W, N] of [[50, 1], [50, 2], [30, 1], [20, 1], [20, 2], [10, 2]]) {
  const fijo = simular(F, N, W);
  const real = simular(F, N, W, { hoodReal: true });
  console.log(`| ${W} | ${N} | ${fijo.llamada ? "LLAMADA " + fijo.llamada : "sobrevive, neto " + eur(fijo.alAno) + "/ano"} | ${real.llamada ? "**LLAMADA " + real.llamada + "**" : "sobrevive, neto " + eur(real.alAno) + "/ano"} |`);
}

// ---------- (b) FILTROS: elegir en A, aplicar a B, y al reves ----------
const A = F.filter((f) => f.fecha < "2024-01-01"), B = F.filter((f) => f.fecha >= "2024-01-01");
const W = 50;
const VARS = {
  "sigmasCorto (25 pts / sigma del straddle) >=": (f) => f.sigmasCorto,
  "credito por contrato <= $": (f) => -f.credito * 100,
  "rango de la manana en puntos <= ": (f) => -f.rangoMananaPts,
  "recorrido de la manana en puntos <= ": (f) => -f.recorridoPts,
  "creditoEnSigma <= ": (f) => -f.creditoEnSigma,
};
const met = (g) => { const pl = g.map((f) => f.porAncho[W].pl); return { n: g.length, alAno: pl.reduce((a, b) => a + b, 0) / anos(g), peor: Math.min(...pl), p1: pctl(pl, 0.01), p5: pctl(pl, 0.05), dd: dd(pl) }; };

console.log(`\n=== (b) FILTROS OBSERVABLES A LAS 11:00 - umbral ELEGIDO en un periodo, aplicado TAL CUAL al otro ===`);
console.log(`metrica que decide: $ de ingreso perdidos al ano por cada $ de PEOR RACHA eliminado. Menos de 1 = buen trato.\n`);
let pruebas = 0;
for (const [nom, fn] of Object.entries(VARS)) {
  console.log(`--- ${nom} ---`);
  console.log("| corte (decil) | umbral fijado en 2022-23 | 2022-23 $/ano | 2022-23 racha | 2023->24 $/ano | 2024-26 racha | $ perdidos por $ de racha (FUERA de muestra) |");
  console.log("|---|---|---|---|---|---|---|");
  const baseA = met(A), baseB = met(B);
  for (const q of [0.1, 0.2, 0.3, 0.4]) {
    pruebas++;
    const u = pctl(A.map(fn), q);                       // umbral elegido SOLO con 2022-23
    const fA = A.filter((f) => fn(f) >= u), fB = B.filter((f) => fn(f) >= u);
    if (fA.length < 50 || fB.length < 50) continue;
    const mA = met(fA), mB = met(fB);
    const perdido = baseB.alAno - mB.alAno, quitado = mB.dd - baseB.dd;
    console.log(`| quita el ${(q * 100).toFixed(0)}% peor | ${u.toFixed(3)} | ${eur(mA.alAno)} (base ${eur(baseA.alAno)}) | ${eur(mA.dd)} (base ${eur(baseA.dd)}) | ${eur(mB.alAno)} (base ${eur(baseB.alAno)}) | ${eur(mB.dd)} (base ${eur(baseB.dd)}) | ${quitado > 0 ? "$" + (perdido / quitado).toFixed(2) : "**no quita nada: la racha EMPEORA**"} |`);
  }
  console.log("| corte (decil) | umbral fijado en 2024-26 | 2024-26 $/ano | 2024-26 racha | aplicado a 2022-23 $/ano | 2022-23 racha | $ perdidos por $ de racha (FUERA de muestra) |");
  console.log("|---|---|---|---|---|---|---|");
  for (const q of [0.1, 0.2, 0.3, 0.4]) {
    pruebas++;
    const u = pctl(B.map(fn), q);
    const fB = B.filter((f) => fn(f) >= u), fA = A.filter((f) => fn(f) >= u);
    if (fA.length < 50 || fB.length < 50) continue;
    const mA = met(fA), mB = met(fB);
    const perdido = baseA.alAno - mA.alAno, quitado = mA.dd - baseA.dd;
    console.log(`| quita el ${(q * 100).toFixed(0)}% peor | ${u.toFixed(3)} | ${eur(mB.alAno)} (base ${eur(baseB.alAno)}) | ${eur(mB.dd)} (base ${eur(baseB.dd)}) | ${eur(mA.alAno)} (base ${eur(baseA.alAno)}) | ${eur(mA.dd)} (base ${eur(baseA.dd)}) | ${quitado > 0 ? "$" + (perdido / quitado).toFixed(2) : "**no quita nada: la racha EMPEORA**"} |`);
  }
  console.log("");
}
console.log(`pruebas de filtro declaradas: ${pruebas} (mas 20 anteriores = ${pruebas + 20}) - liston de |t| = ${listonT(pruebas + 20)}`);

// ---------- (c) lo unico que queda: el TAMANO. Cuanto cuesta cada escalon ----------
console.log(`\n=== (c) EL UNICO MANDO QUE FUNCIONA ES EL TAMANO - coste de cada escalon, TODA la muestra ===`);
console.log("| ala | contratos | riesgo maximo del dia | $/ano neto | peor dia | peor racha | racha / efectivo ($7.977) | %/ano sobre $56.389 |");
console.log("|---|---|---|---|---|---|---|---|");
for (const [w, n] of [[50, 1], [30, 1], [20, 1], [10, 1], [10, 2], [20, 2], [30, 2], [50, 2]]) {
  const g = F.filter((f) => f.porAncho[w]);
  const pl = g.map((f) => f.porAncho[w].pl * n);
  const r = simular(F, n, w);
  console.log(`| ${w} | ${n} | ${eur(n * w * 100)} | ${eur(r.alAno)} | ${eur(Math.min(...pl))} | ${eur(dd(pl))} | ${(dd(pl) / -7977).toFixed(1)}x | ${(r.alAno / 56389 * 100).toFixed(1)}% |`);
}
