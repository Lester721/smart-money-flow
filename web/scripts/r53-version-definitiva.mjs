// LA VERSION DEFINITIVA — decision de Lester el 2026-08-26: crudo + media de 20 dias en LAS DOS.
//   las dos: golpe >$500k al ask · 12x el OI de la vispera · dentro del dinero · >=$10.000 ·
//            >=5 dias · despues de las 14:00 · la accion BAJO su media de 20 dias ·
//            UNA por ticker-dia (vencimiento mas lejano)
//   grande:  $300.000 · salida al 8% (tope 60 dias) · 5% por posicion · 18 huecos
//   Lester:  $60.000  · salida a 15 dias · 25% por posicion · 4 huecos
// Se prueba ademas si la salida al 8% le sirve YA a la cuenta de Lester en esta configuracion.
import { cargar, resumir, cuenta } from "./consultar.mjs";
import { abrir } from "./datos.mjs";
const D = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const MAG = (f) => f.dentro && f.dte >= 5 && f.ask * 100 >= 10000 && f.hora >= "14:00" && f.vsOI >= 12;
const yr = (y) => [...Array(12)].map((_, i) => y + String(i + 1).padStart(2, "0"));
const ANOS = [["2021", yr("2021")], ["2022", yr("2022")], ["2023", yr("2023")], ["2024", yr("2024")],
              ["2025", yr("2025")], ["2026", ["202601","202602","202603","202604","202605","202606","202607","202608"]]];
const cad = abrir("cadenas", { callado: true });
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
const O0 = { objetivo: 1.50, suelo: 0.50 }, O15 = { objetivo: 1.50, suelo: 0.50, salirEnDias: 15 };
function salir8(f) { const coste = f.ask; let n = 0, ult = null;
  for (const [d, bid] of f.camino) { n++; const m = bid / coste; ult = { mult: m, dSal: d };
    if (m >= 1.50) return { mult: 1.50, dSal: d }; if (m <= 0.50) return { mult: 0.50, dSal: d };
    const s = spotDe(f.tk, d);
    if (s != null) { const mov = f.l === "P" ? (f.spot - s) / f.spot : (s - f.spot) / f.spot;
      if (mov >= 0.08) return { mult: m, dSal: d }; }
    if (n >= 60) return { mult: m, dSal: d }; }
  return ult; }
const con8 = (L) => L.map((f) => { const r = salir8(f); return { ...f, camino: [[r.dSal, r.mult * f.ask, r.mult * f.ask]] }; });
function unaPorDia(L) {
  const g = new Map();
  for (const f of L) { const k = f.tk + f.dC; if (!g.has(k)) g.set(k, []); g.get(k).push(f); }
  return [...g.values()].map((G) => G.reduce((a, b) =>
    (Number(b.exp) > Number(a.exp) || (Number(b.exp) === Number(a.exp) && b.prof < a.prof)) ? b : a
  )).sort((a, b) => a.dC.localeCompare(b.dC));
}
const DAT = {};
for (const [y, M] of ANOS) { DAT[y] = cargar(M).filter(MAG);
  for (const f of DAT[y]) { const ds = cad.dias(f.tk); const i = ds.indexOf(f.dC);
    if (i < 20) { f.ma20 = null; continue; }
    const p = ds.slice(i - 20, i).map((d) => spotDe(f.tk, d)).filter((x) => x != null);
    f.ma20 = p.length < 15 ? null : f.spot / (p.reduce((a, b) => a + b, 0) / p.length) - 1; } }
const REGLA = (y) => unaPorDia(DAT[y].filter((f) => f.ma20 != null && f.ma20 < 0));

function tabla(titulo, cap, porOp, maxAb, usa8) {
  console.log("");
  console.log("  ==============  " + titulo + "  ==============");
  console.log("");
  console.log("  " + "ano".padEnd(6) + "senales".padStart(8) + "ops".padStart(5) + "gana".padStart(6) + "pierde".padStart(7) +
    "dinero".padStart(13) + "% del ano".padStart(11) + "ratio".padStart(8));
  const TT = [];
  for (const [y] of ANOS) {
    let L = REGLA(y); const nSig = L.length;
    if (usa8) L = con8(L);
    if (!L.length) { console.log("  " + y.padEnd(6) + "       0     no dispara"); continue; }
    TT.push(...L);
    const q = cuenta(L, { capital: cap, porOp, maxAbiertas: maxAb, ...(usa8 ? O0 : O15) });
    const r = resumir(L, usa8 ? O0 : O15);
    console.log("  " + y.padEnd(6) + String(nSig).padStart(8) + String(q.tomadas.length).padStart(5) +
      String(q.gana).padStart(6) + String(q.pierde).padStart(7) + D(q.ganancia).padStart(13) +
      ((100 * q.ganancia / cap).toFixed(0) + "%").padStart(11) + (r.r === Infinity ? "∞" : r.r.toFixed(2)).padStart(8));
  }
  TT.sort((a, b) => a.dC.localeCompare(b.dC));
  const q = cuenta(TT, { capital: cap, porOp, maxAbiertas: maxAb, ...(usa8 ? O0 : O15) });
  const r = resumir(TT, usa8 ? O0 : O15);
  console.log("  " + "-".repeat(64));
  console.log("  CUENTA CONTINUA: " + D(q.final) + "   (" + (100 * (Math.pow(Math.max(q.final, 1) / cap, 1 / 5.63) - 1)).toFixed(1) +
    "% al ano · caja minima " + D(q.minCaja) + ")");
  console.log("  por senal: " + r.n + " senales · " + r.gana + " ganan / " + r.pierde + " pierden · ratio " + r.r.toFixed(2) + " · " + D(r.neto));
  return q;
}
tabla("CUENTA GRANDE $300.000 · salida al 8% · 5% por posicion", 300000, 15000, 18, true);
tabla("TU CUENTA $60.000 · salida al 8% · 25% por posicion", 60000, 15000, 4, true);
console.log("");
console.log("  ==============  ¿Y SI TU CUENTA USA TAMBIEN LA SALIDA AL 8%?  ==============");
console.log("");
console.log("  " + "".padEnd(28) + ANOS.map(([y]) => y.padStart(11)).join("") + "CONTINUA".padStart(20) + "ratio".padStart(7));
for (const [nom, usa8] of [["15 dias (lo elegido)", false], ["salida al 8%", true]]) {
  const cel = []; const TT = [];
  for (const [y] of ANOS) {
    let L = REGLA(y); if (usa8) L = con8(L);
    if (!L.length) { cel.push("—".padStart(11)); continue; }
    TT.push(...L);
    cel.push(D(cuenta(L, { capital: 60000, porOp: 15000, maxAbiertas: 4, ...(usa8 ? O0 : O15) }).ganancia).padStart(11));
  }
  TT.sort((a, b) => a.dC.localeCompare(b.dC));
  const q = cuenta(TT, { capital: 60000, porOp: 15000, maxAbiertas: 4, ...(usa8 ? O0 : O15) });
  const r = resumir(TT, usa8 ? O0 : O15);
  console.log("  " + nom.padEnd(28) + cel.join("") +
    (D(q.final) + " " + (100 * (Math.pow(Math.max(q.final, 1) / 60000, 1 / 5.63) - 1)).toFixed(1) + "%").padStart(20) +
    r.r.toFixed(2).padStart(7));
}
console.log("");
console.log("  el liston: $60.000 en SPY -> $125.148 (+13,9% al ano)");
console.log("");
