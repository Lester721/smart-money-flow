// ANATOMÍA 2 · ¿CUÁNTO PESAN LOS PEORES DÍAS DEL CÓNDOR 0DTE?
//
// ═══ QUÉ PREGUNTA CONTESTA ════════════════════════════════════════════════════════════════════
// Los 17 filtros de régimen y las 30 reglas de gestión se midieron contra la MEDIA. Nadie ha
// mirado la COLA. Aquí no se busca subir el ingreso: se busca saber DE QUÉ ESTÁ HECHA la caída,
// porque un desplome y una sangría lenta se arreglan de formas distintas.
//
//   1. Qué fracción de la pérdida bruta aportan los 5, 10, 20 y 50 peores días.
//   2. Cuánto sería el ingreso anual si esos días no existieran (contrafáctico, NO estrategia).
//   3. Si vienen en racimos o sueltos — y esto se mide contra el AZAR, no a ojo.
//   4. La peor racha: qué días la componen, cuánto dura, y si es desplome o sangría.
//
// ═══ REGLAS ═══════════════════════════════════════════════════════════════════════════════════
// · El P&L viene de scripts/regimen-filas.json, construido con bid/ask REALES a las 11:00 y
//   liquidado contra el cierre real de las 16:00. Aquí se RE-VERIFICAN 8 días contra las cadenas
//   crudas antes de medir nada: una caché rancia se lee igual que una buena.
// · El ingreso anual SIEMPRE se divide entre los MISMOS 2,59 años de calendario, opere o no.
//   Dividir entre los días operados infla al que salta días. Ese es el truco clásico.
// · Todo filtro se compara contra QUITAR LOS MISMOS DÍAS AL AZAR. Quitar el 15% de los días al
//   azar ya recorta la peor racha: sin ese control, cualquier regla "funciona".
//
// PRUEBAS DECLARADAS DE ANTEMANO: 6 (ver LISTA_PRUEBAS abajo). El divisor no se toca.

import { readFileSync, existsSync, readdirSync } from "node:fs";
import { listonT, tWelch } from "../lib/barreraHallazgos";
import { radiografia } from "../lib/radiografia";

const CACHE = "scripts/regimen-filas.json";
const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00", ALA = 50, SEP = 25, COMM = 0.03;
const DIAS_ANO = 252;

const PRUEBAS = 6;
const LISTA_PRUEBAS = [
  "1. ¿Los peores 20 días vienen en racimos? (permutación de posiciones)",
  "2. Autocorrelación lag-1 del P&L diario",
  "3. Regla: saltar 1 día tras una pérdida ≥ $1.000",
  "4. Regla: saltar 2 días tras una pérdida ≥ $1.000",
  "5. Regla: saltar 5 días tras una pérdida ≥ $1.000",
  "6. Regla: saltar 1 día tras CUALQUIER día perdedor",
];
const LISTON = listonT(PRUEBAS);

const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const pct = (x) => (x * 100).toFixed(1) + "%";
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };

// ═══ 0 · CARGA Y RE-VERIFICACIÓN CONTRA LAS CADENAS CRUDAS ═══════════════════════════════════
const filas = JSON.parse(readFileSync(CACHE, "utf8")).sort((a, b) => a.fecha.localeCompare(b.fecha));
if (filas.length !== 653) throw new Error("esperaba 653 días, hay " + filas.length);

// EL GUARDIÁN: un campo muerto se lee como cero y se mide durante horas sin enterarse.
radiografia(filas, ["pl", "credito", "cierre", "ap", "sp11", "sigma"], "días del cóndor", { maxCeros: 0.2 });

function leerDia(fecha, right) {
  const f = DIR + "/iv_" + fecha + "_" + right + ".csv";
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = ["strike", "timestamp", "bid", "ask", "implied_vol", "underlying_price"].map((c) => cab.indexOf(c));
  if (idx.some((x) => x < 0)) throw new Error("faltan columnas en " + f);
  const [iK, iT, iB, iA, iV, iU] = idx;
  const enHora = [], camino = new Map();
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    const h = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0) camino.set(h, sp);
    if (h !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]), iv = Number(c[iV]);
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask, iv });
  }
  return enHora.length ? { filas: enHora, camino } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

function recalcular(fecha) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P) return null;
  const horas = [...C.camino.keys()].sort();
  const cierre = C.camino.get(horas[horas.length - 1]), sp11 = C.camino.get(HORA);
  const cC = cerca(C.filas, sp11 + SEP), pC = cerca(P.filas, sp11 - SEP);
  const cL = cerca(C.filas, cC.K + ALA), pL = cerca(P.filas, pC.K - ALA);
  const cred = cC.bid + pC.bid - cL.ask - pL.ask;
  const pl = (cred - Math.min(Math.max(cierre - cC.K, 0), cL.K - cC.K)
                   - Math.min(Math.max(pC.K - cierre, 0), pC.K - pL.K)) * 100 - 8 * COMM;
  return { pl, cierre, sp11, strikes: [pL.K, pC.K, cC.K, cL.K] };
}

console.log("═".repeat(100));
console.log("  ANATOMÍA 2 · ¿CUÁNTO PESAN LOS PEORES DÍAS?   ·   " + filas.length + " días · " + filas[0].fecha + " → " + filas[filas.length - 1].fecha);
console.log("═".repeat(100));

console.log("\n## 0 · RE-VERIFICACIÓN de la caché contra las cadenas crudas (8 días: 4 peores + 4 al azar)\n");
const ordPeor = [...filas].sort((a, b) => a.pl - b.pl);
const muestraVerif = [...ordPeor.slice(0, 4).map((f) => f.fecha), filas[100].fecha, filas[250].fecha, filas[400].fecha, filas[600].fecha];
console.log("| fecha | pl en caché | pl recalculado | Δ | strikes recalculados |");
console.log("|---|---|---|---|---|");
let maxDelta = 0;
for (const fecha of muestraVerif) {
  const cach = filas.find((f) => f.fecha === fecha);
  const r = recalcular(fecha);
  if (!r) { console.log("| " + fecha + " | " + eur(cach.pl) + " | **SIN CADENA** | — | — |"); continue; }
  const d = Math.abs(r.pl - cach.pl);
  maxDelta = Math.max(maxDelta, d);
  console.log("| " + fecha + " | " + eur(cach.pl) + " | " + eur(r.pl) + " | " + d.toFixed(4) + " | " + r.strikes.join(" / ") + " |");
}
if (maxDelta > 0.01) throw new Error("la caché NO reproduce las cadenas crudas (Δ máx " + maxDelta.toFixed(2) + "). Se para aquí.");
console.log("\n→ Δ máximo " + maxDelta.toFixed(6) + ". La caché reproduce las cadenas exactamente.\n");

// ═══ 1 · LOS NÚMEROS DE PARTIDA ══════════════════════════════════════════════════════════════
const pls = filas.map((f) => f.pl);
const TOTAL = pls.reduce((a, b) => a + b, 0);
const ANOS = filas.length / DIAS_ANO;
const AL_ANO = TOTAL / ANOS;
const GANANCIA_BRUTA = pls.filter((x) => x > 0).reduce((a, b) => a + b, 0);
const PERDIDA_BRUTA = pls.filter((x) => x < 0).reduce((a, b) => a + b, 0);   // negativo
const ACIERTO = pls.filter((x) => x > 0).length / pls.length;

/** Curva acumulada sobre el CALENDARIO COMPLETO. Los días saltados suman 0, no desaparecen. */
function curva(plPorFecha) {
  let acc = 0; const c = [];
  for (const f of filas) { acc += (plPorFecha.get(f.fecha) ?? 0); c.push({ fecha: f.fecha, acc }); }
  return c;
}
/** Peor racha acumulada: máxima caída pico-a-valle. Devuelve también los días que la componen. */
function peorRacha(c) {
  let pico = 0, picoFecha = filas[0].fecha, picoIdx = -1, peor = 0, ini = null, fin = null, iniIdx = 0, finIdx = 0;
  for (let i = 0; i < c.length; i++) {
    if (c[i].acc > pico) { pico = c[i].acc; picoFecha = c[i].fecha; picoIdx = i; }
    const dd = c[i].acc - pico;
    if (dd < peor) { peor = dd; ini = picoFecha; fin = c[i].fecha; iniIdx = picoIdx; finIdx = i; }
  }
  return { peor, ini, fin, iniIdx, finIdx, dias: finIdx - iniIdx };
}
function metricas(fechasOperadas) {
  const set = new Set(fechasOperadas);
  const m = new Map(filas.filter((f) => set.has(f.fecha)).map((f) => [f.fecha, f.pl]));
  const v = [...m.values()];
  const tot = v.reduce((a, b) => a + b, 0);
  const ord = [...v].sort((a, b) => a - b);
  const q = (p) => ord[Math.max(0, Math.min(ord.length - 1, Math.floor(ord.length * p)))];
  const r = peorRacha(curva(m));
  return {
    n: v.length, total: tot, alAno: tot / ANOS, media: tot / v.length,
    peorDia: ord[0], p1: q(0.01), p5: q(0.05),
    dd: r.peor, ddDias: r.dias, ddIni: r.ini, ddFin: r.fin,
    acierto: v.filter((x) => x > 0).length / v.length,
  };
}
const BASE = metricas(filas.map((f) => f.fecha));

console.log("## 1 · EL PUNTO DE PARTIDA\n");
console.log("| magnitud | valor |");
console.log("|---|---|");
console.log("| días operados | " + BASE.n + " (" + ANOS.toFixed(2) + " años de calendario) |");
console.log("| P&L acumulado | **" + eur(BASE.total) + "** |");
console.log("| por operación | " + eur(BASE.media) + " |");
console.log("| **al año** | **" + eur(BASE.alAno) + "** |");
console.log("| acierto | " + pct(ACIERTO) + " |");
console.log("| ganancia bruta (días verdes) | " + eur(GANANCIA_BRUTA) + " |");
console.log("| pérdida bruta (días rojos) | " + eur(PERDIDA_BRUTA) + " |");
console.log("| peor día | **" + eur(BASE.peorDia) + "** |");
console.log("| percentil 1 | " + eur(BASE.p1) + " |");
console.log("| percentil 5 | " + eur(BASE.p5) + " |");
console.log("| peor racha acumulada | **" + eur(BASE.dd) + "** (" + BASE.ddIni + " → " + BASE.ddFin + ", " + BASE.ddDias + " sesiones) |");

// ═══ 2 · CUÁNTO PESAN LOS N PEORES ═══════════════════════════════════════════════════════════
console.log("\n\n## 2 · ¿CUÁNTO PESAN LOS PEORES DÍAS?\n");
console.log("Contrafáctico: se BORRAN los N peores días (P&L = 0 ese día) y se recalcula todo.");
console.log("**Esto NO es una estrategia** — nadie sabe a las 11:00 cuáles son. Es la talla del premio.\n");
console.log("| N peores | suma de esos N | % de la pérdida bruta | % del P&L total | P&L restante | al año | peor día nuevo | peor racha nueva |");
console.log("|---|---|---|---|---|---|---|---|");
const CONTRAF = {};
for (const N of [1, 5, 10, 20, 50]) {
  const peores = ordPeor.slice(0, N);
  const suma = peores.reduce((a, f) => a + f.pl, 0);
  const quitar = new Set(peores.map((f) => f.fecha));
  const m = metricas(filas.filter((f) => !quitar.has(f.fecha)).map((f) => f.fecha));
  CONTRAF[N] = { suma, ...m };
  console.log("| " + N + " (" + pct(N / filas.length) + " de días) | " + eur(suma) + " | **" + pct(suma / PERDIDA_BRUTA) + "** | " +
    pct(Math.abs(suma) / TOTAL) + " | " + eur(m.total) + " | **" + eur(m.alAno) + "** | " + eur(m.peorDia) + " | " + eur(m.dd) + " |");
}
console.log("\n**Lectura:** " + eur(-ordPeor.slice(0, 20).reduce((a, f) => a + f.pl, 0)) + " de pérdida vive en 20 días de 653.");
console.log("Si esos 20 no existieran el ingreso pasa de " + eur(BASE.alAno) + " a " + eur(CONTRAF[20].alAno) + " al año, ×" + (CONTRAF[20].alAno / BASE.alAno).toFixed(2) + ".");

console.log("\n### El otro lado: ¿también las ganancias viven en pocos días?\n");
const ordMejor = [...filas].sort((a, b) => b.pl - a.pl);
console.log("| N mejores | suma | % de la ganancia bruta |");
console.log("|---|---|---|");
for (const N of [5, 10, 20, 50]) {
  const s = ordMejor.slice(0, N).reduce((a, f) => a + f.pl, 0);
  console.log("| " + N + " | " + eur(s) + " | " + pct(s / GANANCIA_BRUTA) + " |");
}

console.log("\n### La lista de los 20 peores días\n");
console.log("| # | fecha | día | P&L | crédito cobrado | movimiento 11:00→cierre | ¿en σ? | σ del día |");
console.log("|---|---|---|---|---|---|---|---|");
const DOW = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
ordPeor.slice(0, 20).forEach((f, i) => {
  const mov = f.cierre - f.sp11;
  console.log("| " + (i + 1) + " | " + f.fecha + " | " + DOW[f.dow] + " | **" + eur(f.pl) + "** | " + eur(f.credito) + " | " +
    (mov >= 0 ? "+" : "−") + Math.abs(mov).toFixed(1) + " pts | " + (f.sigma ? (mov / f.sigma).toFixed(2) + "σ" : "—") + " | " +
    (f.sigma ? f.sigma.toFixed(1) : "—") + " |");
});

// ═══ 3 · ¿RACIMOS O SUELTOS? ═════════════════════════════════════════════════════════════════
console.log("\n\n## 3 · ¿VIENEN EN RACIMOS O SUELTOS?\n");
const idxPorFecha = new Map(filas.map((f, i) => [f.fecha, i]));
const pos20 = ordPeor.slice(0, 20).map((f) => idxPorFecha.get(f.fecha)).sort((a, b) => a - b);
const pos50 = ordPeor.slice(0, 50).map((f) => idxPorFecha.get(f.fecha)).sort((a, b) => a - b);

/** Nº de pares dentro de V sesiones. Es el estadístico de agrupamiento. */
const paresCerca = (pos, V) => { let c = 0; for (let i = 0; i < pos.length; i++) for (let j = i + 1; j < pos.length; j++) if (pos[j] - pos[i] <= V) c++; return c; };
/** Nº de días distintos cubiertos por al menos otro peor día a ≤V sesiones. */
const conVecino = (pos, V) => pos.filter((p, i) => pos.some((q, j) => j !== i && Math.abs(q - p) <= V)).length;

// PRUEBA 1 · permutación: ¿el agrupamiento supera al azar?
function permutacion(k, V, reps = 20000) {
  const obs = paresCerca(k === 20 ? pos20 : pos50, V);
  let mayores = 0; const nulos = [];
  for (let r = 0; r < reps; r++) {
    const s = new Set();
    while (s.size < k) s.add(Math.floor(Math.random() * filas.length));
    const p = [...s].sort((a, b) => a - b);
    const c = paresCerca(p, V);
    nulos.push(c);
    if (c >= obs) mayores++;
  }
  return { obs, p: (mayores + 1) / (reps + 1), mediaNula: media(nulos), sdNula: sd(nulos) };
}
console.log("Estadístico = nº de PARES de peores días separados por ≤ V sesiones. Se compara contra");
console.log("20.000 sorteos de los mismos 20 (o 50) días colocados al azar sobre las 653 sesiones.\n");
console.log("| conjunto | ventana V | pares observados | pares esperados al azar | z | p (una cola) |");
console.log("|---|---|---|---|---|---|");
const permRes = {};
for (const [k, V] of [[20, 1], [20, 3], [20, 5], [20, 10], [50, 5], [50, 10]]) {
  const r = permutacion(k, V);
  permRes[k + "_" + V] = r;
  const z = r.sdNula > 0 ? (r.obs - r.mediaNula) / r.sdNula : 0;
  console.log("| " + k + " peores | ≤" + V + " sesiones | " + r.obs + " | " + r.mediaNula.toFixed(1) + " | " + z.toFixed(2) + " | " +
    r.p.toFixed(4) + (r.p < 0.05 / PRUEBAS ? " ✓" : "") + " |");
}
console.log("\n| descripción | 20 peores | 50 peores |");
console.log("|---|---|---|");
for (const V of [1, 2, 5, 10]) {
  console.log("| días con otro peor día a ≤" + V + " sesiones | " + conVecino(pos20, V) + " de 20 (" + pct(conVecino(pos20, V) / 20) + ") | " +
    conVecino(pos50, V) + " de 50 (" + pct(conVecino(pos50, V) / 50) + ") |");
}
// huecos
const huecos20 = pos20.slice(1).map((p, i) => p - pos20[i]);
console.log("\nHuecos entre peores días consecutivos (20 peores): mediana " + [...huecos20].sort((a, b) => a - b)[Math.floor(huecos20.length / 2)] +
  " sesiones · mínimo " + Math.min(...huecos20) + " · máximo " + Math.max(...huecos20) + " · esperado al azar ≈ " + (filas.length / 20).toFixed(0));

console.log("\n### Reparto por mes de calendario (20 y 50 peores)\n");
const porMes = new Map();
for (const f of filas) { const m = f.fecha.slice(0, 7); if (!porMes.has(m)) porMes.set(m, { n: 0, p20: 0, p50: 0, pl: 0 }); const x = porMes.get(m); x.n++; x.pl += f.pl; }
const set20 = new Set(ordPeor.slice(0, 20).map((f) => f.fecha)), set50 = new Set(ordPeor.slice(0, 50).map((f) => f.fecha));
for (const f of filas) { const x = porMes.get(f.fecha.slice(0, 7)); if (set20.has(f.fecha)) x.p20++; if (set50.has(f.fecha)) x.p50++; }
const mesesConPeores = [...porMes.entries()].filter(([, x]) => x.p20 > 0).sort((a, b) => b[1].p20 - a[1].p20);
console.log("| mes | sesiones | peores-20 en el mes | peores-50 | P&L del mes |");
console.log("|---|---|---|---|---|");
for (const [m, x] of mesesConPeores) console.log("| " + m + " | " + x.n + " | **" + x.p20 + "** | " + x.p50 + " | " + eur(x.pl) + " |");
console.log("\n→ " + mesesConPeores.length + " meses distintos concentran los 20 peores días, de " + porMes.size + " meses en total.");

// PRUEBA 2 · autocorrelación lag-1
const a1 = pls.slice(0, -1), a2 = pls.slice(1);
const m1 = media(a1), m2 = media(a2);
const cov = a1.reduce((a, x, i) => a + (x - m1) * (a2[i] - m2), 0) / (a1.length - 1);
const rho1 = cov / (sd(a1) * sd(a2));
const tRho = rho1 * Math.sqrt((a1.length - 2) / (1 - rho1 * rho1));
console.log("\n### PRUEBA 2 · autocorrelación lag-1 del P&L diario\n");
console.log("ρ₁ = " + rho1.toFixed(4) + " · t = " + tRho.toFixed(2) + " · listón " + LISTON + " → " + (Math.abs(tRho) >= LISTON ? "PASA" : "**no pasa**"));
// P&L del día siguiente a una pérdida grande
for (const U of [500, 1000, 2000]) {
  const trasMalo = [], resto = [];
  for (let i = 1; i < filas.length; i++) (filas[i - 1].pl <= -U ? trasMalo : resto).push(filas[i].pl);
  console.log("  · día DESPUÉS de una pérdida ≥ " + eur(U) + ": media " + eur(media(trasMalo)) + " (n=" + trasMalo.length +
    ") vs " + eur(media(resto)) + " el resto · t=" + tWelch(trasMalo, resto).toFixed(2));
}

// ── 3b · ¿LA CONCENTRACIÓN VIVE EN UN SOLO PERÍODO? ─────────────────────────────────────────
console.log("\n### 3b · La concentración de la cola, tercio a tercio del período\n");
const k3t = Math.floor(filas.length / 3);
const TERCIOS = [filas.slice(0, k3t), filas.slice(k3t, 2 * k3t), filas.slice(2 * k3t)];
console.log("| tercio | n | P&L | pérdida bruta | 5 peores del tercio | % de la pérdida | al año | al año SIN sus 7 peores | × |");
console.log("|---|---|---|---|---|---|---|---|---|");
const signosTercio = [];
for (const t of TERCIOS) {
  const pb = t.filter((f) => f.pl < 0).reduce((a, f) => a + f.pl, 0);
  const tot = t.reduce((a, f) => a + f.pl, 0), anos = t.length / DIAS_ANO;
  const ord5 = [...t].sort((a, b) => a.pl - b.pl);
  const p5s = ord5.slice(0, 5).reduce((a, f) => a + f.pl, 0);
  const sin7 = ord5.slice(7).reduce((a, f) => a + f.pl, 0);
  signosTercio.push(sin7 > tot ? "+" : "−");
  console.log("| " + t[0].fecha + "→" + t[t.length - 1].fecha + " | " + t.length + " | " + eur(tot) + " | " + eur(pb) + " | " + eur(p5s) +
    " | " + pct(p5s / pb) + " | " + eur(tot / anos) + " | **" + eur(sin7 / anos) + "** | ×" + (sin7 / tot).toFixed(2) + " |");
}
console.log("\n→ signo por tercios del contrafáctico (quitar los 7 peores de cada tercio): **" + signosTercio.join("") + "**");

// ═══ 4 · LA PEOR RACHA, POR DENTRO ═══════════════════════════════════════════════════════════
console.log("\n\n## 4 · LA PEOR RACHA POR DENTRO — ¿desplome o sangría?\n");
const cBase = curva(new Map(filas.map((f) => [f.fecha, f.pl])));
const R = peorRacha(cBase);
const tramo = filas.slice(R.iniIdx + 1, R.finIdx + 1);
console.log("Peor racha: **" + eur(R.peor) + "**, de " + R.ini + " (pico) a " + R.fin + " (valle) — **" + tramo.length + " sesiones**.\n");
const tramoOrd = [...tramo].sort((a, b) => a.pl - b.pl);
const negTramo = tramo.filter((f) => f.pl < 0);
console.log("| magnitud | valor |");
console.log("|---|---|");
console.log("| sesiones en la racha | " + tramo.length + " |");
console.log("| días verdes / rojos dentro | " + (tramo.length - negTramo.length) + " / " + negTramo.length + " (acierto " + pct((tramo.length - negTramo.length) / tramo.length) + " vs " + pct(ACIERTO) + " normal) |");
console.log("| suma de los días rojos | " + eur(negTramo.reduce((a, f) => a + f.pl, 0)) + " |");
console.log("| suma de los días verdes | " + eur(tramo.filter((f) => f.pl > 0).reduce((a, f) => a + f.pl, 0)) + " |");
console.log("| el PEOR día de la racha | " + eur(tramoOrd[0].pl) + " (" + tramoOrd[0].fecha + ") = " + pct(tramoOrd[0].pl / R.peor) + " de la racha |");
console.log("| los 3 peores días de la racha | " + eur(tramoOrd.slice(0, 3).reduce((a, f) => a + f.pl, 0)) + " = **" + pct(tramoOrd.slice(0, 3).reduce((a, f) => a + f.pl, 0) / R.peor) + "** de la racha |");
console.log("| los 5 peores días de la racha | " + eur(tramoOrd.slice(0, 5).reduce((a, f) => a + f.pl, 0)) + " = " + pct(tramoOrd.slice(0, 5).reduce((a, f) => a + f.pl, 0) / R.peor) + " de la racha |");
console.log("| sesiones para tocar fondo desde el pico | " + tramo.length + " |");
let recup = null;
for (let i = R.finIdx + 1; i < cBase.length; i++) if (cBase[i].acc >= cBase[R.iniIdx].acc) { recup = i - R.finIdx; break; }
console.log("| sesiones para recuperar el pico | " + (recup === null ? "**AÚN NO RECUPERADO** al " + filas[filas.length - 1].fecha : recup) + " |");

console.log("\n### Día a día de la peor racha\n");
console.log("| fecha | día | P&L | acumulado desde el pico | crédito | mov 11:00→cierre |");
console.log("|---|---|---|---|---|---|");
let accR = 0;
for (const f of tramo) {
  accR += f.pl;
  const mov = f.cierre - f.sp11;
  console.log("| " + f.fecha + " | " + DOW[f.dow] + " | " + (f.pl < -500 ? "**" + eur(f.pl) + "**" : eur(f.pl)) + " | " + eur(accR) + " | " +
    eur(f.credito) + " | " + (mov >= 0 ? "+" : "−") + Math.abs(mov).toFixed(1) + " |");
}

// ── 4b · ¿TOPE MECÁNICO O CONTINUO? ──────────────────────────────────────────────────────────
// La pérdida máxima posible del cóndor es (ala × 100 − crédito). Si los peores días están TODOS
// pegados a ese tope, la cola no es una distribución: es un tope, y se mueve moviendo el ala.
console.log("\n\n### 4b · ¿La cola es un TOPE MECÁNICO o un continuo?\n");
console.log("Pérdida máxima del cóndor = ala(50) × 100 − crédito = $5.000 − crédito.\n");
for (const f of filas) { f.perdidaMax = -(ALA * 100 - f.credito) - 8 * COMM; f.pegado = f.pl <= f.perdidaMax + 1; }
const pegados = filas.filter((x) => x.pegado);
console.log("| conjunto | días al TOPE (ala rota entera) | % |");
console.log("|---|---|---|");
console.log("| los 653 días | " + pegados.length + " | " + pct(pegados.length / filas.length) + " |");
for (const N of [5, 10, 20, 50]) {
  const s = ordPeor.slice(0, N).filter((x) => x.pegado).length;
  console.log("| los " + N + " peores | " + s + " | " + pct(s / N) + " |");
}
console.log("\n| magnitud | valor |");
console.log("|---|---|");
console.log("| pérdida de los días al TOPE | " + eur(pegados.reduce((a, f) => a + f.pl, 0)) + " = " + pct(pegados.reduce((a, f) => a + f.pl, 0) / PERDIDA_BRUTA) + " de la pérdida bruta |");
console.log("| crédito medio de los días al TOPE | " + eur(media(pegados.map((f) => f.credito))) + " (vs " + eur(media(filas.map((f) => f.credito))) + " en general) |");
console.log("| peor día POSIBLE con el crédito de cada día | mediana " + eur([...filas.map((f) => f.perdidaMax)].sort((a, b) => a - b)[Math.floor(filas.length / 2)]) + " · el más hondo " + eur(Math.min(...filas.map((f) => f.perdidaMax))) + " |");

// ── 4c · DESGLOSE DE LA PÉRDIDA POR TAMAÑO ───────────────────────────────────────────────────
console.log("\n### 4c · ¿La pérdida bruta es sangría o desplome? (desglose por tamaño del día rojo)\n");
const CUBOS = [[0, 250], [250, 500], [500, 1000], [1000, 2000], [2000, 3000], [3000, 5000]];
console.log("| tamaño del día rojo | nº de días | suma | % de la pérdida bruta | dentro de la peor racha |");
console.log("|---|---|---|---|---|");
const enRacha = new Set(filas.slice(R.iniIdx + 1, R.finIdx + 1).map((f) => f.fecha));
for (const [lo, hi] of CUBOS) {
  const g = filas.filter((f) => f.pl < 0 && -f.pl >= lo && -f.pl < hi);
  const s = g.reduce((a, f) => a + f.pl, 0);
  const gr = g.filter((f) => enRacha.has(f.fecha));
  console.log("| " + eur(-hi) + " … " + eur(-lo) + " | " + g.length + " | " + eur(s) + " | " + pct(s / PERDIDA_BRUTA) + " | " +
    gr.length + " días, " + eur(gr.reduce((a, f) => a + f.pl, 0)) + " |");
}

console.log("\n### Las 6 peores rachas del período (para ver si la peor es un accidente o el patrón)\n");
// rachas independientes: cada nuevo máximo cierra la anterior
const rachas = [];
{
  let pico = 0, picoIdx = -1, peorLocal = 0, valleIdx = -1;
  for (let i = 0; i < cBase.length; i++) {
    if (cBase[i].acc > pico) {
      if (peorLocal < 0) rachas.push({ peor: peorLocal, ini: filas[picoIdx + 1] ? filas[picoIdx + 1].fecha : filas[0].fecha, fin: filas[valleIdx].fecha, dias: valleIdx - picoIdx, iniIdx: picoIdx, valleIdx });
      pico = cBase[i].acc; picoIdx = i; peorLocal = 0; valleIdx = -1;
    }
    const dd = cBase[i].acc - pico;
    if (dd < peorLocal) { peorLocal = dd; valleIdx = i; }
  }
  if (peorLocal < 0) rachas.push({ peor: peorLocal, ini: filas[picoIdx + 1] ? filas[picoIdx + 1].fecha : filas[0].fecha, fin: filas[valleIdx].fecha, dias: valleIdx - picoIdx, iniIdx: picoIdx, valleIdx });
}
rachas.sort((a, b) => a.peor - b.peor);
console.log("| # | caída | desde | hasta | sesiones | peor día dentro | % de la caída que aporta ese día |");
console.log("|---|---|---|---|---|---|---|");
rachas.slice(0, 6).forEach((r, i) => {
  const t = filas.slice(r.iniIdx + 1, r.valleIdx + 1);
  const peorD = t.reduce((a, b) => (b.pl < a.pl ? b : a));
  console.log("| " + (i + 1) + " | **" + eur(r.peor) + "** | " + r.ini + " | " + r.fin + " | " + r.dias + " | " + eur(peorD.pl) + " (" + peorD.fecha + ") | " + pct(peorD.pl / r.peor) + " |");
});

// ═══ 5 · LAS REGLAS QUE LA ANATOMÍA SUGIERE, CONTRA EL AZAR ══════════════════════════════════
console.log("\n\n## 5 · LO ÚNICO IMPLEMENTABLE QUE SUGIERE LA ANATOMÍA: enfriamiento tras una pérdida\n");
console.log("Control obligatorio: cada regla se compara con QUITAR EL MISMO NÚMERO DE DÍAS AL AZAR");
console.log("(2.000 sorteos). Quitar días al azar ya recorta la peor racha; sin este control cualquier");
console.log("regla parece funcionar.\n");

function reglaEnfriamiento(umbral, dias) {
  const op = []; let bloq = 0;
  for (let i = 0; i < filas.length; i++) {
    if (bloq > 0) { bloq--; } else op.push(filas[i].fecha);
    if (filas[i].pl <= -umbral) bloq = dias;      // observable al cierre de HOY, aplica a MAÑANA
  }
  return op;
}
function controlAzar(nOperados, reps = 2000) {
  const out = { peorDia: [], dd: [], p5: [], alAno: [] };
  for (let r = 0; r < reps; r++) {
    const idx = [...Array(filas.length).keys()];
    for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    const m = metricas(idx.slice(0, nOperados).map((i) => filas[i].fecha));
    out.peorDia.push(m.peorDia); out.dd.push(m.dd); out.p5.push(m.p5); out.alAno.push(m.alAno);
  }
  return out;
}
const pMayorIgual = (nulos, obs) => (nulos.filter((x) => x >= obs).length + 1) / (nulos.length + 1);

const REGLAS = [
  ["3", "saltar 1 día tras pérdida ≥ $1.000", 1000, 1],
  ["4", "saltar 2 días tras pérdida ≥ $1.000", 1000, 2],
  ["5", "saltar 5 días tras pérdida ≥ $1.000", 1000, 5],
  ["6", "saltar 1 día tras CUALQUIER día perdedor", 0.01, 1],
];
console.log("| # | regla | días operados | al año | peor día | percentil 5 | peor racha | $/año retenidos por $ de racha eliminado | p (racha vs azar) |");
console.log("|---|---|---|---|---|---|---|---|---|");
const reglaRes = [];
for (const [num, nombre, U, D] of REGLAS) {
  const op = reglaEnfriamiento(U, D);
  const m = metricas(op);
  const ctrl = controlAzar(op.length);
  const ddElim = m.dd - BASE.dd;                    // >0 = racha menos profunda
  const perdidaIngreso = BASE.alAno - m.alAno;
  const ratio = ddElim > 0 ? (m.alAno / BASE.alAno) : NaN;
  const pDD = pMayorIgual(ctrl.dd, m.dd);
  reglaRes.push({ num, nombre, m, ctrl, ddElim, perdidaIngreso, pDD });
  console.log("| " + num + " | " + nombre + " | " + m.n + " (−" + (filas.length - m.n) + ") | " + eur(m.alAno) + " | " + eur(m.peorDia) + " | " +
    eur(m.p5) + " | " + eur(m.dd) + " | " + (ddElim > 0 ? (perdidaIngreso <= 0 ? "∞ (no cuesta nada)" : (ddElim / perdidaIngreso).toFixed(2) + "$/$") : "**la empeora**") +
    " | " + pDD.toFixed(3) + (pDD < 0.05 / PRUEBAS ? " ✓" : "") + " |");
}
console.log("\n### Contra el azar, en detalle (mediana de 2.000 sorteos con los mismos días quitados)\n");
console.log("| regla | peor racha REGLA | peor racha AZAR (mediana) | peor día REGLA | peor día AZAR | al año REGLA | al año AZAR |");
console.log("|---|---|---|---|---|---|---|");
for (const r of reglaRes) {
  const med = (v) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];
  console.log("| " + r.num + " | " + eur(r.m.dd) + " | " + eur(med(r.ctrl.dd)) + " | " + eur(r.m.peorDia) + " | " + eur(med(r.ctrl.peorDia)) +
    " | " + eur(r.m.alAno) + " | " + eur(med(r.ctrl.alAno)) + " |");
}

// ═══ 5b · DESCRIPTIVO (no es una prueba): ¿a qué distancia REAL se vende cada día? ═══════════
// Los ±25 puntos son FIJOS, pero σ va de 16 a 385. La misma orden vende a 1,6σ un día y a 0,06σ
// otro. Esto NO se contrasta aquí — se describe, porque es lo que explica la lista de los peores.
console.log("\n\n## 5b · DESCRIPTIVO — los ±25 puntos son la misma orden a distancias MUY distintas\n");
for (const f of filas) f.sigmaRatio = f.sigma > 0 ? SEP / f.sigma : null;
const conSR = filas.filter((f) => f.sigmaRatio != null).sort((a, b) => a.sigmaRatio - b.sigmaRatio);
const k3 = Math.floor(conSR.length / 3);
const grupos = [["MÁS CERCA del dinero (σ alta)", conSR.slice(0, k3)], ["medio", conSR.slice(k3, 2 * k3)], ["MÁS LEJOS del dinero (σ baja)", conSR.slice(2 * k3)]];
console.log("| tercio por 25/σ | rango de 25/σ | n | acierto | por op | al año (si sólo este tercio) | peor día | p5 | días al TOPE |");
console.log("|---|---|---|---|---|---|---|---|---|");
for (const [nom, g] of grupos) {
  const v = g.map((f) => f.pl), s = v.reduce((a, b) => a + b, 0), ord = [...v].sort((a, b) => a - b);
  console.log("| " + nom + " | " + g[0].sigmaRatio.toFixed(2) + "σ → " + g[g.length - 1].sigmaRatio.toFixed(2) + "σ | " + g.length + " | " +
    pct(v.filter((x) => x > 0).length / v.length) + " | " + eur(s / v.length) + " | " + eur(s / (g.length / DIAS_ANO)) + " | " +
    eur(ord[0]) + " | " + eur(ord[Math.floor(ord.length * 0.05)]) + " | " + g.filter((f) => f.pegado).length + " |");
}
const sr20 = ordPeor.slice(0, 20).map((f) => f.sigmaRatio).filter((x) => x != null);
console.log("\n25/σ de los 20 peores días: mediana " + [...sr20].sort((a, b) => a - b)[10].toFixed(2) + "σ · mediana de los 653 días: " +
  conSR[Math.floor(conSR.length / 2)].sigmaRatio.toFixed(2) + "σ");
console.log("De los 20 peores, " + ordPeor.slice(0, 20).filter((f) => f.sigmaRatio < 0.5).length + " se vendieron a menos de 0,5σ del dinero.");

// ═══ 6 · CIERRE ══════════════════════════════════════════════════════════════════════════════
console.log("\n\n## 6 · PRUEBAS DECLARADAS\n");
LISTA_PRUEBAS.forEach((p) => console.log("  " + p));
console.log("\n  listón de |t| con " + PRUEBAS + " pruebas (Bonferroni) = " + LISTON + " · listón de p = " + (0.05 / PRUEBAS).toFixed(4));

console.log("\n## RESUMEN-JSON");
console.log(JSON.stringify({
  n: BASE.n,
  peorDia: BASE.peorDia, p1: BASE.p1, p5: BASE.p5, dd: BASE.dd, ddDias: BASE.ddDias, ddIni: BASE.ddIni, ddFin: BASE.ddFin,
  total: BASE.total, alAno: BASE.alAno, perdidaBruta: PERDIDA_BRUTA, gananciaBruta: GANANCIA_BRUTA,
  contraf: Object.fromEntries(Object.entries(CONTRAF).map(([k, v]) => [k, { suma: v.suma, alAno: v.alAno, peorDia: v.peorDia, dd: v.dd, fracPerdida: v.suma / PERDIDA_BRUTA }])),
  rho1, tRho,
  racimos: Object.fromEntries(Object.entries(permRes).map(([k, v]) => [k, { obs: v.obs, esperado: v.mediaNula, p: v.p }])),
  reglas: reglaRes.map((r) => ({ num: r.num, nombre: r.nombre, n: r.m.n, alAno: r.m.alAno, peorDia: r.m.peorDia, p5: r.m.p5, dd: r.m.dd, pDD: r.pDD })),
}, null, 1));
