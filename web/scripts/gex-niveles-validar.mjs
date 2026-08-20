// VALIDAR scripts/gex-niveles.json ABRIÉNDOLO — no contando ficheros. El recuento miente.
//
// Cuatro preguntas, en este orden:
//   1. radiografía: ¿hay algún campo muerto (todo cero, todo nulo, sin variación)?
//   2. ¿cuántos niveles salen NULOS, y en qué lente?
//   3. ¿caen los muros en sitios plausibles, o a 500 puntos del precio?
//   4. ¿aguanta la partición 2022-2023 / 2024-2026 el mínimo de muestra?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/gex-niveles-validar.mjs

import { readFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia.ts";
import { listonT } from "../lib/barreraHallazgos.ts";

const J = JSON.parse(readFileSync("scripts/gex-niveles.json", "utf8"));
const F = J.filas;

const pct = (v) => (v * 100).toFixed(1) + "%";
const P = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
const med = (v) => v.reduce((a, b) => a + b, 0) / v.length;

console.log(`\n╔══ VALIDACIÓN DE gex-niveles.json ══╗`);
console.log(`  generado ${J.generado}`);
console.log(`  ${F.length} días · ${F[0].fecha} → ${F[F.length - 1].fecha} · decisión a las ${J.hora}`);
console.log(`  descartes al construir: ${JSON.stringify(J.descartes)}`);
console.log(`  ${J.aviso}\n`);

// ── 1. RADIOGRAFÍA ─────────────────────────────────────────────────────────────────────────
// Se aplana lo que va a usar la fase que mida. Si algo está muerto, esto LANZA.
const plano = F.map((f) => ({
  apertura: f.apertura, cierre: f.cierre, movDiaPct: f.movDiaPct, rangoPct: f.rangoPct,
  // lente gamma con T real
  gamMuroCallPct: f.niveles.gam.dMuroCall?.pct ?? null,
  gamMuroPutPct: f.niveles.gam.dMuroPut?.pct ?? null,
  gamFlipPct: f.niveles.gam.dFlip?.pct ?? null,
  gamNetPct: f.niveles.gam.netPct,
  // lente gamma con T de un día
  gamDMuroCallPct: f.niveles.gamD.dMuroCall?.pct ?? null,
  gamDMuroPutPct: f.niveles.gamD.dMuroPut?.pct ?? null,
  gamDFlipPct: f.niveles.gamD.dFlip?.pct ?? null,
  gamDNetPct: f.niveles.gamD.netPct,
  // lente de interés abierto puro
  oiMuroCallPct: f.niveles.oi.dMuroCall?.pct ?? null,
  oiMuroPutPct: f.niveles.oi.dMuroPut?.pct ?? null,
  oiRatioPutCall: f.niveles.oi.ratioPutCall,
  maxPainPct: f.dMaxPain?.pct ?? null,
  strikesPerfil: f.strikesPerfil,
  peajeCallATM: f.peaje.callATM?.horquillaPct ?? null,
  peajePut05: f.peaje.put05?.horquillaPct ?? null,
}));

// La radiografía se pasa a los campos que la fase siguiente va a USAR para ordenar días.
// `strikesSinIV` y `barras5min` NO entran: son indicadores de SALUD, no predictores, y los dos
// tienen pocos valores distintos justo porque el dato está bien (78 barras siempre, cero
// strikes sin IV casi siempre). Meterlos haría saltar el guardián por la razón contraria a la
// que existe. Se imprimen aparte, abajo.
// movDiaPct y los flip pueden ser cero legítimamente (el índice cierra plano; el giro cae justo
// en el spot): no son huecos de datos.
try {
  radiografia(plano, Object.keys(plano[0]), "gex-niveles", {
    cerosLegitimos: ["movDiaPct", "gamFlipPct", "gamDFlipPct"],
  });
  console.log(`  ✅ radiografía LIMPIA: ningún campo muerto.\n`);
} catch (e) { console.log(`\n🔴 ${e.message}\n`); }

// ── salud del dato, aparte del guardián ───────────────────────────────────────────────────
const barras = new Set(F.map((f) => f.barras5min));
const sinIV = F.map((f) => f.strikesSinIV);
console.log(`── SALUD DEL DATO ──`);
console.log(`  barras de 5 min por día: ${[...barras].sort((a, b) => a - b).join(", ")}  ` +
            `(78 = 09:30→16:00 completo)`);
console.log(`  días con TODAS las barras: ${F.filter((f) => f.barras5min === 78).length} de ${F.length}`);
console.log(`  strikes en banda SIN IV utilizable: ${F.filter((f) => f.strikesSinIV === 0).length} días con cero, ` +
            `máximo en un día ${Math.max(...sinIV)} (de ${P(F.map((f) => f.strikesEnBanda), 0.5)} en banda)`);
console.log(`  sello del OI (tiene que ser < 09:30): ${[...new Set(F.map((f) => f.horaOI))].sort()[0]} → ${[...new Set(F.map((f) => f.horaOI))].sort().pop()}`);

// ── 2. NULOS POR NIVEL ─────────────────────────────────────────────────────────────────────
console.log(`── 2. NIVELES NULOS ──`);
const campos = [
  ["gam.muroCall", (f) => f.niveles.gam.muroCall], ["gam.muroPut", (f) => f.niveles.gam.muroPut],
  ["gam.flip", (f) => f.niveles.gam.flip], ["gam.imanBruto", (f) => f.niveles.gam.imanBruto],
  ["gam.imanNeto", (f) => f.niveles.gam.imanNeto],
  ["gamD.muroCall", (f) => f.niveles.gamD.muroCall], ["gamD.muroPut", (f) => f.niveles.gamD.muroPut],
  ["gamD.flip", (f) => f.niveles.gamD.flip], ["gamD.imanBruto", (f) => f.niveles.gamD.imanBruto],
  ["oi.muroCall", (f) => f.niveles.oi.muroCall], ["oi.muroPut", (f) => f.niveles.oi.muroPut],
  ["oi.imanBruto", (f) => f.niveles.oi.imanBruto], ["maxPain", (f) => f.maxPain],
  ["peaje.callATM", (f) => f.peaje.callATM?.ask], ["peaje.put05", (f) => f.peaje.put05?.ask],
];
for (const [n, g] of campos) {
  const nulos = F.filter((f) => g(f) == null).length;
  console.log(`  ${n.padEnd(16)} nulos ${String(nulos).padStart(5)} de ${F.length}  (${pct(nulos / F.length)})`);
}

// ── 3. ¿ESTÁN LOS MUROS EN SITIOS PLAUSIBLES? ─────────────────────────────────────────────
console.log(`\n── 3. DISTANCIA DE CADA NIVEL A LA APERTURA (en % del índice) ──`);
console.log(`  ${"nivel".padEnd(16)} ${"p05".padStart(8)} ${"p25".padStart(8)} ${"p50".padStart(8)} ${"p75".padStart(8)} ${"p95".padStart(8)}  | mediana en PUNTOS`);
const dists = [
  ["gam muroCall", (f) => f.niveles.gam.dMuroCall], ["gam muroPut", (f) => f.niveles.gam.dMuroPut],
  ["gam imanBruto", (f) => f.niveles.gam.dImanBruto], ["gam flip", (f) => f.niveles.gam.dFlip],
  ["gamD muroCall", (f) => f.niveles.gamD.dMuroCall], ["gamD muroPut", (f) => f.niveles.gamD.dMuroPut],
  ["gamD imanBruto", (f) => f.niveles.gamD.dImanBruto], ["gamD flip", (f) => f.niveles.gamD.dFlip],
  ["oi muroCall", (f) => f.niveles.oi.dMuroCall], ["oi muroPut", (f) => f.niveles.oi.dMuroPut],
  ["oi imanBruto", (f) => f.niveles.oi.dImanBruto], ["maxPain", (f) => f.dMaxPain],
];
for (const [n, g] of dists) {
  const v = F.map(g).filter(Boolean);
  if (!v.length) { console.log(`  ${n.padEnd(16)} SIN VALORES`); continue; }
  const p = v.map((x) => x.pct), q = v.map((x) => x.pts);
  console.log(`  ${n.padEnd(16)} ${P(p, 0.05).toFixed(2).padStart(8)} ${P(p, 0.25).toFixed(2).padStart(8)} ${P(p, 0.5).toFixed(2).padStart(8)} ${P(p, 0.75).toFixed(2).padStart(8)} ${P(p, 0.95).toFixed(2).padStart(8)}  | ${P(q, 0.5).toFixed(1)} pts`);
}

// EL AVISO QUE IMPORTA: ¿colapsa la lente al dinero? Un "muro" a menos de medio paso de strike
// del precio no es un nivel: es el precio con otro nombre.
console.log(`\n  ¿colapsa el muro al dinero? (|distancia| ≤ 5 puntos = el strike de al lado)`);
for (const [n, g] of dists) {
  const v = F.map(g).filter(Boolean);
  if (!v.length) continue;
  const pegados = v.filter((x) => Math.abs(x.pts) <= 5).length;
  const lejos = v.filter((x) => Math.abs(x.pct) > 3).length;
  console.log(`  ${n.padEnd(16)} pegados al precio ${pct(pegados / v.length).padStart(6)} · a más del 3% ${pct(lejos / v.length).padStart(6)}`);
}

// ── el movimiento real del día, para saber contra qué se compara ──
console.log(`\n── 4. EL MOVIMIENTO DEL DÍA (09:35 → 16:00), para calibrar qué es "lejos" ──`);
const mv = F.map((f) => Math.abs(f.movDiaPct)), rg = F.map((f) => f.rangoPct);
console.log(`  |cierre − apertura|  p25 ${P(mv, 0.25).toFixed(2)}%  p50 ${P(mv, 0.5).toFixed(2)}%  p75 ${P(mv, 0.75).toFixed(2)}%  p95 ${P(mv, 0.95).toFixed(2)}%`);
console.log(`  rango (máx − mín)    p25 ${P(rg, 0.25).toFixed(2)}%  p50 ${P(rg, 0.5).toFixed(2)}%  p75 ${P(rg, 0.75).toFixed(2)}%  p95 ${P(rg, 0.95).toFixed(2)}%`);
console.log(`  → en puntos, a la mediana de apertura (${P(F.map((f) => f.apertura), 0.5).toFixed(0)}): ` +
            `movimiento ${(P(mv, 0.5) / 100 * P(F.map((f) => f.apertura), 0.5)).toFixed(1)} pts · rango ${(P(rg, 0.5) / 100 * P(F.map((f) => f.apertura), 0.5)).toFixed(1)} pts`);

// ── 5. EL PEAJE REAL DEL VEHÍCULO ─────────────────────────────────────────────────────────
console.log(`\n── 5. EL PEAJE, con bid/ask REALES de las ${J.hora} ──`);
for (const [n, g] of [["call ATM", (f) => f.peaje.callATM], ["put ATM", (f) => f.peaje.putATM],
                      ["call +0,5%", (f) => f.peaje.call05], ["put −0,5%", (f) => f.peaje.put05]]) {
  const v = F.map(g).filter((x) => x && x.horquillaPct != null && x.ask > 0);
  const h = v.map((x) => x.horquillaPct), pr = v.map((x) => (x.bid + x.ask) / 2);
  console.log(`  SPXW ${n.padEnd(11)} n=${v.length} · horquilla ${P(h, 0.25).toFixed(1)}/${P(h, 0.5).toFixed(1)}/${P(h, 0.75).toFixed(1)}% de la prima` +
              ` · prima mediana $${P(pr, 0.5).toFixed(2)} (=$${(P(pr, 0.5) * 100).toFixed(0)} por contrato)`);
  console.log(`     → cruzar la horquilla cuesta $${(P(h, 0.5) / 100 * P(pr, 0.5) * 100).toFixed(0)} por contrato ida, ` +
              `$${(2 * P(h, 0.5) / 100 * P(pr, 0.5) * 100).toFixed(0)} ida y vuelta`);
}
console.log(`  SPY (acciones)  horquilla $0,01 sobre ~$${(P(F.map((f) => f.apertura), 0.5) / 10).toFixed(0)} = ` +
            `${(0.01 / (P(F.map((f) => f.apertura), 0.5) / 10) * 100).toFixed(3)}% — tres órdenes de magnitud menos`);

// ── 6. LA PARTICIÓN ────────────────────────────────────────────────────────────────────────
console.log(`\n── 6. PARTIR LA MUESTRA ──`);
const A = F.filter((f) => f.fecha < "2024-01-01"), B = F.filter((f) => f.fecha >= "2024-01-01");
console.log(`  2022-2023  n=${A.length}   (${A[0]?.fecha} → ${A[A.length - 1]?.fecha})`);
console.log(`  2024-2026  n=${B.length}   (${B[0]?.fecha} → ${B[B.length - 1]?.fecha})`);
console.log(`  mínimo de muestra del proyecto: 200 por mitad → ${A.length >= 200 && B.length >= 200 ? "✅ las dos pasan" : "🔴 NO llega"}`);
console.log(`  listón de |t| con 1 prueba ${listonT(1)} · con 10 pruebas ${listonT(10)} · con 30 ${listonT(30)}`);
const porAno = {};
for (const f of F) porAno[f.fecha.slice(0, 4)] = (porAno[f.fecha.slice(0, 4)] || 0) + 1;
console.log(`  por año: ${Object.entries(porAno).map(([a, n]) => `${a}:${n}`).join(" · ")}`);

// ── 7. UN DÍA ENTERO, IMPRESO ─────────────────────────────────────────────────────────────
console.log(`\n── 7. UN DÍA COMPLETO, PARA MIRARLO CON LOS OJOS ──`);
const ej = F.find((f) => f.fecha === "2025-06-16") || F[Math.floor(F.length / 2)];
console.log(JSON.stringify(ej, null, 2).split("\n").slice(0, 70).join("\n"));

// ── 8. ¿SON DISTINTAS LAS TRES LENTES? ────────────────────────────────────────────────────
// Si las tres dan el mismo strike siempre, hay UNA lente, no tres, y decirlo importa.
console.log(`\n── 8. ¿COINCIDEN LAS TRES LENTES? (mismo strike exacto) ──`);
const par = (a, b) => {
  const v = F.filter((f) => a(f) != null && b(f) != null);
  return `${pct(v.filter((f) => a(f) === b(f)).length / v.length)} (n=${v.length})`;
};
console.log(`  muroCall  gam=gamD ${par((f) => f.niveles.gam.muroCall, (f) => f.niveles.gamD.muroCall)}` +
            ` · gam=oi ${par((f) => f.niveles.gam.muroCall, (f) => f.niveles.oi.muroCall)}` +
            ` · gamD=oi ${par((f) => f.niveles.gamD.muroCall, (f) => f.niveles.oi.muroCall)}`);
console.log(`  muroPut   gam=gamD ${par((f) => f.niveles.gam.muroPut, (f) => f.niveles.gamD.muroPut)}` +
            ` · gam=oi ${par((f) => f.niveles.gam.muroPut, (f) => f.niveles.oi.muroPut)}` +
            ` · gamD=oi ${par((f) => f.niveles.gamD.muroPut, (f) => f.niveles.oi.muroPut)}`);
console.log(`  muroCall = muroPut dentro de la misma lente:` +
            ` gam ${par((f) => f.niveles.gam.muroCall, (f) => f.niveles.gam.muroPut)}` +
            ` · gamD ${par((f) => f.niveles.gamD.muroCall, (f) => f.niveles.gamD.muroPut)}` +
            ` · oi ${par((f) => f.niveles.oi.muroCall, (f) => f.niveles.oi.muroPut)}`);

// ── 9. EL SIGNO ────────────────────────────────────────────────────────────────────────────
console.log(`\n── 9. EL SIGNO DE LA GAMMA NETA (supuesto de calle: Σcalls − Σputs) ──`);
for (const l of ["gam", "gamD"]) {
  const n = F.map((f) => f.niveles[l].netPct);
  const pos = n.filter((x) => x > 0).length;
  console.log(`  ${l.padEnd(5)} positiva ${pct(pos / n.length)} de los días · net $/1% p25 ${P(n, 0.25).toExponential(2)} · p50 ${P(n, 0.5).toExponential(2)} · p75 ${P(n, 0.75).toExponential(2)}`);
  const a = F.map((f) => f.niveles[l].absPct);
  console.log(`        bruta (sin signo) p50 $${P(a, 0.5).toExponential(2)} por 1% · p50 $${P(F.map((f) => f.niveles[l].absPunto), 0.5).toExponential(2)} por punto`);
}
console.log(`\n  Nota: net y abs se dan en las DOS unidades. La fórmula del encargo (×S²×0,01) es`);
console.log(`  $ por cada 1% de movimiento; "$ por punto" es la misma sin el S×0,01.`);

// ── 10. ¿ES EL MURO UN NIVEL, O EL PRECIO CON OTRO NOMBRE? ────────────────────────────────
// La pregunta que decide si esto vale algo. Si el "muro de calls" es siempre el strike de
// justo encima del precio, no informa de nada: es el precio redondeado.
console.log(`\n── 10. ¿ES UN NIVEL O ES EL PRECIO CON OTRO NOMBRE? ──`);
const paso = 5;   // la rejilla de SPXW cerca del dinero
for (const [n, g] of [["gam muroCall", (f) => f.niveles.gam.muroCall], ["gamD muroCall", (f) => f.niveles.gamD.muroCall],
                      ["oi muroCall", (f) => f.niveles.oi.muroCall]]) {
  const v = F.filter((f) => g(f) != null);
  const vecino = v.filter((f) => g(f) === Math.ceil(f.apertura / paso) * paso).length;
  console.log(`  ${n.padEnd(14)} = el strike de JUSTO ENCIMA del precio en ${pct(vecino / v.length)} de los días`);
}
for (const [n, g] of [["gam muroPut", (f) => f.niveles.gam.muroPut], ["gamD muroPut", (f) => f.niveles.gamD.muroPut],
                      ["oi muroPut", (f) => f.niveles.oi.muroPut]]) {
  const v = F.filter((f) => g(f) != null);
  const vecino = v.filter((f) => g(f) === Math.floor(f.apertura / paso) * paso).length;
  console.log(`  ${n.padEnd(14)} = el strike de JUSTO DEBAJO del precio en ${pct(vecino / v.length)} de los días`);
}
console.log(`  ¿cuántos strikes DISTINTOS usa cada lente como muro de calls (medido en pasos de 5)?`);
for (const [n, g] of [["gam", (f) => f.niveles.gam], ["gamD", (f) => f.niveles.gamD], ["oi", (f) => f.niveles.oi]]) {
  const d = F.map((f) => Math.round((g(f).muroCall - f.apertura) / paso)).filter(Number.isFinite);
  console.log(`    ${n.padEnd(5)} pasos por encima del precio: p10 ${P(d, 0.1)} · p50 ${P(d, 0.5)} · p90 ${P(d, 0.9)} · valores distintos ${new Set(d).size}`);
}

// ── 11. ¿LLEGA EL PRECIO A ESOS NIVELES? — la tasa base, sin la que nada significa nada ────
// Esto NO es el hallazgo: es el suelo contra el que la fase siguiente tiene que comparar.
console.log(`\n── 11. TASA BASE: ¿TOCA EL PRECIO EL NIVEL ANTES DEL CIERRE? ──`);
console.log(`  (máximo/mínimo MUESTREADOS cada 5 min — el toque real puede ser algo mayor)`);
for (const [n, g] of [["gam muroCall", (f) => f.niveles.gam.muroCall], ["gamD muroCall", (f) => f.niveles.gamD.muroCall],
                      ["oi muroCall", (f) => f.niveles.oi.muroCall], ["maxPain", (f) => f.maxPain]]) {
  const v = F.filter((f) => g(f) != null && g(f) > f.apertura);
  console.log(`  ${n.padEnd(14)} por ENCIMA en ${String(v.length).padStart(4)} días · el precio lo toca en ${pct(v.filter((f) => f.maxMuestreado >= g(f)).length / v.length)}`);
}
for (const [n, g] of [["gam muroPut", (f) => f.niveles.gam.muroPut], ["gamD muroPut", (f) => f.niveles.gamD.muroPut],
                      ["oi muroPut", (f) => f.niveles.oi.muroPut], ["maxPain", (f) => f.maxPain]]) {
  const v = F.filter((f) => g(f) != null && g(f) < f.apertura);
  console.log(`  ${n.padEnd(14)} por DEBAJO en ${String(v.length).padStart(4)} días · el precio lo toca en ${pct(v.filter((f) => f.minMuestreado <= g(f)).length / v.length)}`);
}

// ── 12. CONTRASTE CON LA CONSTRUCCIÓN QUE YA HABÍA (las 11:00) ────────────────────────────
// cola-gex-filas.json se construyó aparte, con otro momento del día y otra banda de strikes.
// Si los dos ficheros no coinciden en lo que TIENE que coincidir (el cierre), algo está roto.
try {
  const B = JSON.parse(readFileSync("scripts/cola-gex-filas.json", "utf8"));
  const m = new Map(B.map((f) => [f.fecha, f]));
  const p = F.map((a) => [a, m.get(a.fecha)]).filter((x) => x[1]);
  const corr = (x, y) => {
    const n = x.length, mx = med(x), my = med(y);
    let sxy = 0, sx = 0, sy = 0;
    for (let i = 0; i < n; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sx += dx * dx; sy += dy * dy; }
    return sxy / Math.sqrt(sx * sy);
  };
  console.log(`\n── 12. CONTRASTE CON scripts/cola-gex-filas.json (construido aparte, a las 11:00) ──`);
  console.log(`  días solapados: ${p.length}`);
  const dc = p.map((x) => Math.abs(x[0].cierre - x[1].cierre));
  console.log(`  cierre del día: |diferencia| máxima ${Math.max(...dc).toFixed(4)} → ${Math.max(...dc) === 0 ? "IDÉNTICO ✅" : "🔴 NO cuadra"}`);
  console.log(`  gamma bruta:  corr ${corr(p.map((x) => x[0].niveles.gam.absPct), p.map((x) => x[1].gexAbs)).toFixed(3)} · ` +
              `razón 09:35/11:00 p50 ${P(p.map((x) => x[0].niveles.gam.absPct / x[1].gexAbs), 0.5).toFixed(2)}`);
  console.log(`  gamma neta:   corr ${corr(p.map((x) => x[0].niveles.gam.netPct), p.map((x) => x[1].gexNet)).toFixed(3)} · ` +
              `mismo signo ${pct(p.filter((x) => Math.sign(x[0].niveles.gam.netPct) === Math.sign(x[1].gexNet)).length / p.length)}`);
  console.log(`  (el signo NO tiene por qué coincidir siempre: son dos horas distintas del día)`);
} catch (e) { console.log(`\n── 12. sin contraste: ${e.message}`); }

// ── 13. EL CANAL DE MUROS ─────────────────────────────────────────────────────────────────
// Si el muro de calls cae POR DEBAJO del de puts, el "canal" no existe ese día. Hay que saber
// en cuántos días pasa ANTES de diseñar nada que use los dos muros a la vez.
console.log(`\n── 13. EL CANAL ENTRE LOS DOS MUROS ──`);
const rangoPts = F.map((f) => f.maxMuestreado - f.minMuestreado);
console.log(`  rango real del día, en puntos: p25 ${P(rangoPts, 0.25).toFixed(0)} · p50 ${P(rangoPts, 0.5).toFixed(0)} · p75 ${P(rangoPts, 0.75).toFixed(0)}`);
for (const l of ["gam", "gamD", "oi"]) {
  const v = F.filter((f) => f.niveles[l].muroCall != null && f.niveles[l].muroPut != null && f.niveles[l].muroCall > f.niveles[l].muroPut);
  const dentro = v.filter((f) => f.maxMuestreado <= f.niveles[l].muroCall && f.minMuestreado >= f.niveles[l].muroPut).length;
  const anchos = v.map((f) => f.niveles[l].muroCall - f.niveles[l].muroPut);
  console.log(`  ${l.padEnd(5)} canal válido ${String(v.length).padStart(4)} días · ancho mediano ${P(anchos, 0.5).toFixed(0)} pts · el día entero cabe dentro en ${pct(dentro / v.length)}`);
  const inv = F.length - v.length;
  if (inv) console.log(`        🔻 en ${inv} días (${pct(inv / F.length)}) el muro de calls está POR DEBAJO del de puts: NO hay canal`);
}

// ── 14. EL VEHÍCULO QUE SÍ PUEDE COMPRAR ─────────────────────────────────────────────────
console.log(`\n── 14. SPY: el vehículo real ──`);
const conSPY = F.filter((f) => f.spy);
console.log(`  días con SPY minuto a minuto: ${conSPY.length} de ${F.length} (faltan ${F.length - conSPY.length}, todos de ${[...new Set(F.filter((f) => !f.spy).map((f) => f.fecha.slice(0, 4)))].join("/")})`);
const raz = conSPY.map((f) => f.spy.razonSPX);
console.log(`  razón SPX/SPY: min ${Math.min(...raz).toFixed(3)} · p50 ${P(raz, 0.5).toFixed(3)} · max ${Math.max(...raz).toFixed(3)}`);
console.log(`  → NO es 10 fijo. La deriva (${((Math.max(...raz) - Math.min(...raz)) / P(raz, 0.5) * 100).toFixed(2)}%) vale ${(((Math.max(...raz) - Math.min(...raz)) / P(raz, 0.5)) * P(F.map((f) => f.apertura), 0.5)).toFixed(0)} puntos de SPX,`);
console.log(`    MÁS que la distancia mediana al muro de la lente gam (${P(F.map((f) => Math.abs(f.niveles.gam.dMuroCall.pts)), 0.5).toFixed(0)} pts). Convertir día a día con razonSPX.`);
// coherencia: el movimiento del día tiene que ser el mismo en los dos
const mvSPX = conSPY.map((f) => (f.cierre - f.apertura) / f.apertura * 100);
const mvSPY = conSPY.map((f) => (f.spy.cierre - f.spy.apertura) / f.spy.apertura * 100);
const dif = mvSPX.map((v, i) => Math.abs(v - mvSPY[i]));
console.log(`  coherencia SPX vs SPY (mismo movimiento del día, en %): |dif| p50 ${P(dif, 0.5).toFixed(3)} pp · p99 ${P(dif, 0.99).toFixed(3)} pp · max ${Math.max(...dif).toFixed(3)} pp`);
console.log(`  peaje de SPY: $0,01 fijo sobre ~$${(P(conSPY.map((f) => f.spy.apertura), 0.5)).toFixed(0)} = ${(0.01 / P(conSPY.map((f) => f.spy.apertura), 0.5) * 100).toFixed(4)}% ida.`);
console.log(`    Un movimiento de 10 puntos de SPX = $${(10 / P(raz, 0.5)).toFixed(2)} de SPY = ${((10 / P(raz, 0.5)) / P(conSPY.map((f) => f.spy.apertura), 0.5) * 100).toFixed(2)}% → el peaje se lleva el ${(0.02 / (10 / P(raz, 0.5)) * 100).toFixed(1)}% del recorrido (ida y vuelta).`);
console.log(``);
