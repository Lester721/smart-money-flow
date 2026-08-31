// QUE TIENEN EN COMUN LAS QUE PIERDEN — radiografia ganadoras contra perdedoras.
// Las 299 senales de la tabla magica, seis anos, con la salida de la regla de cada escala.
// Descriptivo: se mira TODO atributo conocido en el momento de comprar, mas dos que no lo son
// (por que salio, cuanto se movio la accion) marcados como tales.
import { cargar, simular } from "./consultar.mjs";
import { abrir } from "./datos.mjs";
const D = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const MAG = (f) => f.dentro && f.dte >= 5 && f.ask * 100 >= 10000 && f.hora >= "14:00" && f.vsOI >= 12;
const yr = (y) => [...Array(12)].map((_, i) => y + String(i + 1).padStart(2, "0"));
const M = [...yr("2021"), ...yr("2022"), ...yr("2023"), ...yr("2024"), ...yr("2025"),
           "202601","202602","202603","202604","202605","202606","202607","202608"];
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

const T = cargar(M).filter(MAG);
for (const f of T) {
  const ds = cad.dias(f.tk); const i = ds.indexOf(f.dC);
  if (i >= 50) { const prev = ds.slice(i - 50, i).map((d) => spotDe(f.tk, d)).filter((x) => x != null);
    f.sm = prev.length < 40 ? null : f.spot / (prev.reduce((a, b) => a + b, 0) / prev.length) - 1; } else f.sm = null;
  const r = simular(f, { objetivo: 1.50, suelo: 0.50, salirEnDias: 15 });
  f._mult = r.mult; f._por = r.salio; f._dias = r.dias;
  f._gana = r.mult > 1;
  f._din = (r.mult - 1) * f.ask * 100;
  // cuanto se movio la accion durante la tenencia (NO se sabe al comprar)
  const s1 = spotDe(f.tk, r.dSal);
  f._mov = (f.spot > 0 && s1 > 0) ? (f.l === "P" ? (f.spot - s1) / f.spot : (s1 - f.spot) / f.spot) : null;
  // vencio DURANTE la tenencia?
  f._venceDentro = f.dte <= 15;
}
// senales el mismo dia
const porDia = new Map();
for (const f of T) { const k = f.tk + f.dC; porDia.set(k, (porDia.get(k) ?? 0) + 1); }
for (const f of T) f._racimo = porDia.get(f.tk + f.dC);

const G = T.filter((f) => f._gana), P = T.filter((f) => !f._gana);
console.log("");
console.log("  === " + T.length + " senales: " + G.length + " ganan, " + P.length + " pierden ===");
console.log("");
const med = (v) => { const s = v.filter((x) => x != null).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
function comparar(nom, f, fmt) {
  const a = med(G.map(f)), b = med(P.map(f));
  if (a == null || b == null) { console.log("  " + nom.padEnd(34) + "sin dato"); return; }
  const flecha = Math.abs(a - b) / (Math.abs(b) || 1) > 0.25 ? "  <<<" : "";
  console.log("  " + nom.padEnd(34) + fmt(a).padStart(14) + fmt(b).padStart(14) + flecha);
}
console.log("  " + "atributo (MEDIANA)".padEnd(34) + "GANAN".padStart(14) + "PIERDEN".padStart(14));
console.log("  " + "-".repeat(62));
const pct = (x) => (100 * x).toFixed(0) + "%";
const dol = (x) => D(x);
comparar("dias a vencer al comprar", (f) => f.dte, (x) => String(Math.round(x)) + " d");
comparar("profundidad dentro del dinero", (f) => f.prof, pct);
comparar("el golpe contra el OI (vsOI)", (f) => f.vsOI, (x) => x.toFixed(0) + "x");
comparar("OI de la vispera", (f) => f.oiV, (x) => String(Math.round(x)));
comparar("lo que cuesta el contrato", (f) => f.ask * 100, dol);
comparar("tamano del golpe", (f) => f.prima, dol);
comparar("horquilla del golpe", (f) => f.horq, (x) => (100 * x).toFixed(1) + "%");
comparar("la accion vs su media de 50d", (f) => f.sm, (x) => ((100 * x) >= 0 ? "+" : "") + (100 * x).toFixed(1) + "%");
comparar("senales del mismo ticker ese dia", (f) => f._racimo, (x) => String(Math.round(x)));
comparar("% del golpe que es pata de spread", (f) => f.pctPata, pct);
comparar("dias que se aguanto", (f) => f._dias, (x) => String(Math.round(x)) + " d");
comparar("[no se sabe al comprar] movio la accion", (f) => f._mov, (x) => ((100 * x) >= 0 ? "+" : "") + (100 * x).toFixed(1) + "%");

function reparto(nom, clave, orden) {
  console.log("");
  console.log("  === " + nom + " ===");
  console.log("");
  console.log("  " + "".padEnd(22) + "n".padStart(5) + "ganan".padStart(8) + "dinero".padStart(13) + "  mult mediano");
  const claves = orden || [...new Set(T.map(clave))].sort();
  for (const k of claves) {
    const L = T.filter((f) => clave(f) === k); if (!L.length) continue;
    const g = L.filter((f) => f._gana).length;
    const din = L.reduce((a, f) => a + f._din, 0);
    console.log("  " + String(k).padEnd(22) + String(L.length).padStart(5) + (pct(g / L.length)).padStart(8) +
      D(din).padStart(13) + "  " + med(L.map((f) => f._mult)).toFixed(2));
  }
}
reparto("POR QUE SALIO", (f) => f._por, ["objetivo", "plazo", "corte", "vencimiento"]);
reparto("VENCE DENTRO DE LOS 15 DIAS DE TENENCIA?", (f) => f._venceDentro ? "SI vence dentro" : "no, sobrevive", ["SI vence dentro", "no, sobrevive"]);
reparto("DIAS A VENCER AL COMPRAR", (f) => f.dte <= 10 ? "1. de 5 a 10" : f.dte <= 21 ? "2. de 11 a 21" : f.dte <= 45 ? "3. de 22 a 45" : f.dte <= 90 ? "4. de 46 a 90" : "5. mas de 90");
reparto("PROFUNDIDAD", (f) => f.prof <= 0.25 ? "1. 0-25%" : f.prof <= 0.50 ? "2. 25-50%" : f.prof <= 0.75 ? "3. 50-75%" : "4. mas de 75%");
reparto("LADO", (f) => f.l === "P" ? "put" : "call", ["put", "call"]);
reparto("TICKER", (f) => f.tk);
reparto("CUANTAS SENALES DEL MISMO TICKER ESE DIA", (f) => f._racimo === 1 ? "1 sola" : f._racimo <= 3 ? "2 a 3" : f._racimo <= 8 ? "4 a 8" : "9 o mas", ["1 sola", "2 a 3", "4 a 8", "9 o mas"]);
console.log("");
