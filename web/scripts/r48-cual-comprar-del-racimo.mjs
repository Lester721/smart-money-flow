// SI HAY VARIAS SENALES DEL MISMO TICKER EL MISMO DIA, ¿CUAL COMPRO?
//
// Lester, el 2026-08-26: «aunque tuviera multiples senales en un dia de una misma accion yo nunca
// hubiera comprado todas, hubiera comprado UNA sola. La pregunta seria cual y por que».
//
// Esto NO es el "racimo de 1 a 3" (que descarta el dia entero). Aqui se queda el dia y se compra
// UNA, elegida con algo que se ve EN EL MOMENTO. Doce criterios.
//
// Se incluyen dos listones imposibles —la mejor y la peor del dia— para ver el rango: nadie puede
// elegir la mejor, pero saber cuanto hay entre la mejor y la peor dice si la eleccion importa.
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

/** Agrupa por ticker+dia y se queda UNA, la que `elige` ponga primera. */
function unaPorDia(L, elige) {
  const g = new Map();
  for (const f of L) { const k = f.tk + f.dC; if (!g.has(k)) g.set(k, []); g.get(k).push(f); }
  const out = [];
  for (const grupo of g.values()) out.push(grupo.length === 1 ? grupo[0] : elige(grupo));
  return out.sort((a, b) => a.dC.localeCompare(b.dC));
}
const menor = (k) => (G) => G.reduce((a, b) => (k(b) < k(a) ? b : a));
const mayor = (k) => (G) => G.reduce((a, b) => (k(b) > k(a) ? b : a));
const CRIT = [
  ["comprar TODAS (la regla de hoy)", null],
  ["la mas barata", menor((f) => f.ask)],
  ["la mas cara", mayor((f) => f.ask)],
  ["la de mayor vsOI", mayor((f) => f.vsOI)],
  ["la de menor vsOI", menor((f) => f.vsOI)],
  ["la mas cerca del dinero", menor((f) => f.prof)],
  ["la mas profunda", mayor((f) => f.prof)],
  ["el vencimiento mas cercano", menor((f) => Number(f.exp))],
  ["el vencimiento mas lejano", mayor((f) => Number(f.exp))],
  ["la del golpe mayor", mayor((f) => f.prima)],
  ["la del golpe menor", menor((f) => f.prima)],
  ["la del OI mas bajo", menor((f) => f.oiV ?? 1e9)],
  ["la primera del dia (hora)", menor((f) => f.hora)],
  ["la ultima del dia (hora)", mayor((f) => f.hora)],
];
const IMPOSIBLES = [
  ["[imposible] LA MEJOR del dia", mayor((f) => simular(f, O15).mult)],
  ["[imposible] LA PEOR del dia", menor((f) => simular(f, O15).mult)],
];
function parrilla(titulo, pre, usa8, conCuenta, cap, porOp, maxAb) {
  console.log("");
  console.log("  === " + titulo + " ===");
  console.log("");
  console.log("  " + "".padEnd(32) + ANOS.map(([y]) => y.padStart(12)).join("") + "TOTAL".padStart(13) + "n".padStart(5) + "ratio".padStart(7));
  for (const [nom, el] of [...CRIT, ...IMPOSIBLES]) {
    let tot = 0; const cel = [], acum = [];
    for (const [y] of ANOS) {
      let L = DAT[y].filter(pre);
      if (el) L = unaPorDia(L, el);
      if (usa8) L = con8(L);
      if (!L.length) { cel.push("—".padStart(12)); continue; }
      acum.push(...L);
      const op = usa8 ? O0 : O15;
      const v = conCuenta ? cuenta(L, { capital: cap, porOp, maxAbiertas: maxAb, ...op }).ganancia : resumir(L, op).neto;
      tot += v; cel.push(D(v).padStart(12));
    }
    const rt = acum.length ? resumir(acum, usa8 ? O0 : O15) : null;
    console.log("  " + nom.padEnd(32) + cel.join("") + D(tot).padStart(13) + String(acum.length).padStart(5) +
      (rt ? (rt.r === Infinity ? "∞" : rt.r.toFixed(2)) : "—").padStart(7));
  }
}
const T50 = (f) => f.prof <= 0.50, MED = (f) => f.sm != null && f.sm < 0;
console.log("");
console.log("  === CUANTOS DIAS TIENEN MAS DE UNA SENAL? ===");
console.log("");
const TODO = Object.values(DAT).flat();
const g = new Map();
for (const f of TODO) { const k = f.tk + f.dC; g.set(k, (g.get(k) ?? 0) + 1); }
const tam = [...g.values()];
console.log("  dias-ticker con senal: " + tam.length + "   ·   senales: " + TODO.length);
for (const [a, b, nom] of [[1,2,"1 sola"],[2,4,"2 a 3"],[4,9,"4 a 8"],[9,1e9,"9 o mas"]])
  console.log("     " + nom.padEnd(10) + String(tam.filter((x) => x >= a && x < b).length).padStart(4) + " dias");
parrilla("TU CUENTA ($60.000) — en crudo, 15 dias, 25% por posicion", () => true, false, true, 60000, 15000, 4);
parrilla("CUENTA GRANDE — techo 50% + media + salida 8%", (f) => T50(f) && MED(f), true, false);
console.log("");
