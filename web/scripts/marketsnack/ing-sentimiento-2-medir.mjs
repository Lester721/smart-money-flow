// INGREDIENTE · SENTIMIENTO — PASO 2: ¿separa el desequilibrio de prima alcista/bajista?
//
// ADVERTENCIA QUE VA DELANTE DE TODO (paso 1, 2.022.492 filas, 0 excepciones):
//   `sentiment` es una FUNCIÓN EXACTA de (side, call/put). No es un campo propio de MarketSnack:
//       call  + lado comprador (ASKSIDE/AT_ASK/ABOVE_ASK) → bullish
//       call  + lado vendedor  (BIDSIDE/AT_BID/BELOW_BID) → bearish
//       put   + lado comprador                            → bearish
//       put   + lado vendedor                             → bullish
//       MIDMKT (cualquiera)                               → neutral
//   Es la tabla del proceso (Buy Call direccional / Sell Call muro / …) aplicada fila a fila.
//   Se mide igual, pero como lo que ES: el desequilibrio de `side` FIRMADO por call/put. Eso sí
//   se diferencia de lo ya medido en medir-desequilibrio.mjs, que NO firmaba por tipo.
//
// ═══ DEFINICIÓN DE LA SEÑAL (sin ambigüedad) ═══════════════════════════════════════════════
//   CUÁNDO SE OBSERVA : 15:00 ET del día D (toda la ventana Abr–Ago 2026 es EDT = UTC−4).
//   QUÉ SE OBSERVA    : dese(símbolo,D) = (prima bullish − prima bearish) / (bullish + bearish),
//                       sobre las operaciones con timestamp ≤ 15:00 ET de ese día. Los neutral
//                       (MIDMKT) NO cuentan: no se les inventa lado.
//   ENTRADA           : CIERRE del día D (16:00 ET) — una hora DESPUÉS del corte. Cero look-ahead.
//   QUÉ PREDICE       : retorno del subyacente cierre(D) → cierre(D+h), h ∈ {1, 5, 20}.
//   TRANSVERSAL       : los símbolos se ordenan DENTRO de cada día (rango percentil 0..1). El
//                       tercio alto contra el bajo. El movimiento del mercado se cancela solo.
//
// ═══ LO QUE NO SE PUEDE MEDIR Y SE DICE ════════════════════════════════════════════════════
//   SPX + SPXW + NDX = 57,2% de la prima del período y MarketSnack NO sirve precio de índices
//   (/assets/SPX/chart → HTTP 200 con data:[]). Quedan FUERA. No se sustituyen por SPY.
//   Universo = 84 símbolos con serie de precio en disco, elegidos como "núcleo + los que movían
//   prima el 2026-08-19". Es selección por ACTIVIDAD al final del período, no por rendimiento;
//   aun así se declara.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/marketsnack/ing-sentimiento-2-medir.mjs

import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";
import { listonT, pasarBarrera, informe, tWelch } from "../../lib/barreraHallazgos";
import { radiografia } from "../../lib/radiografia";
// La raíz se DEDUCE (scripts/raiz.mjs): escrita a mano se rompe al renombrar la carpeta.
import { RAIZ } from "../raiz.mjs";

const DIR = path.join(RAIZ, "scripts/cache-theta/marketsnack/flujo-100k");
const CHART = path.join(RAIZ, "scripts/cache-theta/marketsnack/aux/chart-all");

const PRUEBAS = 12;                 // ver cabecera del informe: 4 familias × 3 horizontes
const LISTON = listonT(PRUEBAS);
const HORIZONTES = [1, 5, 20];
const MIN_OPS = 20;                 // operaciones clasificadas mínimas por símbolo-día
const MIN_SIMBOLOS_DIA = 9;         // para poder partir el día en tercios
const CORTES = { "11:00": 15, "15:00": 19 };   // hora ET → hora UTC (EDT = UTC−4)

// ── 1. cargar el flujo y agregar por (símbolo, día, corte) ─────────────────────────────────
function parseOcc(s) {
  if (!s || s.length < 16) return null;
  const k = s.slice(-8), tp = s.slice(-9, -8), fe = s.slice(-15, -9), u = s.slice(0, -15);
  if (!/^\d{8}$/.test(k) || !/^[CP]$/.test(tp) || !/^\d{6}$/.test(fe) || !u) return null;
  return { u, tipo: tp };
}

const conPrecio = new Map();
for (const f of fs.readdirSync(CHART)) {
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CHART, f))).toString("utf8"));
  const serie = j.data.map((p) => [p.t.slice(0, 10), p.v]).filter((p) => Number.isFinite(p[1]) && p[1] > 0);
  const idx = new Map(serie.map((p, i) => [p[0], i]));
  conPrecio.set(f.replace(".json.gz", ""), { serie, idx });
}

const dias = fs.readdirSync(DIR).filter((f) => f.endsWith(".jsonl.gz")).sort().map((f) => f.slice(0, 10));
console.log(`═══ INGREDIENTE SENTIMIENTO · ${dias.length} días · ${conPrecio.size} símbolos con precio ═══`);
console.log(`   listón de t = ${LISTON} (Bonferroni, ${PRUEBAS} pruebas declaradas)\n`);

// ev.get("SIM|DIA") = { por corte: {bull, bear, n}, ademas: {bullOps, bearOps} }
const ev = new Map();
let filas = 0, descartAsk = 0, descartSinPrecio = 0, neutrales = 0;

for (const dia of dias) {
  const buf = zlib.gunzipSync(fs.readFileSync(path.join(DIR, `${dia}.jsonl.gz`))).toString("utf8");
  for (const l of buf.split("\n")) {
    if (!l) continue;
    let t; try { t = JSON.parse(l); } catch { continue; }
    filas++;
    const occ = parseOcc(t.symbol ?? "");
    if (!occ) continue;
    if (!conPrecio.has(occ.u)) { descartSinPrecio++; continue; }
    // 82 filas del período traen ask=0 o cotización cruzada — fuera de todo cálculo
    if (!(t.ask_price > 0) || !(t.bid_price >= 0) || t.bid_price > t.ask_price) { descartAsk++; continue; }
    const s = t.sentiment;
    if (s === "neutral") { neutrales++; continue; }
    if (s !== "bullish" && s !== "bearish") continue;
    const prima = t.premium;
    if (!(prima > 0)) continue;
    const hUTC = +t.timestamp.slice(11, 13) + (+t.timestamp.slice(14, 16)) / 60;

    const k = `${occ.u}|${dia}`;
    let e = ev.get(k);
    if (!e) {
      e = { sim: occ.u, dia, c: {} };
      for (const c of Object.keys(CORTES)) e.c[c] = { bull: 0, bear: 0, nb: 0, nr: 0, bullC: 0, bearC: 0, bullP: 0, bearP: 0 };
      e.c.cierre = { bull: 0, bear: 0, nb: 0, nr: 0, bullC: 0, bearC: 0, bullP: 0, bearP: 0 };
      ev.set(k, e);
    }
    for (const [c, lim] of Object.entries(CORTES)) if (hUTC <= lim) acum(e.c[c], s, prima, occ.tipo);
    acum(e.c.cierre, s, prima, occ.tipo);
  }
}
function acum(o, s, prima, tipo) {
  if (s === "bullish") { o.bull += prima; o.nb++; if (tipo === "C") o.bullC += prima; else o.bullP += prima; }
  else { o.bear += prima; o.nr++; if (tipo === "C") o.bearC += prima; else o.bearP += prima; }
}

console.log(`   filas leídas ${filas.toLocaleString("es-ES")} · sin serie de precio ${descartSinPrecio.toLocaleString("es-ES")}` +
  ` · neutral/MIDMKT ${neutrales.toLocaleString("es-ES")} · ask≤0 o cruzada ${descartAsk}`);
console.log(`   eventos símbolo-día: ${ev.size.toLocaleString("es-ES")}\n`);

// ── 2. construir la muestra con retornos futuros ───────────────────────────────────────────
// SALTOS SOSPECHOSOS: la serie de MarketSnack no dice si está ajustada por splits. Cualquier
// retorno diario |r| > 35% se marca y se EXCLUYE, y se cuenta cuántos fueron. No se rellena nada.
const SALTO = 0.35;
const saltos = [];
for (const [sim, { serie }] of conPrecio) {
  for (let i = 1; i < serie.length; i++) {
    const r = serie[i][1] / serie[i - 1][1] - 1;
    if (Math.abs(r) > SALTO) saltos.push({ sim, dia: serie[i][0], r });
  }
}
if (saltos.length) {
  console.log(`   ⚠ ${saltos.length} salto(s) diario(s) > ${SALTO * 100}% en las series (posible split sin ajustar):`);
  for (const s of saltos.slice(0, 15)) console.log(`      ${s.sim} ${s.dia} ${(s.r * 100).toFixed(1)}%`);
}
const simSalto = new Set(saltos.map((s) => s.sim));
console.log(`   símbolos excluidos por salto: ${simSalto.size ? [...simSalto].join(", ") : "ninguno"}\n`);

function construir(corte, pesarPorPrima = true) {
  const porDia = new Map();
  for (const e of ev.values()) {
    if (simSalto.has(e.sim)) continue;
    const o = e.c[corte];
    const ops = o.nb + o.nr;
    if (ops < MIN_OPS) continue;
    const tot = pesarPorPrima ? o.bull + o.bear : ops;
    if (!(tot > 0)) continue;
    const dese = pesarPorPrima ? (o.bull - o.bear) / tot : (o.nb - o.nr) / tot;
    const { serie, idx } = conPrecio.get(e.sim);
    const i = idx.get(e.dia);
    if (i == null) continue;
    const entrada = serie[i][1];
    const fila = { ticker: e.sim, fecha: e.dia, dese, ops, prima: o.bull + o.bear,
      deseC: (o.bullC - o.bearC) / (o.bullC + o.bearC || 1), deseP: (o.bullP - o.bearP) / (o.bullP + o.bearP || 1) };
    for (const h of HORIZONTES) fila[`r${h}`] = i + h < serie.length ? (serie[i + h][1] / entrada - 1) * 100 : null;
    if (!porDia.has(e.dia)) porDia.set(e.dia, []);
    porDia.get(e.dia).push(fila);
  }
  // rango percentil DENTRO del día + exceso sobre la media transversal del día
  const filas = [];
  for (const [dia, g] of porDia) {
    if (g.length < MIN_SIMBOLOS_DIA) continue;
    const ord = [...g].sort((a, b) => a.dese - b.dese);
    ord.forEach((f, i) => { f.rango = g.length > 1 ? i / (g.length - 1) : 0.5; });
    for (const h of HORIZONTES) {
      const val = g.filter((f) => f[`r${h}`] != null).map((f) => f[`r${h}`]);
      const m = val.length ? val.reduce((a, x) => a + x, 0) / val.length : null;
      for (const f of g) f[`x${h}`] = f[`r${h}`] != null && m != null ? f[`r${h}`] - m : null;
    }
    filas.push(...g);
    void dia;
  }
  return filas;
}

// ── 3. medir ───────────────────────────────────────────────────────────────────────────────
const media = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const resultados = [];

function medir(nombre, filas, campoR, h) {
  const val = filas.filter((f) => f[campoR] != null);
  if (val.length < 60) { console.log(`   ${nombre}: sólo ${val.length} filas, no se mide`); return null; }
  const bar = val.map((f) => ({ pnl: f[campoR] / 100, ticker: f.ticker, fecha: f.fecha }));
  const rango = new Map(val.map((f, i) => [i, f.rango]));
  const v = pasarBarrera(bar, (f) => rango.get(bar.indexOf(f)) ?? 0, { pruebas: PRUEBAS, nMinimo: 200 });
  return v;
}

// pasarBarrera recibe el criterio por fila; para no depender de indexOf se adjunta el rango al objeto
function barrera(filas, campoR) {
  const val = filas.filter((f) => f[campoR] != null);
  const bar = val.map((f) => ({ pnl: f[campoR] / 100, ticker: f.ticker, fecha: f.fecha, _r: f.rango }));
  return { v: pasarBarrera(bar, (f) => f._r, { pruebas: PRUEBAS, nMinimo: 200 }), n: bar.length, bar };
}

function terciosTransversales(filas, campoR) {
  // tercio alto/bajo POR DÍA (no global) — es la versión estricta de la instrucción
  const porDia = new Map();
  for (const f of filas) { if (f[campoR] == null) continue; if (!porDia.has(f.fecha)) porDia.set(f.fecha, []); porDia.get(f.fecha).push(f); }
  const alto = [], bajo = [], todos = [];
  for (const g of porDia.values()) {
    if (g.length < MIN_SIMBOLOS_DIA) continue;
    const ord = [...g].sort((a, b) => b.dese - a.dese);
    const k = Math.floor(ord.length / 3);
    for (const f of ord.slice(0, k)) alto.push(f[campoR]);
    for (const f of ord.slice(-k)) bajo.push(f[campoR]);
    todos.push(...g);
  }
  return { sep: media(alto) - media(bajo), t: tWelch(alto, bajo), nAlto: alto.length, nBajo: bajo.length,
    mAlto: media(alto), mBajo: media(bajo), n: todos.length };
}

const FAMILIAS = [
  ["A · prima, corte 15:00 ET", "15:00", true],
  ["B · nº de operaciones, corte 15:00 ET", "15:00", false],
  ["C · prima, corte 11:00 ET", "11:00", true],
  ["D · prima, sesión completa (entrada al cierre de D)", "cierre", true],
];

let radioHecha = false;
for (const [nombre, corte, porPrima] of FAMILIAS) {
  const filas = construir(corte, porPrima);
  console.log(`\n══════════════════════════════════════════════════════════════════════════════`);
  console.log(`FAMILIA ${nombre}`);
  console.log(`   filas símbolo-día: ${filas.length.toLocaleString("es-ES")} · días ${new Set(filas.map((f) => f.fecha)).size} · símbolos ${new Set(filas.map((f) => f.ticker)).size}`);
  if (!filas.length) { console.log("   sin filas"); continue; }
  if (!radioHecha) {
    radiografia(filas, ["dese", "rango", "ops", "prima", "r1", "r5", "r20"], `sentimiento ${nombre}`, { maxCeros: 0.2 });
    radioHecha = true;
  }
  for (const h of HORIZONTES) {
    const tt = terciosTransversales(filas, `r${h}`);
    const { v, n } = barrera(filas, `r${h}`);
    console.log(`\n   ── h=${h} día(s) ──`);
    console.log(`   transversal por día: alto ${tt.mAlto.toFixed(3)}% (n=${tt.nAlto}) · bajo ${tt.mBajo.toFixed(3)}% (n=${tt.nBajo})` +
      ` · separación ${tt.sep >= 0 ? "+" : ""}${tt.sep.toFixed(3)} pts · t=${tt.t.toFixed(2)}  (listón ${LISTON})`);
    console.log(informe(v, `sentimiento ${nombre} h=${h}`).split("\n").map((x) => "   " + x).join("\n"));
    resultados.push({ familia: nombre, h, n, sep: tt.sep, t: tt.t, pasa: v.pasa, motivos: v.motivos,
      tercios: v.detalle.tercios, mayor: v.detalle.tickerMayor, tGlobal: v.detalle.t, sepGlobal: v.detalle.sep });
  }
}

fs.writeFileSync(path.join(RAIZ, "scripts/marketsnack/ing-sentimiento-2-salida.json"),
  JSON.stringify({ pruebas: PRUEBAS, liston: LISTON, minOps: MIN_OPS, minSimbolosDia: MIN_SIMBOLOS_DIA,
    saltos, resultados }, null, 1));
console.log(`\n   escrito ing-sentimiento-2-salida.json`);
void medir;
