// EL SUPUESTO QUE SOSTIENE EL TITULAR — HOOD marcado a su precio REAL, día a día.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/nulo-hood-real.mjs
//
// El informe congela HOOD en $48.135 los 4,3 años y de ahí saca la línea de llamada (−$33.694).
// Ese número es el 100% del titular "la cuenta aguanta las TRES a 1 y 2 contratos": la llamada
// nunca llega porque la línea está lejísimos. El propio informe lo pone como su primer hueco y
// dice que el dato está en scripts/cache-theta/cierres/ — NO ESTÁ AHÍ (esa carpeta tiene 28
// tickers y HOOD no es uno). Sí está en scripts/cache-theta/HOOD_bars_20201122_20270308.json.
//
// Aquí se sustituye la constante por la serie real. Dos marcados, los dos declarados:
//   REAL      · 500 acciones × el cierre real de HOOD ese día (lo que valían de verdad)
//   ESCALADO  · 500 acciones normalizadas para valer $48.135 el último día (= "hoy tiene $48.135
//               en HOOD y lo ha tenido siempre"), que es el supuesto del informe con su volatilidad
//
// Nada de esto entra en la decisión de operar: HOOD sólo mueve la LÍNEA DE LLAMADA.

import { readFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";

const EFECTIVO = 7977, INT = 0.05, ACCIONES = 500, MANT = 0.30;
const eur = (x) => (x == null || !isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const pct = (x) => (x < 0 ? "−" : "") + Math.abs(x * 100).toFixed(1) + "%";

const D = JSON.parse(readFileSync("scripts/cuanto-aguanta-dias.json", "utf8")).dias;
const bars = JSON.parse(readFileSync("scripts/cache-theta/HOOD_bars_20201122_20270308.json", "utf8"));
const px = new Map(bars.map((b) => [b.time, b.close]));
const fechasH = bars.map((b) => b.time).sort();

/** cierre de HOOD conocido en `f` o el último ANTERIOR (nunca uno posterior: no se mira al futuro) */
function hoodEn(f) {
  if (px.has(f)) return px.get(f);
  let mejor = null;
  for (const g of fechasH) { if (g > f) break; mejor = g; }
  return mejor ? px.get(mejor) : null;
}

const conH = D.map((d) => ({ ...d, hood: hoodEn(d.fecha) }));
const faltan = conH.filter((d) => d.hood == null);
if (faltan.length) console.log(`OJO — ${faltan.length} sesiones sin cierre de HOOD anterior; se descartan: ${faltan.map((d) => d.fecha).join(", ")}`);
const Z = conH.filter((d) => d.hood != null);
const arrastradas = Z.filter((d) => !px.has(d.fecha)).length;

radiografia(
  Z.map((d) => ({ hood: d.hood, sp11: d.sp11, plA: d.A.pl, plB: d.B.pl, plC: d.C.pl })),
  ["hood", "sp11", "plA", "plB", "plC"], "HOOD real + P&L del cóndor",
);
console.log(`  ${Z.length} sesiones · ${arrastradas} con el cierre de HOOD arrastrado del día hábil anterior`);

const PFIN = Z[Z.length - 1].hood;
const ESCALA = 48135 / (ACCIONES * PFIN);
console.log(`\n  HOOD real: ${eur(Z[0].hood * ACCIONES)} el ${Z[0].fecha} → ${eur(PFIN * ACCIONES)} el ${Z[Z.length - 1].fecha}`);
const vals = Z.map((d) => d.hood * ACCIONES);
console.log(`  valor de las 500 acciones: mínimo ${eur(Math.min(...vals))} (${Z[vals.indexOf(Math.min(...vals))].fecha}) · máximo ${eur(Math.max(...vals))}`);
console.log(`  El informe usa $48.135 CONSTANTE. El mínimo real es el ${(Math.min(...vals) / 48135 * 100).toFixed(1)}% de esa constante.`);

// caída máxima real de HOOD y correlación con los días malos del cóndor
let pk = -Infinity, ddH = 0, fddH = "";
for (const d of Z) { const v = d.hood * ACCIONES; if (v > pk) pk = v; if ((pk - v) / pk > ddH) { ddH = (pk - v) / pk; fddH = d.fecha; } }
console.log(`  caída máxima de HOOD en el período: ${pct(-ddH)} (suelo el ${fddH}) — el informe sólo estresó −30% y −50%.`);
const ret = [], plr = [];
for (let i = 1; i < Z.length; i++) { ret.push(Z[i].hood / Z[i - 1].hood - 1); plr.push(Z[i].A.pl); }
const mu = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const cor = (a, b) => { const ma = mu(a), mb = mu(b); let s = 0, sa = 0, sb = 0; for (let i = 0; i < a.length; i++) { s += (a[i] - ma) * (b[i] - mb); sa += (a[i] - ma) ** 2; sb += (b[i] - mb) ** 2; } return s / Math.sqrt(sa * sb); };
console.log(`  correlación (retorno diario de HOOD, P&L diario del cóndor ±25/50): ρ = ${cor(ret, plr).toFixed(3)}`);
const peores = [...Z].sort((a, b) => a.A.pl - b.A.pl).slice(0, 20).map((d) => d.fecha);
const iPeor = peores.map((f) => Z.findIndex((d) => d.fecha === f)).filter((i) => i > 0);
console.log(`  en los 20 peores días del cóndor, HOOD hizo de media ${pct(mu(iPeor.map((i) => Z[i].hood / Z[i - 1].hood - 1)))} (el resto de días: ${pct(mu(ret))})`);

/** caja + línea de llamada que se mueve con HOOD */
function caja(g, n, filtro, modo) {
  let ef = EFECTIVO, minC = EFECTIVO, pico = EFECTIVO, dd = 0, prev = Z[0].fecha;
  let llamada = null, holgMin = Infinity, fHolg = "", rojo = 0;
  for (const d of Z) {
    const nd = Math.max(0, (new Date(d.fecha + "T00:00:00Z") - new Date(prev + "T00:00:00Z")) / 86400000);
    prev = d.fecha;
    if (ef < 0 && nd > 0) ef += ef * INT * nd / 365;
    ef += (filtro && !d.opera ? 0 : d[g].pl * n);
    const H = modo === "fijo" ? 48135 : modo === "real" ? d.hood * ACCIONES : d.hood * ACCIONES * ESCALA;
    const linea = -(1 - MANT) * H;              // llamada si el efectivo baja de −70% del valor de HOOD
    if (ef > pico) pico = ef;
    if (pico - ef > dd) dd = pico - ef;
    if (ef < minC) minC = ef;
    if (ef < 0) rojo++;
    if (ef - linea < holgMin) { holgMin = ef - linea; fHolg = d.fecha; }
    if (ef < linea && !llamada) llamada = d.fecha;
  }
  return { minC, dd, llamada, holgMin, fHolg, rojo };
}

console.log("\n" + "═".repeat(118));
console.log("### ¿SOBREVIVE EL TITULAR CUANDO HOOD DEJA DE SER UNA CONSTANTE?");
console.log("═".repeat(118) + "\n");
console.log("| marcado de HOOD | geometría | ctr | suelo de caja | holgura mínima hasta la llamada (fecha) | ¿LLAMADA DE MARGEN? |");
console.log("|---|---|---|---|---|---|");
const G = { A: "cóndor HOY ±25/50", B: "filtro ±30/50", C: "straddle 2,3×/30" };
const MODOS = [["FIJO $48.135 (el informe)", "fijo"], ["ESCALADO a $48.135 hoy", "esc"], ["REAL (500 acciones)", "real"]];
for (const [nom, modo] of MODOS) {
  for (const g of ["A", "B", "C"]) for (const n of [1, 2]) {
    const r = caja(g, n, g === "B", modo);
    console.log(`| ${nom} | ${G[g]} | ${n} | ${eur(r.minC)} | ${eur(r.holgMin)} (${r.fHolg}) | ${r.llamada ? "**SÍ** " + r.llamada : "NO"} |`);
  }
  console.log("|  |  |  |  |  |  |");
}
console.log("\nEl suelo de caja y la caída NO cambian entre marcados (HOOD no entra en la decisión). Lo único que");
console.log("cambia es DÓNDE ESTÁ LA LÍNEA — y con ella, la única afirmación del titular.");
