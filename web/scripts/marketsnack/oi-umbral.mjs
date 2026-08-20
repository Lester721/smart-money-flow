// ═══ LA FORMA QUE HABRÍA QUE PROBAR HACIA DELANTE — no es un hallazgo ══════════════════
//
// El diagnóstico dice que `netaNueva` a 5 días NO es monótona por quintiles:
//   Q1 +0,365%  Q2 +0,124%  Q3 -0,226%  Q4 +0,186%  Q5 -0,381%
// El centro es ruido y los extremos son los que cargan con todo. Traducido: el RANGO transversal
// mete en la cartera 21 nombres al día de los cuales la mayoría tienen la métrica pegada a cero.
//
// La forma que esa figura pide es un UMBRAL ABSOLUTO de inusualidad, no un ranking: entrar sólo
// cuando el desequilibrio de prima nueva es grande de verdad. El umbral se calcula con el
// percentil 80 de |netaNueva| de los DÍAS ANTERIORES únicamente (ventana expansiva, arranca con
// 20 días de calentamiento que NO se operan). Ningún dato del día ni posterior entra en el umbral.
//
// ESTO ES LA PRUEBA 19 DE LA FAMILIA. Con el listón subido, y sobre los mismos 78 días que ya se
// han mirado, un buen resultado aquí NO es un hallazgo: es una HIPÓTESIS PARA EL FORWARD-TEST.
// Se escribe para decir qué forma exacta hay que registrar a partir de mañana, no para operarla.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { listonT } from "../../lib/barreraHallazgos.ts";

const DIR = path.join("scripts", "cache-theta", "marketsnack", "flujo-100k");
const CHART = path.join("scripts", "cache-theta", "marketsnack", "aux", "chart-all");
const CORTE = "T16:00:00", MIN_OPS = 15, MIN_PRIMA = 1_000_000, HZ = 5;
const CALENTAMIENTO = 20, PCT_UMBRAL = 0.80, CUENTA = 56389;
const PRUEBAS = 19, LISTON = listonT(PRUEBAS);
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
const porDia = new Map();
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
  const lista = [];
  for (const [T, a] of agg) {
    if (a.ops < MIN_OPS || a.prima < MIN_PRIMA) continue;
    const r = retorno(T, d, HZ); if (r == null) continue;
    lista.push({ ticker: T, metrica: (a.nA - a.nB) / a.prima, r });
  }
  if (lista.length >= 12) porDia.set(d, lista);
}
const orden = [...porDia.keys()].sort();
console.log("═══ UMBRAL ABSOLUTO calibrado SOLO con dias anteriores · " + orden.length + " dias ═══\n");

const nw = (s, lag) => {
  const n = s.length; if (n < 5) return { media: 0, t: 0, sd: 0, dias: n };
  const m = s.reduce((a, x) => a + x, 0) / n, e = s.map((x) => x - m);
  const sd = Math.sqrt(e.reduce((a, x) => a + x * x, 0) / (n - 1));
  let s2 = e.reduce((a, x) => a + x * x, 0) / n;
  for (let l = 1; l <= Math.min(lag, n - 1); l++) { let g = 0; for (let i = l; i < n; i++) g += e[i] * e[i - l]; s2 += 2 * (1 - l / (lag + 1)) * (g / n); }
  const ee = Math.sqrt(Math.max(s2, 0) / n);
  return { media: m, t: ee > 0 ? m / ee : 0, sd, dias: n };
};

const historia = [];            // |netaNueva| de dias YA PASADOS
const serieLS = [], serieLargo = [], nLargo = [], nCorto = [], fechasOp = [];
for (const d of orden) {
  const g = porDia.get(d);
  if (historia.length >= CALENTAMIENTO * 20) {
    const h = [...historia].sort((a, b) => a - b);
    const umbral = h[Math.floor(h.length * PCT_UMBRAL)];
    const media = g.reduce((s, f) => s + f.r, 0) / g.length;
    const alto = g.filter((f) => f.metrica >= umbral), bajo = g.filter((f) => f.metrica <= -umbral);
    if (alto.length >= 3 && bajo.length >= 3) {
      const ra = alto.reduce((s, f) => s + f.r - media, 0) / alto.length;
      const rb = bajo.reduce((s, f) => s + f.r - media, 0) / bajo.length;
      serieLS.push(ra - rb); serieLargo.push(ra);
      nLargo.push(alto.length); nCorto.push(bajo.length); fechasOp.push(d);
    }
  }
  for (const f of g) historia.push(Math.abs(f.metrica));
}
const ls = nw(serieLS, HZ), lg = nw(serieLargo, HZ);
const medNom = (a) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log("umbral = percentil " + (PCT_UMBRAL * 100) + " de |netaNueva| de dias ANTERIORES (ventana expansiva, " + CALENTAMIENTO + " dias de calentamiento sin operar)");
console.log("dias operados: " + serieLS.length + " · nombres por lado (mediana): largo " + medNom(nLargo) + " / corto " + medNom(nCorto) + "\n");
console.log("  LARGO-CORTO   separacion " + (ls.media * 100).toFixed(3) + "% por ventana de " + HZ + "d · t(NW)=" + ls.t.toFixed(2) + " · Sharpe " + ((ls.media / ls.sd) * Math.sqrt(252 / HZ)).toFixed(2));
console.log("  SOLO LARGO    exceso     " + (lg.media * 100).toFixed(3) + "% por ventana de " + HZ + "d · t(NW)=" + lg.t.toFixed(2) + " · Sharpe " + ((lg.media / lg.sd) * Math.sqrt(252 / HZ)).toFixed(2));
console.log("\n  liston con " + PRUEBAS + " pruebas declaradas: |t| >= " + LISTON + "  ->  " + (Math.abs(ls.t) >= LISTON ? "LO PASA" : "NO lo pasa"));

// tercios de tiempo
console.log("\n─ tercios del periodo (el signo tiene que repetirse en los tres) ─");
const k = Math.floor(serieLS.length / 3);
const sig = [];
for (let i = 0; i < 3; i++) {
  const s = i < 2 ? serieLS.slice(i * k, (i + 1) * k) : serieLS.slice(2 * k);
  const f = i < 2 ? fechasOp.slice(i * k, (i + 1) * k) : fechasOp.slice(2 * k);
  const r = nw(s, HZ); sig.push(Math.sign(r.media));
  console.log("  " + f[0] + " -> " + f[f.length - 1] + "  n=" + String(s.length).padStart(3) + "  separacion " + (r.media * 100).toFixed(3) + "%  t=" + r.t.toFixed(2));
}
console.log("  mismo signo en los tres tercios: " + (sig[0] === sig[1] && sig[1] === sig[2] ? "SI" : "NO"));

// dinero, largo-solo (Robinhood no permite corto)
const reb = Math.floor(252 / HZ);
const bruto = lg.media * reb;
console.log("\n─ EL DINERO, largo-solo, sobre $" + CUENTA.toLocaleString("es-ES") + " ─");
console.log("  " + medNom(nLargo) + " nombres por ventana · " + reb + " ventanas/año · exceso bruto " + (bruto * 100).toFixed(1) + "%/año = $" + Math.round(bruto * CUENTA).toLocaleString("es-ES"));
for (const bps of [2, 5, 10]) {
  const peaje = (bps / 10000) * 2 * reb, tasas = medNom(nLargo) * 2 * reb * 0.03;
  console.log("    horquilla " + String(bps).padStart(2) + " pb/lado -> peaje $" + Math.round(peaje * CUENTA).toLocaleString("es-ES") +
    " + tasas $" + Math.round(tasas) + "  =  NETO $" + Math.round(bruto * CUENTA - peaje * CUENTA - tasas).toLocaleString("es-ES") + "/año");
}
console.log("\n  Con " + medNom(nLargo) + " nombres y $" + CUENTA.toLocaleString("es-ES") + ", cada posicion son $" + Math.round(CUENTA / medNom(nLargo)).toLocaleString("es-ES") + ".");
console.log("  RECORDATORIO: la horquilla de ACCIONES no esta medida — esta caja no trae NBBO de acciones.");
console.log("  Y estos 78 dias ya se han mirado 19 veces. Esta forma va al FORWARD-TEST, no a la cuenta.");
