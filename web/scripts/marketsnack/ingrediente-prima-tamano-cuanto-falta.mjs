// ¿QUÉ LE FALTA A CADA MÉTRICA PARA SER SEÑAL? — y una pregunta previa que resultó ser la buena:
// ¿el orden transversal ROTA de un día a otro, o es siempre la misma lista de nombres?
//
// Si el orden es fijo (SPY, QQQ, NVDA, MSFT… arriba todos los días), ordenar por esa métrica no
// es una señal: es una cartera estática. 48 días de datos no son 48 apuestas, son UNA.
//
// Y para las que sí rotan, se calcula cuántos días de muestra harían falta para que la
// separación observada llegue al listón, con la varianza que de verdad tiene:
//     D = h · (listón · sd_diaria / |separación|)²
//
// Uso: node --env-file=.env.local --import tsx --max-old-space-size=10240 \
//        scripts/marketsnack/ingrediente-prima-tamano-cuanto-falta.mjs

import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";
import { listonT } from "../../lib/barreraHallazgos.ts";

const DIR_FLUJO = path.resolve("scripts/cache-theta/marketsnack/flujo-100k");
const DIR_CHART = path.resolve("scripts/cache-theta/marketsnack/aux/chart-all");
const SALIDA = path.resolve("scripts/marketsnack/ingrediente-prima-tamano-cuanto-falta.json");

const CORTE_MS = 19 * 3600e3, APERTURA_MS = 13.5 * 3600e3;
const MIN_OPS = 10, DIAS_CALENTAMIENTO = 5, VENTANA_INUSUAL = 20, MIN_PREVIOS = 10;
const HORIZONTES = [1, 5, 20];
const CUENTA = 56389;

const mediana = (v) => { const s = [...v].sort((a, b) => a - b); const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const media = (v) => v.reduce((a, x) => a + x, 0) / v.length;
const desv = (v) => { const m = media(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };

const HOY = new Date().toISOString().slice(0, 10);
const PRECIO = new Map();
for (const f of fs.readdirSync(DIR_CHART)) {
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DIR_CHART, f))).toString("utf8"));
  let serie = j.data.map((p) => ({ f: p.t.slice(0, 10), v: p.v })).filter((p) => p.v > 0);
  if (serie.length && serie[serie.length - 1].f >= HOY) serie = serie.slice(0, -1);
  if (serie.length < 60) continue;
  PRECIO.set(f.replace(".json.gz", ""), { serie, idx: new Map(serie.map((p, i) => [p.f, i])) });
}

const ficheros = fs.readdirSync(DIR_FLUJO).filter((f) => f.endsWith(".jsonl.gz")).sort();
const filas = [];
for (let d = 0; d < ficheros.length; d++) {
  const fecha = ficheros[d].slice(0, 10), t0 = Date.parse(fecha + "T00:00:00Z");
  const txt = zlib.gunzipSync(fs.readFileSync(path.join(DIR_FLUJO, ficheros[d]))).toString("utf8");
  const porTicker = new Map();
  for (const linea of txt.split("\n")) {
    if (!linea) continue;
    const r = JSON.parse(linea);
    const s = r.symbol || "", raiz = s.slice(0, -15), tipo = s.slice(-9, -8);
    if (!/^\d{8}$/.test(s.slice(-8)) || !/^[CP]$/.test(tipo) || !/^\d{6}$/.test(s.slice(-15, -9)) || !raiz) continue;
    if (!(r.ask_price > 0) || !(r.bid_price > 0) || r.bid_price > r.ask_price) continue;
    const off = Date.parse(r.timestamp) - t0;
    if (off < APERTURA_MS || off > CORTE_MS) continue;
    if (!PRECIO.has(raiz)) continue;
    let a = porTicker.get(raiz);
    if (!a) { a = { primas: [], tam: [], pc: 0, pp: 0 }; porTicker.set(raiz, a); }
    a.primas.push(r.premium); a.tam.push(r.size);
    if (tipo === "C") a.pc += r.premium; else a.pp += r.premium;
  }
  if (d < DIAS_CALENTAMIENTO) continue;
  for (const [tk, a] of porTicker) {
    if (a.primas.length < MIN_OPS) continue;
    const total = a.primas.reduce((x, y) => x + y, 0);
    const top3 = [...a.primas].sort((x, y) => y - x).slice(0, 3).reduce((x, y) => x + y, 0);
    const p = PRECIO.get(tk), i = p.idx.get(fecha);
    if (i == null) continue;
    const fila = { ticker: tk, fecha, entrada: p.serie[i].v,
      primaTotal: total, primaMediana: mediana(a.primas), tamMediano: mediana(a.tam),
      nOps: a.primas.length, callPut: Math.log((a.pc + 1) / (a.pp + 1)), top3Share: top3 / total };
    for (const h of HORIZONTES) fila["r" + h] = i + h < p.serie.length ? p.serie[i + h].v / p.serie[i].v - 1 : null;
    filas.push(fila);
  }
}

const NIVEL = ["primaTotal", "primaMediana", "tamMediano", "nOps"];
const RATIO = ["callPut", "top3Share"];
const porTk = new Map();
for (const f of filas) { if (!porTk.has(f.ticker)) porTk.set(f.ticker, []); porTk.get(f.ticker).push(f); }
for (const [, arr] of porTk) {
  arr.sort((a, b) => a.fecha.localeCompare(b.fecha));
  for (let i = 0; i < arr.length; i++) {
    if (i < MIN_PREVIOS) { arr[i].sinHistoria = true; continue; }
    const prev = arr.slice(Math.max(0, i - VENTANA_INUSUAL), i);
    for (const m of NIVEL) arr[i]["u_" + m] = Math.log(arr[i][m] / mediana(prev.map((x) => x[m])));
    for (const m of RATIO) arr[i]["u_" + m] = arr[i][m] - mediana(prev.map((x) => x[m]));
  }
}
const base = filas.filter((f) => !f.sinHistoria);

// ── persistencia del orden: ¿rota o es la misma lista? ───────────────────────────────────
const rangos = (v) => { const o = v.map((x, i) => [x, i]).sort((a, b) => a[0] - b[0]); const r = new Array(v.length);
  o.forEach(([, i], j) => (r[i] = j)); return r; };
function persistencia(campo) {
  const porDia = new Map();
  for (const f of base) { if (!Number.isFinite(f[campo])) continue;
    if (!porDia.has(f.fecha)) porDia.set(f.fecha, new Map()); porDia.get(f.fecha).set(f.ticker, f[campo]); }
  const fechas = [...porDia.keys()].sort();
  const cs = [];
  for (let i = 1; i < fechas.length; i++) {
    const a = porDia.get(fechas[i - 1]), b = porDia.get(fechas[i]);
    const com = [...b.keys()].filter((t) => a.has(t));
    if (com.length < 20) continue;
    const x = rangos(com.map((t) => a.get(t))), y = rangos(com.map((t) => b.get(t)));
    const mx = media(x), my = media(y);
    let n = 0, dx = 0, dy = 0;
    for (let k = 0; k < x.length; k++) { n += (x[k] - mx) * (y[k] - my); dx += (x[k] - mx) ** 2; dy += (y[k] - my) ** 2; }
    cs.push(n / Math.sqrt(dx * dy));
  }
  return cs.length ? media(cs) : null;
}

const METRICAS = [...NIVEL, ...RATIO, ...NIVEL.map((m) => "u_" + m), ...RATIO.map((m) => "u_" + m)];
const LISTON = listonT(METRICAS.length * HORIZONTES.length);
console.log(`\nlistón |t| ≥ ${LISTON} (${METRICAS.length * HORIZONTES.length} pruebas)\n`);
console.log("métrica            rota?  " + HORIZONTES.map((h) => `── h=${h}: sep · sd · DÍAS QUE FALTAN`).join("   "));

const salida = {};
for (const m of METRICAS) {
  const rho = persistencia(m);
  const linea = [];
  salida[m] = { persistenciaRango: rho, horizontes: {} };
  for (const h of HORIZONTES) {
    const porDia = new Map();
    for (const f of base) { if (f["r" + h] == null || !Number.isFinite(f[m])) continue;
      if (!porDia.has(f.fecha)) porDia.set(f.fecha, []); porDia.get(f.fecha).push(f); }
    const sp = [];
    for (const fe of [...porDia.keys()].sort()) {
      const g = [...porDia.get(fe)].sort((a, b) => b[m] - a[m]);
      const k = Math.floor(g.length / 3);
      if (k < 3) continue;
      sp.push(media(g.slice(0, k).map((x) => x["r" + h])) - media(g.slice(-k).map((x) => x["r" + h])));
    }
    const mm = media(sp), sd = desv(sp);
    const diasFaltan = Math.abs(mm) > 0 ? Math.ceil(h * (LISTON * sd / Math.abs(mm)) ** 2) : Infinity;
    salida[m].horizontes[h] = { dias: sp.length, sep: mm, sd, diasNecesarios: diasFaltan, anos: diasFaltan / 252 };
    linea.push(`${(mm * 100).toFixed(3).padStart(7)}% ${(sd * 100).toFixed(2).padStart(5)}% ` +
      `${(diasFaltan > 1e6 ? "∞" : diasFaltan.toLocaleString()).padStart(9)}d(${(diasFaltan / 252).toFixed(0)}a)`);
  }
  console.log(`${m.padEnd(16)} ${(rho ?? 0).toFixed(2).padStart(5)}   ${linea.join("   ")}`);
}

// ── el peaje: ¿mataría la horquilla a la mejor, si fuera real? ───────────────────────────
// Vehículo más cercano a lo ejecutable en Robinhood (allí NO se puede vender en corto):
// comprar el tercio BAJO en igual peso y rebalancear cada h días. La horquilla de una acción
// líquida en Robinhood es ~3 pb de media horquilla; comisión $0, tasas ~$0,03.
const peaje = (h, medioSpreadPb = 3) => {
  const rebalances = 252 / h;
  return rebalances * 2 * (medioSpreadPb / 10000) * CUENTA; // entrar y salir de toda la cartera
};
console.log(`\npeaje anual de la horquilla comprando/vendiendo toda la cuenta de $${CUENTA.toLocaleString()}:`);
for (const h of HORIZONTES) console.log(`  h=${h}: $${Math.round(peaje(h)).toLocaleString()}/año (${(252 / h).toFixed(0)} rebalances)`);

fs.writeFileSync(SALIDA, JSON.stringify({ generado: new Date().toISOString(), liston: LISTON, cuenta: CUENTA,
  peajeAnual: Object.fromEntries(HORIZONTES.map((h) => [h, peaje(h)])), metricas: salida }, null, 1));
console.log(`\n→ ${SALIDA}`);
