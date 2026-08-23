// LENTE 2 (2ª parte) — LA CAJA EN FRÍO y de dónde sale realmente la «menor racha en contra».
//
// ═══ QUÉ MIDE Y POR QUÉ ═════════════════════════════════════════════════════════════════════
//
// La primera parte confirmó los números del hallazgo al céntimo. Quedan dos preguntas que el
// $/año no contesta y que deciden si esto se puede operar:
//
// 1) LA CAJA EN FRÍO. Simular desde el primer día del banco es hacer trampa sin querer: para
//    cuando llega el día malo de diciembre de 2024, la estrategia ya lleva $20.000 de beneficio
//    acumulado que amortiguan el golpe. Lester NO empieza con ese colchón: empieza con $7.977
//    de efectivo, de los que Robinhood le retiene $5.000 en cuanto abre el cóndor. El colchón
//    real es de $2.977. Así que aquí se arranca la simulación en CADA una de las operaciones
//    de la muestra y se cuenta en cuántos arranques se queda sin poder poner el colateral del
//    día siguiente. Un $/año que sólo existe si empiezas en 2022 no es un $/año.
//
// 2) ¿DE DÓNDE SALE LA «RACHA EN CONTRA DE SÓLO −$3.395» DE LAS 11:20? El hallazgo la propone
//    como la elección prudente. Pero si su caída es menor porque ese día concreto no lo opera
//    o le sale distinto por azar, entonces no es prudencia, es un día de suerte. Se comparan
//    las dos variantes DÍA A DÍA sobre los mismos días.
//
// Mismas reglas de la casa: precios reales, sólo el pasado, 244 días de mercado al año.
//
// Uso: node --import tsx scripts/v2-lente2-caja-fria.mjs

import { diasDisponibles, cargarDia, rejilla, condor, estructura, hayHora, resumen } from "./lib0dte.mjs";

const ANCHO = 45, ALA = 50, COMISION = 0.24;
const MA_CORTA = 5, MA_LARGA = 50, DIAS_ANO = 244;
const COLATERAL = 5000, EFECTIVO = 7977;
const HORAS = ["11:00", "11:20"];

const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const eur = (x) => (x < 0 ? "−$" : "$") + Math.round(Math.abs(x)).toLocaleString("es-ES");

const dias = diasDisponibles();
const R = [];
for (const d of dias) {
  const dia = cargarDia(d);
  if (!dia) continue;
  const cierre = dia.barras[dia.barras.length - 1].spot;
  const porHora = {};
  for (const hh of HORAS) {
    const i = hayHora(dia, hh);
    if (i < 0) { porHora[hh] = null; continue; }
    const spot = dia.barras[i].spot;
    const r = estructura(dia, i, "vencimiento", condor(rejilla(spot), ANCHO, ALA));
    porHora[hh] = r ? { spot, credito: r.credito * 100, dolares: r.dolares - COMISION, riesgo: r.riesgoMax } : null;
  }
  R.push({ dia: d, cierre, porHora });
}
const cierres = R.map((x) => x.cierre);
for (let i = 0; i < R.length; i++) {
  if (i < MA_LARGA) { R[i].ma5 = null; continue; }
  R[i].ma5 = media(cierres.slice(i - MA_CORTA, i));
  R[i].ma50 = media(cierres.slice(i - MA_LARGA, i));
}
const CONMA = R.filter((x) => x.ma50 != null);
const ANOS = CONMA.length / DIAS_ANO;
console.log(`${CONMA.length} días con medias (${CONMA[0].dia} → ${CONMA[CONMA.length - 1].dia}) = ${ANOS.toFixed(2)} años\n`);

function correr(hora, umbral) {
  const ops = [];
  for (const x of CONMA) {
    const c = x.porHora[hora];
    if (!c) continue;
    if (c.spot > x.ma5 && c.spot > x.ma50 && c.credito >= umbral)
      ops.push({ dia: x.dia, pl: c.dolares, credito: c.credito, riesgo: c.riesgo });
  }
  return ops;
}
const V = [
  { et: "11:00/$100 (la que opera)", h: "11:00", u: 100 },
  { et: "11:00/$50  (la «mejor»)", h: "11:00", u: 50 },
  { et: "11:20/$50  (la «prudente»)", h: "11:20", u: 50 },
];

// ══════════════════════════════════════════════════════════════════════════════════════════
//  F1 — ARRANQUE EN FRÍO desde cada punto de la muestra
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("=".repeat(102));
console.log("  F1 · ARRANQUE EN FRÍO — $7.977 de efectivo, $5.000 retenidos, 1 contrato");
console.log("       Se arranca en CADA operación de la muestra y se mira si en algún momento el");
console.log("       efectivo baja de los $5.000 que hacen falta para abrir el cóndor siguiente.");
console.log("=".repeat(102) + "\n");

function desde(ops, k, cash0) {
  let cash = cash0, minCash = cash0, opsHechas = 0, diaParo = null;
  for (let i = k; i < ops.length; i++) {
    if (cash < COLATERAL) { diaParo = ops[i].dia; break; }
    cash += ops[i].pl; opsHechas++;
    if (cash < minCash) minCash = cash;
  }
  return { paro: diaParo, opsHechas, minCash, cash };
}

const resF1 = {};
for (const v of V) {
  const ops = correr(v.h, v.u);
  let paros = 0; const detalle = [];
  for (let k = 0; k < ops.length; k++) {
    const s = desde(ops, k, EFECTIVO);
    if (s.paro) { paros++; if (detalle.length < 6) detalle.push(`arrancando el ${ops[k].dia} se para el ${s.paro} tras ${s.opsHechas} ops`); }
  }
  resF1[v.et] = paros / ops.length;
  console.log(`  ${v.et}:  se queda SIN PODER OPERAR en ${paros} de ${ops.length} arranques posibles (${(100 * paros / ops.length).toFixed(1)} %)`);
  for (const d of detalle) console.log(`     · ${d}`);
  // cuánto efectivo haría falta para no pararse NUNCA, empiece donde empiece
  let lo = EFECTIVO, hi = 40000;
  while (hi - lo > 25) { const m = (lo + hi) / 2; let ok = true; for (let k = 0; k < ops.length; k++) if (desde(ops, k, m).paro) { ok = false; break; } if (ok) hi = m; else lo = m; }
  console.log(`     efectivo mínimo para no pararse NUNCA, empiece cuando empiece: ${eur(hi)}  (tiene ${eur(EFECTIVO)})`);
  // colchón necesario: peor día
  const peor = Math.min(...ops.map((o) => o.pl));
  console.log(`     peor día ${eur(peor)} → con $7.977 el efectivo quedaría en ${eur(EFECTIVO + peor)}; hace falta ${eur(COLATERAL)} para seguir → ${EFECTIVO + peor >= COLATERAL ? "SIGUE" : "**SE PARA**"}`);
  // cuántas operaciones de colchón hacen falta antes de aguantar el peor día
  const faltan = COLATERAL - (EFECTIVO + peor);
  if (faltan > 0) {
    const mediana = [...ops.map((o) => o.pl)].sort((a, b) => a - b)[Math.floor(ops.length / 2)];
    console.log(`     le faltarían ${eur(faltan)} de colchón = ${Math.ceil(faltan / mediana)} operaciones medianas (${eur(mediana)} cada una) ≈ ${(Math.ceil(faltan / mediana) / (ops.length / ANOS) * 12).toFixed(1)} meses sin un día malo`);
  }
  console.log("");
}

// ══════════════════════════════════════════════════════════════════════════════════════════
//  F2 — LAS 11:20 CONTRA LAS 11:00, DÍA A DÍA
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("=".repeat(102));
console.log("  F2 · ¿LAS 11:20 SON MÁS PRUDENTES, O SIMPLEMENTE SE LIBRARON DE DOS DÍAS?");
console.log("=".repeat(102) + "\n");
const a11 = correr("11:00", 50), a1120 = correr("11:20", 50);
const m11 = new Map(a11.map((o) => [o.dia, o])), m1120 = new Map(a1120.map((o) => [o.dia, o]));
const soloA = a11.filter((o) => !m1120.has(o.dia)), soloB = a1120.filter((o) => !m11.has(o.dia));
const comunes = a11.filter((o) => m1120.has(o.dia));
console.log(`  días que opera 11:00: ${a11.length} · que opera 11:20: ${a1120.length} · EN COMÚN: ${comunes.length}`);
console.log(`  sólo 11:00 (${soloA.length} días): ${eur(suma(soloA.map((o) => o.pl)))}  ·  sólo 11:20 (${soloB.length} días): ${eur(suma(soloB.map((o) => o.pl)))}`);
console.log(`  en los ${comunes.length} días comunes: 11:00 ${eur(suma(comunes.map((o) => o.pl)))} · 11:20 ${eur(suma(comunes.map((o) => m1120.get(o.dia).pl)))}`);
const gana20 = comunes.filter((o) => m1120.get(o.dia).pl > o.pl).length;
console.log(`  en los días comunes, las 11:20 salen mejor ${gana20} veces de ${comunes.length} (${(100 * gana20 / comunes.length).toFixed(0)}%)\n`);

console.log("  LOS DÍAS GRANDES, LADO A LADO (los que mueven la caída máxima):");
console.log("  | día | 11:00/$50 | 11:20/$50 | ¿quién opera? |");
console.log("  |---|---|---|---|");
const grandes = [...new Set([...a11, ...a1120].map((o) => o.dia))]
  .filter((d) => Math.abs(m11.get(d)?.pl ?? 0) > 700 || Math.abs(m1120.get(d)?.pl ?? 0) > 700)
  .sort();
for (const d of grandes) {
  const x = m11.get(d), y = m1120.get(d);
  console.log(`  | ${d} | ${x ? eur(x.pl) : "no opera"} | ${y ? eur(y.pl) : "no opera"} | ${x && y ? "ambas" : x ? "sólo 11:00" : "sólo 11:20"} |`);
}

// el experimento decisivo: dar a las 11:20 los días que se saltó, valorados a su propia hora
console.log("\n  EL EXPERIMENTO: los 2 días de pérdida máxima de las 11:00 (2024-12-18 y 2025-11-20)");
for (const d of ["2024-12-18", "2025-11-20", "2026-06-17", "2025-01-31"]) {
  const x = R.find((z) => z.dia === d);
  const c0 = x.porHora["11:00"], c1 = x.porHora["11:20"];
  const f = (c) => c ? `spot ${c.spot.toFixed(1)} créd ${eur(c.credito)} → ${eur(c.dolares)} · filtros: MA5 ${c.spot > x.ma5 ? "SÍ" : "no"} MA50 ${c.spot > x.ma50 ? "SÍ" : "no"} créd≥50 ${c.credito >= 50 ? "SÍ" : "no"}` : "sin cadena";
  console.log(`   ${d}:`);
  console.log(`      11:00 → ${f(c0)}`);
  console.log(`      11:20 → ${f(c1)}`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════
//  F3 — LA COLA EN EL TIEMPO: ¿los días malos son viejos o nuevos?
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "=".repeat(102));
console.log("  F3 · ¿DÓNDE VIVEN LOS DÍAS MALOS EN EL CALENDARIO?");
console.log("=".repeat(102) + "\n");
for (const v of V) {
  const ops = correr(v.h, v.u);
  const malos = ops.filter((o) => o.pl < -1000);
  console.log(`  ${v.et}: ${malos.length} días con pérdida > $1.000 → ${malos.map((o) => `${o.dia} ${eur(o.pl)}`).join(" · ")}`);
  const porAno = {};
  for (const o of malos) porAno[o.dia.slice(0, 4)] = (porAno[o.dia.slice(0, 4)] || 0) + 1;
  console.log(`     por año: ${Object.entries(porAno).map(([a, n]) => `${a}:${n}`).join(" · ") || "ninguno"}`);
  // primera mitad vs segunda mitad de la muestra
  const mit = Math.floor(ops.length / 2);
  const m1 = ops.slice(0, mit).filter((o) => o.pl < -1000).length, m2 = ops.slice(mit).filter((o) => o.pl < -1000).length;
  console.log(`     1ª mitad de la muestra: ${m1} días malos · 2ª mitad: ${m2} días malos\n`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════
//  F4 — SANIDAD DE LOS CRÉDITOS RAROS, contra el fichero crudo
// ══════════════════════════════════════════════════════════════════════════════════════════
console.log("=".repeat(102));
console.log("  F4 · LOS CRÉDITOS FUERA DEL RANGO DE CORDURA ($20–$600) — patas una a una");
console.log("=".repeat(102) + "\n");
for (const d of ["2022-12-14", "2023-02-01", "2022-07-27", "2026-06-17"]) {
  const dia = cargarDia(d);
  const i = hayHora(dia, "11:00");
  const spot = dia.barras[i].spot, centro = rejilla(spot);
  const patas = condor(centro, ANCHO, ALA);
  console.log(`  ${d} 11:00 · spot ${spot.toFixed(2)} · centro ${centro}`);
  for (const p of patas) {
    const par = dia.barras[i].o.get(p.K + p.lado);
    console.log(`     ${p.dir === -1 ? "VENDE" : "compra"} ${p.K}${p.lado}: bid ${par?.[0]} ask ${par?.[1]}  → aporta ${p.dir === -1 ? "+" + par?.[0] : "−" + par?.[1]}`);
  }
  const r = estructura(dia, i, "vencimiento", patas);
  console.log(`     crédito ${eur(r.credito * 100)} · riesgo máx ${eur(r.riesgoMax)} · cierre SPX ${dia.barras[77].spot.toFixed(2)} · resultado ${eur(r.dolares - COMISION)}\n`);
}
