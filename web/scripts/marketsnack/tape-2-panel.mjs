// PANEL FLOW-TAPE · PASO 2 — CONSTRUIR EL PANEL. Convertir la cinta en NÚMEROS.
//
// Cada fila = (subyacente, día, corte). Sólo con operaciones ANTERIORES al corte.
//
// LOS 8 NÚMEROS (los 4 que pide el panel + la aceleración direccional + un control):
//   ritmoRel   ritmo de llegada (ops/min) DIVIDIDO por la mediana de ESE MISMO símbolo en días
//              ANTERIORES (expansivo, mín. 5 días previos). Sin esto "ritmo" sólo ordena por tamaño.
//   acel       log( ops/min del último tercio del reloj ÷ ops/min de los dos primeros ). Sin dirección.
//   dirAcel    neto(último tercio) − neto(primeros dos tercios).  <- LA HIPÓTESIS DEL ENCARGO
//   netoTardio neto del último tercio del reloj (la parte más reciente y más rápida).
//   racha      mayor tramo ININTERRUMPIDO de prima del mismo lado / prima direccional, CON SIGNO.
//   centroide  hora media de llegada de la prima, ponderada por prima, escalada a [0,1] del reloj.
//   concord    correlación intradía (cubos de 15 min) entre el neto del cubo y el cambio de precio.
//   neto       (prima alcista − bajista) / total en toda la ventana. CONTROL: dirección SIN forma.
//
// DIRECCIÓN DE LA CINTA — del agresor, no del campo `sentiment` (ese ya se midió aparte):
//   comprador = ASKSIDE|AT_ASK|ABOVE_ASK · vendedor = BIDSIDE|AT_BID|BELOW_BID · MIDMKT = neutro.
//   alcista = comprar call o vender put · bajista = comprar put o vender call.
//
// NADA DE MIRAR AL FUTURO: cortes 15/17/19 UTC -> entrada en el CIERRE del mismo día (>=1 h después).
// El corte "dia" usa toda la cinta y entra en el cierre del día SIGUIENTE.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/marketsnack/tape-2-panel.mjs

import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";
import { radiografia } from "../../lib/radiografia";
// La raíz se DEDUCE (scripts/raiz.mjs): escrita a mano se rompe al renombrar la carpeta.
import { RAIZ } from "../raiz.mjs";

const DIR = path.join(RAIZ, "scripts/cache-theta/marketsnack/flujo-100k");
const CHART = path.join(RAIZ, "scripts/cache-theta/marketsnack/aux/chart-all");
const SALIDA = path.join(RAIZ, "scripts/cache-theta/marketsnack/tape-panel.json");

const ABRE = 13 * 60 + 30;                  // 13:30 UTC = 9:30 ET
// corte -> [minuto UTC del corte, desfase de días hasta la ENTRADA]
const CORTES = { "11:00ET": [15 * 60, 0], "13:00ET": [17 * 60, 0], "15:00ET": [19 * 60, 0], dia: [20 * 60, 1] };
const MIN_OPS = 30;        // una "cinta" con menos de 30 prints no tiene forma que medir
const MIN_DIR = 15;        // y al menos 15 con dirección de agresor
const BUCKET = 15;         // minutos por cubo para la concordancia flujo-precio

const COMPRA = new Set(["ASKSIDE", "AT_ASK", "ABOVE_ASK"]);
const VENDE = new Set(["BIDSIDE", "AT_BID", "BELOW_BID"]);

const media = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const corr = (a, b) => {
  const ma = media(a), mb = media(b); let n = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da > 0 && db > 0 ? n / Math.sqrt(da * db) : null;
};
function parseOcc(s) {
  if (!s || s.length < 16) return null;
  const k = s.slice(-8), tp = s.slice(-9, -8), fe = s.slice(-15, -9), u = s.slice(0, -15);
  return /^\d{8}$/.test(k) && /^[CP]$/.test(tp) && /^\d{6}$/.test(fe) && u ? { u, tipo: tp } : null;
}

// ── series de precio (split-ajustadas; sólo para los retornos) ─────────────────────────────
const precio = new Map();
for (const f of fs.readdirSync(CHART)) {
  let j; try { j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(CHART, f))).toString("utf8")); } catch { continue; }
  if (!j?.data?.length) continue;
  const serie = j.data.map((p) => [p.t.slice(0, 10), p.v]).filter((p) => Number.isFinite(p[1]) && p[1] > 0);
  if (serie.length < 100) continue;
  precio.set(f.replace(".json.gz", ""), { serie, idx: new Map(serie.map((p, i) => [p[0], i])) });
}
const dias = fs.readdirSync(DIR).filter((f) => f.endsWith(".jsonl.gz")).sort().map((f) => f.slice(0, 10));
console.log(`=== FLOW TAPE · PASO 2 · PANEL ===`);
console.log(`   ${dias.length} días · ${precio.size} símbolos con precio · corte mínimo ${MIN_OPS} ops / ${MIN_DIR} dirigidas\n`);

// ── 1ª pasada: recoger la cinta de cada (símbolo, día) ─────────────────────────────────────
const cintas = new Map();   // "SIM|DIA" -> [{m, prima, s, ap}]  s=+1 alcista −1 bajista 0 neutro
let descAsk = 0, leidas = 0;
for (const dia of dias) {
  const buf = zlib.gunzipSync(fs.readFileSync(path.join(DIR, `${dia}.jsonl.gz`))).toString("utf8");
  for (const l of buf.split("\n")) {
    if (!l) continue;
    let t; try { t = JSON.parse(l); } catch { continue; }
    leidas++;
    const occ = parseOcc(t.symbol ?? ""); if (!occ || !precio.has(occ.u)) continue;
    if (!(t.premium > 0) || !t.timestamp) continue;
    if (!(t.ask_price > 0) || t.bid_price > t.ask_price) { descAsk++; continue; }  // cotización cruzada: fuera
    const m = +t.timestamp.slice(11, 13) * 60 + +t.timestamp.slice(14, 16);
    if (m < ABRE) continue;
    const agres = COMPRA.has(t.side) ? 1 : VENDE.has(t.side) ? -1 : 0;
    const s = agres === 0 ? 0 : agres * (occ.tipo === "C" ? 1 : -1);
    const k = `${occ.u}|${dia}`;
    let c = cintas.get(k); if (!c) { c = []; cintas.set(k, c); }
    c.push({ m, prima: t.premium, s, ap: t.asset_price > 0 ? t.asset_price : null });
  }
}
console.log(`   leídas ${leidas.toLocaleString("es-ES")} · descartadas por cotización cruzada/ask=0: ${descAsk}`);
console.log(`   cintas (símbolo,día) con precio: ${cintas.size.toLocaleString("es-ES")}\n`);

// ── 2ª pasada: métricas por corte ──────────────────────────────────────────────────────────
function metricas(ops, corteMin) {
  const w = ops.filter((o) => o.m <= corteMin).sort((a, b) => a.m - b.m);
  if (w.length < MIN_OPS) return null;
  const dir = w.filter((o) => o.s !== 0);
  if (dir.length < MIN_DIR) return null;
  const len = corteMin - ABRE;
  const fron = ABRE + (len * 2) / 3;            // frontera E/L por RELOJ, no por nº de prints
  const E = w.filter((o) => o.m < fron), L = w.filter((o) => o.m >= fron);
  const lenE = (len * 2) / 3, lenL = len / 3;

  const net = (arr) => {
    let a = 0, b = 0;
    for (const o of arr) { if (o.s > 0) a += o.prima; else if (o.s < 0) b += o.prima; }
    return a + b > 0 ? (a - b) / (a + b) : null;
  };
  const neto = net(w), netoE = net(E), netoL = net(L);

  // racha con signo: mayor tramo ininterrumpido de prima del mismo lado
  let mejor = 0, actual = 0, signo = 0, sgMejor = 0, totalDir = 0;
  for (const o of dir) {
    totalDir += o.prima;
    if (o.s === signo) actual += o.prima; else { signo = o.s; actual = o.prima; }
    if (actual > mejor) { mejor = actual; sgMejor = signo; }
  }
  const racha = totalDir > 0 ? (mejor / totalDir) * sgMejor : null;

  // centroide horario ponderado por prima, escalado a [0,1]
  let sp = 0, sw = 0;
  for (const o of w) { sp += ((o.m - ABRE) / len) * o.prima; sw += o.prima; }
  const centroide = sw > 0 ? sp / sw : null;

  // concordancia flujo-precio por cubos de 15 min
  const cubos = new Map();
  for (const o of w) {
    const b = Math.floor((o.m - ABRE) / BUCKET);
    let c = cubos.get(b); if (!c) { c = { a: 0, b: 0, p0: null, p1: null }; cubos.set(b, c); }
    if (o.s > 0) c.a += o.prima; else if (o.s < 0) c.b += o.prima;
    if (o.ap != null) { if (c.p0 == null) c.p0 = o.ap; c.p1 = o.ap; }
  }
  const bs = [...cubos].sort((x, y) => x[0] - y[0]).map((x) => x[1]).filter((c) => c.a + c.b > 0 && c.p0 != null);
  let concord = null;
  if (bs.length >= 6) {
    const fx = bs.map((c) => (c.a - c.b) / (c.a + c.b));
    const px = bs.map((c) => c.p1 / c.p0 - 1);
    concord = corr(fx, px);
  }

  // momento intradía hasta el corte: LAS DOS PUNTAS DEL MISMO CAMPO (asset_price), misma escala.
  // asset_price es BRUTO (sin ajustar por splits); como aquí sólo se usa como RATIO dentro del
  // mismo día, no se cruza con la serie ajustada y no hay problema de escala.
  const conAp = w.filter((o) => o.ap != null);
  const momento = conAp.length >= 2 ? conAp[conAp.length - 1].ap / conAp[0].ap - 1 : null;

  return {
    ops: w.length, opsDir: dir.length, prima: sw, momento,
    ritmoBruto: w.length / len,
    acel: E.length > 0 && L.length > 0 ? Math.log((L.length / lenL) / (E.length / lenE)) : null,
    dirAcel: netoE != null && netoL != null ? netoL - netoE : null,
    netoTardio: netoL, racha, centroide, concord, neto,
    cubosPrecio: bs.length,
  };
}

const panel = [];
const ritmoHist = new Map();   // SIM|corte -> [ritmos de días ANTERIORES, en orden]
for (const dia of dias) {
  for (const [k, ops] of cintas) {
    const barra = k.indexOf("|");
    const sim = k.slice(0, barra), d = k.slice(barra + 1);
    if (d !== dia) continue;
    const P = precio.get(sim); const i = P.idx.get(dia); if (i == null) continue;
    for (const [nombre, [corteMin, desfase]] of Object.entries(CORTES)) {
      const M = metricas(ops, corteMin); if (!M) continue;
      // ritmo relativo: SÓLO con días anteriores de ESE símbolo
      const hk = `${sim}|${nombre}`;
      const prev = ritmoHist.get(hk);
      let ritmoRel = null;
      if (prev && prev.length >= 5) { const s = [...prev].sort((a, b) => a - b); ritmoRel = M.ritmoBruto / s[Math.floor(s.length / 2)]; }
      if (prev) prev.push(M.ritmoBruto); else ritmoHist.set(hk, [M.ritmoBruto]);
      // retornos: entrada en el cierre de i+desfase
      const e = i + desfase; if (e + 1 >= P.serie.length) continue;
      const base = P.serie[e][1];
      const r1 = (P.serie[e + 1][1] / base - 1) * 100;
      const r5 = e + 5 < P.serie.length ? (P.serie[e + 5][1] / base - 1) * 100 : null;
      panel.push({
        sim, dia, corte: nombre, ritmoRel, acel: M.acel, dirAcel: M.dirAcel, netoTardio: M.netoTardio,
        racha: M.racha, centroide: M.centroide, concord: M.concord, neto: M.neto, momento: M.momento,
        ops: M.ops, opsDir: M.opsDir, prima: M.prima, ritmoBruto: M.ritmoBruto, cubosPrecio: M.cubosPrecio, r1, r5,
      });
    }
  }
}

console.log(`── filas del panel por corte ──`);
for (const c of Object.keys(CORTES)) {
  const f = panel.filter((x) => x.corte === c);
  const porDia = new Map(); for (const x of f) porDia.set(x.dia, (porDia.get(x.dia) ?? 0) + 1);
  const cob = (campo) => ((f.filter((x) => x[campo] != null).length / f.length) * 100).toFixed(1);
  console.log(`   ${c.padEnd(8)} n=${String(f.length).padStart(5)} · ${porDia.size} días · ${(f.length / porDia.size).toFixed(1)} símbolos/día` +
    ` · cobertura ritmoRel ${cob("ritmoRel")}% · concord ${cob("concord")}% · acel ${cob("acel")}% · r5 ${cob("r5")}%`);
}

// cobertura de concord antes y después de la ruptura del 16-jul
const f19 = panel.filter((x) => x.corte === "15:00ET");
const antes = f19.filter((x) => x.dia < "2026-07-16"), desde = f19.filter((x) => x.dia >= "2026-07-16");
console.log(`\n── la ruptura del 16-jul en la CONCORDANCIA (necesita asset_price) ──`);
console.log(`   antes  ${antes.length} filas · con concord ${((antes.filter((x) => x.concord != null).length / antes.length) * 100).toFixed(1)}%`);
console.log(`   desde  ${desde.length} filas · con concord ${((desde.filter((x) => x.concord != null).length / desde.length) * 100).toFixed(1)}%`);

// ── radiografía: campos muertos ANTES de medir ─────────────────────────────────────────────
const base = panel.filter((x) => x.corte === "15:00ET" && x.ritmoRel != null && x.concord != null && x.acel != null);
radiografia(base, ["ritmoRel", "acel", "dirAcel", "netoTardio", "racha", "centroide", "concord", "neto", "r1"],
  "flow tape · corte 15:00 ET", { maxCeros: 0.2, cerosLegitimos: [] });

fs.writeFileSync(SALIDA, JSON.stringify(panel));
console.log(`   escrito ${SALIDA} (${(fs.statSync(SALIDA).size / 1e6).toFixed(1)} MB, ${panel.length} filas)`);
