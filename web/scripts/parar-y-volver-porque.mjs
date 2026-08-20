// POR QUÉ NINGUNA REGLA DE PARADA CORTA LA COLA — y qué es lo que sí la corta.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/parar-y-volver-porque.mjs
//
// Esto NO añade pruebas a las 40 declaradas en parar-y-volver.mjs. No busca una regla nueva:
// desmonta el negativo (¿por qué falló?) y mide el ÚNICO camino que quedaba abierto.
//
//   1. LA TABLA HONESTA DE COLA — el p5 sobre la serie de la cuenta MIENTE cuando se paran
//      muchos días: los días parados valen $0 y empujan el percentil hacia arriba sin que la
//      cola de los días OPERADOS haya cambiado nada. Se repite sobre días operados.
//   2. EL MECANISMO — toda regla de parada apuesta a que las pérdidas se AGRUPAN. Se mide.
//   3. DE QUÉ ESTÁ HECHA LA PEOR RACHA — un día o cien.
//   4. EL PUENTE — si el peor día no se puede esquivar con el calendario, sólo lo mueve la
//      ESTRUCTURA. Se miden las alas de 50, 40, 30 y 20 puntos con precios reales.

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { drawdown, media, sd, pct, eur } from "./anatomia3-lib.mjs";
import { radiografia } from "../lib/radiografia";

const filas = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8")).sort((a, b) => a.fecha.localeCompare(b.fecha));
const N = filas.length, ANOS = N / 252;
const PL = filas.map((f) => f.pl);
const BASEDD = drawdown(PL), BASEANO = PL.reduce((a, b) => a + b, 0) / ANOS;

console.log(`\n${"═".repeat(110)}`);
console.log("  1 · LA TABLA HONESTA DE COLA — la cola de los días que SÍ se operan");
console.log(`${"═".repeat(110)}\n`);
console.log("  El p5 de la serie de la cuenta (parado = $0) sube sin que la cola cambie: los ceros");
console.log("  se cuelan entre los días malos. La cola de verdad es la de los días OPERADOS.\n");
console.log("| regla | días operados | peor día | p1 operados | p5 operados | CVaR5 operados | 20 peores |");
console.log("|---|---|---|---|---|---|---|");

const reglas = JSON.parse(readFileSync("scripts/parar-y-volver.json", "utf8")).reglas;
// se reconstruyen las 6 más relevantes para poder re-medir sobre días operados
function opA(d, x) { const o = new Array(N).fill(true); let b = 0; for (let i = 0; i < N; i++) { if (b > 0) { o[i] = false; b--; continue; } if (PL[i] < -x) b = d; } return o; }
function opB(u) { return filas.map((f) => !(f.vix != null && f.vix > u)); }
function opC(x) { const o = new Array(N).fill(true); let m = null, a = 0, p = false; for (let i = 0; i < N; i++) { const mm = filas[i].fecha.slice(0, 7); if (mm !== m) { m = mm; a = 0; p = false; } if (p) { o[i] = false; continue; } a += PL[i]; if (a < -x) p = true; } return o; }
function opD(n, m) { const o = new Array(N).fill(true); let s = 0, b = 0; for (let i = 0; i < N; i++) { if (b > 0) { o[i] = false; b--; continue; } if (PL[i] < 0) s++; else s = 0; if (s >= n) { b = m; s = 0; } } return o; }
// el VIX viene de anatomia3-lib en el otro script; aquí se recarga igual
const V = JSON.parse(readFileSync("scripts/cache-theta/vol-indices/VIX.json", "utf8"));
const ksV = Object.keys(V).sort();
for (const f of filas) { const d = f.fecha.replace(/-/g, ""); const p = ksV.filter((k) => k < d); f.vix = p.length ? V[p[p.length - 1]] : null; }
radiografia(filas, ["pl", "vix"], "días + VIX de ayer", { maxCeros: 0.2 });

const SEIS = [
  ["BASE (sin parar)", new Array(N).fill(true)],
  ["C·mes −$2000", opC(2000)],
  ["C·mes −$3000", opC(3000)],
  ["B·VIX>17", opB(17)],
  ["A·5d tras −$500", opA(5, 500)],
  ["D·3 malos→1d", opD(3, 1)],
];
for (const [nom, op] of SEIS) {
  const o = PL.filter((_, i) => op[i]).sort((a, b) => a - b);
  console.log(`| ${nom} | ${o.length} | ${eur(o[0])} | ${eur(pct(o, 0.01))} | ${eur(pct(o, 0.05))} | ${eur(media(o.slice(0, Math.max(1, Math.floor(o.length * 0.05)))))} | ${eur(o.slice(0, 20).reduce((a, b) => a + b, 0))} |`);
}

console.log(`\n${"═".repeat(110)}`);
console.log("  2 · EL MECANISMO — ¿se agrupan las pérdidas? Toda regla de parada apuesta a que sí.");
console.log(`${"═".repeat(110)}\n`);
console.log("  Si tras un día malo el siguiente no es peor que un día cualquiera, parar no puede");
console.log("  funcionar: se está apagando la máquina a ciegas.\n");
console.log("| tras un día de… | n | media del DÍA SIGUIENTE | media de los 5 siguientes | P(pérdida >$2.000 mañana) | tasa base |");
console.log("|---|---|---|---|---|---|");
const baseGrande = PL.filter((p) => p < -2000).length / N;
for (const [nom, test] of [
  ["pérdida > $500", (p) => p < -500], ["pérdida > $1.000", (p) => p < -1000],
  ["pérdida > $2.000", (p) => p < -2000], ["pérdida > $3.000", (p) => p < -3000],
  ["pérdida MÁXIMA (>$4.500)", (p) => p < -4500], ["ganancia (cualquiera)", (p) => p > 0],
]) {
  const idx = []; for (let i = 0; i < N - 1; i++) if (test(PL[i])) idx.push(i);
  if (idx.length < 5) { console.log(`| ${nom} | ${idx.length} | — muestra corta — | | | |`); continue; }
  const sig = idx.map((i) => PL[i + 1]);
  const cinco = idx.map((i) => media(PL.slice(i + 1, i + 6))).filter((x) => isFinite(x));
  const pGrande = sig.filter((p) => p < -2000).length / sig.length;
  console.log(`| ${nom} | ${idx.length} | ${eur(media(sig))} | ${eur(media(cinco))} | ${(pGrande * 100).toFixed(1)}% | ${(baseGrande * 100).toFixed(1)}% |`);
}
// autocorrelación cruda del P&L diario
const ac = (k) => { const a = PL.slice(0, N - k), b = PL.slice(k); const ma = media(a), mb = media(b); return a.reduce((s, x, i) => s + (x - ma) * (b[i] - mb), 0) / ((a.length - 1) * sd(a) * sd(b)); };
console.log(`\n  Autocorrelación del P&L diario:  ${[1, 2, 3, 5, 10].map((k) => `r(${k}) = ${ac(k).toFixed(3)}`).join(" · ")}`);
console.log(`  (con n=${N}, el error típico de una correlación nula es ±${(1 / Math.sqrt(N)).toFixed(3)} — todo lo de arriba cabe dentro)`);

// rachas de perdedores: ¿hay más de las que da el azar?
let obs = new Map(), cur = 0;
for (const p of PL) { if (p < 0) cur++; else { if (cur) obs.set(cur, (obs.get(cur) ?? 0) + 1); cur = 0; } }
if (cur) obs.set(cur, (obs.get(cur) ?? 0) + 1);
const q = PL.filter((p) => p < 0).length / N;
console.log(`\n  RACHAS DE DÍAS PERDEDORES · tasa de pérdida ${(q * 100).toFixed(1)}%\n`);
console.log("| largo de la racha | observadas | esperadas si fuera moneda | ");
console.log("|---|---|---|");
for (let L = 1; L <= 5; L++) console.log(`| ${L} día(s) | ${obs.get(L) ?? 0} | ${(N * q ** L * (1 - q) ** 2).toFixed(1)} |`);

console.log(`\n${"═".repeat(110)}`);
console.log("  3 · DE QUÉ ESTÁ HECHA LA PEOR RACHA de −$15.176");
console.log(`${"═".repeat(110)}\n`);
let acc = 0, pico = 0, peor = 0, iPico = 0, iValle = 0, iPicoCur = 0;
for (let i = 0; i < N; i++) { acc += PL[i]; if (acc > pico) { pico = acc; iPicoCur = i; } if (acc - pico < peor) { peor = acc - pico; iPico = iPicoCur; iValle = i; } }
const tramo = PL.slice(iPico + 1, iValle + 1);
const ordT = [...tramo].sort((a, b) => a - b);
console.log(`  Del ${filas[iPico].fecha} al ${filas[iValle].fecha} · ${tramo.length} días de mercado`);
console.log(`  suma ${eur(tramo.reduce((a, b) => a + b, 0))} · ${tramo.filter((x) => x < 0).length} días perdedores de ${tramo.length}`);
console.log(`  los 3 peores días del tramo: ${ordT.slice(0, 3).map(eur).join(" · ")} — suman ${eur(ordT.slice(0, 3).reduce((a, b) => a + b, 0))}`);
console.log(`  el resto del tramo (${tramo.length - 3} días) suma ${eur(tramo.reduce((a, b) => a + b, 0) - ordT.slice(0, 3).reduce((a, b) => a + b, 0))}`);
const fechasPeores = tramo.map((p, j) => ({ p, f: filas[iPico + 1 + j].fecha })).sort((a, b) => a.p - b.p).slice(0, 5);
console.log(`  fechas: ${fechasPeores.map((x) => `${x.f} ${eur(x.p)}`).join(" · ")}`);
console.log(`\n  Los 10 peores días de TODO el período: ${[...PL].sort((a, b) => a - b).slice(0, 10).map(eur).join(" · ")}`);
console.log(`  suman ${eur([...PL].sort((a, b) => a - b).slice(0, 10).reduce((a, b) => a + b, 0))} contra ${eur(PL.reduce((a, b) => a + b, 0))} de beneficio total.`);

console.log(`\n${"═".repeat(110)}`);
console.log("  4 · EL PUENTE — el peor día no lo mueve el calendario: lo mueve el ANCHO DE LAS ALAS");
console.log(`${"═".repeat(110)}\n`);
console.log("  Mismos 653 días, misma entrada a las 11:00, mismos ±25 puntos, BID al vender y ASK al");
console.log("  comprar. Lo único que cambia es a cuántos puntos se compran las alas.\n");

const DIR = "scripts/cache-theta/gex-2026", HORA = "11:00", COMM = 0.03;
function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = ["strike", "timestamp", "bid", "ask", "underlying_price"].map((c) => cab.indexOf(c));
  if (idx.some((x) => x < 0)) throw new Error("faltan columnas en " + f);
  const [iK, iT, iB, iA, iU] = idx;
  const enHora = []; let spotFin = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(","), hora = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && hora >= hFin) { hFin = hora; spotFin = sp; }
    if (hora !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask, spot: sp });
  }
  return enHora.length ? { filas: enHora, cierre: spotFin } : null;
}
const cerca = (fs, o) => fs.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));
const fechas = filas.map((f) => f.fecha);

const porAla = {};
for (const ALA of [50, 40, 30, 20]) porAla[ALA] = [];
let leidos = 0;
for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P || !(C.cierre > 0)) continue;
  const spot = C.filas[0].spot; if (!(spot > 0)) continue;
  leidos++;
  const cC = cerca(C.filas, spot + 25), pC = cerca(P.filas, spot - 25);
  for (const ALA of [50, 40, 30, 20]) {
    const cL = cerca(C.filas, cC.K + ALA), pL = cerca(P.filas, pC.K - ALA);
    if (cL.K <= cC.K || pL.K >= pC.K) continue;
    const cred = cC.bid + pC.bid - cL.ask - pL.ask;
    if (!(cred > 0)) continue;
    const S = C.cierre;
    const pl = (cred - Math.min(Math.max(S - cC.K, 0), cL.K - cC.K)
                     - Math.min(Math.max(pC.K - S, 0), pC.K - pL.K)) * 100 - 8 * COMM;
    porAla[ALA].push({ fecha, pl, riesgo: (Math.max(cL.K - cC.K, pC.K - pL.K) - cred) * 100 });
  }
}
console.log(`  días leídos de las cadenas: ${leidos} de ${fechas.length}\n`);
console.log("| alas | días con cóndor | $/año | peor día | p1 | p5 | CVaR5 | PEOR RACHA | riesgo máx (colateral) | $/año por cada $1.000 de riesgo |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
const salidaAla = {};
for (const ALA of [50, 40, 30, 20]) {
  const g = porAla[ALA]; if (!g.length) continue;
  const pl = g.map((x) => x.pl), o = [...pl].sort((a, b) => a - b);
  const anos = g.length / 252;
  const alAno = pl.reduce((a, b) => a + b, 0) / anos;
  const riesgo = pct(g.map((x) => x.riesgo), 0.5);
  const dd = drawdown(pl);
  salidaAla[ALA] = { n: g.length, alAno, peor: o[0], p1: pct(o, 0.01), p5: pct(o, 0.05), cvar5: media(o.slice(0, Math.max(1, Math.floor(o.length * 0.05)))), dd, riesgo, porRiesgo: (alAno / riesgo) * 1000 };
  const s = salidaAla[ALA];
  console.log(`| ${ALA} pts | ${g.length} | ${eur(alAno)} | ${eur(s.peor)} | ${eur(s.p1)} | ${eur(s.p5)} | ${eur(s.cvar5)} | ${eur(dd)} | ${eur(riesgo)} | ${eur(s.porRiesgo)} |`);
}
// A IGUAL RIESGO: cuántos contratos del ala estrecha caben en el mismo colateral que 1 del ala 50
console.log("\n  A IGUAL COLATERAL — cuántos contratos del ala estrecha caben donde va 1 de ala 50, y qué sale:\n");
console.log("| alas | contratos a igual colateral | $/año | peor día | PEOR RACHA |");
console.log("|---|---|---|---|---|");
const r50 = salidaAla[50].riesgo;
for (const ALA of [50, 40, 30, 20]) {
  const s = salidaAla[ALA]; if (!s) continue;
  const k = r50 / s.riesgo;
  const pl = porAla[ALA].map((x) => x.pl * k);
  console.log(`| ${ALA} pts | ${k.toFixed(2)}× | ${eur(s.alAno * k)} | ${eur(s.peor * k)} | ${eur(drawdown(pl))} |`);
}

writeFileSync("scripts/parar-y-volver-porque.json", JSON.stringify({ alas: salidaAla, base: { alAno: BASEANO, dd: BASEDD } }, null, 2), "utf8");
console.log("\n  detalle en scripts/parar-y-volver-porque.json");
