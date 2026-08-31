// LA MEDIA: ¿QUE PLAZO? — ¿es una meseta o un numero afortunado?
// La de 20 dias doblo la cuenta de Lester y la de 50 la empeoro. Si el efecto es real, los plazos
// vecinos (10, 15, 20, 25, 30) tienen que comportarse parecido. Si solo funciona el 20, es ajuste.
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
const O15 = { objetivo: 1.50, suelo: 0.50, salirEnDias: 15 }, O0 = { objetivo: 1.50, suelo: 0.50 };
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
const PLAZOS = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100];
const DAT = {};
for (const [y, M] of ANOS) { DAT[y] = cargar(M).filter(MAG);
  for (const f of DAT[y]) { const ds = cad.dias(f.tk); const i = ds.indexOf(f.dC);
    f.ma = {};
    for (const n of PLAZOS) {
      if (i < n) { f.ma[n] = null; continue; }
      const p = ds.slice(i - n, i).map((d) => spotDe(f.tk, d)).filter((x) => x != null);
      f.ma[n] = p.length < n * 0.75 ? null : f.spot / (p.reduce((a, b) => a + b, 0) / p.length) - 1;
    } } }
const BAJO = (n) => (f) => f.ma[n] != null && f.ma[n] < 0;

console.log("");
console.log("  === TU CUENTA ($60.000, crudo, una por dia, 15 dias) — la media a cada plazo ===");
console.log("");
console.log("  " + "media de".padEnd(12) + ANOS.map(([y]) => y.padStart(11)).join("") + "suma".padStart(12) + "CONTINUA".padStart(20) + "n".padStart(6));
{
  let cel = [], suma = 0; const TL = [];
  for (const [y] of ANOS) { const L = unaPorDia(DAT[y]); TL.push(...L);
    const q = cuenta(L, { capital: 60000, porOp: 15000, maxAbiertas: 4, ...O15 }); suma += q.ganancia; cel.push(D(q.ganancia).padStart(11)); }
  TL.sort((a, b) => a.dC.localeCompare(b.dC));
  const qc = cuenta(TL, { capital: 60000, porOp: 15000, maxAbiertas: 4, ...O15 });
  console.log("  " + "SIN media".padEnd(12) + cel.join("") + D(suma).padStart(12) +
    (D(qc.final) + "  " + (100 * (Math.pow(qc.final / 60000, 1 / 5.63) - 1)).toFixed(1) + "%").padStart(20) + String(TL.length).padStart(6));
}
for (const n of PLAZOS) {
  let cel = [], suma = 0; const TL = [];
  for (const [y] of ANOS) { const L = unaPorDia(DAT[y].filter(BAJO(n)));
    if (!L.length) { cel.push("—".padStart(11)); continue; }
    TL.push(...L);
    const q = cuenta(L, { capital: 60000, porOp: 15000, maxAbiertas: 4, ...O15 }); suma += q.ganancia; cel.push(D(q.ganancia).padStart(11)); }
  TL.sort((a, b) => a.dC.localeCompare(b.dC));
  const qc = TL.length ? cuenta(TL, { capital: 60000, porOp: 15000, maxAbiertas: 4, ...O15 }) : null;
  console.log("  " + (n + " dias").padEnd(12) + cel.join("") + D(suma).padStart(12) +
    (qc ? D(qc.final) + "  " + (100 * (Math.pow(Math.max(qc.final, 1) / 60000, 1 / 5.63) - 1)).toFixed(1) + "%" : "—").padStart(20) +
    String(TL.length).padStart(6));
}
console.log("");
console.log("  === CUENTA GRANDE ($300k, techo 50%, una por dia, salida 8%, 5%) ===");
console.log("");
console.log("  " + "media de".padEnd(12) + ANOS.map(([y]) => y.padStart(11)).join("") + "CONTINUA".padStart(20) + "ratio".padStart(7) + "n".padStart(6));
for (const n of [null, ...PLAZOS]) {
  let cel = []; const TG = [];
  for (const [y] of ANOS) {
    let L = DAT[y].filter((f) => f.prof <= 0.50 && (n == null || BAJO(n)(f)));
    L = con8(unaPorDia(L));
    if (!L.length) { cel.push("—".padStart(11)); continue; }
    TG.push(...L);
    const q = cuenta(L, { capital: 300000, porOp: 15000, maxAbiertas: 18, ...O0 }); cel.push(D(q.ganancia).padStart(11)); }
  TG.sort((a, b) => a.dC.localeCompare(b.dC));
  const qc = TG.length ? cuenta(TG, { capital: 300000, porOp: 15000, maxAbiertas: 18, ...O0 }) : null;
  const rt = TG.length ? resumir(TG, O0) : null;
  console.log("  " + (n == null ? "SIN media" : n + " dias").padEnd(12) + cel.join("") +
    (qc ? D(qc.final) + "  " + (100 * (Math.pow(Math.max(qc.final, 1) / 300000, 1 / 5.63) - 1)).toFixed(1) + "%" : "—").padStart(20) +
    (rt ? (rt.r === Infinity ? "∞" : rt.r.toFixed(2)) : "—").padStart(7) + String(TG.length).padStart(6));
}
console.log("");
console.log("  (el liston: $60.000 en SPY -> $125.148, +13,9% al ano)");
console.log("");
