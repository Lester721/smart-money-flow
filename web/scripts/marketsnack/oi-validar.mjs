// VALIDACIÓN previa del ingrediente OPEN INTEREST del flow_feed de MarketSnack.
// No mide ninguna señal: sólo comprueba que el campo puede contener la respuesta.
//
//  1 · cobertura de open_interest / size / premium, partida por la ruptura del 2026-07-16
//  2 · ¿el OI cambia DENTRO del día? (si cambia, no es una foto de cierre anterior)
//  3 · ¿el OI de hoy ya incluye el volumen de HOY? — la trampa de mirar al futuro
//  4 · ¿la barra `v` del chart es el CIERRE? (contrastada con asset_price de las 15:5x ET)
//  5 · ¿cuántos símbolos por día tienen precio y flujo? (¿hay corte transversal?)

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const DIR = path.join("scripts", "cache-theta", "marketsnack", "flujo-100k");
const CHART = path.join("scripts", "cache-theta", "marketsnack", "aux", "chart-all");
const RUPTURA = "2026-07-16";

const dias = fs.readdirSync(DIR).filter((f) => f.endsWith(".jsonl.gz")).map((f) => f.slice(0, 10)).sort();
console.log(dias.length + " ficheros-dia: " + dias[0] + " -> " + dias[dias.length - 1] + "\n");

const OCC = /^([A-Z]+)(\d{6})([CP])(\d{8})$/;
function raiz(sym) { const m = OCC.exec(sym); return m ? m[1] : null; }

function leer(d) {
  const b = zlib.gunzipSync(fs.readFileSync(path.join(DIR, d + ".jsonl.gz")));
  const t = b.toString("utf8").trim();
  if (!t) return [];
  return t.split("\n").map((l) => JSON.parse(l));
}

// -- 1 . cobertura -------------------------------------------------------------------------
const cob = {};
for (const k of ["antes", "desde"]) cob[k] = { n: 0, oiNull: 0, oiCero: 0, sizeNull: 0, premNull: 0, volNull: 0, sinRaiz: 0, sizeMayorOI: 0, primaTotal: 0, primaNueva: 0 };
const porDiaSim = new Map();
const simSinChart = new Map();
let totalOps = 0;
const conChart = new Set(fs.readdirSync(CHART).map((f) => f.slice(0, -8)));

for (const d of dias) {
  const filas = leer(d);
  totalOps += filas.length;
  const k = d < RUPTURA ? "antes" : "desde";
  const c = cob[k];
  const set = new Set();
  for (const f of filas) {
    c.n++;
    if (f.open_interest == null) c.oiNull++;
    else if (f.open_interest === 0) c.oiCero++;
    if (f.size == null) c.sizeNull++;
    if (f.premium == null) c.premNull++;
    if (f.volume == null) c.volNull++;
    const r = raiz(f.symbol);
    if (!r) { c.sinRaiz++; continue; }
    set.add(r);
    if (!conChart.has(r)) simSinChart.set(r, (simSinChart.get(r) ?? 0) + 1);
    if (f.premium != null && f.size != null && f.open_interest != null) {
      c.primaTotal += f.premium;
      if (f.size > f.open_interest) { c.sizeMayorOI++; c.primaNueva += f.premium; }
    }
  }
  porDiaSim.set(d, set);
}
console.log("operaciones totales leidas: " + totalOps.toLocaleString("es-ES") + "\n");
console.log("- 1 . COBERTURA DE CAMPOS, partida por la ruptura del 2026-07-16 -");
for (const [k, c] of Object.entries(cob)) {
  const p = (x) => ((x / c.n) * 100).toFixed(2) + "%";
  console.log(" " + k.padEnd(5) + " n=" + c.n.toLocaleString("es-ES").padStart(10) +
    " . OI nulo " + p(c.oiNull).padStart(7) + " . OI=0 " + p(c.oiCero).padStart(7) +
    " . size nulo " + p(c.sizeNull).padStart(7) + " . premium nulo " + p(c.premNull).padStart(7) +
    " . symbol no-OCC " + p(c.sinRaiz).padStart(7));
  console.log("       size>OI: " + c.sizeMayorOI.toLocaleString("es-ES") + " ops (" + p(c.sizeMayorOI) +
    ") . fraccion de PRIMA que abre posicion nueva: " + ((c.primaNueva / c.primaTotal) * 100).toFixed(2) + "%");
}

// -- 5 . corte transversal disponible ------------------------------------------------------
const cuentas = [...porDiaSim.values()].map((s) => [...s].filter((r) => conChart.has(r)).length);
cuentas.sort((a, b) => a - b);
console.log("\n- 5 . CORTE TRANSVERSAL (simbolos con flujo Y serie de precio, por dia) -");
console.log(" min " + cuentas[0] + " . p10 " + cuentas[Math.floor(cuentas.length * 0.1)] +
  " . mediana " + cuentas[Math.floor(cuentas.length / 2)] + " . max " + cuentas[cuentas.length - 1]);
const sinChartOrden = [...simSinChart.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
console.log(" raices SIN serie de precio con mas flujo: " + sinChartOrden.map(([r, n]) => r + "(" + n.toLocaleString("es-ES") + ")").join(" "));

// -- 2 . el OI cambia dentro del dia? -----------------------------------------------------
console.log("\n- 2 . EL OI CAMBIA DENTRO DEL DIA? (si cambia, no es foto de cierre anterior) -");
for (const d of ["2026-05-06", "2026-06-10", "2026-08-11"]) {
  const filas = leer(d);
  const porContrato = new Map();
  for (const f of filas) {
    if (f.open_interest == null) continue;
    if (!porContrato.has(f.symbol)) porContrato.set(f.symbol, new Set());
    porContrato.get(f.symbol).add(f.open_interest);
  }
  const conVarias = [...porContrato.values()].filter((s) => s.size > 1).length;
  const tot = porContrato.size;
  console.log(" " + d + ": " + conVarias + " de " + tot + " contratos muestran MAS DE UN valor de OI el mismo dia (" +
    ((conVarias / tot) * 100).toFixed(2) + "%)");
}

// -- 3 . el OI de hoy ya incluye el volumen de hoy? ---------------------------------------
console.log("\n- 3 . EL OI MOSTRADO YA INCLUYE EL VOLUMEN DEL MISMO DIA? (trampa de futuro) -");
const ventana = dias.slice(20, 50);
const oiDia = new Map(), volDia = new Map();
for (const d of ventana) {
  const oi = new Map(), vo = new Map();
  for (const f of leer(d)) {
    if (f.open_interest != null) oi.set(f.symbol, f.open_interest);
    if (f.volume != null) vo.set(f.symbol, Math.max(vo.get(f.symbol) ?? 0, f.volume));
  }
  oiDia.set(d, oi); volDia.set(d, vo);
}
const pares = [];
for (let i = 0; i + 1 < ventana.length; i++) {
  const d0 = ventana[i], d1 = ventana[i + 1];
  const oi0 = oiDia.get(d0), oi1 = oiDia.get(d1), v0 = volDia.get(d0), v1 = volDia.get(d1);
  for (const [c, a] of oi0) {
    const b = oi1.get(c); if (b == null) continue;
    const vol0 = v0.get(c) ?? 0, vol1 = v1.get(c) ?? 0;
    if (vol0 < 50 && vol1 < 50) continue;
    pares.push({ dOI: b - a, vol0, vol1 });
  }
}
const cor = (x, y) => {
  const n = x.length, mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxy / Math.sqrt(sxx * syy);
};
const aDOI = pares.map((p) => Math.abs(p.dOI));
console.log(" " + pares.length.toLocaleString("es-ES") + " pares contrato-dia consecutivos");
console.log("  corr( |OI(D+1)-OI(D)| , volumen del dia D  ) = " + cor(aDOI, pares.map((p) => p.vol0)).toFixed(3) + "   <- si es la ALTA: OI = foto de cierre anterior (LIMPIO)");
console.log("  corr( |OI(D+1)-OI(D)| , volumen del dia D+1) = " + cor(aDOI, pares.map((p) => p.vol1)).toFixed(3) + "   <- si es la ALTA: el OI mostrado YA incluye el dia (FUTURO)");

// -- 4 . la barra del chart es el cierre? -------------------------------------------------
console.log("\n- 4 . LA BARRA v DEL CHART ES EL CIERRE? (contra asset_price de las 15:5x ET) -");
const serie = (T) => {
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CHART, T + ".json.gz"))).toString("utf8"));
  const m = new Map();
  for (const p of j.data ?? []) m.set(p.t.slice(0, 10), p.v);
  return m;
};
const diasPrueba = ["2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14"];
const cacheDia = new Map();
for (const d of diasPrueba) cacheDia.set(d, leer(d));
for (const T of ["AAPL", "NVDA", "SPY", "TSLA"]) {
  const s = serie(T);
  const filas = [];
  for (const d of diasPrueba) {
    const ops = cacheDia.get(d).filter((f) => raiz(f.symbol) === T && f.asset_price != null);
    const tarde = ops.filter((f) => f.timestamp >= d + "T19:50" && f.timestamp <= d + "T20:00");
    if (!tarde.length) continue;
    tarde.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    const ult = tarde[tarde.length - 1].asset_price;
    const v = s.get(d);
    if (v == null) continue;
    filas.push(d + " chart " + v.toFixed(2) + " . ult asset_price 15:5x " + ult.toFixed(2) + " . dif " + (((ult / v) - 1) * 100).toFixed(3) + "%");
  }
  console.log(" " + T.padEnd(5) + " " + filas.join("  |  "));
}
