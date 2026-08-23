// ══════════════════════════════════════════════════════════════════════════════════════════
// M4 — EL SESGO DEL PROPIO STRIKE
//
// LA PREGUNTA. En el hueco del 21 de agosto, el strike 7690 era el ÚNICO cargado de calls
// (2.301 calls contra 1.257 puts, sesgo +0,29). Es donde Eduardo puso 10 contratos y donde más
// ganó. Sus otros dos strikes estaban cargados de puts. Todas las mediciones anteriores de este
// proyecto promediaban el desbalance calls/puts en bandas de ±0,5%, ±1% y ±2% — y una banda
// aplasta justo ese detalle: el 7690 y el 7685 caen en la misma banda y tienen el sesgo al revés.
//
// Aquí se mide STRIKE A STRIKE. Se cogen los strikes justo por encima del precio, se separan en
// CINCO montones por su propio sesgo calls/puts, y se mide qué da comprar la call de cada montón.
// Se enseña la escalera completa de los cinco. Si no es monótona, no es señal.
//
// LAS DOS LECTURAS, las dos legítimas, que decidan los datos:
//   (A) mucho sesgo de calls = los dealers están cortos de esas calls y compran subyacente si
//       sube → EMPUJA hacia arriba → comprar la call de sesgo alto gana.
//   (B) mucho sesgo de calls = techo, ahí hay vendedores esperando → FRENA → pierde.
//
// CÓMO SE MIDE
//   día: los 1.123 días de SPXW 0DTE con bid/ask reales.
//   referencia: el precio de las 09:35 (la barra de las 09:30 NO EXISTE) y el OI del arranque.
//   candidatos: los strikes POR ENCIMA del precio hasta +0,6% (donde compró Eduardo: +0,01%,
//               +0,14% y +0,21%).
//   operación: comprar la call al ASK a las 10:00, venderla al BID a las 12:00. Es la ventana
//              de Eduardo (entró 09:55-10:05, salió 11:00-13:00).
//   se prueban también otras parejas de horas para ver si la escalera depende del reloj.
//
// LOS CONTROLES
//   (a) ESPEJO   — ordenar por el sesgo del strike SIMÉTRICO al otro lado del precio, el mismo
//                  día y el mismo instante, y comprar exactamente la misma call. Si la escalera
//                  sale igual, no es el sesgo del strike: es el día.
//   (b) BARAJADO — el mapa de OI de otro día, recentrado POR DISTANCIA a su propia apertura
//                  (nunca por nivel: el SPX pasó de 4.700 a 7.700). Índice desplazado, no azar.
//   (c) VOLATILIDAD — tercios por el precio de la cuna al dinero a las 09:35 (call ATM al ask +
//                  put ATM al ask, dividido por el nivel del índice). La escalera dentro de cada
//                  tercio.
//   (d) PROMINENCIA CONTRA TAMAÑO — cuatro casillas: mucho/poco OI en bruto × mucha/poca
//                  prominencia. Si las dos filas de tamaño se portan igual, manda el pico; si las
//                  dos de prominencia se portan igual, manda el tamaño.
//   y la DISTANCIA: la escalera del sesgo DENTRO de cada franja de distancia al dinero, porque
//   la distancia al dinero suele explicarlo todo.
//   y el TIEMPO: construir con días anteriores a 2025-01-01 y comprobar en 2025-2026.
//
// LAS REGLAS DE LA CASA que aplican aquí
//   · compra al ASK, venta al BID. Nunca punto medio.
//   · un hueco no es un cero: si falta un precio la operación se descarta y se cuenta aparte.
//   · los NUEVE días de media sesión se excluyen enteros (el fichero sigue trayendo barras hasta
//     las 16:00 con el SPX congelado).
//   · todo en dólares al año con UN contrato: 1.123 días = 4,60 años (244 días de mercado/año).
// ══════════════════════════════════════════════════════════════════════════════════════════

import {
  diasDisponibles, cargarDia, cargarDia21, picos, montanaCerca, hueco,
  idxHora, hayHora, rejilla, compraEn, ventaEn, resumen,
} from "./lib0dte.mjs";

const MEDIA_SESION = new Set([
  "2022-11-25", "2023-07-03", "2023-11-24", "2024-07-03", "2024-11-29",
  "2024-12-24", "2025-07-03", "2025-11-28", "2025-12-24",
]);

const ANOS = 4.60;
const ENTRADAS = ["09:55", "10:00", "10:05"];
const SALIDAS = ["11:00", "12:00", "13:00"];
const IE = 1, IS = 1;                 // la pareja principal: 10:00 → 12:00
const BANDA = 0.6;                    // hasta +0,6% por encima del precio
const CORTE = "2025-01-01";

const pct = (x) => (x * 100).toFixed(2) + "%";
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "—");

// ── 1. UNA PASADA POR LOS FICHEROS ────────────────────────────────────────────────────────
// Se guarda sólo lo imprescindible: las cadenas enteras de 1.123 días revientan node.

const dias = diasDisponibles();
console.log(`días con cadena 0DTE: ${dias.length}  (${dias[0]} … ${dias.at(-1)})`);

const D = [];                          // un registro compacto por día
let sinOI = 0, sinHora = 0, mediaSesion = 0;

for (const dia of dias) {
  if (MEDIA_SESION.has(dia)) { mediaSesion++; continue; }
  const d = cargarDia(dia);
  if (!d) continue;
  if (!d.oi) { sinOI++; continue; }

  const iE = ENTRADAS.map((h) => hayHora(d, h));
  const iS = SALIDAS.map((h) => hayHora(d, h));
  if (iE.some((i) => i < 0) || iS.some((i) => i < 0)) { sinHora++; continue; }

  const b0 = d.barras[0];
  const spot0 = b0.spot;
  const pk = picos(d.oi, spot0);
  if (!pk) continue;

  // la cuna al dinero a las 09:35 — el termómetro de volatilidad del día
  const K0 = rejilla(spot0);
  const ca = compraEn(b0, K0, "C"), pa = compraEn(b0, K0, "P");
  const cuna = ca != null && pa != null ? (ca + pa) / spot0 : null;

  // la montaña de arriba (prominencia ≥ 2, a menos del 1,5%) y su hueco
  const mont = montanaCerca(pk, spot0, 2, 1.5);
  const enHueco = new Set(mont.arriba ? hueco(pk, spot0, mont.arriba).map((h) => h.K) : []);

  // TODOS los strikes de ±1,5%, para poder buscar espejos y para el barajado
  const cercanos = [];
  for (const e of pk.mapa.values()) {
    const dp = ((e.K - spot0) / spot0) * 100;
    if (Math.abs(dp) > 1.5) continue;
    cercanos.push({ K: e.K, dp, sesgo: e.total > 0 ? (e.calls - e.puts) / e.total : 0, total: e.total });
  }
  cercanos.sort((a, b) => a.dp - b.dp);
  const promDe = new Map(pk.picos.map((p) => [p.K, p.prominencia]));

  // los candidatos: por encima del precio, hasta +0,6%
  const cand = [];
  for (const c of cercanos) {
    if (!(c.dp > 0 && c.dp <= BANDA)) continue;
    const asks = iE.map((i) => compraEn(d.barras[i], c.K, "C"));
    const bids = iS.map((i) => ventaEn(d.barras[i], c.K, "C"));
    // para poder VENDER hacen falta las otras dos columnas: bid de entrada y ask de salida
    const bidE = ventaEn(d.barras[iE[IE]], c.K, "C");
    const askS = compraEn(d.barras[iS[IS]], c.K, "C");
    cand.push({
      K: c.K, dp: c.dp, sesgo: c.sesgo, total: c.total,
      prom: promDe.get(c.K) ?? null,
      hueco: enHueco.has(c.K),
      asks, bids, bidE, askS,
    });
  }
  if (!cand.length) continue;

  // tabla de precios de la pareja principal para TODOS los strikes de 0 a +2%: hace falta la
  // pata de cobertura de la vertical, que cae fuera de la banda de candidatos.
  const precios = new Map();
  for (const c of pk.mapa.keys()) {
    const dp = ((c - spot0) / spot0) * 100;
    if (!(dp > -0.2 && dp <= 2)) continue;
    precios.set(c, [ventaEn(d.barras[iE[IE]], c, "C"), compraEn(d.barras[iE[IE]], c, "C"),
                    ventaEn(d.barras[iS[IS]], c, "C"), compraEn(d.barras[iS[IS]], c, "C")]);
  }

  D.push({
    precios,
    dia, spot0, cuna,
    spotE: iE.map((i) => d.barras[i].spot),
    spotS: iS.map((i) => d.barras[i].spot),
    // el máximo del índice entre la entrada principal y la salida principal (¿toca el strike?)
    maxTramo: Math.max(...d.barras.slice(iE[IE], iS[IS] + 1).map((b) => b.spot)),
    montanaArriba: mont.arriba ? { K: mont.arriba.K, dp: mont.arriba.distPct, prom: mont.arriba.prominencia } : null,
    cercanos, cand,
  });
}

console.log(`días usados: ${D.length}   descartados → media sesión ${mediaSesion}, sin OI ${sinOI}, sin la hora ${sinHora}`);

// ── 2. SANIDAD ────────────────────────────────────────────────────────────────────────────

let obs = [];                 // todas las observaciones utilizables
let huecosPrecio = 0;
for (const d of D) {
  for (const c of d.cand) {
    const ask = c.asks[IE], bid = c.bids[IS];
    if (ask == null || !(ask > 0) || bid == null) { huecosPrecio++; continue; }
    obs.push({
      dia: d.dia, K: c.K, dp: c.dp, sesgo: c.sesgo, total: c.total, prom: c.prom, hueco: c.hueco,
      ask, bid, ret: (bid - ask) / ask, dol: (bid - ask) * 100,
      cuna: d.cuna, spotE: d.spotE[IE], spotS: d.spotS[IS], maxTramo: d.maxTramo,
      ano: +d.dia.slice(0, 4), fuera: d.dia >= CORTE,
      d,
      c,
    });
  }
}
const costes = obs.map((o) => o.ask).sort((a, b) => a - b);
console.log(`\nSANIDAD`);
console.log(`  observaciones: ${obs.length}   huecos de precio descartados: ${huecosPrecio}`);
console.log(`  strikes candidatos por día: mediana ${D.map((d) => d.cand.length).sort((a, b) => a - b)[Math.floor(D.length / 2)]}`);
console.log(`  coste de la call a las 10:00 (ask): mín ${f2(costes[0])}  p10 ${f2(costes[Math.floor(costes.length * 0.1)])}  mediana ${f2(costes[Math.floor(costes.length / 2)])}  p90 ${f2(costes[Math.floor(costes.length * 0.9)])}  máx ${f2(costes.at(-1))}`);
console.log(`  sesgo del strike: mín ${f2(Math.min(...obs.map((o) => o.sesgo)))}  máx ${f2(Math.max(...obs.map((o) => o.sesgo)))}`);
console.log(`  días con montaña arriba (prom≥2, ≤1,5%): ${D.filter((d) => d.montanaArriba).length} de ${D.length}`);

// ── 3. LA ESCALERA ────────────────────────────────────────────────────────────────────────

function cortes(vals, k) {
  const v = [...vals].sort((a, b) => a - b);
  const c = [];
  for (let i = 1; i < k; i++) c.push(v[Math.floor((v.length * i) / k)]);
  return c;
}
const monton = (x, cs) => { let i = 0; while (i < cs.length && x > cs[i]) i++; return i; };

function escalera(lista, clave, cs, titulo, extra) {
  const cubos = Array.from({ length: cs.length + 1 }, () => []);
  for (const o of lista) cubos[monton(clave(o), cs)].push(o);
  console.log(`\n${titulo}`);
  console.log(`  montón  n      sesgo medio   ret medio    t       aciertos   $/op    $/año(todas)`);
  const filas = [];
  for (let i = 0; i < cubos.length; i++) {
    const cb = cubos[i];
    if (!cb.length) { console.log(`  ${i + 1}       0`); filas.push(null); continue; }
    const r = resumen(cb.map((o) => o.ret));
    const sm = cb.reduce((a, o) => a + clave(o), 0) / cb.length;
    const dol = cb.reduce((a, o) => a + o.dol, 0);
    console.log(`  ${i + 1}      ${String(cb.length).padStart(5)}  ${f2(sm).padStart(8)}   ${pct(r.media).padStart(8)}   ${f2(r.t).padStart(6)}  ${pct(r.aciertos).padStart(8)}  ${f2(dol / cb.length / 100 * 100).padStart(7)}  ${(dol / ANOS).toFixed(0).padStart(9)}`);
    filas.push({ n: cb.length, sesgo: sm, ...r, dol, cubo: cb });
    if (extra) extra(i, cb);
  }
  return filas;
}

const cs5 = cortes(obs.map((o) => o.sesgo), 5);
console.log(`\ncortes de los cinco montones por sesgo: ${cs5.map((x) => f2(x)).join("  ")}`);

const L = escalera(obs, (o) => o.sesgo, cs5,
  `═══ ESCALERA 1 — TODOS los strikes de 0 a +0,6% por encima. Comprar la call 10:00 → 12:00.`);

// ¿la escalera es monótona?
const meds = L.filter(Boolean).map((x) => x.media);
const sube = meds.every((v, i) => i === 0 || v >= meds[i - 1]);
const baja = meds.every((v, i) => i === 0 || v <= meds[i - 1]);
console.log(`  ¿monótona? ${sube ? "SÍ, creciente" : baja ? "SÍ, decreciente" : "NO"}`);
console.log(`  extremo alto − extremo bajo: ${pct(meds.at(-1) - meds[0])}`);
{
  const alto = L.at(-1).cubo.map((o) => o.ret), bajo = L[0].cubo.map((o) => o.ret);
  const ra = resumen(alto), rb = resumen(bajo);
  const se = Math.sqrt(ra.sd ** 2 / ra.n + rb.sd ** 2 / rb.n);
  console.log(`  t de la diferencia alto vs bajo: ${f2((ra.media - rb.media) / se)}`);
}

// ── 4. ¿SUBE EL PRECIO? (sin el peaje de la opción) ───────────────────────────────────────

console.log(`\n═══ ¿VA EL PRECIO HACIA EL STRIKE? (el índice, sin opciones)`);
console.log(`  montón  n      % que TOCA el strike   % que CIERRA el tramo por encima   mov. medio del índice`);
for (let i = 0; i <= cs5.length; i++) {
  const cb = obs.filter((o) => monton(o.sesgo, cs5) === i);
  const toca = cb.filter((o) => o.maxTramo >= o.K).length / cb.length;
  const enc = cb.filter((o) => o.spotS >= o.K).length / cb.length;
  const mov = cb.reduce((a, o) => a + (o.spotS - o.spotE) / o.spotE, 0) / cb.length;
  console.log(`  ${i + 1}      ${String(cb.length).padStart(5)}   ${pct(toca).padStart(10)}            ${pct(enc).padStart(10)}                    ${(mov * 100).toFixed(3)}%`);
}

// ── 5. ¿APORTA POR ENCIMA DE LA DISTANCIA AL DINERO? ──────────────────────────────────────

console.log(`\n═══ CONTROL DISTANCIA — la escalera del sesgo DENTRO de cada franja de distancia`);
const franjas = [[0, 0.15], [0.15, 0.3], [0.3, 0.45], [0.45, 0.6]];
for (const [a, b] of franjas) {
  const sub = obs.filter((o) => o.dp > a && o.dp <= b);
  if (sub.length < 200) { console.log(`  franja +${a}%..+${b}%: sólo ${sub.length} — se salta`); continue; }
  const cs3 = cortes(sub.map((o) => o.sesgo), 3);
  const linea = [];
  for (let i = 0; i <= 2; i++) {
    const cb = sub.filter((o) => monton(o.sesgo, cs3) === i);
    const r = resumen(cb.map((o) => o.ret));
    linea.push(`${pct(r.media)} (n=${cb.length}, t=${f2(r.t)})`);
  }
  console.log(`  +${a}%..+${b}%  n=${sub.length}  ret medio por tercio de sesgo:  ${linea.join("   |   ")}`);
}
// y al revés: la distancia dentro de cada montón de sesgo
console.log(`\n  al revés — la DISTANCIA manda mucho más:`);
for (const [a, b] of franjas) {
  const sub = obs.filter((o) => o.dp > a && o.dp <= b);
  const r = resumen(sub.map((o) => o.ret));
  console.log(`    +${a}%..+${b}%  n=${String(sub.length).padStart(5)}  ret ${pct(r.media).padStart(9)}  t ${f2(r.t)}`);
}

// ── 6. SÓLO DENTRO DEL HUECO ──────────────────────────────────────────────────────────────

const enHueco = obs.filter((o) => o.hueco);
console.log(`\n═══ ESCALERA 2 — SÓLO los strikes DENTRO DEL HUECO (entre el precio y la montaña)`);
console.log(`  observaciones en hueco: ${enHueco.length} de ${obs.length}`);
if (enHueco.length > 300) {
  const csH = cortes(enHueco.map((o) => o.sesgo), 5);
  escalera(enHueco, (o) => o.sesgo, csH, `  (cortes propios del hueco: ${csH.map(f2).join("  ")})`);
} else console.log("  muestra insuficiente");

// ── 7. LOS CONTROLES ──────────────────────────────────────────────────────────────────────

// (a) ESPEJO — ordenar por el sesgo del strike simétrico abajo, comprando la MISMA call.
for (const o of obs) {
  const objetivo = -o.dp;
  let mejor = null;
  for (const c of o.d.cercanos) {
    if (c.dp >= 0) continue;
    if (!mejor || Math.abs(c.dp - objetivo) < Math.abs(mejor.dp - objetivo)) mejor = c;
  }
  o.sesgoEspejo = mejor && Math.abs(mejor.dp - objetivo) < 0.08 ? mejor.sesgo : null;
}
const conEspejo = obs.filter((o) => o.sesgoEspejo != null);
console.log(`\n═══ CONTROL (a) EL ESPEJO — ordenar por el sesgo del strike simétrico ABAJO, comprando la misma call`);
console.log(`  observaciones con espejo: ${conEspejo.length}`);
const Lesp = escalera(conEspejo, (o) => o.sesgoEspejo, cortes(conEspejo.map((o) => o.sesgoEspejo), 5), `  escalera del espejo:`);

// (b) BARAJADO — el mapa de OI de otro día, buscado POR DISTANCIA
const DESP = 257;
for (let i = 0; i < D.length; i++) D[i].otro = D[(i + DESP) % D.length];
for (const o of obs) {
  const otro = o.d.otro;
  let mejor = null;
  for (const c of otro.cercanos) {
    if (c.dp <= 0) continue;
    if (!mejor || Math.abs(c.dp - o.dp) < Math.abs(mejor.dp - o.dp)) mejor = c;
  }
  o.sesgoBarajado = mejor && Math.abs(mejor.dp - o.dp) < 0.08 ? mejor.sesgo : null;
}
const conBar = obs.filter((o) => o.sesgoBarajado != null);
console.log(`\n═══ CONTROL (b) EL BARAJADO — el sesgo del mismo % de distancia pero de otro día (desplazamiento ${DESP})`);
console.log(`  observaciones con barajado: ${conBar.length}`);
escalera(conBar, (o) => o.sesgoBarajado, cortes(conBar.map((o) => o.sesgoBarajado), 5), `  escalera barajada:`);

// (c) VOLATILIDAD
const conCuna = obs.filter((o) => o.cuna != null);
const csV = cortes([...new Set(conCuna.map((o) => o.d))].map((d) => d.cuna).filter((x) => x != null), 3);
console.log(`\n═══ CONTROL (c) LA VOLATILIDAD — la escalera dentro de cada tercio de precio de la cuna`);
console.log(`  cortes de la cuna (precio de la cuna ATM / nivel del índice): ${csV.map((x) => (x * 100).toFixed(3) + "%").join("  ")}`);
for (let v = 0; v <= 2; v++) {
  const sub = conCuna.filter((o) => monton(o.cuna, csV) === v);
  const nombre = ["tercio CALMADO", "tercio MEDIO", "tercio AGITADO"][v];
  const linea = [];
  for (let i = 0; i <= cs5.length; i++) {
    const cb = sub.filter((o) => monton(o.sesgo, cs5) === i);
    const r = resumen(cb.map((o) => o.ret));
    linea.push(`${pct(r.media)}`);
  }
  const alto = sub.filter((o) => monton(o.sesgo, cs5) === 4).map((o) => o.ret);
  const bajo = sub.filter((o) => monton(o.sesgo, cs5) === 0).map((o) => o.ret);
  const ra = resumen(alto), rb = resumen(bajo);
  const se = Math.sqrt(ra.sd ** 2 / ra.n + rb.sd ** 2 / rb.n);
  console.log(`  ${nombre.padEnd(16)} n=${String(sub.length).padStart(5)}  escalera: ${linea.join("  ")}   alto−bajo ${pct(ra.media - rb.media)} (t=${f2((ra.media - rb.media) / se)})`);
}

// (d) PROMINENCIA CONTRA TAMAÑO
console.log(`\n═══ CONTROL (d) PROMINENCIA CONTRA TAMAÑO BRUTO`);
const conProm = obs.filter((o) => o.prom != null);
const medTot = cortes(conProm.map((o) => o.total), 2)[0];
const medProm = cortes(conProm.map((o) => o.prom), 2)[0];
console.log(`  corte de OI total: ${medTot.toFixed(0)} contratos   corte de prominencia: ${f2(medProm)}`);
console.log(`                        n       ret medio    t       aciertos`);
for (const [nt, ft] of [["POCO OI ", (o) => o.total <= medTot], ["MUCHO OI", (o) => o.total > medTot]]) {
  for (const [np, fp] of [["poca prom.", (o) => o.prom <= medProm], ["MUCHA prom.", (o) => o.prom > medProm]]) {
    const cb = conProm.filter((o) => ft(o) && fp(o));
    const r = resumen(cb.map((o) => o.ret));
    console.log(`  ${nt} × ${np.padEnd(12)} ${String(cb.length).padStart(5)}   ${pct(r.media).padStart(9)}   ${f2(r.t).padStart(6)}   ${pct(r.aciertos)}`);
  }
}

// ── 8. FUERA DE MUESTRA ───────────────────────────────────────────────────────────────────

console.log(`\n═══ EL TIEMPO — construido antes de ${CORTE}, comprobado en 2025-2026`);
for (const [nombre, filtro] of [["DENTRO (2022-2024)", (o) => !o.fuera], ["FUERA (2025-2026)", (o) => o.fuera]]) {
  const sub = obs.filter(filtro);
  const linea = [];
  for (let i = 0; i <= cs5.length; i++) {
    const cb = sub.filter((o) => monton(o.sesgo, cs5) === i);
    linea.push(pct(resumen(cb.map((o) => o.ret)).media));
  }
  const alto = sub.filter((o) => monton(o.sesgo, cs5) === 4).map((o) => o.ret);
  const bajo = sub.filter((o) => monton(o.sesgo, cs5) === 0).map((o) => o.ret);
  const ra = resumen(alto), rb = resumen(bajo);
  const se = Math.sqrt(ra.sd ** 2 / ra.n + rb.sd ** 2 / rb.n);
  console.log(`  ${nombre.padEnd(20)} n=${String(sub.length).padStart(5)}  escalera: ${linea.join("  ")}   alto−bajo ${pct(ra.media - rb.media)} (t=${f2((ra.media - rb.media) / se)})`);
}

// ── 9. LA REGLA DE UN CONTRATO AL DÍA ─────────────────────────────────────────────────────
// La lectura de Eduardo, hecha regla: si hay montaña arriba, comprar la call del strike del
// hueco con MÁS sesgo de calls. Un contrato, una operación al día.

console.log(`\n═══ LA REGLA — un contrato al día: la call del hueco con más sesgo de calls`);
function regla(seleccion, nombre) {
  const ops = [];
  for (const d of D) {
    const cands = d.cand.filter((c) => c.hueco && c.asks[IE] != null && c.asks[IE] > 0 && c.bids[IS] != null);
    if (!cands.length) continue;
    const c = seleccion(cands);
    ops.push({ dia: d.dia, ano: +d.dia.slice(0, 4), K: c.K, dol: (c.bids[IS] - c.asks[IE]) * 100, ret: (c.bids[IS] - c.asks[IE]) / c.asks[IE] });
  }
  const r = resumen(ops.map((o) => o.ret));
  const tot = ops.reduce((a, o) => a + o.dol, 0);
  const dsort = [...ops].sort((a, b) => a.dol - b.dol);
  const sinTop5 = ops.length > 5 ? [...ops].sort((a, b) => b.dol - a.dol).slice(5).reduce((a, o) => a + o.dol, 0) : NaN;
  console.log(`\n  ${nombre}`);
  console.log(`    operaciones ${ops.length}   ret medio ${pct(r.media)}  t ${f2(r.t)}  aciertos ${pct(r.aciertos)}`);
  console.log(`    $/año ${(tot / ANOS).toFixed(0)}   mediana $/op ${f2(dsort[Math.floor(dsort.length / 2)].dol)}   peor día ${f2(dsort[0].dol)}   mejor ${f2(dsort.at(-1).dol)}`);
  console.log(`    quitando los 5 mejores días: $/año ${(sinTop5 / ANOS).toFixed(0)}`);
  const porAno = {};
  for (const o of ops) { porAno[o.ano] = (porAno[o.ano] ?? 0) + o.dol; }
  console.log(`    año a año: ${Object.entries(porAno).map(([a, v]) => `${a} ${v.toFixed(0)}`).join("  ")}`);
  return { ops, r, tot, sinTop5 };
}
const rMax = regla((c) => c.reduce((a, b) => (b.sesgo > a.sesgo ? b : a)), "MÁS sesgo de calls (lectura A: empuja)");
const rMin = regla((c) => c.reduce((a, b) => (b.sesgo < a.sesgo ? b : a)), "MENOS sesgo de calls (lectura B: el otro lado)");
const rMed = regla((c) => c[Math.floor(c.length / 2)], "control: el strike de en medio del hueco, sin mirar el sesgo");

// ── 10. OTRAS PAREJAS DE HORAS ────────────────────────────────────────────────────────────

console.log(`\n═══ ¿DEPENDE DEL RELOJ? escalera alto−bajo para cada pareja de horas`);
console.log(`  entrada  salida   n      montón1     montón5     alto−bajo    t`);
for (let e = 0; e < ENTRADAS.length; e++) {
  for (let s = 0; s < SALIDAS.length; s++) {
    const lista = [];
    for (const d of D) for (const c of d.cand) {
      const a = c.asks[e], b = c.bids[s];
      if (a == null || !(a > 0) || b == null) continue;
      lista.push({ sesgo: c.sesgo, ret: (b - a) / a });
    }
    const bajo = lista.filter((o) => monton(o.sesgo, cs5) === 0).map((o) => o.ret);
    const alto = lista.filter((o) => monton(o.sesgo, cs5) === 4).map((o) => o.ret);
    const ra = resumen(alto), rb = resumen(bajo);
    const se = Math.sqrt(ra.sd ** 2 / ra.n + rb.sd ** 2 / rb.n);
    console.log(`  ${ENTRADAS[e]}    ${SALIDAS[s]}    ${String(lista.length).padStart(5)}  ${pct(rb.media).padStart(9)}  ${pct(ra.media).padStart(9)}   ${pct(ra.media - rb.media).padStart(9)}   ${f2((ra.media - rb.media) / se)}`);
  }
}

// ── 11. EL DÍA DE EDUARDO, CON ESTA MISMA REGLA ───────────────────────────────────────────

console.log(`\n═══ EL 21 DE AGOSTO con esta misma lente`);
const d21 = cargarDia21();
if (d21) {
  const s21 = d21.barras[0].spot;
  const pk21 = picos(d21.oi, s21);
  const m21 = montanaCerca(pk21, s21, 2, 1.5);
  const h21 = hueco(pk21, s21, m21.arriba);
  console.log(`  spot de referencia ${f2(s21)}  montaña ${m21.arriba.K} (+${f2(m21.arriba.distPct)}%, prom ${f2(m21.arriba.prominencia)})`);
  const iE21 = idxHora(d21, ENTRADAS[IE]), iS21 = idxHora(d21, SALIDAS[IS]);
  for (const h of h21) {
    const a = compraEn(d21.barras[iE21], h.K, "C"), b = ventaEn(d21.barras[iS21], h.K, "C");
    const mrk = h.sesgo === Math.max(...h21.map((x) => x.sesgo)) ? "  ← el que elige la regla" : "";
    console.log(`    ${h.K}  sesgo ${f2(h.sesgo).padStart(6)}  ask 10:00 ${f2(a)}  bid 12:00 ${f2(b)}  ret ${a && b != null ? pct((b - a) / a) : "—"}${mrk}`);
  }
}

// ── 12. LO QUE DECIDE DE VERDAD ───────────────────────────────────────────────────────────
// La escalera baja, pero hay que comprobar tres cosas antes de creérsela:
//   ¿los montones tienen la misma distancia al dinero? ¿el espejo hace lo mismo?
//   ¿aguanta DENTRO de los tercios de volatilidad, sumando los tres?

const dif = (a, b) => {
  const ra = resumen(a), rb = resumen(b);
  const se = Math.sqrt(ra.sd ** 2 / ra.n + rb.sd ** 2 / rb.n);
  return { d: ra.media - rb.media, t: (ra.media - rb.media) / se, na: ra.n, nb: rb.n };
};

console.log(`\n═══ ¿ESTÁN LOS CINCO MONTONES A LA MISMA DISTANCIA DEL DINERO?`);
for (let i = 0; i <= cs5.length; i++) {
  const cb = obs.filter((o) => monton(o.sesgo, cs5) === i);
  const dm = cb.reduce((a, o) => a + o.dp, 0) / cb.length;
  const cm = cb.reduce((a, o) => a + o.ask, 0) / cb.length;
  const om = cb.reduce((a, o) => a + o.total, 0) / cb.length;
  const cu = cb.filter((o) => o.cuna != null);
  const cun = cu.reduce((a, o) => a + o.cuna, 0) / cu.length;
  console.log(`  montón ${i + 1}  distancia media +${f2(dm)}%   coste medio $${f2(cm)}   OI medio ${om.toFixed(0)}   cuna del día ${(cun * 100).toFixed(3)}%`);
}

console.log(`\n═══ EL SESGO PROPIO, LIMPIO DE SUS TRES SOSPECHOSOS (diferencia montón5 − montón1)`);
{
  const g = dif(obs.filter((o) => monton(o.sesgo, cs5) === 4).map((o) => o.ret),
                obs.filter((o) => monton(o.sesgo, cs5) === 0).map((o) => o.ret));
  console.log(`  en bruto:                      ${pct(g.d)}   t ${f2(g.t)}   (n ${g.na}/${g.nb})`);
}
// (i) dentro de franjas de distancia, sumando las cuatro
{
  let num = 0, den = 0, nn = 0;
  for (const [a, b] of franjas) {
    const sub = obs.filter((o) => o.dp > a && o.dp <= b);
    const g = dif(sub.filter((o) => monton(o.sesgo, cs5) === 4).map((o) => o.ret),
                  sub.filter((o) => monton(o.sesgo, cs5) === 0).map((o) => o.ret));
    if (!Number.isFinite(g.t)) continue;
    const w = 1 / (g.d / g.t) ** 2; num += g.d * w; den += w; nn += g.na + g.nb;
  }
  console.log(`  dentro de franjas de distancia: ${pct(num / den)}   t ${f2((num / den) * Math.sqrt(den))}   (n ${nn})`);
}
// (ii) dentro de tercios de volatilidad, sumando los tres
{
  let num = 0, den = 0, nn = 0;
  for (let v = 0; v <= 2; v++) {
    const sub = conCuna.filter((o) => monton(o.cuna, csV) === v);
    const g = dif(sub.filter((o) => monton(o.sesgo, cs5) === 4).map((o) => o.ret),
                  sub.filter((o) => monton(o.sesgo, cs5) === 0).map((o) => o.ret));
    const w = 1 / (g.d / g.t) ** 2; num += g.d * w; den += w; nn += g.na + g.nb;
  }
  console.log(`  dentro de tercios de cuna:     ${pct(num / den)}   t ${f2((num / den) * Math.sqrt(den))}   (n ${nn})`);
}
// (iii) el espejo, y el sesgo propio dentro de tercios del espejo
{
  const g = dif(conEspejo.filter((o) => monton(o.sesgoEspejo, cortes(conEspejo.map((x) => x.sesgoEspejo), 5)) === 4).map((o) => o.ret),
                conEspejo.filter((o) => monton(o.sesgoEspejo, cortes(conEspejo.map((x) => x.sesgoEspejo), 5)) === 0).map((o) => o.ret));
  console.log(`  EL ESPEJO (mismo día, mismo instante, sesgo del strike simétrico abajo): ${pct(g.d)}   t ${f2(g.t)}`);
  const csE3 = cortes(conEspejo.map((o) => o.sesgoEspejo), 3);
  let num = 0, den = 0, nn = 0;
  for (let v = 0; v <= 2; v++) {
    const sub = conEspejo.filter((o) => monton(o.sesgoEspejo, csE3) === v);
    const g2 = dif(sub.filter((o) => monton(o.sesgo, cs5) === 4).map((o) => o.ret),
                   sub.filter((o) => monton(o.sesgo, cs5) === 0).map((o) => o.ret));
    const w = 1 / (g2.d / g2.t) ** 2; num += g2.d * w; den += w; nn += g2.na + g2.nb;
  }
  console.log(`  sesgo PROPIO dentro de tercios del espejo: ${pct(num / den)}   t ${f2((num / den) * Math.sqrt(den))}   (n ${nn})`);
}
// (iv) el barajado
{
  const csB = cortes(conBar.map((o) => o.sesgoBarajado), 5);
  const g = dif(conBar.filter((o) => monton(o.sesgoBarajado, csB) === 4).map((o) => o.ret),
                conBar.filter((o) => monton(o.sesgoBarajado, csB) === 0).map((o) => o.ret));
  console.log(`  EL BARAJADO (mapa de OI de otro día por distancia): ${pct(g.d)}   t ${f2(g.t)}`);
}

// ── 13. EL PUENTE — si comprar la call de sesgo alto pierde, ¿gana VENDERLA? ───────────────
// Riesgo definido siempre (Lester opera verticales en Robinhood, nunca desnudo).

console.log(`\n═══ EL OTRO LADO — vertical de crédito de calls, 10:00 → 12:00, ala de 20 puntos`);
console.log(`  se VENDE al bid la call elegida del hueco y se COMPRA al ask la de 20 puntos más`);
console.log(`  arriba; al cerrar, al revés. Se paga la horquilla en las cuatro patas.`);
function verticalRegla(sel, nombre, ala = 20) {
  const ops = [];
  let sinPrecio = 0;
  for (const d of D) {
    const cands = d.cand.filter((c) => c.hueco);
    if (!cands.length) continue;
    const c = sel(cands);
    const pv = d.precios.get(c.K), pc = d.precios.get(c.K + ala);
    if (!pv || !pc) { sinPrecio++; continue; }
    const [vbE, vaE, vbS, vaS] = pv, [cbE, caE, cbS, caS] = pc;
    if ([vbE, vaE, vbS, vaS, cbE, caE, cbS, caS].some((x) => x == null || !(x >= 0))) { sinPrecio++; continue; }
    const credito = vbE - caE;                 // vendo al bid, compro al ask
    const cierre = vaS - cbS;                  // recompro al ask, vendo al bid
    const dol = (credito - cierre) * 100;
    const riesgo = (ala - credito) * 100;
    ops.push({ dia: d.dia, ano: +d.dia.slice(0, 4), dol, riesgo, rsr: dol / riesgo });
  }
  const r = resumen(ops.map((o) => o.rsr));
  const tot = ops.reduce((a, o) => a + o.dol, 0);
  const s = [...ops].sort((a, b) => a.dol - b.dol);
  const sinTop5 = [...ops].sort((a, b) => b.dol - a.dol).slice(5).reduce((a, o) => a + o.dol, 0);
  const porAno = {};
  for (const o of ops) porAno[o.ano] = (porAno[o.ano] ?? 0) + o.dol;
  console.log(`\n  ${nombre}`);
  console.log(`    operaciones ${ops.length} (sin precio ${sinPrecio})   ret sobre riesgo ${pct(r.media)}  t ${f2(r.t)}  aciertos ${pct(r.aciertos)}`);
  console.log(`    $/año ${(tot / ANOS).toFixed(0)}   mediana $/op ${f2(s[Math.floor(s.length / 2)].dol)}   peor día ${f2(s[0].dol)}`);
  console.log(`    quitando los 5 mejores días: $/año ${(sinTop5 / ANOS).toFixed(0)}`);
  console.log(`    año a año: ${Object.entries(porAno).map(([a, v]) => `${a} ${v.toFixed(0)}`).join("  ")}`);
  return ops;
}
const vMax = verticalRegla((c) => c.reduce((a, b) => (b.sesgo > a.sesgo ? b : a)), "VENDER la call de MÁS sesgo de calls del hueco");
const vMin = verticalRegla((c) => c.reduce((a, b) => (b.sesgo < a.sesgo ? b : a)), "VENDER la call de MENOS sesgo de calls del hueco");
const vMed = verticalRegla((c) => c[Math.floor(c.length / 2)], "control: vender la del medio, sin mirar el sesgo");
{
  const g = dif(vMax.map((o) => o.rsr), vMin.map((o) => o.rsr));
  console.log(`\n  diferencia MÁS sesgo − MENOS sesgo: ${pct(g.d)} sobre riesgo, t ${f2(g.t)}`);
  console.log(`  en dinero: ${((vMax.reduce((a, o) => a + o.dol, 0) - vMin.reduce((a, o) => a + o.dol, 0)) / ANOS).toFixed(0)} $/año de diferencia`);
  const fu = (v) => v.filter((o) => o.dia >= CORTE);
  console.log(`  sólo 2025-2026: más sesgo ${(fu(vMax).reduce((a, o) => a + o.dol, 0) / 1.6).toFixed(0)} $/año   menos sesgo ${(fu(vMin).reduce((a, o) => a + o.dol, 0) / 1.6).toFixed(0)} $/año   del medio ${(fu(vMed).reduce((a, o) => a + o.dol, 0) / 1.6).toFixed(0)} $/año`);
}

// ── 14. EL SOSPECHOSO QUE FALTABA: EL PEAJE ───────────────────────────────────────────────
// En este proyecto ya murió una familia entera por esto: la horquilla es un PORCENTAJE DE LA
// PRIMA. El montón de más sesgo de calls cuesta $4,65 y el de menos cuesta $14,18: con la misma
// horquilla en centavos, el barato paga el triple de peaje. Hay que emparejar por PRECIO.

console.log(`\n═══ EL PEAJE — ¿es que las calls de sesgo alto son simplemente más baratas?`);
for (const o of obs) {
  const c = o.c;
  o.horq = c.bidE != null && c.asks[IE] > 0 ? (c.asks[IE] - c.bidE) / c.asks[IE] : null;
}
console.log(`  montón  coste medio   horquilla media (% de la prima)`);
for (let i = 0; i <= cs5.length; i++) {
  const cb = obs.filter((o) => monton(o.sesgo, cs5) === i);
  const hh = cb.filter((o) => o.horq != null).map((o) => o.horq).sort((a, b) => a - b);
  console.log(`  ${i + 1}       $${f2(cb.reduce((a, o) => a + o.ask, 0) / cb.length).padStart(6)}      ${pct(hh.reduce((a, x) => a + x, 0) / hh.length)}   (mediana ${pct(hh[Math.floor(hh.length / 2)])})`);
}

console.log(`\n  la escalera del sesgo DENTRO de montones de PRECIO de la call (el peaje emparejado):`);
const csP = cortes(obs.map((o) => o.ask), 5);
console.log(`  cortes de precio: ${csP.map((x) => "$" + f2(x)).join("  ")}`);
{
  let num = 0, den = 0, nn = 0;
  for (let p = 0; p <= 4; p++) {
    const sub = obs.filter((o) => monton(o.ask, csP) === p);
    const cs3 = cortes(sub.map((o) => o.sesgo), 3);
    const l = [];
    for (let i = 0; i <= 2; i++) {
      const cb = sub.filter((o) => monton(o.sesgo, cs3) === i);
      l.push(`${pct(resumen(cb.map((o) => o.ret)).media).padStart(9)}`);
    }
    const g = dif(sub.filter((o) => monton(o.sesgo, cs3) === 2).map((o) => o.ret),
                  sub.filter((o) => monton(o.sesgo, cs3) === 0).map((o) => o.ret));
    const w = 1 / (g.d / g.t) ** 2; num += g.d * w; den += w; nn += g.na + g.nb;
    console.log(`    precio ${p + 1}  n=${String(sub.length).padStart(5)}  tercios de sesgo: ${l.join("  ")}   alto−bajo ${pct(g.d)} (t ${f2(g.t)})`);
  }
  console.log(`  SUMANDO los cinco montones de precio: ${pct(num / den)}   t ${f2((num / den) * Math.sqrt(den))}   (n ${nn})`);
}

// ── 15. EL HECHO SIN OPCIONES: ¿toca el precio el strike? (con distancia emparejada) ──────
console.log(`\n═══ EL HECHO LIMPIO — ¿toca el índice el strike entre las 10:00 y las 12:00?`);
console.log(`  sin opciones de por medio: sólo el camino del SPX. Distancia emparejada.`);
for (const [a, b] of franjas) {
  const sub = obs.filter((o) => o.dp > a && o.dp <= b);
  const cs3 = cortes(sub.map((o) => o.sesgo), 3);
  const l = [];
  for (let i = 0; i <= 2; i++) {
    const cb = sub.filter((o) => monton(o.sesgo, cs3) === i);
    l.push(pct(cb.filter((o) => o.maxTramo >= o.K).length / cb.length).padStart(8));
  }
  console.log(`  +${a}%..+${b}%  n=${String(sub.length).padStart(5)}  % que toca, por tercio de sesgo: ${l.join("  ")}`);
}
{
  // prueba de proporciones, sumando las cuatro franjas
  let num = 0, den = 0;
  for (const [a, b] of franjas) {
    const sub = obs.filter((o) => o.dp > a && o.dp <= b);
    const cs3 = cortes(sub.map((o) => o.sesgo), 3);
    const A = sub.filter((o) => monton(o.sesgo, cs3) === 2), B = sub.filter((o) => monton(o.sesgo, cs3) === 0);
    const pa = A.filter((o) => o.maxTramo >= o.K).length / A.length;
    const pb = B.filter((o) => o.maxTramo >= o.K).length / B.length;
    const se = Math.sqrt((pa * (1 - pa)) / A.length + (pb * (1 - pb)) / B.length);
    const w = 1 / se ** 2; num += (pa - pb) * w; den += w;
  }
  console.log(`  sumando las cuatro franjas: el tercio de MÁS sesgo de calls toca ${pct(num / den)} MENOS`);
  console.log(`  que el de menos, t ${f2((num / den) * Math.sqrt(den))}`);
}

// ── 16. LA PRUEBA QUE DECIDE: DISTANCIA EN UNIDADES DE VOLATILIDAD ────────────────────────
// El montón de más sesgo de calls vive en días de cuna 0,436% y el de menos en días de 0,779%.
// Un mismo +0,3% está MUCHÍSIMO más lejos un día calmado que uno agitado. Así que «toca menos»
// puede ser sólo «los días de sesgo alto se mueven menos», que es el termómetro de volatilidad
// disfrazado de nuevo — el que ya ha matado a casi todo en este proyecto.
//
// Aquí la distancia se mide en UNIDADES DE CUNA: z = (K − precio) / (precio de la cuna ATM).
// Si dentro del mismo z el sesgo sigue separando, es del strike. Si no, era la volatilidad.

console.log(`\n═══ LA PRUEBA QUE DECIDE — la distancia medida en unidades de la cuna del día`);
for (const o of obs) o.z = o.cuna != null ? (o.K - o.spotE) / (o.cuna * o.d.spot0) : null;
const conZ = obs.filter((o) => o.z != null && Number.isFinite(o.z));
const csZ = cortes(conZ.map((o) => o.z), 5);
console.log(`  n con cuna: ${conZ.length}   cortes de z: ${csZ.map(f2).join("  ")}`);
console.log(`  z      n      % que TOCA por tercio de sesgo          ret de la call por tercio de sesgo`);
let numT = 0, denT = 0, numR = 0, denR = 0;
for (let p = 0; p <= 4; p++) {
  const sub = conZ.filter((o) => monton(o.z, csZ) === p);
  const cs3 = cortes(sub.map((o) => o.sesgo), 3);
  const tt = [], rr = [];
  for (let i = 0; i <= 2; i++) {
    const cb = sub.filter((o) => monton(o.sesgo, cs3) === i);
    tt.push(pct(cb.filter((o) => o.maxTramo >= o.K).length / cb.length).padStart(8));
    rr.push(pct(resumen(cb.map((o) => o.ret)).media).padStart(9));
  }
  const A = sub.filter((o) => monton(o.sesgo, cs3) === 2), B = sub.filter((o) => monton(o.sesgo, cs3) === 0);
  const pa = A.filter((o) => o.maxTramo >= o.K).length / A.length;
  const pb = B.filter((o) => o.maxTramo >= o.K).length / B.length;
  const se = Math.sqrt((pa * (1 - pa)) / A.length + (pb * (1 - pb)) / B.length);
  let w = 1 / se ** 2; numT += (pa - pb) * w; denT += w;
  const g = dif(A.map((o) => o.ret), B.map((o) => o.ret));
  w = 1 / (g.d / g.t) ** 2; numR += g.d * w; denR += w;
  console.log(`  ${p + 1}    ${String(sub.length).padStart(5)}   ${tt.join("  ")}      ${rr.join("  ")}`);
}
console.log(`\n  SUMANDO los cinco montones de z:`);
console.log(`    ¿toca el strike?   el tercio de MÁS sesgo de calls toca ${pct(numT / denT)} menos   t ${f2((numT / denT) * Math.sqrt(denT))}`);
console.log(`    ret de la call     alto − bajo ${pct(numR / denR)}   t ${f2((numR / denR) * Math.sqrt(denR))}`);

// y el mismo emparejamiento por z, pero fuera de muestra
console.log(`\n  el mismo emparejamiento por z, partido en el tiempo:`);
for (const [nombre, filtro] of [["DENTRO 2022-2024", (o) => !o.fuera], ["FUERA 2025-2026", (o) => o.fuera]]) {
  const base = conZ.filter(filtro);
  let nT = 0, dT = 0, nR = 0, dR = 0;
  for (let p = 0; p <= 4; p++) {
    const sub = base.filter((o) => monton(o.z, csZ) === p);
    if (sub.length < 90) continue;
    const cs3 = cortes(sub.map((o) => o.sesgo), 3);
    const A = sub.filter((o) => monton(o.sesgo, cs3) === 2), B = sub.filter((o) => monton(o.sesgo, cs3) === 0);
    const pa = A.filter((o) => o.maxTramo >= o.K).length / A.length;
    const pb = B.filter((o) => o.maxTramo >= o.K).length / B.length;
    const se = Math.sqrt((pa * (1 - pa)) / A.length + (pb * (1 - pb)) / B.length);
    let w = 1 / se ** 2; nT += (pa - pb) * w; dT += w;
    const g = dif(A.map((o) => o.ret), B.map((o) => o.ret));
    if (Number.isFinite(g.t) && g.t !== 0) { w = 1 / (g.d / g.t) ** 2; nR += g.d * w; dR += w; }
  }
  console.log(`    ${nombre}: toca ${pct(nT / dT)} (t ${f2((nT / dT) * Math.sqrt(dT))})   ret call ${pct(nR / dR)} (t ${f2((nR / dR) * Math.sqrt(dR))})`);
}

// ── 17. LA REGLA, PARTIDA EN TRES ─────────────────────────────────────────────────────────
console.log(`\n═══ LA REGLA (comprar la call de más sesgo del hueco) PARTIDA EN TRES TERCIOS`);
{
  const ops = rMax.ops;
  const k = Math.floor(ops.length / 3);
  const partes = [ops.slice(0, k), ops.slice(k, 2 * k), ops.slice(2 * k)];
  partes.forEach((p, i) => {
    const r = resumen(p.map((o) => o.ret));
    console.log(`  tercio ${i + 1} (${p[0].dia} … ${p.at(-1).dia})  n=${p.length}  ret ${pct(r.media)}  t ${f2(r.t)}  $ total ${p.reduce((a, o) => a + o.dol, 0).toFixed(0)}`);
  });
  const m = Math.floor(ops.length / 2);
  const h1 = resumen(ops.slice(0, m).map((o) => o.ret)), h2 = resumen(ops.slice(m).map((o) => o.ret));
  console.log(`  mitad 1: ret ${pct(h1.media)} (t ${f2(h1.t)})   mitad 2: ret ${pct(h2.media)} (t ${f2(h2.t)})`);
}

console.log(`\n(fin)`);
