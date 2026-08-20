// CONCENTRACION · MEDICION.  Transversal DENTRO de cada dia: tercio alto contra tercio bajo.
//
// DOS RESULTADOS QUE NO SE MEZCLAN:
//   (a) TAMANO   |retorno|  -> lo que paga una opcion comprada. NUNCA se ha medido en el proyecto.
//   (b) SIGNO    retorno    -> lo que ya se midio 11 veces y fallo. Se repite solo como control.
//
// EL CONTROL QUE MANDA. |retorno| crudo NO vale como resultado: un ticker volatil se mueve mas
// SIEMPRE, y su opcion cuesta mas SIEMPRE. Si la concentracion elige tickers volatiles, el
// |retorno| sube y no se ha predicho nada. Por eso el resultado principal es
//      a_r1n = |retorno D->D+1| / vol20(D)
// donde vol20 es la volatilidad diaria realizada de los 20 dias que TERMINAN en D. Un valor >1
// significa "se movio mas de lo que este ticker suele moverse". Eso si es una prediccion.
//
// PRUEBAS DECLARADAS: 48 = 6 metricas x 4 resultados x 2 cortes horarios. El liston sale de ahi.
//
// n EFECTIVA. Las filas son (ticker, dia). Los tickers de un mismo dia comparten el mercado, asi
// que NO son independientes: el diseno transversal cancela el mercado y deja UN numero por dia.
// La n efectiva es el numero de DIAS (83), no el de filas. Para D+5 las ventanas se solapan y la
// n efectiva baja a ~83/5 = 17. Los dos numeros se reportan.

import fs from "node:fs"; import path from "node:path"; import zlib from "node:zlib";
import { listonT, pasarBarrera, potencia } from "../../lib/barreraHallazgos.ts";
import { radiografia } from "../../lib/radiografia.ts";

const RAIZ = path.join("scripts", "cache-theta", "marketsnack");
const CH = path.join(RAIZ, "aux", "chart-all");
const RUPTURA = "2026-07-16";
const PRUEBAS = 48;
const LISTON = listonT(PRUEBAS);
const CUENTA = 56389;

const media = (v) => (v.length ? v.reduce((a, x) => a + x, 0) / v.length : NaN);
const sd = (v) => { if (v.length < 2) return NaN; const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const tUna = (v) => (v.length > 2 ? media(v) / (sd(v) / Math.sqrt(v.length)) : NaN);
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };

// -- precios ---------------------------------------------------------------------------------
const precios = {}, fechasT = {}, posT = {};
for (const f of fs.readdirSync(CH)) {
  if (!f.endsWith(".json.gz")) continue;
  const T = f.slice(0, -8);
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CH, f))).toString("utf8"));
  const m = {}; for (const r of j.data) if (Number.isFinite(r.v) && r.v > 0) m[r.t.slice(0, 10)] = r.v;
  const ff = Object.keys(m).sort(); if (ff.length < 60) continue;
  precios[T] = m; fechasT[T] = ff; const p = {}; ff.forEach((x, i) => (p[x] = i)); posT[T] = p;
}
/** retorno del cierre de `f` al cierre de `k` dias bursatiles despues. null si no llega la serie. */
function ret(T, f, k) {
  const i = posT[T]?.[f]; if (i == null || i + k >= fechasT[T].length) return null;
  const a = precios[T][fechasT[T][i]], b = precios[T][fechasT[T][i + k]];
  return a > 0 && b > 0 ? b / a - 1 : null;
}
/** retorno del cierre de `f` al cierre del ultimo dia bursatil <= `hasta`. */
function retHasta(T, f, hasta) {
  const i = posT[T]?.[f]; if (i == null) return null;
  let j = i; while (j + 1 < fechasT[T].length && fechasT[T][j + 1] <= hasta) j++;
  if (j <= i) return null;
  const a = precios[T][fechasT[T][i]], b = precios[T][fechasT[T][j]];
  return a > 0 && b > 0 ? { r: b / a - 1, dias: j - i } : null;
}

// -- panel + resultados ----------------------------------------------------------------------
const panel = JSON.parse(fs.readFileSync(path.join(RAIZ, "conc-panel.json"), "utf8"));
for (const nom of Object.keys(panel)) {
  for (const x of panel[nom]) {
    const r1 = ret(x.ticker, x.fecha, 1), r5 = ret(x.ticker, x.fecha, 5);
    x.d_r1 = r1; x.a_r1 = r1 == null ? null : Math.abs(r1);
    x.a_r1n = r1 == null ? null : Math.abs(r1) / x.vol20;
    x.d_r5 = r5; x.a_r5 = r5 == null ? null : Math.abs(r5);
    x.a_r5n = r5 == null ? null : Math.abs(r5) / (x.vol20 * Math.sqrt(5));
    // hasta el vencimiento del contrato mas grande (lo que ese contrato esta apostando de verdad)
    const rv = retHasta(x.ticker, x.fecha, x.top1Exp);
    x.a_rExpN = rv && rv.dias > 0 ? Math.abs(rv.r) / (x.vol20 * Math.sqrt(rv.dias)) : null;
    x.diasExp = rv ? rv.dias : null;
    // perfil compuesto: se calcula despues, por rangos DENTRO del dia
    x.perfil = null;
  }
  // PERFIL = media de los rangos percentiles dentro del dia de (concentracion, distancia, -DTE).
  // Se construye por rangos para que ninguna de las tres unidades domine por su escala.
  const porDia = new Map();
  for (const x of panel[nom]) { let g = porDia.get(x.fecha); if (!g) { g = []; porDia.set(x.fecha, g); } g.push(x); }
  for (const g of porDia.values()) {
    const rango = (campo, signo) => {
      const o = [...g].sort((a, b) => signo * (a[campo] - b[campo]));
      o.forEach((x, i) => (x["_r_" + campo] = g.length > 1 ? i / (g.length - 1) : 0.5));
    };
    rango("concTop1", 1); rango("top1AbsDist", 1); rango("top1DTE", -1);
    for (const x of g) x.perfil = (x._r_concTop1 + x._r_top1AbsDist + x._r_top1DTE) / 3;
  }
}

// -- radiografia -----------------------------------------------------------------------------
for (const nom of Object.keys(panel))
  radiografia(panel[nom], ["concTop1", "hhi", "top1AbsDist", "top1DTE", "top1SizeSobreOI", "perfil", "a_r1n", "a_r1", "d_r1", "vol20"],
    `panel concentracion - corte ${nom}`, { maxNulos: 0.6, cerosLegitimos: [] });

// -- que ES la concentracion, antes de medir con ella -----------------------------------------
console.log("=".repeat(100));
console.log("QUE ES LA CONCENTRACION EN ESTOS DATOS (corte 15:45)");
console.log("=".repeat(100));
{
  const f = panel["15:45"];
  const c = f.map((x) => x.concTop1);
  console.log(`  fraccion de la prima del dia en el contrato MAYOR: p10 ${(pct(c,.1)*100).toFixed(0)}% - p50 ${(pct(c,.5)*100).toFixed(0)}% - p90 ${(pct(c,.9)*100).toFixed(0)}%`);
  const alt = f.filter((x) => x.concTop1 >= pct(c, 2/3)), baj = f.filter((x) => x.concTop1 <= pct(c, 1/3));
  const linea = (n, g) => console.log(`  ${n.padEnd(16)} n=${String(g.length).padStart(5)} - contratos/dia ${media(g.map(x=>x.contratos)).toFixed(1).padStart(6)} - ops ${media(g.map(x=>x.ops)).toFixed(1).padStart(6)} - prima $${(media(g.map(x=>x.prima))/1e6).toFixed(1)}M - DTE ${media(g.map(x=>x.top1DTE)).toFixed(0).padStart(4)} - distOTM ${(media(g.map(x=>x.top1DistOtm))*100).toFixed(1).padStart(6)}% - calls ${(100*media(g.map(x=>x.top1Call))).toFixed(0)}% - vol20 ${(100*media(g.map(x=>x.vol20))).toFixed(2)}%`);
  linea("tercio ALTO conc", alt); linea("tercio BAJO conc", baj);
  const so = f.map((x) => x.top1SizeSobreOI).filter((x) => x != null);
  console.log(`\n  size/OI del contrato mayor: p10 ${pct(so,.1).toFixed(2)} - p50 ${pct(so,.5).toFixed(2)} - p90 ${pct(so,.9).toFixed(2)} - size>OI en el ${(100*so.filter(x=>x>1).length/so.length).toFixed(1)}%`);
  const chico = f.filter((x) => x.top1OIchico === 1);
  console.log(`  AVISO del inventario: size>OI suele marcar CONTRATO VACIO, no posicion nueva.`);
  console.log(`    de los que tienen size>OI, el ${(100*f.filter(x=>x.top1SizeSobreOI>1&&x.top1OIchico).length/Math.max(1,f.filter(x=>x.top1SizeSobreOI>1).length)).toFixed(0)}% tiene OI<50 (contrato practicamente vacio)`);
  console.log(`    filas con OI<50 en el contrato mayor: ${chico.length} (${(100*chico.length/f.length).toFixed(1)}%)`);
  const dteC = f.map(x=>x.top1DTE);
  console.log(`\n  DTE del contrato mayor: p10 ${pct(dteC,.1)} - p50 ${pct(dteC,.5)} - p90 ${pct(dteC,.9)} dias - 0DTE ${(100*f.filter(x=>x.top1DTE===0).length/f.length).toFixed(1)}%`);
  const dist = f.map(x=>x.top1DistOtm);
  console.log(`  distancia OTM del mayor: p10 ${(pct(dist,.1)*100).toFixed(1)}% - p50 ${(pct(dist,.5)*100).toFixed(1)}% - p90 ${(pct(dist,.9)*100).toFixed(1)}% - fuera del dinero el ${(100*f.filter(x=>x.top1DistOtm>0).length/f.length).toFixed(0)}%`);
}

// -- LA PRUEBA -------------------------------------------------------------------------------
// Una prueba = una metrica x un resultado x un corte. Estadistico principal: la serie DIARIA de
// (media del tercio alto - media del tercio bajo). Un numero por dia; t sobre esos numeros.
const resultados = [];
function prueba(corte, metrica, signo, resultado, filas) {
  const f = filas.filter((x) => x[metrica] != null && Number.isFinite(x[metrica]) && x[resultado] != null);
  const porDia = new Map();
  for (const x of f) { let g = porDia.get(x.fecha); if (!g) { g = []; porDia.set(x.fecha, g); } g.push(x); }
  const serie = [];
  for (const [d, g] of [...porDia].sort()) {
    if (g.length < 15) continue;
    const o = [...g].sort((a, b) => signo * (b[metrica] - a[metrica]));   // alto primero
    const k = Math.floor(o.length / 3); if (k < 5) continue;
    serie.push({ fecha: d, sep: media(o.slice(0, k).map((x) => x[resultado])) - media(o.slice(-k).map((x) => x[resultado])),
                 alto: media(o.slice(0, k).map((x) => x[resultado])), bajo: media(o.slice(-k).map((x) => x[resultado])), n: o.length });
  }
  const seps = serie.map((s) => s.sep);
  const t = tUna(seps);
  const k3 = Math.floor(serie.length / 3);
  const tercios = k3 >= 3 ? [serie.slice(0, k3), serie.slice(k3, 2 * k3), serie.slice(2 * k3)].map((g) => ({ p: `${g[0].fecha}->${g.at(-1).fecha}`, m: media(g.map((s) => s.sep)), n: g.length })) : [];
  const antes = serie.filter((s) => s.fecha < RUPTURA).map((s) => s.sep);
  const desp = serie.filter((s) => s.fecha >= RUPTURA).map((s) => s.sep);
  // criba de la barrera sobre las filas agrupadas (concentracion por ticker, tercios de tiempo)
  const v = pasarBarrera(f.map((x) => ({ pnl: x[resultado], ticker: x.ticker, fecha: x.fecha, m: signo * x[metrica] })), (x) => x.m,
                         { pruebas: PRUEBAS, nMinimo: 200, maxPorTicker: 0.2 });
  const r = { corte, metrica, resultado, nFilas: f.length, dias: serie.length,
    sepDia: media(seps), tDia: t, positivos: seps.filter((x) => x > 0).length,
    tercios, antes: { n: antes.length, m: media(antes), t: tUna(antes) }, desp: { n: desp.length, m: media(desp), t: tUna(desp) },
    alto: media(serie.map((s) => s.alto)), bajo: media(serie.map((s) => s.bajo)),
    poolT: v.detalle.t, poolSep: v.detalle.sep, poolPasa: v.pasa, poolMotivos: v.motivos };
  resultados.push(r);
  const marca = Math.abs(t) >= LISTON ? "**" : Math.abs(t) >= 2 ? "* " : "  ";
  console.log(`  ${marca}${(metrica + " -> " + resultado).padEnd(30)} n=${String(f.length).padStart(5)} d=${String(serie.length).padStart(3)}  alto ${r.alto.toFixed(4).padStart(8)} bajo ${r.bajo.toFixed(4).padStart(8)}  sep ${r.sepDia.toFixed(4).padStart(8)}  tDIA=${t.toFixed(2).padStart(6)}  (pool t=${(v.detalle.t??0).toFixed(2).padStart(6)})  ${r.positivos}/${serie.length}+  antes ${r.antes.m.toFixed(4)} / desp ${r.desp.m.toFixed(4)}`);
  return r;
}

const METRICAS = [
  ["concTop1", 1, "fraccion de la prima en el contrato mayor"],
  ["hhi", 1, "Herfindahl de la prima entre contratos"],
  ["top1AbsDist", 1, "distancia al dinero del contrato mayor"],
  ["top1DTE", -1, "plazo del contrato mayor (corto = alto)"],
  ["top1SizeSobreOI", 1, "size/OI del contrato mayor"],
  ["perfil", 1, "COMPUESTO: concentrado + lejos + corto"],
];
const RESULTADOS = [
  ["a_r1n", "TAMANO normalizado |r D+1| / vol20"],
  ["a_r1", "TAMANO crudo |r D+1|"],
  ["a_r5n", "TAMANO normalizado |r D+5|"],
  ["d_r1", "SIGNO r D+1 (control, ya fallo 11 veces)"],
];

console.log("\n" + "=".repeat(100));
console.log(`LA PRUEBA - tercio alto menos tercio bajo DENTRO de cada dia. Liston |t| >= ${LISTON} (${PRUEBAS} pruebas)`);
console.log("=".repeat(100));
for (const corte of Object.keys(panel)) {
  console.log(`\n-- corte ${corte} ET (se entra al CIERRE de ese mismo dia) --`);
  for (const [m, s] of METRICAS) for (const [r] of RESULTADOS) prueba(corte, m, s, r, panel[corte]);
}

// -- resumen ---------------------------------------------------------------------------------
console.log("\n" + "=".repeat(100));
console.log("RESUMEN");
console.log("=".repeat(100));
const ord = [...resultados].sort((a, b) => Math.abs(b.tDia) - Math.abs(a.tDia));
console.log(`  pruebas: ${resultados.length} (declaradas ${PRUEBAS}) - liston |t| >= ${LISTON}`);
console.log(`  con |t| diaria >= liston: ${resultados.filter(r=>Math.abs(r.tDia)>=LISTON).length}`);
console.log(`  con |t| diaria >= 2     : ${resultados.filter(r=>Math.abs(r.tDia)>=2).length}`);
console.log(`\n  las 8 mayores por |t| diaria:`);
for (const r of ord.slice(0, 8))
  console.log(`   ${r.corte} ${(r.metrica+" -> "+r.resultado).padEnd(28)} t=${r.tDia.toFixed(2).padStart(6)} sep ${r.sepDia.toFixed(4).padStart(8)} - tercios ${r.tercios.map(x=>x.m.toFixed(4)).join(" / ")} - antes ${r.antes.t.toFixed(2)} desp ${r.desp.t.toFixed(2)}`);

// potencia: que separacion habria hecho falta para verla (sobre la serie diaria)
console.log(`\n  POTENCIA (sobre la serie diaria de separaciones, el negativo tambien se criba):`);
for (const corte of Object.keys(panel)) {
  const f = panel[corte].filter((x) => x.a_r1n != null);
  const porDia = new Map(); for (const x of f) { let g = porDia.get(x.fecha); if (!g) { g = []; porDia.set(x.fecha, g); } g.push(x); }
  const seps = [];
  for (const [, g] of porDia) { const o = [...g].sort((a, b) => b.concTop1 - a.concTop1); const k = Math.floor(o.length / 3); if (k < 5) continue;
    seps.push(media(o.slice(0, k).map((x) => x.a_r1n)) - media(o.slice(-k).map((x) => x.a_r1n))); }
  const det = 2.8 * sd(seps) / Math.sqrt(seps.length);
  console.log(`   corte ${corte}: ${seps.length} dias - ruido diario sd=${sd(seps).toFixed(3)} -> separacion minima detectable ${det.toFixed(3)} desviaciones de vol20 (${(det*100).toFixed(1)}% de una sesion tipica)`);
}

fs.writeFileSync(path.join(RAIZ, "conc-2-salida.json"), JSON.stringify({ liston: LISTON, pruebas: PRUEBAS, resultados }, null, 1));
console.log(`\nOK ${path.join(RAIZ, "conc-2-salida.json")}`);
