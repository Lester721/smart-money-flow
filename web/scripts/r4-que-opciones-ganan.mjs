// ¿QUÉ CLASE DE OPCIÓN COMPRADA GANA DINERO?
//
// Pregunta de Lester: «busca las opciones que sí ganan dinero y explícame en una tabla qué
// características tienen. Un ejemplo: ¿está dentro del dinero (delta sobre .5)?»
//
// CÓMO SE HACE PARA NO ENGAÑARSE: no se busca el rincón ganador DENTRO de una muestra ya
// elegida por una señal — eso encuentra un ganador por casualidad siempre. Se compra A CIEGAS
// todas las combinaciones, cada semana, en 8 tickers, 5 años y medio, y se mira el mapa entero.
// Sin señal, sin filtro, sin elegir el momento. Lo que gane, gana por su forma, no por acertar.
//
// El delta no se usa: en esta casa el delta era un Black-Scholes disfrazado de dato. Se usa la
// DISTANCIA AL DINERO, que se calcula con el strike y el precio real. Equivalencia práctica:
//   dentro del dinero  ≈  delta por encima de 0,5
//   justo en el dinero ≈  delta 0,5
//   fuera del dinero   ≈  delta por debajo de 0,5 (cuanto más lejos, más bajo)
//
// Compra al ask, venta al bid — el peaje va dentro. Salida: el primer día que el bid llegue a
// 2x lo pagado; si no llega, se aguanta a vencimiento.

import { abrir } from "./datos.mjs";

const ms = (d) => Date.parse(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
const dteDe = (a, b) => Math.round((ms(b) - ms(a)) / 86_400_000);

const TICKERS = ["AAPL", "AMD", "META", "MSFT", "NVDA", "QQQ", "SPY", "TSLA"];
const DESDE = "20210101", HASTA = "20260819";
const OBJETIVO = 2;
// distancia al dinero: negativo = DENTRO del dinero
const DIST = [
  [-0.10, "10% DENTRO"], [-0.05, "5% DENTRO"], [0.00, "en el dinero"],
  [0.05, "5% fuera"], [0.10, "10% fuera"], [0.20, "20% fuera"],
];
const PLAZO = [14, 30, 60, 120, 250];

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

// celda -> lista de resultados
const celdas = new Map();
const guarda = (k, r) => { if (!celdas.has(k)) celdas.set(k, []); celdas.get(k).push(r); };

let abiertasTot = 0;
for (const tk of TICKERS) {
  const ds = cad.dias(tk).filter((d) => d >= DESDE && d <= HASTA);
  let abiertas = [], semana = null;
  for (const d of ds) {
    const ch = cad.leer(tk, d); if (!ch) continue;
    // 1) actualizar lo abierto
    const siguen = [];
    for (const a of abiertas) {
      if (d > a.exp) { guarda(a.k, { ult: a.ult ?? 0, disp: false, dias: a.dias, ano: a.ano }); continue; }
      const p = ch[a.exp]?.[`${a.K}|${a.l}`];
      if (p) {
        a.dias++;
        const m = p[0] / a.coste;
        if (m >= OBJETIVO) { guarda(a.k, { ult: OBJETIVO, disp: true, dias: a.dias, ano: a.ano }); continue; }
        a.ult = m;
      }
      siguen.push(a);
    }
    abiertas = siguen;
    // 2) abrir, una vez por semana
    const sem = Math.floor((ms(d) - ms("20210104")) / 604_800_000);
    if (sem === semana) continue;
    semana = sem;
    const S = spotOk(ch, d); if (!S) continue;
    for (const dte of PLAZO) {
      let exp = null, md = Infinity;
      for (const e of Object.keys(ch)) { const t = dteDe(d, e); if (t < 5) continue; const x = Math.abs(t - dte); if (x < md) { md = x; exp = e; } }
      if (!exp || md > dte * 0.6) continue;                 // sin vencimiento parecido, no se inventa
      const g = ch[exp];
      for (const [dist, nomD] of DIST) {
        for (const l of ["C", "P"]) {
          // el strike que deja la opción a esa distancia: para call, por encima; para put, por debajo
          const obj = l === "C" ? S * (1 + dist) : S * (1 - dist);
          let K = null, dm = Infinity;
          for (const cl of Object.keys(g)) {
            if (cl.slice(-1) !== l) continue;
            const k = Number(cl.slice(0, -2)); const x = Math.abs(k - obj);
            if (x < dm) { dm = x; K = k; }
          }
          if (K == null) continue;
          const q = g[`${K}|${l}`]; if (!q || !(q[1] > 0)) continue;
          abiertas.push({ k: `${nomD}|${dte}|${l}`, exp, K, l, coste: q[1], ult: null, dias: 0, ano: d.slice(0, 4) });
          abiertasTot++;
        }
      }
    }
  }
  for (const a of abiertas) guarda(a.k, { ult: a.ult ?? 0, disp: false, dias: a.dias, ano: a.ano });
  console.log(`  ${tk} listo`);
}

const R = (L) => {
  if (!L || !L.length) return null;
  const d = L.filter((o) => o.disp).length;
  let g = 0, p = 0;
  for (const o of L) { const x = 1000 * (o.ult - 1); if (x > 0) g += x; else p += -x; }
  return { n: L.length, pd: 100 * d / L.length, r: p ? g / p : Infinity, neto: g - p };
};

console.log(`\n  ${abiertasTot.toLocaleString("en-US")} compras a ciegas · 8 tickers · 2021-2026 · una tanda cada semana\n`);

for (const l of ["C", "P"]) {
  console.log(`\n=== ${l === "C" ? "CALLS" : "PUTS"} — el número es el RATIO (dólares ganados ÷ perdidos). Por encima de 1.00 gana ===\n`);
  console.log(`  ${"distancia al dinero".padEnd(20)} ${PLAZO.map((p) => `${p}d`.padStart(9)).join("")}`);
  for (const [, nomD] of DIST) {
    const cols = PLAZO.map((dte) => {
      const r = R(celdas.get(`${nomD}|${dte}|${l}`));
      return r ? (r.r === Infinity ? "∞" : r.r.toFixed(2)).padStart(9) : "—".padStart(9);
    });
    console.log(`  ${nomD.padEnd(20)} ${cols.join("")}`);
  }
  console.log(`\n  ${"".padEnd(20)} ${PLAZO.map((p) => `${p}d`.padStart(9)).join("")}   (% que doblan)`);
  for (const [, nomD] of DIST) {
    const cols = PLAZO.map((dte) => {
      const r = R(celdas.get(`${nomD}|${dte}|${l}`));
      return r ? `${r.pd.toFixed(0)}%`.padStart(9) : "—".padStart(9);
    });
    console.log(`  ${nomD.padEnd(20)} ${cols.join("")}`);
  }
}

// las celdas ganadoras, ordenadas
console.log(`\n\n=== LAS QUE GANAN, ordenadas ===\n`);
console.log(`  ${"qué es".padEnd(34)}      n   doblan    RATIO         neto`);
const filas = [];
for (const [k, L] of celdas) { const r = R(L); if (r) filas.push({ k, ...r }); }
for (const f of filas.filter((f) => f.r > 1).sort((a, b) => b.r - a.r)) {
  const [d, p, l] = f.k.split("|");
  console.log(`  ${`${l === "C" ? "call" : "put"} · ${d} · ${p} días`.padEnd(34)} ${String(f.n).padStart(6)}   ${f.pd.toFixed(0).padStart(4)}%   ${(f.r === Infinity ? "∞" : f.r.toFixed(2)).padStart(6)}   ${f.neto >= 0 ? "+" : "−"}$${Math.abs(Math.round(f.neto)).toLocaleString("en-US")}`);
}
const ganan = filas.filter((f) => f.r > 1).length;
console.log(`\n  ${ganan} celdas de ${filas.length} ganan dinero.\n`);
