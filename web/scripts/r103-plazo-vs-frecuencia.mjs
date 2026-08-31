// ══ AFINAR CON CABEZA — PASO 7: EL INTERCAMBIO PLAZO / FRECUENCIA ══
// Lester, 2026-08-28: «mide con 30 y 45 días a ver cuántas sobreviven».
//
// ⚠️ LA MITAD B NO SE TOCA.
//
// EL PROBLEMA. Con el filtro «golpe + 12x sobre el OI» hay 99 entradas en la mitad A, pero al
// quedarse con UNA POR TICKER A LA VEZ se caen a 7: aguantar 90 días bloquea el ticker tres
// meses y te pierdes todas las señales de ese nombre mientras tanto.
//
// LA PREGUNTA. Aguantar menos gana menos por operación pero deja hacer más. Lo que llena una
// cuenta es operaciones × dinero, no una de las dos. ¿Dónde está el punto?
//
// Se varía SÓLO el plazo de aguante. El contrato sigue siendo el mismo (~120 días, 15% dentro,
// >= $5.000) para no mover dos cosas a la vez.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { abrir } from "./datos.mjs";
import { CACHE } from "./raiz.mjs";
const A = ["AMAT","ASML","AVGO","BA","COIN","COST","DELL","JPM","META","MRVL","NVDA","PFE","PYPL","QQQ","STX","UNH"];
const PROF_OBJ = 0.15, DTE_OBJ = 120, COSTE_MIN = 5000, SUELO = 0.50;
const PLAZOS = [20, 30, 45, 60, 90];
const MAXP = Math.max(...PLAZOS);
const ANOS = 5.63;
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
// golpe de CALL de cada ticker-día
const GOLPE = new Map();
for (const f of readdirSync(FDIR)) {
  const g = /^([A-Z]+)_d(\d{8})\.json$/.exec(f); if (!g) continue;
  const [, tk, dia] = g;
  if (!A.includes(tk) || dia < "20210101" || dia > "20260819") continue;
  let L; try { L = JSON.parse(readFileSync(join(FDIR, f), "utf8")); } catch { continue; }
  let hay = false; const porContrato = new Map();
  for (const o of L) {
    if (o.l !== "C") continue;
    if (!(o.ask > 0 && o.precio >= o.ask)) continue;
    if (o.prima < 500000) continue;
    if (o.hora && o.hora.slice(11, 16) < "14:00") continue;
    hay = true;
    const k = o.exp + "|" + o.K;
    porContrato.set(k, (porContrato.get(k) || 0) + o.tam); }
  if (hay) GOLPE.set(tk + "|" + dia, porContrato); }
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
    if (out.length >= MAXP) break; }
  return out; }
function salir(cam, plazo) { let ult = null;
  for (let i = 0; i < cam.length && i < plazo; i++) { const [d, m] = cam[i]; ult = { mult: m, dSal: d };
    if (m <= SUELO) return { mult: SUELO, dSal: d }; }
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
    const cam = caminoDe(tk, d, c, todos); if (cam.length < 15) continue;
    const i = iDe.get(d); const ayer = i > 0 ? todos[i - 1] : null;
    const g = ayer ? GOLPE.get(tk + "|" + ayer) : null;
    let vsOI = 0;
    if (g) { const oiV = i > 1 ? oiA.leer(tk, todos[i - 2]) : null;
      if (oiV) for (const [k, tam] of g) { const [exp, K] = k.split("|");
        const o = oiV[exp] && oiV[exp][K + "|C"];
        const n = Array.isArray(o) ? o[0] : o;
        if (n > 0) vsOI = Math.max(vsOI, tam / n); } }
    DATOS.push({ tk, dC: d, y: d.slice(0, 4), hayGolpe: !!g, vsOI, coste: c.ask * 100, cam }); } }
console.log("\n");
const media = (X) => X.reduce((s, x) => s + x, 0) / X.length;
function stats(L, plazo) { if (!L || L.length < 3) return null;
  const m = L.map((x) => { const r = salir(x.cam, plazo); return r ? r.mult : null; }).filter((x) => x != null);
  if (m.length < 3) return null;
  const r = media(m) - 1;
  const sd = Math.sqrt(m.reduce((s, x) => s + (x - 1 - r) ** 2, 0) / (m.length - 1));
  return { n: m.length, ret: 100 * r, gana: 100 * m.filter((x) => x > 1).length / m.length,
           t: r / (sd / Math.sqrt(m.length)), dobla: 100 * m.filter((x) => x >= 2).length / m.length }; }
function sinSolape(L, plazo) { const g = new Map();
  for (const x of L) { if (!g.has(x.tk)) g.set(x.tk, []); g.get(x.tk).push(x); }
  const out = [];
  for (const G of g.values()) { let libre = "00000000";
    for (const x of G.sort((a, b) => a.dC.localeCompare(b.dC))) {
      if (x.dC <= libre) continue; out.push(x);
      const r = salir(x.cam, plazo); libre = r ? r.dSal : x.dC; } }
  return out; }
const CONGOLPE = DATOS.filter((x) => x.hayGolpe && x.vsOI >= 12);
console.log("  entradas totales: " + DATOS.length.toLocaleString("en-US") +
            "   ·   con golpe + 12x sobre el OI: " + CONGOLPE.length);
console.log("");
console.log("  ══ CON EL FILTRO: golpe de $500k+ al ask, tras las 14:00, y 12x el OI de la víspera ══");
console.log("  ══ una posición por ticker a la vez ══");
console.log("");
console.log("  " + "aguantar".padEnd(12) + "sobreviven".padStart(12) + "ops/año".padStart(9) +
  "% por op".padStart(11) + "acierta".padStart(9) + "t".padStart(8) + "doblan".padStart(9) + "$/año*".padStart(11));
const D = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
for (const p of PLAZOS) {
  const L = sinSolape(CONGOLPE, p); const s = stats(L, p);
  const opsAno = L.length / ANOS;
  const dinero = s ? opsAno * media(L.map((x) => x.coste)) * (s.ret / 100) : 0;
  console.log("  " + (p + " días").padEnd(12) + String(L.length).padStart(12) + opsAno.toFixed(1).padStart(9) +
    (s ? (s.ret.toFixed(2) + "%").padStart(11) : "—".padStart(11)) + (s ? (s.gana.toFixed(0) + "%").padStart(9) : "—".padStart(9)) +
    (s ? s.t.toFixed(2).padStart(8) : "—".padStart(8)) + (s ? (s.dobla.toFixed(1) + "%").padStart(9) : "—".padStart(9)) +
    D(dinero).padStart(11)); }
console.log("");
console.log("  ══ SIN EL FILTRO, para comparar ══");
console.log("");
console.log("  " + "aguantar".padEnd(12) + "sobreviven".padStart(12) + "ops/año".padStart(9) +
  "% por op".padStart(11) + "acierta".padStart(9) + "t".padStart(8) + "doblan".padStart(9) + "$/año*".padStart(11));
for (const p of PLAZOS) {
  const L = sinSolape(DATOS, p); const s = stats(L, p);
  const opsAno = L.length / ANOS;
  const dinero = s ? opsAno * media(L.map((x) => x.coste)) * (s.ret / 100) : 0;
  console.log("  " + (p + " días").padEnd(12) + String(L.length).padStart(12) + opsAno.toFixed(1).padStart(9) +
    (s ? (s.ret.toFixed(2) + "%").padStart(11) : "—".padStart(11)) + (s ? (s.gana.toFixed(0) + "%").padStart(9) : "—".padStart(9)) +
    (s ? s.t.toFixed(2).padStart(8) : "—".padStart(8)) + (s ? (s.dobla.toFixed(1) + "%").padStart(9) : "—".padStart(9)) +
    D(dinero).padStart(11)); }
console.log("");
console.log("  * $/año = operaciones al año × coste medio del contrato × % por operación.");
console.log("    Es lo que daría UNA posición rodando sin parar, no la cuenta entera.");
console.log("");
console.log("  ⚠️ MITAD A. El examen NO se ha hecho.");
console.log("");
