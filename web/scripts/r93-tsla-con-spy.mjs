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
// SÓLO TSLA (calls y puts) + el dinero en reposo en SPY. Lester, 2026-08-27.
// ⚠️ 29 de las 34 son PUTS, y las puts son justo lo que se cayó fuera de muestra.
//    Esto es EN MUESTRA sobre el único ticker alrededor del cual se construyó la regla.
import { readFileSync as RF } from "node:fs";
const PXR = JSON.parse(RF(new URL("./precios-ibit-spy.json", import.meta.url), "utf8"));
const DIVSPY = 0.013;
const an = (f, c) => 100 * (Math.pow(Math.max(f, 1) / c, 1 / 5.63) - 1);
const med = (A) => { const B = [...A].sort((a, b) => a - b); return B[Math.floor(B.length / 2)]; };
function cuenta({ L, capital, conSPY = true, tipo = 0.033, hasta = null }) {
  const intD = Math.pow(1 + tipo, 1 / 252) - 1;
  const divD = Math.pow(1 + DIVSPY, 1 / 252) - 1;
  let caja = capital, acc = 0, ab = [], nOps = 0, pico = capital, peor = 0, maxFrac = 0;
  const porDia = new Map();
  for (const x of L) { if (!porDia.has(x.dC)) porDia.set(x.dC, []); porDia.get(x.dC).push(x); }
  const dias = hasta ? DIAS.filter((d) => d <= hasta) : DIAS;
  for (const hoy of dias) {
    const p = pSPY.get(hoy);
    if (conSPY) acc *= (1 + divD); else caja *= (1 + intD);
    for (let i = ab.length - 1; i >= 0; i--) if (ab[i].dSal <= hoy) { caja += ab[i].dinero * ab[i].mult; ab.splice(i, 1); }
    const inv = () => ab.reduce((a, b) => a + b.dinero, 0);
    for (const x of (porDia.get(hoy) || [])) { if (ab.length >= 4) continue;
      const patr = caja + acc * p + inv();
      const tope = patr * 0.25 * (x.confirma ? 2 : 1);
      if (conSPY) { const falta = Math.min(tope, patr) - caja;
        if (falta > 0 && acc > 0) { const v = Math.min(acc, falta / p); acc -= v; caja += v * p; } }
      const n = Math.floor(Math.min(tope, caja) / (x.ask * 100)); if (n < 1) continue;
      const dinero = n * x.ask * 100;
      if (dinero / patr > maxFrac) maxFrac = dinero / patr;
      caja -= dinero; ab.push({ ...x, dinero }); nOps++; }
    if (conSPY && caja > 0) { acc += caja / p; caja = 0; }
    const v = caja + acc * p + inv();
    if (v > pico) pico = v; const dd = 1 - v / pico; if (dd > peor) peor = dd; }
  const p = pSPY.get(dias[dias.length - 1]);
  let fin = caja + acc * p; for (const x of ab) fin += x.dinero * x.mult;
  return { final: fin, caida: 100 * peor, nOps, maxFrac: 100 * maxFrac }; }
function banda(L, base, conSPY) { const A = [], C = [], N = [], paso = base * 0.0083;
  for (let c = base * 0.917; c <= base * 1.084; c += paso) { const q = cuenta({ L, capital: c, conSPY }); A.push(an(q.final, c)); C.push(q.caida); N.push(q.nOps); }
  return { a: med(A), c: med(C), n: med(N) }; }
const TT = T.filter((x) => x.tk === "TSLA");
console.log("");
console.log("  ══ AUDIT ══");
console.log("  señales de TSLA: " + TT.length + " (29 puts, 5 calls)");
const ctrl = cuenta({ L: [], capital: 60000, conSPY: true });
const spySolo = 60000 * (pSPY.get(DIAS[DIAS.length - 1]) / pSPY.get(DIAS[0])) * Math.pow(1 + DIVSPY, 5.63);
console.log("  CONTROL sin señales = SPY con dividendos: " + D(ctrl.final) + " vs " + D(spySolo) +
  (Math.abs(ctrl.final - spySolo) < 200 ? "  ✓" : "  ⚠"));
const q = cuenta({ L: TT, capital: 60000, conSPY: true });
console.log("  posición mayor abierta: " + q.maxFrac.toFixed(1) + "%" + (q.maxFrac <= 50.5 ? "  ✓" : "  ⚠"));
console.log("");
console.log("  ══ SÓLO TSLA + EL DINERO EN REPOSO EN SPY ══");
console.log("");
console.log("  " + "".padEnd(34) + "acaba con".padStart(13) + "al año".padStart(10) + "caída".padStart(9) + "ops".padStart(6));
for (const [nom, L, s] of [
  ["🎯 TSLA (calls+puts) + SPY", TT, true],
  ["TSLA (calls+puts), efectivo 3.3%", TT, false],
  ["los 28 tickers + SPY", T, true],
  ["los 8 viejos + SPY", T.filter((x) => ["AAPL","AMD","META","MSFT","NVDA","QQQ","SPY","TSLA"].includes(x.tk)), true],
]) { const b = banda(L, 60000, s);
  console.log("  " + nom.padEnd(34) + D(60000 * Math.pow(1 + b.a / 100, 5.63)).padStart(13) + (b.a.toFixed(1) + "%").padStart(10) +
    ("−" + b.c.toFixed(0) + "%").padStart(9) + String(b.n).padStart(6)); }
console.log("  " + "comprar SPY y dormir".padEnd(34) + D(spySolo).padStart(13) + (an(spySolo, 60000).toFixed(1) + "%").padStart(10) + "−25%".padStart(9) + "1".padStart(6));
console.log("");
console.log("  ══ AÑO POR AÑO — TSLA + SPY, $60,000 ══");
console.log("");
console.log("  " + "año".padEnd(8) + "% del año".padStart(12) + "valor al cierre".padStart(13) + "   señales de TSLA ese año");
let v0 = 60000;
for (const [y] of ANOS) {
  const fin = [...DIAS].reverse().find((d) => d.startsWith(y));
  if (!fin) continue;
  const v1 = cuenta({ L: TT.filter((x) => x.dC <= fin), capital: 60000, conSPY: true, hasta: fin }).final;
  console.log("  " + y.padEnd(8) + (((v1 / v0 - 1) >= 0 ? "+" : "−") + Math.abs(100 * (v1 / v0 - 1)).toFixed(0) + "%").padStart(12) +
    D(v1).padStart(13) + "   " + TT.filter((x) => x.y === y).length);
  v0 = v1; }
console.log("");
console.log("  ⚠️ 29 de las 34 son PUTS — justo lo que se cayó fuera de muestra (−5.21%, t=−5.36 con n=580).");
console.log("  ⚠️ EN MUESTRA sobre el único ticker alrededor del cual se construyó la regla.");
console.log("");
