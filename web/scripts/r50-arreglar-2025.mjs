// ¿SE PUEDE MEJORAR 2025 EN LA CUENTA DE LESTER?
// Los filtros se probaron ANTES de que existiera la regla de "una por ticker-dia". Se vuelven a
// medir encima de ella. Y se listan las 15 operaciones de 2025 para ver que son.
import { cargar, resumir, cuenta, simular } from "./consultar.mjs";
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
const O15 = { objetivo: 1.50, suelo: 0.50, salirEnDias: 15 };
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
    if (i < 50) { f.sm = null; f.sm20 = null; continue; }
    const p50 = ds.slice(i - 50, i).map((d) => spotDe(f.tk, d)).filter((x) => x != null);
    f.sm = p50.length < 40 ? null : f.spot / (p50.reduce((a, b) => a + b, 0) / p50.length) - 1;
    const p20 = ds.slice(i - 20, i).map((d) => spotDe(f.tk, d)).filter((x) => x != null);
    f.sm20 = p20.length < 15 ? null : f.spot / (p20.reduce((a, b) => a + b, 0) / p20.length) - 1; } }
const TODO = Object.values(DAT).flat();
const cnt = new Map();
for (const f of TODO) { const k = f.tk + f.dC; cnt.set(k, (cnt.get(k) ?? 0) + 1); }
for (const f of TODO) f._racimo = cnt.get(f.tk + f.dC);

console.log("");
console.log("  === LAS 15 OPERACIONES DE TU 2025, UNA A UNA ===");
console.log("");
const L25 = unaPorDia(DAT["2025"]);
const q25 = cuenta(L25, { capital: 60000, porOp: 15000, maxAbiertas: 4, ...O15 });
console.log("  " + "compra".padEnd(10) + "tk".padEnd(6) + "contrato".padEnd(15) + "cuesta".padStart(10) +
  "prof".padStart(7) + "vs media".padStart(10) + "OI".padStart(5) + "racimo".padStart(8) + "mult".padStart(7) + "dinero".padStart(11));
for (const x of q25.tomadas.sort((a, b) => a.f.dC.localeCompare(b.f.dC))) {
  const f = x.f;
  console.log("  " + f.dC.padEnd(10) + f.tk.padEnd(6) + (f.l + f.K + " " + f.exp.slice(4,6) + "/" + f.exp.slice(6)).padEnd(15) +
    D(f.ask * 100).padStart(10) + ((100 * f.prof).toFixed(0) + "%").padStart(7) +
    (f.sm == null ? "—" : ((100 * f.sm) >= 0 ? "+" : "") + (100 * f.sm).toFixed(1) + "%").padStart(10) +
    String(f.oiV ?? "—").padStart(5) + String(f._racimo).padStart(8) +
    x.r.mult.toFixed(2).padStart(7) + D((x.r.mult - 1) * f.ask * 100 * x.n).padStart(11));
}
console.log("  " + "-".repeat(89));
console.log("  " + "TOTAL 2025".padEnd(78) + D(q25.ganancia).padStart(11));

const T50 = (f) => f.prof <= 0.50, T75 = (f) => f.prof <= 0.75;
const MED = (f) => f.sm != null && f.sm < 0, MED20 = (f) => f.sm20 != null && f.sm20 < 0;
const VARS = [
  ["en crudo (lo que hay)", () => true],
  ["+ bajo la media de 50d", MED],
  ["+ bajo la media de 20d", MED20],
  ["+ bajo AMBAS medias", (f) => MED(f) && MED20(f)],
  ["+ techo 75%", T75],
  ["+ techo 50%", T50],
  ["+ techo 50% y media 50d", (f) => T50(f) && MED(f)],
  ["+ techo 75% y media 50d", (f) => T75(f) && MED(f)],
  ["+ OI de la vispera <= 25", (f) => (f.oiV ?? 0) <= 25],
  ["+ el dia tenia 3 o menos", (f) => f._racimo <= 3],
  ["+ techo 75%, media y OI<=25", (f) => T75(f) && MED(f) && (f.oiV ?? 0) <= 25],
];
console.log("");
console.log("  === TU CUENTA, CON 'UNA POR DIA' YA PUESTO — que hace cada filtro ===");
console.log("");
console.log("  " + "".padEnd(30) + ANOS.map(([y]) => y.padStart(11)).join("") + "suma".padStart(12) + "CONTINUA".padStart(20));
for (const [nom, fl] of VARS) {
  let suma = 0; const cel = []; const TL = [];
  for (const [y] of ANOS) {
    const L = unaPorDia(DAT[y].filter(fl));
    if (!L.length) { cel.push("—".padStart(11)); continue; }
    TL.push(...L);
    const q = cuenta(L, { capital: 60000, porOp: 15000, maxAbiertas: 4, ...O15 });
    suma += q.ganancia; cel.push(D(q.ganancia).padStart(11));
  }
  TL.sort((a, b) => a.dC.localeCompare(b.dC));
  const qc = TL.length ? cuenta(TL, { capital: 60000, porOp: 15000, maxAbiertas: 4, ...O15 }) : null;
  const an = qc ? (100 * (Math.pow(Math.max(qc.final, 1) / 60000, 1 / 5.63) - 1)).toFixed(1) + "%" : "—";
  console.log("  " + nom.padEnd(30) + cel.join("") + D(suma).padStart(12) + (qc ? D(qc.final) + "  " + an : "—").padStart(20));
}
console.log("");
console.log("  (el liston: $60.000 en SPY -> $125.148, +13,9% al ano)");
console.log("");
