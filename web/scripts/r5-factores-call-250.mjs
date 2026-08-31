// ¿QUÉ FACTORES HAY QUE MIRAR PARA COMPRAR UNA CALL DE 250 DÍAS?
//
// Pregunta de Lester, después de que el mapa (r4) diera que las calls largas ganan.
//
// LA PUERTA DE ENTRADA, ANTES DE HABLAR DE FACTORES: una call de 250 días es comprar la acción
// con dinero prestado. Si gana lo mismo que la acción, no hay estrategia — hay un mercado que
// subió, con más riesgo. Por eso la PRIMERA fila de toda tabla es **comprar las acciones**,
// el mismo día y los mismos días. Si la call no la bate, se acabó.
//
// LOS FACTORES, todos calculados con dato real (nada de modelos):
//   1. el ticker
//   2. lo cara que está la opción: prima ÷ precio de la acción
//   3. dónde viene la acción: su subida o bajada en los 60 días anteriores
//   4. la acción contra su media de 200 días
//   5. el año de entrada
//
// Compra al ask, venta al bid. Salida: el primer día que el bid llegue a 2x; si no, a vencimiento.

import { abrir } from "./datos.mjs";

const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);
const TICKERS = ["AAPL", "AMD", "META", "MSFT", "NVDA", "QQQ", "SPY", "TSLA"];
const DESDE = "20210101", HASTA = "20260819";
const OTM = 0.05, DTE = 250, OBJETIVO = 2;

const cad = abrir("cadenas");
function spotOk(c, hoy) {
  let exp = null, md = Infinity;
  for (const e of Object.keys(c)) { const d = dteDe(hoy, e); if (d < 1) continue; if (d < md) { md = d; exp = e; } }
  if (!exp) return null;
  const g = c[exp]; let K = null, dm = Infinity;
  for (const cl of Object.keys(g)) {
    if (cl.slice(-1) !== "C") continue;
    const k = Number(cl.slice(0, -2)); const p = g[`${k}|P`]; if (!p) continue;
    const d = Math.abs((g[cl][0] + g[cl][1]) / 2 - (p[0] + p[1]) / 2);
    if (d < dm) { dm = d; K = k; }
  }
  if (K == null) return null;
  const C = g[`${K}|C`], P = g[`${K}|P`];
  const s = K + (C[0] + C[1]) / 2 - (P[0] + P[1]) / 2;
  return s > 0 ? s : null;
}

const ops = [];
for (const tk of TICKERS) {
  const ds = cad.dias(tk).filter((d) => d <= HASTA);
  // el precio de la acción cada día, por paridad (mismo método auditado)
  const spot = new Map();
  for (const d of ds) { const c = cad.leer(tk, d); if (!c) continue; const s = spotOk(c, d); if (s) spot.set(d, s); }
  const conS = ds.filter((d) => spot.has(d));

  let abiertas = [], semana = null;
  for (let i = 0; i < conS.length; i++) {
    const d = conS[i];
    if (d < DESDE) continue;
    const ch = cad.leer(tk, d); if (!ch) continue;
    // 1) actualizar lo abierto
    const siguen = [];
    for (const a of abiertas) {
      if (d > a.exp) { a.cerrar(a.ult ?? 0, d); continue; }
      const p = ch[a.exp]?.[`${a.K}|C`];
      if (p) {
        a.dias++;
        const m = p[0] / a.coste;
        if (m >= OBJETIVO) { a.cerrar(OBJETIVO, d); continue; }
        a.ult = m;
      }
      siguen.push(a);
    }
    abiertas = siguen;
    // 2) abrir, una vez por semana
    const sem = Math.floor((ms(d) - ms("20210104")) / 604_800_000);
    if (sem === semana) continue;
    semana = sem;
    const S = spot.get(d);
    let exp = null, md = Infinity;
    for (const e of Object.keys(ch)) { const t = dteDe(d, e); if (t < 150) continue; const x = Math.abs(t - DTE); if (x < md) { md = x; exp = e; } }
    if (!exp || md > 100) continue;
    const g = ch[exp], obj = S * (1 + OTM);
    let K = null, dm = Infinity;
    for (const cl of Object.keys(g)) {
      if (cl.slice(-1) !== "C") continue;
      const k = Number(cl.slice(0, -2)); const x = Math.abs(k - obj);
      if (x < dm) { dm = x; K = k; }
    }
    if (K == null) continue;
    const q = g[`${K}|C`]; if (!q || !(q[1] > 0)) continue;

    // ── los factores, todos con dato de HOY o de antes ──
    const iAntes60 = conS[i - 60], iAntes200 = conS[i - 200];
    const s60 = iAntes60 ? spot.get(iAntes60) : null;
    const ma200 = iAntes200 ? (() => { let a = 0, n = 0; for (let j = Math.max(0, i - 199); j <= i; j++) { const v = spot.get(conS[j]); if (v) { a += v; n++; } } return n > 150 ? a / n : null; })() : null;
    const fila = {
      tk, dC: d, exp, K, coste: q[1], S, ano: d.slice(0, 4),
      caraPct: 100 * q[1] / S,                                  // lo que cuesta la opción como % de la acción
      venia60: s60 ? (S / s60 - 1) : null,                       // de dónde viene la acción
      sobreMA: ma200 ? (S / ma200 - 1) : null,                   // contra su media de 200
      ult: null, dias: 0,
    };
    fila.cerrar = (m, dSal) => {
      fila.ult = m; fila.disp = m >= OBJETIVO; fila.dSal = dSal;
      const sSal = spot.get(dSal);
      fila.accion = sSal ? sSal / fila.S : null;                 // qué hizo la ACCIÓN en el mismo tiempo
      ops.push(fila);
    };
    abiertas.push(fila);
  }
  for (const a of abiertas) a.cerrar(a.ult ?? 0, conS[conS.length - 1]);
  console.log(`  ${tk} listo`);
}

const R = (L) => {
  if (!L || !L.length) return null;
  const d = L.filter((o) => o.disp).length;
  let g = 0, p = 0, ga = 0, pa = 0;
  for (const o of L) {
    const x = 1000 * (o.ult - 1); if (x > 0) g += x; else p += -x;
    if (o.accion != null) { const y = 1000 * (o.accion - 1); if (y > 0) ga += y; else pa += -y; }
  }
  return { n: L.length, pd: 100 * d / L.length, r: p ? g / p : Infinity, neto: g - p,
           rAcc: pa ? ga / pa : Infinity, netoAcc: ga - pa };
};
const F = (nom, r) => {
  if (!r) { console.log(`  ${nom.padEnd(26)}     —`); return; }
  console.log(`  ${nom.padEnd(26)} ${String(r.n).padStart(5)}  ${r.pd.toFixed(0).padStart(4)}%  ${(r.r === Infinity ? "∞" : r.r.toFixed(2)).padStart(6)}  ${(r.neto >= 0 ? "+" : "−") + "$" + Math.abs(Math.round(r.neto)).toLocaleString("en-US")}`.padEnd(78) + `  ${(r.rAcc === Infinity ? "∞" : r.rAcc.toFixed(2)).padStart(6)}  ${(r.netoAcc >= 0 ? "+" : "−") + "$" + Math.abs(Math.round(r.netoAcc)).toLocaleString("en-US")}`);
};

console.log(`\n  ${ops.length} compras · call 5% fuera · ~250 días · 8 tickers · 2021-2026\n`);
console.log(`  ${"".padEnd(26)}     n  dobla   RATIO         neto            LA ACCIÓN: ratio      neto`);
F("TODAS", R(ops));

console.log(`\n  --- por ticker ---`);
for (const t of TICKERS) F("  " + t, R(ops.filter((o) => o.tk === t)));

console.log(`\n  --- por lo CARA que estaba la opción (prima ÷ precio de la acción) ---`);
const cs = ops.map((o) => o.caraPct).sort((a, b) => a - b);
const q = (p) => cs[Math.floor(cs.length * p)];
for (const [a, b, n] of [[0, q(0.25), `barata (menos del ${q(0.25).toFixed(1)}%)`], [q(0.25), q(0.5), "algo barata"], [q(0.5), q(0.75), "algo cara"], [q(0.75), 1e9, `cara (más del ${q(0.75).toFixed(1)}%)`]])
  F("  " + n, R(ops.filter((o) => o.caraPct >= a && o.caraPct < b)));

console.log(`\n  --- por de DÓNDE VENÍA la acción (60 días antes) ---`);
for (const [a, b, n] of [[-9, -0.10, "venía cayendo más del 10%"], [-0.10, 0, "venía cayendo poco"], [0, 0.10, "venía subiendo poco"], [0.10, 9, "venía subiendo más del 10%"]])
  F("  " + n, R(ops.filter((o) => o.venia60 != null && o.venia60 >= a && o.venia60 < b)));

console.log(`\n  --- contra su media de 200 días ---`);
for (const [a, b, n] of [[-9, -0.05, "por DEBAJO de la media"], [-0.05, 0.10, "cerca de la media"], [0.10, 0.25, "por encima"], [0.25, 9, "muy por encima (+25%)"]])
  F("  " + n, R(ops.filter((o) => o.sobreMA != null && o.sobreMA >= a && o.sobreMA < b)));

console.log(`\n  --- por año de entrada ---`);
for (const a of ["2021", "2022", "2023", "2024", "2025"]) F("  " + a, R(ops.filter((o) => o.ano === a)));

const md = (v) => (v.length ? v.slice().sort((a, b) => a - b)[Math.floor(v.length / 2)] : NaN);
console.log(`\n  --- comprobaciones ---`);
console.log(`  ${"días retenido (mediana)".padEnd(46)} ${md(ops.map((o) => o.dias))}`);
console.log(`  ${"lo que cuesta el contrato (mediana)".padEnd(46)} $${(md(ops.map((o) => o.coste)) * 100).toLocaleString("en-US")}`);
console.log(`  ${"la opción cuesta, de la acción (mediana)".padEnd(46)} ${md(ops.map((o) => o.caraPct)).toFixed(1)}%`);
const no = ops.filter((o) => !o.disp);
console.log(`  ${"las que NO doblan acaban de media en".padEnd(46)} ${(no.reduce((a, o) => a + o.ult, 0) / (no.length || 1)).toFixed(2)}x`);
console.log(`  ${"de ésas, a cero (menos de 0.10x)".padEnd(46)} ${no.filter((o) => o.ult < 0.10).length} de ${no.length}`);
console.log("");
