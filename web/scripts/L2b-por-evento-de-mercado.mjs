// ══════════════════════════════════════════════════════════════════════════════════════════════
// LENTE 2 (segunda parte) — LA UNIDAD NO ES LA OPERACIÓN, ES EL DÍA DE MERCADO
// ══════════════════════════════════════════════════════════════════════════════════════════════
//
// POR QUÉ HACE FALTA ESTO
// En el envase, TODOS los tickers entran el MISMO día: el primer día de bolsa de cada mes. O sea
// que cada mes no son 28 apuestas independientes, es UNA apuesta de mercado repartida en 28
// nombres. Cuando el 2020-02-03 se compran puts de XOM, JPM, F, GE y META y a las tres semanas
// llega el covid, eso NO son cinco aciertos: es uno.
//
// Mirar la concentración por TICKER (como se hace siempre) no ve eso, porque los cinco aciertos
// están en cinco tickers distintos y parecen repartidos. Aquí se cuenta por MES DE ENTRADA, que
// es la unidad de riesgo de verdad, y se compara CON regla contra SIN regla — porque parte de la
// concentración es el diseño convexo y no es culpa de la regla.
//
// Lee la caché de operaciones que dejó scripts/L2-calma-lente-2.mjs (mismos precios reales, mismo
// ask de entrada y bid de salida, mismos huecos descartados).
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/L2b-por-evento-de-mercado.mjs
// ══════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync } from "node:fs";

const filas = JSON.parse(readFileSync("scripts/cache-theta/_L2-filas.json", "utf8"));
const APUESTA = 1000;

const num = (n, d = 0) => n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (x) => (Number.isFinite(x) ? (100 * x).toFixed(1) + "%" : "n/d");
const dol = (n) => "$" + num(Math.round(n));
const r2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "n/d");
const acc = () => ({ n: 0, win: 0, gan: 0, per: 0 });
const suma = (a, d) => { a.n++; if (d > 0) { a.win++; a.gan += d; } else a.per += -d; };
const ratio = (a) => (a.per > 0 ? a.gan / a.per : NaN);
const acierto = (a) => (a.n ? a.win / a.n : NaN);

for (const f of filas) f.mes = f.dia.slice(0, 6);

function sub(envId, us, filtro) {
  return filas.filter((f) => f.env === envId && (!us || f.sen) && (!filtro || filtro(f)));
}
function tot(fs) { const a = acc(); for (const f of fs) suma(a, APUESTA * f.ret); return a; }

console.log(`\n${"═".repeat(104)}`);
console.log("  LENTE 2 (2ª parte) — CONCENTRACIÓN POR MES DE ENTRADA: la unidad de riesgo de verdad");
console.log(`${"═".repeat(104)}`);

// ── ¿de verdad entran todos el mismo día? ──────────────────────────────────────────────────────
{
  const porMes = new Map();
  for (const f of filas) { if (f.env !== "A") continue; if (!porMes.has(f.mes)) porMes.set(f.mes, new Set()); porMes.get(f.mes).add(f.dia); }
  const tam = [...porMes.values()].map((s) => s.size).sort((a, b) => a - b);
  console.log(`\n  COMPROBACIÓN: días de entrada distintos dentro de un mismo mes — mediana ${tam[tam.length >> 1]} · máximo ${tam[tam.length - 1]}`);
  console.log(`  (si es 1, los 28 tickers compran el mismo día y el mes ES una sola apuesta de mercado)`);
}

// ── concentración por mes ──────────────────────────────────────────────────────────────────────
function porMesTabla(envId, us) {
  const m = new Map();
  for (const f of sub(envId, us)) { if (!m.has(f.mes)) m.set(f.mes, acc()); suma(m.get(f.mes), APUESTA * f.ret); }
  return [...m.entries()].map(([k, v]) => ({ k, v, neto: v.gan - v.per })).sort((a, b) => b.v.gan - a.v.gan);
}
function paraLaMitad(l, total) { let ac = 0, c = 0; for (const t of l) { if (t.v.gan <= 0) break; ac += t.v.gan; c++; if (ac >= total / 2) break; } return c; }

console.log(`\n  | envase | muestra | meses con operaciones | meses que juntan la MITAD de lo ganado | % de lo ganado en el mes top | en los 3 meses top |`);
console.log(`  |---|---|---|---|---|---|`);
for (const env of ["A", "B"]) {
  for (const [et, us] of [["CON regla", true], ["SIN regla", false]]) {
    const l = porMesTabla(env, us), t = tot(sub(env, us));
    const g = l.map((x) => x.v.gan);
    console.log(`  | ${env} | ${et} | ${l.length} | **${paraLaMitad(l, t.gan)}** | ${pct(g[0] / t.gan)} | ${pct((g[0] + g[1] + g[2]) / t.gan)} |`);
  }
}

// ── los meses que más pagan ────────────────────────────────────────────────────────────────────
{
  const l = porMesTabla("A", true), t = tot(sub("A", true));
  console.log(`\n  ENVASE A CON regla — los 10 meses de entrada que más pagan (de ${l.length}):`);
  console.log(`  | mes de entrada | n | ganado | perdido | neto | % de todo lo ganado |`);
  console.log(`  |---|---|---|---|---|---|`);
  let ac = 0;
  for (const x of l.slice(0, 10)) { ac += x.v.gan; console.log(`  | ${x.k} | ${x.v.n} | ${dol(x.v.gan)} | ${dol(x.v.per)} | ${dol(x.neto)} | ${pct(x.v.gan / t.gan)} |`); }
  console.log(`  esos 10 meses (de ${l.length}) son el ${pct(ac / t.gan)} de todo lo ganado`);
  const sinTop = (k) => { const fuera = new Set(l.slice(0, k).map((x) => x.k)); return ratio(tot(sub("A", true, (f) => !fuera.has(f.mes)))); };
  const sinTopBase = (k) => { const fuera = new Set(porMesTabla("A", false).slice(0, k).map((x) => x.k)); return ratio(tot(sub("A", false, (f) => !fuera.has(f.mes)))); };
  console.log(`\n  | meses top quitados | ratio CON regla | ratio SIN regla (quitando SUS propios meses top) |`);
  console.log(`  |---|---|---|`);
  for (const k of [0, 1, 2, 3, 5, 10]) console.log(`  | ${k} | **${r2(sinTop(k))}** | ${r2(sinTopBase(k))} |`);
}

// ── dejar fuera un mes cada vez: el peor ───────────────────────────────────────────────────────
{
  const l = porMesTabla("A", true);
  const loo = l.map((x) => ({ k: x.k, r: ratio(tot(sub("A", true, (f) => f.mes !== x.k))) })).sort((a, b) => a.r - b.r);
  console.log(`\n  DEJAR FUERA UN MES CADA VEZ (envase A, con regla) — los 5 peores:`);
  for (const x of loo.slice(0, 5)) console.log(`    sin ${x.k} → ${r2(x.r)}`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// VENTANAS LIMPIAS — sin 2020 y sin el 2026 a medias
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("  VENTANAS DE AÑOS COMPLETOS — 2026 sólo llega a agosto y es el año con mejor ratio");
console.log(`${"═".repeat(104)}`);
const VENT = [
  ["2016-2026 (todo)", (f) => true],
  ["2016-2025 (fuera el año a medias)", (f) => f.ano !== "2026"],
  ["2021-2025 (ni 2020 ni el año a medias)", (f) => Number(f.ano) >= 2021 && f.ano !== "2026"],
  ["2016-2019 (antes del covid)", (f) => Number(f.ano) <= 2019],
  ["2021-2024", (f) => Number(f.ano) >= 2021 && Number(f.ano) <= 2024],
];
for (const env of ["A", "B"]) {
  console.log(`\n  ENVASE ${env}`);
  console.log(`  | ventana | n CON | ratio CON | acierta CON | ratio SIN | acierta SIN | mejora |`);
  console.log(`  |---|---|---|---|---|---|---|`);
  for (const [et, fn] of VENT) {
    const c = tot(sub(env, true, fn)), b = tot(sub(env, false, fn));
    console.log(`  | ${et} | ${num(c.n)} | **${r2(ratio(c))}** | ${pct(acierto(c))} | ${r2(ratio(b))} | ${pct(acierto(b))} | ${(ratio(c) - ratio(b)).toFixed(2)} |`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// EL ACIERTO — la palanca que se pedía — mirado aparte del dinero
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(104)}`);
console.log("  EL ACIERTO POR SEPARADO — el ratio se lo puede llevar un billete, el acierto no");
console.log(`${"═".repeat(104)}`);
console.log(`  | envase | recorte | acierta CON regla | acierta SIN regla | sube |`);
console.log(`  |---|---|---|---|---|`);
const RECORTES = [
  ["muestra entera", () => true],
  ["sin 2020", (f) => f.ano !== "2020"],
  ["sin 2020 y sin 2026", (f) => f.ano !== "2020" && f.ano !== "2026"],
  ["sin los 3 mejores tickers", (f) => !["BA", "AMD", "INTC"].includes(f.sym)],
  ["sin 2020 y sin los 3 mejores tickers", (f) => f.ano !== "2020" && !["BA", "AMD", "INTC"].includes(f.sym)],
];
for (const env of ["A", "B"]) {
  for (const [et, fn] of RECORTES) {
    const c = tot(sub(env, true, fn)), b = tot(sub(env, false, fn));
    console.log(`  | ${env} | ${et} | **${pct(acierto(c))}** | ${pct(acierto(b))} | ${(100 * (acierto(c) - acierto(b))).toFixed(1)} puntos |`);
  }
}

// ── ¿cuántos tickers mejoran con la regla? ────────────────────────────────────────────────────
{
  console.log(`\n  ¿La regla mejora a CADA ticker, o sólo a unos pocos?`);
  for (const env of ["A", "B"]) {
    const tks = [...new Set(filas.map((f) => f.sym))];
    let mejor = 0, peor = 0, aciertoSube = 0;
    for (const t of tks) {
      const c = tot(sub(env, true, (f) => f.sym === t)), b = tot(sub(env, false, (f) => f.sym === t));
      if (ratio(c) > ratio(b)) mejor++; else peor++;
      if (acierto(c) > acierto(b)) aciertoSube++;
    }
    console.log(`    envase ${env}: el ratio sube en ${mejor} de ${tks.length} tickers · el ACIERTO sube en ${aciertoSube} de ${tks.length}`);
  }
}

// ── ¿y por año? el acierto año a año ──────────────────────────────────────────────────────────
{
  const ANOS = [...new Set(filas.map((f) => f.ano))].sort();
  console.log(`\n  Acierto año a año (envase A):`);
  console.log(`  | año | ${ANOS.join(" | ")} |`);
  console.log(`  |---|${ANOS.map(() => "---").join("|")}|`);
  console.log(`  | CON regla | ${ANOS.map((a) => pct(acierto(tot(sub("A", true, (f) => f.ano === a))))).join(" | ")} |`);
  console.log(`  | SIN regla | ${ANOS.map((a) => pct(acierto(tot(sub("A", false, (f) => f.ano === a))))).join(" | ")} |`);
  let sube = 0;
  for (const a of ANOS) if (acierto(tot(sub("A", true, (f) => f.ano === a))) > acierto(tot(sub("A", false, (f) => f.ano === a)))) sube++;
  console.log(`  el acierto sube en ${sube} de los ${ANOS.length} años`);
}

console.log(`\n${"═".repeat(104)}\n`);
