// ═══════════════════════════════════════════════════════════════════════════════════════════
// LOS DÍAS GEMELOS DEL 21 DE AGOSTO — reconocer un patrón, no ajustar una regla
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// QUÉ PREGUNTA CONTESTA (en llano)
//   Eduardo ganó cuatro calls 0DTE el viernes 21 y dijo que las eligió «por el GEX». Lester:
//   «tienes que ver qué tenía el GEX en ese momento e intentar replicarlo; cuando veas los
//   mismos patrones, entonces te metes».
//   Así que: cojo la FOTO ENTERA del interés abierto del 21 (48 números: la silueta del OI
//   alrededor del precio), busco en los 1.119 días de historia los que más se le parecen, y
//   miro qué hicieron. Si los días parecidos hacen lo mismo que unos días cualesquiera, el
//   patrón no existe.
//
// LOS TRES CONTROLES (esto es lo que decide el encargo)
//   Con 1.119 días y una silueta de 48 números, «los más parecidos» SIEMPRE encuentran algo.
//   Por eso cada grupo de gemelos se compara contra tres grupos del MISMO tamaño:
//     (a) AZAR      — días repartidos por índice desplazado (y además 2.000 barajados con un
//                     generador determinista propio, porque Math.random está prohibido aquí)
//     (b) TAMAÑO    — mismo número de contratos en la cadena, pero silueta DISTINTA
//     (c) VOLATILIDAD — misma cuna al dinero a las 09:35 (call ask + put ask / índice), pero
//                     silueta DISTINTA
//
// LAS REGLAS DE LA CASA
//   Precios reales (compra al ask, vende al bid). Sólo el pasado (el OI es del arranque del
//   día). Un hueco no es un cero: se descarta y se cuenta aparte. Nada de Black-Scholes.
//   Todo en dólares al año con UN contrato y 244 días de mercado al año.
//
// UN AVISO SOBRE EL PUNTO DE REFERENCIA
//   Los días históricos NO tienen barra de las 09:30 (viene con precio 0 y el lector la tira),
//   así que su referencia es el spot de las 09:35. El día 21 sí tiene 09:30 y su huella
//   publicada está calculada con ella (7.674,18). Uso la PRIMERA barra de cada día, que es lo
//   único comparable, y compruebo aparte cuánto cambia la lista de gemelos si al 21 se le pone
//   su 09:35 (7.666,99). Ese chequeo va impreso: no se esconde.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  diasDisponibles, cargarDia, cargarDia21, perfilGex, distanciaSilueta,
  operar, hayHora, rejilla, compraEn, ventaEn, CACHE,
} from "./lib0dte.mjs";

const DIAS_ANO = 244;

// ── estadística mínima, escrita aquí para no depender de nada ───────────────────────────────
const media = (v) => v.reduce((a, b) => a + b, 0) / v.length;
const mediana = (v) => {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const sd = (v) => {
  const m = media(v);
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
};
/** t de dos muestras independientes (Welch). */
function tWelch(a, b) {
  const va = sd(a) ** 2 / a.length, vb = sd(b) ** 2 / b.length;
  return (media(a) - media(b)) / Math.sqrt(va + vb);
}
/** t pareada sobre las diferencias. */
function tPareada(dif) {
  return (media(dif) * Math.sqrt(dif.length)) / (sd(dif) || Infinity);
}
const pct = (x) => (x * 100).toFixed(2) + "%";
const f2 = (x) => (x == null || Number.isNaN(x) ? "  n/a" : x.toFixed(2));
const f3 = (x) => (x == null || Number.isNaN(x) ? "   n/a" : x.toFixed(3));

/** Generador determinista (LCG). No es Math.random: misma semilla, mismos números siempre. */
function lcg(semilla) {
  let s = semilla >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

// ═══ 1. CARGAR TODO UNA VEZ ═════════════════════════════════════════════════════════════════
console.log("═".repeat(95));
console.log("LOS DÍAS GEMELOS DEL 21 — silueta del GEX contra tres controles");
console.log("═".repeat(95));

const t0 = Date.now();
const lista = diasDisponibles();
const D = [];
let sinOI = 0, sinPerfil = 0;

for (const dd of lista) {
  const d = cargarDia(dd);
  if (!d) continue;
  if (!d.oi) { sinOI++; continue; }
  const apertura = d.barras[0].spot;
  const perfil = perfilGex(d.oi, apertura);
  if (!perfil) { sinPerfil++; continue; }

  // ── el día por dentro (hechos, sin operar nada) ──────────────────────────────────────────
  const spots = d.barras.map((b) => b.spot);
  let iMax = 0, iMin = 0;
  for (let i = 1; i < spots.length; i++) {
    if (spots[i] > spots[iMax]) iMax = i;
    if (spots[i] < spots[iMin]) iMin = i;
  }
  const iMediodia = hayHora(d, "12:00");
  const hastaMediodia = iMediodia >= 0 ? spots.slice(0, iMediodia + 1) : spots;
  const recMan = ((Math.max(...hastaMediodia) - Math.min(...hastaMediodia)) / apertura) * 100;

  // ── la cuna al dinero a las 09:35: el control de volatilidad ─────────────────────────────
  const b0 = d.barras[0];
  const K0 = rejilla(apertura);
  const cAsk = compraEn(b0, K0, "C"), pAsk = compraEn(b0, K0, "P");
  const cuna = cAsk != null && pAsk != null ? ((cAsk + pAsk) / apertura) * 100 : null;

  // ── la operación de Eduardo, calculada AQUÍ para no tener que guardar las barras ─────────
  // (1.123 días × 78 barras × ~300 contratos no caben en memoria; se resuelve al vuelo)
  const i10 = hayHora(d, "10:00"), i12 = hayHora(d, "12:00");
  let op = null, opAlta = null, K = null, Ka = null;
  if (i10 >= 0 && i12 >= 0) {
    const spot10 = d.barras[i10].spot;
    K = rejilla(spot10);                                   // la más cercana al dinero
    op = operar(d, i10, i12, K, "C");
    Ka = rejilla(spot10 * 1.0015);                         // donde compró Eduardo (+0,15%)
    opAlta = operar(d, i10, i12, Ka, "C");
  }

  D.push({
    dia: dd, ano: +dd.slice(0, 4), perfil, apertura, cuna,
    tam: perfil.totalContratos, op, opAlta, K, Ka, i10, i12,
    recMan,
    subidaMax: ((spots[iMax] - apertura) / apertura) * 100,
    caidaMin: ((spots[iMin] - apertura) / apertura) * 100,
    cierre: ((spots[spots.length - 1] - apertura) / apertura) * 100,
    horaMax: d.barras[iMax].t, horaMin: d.barras[iMin].t,
    iMax, iMin,
  });
}

const d21 = cargarDia21();
if (!d21) throw new Error("no está el día 21 en cache-theta/dia-21");
const ap21 = d21.barras[0].spot;                       // 09:30 = 7674.18, la huella publicada
const p21 = perfilGex(d21.oi, ap21);
const p21b = perfilGex(d21.oi, d21.barras[1].spot);    // con su 09:35, para el chequeo

console.log(`\ndías con cadena: ${lista.length} · usables (con OI y perfil): ${D.length}` +
            ` · sin OI: ${sinOI} · sin perfil: ${sinPerfil}`);
console.log(`rango: ${D[0].dia} → ${D[D.length - 1].dia}  ·  carga en ${((Date.now() - t0) / 1000).toFixed(0)}s`);
const porAno = {};
for (const d of D) porAno[d.ano] = (porAno[d.ano] ?? 0) + 1;
console.log("días por año:", JSON.stringify(porAno));

console.log(`\nHUELLA DEL 21 (referencia 09:30 = ${ap21.toFixed(2)}):`);
console.log(`  imán ${f3(p21.imanPct)}%  giro ${f3(p21.giroPct)}%  muroC cerca ${f3(p21.muroCallCercaPct)}%` +
            `  muroP cerca ${f3(p21.muroPutCercaPct)}%  pasillo ${f3(p21.pasilloCercaPct)}%`);
console.log(`  desb05 ${f3(p21.desbalance05)}  desb1 ${f3(p21.desbalance1)}  desb2 ${f3(p21.desbalance2)}` +
            `  concentr ${f3(p21.concentracion)}  contratos ${p21.totalContratos}`);
console.log(`  masa de la silueta dentro de ±3%: ${pct(p21.silueta.reduce((a, b) => a + b, 0))}`);

// ═══ 2. ¿DÓNDE CAE EL 21 DENTRO DE LA HISTORIA? ═════════════════════════════════════════════
function percentil(campo, valor) {
  const v = D.map((d) => d.perfil[campo]).filter((x) => x != null);
  return (v.filter((x) => x < valor).length / v.length) * 100;
}
console.log("\n── EL 21 CONTRA LOS 1.119 DÍAS (percentil de cada número de su huella) ──");
for (const c of ["imanPct", "giroPct", "muroCallCercaPct", "muroPutCercaPct", "pasilloCercaPct",
                 "desbalance05", "desbalance1", "desbalance2", "concentracion", "totalContratos"]) {
  const v = D.map((d) => d.perfil[c]).filter((x) => x != null);
  console.log(`  ${c.padEnd(18)} 21 = ${f3(p21[c]).padStart(9)}   percentil ${percentil(c, p21[c]).toFixed(1).padStart(5)}` +
              `   (mediana histórica ${f3(mediana(v))})`);
}

// ═══ 3. LOS GEMELOS ═════════════════════════════════════════════════════════════════════════
for (const d of D) {
  d.dist = distanciaSilueta(p21, d.perfil);
  d.distB = distanciaSilueta(p21b, d.perfil);          // chequeo con el spot de las 09:35
  // distancia de FORMA PURA: la silueta renormalizada dentro de la banda, para que la mezcla
  // «cuánto OI vive lejos del dinero» no mande sobre la comparación
  const s21 = p21.silueta, sd_ = d.perfil.silueta;
  const t21 = s21.reduce((a, b) => a + b, 0), td = sd_.reduce((a, b) => a + b, 0);
  let s = 0;
  for (let i = 0; i < s21.length; i++) s += (s21[i] / t21 - sd_[i] / td) ** 2;
  d.distForma = Math.sqrt(s);
}
const orden = [...D].sort((a, b) => a.dist - b.dist);
const ordenB = [...D].sort((a, b) => a.distB - b.distB);
const ordenF = [...D].sort((a, b) => a.distForma - b.distForma);

const dists = D.map((d) => d.dist);
console.log(`\n── DISTANCIAS A LA SILUETA DEL 21 ──`);
console.log(`  mínima ${f3(Math.min(...dists))} · p10 ${f3([...dists].sort((a,b)=>a-b)[Math.floor(D.length*0.1)])}` +
            ` · mediana ${f3(mediana(dists))} · máxima ${f3(Math.max(...dists))}`);
console.log(`  25 más cercanos: ${f3(orden[0].dist)} … ${f3(orden[24].dist)}`);
console.log(`  solapamiento de los 50 gemelos si la referencia del 21 fuese su 09:35: ` +
            `${orden.slice(0, 50).filter((d) => ordenB.slice(0, 50).some((e) => e.dia === d.dia)).length}/50`);
console.log(`  solapamiento de los 50 gemelos con la distancia de FORMA PURA: ` +
            `${orden.slice(0, 50).filter((d) => ordenF.slice(0, 50).some((e) => e.dia === d.dia)).length}/50`);

// ═══ 4. LA OPERACIÓN DE EDUARDO, PRECALCULADA PARA TODOS LOS DÍAS ═══════════════════════════
// Comprar una call cerca del dinero a las 10:00 y venderla a las 12:00, precios reales.
let huecos = 0, costes = [];
for (const d of D) {
  if (!d.op) huecos++; else costes.push(d.op.coste);
}
costes.sort((a, b) => a - b);
console.log(`\n── SANIDAD DE LA OPERACIÓN (call al dinero 10:00 → 12:00) ──`);
console.log(`  operaciones válidas ${costes.length} · huecos descartados ${huecos}`);
console.log(`  coste: mín $${(costes[0] * 100).toFixed(0)} · p10 $${(costes[Math.floor(costes.length * .1)] * 100).toFixed(0)}` +
            ` · mediana $${(mediana(costes) * 100).toFixed(0)} · p90 $${(costes[Math.floor(costes.length * .9)] * 100).toFixed(0)}` +
            ` · máx $${(costes[costes.length - 1] * 100).toFixed(0)}`);

// ═══ 5. LOS CONTROLES ═══════════════════════════════════════════════════════════════════════
const idxDe = new Map(D.map((d, i) => [d.dia, i]));
const medianaDist = mediana(dists);

/** (a) AZAR — índice desplazado: n días repartidos por toda la muestra. */
function controlAzar(n, offset) {
  const paso = D.length / n;
  const g = [];
  for (let k = 0; k < n; k++) g.push(D[Math.floor((offset + k * paso) % D.length)]);
  return g;
}

/** (b) y (c) — emparejado por un campo, exigiendo silueta DISTINTA (mitad lejana). */
function controlEmparejado(gem, campo) {
  const usados = new Set(gem.map((d) => d.dia));
  const cand = D.filter((d) => !usados.has(d.dia) && d.dist > medianaDist && d[campo] != null);
  const res = [];
  const tomados = new Set();
  for (const g of gem) {
    if (g[campo] == null) continue;
    let mejor = null, dif = Infinity;
    for (const c of cand) {
      if (tomados.has(c.dia)) continue;
      const x = Math.abs(Math.log(c[campo] / g[campo]));
      if (x < dif) { dif = x; mejor = c; }
    }
    if (mejor) { tomados.add(mejor.dia); res.push({ g, c: mejor }); }
  }
  return res;
}

const CAMPOS = [
  ["recorrido mañana %", "recMan"],
  ["subida al máximo %", "subidaMax"],
  ["caída al mínimo %", "caidaMin"],
  ["cierre vs apertura %", "cierre"],
  ["hora del máximo (idx)", "iMax"],
  ["hora del mínimo (idx)", "iMin"],
];
const idxAHora = (i) => {
  const m = 9 * 60 + 35 + Math.round(i) * 5;
  return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
};

function fila(nombre, gem, ctr) {
  const a = gem.filter((x) => Number.isFinite(x)), b = ctr.filter((x) => Number.isFinite(x));
  return `${nombre.padEnd(22)} gem ${f3(media(a)).padStart(7)} / med ${f3(mediana(a)).padStart(7)}` +
         `   ctr ${f3(media(b)).padStart(7)} / med ${f3(mediana(b)).padStart(7)}` +
         `   t ${f2(tWelch(a, b)).padStart(6)}`;
}

// permutación: ¿cuántos grupos barajados de tamaño n baten a los gemelos?
function permutacion(gem, campo, sorteos = 2000) {
  const vals = D.map((d) => d[campo]).filter(Number.isFinite);
  const obs = media(gem.map((d) => d[campo]).filter(Number.isFinite));
  const n = gem.length;
  const rnd = lcg(20260821);
  let mayores = 0;
  for (let s = 0; s < sorteos; s++) {
    let sum = 0;
    for (let k = 0; k < n; k++) sum += vals[Math.floor(rnd() * vals.length)];
    if (sum / n >= obs) mayores++;
  }
  return { obs, p: mayores / sorteos };
}

// ═══ 6. EL HECHO: QUÉ HICIERON LOS GEMELOS POR DENTRO ═══════════════════════════════════════
const resultados = {};
for (const N of [25, 50, 100]) {
  const gem = orden.slice(0, N);
  const anos = {};
  for (const g of gem) anos[g.ano] = (anos[g.ano] ?? 0) + 1;
  console.log("\n" + "═".repeat(95));
  console.log(`LOS ${N} GEMELOS  ·  distancia ${f3(gem[0].dist)} … ${f3(gem[N - 1].dist)}  ·  por año: ${JSON.stringify(anos)}`);
  console.log("═".repeat(95));
  if (N === 25) console.log("  días: " + gem.map((d) => d.dia).join(" "));

  const azar = controlAzar(N, 7);
  console.log("\n  ── HECHOS (media / mediana) — gemelos contra AZAR ──");
  for (const [nom, campo] of CAMPOS) {
    console.log("  " + fila(nom, gem.map((d) => d[campo]), azar.map((d) => d[campo])));
  }
  console.log(`  hora mediana del máximo: gemelos ${idxAHora(mediana(gem.map(d=>d.iMax)))}` +
              `   azar ${idxAHora(mediana(azar.map(d=>d.iMax)))}` +
              `   toda la historia ${idxAHora(mediana(D.map(d=>d.iMax)))}`);
  console.log(`  hora mediana del mínimo: gemelos ${idxAHora(mediana(gem.map(d=>d.iMin)))}` +
              `   azar ${idxAHora(mediana(azar.map(d=>d.iMin)))}` +
              `   toda la historia ${idxAHora(mediana(D.map(d=>d.iMin)))}`);

  console.log("\n  ── permutación (2.000 grupos barajados del mismo tamaño) ──");
  for (const [nom, campo] of CAMPOS.slice(0, 4)) {
    const q = permutacion(gem, campo);
    console.log(`  ${nom.padEnd(22)} gemelos ${f3(q.obs).padStart(7)}   p(azar ≥ gemelos) = ${q.p.toFixed(3)}`);
  }

  // controles emparejados
  for (const [nomC, campoC] of [["TAMAÑO", "tam"], ["VOLATILIDAD", "cuna"]]) {
    const pares = controlEmparejado(gem, campoC);
    if (!pares.length) { console.log(`\n  control ${nomC}: sin pares`); continue; }
    const calidad = media(pares.map((p) => Math.abs(Math.log(p.c[campoC] / p.g[campoC]))));
    console.log(`\n  ── contra el control por ${nomC} (${pares.length} pares, desajuste medio ${pct(calidad)}) ──`);
    for (const [nom, campo] of CAMPOS.slice(0, 4)) {
      const dif = pares.map((p) => p.g[campo] - p.c[campo]).filter(Number.isFinite);
      console.log(`  ${nom.padEnd(22)} gem ${f3(media(pares.map(p=>p.g[campo]))).padStart(7)}` +
                  `   ctr ${f3(media(pares.map(p=>p.c[campo]))).padStart(7)}` +
                  `   dif ${f3(media(dif)).padStart(7)}   t pareada ${f2(tPareada(dif)).padStart(6)}`);
    }
  }

  // ── OPERANDO COMO EDUARDO ────────────────────────────────────────────────────────────────
  console.log("\n  ── OPERANDO: call al dinero 10:00 → 12:00, precios reales ──");
  const dolaresDe = (g, cual = "op") => g.filter((d) => d[cual]).map((d) => d[cual].dolares);
  const retDe = (g, cual = "op") => g.filter((d) => d[cual]).map((d) => d[cual].ret);
  const dg = dolaresDe(gem), rg = retDe(gem);
  const da = dolaresDe(azar), ra = retDe(azar);
  const todos = dolaresDe(D), todosR = retDe(D);
  const linea = (nom, dd, rr, n) =>
    `  ${nom.padEnd(16)} n ${String(dd.length).padStart(4)}  media $${f2(media(dd)).padStart(8)}` +
    `  mediana $${f2(mediana(dd)).padStart(8)}  ret ${pct(media(rr)).padStart(8)}` +
    `  aciertos ${pct(rr.filter((x) => x > 0).length / rr.length).padStart(7)}` +
    `  peor $${f2(Math.min(...dd)).padStart(8)}  t ${f2((media(dd) * Math.sqrt(dd.length)) / sd(dd)).padStart(6)}`;
  console.log(linea("GEMELOS", dg, rg));
  console.log(linea("azar", da, ra));
  console.log(linea("toda la historia", todos, todosR));
  const qOp = (() => {
    const vals = D.filter((d) => d.op).map((d) => d.op.dolares);
    const rnd = lcg(777);
    const obs = media(dg);
    let may = 0;
    for (let s = 0; s < 2000; s++) {
      let x = 0;
      for (let k = 0; k < dg.length; k++) x += vals[Math.floor(rnd() * vals.length)];
      if (x / dg.length >= obs) may++;
    }
    return may / 2000;
  })();
  console.log(`  permutación de la operación: p(azar ≥ gemelos) = ${qOp.toFixed(3)}`);
  const alta = dolaresDe(gem, "opAlta");
  console.log(`  variante +0,15% (donde compró Eduardo): n ${alta.length} media $${f2(media(alta))}` +
              ` mediana $${f2(mediana(alta))} aciertos ${pct(alta.filter(x=>x>0).length/alta.length)}`);

  for (const [nomC, campoC] of [["TAMAÑO", "tam"], ["VOLATILIDAD", "cuna"]]) {
    const pares = controlEmparejado(gem, campoC).filter((p) => p.g.op && p.c.op);
    if (!pares.length) continue;
    const dif = pares.map((p) => p.g.op.dolares - p.c.op.dolares);
    console.log(`  contra ${nomC.padEnd(12)} gem $${f2(media(pares.map(p=>p.g.op.dolares))).padStart(8)}` +
                `  ctr $${f2(media(pares.map(p=>p.c.op.dolares))).padStart(8)}` +
                `  dif $${f2(media(dif)).padStart(8)}  t pareada ${f2(tPareada(dif))}`);
  }

  // dinero al año si sólo se opera en días gemelos
  const frec = (gem.length / D.length) * DIAS_ANO;
  const sin5 = [...dg].sort((a, b) => a - b).slice(0, dg.length - 5);
  console.log(`  → operando SÓLO en días gemelos: ${frec.toFixed(1)} operaciones al año` +
              ` × $${f2(media(dg))} = $${(frec * media(dg)).toFixed(0)}/año`);
  console.log(`  → quitando los 5 mejores días: media $${f2(media(sin5))} → $${(frec * media(sin5)).toFixed(0)}/año`);
  const porAnoOp = {};
  for (const d of gem) if (d.op) (porAnoOp[d.ano] ??= []).push(d.op.dolares);
  console.log("  → año a año (media $ por operación): " +
    Object.entries(porAnoOp).map(([a, v]) => `${a}: $${f2(media(v))} (n=${v.length})`).join("  "));

  resultados[N] = {
    anos, dist: [gem[0].dist, gem[N - 1].dist],
    op: { n: dg.length, media: media(dg), mediana: mediana(dg), ret: media(rg),
          aciertos: rg.filter((x) => x > 0).length / rg.length, p: qOp,
          anual: frec * media(dg), sin5: frec * media(sin5) },
  };
}

// ═══ 7. LA VERSIÓN HONESTA: GEMELOS ELEGIDOS SÓLO CON EL PASADO ═════════════════════════════
console.log("\n" + "═".repeat(95));
console.log("FUERA DE MUESTRA — el umbral se fija SÓLO con días anteriores a 2025-01-01");
console.log("═".repeat(95));

const antes = D.filter((d) => d.dia < "2025-01-01");
const despues = D.filter((d) => d.dia >= "2025-01-01");
console.log(`  antes de 2025: ${antes.length} días · 2025-2026: ${despues.length} días`);

for (const N of [25, 50, 100]) {
  const ordA = [...antes].sort((a, b) => a.dist - b.dist);
  const gemA = ordA.slice(0, N);
  const umbral = gemA[N - 1].dist;
  const gemB = despues.filter((d) => d.dist <= umbral);
  const restoB = despues.filter((d) => d.dist > umbral);
  const anosA = {}; for (const g of gemA) anosA[g.ano] = (anosA[g.ano] ?? 0) + 1;
  const anosB = {}; for (const g of gemB) anosB[g.ano] = (anosB[g.ano] ?? 0) + 1;
  const dol = (g) => g.filter((d) => d.op).map((d) => d.op.dolares);
  const dA = dol(gemA), dB = dol(gemB), dR = dol(restoB);
  console.log(`\n  N=${N}  umbral de distancia ${f3(umbral)}`);
  console.log(`   DENTRO (≤2024) gemelos ${gemA.length} ${JSON.stringify(anosA)}` +
              `  ·  recorrido mañana ${f3(media(gemA.map(d=>d.recMan)))}%  cierre ${f3(media(gemA.map(d=>d.cierre)))}%` +
              `  ·  operación media $${f2(media(dA))} (n=${dA.length}, aciertos ${pct(dA.filter(x=>x>0).length/dA.length)})`);
  if (!gemB.length) { console.log("   FUERA: ningún día de 2025-2026 pasa el umbral."); continue; }
  console.log(`   FUERA (2025-26) gemelos ${gemB.length} ${JSON.stringify(anosB)}` +
              `  ·  recorrido mañana ${f3(media(gemB.map(d=>d.recMan)))}%  cierre ${f3(media(gemB.map(d=>d.cierre)))}%` +
              `  ·  operación media $${f2(media(dB))} (n=${dB.length}, aciertos ${pct(dB.filter(x=>x>0).length/dB.length)})`);
  console.log(`   RESTO de 2025-26 (${restoB.length} días): recorrido ${f3(media(restoB.map(d=>d.recMan)))}%` +
              `  cierre ${f3(media(restoB.map(d=>d.cierre)))}%  ·  operación media $${f2(media(dR))} (n=${dR.length})`);
  if (dB.length > 1 && dR.length > 1)
    console.log(`   gemelos-fuera contra resto-fuera: t ${f2(tWelch(dB, dR))}`);
}

// ═══ 8. LOS TRES CHEQUEOS QUE DECIDEN ═══════════════════════════════════════════════════════
console.log("\n" + "═".repeat(95));
console.log("CHEQUEOS FINALES");
console.log("═".repeat(95));

// (8a) FRAGILIDAD: los mismos gemelos, pero midiendo la distancia con el spot de las 09:35 del
//      21 en vez del de las 09:30. Si la respuesta cambia, la lista de gemelos es un filo.
console.log("\n── 8a. ¿Aguanta si al 21 se le pone su spot de las 09:35 (7.666,99)? ──");
for (const N of [25, 50, 100]) {
  const g1 = orden.slice(0, N), g2 = ordenB.slice(0, N);
  const d1 = g1.filter((d) => d.op).map((d) => d.op.dolares);
  const d2 = g2.filter((d) => d.op).map((d) => d.op.dolares);
  const comunes = g1.filter((d) => g2.some((e) => e.dia === d.dia)).length;
  console.log(`  N=${N}: comunes ${comunes}/${N}  ·  con 09:30 media $${f2(media(d1))}` +
              `  ·  con 09:35 media $${f2(media(d2))}  ·  recorrido mañana ${f3(media(g1.map(d=>d.recMan)))}%` +
              ` vs ${f3(media(g2.map(d=>d.recMan)))}%`);
}

// (8b) FUERA DE MUESTRA con los TRES controles dentro de 2025-2026.
console.log("\n── 8b. Los gemelos de 2025-26 (umbral de ≤2024) contra sus controles, dentro de 2025-26 ──");
for (const N of [50, 100]) {
  const ordA = [...antes].sort((a, b) => a.dist - b.dist);
  const umbral = ordA[N - 1].dist;
  const gemB = despues.filter((d) => d.dist <= umbral && d.op);
  const resto = despues.filter((d) => d.dist > umbral && d.op);
  if (gemB.length < 3) continue;
  const dg = gemB.map((d) => d.op.dolares);
  // permutación dentro de 2025-26
  const vals = resto.map((d) => d.op.dolares);
  const rnd = lcg(31415);
  let may = 0;
  for (let s = 0; s < 5000; s++) {
    let x = 0;
    for (let k = 0; k < gemB.length; k++) x += vals[Math.floor(rnd() * vals.length)];
    if (x / gemB.length >= media(dg)) may++;
  }
  // control por volatilidad emparejado, sólo con días de 2025-26 de silueta distinta
  const pares = [];
  const tomados = new Set();
  for (const g of gemB) {
    if (g.cuna == null) continue;
    let mejor = null, dif = Infinity;
    for (const c of resto) {
      if (c.cuna == null || tomados.has(c.dia)) continue;
      const x = Math.abs(Math.log(c.cuna / g.cuna));
      if (x < dif) { dif = x; mejor = c; }
    }
    if (mejor) { tomados.add(mejor.dia); pares.push({ g, c: mejor }); }
  }
  const difVol = pares.map((p) => p.g.op.dolares - p.c.op.dolares);
  const difRec = pares.map((p) => p.g.recMan - p.c.recMan);
  console.log(`  N=${N} (umbral ${f3(umbral)}): gemelos-fuera ${gemB.length} días` +
              `  media $${f2(media(dg))}  p(azar de 2025-26 ≥ gemelos) = ${(may / 5000).toFixed(3)}`);
  console.log(`        cuña media gemelos ${f3(media(gemB.map(d=>d.cuna)))}% vs resto de 2025-26 ${f3(media(resto.map(d=>d.cuna)))}%`);
  console.log(`        contra control de VOLATILIDAD (${pares.length} pares): dif $${f2(media(difVol))}` +
              `  t pareada ${f2(tPareada(difVol))}  ·  recorrido dif ${f3(media(difRec))}%  t ${f2(tPareada(difRec))}`);
}

// (8c) ¿la cuña (volatilidad) explica la distancia? Y el propio 21, operado de verdad.
const cor = (() => {
  const a = D.filter((d) => d.cuna != null);
  const x = a.map((d) => d.dist), y = a.map((d) => d.cuna);
  const mx = media(x), my = media(y);
  let n = 0, dx = 0, dy = 0;
  for (let i = 0; i < x.length; i++) { n += (x[i]-mx)*(y[i]-my); dx += (x[i]-mx)**2; dy += (y[i]-my)**2; }
  return n / Math.sqrt(dx * dy);
})();
console.log(`\n── 8c. correlación entre «parecerse al 21» y la volatilidad del día (cuña ATM): ${f3(cor)}`);
console.log(`   cuña media de los 100 gemelos ${f3(media(orden.slice(0,100).filter(d=>d.cuna!=null).map(d=>d.cuna)))}%` +
            `  ·  de toda la historia ${f3(media(D.filter(d=>d.cuna!=null).map(d=>d.cuna)))}%`);

// el 21 de agosto, operado con la misma regla y con sus precios reales
{
  const i10 = d21.barras.findIndex((b) => b.t === "10:00");
  const i12 = d21.barras.findIndex((b) => b.t === "12:00");
  const s10 = d21.barras[i10].spot;
  const K = rejilla(s10);
  const r = operar(d21, i10, i12, K, "C");
  console.log(`\n── 8d. EL PROPIO 21 con la misma regla: spot 10:00 ${s10.toFixed(2)}, strike ${K}` +
    (r ? `, compra $${(r.coste*100).toFixed(0)} venta $${(r.ingreso*100).toFixed(0)} → $${r.dolares.toFixed(0)} (${pct(r.ret)})`
       : ", sin precio (hueco)"));
  const cuna21 = (compraEn(d21.barras[1], rejilla(d21.barras[1].spot), "C") ?? 0)
               + (compraEn(d21.barras[1], rejilla(d21.barras[1].spot), "P") ?? 0);
  console.log(`   cuña ATM del 21 a las 09:35: ${f3((cuna21 / d21.barras[1].spot) * 100)}%` +
              `  (percentil ${(D.filter(d=>d.cuna!=null && d.cuna < (cuna21/d21.barras[1].spot)*100).length / D.filter(d=>d.cuna!=null).length * 100).toFixed(1)} de la historia)`);
}

// (8e) MITADES Y TERCIOS del grupo de gemelos, por fecha. Un hallazgo que sólo vive en un
//      trozo del calendario no es un hallazgo.
console.log("\n── 8e. mitades y tercios (por fecha) de la operación en los gemelos ──");
for (const N of [25, 50, 100]) {
  const g = orden.slice(0, N).filter((d) => d.op).sort((a, b) => a.dia.localeCompare(b.dia));
  const v = g.map((d) => d.op.dolares);
  const m = Math.floor(v.length / 2), t3 = Math.floor(v.length / 3);
  console.log(`  N=${N}: mitad1 $${f2(media(v.slice(0, m)))} (${g[0].dia}→${g[m-1].dia})` +
              `  mitad2 $${f2(media(v.slice(m)))} (${g[m].dia}→${g[g.length-1].dia})`);
  console.log(`        tercios $${f2(media(v.slice(0, t3)))} / $${f2(media(v.slice(t3, 2*t3)))} / $${f2(media(v.slice(2*t3)))}`);
}

// (8f) el día más caro, para que el rango de costes no quede sin explicación
{
  const caro = D.filter((d) => d.op).sort((a, b) => b.op.coste - a.op.coste)[0];
  const barato = D.filter((d) => d.op).sort((a, b) => a.op.coste - b.op.coste)[0];
  console.log(`\n── 8f. coste más alto: ${caro.dia} strike ${caro.K} $${(caro.op.coste*100).toFixed(0)}` +
              ` (cuña ${f3(caro.cuna)}%) · más bajo: ${barato.dia} strike ${barato.K} $${(barato.op.coste*100).toFixed(0)}` +
              ` (cuña ${f3(barato.cuna)}%)`);
}

writeFileSync(join(CACHE, "..", "p2-gemelos-salida.json"), JSON.stringify(resultados, null, 1));
console.log(`\nhecho en ${((Date.now() - t0) / 1000).toFixed(0)}s`);
