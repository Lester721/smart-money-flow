// ═══════════════════════════════════════════════════════════════════════════════════════════
// INGREDIENTE · DÓLARES-GRIEGOS  —  delta$ y gamma$ QUE EL CREADOR DE MERCADO SE QUEDA ENCIMA
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// La escalera contratos → nocional → delta$ → gamma$ ya se recorrió en este proyecto con datos
// de otra fuente, SUPONIENDO el lado (la convención de calle: el dealer está largo de calls y
// corto de puts). Aquí el lado está MEDIDO: MarketSnack trae `side` con siete categorías y sólo
// falta en el 0,09% de las filas.
//
// SIGNO DEL DEALER (la única pieza nueva):
//   cliente paga la oferta (AT_ASK / ABOVE_ASK / ASKSIDE) -> el dealer VENDE  -> dealer CORTO (−1)
//   cliente pega al bid   (AT_BID / BELOW_BID / BIDSIDE)  -> el dealer COMPRA -> dealer LARGO (+1)
//   MIDMKT -> no se le inventa lado, se descarta (≈6,5% y estable en todo el período)
//
// MECANISMO QUE SE PRUEBA (no es "correlaciona"):
//   · delta$ del dealer NEGATIVO = el dealer está corto de delta = tiene que COMPRAR subyacente
//     para cubrirse -> presión al alza. Hipótesis direccional: delta$ bajo -> el subyacente SUBE.
//     El tercio alto menos el bajo debe salir NEGATIVO si el mecanismo funciona.
//   · gamma$ del dealer NEGATIVO = corto de gamma = se cubre EN LA DIRECCIÓN del movimiento ->
//     amplifica. Eso predice MAGNITUD, no dirección. Por eso a la gamma se le mide también el
//     retorno ABSOLUTO, que es donde vive su mecanismo de verdad.
//
// ═══ DEFENSAS ══════════════════════════════════════════════════════════════════════════════
//
// 1. CORTE FIJO 19:00 UTC = 15:00 ET, una hora ANTES del cierre de contado. Todo el período
//    (22-abr → 19-ago 2026) es EDT, no hay cambio de horario dentro: el corte no se mueve.
//    La entrada es al CIERRE del mismo día, posterior al corte. Cero futuro.
//    (Sin esto habría lookahead: el 1,2% del flujo llega a las 20h UTC, DESPUÉS del cierre.)
//
// 2. PRECIO DE ESCALA = CIERRE DEL DÍA ANTERIOR, no `asset_price`. Dos razones:
//    · `asset_price` viene nulo en el 26,0% de las filas ANTES del 2026-07-16 y en el 0,0%
//      DESPUÉS. Escalar con él haría que los tercios del período fuesen poblaciones distintas
//      por la tubería de MarketSnack, no por el mercado.
//    · el cierre de D−1 es observable con total seguridad en el corte de D.
//
// 3. TRANSVERSAL DENTRO DEL DÍA. Se ordenan los símbolos entre sí cada día y el resultado se
//    mide en exceso sobre la media del día. El movimiento del mercado se cancela solo: no hace
//    falta un control de índice y un día de pánico no puede fabricar el hallazgo.
//
// 4. NORMALIZACIÓN SIN FUTURO. Dos, y ninguna mira hacia adelante:
//    · intensidad : delta$neto / delta$bruto del MISMO día (cuota firmada en [−1,+1])
//    · z propio   : contra la media y desviación de los 20 días de mercado ESTRICTAMENTE
//                   anteriores de ESE símbolo. Nunca el día en curso, nunca posteriores.
//
// 5. SPLITS. Los cierres de MarketSnack son SIN ajustar (contrastado contra el MCP de trading:
//    AAPL 2026-08-18 = 310,03 y 2026-08-17 = 305,59 en las dos rutas, exacto). Un split saldría
//    como un −50% falso. PERO no se puede distinguir un split de un salto de resultados sin otra
//    fuente: probado el detector por "razón simple" (2:1, 1:10...) y caza CERO de 204 saltos —
//    WOLF hace 1,21→22,10 y AGQ 399,45→160,15, que son splits de razón rara.
//    Decisión: no se adivina. Se retira la VENTANA (símbolo-día cuyo camino hasta D+h contiene un
//    salto >±25%), no el símbolo entero — retirar el símbolo por un +33% de earnings sesgaría el
//    universo hacia los valores tranquilos, y ese sesgo lo estaría metiendo yo.
//    También se exige que las barras D y D+h sean contiguas en el calendario: la serie de SPCX
//    salta de 2026-04-06 a 2026-06-12 y el índice i+h se la comía sin avisar.
//
// 6. La última barra (2026-08-19) es del día en curso y puede ser parcial -> se descarta.
//
// PRUEBAS DECLARADAS: 18
//   2 métricas (delta$, gamma$) × 2 normalizaciones × 3 horizontes (1, 5, 20) = 12 sobre el
//   retorno FIRMADO, más gamma$ × 2 normalizaciones × 3 horizontes = 6 sobre el retorno
//   ABSOLUTO. listonT(18) manda sobre todas.
//
// Uso: node --env-file=.env.local --import tsx --max-old-space-size=10240 \
//        scripts/marketsnack/medir-dolares-griegos.mjs

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { pasarBarrera, informe, listonT, potencia, comprobarDescarte, tWelch } from "../../lib/barreraHallazgos.ts";
import { radiografia } from "../../lib/radiografia.ts";

const DIR_FLUJO = "scripts/cache-theta/marketsnack/flujo-100k";
const DIR_CHART = "scripts/cache-theta/marketsnack/aux/chart-all";
const CORTE = "19:00";              // UTC. = 15:00 ET durante todo el período (EDT).
const HORIZONTES = [1, 5, 20];
const PRUEBAS = 18;
const MIN_OPS_SIMBOLO_DIA = 8;      // menos de 8 operaciones no es una "postura del dealer"
const MIN_COBERTURA = 0.6;          // ≥60% de la prima del símbolo-día con griegas finitas
const MIN_SIMBOLOS_DIA = 15;        // para poder partir el día en tercios transversales
const VENTANA_Z = 20;               // días de mercado ANTERIORES para el z propio
const MIN_Z = 10;                   // mínimo de días anteriores para calcular el z
const SALTO_SPLIT = 0.25;
const ULTIMO_DIA = "2026-08-19";    // la barra de hoy es del día en curso: parcial

const RE = /^([A-Z]+)(\d{6})([CP])(\d{8})$/;
const COMPRA = new Set(["ASKSIDE", "ABOVE_ASK", "AT_ASK"]);   // cliente compra -> dealer CORTO
const VENTA  = new Set(["BIDSIDE", "BELOW_BID", "AT_BID"]);   // cliente vende  -> dealer LARGO

const media = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const desv = (a) => { if (a.length < 2) return 0; const m = media(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const fmt = (x, d = 2) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(d);

console.log("═".repeat(92));
console.log("INGREDIENTE · DÓLARES-GRIEGOS — delta$ y gamma$ del dealer, CON EL LADO MEDIDO");
console.log("═".repeat(92));

// ── 1. SERIES DE PRECIO ────────────────────────────────────────────────────────────────────
const cierres = new Map();          // raiz -> [{f, c, sospechoso}] ordenado
const idxFecha = new Map();         // raiz -> Map(fecha -> índice)
const saltos = [];
const ficheros = fs.readdirSync(DIR_CHART);
for (const f of ficheros) {
  const T = f.replace(".json.gz", "");
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DIR_CHART, f))).toString("utf8"));
  let s = (j.data || []).map((p) => ({ f: p.t.slice(0, 10), c: p.v })).filter((p) => Number.isFinite(p.c) && p.c > 0);
  s.sort((a, b) => a.f.localeCompare(b.f));
  s = s.filter((p) => p.f < ULTIMO_DIA);        // la barra del día en curso es parcial: fuera
  if (s.length < 30) continue;
  // marca la barra i cuando el paso i−1 -> i es un salto >±25%: puede ser split o resultados,
  // y sin otra fuente NO se puede distinguir. Se marca para retirar las ventanas que lo crucen.
  for (let i = 1; i < s.length; i++) {
    if (Math.abs(s[i].c / s[i - 1].c - 1) > SALTO_SPLIT) {
      s[i].salto = true;
      if (s[i].f >= "2026-04-22") saltos.push(`${T} ${s[i - 1].f}→${s[i].f}  ${s[i - 1].c} → ${s[i].c}`);
    }
  }
  cierres.set(T, s);
  idxFecha.set(T, new Map(s.map((p, i) => [p.f, i])));
}
console.log(`\nSERIES DE PRECIO: ${cierres.size} símbolos de ${ficheros.length} ficheros (≥30 barras, sin la barra parcial de ${ULTIMO_DIA})`);
console.log(`  saltos >±25% DENTRO del período de medición: ${saltos.length} — se retirarán las ventanas que los crucen, no los símbolos`);

/** ¿El camino de i a i+h es usable? Sin saltos sospechosos y sin agujeros en la serie. */
function ventanaSana(s, i, h) {
  if (i + h >= s.length) return false;
  for (let k = i + 1; k <= i + h; k++) if (s[k].salto) return false;
  // contigüidad: h días de mercado no pueden abarcar mucho más que h*1,5 días de calendario + margen
  const dd = (new Date(s[i + h].f) - new Date(s[i].f)) / 86400000;
  return dd > 0 && dd <= h * 1.55 + 6;
}

// ── 2. FLUJO -> AGREGADO POR (SÍMBOLO, DÍA) ────────────────────────────────────────────────
const dias = fs.readdirSync(DIR_FLUJO).filter((f) => f.endsWith(".jsonl.gz")).map((f) => f.slice(0, 10)).sort();
const agg = new Map();              // `${raiz}|${dia}` -> acumuladores
let leidas = 0, trasCorte = 0, trasParse = 0, trasUniverso = 0, trasGriegas = 0, trasLado = 0, trasCotiz = 0;
let primaPorSimDia = new Map();     // prima TOTAL del símbolo-día (antes del filtro de griegas)

for (const d of dias) {
  const raw = zlib.gunzipSync(fs.readFileSync(path.join(DIR_FLUJO, `${d}.jsonl.gz`))).toString("utf8").split("\n");
  for (const l of raw) {
    if (!l) continue;
    let t; try { t = JSON.parse(l); } catch { continue; }
    leidas++;
    // (a) corte horario: sólo lo observable antes de las 15:00 ET
    if (!t.timestamp || t.timestamp.slice(11, 16) >= CORTE) continue;
    trasCorte++;
    const m = RE.exec(t.symbol || ""); if (!m) continue;
    trasParse++;
    const raiz = m[1];
    // (b) universo: sólo lo que tiene serie de precio propia. Índices (SPX/SPXW/NDX/RUT) NO la
    //     tienen en MarketSnack -> quedan fuera y se dice cuánto se pierde.
    const ser = cierres.get(raiz); if (!ser) continue;
    trasUniverso++;
    const kSD = `${raiz}|${d}`;
    primaPorSimDia.set(kSD, (primaPorSimDia.get(kSD) ?? 0) + (t.premium > 0 ? t.premium : 0));
    // (c) griegas: sin delta o gamma no hay dólares-griegos. No se estima ninguna.
    if (!Number.isFinite(t.delta) || !Number.isFinite(t.gamma) || !(t.size > 0)) continue;
    trasGriegas++;
    // (d) lado: MIDMKT y nulos fuera, no se les inventa signo
    const sgn = COMPRA.has(t.side) ? -1 : VENTA.has(t.side) ? +1 : 0;   // signo del DEALER
    if (sgn === 0) continue;
    trasLado++;
    // (e) cotización sana (las 82 filas con ask=0 o cruzada)
    if (!(t.ask_price > 0) || t.bid_price > t.ask_price) continue;
    trasCotiz++;

    // precio de escala = cierre de D−1 (observable, y ajeno a la ruptura de asset_price)
    const i = idxFecha.get(raiz).get(d);
    if (i == null || i < 1) continue;
    const S = ser[i - 1].c;

    let a = agg.get(kSD);
    if (!a) { a = { raiz, dia: d, dd: 0, dg: 0, absd: 0, absg: 0, n: 0, prima: 0 }; agg.set(kSD, a); }
    const contratos = t.size * 100;
    a.dd   += sgn * t.delta * contratos * S;                    // delta$ neto del dealer
    a.dg   += sgn * t.gamma * contratos * S * S * 0.01;         // gamma$ por 1% de movimiento
    a.absd += Math.abs(t.delta) * contratos * S;
    a.absg += t.gamma * contratos * S * S * 0.01;               // gamma siempre ≥0 en largo
    a.n++;
    a.prima += t.premium > 0 ? t.premium : 0;
  }
}
console.log(`\nEMBUDO DE FILAS (piso $100k, ${dias.length} ficheros-día)`);
const paso = (nom, x, base) => console.log(`  ${nom.padEnd(34)} ${String(x).padStart(9)}  (${((100 * x) / base).toFixed(1)}% de las leídas)`);
paso("leídas", leidas, leidas);
paso(`antes del corte ${CORTE} UTC`, trasCorte, leidas);
paso("símbolo OCC parseable", trasParse, leidas);
paso("con serie de precio propia", trasUniverso, leidas);
paso("con delta y gamma finitas", trasGriegas, leidas);
paso("con lado (no MIDMKT/nulo)", trasLado, leidas);
paso("con cotización sana", trasCotiz, leidas);
comprobarDescarte(leidas, trasCotiz, "embudo completo dólares-griegos", 0.95);
console.log(`  → se pierde el ${(100 - (100 * trasUniverso) / trasParse).toFixed(1)}% de las operaciones por NO TENER PRECIO DE SUBYACENTE`);
console.log(`    (SPX/SPXW/NDX/RUT/VIX: MarketSnack devuelve {"data":[]} para índices. No se sustituye por SPY: sería otra cosa.)`);

// ── 3. FILTRO DE SÍMBOLO-DÍA ───────────────────────────────────────────────────────────────
let sd0 = agg.size, sdPocas = 0, sdCobertura = 0;
const sdias = [];
for (const a of agg.values()) {
  if (a.n < MIN_OPS_SIMBOLO_DIA) { sdPocas++; continue; }
  const total = primaPorSimDia.get(`${a.raiz}|${a.dia}`) ?? 0;
  const cob = total > 0 ? a.prima / total : 0;
  if (cob < MIN_COBERTURA) { sdCobertura++; continue; }   // el agujero de griegas del 12–20 may
  a.cobertura = cob;
  sdias.push(a);
}
console.log(`\nSÍMBOLO-DÍA: ${sd0} construidos · ${sdPocas} con <${MIN_OPS_SIMBOLO_DIA} operaciones · ${sdCobertura} con cobertura de prima <${MIN_COBERTURA * 100}% · quedan ${sdias.length}`);
comprobarDescarte(sd0, sdias.length, "filtro de símbolo-día");

// ── 4. NORMALIZACIONES SIN FUTURO ──────────────────────────────────────────────────────────
// intensidad: mismo día, cuota firmada
for (const a of sdias) {
  a.iDelta = a.absd > 0 ? a.dd / a.absd : null;
  a.iGamma = a.absg > 0 ? a.dg / a.absg : null;
}
// z propio: SÓLO días de mercado estrictamente anteriores del mismo símbolo
const porRaiz = new Map();
for (const a of sdias) { if (!porRaiz.has(a.raiz)) porRaiz.set(a.raiz, []); porRaiz.get(a.raiz).push(a); }
for (const [, arr] of porRaiz) {
  arr.sort((x, y) => x.dia.localeCompare(y.dia));
  for (let i = 0; i < arr.length; i++) {
    const prev = arr.slice(Math.max(0, i - VENTANA_Z), i);      // i excluido: nada del día en curso
    if (prev.length < MIN_Z) { arr[i].zDelta = null; arr[i].zGamma = null; continue; }
    for (const [campo, dest] of [["dd", "zDelta"], ["dg", "zGamma"]]) {
      const v = prev.map((p) => p[campo]);
      const s = desv(v);
      arr[i][dest] = s > 0 ? (arr[i][campo] - media(v)) / s : null;
    }
  }
}

// ── 5. RETORNOS FUTUROS ────────────────────────────────────────────────────────────────────
let ventanasFuera = 0, ventanasOk = 0;
for (const a of sdias) {
  const ser = cierres.get(a.raiz), i = idxFecha.get(a.raiz).get(a.dia);
  if (i == null) continue;
  a.entrada = ser[i].c;                                          // CIERRE de D (posterior al corte)
  for (const h of HORIZONTES) {
    if (!ventanaSana(ser, i, h)) { ventanasFuera++; continue; }
    ventanasOk++;
    a[`r${h}`] = (ser[i + h].c / ser[i].c - 1) * 100;
  }
}
console.log(`VENTANAS DE RETORNO: ${ventanasOk} sanas · ${ventanasFuera} retiradas por salto >±25% o hueco en la serie`);

// ── 6. EXCESO SOBRE LA MEDIA DEL DÍA + RANGO PERCENTIL TRANSVERSAL ────────────────────────
const METRICAS = [
  { id: "iDelta", nom: "delta$ · intensidad (neto/bruto del día)" },
  { id: "zDelta", nom: "delta$ · z contra sus 20 días anteriores" },
  { id: "iGamma", nom: "gamma$ · intensidad (neto/bruto del día)" },
  { id: "zGamma", nom: "gamma$ · z contra sus 20 días anteriores" },
];
const porDia = new Map();
for (const a of sdias) { if (!porDia.has(a.dia)) porDia.set(a.dia, []); porDia.get(a.dia).push(a); }

let diasUsables = 0;
for (const [, arr] of porDia) {
  if (arr.length < MIN_SIMBOLOS_DIA) continue;
  diasUsables++;
  for (const h of HORIZONTES) {
    const con = arr.filter((a) => a[`r${h}`] != null);
    if (con.length < MIN_SIMBOLOS_DIA) continue;
    const mu = media(con.map((a) => a[`r${h}`]));
    const muAbs = media(con.map((a) => Math.abs(a[`r${h}`])));
    for (const a of con) { a[`x${h}`] = a[`r${h}`] - mu; a[`ax${h}`] = Math.abs(a[`r${h}`]) - muAbs; }
  }
  for (const M of METRICAS) {
    const con = arr.filter((a) => a[M.id] != null && Number.isFinite(a[M.id]));
    if (con.length < MIN_SIMBOLOS_DIA) continue;
    con.sort((x, y) => x[M.id] - y[M.id]);
    con.forEach((a, i) => { a[`p_${M.id}`] = con.length > 1 ? i / (con.length - 1) : 0.5; });
  }
}
console.log(`\nDÍAS con ≥${MIN_SIMBOLOS_DIA} símbolos: ${diasUsables} de ${porDia.size}`);
const porSim = [...porDia.values()].filter((a) => a.length >= MIN_SIMBOLOS_DIA).map((a) => a.length);
console.log(`  símbolos por día: mín ${Math.min(...porSim)} · mediana ${porSim.sort((a, b) => a - b)[Math.floor(porSim.length / 2)]} · máx ${Math.max(...porSim)}`);

// ── 7. RADIOGRAFÍA — antes de medir nada ───────────────────────────────────────────────────
const conTodo = sdias.filter((a) => a.x1 != null && a.iDelta != null && a.zDelta != null && a.iGamma != null && a.zGamma != null);
radiografia(conTodo, ["dd", "dg", "absd", "absg", "iDelta", "zDelta", "iGamma", "zGamma", "x1", "n", "cobertura"], "símbolo-día dólares-griegos", { cerosLegitimos: [] });

// ── 8. LAS 18 PRUEBAS ──────────────────────────────────────────────────────────────────────
const LISTON = listonT(PRUEBAS);
console.log(`\nLISTÓN DE |t| CON ${PRUEBAS} PRUEBAS DECLARADAS (Bonferroni): ${LISTON}\n`);
console.log("═".repeat(92));
console.log("RESULTADOS · tercio ALTO menos tercio BAJO del ranking transversal, en exceso sobre el día");
console.log("  (el mecanismo predice NEGATIVO en delta$: dealer corto de delta -> compra -> sube)");
console.log("═".repeat(92));

const resultados = [];
const OBJETIVOS = [
  { pre: "x", nom: "retorno FIRMADO", metricas: METRICAS },
  { pre: "ax", nom: "retorno ABSOLUTO (magnitud)", metricas: METRICAS.filter((m) => m.id.includes("Gamma")) },
];

for (const O of OBJETIVOS) {
  for (const M of O.metricas) {
    for (const h of HORIZONTES) {
      const filas = sdias
        .filter((a) => a[`p_${M.id}`] != null && a[`${O.pre}${h}`] != null)
        .map((a) => ({ pnl: a[`${O.pre}${h}`] / 100, ticker: a.raiz, fecha: a.dia, rango: a[`p_${M.id}`] }));
      if (filas.length < 50) { console.log(`\n${M.nom} · +${h}d · ${O.nom}: muestra insuficiente (${filas.length})`); continue; }
      const v = pasarBarrera(filas, (f) => f.rango, { pruebas: PRUEBAS, nMinimo: 200, maxPorTicker: 0.2 });
      const pot = potencia(filas, 0.002);   // 0,2% de separación por operación es el efecto que importaría
      console.log("\n" + "─".repeat(92));
      console.log(`${M.nom}  ·  +${h} día(s)  ·  ${O.nom}`);
      console.log(informe(v, `${M.id} +${h}d ${O.pre}`));
      console.log(`  potencia: ${pot.mensaje}`);
      resultados.push({ metrica: M.id, nom: M.nom, h, objetivo: O.pre, v, pot, n: filas.length });
    }
  }
}

// ── 9. RESUMEN ─────────────────────────────────────────────────────────────────────────────
console.log("\n" + "═".repeat(92));
console.log("TABLA RESUMEN DE LAS 18 PRUEBAS");
console.log("═".repeat(92));
console.log("métrica      obj   h      n     sep(pts)      t   listón  tercios(signo)   PASA");
for (const r of resultados) {
  const s = r.v.detalle.tercios.map((x) => (x.sep >= 0 ? "+" : "−")).join("");
  console.log(
    `${r.metrica.padEnd(12)} ${r.objetivo.padEnd(4)} ${String(r.h).padStart(2)}  ${String(r.n).padStart(5)}  ` +
    `${(r.v.detalle.sep != null ? fmt(r.v.detalle.sep * 100, 3) : "—").padStart(9)}  ${(r.v.detalle.t != null ? r.v.detalle.t.toFixed(2) : "—").padStart(6)}  ` +
    `${String(LISTON).padStart(5)}   ${s.padEnd(14)} ${r.v.pasa ? "SÍ" : "no"}`,
  );
}
const pasan = resultados.filter((r) => r.v.pasa);
console.log(`\nPASAN LAS CUATRO CRIBAS: ${pasan.length} de ${resultados.length}`);
for (const p of pasan) console.log(`  ✅ ${p.nom} · +${p.h}d · ${p.objetivo === "x" ? "firmado" : "absoluto"} · sep ${fmt(p.v.detalle.sep * 100, 3)} pts · t=${p.v.detalle.t.toFixed(2)}`);

fs.writeFileSync("scripts/marketsnack/salida-dolares-griegos.json", JSON.stringify({
  generado: new Date().toISOString(),
  parametros: { CORTE, HORIZONTES, PRUEBAS, LISTON, MIN_OPS_SIMBOLO_DIA, MIN_COBERTURA, MIN_SIMBOLOS_DIA, VENTANA_Z },
  embudo: { leidas, trasCorte, trasParse, trasUniverso, trasGriegas, trasLado, trasCotiz },
  simboloDia: { construidos: sd0, pocas: sdPocas, cobertura: sdCobertura, usables: sdias.length },
  diasUsables, saltosEnPeriodo: saltos, ventanas: { ok: ventanasOk, fuera: ventanasFuera },
  resultados: resultados.map((r) => ({ metrica: r.metrica, h: r.h, objetivo: r.objetivo, n: r.n, sep: r.v.detalle.sep, t: r.v.detalle.t, pasa: r.v.pasa, motivos: r.v.motivos, tercios: r.v.detalle.tercios, tickerMayor: r.v.detalle.tickerMayor, detectable: r.pot.detectable })),
}, null, 1));
console.log("\nsalida: scripts/marketsnack/salida-dolares-griegos.json");
