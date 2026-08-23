// ¿EL FRENO ES DE VERDAD, Y VALE DINERO?
//
// ═══ DE DÓNDE VIENE ═════════════════════════════════════════════════════════════════════════
//
// x1-el-freno.mjs encontró lo primero del GEX que no sale plano en todo el proyecto: comparando
// la MISMA barra del MISMO día contra su espejo (el punto a la misma distancia de la apertura
// pero al otro lado), el índice se mueve MENOS donde hay más interés abierto pegado al precio.
//     con más OI pegado  (n=34.034): 0,2350 del movimiento esperado en 30 min
//     con menos OI pegado (n=34.209): 0,2451
//     diferencia −1,01 puntos, t=−6,02, y CRECE por la tarde (a las 15:30 llega a −4,02)
//
// Eso encaja con la teoría: la gamma de una opción que vence hoy se dispara al final del día.
// Pero encajar con la teoría es exactamente lo que hace peligroso un hallazgo, así que aquí se
// intenta matarlo de tres maneras y sólo después se mira si vale dinero.
//
// ═══ LAS TRES FORMAS DE MATARLO ═════════════════════════════════════════════════════════════
//
// 1. EL MAPA PLANO. Se repite todo poniendo el MISMO interés abierto en todos los strikes. Si el
//    efecto sigue apareciendo, no es el interés abierto: es la rejilla, o los números redondos,
//    o cualquier cosa geométrica. Éste es el control que más miedo da y por eso va primero.
//
// 2. LOS NÚMEROS REDONDOS. El interés abierto se amontona en múltiplos de 25 y de 50, y el
//    precio puede moverse distinto cerca de un número redondo por razones que no tienen nada
//    que ver con las opciones. Se mide la distancia al múltiplo de 25 más cercano y se repite
//    la prueba dentro de cada nivel de «redondez» por separado.
//
// 3. LOS AÑOS Y LAS MITADES. Un efecto que sólo existe en un año no es un efecto.
//
// ═══ Y SI SOBREVIVE: ¿VALE DINERO? ══════════════════════════════════════════════════════════
//
// El freno, si existe, le sirve al que VENDE, que es lo que Lester ya hace. La idea directa:
// en vez de centrar el cóndor en el precio, centrarlo donde está el amontonamiento de interés
// abierto — porque ahí es donde el precio se queda más quieto.
// Se compara contra su regla actual (centrado en el precio) sobre los mismos días, con las
// cuatro patas a precio real.

import { diasDisponibles, cargarDia, rejilla, compraEn, estructura, condor, idxHora } from "./lib0dte.mjs";

const HORIZONTE = 6;
const med = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const sd = (v) => { const m = med(v); return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1)); };
const tDe = (a, b) => (med(a) - med(b)) / Math.sqrt(sd(a) ** 2 / a.length + sd(b) ** 2 / b.length);
const mediana = (v) => { const s = [...v].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

// ── cargar ──────────────────────────────────────────────────────────────────
const cache = [];
for (const dd of diasDisponibles()) {
  const d = cargarDia(dd);
  if (!d || !d.oi) continue;
  const b0 = d.barras[0];
  const K0 = rejilla(b0.spot);
  const c = compraEn(b0, K0, "C"), p = compraEn(b0, K0, "P");
  if (c == null || p == null || !(c + p > 0)) continue;

  const mapa = new Map();
  let total = 0;
  for (const [clave, n] of Object.entries(d.oi)) {
    if (!(n > 0)) continue;
    const K = Number(clave.split("|")[0]);
    mapa.set(K, (mapa.get(K) ?? 0) + n);
    total += n;
  }
  if (!(total > 0)) continue;
  const ks = [...mapa.keys()].sort((a, b) => a - b);
  cache.push({
    dia: dd, anio: dd.slice(0, 4),
    spots: d.barras.map((b) => b.spot), horas: d.barras.map((b) => b.t),
    ks, ns: ks.map((K) => mapa.get(K) / total),
    plano: ks.map(() => 1 / ks.length),        // EL MAPA PLANO: mismo peso en todos los strikes
    esperado: c + p, spot0: b0.spot,
  });
}
console.log(`## ${cache.length} días cargados\n`);

function peso(c, x, campo) {
  const radio = 0.15 * c.esperado;
  const { ks } = c; const ns = c[campo];
  let lo = 0, hi = ks.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (ks[m] < x - radio) lo = m + 1; else hi = m; }
  let s = 0;
  for (let i = lo; i < ks.length && ks[i] <= x + radio; i++) s += ns[i];
  return s;
}

// ── recoger, con las dos versiones del mapa y la redondez ───────────────────
const obs = [];
for (const c of cache) {
  for (let i = 0; i + HORIZONTE < c.spots.length; i++) {
    const x = c.spots[i], esp = 2 * c.spot0 - x;
    obs.push({
      anio: c.anio, t: c.horas[i],
      mov: Math.abs(c.spots[i + HORIZONTE] - x) / c.esperado,
      aqui: peso(c, x, "ns"), espejo: peso(c, esp, "ns"),
      aquiPlano: peso(c, x, "plano"), espejoPlano: peso(c, esp, "plano"),
      // redondez: a cuántos puntos está el precio del múltiplo de 25 más cercano
      redondez: Math.abs(x - Math.round(x / 25) * 25),
      redondezEsp: Math.abs(esp - Math.round(esp / 25) * 25),
    });
  }
}
console.log(`${obs.length.toLocaleString("es-ES")} observaciones\n`);

function pareada(campoA, campoB, filtro, etiqueta) {
  const p = obs.filter((o) => (!filtro || filtro(o)) && Math.abs(o[campoA] - o[campoB]) > 0.001);
  const alto = p.filter((o) => o[campoA] > o[campoB]).map((o) => o.mov);
  const bajo = p.filter((o) => o[campoA] < o[campoB]).map((o) => o.mov);
  if (alto.length < 100 || bajo.length < 100) { console.log(`  ${etiqueta}: muestra insuficiente (${alto.length}/${bajo.length})`); return null; }
  const dif = (med(alto) - med(bajo)) * 100;
  const t = tDe(alto, bajo);
  console.log(`  ${etiqueta.padEnd(46)} ${dif.toFixed(2).padStart(7)}   t=${t.toFixed(2).padStart(6)}   n=${p.length.toLocaleString("es-ES")}`);
  return { dif, t, n: p.length };
}

console.log("### 1 · EL CONTROL QUE MÁS MIEDO DA: EL MAPA PLANO\n");
console.log("  (si el mapa plano da lo mismo, no es el interés abierto: es la geometría)\n");
console.log(`  ${"".padEnd(46)}    dif      t         n`);
const real = pareada("aqui", "espejo", null, "interés abierto REAL");
const plano = pareada("aquiPlano", "espejoPlano", null, "mapa PLANO (mismo OI en todos los strikes)");
console.log("");
if (plano && Math.abs(plano.t) > 2) {
  console.log("  ⚠ EL MAPA PLANO TAMBIÉN DA EFECTO. Parte de lo medido es geometría, no interés abierto.\n");
} else {
  console.log("  El mapa plano no da nada: el efecto viene del interés abierto y no de la rejilla.\n");
}

console.log("### 2 · LOS NÚMEROS REDONDOS\n");
console.log("  (el OI se amontona en múltiplos de 25; el precio puede portarse distinto ahí por otras razones)\n");
console.log(`  ${"".padEnd(46)}    dif      t         n`);
pareada("aqui", "espejo", (o) => o.redondez < 6 && o.redondezEsp < 6, "los dos puntos PEGADOS a un múltiplo de 25");
pareada("aqui", "espejo", (o) => o.redondez > 6 && o.redondezEsp > 6, "los dos puntos LEJOS de un múltiplo de 25");
pareada("aqui", "espejo", (o) => Math.abs(o.redondez - o.redondezEsp) < 2, "los dos a la MISMA distancia del redondo");
console.log("");

console.log("### 3 · AÑO A AÑO Y POR HORA\n");
console.log(`  ${"".padEnd(46)}    dif      t         n`);
for (const a of ["2022", "2023", "2024", "2025", "2026"]) pareada("aqui", "espejo", (o) => o.anio === a, `año ${a}`);
console.log("");
pareada("aqui", "espejo", (o) => o.t < "12:00", "sólo por la mañana (antes de las 12:00)");
pareada("aqui", "espejo", (o) => o.t >= "12:00" && o.t < "14:30", "mediodía (12:00 a 14:30)");
pareada("aqui", "espejo", (o) => o.t >= "14:30", "última hora y media (desde las 14:30)");
console.log("");

// ═══ ¿VALE DINERO? ═════════════════════════════════════════════════════════
// El cóndor centrado donde se amontona el interés abierto, contra centrado en el precio.

console.log("### 4 · ¿VALE DINERO? EL CÓNDOR CENTRADO EN EL AMONTONAMIENTO\n");

/** El centro de masa del interés abierto dentro de ±1 movimiento esperado del precio. */
function centroDeMasa(c, x) {
  const radio = c.esperado;
  let sw = 0, sk = 0;
  for (let i = 0; i < c.ks.length; i++) {
    if (Math.abs(c.ks[i] - x) > radio) continue;
    sw += c.ns[i]; sk += c.ns[i] * c.ks[i];
  }
  return sw > 0 ? sk / sw : null;
}

for (const hora of ["11:00", "13:00", "14:00"]) {
  const enPrecio = [], enOi = [], desplaz = [];
  let huecos = 0;
  for (const c of cache) {
    const d = cargarDia(c.dia);
    if (!d) continue;
    let i;
    try { i = idxHora(d, hora); } catch { continue; }
    const x = d.barras[i].spot;
    const cm = centroDeMasa(c, x);
    if (cm == null) continue;

    const a = estructura(d, i, "vencimiento", condor(rejilla(x), 45, 50));
    const b = estructura(d, i, "vencimiento", condor(rejilla(cm), 45, 50));
    if (!a || !b) { huecos++; continue; }
    enPrecio.push(a.dolares); enOi.push(b.dolares);
    desplaz.push(rejilla(cm) - rejilla(x));
  }
  const anios = 4.6;
  const dz = desplaz.map(Math.abs);
  console.log(`  ${hora} · n=${enPrecio.length} · huecos ${huecos}`);
  console.log(`     centrado en el PRECIO:   $${(enPrecio.reduce((a, b) => a + b, 0) / anios).toFixed(0).padStart(7)}/año · mediana $${mediana(enPrecio).toFixed(0)} · peor día $${Math.min(...enPrecio).toFixed(0)}`);
  console.log(`     centrado en el OI:       $${(enOi.reduce((a, b) => a + b, 0) / anios).toFixed(0).padStart(7)}/año · mediana $${mediana(enOi).toFixed(0)} · peor día $${Math.min(...enOi).toFixed(0)}`);
  const dif = enOi.map((v, j) => v - enPrecio[j]);
  console.log(`     diferencia por operación: $${med(dif).toFixed(1)} · t=${(med(dif) * Math.sqrt(dif.length) / sd(dif)).toFixed(2)}`);
  console.log(`     el centro se desplaza: mediana ${mediana(dz).toFixed(0)} puntos · p90 ${dz.sort((a, b) => a - b)[Math.floor(dz.length * 0.9)].toFixed(0)} puntos\n`);
}
