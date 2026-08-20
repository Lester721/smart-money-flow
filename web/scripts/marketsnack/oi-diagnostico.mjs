// ═══ DIAGNÓSTICO DEL ÚNICO CANDIDATO: netaNueva a 5 días ═══════════════════════════════
//
// De las 18 celdas de la rejilla, `netaNueva` a 5 días es la ÚNICA con el mismo signo en los
// tres tercios (+0,74 +0,58 +0,24) y la única donde el control ordena como manda el mecanismo
// (nueva 0,706% > todo 0,527% > vieja 0,247%). Se queda en t(NW)=2,14 contra un listón de 2,99.
//
// Esto NO es un hallazgo. Esto es la autopsia de por qué no llega y qué le falta exactamente.
// No se abren pruebas nuevas: se disecciona la celda que ya salió.
//
//   a) ¿quién está DENTRO del tercio alto? (si son siempre los mismos, es un sesgo estático)
//   b) ¿es monótona por quintiles o vive en un extremo?
//   c) ¿aguanta la ruptura de tuberia del 2026-07-16?
//   d) ¿sobrevive si se quitan los 5 nombres más frecuentes?
//   e) el dinero: dólares al año sobre $56.389, largo-solo (Robinhood no permite ponerse corto),
//      restando el peaje de horquilla del vehículo
//   f) Sharpe implícito — si sale absurdo, el propio número está avisando de que son 4 meses

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const DIR = path.join("scripts", "cache-theta", "marketsnack", "flujo-100k");
const CHART = path.join("scripts", "cache-theta", "marketsnack", "aux", "chart-all");
const CORTE = "T16:00:00", MIN_OPS = 15, MIN_PRIMA = 1_000_000, HZ = 5;
const RUPTURA = "2026-07-16";
const CUENTA = 56389;
const OCC = /^([A-Z]+)(\d{6})([CP])\d{8}$/;

const universo = fs.readdirSync(CHART).map((f) => f.slice(0, -8));
const cierre = new Map();
for (const T of universo) {
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CHART, T + ".json.gz"))).toString("utf8"));
  const fechas = [], v = new Map(), idx = new Map();
  for (const p of j.data ?? []) { const f = p.t.slice(0, 10); if (v.has(f)) continue; idx.set(f, fechas.length); fechas.push(f); v.set(f, p.v); }
  cierre.set(T, { fechas, v, idx });
}
const retorno = (T, d, n) => {
  const s = cierre.get(T), i = s?.idx.get(d); if (i == null) return null;
  const j = i + n; if (j >= s.fechas.length) return null;
  const a = s.v.get(s.fechas[i]), b = s.v.get(s.fechas[j]);
  return a > 0 && b > 0 ? b / a - 1 : null;
};

const dias = fs.readdirSync(DIR).filter((f) => f.endsWith(".jsonl.gz")).map((f) => f.slice(0, 10)).sort();
const filas = [];
for (const d of dias) {
  const txt = zlib.gunzipSync(fs.readFileSync(path.join(DIR, d + ".jsonl.gz"))).toString("utf8").trim();
  if (!txt) continue;
  const lim = d + CORTE, agg = new Map();
  for (const linea of txt.split("\n")) {
    const f = JSON.parse(linea);
    if (f.timestamp >= lim) continue;
    const m = OCC.exec(f.symbol); if (!m) continue;
    const T = m[1]; if (!cierre.has(T)) continue;
    if (f.open_interest == null || f.size == null || f.premium == null) continue;
    let a = agg.get(T); if (!a) { a = { ops: 0, prima: 0, nA: 0, nB: 0 }; agg.set(T, a); }
    a.ops++; a.prima += f.premium;
    if (f.size > f.open_interest) { if (f.sentiment === "bullish") a.nA += f.premium; else if (f.sentiment === "bearish") a.nB += f.premium; }
  }
  for (const [T, a] of agg) {
    if (a.ops < MIN_OPS || a.prima < MIN_PRIMA) continue;
    const r = retorno(T, d, HZ); if (r == null) continue;
    filas.push({ fecha: d, ticker: T, metrica: (a.nA - a.nB) / a.prima, r });
  }
}
const porDia = new Map();
for (const f of filas) { if (!porDia.has(f.fecha)) porDia.set(f.fecha, []); porDia.get(f.fecha).push(f); }

// separación diaria + composición de los tercios
function correr(filtro = () => true, quintiles = false) {
  const serie = [], fechas = [], dentroAlto = new Map(), dentroBajo = new Map(), porCubo = [];
  for (let i = 0; i < (quintiles ? 5 : 3); i++) porCubo.push([]);
  for (const d of [...porDia.keys()].sort()) {
    const g = porDia.get(d).filter(filtro);
    if (g.length < 12) continue;
    const m = g.reduce((s, f) => s + f.r, 0) / g.length;
    const ord = [...g].sort((a, b) => b.metrica - a.metrica);
    const nc = quintiles ? 5 : 3, k = Math.floor(ord.length / nc);
    if (k < 4) continue;
    for (let c = 0; c < nc; c++) {
      const trozo = c < nc - 1 ? ord.slice(c * k, (c + 1) * k) : ord.slice((nc - 1) * k);
      for (const f of trozo) porCubo[c].push(f.r - m);
    }
    const alto = ord.slice(0, k), bajo = ord.slice(-k);
    for (const f of alto) dentroAlto.set(f.ticker, (dentroAlto.get(f.ticker) ?? 0) + 1);
    for (const f of bajo) dentroBajo.set(f.ticker, (dentroBajo.get(f.ticker) ?? 0) + 1);
    serie.push(alto.reduce((s, f) => s + f.r - m, 0) / k - bajo.reduce((s, f) => s + f.r - m, 0) / k);
    fechas.push(d);
  }
  return { serie, fechas, dentroAlto, dentroBajo, porCubo };
}
const nw = (s, lag) => {
  const n = s.length; if (n < 5) return { media: 0, t: 0, sd: 0, dias: n };
  const m = s.reduce((a, x) => a + x, 0) / n, e = s.map((x) => x - m);
  const sd = Math.sqrt(e.reduce((a, x) => a + x * x, 0) / (n - 1));
  let s2 = e.reduce((a, x) => a + x * x, 0) / n;
  for (let l = 1; l <= Math.min(lag, n - 1); l++) { let g = 0; for (let i = l; i < n; i++) g += e[i] * e[i - l]; s2 += 2 * (1 - l / (lag + 1)) * (g / n); }
  const ee = Math.sqrt(Math.max(s2, 0) / n);
  return { media: m, t: ee > 0 ? m / ee : 0, sd, dias: n };
};

const base = correr();
const b = nw(base.serie, HZ);
console.log("═══ netaNueva a " + HZ + " dias · " + base.serie.length + " dias con corte transversal ═══\n");
console.log("separacion media tercio alto - tercio bajo: " + (b.media * 100).toFixed(3) + "% por ventana de " + HZ + " dias · t(NW)=" + b.t.toFixed(2) + "\n");

// a) concentracion DENTRO del tercio alto
console.log("─ a · ¿QUIEN VIVE EN EL TERCIO ALTO? (si son siempre los mismos, es un sesgo estatico) ─");
const totAlto = [...base.dentroAlto.values()].reduce((a, x) => a + x, 0);
const topAlto = [...base.dentroAlto.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 10);
console.log("  " + topAlto.map(([t, n]) => t + " " + ((n / totAlto) * 100).toFixed(1) + "%").join("  "));
console.log("  nombres distintos en el tercio alto: " + base.dentroAlto.size + " · el mayor pesa " + ((topAlto[0][1] / totAlto) * 100).toFixed(1) + "%");
const totBajo = [...base.dentroBajo.values()].reduce((a, x) => a + x, 0);
const topBajo = [...base.dentroBajo.entries()].sort((a, b2) => b2[1] - a[1]).slice(0, 10);
console.log("  tercio bajo: " + topBajo.map(([t, n]) => t + " " + ((n / totBajo) * 100).toFixed(1) + "%").join("  "));

// b) monotonia por quintiles
console.log("\n─ b · ¿ES MONOTONA? retorno demediado medio por quintil (1 = mas alcista nueva) ─");
const q = correr(() => true, true);
console.log("  " + q.porCubo.map((c, i) => "Q" + (i + 1) + " " + ((c.reduce((a, x) => a + x, 0) / c.length) * 100).toFixed(3) + "%").join("   "));
const medias = q.porCubo.map((c) => c.reduce((a, x) => a + x, 0) / c.length);
let mono = true; for (let i = 1; i < 5; i++) if (medias[i] > medias[i - 1]) mono = false;
console.log("  monotona descendente Q1->Q5: " + (mono ? "SI" : "NO"));

// c) la ruptura del 2026-07-16
console.log("\n─ c · ¿AGUANTA LA RUPTURA DE TUBERIA DEL 2026-07-16? ─");
for (const [nom, ini, fin] of [["antes", "0000", RUPTURA], ["desde", RUPTURA, "9999"]]) {
  const idx = base.fechas.map((f, i) => (f >= ini && f < fin ? i : -1)).filter((i) => i >= 0);
  const s = idx.map((i) => base.serie[i]);
  const r = nw(s, HZ);
  console.log("  " + nom.padEnd(6) + base.fechas[idx[0]] + " -> " + base.fechas[idx[idx.length - 1]] +
    "  " + String(s.length).padStart(3) + " dias  separacion " + (r.media * 100).toFixed(3) + "%  t=" + r.t.toFixed(2));
}

// d) sin los 5 nombres mas frecuentes del tercio alto
const fuera = new Set(topAlto.slice(0, 5).map(([t]) => t));
const sin = nw(correr((f) => !fuera.has(f.ticker)).serie, HZ);
console.log("\n─ d · SIN los 5 nombres mas frecuentes del tercio alto (" + [...fuera].join(", ") + ") ─");
console.log("  separacion " + (sin.media * 100).toFixed(3) + "%  t=" + sin.t.toFixed(2) + "  (" + sin.dias + " dias)");

// f) Sharpe implicito — el detector de espejismos
const periodosAno = 252 / HZ;
const sharpe = (b.media / b.sd) * Math.sqrt(periodosAno);
console.log("\n─ f · SHARPE IMPLICITO del largo-corto ─");
console.log("  media " + (b.media * 100).toFixed(3) + "% · desv.tipica " + (b.sd * 100).toFixed(3) + "% por ventana · Sharpe anualizado " + sharpe.toFixed(2));
console.log("  " + (sharpe > 2 ? "AVISO: un Sharpe de " + sharpe.toFixed(1) + " no existe en un largo-corto de acciones liquidas. Con 78 ventanas SOLAPADAS (~16 independientes) esto es la firma de una muestra corta, no de una ventaja." : "en rango creible."));

// e) EL DINERO — largo-solo, que es lo unico que Robinhood permite
console.log("\n─ e · EL DINERO sobre una cuenta de $" + CUENTA.toLocaleString("es-ES") + " ─");
const nombresPorLado = Math.round([...porDia.values()].map((g) => g.length).reduce((a, x) => a + x, 0) / porDia.size / 3);
const rebalancesAno = Math.floor(252 / HZ);
const excesoLargo = b.media / 2;                    // largo-solo = medio diferencial sobre la media
const brutoAno = excesoLargo * rebalancesAno;
console.log("  vehiculo: comprar las " + nombresPorLado + " acciones del tercio alto a partes iguales al CIERRE del dia de la señal,");
console.log("            mantener " + HZ + " dias, rehacer. Robinhood NO permite ponerse corto: el tercio bajo no se puede cobrar.");
console.log("  exceso sobre el mercado, largo-solo: " + (excesoLargo * 100).toFixed(3) + "% por ventana x " + rebalancesAno + " ventanas = " + (brutoAno * 100).toFixed(1) + "%/año BRUTO");
console.log("  bruto en dolares: $" + Math.round(brutoAno * CUENTA).toLocaleString("es-ES") + "/año sobre la cuenta");
for (const bps of [2, 5, 10]) {
  const operaciones = nombresPorLado * 2 * rebalancesAno;
  const peaje = (bps / 10000) * 2 * rebalancesAno;   // entrada + salida cada ventana
  const tasas = operaciones * 0.03;
  console.log("    con horquilla de " + String(bps).padStart(2) + " pb por lado: peaje " + (peaje * 100).toFixed(2) + "%/año = $" +
    Math.round(peaje * CUENTA).toLocaleString("es-ES") + " + $" + Math.round(tasas).toLocaleString("es-ES") + " de tasas -> NETO $" +
    Math.round(brutoAno * CUENTA - peaje * CUENTA - tasas).toLocaleString("es-ES") + "/año");
}
console.log("\n  NOTA OBLIGADA: esta caja de datos NO trae cotizacion bid/ask de ACCIONES. La horquilla de");
console.log("  arriba son tres escenarios declarados, NO un dato medido. Para cerrarlo hace falta el NBBO");
console.log("  de acciones de ThetaData sobre estos mismos " + nombresPorLado + " nombres y estas mismas fechas.");
console.log("\n  Y ANTES DE NADA: t(NW)=" + b.t.toFixed(2) + " contra un liston de 2,99. Este dinero es CONDICIONAL,");
console.log("  no es un resultado. Se escribe para saber que hay en juego, no para operarlo.");
