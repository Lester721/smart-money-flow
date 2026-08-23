// LA PREDICCIÓN QUE SALE DEL MECANISMO — estrecho y por la tarde
//
// ═══ DE DÓNDE SALE ══════════════════════════════════════════════════════════════════════════
//
// Medido sobre 80.208 barras, comparando la misma barra del mismo día contra su espejo:
// el índice se mueve MENOS cuando está sentado encima de un montón de interés abierto.
// Aguanta el mapa plano (t=−0,20: no es la rejilla) y los números redondos (a igual redondez
// sale más fuerte, t=−6,94). Y desde que el mercado de 0DTE es grande, crece durante el día:
//
//     2024-2026    mañana −5,4% (t=−3,9) · mediodía −7,7% (t=−5,6) · tarde −11,6% (t=−5,3)
//     por la tarde, año a año:  2024 −10,9% · 2025 −11,7% · 2026 −11,8%
//
// ═══ POR QUÉ EL CÓNDOR DE ±45 NO LO COBRA ═══════════════════════════════════════════════════
//
// Ya se probó: filtrar los días por el montón de OI no mueve el dinero, y se ve por qué en una
// sola columna — el porcentaje de días que tocan el cóndor apenas cambia (12%, 11%, 11%, 18%,
// 13%). Un cóndor de ±45 puntos a cinco horas del cierre no vive del día medio: vive del 12%
// de días que se salen. Un 12% menos de movimiento no cambia esos días.
//
// ═══ LA PREDICCIÓN ══════════════════════════════════════════════════════════════════════════
//
// Un 12% menos de movimiento SÍ tiene que notarse en una estructura donde el resultado dependa
// de un movimiento corto y pequeño: estrecha y entrando tarde. Ahí el precio está siempre cerca
// del borde, que es justo donde un 12% decide.
//
// Y si NO se nota ni ahí, entonces el efecto es real pero incobrable, y esto lo cierra con un
// número en lugar de con una impresión.
//
// ═══ LO QUE HAY QUE VIGILAR ═════════════════════════════════════════════════════════════════
//
// Estrecho y tarde significa poco crédito, y el peaje de cuatro patas pagado dos veces puede
// comerse todo. Por eso se imprime SIEMPRE el crédito medio y el peaje, para poder ver si la
// ventaja del 12% es mayor o menor que lo que cuesta entrar y salir.

import { diasDisponibles, cargarDia, rejilla, compraEn, estructura, condor, idxHora } from "./lib0dte.mjs";

const DESPLAZA = 37;
const med = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { const m = med(v); return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)); };
const mediana = (v) => { const s = [...v].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

/** Mariposa de hierro: las dos vendidas al dinero, alas a distancia A. */
const mariposa = (K, ala) => [
  { K, lado: "C", dir: -1 }, { K: K + ala, lado: "C", dir: 1 },
  { K, lado: "P", dir: -1 }, { K: K - ala, lado: "P", dir: 1 },
];

const ESTRUCTURAS = [
  { n: "cóndor ±10 alas 25", f: (K) => condor(K, 10, 25) },
  { n: "cóndor ±15 alas 25", f: (K) => condor(K, 15, 25) },
  { n: "cóndor ±20 alas 25", f: (K) => condor(K, 20, 25) },
  { n: "cóndor ±25 alas 25", f: (K) => condor(K, 25, 25) },
  { n: "mariposa alas 30", f: (K) => mariposa(K, 30) },
  { n: "mariposa alas 50", f: (K) => mariposa(K, 50) },
];
const HORAS = ["13:30", "14:00", "14:30", "15:00"];

// ── cargar ──────────────────────────────────────────────────────────────────
const filas = [];
let huecos = 0;
for (const dd of diasDisponibles()) {
  if (dd < "2024-01-01") continue;                 // desde que el mercado de 0DTE es grande
  const d = cargarDia(dd);
  if (!d || !d.oi) continue;
  const b0 = d.barras[0];
  const K0 = rejilla(b0.spot);
  const cc = compraEn(b0, K0, "C"), pp = compraEn(b0, K0, "P");
  if (cc == null || pp == null || !(cc + pp > 0)) continue;
  const esperado = cc + pp;

  const mapa = new Map(); let total = 0;
  for (const [clave, n] of Object.entries(d.oi)) {
    if (!(n > 0)) continue;
    const K = Number(clave.split("|")[0]);
    mapa.set(K, (mapa.get(K) ?? 0) + n); total += n;
  }
  if (!(total > 0)) continue;
  const ks = [...mapa.keys()].sort((a, b) => a - b);
  const ns = ks.map((K) => mapa.get(K) / total);
  const pegado = (x) => {
    const r = 0.15 * esperado;
    let lo = 0, hi = ks.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (ks[m] < x - r) lo = m + 1; else hi = m; }
    let s = 0; for (let i = lo; i < ks.length && ks[i] <= x + r; i++) s += ns[i];
    return s;
  };

  const f = { dia: dd, anio: dd.slice(0, 4), por: {} };
  for (const h of HORAS) {
    let i; try { i = idxHora(d, h); } catch { continue; }
    const x = d.barras[i].spot, K = rejilla(x);
    const r = { senal: pegado(x), res: {} };
    for (const e of ESTRUCTURAS) {
      const o = estructura(d, i, "vencimiento", e.f(K));
      if (!o) { huecos++; continue; }
      // el peaje: lo que cuesta entrar y salir, medido como la horquilla de las cuatro patas
      r.res[e.n] = { dolares: o.dolares, credito: o.credito * 100, riesgo: o.riesgoMax };
    }
    f.por[h] = r;
  }
  filas.push(f);
}
const anios = filas.length / 244;
console.log(`## ${filas.length} días desde 2024 (${anios.toFixed(2)} años) · huecos ${huecos}\n`);

// ── el mapa: estructura x hora, sin filtro ─────────────────────────────────
console.log("### SIN FILTRO — todas las tardes\n");
console.log(`  ${"estructura".padEnd(20)}` + HORAS.map((h) => h.padStart(14)).join("") + "   crédito medio");
for (const e of ESTRUCTURAS) {
  let l = `  ${e.n.padEnd(20)}`, cred = [];
  for (const h of HORAS) {
    const v = filas.map((f) => f.por[h]?.res[e.n]).filter(Boolean);
    if (!v.length) { l += "—".padStart(14); continue; }
    l += `$${(v.reduce((a, x) => a + x.dolares, 0) / anios).toFixed(0)}`.padStart(14);
    cred.push(med(v.map((x) => x.credito)));
  }
  console.log(l + `      $${med(cred).toFixed(0)}`);
}
console.log("");

// ── con el filtro del montón de OI ─────────────────────────────────────────
console.log("### CON EL FILTRO — sólo el tercio con MÁS interés abierto pegado al precio\n");
console.log("  (y al lado, entre paréntesis, el mismo tercio elegido con el mapa de OTRO día)\n");
console.log(`  ${"estructura".padEnd(20)}` + HORAS.map((h) => h.padStart(22)).join(""));
for (const e of ESTRUCTURAS) {
  let l = `  ${e.n.padEnd(20)}`;
  for (const h of HORAS) {
    const us = filas.filter((f) => f.por[h]?.res[e.n]);
    if (us.length < 100) { l += "—".padStart(22); continue; }
    const ord = [...us].sort((a, b) => b.por[h].senal - a.por[h].senal);
    const alto = ord.slice(0, Math.floor(ord.length / 3));
    const bar = us.map((f, j) => ({ f, s: us[(j + DESPLAZA) % us.length].por[h].senal }))
      .sort((a, b) => b.s - a.s).slice(0, Math.floor(us.length / 3)).map((x) => x.f);
    const anioTercio = alto.length / 244;
    const dA = alto.reduce((a, f) => a + f.por[h].res[e.n].dolares, 0) / anioTercio;
    const dB = bar.reduce((a, f) => a + f.por[h].res[e.n].dolares, 0) / anioTercio;
    l += `$${dA.toFixed(0)} ($${dB.toFixed(0)})`.padStart(22);
  }
  console.log(l);
}
console.log("");

// ── el detalle de la mejor celda ───────────────────────────────────────────
console.log("### EL DETALLE DE LO QUE MEJOR PINTA\n");
let mejor = null;
for (const e of ESTRUCTURAS) for (const h of HORAS) {
  const us = filas.filter((f) => f.por[h]?.res[e.n]);
  if (us.length < 100) continue;
  const ord = [...us].sort((a, b) => b.por[h].senal - a.por[h].senal);
  const alto = ord.slice(0, Math.floor(ord.length / 3));
  const v = alto.map((f) => f.por[h].res[e.n].dolares);
  const total = v.reduce((a, b) => a + b, 0) / (alto.length / 244);
  if (!mejor || total > mejor.total) mejor = { e, h, alto, v, total };
}
if (mejor) {
  const { e, h, alto, v, total } = mejor;
  const t = med(v) * Math.sqrt(v.length) / sd(v);
  const orden = [...v].sort((a, b) => b - a);
  const sin5 = (v.reduce((a, b) => a + b, 0) - orden.slice(0, 5).reduce((a, b) => a + b, 0)) / (alto.length / 244);
  console.log(`  ${e.n} a las ${h}, sólo el tercio con más OI pegado`);
  console.log(`     n=${alto.length} · $${total.toFixed(0)}/año · mediana $${mediana(v).toFixed(0)} · peor día $${Math.min(...v).toFixed(0)} · t=${t.toFixed(2)}`);
  console.log(`     crédito medio $${med(alto.map((f) => f.por[h].res[e.n].credito)).toFixed(0)} · riesgo máximo $${med(alto.map((f) => f.por[h].res[e.n].riesgo)).toFixed(0)}`);
  console.log(`     aciertos ${(100 * v.filter((x) => x > 0).length / v.length).toFixed(0)}%`);
  console.log(`     sin los 5 mejores días: $${sin5.toFixed(0)}/año`);
  for (const a of ["2024", "2025", "2026"]) {
    const w = alto.filter((f) => f.anio === a).map((f) => f.por[h].res[e.n].dolares);
    if (w.length) console.log(`     ${a}: $${w.reduce((x, y) => x + y, 0).toFixed(0)} en ${w.length} operaciones`);
  }
}
