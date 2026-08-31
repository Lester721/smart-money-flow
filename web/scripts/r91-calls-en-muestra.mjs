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
const VIEJOS = ["AAPL","AMD","META","MSFT","NVDA","QQQ","SPY","TSLA"];
const media = (A) => A.reduce((s, x) => s + x, 0) / A.length;
function stats(L) { if (!L || L.length < 3) return null;
  const m = L.map((x) => x.mult); const r = media(m) - 1;
  const sd = Math.sqrt(m.reduce((s, x) => s + (x - 1 - r) ** 2, 0) / (m.length - 1));
  return { n: m.length, ret: 100 * r, gana: 100 * m.filter((x) => x > 1).length / m.length, t: r / (sd / Math.sqrt(m.length)) }; }
const f = (nom, L) => { const s = stats(L);
  return "  " + nom.padEnd(32) + String(L.length).padStart(6) + (s ? (s.ret.toFixed(2) + "%").padStart(16) : "—".padStart(16)) +
    (s ? (s.gana.toFixed(0) + "%").padStart(9) : "—".padStart(9)) + (s ? s.t.toFixed(2).padStart(8) : "—".padStart(8)); };
const V = T.filter((x) => VIEJOS.includes(x.tk)), N = T.filter((x) => !VIEJOS.includes(x.tk));
console.log("");
console.log("  ══ AUDIT ══");
console.log("  señales totales: " + T.length + "  ·  8 viejos: " + V.length + " (esperado 81)  ·  20 nuevos: " + N.length + " (esperado 43)");
console.log("  reparto: PUTS " + T.filter((x) => x.l === "P").length + "  ·  CALLS " + T.filter((x) => x.l === "C").length);
console.log("");
console.log("  ══ LA MODIFICACIÓN: QUITAR LAS PUTS ══");
console.log("");
console.log("  " + "".padEnd(32) + "n".padStart(6) + "% por operación".padStart(16) + "acierta".padStart(9) + "t".padStart(8));
console.log("  ── los 8 viejos (EN MUESTRA) ──");
console.log(f("como estaba (puts + calls)", V));
console.log(f("SÓLO CALLS", V.filter((x) => x.l === "C")));
console.log(f("sólo puts (lo que se quita)", V.filter((x) => x.l === "P")));
console.log("  ── los 20 nuevos (el examen) ──");
console.log(f("como estaba", N));
console.log(f("SÓLO CALLS", N.filter((x) => x.l === "C")));
console.log("  ── los 28 juntos ──");
console.log(f("como estaba", T));
console.log(f("SÓLO CALLS", T.filter((x) => x.l === "C")));
console.log("");
console.log("  ══ LAS CALLS, POR TICKER Y POR AÑO ══");
console.log("");
const C = T.filter((x) => x.l === "C");
console.log("  por ticker: " + [...new Set(C.map((x) => x.tk))].sort().map((t) => t + " " + C.filter((x) => x.tk === t).length).join(" · "));
console.log("  por año:    " + ["2021","2022","2023","2024","2025","2026"].map((y) => y + " " + C.filter((x) => x.y === y).length).join(" · "));
const sinT = stats(C.filter((x) => x.tk !== "TSLA"));
console.log("");
console.log(f("calls SIN TSLA", C.filter((x) => x.tk !== "TSLA")));
console.log(f("calls sin TSLA y sin 2026", C.filter((x) => x.tk !== "TSLA" && x.y !== "2026")));
console.log("");
