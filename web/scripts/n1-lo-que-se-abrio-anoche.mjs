// LO QUE SE ABRIÓ ANOCHE — la variable que este proyecto nunca ha usado.
//
// ═══ DE DÓNDE SALE ══════════════════════════════════════════════════════════════════════════
//
// Todo lo medido del GEX usa la FOTO del interés abierto de la mañana del vencimiento. Esa foto
// no distingue una montaña VIEJA de una RECIÉN HECHA, y el día de Eduardo enseña que no son lo
// mismo: la call 7700 pasó de 2.603 a 8.404 contratos en una sola noche (+5.801), mientras el
// resto de strikes cerca del dinero subían entre 600 y 1.900.
//
// Ahora tenemos el dato para los 1.122 días: el OI de la VÍSPERA de cada vencimiento. Restando,
// sale cuántos contratos se abrieron en la última sesión, strike por strike.
//
// ═══ LAS CUATRO PREGUNTAS ═══════════════════════════════════════════════════════════════════
//
// 1. ¿VA EL PRECIO HACIA LA MONTAÑA FRESCA? La del mayor ΔOI cerca del dinero.
//    Contra el espejo (una raya a la misma distancia al otro lado, el mismo día).
//
// 2. ¿ES LA FRESCURA MEJOR QUE EL TAMAÑO? Ésta es la pregunta que justifica la descarga: la
//    montaña por ΔOI contra la montaña por OI TOTAL, el mismo día. Si dan lo mismo, la frescura
//    no aporta nada y la descarga sólo confirma lo que ya sabíamos.
//
// 3. ¿INCLINA LA DIRECCIÓN? Si esa noche se abrieron muchas más calls que puts cerca del dinero,
//    ¿sube el índice más de lo normal? Se prueba en las dos direcciones, porque la teoría admite
//    las dos lecturas (los dealers cortos de calls empujan hacia arriba / es techo).
//
// 4. ¿PREDICE CUÁNTO SE MUEVE EL DÍA? Ésta es la que le sirve a Lester, porque él VENDE. Si una
//    noche de mucha apertura anuncia un día movido, es un filtro directo para la mariposa.
//    Y ojo: el precio de la cuna ya dice eso. Hay que ver si el ΔOI añade algo POR ENCIMA.
//
// ═══ LOS CONTROLES ══════════════════════════════════════════════════════════════════════════
//
// (a) ESPEJO: misma distancia, mismo día, mismo instante, al otro lado del precio.
// (b) BARAJADO: el mapa de ΔOI de otro día, recentrado por DISTANCIA y no por nivel en bruto
//     (el SPX pasó de 4.700 a 7.700: barajar niveles da otra regla, no un control).
// (c) VOLATILIDAD: el precio de la cuna al dinero a las 09:35. Es el control que ha matado a
//     todo lo demás del GEX en este proyecto, así que todo se repite DENTRO de sus tercios.
// (d) FUERA DE MUESTRA: 2022-2024 para mirar, 2025-2026 para comprobar.
//
// ═══ LO QUE HAY QUE VIGILAR ═════════════════════════════════════════════════════════════════
//
// El ΔOI es NETO. Un +100 puede ser 100 abiertos o 300 abiertos y 200 cerrados. Y no dice de
// qué lado: alguien compró y alguien vendió. Esto NO sustituye al Cboe Open-Close, que separa
// las dos cosas; es la mitad de la información, la que ya está pagada.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { diasDisponibles, cargarDia, rejilla, compraEn, CACHE } from "./lib0dte.mjs";

const DIR_VISP = join(CACHE, "oi-vispera");
const BANDA = 0.015;          // ±1,5% del precio: donde vive lo que se puede mirar en pantalla
const DESPLAZA = 137;

const med = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { const m = med(v); return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)); };
const tDos = (a, b) => (med(a) - med(b)) / Math.sqrt(sd(a) ** 2 / a.length + sd(b) ** 2 / b.length);
const mediana = (v) => { const s = [...v].sort((x, y) => x - y); return s[s.length >> 1]; };

// ── recoger un resumen por día ──────────────────────────────────────────────
const filas = [];
let sinVisp = 0, sinCuna = 0;

for (const dd of diasDisponibles()) {
  const rv = join(DIR_VISP, `${dd}.json`);
  if (!existsSync(rv)) { sinVisp++; continue; }
  const d = cargarDia(dd);
  if (!d || !d.oi) { sinVisp++; continue; }

  const b0 = d.barras[0], U = b0.spot;
  const K0 = rejilla(U);
  const cc = compraEn(b0, K0, "C"), pp = compraEn(b0, K0, "P");
  if (cc == null || pp == null || !(cc + pp > 0)) { sinCuna++; continue; }
  const cuna = (cc + pp) / U;                       // el movimiento que el mercado cobra hoy

  const visp = JSON.parse(readFileSync(rv, "utf8")).oi ?? {};

  // ΔOI y OI total por strike, dentro de la banda
  const delta = new Map(), total = new Map();
  let abiertasC = 0, abiertasP = 0, totalAbiertas = 0, totalOI = 0;
  for (const clave of new Set([...Object.keys(d.oi), ...Object.keys(visp)])) {
    const [ks, lado] = clave.split("|");
    const K = Number(ks);
    const hoy = d.oi[clave] ?? 0, ayer = visp[clave] ?? 0;
    const dif = hoy - ayer;
    totalOI += hoy;
    if (dif > 0) totalAbiertas += dif;
    if (Math.abs(K - U) / U > BANDA) continue;
    delta.set(K, (delta.get(K) ?? 0) + dif);
    total.set(K, (total.get(K) ?? 0) + hoy);
    if (dif > 0) { if (lado === "C") abiertasC += dif; else abiertasP += dif; }
  }
  if (delta.size < 10) continue;

  const mayor = (m, filtro) => {
    let best = null;
    for (const [K, v] of m) { if (filtro && !filtro(K)) continue; if (!best || v > best.v) best = { K, v }; }
    return best;
  };
  const fresca = mayor(delta);                       // la montaña RECIÉN HECHA
  const gorda = mayor(total);                        // la montaña por tamaño total
  if (!fresca || !gorda || !(fresca.v > 0)) continue;

  const spots = d.barras.map((b) => b.spot);
  const cierre = spots[spots.length - 1];
  const maxD = Math.max(...spots), minD = Math.min(...spots);

  filas.push({
    dia: dd, anio: dd.slice(0, 4), U, cuna, cierre,
    // ¿toca el precio cada nivel en algún momento del día? (±5 puntos)
    tocaFresca: spots.some((s) => Math.abs(s - fresca.K) <= 5),
    tocaGorda: spots.some((s) => Math.abs(s - gorda.K) <= 5),
    // el espejo de la fresca: misma distancia, al otro lado de la apertura
    tocaEspejo: spots.some((s) => Math.abs(s - (2 * U - fresca.K)) <= 5),
    distFrescaPct: ((fresca.K - U) / U) * 100,
    distGordaPct: ((gorda.K - U) / U) * 100,
    frescaArriba: fresca.K > U,
    // dirección: subió o bajó el día
    subio: cierre > U,
    retPct: ((cierre - U) / U) * 100,
    // desbalance de lo ABIERTO esa noche, cerca del dinero
    desbAbierto: abiertasC + abiertasP > 0 ? (abiertasC - abiertasP) / (abiertasC + abiertasP) : 0,
    // cuánto se abrió, normalizado por el tamaño de la cadena (forma, no tamaño)
    intensidad: totalOI > 0 ? totalAbiertas / totalOI : 0,
    // recorrido real del día, en unidades de lo que el mercado cobraba
    recorrido: (maxD - minD) / U / cuna,
    // para el barajado
    _delta: delta, _spots: spots,
  });
}
console.log(`## ${filas.length} días · sin víspera ${sinVisp} · sin cuna ${sinCuna}\n`);

// ── 1 y 2 · ¿va el precio hacia la montaña fresca, y bate a la gorda? ───────
const pct = (v) => (100 * v.filter(Boolean).length / v.length).toFixed(1);
console.log("### 1 y 2 · ¿VA EL PRECIO HACIA LA MONTAÑA?\n");
console.log(`  toca la montaña FRESCA (mayor ΔOI):    ${pct(filas.map((f) => f.tocaFresca))}%   distancia mediana ${mediana(filas.map((f) => Math.abs(f.distFrescaPct))).toFixed(2)}%`);
console.log(`  toca la montaña GORDA (mayor OI total): ${pct(filas.map((f) => f.tocaGorda))}%   distancia mediana ${mediana(filas.map((f) => Math.abs(f.distGordaPct))).toFixed(2)}%`);
console.log(`  toca el ESPEJO de la fresca:            ${pct(filas.map((f) => f.tocaEspejo))}%`);
console.log(`\n  (si fresca ≈ espejo, no hay atracción. Si fresca ≈ gorda, la frescura no aporta.)\n`);

// pareada, sólo donde las dos rayas están a distinta distancia del precio
const comp = filas.filter((f) => Math.abs(Math.abs(f.distFrescaPct) - Math.abs(f.distGordaPct)) > 0.05);
console.log(`  Comparación pareada fresca vs gorda (${comp.length} días donde no son el mismo nivel):`);
console.log(`     fresca ${pct(comp.map((f) => f.tocaFresca))}%  ·  gorda ${pct(comp.map((f) => f.tocaGorda))}%`);
const soloF = comp.filter((f) => f.tocaFresca && !f.tocaGorda).length;
const soloG = comp.filter((f) => !f.tocaFresca && f.tocaGorda).length;
console.log(`     sólo la fresca ${soloF}  ·  sólo la gorda ${soloG}  (si son parecidos, empate)\n`);

// ── 3 · ¿inclina la dirección? ─────────────────────────────────────────────
console.log("### 3 · ¿INCLINA LA DIRECCIÓN LO QUE SE ABRIÓ ANOCHE?\n");
const arriba = filas.filter((f) => f.frescaArriba), abajo = filas.filter((f) => !f.frescaArriba);
console.log(`  con la montaña fresca ARRIBA (n=${arriba.length}): el índice sube el ${pct(arriba.map((f) => f.subio))}% de los días`);
console.log(`  con la montaña fresca ABAJO  (n=${abajo.length}): sube el ${pct(abajo.map((f) => f.subio))}%`);
console.log(`  diferencia de retorno: ${(med(arriba.map((f) => f.retPct)) - med(abajo.map((f) => f.retPct))).toFixed(3)} puntos · t=${tDos(arriba.map((f) => f.retPct), abajo.map((f) => f.retPct)).toFixed(2)}\n`);

function escalera(campo, objetivo, etiqueta, datos = filas, fmt = (x) => x.toFixed(3)) {
  const ord = [...datos].sort((a, b) => a[campo] - b[campo]);
  const paso = Math.floor(ord.length / 5);
  if (paso < 20) { console.log(`  ${etiqueta}: muestra corta\n`); return; }
  console.log(`  ${etiqueta}`);
  console.log(`    montón |  señal   | ${objetivo.padEnd(9)}| n`);
  const sal = [];
  for (let q = 0; q < 5; q++) {
    const t = ord.slice(q * paso, q === 4 ? ord.length : (q + 1) * paso);
    const v = med(t.map((x) => x[objetivo]));
    sal.push(v);
    console.log(`      ${q + 1}    | ${med(t.map((x) => x[campo])).toFixed(4).padStart(8)} | ${fmt(v).padStart(9)} | ${t.length}`);
  }
  const sube = sal.every((v, j) => j === 0 || v >= sal[j - 1]);
  const baja = sal.every((v, j) => j === 0 || v <= sal[j - 1]);
  console.log(`    monótona: ${sube ? "SÍ, sube" : baja ? "SÍ, baja" : "NO"}\n`);
}
escalera("desbAbierto", "retPct", "por el desbalance de lo abierto (más puts ← → más calls)");

// ── 4 · ¿predice cuánto se mueve el día? ───────────────────────────────────
console.log("### 4 · ¿ANUNCIA UNA NOCHE DE MUCHA APERTURA UN DÍA MOVIDO?\n");
console.log("  (el recorrido va en unidades de lo que el mercado cobraba: 1,0 = se movió lo esperado)\n");
escalera("intensidad", "recorrido", "por la INTENSIDAD de apertura (contratos abiertos / OI total)");
console.log("  Y el control que decide: ¿aporta algo POR ENCIMA del precio de la cuna?\n");
const porCuna = [...filas].sort((a, b) => a.cuna - b.cuna);
const t3 = Math.floor(porCuna.length / 3);
for (const [et, trozo] of [["tercio TRANQUILO", porCuna.slice(0, t3)],
                            ["tercio MEDIO", porCuna.slice(t3, 2 * t3)],
                            ["tercio MOVIDO", porCuna.slice(2 * t3)]]) {
  const o = [...trozo].sort((a, b) => a.intensidad - b.intensidad);
  const m = Math.floor(o.length / 2);
  const bajo = o.slice(0, m).map((x) => x.recorrido), alto = o.slice(-m).map((x) => x.recorrido);
  console.log(`    ${et.padEnd(18)} poca apertura ${med(bajo).toFixed(3)}  ·  mucha ${med(alto).toFixed(3)}  ·  dif ${(med(alto) - med(bajo)).toFixed(3)}  t=${tDos(alto, bajo).toFixed(2)}`);
}

// ── fuera de muestra ───────────────────────────────────────────────────────
console.log("\n### FUERA DE MUESTRA\n");
for (const [et, f] of [["2022-2024", filas.filter((x) => x.anio < "2025")], ["2025-2026", filas.filter((x) => x.anio >= "2025")]]) {
  const a = f.filter((x) => x.frescaArriba), b = f.filter((x) => !x.frescaArriba);
  const o = [...f].sort((x, y) => x.intensidad - y.intensidad);
  const m = Math.floor(o.length / 2);
  console.log(`  ${et} (n=${f.length}):`);
  console.log(`     toca fresca ${pct(f.map((x) => x.tocaFresca))}% · espejo ${pct(f.map((x) => x.tocaEspejo))}%`);
  console.log(`     dirección: montaña arriba sube ${pct(a.map((x) => x.subio))}% · abajo sube ${pct(b.map((x) => x.subio))}%`);
  console.log(`     recorrido: poca apertura ${med(o.slice(0, m).map((x) => x.recorrido)).toFixed(3)} · mucha ${med(o.slice(-m).map((x) => x.recorrido)).toFixed(3)}`);
}
