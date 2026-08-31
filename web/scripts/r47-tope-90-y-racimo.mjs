// LOS DOS PATRONES QUE SALEN DE LA RADIOGRAFIA, MEDIDOS COMO REGLA.
//   A) devolver el tope de 90 dias al plazo (se quito cuando solo teniamos 2026)
//   B) no seguir racimos de 4 o mas senales del mismo ticker el mismo dia
// Sobre la regla final: techo 50% + media + salida al 8%, y tambien en crudo.
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

const DAT = {};
for (const [y, M] of ANOS) { DAT[y] = cargar(M).filter(MAG);
  for (const f of DAT[y]) { const ds = cad.dias(f.tk); const i = ds.indexOf(f.dC);
    if (i < 50) { f.sm = null; continue; }
    const prev = ds.slice(i - 50, i).map((d) => spotDe(f.tk, d)).filter((x) => x != null);
    f.sm = prev.length < 40 ? null : f.spot / (prev.reduce((a, b) => a + b, 0) / prev.length) - 1; } }
const TODO = Object.values(DAT).flat();
const porDia = new Map();
for (const f of TODO) { const k = f.tk + f.dC; porDia.set(k, (porDia.get(k) ?? 0) + 1); }
for (const f of TODO) f._racimo = porDia.get(f.tk + f.dC);

const T50 = (f) => f.prof <= 0.50, MED = (f) => f.sm != null && f.sm < 0;
const VARS = [
  ["la regla de hoy", () => true],
  ["+ tope de 90 dias", (f) => f.dte <= 90],
  ["+ tope de 45 dias", (f) => f.dte <= 45],
  ["+ racimo de 1 a 3", (f) => f._racimo <= 3],
  ["+ 90 dias y racimo 1 a 3", (f) => f.dte <= 90 && f._racimo <= 3],
  ["+ 45 dias y racimo 1 a 3", (f) => f.dte <= 45 && f._racimo <= 3],
];
function parrilla(titulo, pre, usa8, conCuenta, cap, porOp, maxAb) {
  console.log("");
  console.log("  === " + titulo + " ===");
  console.log("");
  console.log("  " + "".padEnd(28) + ANOS.map(([y]) => y.padStart(12)).join("") + "TOTAL".padStart(13) + "n".padStart(5) + "ratio".padStart(7) + "anos+".padStart(7));
  for (const [nom, fl] of VARS) {
    let tot = 0, gan = 0; const cel = [], acum = [];
    for (const [y] of ANOS) {
      let L = DAT[y].filter((f) => pre(f) && fl(f));
      if (usa8) L = con8(L);
      if (!L.length) { cel.push("—".padStart(12)); continue; }
      acum.push(...L);
      const op = usa8 ? O0 : O15;
      const v = conCuenta ? cuenta(L, { capital: cap, porOp, maxAbiertas: maxAb, ...op }).ganancia : resumir(L, op).neto;
      tot += v; if (v > 0) gan++; cel.push(D(v).padStart(12));
    }
    const rt = acum.length ? resumir(acum, usa8 ? O0 : O15) : null;
    console.log("  " + nom.padEnd(28) + cel.join("") + D(tot).padStart(13) + String(acum.length).padStart(5) +
      (rt ? (rt.r === Infinity ? "∞" : rt.r.toFixed(2)) : "—").padStart(7) + (gan + "/6").padStart(7));
  }
}
parrilla("CUENTA GRANDE — sobre techo 50% + media + salida 8%", (f) => T50(f) && MED(f), true, false);
parrilla("CUENTA GRANDE — en crudo, salida 15 dias", () => true, false, false);
parrilla("TU CUENTA ($60.000) — en crudo, 15 dias, 25% por posicion", () => true, false, true, 60000, 15000, 4);
console.log("");
console.log("  === Y LA CUENTA CONTINUA (sin reponer cada enero) ===");
console.log("");
console.log("  " + "".padEnd(28) + "cuenta grande $300k".padStart(22) + "tu cuenta $60k".padStart(22));
for (const [nom, fl] of VARS) {
  const A = con8(TODO.filter((f) => T50(f) && MED(f) && fl(f))).sort((a, b) => a.dC.localeCompare(b.dC));
  const B = TODO.filter(fl).sort((a, b) => a.dC.localeCompare(b.dC));
  const qa = A.length ? cuenta(A, { capital: 300000, porOp: 15000, maxAbiertas: 18, ...O0 }) : null;
  const qb = B.length ? cuenta(B, { capital: 60000, porOp: 15000, maxAbiertas: 4, ...O15 }) : null;
  const an = (q, c) => q ? (100 * (Math.pow(Math.max(q.final, 1) / c, 1 / 5.63) - 1)).toFixed(1) + "%" : "—";
  console.log("  " + nom.padEnd(28) + (qa ? D(qa.final) + "  " + an(qa, 300000) : "—").padStart(22) +
    (qb ? D(qb.final) + "  " + an(qb, 60000) : "—").padStart(22));
}
console.log("");
console.log("  (el liston: $60.000 en SPY -> $125.148, +13,9% al ano)");
console.log("");
