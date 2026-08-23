// LA PREGUNTA QUE LO DECIDE: ¿EL FRENO YA ESTÁ EN EL PRECIO?
//
// ═══ DÓNDE ESTAMOS ══════════════════════════════════════════════════════════════════════════
//
// El freno es real y es lo primero del GEX que no sale plano en este proyecto:
//     el índice se mueve un 11,6% MENOS por la tarde cuando está sentado sobre un montón de
//     interés abierto (2024-2026, t=−5,25), y por años: 2024 −10,9% · 2025 −11,7% · 2026 −11,8%
//     aguanta el mapa plano (t=−0,20) y los números redondos (a igual redondez, t=−6,94)
//
// Pero no se convierte en dinero por ninguna vía probada: ni recentrando el cóndor (el montón
// está pegado al precio, se desplaza 0 puntos), ni filtrando los días (el % de días tocados no
// se mueve), ni con estructuras estrechas de tarde (el control barajado gana al filtro real).
//
// ═══ LA ÚNICA EXPLICACIÓN QUE FALTA POR DESCARTAR ═══════════════════════════════════════════
//
// Hay dos mundos posibles y sólo una medición los separa:
//
//   MUNDO A — el mercado YA SABE. Los días en que el precio está sobre un montón de interés
//   abierto, la opción se vende más barata en la misma proporción en que se mueve menos.
//   Entonces no hay nada que cobrar: el freno existe pero está pagado. Idea CERRADA, y cerrada
//   por la razón correcta, que es la mejor forma de cerrarla.
//
//   MUNDO B — el mercado NO lo descuenta. La opción cuesta lo mismo y el índice se mueve menos.
//   Entonces SÍ hay dinero y lo que falla es el vehículo, no la idea. Y entonces el trabajo que
//   queda es encontrar la estructura que lo cobre, no seguir probando filtros.
//
// ═══ CÓMO SE MIDE, SIN NINGÚN MODELO ════════════════════════════════════════════════════════
//
// A la hora de entrar se leen dos números que existen los dos en el fichero:
//
//   LO QUE EL MERCADO COBRA  = precio de la cuna al dinero (call ATM al ask + put ATM al ask).
//                              Es lo que hay que pagar por el movimiento que queda hasta el cierre.
//   LO QUE PASA DE VERDAD    = |cierre − precio en ese instante|.
//
// El cociente entre los dos es lo único que importa: si vale 0,80, el que vendió esa cuna se
// quedó con el 20%. La pregunta es si ese cociente es MÁS BAJO los días de montón de OI.
//
// Y para no engañarse: la cuna se mide a punto medio Y al ask/bid reales, porque el peaje es
// justamente lo que decide si un 12% de ventaja se puede cobrar o se lo come la horquilla.

import { diasDisponibles, cargarDia, rejilla, compraEn, ventaEn, idxHora } from "./lib0dte.mjs";

const med = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { const m = med(v); return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)); };
const mediana = (v) => { const s = [...v].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const tDe = (a, b) => (med(a) - med(b)) / Math.sqrt(sd(a) ** 2 / a.length + sd(b) ** 2 / b.length);

const HORAS = ["11:00", "13:00", "14:00", "14:30"];
const filas = [];

for (const dd of diasDisponibles()) {
  if (dd < "2024-01-01") continue;                  // donde el efecto está medido y es estable
  const d = cargarDia(dd);
  if (!d || !d.oi) continue;
  const b0 = d.barras[0];
  const K0 = rejilla(b0.spot);
  const c0 = compraEn(b0, K0, "C"), p0 = compraEn(b0, K0, "P");
  if (c0 == null || p0 == null || !(c0 + p0 > 0)) continue;
  const esperadoDia = c0 + p0;

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
    const r = 0.15 * esperadoDia;
    let lo = 0, hi = ks.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (ks[m] < x - r) lo = m + 1; else hi = m; }
    let s = 0; for (let i = lo; i < ks.length && ks[i] <= x + r; i++) s += ns[i];
    return s;
  };

  const cierre = d.barras[d.barras.length - 1].spot;
  const f = { dia: dd, anio: dd.slice(0, 4), por: {} };
  for (const h of HORAS) {
    let i; try { i = idxHora(d, h); } catch { continue; }
    const b = d.barras[i], x = b.spot, K = rejilla(x);
    const ca = compraEn(b, K, "C"), pa = compraEn(b, K, "P");
    const cb = ventaEn(b, K, "C"), pb = ventaEn(b, K, "P");
    if (ca == null || pa == null || cb == null || pb == null) continue;
    const cobrado = cb + pb;                        // lo que cobra QUIEN VENDE, al bid: real
    const medio = (ca + cb + pa + pb) / 2;          // a punto medio, para separar peaje de señal
    const pasa = Math.abs(cierre - x);              // lo que ocurre de verdad
    if (!(medio > 0)) continue;
    f.por[h] = {
      senal: pegado(x),
      cobrado, medio, pasa,
      ratioMedio: pasa / medio,                     // <1 = el vendedor gana
      ratioReal: pasa / cobrado,
      pl: (cobrado - pasa) * 100,                   // vender la cuna al bid y liquidar al cierre
      horquilla: 100 * ((ca + pa) - (cb + pb)) / medio,
    };
  }
  filas.push(f);
}
console.log(`## ${filas.length} días desde 2024\n`);

for (const h of HORAS) {
  const us = filas.filter((f) => f.por[h]);
  if (us.length < 100) continue;
  const ord = [...us].sort((a, b) => a.por[h].senal - b.por[h].senal);
  const n3 = Math.floor(ord.length / 3);
  const bajo = ord.slice(0, n3).map((f) => f.por[h]);
  const alto = ord.slice(-n3).map((f) => f.por[h]);

  console.log(`══ a las ${h} · n=${us.length} ══\n`);
  console.log(`  ${"".padEnd(34)}${"POCO OI pegado".padStart(16)}${"MUCHO OI pegado".padStart(18)}`);
  const linea = (et, fa, fb, dec = 3) =>
    console.log(`  ${et.padEnd(34)}${fa.toFixed(dec).padStart(16)}${fb.toFixed(dec).padStart(18)}`);

  linea("lo que el mercado cobra (cuna)", med(bajo.map((x) => x.medio)), med(alto.map((x) => x.medio)), 2);
  linea("lo que se mueve de verdad", med(bajo.map((x) => x.pasa)), med(alto.map((x) => x.pasa)), 2);
  linea("cociente real/cobrado (media)", med(bajo.map((x) => x.ratioMedio)), med(alto.map((x) => x.ratioMedio)));
  linea("cociente real/cobrado (mediana)", mediana(bajo.map((x) => x.ratioMedio)), mediana(alto.map((x) => x.ratioMedio)));

  const dMov = 100 * (med(alto.map((x) => x.pasa)) / med(bajo.map((x) => x.pasa)) - 1);
  const dPre = 100 * (med(alto.map((x) => x.medio)) / med(bajo.map((x) => x.medio)) - 1);
  console.log("");
  console.log(`  el movimiento real es un ${dMov.toFixed(1)}% distinto en los días de mucho OI`);
  console.log(`  y el precio de la opción es un ${dPre.toFixed(1)}% distinto`);
  console.log(`  → la diferencia entre los dos, que es lo cobrable: ${(dMov - dPre).toFixed(1)} puntos`);

  const t = tDe(alto.map((x) => x.ratioMedio), bajo.map((x) => x.ratioMedio));
  console.log(`  cociente: t=${t.toFixed(2)} (negativo = en los días de mucho OI se paga de más)`);
  console.log("");
  console.log(`  VENDER LA CUNA de verdad (cobrando al bid, liquidando al cierre), un contrato:`);
  console.log(`     poco OI:  $${(med(bajo.map((x) => x.pl))).toFixed(0)} por operación · mediana $${mediana(bajo.map((x) => x.pl)).toFixed(0)} · peor $${Math.min(...bajo.map((x) => x.pl)).toFixed(0)}`);
  console.log(`     mucho OI: $${(med(alto.map((x) => x.pl))).toFixed(0)} por operación · mediana $${mediana(alto.map((x) => x.pl)).toFixed(0)} · peor $${Math.min(...alto.map((x) => x.pl)).toFixed(0)}`);
  console.log(`     el peaje de la cuna es el ${med(alto.map((x) => x.horquilla)).toFixed(1)}% de su precio`);
  console.log("");
}
