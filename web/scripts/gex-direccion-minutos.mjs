// LA PREGUNTA DE LESTER · ¿el imán del GEX da DIRECCIÓN en el corto plazo?
//
// ═══ EN QUÉ SE DIFERENCIA DE LO YA MEDIDO ═══════════════════════════════════════════════════
//
// El análisis anterior midió el imán como brújula ENTRANDO POR LA MAÑANA Y SALIENDO AL CIERRE:
// 55,4% de acierto en gamma negativa contra 49,2% de la deriva. Bien — pero seis horas y media.
//
// Lester lo planteó mejor: **con gamma negativa el creador de mercado PERSIGUE** (compra cuando
// sube, vende cuando baja). Eso no pasa repartido por el día: **pasa a ráfagas**. Diluirlo en
// 6h30 es la forma de no verlo. Él quiere entrar y salir en 5-10 minutos.
//
// Y el vehículo le da la razón: en SPY la horquilla es un céntimo sobre ~$534 (0,0019%). Un
// movimiento de minutos deja el 99% intacto. En una opción no.
//
// ═══ LO QUE ESTE FICHERO **SÍ** PUEDE MEDIR, Y LO QUE NO ════════════════════════════════════
//
// scripts/gex-niveles.json guarda `cada30`: 13 precios, uno cada 30 minutos. Ésa es la
// resolución más fina que hay aquí. `spy.minutos` es sólo un RECUENTO (391), no las barras.
//
// Así que esto mide el horizonte de **30 minutos**, no el de 5-10 que pidió Lester. Es la MISMA
// pregunta con la lupa menos aumentada, y sirve para decidir si vale la pena la pasada cara:
//   · si a 30 min hay señal → merece leer las barras de 5 min de las 1.123 cadenas
//   · si a 30 min no hay nada → puede que el efecto viva sólo en ráfagas más cortas, y entonces
//     la pasada fina es la ÚNICA forma de saberlo. No es un cierre.
// SE DICE cuál de las dos es. No se vende un resultado de 30 min como si fuera de 5.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/gex-direccion-minutos.mjs

import { readFileSync, existsSync } from "node:fs";

const F = "scripts/gex-niveles.json";
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");

if (!existsSync(F)) { console.error(`Falta ${F}`); process.exit(1); }
const j = JSON.parse(readFileSync(F, "utf8"));
const dias = j.dias ?? j.filas ?? Object.values(j).find((v) => Array.isArray(v));

// ── construir los momentos ──────────────────────────────────────────────────
// LENTE gamD: el análisis anterior midió las tres y concluyó que es la única con algo que medir
// (canal de 100 pts, el precio toca el muro el 23% de las veces). gam no da canal en el 30% de
// los días y oi pone el muro donde el precio no llega.
const LENTE = "gamD";
const eventos = [];
let sinDatos = 0;
for (const d of dias) {
  const n = d.niveles?.[LENTE];
  const c = d.cada30;
  if (!n || !Array.isArray(c) || c.length < 4 || n.imanBruto == null || n.netPunto == null) { sinDatos++; continue; }
  const p = c.map((x) => (Array.isArray(x) ? x[1] : x?.[1] ?? x)).filter((x) => typeof x === "number" && x > 0);
  if (p.length < 4) { sinDatos++; continue; }
  for (let i = 1; i < p.length - 1; i++) {
    const impulso = p[i] - p[i - 1];
    if (!impulso) continue;
    eventos.push({
      fecha: d.fecha,
      gammaNeg: n.netPunto < 0,
      distIman: ((p[i] - n.imanBruto) / p[i]) * 100,
      impulso,
      siguiente: p[i + 1] - p[i],
    });
  }
}
console.log(`\n## ${dias.length} días · ${eventos.length.toLocaleString("es-ES")} momentos de 30 min · ${sinDatos} días sin dato utilizable\n`);
console.log(`Lente: ${LENTE} (la única de las tres con canal medible, según el análisis anterior)`);
console.log(`Gamma negativa en ${((eventos.filter((e) => e.gammaNeg).length / eventos.length) * 100).toFixed(0)}% de los momentos\n`);
if (eventos.length < 500) { console.error("Muestra insuficiente — no se concluye nada."); process.exit(1); }

/** Evalúa una regla contra el azar. El azar = los MISMOS momentos con el lado sorteado. */
function evaluar(nombre, sel, lado) {
  const e = eventos.filter(sel);
  if (e.length < 200) { console.log(`| ${nombre} | ${e.length} | muestra corta | | | |`); return null; }
  const r = e.map((x) => lado(x) * x.siguiente);
  const acierto = (r.filter((x) => x > 0).length / r.length) * 100;
  const t = media(r) / (sd(r) / Math.sqrt(r.length));
  // CONTROL: el mismo conjunto de momentos, pero con el lado echado a suertes. Aísla la
  // DIRECCIÓN de la volatilidad — si sólo estuviéramos capturando días movidos, el sorteo daría
  // lo mismo. Semilla fija: la prueba tiene que ser repetible.
  let gana = 0; const S = 500;
  let semilla = 12345;
  for (let s = 0; s < S; s++) {
    const m2 = e.map((x) => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return (semilla % 2 ? 1 : -1) * x.siguiente; });
    if (media(m2) < media(r)) gana++;
  }
  console.log(`| ${nombre} | ${e.length.toLocaleString("es-ES")} | ${acierto.toFixed(1)}% | ${media(r).toFixed(3)} | ${t.toFixed(2)} | ${(gana / S * 100).toFixed(0)} |`);
  return { nombre, n: e.length, acierto, medio: media(r), t, percentil: (gana / S) * 100 };
}

const res = [];
console.log(`### A FAVOR del impulso — la hipótesis de la PERSECUCIÓN\n`);
console.log("| regla | n | acierto | pts / operación | t | percentil vs azar |");
console.log("|---|---|---|---|---|---|");
const aFavor = (x) => Math.sign(x.impulso);
res.push(evaluar("**gamma NEGATIVA**", (x) => x.gammaNeg, aFavor));
res.push(evaluar("gamma positiva", (x) => !x.gammaNeg, aFavor));
res.push(evaluar("gamma neg + lejos del imán (>0,3%)", (x) => x.gammaNeg && Math.abs(x.distIman) > 0.3, aFavor));
res.push(evaluar("gamma neg + alejándose del imán", (x) => x.gammaNeg && Math.sign(x.impulso) === Math.sign(x.distIman), aFavor));
res.push(evaluar("_todos (el listón)_", () => true, aFavor));

console.log(`\n### HACIA EL IMÁN — la hipótesis del AMORTIGUADOR\n`);
console.log("| regla | n | acierto | pts / operación | t | percentil vs azar |");
console.log("|---|---|---|---|---|---|");
const haciaIman = (x) => (x.distIman > 0 ? -1 : 1);
res.push(evaluar("**gamma POSITIVA**", (x) => !x.gammaNeg, haciaIman));
res.push(evaluar("gamma negativa", (x) => x.gammaNeg, haciaIman));
res.push(evaluar("gamma pos + lejos del imán (>0,3%)", (x) => !x.gammaNeg && Math.abs(x.distIman) > 0.3, haciaIman));

// ── VEREDICTO ───────────────────────────────────────────────────────────────
const buenas = res.filter(Boolean).filter((r) => r.percentil >= 95 && r.medio > 0 && !r.nombre.includes("listón"));
console.log(`\n${"═".repeat(76)}`);
if (buenas.length) {
  const b = buenas.sort((a, b2) => b2.medio - a.medio)[0];
  const opsAno = Math.round(b.n / (dias.length / 252));
  // SPY se mueve ~1/10 de SPX. Con $10.000 puestos, un punto de SPX ≈ $10.000/7700 × 1 ≈ $1,30
  const alAno = b.medio * (10000 / 7700) * opsAno;
  console.log(`  🟢 ${b.nombre}`);
  console.log(`     ${b.medio.toFixed(3)} puntos de SPX por operación · ${opsAno} operaciones/año · percentil ${b.percentil.toFixed(0)}`);
  console.log(`     con $10.000 en SPY: ~${eur(alAno)}/año ANTES de peaje`);
  console.log(`     peaje de SPY: $0,01 sobre ~$534 = 0,0019%. Con ${opsAno} operaciones son ~${eur(opsAno * 0.02 * (10000 / 534))}/año.`);
  console.log(`\n  ⚠️  ESTO ES A 30 MINUTOS, no a 5-10. Merece la pasada fina sobre las 1.123 cadenas.`);
} else {
  console.log(`  A 30 MINUTOS no aparece ni la persecución ni el amortiguador.`);
  console.log(`  Ninguna regla llega al percentil 95 del azar con ventaja positiva.`);
  console.log(`\n  ⚠️  ESTO NO CIERRA LA PREGUNTA DE LESTER. Él preguntó por 5-10 minutos, y el`);
  console.log(`      mecanismo de la persecución es a ráfagas: promediar en ventanas de 30 min es`);
  console.log(`      exactamente la forma de no verlo. La pasada fina —leer las barras de 5 min de`);
  console.log(`      las 1.123 cadenas— es la ÚNICA forma de contestarlo, y sigue pendiente.`);
}
console.log("═".repeat(76));
