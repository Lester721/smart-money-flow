// EL PUENTE — ¿por qué la señal que SÍ adelgaza la cola no baja la caída, y qué haría falta?
//
// Resultado de scripts/cola-intradia.mjs: `huecoAbs` (hueco de apertura contra el cierre de ayer)
// separa la cola con z = 3,17 y el MISMO signo en los tres tercios del período — la única de las
// 16 que pasa el listón. Pero al filtrar por ella la PEOR RACHA no mejora: −$15.176 → −$15.273.
//
// Aquí se contestan tres cosas, en este orden:
//   A · ¿DE QUÉ ESTÁ HECHA la peor racha? ¿de días catastróficos o de goteo?
//   B · ¿CUÁNTO CRÉDITO se lleva por delante el filtro? (la sospecha: los días marcados pagan más)
//   C · EL PUENTE: en los días marcados, en vez de NO operar, VENDER MÁS LEJOS. Con la cadena
//       real de las 11:00 en disco se puede construir el cóndor a otra distancia y medirlo.
//
// PRECIOS REALES: bid de lo vendido, ask de lo comprado, las cuatro patas, $0,03 por pata.
// El cóndor base se RECONSTRUYE aquí y se comprueba contra scripts/regimen-filas.json: si no
// coincide al céntimo, se para. Un lector distinto que da otro número no es un resultado.

import { readFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";

const SEP = 25, ALA = 50, COMM = 0.03, ANUAL = 252;
const MALO = 2000;
const PUENTES = 11;                     // configuraciones de puente declaradas antes de correr
const LISTON_PUENTE = listonT(16 + PUENTES);

const filas = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8"));
const cadena = JSON.parse(readFileSync("scripts/colaintra-cadena11.json", "utf8"));

const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.max(0, Math.min(s.length - 1, Math.floor(s.length * q)))]; };
function racha(pls) { let cur = 0, peor = 0; for (const p of pls) { cur = Math.min(0, cur + p); peor = Math.min(peor, cur); } return peor; }
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b[0] - o) < Math.abs(a[0] - o) ? b : a));
const ANOS = filas.length / ANUAL;

// ── el cóndor, a la distancia que se le pida ────────────────────────────────────────────────
function condor(fecha, spot, dist, ala = ALA) {
  const d = cadena[fecha];
  if (!d) return null;
  const cC = cerca(d.C, spot + dist), pC = cerca(d.P, spot - dist);
  const cL = cerca(d.C, cC[0] + ala), pL = cerca(d.P, pC[0] - ala);
  if (cL[0] <= cC[0] || pL[0] >= pC[0]) return null;
  const cred = cC[1] + pC[1] - cL[2] - pL[2];        // bid de lo vendido − ask de lo comprado
  if (!(cred > 0)) return null;
  return { cred, kcC: cC[0], kcL: cL[0], kpC: pC[0], kpL: pL[0] };
}
function liquidar(c, cierre) {
  return (c.cred - Math.min(Math.max(cierre - c.kcC, 0), c.kcL - c.kcC)
                 - Math.min(Math.max(c.kpC - cierre, 0), c.kpC - c.kpL)) * 100 - 8 * COMM;
}

// ── CONTROL · reconstruir el cóndor base y exigir que coincida ──────────────────────────────
let maxDif = 0, nCtrl = 0;
for (const f of filas) {
  const c = condor(f.fecha, f.sp11, SEP);
  if (!c) { console.log(`   ⚠️  ${f.fecha}: no se pudo reconstruir el cóndor base`); continue; }
  maxDif = Math.max(maxDif, Math.abs(liquidar(c, f.cierre) - f.pl));
  nCtrl++;
}
if (nCtrl !== filas.length || maxDif > 0.011)
  throw new Error(`CONTROL FALLIDO: ${nCtrl}/${filas.length} días reconstruidos, mayor diferencia ${maxDif.toFixed(4)} $. ` +
                  `El lector de este fichero NO reproduce el resultado ya medido — se para aquí.`);
console.log(`✅ control: los ${nCtrl} días del cóndor base se reconstruyen al céntimo (mayor diferencia ${maxDif.toFixed(6)} $)`);

const base = filas.map((f) => f.pl);
const totalBase = base.reduce((a, b) => a + b, 0);
const rachaBase = racha(base), peorBase = Math.min(...base);
const ingresoBase = totalBase / ANOS;

// ── A · ¿DE QUÉ ESTÁ HECHA LA PEOR RACHA? ───────────────────────────────────────────────────
console.log("\n" + "═".repeat(100));
console.log("  A · ANATOMÍA DE LA PEOR RACHA (" + eur(rachaBase) + ")");
console.log("═".repeat(100));
let cur = 0, peor = 0, iniIdx = 0, mejorIni = 0, mejorFin = 0, curIni = 0;
for (let i = 0; i < base.length; i++) {
  if (cur === 0) curIni = i;
  cur = Math.min(0, cur + base[i]);
  if (cur < peor) { peor = cur; mejorIni = curIni; mejorFin = i; }
}
const tramo = filas.slice(mejorIni, mejorFin + 1);
const plsT = tramo.map((f) => f.pl);
console.log(`\n  del ${tramo[0].fecha} al ${tramo[tramo.length - 1].fecha} · ${tramo.length} sesiones · ${eur(peor)}`);
console.log(`  días ganados ${plsT.filter((x) => x > 0).length} · perdidos ${plsT.filter((x) => x <= 0).length}`);
const grandes = tramo.filter((f) => f.pl < -MALO);
console.log(`  días de pérdida > ${eur(MALO)}: ${grandes.length} → suman ${eur(grandes.reduce((a, f) => a + f.pl, 0))} de los ${eur(peor)}`);
console.log(`  el resto del tramo (${tramo.length - grandes.length} sesiones) suma ${eur(plsT.reduce((a, b) => a + b, 0) - grandes.reduce((a, f) => a + f.pl, 0))}`);
console.log(`\n  los 8 peores días del tramo:`);
for (const f of [...tramo].sort((a, b) => a.pl - b.pl).slice(0, 8))
  console.log(`    ${f.fecha}  ${eur(f.pl).padStart(8)}  crédito ${eur(f.credito).padStart(6)}  hueco ${(f.huecoAbs ?? 0).toFixed(2)}%  movimiento mañana ${(Math.abs(f.sp11 / f.ap - 1) * 100).toFixed(2)}%`);

console.log(`\n  LOS 10 PEORES DÍAS DE TODO EL PERÍODO — ¿los marca el hueco?`);
console.log(`  | fecha | P&L | crédito | hueco | ¿tercio alto de hueco? |`);
console.log(`  |---|---|---|---|---|`);
const huecos = filas.map((f, i) => (i > 0 ? Math.abs(f.ap / filas[i - 1].cierre - 1) * 100 : null));
filas.forEach((f, i) => { f.huecoAbs = huecos[i]; });
const conH = filas.filter((f) => f.huecoAbs != null);
const corte33 = pct(conH.map((f) => f.huecoAbs), 2 / 3);
for (const f of [...filas].sort((a, b) => a.pl - b.pl).slice(0, 10))
  console.log(`  | ${f.fecha} | ${eur(f.pl)} | ${eur(f.credito)} | ${f.huecoAbs == null ? "—" : f.huecoAbs.toFixed(2) + "%"} | ${f.huecoAbs != null && f.huecoAbs >= corte33 ? "**sí**" : "no"} |`);
console.log(`\n  (corte del tercio alto de hueco: ${corte33.toFixed(2)}%)`);

// ── B · ¿CUÁNTO CRÉDITO SE LLEVA EL FILTRO? ─────────────────────────────────────────────────
console.log("\n" + "═".repeat(100));
console.log("  B · EL PRECIO DEL FILTRO — qué crédito hay en los días que marcaría");
console.log("═".repeat(100));
const ordH = [...conH].sort((a, b) => b.huecoAbs - a.huecoAbs);
const kH = Math.floor(ordH.length / 3);
const altoH = ordH.slice(0, kH), bajoH = ordH.slice(-kH);
console.log(`\n  crédito medio · tercio ALTO de hueco ${eur(media(altoH.map((f) => f.credito)))} · tercio BAJO ${eur(media(bajoH.map((f) => f.credito)))}`);
console.log(`  P&L medio     · tercio ALTO ${eur(media(altoH.map((f) => f.pl)))} · tercio BAJO ${eur(media(bajoH.map((f) => f.pl)))}`);
console.log(`  → el tercio marcado aporta ${eur(altoH.reduce((a, f) => a + f.pl, 0))} de los ${eur(totalBase)} totales (${((altoH.reduce((a, f) => a + f.pl, 0) / totalBase) * 100).toFixed(0)}%)`);

// ── C · EL PUENTE · en los días marcados, VENDER MÁS LEJOS en vez de no operar ───────────────
console.log("\n" + "═".repeat(100));
console.log("  C · EL PUENTE · " + PUENTES + " configuraciones declaradas · listón conservador |z| = " + LISTON_PUENTE);
console.log("═".repeat(100));

// sigmaRatio = cuántas sigma son los ±25 fijos. Sirve para elegir las k de la versión adaptativa.
const sr = filas.filter((f) => f.sigma > 0).map((f) => SEP / f.sigma);
console.log(`\n  los ±25 fijos valen  p10 ${pct(sr, 0.1).toFixed(2)}σ · p50 ${pct(sr, 0.5).toFixed(2)}σ · p90 ${pct(sr, 0.9).toFixed(2)}σ  (por eso las k son 0,5 · 0,65 · 0,8 · 1,0)`);

function evaluar(nombre, distDe) {
  const pls = [], creds = [], saltados = [];
  for (const f of filas) {
    const dist = distDe(f);
    if (dist == null) { saltados.push(f.fecha); continue; }   // null = no operar ese día
    const c = condor(f.fecha, f.sp11, dist);
    if (!c) { saltados.push(f.fecha); continue; }
    pls.push(liquidar(c, f.cierre));
    creds.push(c.cred * 100);
  }
  const suma = pls.reduce((a, b) => a + b, 0);
  const rch = racha(pls);
  return {
    nombre, dias: pls.length, saltados: saltados.length, ing: suma / ANOS, conserva: suma / totalBase,
    credMed: media(creds), peor: Math.min(...pls), rch,
    p2k: pls.filter((x) => x < -MALO).length / pls.length, p05: pct(pls, 0.05),
    porCaida: (suma / ANOS) / Math.abs(rch), pls,
  };
}

const marcado = (f) => f.huecoAbs != null && f.huecoAbs >= corte33;
const CONFIG = [
  ["sin filtro (línea base)",                    (f) => SEP],
  ["marcado → NO operar",                        (f) => (marcado(f) ? null : SEP)],
  ["marcado → vender a ±35",                     (f) => (marcado(f) ? 35 : SEP)],
  ["marcado → vender a ±50",                     (f) => (marcado(f) ? 50 : SEP)],
  ["marcado → vender a ±75",                     (f) => (marcado(f) ? 75 : SEP)],
  ["marcado → vender a ±0,65σ",                  (f) => (marcado(f) ? (f.sigma > 0 ? 0.65 * f.sigma : null) : SEP)],
  ["marcado → vender a ±0,80σ",                  (f) => (marcado(f) ? (f.sigma > 0 ? 0.80 * f.sigma : null) : SEP)],
  ["marcado → vender a ±1,00σ",                  (f) => (marcado(f) ? (f.sigma > 0 ? 1.00 * f.sigma : null) : SEP)],
  ["SIEMPRE a ±0,50σ (rediseño, sin señal)",     (f) => (f.sigma > 0 ? 0.50 * f.sigma : null)],
  ["SIEMPRE a ±0,65σ (rediseño, sin señal)",     (f) => (f.sigma > 0 ? 0.65 * f.sigma : null)],
  ["SIEMPRE a ±0,80σ (rediseño, sin señal)",     (f) => (f.sigma > 0 ? 0.80 * f.sigma : null)],
  ["SIEMPRE a ±1,00σ (rediseño, sin señal)",     (f) => (f.sigma > 0 ? 1.00 * f.sigma : null)],
];
if (CONFIG.length - 1 !== PUENTES) throw new Error(`declarados ${PUENTES} puentes y hay ${CONFIG.length - 1}`);

console.log("\n| configuración | días | crédito medio | ingreso/año | % conservado | peor día | peor racha | P(>2k) | p5 | $/año por $ de caída |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
const evals = [];
for (const [nombre, fn] of CONFIG) {
  const r = evaluar(nombre, fn);
  evals.push(r);
  console.log(`| ${nombre} | ${r.dias} | ${eur(r.credMed)} | ${eur(r.ing)} | ${(r.conserva * 100).toFixed(0)}% | ${eur(r.peor)} | ${eur(r.rch)} | ${(r.p2k * 100).toFixed(1)}% | ${eur(r.p05)} | **${r.porCaida.toFixed(3)}** |`);
}

// año por año de las dos mejores por $/año por $ de caída (sin contar la línea base)
const mejores = evals.slice(1).sort((a, b) => b.porCaida - a.porCaida).slice(0, 3);
console.log("\n## LAS 3 MEJORES, AÑO POR AÑO\n");
for (const m of mejores) {
  const fn = CONFIG.find((c) => c[0] === m.nombre)[1];
  console.log(`### ${m.nombre}`);
  console.log("| año | días | ingreso | peor día | peor racha | base: ingreso | base: peor racha |");
  console.log("|---|---|---|---|---|---|---|");
  for (const a of ["2024", "2025", "2026"]) {
    const g = filas.filter((f) => f.fecha.startsWith(a));
    const pls = [];
    for (const f of g) { const d = fn(f); if (d == null) continue; const c = condor(f.fecha, f.sp11, d); if (c) pls.push(liquidar(c, f.cierre)); }
    const pb = g.map((f) => f.pl);
    console.log(`| ${a} | ${pls.length} | ${eur(pls.reduce((x, y) => x + y, 0))} | ${eur(Math.min(...pls))} | ${eur(racha(pls))} | ${eur(pb.reduce((x, y) => x + y, 0))} | ${eur(racha(pb))} |`);
  }
  console.log("");
}
console.log(`  línea base para comparar: ingreso ${eur(ingresoBase)}/año · peor día ${eur(peorBase)} · peor racha ${eur(rachaBase)} · métrica ${(ingresoBase / Math.abs(rachaBase)).toFixed(3)}`);
