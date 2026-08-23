// ¿DÓNDE ES MÁS GRANDE EL FRENO? — el cruce de la hora con el año
//
// El freno existe (t=−6,02 sobre 68.243 barras, y aguanta el mapa plano y los números redondos)
// pero es pequeño: un 4% menos de movimiento. Demasiado poco para cambiar si un cóndor de ±45
// se toca o no, que es lo que se acaba de comprobar: el porcentaje de días tocados no se mueve.
//
// Pero el efecto NO es uniforme. Crece en dos direcciones a la vez:
//     por año:  2022 +1,23 · 2023 −0,71 · 2024 −1,46 · 2025 −1,84 · 2026 −2,70
//     por hora: mañana −0,88 · mediodía −0,91 · desde las 14:30 −1,54 (y a las 15:30 −4,02)
//
// Si las dos cosas se multiplican, en la última media hora de 2026 el freno podría ser lo
// bastante grande para servir de algo. Y si no, esto cierra la idea con un número en vez de con
// una impresión. Ésa es la única pregunta de este script.

import { diasDisponibles, cargarDia, rejilla, compraEn } from "./lib0dte.mjs";

const HORIZONTE = 6;
const med = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const sd = (v) => { const m = med(v); return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)); };

const cache = [];
for (const dd of diasDisponibles()) {
  const d = cargarDia(dd);
  if (!d || !d.oi) continue;
  const b0 = d.barras[0];
  const K0 = rejilla(b0.spot);
  const c = compraEn(b0, K0, "C"), p = compraEn(b0, K0, "P");
  if (c == null || p == null || !(c + p > 0)) continue;
  const mapa = new Map(); let total = 0;
  for (const [clave, n] of Object.entries(d.oi)) {
    if (!(n > 0)) continue;
    const K = Number(clave.split("|")[0]);
    mapa.set(K, (mapa.get(K) ?? 0) + n); total += n;
  }
  if (!(total > 0)) continue;
  const ks = [...mapa.keys()].sort((a, b) => a - b);
  cache.push({
    anio: dd.slice(0, 4), spots: d.barras.map((b) => b.spot), horas: d.barras.map((b) => b.t),
    ks, ns: ks.map((K) => mapa.get(K) / total), esperado: c + p, spot0: b0.spot,
  });
}

function peso(c, x) {
  const radio = 0.15 * c.esperado;
  let lo = 0, hi = c.ks.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (c.ks[m] < x - radio) lo = m + 1; else hi = m; }
  let s = 0;
  for (let i = lo; i < c.ks.length && c.ks[i] <= x + radio; i++) s += c.ns[i];
  return s;
}

const obs = [];
for (const c of cache) {
  for (let i = 0; i + HORIZONTE < c.spots.length; i++) {
    const x = c.spots[i];
    obs.push({
      anio: c.anio, t: c.horas[i],
      mov: Math.abs(c.spots[i + HORIZONTE] - x) / c.esperado,
      aqui: peso(c, x), espejo: peso(c, 2 * c.spot0 - x),
    });
  }
}

function dif(f) {
  const p = obs.filter((o) => f(o) && Math.abs(o.aqui - o.espejo) > 0.001);
  const a = p.filter((o) => o.aqui > o.espejo).map((o) => o.mov);
  const b = p.filter((o) => o.aqui < o.espejo).map((o) => o.mov);
  if (a.length < 40 || b.length < 40) return null;
  return {
    d: (med(a) - med(b)) * 100,
    rel: 100 * (med(a) - med(b)) / med(b),          // el freno en % del movimiento normal
    t: (med(a) - med(b)) / Math.sqrt(sd(a) ** 2 / a.length + sd(b) ** 2 / b.length),
    n: p.length,
  };
}

console.log(`## ${cache.length} días · ${obs.length.toLocaleString("es-ES")} barras\n`);
console.log("### EL FRENO EN % DEL MOVIMIENTO NORMAL — año contra tramo del día\n");
const TRAMOS = [["mañana", (o) => o.t < "12:00"], ["mediodía", (o) => o.t >= "12:00" && o.t < "14:30"],
                ["tarde", (o) => o.t >= "14:30"], ["última media hora", (o) => o.t >= "15:15"]];
console.log(`  ${"año".padEnd(6)}` + TRAMOS.map(([n]) => n.padStart(20)).join(""));
for (const a of ["2022", "2023", "2024", "2025", "2026"]) {
  let linea = `  ${a.padEnd(6)}`;
  for (const [, f] of TRAMOS) {
    const r = dif((o) => o.anio === a && f(o));
    linea += r ? `${r.rel.toFixed(1)}% (t=${r.t.toFixed(1)})`.padStart(20) : "—".padStart(20);
  }
  console.log(linea);
}
console.log("");
console.log("### SÓLO 2024-2026 (desde que el mercado de 0DTE es grande)\n");
for (const [n, f] of TRAMOS) {
  const r = dif((o) => o.anio >= "2024" && f(o));
  if (r) console.log(`  ${n.padEnd(20)} ${r.rel.toFixed(1).padStart(6)}% menos de movimiento · t=${r.t.toFixed(2).padStart(6)} · n=${r.n.toLocaleString("es-ES")}`);
}
console.log("");
console.log("### LA PREGUNTA FINAL: ¿es suficiente para algo?\n");
const mejor = dif((o) => o.anio >= "2024" && o.t >= "15:15");
if (mejor) {
  console.log(`  En el mejor rincón (2024-2026, última media hora) el freno es del ${(-mejor.rel).toFixed(1)}%.`);
  console.log(`  Un movimiento de 30 minutos que normalmente sería de 10 puntos, sería de ${(10 * (1 + mejor.rel / 100)).toFixed(1)}.`);
  console.log(`  Para que eso cambie si un cóndor de ±45 se toca o no, el precio tendría que estar`);
  console.log(`  justo en el borde. Pasa pocas veces, y de eso depende que valga dinero o no.`);
}
