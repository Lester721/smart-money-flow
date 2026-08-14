// LABORATORIO DE EVA — ¿se puede mejorar el scoring, o los ingredientes no llevan señal?
//
// Uso: node --import tsx scripts/eva-laboratorio.ts
// Lee `scripts/eva-filas.json` (lo vuelca backtest-eva-vs-victor.ts). No descarga nada.
//
// POR QUÉ ASÍ Y NO PROBANDO PESOS
//
// La tentación es buscar los pesos que mejor separan. Es exactamente como se fabrican los
// hallazgos falsos: con 4 ingredientes y una rejilla fina hay miles de combinaciones, y la mejor
// de miles SIEMPRE separa bien — sobre los datos con los que se eligió.
//
// Así que el orden es al revés:
//   1. ¿Algún ingrediente separa POR SÍ SOLO? Si ninguno lleva señal, re-pesarlos no puede
//      salvar nada: no se hace una señal promediando cuatro ruidos.
//   2. Sólo si alguno separa, buscar pesos — y validarlos en la MITAD QUE NO SE USÓ para elegirlos.
//
// Y todo con estadístico t, porque una separación sin t no dice nada. Con 8 ingredientes probados
// el listón sube: |t| > 2 vale para UNA prueba; aquí hace falta ~|t| > 2,7 (Bonferroni 8).

import { readFileSync } from "node:fs";

interface Fila {
  pnl: number; aggr: number; conv: number; unus: number; ivp: number;
  spreadPct: number | null; oi: number; volume: number; dte: number | null;
  side: string; exceededOI: boolean; isCall: boolean; ticker: string; fecha: string;
}

const FILAS: Fila[] = JSON.parse(readFileSync(process.env.BT_DUMP || "scripts/eva-filas.json", "utf8"));

const media = (v: number[]) => v.reduce((a, x) => a + x, 0) / v.length;
const mediana = (v: number[]) => { const s = [...v].sort((a, b) => a - b); const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const varianza = (v: number[]) => { const m = media(v); return v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1); };

/** t de Welch: dos muestras con varianzas distintas. Devuelve 0 si no hay muestra suficiente. */
function tWelch(a: number[], b: number[]): number {
  if (a.length < 3 || b.length < 3) return 0;
  const se = Math.sqrt(varianza(a) / a.length + varianza(b) / b.length);
  return se > 0 ? (media(a) - media(b)) / se : 0;
}

const pct = (x: number) => (x * 100).toFixed(1) + "%";

/** Separación entre el tercio alto y el bajo según un criterio. */
function separar(filas: Fila[], criterio: (f: Fila) => number) {
  const ord = [...filas].sort((x, y) => criterio(y) - criterio(x));
  const k = Math.floor(ord.length / 3);
  if (k < 5) return null;
  const alto = ord.slice(0, k).map((f) => f.pnl);
  const bajo = ord.slice(-k).map((f) => f.pnl);
  return {
    n: k,
    altoMedia: media(alto), bajoMedia: media(bajo),
    altoMediana: mediana(alto), bajoMediana: mediana(bajo),
    altoWin: alto.filter((x) => x > 0).length / alto.length,
    bajoWin: bajo.filter((x) => x > 0).length / bajo.length,
    sep: media(alto) - media(bajo),
    t: tWelch(alto, bajo),
  };
}

// ── LOS INGREDIENTES, UNO A UNO ──────────────────────────────────────────────
// Los cuatro del scorecard más cuatro crudos que el scorecard usa indirectamente. Se prueban
// todos para no elegir a posteriori el que mejor salió: la lista se fija ANTES de mirar.
const INGREDIENTES: [string, (f: Fila) => number][] = [
  ["convicción (conv)", (f) => f.conv],
  ["inusualidad (unus)", (f) => f.unus],
  ["IV proxy (ivp)", (f) => f.ivp],
  ["agresión (aggr)", (f) => f.aggr],
  ["horquilla (−spread%)", (f) => -(f.spreadPct ?? 1)],
  ["open interest", (f) => f.oi],
  ["volumen", (f) => f.volume],
  ["días al vencimiento", (f) => f.dte ?? 0],
];

console.log(`LABORATORIO EVA · ${FILAS.length} flujos · ${new Set(FILAS.map((f) => f.ticker)).size} tickers`);
const fechas = FILAS.map((f) => f.fecha).sort();
console.log(`período: ${fechas[0]} → ${fechas[fechas.length - 1]}`);
console.log(`P&L global: media ${pct(media(FILAS.map((f) => f.pnl)))} · mediana ${pct(mediana(FILAS.map((f) => f.pnl)))} · win ${pct(FILAS.filter((f) => f.pnl > 0).length / FILAS.length)}`);
console.log("");
console.log("═══ 1. ¿ALGÚN INGREDIENTE SEPARA POR SÍ SOLO? ═══");
console.log("(listón con 8 pruebas: |t| > 2,7. Con |t| < 1 es ruido puro.)");
console.log("");
console.log("ingrediente              n     tercio alto      tercio bajo     separación      t");
for (const [nombre, crit] of INGREDIENTES) {
  const s = separar(FILAS, crit);
  if (!s) { console.log(nombre.padEnd(24), "sin muestra"); continue; }
  const veredicto = Math.abs(s.t) > 2.7 ? "  ← PASA" : Math.abs(s.t) > 2 ? "  (pasaría si fuera la única prueba)" : "";
  console.log(
    nombre.padEnd(24), String(s.n).padStart(4),
    pct(s.altoMedia).padStart(9), `(win ${pct(s.altoWin)})`.padStart(11),
    pct(s.bajoMedia).padStart(9), `(win ${pct(s.bajoWin)})`.padStart(11),
    pct(s.sep).padStart(9), s.t.toFixed(2).padStart(7), veredicto,
  );
}

// ── 2. PARTIR POR TIEMPO ─────────────────────────────────────────────────────
// La prueba que de verdad importa: elegir con la primera mitad, comprobar con la segunda.
const ordenadas = [...FILAS].sort((a, b) => a.fecha.localeCompare(b.fecha));
const corte = Math.floor(ordenadas.length / 2);
const primera = ordenadas.slice(0, corte), segunda = ordenadas.slice(corte);

console.log("");
console.log("═══ 2. ¿AGUANTA EN LA MITAD QUE NO SE USÓ? ═══");
console.log(`1ª mitad: ${primera[0].fecha} → ${primera[primera.length - 1].fecha} (n=${primera.length})`);
console.log(`2ª mitad: ${segunda[0].fecha} → ${segunda[segunda.length - 1].fecha} (n=${segunda.length})`);
console.log("");
console.log("ingrediente              sep 1ª mitad   sep 2ª mitad    ¿mismo signo?");
for (const [nombre, crit] of INGREDIENTES) {
  const a = separar(primera, crit), b = separar(segunda, crit);
  if (!a || !b) continue;
  const coherente = Math.sign(a.sep) === Math.sign(b.sep) && Math.abs(b.sep) > 0.01;
  console.log(
    nombre.padEnd(24),
    `${pct(a.sep)} (t ${a.t.toFixed(1)})`.padStart(15),
    `${pct(b.sep)} (t ${b.t.toFixed(1)})`.padStart(15),
    coherente ? "   sí" : "   NO — se contradicen",
  );
}

// ── 3. BUSCAR PESOS, PERO HONESTAMENTE ───────────────────────────────────────
// Se buscan sobre la PRIMERA mitad y se miden sobre la SEGUNDA. El número que vale es el
// segundo. Se imprime cuántas combinaciones se probaron: sin ese dato, "el mejor de N" engaña.
console.log("");
console.log("═══ 3. LOS MEJORES PESOS DE LA 1ª MITAD, MEDIDOS EN LA 2ª ═══");

const REJILLA = [0, 10, 20, 30, 40];
let probadas = 0;
let mejor: { w: number[]; sep: number } | null = null;
for (const wc of REJILLA) for (const wu of REJILLA) for (const wi of REJILLA) for (const wa of REJILLA) {
  if (wc + wu + wi + wa === 0) continue;
  probadas++;
  const crit = (f: Fila) => wc * f.conv + wu * f.unus + wi * f.ivp + wa * f.aggr;
  const s = separar(primera, crit);
  if (s && (!mejor || s.sep > mejor.sep)) mejor = { w: [wc, wu, wi, wa], sep: s.sep };
}
if (mejor) {
  const crit = (f: Fila) => mejor!.w[0] * f.conv + mejor!.w[1] * f.unus + mejor!.w[2] * f.ivp + mejor!.w[3] * f.aggr;
  const fuera = separar(segunda, crit);
  console.log(`combinaciones probadas: ${probadas}`);
  console.log(`los mejores pesos de la 1ª mitad: conv ${mejor.w[0]} · unus ${mejor.w[1]} · ivp ${mejor.w[2]} · aggr ${mejor.w[3]}`);
  console.log(`  DENTRO de muestra (donde se eligieron): ${pct(mejor.sep)}`);
  console.log(`  FUERA de muestra (2ª mitad)           : ${fuera ? `${pct(fuera.sep)}  ·  t ${fuera.t.toFixed(2)}` : "sin muestra"}`);
  console.log("");
  console.log(`  El primero SIEMPRE es bueno: es el mejor de ${probadas}. Sólo el segundo cuenta.`);
}

// Los de referencia, con la misma vara.
console.log("");
console.log("═══ 4. VICTOR Y EVA CON LA MISMA VARA, CON t ═══");
const victor = (f: Fila) => 20 * f.conv + 20 * f.unus + 20 * f.ivp + 10 * f.aggr;
const eva = (f: Fila) => 30 * f.conv + 20 * f.unus + 15 * f.ivp + 10 * f.aggr;
for (const [n, c] of [["Victor (20/20/20/10)", victor], ["EVA (30/20/15/10)", eva]] as [string, (f: Fila) => number][]) {
  const t = separar(FILAS, c), a = separar(primera, c), b = separar(segunda, c);
  console.log(`${n.padEnd(22)} sep ${pct(t!.sep).padStart(7)} · t ${t!.t.toFixed(2).padStart(6)}   |  1ª ${pct(a!.sep).padStart(7)}  2ª ${pct(b!.sep).padStart(7)}  ${Math.sign(a!.sep) === Math.sign(b!.sep) ? "coherentes" : "SE CONTRADICEN"}`);
}

// ── 5. ¿Y SI EL VALOR ESTÁ EN VENDER, NO EN COMPRAR? ─────────────────────────
// Los seis cubos pierden comprando. Pero si un criterio separa, el diferencial es tradeable en
// principio: comprar el tercio alto y vender el bajo. OJO — esto NO es una estrategia todavía:
// la horquilla se paga en las dos patas y aquí no está descontada. Es una cota superior.
console.log("");
console.log("═══ 5. COTA SUPERIOR: COMPRAR EL ALTO Y VENDER EL BAJO ═══");
console.log("(sin descontar la horquilla de la segunda pata — es un techo, NO una estrategia)");
for (const [n, c] of [["Victor", victor], ["EVA", eva], ...INGREDIENTES.slice(0, 4)] as [string, (f: Fila) => number][]) {
  const s = separar(FILAS, c);
  if (s) console.log(`  ${n.padEnd(24)} ${pct(s.sep).padStart(8)} por par  ·  t ${s.t.toFixed(2)}`);
}
console.log("");
console.log("Recordatorio: la horquilla es un % de la PRIMA, no del nominal. En opciones fuera del");
console.log("dinero se come separaciones de este tamaño con facilidad. Antes de creerse nada de");
console.log("arriba, medir la horquilla real de las dos patas.");
