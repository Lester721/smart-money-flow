// VENTANA CORTA — comprar el contrato que acaba de imprimir y venderlo en horas.
//
// LA HIPÓTESIS ORIGINAL NO SE PUEDE MEDIR: el archivo de MarketSnack sólo conserva contratos que
// seguían VIVOS el día de la descarga (2026-08-19). En los 86 días no hay UNA SOLA operación sobre
// un contrato con expiración anterior a esa fecha. Los 0-2 DTE de abril a agosto están borrados.
// (ventana-1-validar-feeds.mjs lo demuestra.)
//
// LO QUE SÍ SE PUEDE MEDIR, y es la mitad viva de la hipótesis: el PLAZO DE TENENCIA corto.
// "Una operación grande y urgente mueve el precio en HORAS." Se compra el MISMO contrato que
// acaba de imprimir ABOVE_ASK, al ASK real de ese instante (lo trae el propio print), y se vende
// al BID real del cierre de ese mismo día. Horas de tenencia. Precios reales en los dos extremos.
//
// Se mide también la salida al cierre del día SIGUIENTE, y se descompone el resultado en
// movimiento del punto medio (la señal) contra peaje de la horquilla (el coste). El punto medio
// NO es un resultado: es el diagnóstico de dónde se fue el dinero.

import { diasFlujo, leerDia, parseOCC, eod, calendario, media, sd, tUna, tWelch, pct } from "./ventana-lib.mjs";
import { radiografia } from "../lib/radiografia.ts";
import { pasarBarrera, listonT, potencia } from "../lib/barreraHallazgos.ts";
import { readdirSync, writeFileSync } from "node:fs";

const CDIR = "scripts/cache-theta/cadenas";
const CUENTA = 56389;
const PRUEBAS = 30;                                   // se cuentan alto a propósito
const conCadena = new Set(readdirSync(CDIR).filter((f) => /_d\d{8}\.json$/.test(f)).map((f) => f.split("_d")[0]));
const cal = calendario();
const siguiente = (dc) => { const i = cal.indexOf(dc); return i >= 0 && i + 1 < cal.length ? cal[i + 1] : null; };
const iso = (a) => `${a.slice(0, 4)}-${a.slice(4, 6)}-${a.slice(6, 8)}`;
const dteDe = (e, d) => Math.round((new Date(`${iso(e)}T00:00:00Z`) - new Date(`${iso(d)}T00:00:00Z`)) / 864e5);

// ── 1. Construir las filas ────────────────────────────────────────────────────────────────
const filas = [];
let vistas = 0, sinCadDia = 0, tarde = 0, sinQuote = 0;

for (const dia of diasFlujo("100k")) {
  const dc = dia.replace(/-/g, "");
  const dcSig = siguiente(dc);
  for (const o of leerDia(dia, "100k")) {
    const p = parseOCC(o.symbol);
    if (!p || !conCadena.has(p.raiz)) continue;
    vistas++;
    const hhmm = o.timestamp.slice(11, 16);
    if (hhmm < "13:30" || hhmm > "19:30") { tarde++; continue; }   // sesión regular, con ≥30 min por delante
    if (!(o.ask_price > 0) || !(o.bid_price > 0) || o.ask_price < o.bid_price) { sinQuote++; continue; }
    const qHoy = eod(p.raiz, dc, p.exp, p.tipo, p.strike);
    if (!qHoy) { sinCadDia++; continue; }
    const qMan = dcSig ? eod(p.raiz, dcSig, p.exp, p.tipo, p.strike) : null;

    const entrada = o.ask_price;                       // SE COMPRA AL ASK REAL DEL PRINT
    const salidaHoy = qHoy.bid;                        // SE VENDE AL BID REAL DEL CIERRE
    const medioEnt = (o.bid_price + o.ask_price) / 2;
    const medioSal = qHoy.ausente ? 0 : (qHoy.bid + qHoy.ask) / 2;

    filas.push({
      fecha: dia, ticker: p.raiz, dc, exp: p.exp, tipo: p.tipo, strike: p.strike,
      hhmm, dte: dteDe(p.exp, dc),
      side: o.side, premium: o.premium, size: o.size, oi: o.open_interest ?? 0,
      volume: o.volume ?? 0, iv: o.implied_volatility ?? null, delta: o.delta ?? null,
      askEnt: entrada, bidEnt: o.bid_price,
      horquillaPct: (o.ask_price - o.bid_price) / o.ask_price,
      rHoy: salidaHoy / entrada - 1,
      rMedioHoy: medioSal / medioEnt - 1,
      rMan: qMan ? qMan.bid / entrada - 1 : null,
      tramo: dia < "2026-07-16" ? "antes" : "despues",
      sizeSobreOi: o.open_interest > 0 ? o.size / o.open_interest : null,
    });
  }
}

console.log(`\n## VENTANA CORTA · comprar el contrato del print, vender al cierre`);
console.log(`\nOperaciones de MS sobre tickers con cadena: ${vistas}`);
console.log(`  fuera de 13:30–19:30 UTC: ${tarde} · sin cotización utilizable en el print: ${sinQuote} · sin cadena de ese día: ${sinCadDia}`);
console.log(`  FILAS MEDIBLES: ${filas.length}`);
const conMan = filas.filter((f) => f.rMan != null).length;
console.log(`  con salida al día siguiente: ${conMan}`);
console.log(`  días distintos: ${new Set(filas.map((f) => f.fecha)).size} · tickers: ${new Set(filas.map((f) => f.ticker)).size} · contratos: ${new Set(filas.map((f) => f.ticker + f.exp + f.tipo + f.strike)).size}`);
const dtes = filas.map((f) => f.dte);
console.log(`  rango de DTE: min ${dtes.reduce((a, x) => Math.min(a, x), 1e9)} · p50 ${pct(dtes, 0.5)} · max ${dtes.reduce((a, x) => Math.max(a, x), -1e9)}`);

// ── 2. RADIOGRAFÍA antes de medir ─────────────────────────────────────────────────────────
radiografia(filas, ["askEnt", "horquillaPct", "premium", "size", "dte", "rHoy", "rMedioHoy"], "ventana-corta",
  { cerosLegitimos: ["rHoy", "rMedioHoy"] });

// ── 3. La medición ────────────────────────────────────────────────────────────────────────
const dolares = (r, n, capital) => r * capital * n;   // sólo para traducir; el detalle va abajo

function bloque(nombre, sel, campo = "rHoy") {
  const g = filas.filter(sel).filter((f) => f[campo] != null);
  if (g.length < 30) { console.log(`\n### ${nombre}: sólo ${g.length} filas — no se mide`); return null; }
  const r = g.map((f) => f[campo]);
  const rm = g.map((f) => f.rMedioHoy);
  // n EFECTIVA: los resultados de un mismo día comparten mercado. Se promedia por día.
  const porDia = new Map();
  for (const f of g) { (porDia.get(f.fecha) ?? porDia.set(f.fecha, []).get(f.fecha)).push(f[campo]); }
  const diarios = [...porDia.entries()].sort().map(([d, v]) => ({ d, m: media(v), n: v.length }));
  const md = diarios.map((x) => x.m);
  const tDia = tUna(md);
  const gan = r.filter((x) => x > 0).length;
  console.log(`\n### ${nombre}`);
  console.log(`  filas ${g.length} · días (n EFECTIVA) ${diarios.length} · tickers ${new Set(g.map((f) => f.ticker)).size}`);
  console.log(`  retorno medio por operación (ask→bid): ${(100 * media(r)).toFixed(2)}%  · mediana ${(100 * pct(r, 0.5)).toFixed(2)}%  · aciertos ${(100 * gan / r.length).toFixed(1)}%`);
  console.log(`  t por FILAS (inflado, no usar): ${tUna(r).toFixed(2)}   ·   t por DÍA (n=${diarios.length}): ${tDia.toFixed(2)}   listón ${listonT(PRUEBAS)}`);
  console.log(`  descomposición: movimiento del punto medio ${(100 * media(rm)).toFixed(2)}%  −  peaje de la horquilla ${(100 * media(g.map((f) => f.horquillaPct))).toFixed(2)}%  ≈ ${(100 * (media(rm) - media(g.map((f) => f.horquillaPct)))).toFixed(2)}%`);
  const ant = md.filter((_, i) => diarios[i].d < "2026-07-16"), des = md.filter((_, i) => diarios[i].d >= "2026-07-16");
  console.log(`  ruptura 16-jul → antes: ${(100 * media(ant)).toFixed(2)}% (${ant.length} días) · después: ${(100 * media(des)).toFixed(2)}% (${des.length} días)`);
  return { g, r, rm, diarios, tDia, media: media(r), gan: gan / r.length, ant: media(ant), des: media(des) };
}

const esUrgente = (f) => f.side === "ABOVE_ASK";
const R = {};
R.todo = bloque("TODOS los prints (control)", () => true);
R.urg = bloque("URGENTE — ABOVE_ASK", esUrgente);
R.urgGrande = bloque("URGENTE + prima ≥ $1M", (f) => esUrgente(f) && f.premium >= 1e6);
R.urgConc = bloque("URGENTE + size > open interest (contrato concentrado)", (f) => esUrgente(f) && f.sizeSobreOi != null && f.sizeSobreOi > 1);
R.urgTodo = bloque("URGENTE + prima ≥ $1M + size > OI", (f) => esUrgente(f) && f.premium >= 1e6 && f.sizeSobreOi != null && f.sizeSobreOi > 1);
R.bajo = bloque("BELOW_BID (venta urgente — control invertido)", (f) => f.side === "BELOW_BID");
R.urgMan = bloque("URGENTE — salida al cierre del día SIGUIENTE", esUrgente, "rMan");

// urgente vs control, t de Welch sobre las MEDIAS DIARIAS
if (R.urg && R.todo) {
  const dU = new Map(R.urg.diarios.map((x) => [x.d, x.m])), dT = new Map(R.todo.diarios.map((x) => [x.d, x.m]));
  const pares = [...dU.keys()].filter((d) => dT.has(d)).map((d) => dU.get(d) - dT.get(d));
  console.log(`\n### URGENTE menos CONTROL, emparejado por día`);
  console.log(`  días emparejados ${pares.length} · diferencia media ${(100 * media(pares)).toFixed(2)}% · t=${tUna(pares).toFixed(2)} (listón ${listonT(PRUEBAS)})`);
}

// ── 4. ¿El efecto crece cuando el plazo se acorta? (dentro del mismo día, sin confundir con el calendario)
console.log(`\n### Gradiente por DTE — dentro de cada día (el DTE mínimo observable cambia con la fecha)`);
if (R.urg) {
  const porDia = new Map();
  for (const f of R.urg.g) (porDia.get(f.fecha) ?? porDia.set(f.fecha, []).get(f.fecha)).push(f);
  const cortos = [], largos = [];
  for (const [, v] of porDia) {
    if (v.length < 10) continue;
    const ord = [...v].sort((a, b) => a.dte - b.dte);
    const k = Math.floor(ord.length / 3);
    cortos.push(media(ord.slice(0, k).map((f) => f.rHoy)));
    largos.push(media(ord.slice(-k).map((f) => f.rHoy)));
  }
  const dif = cortos.map((x, i) => x - largos[i]);
  console.log(`  días usables ${dif.length} · tercio de DTE CORTO ${(100 * media(cortos)).toFixed(2)}% vs LARGO ${(100 * media(largos)).toFixed(2)}% · diferencia ${(100 * media(dif)).toFixed(2)}% · t=${tUna(dif).toFixed(2)}`);
  console.log(`  (mismo cálculo sobre el punto medio, para ver la señal sin peaje)`);
  const c2 = [], l2 = [];
  for (const [, v] of porDia) {
    if (v.length < 10) continue;
    const ord = [...v].sort((a, b) => a.dte - b.dte);
    const k = Math.floor(ord.length / 3);
    c2.push(media(ord.slice(0, k).map((f) => f.rMedioHoy)));
    l2.push(media(ord.slice(-k).map((f) => f.rMedioHoy)));
  }
  const d2 = c2.map((x, i) => x - l2[i]);
  console.log(`  punto medio: corto ${(100 * media(c2)).toFixed(2)}% vs largo ${(100 * media(l2)).toFixed(2)}% · diferencia ${(100 * media(d2)).toFixed(2)}% · t=${tUna(d2).toFixed(2)}`);
}

// ── 5. Las cuatro cribas sobre el mejor candidato ──────────────────────────────────────────
const mejor = [["ABOVE_ASK", R.urg], ["ABOVE_ASK+$1M", R.urgGrande], ["ABOVE_ASK+size>OI", R.urgConc], ["ABOVE_ASK+ambos", R.urgTodo]]
  .filter(([, x]) => x).sort((a, b) => b[1].media - a[1].media)[0];
if (mejor) {
  const [nom, x] = mejor;
  console.log(`\n### Las cuatro cribas sobre el mejor candidato: ${nom}`);
  const fh = x.g.map((f) => ({ pnl: f.rHoy, ticker: f.ticker, fecha: f.fecha }));
  const v = pasarBarrera(fh, (f) => f.pnl, { pruebas: PRUEBAS, nMinimo: 200, maxPorTicker: 0.2 });
  console.log(`  PASA: ${v.pasa}`);
  for (const m of v.motivos) console.log(`   ✗ ${m}`);
  for (const a of v.aprobadas) console.log(`   ✓ ${a}`);
  const pw = potencia(fh, 0.05);
  console.log(`  potencia: ${pw.mensaje}`);
}

// ── 6. Dólares al año ─────────────────────────────────────────────────────────────────────
console.log(`\n### En dólares al año sobre una cuenta de $${CUENTA.toLocaleString("es-ES")}`);
if (R.urg) {
  const diasAno = 252, diasMuestra = new Set(R.urg.g.map((f) => f.fecha)).size;
  const opsPorDia = R.urg.g.length / diasMuestra;
  const primaMedia = media(R.urg.g.map((f) => f.askEnt * 100));
  console.log(`  señales ABOVE_ASK medibles: ${R.urg.g.length} en ${diasMuestra} días = ${opsPorDia.toFixed(1)} al día → ${(opsPorDia * diasAno).toFixed(0)} al año`);
  console.log(`  prima media por contrato: $${primaMedia.toFixed(0)}`);
  for (const [nom, x] of [["ABOVE_ASK", R.urg], ["+$1M", R.urgGrande], ["+size>OI", R.urgConc], ["+ambos", R.urgTodo]]) {
    if (!x) continue;
    const n = x.g.length / diasMuestra * diasAno;
    const pm = media(x.g.map((f) => f.askEnt * 100));
    console.log(`  ${nom.padEnd(10)} · ${n.toFixed(0)} ops/año × 1 contrato de $${pm.toFixed(0)} × ${(100 * x.media).toFixed(2)}% = $${(n * pm * x.media).toFixed(0)}/año · capital comprometido si se abre 1 a la vez: $${pm.toFixed(0)}`);
  }
}

writeFileSync("scripts/ventana-2-salida.json", JSON.stringify({
  filas: filas.length, dias: new Set(filas.map((f) => f.fecha)).size,
  bloques: Object.fromEntries(Object.entries(R).filter(([, v]) => v).map(([k, v]) => [k, { n: v.g.length, dias: v.diarios.length, media: v.media, tDia: v.tDia, gan: v.gan, antes: v.ant, despues: v.des }])),
}, null, 1));
console.log(`\n(detalle en scripts/ventana-2-salida.json)`);
