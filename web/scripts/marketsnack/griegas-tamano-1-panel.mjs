// ══════════════════════════════════════════════════════════════════════════════════════════
// GRIEGAS-TAMAÑO · PASO 1 — EL PANEL (ticker, día)
// ══════════════════════════════════════════════════════════════════════════════════════════
//
// LA PREGUNTA, y en qué se diferencia de lo ya muerto. Once métricas de MarketSnack se midieron
// contra el RETORNO CON SIGNO de la acción y las once fallaron. Comprar una call es otro negocio:
// hay que acertar la dirección Y EL TAMAÑO, y si no se mueve se pierde la prima entera. Una señal
// demasiado débil para la dirección puede servir para opciones si lo que predice son movimientos
// GRANDES. Eso es lo que se mide aquí: |retorno|.
//
// TRES MÉTRICAS POR (ticker, día), todas con el LADO REAL de MarketSnack, no supuesto:
//
//   1. GAMMA$ del dealer — dólares de delta que el creador de mercado tiene que recomprar/vender
//      por cada 1% que se mueva el subyacente. gamma$ NEGATIVO = dealer corto de gamma = se cubre
//      EN LA DIRECCIÓN del movimiento = amplifica. Predice MAGNITUD, no dirección.
//   2. VEGA$ del dealer — dólares por punto de volatilidad. vega$ NEGATIVO = el dealer está corto
//      de vega = ALGUIEN LE ESTÁ COMPRANDO VOLATILIDAD. Hipótesis: ese alguien espera un salto.
//      **Esta métrica NO se había medido nunca en el proyecto.**
//   3. IV PAGADA vs IV DEL RESTO — IV media ponderada por prima de las operaciones que el cliente
//      COMPRA menos la de las que VENDE, el mismo día y el mismo ticker. Positivo = están pagando
//      por encima de lo que se vende. **Tampoco se había medido: lo medido antes era la IV del
//      flujo entero, sin separar quién compra.**
//
// SIGNO DEL DEALER (medido, no convención de calle):
//   cliente paga la oferta (AT_ASK / ABOVE_ASK / ASKSIDE)  -> dealer VENDE  -> dealer CORTO (−1)
//   cliente pega al bid   (AT_BID / BELOW_BID / BIDSIDE)   -> dealer COMPRA -> dealer LARGO (+1)
//   MIDMKT -> no se le inventa lado, se descarta.
//
// ══ DEFENSAS (heredadas de medir-dolares-griegos.mjs, que ya las validó) ═══════════════════
//  1. CORTE 19:00 UTC = 15:00 ET. Todo el período es EDT. La entrada es al CIERRE de ese día,
//     posterior al corte. Cero futuro. Sin esto, el 1,2% del flujo llega DESPUÉS del cierre.
//  2. PRECIO DE ESCALA = CIERRE DE D−1, no `asset_price`: ese campo viene nulo en el 54-68% de
//     las filas ANTES del 2026-07-16 y en el 0,0% DESPUÉS (ruptura de la tubería de MS).
//  3. TRANSVERSAL DENTRO DEL DÍA: el movimiento del mercado se cancela solo.
//  4. NORMALIZACIÓN SIN FUTURO: intensidad (neto/bruto del mismo día) y z contra los 20 días de
//     mercado ESTRICTAMENTE anteriores de ESE símbolo.
//  5. SPLITS: se retira la VENTANA que cruza un salto >±25%, no el símbolo (retirar el símbolo
//     sesgaría el universo hacia los valores tranquilos).
//  6. La barra del día en curso puede ser parcial -> fuera.
//
// ══ LO QUE ESTE PASO NO HACE ═══════════════════════════════════════════════════════════════
// No mide nada. Sólo construye el panel y lo deja en disco. La medición es el paso 2, y el
// dinero real (comprar el cono con precios de cadena) es el paso 3.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/marketsnack/griegas-tamano-1-panel.mjs

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { comprobarDescarte } from "../../lib/barreraHallazgos.ts";
import { radiografia } from "../../lib/radiografia.ts";

const DIR_FLUJO = "scripts/cache-theta/marketsnack/flujo-100k";
const DIR_CHART = "scripts/cache-theta/marketsnack/aux/chart-all";
const SALIDA = "scripts/marketsnack/griegas-tamano-panel.json";

const CORTE = "19:00";              // UTC = 15:00 ET durante todo el período
const HORIZONTES = [1, 5, 20];
const MIN_OPS_SIMBOLO_DIA = 8;
const MIN_COBERTURA = 0.6;          // ≥60% de la prima del símbolo-día con griegas finitas
const VENTANA_Z = 20;
const MIN_Z = 10;
const SALTO_SPLIT = 0.25;
const ULTIMO_DIA = "2026-08-19";
const N_RV = 20;                    // días para la volatilidad realizada previa

const RE = /^([A-Z]+)(\d{6})([CP])(\d{8})$/;
const COMPRA = new Set(["ASKSIDE", "ABOVE_ASK", "AT_ASK"]);   // cliente compra -> dealer CORTO
const VENTA = new Set(["BIDSIDE", "BELOW_BID", "AT_BID"]);    // cliente vende  -> dealer LARGO

const media = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const desv = (a) => { if (a.length < 2) return 0; const m = media(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };

console.log("═".repeat(96));
console.log("GRIEGAS-TAMAÑO · PASO 1 — panel (ticker, día) con gamma$, vega$ e IV pagada");
console.log("═".repeat(96));

// ── 1. SERIES DE PRECIO ───────────────────────────────────────────────────────────────────
const cierres = new Map();
const idxFecha = new Map();
let saltosEnPeriodo = 0;
for (const f of fs.readdirSync(DIR_CHART)) {
  const T = f.replace(".json.gz", "");
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DIR_CHART, f))).toString("utf8"));
  let s = (j.data || []).map((p) => ({ f: p.t.slice(0, 10), c: p.v })).filter((p) => Number.isFinite(p.c) && p.c > 0);
  s.sort((a, b) => a.f.localeCompare(b.f));
  s = s.filter((p) => p.f < ULTIMO_DIA);
  if (s.length < 30) continue;
  for (let i = 1; i < s.length; i++) {
    if (Math.abs(s[i].c / s[i - 1].c - 1) > SALTO_SPLIT) {
      s[i].salto = true;
      if (s[i].f >= "2026-04-22") saltosEnPeriodo++;
    }
  }
  cierres.set(T, s);
  idxFecha.set(T, new Map(s.map((p, i) => [p.f, i])));
}
console.log(`\nSERIES DE PRECIO: ${cierres.size} símbolos (≥30 barras, sin la barra parcial de ${ULTIMO_DIA})`);
console.log(`  saltos >±25% dentro del período: ${saltosEnPeriodo} — se retiran las VENTANAS que los crucen, no los símbolos`);

function ventanaSana(s, i, h) {
  if (i + h >= s.length) return false;
  for (let k = i + 1; k <= i + h; k++) if (s[k].salto) return false;
  const dd = (new Date(s[i + h].f) - new Date(s[i].f)) / 86400000;
  return dd > 0 && dd <= h * 1.55 + 6;
}

/** Volatilidad realizada de los N días de mercado que terminan en el índice i (cierre de D). */
function rvHasta(s, i, N = N_RV) {
  if (i < N) return null;
  const r = [];
  for (let k = i - N + 1; k <= i; k++) {
    if (s[k].salto) return null;                       // un split adentro envenena la rv
    r.push(s[k].c / s[k - 1].c - 1);
  }
  const sd = desv(r);
  return sd > 0 ? sd : null;
}

// ── 2. FLUJO -> AGREGADO POR (SÍMBOLO, DÍA) ───────────────────────────────────────────────
const dias = fs.readdirSync(DIR_FLUJO).filter((f) => f.endsWith(".jsonl.gz")).map((f) => f.slice(0, 10)).sort();
const agg = new Map();
const primaPorSimDia = new Map();
let leidas = 0, trasCorte = 0, trasParse = 0, trasUniverso = 0, trasGriegas = 0, trasLado = 0, trasCotiz = 0;

for (const d of dias) {
  const raw = zlib.gunzipSync(fs.readFileSync(path.join(DIR_FLUJO, `${d}.jsonl.gz`))).toString("utf8").split("\n");
  for (const l of raw) {
    if (!l) continue;
    let t; try { t = JSON.parse(l); } catch { continue; }
    leidas++;
    if (!t.timestamp || t.timestamp.slice(11, 16) >= CORTE) continue;      // (a) corte horario
    trasCorte++;
    const m = RE.exec(t.symbol || ""); if (!m) continue;
    trasParse++;
    const raiz = m[1];
    const ser = cierres.get(raiz); if (!ser) continue;                      // (b) universo
    trasUniverso++;
    const kSD = `${raiz}|${d}`;
    primaPorSimDia.set(kSD, (primaPorSimDia.get(kSD) ?? 0) + (t.premium > 0 ? t.premium : 0));
    // (c) griegas: gamma Y vega Y IV finitas. No se estima ninguna.
    if (!Number.isFinite(t.gamma) || !Number.isFinite(t.vega) || !Number.isFinite(t.implied_volatility) || !(t.size > 0)) continue;
    trasGriegas++;
    const sgn = COMPRA.has(t.side) ? -1 : VENTA.has(t.side) ? +1 : 0;       // (d) signo del DEALER
    if (sgn === 0) continue;
    trasLado++;
    if (!(t.ask_price > 0) || t.bid_price > t.ask_price) continue;          // (e) cotización sana
    trasCotiz++;

    const i = idxFecha.get(raiz).get(d);
    if (i == null || i < 1) continue;
    const S = ser[i - 1].c;                                                 // escala = cierre D−1

    let a = agg.get(kSD);
    if (!a) a = { raiz, dia: d, dg: 0, absg: 0, dv: 0, absv: 0, ivBuyW: 0, ivBuyP: 0, ivSellW: 0, ivSellP: 0, n: 0, prima: 0 }, agg.set(kSD, a);
    const contratos = t.size * 100;
    const prima = t.premium > 0 ? t.premium : 0;

    // GAMMA$: dólares de delta a recubrir por cada 1% de movimiento del subyacente
    a.dg += sgn * t.gamma * contratos * S * S * 0.01;
    a.absg += t.gamma * contratos * S * S * 0.01;
    // VEGA$: dólares por punto de volatilidad
    a.dv += sgn * t.vega * contratos;
    a.absv += Math.abs(t.vega) * contratos;
    // IV: media ponderada por prima, separando quién COMPRA de quién VENDE
    if (sgn === -1) { a.ivBuyW += t.implied_volatility * prima; a.ivBuyP += prima; }
    else { a.ivSellW += t.implied_volatility * prima; a.ivSellP += prima; }

    a.n++;
    a.prima += prima;
  }
}

console.log(`\nEMBUDO DE FILAS (piso $100k, ${dias.length} ficheros-día)`);
const paso = (nom, x) => console.log(`  ${nom.padEnd(38)} ${String(x).padStart(9)}  (${((100 * x) / leidas).toFixed(1)}%)`);
paso("leídas", leidas);
paso(`antes del corte ${CORTE} UTC`, trasCorte);
paso("símbolo OCC parseable", trasParse);
paso("con serie de precio propia", trasUniverso);
paso("con gamma, vega e IV finitas", trasGriegas);
paso("con lado (no MIDMKT/nulo)", trasLado);
paso("con cotización sana", trasCotiz);
comprobarDescarte(leidas, trasCotiz, "embudo griegas-tamaño", 0.95);
console.log(`  → se pierde el ${(100 - (100 * trasUniverso) / trasParse).toFixed(1)}% por NO TENER PRECIO DE SUBYACENTE`);
console.log(`    (SPX/SPXW/NDX/RUT/VIX: MarketSnack devuelve {"data":[]} para índices. NO se sustituye por SPY.)`);

// ── 3. FILTRO DE SÍMBOLO-DÍA ──────────────────────────────────────────────────────────────
let sd0 = agg.size, sdPocas = 0, sdCob = 0, sdSinLados = 0;
const sdias = [];
for (const a of agg.values()) {
  if (a.n < MIN_OPS_SIMBOLO_DIA) { sdPocas++; continue; }
  const total = primaPorSimDia.get(`${a.raiz}|${a.dia}`) ?? 0;
  const cob = total > 0 ? a.prima / total : 0;
  if (cob < MIN_COBERTURA) { sdCob++; continue; }
  a.cobertura = cob;
  // la IV relativa exige que HAYA los dos lados ese día en ese ticker
  if (a.ivBuyP > 0 && a.ivSellP > 0) a.ivRel = a.ivBuyW / a.ivBuyP - a.ivSellW / a.ivSellP;
  else { a.ivRel = null; sdSinLados++; }
  sdias.push(a);
}
console.log(`\nSÍMBOLO-DÍA: ${sd0} construidos · ${sdPocas} con <${MIN_OPS_SIMBOLO_DIA} operaciones · ${sdCob} con cobertura de prima <${MIN_COBERTURA * 100}% · quedan ${sdias.length}`);
console.log(`  de ellos, ${sdSinLados} sin los DOS lados (compra y venta) el mismo día -> ivRel = null`);
comprobarDescarte(sd0, sdias.length, "filtro de símbolo-día");

// ── 4. NORMALIZACIONES SIN FUTURO ─────────────────────────────────────────────────────────
for (const a of sdias) {
  a.iGamma = a.absg > 0 ? a.dg / a.absg : null;      // cuota firmada en [−1,+1]
  a.iVega = a.absv > 0 ? a.dv / a.absv : null;
}
const porRaiz = new Map();
for (const a of sdias) { if (!porRaiz.has(a.raiz)) porRaiz.set(a.raiz, []); porRaiz.get(a.raiz).push(a); }
for (const [, arr] of porRaiz) {
  arr.sort((x, y) => x.dia.localeCompare(y.dia));
  for (let i = 0; i < arr.length; i++) {
    const prev = arr.slice(Math.max(0, i - VENTANA_Z), i);     // i excluido: nada del día en curso
    for (const [campo, dest] of [["dg", "zGamma"], ["dv", "zVega"], ["ivRel", "zIvRel"]]) {
      const v = prev.map((p) => p[campo]).filter((x) => x != null && Number.isFinite(x));
      if (v.length < MIN_Z || arr[i][campo] == null) { arr[i][dest] = null; continue; }
      const s = desv(v);
      arr[i][dest] = s > 0 ? (arr[i][campo] - media(v)) / s : null;
    }
  }
}

// ── 5. RETORNOS FUTUROS Y MOVIMIENTO NORMALIZADO ──────────────────────────────────────────
// mov_h = (|ret_h| / raíz(h)) / rv20 previa. Sin normalizar sería tautología: los tickers
// volátiles se mueven más, y eso ya se sabe antes de mirar el flujo.
let vOk = 0, vFuera = 0, sinRv = 0;
for (const a of sdias) {
  const ser = cierres.get(a.raiz), i = idxFecha.get(a.raiz).get(a.dia);
  if (i == null) continue;
  a.entrada = ser[i].c;
  a.rv = rvHasta(ser, i);                                       // sólo días ≤ D
  if (a.rv == null) sinRv++;
  for (const h of HORIZONTES) {
    if (!ventanaSana(ser, i, h)) { vFuera++; continue; }
    vOk++;
    const r = ser[i + h].c / ser[i].c - 1;
    a[`r${h}`] = r * 100;                                       // puntos porcentuales
    if (a.rv != null) a[`m${h}`] = Math.abs(r) / Math.sqrt(h) / a.rv;
  }
}
console.log(`\nVENTANAS DE RETORNO: ${vOk} sanas · ${vFuera} retiradas por salto >±25% o hueco`);
console.log(`SÍMBOLO-DÍA sin volatilidad previa (menos de ${N_RV + 1} barras antes, o split dentro): ${sinRv} de ${sdias.length}`);

// ── 6. GUARDA EL PANEL ────────────────────────────────────────────────────────────────────
const panel = sdias.map((a) => ({
  raiz: a.raiz, dia: a.dia, n: a.n, prima: a.prima, cobertura: a.cobertura,
  dg: a.dg, absg: a.absg, dv: a.dv, absv: a.absv,
  iGamma: a.iGamma, zGamma: a.zGamma, iVega: a.iVega, zVega: a.zVega,
  ivRel: a.ivRel, zIvRel: a.zIvRel,
  entrada: a.entrada, rv: a.rv,
  r1: a.r1 ?? null, r5: a.r5 ?? null, r20: a.r20 ?? null,
  m1: a.m1 ?? null, m5: a.m5 ?? null, m20: a.m20 ?? null,
}));

// radiografía de los PREDICTORES (un predictor lleno de ceros es un campo muerto)
const conTodo = panel.filter((a) => a.iGamma != null && a.iVega != null && a.ivRel != null && a.m1 != null);
console.log(`\nfilas con las TRES métricas y movimiento a 1 día: ${conTodo.length}`);
radiografia(conTodo, ["dg", "absg", "dv", "absv", "iGamma", "iVega", "ivRel", "rv", "m1", "n", "cobertura"], "panel griegas-tamaño");
const conZ = panel.filter((a) => a.zGamma != null && a.zVega != null && a.zIvRel != null && a.m1 != null);
console.log(`filas con las tres Z y movimiento a 1 día: ${conZ.length}`);
radiografia(conZ, ["zGamma", "zVega", "zIvRel"], "panel griegas-tamaño (z propias)");

fs.writeFileSync(SALIDA, JSON.stringify({
  generado: new Date().toISOString(),
  parametros: { CORTE, HORIZONTES, MIN_OPS_SIMBOLO_DIA, MIN_COBERTURA, VENTANA_Z, MIN_Z, N_RV, SALTO_SPLIT, ULTIMO_DIA },
  embudo: { leidas, trasCorte, trasParse, trasUniverso, trasGriegas, trasLado, trasCotiz },
  simboloDia: { construidos: sd0, pocas: sdPocas, cobertura: sdCob, sinDosLados: sdSinLados, usables: sdias.length },
  ventanas: { ok: vOk, fuera: vFuera }, sinRv, series: cierres.size, dias: dias.length,
  panel,
}));
console.log(`\n→ ${SALIDA} · ${panel.length} filas símbolo-día`);
