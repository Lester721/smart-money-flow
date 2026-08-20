// AMPLITUD COMO RIESGO · PARTE 2 — las dos preguntas que abrió la parte 1.
//
//  H · EL NULO DE EXPOSICIÓN. La parte 1 encontró que los días que el filtro se salta NO son
//      peores que los que opera (t = 0,82 en el período entero, −0,03 en la primera mitad). Si
//      eso es cierto, toda su reducción de caída viene de OPERAR MENOS, no de operar mejor.
//      Se prueba directo: 4.000 sorteos de EXACTAMENTE los mismos días operados, elegidos al
//      azar. Si la caída del filtro cae en medio del sorteo, el filtro no elige nada.
//      Este nulo no depende del signo del ingreso — por eso decide donde la razón $/caída falla.
//
//  I · EL SUELO DE EFECTIVO. La caída máxima se mide desde el pico anterior de la curva. Pero
//      Lester no arranca en un pico: arranca con $7.977. Lo que lo tumba no es la caída máxima,
//      es el punto más bajo del EFECTIVO. Y ahí el filtro sale PEOR que la base pese a tener
//      menos caída, porque llega al mal tramo con menos dinero ganado.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/amplitud-riesgo-2.mjs

import { readFileSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";

const CUENTA = 56389, EFECTIVO = 7977;
const PRUEBAS = 30, LISTON = listonT(PRUEBAS);
const eur = (x) => (x == null || !Number.isFinite(x) ? "—" : (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES"));
const pct = (x) => (x == null || !Number.isFinite(x) ? "—" : (x * 100).toFixed(1) + "%");
const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);

const { dias } = JSON.parse(readFileSync("scripts/amplitud-riesgo-dias.json", "utf8"));
const sobreAmbas = (d) => d.sp11 >= d.ma20 && d.sp11 >= d.ma50;

function caidaMax(pl) { let c = 0, p = 0, w = 0; for (const x of pl) { c += x; p = Math.max(p, c); w = Math.min(w, c - p); } return w; }
function es5de(pl) { const o = [...pl].sort((a, b) => a - b); return media(o.slice(0, Math.max(1, Math.round(pl.length * 0.05)))); }
function suelo(pl, fechas) {
  let caja = EFECTIVO, min = EFECTIVO, f = null, bajo0 = 0, quiebra = null;
  for (let i = 0; i < pl.length; i++) {
    caja += pl[i];
    if (caja < min) { min = caja; f = fechas[i]; }
    if (caja < 0) { bajo0++; if (!quiebra) quiebra = fechas[i]; }
  }
  return { min, fecha: f, bajo0, quiebra, final: caja };
}

const ANCHO = 104;
const raya = (t) => { console.log("\n" + "═".repeat(ANCHO)); console.log("  " + t); console.log("═".repeat(ANCHO)); };
const mitad = Math.floor(dias.length / 2);
const TRAMOS = [["período entero", dias], [`H1 ${dias[0].fecha}→${dias[mitad - 1].fecha}`, dias.slice(0, mitad)], [`H2 ${dias[mitad].fecha}→${dias[dias.length - 1].fecha}`, dias.slice(mitad)]];

console.log(`\n# AMPLITUD COMO RIESGO · PARTE 2`);
console.log(`\n${dias.length} sesiones · ${dias[0].fecha} → ${dias[dias.length - 1].fecha} · ${PRUEBAS} pruebas declaradas · listón |t| = ${LISTON}`);

// ═══ H · EL NULO DE EXPOSICIÓN ══════════════════════════════════════════════════════════════
raya("H · EL NULO DE EXPOSICIÓN — ¿elige días, o sólo opera menos?");
console.log(`
  Misma geometría (±30, alas 50) en los dos brazos. El filtro opera N días concretos; el nulo
  opera N días SORTEADOS. Si el filtro tuviera criterio, su caída estaría en la cola buena del
  sorteo. Si está en el centro, lo único que hace es apagar la máquina el 39% del tiempo — y eso
  lo consigue igual de bien, y más barato de mantener, cualquier forma de operar menos.
`);
const REPS = 4000;
let rng = 20260820;
const rnd = () => { rng = (rng * 1103515245 + 12345) & 0x7fffffff; return rng / 0x7fffffff; };

console.log("| tramo | días op. / total | métrica | FILTRO | mediana del sorteo | percentil del filtro | ¿en la cola buena? |");
console.log("|---|---|---|---|---|---|---|");
const resumenNulo = [];
for (const [nom, ds] of TRAMOS) {
  const pl30 = ds.map((d) => d.pnl["30"] ?? 0);
  const idxOp = ds.map((d, i) => (sobreAmbas(d) && d.pnl["30"] != null ? i : -1)).filter((i) => i >= 0);
  const N = idxOp.length;
  const fSerie = pl30.map((_, i) => (idxOp.includes(i) ? pl30[i] : 0));
  const real = { caida: caidaMax(fSerie), es5: es5de(fSerie), total: suma(fSerie) };

  const dist = { caida: [], es5: [], total: [] };
  const orden = pl30.map((_, i) => i);
  for (let r = 0; r < REPS; r++) {
    for (let i = orden.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [orden[i], orden[j]] = [orden[j], orden[i]]; }
    const on = new Uint8Array(pl30.length);
    for (let i = 0; i < N; i++) on[orden[i]] = 1;
    const s = pl30.map((x, i) => (on[i] ? x : 0));
    dist.caida.push(caidaMax(s)); dist.es5.push(es5de(s)); dist.total.push(suma(s));
  }
  const perc = (arr, v) => arr.filter((x) => x < v).length / arr.length;   // fracción PEOR que el filtro
  const med = (arr) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  for (const [k, etq, mejorEsAlto] of [["caida", "caída máxima", true], ["es5", "5% peor (media)", true], ["total", "ingreso total", false]]) {
    const p = perc(dist[k], real[k]);
    const cola = mejorEsAlto ? p <= 0.05 : null;
    resumenNulo.push({ tramo: nom, k, p });
    console.log(`| ${nom} | ${N}/${ds.length} | ${etq} | ${eur(real[k])} | ${eur(med(dist[k]))} | **${(p * 100).toFixed(1)}%** | ${mejorEsAlto ? (cola ? "**SÍ**" : "no") : "—"} |`);
  }
}
console.log(`
   El percentil dice qué fracción de los ${REPS} sorteos sale PEOR que el filtro. Un filtro que
   elige días buenos tendría percentiles altos (>95%). Un filtro que sólo opera menos sale ~50%.
`);

// ═══ I · EL SUELO DE EFECTIVO ═══════════════════════════════════════════════════════════════
raya("I · EL SUELO DE EFECTIVO — lo que de verdad tumba la cuenta");
console.log(`
  La caída máxima se mide desde el pico anterior de la curva. Eso vale para comparar máquinas,
  no para saber si una cuenta aguanta. Lester arranca con ${eur(EFECTIVO)} de efectivo y las
  pérdidas salen de ahí. Lo que manda es el punto MÁS BAJO del efectivo desde el arranque.
`);
const dSer = (ds, dist, filt) => ds.map((d) => { const p = d.pnl[String(dist)]; return filt(d) && p != null ? p : 0; });
const REGLAS = [
  ["BASE ±25 · todos", 25, () => true],
  ["±30 · todos", 30, () => true],
  ["FILTRO ±30 + medias", 30, sobreAmbas],
  ["±35 · todos", 35, () => true],
  ["±40 · todos", 40, () => true],
];
console.log("| regla | contratos | $/año | caída máx | suelo de EFECTIVO | fecha del suelo | días en rojo | ¿aguanta? |");
console.log("|---|---|---|---|---|---|---|---|");
const fechas = dias.map((d) => d.fecha);
for (const [nom, dist, filt] of REGLAS) {
  for (const k of [1, 2]) {
    const s = dSer(dias, dist, filt).map((x) => x * k);
    const su = suelo(s, fechas);
    console.log(`| ${nom} | ${k} | ${eur(suma(s) / (dias.length / 252))} | ${eur(caidaMax(s))} | **${eur(su.min)}** | ${su.fecha} | ${su.bajo0} | ${su.min > 0 ? "sí" : "**NO**"} |`);
  }
}

console.log(`\n### A TAMAÑO IGUALADO POR CAÍDA — el filtro contra la base encogida\n`);
const sBase = dSer(dias, 25, () => true), sFil = dSer(dias, 30, sobreAmbas);
const f = caidaMax(sFil) / caidaMax(sBase);
console.log(`f = |caída del filtro| ÷ |caída de la base| = ${f.toFixed(3)} contratos de base igualan la caída del filtro.\n`);
console.log("| variante | $/año | caída máx | 5% peor | suelo de EFECTIVO | fecha |");
console.log("|---|---|---|---|---|---|");
for (const [nom, s] of [["FILTRO ±30 + medias · 1 contrato", sFil], [`BASE ±25 · ${f.toFixed(3)} contratos`, sBase.map((x) => x * f)], ["BASE ±25 · 1 contrato", sBase]]) {
  const su = suelo(s, fechas);
  console.log(`| ${nom} | ${eur(suma(s) / (dias.length / 252))} | ${eur(caidaMax(s))} | ${eur(es5de(s))} | **${eur(su.min)}** | ${su.fecha} |`);
}

// ═══ J · LO ÚNICO QUE SÍ MUEVE EL SUELO ═════════════════════════════════════════════════════
raya("J · ¿QUÉ SÍ BAJA EL RIESGO? — el barrido de la distancia, sin filtro ninguno");
console.log(`
  Si el filtro no elige días, la única palanca de riesgo que queda dentro de la geometría es la
  DISTANCIA: cuánto se aleja el cóndor del dinero. Se barre entera, sin filtro, con el mismo
  número de días operados (todos), para ver la frontera de verdad.
`);
console.log("| distancia | $/año | caída máx | % cuenta | 5% peor | suelo EFECTIVO | acierto | eficiencia ($/año ÷ caída) |");
console.log("|---|---|---|---|---|---|---|---|");
for (const dist of [15, 20, 25, 30, 35, 40, 45, 50]) {
  const s = dSer(dias, dist, () => true);
  const nOp = dias.filter((d) => d.pnl[String(dist)] != null).length;
  if (nOp < dias.length * 0.9) { console.log(`| ±${dist} | — sólo ${nOp} de ${dias.length} días tienen crédito real a esta distancia — |`); continue; }
  const su = suelo(s, fechas), c = caidaMax(s), a = suma(s) / (dias.length / 252);
  const ac = s.filter((x) => x > 0).length / s.filter((x) => x !== 0).length;
  console.log(`| ±${dist} | ${eur(a)} | ${eur(c)} | ${pct(c / CUENTA)} | ${eur(es5de(s))} | ${eur(su.min)} | ${pct(ac)} | ${(a / -c).toFixed(3)} |`);
}

console.log(`\n### El barrido, mitad a mitad — ¿la frontera se hereda?\n`);
console.log("| distancia | $/año H1 | caída H1 | $/año H2 | caída H2 | eficiencia H1 | eficiencia H2 |");
console.log("|---|---|---|---|---|---|---|");
const H = [dias.slice(0, mitad), dias.slice(mitad)];
for (const dist of [15, 20, 25, 30, 35, 40, 45, 50]) {
  const nOp = dias.filter((d) => d.pnl[String(dist)] != null).length;
  if (nOp < dias.length * 0.9) continue;
  const m = H.map((ds) => { const s = dSer(ds, dist, () => true); return { a: suma(s) / (ds.length / 252), c: caidaMax(s) }; });
  console.log(`| ±${dist} | ${eur(m[0].a)} | ${eur(m[0].c)} | ${eur(m[1].a)} | ${eur(m[1].c)} | ${(m[0].a / -m[0].c).toFixed(3)} | ${(m[1].a / -m[1].c).toFixed(3)} |`);
}
