// EL ESTADO FINAL DE LA TABLA MAGICA — con la regla nueva: UNA sola por ticker y dia,
// la del VENCIMIENTO MAS LEJANO.
//   cuenta grande: $300.000 · techo 50% + media · salida al 8% · 5% por posicion · 18 huecos
//   cuenta Lester: $60.000  · en crudo · salida a 15 dias · 25% por posicion · 4 huecos
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
function salir8(f) { const coste = f.ask; let n = 0, ult = null;
  for (const [d, bid] of f.camino) { n++; const m = bid / coste; ult = { mult: m, dSal: d };
    if (m >= 1.50) return { mult: 1.50, dSal: d }; if (m <= 0.50) return { mult: 0.50, dSal: d };
    const s = spotDe(f.tk, d);
    if (s != null) { const mov = f.l === "P" ? (f.spot - s) / f.spot : (s - f.spot) / f.spot;
      if (mov >= 0.08) return { mult: m, dSal: d }; }
    if (n >= 60) return { mult: m, dSal: d }; }
  return ult; }
const con8 = (L) => L.map((f) => { const r = salir8(f); return { ...f, camino: [[r.dSal, r.mult * f.ask, r.mult * f.ask]] }; });
const O0 = { objetivo: 1.50, suelo: 0.50 }, O15 = { objetivo: 1.50, suelo: 0.50, salirEnDias: 15 };
/** UNA por ticker+dia: la del vencimiento mas lejano. Empate -> la mas cerca del dinero. */
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
    if (i < 50) { f.sm = null; continue; }
    const prev = ds.slice(i - 50, i).map((d) => spotDe(f.tk, d)).filter((x) => x != null);
    f.sm = prev.length < 40 ? null : f.spot / (prev.reduce((a, b) => a + b, 0) / prev.length) - 1; } }
const T50 = (f) => f.prof <= 0.50, MED = (f) => f.sm != null && f.sm < 0;
const GRANDE = (y) => con8(unaPorDia(DAT[y].filter((f) => T50(f) && MED(f))));
const LESTER = (y) => unaPorDia(DAT[y]);

console.log("");
console.log("  ==============  CUENTA GRANDE — $300.000 ==============");
console.log("  techo 50% + media · UNA por ticker-dia (venc. mas lejano) · salida al 8% · 5% por posicion");
console.log("");
console.log("  " + "ano".padEnd(6) + "ops".padStart(5) + "gana".padStart(6) + "pierde".padStart(7) + "dinero".padStart(13) + "% del ano".padStart(11) + "senales".padStart(9) + "ratio".padStart(7));
let sumaG = 0;
for (const [y] of ANOS) {
  const L = GRANDE(y);
  if (!L.length) { console.log("  " + y.padEnd(6) + "    0                    no dispara"); continue; }
  const q = cuenta(L, { capital: 300000, porOp: 15000, maxAbiertas: 18, ...O0 });
  const r = resumir(L, O0); sumaG += q.ganancia;
  console.log("  " + y.padEnd(6) + String(q.tomadas.length).padStart(5) + String(q.gana).padStart(6) + String(q.pierde).padStart(7) +
    D(q.ganancia).padStart(13) + ((100 * q.ganancia / 300000).toFixed(0) + "%").padStart(11) +
    String(r.n).padStart(9) + (r.r === Infinity ? "∞" : r.r.toFixed(2)).padStart(7));
}
const TG = [];
for (const [y] of ANOS) TG.push(...GRANDE(y));
TG.sort((a, b) => a.dC.localeCompare(b.dC));
const qg = cuenta(TG, { capital: 300000, porOp: 15000, maxAbiertas: 18, ...O0 });
const rg = resumir(TG, O0);
console.log("  " + "-".repeat(64));
console.log("  suma de los anos sueltos: " + D(sumaG));
console.log("  CUENTA CONTINUA: " + D(qg.final) + "   (" + (100 * (Math.pow(qg.final / 300000, 1 / 5.63) - 1)).toFixed(1) +
  "% al ano · caja minima " + D(qg.minCaja) + ")");
console.log("  por senal: " + rg.n + " senales · " + rg.gana + " ganan / " + rg.pierde + " pierden · ratio " + rg.r.toFixed(2) + " · " + D(rg.neto));

console.log("");
console.log("  ==============  TU CUENTA — $60.000 ==============");
console.log("  en crudo · UNA por ticker-dia (venc. mas lejano) · salida a 15 dias · 25% por posicion");
console.log("");
console.log("  " + "ano".padEnd(6) + "ops".padStart(5) + "gana".padStart(6) + "pierde".padStart(7) + "dinero".padStart(13) + "% sobre $60k".padStart(14) + "senales".padStart(9));
let sumaL = 0;
for (const [y] of ANOS) {
  const L = LESTER(y);
  const q = cuenta(L, { capital: 60000, porOp: 15000, maxAbiertas: 4, ...O15 }); sumaL += q.ganancia;
  console.log("  " + y.padEnd(6) + String(q.tomadas.length).padStart(5) + String(q.gana).padStart(6) + String(q.pierde).padStart(7) +
    D(q.ganancia).padStart(13) + ((100 * q.ganancia / 60000).toFixed(0) + "%").padStart(14) + String(L.length).padStart(9));
}
const TL = [];
for (const [y] of ANOS) TL.push(...LESTER(y));
TL.sort((a, b) => a.dC.localeCompare(b.dC));
const ql = cuenta(TL, { capital: 60000, porOp: 15000, maxAbiertas: 4, ...O15 });
const rl = resumir(TL, O15);
console.log("  " + "-".repeat(64));
console.log("  suma de los anos sueltos: " + D(sumaL));
console.log("  CUENTA CONTINUA: " + D(ql.final) + "   (" + (100 * (Math.pow(Math.max(ql.final, 1) / 60000, 1 / 5.63) - 1)).toFixed(1) +
  "% al ano · caja minima " + D(ql.minCaja) + ")");
console.log("  por senal: " + rl.n + " senales · " + rl.gana + " ganan / " + rl.pierde + " pierden · ratio " + rl.r.toFixed(2));
console.log("");
console.log("  ==============  CONTRA LA VERSION DE ANTES (comprar todas) ==============");
console.log("");
console.log("  " + "".padEnd(34) + "cuenta grande".padStart(24) + "tu cuenta".padStart(24));
for (const [nom, una] of [["comprar TODAS (antes)", false], ["UNA, venc. mas lejano (ahora)", true]]) {
  const A = []; for (const [y] of ANOS) { let L = DAT[y].filter((f) => T50(f) && MED(f)); if (una) L = unaPorDia(L); A.push(...con8(L)); }
  const B = []; for (const [y] of ANOS) { let L = DAT[y]; if (una) L = unaPorDia(L); B.push(...L); }
  A.sort((a, b) => a.dC.localeCompare(b.dC)); B.sort((a, b) => a.dC.localeCompare(b.dC));
  const qa = cuenta(A, { capital: 300000, porOp: 15000, maxAbiertas: 18, ...O0 });
  const qb = cuenta(B, { capital: 60000, porOp: 15000, maxAbiertas: 4, ...O15 });
  console.log("  " + nom.padEnd(34) +
    (D(qa.final) + "  " + (100 * (Math.pow(qa.final / 300000, 1 / 5.63) - 1)).toFixed(1) + "%").padStart(24) +
    (D(qb.final) + "  " + (100 * (Math.pow(Math.max(qb.final, 1) / 60000, 1 / 5.63) - 1)).toFixed(1) + "%").padStart(24));
}
console.log("");
console.log("  el liston: $60.000 en SPY -> $125.148 (+13,9% al ano)");
console.log("");
