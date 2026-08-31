// ══ AFINAR CON CABEZA — PASO 6: EL GOLPE, ESCALADO AL PROPIO TICKER ══
//
// ⚠️ LA MITAD B NO SE TOCA.
//
// EL 1 (frescura de la caída) FALLÓ: el acierto no se movió de 45-49% en ningún cajón, y sin
// filtro iba igual o mejor. Por el plan dicho antes, toca el 2.
//
// EL 2: el golpe SÍ funciona como filtro — en TSLA elige el día con 673 controles detrás
// (+10,40% contra −0,51%). Lo que no funciona son los $500.000 FIJOS: en la mitad A dejan 14
// días de call en seis años. La normalización natural es la misma que ya usamos con el OI:
// RELATIVA, no absoluta. Un golpe de $600.000 en STX no es lo mismo que en NVDA.
//
// SE MIDEN TRES FORMAS, de menos a más exigente:
//   a) ¿hubo ALGÚN golpe de call ese día?           (el listón de $500k, tal cual)
//   b) el golpe contra la MEDIANA de ese ticker      (relativo: 1x, 2x, 4x su golpe típico)
//   c) además, el 12x sobre el OI de la víspera      (lo que ya tenía la regla)
//
// ⚠️ LÍMITE DEL DATO, dicho antes de medir: el fichero de flujo SÓLO guarda operaciones de
// $500.000 o más — el descargador filtró al bajarlo. Así que la «mediana del golpe típico» es
// la mediana ENTRE LOS DÍAS QUE YA PASAN ese listón, no de todos los días. No se puede bajar
// del listón sin volver a descargar.
//
// Base: calls · 15% dentro · contrato >= $5.000 y ~120 días · aguantar 90 días · suelo 0,50x.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { abrir } from "./datos.mjs";
import { CACHE } from "./raiz.mjs";
const A = ["AMAT","ASML","AVGO","BA","COIN","COST","DELL","JPM","META","MRVL","NVDA","PFE","PYPL","QQQ","STX","UNH"];
const PROF_OBJ = 0.15, DTE_OBJ = 120, COSTE_MIN = 5000, SUELO = 0.50, PLAZO = 90;
const cad = abrir("cadenas", { callado: true });
const oiA = abrir("oi-ancho", { callado: true });
const FDIR = join(CACHE, "flujo-limpio");
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

// ── el golpe de CALL más grande de cada ticker-día, y si pasa el 12x sobre el OI ──
const GOLPE = new Map();     // tk|dia -> { mayor, vsOImax }
for (const f of readdirSync(FDIR)) {
  const g = /^([A-Z]+)_d(\d{8})\.json$/.exec(f); if (!g) continue;
  const [, tk, dia] = g;
  if (!A.includes(tk) || dia < "20210101" || dia > "20260819") continue;
  let L; try { L = JSON.parse(readFileSync(join(FDIR, f), "utf8")); } catch { continue; }
  let mayor = 0; const porContrato = new Map();
  for (const o of L) {
    if (o.l !== "C") continue;
    if (!(o.ask > 0 && o.precio >= o.ask)) continue;            // al ask o por encima
    if (o.prima < 500000) continue;
    if (o.hora && o.hora.slice(11, 16) < "14:00") continue;
    if (o.prima > mayor) mayor = o.prima;
    const k = o.exp + "|" + o.K;
    porContrato.set(k, (porContrato.get(k) || 0) + o.tam); }
  if (!mayor) continue;
  GOLPE.set(tk + "|" + dia, { mayor, porContrato });
}
// mediana del golpe mayor, por ticker (sólo entre días que ya pasan los $500k)
const MEDIANA = new Map();
for (const tk of A) {
  const v = [...GOLPE.entries()].filter(([k]) => k.startsWith(tk + "|")).map(([, x]) => x.mayor).sort((a, b) => a - b);
  if (v.length) MEDIANA.set(tk, v[Math.floor(v.length / 2)]);
}
console.log("");
console.log("  ══ EL DATO ══");
console.log("  " + "ticker".padEnd(8) + "días con golpe de call".padStart(24) + "mediana del golpe".padStart(20));
for (const tk of A) {
  const n = [...GOLPE.keys()].filter((k) => k.startsWith(tk + "|")).length;
  const m = MEDIANA.get(tk);
  console.log("  " + tk.padEnd(8) + String(n).padStart(24) + (m ? "$" + Math.round(m).toLocaleString("en-US") : "—").padStart(20)); }
console.log("  TOTAL días-ticker con golpe de call: " + GOLPE.size);

function elegir(tk, d) {
  const ch = leer(tk, d); if (!ch) return null;
  const s = spotDe(tk, d); if (s == null) return null;
  let mejor = null, mejorD = Infinity;
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
      if (dist < mejorD) { mejorD = dist; mejor = { exp, K, ask: q[1], bid: q[0], prof, dte, spot: s }; } } }
  return mejor; }
function caminoDe(tk, d, c, dias) {
  const out = [];
  for (const x of dias.filter((y) => y > d && y <= c.exp)) {
    const ch = leer(tk, x); if (!ch) continue;
    const q = ch[c.exp] && ch[c.exp][c.K + "|C"]; if (!q || !(q[0] > 0)) continue;
    out.push([x, q[0] / c.ask]);
    if (out.length >= PLAZO) break; }
  return out; }
function salir(cam) { let ult = null;
  for (const [d, m] of cam) { ult = { mult: m, dSal: d }; if (m <= SUELO) return { mult: SUELO, dSal: d }; }
  return ult; }

const DATOS = [];
process.stdout.write("\n  midiendo: ");
for (const tk of A) {
  CH = new Map(); SP = new Map();
  process.stdout.write(tk + " ");
  const todos = cad.dias(tk);
  const DS = todos.filter((d) => d >= "20210101" && d <= "20260819");
  const MA = new Map();
  for (const d of DS) { const i = todos.indexOf(d); if (i < 20) continue;
    const p = todos.slice(i - 20, i).map((x) => spotDe(tk, x)).filter((x) => x != null);
    const s = spotDe(tk, d);
    if (p.length >= 15 && s != null) MA.set(d, s / (p.reduce((a, b) => a + b, 0) / p.length) - 1); }
  const iDe = new Map(); todos.forEach((d, i) => iDe.set(d, i));
  for (const d of DS) {
    const ma = MA.get(d); if (ma == null || ma >= 0) continue;
    const c = elegir(tk, d); if (!c) continue;
    const cam = caminoDe(tk, d, c, todos); if (cam.length < 20) continue;
    const r = salir(cam); if (!r) continue;
    // el golpe fue AYER; se compra hoy
    const i = iDe.get(d); const ayer = i > 0 ? todos[i - 1] : null;
    const g = ayer ? GOLPE.get(tk + "|" + ayer) : null;
    let veces = 0, vsOI = 0;
    if (g) {
      veces = g.mayor / (MEDIANA.get(tk) || g.mayor);
      const oiV = i > 1 ? oiA.leer(tk, todos[i - 2]) : null;
      if (oiV) for (const [k, tam] of g.porContrato) {
        const [exp, K] = k.split("|");
        const o = oiV[exp] && oiV[exp][K + "|C"];
        const n = Array.isArray(o) ? o[0] : o;
        if (n > 0) vsOI = Math.max(vsOI, tam / n); } }
    DATOS.push({ tk, dC: d, y: d.slice(0, 4), mult: r.mult, dSal: r.dSal, hayGolpe: !!g, veces, vsOI }); } }
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
const fila = (nom, L) => { const s = stats(L);
  return "  " + nom.padEnd(30) + String(L.length).padStart(6) + (s ? (s.ret.toFixed(2) + "%").padStart(11) : "—".padStart(11)) +
    (s ? (s.gana.toFixed(0) + "%").padStart(9) : "—".padStart(9)) + (s ? s.t.toFixed(2).padStart(8) : "—".padStart(8)) +
    (s ? (s.dobla.toFixed(1) + "%").padStart(9) : "—".padStart(9)); };
const NS = sinSolape(DATOS);
console.log("  ══ ¿ELIGE EL GOLPE? ══   (sin solapar · " + NS.length + " entradas de " + DATOS.length + ")");
console.log("");
console.log("  " + "".padEnd(30) + "n".padStart(6) + "% por op".padStart(11) + "acierta".padStart(9) + "t".padStart(8) + "doblan".padStart(9));
console.log(fila("SIN filtro de golpe", NS));
console.log(fila("(a) hubo golpe de $500k+", NS.filter((x) => x.hayGolpe)));
console.log(fila("(b) golpe >= 1x su mediana", NS.filter((x) => x.veces >= 1)));
console.log(fila("(b) golpe >= 2x su mediana", NS.filter((x) => x.veces >= 2)));
console.log(fila("(b) golpe >= 4x su mediana", NS.filter((x) => x.veces >= 4)));
console.log(fila("(c) golpe + 12x sobre el OI", NS.filter((x) => x.hayGolpe && x.vsOI >= 12)));
console.log(fila("(c) golpe + 4x sobre el OI", NS.filter((x) => x.hayGolpe && x.vsOI >= 4)));
console.log("");
console.log("  ── y con TODAS las entradas (solapadas: la t está inflada, el acierto no) ──");
console.log(fila("SIN filtro de golpe", DATOS));
console.log(fila("hubo golpe de $500k+", DATOS.filter((x) => x.hayGolpe)));
console.log(fila("golpe >= 2x su mediana", DATOS.filter((x) => x.veces >= 2)));
console.log(fila("golpe + 12x sobre el OI", DATOS.filter((x) => x.hayGolpe && x.vsOI >= 12)));
console.log("");
console.log("  ⚠️ MITAD A. El examen NO se ha hecho.");
console.log("");
