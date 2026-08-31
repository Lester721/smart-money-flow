// SEGUIR EL CONTRATO EXACTO QUE ALGUIEN COMPRÓ CON PRISA Y CON DINERO GRANDE
//
// ═══ LA PREGUNTA, QUE ES DE LESTER Y ES NUEVA ═══════════════════════════════════════════════
//
// «¿Y si pruebas comprar aquellos contratos justo el día después de que tuvieron una compra
//  agresiva (al ask o por encima) de más de $500,000... sólo en 2026? Después de esa compra,
//  ¿en algún momento antes de su expiración duplicaron o más su valor?»
//
// Es distinta de TODO lo medido hasta ahora, en dos cosas:
//
//   1. Hasta hoy siempre comprábamos **un strike elegido por regla** (el 5% o el 10% fuera del
//      dinero). Aquí se compra **el contrato exacto** que alguien acaba de comprar. No lo elige
//      una fórmula: lo elige quien puso el dinero.
//   2. Hasta hoy medíamos el valor **en un día fijo** (a los 23 o 30 días). Aquí se pregunta si
//      **en ALGÚN momento** antes de vencer llegó a doblar. Para el que compra —con la pérdida
//      acotada a la prima— esa es la pregunta correcta, porque puede vender cuando quiera.
//
// ═══ EL AVISO QUE VA POR DELANTE ════════════════════════════════════════════════════════════
//
// «¿Llegó a doblar en algún momento?» NO ES UNA ESTRATEGIA. Nadie sabe vender en el máximo. Es
// una medición de lo que HABÍA disponible, y sirve para saber si merece la pena buscar una
// regla de salida. Si resulta que el 40% de estos contratos doblan en algún momento, hay algo
// que perseguir. Si es el 6% —lo mismo que comprando al azar— está cerrado y no se toca más.
// Por eso el número que manda es la COMPARACIÓN contra el control, no el número suelto.
//
// ═══ EL CONTROL, QUE ES LO QUE DECIDE ═══════════════════════════════════════════════════════
//
// Para cada compra grande se mide TAMBIÉN un contrato de control: el mismo ticker, el mismo día,
// el mismo vencimiento, el mismo lado, pero **otro strike** elegido sin mirar el flujo. Si el
// contrato que compró el dinero grande dobla igual de a menudo que su vecino, entonces el flujo
// no dice nada y lo que se está midiendo es el mercado de ese día.
//
// Y un segundo control: los contratos que se vendieron con prisa (AT_BID / BELOW_BID) con el
// mismo tamaño. Si esos doblan igual, el LADO no importa y sólo estamos viendo tamaño.
//
// ═══ LOS DATOS ══════════════════════════════════════════════════════════════════════════════
//
//   cache-theta/TICKER_y_2026*.json   la cinta: cada operación con su símbolo, precio, tamaño,
//                                     lado (AT_ASK / ABOVE_ASK / MIDMKT / AT_BID / BELOW_BID),
//                                     prima en dólares, y la hora.
//   cache-theta/cadenas/TICKER_dAAAAMMDD.json   { "20260717": { "295|C": [bid, ask] }, … }
//
// El símbolo trae el contrato entero: AAPL260717C00295000 = AAPL, vence 2026-07-17, CALL, 295.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/p1-seguir-el-dinero-grande.mjs

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CACHE } from "./raiz.mjs";

const DIR_CAD = join(CACHE, "cadenas");
const PRIMA_MIN = 500_000;
const AGRESIVAS = new Set(["AT_ASK", "ABOVE_ASK"]);
const VENDEDORAS = new Set(["AT_BID", "BELOW_BID"]);

// ── el símbolo OSI: AAPL260717C00295000 ────────────────────────────────────
function partirSimbolo(s) {
  const m = /^([A-Z]+)(\d{6})([CP])(\d{8})$/.exec(String(s ?? "").trim());
  if (!m) return null;
  const [, tk, yymmdd, lado, k] = m;
  return {
    ticker: tk,
    exp: `20${yymmdd}`,                       // clave del vencimiento en la cadena
    lado,
    strike: Number(k) / 1000,
  };
}

// ── las cadenas, con caché acotada ─────────────────────────────────────────
const _cache = new Map();
function cadena(ticker, dY) {
  const clave = `${ticker}|${dY}`;
  if (_cache.has(clave)) return _cache.get(clave);
  const f = join(DIR_CAD, `${ticker}_d${dY}.json`);
  const v = existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
  _cache.set(clave, v);
  if (_cache.size > 400) _cache.delete(_cache.keys().next().value);
  return v;
}
const diasDe = (() => {
  const m = new Map();
  for (const f of readdirSync(DIR_CAD)) {
    const g = /^([A-Z]+)_d(\d{8})\.json$/.exec(f);
    if (!g) continue;
    if (!m.has(g[1])) m.set(g[1], []);
    m.get(g[1]).push(g[2]);
  }
  for (const v of m.values()) v.sort();
  return m;
})();

/** El precio [bid, ask] de un contrato concreto un día concreto, o null. */
function precio(ticker, dY, exp, strike, lado) {
  const c = cadena(ticker, dY);
  if (!c) return null;
  const g = c[exp];
  if (!g) return null;
  // el strike puede venir como "295" o "295.0"
  return g[`${strike}|${lado}`] ?? g[`${Number(strike)}|${lado}`] ?? null;
}

/**
 * Compra un contrato al ASK el día `dCompra` y sigue su BID cada día hasta vencer.
 * Devuelve el MEJOR múltiplo alcanzado y también el del último día con precio.
 * null si no se puede comprar o no hay ningún día de seguimiento.
 */
function seguir(ticker, dCompra, exp, strike, lado) {
  const p0 = precio(ticker, dCompra, exp, strike, lado);
  if (!p0 || !(p0[1] > 0)) return null;
  const coste = p0[1];                         // se compra al ASK, siempre
  const dias = diasDe.get(ticker) ?? [];
  let mejor = null, ultimo = null, nDias = 0, diaMejor = null;
  for (const d of dias) {
    if (d <= dCompra) continue;
    if (d > exp) break;
    const p = precio(ticker, d, exp, strike, lado);
    if (!p) continue;
    const salida = p[0];                       // se vende al BID, siempre
    nDias++;
    const mult = salida / coste;
    ultimo = mult;
    if (mejor == null || mult > mejor) { mejor = mult; diaMejor = d; }
  }
  if (nDias === 0) return null;
  return { coste, mejor, ultimo, nDias, diaMejor };
}

// ── recoger las compras grandes de 2026 ────────────────────────────────────
const ficheros = readdirSync(CACHE).filter((f) => /^[A-Z]+_y_2026\d{4}_2026\d{4}\.json$/.test(f));
console.log(`## ${ficheros.length} ficheros de cinta de 2026\n`);

const casos = { agresiva: [], vendedora: [], control: [] };
let vistas = 0, sinSimbolo = 0, sinCadena = 0, sinSeguimiento = 0;

for (const f of ficheros) {
  let cinta;
  try { cinta = JSON.parse(readFileSync(join(CACHE, f), "utf8")); } catch { continue; }
  if (!Array.isArray(cinta)) continue;

  for (const op of cinta) {
    const prima = op.premium ?? 0;
    if (!(prima >= PRIMA_MIN)) continue;
    const esAgresiva = AGRESIVAS.has(op.side);
    const esVendedora = VENDEDORAS.has(op.side);
    if (!esAgresiva && !esVendedora) continue;
    vistas++;

    const c = partirSimbolo(op.symbol);
    if (!c) { sinSimbolo++; continue; }

    // el día SIGUIENTE al de la operación, que es lo que pide la pregunta
    const dOp = String(op.timestamp ?? "").slice(0, 10).replace(/-/g, "");
    const dias = diasDe.get(c.ticker) ?? [];
    const i = dias.findIndex((d) => d > dOp);
    if (i < 0) { sinCadena++; continue; }
    const dCompra = dias[i];
    if (dCompra >= c.exp) { sinCadena++; continue; }

    const r = seguir(c.ticker, dCompra, c.exp, c.strike, c.lado);
    if (!r) { sinSeguimiento++; continue; }

    const fila = { ...c, dOp, dCompra, prima, side: op.side, ...r };
    (esAgresiva ? casos.agresiva : casos.vendedora).push(fila);

    // ── EL CONTROL: mismo ticker, mismo día, mismo vencimiento, mismo lado, OTRO strike ──
    // Se coge el strike inmediatamente más lejos del dinero. No lo elige el flujo: lo elige la
    // rejilla. Si el del dinero grande dobla igual que su vecino, el flujo no dice nada.
    const cad = cadena(c.ticker, dCompra)?.[c.exp];
    if (cad) {
      const ks = [...new Set(Object.keys(cad).filter((k) => k.endsWith(`|${c.lado}`))
        .map((k) => Number(k.slice(0, -2))))].sort((a, b) => a - b);
      const j = ks.indexOf(c.strike);
      const vecino = j >= 0 ? (c.lado === "C" ? ks[j + 1] : ks[j - 1]) : null;
      if (vecino != null) {
        const rc = seguir(c.ticker, dCompra, c.exp, vecino, c.lado);
        if (rc) casos.control.push({ ...c, strike: vecino, dCompra, ...rc });
      }
    }
  }
}

console.log(`operaciones de más de $${(PRIMA_MIN / 1000).toFixed(0)}k y con prisa: ${vistas.toLocaleString("en-US")}`);
console.log(`   descartes: símbolo raro ${sinSimbolo} · sin cadena ${sinCadena} · sin días de seguimiento ${sinSeguimiento}`);
console.log(`   seguidas: agresivas de COMPRA ${casos.agresiva.length} · agresivas de VENTA ${casos.vendedora.length} · vecinos de control ${casos.control.length}\n`);

// ── el reparto ─────────────────────────────────────────────────────────────
const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + "%" : "—");
function reparto(lista, etiqueta) {
  if (!lista.length) { console.log(`  ${etiqueta}: sin casos`); return null; }
  const n = lista.length;
  const llega = (x) => lista.filter((r) => r.mejor >= x).length;
  const medMejor = lista.reduce((a, r) => a + r.mejor, 0) / n;
  const medUlt = lista.reduce((a, r) => a + r.ultimo, 0) / n;
  console.log(`  ${etiqueta.padEnd(30)} n=${String(n).padStart(5)}`);
  console.log(`     LLEGÓ A VALER, en algún momento antes de vencer:`);
  console.log(`        2 veces o más   ${String(llega(2)).padStart(5)}  (${pct(llega(2), n)})`);
  console.log(`        3 veces o más   ${String(llega(3)).padStart(5)}  (${pct(llega(3), n)})`);
  console.log(`        5 veces o más   ${String(llega(5)).padStart(5)}  (${pct(llega(5), n)})`);
  console.log(`       10 veces o más   ${String(llega(10)).padStart(5)}  (${pct(llega(10), n)})`);
  console.log(`     el mejor momento medio: ${medMejor.toFixed(2)}x · el ÚLTIMO día: ${medUlt.toFixed(2)}x`);
  console.log(`     (la diferencia entre esos dos es lo que se pierde por no vender a tiempo)`);
  return { n, dobla: llega(2) / n, medMejor, medUlt };
}

console.log("### ¿LLEGARON A DOBLAR ANTES DE VENCER?\n");
const a = reparto(casos.agresiva, "COMPRA agresiva >$500k");
console.log("");
const c = reparto(casos.control, "su vecino de al lado");
console.log("");
const v = reparto(casos.vendedora, "VENTA agresiva >$500k");

console.log(`\n### LO QUE DECIDE\n`);
if (a && c) {
  console.log(`  dobla el ${pct(a.dobla * a.n, a.n)} de los que compró el dinero grande`);
  console.log(`  dobla el ${pct(c.dobla * c.n, c.n)} de sus vecinos, elegidos sin mirar el flujo`);
  console.log(`  y comprando al azar en todo el estudio anterior doblaba el 6.2%`);
  console.log(`\n  Si los tres números se parecen, el flujo no dice nada.`);
}
