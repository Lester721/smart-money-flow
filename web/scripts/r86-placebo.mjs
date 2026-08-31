// ══ ¿EL GOLPE APORTA ALGO? — EL TEST DEL PLACEBO ══ Lester, 2026-08-27: «¿por qué carajos lo tumbó?»
//
// HIPÓTESIS: la regla compra una opción MUY DENTRO DEL DINERO (≈ la acción apalancada) cuando la
// acción está BAJO SU MEDIA DE 20 DÍAS. Eso es «comprar la caída, apalancado». Funciona en nombres
// que rebotan (TSLA) y mata en los que siguen cayendo (UNH, COST). El golpe de $500.000 podría no
// estar aportando NADA — ser sólo el envoltorio.
//
// EL TEST: por cada señal real, buscar días PLACEBO del mismo ticker —misma condición de media,
// SIN golpe— y comprar el contrato más parecido que haya en la cadena (mismo lado, profundidad y
// plazo parecidos, >=$10.000). Misma regla de salida. Si el placebo rinde igual, el flujo sobra.
//
// ⚠️ El camino del placebo se construye leyendo las CADENAS día a día, en orden, sin resúmenes.
//    Entrada al ASK, salida al BID — el mismo peaje que paga la regla real.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cargar } from "./consultar.mjs";
import { abrir } from "./datos.mjs";
import { CACHE } from "./raiz.mjs";
const VIEJOS = ["AAPL","AMD","META","MSFT","NVDA","QQQ","SPY","TSLA"];
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
const MA = new Map();
function bajoMedia(tk, d) { const k = tk + d; if (MA.has(k)) return MA.get(k);
  const ds = cad.dias(tk); const i = ds.indexOf(d);
  let r = null;
  if (i >= 20) { const p = ds.slice(i - 20, i).map((x) => spotDe(tk, x)).filter((x) => x != null);
    const s = spotDe(tk, d);
    if (p.length >= 15 && s != null) r = s / (p.reduce((a, b) => a + b, 0) / p.length) - 1; }
  MA.set(k, r); return r; }
// dominancia
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
function unaPorDia(L) { const g = new Map();
  for (const f of L) { const k = f.tk + f.dC; if (!g.has(k)) g.set(k, []); g.get(k).push(f); }
  return [...g.values()].map((G) => G.reduce((a, b) =>
    (Number(b.exp) > Number(a.exp) || (Number(b.exp) === Number(a.exp) && b.prof < a.prof)) ? b : a
  )).sort((a, b) => a.dC.localeCompare(b.dC)); }
/** recorre el camino EN ORDEN desde la cadena; entrada al ask, salida al bid. Sin resúmenes. */
function caminoDesdeCadena(tk, dC, exp, K, l, ask, spot0, pc) {
  const ds = cad.dias(tk).filter((d) => d > dC && d <= exp);
  const clave = K + "|" + l;
  let n = 0, ult = null;
  for (const d of ds) {
    const ch = cad.leer(tk, d); if (!ch) continue;
    const p = ch[exp]?.[clave]; if (!p || !(p[0] > 0)) continue;
    n++;
    const m = p[0] / ask; ult = { mult: m, dSal: d };
    if (m >= 1.50) return { mult: 1.50, dSal: d };
    if (m <= 0.50) return { mult: 0.50, dSal: d };
    const s = spotDe(tk, d);
    if (s != null) { const mv = l === "P" ? (spot0 - s) / spot0 : (s - spot0) / spot0;
      if (mv >= pc) return { mult: m, dSal: d }; }
    if (n >= 60) return { mult: m, dSal: d }; }
  return ult; }
/** en el día d, el contrato de la cadena más parecido al perfil pedido */
function contratoParecido(tk, d, l, profObj, dteObj) {
  const ch = cad.leer(tk, d); if (!ch) return null;
  const s = spotDe(tk, d); if (s == null) return null;
  let mejor = null, mejorD = Infinity;
  for (const exp of Object.keys(ch)) {
    const dte = dteDe(d, exp); if (dte < 5 || dte > 400) continue;
    for (const cl of Object.keys(ch[exp])) {
      if (!cl.endsWith("|" + l)) continue;
      const K = Number(cl.slice(0, cl.indexOf("|")));
      const dentro = l === "C" ? K < s : K > s; if (!dentro) continue;
      const q = ch[exp][cl]; if (!q || !(q[1] > 0) || !(q[0] > 0)) continue;
      if (q[1] * 100 < 10000) continue;                       // >= $10.000, como la regla
      const prof = Math.abs(K - s) / s;
      const dist = Math.abs(prof - profObj) / Math.max(profObj, 0.01) + Math.abs(dte - dteObj) / Math.max(dteObj, 5);
      if (dist < mejorD) { mejorD = dist; mejor = { exp, K, l, ask: q[1], bid: q[0], prof, dte, spot: s }; } } }
  return mejor; }
// ── las 81 señales reales ──
const TODO = cargar().filter((f) => VIEJOS.includes(f.tk));
const base = TODO.filter(MAG);
for (const f of base) f.ma20 = bajoMedia(f.tk, f.dC);
const REAL = [];
for (const f of unaPorDia(base.filter((x) => x.ma20 != null && x.ma20 < 0))) {
  const dm = DOM.get(f.tk + "|" + f.dia);
  const ac = dm == null ? 0 : (f.l === "P" ? -1 : 1) * dm;
  const confirma = ac >= 0.3 || (f.golpes >= 2 && f.golpes < 10);
  let n = 0, ult = null;
  for (const [d, bid] of f.camino) { n++; const m = bid / f.ask; ult = { mult: m, dSal: d };
    if (m >= 1.50) { ult = { mult: 1.50, dSal: d }; break; }
    if (m <= 0.50) { ult = { mult: 0.50, dSal: d }; break; }
    const s = spotDe(f.tk, d);
    if (s != null) { const mv = f.l === "P" ? (f.spot - s) / f.spot : (s - f.spot) / f.spot;
      if (mv >= (confirma ? 0.08 : 0.12)) { ult = { mult: m, dSal: d }; break; } }
    if (n >= 60) break; }
  REAL.push({ ...f, confirma, mult: ult.mult, y: f.dC.slice(0, 4) }); }
// ── días con golpe, para excluirlos como placebo ──
const conGolpe = new Set(TODO.map((x) => x.tk + "|" + x.dC));
// ── los placebos ──
const PLACEBO = [];
let sinCandidato = 0;
for (const S of REAL) {
  const ds = cad.dias(S.tk);
  const i = ds.indexOf(S.dC); if (i < 0) continue;
  const ventana = ds.slice(Math.max(0, i - 40), i + 41)
    .filter((d) => d !== S.dC && !conGolpe.has(S.tk + "|" + d) && d >= "20210101" && d <= "20260819");
  const aptos = ventana.filter((d) => { const m = bajoMedia(S.tk, d); return m != null && m < 0; });
  let puestos = 0;
  for (const d of aptos) {
    if (puestos >= 3) break;
    const c = contratoParecido(S.tk, d, S.l, S.prof, S.dte);
    if (!c) continue;
    const r = caminoDesdeCadena(S.tk, d, c.exp, c.K, c.l, c.ask, c.spot, S.confirma ? 0.08 : 0.12);
    if (!r) continue;
    PLACEBO.push({ tk: S.tk, dC: d, y: d.slice(0, 4), l: S.l, mult: r.mult, deSenal: S.dC });
    puestos++; }
  if (!puestos) sinCandidato++; }
const media = (A) => A.reduce((s, x) => s + x, 0) / A.length;
function stats(L) { if (!L || L.length < 3) return null;
  const m = L.map((x) => x.mult); const r = media(m) - 1;
  const sd = Math.sqrt(m.reduce((s, x) => s + (x - 1 - r) ** 2, 0) / (m.length - 1));
  return { n: m.length, ret: 100 * r, gana: 100 * m.filter((x) => x > 1).length / m.length, t: r / (sd / Math.sqrt(m.length)) }; }
console.log("");
console.log("  ══ AUDIT ══");
const sR = stats(REAL);
console.log("  señales reales: " + REAL.length + " (esperado 81)" + (REAL.length === 81 ? "  ✓" : "  ⚠"));
console.log("  reproducen el 7.44% / 69% / t=3.03: " + sR.ret.toFixed(2) + "% / " + sR.gana.toFixed(0) + "% / t=" + sR.t.toFixed(2) +
  (Math.abs(sR.ret - 7.44) < 0.1 ? "  ✓" : "  ⚠ el camino desde la maestra no coincide"));
console.log("  placebos construidos: " + PLACEBO.length + "  ·  señales sin ningún placebo: " + sinCandidato);
console.log("  el placebo se construye leyendo las CADENAS día a día, en orden. Entrada al ask, salida al bid.");
console.log("  días con golpe EXCLUIDOS del placebo: " + conGolpe.size);
const sP = stats(PLACEBO);
console.log("");
console.log("  ══ ¿APORTA ALGO EL GOLPE DE $500,000? ══");
console.log("");
console.log("  " + "".padEnd(34) + "n".padStart(6) + "% por operación".padStart(17) + "acierta".padStart(9) + "t".padStart(8));
console.log("  " + "CON golpe (la tabla mágica)".padEnd(34) + String(sR.n).padStart(6) + (sR.ret.toFixed(2) + "%").padStart(17) + (sR.gana.toFixed(0) + "%").padStart(9) + sR.t.toFixed(2).padStart(8));
console.log("  " + "SIN golpe (placebo, misma media)".padEnd(34) + String(sP.n).padStart(6) + (sP.ret.toFixed(2) + "%").padStart(17) + (sP.gana.toFixed(0) + "%").padStart(9) + sP.t.toFixed(2).padStart(8));
const dif = sR.ret - sP.ret;
console.log("");
console.log("  → diferencia: " + (dif >= 0 ? "+" : "") + dif.toFixed(2) + " puntos a favor del golpe");
console.log("  → " + (Math.abs(dif) < 2 ? "🔴 EL GOLPE NO APORTA. El mérito es de «dentro del dinero + bajo la media»."
  : dif > 0 ? "🟢 el golpe SÍ aporta — hay que ver si aguanta por ticker" : "🔴 el golpe RESTA."));
console.log("");
console.log("  ══ POR TICKER — ¿dónde está la diferencia? ══");
console.log("");
console.log("  " + "ticker".padEnd(8) + "n señal".padStart(9) + "con golpe".padStart(12) + "n plac.".padStart(9) + "sin golpe".padStart(12) + "diferencia".padStart(13));
for (const t of VIEJOS) {
  const a = stats(REAL.filter((x) => x.tk === t)), b = stats(PLACEBO.filter((x) => x.tk === t));
  console.log("  " + t.padEnd(8) + String(REAL.filter((x) => x.tk === t).length).padStart(9) +
    (a ? (a.ret.toFixed(2) + "%").padStart(12) : "—".padStart(12)) +
    String(PLACEBO.filter((x) => x.tk === t).length).padStart(9) +
    (b ? (b.ret.toFixed(2) + "%").padStart(12) : "—".padStart(12)) +
    (a && b ? (((a.ret - b.ret) >= 0 ? "+" : "") + (a.ret - b.ret).toFixed(2)).padStart(13) : "—".padStart(13))); }
console.log("");
console.log("  ══ POR AÑO ══");
console.log("");
console.log("  " + "año".padEnd(8) + "n señal".padStart(9) + "con golpe".padStart(12) + "n plac.".padStart(9) + "sin golpe".padStart(12) + "diferencia".padStart(13));
for (const y of ["2021","2022","2023","2024","2025","2026"]) {
  const a = stats(REAL.filter((x) => x.y === y)), b = stats(PLACEBO.filter((x) => x.y === y));
  console.log("  " + y.padEnd(8) + String(REAL.filter((x) => x.y === y).length).padStart(9) +
    (a ? (a.ret.toFixed(2) + "%").padStart(12) : "—".padStart(12)) +
    String(PLACEBO.filter((x) => x.y === y).length).padStart(9) +
    (b ? (b.ret.toFixed(2) + "%").padStart(12) : "—".padStart(12)) +
    (a && b ? (((a.ret - b.ret) >= 0 ? "+" : "") + (a.ret - b.ret).toFixed(2)).padStart(13) : "—".padStart(13))); }
console.log("");
