// IMANES · PASO 1 — RADIOGRAFÍA antes de medir nada.
//
// Orden permanente del proyecto: mirar el fichero antes de medirlo. Contar ceros, contar nulos,
// contar valores distintos. Un campo que no existe se lee como 0 y se mide durante 45 minutos.
//
// Aquí se comprueba, para CADA candidato a imán:
//   · cuántos días lo tienen (y cuántos son null)
//   · cuántos valores DISTINTOS toma (un campo con 3 valores no es una señal)
//   · si es "el precio con otro nombre": ¿coincide con el strike más cercano a la apertura?
//   · la distribución de su distancia a la apertura, que es lo que el control tiene que igualar
//
// Corre:  node --import tsx --max-old-space-size=10240 scripts/iman-1-radiografia.mjs

import { readFileSync } from "node:fs";

const D = JSON.parse(readFileSync("scripts/gex-niveles.json", "utf8"));
const F = D.filas;

const med = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))]; };
const n2 = (x) => (isFinite(x) ? x.toFixed(2) : "—");

/** LANZA si un campo está muerto. Fallo cerrado: mejor reventar que medir ceros. */
function exigir(cond, msg) { if (!cond) throw new Error(`FALLO CERRADO: ${msg}`); }

console.log(`\n╔══ RADIOGRAFÍA · ¿EXISTEN LOS IMANES EN EL FICHERO? ═══════════════════════════════════════╗`);
console.log(`  fuente: scripts/gex-niveles.json · generado ${D.generado}`);
console.log(`  hora de decisión ${D.hora} · T real ${(D.tReal * 365 * 24).toFixed(2)} h · banda gamma ±${D.bandaGamma * 100}% · banda OI ±${D.bandaOI * 100}%`);
console.log(`  ${F.length} días · ${F[0].fecha} → ${F[F.length - 1].fecha}`);
console.log(`  descartes del constructor: ${JSON.stringify(D.descartes)}`);

// ── cobertura básica ───────────────────────────────────────────────────────────────────────
const porAno = {};
for (const f of F) { const y = f.fecha.slice(0, 4); porAno[y] = (porAno[y] || 0) + 1; }
console.log(`\n── días por año ──`);
console.log(`  ${Object.entries(porAno).map(([y, n]) => `${y}: ${n}`).join(" · ")}`);

const sinAp = F.filter((f) => !(f.apertura > 0)).length;
const sinCi = F.filter((f) => !(f.cierre > 0)).length;
const sinSPY = F.filter((f) => !f.spy).length;
console.log(`\n── el precio ──`);
console.log(`  sin apertura: ${sinAp} · sin cierre: ${sinCi} · sin SPY minuto a minuto: ${sinSPY} (${(sinSPY / F.length * 100).toFixed(1)}%)`);
exigir(sinAp === 0, "hay días sin apertura");
exigir(sinCi === 0, "hay días sin cierre");

const movs = F.map((f) => f.cierre - f.apertura);
const rangos = F.map((f) => f.maxMuestreado - f.minMuestreado);
console.log(`  movimiento apertura→cierre (pts SPX): p5 ${n2(pct(movs, 0.05))} · p50 ${n2(pct(movs, 0.5))} · p95 ${n2(pct(movs, 0.95))} · |mediana| ${n2(pct(movs.map(Math.abs), 0.5))}`);
console.log(`  rango del día (pts SPX):               p25 ${n2(pct(rangos, 0.25))} · p50 ${n2(pct(rangos, 0.5))} · p75 ${n2(pct(rangos, 0.75))}`);
exigir(pct(rangos, 0.5) > 5, "el rango mediano del día es absurdamente pequeño: el camino no se está leyendo");

// ── el paso de strike, que define lo que es "el precio con otro nombre" ────────────────────
// Se deduce de los propios niveles: la diferencia mínima no nula entre imanes de días contiguos
// no vale. Se mide sobre los múltiplos: ¿son todos múltiplos de 5? ¿de 25?
const todosK = [];
for (const f of F) for (const l of ["gam", "gamD", "oi"]) { const k = f.niveles[l]?.imanBruto; if (k != null) todosK.push(k); }
const mult = (p) => todosK.filter((k) => Math.abs(k / p - Math.round(k / p)) < 1e-9).length / todosK.length;
console.log(`\n── el paso de strike (define qué es "pegado al precio") ──`);
console.log(`  múltiplos de 5: ${(mult(5) * 100).toFixed(1)}% · de 10: ${(mult(10) * 100).toFixed(1)}% · de 25: ${(mult(25) * 100).toFixed(1)}%`);

// ── LOS CANDIDATOS A IMÁN ──────────────────────────────────────────────────────────────────
const CAND = [
  ["gam.imanBruto", (f) => f.niveles.gam?.imanBruto, "máx gamma total (call+put), T real 6h25"],
  ["gam.imanNeto", (f) => f.niveles.gam?.imanNeto, "máx |gamma neta|, T real 6h25"],
  ["gamD.imanBruto", (f) => f.niveles.gamD?.imanBruto, "máx gamma total, T de un día"],
  ["gamD.imanNeto", (f) => f.niveles.gamD?.imanNeto, "máx |gamma neta|, T de un día"],
  ["oi.imanBruto", (f) => f.niveles.oi?.imanBruto, "máx OI total (call+put) en ±5%"],
  ["maxPain", (f) => f.maxPain, "max pain clásico, todo el OI sin banda"],
];

console.log(`\n╔══ LOS SEIS CANDIDATOS ════════════════════════════════════════════════════════════════════╗`);
console.log(`  ${"campo".padEnd(16)} ${"n".padStart(5)} ${"nulos".padStart(6)} ${"distintos".padStart(10)} ${"=strike ap.".padStart(12)}   distancia a la apertura (pts SPX)`);
console.log(`  ${"".padEnd(16)} ${"".padStart(5)} ${"".padStart(6)} ${"".padStart(10)} ${"".padStart(12)}   p10      p50      p90     |med|`);

const resumenCand = {};
for (const [nombre, get, desc] of CAND) {
  const vals = [], offs = [], pegado = [];
  let nulos = 0;
  for (const f of F) {
    const k = get(f);
    if (k == null || !isFinite(k)) { nulos++; continue; }
    vals.push(k);
    offs.push(k - f.apertura);
    // "el precio con otro nombre": el strike múltiplo de 5 más cercano a la apertura
    pegado.push(Math.abs(k - Math.round(f.apertura / 5) * 5) < 1e-9 ? 1 : 0);
  }
  const distintos = new Set(vals).size;
  const absOff = offs.map(Math.abs);
  resumenCand[nombre] = { n: vals.length, nulos, distintos, pegadoPct: med(pegado) * 100, medAbs: pct(absOff, 0.5) };
  console.log(`  ${nombre.padEnd(16)} ${String(vals.length).padStart(5)} ${String(nulos).padStart(6)} ${String(distintos).padStart(10)} ${(med(pegado) * 100).toFixed(1).padStart(11)}%   ${n2(pct(offs, 0.1)).padStart(7)} ${n2(pct(offs, 0.5)).padStart(8)} ${n2(pct(offs, 0.9)).padStart(8)} ${n2(pct(absOff, 0.5)).padStart(8)}`);
  exigir(vals.length > 0, `${nombre} no tiene ni un valor`);
  exigir(distintos > 20, `${nombre} sólo toma ${distintos} valores distintos: campo muerto o casi`);
}
console.log(`\n  qué es cada uno:`);
for (const [nombre, , desc] of CAND) console.log(`    ${nombre.padEnd(16)} ${desc}`);

// ── ¿coinciden entre sí? ───────────────────────────────────────────────────────────────────
console.log(`\n── ¿son el mismo nivel con distinto nombre? (% de días en que coinciden) ──`);
const nombres = CAND.map((c) => c[0]);
console.log(`  ${"".padEnd(16)} ${nombres.map((n) => n.slice(0, 8).padStart(9)).join("")}`);
for (const [na, ga] of CAND) {
  const fila = [];
  for (const [nb, gb] of CAND) {
    let ok = 0, tot = 0;
    for (const f of F) { const a = ga(f), b = gb(f); if (a != null && b != null) { tot++; if (Math.abs(a - b) < 1e-9) ok++; } }
    fila.push(`${(ok / tot * 100).toFixed(0)}%`.padStart(9));
  }
  console.log(`  ${na.padEnd(16)} ${fila.join("")}`);
}

// ── el régimen: gamma neta ─────────────────────────────────────────────────────────────────
console.log(`\n── el régimen (gamma neta en $ por punto, lente gam) ──`);
const netos = F.map((f) => f.niveles.gam?.netPunto).filter((x) => x != null && isFinite(x));
const posit = netos.filter((x) => x > 0).length;
console.log(`  n ${netos.length} · positivos ${posit} (${(posit / netos.length * 100).toFixed(1)}%) · negativos ${netos.length - posit}`);
console.log(`  p10 ${(pct(netos, 0.1) / 1e6).toFixed(1)}M · p50 ${(pct(netos, 0.5) / 1e6).toFixed(1)}M · p90 ${(pct(netos, 0.9) / 1e6).toFixed(1)}M  $/punto`);
exigir(posit > 50 && netos.length - posit > 50, "el régimen no parte la muestra: un lado tiene menos de 50 días");

// ── el peaje real, que decide si un efecto es cobrable ─────────────────────────────────────
console.log(`\n── el PEAJE real a las 09:35 (horquilla como % de la prima) ──`);
for (const k of ["callATM", "putATM", "call05", "put05"]) {
  const h = F.map((f) => f.peaje?.[k]?.horquillaPct).filter((x) => x != null && isFinite(x));
  const b = F.map((f) => f.peaje?.[k]?.bid).filter((x) => x != null && isFinite(x));
  console.log(`  ${k.padEnd(9)} n ${String(h.length).padStart(5)} · horquilla p25 ${n2(pct(h, 0.25))}% p50 ${n2(pct(h, 0.5))}% p75 ${n2(pct(h, 0.75))}% · bid mediano $${n2(pct(b, 0.5))}`);
}
const razones = F.map((f) => f.spy?.razonSPX).filter(Boolean);
console.log(`\n── la razón SPX/SPY (para convertir puntos a dólares del vehículo) ──`);
console.log(`  n ${razones.length} · min ${n2(Math.min(...razones))} · p50 ${n2(pct(razones, 0.5))} · max ${n2(Math.max(...razones))}`);

// ── el camino intradía: ¿está entero? ──────────────────────────────────────────────────────
const nBarras = F.map((f) => f.barras5min).filter(Boolean);
const n30 = F.map((f) => f.cada30?.length || 0);
console.log(`\n── el camino intradía ──`);
console.log(`  barras de 5 min: p10 ${pct(nBarras, 0.1)} · p50 ${pct(nBarras, 0.5)} · max ${Math.max(...nBarras)}`);
console.log(`  puntos cada 30 min: p10 ${pct(n30, 0.1)} · p50 ${pct(n30, 0.5)} · días con menos de 10: ${n30.filter((x) => x < 10).length}`);
exigir(pct(n30, 0.5) >= 12, "el camino cada 30 min está incompleto en la mitad de los días");

console.log(`\n╚══ radiografía limpia: los seis campos existen, ninguno muerto ════════════════════════════╝\n`);
