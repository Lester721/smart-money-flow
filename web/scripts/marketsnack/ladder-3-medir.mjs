// ═══ GAMMA LADDER · PASO 3 — LA MEDICIÓN ═══════════════════════════════════════════════
//
// LA PREGUNTA: ¿el precio va HACIA el pico de gamma, o HUYE de él? ¿la distancia al pico
// predice el movimiento del día siguiente?
//
// ─── LA RECETA, CONGELADA ANTES DE TOCAR UN RETORNO ────────────────────────────────────────
// El paso 2 cruzó 4 ventanas de strike x 5 de vencimiento contra los muros que publica
// MarketSnack. Regla dicha de antemano: **la receta que más acuerdo de muros consigue
// conservando al menos el 50% de los pares ticker-día**. Gana ±10% de strike y vencimiento
// ≤ 21 días (call wall 47,4% · put wall 38,5% · signo 66,4% · retiene el 51%).
//
// Y AQUÍ VA LA ADVERTENCIA QUE MANDA SOBRE TODO LO DEMÁS: esa escalera NO es la escalera de
// gamma de verdad. El flow_feed sólo trae contratos que OPERARON con prima ≥ $100k, y eso es
// el **11,5% del interés abierto real** (medido contra las cadenas completas del 2026-08-19).
// Mi gamma neta correlaciona rho=0,22 con la suya. Es la escalera de la PARTE LÍQUIDA de la
// cadena, no la cadena. Todo lo que salga de aquí lleva esa etiqueta pegada.
//
// ─── CÓMO SE MIDE, SIN FUTURO ──────────────────────────────────────────────────────────────
//   · se observa a las 12:00 ET (16:00Z): sólo operaciones ANTERIORES a esa hora
//   · el `open_interest` del flujo es el CIERRE DE D-1 (validado en oi-validar.mjs) → pasado
//   · se entra al CIERRE de D (posterior al corte) y se predice cierre(D) → cierre(D+n)
//   · se ordena TRANSVERSALMENTE dentro de cada día: el mercado se cancela solo
//   · ningún umbral se calcula con días posteriores — el rango es del propio día
//
// ─── LO QUE NO SE PUEDE MEDIR Y SE DICE ────────────────────────────────────────────────────
//   SPX, SPXW, NDX, RUT y VIX son la mitad del flujo caro y MarketSnack NO SIRVE su precio.
//   Quedan FUERA. No se sustituyen por SPY.
//
// USO: node --env-file=.env.local --import tsx --max-old-space-size=10240 \
//        scripts/marketsnack/ladder-3-medir.mjs

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { radiografia } from "../../lib/radiografia.ts";
import { pasarBarrera, informe, listonT, comprobarDescarte, potencia } from "../../lib/barreraHallazgos.ts";

const BASE = path.join("scripts", "cache-theta", "marketsnack");
const DIR = path.join(BASE, "flujo-100k");
const CHART = path.join(BASE, "aux", "chart-all");
const CORTE = "T16:00:00";      // 12:00 ET — fija todo el periodo
const VENT_STRIKE = 0.10;       // receta congelada en el paso 2
const VENT_DIAS = 21;
const VENT_DIAS_ROB = 45;       // variante de robustez, contada en el presupuesto de pruebas
const MIN_OPS = 15;             // operaciones antes del corte
const MIN_STRIKES = 5;          // una escalera con 3 peldaños no es una escalera
const HORIZONTES = [1, 5, 20];

const METRICAS = ["distPicoTotal", "distPicoNeto", "asimetria", "distFlip", "concentracion", "movPico", "gammaNetaNorm"];
// 7 metricas x 3 horizontes = 21 · concentracion contra |retorno| x 3 = 24 · robustez 45d x 3 = 27
const PRUEBAS = 27;
const LISTON = listonT(PRUEBAS);

const OCC = /^([A-Z]+)(\d{6})([CP])(\d{8})$/;
function parseOCC(sym) {
  const m = OCC.exec(sym);
  if (!m) return null;
  const y = 2000 + Number(m[2].slice(0, 2));
  return { raiz: m[1], vencMs: Date.UTC(y, Number(m[2].slice(2, 4)) - 1, Number(m[2].slice(4, 6))), tipo: m[3], strike: Number(m[4]) / 1000 };
}

// ── series de precio ─────────────────────────────────────────────────────────────────────
const cierre = new Map();
for (const f of fs.readdirSync(CHART)) {
  const T = f.slice(0, -8);
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CHART, f))).toString("utf8"));
  const fechas = [], v = new Map(), idx = new Map();
  for (const p of j.data ?? []) { const d = p.t.slice(0, 10); if (v.has(d)) continue; idx.set(d, fechas.length); fechas.push(d); v.set(d, p.v); }
  cierre.set(T, { fechas, v, idx });
}
console.log("universo con precio: " + cierre.size + " simbolos (indices EXCLUIDOS: la API no sirve su precio)\n");

function retorno(T, d, n) {
  const s = cierre.get(T); if (!s) return null;
  const i = s.idx.get(d); if (i == null) return null;
  const j = i + n; if (j >= s.fechas.length) return null;
  const a = s.v.get(s.fechas[i]), b = s.v.get(s.fechas[j]);
  if (!(a > 0) || !(b > 0)) return null;
  return b / a - 1;
}

// ── construccion de la escalera por (ticker, dia) ────────────────────────────────────────
function escaleras(d, ventDias) {
  const p = path.join(DIR, d + ".jsonl.gz");
  const txt = zlib.gunzipSync(fs.readFileSync(p)).toString("utf8").trim();
  if (!txt) return new Map();
  const lim = d + CORTE, hoyMs = Date.parse(d + "T00:00:00Z");
  const porT = new Map();
  for (const l of txt.split("\n")) {
    const f = JSON.parse(l);
    if (f.timestamp >= lim) continue;                 // NADA posterior a las 12:00 ET
    const o = parseOCC(f.symbol);
    if (!o || !cierre.has(o.raiz)) continue;          // sin precio -> fuera, no se sustituye
    if (f.gamma == null || !Number.isFinite(f.gamma) || !(f.open_interest > 0)) continue;
    let a = porT.get(o.raiz);
    if (!a) { a = { c: new Map(), spots: [], ops: 0, prima: 0 }; porT.set(o.raiz, a); }
    a.ops++; a.prima += f.premium ?? 0;
    a.c.set(f.symbol, { strike: o.strike, tipo: o.tipo, gamma: f.gamma, oi: f.open_interest, vencMs: o.vencMs });
    if (f.asset_price != null && f.asset_price > 0) a.spots.push(f.asset_price);
  }
  const out = new Map();
  for (const [T, a] of porT) {
    if (a.ops < MIN_OPS || !a.spots.length) continue;
    const ss = a.spots.slice().sort((x, y) => x - y);
    const S = ss[Math.floor(ss.length / 2)];
    const strikes = new Map();
    for (const c of a.c.values()) {
      if (Math.abs(c.strike - S) / S > VENT_STRIKE) continue;
      const dte = (c.vencMs - hoyMs) / 86400000;
      if (dte < 0 || dte > ventDias) continue;
      const g = c.gamma * c.oi * 100 * S * S * 0.01;   // $ de delta por 1% de movimiento
      let e = strikes.get(c.strike);
      if (!e) { e = { call: 0, put: 0 }; strikes.set(c.strike, e); }
      if (c.tipo === "C") e.call += g; else e.put += g;
    }
    if (strikes.size < MIN_STRIKES) continue;
    out.set(T, { spot: S, strikes, ops: a.ops, prima: a.prima });
  }
  return out;
}

// ── las metricas, todas observables a las 12:00 ET ───────────────────────────────────────
function metricas(e) {
  const S = e.spot;
  const ks = [...e.strikes.keys()].sort((a, b) => a - b);
  let totalSum = 0, netoSum = 0, arriba = 0, abajo = 0;
  let picoTotal = null, picoTotalV = -Infinity, picoNeto = null, picoNetoV = -Infinity;
  for (const k of ks) {
    const x = e.strikes.get(k);
    const tot = x.call + x.put, net = x.call - x.put;
    totalSum += tot; netoSum += net;
    if (k > S) arriba += tot; else if (k < S) abajo += tot;
    if (tot > picoTotalV) { picoTotalV = tot; picoTotal = k; }
    if (net > picoNetoV) { picoNetoV = net; picoNeto = k; }
  }
  if (!(totalSum > 0)) return null;
  // gamma flip: strike donde la gamma neta ACUMULADA cruza cero
  let acc = 0, flip = null;
  for (const k of ks) {
    const x = e.strikes.get(k);
    const prev = acc;
    acc += x.call - x.put;
    if (flip == null && prev !== 0 && Math.sign(prev) !== Math.sign(acc)) flip = k;
  }
  return {
    picoTotal, picoNeto, totalSum, netoSum,
    distPicoTotal: (picoTotal - S) / S,
    distPicoNeto: (picoNeto - S) / S,
    asimetria: (arriba - abajo) / totalSum,
    distFlip: flip != null ? (flip - S) / S : null,
    concentracion: picoTotalV / totalSum,
    gammaNetaNorm: netoSum / totalSum,
    nStrikes: ks.length,
  };
}

// ── recorrido de todo el periodo ─────────────────────────────────────────────────────────
const dias = fs.readdirSync(DIR).filter((f) => f.endsWith(".jsonl.gz")).map((f) => f.slice(0, 10)).sort();

function construir(ventDias) {
  const filas = [];
  let candidatos = 0;
  const picoAyer = new Map();  // ticker -> {fecha, pico}
  for (const d of dias) {
    const esc = escaleras(d, ventDias);
    for (const [T, e] of esc) {
      candidatos++;
      const m = metricas(e);
      if (!m) continue;
      const ay = picoAyer.get(T);
      const mov = ay ? (m.picoTotal - ay.pico) / e.spot : null;   // D-1 -> D, pasado puro
      picoAyer.set(T, { fecha: d, pico: m.picoTotal });
      filas.push({
        fecha: d, ticker: T, spot: e.spot, ops: e.ops, prima: e.prima, nStrikes: m.nStrikes,
        distPicoTotal: m.distPicoTotal, distPicoNeto: m.distPicoNeto, asimetria: m.asimetria,
        distFlip: m.distFlip, concentracion: m.concentracion, gammaNetaNorm: m.gammaNetaNorm,
        movPico: mov, gammaTotal: m.totalSum,
        r1: retorno(T, d, 1), r5: retorno(T, d, 5), r20: retorno(T, d, 20),
      });
    }
  }
  return { filas, candidatos };
}

console.log("construyendo la escalera con la receta congelada: strikes a +-" + (VENT_STRIKE * 100) + "% del spot, vencimiento <= " + VENT_DIAS + " dias\n");
const { filas: filasBrutas, candidatos } = construir(VENT_DIAS);
comprobarDescarte(candidatos, filasBrutas.length, "construccion de la escalera (" + MIN_STRIKES + " strikes minimo)");
console.log("pares ticker-dia: " + candidatos.toLocaleString("es-ES") + " candidatos -> " + filasBrutas.length.toLocaleString("es-ES") + " con escalera utilizable");
console.log("tickers distintos: " + new Set(filasBrutas.map((f) => f.ticker)).size + " · dias: " + new Set(filasBrutas.map((f) => f.fecha)).size + "\n");

// ── RADIOGRAFIA antes de medir nada ──────────────────────────────────────────────────────
radiografia(filasBrutas, ["distPicoTotal", "distPicoNeto", "asimetria", "concentracion", "gammaNetaNorm", "nStrikes", "spot", "r1", "r5", "r20"],
  "escalera de gamma (ticker-dia)", { cerosLegitimos: ["distPicoTotal", "distPicoNeto", "asimetria", "gammaNetaNorm"] });
const conFlip = filasBrutas.filter((f) => f.distFlip != null).length;
const conMov = filasBrutas.filter((f) => f.movPico != null).length;
console.log("\ncon gamma flip definido: " + conFlip.toLocaleString("es-ES") + " (" + (conFlip / filasBrutas.length * 100).toFixed(1) + "%)");
console.log("con pico de ayer para comparar: " + conMov.toLocaleString("es-ES") + " (" + (conMov / filasBrutas.length * 100).toFixed(1) + "%)");

// ── fotografia descriptiva del panel (lo que pide el encargo, antes de la señal) ──────────
const q = (arr, p) => { const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };
console.log("\n" + "═".repeat(100));
console.log("EL PANEL EN NUMEROS  (n=" + filasBrutas.length.toLocaleString("es-ES") + " pares ticker-dia)");
console.log("═".repeat(100));
console.log("metrica              p10       p25       p50       p75       p90     media");
for (const m of ["distPicoTotal", "distPicoNeto", "asimetria", "concentracion", "gammaNetaNorm"]) {
  const v = filasBrutas.map((f) => f[m]).filter((x) => x != null && Number.isFinite(x));
  const med = v.reduce((a, b) => a + b, 0) / v.length;
  console.log(m.padEnd(20) + [0.1, 0.25, 0.5, 0.75, 0.9].map((p) => (q(v, p) * 100).toFixed(2).padStart(9) + "%").join("") + (med * 100).toFixed(2).padStart(9) + "%");
}
const vf = filasBrutas.filter((f) => f.distFlip != null).map((f) => f.distFlip);
console.log("distFlip".padEnd(20) + [0.1, 0.25, 0.5, 0.75, 0.9].map((p) => (q(vf, p) * 100).toFixed(2).padStart(9) + "%").join("") + (vf.reduce((a, b) => a + b, 0) / vf.length * 100).toFixed(2).padStart(9) + "%");
const vm = filasBrutas.filter((f) => f.movPico != null).map((f) => f.movPico);
console.log("movPico".padEnd(20) + [0.1, 0.25, 0.5, 0.75, 0.9].map((p) => (q(vm, p) * 100).toFixed(2).padStart(9) + "%").join("") + (vm.reduce((a, b) => a + b, 0) / vm.length * 100).toFixed(2).padStart(9) + "%");
const picoEncima = filasBrutas.filter((f) => f.distPicoTotal > 0).length;
console.log("\nel pico de gamma esta POR ENCIMA del precio en el " + (picoEncima / filasBrutas.length * 100).toFixed(1) + "% de los casos");
console.log("el pico se queda CLAVADO de un dia para otro (movPico=0) en el " + (vm.filter((x) => x === 0).length / vm.length * 100).toFixed(1) + "% de los casos");

// ── preparacion transversal ──────────────────────────────────────────────────────────────
const porDia = new Map();
for (const f of filasBrutas) { if (!porDia.has(f.fecha)) porDia.set(f.fecha, []); porDia.get(f.fecha).push(f); }
const diasOrden = [...porDia.keys()].sort();

function preparar(metrica, hz, abs = false) {
  const salida = [];
  for (const d of diasOrden) {
    const g = porDia.get(d).filter((f) => f["r" + hz] != null && f[metrica] != null && Number.isFinite(f[metrica]));
    if (g.length < 12) continue;
    const res = (f) => abs ? Math.abs(f["r" + hz]) : f["r" + hz];
    const mediaDia = g.reduce((s, f) => s + res(f), 0) / g.length;
    const ord = [...g].sort((a, b) => a[metrica] - b[metrica]);
    ord.forEach((f, i) => salida.push({
      pnl: res(f) - mediaDia,                              // neutro al mercado por construccion
      ticker: f.ticker, fecha: f.fecha,
      rango: g.length > 1 ? i / (g.length - 1) : 0.5,
      bruto: f[metrica],
    }));
  }
  return salida;
}

function neweyWest(serie, lag) {
  const n = serie.length; if (n < 5) return { media: 0, t: 0, n };
  const m = serie.reduce((s, x) => s + x, 0) / n;
  const e = serie.map((x) => x - m);
  let s2 = e.reduce((s, x) => s + x * x, 0) / n;
  for (let l = 1; l <= Math.min(lag, n - 1); l++) {
    let g = 0; for (let i = l; i < n; i++) g += e[i] * e[i - l];
    s2 += 2 * (1 - l / (lag + 1)) * (g / n);
  }
  const ee = Math.sqrt(Math.max(s2, 0) / n);
  return { media: m, t: ee > 0 ? m / ee : 0, n };
}

function separacionDiaria(filas, hz) {
  const porF = new Map();
  for (const f of filas) { if (!porF.has(f.fecha)) porF.set(f.fecha, []); porF.get(f.fecha).push(f); }
  const serie = [];
  for (const d of [...porF.keys()].sort()) {
    const g = porF.get(d).sort((a, b) => b.rango - a.rango);
    const k = Math.floor(g.length / 3); if (k < 4) continue;
    const alto = g.slice(0, k).reduce((s, f) => s + f.pnl, 0) / k;
    const bajo = g.slice(-k).reduce((s, f) => s + f.pnl, 0) / k;
    serie.push(alto - bajo);
  }
  return { serie, nw: neweyWest(serie, hz) };
}

console.log("\n" + "═".repeat(118));
console.log("REJILLA · " + PRUEBAS + " PRUEBAS DECLARADAS · liston de |t| = " + LISTON + " (Bonferroni)");
console.log("═".repeat(118));
console.log("metrica              hz      n     sep dia    t(NW)   sep pool   t(pool)   tercios                    barrera");
console.log("─".repeat(118));

const resultados = [];
function correr(nombre, metrica, hz, abs = false) {
  const filas = preparar(metrica, hz, abs);
  if (filas.length < 200) { console.log(nombre.padEnd(20) + String(hz).padStart(3) + "   muestra insuficiente (" + filas.length + ")"); return; }
  const sd = separacionDiaria(filas, hz);
  const v = pasarBarrera(filas, (f) => f.rango, { pruebas: PRUEBAS, nMinimo: 200, maxPorTicker: 0.2 });
  const terc = v.detalle.tercios.map((t) => (t.sep >= 0 ? "+" : "-") + Math.abs(t.sep * 100).toFixed(2)).join(" ");
  console.log(nombre.padEnd(20) + String(hz).padStart(3) + String(filas.length).padStart(7) +
    (sd.nw.media * 100).toFixed(3).padStart(11) + "%" + sd.nw.t.toFixed(2).padStart(8) +
    (v.detalle.sep * 100).toFixed(3).padStart(11) + "%" + v.detalle.t.toFixed(2).padStart(9) +
    "   " + terc.padEnd(25) + (v.pasa ? " PASA" : " no"));
  resultados.push({ nombre, metrica, hz, abs, filas, v, sd });
}

for (const m of METRICAS) for (const hz of HORIZONTES) correr(m, m, hz);
console.log("─".repeat(118));
for (const hz of HORIZONTES) correr("concentr|retorno|", "concentracion", hz, true);

// ── robustez: la misma escalera con vencimiento <= 45 dias ───────────────────────────────
console.log("─".repeat(118));
const { filas: filasRob } = construir(VENT_DIAS_ROB);
porDia.clear(); diasOrden.length = 0;
for (const f of filasRob) { if (!porDia.has(f.fecha)) porDia.set(f.fecha, []); porDia.get(f.fecha).push(f); }
diasOrden.push(...[...porDia.keys()].sort());
for (const hz of HORIZONTES) correr("distPicoNeto/45d", "distPicoNeto", hz);

console.log("\nsep dia = separacion tercio alto - tercio bajo calculada DENTRO de cada dia; t(NW) corrige el solape de horizontes.");
console.log("tercios = separacion en cada tercio del periodo. Mismo signo en los tres o NO cuenta.");
console.log("signo POSITIVO = el tercio con el pico MAS ARRIBA rinde mas -> el precio va HACIA el pico (iman).");
console.log("signo NEGATIVO = el precio HUYE del pico.\n");

const pasan = resultados.filter((r) => r.v.pasa && Math.abs(r.sd.nw.t) >= LISTON);
if (pasan.length) {
  for (const r of pasan) {
    console.log("\n" + informe(r.v, r.nombre + " a " + r.hz + " dias"));
    console.log("  t de Newey-West sobre la serie diaria (" + r.sd.serie.length + " dias): " + r.sd.nw.t.toFixed(2));
  }
} else {
  console.log("NINGUNA metrica de la escalera pasa las cuatro cribas Y el liston con la t corregida por solape.\n");
  console.log("POTENCIA — que separacion habria hecho falta para verla (efecto de referencia: 0,30% mensual):");
  for (const r of resultados) {
    const p = potencia(r.filas, 0.003);
    console.log("  " + (r.nombre + " a " + r.hz + "d").padEnd(26) + "n=" + String(r.filas.length).padStart(6) +
      "  minima detectable " + (p.detectable * 100).toFixed(3) + "%   " + (p.concluyente ? "(negativo CONCLUYENTE)" : "(NO lo pudimos ver)"));
  }
}

const salida = path.join("scripts", "marketsnack", "ladder-3-salida.json");
fs.writeFileSync(salida, JSON.stringify({
  generado: new Date().toISOString(), corte: CORTE, ventanaStrike: VENT_STRIKE, ventanaDias: VENT_DIAS,
  pruebas: PRUEBAS, liston: LISTON, paresTickerDia: filasBrutas.length,
  tickers: new Set(filasBrutas.map((f) => f.ticker)).size, dias: new Set(filasBrutas.map((f) => f.fecha)).size,
  rejilla: resultados.map((r) => ({
    metrica: r.nombre, horizonte: r.hz, n: r.filas.length,
    sepDiaria: r.sd.nw.media, tNW: r.sd.nw.t, sepPooled: r.v.detalle.sep, tPooled: r.v.detalle.t,
    pasa: r.v.pasa, motivos: r.v.motivos, tercios: r.v.detalle.tercios,
    tickerMayor: r.v.detalle.tickerMayor,
  })),
}, null, 1));
console.log("\nrejilla guardada en " + salida);
