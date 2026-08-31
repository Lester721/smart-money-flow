// EL SUELO DEL CONJUNTO + AUDITORIA DE LOS NUMEROS QUE SE ENSEÑARON.
//
// Lester (2026-08-27): *"mide el suelo del conjunto y valida que no me este mintiendo... ya
// deberias auditar por default antes de mostrarme nada"*.
//
// PARTE 1 — AUDITORIA de $202.630 / 24,1% / −13% y $1.272.500 / 29,3% / −17%:
//   a) ¿la suma de las operaciones cuadra con el saldo final?
//   b) ¿alguna posicion pasa del 50% de la cuenta? (el "tope 50%" que se afirmo)
//   c) ¿alguna pieza mira al futuro?
//   d) ¿cuanto aportan las 3 mayores?
//
// PARTE 2 — EL SUELO. Cada pieza de la regla se eligio mirando estos mismos seis años. Aqui se
// corren TODAS las combinaciones razonables de las cinco piezas y se mira la DISTRIBUCION, no el
// mejor. El suelo honesto es el percentil bajo de esa distribucion.
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
const MAS = [10, 15, 20, 25, 30];
const SALIDAS = [0.06, 0.08, 0.10, 0.12];
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
    sal[pc] = ult;
  }
  const d = DOM.get(f.tk + "|" + f.dia);
  const hh = Number(f.hora.slice(0, 2)) + Number(f.hora.slice(3)) / 60;
  CAND.push({ ...f, y, ma, sal, hh,
    dom: (d == null ? 0 : (f.l === "P" ? -1 : 1) * d) >= 0.3,
    rep: f.golpes >= 2 && f.golpes < 10 });
}
CAND.sort((a, b) => a.dC.localeCompare(b.dC));
const SEL = {
  "venc. mas lejano": (G) => G.reduce((a, b) => (Number(b.exp) > Number(a.exp) || (Number(b.exp) === Number(a.exp) && b.prof < a.prof)) ? b : a),
  "mas cerca del dinero": (G) => G.reduce((a, b) => b.prof < a.prof ? b : a),
  "el golpe menor": (G) => G.reduce((a, b) => b.prima < a.prima ? b : a),
};
const TAM = {
  "solo dominancia x2": (x) => x.dom ? 2 : 1,
  "cualquiera x2": (x) => (x.dom || x.rep) ? 2 : 1,
};
function construir({ ma, salida, sel, hora }) {
  const L = CAND.filter((x) => x.hh >= hora && x.ma[ma] != null && x.ma[ma] < 0);
  const g = new Map();
  for (const f of L) { const k = f.tk + f.dC; if (!g.has(k)) g.set(k, []); g.get(k).push(f); }
  return [...g.values()].map((G) => { const f = G.length === 1 ? G[0] : SEL[sel](G);
    return { ...f, mult: f.sal[salida].mult, dSal: f.sal[salida].dSal }; })
    .sort((a, b) => a.dC.localeCompare(b.dC));
}
function cuenta(L, { capital, maxAb = 4, base = 0.25, mult }) {
  let caja = capital, ab = [], tomadas = [], pico = capital, peor = 0, maxFrac = 0;
  const fechas = [...new Set([...L.map((x) => x.dC), ...L.map((x) => x.dSal)])].sort();
  const porDia = new Map();
  for (const x of L) { if (!porDia.has(x.dC)) porDia.set(x.dC, []); porDia.get(x.dC).push(x); }
  const inv = () => ab.reduce((a, b) => a + b.dinero, 0);
  for (const hoy of fechas) {
    for (let i = ab.length - 1; i >= 0; i--) if (ab[i].dSal <= hoy) { caja += ab[i].dinero * ab[i].mult; ab.splice(i, 1); }
    for (const x of (porDia.get(hoy) || [])) {
      if (ab.length >= maxAb) continue;
      const patr = caja + inv();
      const n = Math.floor(Math.min(patr * base * mult(x), caja) / (x.ask * 100));
      if (n < 1) continue;
      const dinero = n * x.ask * 100;
      const frac = dinero / patr; if (frac > maxFrac) maxFrac = frac;
      caja -= dinero; const op = { ...x, dinero, n }; ab.push(op); tomadas.push(op);
    }
    const v = caja + inv(); if (v > pico) pico = v;
    const dd = 1 - v / pico; if (dd > peor) peor = dd;
  }
  for (const x of ab) caja += x.dinero * x.mult;
  return { final: caja, tomadas, caida: 100 * peor, maxFrac: 100 * maxFrac };
}
const anual = (f, c) => 100 * (Math.pow(Math.max(f, 1) / c, 1 / 5.63) - 1);
// ══════════════ PARTE 1 — AUDITORIA ══════════════
console.log("");
console.log("  ══════════ AUDITORIA DE LO QUE SE ENSEÑO ══════════");
console.log("");
const ELEGIDA = { ma: 20, salida: 0.08, sel: "venc. mas lejano", hora: 14.5 };
const L = construir(ELEGIDA);
console.log("  señales de la regla elegida: " + L.length);
for (const [cap, esperado, caidaEsp] of [[60000, 202630, 13], [300000, 1272500, 17]]) {
  const q = cuenta(L, { capital: cap, mult: TAM["cualquiera x2"] });
  const suma = q.tomadas.reduce((a, x) => a + x.dinero * (x.mult - 1), 0);
  console.log("");
  console.log("  ── cuenta de " + D(cap) + " ──");
  console.log("     saldo final ............... " + D(q.final) + "  (se dijo " + D(esperado) + ")" +
    (Math.abs(q.final - esperado) < 2 ? "  ✓" : "  ⚠ NO COINCIDE"));
  console.log("     al año .................... " + anual(q.final, cap).toFixed(1) + "%");
  console.log("     ¿cuadra la suma? .......... " + D(cap) + " + " + D(suma) + " = " + D(cap + suma) +
    (Math.abs(cap + suma - q.final) < 1 ? "  ✓" : "  ⚠ NO CUADRA"));
  console.log("     peor caida ................ −" + q.caida.toFixed(0) + "%  (se dijo −" + caidaEsp + "%)" +
    (Math.abs(q.caida - caidaEsp) < 1.5 ? "  ✓" : "  ⚠ NO COINCIDE"));
  console.log("     posicion MAYOR abierta .... " + q.maxFrac.toFixed(1) + "% del patrimonio" +
    (q.maxFrac <= 50.5 ? "  ✓ nunca pasa del 50%" : "  ⚠ PASA DEL 50%"));
  const ops = q.tomadas.map((x) => x.dinero * (x.mult - 1)).sort((a, b) => b - a);
  const tot = ops.reduce((a, b) => a + b, 0);
  console.log("     las 3 mayores ............. " + D(ops.slice(0, 3).reduce((a, b) => a + b, 0)) + " de " + D(tot) +
    "  (" + (100 * ops.slice(0, 3).reduce((a, b) => a + b, 0) / tot).toFixed(0) + "%)");
}
console.log("");
let futuro = 0;
for (const x of L) { if (!(x.dia < x.dC)) futuro++; if (x.camino && x.camino[0] && x.camino[0][0] <= x.dC) futuro++; }
console.log("  ¿alguna pieza mira al futuro? " + (futuro === 0 ? "NO ✓  (hora y golpes son del dia del golpe; media y dominancia, de antes de comprar)" : "⚠ " + futuro));
// ══════════════ PARTE 2 — EL SUELO ══════════════
console.log("");
console.log("  ══════════ EL SUELO DEL CONJUNTO ══════════");
console.log("");
const R = [];
for (const ma of MAS) for (const salida of SALIDAS) for (const sel of Object.keys(SEL))
  for (const hora of [14.0, 14.5]) for (const tam of Object.keys(TAM)) {
    const LL = construir({ ma, salida, sel, hora });
    if (LL.length < 20) continue;
    const a = cuenta(LL, { capital: 60000, mult: TAM[tam] });
    const b = cuenta(LL, { capital: 300000, mult: TAM[tam] });
    R.push({ ma, salida, sel, hora, tam, n: LL.length,
      pq: anual(a.final, 60000), gr: anual(b.final, 300000), caida: a.caida,
      esLaElegida: ma === 20 && salida === 0.08 && sel === "venc. mas lejano" && hora === 14.5 && tam === "cualquiera x2" });
  }
console.log("  combinaciones razonables corridas: " + R.length);
console.log("  (5 medias × 4 salidas × 3 criterios de seleccion × 2 horas × 2 escalas de tamaño)");
const pq = R.map((x) => x.pq).sort((a, b) => a - b);
const gr = R.map((x) => x.gr).sort((a, b) => a - b);
const P = (v, p) => v[Math.floor(v.length * p)];
console.log("");
console.log("  " + "".padEnd(22) + "TU CUENTA".padStart(12) + "CUENTA GRANDE".padStart(16));
for (const [p, nom] of [[0, "el PEOR"], [0.10, "percentil 10"], [0.25, "percentil 25"],
                        [0.50, "MEDIANA"], [0.75, "percentil 75"], [0.999, "el MEJOR"]])
  console.log("  " + nom.padEnd(22) + (P(pq, p).toFixed(1) + "%").padStart(12) + (P(gr, p).toFixed(1) + "%").padStart(16));
const el = R.find((x) => x.esLaElegida);
console.log("");
console.log("  LA ELEGIDA: " + el.pq.toFixed(1) + "% (tuya) · " + el.gr.toFixed(1) + "% (grande)");
console.log("     esta en el percentil " + (100 * R.filter((x) => x.pq < el.pq).length / R.length).toFixed(0) +
  " de las " + R.length + " combinaciones (tu cuenta)");
console.log("  el liston SPY: 13,9%");
console.log("");
console.log("  ¿cuantas combinaciones baten a SPY? " + R.filter((x) => x.pq > 13.9).length + " de " + R.length +
  "  (" + (100 * R.filter((x) => x.pq > 13.9).length / R.length).toFixed(0) + "%)");
console.log("  ¿cuantas pierden dinero? " + R.filter((x) => x.pq < 0).length + " de " + R.length);
console.log("");
console.log("  ══ LAS 6 PEORES COMBINACIONES ══");
console.log("");
console.log("  " + "media".padStart(7) + "salida".padStart(8) + "seleccion".padStart(24) + "hora".padStart(7) + "tamaño".padStart(21) + "n".padStart(5) + "tuya".padStart(9) + "grande".padStart(9));
for (const x of R.slice().sort((a, b) => a.pq - b.pq).slice(0, 6))
  console.log("  " + String(x.ma).padStart(7) + ((100 * x.salida).toFixed(0) + "%").padStart(8) + x.sel.padStart(24) +
    (x.hora === 14 ? "14:00" : "14:30").padStart(7) + x.tam.padStart(21) + String(x.n).padStart(5) +
    (x.pq.toFixed(1) + "%").padStart(9) + (x.gr.toFixed(1) + "%").padStart(9));
console.log("");
