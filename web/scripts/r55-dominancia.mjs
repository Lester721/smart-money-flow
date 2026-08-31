// LA DOMINANCIA — de toda la prima grande que se movió en ese ticker ese día, ¿cuánta se COMPRÓ
// al ask y cuánta se VENDIÓ al bid?
//
// Lester, el 2026-08-27: *"mide las dos ahora y me dices cuál separa"*.
//
//   MEDICIÓN 1 — ¿SEPARA DENTRO DE LAS SEÑALES?  (unidad: el contrato)
//       Sólo puede QUITAR perdedoras. Trece filtros lo han intentado hoy y ninguno lo ha logrado.
//   MEDICIÓN 2 — ¿ES SEÑAL POR SÍ SOLA?          (unidad: el ticker-día)
//       Puede AÑADIR operaciones. ~11.000 observaciones en vez de 81. Terreno nuevo.
//
// ⚠️ LA TRAMPA DE ANOCHE: el 12x movía la acción +0,29% con t=3,0 y no servía, porque el listón
// contra el que ganaba era "la deriva propia del ticker" y ESO NO SE PUEDE COMPRAR. Aquí el
// resultado de la medición 2 se marca como DIAGNÓSTICO hasta que se mida contra algo comprable.
//
// CLASIFICACIÓN (dato puro, sin modelo): precio >= ask -> compra · precio <= bid -> venta.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { cargar, simular } from "./consultar.mjs";
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
/** Movimiento de n dias. NULL si hay un salto >25% dentro (splits y spots malos). */
function mov(tk, d, n) {
  const ds = cad.dias(tk); const i = ds.indexOf(d); if (i < 0 || i + n >= ds.length) return null;
  let prev = spotDe(tk, ds[i]); if (!(prev > 0)) return null; const a = prev;
  for (let k = i + 1; k <= i + n; k++) { const s = spotDe(tk, ds[k]); if (!(s > 0)) return null;
    if (Math.abs(s / prev - 1) > 0.25) return null; prev = s; }
  return prev / a - 1;
}
// ══════════ CONSTRUIR LA DOMINANCIA DE CADA TICKER-DIA ══════════
console.log("");
console.log("  construyendo la dominancia de todos los ticker-dia...");
const DOM = new Map();   // "TK|dia" -> {compra, venta, alcista, bajista, n}
let ficheros = 0, ops = 0;
for (const f of readdirSync(FDIR)) {
  const g = /^([A-Z]+)_d(\d{8})\.json$/.exec(f); if (!g) continue;
  const [, tk, dia] = g;
  if (dia < "20210101") continue;
  let L; try { L = JSON.parse(readFileSync(join(FDIR, f), "utf8")); } catch { continue; }
  if (!L.length) continue;
  ficheros++;
  let compra = 0, venta = 0, alcista = 0, bajista = 0, n = 0;
  for (const o of L) {
    if (!(o.ask > 0 && o.bid > 0 && o.prima > 0)) continue;
    const esCompra = o.precio >= o.ask, esVenta = o.precio <= o.bid;
    if (!esCompra && !esVenta) continue;         // en medio de la horquilla: no se clasifica
    n++; ops++;
    if (esCompra) compra += o.prima; else venta += o.prima;
    // direccional: comprar call o vender put = alcista · comprar put o vender call = bajista
    const al = (o.l === "C" && esCompra) || (o.l === "P" && esVenta);
    if (al) alcista += o.prima; else bajista += o.prima;
  }
  if (n < 5) continue;                            // dias con casi nada no dicen nada
  DOM.set(tk + "|" + dia, {
    compra, venta, alcista, bajista, n,
    // −1 (todo vendido) a +1 (todo comprado): cuanta CONVICCION hay
    bruta: (compra - venta) / (compra + venta),
    // −1 (todo bajista) a +1 (todo alcista): hacia DONDE apunta la cinta
    dir: (alcista - bajista) / (alcista + bajista),
  });
}
console.log("  " + ficheros.toLocaleString("en-US") + " ficheros · " + ops.toLocaleString("en-US") +
  " operaciones clasificadas · " + DOM.size.toLocaleString("en-US") + " ticker-dia con dominancia");
const todas = [...DOM.values()];
const med = (v) => { const s = v.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
console.log("  dominancia BRUTA  → mediana " + med(todas.map((x) => x.bruta)).toFixed(3) +
  "  ·  DIRECCIONAL → mediana " + med(todas.map((x) => x.dir)).toFixed(3));

// ══════════ MEDICION 1 — ¿SEPARA DENTRO DE LAS 81 SEÑALES? ══════════
const O0 = { objetivo: 1.50, suelo: 0.50 };
function salir8(f) { const coste = f.ask; let n = 0, ult = null;
  for (const [d, bid] of f.camino) { n++; const m = bid / coste; ult = { mult: m, dSal: d };
    if (m >= 1.50) return { mult: 1.50, dSal: d }; if (m <= 0.50) return { mult: 0.50, dSal: d };
    const s = spotDe(f.tk, d);
    if (s != null) { const mv = f.l === "P" ? (f.spot - s) / f.spot : (s - f.spot) / f.spot;
      if (mv >= 0.08) return { mult: m, dSal: d }; }
    if (n >= 60) return { mult: m, dSal: d }; }
  return ult; }
function unaPorDia(L) { const g = new Map();
  for (const f of L) { const k = f.tk + f.dC; if (!g.has(k)) g.set(k, []); g.get(k).push(f); }
  return [...g.values()].map((G) => G.reduce((a, b) =>
    (Number(b.exp) > Number(a.exp) || (Number(b.exp) === Number(a.exp) && b.prof < a.prof)) ? b : a
  )).sort((a, b) => a.dC.localeCompare(b.dC)); }
const SEN = [];
for (const [y, M] of ANOS) { const L = cargar(M).filter(MAG);
  for (const f of L) { const ds = cad.dias(f.tk); const i = ds.indexOf(f.dC);
    if (i < 20) { f.ma20 = null; continue; }
    const p = ds.slice(i - 20, i).map((d) => spotDe(f.tk, d)).filter((x) => x != null);
    f.ma20 = p.length < 15 ? null : f.spot / (p.reduce((a, b) => a + b, 0) / p.length) - 1; }
  for (const f of unaPorDia(L.filter((x) => x.ma20 != null && x.ma20 < 0))) {
    const d = DOM.get(f.tk + "|" + f.dia);        // la dominancia del dia del GOLPE (se sabe antes de comprar)
    const r = salir8(f);
    SEN.push({ ...f, y, dom: d ?? null, mult: r.mult, gana: r.mult > 1, din: (r.mult - 1) * f.ask * 100 });
  } }
console.log("");
console.log("  ══════════ MEDICION 1 — ¿SEPARA DENTRO DE LAS SEÑALES? ══════════");
console.log("");
const conD = SEN.filter((s) => s.dom);
console.log("  " + SEN.length + " señales · " + conD.length + " con dominancia del dia del golpe");
const G = conD.filter((s) => s.gana), P = conD.filter((s) => !s.gana);
console.log("");
console.log("  " + "".padEnd(38) + "GANAN".padStart(12) + "PIERDEN".padStart(12));
const cmp = (nom, fn) => console.log("  " + nom.padEnd(38) + med(G.map(fn)).toFixed(3).padStart(12) + med(P.map(fn)).toFixed(3).padStart(12));
cmp("dominancia BRUTA (compra vs venta)", (s) => s.dom.bruta);
cmp("dominancia DIRECCIONAL", (s) => s.dom.dir);
cmp("¿la cinta va CON la señal?", (s) => (s.l === "P" ? -1 : 1) * s.dom.dir);
console.log("");
console.log("  por tramos de «¿la cinta va CON la señal?»:");
console.log("  " + "".padEnd(28) + "n".padStart(5) + "ganan".padStart(8) + "dinero".padStart(13) + "ratio".padStart(8));
const acorde = (s) => (s.l === "P" ? -1 : 1) * s.dom.dir;
for (const [a, b, nom] of [[-2, -0.3, "la cinta EN CONTRA"], [-0.3, 0, "algo en contra"],
                           [0, 0.3, "algo a favor"], [0.3, 2, "la cinta A FAVOR"]]) {
  const L = conD.filter((s) => acorde(s) >= a && acorde(s) < b);
  if (!L.length) { console.log("  " + nom.padEnd(28) + "0".padStart(5)); continue; }
  const g = L.filter((s) => s.gana), p = L.filter((s) => !s.gana);
  const gan = g.reduce((x, s) => x + s.din, 0), per = -p.reduce((x, s) => x + s.din, 0);
  console.log("  " + nom.padEnd(28) + String(L.length).padStart(5) +
    ((100 * g.length / L.length).toFixed(0) + "%").padStart(8) +
    D(gan - per).padStart(13) + (per ? (gan / per).toFixed(2) : "∞").padStart(8));
}

// ══════════ MEDICION 2 — ¿ES SEÑAL POR SI SOLA? ══════════
console.log("");
console.log("  ══════════ MEDICION 2 — ¿ES SEÑAL POR SI SOLA? (unidad: ticker-dia) ══════════");
console.log("");
console.log("  ⚠️ DIAGNOSTICO: mide el movimiento de la ACCION contra su propia deriva — un liston");
console.log("     que NO SE PUEDE COMPRAR. Si separa, el paso siguiente es medirlo con un vehiculo.");
console.log("");
const TK = ["AAPL", "AMD", "META", "MSFT", "NVDA", "QQQ", "SPY", "TSLA"];
const BASE = {};
for (const tk of TK) { const ds = cad.dias(tk).filter((d) => d >= "20210101" && d <= "20260819"); BASE[tk] = {};
  for (const n of [5, 10]) { const v = [];
    for (let i = 0; i + n < ds.length; i += 3) { const m = mov(tk, ds[i], n); if (m != null) v.push(m); }
    BASE[tk][n] = v.reduce((a, b) => a + b, 0) / v.length; } }
const OBS = [];
for (const [k, d] of DOM) {
  const [tk, dia] = k.split("|"); if (!BASE[tk]) continue;
  const ds = cad.dias(tk); const i = ds.indexOf(dia); if (i < 0 || i + 1 >= ds.length) continue;
  const entrada = ds[i + 1];                     // se entra el dia SIGUIENTE, como la tabla magica
  const o = { tk, dia, dir: d.dir, bruta: d.bruta, n: d.n };
  for (const nn of [5, 10]) { const m = mov(tk, entrada, nn); o["m" + nn] = m == null ? null : m - BASE[tk][nn]; }
  if (o.m5 != null) OBS.push(o);
}
console.log("  observaciones con movimiento medible: " + OBS.length.toLocaleString("en-US"));
const mediaDe = (v) => v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
const t_de = (v) => { if (v.length < 3) return null; const m = mediaDe(v);
  const s = Math.sqrt(v.reduce((a, x) => a + (x - m) * (x - m), 0) / (v.length - 1)); return s ? m / (s / Math.sqrt(v.length)) : null; };
const pc = (x) => ((100 * x) >= 0 ? "+" : "") + (100 * x).toFixed(3) + "%";
for (const campo of ["dir", "bruta"]) {
  console.log("");
  console.log("  ── por DECILES de dominancia " + (campo === "dir" ? "DIRECCIONAL" : "BRUTA") + " ──");
  console.log("  " + "decil".padEnd(8) + "rango".padStart(16) + "n".padStart(7) +
    "5 dias (largo)".padStart(20) + "10 dias (largo)".padStart(20));
  const S = OBS.slice().sort((a, b) => a[campo] - b[campo]);
  const paso = Math.floor(S.length / 10);
  for (let i = 0; i < 10; i++) {
    const g = S.slice(i * paso, i === 9 ? S.length : (i + 1) * paso);
    const v5 = g.map((x) => x.m5).filter((x) => x != null);
    const v10 = g.map((x) => x.m10).filter((x) => x != null);
    console.log("  " + String(i + 1).padEnd(8) +
      (g[0][campo].toFixed(2) + " a " + g[g.length - 1][campo].toFixed(2)).padStart(16) +
      String(g.length).padStart(7) +
      (pc(mediaDe(v5)) + " t=" + t_de(v5).toFixed(1)).padStart(20) +
      (v10.length ? pc(mediaDe(v10)) + " t=" + t_de(v10).toFixed(1) : "—").padStart(20));
  }
}
console.log("");
console.log("  (largo = comprar la accion. Para el decil 1 —cinta bajista— habria que ir CORTO,");
console.log("   asi que ahi un numero MUY NEGATIVO tambien seria señal.)");
console.log("");

console.log("");
console.log("  ══════════ ¿DE DONDE SALEN LOS $40.373 DEL TRAMO «A FAVOR»? ══════════");
console.log("");
const AF = conD.filter((s) => acorde(s) >= 0.3).sort((a, b) => b.din - a.din);
console.log("  " + "dia".padEnd(11) + "tk".padEnd(6) + "contrato".padEnd(14) + "acorde".padStart(8) + "mult".padStart(7) + "dinero".padStart(11) + "  año");
for (const s of AF) console.log("  " + s.dC.padEnd(11) + s.tk.padEnd(6) + (s.l + s.K).padEnd(14) +
  acorde(s).toFixed(2).padStart(8) + s.mult.toFixed(2).padStart(7) + D(s.din).padStart(11) + "  " + s.y);
console.log("");
const porAno = {};
for (const s of AF) porAno[s.y] = (porAno[s.y] ?? 0) + s.din;
console.log("  reparto por año: " + Object.entries(porAno).map(([k, v]) => k + " " + D(v)).join(" · "));
const top3 = AF.slice(0, 3).reduce((a, s) => a + s.din, 0);
console.log("  las 3 mayores aportan " + D(top3) + " de " + D(AF.reduce((a, s) => a + s.din, 0)) +
  "  (" + (100 * top3 / AF.reduce((a, s) => a + s.din, 0)).toFixed(0) + "%)");
console.log("");
console.log("  ══════════ ¿AGUANTA PARTIDO EN DOS MITADES? ══════════");
console.log("");
const ord = conD.slice().sort((a, b) => a.dC.localeCompare(b.dC));
const mit = Math.floor(ord.length / 2);
console.log("  " + "".padEnd(24) + "n".padStart(5) + "ganan".padStart(8) + "dinero".padStart(13) + "ratio".padStart(8));
for (const [nom, GG] of [["1a mitad, a favor", ord.slice(0, mit).filter((s) => acorde(s) >= 0.3)],
                         ["2a mitad, a favor", ord.slice(mit).filter((s) => acorde(s) >= 0.3)],
                         ["1a mitad, el resto", ord.slice(0, mit).filter((s) => acorde(s) < 0.3)],
                         ["2a mitad, el resto", ord.slice(mit).filter((s) => acorde(s) < 0.3)]]) {
  if (!GG.length) { console.log("  " + nom.padEnd(24) + "0".padStart(5)); continue; }
  const g = GG.filter((s) => s.gana), p = GG.filter((s) => !s.gana);
  const gan = g.reduce((x, s) => x + s.din, 0), per = -p.reduce((x, s) => x + s.din, 0);
  console.log("  " + nom.padEnd(24) + String(GG.length).padStart(5) +
    ((100 * g.length / GG.length).toFixed(0) + "%").padStart(8) + D(gan - per).padStart(13) +
    (per ? (gan / per).toFixed(2) : "∞").padStart(8));
}
console.log("");
