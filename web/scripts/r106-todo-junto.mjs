// ══ LAS TRES COSAS EN UNA SOLA CUENTA ══ Lester, 2026-08-28.
//   «¿cómo se vería si descanso el efectivo en SPY + uso la desnuda de 90 días + uso el TSLA Missile?»
//
// ⚠️ LA MITAD B NO SE TOCA. TSLA no está en la mitad A, así que no se pisan.
//
// LAS TRES PIEZAS, cada una con SU regla, sin mezclarlas:
//   1. EL APARCADERO  — el efectivo ocioso en SPY (dividendo 1,3%, cifra publicada)
//   2. LA DESNUDA 90d — calls · 15% dentro · contrato ~120 días y >=$5.000 · acción bajo su media
//                       de 20 · golpe de call $500k+ al ask tras las 14:00 · 12x el OI de la
//                       víspera · aguantar 90 días · suelo 0,50x · sin tope · 15% por posición
//   3. TSLA'S MISSILE — su pre-registro tal cual: dentro del dinero · >=$10.000 · >=5 días ·
//                       tras las 14:00 · 12x OI · bajo la media · vencimiento más lejano ·
//                       salida 8%/12% por movimiento de la acción · tope 1,50x · suelo 0,50x ·
//                       60 días · 25% del capital, el DOBLE si confirma
//
// Comparten capital y huecos. Se enseña también cada pieza sola, para ver qué aporta cada una.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cargar } from "./consultar.mjs";
import { abrir } from "./datos.mjs";
import { CACHE } from "./raiz.mjs";
const A = ["AMAT","ASML","AVGO","BA","COIN","COST","DELL","JPM","META","MRVL","NVDA","PFE","PYPL","QQQ","STX","UNH"];
const PROF_OBJ = 0.15, DTE_OBJ = 120, COSTE_MIN = 5000, SUELO = 0.50, PLAZO = 90;
const HUECOS = 6, TAM_DESNUDA = 0.15, ANOS = 5.63, DIV_SPY = 0.013;
const D = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const cad = abrir("cadenas", { callado: true });
const oiA = abrir("oi-ancho", { callado: true });
const FDIR = join(CACHE, "flujo-limpio");
const ms = (d) => Date.parse(d.slice(0,4) + "-" + d.slice(4,6) + "-" + d.slice(6,8) + "T00:00:00Z");
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86400000);
let CH = new Map(), SP = new Map();
const leer = (tk, d) => { const k = tk + "|" + d; if (CH.has(k)) return CH.get(k); const c = cad.leer(tk, d); CH.set(k, c); return c; };
function spotOk(c, hoy) { if (!c) return null; let e0 = null, md = Infinity;
  for (const e of Object.keys(c)) { const d = dteDe(hoy, e); if (d < 1) continue; if (d < md) { md = d; e0 = e; } }
  if (!e0) return null; const g = c[e0]; let K = null, dm = Infinity;
  for (const cl of Object.keys(g)) { if (cl.slice(-1) !== "C") continue;
    const k = Number(cl.slice(0, -2)); const p = g[k + "|P"]; if (!p) continue;
    const d = Math.abs((g[cl][0] + g[cl][1]) / 2 - (p[0] + p[1]) / 2); if (d < dm) { dm = d; K = k; } }
  if (K == null) return null; const C = g[K + "|C"], P = g[K + "|P"];
  const s = K + (C[0] + C[1]) / 2 - (P[0] + P[1]) / 2; return s > 0 ? s : null; }
const spotDe = (tk, d) => { const k = tk + "|" + d; if (SP.has(k)) return SP.get(k); const s = spotOk(leer(tk, d), d); SP.set(k, s); return s; };
const ma20De = (tk, d) => { const todos = cad.dias(tk); const i = todos.indexOf(d);
  if (i < 20) return null;
  const p = todos.slice(i - 20, i).map((x) => spotDe(tk, x)).filter((x) => x != null);
  const s = spotDe(tk, d);
  return (p.length >= 15 && s != null) ? s / (p.reduce((a, b) => a + b, 0) / p.length) - 1 : null; };
// ── golpes de call, para la desnuda ──
const GOLPE = new Map();
for (const f of readdirSync(FDIR)) {
  const g = /^([A-Z]+)_d(\d{8})\.json$/.exec(f); if (!g) continue;
  const [, tk, dia] = g;
  if (!A.includes(tk) || dia < "20210101" || dia > "20260819") continue;
  let L; try { L = JSON.parse(readFileSync(join(FDIR, f), "utf8")); } catch { continue; }
  let hay = false; const pc = new Map();
  for (const o of L) {
    if (o.l !== "C" || !(o.ask > 0 && o.precio >= o.ask) || o.prima < 500000) continue;
    if (o.hora && o.hora.slice(11, 16) < "14:00") continue;
    hay = true; const k = o.exp + "|" + o.K; pc.set(k, (pc.get(k) || 0) + o.tam); }
  if (hay) GOLPE.set(tk + "|" + dia, pc); }
// ── dominancia, para el Missile ──
const DOM = new Map();
for (const f of readdirSync(FDIR)) {
  const g = /^(TSLA)_d(\d{8})\.json$/.exec(f); if (!g) continue;
  const dia = g[2]; if (dia < "20210101") continue;
  let L; try { L = JSON.parse(readFileSync(join(FDIR, f), "utf8")); } catch { continue; }
  let al = 0, ba = 0, n = 0;
  for (const o of L) { if (!(o.ask > 0 && o.bid > 0 && o.prima > 0)) continue;
    const c = o.precio >= o.ask, v = o.precio <= o.bid; if (!c && !v) continue;
    n++; if ((o.l === "C" && c) || (o.l === "P" && v)) al += o.prima; else ba += o.prima; }
  if (n >= 5) DOM.set(dia, (al - ba) / (al + ba)); }
function larga(tk, d) {
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
// ══ 1. LA DESNUDA ══
const DESNUDA = [];
process.stdout.write("\n  desnuda: ");
for (const tk of A) {
  process.stdout.write(tk + " ");
  const todos = cad.dias(tk);
  const iDe = new Map(); todos.forEach((d, i) => iDe.set(d, i));
  for (const d of todos.filter((x) => x >= "20210101" && x <= "20260819")) {
    const ma = ma20De(tk, d); if (ma == null || ma >= 0) continue;
    const i = iDe.get(d); const ayer = i > 0 ? todos[i - 1] : null;
    const g = ayer ? GOLPE.get(tk + "|" + ayer) : null; if (!g) continue;
    const oiV = i > 1 ? oiA.leer(tk, todos[i - 2]) : null;
    let vsOI = 0;
    if (oiV) for (const [k, tam] of g) { const [exp, K] = k.split("|");
      const o = oiV[exp] && oiV[exp][K + "|C"]; const n = Array.isArray(o) ? o[0] : o;
      if (n > 0) vsOI = Math.max(vsOI, tam / n); }
    if (!(vsOI >= 12)) continue;
    const L = larga(tk, d); if (!L) continue;
    const cam = [];
    for (const x of todos.filter((y) => y > d && y <= L.exp)) {
      const ch = leer(tk, x); if (!ch) continue;
      const q = ch[L.exp] && ch[L.exp][L.K + "|C"]; if (!q || !(q[0] > 0)) continue;
      cam.push([x, q[0] / L.ask]); if (cam.length >= PLAZO) break; }
    if (cam.length < 15) continue;
    let r = null;
    for (const [x, m] of cam) { r = { mult: m, dSal: x }; if (m <= SUELO) break; }
    DESNUDA.push({ fuente: "desnuda", tk, dC: d, y: d.slice(0, 4), ma, coste: L.ask * 100,
                   tam: TAM_DESNUDA, mult: r.mult, dSal: r.dSal }); } }
// ══ 2. EL MISSILE (TSLA, su pre-registro tal cual) ══
process.stdout.write("TSLA ");
const MAG = (f) => f.dentro && f.dte >= 5 && f.ask * 100 >= 10000 && f.hora >= "14:00" && f.vsOI >= 12;
const candT = cargar().filter((f) => f.tk === "TSLA").filter(MAG);
for (const f of candT) f.ma = ma20De("TSLA", f.dC);
const porDiaT = new Map();
for (const f of candT.filter((x) => x.ma != null && x.ma < 0)) {
  if (!porDiaT.has(f.dC)) porDiaT.set(f.dC, []); porDiaT.get(f.dC).push(f); }
const MISSILE = [];
for (const G of porDiaT.values()) {
  const f = G.reduce((a, b) => (Number(b.exp) > Number(a.exp) || (Number(b.exp) === Number(a.exp) && b.prof < a.prof)) ? b : a);
  const dm = DOM.get(f.dia);
  const ac = dm == null ? 0 : (f.l === "P" ? -1 : 1) * dm;
  const confirma = ac >= 0.3 || (f.golpes >= 2 && f.golpes < 10);
  const pc = confirma ? 0.08 : 0.12;
  let n = 0, r = null;
  for (const [d, bid] of f.camino) { n++; const m = bid / f.ask; r = { mult: m, dSal: d };
    if (m >= 1.50) { r = { mult: 1.50, dSal: d }; break; }
    if (m <= 0.50) { r = { mult: 0.50, dSal: d }; break; }
    const s = spotDe("TSLA", d);
    if (s != null) { const mv = f.l === "P" ? (f.spot - s) / f.spot : (s - f.spot) / f.spot;
      if (mv >= pc) break; }
    if (n >= 60) break; }
  MISSILE.push({ fuente: "missile", tk: "TSLA", dC: f.dC, y: f.dC.slice(0, 4), ma: f.ma,
                 coste: f.ask * 100, tam: confirma ? 0.50 : 0.25, mult: r.mult, dSal: r.dSal }); }
console.log("\n");
// ── SPY ──
const DIAS = cad.dias("SPY").filter((d) => d >= "20210101" && d <= "20260819");
const pSPY = new Map();
for (const d of DIAS) { const s = spotDe("SPY", d); if (s > 0) pSPY.set(d, s); }
const DD = DIAS.filter((d) => pSPY.has(d));
const med = (X) => { const B = [...X].sort((a, b) => a - b); return B[Math.floor(B.length / 2)]; };
const an = (f, c) => 100 * (Math.pow(Math.max(f, 1) / c, 1 / ANOS) - 1);
function cuenta({ L, capital, modo = "spy", hasta = null, tamMissile = null }) {
  const intD = Math.pow(1.033, 1 / 252) - 1, divD = Math.pow(1 + DIV_SPY, 1 / 252) - 1;
  const dias = hasta ? DD.filter((d) => d <= hasta) : DD;
  const porDia = new Map();
  for (const x of L) { if (!porDia.has(x.dC)) porDia.set(x.dC, []); porDia.get(x.dC).push(x); }
  let caja = capital, acc = 0, ab = [], tom = [], pico = capital, peor = 0;
  for (const hoy of dias) {
    const p = pSPY.get(hoy);
    if (modo === "spy") acc *= (1 + divD); else caja *= (1 + intD);
    for (let i = ab.length - 1; i >= 0; i--) if (ab[i].dSal <= hoy) { caja += ab[i].dinero * ab[i].mult; ab.splice(i, 1); }
    const inv = () => ab.reduce((a, b) => a + b.dinero, 0);
    for (const x of (porDia.get(hoy) || []).slice().sort((a, b) => a.ma - b.ma)) {
      if (ab.length >= HUECOS) break;
      if (ab.some((o) => o.tk === x.tk)) continue;
      const patr = caja + acc * p + inv();
      const tam = (x.fuente === "missile" && tamMissile != null) ? tamMissile : x.tam;
      const tope = patr * tam;
      if (modo === "spy") { const falta = Math.min(tope, patr) - caja;
        if (falta > 0 && acc > 0) { const v = Math.min(acc, falta / p); acc -= v; caja += v * p; } }
      const n = Math.floor(Math.min(tope, caja) / x.coste);
      if (n < 1) continue;
      const dinero = n * x.coste;
      caja -= dinero; ab.push({ ...x, dinero }); tom.push({ ...x, dinero, gana: dinero * (x.mult - 1) }); }
    if (modo === "spy" && caja > 0) { acc += caja / p; caja = 0; }
    const v = caja + acc * p + inv();
    if (v > pico) pico = v; const dd = 1 - v / pico; if (dd > peor) peor = dd; }
  const p = pSPY.get(dias[dias.length - 1]);
  let fin = caja + acc * p; for (const x of ab) fin += x.dinero * x.mult;
  return { final: fin, caida: 100 * peor, tom }; }
function banda(op, base) { const R = [], C = [], paso = base * 0.0083;
  for (let c = base * 0.917; c <= base * 1.084; c += paso) { const q = cuenta({ ...op, capital: c }); R.push(an(q.final, c)); C.push(q.caida); }
  return { a: med(R), c: med(C) }; }
const TODO = [...DESNUDA, ...MISSILE].sort((a, b) => a.dC.localeCompare(b.dC));
console.log("  ══ AUDIT ══");
const spySolo = 60000 * (pSPY.get(DD[DD.length - 1]) / pSPY.get(DD[0])) * Math.pow(1 + DIV_SPY, ANOS);
const ctrl = cuenta({ L: [], capital: 60000, modo: "spy" });
console.log("  control sin señales = SPY con dividendos: " + D(ctrl.final) + " vs " + D(spySolo) + (Math.abs(ctrl.final - spySolo) < 500 ? "  ✓" : "  ⚠"));
console.log("  señales: desnuda " + DESNUDA.length + "  ·  Missile " + MISSILE.length + " (esperado 34)" + (MISSILE.length === 34 ? " ✓" : " ⚠"));
console.log("");
console.log("  ══ CADA PIEZA, Y LAS TRES JUNTAS ══   mediana de 21 capitales · 6 huecos · efectivo en SPY");
console.log("");
console.log("  " + "".padEnd(40) + "al año".padStart(10) + "caída".padStart(9) + "ops".padStart(6));
const CASOS = [
  ["sólo SPY (comprar y dormir)", [], null],
  ["sólo la desnuda 90d + SPY", DESNUDA, null],
  ["sólo el TSLA Missile + SPY", MISSILE, null],
  ["🎯 las dos + SPY (Missile a su tamaño)", TODO, null],
  ["🎯 las dos + SPY (Missile al 15%)", TODO, 0.15],
];
for (const [nom, L, tm] of CASOS) {
  const b = banda({ L, modo: "spy", tamMissile: tm }, 60000);
  const q = cuenta({ L, capital: 60000, modo: "spy", tamMissile: tm });
  console.log("  " + nom.padEnd(40) + (b.a.toFixed(1) + "%").padStart(10) + ("−" + b.c.toFixed(0) + "%").padStart(9) + String(q.tom.length).padStart(6)); }
for (const [nom, L, tm] of CASOS.slice(3)) {
  const q = cuenta({ L, capital: 60000, modo: "spy", tamMissile: tm });
  console.log("");
  console.log("  ── " + nom + " ──");
  console.log("  " + "año".padEnd(7) + "valor".padStart(13) + "% del año".padStart(11) + "ops".padStart(6) + "desnuda".padStart(9) + "missile".padStart(9));
  let v0 = 60000;
  for (const y of ["2021","2022","2023","2024","2025","2026"]) {
    const fin = [...DD].reverse().find((d) => d.startsWith(y)); if (!fin) continue;
    const r = cuenta({ L: L.filter((x) => x.dC <= fin), capital: 60000, modo: "spy", hasta: fin, tamMissile: tm });
    const del = q.tom.filter((x) => x.dC.startsWith(y));
    console.log("  " + y.padEnd(7) + D(r.final).padStart(13) +
      (((r.final / v0 - 1) >= 0 ? "+" : "−") + Math.abs(100 * (r.final / v0 - 1)).toFixed(0) + "%").padStart(11) +
      String(del.length).padStart(6) + String(del.filter((x) => x.fuente === "desnuda").length).padStart(9) +
      String(del.filter((x) => x.fuente === "missile").length).padStart(9));
    v0 = r.final; }
  const g = q.tom.filter((x) => x.gana > 0).length;
  console.log("  TOTAL: " + D(q.final) + "  ·  " + an(q.final, 60000).toFixed(1) + "% al año  ·  caída −" + q.caida.toFixed(0) +
    "%  ·  " + q.tom.length + " ops  ·  acierta " + (100 * g / Math.max(1, q.tom.length)).toFixed(0) + "%"); }
console.log("");
console.log("  ⚠️ La desnuda es MITAD A y está afinada sobre ella. El Missile es EN MUESTRA sobre TSLA.");
console.log("  ⚠️ El examen (mitad B) NO se ha hecho.");
console.log("");
