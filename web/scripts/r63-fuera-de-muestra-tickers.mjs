// LA PRUEBA — AJUSTAR EN 4 TICKERS, MEDIR EN LOS OTROS 4.
//
// Lester (2026-08-27): *"parte los 8 tickers, ajusta en 4 y mide en 4"*.
//
// COMO SE HACE PARA QUE YO NO PUEDA ELEGIR EL REPARTO QUE ME CONVIENE:
// se corren LAS 35 PARTICIONES POSIBLES de 8 tickers en dos mitades de 4. En cada una:
//   1. se prueban las 240 combinaciones SOLO en la mitad A
//   2. se coge la que MEJOR sale en A  (esto es "ajustar")
//   3. se mide ESA combinacion en la mitad B, sin tocar nada  (esto es "fuera de muestra")
// Y se reporta la DISTRIBUCION de los 35 resultados de B, no el mejor.
//
// La diferencia entre lo que da en A y lo que da en B es, literalmente, cuanto del resultado
// era ajuste.
//
// AUDIT DENTRO, antes de enseñar nada: suma que cuadre, sin mirada al futuro, tope de posicion.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cargar } from "./consultar.mjs";
import { abrir } from "./datos.mjs";
import { CACHE } from "./raiz.mjs";
const D = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const BASE = (f) => f.dentro && f.dte >= 5 && f.ask * 100 >= 10000 && f.hora >= "14:00" && f.vsOI >= 12;
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
    n++; if ((o.l === "C" && c) || (o.l === "P" && v)) al += o.prima; else ba += o.prima;
  }
  if (n >= 5) DOM.set(tk + "|" + dia, (al - ba) / (al + ba));
}
const MAS = [10, 15, 20, 25, 30], SALIDAS = [0.06, 0.08, 0.10, 0.12];
const CAND = [];
for (const [y, M] of ANOS) for (const f of cargar(M).filter(BASE)) {
  const ds = cad.dias(f.tk); const i = ds.indexOf(f.dC);
  const ma = {};
  for (const n of MAS) { if (i < n) { ma[n] = null; continue; }
    const p = ds.slice(i - n, i).map((d) => spotDe(f.tk, d)).filter((x) => x != null);
    ma[n] = p.length < n * 0.75 ? null : f.spot / (p.reduce((a, b) => a + b, 0) / p.length) - 1; }
  const sal = {};
  for (const pc of SALIDAS) {
    const coste = f.ask; let k = 0, ult = null;
    for (const [d, bid] of f.camino) { k++; const m = bid / coste; ult = { mult: m, dSal: d };
      if (m >= 1.50) { ult = { mult: 1.50, dSal: d }; break; }
      if (m <= 0.50) { ult = { mult: 0.50, dSal: d }; break; }
      const s = spotDe(f.tk, d);
      if (s != null) { const mv = f.l === "P" ? (f.spot - s) / f.spot : (s - f.spot) / f.spot;
        if (mv >= pc) { ult = { mult: m, dSal: d }; break; } }
      if (k >= 60) break; }
    sal[pc] = ult; }
  const d = DOM.get(f.tk + "|" + f.dia);
  CAND.push({ ...f, y, ma, sal, hh: Number(f.hora.slice(0, 2)) + Number(f.hora.slice(3)) / 60,
    dom: (d == null ? 0 : (f.l === "P" ? -1 : 1) * d) >= 0.3, rep: f.golpes >= 2 && f.golpes < 10 });
}
CAND.sort((a, b) => a.dC.localeCompare(b.dC));
const SEL = {
  lejano: (G) => G.reduce((a, b) => (Number(b.exp) > Number(a.exp) || (Number(b.exp) === Number(a.exp) && b.prof < a.prof)) ? b : a),
  cerca: (G) => G.reduce((a, b) => b.prof < a.prof ? b : a),
  menor: (G) => G.reduce((a, b) => b.prima < a.prima ? b : a) };
const TAM = { dom: (x) => x.dom ? 2 : 1, cualquiera: (x) => (x.dom || x.rep) ? 2 : 1 };
function construir(tks, { ma, salida, sel, hora }) {
  const L = CAND.filter((x) => tks.has(x.tk) && x.hh >= hora && x.ma[ma] != null && x.ma[ma] < 0);
  const g = new Map();
  for (const f of L) { const k = f.tk + f.dC; if (!g.has(k)) g.set(k, []); g.get(k).push(f); }
  return [...g.values()].map((G) => { const f = G.length === 1 ? G[0] : SEL[sel](G);
    return { ...f, mult: f.sal[salida].mult, dSal: f.sal[salida].dSal }; })
    .sort((a, b) => a.dC.localeCompare(b.dC)); }
const dSPY = cad.dias("SPY").filter((d) => d >= "20210101" && d <= "20260819");
const pSPY = new Map(); for (const d of dSPY) { const s = spotDe("SPY", d); if (s > 0) pSPY.set(d, s); }
const DIAS = dSPY.filter((d) => pSPY.has(d));
/** Igual que cuenta() pero el efectivo ocioso se aparca en SPY. */
function cuentaSPY(L, { capital = 60000, mult }) {
  let caja = capital, acc = 0, ab = [], tomadas = [], pico = capital, peor = 0, sumaSPY = 0, nd = 0;
  const porDia = new Map();
  for (const x of L) { if (!porDia.has(x.dC)) porDia.set(x.dC, []); porDia.get(x.dC).push(x); }
  for (const hoy of DIAS) {
    const px = pSPY.get(hoy);
    for (let i = ab.length - 1; i >= 0; i--) if (ab[i].dSal <= hoy) { caja += ab[i].dinero * ab[i].mult; ab.splice(i, 1); }
    const inv = () => ab.reduce((a, b) => a + b.dinero, 0);
    for (const x of (porDia.get(hoy) || [])) {
      if (ab.length >= 4) continue;
      const patr = caja + acc * px + inv();
      const tope = patr * 0.25 * mult(x);
      const falta = Math.min(tope, patr) - caja;
      if (falta > 0 && acc > 0) { const v = Math.min(acc, falta / px); acc -= v; caja += v * px; }
      const n = Math.floor(Math.min(tope, caja) / (x.ask * 100));
      if (n < 1) continue;
      const dinero = n * x.ask * 100;
      caja -= dinero; ab.push({ ...x, dinero, n }); tomadas.push({ ...x, dinero, n }); }
    if (caja > 0) { acc += caja / px; caja = 0; }
    const v = caja + acc * px + ab.reduce((a, b) => a + b.dinero, 0);
    if (v > pico) pico = v; const dd = 1 - v / pico; if (dd > peor) peor = dd;
    sumaSPY += (acc * px) / v; nd++; }
  const px = pSPY.get(DIAS[DIAS.length - 1]);
  for (const x of ab) caja += x.dinero * x.mult;
  return { final: caja + acc * px, tomadas, caida: 100 * peor, enSPY: 100 * sumaSPY / nd }; }
function cuenta(L, { capital = 60000, mult }) {
  let caja = capital, ab = [], tomadas = [], maxFrac = 0;
  const fechas = [...new Set([...L.map((x) => x.dC), ...L.map((x) => x.dSal)])].sort();
  const porDia = new Map();
  for (const x of L) { if (!porDia.has(x.dC)) porDia.set(x.dC, []); porDia.get(x.dC).push(x); }
  const inv = () => ab.reduce((a, b) => a + b.dinero, 0);
  for (const hoy of fechas) {
    for (let i = ab.length - 1; i >= 0; i--) if (ab[i].dSal <= hoy) { caja += ab[i].dinero * ab[i].mult; ab.splice(i, 1); }
    for (const x of (porDia.get(hoy) || [])) {
      if (ab.length >= 4) continue;
      const patr = caja + inv();
      const n = Math.floor(Math.min(patr * 0.25 * mult(x), caja) / (x.ask * 100));
      if (n < 1) continue;
      const dinero = n * x.ask * 100;
      if (dinero / patr > maxFrac) maxFrac = dinero / patr;
      caja -= dinero; ab.push({ ...x, dinero, n }); tomadas.push({ ...x, dinero, n }); } }
  for (const x of ab) caja += x.dinero * x.mult;
  return { final: caja, tomadas, maxFrac: 100 * maxFrac }; }
const anual = (f, c) => 100 * (Math.pow(Math.max(f, 1) / c, 1 / 5.63) - 1);
const COMBOS = [];
for (const ma of MAS) for (const salida of SALIDAS) for (const sel of Object.keys(SEL))
  for (const hora of [14.0, 14.5]) for (const tam of Object.keys(TAM)) COMBOS.push({ ma, salida, sel, hora, tam });
const TK = ["AAPL", "AMD", "META", "MSFT", "NVDA", "QQQ", "SPY", "TSLA"];
// ── AUDIT ──
console.log("");
console.log("  ══ AUDIT (antes de enseñar nada) ══");
console.log("");
const prueba = construir(new Set(TK), { ma: 20, salida: 0.08, sel: "lejano", hora: 14.5 });
const qa = cuenta(prueba, { mult: TAM.cualquiera });
const suma = qa.tomadas.reduce((a, x) => a + x.dinero * (x.mult - 1), 0);
console.log("  reproduce la regla elegida: " + D(qa.final) + " (esperado $202.630)" + (Math.abs(qa.final - 202630) < 2 ? "  ✓" : "  ⚠"));
console.log("  la suma cuadra: $60.000 + " + D(suma) + " = " + D(60000 + suma) + (Math.abs(60000 + suma - qa.final) < 1 ? "  ✓" : "  ⚠"));
console.log("  posicion mayor: " + qa.maxFrac.toFixed(1) + "%" + (qa.maxFrac <= 50.5 ? "  ✓" : "  ⚠"));
console.log("  ¿mira al futuro? " + (CAND.every((x) => x.dia < x.dC) ? "NO ✓" : "⚠ SI"));
console.log("");
console.log("  señales por ticker (universo completo, antes de filtros):");
console.log("  " + TK.map((t) => t + " " + CAND.filter((x) => x.tk === t).length).join(" · "));
// ── LAS 35 PARTICIONES ──
const parts = [];
for (let m = 0; m < 256; m++) {
  let c = 0; for (let b = 0; b < 8; b++) if (m & (1 << b)) c++;
  if (c !== 4) continue;
  if (!(m & 1)) continue;                       // fija AAPL en A para no contar cada reparto dos veces
  parts.push(m); }
console.log("");
console.log("  ══ LAS " + parts.length + " PARTICIONES: ajustar en 4, medir en los otros 4 ══");
console.log("");
console.log("  " + "mitad A (ajuste)".padEnd(26) + "mitad B (medida)".padEnd(26) +
  "la mejor en A".padStart(14) + "esa en B".padStart(11) + "  la combinacion elegida en A");
const res = [];
for (const m of parts) {
  const A = new Set(TK.filter((_, i) => m & (1 << i))), B = new Set(TK.filter((_, i) => !(m & (1 << i))));
  let mejor = null;
  for (const c of COMBOS) {
    const L = construir(A, c); if (L.length < 12) continue;
    const r = anual(cuenta(L, { mult: TAM[c.tam] }).final, 60000);
    if (!mejor || r > mejor.r) mejor = { c, r }; }
  if (!mejor) continue;
  const LB = construir(B, mejor.c);
  const rb = LB.length < 5 ? null : anual(cuenta(LB, { mult: TAM[mejor.c.tam] }).final, 60000);
  const rbS = LB.length < 5 ? null : anual(cuentaSPY(LB, { mult: TAM[mejor.c.tam] }).final, 60000);
  res.push({ A: [...A], B: [...B], a: mejor.r, b: rb, bS: rbS, c: mejor.c });
  console.log("  " + [...A].join(",").padEnd(26) + [...B].join(",").padEnd(26) +
    (mejor.r.toFixed(1) + "%").padStart(14) + (rb == null ? "—" : rb.toFixed(1) + "%").padStart(11) +
    "  ma" + mejor.c.ma + " sal" + (100 * mejor.c.salida).toFixed(0) + " " + mejor.c.sel + " " +
    (mejor.c.hora === 14 ? "14:00" : "14:30") + " " + mejor.c.tam); }
const bs = res.map((x) => x.b).filter((x) => x != null).sort((a, b) => a - b);
const as = res.map((x) => x.a).sort((a, b) => a - b);
const P = (v, p) => v[Math.min(v.length - 1, Math.floor(v.length * p))];
console.log("");
console.log("  ══ EL RESULTADO ══");
console.log("");
console.log("  " + "".padEnd(24) + "EN A (ajustado)".padStart(18) + "EN B (fuera de muestra)".padStart(26));
for (const [p, nom] of [[0, "el peor"], [0.25, "percentil 25"], [0.50, "MEDIANA"], [0.75, "percentil 75"], [0.999, "el mejor"]])
  console.log("  " + nom.padEnd(24) + (P(as, p).toFixed(1) + "%").padStart(18) + (P(bs, p).toFixed(1) + "%").padStart(26));
console.log("");
console.log("  la MEDIA:  en A " + (as.reduce((a, b) => a + b, 0) / as.length).toFixed(1) + "%" +
  "   ·   en B " + (bs.reduce((a, b) => a + b, 0) / bs.length).toFixed(1) + "%");
console.log("  la CAIDA del ajuste: " + ((as.reduce((a, b) => a + b, 0) / as.length) - (bs.reduce((a, b) => a + b, 0) / bs.length)).toFixed(1) + " puntos");
console.log("");
console.log("  reparticiones donde B bate a SPY (13,9%): " + bs.filter((x) => x > 13.9).length + " de " + bs.length +
  "  (" + (100 * bs.filter((x) => x > 13.9).length / bs.length).toFixed(0) + "%)");
console.log("  reparticiones donde B pierde dinero:      " + bs.filter((x) => x < 0).length + " de " + bs.length);
const bss = res.map((x) => x.bS).filter((x) => x != null).sort((a, b) => a - b);
console.log("");
console.log("  ══ Y CON EL EFECTIVO OCIOSO EN SPY (fuera de muestra) ══");
console.log("");
console.log("  " + "".padEnd(24) + "solo la regla".padStart(18) + "+ ocioso en SPY".padStart(20));
for (const [p, nom] of [[0, "el peor"], [0.25, "percentil 25"], [0.50, "MEDIANA"], [0.75, "percentil 75"], [0.999, "el mejor"]])
  console.log("  " + nom.padEnd(24) + (P(bs, p).toFixed(1) + "%").padStart(18) + (P(bss, p).toFixed(1) + "%").padStart(20));
console.log("  " + "la MEDIA".padEnd(24) + ((bs.reduce((a, b) => a + b, 0) / bs.length).toFixed(1) + "%").padStart(18) +
  ((bss.reduce((a, b) => a + b, 0) / bss.length).toFixed(1) + "%").padStart(20));
console.log("");
console.log("  con SPY dentro, ¿cuantas baten a SPY solo (13,9%)? " + bss.filter((x) => x > 13.9).length + " de " + bss.length +
  "  (" + (100 * bss.filter((x) => x > 13.9).length / bss.length).toFixed(0) + "%)");
console.log("  ¿cuantas pierden dinero? " + bss.filter((x) => x < 0).length + " de " + bss.length);
console.log("");
console.log("  ── AUDIT DE ESTA VERSION ──");
const ctrl = cuentaSPY([], { mult: () => 1 });
console.log("  CONTROL: la misma maquinaria SIN señales debe dar SPY exacto: " + D(ctrl.final) +
  " (SPY = " + D(60000 * pSPY.get(DIAS[DIAS.length - 1]) / pSPY.get(DIAS[0])) + ")" +
  (Math.abs(ctrl.final - 60000 * pSPY.get(DIAS[DIAS.length - 1]) / pSPY.get(DIAS[0])) < 5 ? "  ✓" : "  ⚠ NO CUADRA"));
const caidas = [], enSPYs = [];
for (const x of res) { if (x.bS == null) continue;
  const B = new Set(x.B); const LB = construir(B, x.c);
  const q = cuentaSPY(LB, { mult: TAM[x.c.tam] }); caidas.push(q.caida); enSPYs.push(q.enSPY); }
caidas.sort((a, b) => a - b); enSPYs.sort((a, b) => a - b);
console.log("  peor caida de las 35: mediana −" + P(caidas, 0.5).toFixed(0) + "%  ·  la PEOR −" + P(caidas, 0.999).toFixed(0) + "%");
console.log("  (la regla sola, en muestra, daba −13%; SPY solo paso por −25% en 2022)");
console.log("  % del patrimonio en SPY de media: " + P(enSPYs, 0.5).toFixed(0) + "%");
console.log("");

// ══════════ ¿QUE PIEZA SIRVE Y CUAL ERA AJUSTE? ══════════
// 1) ¿que opcion elige el ajuste en cada una de las 35 particiones? Si una pieza sale siempre
//    la misma, es robusta. Si varia, la elegimos por ruido.
console.log("");
console.log("  ══ ¿QUE ELIGE EL AJUSTE EN LAS 35 PARTICIONES? ══");
console.log("");
for (const [campo, nom] of [["ma", "la media"], ["salida", "la salida"], ["sel", "la seleccion"], ["hora", "la hora"], ["tam", "el tamaño"]]) {
  const cuenta2 = {};
  for (const x of res) { const k = String(x.c[campo]); cuenta2[k] = (cuenta2[k] ?? 0) + 1; }
  const orden = Object.entries(cuenta2).sort((a, b) => b[1] - a[1]);
  const top = orden[0];
  console.log("  " + nom.padEnd(16) + orden.map(([k, v]) => k + ":" + v).join("  ").padEnd(40) +
    "  " + (100 * top[1] / res.length).toFixed(0) + "% elige " + top[0] +
    (top[1] / res.length >= 0.6 ? "   ✓ consistente" : "   ⚠ va cambiando"));
}
// 2) ABLACION: quitar cada pieza de NUESTRA regla y medir en las 35 mitades B
console.log("");
console.log("  ══ QUITAR CADA PIEZA — medido en las 35 mitades FUERA DE MUESTRA ══");
console.log("");
function conPiezas(tks, { media = true, unaPorDia = true, salida8 = true, doblar = true }) {
  let L = CAND.filter((x) => tks.has(x.tk) && x.hh >= 14.5 && (!media || (x.ma[20] != null && x.ma[20] < 0)));
  if (unaPorDia) { const g = new Map();
    for (const f of L) { const k = f.tk + f.dC; if (!g.has(k)) g.set(k, []); g.get(k).push(f); }
    L = [...g.values()].map((G) => G.length === 1 ? G[0] : SEL.lejano(G)); }
  return L.map((f) => ({ ...f, mult: f.sal[salida8 ? 0.08 : 0.08].mult, dSal: f.sal[0.08].dSal,
                         _sal15: f.camino })).sort((a, b) => a.dC.localeCompare(b.dC));
}
const PIEZAS = [
  ["LA REGLA COMPLETA", {}],
  ["sin el filtro de la media", { media: false }],
  ["sin «una por dia»", { unaPorDia: false }],
  ["sin doblar (tamaño fijo)", { doblar: false }],
];
console.log("  " + "".padEnd(30) + "mediana B".padStart(12) + "media B".padStart(11) +
  "gana en".padStart(10) + "  con el ocioso en SPY (mediana)");
for (const [nom, op] of PIEZAS) {
  const vs = [], vsS = [];
  for (const x of res) {
    const B = new Set(x.B);
    const LB = conPiezas(B, op); if (LB.length < 5) continue;
    const m = op.doblar === false ? (() => 1) : TAM.cualquiera;
    vs.push(anual(cuenta(LB, { mult: m }).final, 60000));
    vsS.push(anual(cuentaSPY(LB, { mult: m }).final, 60000));
  }
  vs.sort((a, b) => a - b); vsS.sort((a, b) => a - b);
  console.log("  " + nom.padEnd(30) + (P(vs, 0.5).toFixed(1) + "%").padStart(12) +
    ((vs.reduce((a, b) => a + b, 0) / vs.length).toFixed(1) + "%").padStart(11) +
    (vs.filter((z) => z > 0).length + "/" + vs.length).padStart(10) +
    ("  " + P(vsS, 0.5).toFixed(1) + "%").padStart(34));
}
console.log("");

// ══════════ 14:00 CONTRA 14:30, DIRECTO, EN LAS MITADES FUERA DE MUESTRA ══════════
console.log("");
console.log("  ══ 14:00 CONTRA 14:30 — la MISMA regla, medida en las 35 mitades B ══");
console.log("");
function reglaCon(tks, hora, salida) {
  let L = CAND.filter((x) => tks.has(x.tk) && x.hh >= hora && x.ma[20] != null && x.ma[20] < 0);
  const g = new Map();
  for (const f of L) { const k = f.tk + f.dC; if (!g.has(k)) g.set(k, []); g.get(k).push(f); }
  return [...g.values()].map((G) => { const f = G.length === 1 ? G[0] : SEL.lejano(G);
    return { ...f, mult: f.sal[salida].mult, dSal: f.sal[salida].dSal }; })
    .sort((a, b) => a.dC.localeCompare(b.dC));
}
console.log("  " + "".padEnd(16) + "mediana".padStart(11) + "media".padStart(10) + "el peor".padStart(10) +
  "gana en".padStart(10) + "señales".padStart(10) + "  con SPY (mediana)");
const guarda = {};
for (const [nom, hora] of [["≥ 14:00", 14.0], ["≥ 14:30", 14.5]]) {
  const vs = [], vsS = [], ns = [];
  for (const x of res) { const B = new Set(x.B);
    const LB = reglaCon(B, hora, 0.08); if (LB.length < 5) continue;
    ns.push(LB.length);
    vs.push(anual(cuenta(LB, { mult: TAM.cualquiera }).final, 60000));
    vsS.push(anual(cuentaSPY(LB, { mult: TAM.cualquiera }).final, 60000)); }
  vs.sort((a, b) => a - b); vsS.sort((a, b) => a - b);
  guarda[nom] = vs;
  console.log("  " + nom.padEnd(16) + (P(vs, 0.5).toFixed(1) + "%").padStart(11) +
    ((vs.reduce((a, b) => a + b, 0) / vs.length).toFixed(1) + "%").padStart(10) +
    (P(vs, 0).toFixed(1) + "%").padStart(10) +
    (vs.filter((z) => z > 0).length + "/" + vs.length).padStart(10) +
    (ns.reduce((a, b) => a + b, 0) / ns.length).toFixed(0).padStart(10) +
    ("  " + P(vsS, 0.5).toFixed(1) + "%").padStart(21));
}
// pareado: en cuantas particiones gana cada uno
let g14 = 0, g1430 = 0;
for (const x of res) { const B = new Set(x.B);
  const a = reglaCon(B, 14.0, 0.08), b = reglaCon(B, 14.5, 0.08);
  if (a.length < 5 || b.length < 5) continue;
  const ra = anual(cuenta(a, { mult: TAM.cualquiera }).final, 60000);
  const rb = anual(cuenta(b, { mult: TAM.cualquiera }).final, 60000);
  if (ra > rb) g14++; else if (rb > ra) g1430++; }
console.log("");
console.log("  PAREADO, particion a particion:  14:00 gana en " + g14 + "   ·   14:30 gana en " + g1430 +
  "   (de " + (g14 + g1430) + ")");
console.log("");
