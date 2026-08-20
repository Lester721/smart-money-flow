// TENDENCIA-OTRA-VEZ · PASO 2 — la serie de cierres diarios y las medias móviles.
//
// La cadena 0DTE da el cierre REAL del SPX de cada día que existe (último underlying_price).
// Faltan dos cosas y ninguna se inventa:
//   · el calentamiento (hasta 200 sesiones ANTES del 2022-01-03) — no hay cadenas
//   · los martes y jueves de enero-marzo de 2022 — no existían como vencimiento 0DTE, pero SÍ
//     fueron sesiones de bolsa y cuentan para una media móvil
// Para esos huecos se ENCADENA el rendimiento diario REAL del SPY (fichero de barras diarias),
// anclado al SPX en cuanto vuelve a haber cadena. Se cuenta cuántos días son de cada tipo.
import { readFileSync, writeFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia.ts";

const base = JSON.parse(readFileSync("scripts/tend-base.json", "utf8"));
const filas = base.filas;
const cierreSPX = new Map(filas.map((f) => [f.fecha, f.cierre]));

const spyArr = JSON.parse(readFileSync("scripts/cache-theta/SPY_bars_20151122_20270308.json", "utf8"));
const spy = new Map(spyArr.map((b) => [b.time, b.close]));
console.log(`SPY barras diarias: ${spyArr.length} · ${spyArr[0].time} → ${spyArr[spyArr.length - 1].time}`);
console.log(`cierres SPX de cadena: ${cierreSPX.size} · ${filas[0].fecha} → ${filas[filas.length - 1].fecha}`);

// Calendario = unión de fechas de SPY y de cadena
const cal = [...new Set([...spy.keys(), ...cierreSPX.keys()])].sort();
const primeraAncla = filas[0].fecha;

const S = new Map(); const origen = new Map();
// hacia adelante desde la primera ancla
let prev = null;
for (const d of cal) {
  if (d < primeraAncla) continue;
  if (cierreSPX.has(d)) { S.set(d, cierreSPX.get(d)); origen.set(d, "SPX"); prev = d; continue; }
  if (prev != null && spy.has(d) && spy.has(prev)) {
    S.set(d, S.get(prev) * (spy.get(d) / spy.get(prev))); origen.set(d, "SPY"); prev = d;
  }
}
// hacia atrás para el calentamiento
const antes = cal.filter((d) => d < primeraAncla).sort().reverse();
let sig = primeraAncla;
for (const d of antes) {
  if (spy.has(d) && spy.has(sig)) { S.set(d, S.get(sig) * (spy.get(d) / spy.get(sig))); origen.set(d, "SPY"); sig = d; }
}
const fechasS = [...S.keys()].sort();
const nSPX = [...origen.values()].filter((x) => x === "SPX").length;
console.log(`serie de cierres: ${fechasS.length} sesiones · ${fechasS[0]} → ${fechasS[fechasS.length - 1]}`);
console.log(`   ${nSPX} son cierre REAL de SPX · ${fechasS.length - nSPX} encadenados del rendimiento real del SPY`);
const huecosDentro = fechasS.filter((d) => d >= primeraAncla && origen.get(d) === "SPY");
console.log(`   dentro de la muestra (≥${primeraAncla}) hay ${huecosDentro.length} días encadenados:`);
const porAno = {}; for (const d of huecosDentro) porAno[d.slice(0,7)] = (porAno[d.slice(0,7)] ?? 0) + 1;
console.log("   ", JSON.stringify(porAno));

// ── medias móviles sobre la serie, SIEMPRE hasta el cierre de AYER ──
const idx = new Map(fechasS.map((d, i) => [d, i]));
const vals = fechasS.map((d) => S.get(d));
const LARGOS = [5, 8, 10, 13, 15, 20, 25, 30, 40, 50, 65, 75, 100, 125, 150, 200];
// sumas acumuladas para medias rápidas
const acum = [0]; for (let i = 0; i < vals.length; i++) acum.push(acum[i] + vals[i]);
const mediaHasta = (i, N) => (i - N < -1 ? null : (acum[i] - acum[i - N]) / N); // media de las N sesiones que TERMINAN en i-1

const salida = [];
let sinMA = 0;
for (const f of filas) {
  const i = idx.get(f.fecha);
  if (i == null) { sinMA++; continue; }
  const r = { fecha: f.fecha, spot11: f.spot11, cierre: f.cierre, pl: f.pl, cred: f.cred,
              straddle: f.straddle, ivAtm: f.ivAtm, kC: f.kC, kP: f.kP };
  let falta = false;
  for (const N of LARGOS) {
    const m = mediaHasta(i, N);
    if (m == null || !(m > 0)) { falta = true; break; }
    r["d" + N] = f.spot11 / m - 1;              // distancia en % a la media
    r["s" + N] = (f.spot11 - m) / f.straddle;   // la misma distancia en σ del día (adimensional)
  }
  if (falta) { sinMA++; continue; }
  salida.push(r);
}
console.log(`\nfilas con TODAS las medias disponibles: ${salida.length} (perdidas ${sinMA})`);
const pa = {}; for (const f of salida) pa[f.fecha.slice(0, 4)] = (pa[f.fecha.slice(0, 4)] ?? 0) + 1;
console.log("por año:", JSON.stringify(pa));

radiografia(salida, ["pl", "cred", "spot11", "straddle", "ivAtm", "d5", "d20", "d50", "d200", "s20", "s200"],
            "tendencia — base + medias", { cerosLegitimos: [] });

writeFileSync("scripts/tend-filas.json", JSON.stringify({ filas: salida, largos: LARGOS }));
console.log("escrito scripts/tend-filas.json");

// ── comprobación de la base: ¿reproduce lo que ya sabíamos? ──
const eur = (x) => `$${Math.round(x).toLocaleString("es-ES")}`;
const pls = salida.map((f) => f.pl);
const tot = pls.reduce((a, b) => a + b, 0);
let cur = 0, peor = 0, pico = 0, acumu = 0;
for (const p of pls) { acumu += p; pico = Math.max(pico, acumu); peor = Math.min(peor, acumu - pico); }
console.log(`\nCONTROL · cóndor ±25 / ala 50, 1 contrato, ${salida.length} días`);
console.log(`  total ${eur(tot)} · ${eur(tot / (salida.length / 252))}/año · peor racha ${eur(peor)}`);
for (const a of ["2022","2023","2024","2025","2026"]) {
  const g = salida.filter((x) => x.fecha.startsWith(a)); if (!g.length) continue;
  const s = g.reduce((t, x) => t + x.pl, 0);
  console.log(`   ${a}: ${g.length} días · ${eur(s)} · peor día ${eur(Math.min(...g.map(x=>x.pl)))}`);
}
