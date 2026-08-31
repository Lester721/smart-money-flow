// LA CUENTA GRANDE CON EL MISMO TRATO QUE LA PEQUENA.
// Lester: "si en la cuenta grande le damos el mismo tratamiento que a la pequena en terminos de
// filtro, como se veria con la media de 20?"
// La pequena va EN CRUDO: sin techo de profundidad y sin media de 50. Aqui se le quita todo eso a
// la grande y se le pone solo la media de 20, manteniendo lo suyo: salida al 8% y 5% por posicion.
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
    for (const n of [20, 50]) { if (i < n) { f["ma" + n] = null; continue; }
      const p = ds.slice(i - n, i).map((d) => spotDe(f.tk, d)).filter((x) => x != null);
      f["ma" + n] = p.length < n * 0.75 ? null : f.spot / (p.reduce((a, b) => a + b, 0) / p.length) - 1; } } }
const B20 = (f) => f.ma20 != null && f.ma20 < 0;
const B50 = (f) => f.ma50 != null && f.ma50 < 0;
const T50 = (f) => f.prof <= 0.50;

function fila(nom, filtro, cap, porOp, maxAb, usa8) {
  const cel = []; const TT = []; let suma = 0;
  for (const [y] of ANOS) {
    let L = unaPorDia(DAT[y].filter(filtro));
    if (usa8) L = con8(L);
    if (!L.length) { cel.push("—".padStart(11)); continue; }
    TT.push(...L);
    const q = cuenta(L, { capital: cap, porOp, maxAbiertas: maxAb, ...(usa8 ? O0 : O15) });
    suma += q.ganancia; cel.push(D(q.ganancia).padStart(11));
  }
  TT.sort((a, b) => a.dC.localeCompare(b.dC));
  const qc = TT.length ? cuenta(TT, { capital: cap, porOp, maxAbiertas: maxAb, ...(usa8 ? O0 : O15) }) : null;
  const rt = TT.length ? resumir(TT, usa8 ? O0 : O15) : null;
  const an = qc ? (100 * (Math.pow(Math.max(qc.final, 1) / cap, 1 / 5.63) - 1)).toFixed(1) + "%" : "—";
  console.log("  " + nom.padEnd(34) + cel.join("") +
    (qc ? D(qc.final) + " " + an : "—").padStart(19) +
    (rt ? (rt.r === Infinity ? "∞" : rt.r.toFixed(2)) : "—").padStart(7) +
    String(TT.length).padStart(5) + (qc ? D(qc.minCaja).padStart(11) : "".padStart(11)));
}
console.log("");
console.log("  === CUENTA GRANDE $300.000 — una por dia, salida al 8%, 5% por posicion ===");
console.log("");
console.log("  " + "".padEnd(34) + ANOS.map(([y]) => y.padStart(11)).join("") + "CONTINUA".padStart(19) + "ratio".padStart(7) + "n".padStart(5) + "caja min".padStart(11));
fila("EN CRUDO, sin ningun filtro", () => true, 300000, 15000, 18, true);
fila("EN CRUDO + media de 20d", B20, 300000, 15000, 18, true);
fila("EN CRUDO + media de 50d", B50, 300000, 15000, 18, true);
fila("techo 50% + media 50d (lo de hoy)", (f) => T50(f) && B50(f), 300000, 15000, 18, true);
fila("techo 50% + media 20d", (f) => T50(f) && B20(f), 300000, 15000, 18, true);
console.log("");
console.log("  === Y TU CUENTA $60.000 — una por dia, 15 dias, 25% por posicion ===");
console.log("");
console.log("  " + "".padEnd(34) + ANOS.map(([y]) => y.padStart(11)).join("") + "CONTINUA".padStart(19) + "ratio".padStart(7) + "n".padStart(5) + "caja min".padStart(11));
fila("EN CRUDO (lo de hoy)", () => true, 60000, 15000, 4, false);
fila("EN CRUDO + media de 20d", B20, 60000, 15000, 4, false);
console.log("");
console.log("  (el liston: $60.000 en SPY -> $125.148, +13,9% al ano)");
console.log("");
