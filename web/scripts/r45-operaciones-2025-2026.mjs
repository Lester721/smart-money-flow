// LAS OPERACIONES DE 2025 Y 2026, UNA A UNA — las dos cuentas, tal como quedó la regla final.
//   cuenta grande: $300.000 · techo 50% + media · salida al 8% · 5% por posicion · 18 huecos
//   cuenta Lester: $60.000 · en crudo · salida a 15 dias · 25% por posicion · 4 huecos
import { cargar, cuenta, simular } from "./consultar.mjs";
import { abrir } from "./datos.mjs";
const D = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const MAG = (f) => f.dentro && f.dte >= 5 && f.ask * 100 >= 10000 && f.hora >= "14:00" && f.vsOI >= 12;
const yr = (y) => [...Array(12)].map((_, i) => y + String(i + 1).padStart(2, "0"));
const ANOS = [["2025", yr("2025")], ["2026", ["202601","202602","202603","202604","202605","202606","202607","202608"]]];
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
  for (const [d, bid] of f.camino) { n++; const m = bid / coste; ult = { mult: m, dSal: d, por: "60 dias" };
    if (m >= 1.50) return { mult: 1.50, dSal: d, por: "objetivo" };
    if (m <= 0.50) return { mult: 0.50, dSal: d, por: "stop" };
    const s = spotDe(f.tk, d);
    if (s != null) { const mov = f.l === "P" ? (f.spot - s) / f.spot : (s - f.spot) / f.spot;
      if (mov >= 0.08) return { mult: m, dSal: d, por: "8% accion" }; }
    if (n >= 60) return { mult: m, dSal: d, por: "60 dias" }; }
  return ult; }
const con8 = (L) => L.map((f) => { const r = salir8(f);
  return { ...f, camino: [[r.dSal, r.mult * f.ask, r.mult * f.ask]], _por: r.por, _mult: r.mult }; });
const O0 = { objetivo: 1.50, suelo: 0.50 }, O15 = { objetivo: 1.50, suelo: 0.50, salirEnDias: 15 };

const DAT = {};
for (const [y, M] of ANOS) { DAT[y] = cargar(M).filter(MAG);
  for (const f of DAT[y]) { const ds = cad.dias(f.tk); const i = ds.indexOf(f.dC);
    if (i < 50) { f.sm = null; continue; }
    const prev = ds.slice(i - 50, i).map((d) => spotDe(f.tk, d)).filter((x) => x != null);
    f.sm = prev.length < 40 ? null : f.spot / (prev.reduce((a, b) => a + b, 0) / prev.length) - 1; } }
const FILTRO = (f) => f.prof <= 0.50 && f.sm != null && f.sm < 0;

function listar(titulo, y, L, opts, cap, porOp, maxAb, con8usado) {
  const q = cuenta(L, { capital: cap, porOp, maxAbiertas: maxAb, ...opts });
  console.log("");
  console.log("  === " + titulo + " " + y + " — " + q.tomadas.length + " operaciones ===");
  console.log("");
  console.log("  " + "compra".padEnd(10) + "tk".padEnd(6) + "contrato".padEnd(16) + "cuesta".padStart(10) +
              "n".padStart(4) + "salida".padStart(10) + "por que".padStart(12) + "mult".padStart(7) + "dinero".padStart(11));
  let total = 0;
  for (const x of q.tomadas.sort((a, b) => a.f.dC.localeCompare(b.f.dC))) {
    const din = (x.r.mult - 1) * x.f.ask * 100 * x.n;
    total += din;
    const porque = con8usado ? (x.f._por || "") : (x.r.salio === "plazo" ? "15 dias" : x.r.salio);
    console.log("  " + x.f.dC.padEnd(10) + x.f.tk.padEnd(6) +
      (x.f.l + x.f.K + " " + x.f.exp.slice(4, 6) + "/" + x.f.exp.slice(6)).padEnd(16) +
      D(x.f.ask * 100).padStart(10) + String(x.n).padStart(4) + String(x.r.dSal).padStart(10) +
      porque.padStart(12) + x.r.mult.toFixed(2).padStart(7) + D(din).padStart(11));
  }
  console.log("  " + "-".repeat(86));
  console.log("  " + ("TOTAL " + y).padEnd(76) + D(q.ganancia).padStart(11) +
              "   (" + q.gana + " ganan / " + q.pierde + " pierden)");
  return q.ganancia;
}
console.log("");
console.log("  ############  CUENTA GRANDE — $300.000 · filtro · salida al 8% · 5% por posicion  ############");
for (const [y] of ANOS) listar("CUENTA GRANDE", y, con8(DAT[y].filter(FILTRO)), O0, 300000, 15000, 18, true);
console.log("");
console.log("  ############  TU CUENTA — $60.000 · en crudo · 15 dias · 25% por posicion  ############");
for (const [y] of ANOS) listar("TU CUENTA", y, DAT[y], O15, 60000, 15000, 4, false);
console.log("");
