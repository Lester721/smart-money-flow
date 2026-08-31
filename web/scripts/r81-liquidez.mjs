// EL ESTADO CON LA REGLA COMPLETA — las dos cuentas, año por año.
//
// LA REGLA (2026-08-27):
//   señal   golpe >$500k al ask · 12x el OI de la vispera · DENTRO del dinero · >=$10.000 ·
//           >=5 dias a vencer · despues de las 14:00
//   filtro  la accion por debajo de su media de 20 dias
//   cual    UNA por ticker-dia: la del vencimiento mas lejano
//   compra  el dia siguiente, al ask
//   salida  8% de movimiento SI la cinta confirma · 12% si NO confirma · tope 60 dias
//   tamaño  25% del capital · 50% si confirma · 4 HUECOS SIEMPRE
//   resto   en SPY, siempre
//   confirma = dominancia a favor (>=0,3) O repeticion (2-9 golpes)
//
// AUDIT DENTRO antes de enseñar: control sin señales = SPY exacto · suma que cuadre ·
// sin mirada al futuro · la posicion mayor nunca pasa del 50%.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cargar } from "./consultar.mjs";
import { abrir } from "./datos.mjs";
import { CACHE } from "./raiz.mjs";
const D = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const MAG = (f) => f.dentro && f.dte >= 5 && f.ask * 100 >= 10000 && f.hora >= "14:00" && f.vsOI >= 12;
const yr = (y) => [...Array(12)].map((_, i) => y + String(i + 1).padStart(2, "0"));
const ANOS = [["2021", yr("2021")], ["2022", yr("2022")], ["2023", yr("2023")], ["2024", yr("2024")],
              ["2025", yr("2025")], ["2026", ["202601","202602","202603","202604","202605","202606","202607","202608"]]];
const cad = abrir("cadenas", { callado: true });
const FDIR = join(CACHE, "flujo-limpio");
const ms = (d) => Date.parse(d.slice(0,4) + "-" + d.slice(4,6) + "-" + d.slice(6,8) + "T00:00:00Z");
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86400000);
function spotOk(c, hoy) { if (!c) return null; let e0 = null, md = Infinity;
  for (const e of Object.keys(c)) { const d = dteDe(hoy, e); if (d < 1) continue; if (d < md) { md = d; e0 = e; } }
  if (!e0) return null; const g = c[e0]; let K = null, dm = Infinity;
  for (const cl of Object.keys(g)) { if (cl.slice(-1) !== "C") continue;
    const k = Number(cl.slice(0, -2)); const p = g[k + "|P"]; if (!p) continue;
    const d = Math.abs((g[cl][0] + g[cl][1]) / 2 - (p[0] + p[1]) / 2); if (d < dm) { dm = d; K = k; } }
  if (K == null) return null; const C = g[K + "|C"], P = g[K + "|P"];
  const s = K + (C[0] + C[1]) / 2 - (P[0] + P[1]) / 2; return s > 0 ? s : null; }
const SM = new Map();
const spotDe = (tk, d) => { const k = tk + d; if (SM.has(k)) return SM.get(k);
  const s = spotOk(cad.leer(tk, d), d); SM.set(k, s); return s; };
const DOM = new Map();
for (const f of readdirSync(FDIR)) {
  const g = /^([A-Z]+)_d(\d{8})\.json$/.exec(f); if (!g) continue;
  const [, tk, dia] = g; if (dia < "20210101") continue;
  let L; try { L = JSON.parse(readFileSync(join(FDIR, f), "utf8")); } catch { continue; }
  let al = 0, ba = 0, n = 0;
  for (const o of L) {
    if (!(o.ask > 0 && o.bid > 0 && o.prima > 0)) continue;
    const c = o.precio >= o.ask, v = o.precio <= o.bid; if (!c && !v) continue;
    n++; if ((o.l === "C" && c) || (o.l === "P" && v)) al += o.prima; else ba += o.prima; }
  if (n >= 5) DOM.set(tk + "|" + dia, (al - ba) / (al + ba)); }
const dSPY = cad.dias("SPY").filter((d) => d >= "20210101" && d <= "20260819");
const pSPY = new Map(); for (const d of dSPY) { const s = spotDe("SPY", d); if (s > 0) pSPY.set(d, s); }
const DIAS = dSPY.filter((d) => pSPY.has(d));
function salir(f, pc) { const coste = f.ask; let k = 0, ult = null;
  for (const [d, bid] of f.camino) { k++; const m = bid / coste; ult = { mult: m, dSal: d };
    if (m >= 1.50) return { mult: 1.50, dSal: d }; if (m <= 0.50) return { mult: 0.50, dSal: d };
    const s = spotDe(f.tk, d);
    if (s != null) { const mv = f.l === "P" ? (f.spot - s) / f.spot : (s - f.spot) / f.spot;
      if (mv >= pc) return { mult: m, dSal: d }; }
    if (k >= 60) return { mult: m, dSal: d }; }
  return ult; }
function unaPorDia(L) { const g = new Map();
  for (const f of L) { const k = f.tk + f.dC; if (!g.has(k)) g.set(k, []); g.get(k).push(f); }
  return [...g.values()].map((G) => G.reduce((a, b) =>
    (Number(b.exp) > Number(a.exp) || (Number(b.exp) === Number(a.exp) && b.prof < a.prof)) ? b : a
  )).sort((a, b) => a.dC.localeCompare(b.dC)); }
const T = [];
for (const [y, M] of ANOS) { const L = cargar(M).filter(MAG);
  for (const f of L) { const ds = cad.dias(f.tk); const i = ds.indexOf(f.dC);
    if (i < 20) { f.ma20 = null; continue; }
    const p = ds.slice(i - 20, i).map((d) => spotDe(f.tk, d)).filter((x) => x != null);
    f.ma20 = p.length < 15 ? null : f.spot / (p.reduce((a, b) => a + b, 0) / p.length) - 1; }
  for (const f of unaPorDia(L.filter((x) => x.ma20 != null && x.ma20 < 0))) {
    const d = DOM.get(f.tk + "|" + f.dia);
    const acorde = d == null ? 0 : (f.l === "P" ? -1 : 1) * d;
    const confirma = acorde >= 0.3 || (f.golpes >= 2 && f.golpes < 10);
    const s = salir(f, confirma ? 0.08 : 0.12);
    T.push({ ...f, y, confirma, mult: s.mult, dSal: s.dSal }); } }
T.sort((a, b) => a.dC.localeCompare(b.dC));
// ══ LA LENTE DE MICROESTRUCTURA SOBRE LA TABLA MÁGICA ══ Lester, 2026-08-27: "mide la liquidez".
//
// El CLAUDE.md del proyecto dice que la liquidez es la regla de MÁXIMA PRIORIDAD y que hay que
// evaluarla ANTES de interpretar nada. Nunca se le había aplicado a la tabla mágica.
//
// Lo bueno de partida: el backtest YA paga la horquilla — compra al ask, vende al bid.
// Lo que falta saber: (a) cuánto es esa horquilla como % de la PRIMA, (b) si hay alguien al otro
// lado para 1-2 contratos, (c) si hay bid el día de salir, (d) cuánta holgura hay si ejecutas peor.
const pct = (A, p) => { const B = [...A].sort((a, b) => a - b); return B[Math.min(B.length - 1, Math.floor(p * B.length))]; };
console.log("");
console.log("  ══ AUDIT ══");
console.log("  señales de la tabla mágica: " + T.length + "  ·  con bid y ask en el día de compra: " +
  T.filter((x) => x.bid > 0 && x.ask > 0).length);
console.log("  el backtest compra al ASK y vende al BID: " +
  (T.every((x) => x.ask >= x.bid) ? "confirmado, ask ≥ bid en las " + T.length + " ✓" : "⚠"));
console.log("  el camino trae [día, bid, ask]: " + (T[0].camino[0].length === 3 ? "sí ✓" : "⚠ sólo " + T[0].camino[0].length + " campos"));
// ── (a) la horquilla de ENTRADA, como % de la prima ──
const hE = T.map((x) => (x.ask - x.bid) / x.ask);
console.log("");
console.log("  ══ (a) LA HORQUILLA COMO % DE LA PRIMA — el día que compras ══");
console.log("");
console.log("  mejor 10%: " + (100 * pct(hE, 0.10)).toFixed(1) + "%   ·   MEDIANA: " + (100 * pct(hE, 0.50)).toFixed(1) +
  "%   ·   peor 10%: " + (100 * pct(hE, 0.90)).toFixed(1) + "%   ·   la peor: " + (100 * Math.max(...hE)).toFixed(1) + "%");
console.log("  en dólares sobre el contrato mediano ($16,905): " + D(16905 * pct(hE, 0.50)) + " de mediana");
// ── (b) la horquilla de SALIDA ──
const hS = [], sinBid = [];
for (const x of T) { const p = x.camino.find((c) => c[0] === x.dSal) || x.camino[x.camino.length - 1];
  if (!p) continue; const [d, b, a] = p;
  if (!(b > 0)) { sinBid.push(x.tk + " " + x.dC); continue; }
  hS.push((a - b) / a); }
console.log("");
console.log("  ══ (b) LA HORQUILLA EL DÍA QUE VENDES ══");
console.log("");
console.log("  mejor 10%: " + (100 * pct(hS, 0.10)).toFixed(1) + "%   ·   MEDIANA: " + (100 * pct(hS, 0.50)).toFixed(1) +
  "%   ·   peor 10%: " + (100 * pct(hS, 0.90)).toFixed(1) + "%   ·   la peor: " + (100 * Math.max(...hS)).toFixed(1) + "%");
console.log("  operaciones SIN BID el día de salir: " + sinBid.length + " de " + T.length +
  (sinBid.length === 0 ? "   ✓ siempre hay a quién vender" : "   ⚠️ " + sinBid.slice(0, 5).join(", ")));
let ceros = 0, dias = 0;
for (const x of T) for (const [d, b] of x.camino) { dias++; if (!(b > 0)) ceros++; }
console.log("  días SIN BID en todo el camino: " + ceros + " de " + dias + " (" + (100 * ceros / dias).toFixed(2) + "%)");
// ── (c) ¿hay alguien al otro lado? el golpe vs lo que compramos ──
console.log("");
console.log("  ══ (c) ¿HAY ALGUIEN AL OTRO LADO? ══");
console.log("");
console.log("  El golpe que dispara la señal ya se ejecutó — su tamaño dice cuánto absorbe la cadena.");
const tam = T.map((x) => x.tam).filter((t) => t > 0);
console.log("  contratos del golpe:  mínimo " + Math.min(...tam) + "  ·  mediana " + pct(tam, 0.50) +
  "  ·  máximo " + Math.max(...tam));
for (const cap of [60000, 300000]) {
  let peorRatio = Infinity, casos = 0;
  for (const x of T) { const tope = cap * 0.25 * (x.confirma ? 2 : 1);
    const n = Math.floor(tope / (x.ask * 100)); if (n < 1) continue; casos++;
    const r = n / x.tam; if (r > 0 && r < Infinity && r > 0) peorRatio = Math.min(peorRatio, 1 / r); }
  const nn = T.map((x) => Math.floor(cap * 0.25 * (x.confirma ? 2 : 1) / (x.ask * 100))).filter((n) => n >= 1);
  const rat = T.map((x) => { const n = Math.floor(cap * 0.25 * (x.confirma ? 2 : 1) / (x.ask * 100));
    return n >= 1 && x.tam > 0 ? n / x.tam : null; }).filter((r) => r != null);
  console.log("  con " + D(cap) + ": compras de " + Math.min(...nn) + " a " + Math.max(...nn) + " contratos" +
    "   ·   eres el " + (100 * pct(rat, 0.50)).toFixed(0) + "% del golpe (mediana), el " +
    (100 * Math.max(...rat)).toFixed(0) + "% en el peor caso");
}
// ── (d) EL ESTRÉS: ¿cuánta holgura hay? ──
function salirK(f, pc, k) {
  const h = f.ask - f.bid;
  const coste = f.ask + k * h;                       // compras PEOR que el ask
  let n = 0, ult = null;
  for (const [d, b, a] of f.camino) { n++;
    const venta = Math.max(0.01, b - k * (a - b));    // vendes PEOR que el bid
    const m = venta / coste; ult = { mult: m, dSal: d };
    if (m >= 1.50) return { mult: 1.50, dSal: d };
    if (m <= 0.50) return { mult: 0.50, dSal: d };
    const s = spotDe(f.tk, d);
    if (s != null) { const mv = f.l === "P" ? (f.spot - s) / f.spot : (s - f.spot) / f.spot;
      if (mv >= pc) return { mult: m, dSal: d }; }
    if (n >= 60) return { mult: m, dSal: d }; }
  return ult; }
function simular(k, cap, tipo = 0.033) {
  const L = T.map((x) => { const s = salirK(x, x.confirma ? 0.08 : 0.12, k); return { ...x, mult: s.mult, dSal: s.dSal }; })
             .sort((a, b) => a.dC.localeCompare(b.dC));
  const intD = Math.pow(1 + tipo, 1 / 252) - 1;
  let caja = cap, ab = [], pico = cap, peor = 0, nOps = 0;
  const porDia = new Map();
  for (const x of L) { if (!porDia.has(x.dC)) porDia.set(x.dC, []); porDia.get(x.dC).push(x); }
  for (const hoy of DIAS) {
    caja *= (1 + intD);
    for (let i = ab.length - 1; i >= 0; i--) if (ab[i].dSal <= hoy) { caja += ab[i].dinero * ab[i].mult; ab.splice(i, 1); }
    const inv = () => ab.reduce((a, b) => a + b.dinero, 0);
    for (const x of (porDia.get(hoy) || [])) {
      if (ab.length >= 4) continue;
      const tope = (caja + inv()) * 0.25 * (x.confirma ? 2 : 1);
      const n = Math.floor(Math.min(tope, caja) / ((x.ask + k * (x.ask - x.bid)) * 100));
      if (n < 1) continue;
      const dinero = n * (x.ask + k * (x.ask - x.bid)) * 100;
      caja -= dinero; ab.push({ ...x, dinero }); nOps++; }
    const v = caja + inv();
    if (v > pico) pico = v; const dd = 1 - v / pico; if (dd > peor) peor = dd; }
  let fin = caja; for (const x of ab) fin += x.dinero * x.mult;
  return { final: fin, caida: 100 * peor, nOps }; }
const an = (f, c) => 100 * (Math.pow(Math.max(f, 1) / c, 1 / 5.63) - 1);
const med = (A) => { const B = [...A].sort((a, b) => a - b); return B[Math.floor(B.length / 2)]; };
console.log("");
console.log("  ══ (d) EL ESTRÉS — ¿y si ejecutas PEOR que el ask/bid? ══");
console.log("");
console.log("  k = cuántas horquillas EXTRA pagas, a la entrada Y a la salida.");
console.log("  (mediana de 21 capitales de partida, versión EN LIMPIO con Gold)");
console.log("");
console.log("  " + "k".padEnd(8) + "qué significa".padEnd(34) + "tu cuenta".padStart(18) + "la grande".padStart(18));
for (const [k, nom] of [[0, "el backtest actual (ask/bid)"], [0.25, "1/4 de horquilla peor cada lado"],
                        [0.5, "media horquilla peor cada lado"], [1.0, "una horquilla ENTERA peor"],
                        [2.0, "el doble de horquilla (catástrofe)"]]) {
  const cel = [60000, 300000].map((cap) => { const A = [], C = [], paso = cap * 0.0083;
    for (let c = cap * 0.917; c <= cap * 1.084; c += paso) { const q = simular(k, c); A.push(an(q.final, c)); C.push(q.caida); }
    return (med(A).toFixed(1) + "%  −" + med(C).toFixed(0) + "%").padStart(18); });
  console.log("  " + String(k).padEnd(8) + nom.padEnd(34) + cel.join("")); }
console.log("");
