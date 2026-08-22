// INGREDIENTE · SENTIMIENTO — MEDICIÓN FINAL
//
// ═══ LO PRIMERO, PORQUE CAMBIA QUÉ ES ESTO ═════════════════════════════════════════════════
// `sentiment` NO es un campo de MarketSnack: es una FUNCIÓN EXACTA de (side, call/put).
// Comprobado en las 2.022.492 operaciones del período, 16 celdas, 0 excepciones:
//     call + comprador (ASKSIDE/AT_ASK/ABOVE_ASK) → bullish
//     call + vendedor  (BIDSIDE/AT_BID/BELOW_BID) → bearish
//     put  + comprador                            → bearish
//     put  + vendedor                             → bullish
//     MIDMKT                                      → neutral
// Es la tabla del proceso (Buy Call / Sell Call / Buy Put / Sell Put) escrita fila a fila.
// Se mide igual, pero sabiendo que lo que se prueba es el desequilibrio de `side` FIRMADO por
// call/put — distinto de medir-desequilibrio.mjs, que no firmaba por tipo — y no un indicador
// propietario. Consecuencia buena: no depende del motor de scoring que se rompió el 16-jul.
//
// ═══ LA SEÑAL, SIN AMBIGÜEDAD ══════════════════════════════════════════════════════════════
//   SE OBSERVA A LAS 15:00 ET del día D. Todo el período (2026-04-22 → 2026-08-19) es EDT,
//   así que 15:00 ET = 19:00 UTC exacto (se comprueba abajo que no hay fechas fuera de EDT).
//   dese(símbolo,D) = (prima bullish − prima bearish) / (bullish + bearish) con las operaciones
//   de timestamp ≤ corte. Los neutral (MIDMKT) no cuentan: no se les inventa lado.
//   ENTRADA al CIERRE de D (16:00 ET), una hora DESPUÉS del corte → cero look-ahead.
//   PREDICE el retorno cierre(D) → cierre(D+h), h ∈ {1, 5, 20}.
//   TRANSVERSAL: se ordenan los símbolos DENTRO de cada día; tercio alto contra tercio bajo.
//
// ═══ EL ESTADÍSTICO QUE MANDA ══════════════════════════════════════════════════════════════
//   La barrera trata cada símbolo-día como un dato independiente, y NO lo son: 66 símbolos del
//   mismo día comparten el mercado. El dato independiente es EL DÍA. Por eso el número que
//   manda aquí es la serie de ~83 retornos diarios de la cartera largo(tercio alto) −
//   corto(tercio bajo), y su t con n = días. La barrera se reporta también, pero su t está
//   inflada por correlación transversal.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/marketsnack/ing-sentimiento-3-final.mjs

import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";
import { listonT, pasarBarrera, informe, potencia, comprobarDescarte } from "../../lib/barreraHallazgos";
import { radiografia } from "../../lib/radiografia";
// La raíz se DEDUCE (scripts/raiz.mjs): escrita a mano se rompe al renombrar la carpeta.
import { RAIZ } from "../raiz.mjs";

const DIR = path.join(RAIZ, "scripts/cache-theta/marketsnack/flujo-100k");
const CHART = path.join(RAIZ, "scripts/cache-theta/marketsnack/aux/chart-all");

// PRUEBAS DECLARADAS: 4 familias de agregación × 3 horizontes = 12, más la descomposición en
// las 4 celdas (buy call / sell call / buy put / sell put) × 3 horizontes = 12. Total 24.
const PRUEBAS = 24;
const LISTON = listonT(PRUEBAS);
const HORIZONTES = [1, 5, 20];
const MIN_OPS = 20;
const MIN_SIMBOLOS_DIA = 9;
const CUENTA = 56389;             // la cuenta de Lester, para traducir a dólares al año
const CORTES = { "11:00": 15, "15:00": 19, cierre: 24 };  // hora ET → hora UTC (EDT = UTC−4)

const media = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const de = (a) => { if (a.length < 2) return 0; const m = media(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); };
const tUna = (a) => (a.length > 2 && de(a) > 0 ? media(a) / (de(a) / Math.sqrt(a.length)) : 0);

function parseOcc(s) {
  if (!s || s.length < 16) return null;
  const k = s.slice(-8), tp = s.slice(-9, -8), fe = s.slice(-15, -9), u = s.slice(0, -15);
  if (!/^\d{8}$/.test(k) || !/^[CP]$/.test(tp) || !/^\d{6}$/.test(fe) || !u) return null;
  return { u, tipo: tp };
}

// ── series de precio ───────────────────────────────────────────────────────────────────────
const conPrecio = new Map();
for (const f of fs.readdirSync(CHART)) {
  let j; try { j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CHART, f))).toString("utf8")); } catch { continue; }
  if (!j?.data?.length) continue;
  const serie = j.data.map((p) => [p.t.slice(0, 10), p.v]).filter((p) => Number.isFinite(p[1]) && p[1] > 0);
  if (serie.length < 100) continue;
  conPrecio.set(f.replace(".json.gz", ""), { serie, idx: new Map(serie.map((p, i) => [p[0], i])) });
}

const dias = fs.readdirSync(DIR).filter((f) => f.endsWith(".jsonl.gz")).sort().map((f) => f.slice(0, 10));
// GUARDIA de horario: todo el rango tiene que caer en EDT para que 15:00 ET = 19:00 UTC.
for (const d of [dias[0], dias[dias.length - 1]]) {
  const off = new Date(`${d}T18:00:00Z`).toLocaleString("en-US", { timeZone: "America/New_York", hour: "2-digit", hour12: false });
  if (+off !== 14) throw new Error(`${d}: 18:00 UTC no es 14:00 ET (es ${off}). El período NO es todo EDT — hay que dejar de usar el desfase fijo.`);
}

console.log(`═══ INGREDIENTE · SENTIMIENTO ═══`);
console.log(`   ${dias.length} días de flujo (${dias[0]} → ${dias[dias.length - 1]})`);
console.log(`   ${conPrecio.size} símbolos con serie de precio en disco`);
console.log(`   listón de t = ${LISTON}  (Bonferroni, ${PRUEBAS} pruebas declaradas)`);
console.log(`   guardia horaria: 18:00 UTC = 14:00 ET en los dos extremos → todo EDT ✓\n`);

// ── agregación ─────────────────────────────────────────────────────────────────────────────
const ev = new Map();
let filas = 0, sinPrecio = 0, neutral = 0, askMalo = 0, usadas = 0;
const nuevo = () => ({ bull: 0, bear: 0, nb: 0, nr: 0, bc: 0, sc: 0, bp: 0, sp: 0 });
// bc = buy call (bullish), sc = sell call (bearish), bp = buy put (bearish), sp = sell put (bullish)

for (const dia of dias) {
  const buf = zlib.gunzipSync(fs.readFileSync(path.join(DIR, `${dia}.jsonl.gz`))).toString("utf8");
  for (const l of buf.split("\n")) {
    if (!l) continue;
    let t; try { t = JSON.parse(l); } catch { continue; }
    filas++;
    const occ = parseOcc(t.symbol ?? ""); if (!occ) continue;
    if (!conPrecio.has(occ.u)) { sinPrecio++; continue; }
    if (!(t.ask_price > 0) || !(t.bid_price >= 0) || t.bid_price > t.ask_price) { askMalo++; continue; }
    const s = t.sentiment;
    if (s === "neutral") { neutral++; continue; }
    if (s !== "bullish" && s !== "bearish") continue;
    const prima = t.premium; if (!(prima > 0)) continue;
    usadas++;
    const hUTC = +t.timestamp.slice(11, 13) + (+t.timestamp.slice(14, 16)) / 60;
    const k = `${occ.u}|${dia}`;
    let e = ev.get(k);
    if (!e) { e = { sim: occ.u, dia, c: {} }; for (const c of Object.keys(CORTES)) e.c[c] = nuevo(); ev.set(k, e); }
    for (const [c, lim] of Object.entries(CORTES)) {
      if (hUTC > lim) continue;
      const o = e.c[c];
      if (s === "bullish") { o.bull += prima; o.nb++; if (occ.tipo === "C") o.bc += prima; else o.sp += prima; }
      else { o.bear += prima; o.nr++; if (occ.tipo === "C") o.sc += prima; else o.bp += prima; }
    }
  }
}
comprobarDescarte(filas, usadas + sinPrecio + neutral, "filtro de sentimiento válido");
console.log(`   filas ${filas.toLocaleString("es-ES")} · usadas ${usadas.toLocaleString("es-ES")}` +
  ` · sin serie de precio ${sinPrecio.toLocaleString("es-ES")} · neutral/MIDMKT ${neutral.toLocaleString("es-ES")} · ask≤0 o cruzada ${askMalo}`);
console.log(`   eventos símbolo-día: ${ev.size.toLocaleString("es-ES")}\n`);

// ── splits sin ajustar ─────────────────────────────────────────────────────────────────────
const SALTO = 0.35, saltos = [];
for (const [sim, { serie }] of conPrecio)
  for (let i = 1; i < serie.length; i++) {
    const r = serie[i][1] / serie[i - 1][1] - 1;
    if (Math.abs(r) > SALTO) saltos.push({ sim, dia: serie[i][0], r });
  }
const simSalto = new Set(saltos.map((s) => s.sim));
console.log(`   ${saltos.length} saltos diarios >${SALTO * 100}% → ${simSalto.size} símbolos EXCLUIDOS (posible split sin ajustar; no se rellena nada)\n`);

// ── construir muestra ──────────────────────────────────────────────────────────────────────
function construir(corte, metrica) {
  const porDia = new Map();
  for (const e of ev.values()) {
    if (simSalto.has(e.sim)) continue;
    const o = e.c[corte];
    const ops = o.nb + o.nr;
    if (ops < MIN_OPS) continue;
    let dese;
    const totP = o.bull + o.bear;
    if (metrica === "prima") dese = totP > 0 ? (o.bull - o.bear) / totP : null;
    else if (metrica === "ops") dese = (o.nb - o.nr) / ops;
    else if (metrica === "bc") dese = totP > 0 ? o.bc / totP : null;   // peso de compra de calls
    else if (metrica === "sc") dese = totP > 0 ? o.sc / totP : null;   // peso de venta de calls
    else if (metrica === "bp") dese = totP > 0 ? o.bp / totP : null;   // peso de compra de puts
    else if (metrica === "sp") dese = totP > 0 ? o.sp / totP : null;   // peso de venta de puts
    if (dese == null || !Number.isFinite(dese)) continue;
    const { serie, idx } = conPrecio.get(e.sim);
    const i = idx.get(e.dia); if (i == null) continue;
    const entrada = serie[i][1];
    const f = { ticker: e.sim, fecha: e.dia, dese, ops, prima: totP };
    for (const h of HORIZONTES) f[`r${h}`] = i + h < serie.length ? (serie[i + h][1] / entrada - 1) * 100 : null;
    if (!porDia.has(e.dia)) porDia.set(e.dia, []);
    porDia.get(e.dia).push(f);
  }
  const out = [];
  for (const g of porDia.values()) {
    if (g.length < MIN_SIMBOLOS_DIA) continue;
    const ord = [...g].sort((a, b) => a.dese - b.dese);
    ord.forEach((f, i) => { f.rango = i / (g.length - 1); });
    out.push(...g);
  }
  return out;
}

/** Serie diaria del largo-corto: el DÍA es el dato independiente. */
function carteraDiaria(muestra, campo) {
  const porDia = new Map();
  for (const f of muestra) { if (f[campo] == null) continue; if (!porDia.has(f.fecha)) porDia.set(f.fecha, []); porDia.get(f.fecha).push(f); }
  const serie = [];
  for (const [dia, g] of [...porDia].sort()) {
    if (g.length < MIN_SIMBOLOS_DIA) continue;
    const ord = [...g].sort((a, b) => b.dese - a.dese);
    const k = Math.floor(ord.length / 3);
    const alto = media(ord.slice(0, k).map((f) => f[campo]));
    const bajo = media(ord.slice(-k).map((f) => f[campo]));
    serie.push({ dia, ls: alto - bajo, alto, bajo, n: g.length });
  }
  return serie;
}

const resultados = [];
function evaluar(nombre, muestra, h) {
  const campo = `r${h}`;
  const val = muestra.filter((f) => f[campo] != null);
  if (val.length < 200) { console.log(`   ${nombre} h=${h}: sólo ${val.length} filas`); return; }
  const serie = carteraDiaria(muestra, campo);
  const ls = serie.map((s) => s.ls);
  const tDia = tUna(ls);
  const bar = val.map((f) => ({ pnl: f[campo] / 100, ticker: f.ticker, fecha: f.fecha, _r: f.rango }));
  const v = pasarBarrera(bar, (f) => f._r, { pruebas: PRUEBAS, nMinimo: 200 });
  const pot = potencia(bar, 0.002);
  const dias3 = [0, 1, 2].map((i) => {
    const k = Math.floor(serie.length / 3);
    const g = i < 2 ? serie.slice(i * k, (i + 1) * k) : serie.slice(2 * k);
    return { periodo: `${g[0].dia}→${g[g.length - 1].dia}`, n: g.length, m: media(g.map((s) => s.ls)) };
  });
  console.log(`\n   ── ${nombre} · h=${h} ──`);
  console.log(`   POR DÍA (el estadístico que manda): n=${serie.length} días · largo−corto medio ${media(ls) >= 0 ? "+" : ""}${media(ls).toFixed(4)} pts` +
    ` · de ${de(ls).toFixed(3)} · t=${tDia.toFixed(2)}  (listón ${LISTON})`);
  console.log(`   tercios por día: ${dias3.map((x) => (x.m >= 0 ? "+" : "") + x.m.toFixed(3)).join(" · ")}  ` +
    `→ ${dias3.every((x) => x.m > 0) || dias3.every((x) => x.m < 0) ? "mismo signo ✓" : "signos MEZCLADOS ✗"}`);
  console.log(`   barrera (símbolo-día, t inflada por correlación transversal): sep ${(v.detalle.sep * 100).toFixed(3)}% · t=${v.detalle.t?.toFixed(2)} · ${v.pasa ? "PASA" : "no pasa"}`);
  if (!v.pasa) for (const m of v.motivos) console.log(`      ✗ ${m}`);
  console.log(`   potencia: ${pot.mensaje}`);
  resultados.push({ nombre, h, nDias: serie.length, nFilas: val.length, lsMedio: media(ls), lsDe: de(ls), tDia,
    tercios: dias3, barreraPasa: v.pasa, barreraT: v.detalle.t, barreraSep: v.detalle.sep, motivos: v.motivos,
    mayor: v.detalle.tickerMayor, detectable: pot.detectable, serie });
  return { serie, v, tDia };
}

// ── FAMILIAS ───────────────────────────────────────────────────────────────────────────────
const FAM = [
  ["A · prima bull−bear, corte 15:00 ET", "15:00", "prima"],
  ["B · nº operaciones bull−bear, corte 15:00", "15:00", "ops"],
  ["C · prima bull−bear, corte 11:00 ET", "11:00", "prima"],
  ["D · prima bull−bear, sesión completa", "cierre", "prima"],
  ["E · sólo COMPRA DE CALLS (peso)", "15:00", "bc"],
  ["F · sólo VENTA DE CALLS (peso)", "15:00", "sc"],
  ["G · sólo COMPRA DE PUTS (peso)", "15:00", "bp"],
  ["H · sólo VENTA DE PUTS (peso)", "15:00", "sp"],
];

let radioHecha = false;
for (const [nombre, corte, met] of FAM) {
  const m = construir(corte, met);
  console.log(`\n════════════════════════════════════════════════════════════════════════════════`);
  console.log(`${nombre}  ·  ${m.length.toLocaleString("es-ES")} símbolo-día · ${new Set(m.map((f) => f.fecha)).size} días · ${new Set(m.map((f) => f.ticker)).size} símbolos`);
  if (!m.length) { console.log("   sin filas"); continue; }
  if (!radioHecha) { radiografia(m, ["dese", "rango", "ops", "prima", "r1", "r5", "r20"], "sentimiento", { maxCeros: 0.2 }); radioHecha = true; }
  for (const h of HORIZONTES) evaluar(nombre, m, h);
}

// ── QUÉ LE FALTARÍA ────────────────────────────────────────────────────────────────────────
console.log(`\n\n════════════════ QUÉ LE FALTARÍA AL MEJOR CANDIDATO ════════════════`);
const mejor = [...resultados].sort((a, b) => Math.abs(b.tDia) - Math.abs(a.tDia))[0];
console.log(`   mejor por |t| diaria: ${mejor.nombre} h=${mejor.h}`);
console.log(`   largo−corto ${mejor.lsMedio.toFixed(4)} pts/período · de ${mejor.lsDe.toFixed(3)} · n=${mejor.nDias} días · t=${mejor.tDia.toFixed(2)}`);
const nNec = Math.ceil(((LISTON * mejor.lsDe) / Math.abs(mejor.lsMedio)) ** 2);
console.log(`   para llegar al listón ${LISTON} con ESTA separación harían falta n=${nNec.toLocaleString("es-ES")} días` +
  ` (${(nNec / 252).toFixed(1)} años de mercado). Hay ${mejor.nDias}. Faltan ${(nNec - mejor.nDias).toLocaleString("es-ES")}.`);
const sepNec = (LISTON * mejor.lsDe) / Math.sqrt(mejor.nDias);
console.log(`   con los ${mejor.nDias} días que hay, la separación tendría que ser ${sepNec.toFixed(3)} pts` +
  ` — es ${(sepNec / Math.abs(mejor.lsMedio)).toFixed(1)}× la observada.`);

// dólares al año que valdría SI la separación observada fuese real (para dimensionar, no para vender)
const opsAno = 252 / mejor.h;
const brutoAno = (mejor.lsMedio / 100) * opsAno * CUENTA;
// peaje: cartera largo-corto sobre ~22 nombres por lado, rotación completa cada h días.
// horquilla típica de acción líquida ≈ 2 pb por lado de la operación; entrar y salir = 4 pb.
const PEAJE_PB = 4;
const peajeAno = (PEAJE_PB / 10000) * opsAno * CUENTA * 2;   // ×2 = pata larga + pata corta
console.log(`\n   dimensión en dinero (SI la separación fuese real, que NO lo es):`);
console.log(`     ${opsAno.toFixed(0)} rotaciones/año × ${mejor.lsMedio.toFixed(4)}% × $${CUENTA.toLocaleString("es-ES")} = $${brutoAno.toFixed(0)}/año BRUTOS`);
console.log(`     peaje de horquilla (${PEAJE_PB} pb ida y vuelta × 2 patas) = −$${peajeAno.toFixed(0)}/año`);
console.log(`     NETO = $${(brutoAno - peajeAno).toFixed(0)}/año  sobre una cuenta de $${CUENTA.toLocaleString("es-ES")}`);

fs.writeFileSync(path.join(RAIZ, "scripts/marketsnack/ing-sentimiento-3-salida.json"),
  JSON.stringify({ pruebas: PRUEBAS, liston: LISTON, minOps: MIN_OPS, minSimbolosDia: MIN_SIMBOLOS_DIA,
    dias: dias.length, simbolosConPrecio: conPrecio.size, saltos: saltos.length, simSalto: [...simSalto],
    resultados: resultados.map((r) => ({ ...r, serie: r.serie.map((s) => [s.dia, +s.ls.toFixed(4)]) })),
    mejor: { nombre: mejor.nombre, h: mejor.h, t: mejor.tDia, nNec, sepNec, brutoAno, peajeAno } }, null, 1));
console.log(`\n   escrito ing-sentimiento-3-salida.json`);
