// ══════ EL EXAMEN ══════ Lester, 2026-08-27:
//   «corre la regla exactamente como está, sin tocar nada, sólo sobre los 20 nuevos».
//
// LA REGLA, SIN TOCAR NADA:
//   señal   golpe >$500k al ask · 12x el OI de la víspera · DENTRO del dinero · >=$10.000 ·
//           >=5 días a vencer · después de las 14:00
//   filtro  la acción por debajo de su media de 20 días
//   cuál    UNA por ticker-día: la del vencimiento más lejano (empate → la más cerca del dinero)
//   compra  el día siguiente, al ask
//   salida  8% de movimiento SI la cinta confirma · 12% si NO · tope 60 días · +50%/−50%
//   tamaño  25% del capital · 50% si confirma · 4 huecos · efectivo al 3.3%
//   confirma = dominancia >= 0.3 O entre 2 y 9 golpes
//
// ⚠️ CERO AJUSTE. Los 20 tickers nunca los ha visto la regla. Este tiro sólo se da UNA vez.
//
// CRITERIOS ESCRITOS ANTES DE VER EL RESULTADO:
//   t > 2 y positivo           → real y no es TSLA → forward-test
//   positivo con t entre 1 y 2 → plausible, insuficiente → más tickers
//   t < 1 o negativo           → era TSLA y 2026 → replantear qué mide la señal
//   cero señales               → el listón de $500k no se traduce a nombres menos activos →
//                                escalarlo por tamaño del ticker (respuesta distinta, no entierro)
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { cargar } from "./consultar.mjs";
import { abrir } from "./datos.mjs";
import { CACHE } from "./raiz.mjs";
const D = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const VIEJOS = ["AAPL","AMD","META","MSFT","NVDA","QQQ","SPY","TSLA"];
const NUEVOS = ["BA","JPM","INTC","F","BAC","DIS","XOM","GE","PYPL","COST","CRM","ORCL","WMT","T","PFE","KO","CSCO","NKE","UNH","WBA"];
const MAG = (f) => f.dentro && f.dte >= 5 && f.ask * 100 >= 10000 && f.hora >= "14:00" && f.vsOI >= 12;
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
  for (const o of L) { if (!(o.ask > 0 && o.bid > 0 && o.prima > 0)) continue;
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
function construir(TK, TODO) {
  const base = TODO.filter((f) => TK.includes(f.tk)).filter(MAG);
  for (const f of base) { const ds = cad.dias(f.tk); const i = ds.indexOf(f.dC);
    if (i < 20) { f.ma20 = null; continue; }
    const p = ds.slice(i - 20, i).map((d) => spotDe(f.tk, d)).filter((x) => x != null);
    f.ma20 = p.length < 15 ? null : f.spot / (p.reduce((a, b) => a + b, 0) / p.length) - 1; }
  const out = [];
  for (const f of unaPorDia(base.filter((x) => x.ma20 != null && x.ma20 < 0))) {
    const d = DOM.get(f.tk + "|" + f.dia);
    const acorde = d == null ? 0 : (f.l === "P" ? -1 : 1) * d;
    const confirma = acorde >= 0.3 || (f.golpes >= 2 && f.golpes < 10);
    const s = salir(f, confirma ? 0.08 : 0.12);
    out.push({ ...f, y: f.dC.slice(0, 4), confirma, mult: s.mult, dSal: s.dSal }); }
  return { base, out: out.sort((a, b) => a.dC.localeCompare(b.dC)) }; }
const media = (A) => A.reduce((s, x) => s + x, 0) / A.length;
function stats(L) { if (!L || L.length < 3) return null;
  const m = L.map((x) => x.mult); const r = media(m) - 1;
  const sd = Math.sqrt(m.reduce((s, x) => s + (x - 1 - r) ** 2, 0) / (m.length - 1));
  return { n: m.length, ret: 100 * r, gana: 100 * m.filter((x) => x > 1).length / m.length, t: r / (sd / Math.sqrt(m.length)) }; }
function cuenta({ L, capital, tipo = 0.033 }) {
  const intD = Math.pow(1 + tipo, 1 / 252) - 1;
  let caja = capital, ab = [], nOps = 0, pico = capital, peor = 0;
  const porDia = new Map();
  for (const x of L) { if (!porDia.has(x.dC)) porDia.set(x.dC, []); porDia.get(x.dC).push(x); }
  for (const hoy of DIAS) { caja *= (1 + intD);
    for (let i = ab.length - 1; i >= 0; i--) if (ab[i].dSal <= hoy) { caja += ab[i].dinero * ab[i].mult; ab.splice(i, 1); }
    const inv = () => ab.reduce((a, b) => a + b.dinero, 0);
    for (const x of (porDia.get(hoy) || [])) { if (ab.length >= 4) continue;
      const tope = (caja + inv()) * 0.25 * (x.confirma ? 2 : 1);
      const n = Math.floor(Math.min(tope, caja) / (x.ask * 100)); if (n < 1) continue;
      caja -= n * x.ask * 100; ab.push({ ...x, dinero: n * x.ask * 100 }); nOps++; }
    const v = caja + inv(); if (v > pico) pico = v; const dd = 1 - v / pico; if (dd > peor) peor = dd; }
  let fin = caja; for (const x of ab) fin += x.dinero * x.mult;
  return { final: fin, caida: 100 * peor, nOps }; }
const an = (f, c) => 100 * (Math.pow(Math.max(f, 1) / c, 1 / 5.63) - 1);
const med = (A) => { const B = [...A].sort((a, b) => a - b); return B[Math.floor(B.length / 2)]; };
function banda(L, base) { const A = [], C = [], paso = base * 0.0083;
  for (let c = base * 0.917; c <= base * 1.084; c += paso) { const q = cuenta({ L, capital: c }); A.push(an(q.final, c)); C.push(q.caida); }
  return { a: med(A), c: med(C) }; }

const TODO = cargar();
const enMaestra = [...new Set(TODO.map((x) => x.tk))].sort();
console.log("");
console.log("  ══ AUDIT — ¿la reconstrucción cambió algo de los 8 viejos? ══");
console.log("  tickers en la maestra: " + enMaestra.length + "  ·  filas: " + TODO.length.toLocaleString("en-US"));
console.log("  de los 20 nuevos, presentes: " + NUEVOS.filter((t) => enMaestra.includes(t)).length + " de 20");
const V = construir(VIEJOS, TODO);
const clave = V.base.map((x) => [x.tk, x.dia, x.dC, x.exp, x.K, x.l, x.ask, x.bid, x.camino.length].join("|")).sort();
const h = createHash("sha256").update(clave.join("\n")).digest("hex").slice(0, 32);
console.log("  candidatas de los 8 viejos: " + V.base.length + " (esperado 299)" + (V.base.length === 299 ? "  ✓" : "  ⚠"));
console.log("  huella: " + h + (h === "97692904510b328696bd3a6e0d3dec89" ? "   ✓ IDÉNTICA a antes de reconstruir" : "   ⚠️ CAMBIÓ"));
if (existsSync("_huella-8.txt")) { const A = new Set(readFileSync("_huella-8.txt", "utf8").split("\n")), B = new Set(clave);
  console.log("  filas que aparecieron: " + [...B].filter((x) => !A.has(x)).length + "  ·  que desaparecieron: " + [...A].filter((x) => !B.has(x)).length); }
const sV = stats(V.out);
console.log("  señales de la tabla mágica en los 8: " + V.out.length + " (esperado 81)" + (V.out.length === 81 ? "  ✓" : "  ⚠"));
console.log("  a peso igual: " + sV.ret.toFixed(2) + "% · acierta " + sV.gana.toFixed(0) + "% · t=" + sV.t.toFixed(2) + "   (esperado 7.44 / 69 / 3.03)");
console.log("  ¿mira al futuro? " + (V.out.every((x) => x.dia < x.dC) ? "NO ✓" : "⚠ SÍ"));

const N = construir(NUEVOS, TODO);
console.log("");
console.log("  ══════════════ EL EXAMEN — LOS 20 TICKERS NUEVOS ══════════════");
console.log("");
console.log("  candidatas que pasan el filtro base: " + N.base.length);
console.log("  señales de la tabla mágica: " + N.out.length);
if (!stats(N.out)) {
  console.log("");
  console.log("  ⛔ SIN MUESTRA SUFICIENTE. Criterio escrito antes de correr: no es «no funciona»,");
  console.log("     es que el listón de $500,000 no se traduce a nombres menos activos.");
  console.log("     Toca escalarlo por tamaño del ticker.");
  console.log("");
  process.exit(0);
}
const sN = stats(N.out), sT = stats([...V.out, ...N.out]);
console.log("");
console.log("  ══ EL VEREDICTO, A PESO IGUAL ══");
console.log("");
console.log("  " + "".padEnd(28) + "n".padStart(6) + "% por operación".padStart(17) + "acierta".padStart(9) + "t".padStart(8));
console.log("  " + "los 8 VIEJOS (en muestra)".padEnd(28) + String(sV.n).padStart(6) + (sV.ret.toFixed(2) + "%").padStart(17) + (sV.gana.toFixed(0) + "%").padStart(9) + sV.t.toFixed(2).padStart(8));
console.log("  " + "🎯 los 20 NUEVOS (examen)".padEnd(28) + String(sN.n).padStart(6) + (sN.ret.toFixed(2) + "%").padStart(17) + (sN.gana.toFixed(0) + "%").padStart(9) + sN.t.toFixed(2).padStart(8));
console.log("  " + "los 28 juntos".padEnd(28) + String(sT.n).padStart(6) + (sT.ret.toFixed(2) + "%").padStart(17) + (sT.gana.toFixed(0) + "%").padStart(9) + sT.t.toFixed(2).padStart(8));
console.log("");
console.log("  → " + (sN.t > 2 && sN.ret > 0 ? "✅ PASA — t>2 y positivo. El efecto no es TSLA."
  : sN.ret > 0 && sN.t >= 1 ? "🟡 PLAUSIBLE pero insuficiente — hacen falta más tickers."
  : "🔴 NO PASA — el efecto vivía en TSLA y en 2026."));
console.log("");
console.log("  ══ POR TICKER (los 20 nuevos) ══");
console.log("");
console.log("  " + "ticker".padEnd(8) + "señales".padStart(9) + "% por op".padStart(12) + "acierta".padStart(9) + "t".padStart(8));
for (const t of NUEVOS) { const L = N.out.filter((x) => x.tk === t); const s = stats(L);
  console.log("  " + t.padEnd(8) + String(L.length).padStart(9) + (s ? (s.ret.toFixed(2) + "%").padStart(12) : "—".padStart(12)) +
    (s ? (s.gana.toFixed(0) + "%").padStart(9) : "—".padStart(9)) + (s ? s.t.toFixed(2).padStart(8) : "—".padStart(8))); }
const conMuestra = NUEVOS.map((t) => stats(N.out.filter((x) => x.tk === t))).filter(Boolean);
console.log("  → tickers con al menos 3 señales: " + conMuestra.length + "  ·  positivos: " + conMuestra.filter((s) => s.ret > 0).length);
console.log("");
console.log("  ══ POR AÑO (los 20 nuevos) ══");
console.log("");
console.log("  " + "año".padEnd(8) + "señales".padStart(9) + "% por op".padStart(12) + "acierta".padStart(9) + "t".padStart(8));
for (const y of ["2021","2022","2023","2024","2025","2026"]) { const L = N.out.filter((x) => x.y === y); const s = stats(L);
  console.log("  " + y.padEnd(8) + String(L.length).padStart(9) + (s ? (s.ret.toFixed(2) + "%").padStart(12) : "—".padStart(12)) +
    (s ? (s.gana.toFixed(0) + "%").padStart(9) : "—".padStart(9)) + (s ? s.t.toFixed(2).padStart(8) : "—".padStart(8))); }
console.log("");
console.log("  ══ Y EN DINERO ══");
console.log("");
console.log("  " + "".padEnd(28) + "tu cuenta".padStart(16) + "la grande".padStart(16));
for (const [nom, L] of [["sólo los 8 viejos", V.out], ["🎯 sólo los 20 nuevos", N.out],
                        ["los 28 juntos", [...V.out, ...N.out].sort((a, b) => a.dC.localeCompare(b.dC))]]) {
  const a = banda(L, 60000), b = banda(L, 300000);
  console.log("  " + nom.padEnd(28) + (a.a.toFixed(1) + "%  −" + a.c.toFixed(0) + "%").padStart(16) + (b.a.toFixed(1) + "%  −" + b.c.toFixed(0) + "%").padStart(16)); }
console.log("  (listón: comprar SPY y dormir = 15.4% al año)");
console.log("");
