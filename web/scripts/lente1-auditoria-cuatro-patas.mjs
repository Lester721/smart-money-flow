// LENTE 1 — AUDITORÍA DE LA CONTABILIDAD DE LAS CUATRO PATAS
//
// ═══ QUÉ HACE Y POR QUÉ ═════════════════════════════════════════════════════════════════════
//
// El hallazgo «los tres síes entrando más tarde» vende un cóndor de hierro: cuatro patas, dos
// vendidas y dos compradas, abiertas de golpe y liquidadas a vencimiento. Es la operación donde
// más fácil es engañarse: basta invertir un bid por un ask en una sola pata para inventarse
// dinero que nunca existió, y el error no da ningún aviso — sale un número perfectamente creíble.
//
// Aquí NO se confía en lib0dte. Se vuelve a calcular la operación entera leyendo los CSV
// originales con un lector escrito desde cero, línea a línea, y se compara céntimo a céntimo
// contra lo que devuelve estructura(). Además se imprime la fila exacta del CSV de cada pata
// para poder comprobarlo a ojo con grep.
//
// Se comprueban seis cosas:
//   1. Las dos patas VENDIDAS se cobran al BID y las dos COMPRADAS se pagan al ASK, al abrir.
//   2. Al liquidar a vencimiento se usa el intrínseco contra el spot REAL de las 16:00.
//   3. El crédito que decide el filtro (≥$50 / ≥$100) es el crédito NETO ejecutable, no el punto
//      medio.
//   4. El riesgo máximo es (ancho del ala − crédito) y el colateral que Robinhood retiene de
//      verdad son $5.000 por vertical de ancho 50.
//   5. Los strikes existen de verdad en la cadena de ese día (nada de strikes teóricos).
//   6. El spot que se usa para elegir strikes es el de la MISMA fila que las cotizaciones.
//
// Uso: node --import tsx scripts/lente1-auditoria-cuatro-patas.mjs

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { diasDisponibles, cargarDia, rejilla, condor, estructura, hayHora, DIR_CADENA } from "./lib0dte.mjs";

const ANCHO = 45, ALA = 50, COMISION = 0.24, MA_CORTA = 5, MA_LARGA = 50, DIAS_ANO = 244;
const media = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const eur = (x) => (x < 0 ? "−$" : "$") + Math.abs(x).toFixed(2);

// ═══ LECTOR INDEPENDIENTE ═══════════════════════════════════════════════════════════════════
// Escrito desde cero, sin tocar lib0dte. Devuelve TODAS las filas crudas de un día/hora/strike.
function filasCrudas(dia, lado, hhmm, strike) {
  const ruta = join(DIR_CADENA, `iv_${dia}_${lado}.csv`);
  const txt = readFileSync(ruta, "utf8");
  const lineas = txt.split("\n");
  const cab = lineas[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const iK = cab.indexOf("strike"), iT = cab.indexOf("timestamp");
  const iB = cab.indexOf("bid"), iA = cab.indexOf("ask"), iU = cab.indexOf("underlying_price");
  const iM = cab.indexOf("midpoint");
  const out = [];
  for (let n = 1; n < lineas.length; n++) {
    const L = lineas[n];
    if (!L) continue;
    const c = L.split(",");
    if (c[iT].slice(11, 16) !== hhmm) continue;
    if (+String(c[iK]).replace(/"/g, "") !== strike) continue;
    out.push({ linea: L, K: +c[iK], t: c[iT], bid: +c[iB], ask: +c[iA], mid: +c[iM], spot: +c[iU] });
  }
  return out;
}

// ═══ RECONSTRUIR LAS OPERACIONES DE LA REGLA ════════════════════════════════════════════════
const HORAS_AUD = ["11:00", "11:20"];
const dias = diasDisponibles();
console.log(`Días en el banco: ${dias.length} (${dias[0]} → ${dias[dias.length - 1]})`);

const R = [];
let huecos = 0, intentos = 0;
for (const d of dias) {
  const dia = cargarDia(d);
  if (!dia) continue;
  const ult = dia.barras[dia.barras.length - 1];
  const porHora = {};
  for (const hh of HORAS_AUD) {
    const i = hayHora(dia, hh);
    if (i < 0) { porHora[hh] = null; continue; }
    intentos++;
    const spot = dia.barras[i].spot;
    const centro = rejilla(spot);
    const patas = condor(centro, ANCHO, ALA);
    const r = estructura(dia, i, "vencimiento", patas);
    if (!r) { porHora[hh] = null; huecos++; continue; }
    porHora[hh] = { i, spot, centro, patas, credito: r.credito * 100, dolares: r.dolares - COMISION,
                    riesgo: r.riesgoMax, crudo: r };
  }
  R.push({ dia: d, cierre: ult.spot, tUlt: ult.t, nBarras: dia.barras.length, porHora });
}
const cierres = R.map((x) => x.cierre);
for (let i = 0; i < R.length; i++) {
  if (i < MA_LARGA) { R[i].ma5 = null; R[i].ma50 = null; continue; }
  R[i].ma5 = media(cierres.slice(i - MA_CORTA, i));
  R[i].ma50 = media(cierres.slice(i - MA_LARGA, i));
}
const CONMA = R.filter((x) => x.ma50 != null);
const ANOS = CONMA.length / DIAS_ANO;
console.log(`Días con las dos medias: ${CONMA.length} = ${ANOS.toFixed(2)} años · huecos ${huecos}/${intentos}\n`);

function ops(hora, umbral) {
  const o = [];
  for (const x of CONMA) {
    const c = x.porHora[hora];
    if (!c) continue;
    if (c.spot > x.ma5 && c.spot > x.ma50 && c.credito >= umbral)
      o.push({ dia: x.dia, cierre: x.cierre, tUlt: x.tUlt, ...c });
  }
  return o;
}

const O1100 = ops("11:00", 50), O1120 = ops("11:20", 50);
const suma = (v) => v.reduce((a, b) => a + b, 0);
console.log(`11:00/$50 → n=${O1100.length} · ${(suma(O1100.map((o) => o.dolares)) / ANOS).toFixed(0)} $/año`);
console.log(`11:20/$50 → n=${O1120.length} · ${(suma(O1120.map((o) => o.dolares)) / ANOS).toFixed(0)} $/año`);
console.log(`11:00/$100 → n=${ops("11:00", 100).length} · ${(suma(ops("11:00", 100).map((o) => o.dolares)) / ANOS).toFixed(0)} $/año\n`);

// ═══ LAS DOS OPERACIONES QUE SE AUDITAN A MANO ══════════════════════════════════════════════
// Una ganadora corriente (mediana) y LA PEOR de todas — la peor es donde se esconden los fallos
// de liquidación, porque es la única que toca el intrínseco de las cuatro patas.
const orden = [...O1100].sort((a, b) => a.dolares - b.dolares);
const peor = orden[0];
const tipica = orden[Math.floor(orden.length / 2)];
const AUDITAR = [{ etiq: "GANADORA TÍPICA (mediana)", o: tipica }, { etiq: "LA PEOR DE TODAS", o: peor }];

for (const { etiq, o } of AUDITAR) {
  console.log("=".repeat(100));
  console.log(`  ${etiq} · ${o.dia} · entrada 11:00 · salida VENCIMIENTO`);
  console.log("=".repeat(100));
  console.log(`  spot a las 11:00 = ${o.spot}   →   centro rejilla = ${o.centro}`);
  console.log(`  spot de cierre (barra ${o.tUlt}) = ${o.cierre}`);
  console.log("");
  console.log("  | pata | strike | dir | precio que USA el motor | fila cruda del CSV |");
  console.log("  |---|---|---|---|---|");

  let creditoMano = 0, cierreMano = 0;
  const detalle = [];
  for (const p of o.patas) {
    const lado = p.lado === "C" ? "C" : "P";
    const fs = filasCrudas(o.dia, lado, "11:00", p.K);
    if (fs.length !== 1) console.log(`  !! ${p.K}${lado}: ${fs.length} filas para esa hora/strike (esperaba 1)`);
    const f = fs[0];
    const usado = p.dir === -1 ? f.bid : f.ask;      // vendo→bid, compro→ask
    creditoMano += p.dir === -1 ? f.bid : -f.ask;
    const intr = lado === "C" ? Math.max(0, o.cierre - p.K) : Math.max(0, p.K - o.cierre);
    cierreMano += p.dir === -1 ? intr : -intr;
    detalle.push({ p, f, usado, intr });
    console.log(`  | ${p.dir === -1 ? "VENDE" : "compra"} ${p.K}${lado} | ${p.K} | ${p.dir === -1 ? "−1" : "+1"} | ${p.dir === -1 ? `BID ${f.bid}` : `ASK ${f.ask}`} | bid=${f.bid} mid=${f.mid} ask=${f.ask} spot=${f.spot} |`);
  }
  console.log("");
  console.log(`  CRÉDITO a mano (bid de las vendidas − ask de las compradas) = ${creditoMano.toFixed(2)} pts = $${(creditoMano * 100).toFixed(2)}`);
  console.log(`  CRÉDITO del motor                                          = ${o.crudo.credito.toFixed(2)} pts = $${o.credito.toFixed(2)}`);
  console.log(`  ¿coinciden? ${Math.abs(creditoMano - o.crudo.credito) < 1e-9 ? "SÍ, al céntimo" : "**NO**"}`);
  console.log("");
  console.log("  LIQUIDACIÓN a vencimiento (intrínseco contra el spot de las 16:00):");
  for (const d of detalle)
    console.log(`    ${d.p.dir === -1 ? "VENDE" : "compra"} ${d.p.K}${d.p.lado}: intrínseco = ${d.intr.toFixed(2)}  → ${d.p.dir === -1 ? "PAGA" : "cobra"} ${d.intr.toFixed(2)}`);
  console.log(`  COSTE DE CIERRE a mano = ${cierreMano.toFixed(2)} pts   ·   del motor = ${o.crudo.cierre.toFixed(2)} pts   ·   ${Math.abs(cierreMano - o.crudo.cierre) < 1e-9 ? "coinciden" : "**NO COINCIDEN**"}`);
  console.log("");
  const plMano = (creditoMano - cierreMano) * 100 - COMISION;
  console.log(`  P&L a mano = (crédito − cierre) × 100 − comisión = (${creditoMano.toFixed(2)} − ${cierreMano.toFixed(2)}) × 100 − 0,24 = ${eur(plMano)}`);
  console.log(`  P&L del motor = ${eur(o.dolares)}   ·   ${Math.abs(plMano - o.dolares) < 1e-6 ? "coinciden" : "**NO COINCIDEN**"}`);
  console.log("");
  console.log(`  RIESGO MÁXIMO del motor = $${o.riesgo.toFixed(2)}`);
  console.log(`  a mano = (ala ${ALA} − crédito ${creditoMano.toFixed(2)}) × 100 = $${((ALA - creditoMano) * 100).toFixed(2)}`);
  console.log(`  COLATERAL que retiene Robinhood (una vertical al ancho completo) = $${(ALA * 100).toFixed(2)}`);
  console.log(`  ¿La pérdida máxima posible cabe en el colateral? ${(ALA - creditoMano) * 100 <= ALA * 100 ? "sí" : "NO"}\n`);

  // ── contraprueba: ¿qué habría dado midiendo a punto medio? ──
  let credMid = 0;
  for (const p of o.patas) {
    const f = filasCrudas(o.dia, p.lado, "11:00", p.K)[0];
    credMid += p.dir === -1 ? f.mid : -f.mid;
  }
  console.log(`  [contraprueba del peaje] a punto medio el crédito sería $${(credMid * 100).toFixed(2)} en vez de $${(creditoMano * 100).toFixed(2)}`);
  console.log(`  → el peaje de las cuatro patas cuesta $${((credMid - creditoMano) * 100).toFixed(2)} en la apertura. Está cobrado.\n`);
}

// ═══ COMPROBACIONES DE CONJUNTO ═════════════════════════════════════════════════════════════
console.log("=".repeat(100));
console.log("  COMPROBACIONES SOBRE LAS 337+ OPERACIONES, NO SÓLO SOBRE DOS");
console.log("=".repeat(100) + "\n");

// (a) ¿alguna operación cobra más crédito del que permitiría el punto medio? (imposible si el
//     peaje está bien cobrado)
let peorSignoCredito = 0, nMidPeor = 0;
for (const o of O1100) {
  let credMid = 0;
  for (const p of o.patas) {
    const f = filasCrudas(o.dia, p.lado, "11:00", p.K)[0];
    if (!f) { credMid = NaN; break; }
    credMid += p.dir === -1 ? f.mid : -f.mid;
  }
  if (!Number.isFinite(credMid)) continue;
  const dif = o.crudo.credito - credMid;               // debe ser NEGATIVO siempre
  if (dif > 1e-9) nMidPeor++;
  peorSignoCredito = Math.max(peorSignoCredito, dif);
}
console.log(`(a) Operaciones cuyo crédito ejecutable supera al de punto medio: ${nMidPeor} de ${O1100.length}`);
console.log(`    (tiene que ser 0: vender al bid SIEMPRE cobra menos que al punto medio)\n`);

// (b) ¿el crédito cabe en el rango de cordura $20–$600?
const creds = O1100.map((o) => o.credito).sort((a, b) => a - b);
console.log(`(b) Crédito de las operaciones que dispara la regla: mín $${creds[0].toFixed(0)} · mediana $${creds[creds.length >> 1].toFixed(0)} · máx $${creds[creds.length - 1].toFixed(0)}`);
console.log(`    fuera del rango de cordura $20–$600: ${creds.filter((c) => c < 20 || c > 600).length}\n`);

// (c) ¿la pérdida nunca supera el riesgo máximo?
const excesos = O1100.filter((o) => o.dolares < -(o.riesgo + 1));
console.log(`(c) Operaciones que pierden MÁS que su riesgo máximo: ${excesos.length} (tiene que ser 0)`);
console.log(`    peor pérdida = ${eur(Math.min(...O1100.map((o) => o.dolares)))} · riesgo máximo típico ≈ $${(5000 - creds[creds.length >> 1]).toFixed(0)}\n`);

// (d) ¿existen de verdad las cuatro patas en la cadena? (si estructura devolviera null se
//     contaría como hueco, pero conviene verlo)
let sinFila = 0, filasDup = 0;
for (const o of [...O1100].slice(0, 60)) {
  for (const p of o.patas) {
    const fs = filasCrudas(o.dia, p.lado, "11:00", p.K);
    if (fs.length === 0) sinFila++;
    if (fs.length > 1) filasDup++;
  }
}
console.log(`(d) Sobre 60 operaciones × 4 patas = 240 filas: sin fila en el CSV ${sinFila} · filas duplicadas ${filasDup}\n`);

// (e) ¿el spot del motor es el de la misma fila que las cotizaciones?
let maxDifSpot = 0;
for (const o of [...O1100].slice(0, 60))
  for (const p of o.patas) {
    const f = filasCrudas(o.dia, p.lado, "11:00", p.K)[0];
    if (f) maxDifSpot = Math.max(maxDifSpot, Math.abs(f.spot - o.spot));
  }
console.log(`(e) Mayor diferencia entre el spot del motor y el underlying_price de la fila de cada pata: ${maxDifSpot.toFixed(4)} puntos`);
console.log(`    (0 = todas las patas y el spot vienen de la misma foto; >0 = se están cruzando etiquetas de tiempo)\n`);

// (f) la barra de salida: ¿es SIEMPRE las 16:00?
const tUlts = {};
for (const x of R) tUlts[x.tUlt] = (tUlts[x.tUlt] || 0) + 1;
console.log(`(f) Hora de la última barra de cada día: ${JSON.stringify(tUlts)}`);
const nb = {};
for (const x of R) nb[x.nBarras] = (nb[x.nBarras] || 0) + 1;
console.log(`    número de barras por día: ${JSON.stringify(nb)}\n`);

// (g) ¿cuántas veces el cierre cae ENTRE la vendida y la comprada? Ahí la liquidación parcial
//     es lo que decide, y es donde un fallo de intrínseco se vería.
let dentro = 0, fueraTotal = 0, parcial = 0;
for (const o of O1100) {
  const S = o.cierre, c = o.centro;
  if (S <= c + ANCHO && S >= c - ANCHO) dentro++;
  else if (S >= c + ANCHO + ALA || S <= c - ANCHO - ALA) fueraTotal++;
  else parcial++;
}
console.log(`(g) Dónde acaba el índice respecto al cóndor: dentro ${dentro} · pérdida parcial ${parcial} · pérdida total ${fueraTotal}`);
console.log(`    ${dentro + parcial + fueraTotal} = ${O1100.length} ✓\n`);
