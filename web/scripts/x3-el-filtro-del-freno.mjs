// CÓMO SE COBRA EL FRENO: NO RECENTRANDO, SINO ELIGIENDO EL DÍA
//
// ═══ LO QUE YA ESTÁ MEDIDO ══════════════════════════════════════════════════════════════════
//
// x1 y x2 encontraron lo primero del GEX que no sale plano en este proyecto: comparando la
// MISMA barra del MISMO día contra su espejo, el índice se mueve MENOS donde hay más interés
// abierto pegado al precio. −1,01 puntos del movimiento esperado, t=−6,02, n=68.243.
// Y aguanta las tres formas de matarlo:
//     mapa plano (mismo OI en todos los strikes): t=−0,20  → no es la rejilla
//     números redondos: da igual pegado o lejos, y a igual redondez sale MÁS fuerte (t=−6,94)
//     año a año: 2022 +1,23 · 2023 −0,71 · 2024 −1,46 · 2025 −1,84 · 2026 −2,70
// Ese crecimiento monótono desde 2023 acompaña al crecimiento del propio mercado de 0DTE.
//
// ═══ EL PRIMER INTENTO DE COBRARLO, QUE FALLÓ ═══════════════════════════════════════════════
//
// La idea obvia era centrar el cóndor en el amontonamiento de interés abierto en vez de en el
// precio. No sirve, y el motivo se ve en un número: el centro de masa se desplaza CERO puntos
// de mediana y 5 en el percentil 90. El amontonamiento ESTÁ pegado al precio. No hay nada que
// mover. La prueba salió vacía por construcción, no por falta de efecto.
//
// ═══ LA FORMA CORRECTA DE COBRARLO ══════════════════════════════════════════════════════════
//
// El freno no dice DÓNDE poner el cóndor: dice CUÁNDO el precio se va a quedar quieto. Y a
// quien vende un cóndor, que el precio se quede quieto es exactamente su negocio.
// Así que el uso correcto es un FILTRO DE DÍA: vender sólo cuando, a la hora de entrar, el
// precio está sentado encima de un amontonamiento de interés abierto.
//
// Y si el precio se mueve menos esos días, hay una segunda palanca: se puede estrechar el
// cóndor (más crédito por el mismo colateral) sin que lo toquen más veces.
//
// ═══ LOS CONTROLES ══════════════════════════════════════════════════════════════════════════
//
// (a) EL BARAJADO: ordenar los días por el amontonamiento de OTRO día. Si separa igual, el
//     filtro no lee el interés abierto, lee otra cosa (la hora, la volatilidad, el año).
// (b) LA VOLATILIDAD: ordenar los días por el precio de la cuna. Si el filtro de OI no aporta
//     nada por encima de eso, es un termómetro de volatilidad disfrazado — y la memoria dice
//     que 16 regímenes medidos NO filtran al cóndor.
// (c) EL AÑO: 2022 tiene el signo cambiado, así que todo se da con y sin 2022.

import { diasDisponibles, cargarDia, rejilla, compraEn, estructura, condor, idxHora } from "./lib0dte.mjs";

const ANIOS = 4.6;
const DESPLAZA = 37;
const med = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => { const m = med(v); return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)); };
const mediana = (v) => { const s = [...v].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

// ── cargar: para cada día, el estado a cada hora candidata ─────────────────
const HORAS = ["10:00", "11:00", "12:00", "13:00", "14:00"];
const filas = [];
let sinOi = 0, huecos = 0;

const todos = diasDisponibles();
const mapas = new Map();          // dia -> { ks, ns, esperado } para poder barajar después

for (const dd of todos) {
  const d = cargarDia(dd);
  if (!d || !d.oi) { sinOi++; continue; }
  const b0 = d.barras[0];
  const K0 = rejilla(b0.spot);
  const cc = compraEn(b0, K0, "C"), pp = compraEn(b0, K0, "P");
  if (cc == null || pp == null || !(cc + pp > 0)) continue;
  const esperado = cc + pp;

  const mapa = new Map();
  let total = 0;
  for (const [clave, n] of Object.entries(d.oi)) {
    if (!(n > 0)) continue;
    const K = Number(clave.split("|")[0]);
    mapa.set(K, (mapa.get(K) ?? 0) + n);
    total += n;
  }
  if (!(total > 0)) { sinOi++; continue; }
  const ks = [...mapa.keys()].sort((a, b) => a - b);
  const ns = ks.map((K) => mapa.get(K) / total);
  mapas.set(dd, { ks, ns, esperado });

  const fila = { dia: dd, anio: dd.slice(0, 4), esperado, spot0: b0.spot, cierre: d.barras[d.barras.length - 1].spot, por: {} };
  for (const h of HORAS) {
    let i;
    try { i = idxHora(d, h); } catch { continue; }
    const x = d.barras[i].spot;
    const C = rejilla(x);
    const r = {};
    for (const ancho of [25, 35, 45]) {
      const e = estructura(d, i, "vencimiento", condor(C, ancho, 50));
      if (!e) { huecos++; continue; }
      r[ancho] = { dolares: e.dolares, credito: e.credito, tocado: Math.abs(d.barras[d.barras.length - 1].spot - C) > ancho };
    }
    fila.por[h] = { spot: x, ...r };
  }
  filas.push(fila);
}
console.log(`## ${filas.length} días · sin OI ${sinOi} · huecos de precio ${huecos}\n`);

/** Cuánto OI hay pegado a un precio, con el mapa que se le pase. */
function pegado(m, x) {
  const radio = 0.15 * m.esperado;
  let lo = 0, hi = m.ks.length;
  while (lo < hi) { const k = (lo + hi) >> 1; if (m.ks[k] < x - radio) lo = k + 1; else hi = k; }
  let s = 0;
  for (let i = lo; i < m.ks.length && m.ks[i] <= x + radio; i++) s += m.ns[i];
  return s;
}

// ── la escalera del cóndor por cuánto OI hay pegado al precio ──────────────
function escalera(hora, ancho, clave, etiqueta, filtroAnio) {
  const usables = filas.filter((f) => f.por[hora]?.[ancho] && (!filtroAnio || filtroAnio(f.anio)));
  const conSenal = usables.map((f, j) => {
    const m = clave === "real"
      ? mapas.get(f.dia)
      : clave === "barajado"
        ? mapas.get(usables[(j + DESPLAZA) % usables.length].dia)
        : null;
    const senal = clave === "vol" ? -f.esperado / f.spot0 : pegado(m, f.por[hora].spot);
    return { ...f, senal, r: f.por[hora][ancho] };
  }).sort((a, b) => a.senal - b.senal);

  const paso = Math.floor(conSenal.length / 5);
  const anios = usables.length / (todos.length / ANIOS);
  console.log(`  ${etiqueta}`);
  console.log(`    montón |  señal  |   $/año  | mediana | peor día | % tocados | n`);
  const sal = [];
  for (let q = 0; q < 5; q++) {
    const t = conSenal.slice(q * paso, q === 4 ? conSenal.length : (q + 1) * paso);
    const v = t.map((x) => x.r.dolares);
    const porAno = v.reduce((a, b) => a + b, 0) / anios;
    sal.push(porAno);
    console.log(`      ${q + 1}    | ${(t.reduce((a, x) => a + x.senal, 0) / t.length * 100).toFixed(2).padStart(6)}  | ${porAno.toFixed(0).padStart(8)} | ${mediana(v).toFixed(0).padStart(7)} | ${Math.min(...v).toFixed(0).padStart(8)} |   ${(100 * t.filter((x) => x.r.tocado).length / t.length).toFixed(0).padStart(3)}%    | ${t.length}`);
  }
  const sube = sal.every((v, j) => j === 0 || v >= sal[j - 1]);
  const baja = sal.every((v, j) => j === 0 || v <= sal[j - 1]);
  console.log(`    del 1 al 5: ${(sal[4] - sal[0]).toFixed(0)} $/año · monótona: ${sube ? "SÍ, sube" : baja ? "SÍ, baja" : "NO"}\n`);
  return sal;
}

console.log("### EL FILTRO: vender sólo cuando el precio está sobre un amontonamiento de OI\n");
for (const hora of ["11:00", "13:00"]) {
  console.log(`══ a las ${hora}, cóndor ±45 alas 50, hasta vencimiento ══\n`);
  escalera(hora, 45, "real", "REAL — ordenado por el OI pegado al precio");
  escalera(hora, 45, "barajado", "BARAJADO — ordenado por el OI de otro día");
  escalera(hora, 45, "vol", "VOLATILIDAD — ordenado por la cuna del día (barata primero)");
  escalera(hora, 45, "real", "REAL, sin 2022 (el año con el signo cambiado)", (a) => a !== "2022");
}

console.log("### LA SEGUNDA PALANCA: si el precio se mueve menos, se puede estrechar\n");
console.log("  (más crédito por el mismo colateral, si de verdad no lo tocan más veces)\n");
for (const ancho of [25, 35, 45]) {
  console.log(`══ cóndor ±${ancho} alas 50 a las 11:00 ══\n`);
  escalera("11:00", ancho, "real", `REAL — ancho ${ancho}`, (a) => a !== "2022");
}
