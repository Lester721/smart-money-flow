// NEUTRAL AL MERCADO CON OPCIONES — sin vender ni una acción en corto.
//
// LARGO: la acción del ticker que dio la señal (calls 12x).
// COBERTURA: un CORTO SINTÉTICO de QQQ = comprar la put + vender la call, MISMO strike y
// vencimiento. Por paridad put-call eso es exactamente una acción corta: delta −1, sin modelo,
// sin estimar griegas. Todo con bid y ask reales de la cadena.
//
// Entrar:  compras put al ASK, vendes call al BID     -> cuesta ask(P) − bid(C)
// Salir:   vendes put al BID,  recompras call al ASK  -> recibes bid(P) − ask(C)
// Cuatro cruces de horquilla. Ese es el coste que hay que batir con el +0,29%.
import { cargar } from "./consultar.mjs";
import { abrir } from "./datos.mjs";
const D = (x) => (x < 0 ? "−$" : "$") + Math.abs(Math.round(x)).toLocaleString("en-US");
const yr = (y) => [...Array(12)].map((_, i) => y + String(i + 1).padStart(2, "0"));
const ANOS = [["2021", yr("2021")], ["2022", yr("2022")], ["2023", yr("2023")], ["2024", yr("2024")],
              ["2025", yr("2025")], ["2026", ["202601","202602","202603","202604","202605","202606","202607","202608"]]];
const cad = abrir("cadenas", { callado: true });
const ms = (d) => Date.parse(d.slice(0,4) + "-" + d.slice(4,6) + "-" + d.slice(6,8) + "T00:00:00Z");
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86400000);
const CC = new Map();
const chain = (tk, d) => { const k = tk + d; if (CC.has(k)) return CC.get(k);
  let v = null; try { v = cad.leer(tk, d); } catch {}
  CC.set(k, v); if (CC.size > 3000) CC.delete(CC.keys().next().value); return v; };
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
  const s = spotOk(chain(tk, d), d); SM.set(k, s); return s; };

/** Vencimiento mas cercano con al menos `minDte` dias, y strike mas cercano al spot. */
function parATM(tk, d, minDte = 25) {
  const c = chain(tk, d); if (!c) return null; const s = spotDe(tk, d); if (!(s > 0)) return null;
  let exp = null, md = Infinity;
  for (const e of Object.keys(c)) { const n = dteDe(d, e); if (n < minDte) continue; if (n < md) { md = n; exp = e; } }
  if (!exp) return null;
  const g = c[exp]; let K = null, dm = Infinity;
  for (const cl of Object.keys(g)) { if (cl.slice(-1) !== "C") continue;
    const k = Number(cl.slice(0, -2)); if (!g[k + "|P"]) continue;
    const dd = Math.abs(k - s); if (dd < dm) { dm = dd; K = k; } }
  if (K == null) return null;
  const C = g[K + "|C"], P = g[K + "|P"];
  if (!(C[0] > 0 && C[1] > 0 && P[0] > 0 && P[1] > 0)) return null;
  return { exp, K, cBid: C[0], cAsk: C[1], pBid: P[0], pAsk: P[1], spot: s };
}
function cotiza(tk, d, exp, K) { const g = chain(tk, d)?.[exp]; if (!g) return null;
  const C = g[K + "|C"], P = g[K + "|P"]; if (!C || !P) return null;
  if (!(C[0] > 0 && C[1] > 0 && P[0] > 0 && P[1] > 0)) return null;
  return { cBid: C[0], cAsk: C[1], pBid: P[0], pAsk: P[1] }; }
function nDias(tk, d, n) { const ds = cad.dias(tk); const i = ds.indexOf(d); return (i < 0 || i + n >= ds.length) ? null : ds[i + n]; }
function movLimpio(tk, d, n) { const ds = cad.dias(tk); const i = ds.indexOf(d); if (i < 0 || i + n >= ds.length) return null;
  let prev = spotDe(tk, ds[i]); if (!(prev > 0)) return null; const a = prev;
  for (let k = i + 1; k <= i + n; k++) { const s = spotDe(tk, ds[k]); if (!(s > 0)) return null;
    if (Math.abs(s / prev - 1) > 0.25) return null; prev = s; }
  return prev / a - 1; }

const TK = ["AAPL", "AMD", "META", "MSFT", "NVDA", "QQQ", "TSLA"];   // SPY fuera: su senal daba 0 exacto
const SIG = new Map();
for (const [y, M] of ANOS) for (const f of cargar(M)) {
  const k = f.tk + "|" + f.dC + "|" + f.l; const x = SIG.get(k);
  if (x) { if (f.vsOI > x.vsOI) x.vsOI = f.vsOI; } else SIG.set(k, { tk: f.tk, dC: f.dC, l: f.l, y, vsOI: f.vsOI });
}
const S = [...SIG.values()].filter((x) => x.vsOI >= 12 && x.l === "C" && TK.includes(x.tk)).sort((a, b) => a.dC.localeCompare(b.dC));
console.log("\n  === AUDITORIA ===\n");
console.log("  senales de calls 12x (sin SPY) ... " + S.length);

/** Largo $N de la accion + corto sintetico de $N de QQQ. Devuelve porcentajes sobre $N. */
function trade(x, dias, idx = "QQQ") {
  const rA = movLimpio(x.tk, x.dC, dias); if (rA == null) return null;
  const p0 = parATM(idx, x.dC); if (!p0) return null;
  const dSal = nDias(idx, x.dC, dias); if (!dSal) return null;
  const p1 = cotiza(idx, dSal, p0.exp, p0.K); if (!p1) return null;
  const s1 = spotDe(idx, dSal); if (!(s1 > 0)) return null;
  if (Math.abs(s1 / p0.spot - 1) > 0.25) return null;
  const noc = 100 * p0.spot;                      // un sintetico cubre 100 acciones del indice
  const entra = p0.pAsk - p0.cBid;                // pago ask(put), cobro bid(call)
  const sale = p1.pBid - p1.cAsk;                 // cobro bid(put), pago ask(call)
  const plHedge = (sale - entra) * 100;
  return { rAccion: rA, rHedge: plHedge / noc, neto: rA + plHedge / noc,
           horq: ((p0.pAsk - p0.pBid) + (p0.cAsk - p0.cBid)) * 100 / noc };
}
const mediaDe = (v) => v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
const t_de = (v) => { if (v.length < 3) return null; const m = mediaDe(v);
  const s = Math.sqrt(v.reduce((a, x) => a + (x - m) * (x - m), 0) / (v.length - 1)); return s ? m / (s / Math.sqrt(v.length)) : null; };
const pc = (x) => ((100 * x) >= 0 ? "+" : "") + (100 * x).toFixed(3) + "%";

console.log("\n  === EL CORTO SINTETICO DE QQQ: cuanto cuesta montarlo ===\n");
for (const dias of [5, 10]) {
  const R = S.map((x) => trade(x, dias)).filter(Boolean);
  if (!R.length) { console.log("  " + dias + " dias: sin datos"); continue; }
  console.log("  " + dias + " dias - " + R.length + " operaciones con cotizacion de las 4 patas");
  console.log("     horquilla de las dos patas, sobre el nocional: " + (100 * mediaDe(R.map((r) => r.horq))).toFixed(3) + "%");
  console.log("     lo que hace la cobertura sola: " + pc(mediaDe(R.map((r) => r.rHedge))));
}
console.log("\n  === RESULTADO NETO: largo la accion + corto sintetico de QQQ ===\n");
console.log("  " + "".padEnd(20) + "n".padStart(6) + "la accion".padStart(14) + "la cobertura".padStart(14) + "NETO".padStart(22));
for (const dias of [5, 10]) {
  const R = S.map((x) => trade(x, dias)).filter(Boolean); if (!R.length) continue;
  const a = mediaDe(R.map((r) => r.rAccion)), h = mediaDe(R.map((r) => r.rHedge)), n = mediaDe(R.map((r) => r.neto));
  const t = t_de(R.map((r) => r.neto));
  console.log("  " + ("a " + dias + " dias").padEnd(20) + String(R.length).padStart(6) + pc(a).padStart(14) + pc(h).padStart(14) + (pc(n) + "  t=" + t.toFixed(1)).padStart(22));
}
console.log("\n  === AGUANTA PARTIDO EN TRES? (a 10 dias) ===\n");
const R10 = S.map((x) => ({ x, r: trade(x, 10) })).filter((y) => y.r);
const t3 = Math.floor(R10.length / 3);
console.log("  " + "".padEnd(30) + "n".padStart(6) + "NETO".padStart(22));
for (const [nom, G] of [["todo junto", R10], ["tercio 1", R10.slice(0, t3)], ["tercio 2", R10.slice(t3, 2 * t3)], ["tercio 3", R10.slice(2 * t3)]]) {
  const v = G.map((y) => y.r.neto); const m = mediaDe(v), t = t_de(v);
  const rango = nom === "todo junto" ? "" : " (" + G[0].x.dC.slice(0, 6) + "-" + G[G.length - 1].x.dC.slice(0, 6) + ")";
  console.log("  " + (nom + rango).padEnd(30) + String(G.length).padStart(6) + (pc(m) + "  t=" + t.toFixed(1)).padStart(22));
}
console.log("\n  === ANO POR ANO (a 10 dias) ===\n");
for (const [y] of ANOS) {
  const v = R10.filter((z) => z.x.y === y).map((z) => z.r.neto);
  if (v.length < 10) { console.log("  " + y + "  n=" + v.length); continue; }
  const m = mediaDe(v), t = t_de(v);
  console.log("  " + y + "  n=" + String(v.length).padStart(3) + "  " + (pc(m) + "  t=" + t.toFixed(1)).padStart(22));
}
console.log("");

// ── EL CONTROL QUE DECIDE: los mismos tickers, los mismos dias de la semana, pero corridos ──
function correr(tk, d, k) { const ds = cad.dias(tk); const i = ds.indexOf(d); return (i < 0 || i + k >= ds.length) ? null : ds[i + k]; }
console.log("");
console.log("  === PLACEBO: la misma operacion, los dias de entrada corridos ===");
console.log("");
console.log("  " + "".padEnd(30) + "n".padStart(6) + "NETO a 10 dias".padStart(22));
{
  const v = R10.map((y) => y.r.neto); const m = mediaDe(v), t = t_de(v);
  console.log("  " + "LA SENAL".padEnd(30) + String(v.length).padStart(6) + (pc(m) + "  t=" + t.toFixed(1)).padStart(22));
}
for (const k of [10, 20, 30, 60]) {
  const P = S.map((x) => { const d = correr(x.tk, x.dC, k); return d ? { ...x, dC: d } : null; }).filter(Boolean);
  const R = P.map((x) => trade(x, 10)).filter(Boolean);
  if (R.length < 20) { console.log("  " + ("placebo +" + k + " dias").padEnd(30) + String(R.length).padStart(6)); continue; }
  const v = R.map((r) => r.neto); const m = mediaDe(v), t = t_de(v);
  console.log("  " + ("placebo: " + k + " dias despues").padEnd(30) + String(v.length).padStart(6) + (pc(m) + "  t=" + t.toFixed(1)).padStart(22));
}
{
  const NO = [...SIG.values()].filter((x) => x.vsOI < 12 && x.l === "C" && TK.includes(x.tk)).sort((a, b) => a.dC.localeCompare(b.dC));
  const R = NO.map((x) => trade(x, 10)).filter(Boolean);
  const v = R.map((r) => r.neto); const m = mediaDe(v), t = t_de(v);
  console.log("  " + "placebo: calls SIN el 12x".padEnd(30) + String(v.length).padStart(6) + (pc(m) + "  t=" + t.toFixed(1)).padStart(22));
}
console.log("");
