// LAS CUATRO IDEAS QUE SE PUEDEN PROBAR HOY.
//
// Lester (2026-08-27): *"haz todas las pruebas de tus ideas para mejorar la tabla magica...
// recuerda que algunos resultados pueden ser candidatos para aumentar el tamaño de la posicion"*.
//
//   1. MAS HUECOS con SPY por defecto (topamos en 4 porque el efectivo dormia)
//   3. LA TENDENCIA DEL INDICE, no la del ticker — como filtro Y como tamaño
//   4. AÑADIR a la posicion cuando el mismo ticker vuelve a dar señal
//   5. ESTIRAR LA SALIDA (12% en vez de 8%) cuando la dominancia confirma
//
//   2. EARNINGS — BLOQUEADA. No hay fechas reales en disco; lib/earnings.ts las ESTIMA por
//      cadencia de ~91 dias y eso es un numero inventado en el camino del dinero. No se hace.
//
// CADA IDEA SE PRUEBA COMO FILTRO Y COMO TAMAÑO. Un factor que sube el acierto pero recorta
// señales no es un filtro: es un multiplicador. (Leccion de la dominancia.)
//
// BASE: media 20d · una por dia (venc. mas lejano) · salida 8% · hora >= 14:00 ·
//       25% por posicion, 50% si dominancia o repeticion confirman · 4 huecos · SPY por defecto.
// AUDIT DENTRO, antes de enseñar.
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
// ── la media de 20 dias de SPY, para la idea 3 ──
const dSPY = cad.dias("SPY").filter((d) => d >= "20201101" && d <= "20260819");
const pSPY = new Map(); for (const d of dSPY) { const s = spotDe("SPY", d); if (s > 0) pSPY.set(d, s); }
const DIAS = dSPY.filter((d) => pSPY.has(d) && d >= "20210101");
const maSPY = new Map();
{ const ds = dSPY.filter((d) => pSPY.has(d));
  for (let i = 20; i < ds.length; i++) {
    const v = ds.slice(i - 20, i).map((d) => pSPY.get(d));
    maSPY.set(ds[i], pSPY.get(ds[i]) / (v.reduce((a, b) => a + b, 0) / v.length) - 1); } }
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
    const mSPY = maSPY.get(f.dC);
    T.push({ ...f, y, acorde,
      confirma: acorde >= 0.3 || (f.golpes >= 2 && f.golpes < 10),
      // ¿el INDICE va en el mismo sentido que la señal?
      spyAcorde: mSPY == null ? null : (f.l === "P" ? -1 : 1) * mSPY,
      sal8: salir(f, 0.08), sal12: salir(f, 0.12) }); } }
T.sort((a, b) => a.dC.localeCompare(b.dC));
/** Cuenta con SPY por defecto. `añadir` = una 2ª señal del mismo ticker no consume hueco. */
function cuenta({ L = T, capital = 60000, huecos = 4, mult, salida = (x) => x.sal8, filtro = () => true, añadir = false }) {
  let caja = capital, acc = 0, ab = [], tomadas = [], pico = capital, peor = 0;
  const porDia = new Map();
  for (const x of L) { if (!filtro(x)) continue;
    const s = salida(x); const y = { ...x, mult: s.mult, dSal: s.dSal };
    if (!porDia.has(x.dC)) porDia.set(x.dC, []); porDia.get(x.dC).push(y); }
  for (const hoy of DIAS) {
    const px = pSPY.get(hoy);
    for (let i = ab.length - 1; i >= 0; i--) if (ab[i].dSal <= hoy) { caja += ab[i].dinero * ab[i].mult; ab.splice(i, 1); }
    const inv = () => ab.reduce((a, b) => a + b.dinero, 0);
    for (const x of (porDia.get(hoy) || [])) {
      const yaLoTengo = ab.some((a) => a.tk === x.tk);
      const usaHueco = !(añadir && yaLoTengo);
      if (usaHueco && ab.length >= huecos) continue;
      const patr = caja + acc * px + inv();
      const tope = patr * (1 / huecos) * 4 * 0.25 * mult(x);   // base = 1/huecos del patrimonio × el multiplicador
      const falta = Math.min(tope, patr) - caja;
      if (falta > 0 && acc > 0) { const v = Math.min(acc, falta / px); acc -= v; caja += v * px; }
      const n = Math.floor(Math.min(tope, caja) / (x.ask * 100));
      if (n < 1) continue;
      const dinero = n * x.ask * 100;
      caja -= dinero; ab.push({ ...x, dinero, n }); tomadas.push({ ...x, dinero, n }); }
    if (caja > 0) { acc += caja / px; caja = 0; }
    const v = caja + acc * px + ab.reduce((a, b) => a + b.dinero, 0);
    if (v > pico) pico = v; const dd = 1 - v / pico; if (dd > peor) peor = dd; }
  const px = pSPY.get(DIAS[DIAS.length - 1]);
  for (const x of ab) caja += x.dinero * x.mult;
  return { final: caja + acc * px, tomadas, caida: 100 * peor }; }
const anual = (f, c = 60000) => 100 * (Math.pow(Math.max(f, 1) / c, 1 / 5.63) - 1);
const CONF = (x) => x.confirma ? 2 : 1;
console.log("");
console.log("  ══ AUDIT ══");
const ctrl = cuenta({ L: [], mult: CONF });
const spySolo = 60000 * pSPY.get(DIAS[DIAS.length - 1]) / pSPY.get(DIAS[0]);
console.log("  CONTROL sin señales = SPY exacto: " + D(ctrl.final) + " vs " + D(spySolo) +
  (Math.abs(ctrl.final - spySolo) < 5 ? "  ✓" : "  ⚠"));
const base = cuenta({ mult: CONF });
const suma = base.tomadas.reduce((a, x) => a + x.dinero * (x.mult - 1), 0);
console.log("  la BASE: " + D(base.final) + " · " + anual(base.final).toFixed(1) + "% · caída −" + base.caida.toFixed(0) + "%" +
  " · " + base.tomadas.length + " ops");
console.log("  señales: " + T.length + " · confirman " + T.filter((x) => x.confirma).length +
  " · con media de SPY " + T.filter((x) => x.spyAcorde != null).length);
console.log("  ¿mira al futuro? " + (T.every((x) => x.dia < x.dC) ? "NO ✓" : "⚠"));
function fila(nom, op) {
  const q = cuenta({ mult: CONF, ...op });
  console.log("  " + nom.padEnd(40) + D(q.final).padStart(13) + (anual(q.final).toFixed(1) + "%").padStart(9) +
    ("−" + q.caida.toFixed(0) + "%").padStart(8) + String(q.tomadas.length).padStart(6));
}
const cab = (t) => { console.log(""); console.log("  ══ " + t + " ══"); console.log("");
  console.log("  " + "".padEnd(40) + "acaba con".padStart(13) + "al año".padStart(9) + "caída".padStart(8) + "ops".padStart(6)); };
cab("IDEA 1 — MÁS HUECOS");
fila("4 huecos (la base)", { huecos: 4 });
for (const h of [6, 8, 10, 12]) fila(h + " huecos", { huecos: h });
cab("IDEA 3 — LA TENDENCIA DEL ÍNDICE");
fila("sin mirar el índice (la base)", {});
fila("FILTRO: sólo si SPY va con la señal", { filtro: (x) => x.spyAcorde != null && x.spyAcorde > 0 });
fila("FILTRO: sólo si SPY va en contra", { filtro: (x) => x.spyAcorde != null && x.spyAcorde < 0 });
fila("TAMAÑO: x2 si SPY va con la señal", { mult: (x) => (x.spyAcorde != null && x.spyAcorde > 0) ? 2 : 1 });
fila("TAMAÑO: x2 si confirma O SPY acompaña", { mult: (x) => (x.confirma || (x.spyAcorde != null && x.spyAcorde > 0)) ? 2 : 1 });
fila("TAMAÑO: x2 sólo si confirma Y SPY", { mult: (x) => (x.confirma && x.spyAcorde != null && x.spyAcorde > 0) ? 2 : 1 });
cab("IDEA 4 — AÑADIR EN LA SEGUNDA SEÑAL DEL MISMO TICKER");
fila("la 2ª consume hueco (la base)", { añadir: false });
fila("la 2ª NO consume hueco", { añadir: true });
fila("la 2ª no consume hueco · 8 huecos", { añadir: true, huecos: 8 });
cab("IDEA 5 — ESTIRAR LA SALIDA CUANDO CONFIRMA");
fila("salida al 8% siempre (la base)", { salida: (x) => x.sal8 });
fila("salida al 12% siempre", { salida: (x) => x.sal12 });
fila("12% si confirma, 8% si no", { salida: (x) => x.confirma ? x.sal12 : x.sal8 });
fila("8% si confirma, 12% si no", { salida: (x) => x.confirma ? x.sal8 : x.sal12 });
console.log("");
console.log("  el listón: $60.000 en SPY → " + D(spySolo) + " (" + anual(spySolo).toFixed(1) + "%)");
console.log("");

// ══════════ VALIDAR LA IDEA 5 INVERTIDA — mitades, tercios y fuera de muestra por ticker ══════════
console.log("");
console.log("  ══ VALIDAR «8% si confirma, 12% si no» ══");
console.log("");
const SAL_BASE = (x) => x.sal8;
const SAL_INV = (x) => x.confirma ? x.sal8 : x.sal12;
// 1) por señal, sin cuenta: el ratio no se puede falsear con el tope de posicion
function ratio(L, salida) {
  let g = 0, p = 0, gana = 0;
  for (const x of L) { const s = salida(x); const d = (s.mult - 1) * x.ask * 100;
    if (d > 0) { g += d; gana++; } else p += -d; }
  return { n: L.length, gana, r: p ? g / p : Infinity, neto: g - p }; }
console.log("  RATIO POR SEÑAL (sin tope de posicion):");
console.log("  " + "".padEnd(28) + "n".padStart(5) + "ganan".padStart(8) + "ratio".padStart(8) + "neto".padStart(13));
for (const [nom, s] of [["8% siempre", SAL_BASE], ["8% si confirma / 12% si no", SAL_INV]]) {
  const r = ratio(T, s);
  console.log("  " + nom.padEnd(28) + String(r.n).padStart(5) + ((100 * r.gana / r.n).toFixed(0) + "%").padStart(8) +
    r.r.toFixed(2).padStart(8) + D(r.neto).padStart(13)); }
// 2) mitades y tercios
console.log("");
console.log("  MITADES Y TERCIOS (ratio por señal):");
const mit = Math.floor(T.length / 2), t3 = Math.floor(T.length / 3);
console.log("  " + "".padEnd(28) + "1a mitad".padStart(11) + "2a mitad".padStart(11) +
  "tercio1".padStart(10) + "tercio2".padStart(10) + "tercio3".padStart(10));
for (const [nom, s] of [["8% siempre", SAL_BASE], ["8% si confirma / 12% si no", SAL_INV]]) {
  const g = [T.slice(0, mit), T.slice(mit), T.slice(0, t3), T.slice(t3, 2 * t3), T.slice(2 * t3)];
  console.log("  " + nom.padEnd(28) + g.map((G) => { const r = ratio(G, s);
    return (r.r === Infinity ? "∞" : r.r.toFixed(2)).padStart(g.indexOf(G) < 2 ? 11 : 10); }).join("")); }
// 3) fuera de muestra: las 35 particiones de tickers
console.log("");
console.log("  FUERA DE MUESTRA — las 35 particiones de 8 tickers en 4 y 4:");
const TKS = ["AAPL", "AMD", "META", "MSFT", "NVDA", "QQQ", "SPY", "TSLA"];
const parts = [];
for (let m = 0; m < 256; m++) { let c = 0; for (let b = 0; b < 8; b++) if (m & (1 << b)) c++;
  if (c === 4 && (m & 1)) parts.push(m); }
const dif = [];
let gBase = 0, gInv = 0;
for (const m of parts) {
  const B = new Set(TKS.filter((_, i) => !(m & (1 << i))));
  const L = T.filter((x) => B.has(x.tk)); if (L.length < 8) continue;
  const a = anual(cuenta({ L, mult: CONF, salida: SAL_BASE }).final);
  const b = anual(cuenta({ L, mult: CONF, salida: SAL_INV }).final);
  dif.push(b - a); if (b > a) gInv++; else if (a > b) gBase++; }
dif.sort((a, b) => a - b);
console.log("  la inversa gana en " + gInv + " particiones · la base en " + gBase + "  (de " + (gInv + gBase) + ")");
console.log("  diferencia: mediana " + (dif[Math.floor(dif.length / 2)] >= 0 ? "+" : "") +
  dif[Math.floor(dif.length / 2)].toFixed(1) + " pts  ·  peor " + dif[0].toFixed(1) +
  "  ·  mejor +" + dif[dif.length - 1].toFixed(1));
// 4) meseta: ¿aguanta si muevo el 12%?
console.log("");
console.log("  ¿ES MESETA? — «8% si confirma, X% si no»:");
console.log("  " + "".padEnd(20) + "al año".padStart(9) + "  (la base, 8% siempre: " + anual(cuenta({ mult: CONF }).final).toFixed(1) + "%)");
for (const pc of [0.10, 0.12, 0.15, 0.20]) {
  const salX = { }; for (const x of T) salX[x.tk + x.dC + x.K] = salir(x, pc);
  const q = cuenta({ mult: CONF, salida: (x) => x.confirma ? x.sal8 : salX[x.tk + x.dC + x.K] });
  console.log("  " + ("8% / " + (100 * pc).toFixed(0) + "%").padEnd(20) + (anual(q.final).toFixed(1) + "%").padStart(9)); }
console.log("");
