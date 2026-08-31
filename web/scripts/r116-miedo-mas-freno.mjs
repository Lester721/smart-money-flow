// ══ UN MEDIDOR DE MIEDO HECHO EN CASA, Y QUÉ DICE ══ Lester, 2026-08-28:
//   «¿no existe un medidor de Fear? ¿no podemos dejar de operar los días de Extreme Fear?»
//
// EL VIX REAL NO SE PUEDE USAR: la suscripción de índices es FREE y rechaza el histórico
// («requires a PROFESSIONAL subscription»). El fichero en disco sólo cubre 2024-2026, así que se
// pierden 2018, el COVID y 2022 — justo los años que importan.
//
// PERO el VIX es, literalmente, la volatilidad implícita de las opciones de SPY a ~30 días. Y las
// cadenas de SPY están en disco desde 2016. Así que se construye:
//
//   MIEDO = precio del STRADDLE al dinero de SPY a ~30 días, como % del precio de SPY
//
// Eso es exactamente lo que mide el VIX. Y NO se pide que nadie se lo crea: se compara contra el
// VIX real en los 678 días que sí hay, y se enseña la correlación.
//
// ⚠️ SIN MIRAR AL FUTURO: el percentil del miedo se calcula con una ventana MÓVIL de 2 años hacia
// atrás. Usar el percentil sobre toda la historia sería saber hoy cuál fue el máximo de 2026.
//
// ⚠️ MI APUESTA, ESCRITA ANTES DE MEDIR: el miedo extremo va a salir BUENO para comprar, no malo.
//    Ya está medido que comprar con SPY bajo su media de 200 da +20,13% contra +8,99%. Si sale
//    así, lo útil no es parar en el miedo — es comprar MÁS.
import fs from "node:fs";
import { abrir } from "./datos.mjs";
const TK = ["AAPL","AMD","META","MSFT","NVDA","QQQ","SPY",
  "BA","JPM","INTC","F","BAC","DIS","XOM","GE","PYPL","COST","CRM","ORCL","WMT","T","PFE","KO","CSCO","NKE","UNH","WBA"];
const PROF_OBJ = 0.15, DTE_OBJ = 120, COSTE_MIN = 5000, SUELO = 0.50, PLAZO = 90;
const DIV_SPY = 0.013, DESDE = "20160104", VENTANA = 504;   // 2 años de ventana móvil
const D = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const cad = abrir("cadenas", { callado: true });
const ms = (d) => Date.parse(d.slice(0,4) + "-" + d.slice(4,6) + "-" + d.slice(6,8) + "T00:00:00Z");
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86400000);
let CH = new Map(), SP = new Map();
const leer = (tk, d) => { if (CH.has(d)) return CH.get(d); const c = cad.leer(tk, d); CH.set(d, c); return c; };
function spotOk(c, hoy) { if (!c) return null; let e0 = null, md = Infinity;
  for (const e of Object.keys(c)) { const d = dteDe(hoy, e); if (d < 1) continue; if (d < md) { md = d; e0 = e; } }
  if (!e0) return null; const g = c[e0]; let K = null, dm = Infinity;
  for (const cl of Object.keys(g)) { if (cl.slice(-1) !== "C") continue;
    const k = Number(cl.slice(0, -2)); const p = g[k + "|P"]; if (!p) continue;
    const d = Math.abs((g[cl][0] + g[cl][1]) / 2 - (p[0] + p[1]) / 2); if (d < dm) { dm = d; K = k; } }
  if (K == null) return null; const C = g[K + "|C"], P = g[K + "|P"];
  const s = K + (C[0] + C[1]) / 2 - (P[0] + P[1]) / 2; return s > 0 ? s : null; }
const spotDe = (tk, d) => { if (SP.has(d)) return SP.get(d); const s = spotOk(leer(tk, d), d); SP.set(d, s); return s; };

// ══ 1. CONSTRUIR EL MEDIDOR ══
console.log("\n  construyendo el medidor de miedo desde las cadenas de SPY…");
const DIAS_SPY = cad.dias("SPY").filter((d) => d >= DESDE && d <= "20260819");
const MIEDO = new Map();          // dia -> straddle al dinero a ~30 días, % del precio, anualizado
for (const d of DIAS_SPY) {
  const ch = leer("SPY", d); if (!ch) continue;
  const s = spotDe("SPY", d); if (s == null) continue;
  // vencimiento más cercano a 30 días
  let exp = null, mejor = Infinity;
  for (const e of Object.keys(ch)) { const t = dteDe(d, e); if (t < 15 || t > 60) continue;
    const dist = Math.abs(t - 30); if (dist < mejor) { mejor = dist; exp = e; } }
  if (!exp) continue;
  const dte = dteDe(d, exp);
  // strike más cercano al precio
  let K = null, dm = Infinity;
  for (const cl of Object.keys(ch[exp])) {
    if (!cl.endsWith("|C")) continue;
    const k = Number(cl.slice(0, cl.indexOf("|")));
    if (!ch[exp][k + "|P"]) continue;
    const dist = Math.abs(k - s); if (dist < dm) { dm = dist; K = k; } }
  if (K == null) continue;
  const C = ch[exp][K + "|C"], P = ch[exp][K + "|P"];
  if (!C || !P || !(C[1] > 0) || !(P[1] > 0)) continue;
  const straddle = (C[0] + C[1]) / 2 + (P[0] + P[1]) / 2;
  // anualizado, para que se parezca al VIX: (straddle/precio) / 0,8 * sqrt(365/dte) * 100
  MIEDO.set(d, (straddle / s) / 0.8 * Math.sqrt(365 / dte) * 100);
}
console.log("  días con medidor: " + MIEDO.size + " de " + DIAS_SPY.length);
// ── validarlo contra el VIX real donde lo hay ──
let VIXreal = {};
try { VIXreal = JSON.parse(fs.readFileSync("scripts/cache-theta/vol-indices/VIX.json", "utf8")); }
catch { try { VIXreal = JSON.parse(fs.readFileSync("cache-theta/vol-indices/VIX.json", "utf8")); } catch {} }
const comunes = [...MIEDO.keys()].filter((d) => VIXreal[d] > 0);
if (comunes.length > 30) {
  const a = comunes.map((d) => MIEDO.get(d)), b = comunes.map((d) => VIXreal[d]);
  const m = (X) => X.reduce((s, x) => s + x, 0) / X.length;
  const ma = m(a), mb = m(b);
  let sxy = 0, sx = 0, sy = 0;
  for (let i = 0; i < a.length; i++) { const dx = a[i] - ma, dy = b[i] - mb; sxy += dx * dy; sx += dx * dx; sy += dy * dy; }
  console.log("  VALIDACIÓN contra el VIX real (" + comunes.length + " días de 2024-2026):");
  console.log("    correlación: " + (sxy / Math.sqrt(sx * sy)).toFixed(3) +
    "   ·   mi medidor de media " + ma.toFixed(1) + " vs VIX " + mb.toFixed(1));
} else console.log("  ⚠️ no se pudo validar contra el VIX real (pocos días comunes)");
// ── percentil con ventana MÓVIL de 2 años (sin mirar al futuro) ──
const PCT = new Map();
const orden = [...MIEDO.keys()].sort();
for (let i = VENTANA; i < orden.length; i++) {
  const hoy = orden[i], v = MIEDO.get(hoy);
  const prev = orden.slice(i - VENTANA, i).map((d) => MIEDO.get(d)).sort((a, b) => a - b);
  let lo = 0; while (lo < prev.length && prev[lo] < v) lo++;
  PCT.set(hoy, lo / prev.length); }
console.log("  días con percentil (tras 2 años de ventana): " + PCT.size);
console.log("");
console.log("  ══ ¿CUÁNDO HUBO MIEDO EXTREMO? (percentil > 90 de sus 2 años previos) ══");
const extremos = [...PCT.entries()].filter(([, p]) => p > 0.90).map(([d]) => d);
const porAno = {};
for (const d of extremos) porAno[d.slice(0, 4)] = (porAno[d.slice(0, 4)] || 0) + 1;
console.log("  " + Object.entries(porAno).map(([y, n]) => y + ": " + n + " días").join("  ·  "));

// ══ 2. LAS OPERACIONES ══
const OPS = [];
process.stdout.write("\n  construyendo operaciones: ");
for (const tk of TK) {
  CH = new Map(); SP = new Map();
  process.stdout.write(tk + " ");
  const todos = cad.dias(tk);
  for (let i = 20; i < todos.length; i++) {
    const d = todos[i];
    if (d < DESDE || d > "20260819" || !PCT.has(d)) continue;
    const p = todos.slice(i - 20, i).map((x) => spotDe(tk, x)).filter((x) => x != null);
    const s = spotDe(tk, d);
    if (p.length < 15 || s == null) continue;
    const ma = s / (p.reduce((a, b) => a + b, 0) / p.length) - 1;
    if (ma >= 0) continue;
    const ch = leer(tk, d); if (!ch) continue;
    let L = null, mejorD = Infinity;
    for (const exp of Object.keys(ch)) {
      const dte = dteDe(d, exp); if (dte < 30 || dte > 400) continue;
      for (const cl of Object.keys(ch[exp])) {
        if (!cl.endsWith("|C")) continue;
        const K = Number(cl.slice(0, cl.indexOf("|")));
        if (K >= s) continue;
        const q = ch[exp][cl]; if (!q || !(q[1] > 0) || !(q[0] > 0)) continue;
        if (q[1] * 100 < COSTE_MIN) continue;
        const prof = (s - K) / s;
        const dist = Math.abs(prof - PROF_OBJ) / PROF_OBJ + Math.abs(dte - DTE_OBJ) / DTE_OBJ;
        if (dist < mejorD) { mejorD = dist; L = { exp, K, ask: q[1], bid: q[0], prof, dte, spot: s }; } } }
    if (!L) continue;
    const cam = [];
    for (const x of todos.filter((y) => y > d && y <= L.exp)) {
      const c2 = leer(tk, x); if (!c2) continue;
      const q = c2[L.exp] && c2[L.exp][L.K + "|C"]; if (!q || !(q[0] > 0)) continue;
      cam.push([x, q[0] / L.ask]); if (cam.length >= PLAZO) break; }
    if (cam.length < 15) continue;
    let r = null;
    for (const [x, m2] of cam) { r = { mult: m2, dSal: x }; if (m2 <= SUELO) break; }
    OPS.push({ tk, dC: d, y: d.slice(0, 4), ma, coste: L.ask * 100, mult: r.mult, dSal: r.dSal,
               miedo: PCT.get(d) }); } }
OPS.sort((a, b) => a.dC.localeCompare(b.dC));
console.log("\n");
const media = (X) => X.reduce((s, x) => s + x, 0) / X.length;
function stats(L) { if (!L || L.length < 3) return null;
  const m = L.map((x) => x.mult); const r = media(m) - 1;
  const sd = Math.sqrt(m.reduce((s, x) => s + (x - 1 - r) ** 2, 0) / (m.length - 1));
  return { n: m.length, ret: 100 * r, gana: 100 * m.filter((x) => x > 1).length / m.length,
           t: r / (sd / Math.sqrt(m.length)), dobla: 100 * m.filter((x) => x >= 2).length / m.length }; }
function sinSolape(L) { const g = new Map();
  for (const x of L) { if (!g.has(x.tk)) g.set(x.tk, []); g.get(x.tk).push(x); }
  const out = [];
  for (const G of g.values()) { let libre = "00000000";
    for (const x of G.sort((a, b) => a.dC.localeCompare(b.dC))) { if (x.dC <= libre) continue; out.push(x); libre = x.dSal; } }
  return out; }
const NS = sinSolape(OPS);
const fila = (nom, L) => { const s = stats(L);
  console.log("  " + nom.padEnd(34) + String(L.length).padStart(6) +
    (s ? (s.ret.toFixed(2) + "%").padStart(11) : "—".padStart(11)) + (s ? (s.gana.toFixed(0) + "%").padStart(9) : "—".padStart(9)) +
    (s ? s.t.toFixed(2).padStart(8) : "—".padStart(8)) + (s ? (s.dobla.toFixed(1) + "%").padStart(9) : "—".padStart(9))); };
console.log("  ══ EL MIEDO CONTRA EL RESULTADO ══   (percentil del miedo el día de la compra)");
console.log("");
console.log("  " + "".padEnd(34) + "n".padStart(6) + "% por op".padStart(11) + "acierta".padStart(9) + "t".padStart(8) + "doblan".padStart(9));
fila("TODAS", NS);
for (const [lo, hi, nom] of [[0, 0.20, "calma extrema (p0-20)"], [0.20, 0.40, "calma (p20-40)"],
                             [0.40, 0.60, "normal (p40-60)"], [0.60, 0.80, "nervios (p60-80)"],
                             [0.80, 0.90, "miedo (p80-90)"], [0.90, 1.01, "🔥 MIEDO EXTREMO (p90+)"]])
  fila(nom, NS.filter((x) => x.miedo >= lo && x.miedo < hi));
console.log("");
console.log("  ══ LAS DOS FORMAS DE USARLO ══");
console.log("");
console.log("  " + "".padEnd(34) + "n".padStart(6) + "% por op".padStart(11) + "acierta".padStart(9) + "t".padStart(8) + "doblan".padStart(9));
fila("PARAR en miedo extremo (p<90)", NS.filter((x) => x.miedo < 0.90));
fila("SÓLO comprar en miedo (p>=80)", NS.filter((x) => x.miedo >= 0.80));
fila("SÓLO comprar en calma (p<50)", NS.filter((x) => x.miedo < 0.50));
console.log("");
console.log("  ══ EL MIEDO POR AÑO, y qué dio ══");
console.log("");
console.log("  " + "año".padEnd(7) + "miedo medio".padStart(13) + "n".padStart(5) + "% por op".padStart(11) + "acierta".padStart(9));
for (const y of ["2018","2019","2020","2021","2022","2023","2024","2025","2026"]) {
  const L = NS.filter((x) => x.y === y); const s = stats(L);
  const mm = L.length ? media(L.map((x) => x.miedo)) : null;
  console.log("  " + y.padEnd(7) + (mm == null ? "—" : "p" + (100 * mm).toFixed(0)).padStart(13) + String(L.length).padStart(5) +
    (s ? (s.ret.toFixed(2) + "%").padStart(11) : "—".padStart(11)) + (s ? (s.gana.toFixed(0) + "%").padStart(9) : "—".padStart(9))); }
console.log("");

// ── la caída de SPY desde su máximo, para cruzarla con el miedo ──
// ⚠️ VACIAR LA CACHÉ PRIMERO. Está indexada SÓLO por fecha, así que después del bucle de tickers
// sigue cargada con el último (WBA) y spotDe("SPY", d) devolvería el precio de WBA sin dar error.
// Cazado el 2026-08-28: la primera corrida midió la caída de WBA y la llamó SPY.
CH = new Map(); SP = new Map();
const CAIDA = new Map();
{ let pico = 0;
  for (const d of DIAS_SPY) { const p = spotDe("SPY", d); if (p == null) continue;
    if (p > pico) pico = p; CAIDA.set(d, 1 - p / pico); } }
for (const x of NS) x.caidaSPY = CAIDA.get(x.dC) ?? 0;
console.log("");
console.log("  ══ 🔀 ¿SE CONTRADICEN? — el miedo dice compra, el filtro del 5% dice para ══");
console.log("");
const ex = NS.filter((x) => x.miedo >= 0.90);
console.log("  de las " + ex.length + " entradas de miedo extremo, SPY estaba:");
console.log("    a menos del 5% de su máximo: " + ex.filter((x) => x.caidaSPY < 0.05).length);
console.log("    caído entre 5% y 10%:        " + ex.filter((x) => x.caidaSPY >= 0.05 && x.caidaSPY < 0.10).length);
console.log("    caído más del 10%:           " + ex.filter((x) => x.caidaSPY >= 0.10).length);
console.log("");
console.log("  ══ EL MIEDO EXTREMO, PARTIDO POR CUÁNTO HA CAÍDO YA SPY ══");
console.log("");
console.log("  " + "".padEnd(38) + "n".padStart(6) + "% por op".padStart(11) + "acierta".padStart(9) + "t".padStart(8) + "doblan".padStart(9));
fila("miedo extremo, todo", ex);
fila("  · con SPY a menos del 5% del máximo", ex.filter((x) => x.caidaSPY < 0.05));
fila("  · con SPY caído 5-10%", ex.filter((x) => x.caidaSPY >= 0.05 && x.caidaSPY < 0.10));
fila("  · con SPY caído más del 10%", ex.filter((x) => x.caidaSPY >= 0.10));
console.log("");
console.log("  ══ LAS COMBINACIONES ══");
console.log("");
console.log("  " + "".padEnd(38) + "n".padStart(6) + "% por op".padStart(11) + "acierta".padStart(9) + "t".padStart(8) + "doblan".padStart(9));
fila("TODAS, sin filtro", NS);
fila("sólo el filtro del 5% (sin miedo)", NS.filter((x) => x.caidaSPY < 0.05));
fila("sólo miedo extremo (sin el 5%)", ex);
fila("🔀 miedo extremo Y SPY sano (<5%)", ex.filter((x) => x.caidaSPY < 0.05));
fila("miedo extremo O SPY sano", NS.filter((x) => x.miedo >= 0.90 || x.caidaSPY < 0.05));
fila("miedo alto (p>=80) Y SPY sano", NS.filter((x) => x.miedo >= 0.80 && x.caidaSPY < 0.05));
console.log("");
console.log("  ══ POR AÑO — miedo extremo Y SPY sano ══");
console.log("");
const COMBO = ex.filter((x) => x.caidaSPY < 0.05);
console.log("  " + "año".padEnd(8) + "n".padStart(5) + "% por op".padStart(11) + "acierta".padStart(9));
for (const y of ["2018","2019","2020","2021","2022","2023","2024","2025","2026"]) {
  const L = COMBO.filter((x) => x.y === y); const s2 = stats(L);
  console.log("  " + y.padEnd(8) + String(L.length).padStart(5) +
    (s2 ? (s2.ret.toFixed(2) + "%").padStart(11) : (L.length ? "(menos de 3)" : "—").padStart(11)) +
    (s2 ? (s2.gana.toFixed(0) + "%").padStart(9) : "—".padStart(9))); }
console.log("");
