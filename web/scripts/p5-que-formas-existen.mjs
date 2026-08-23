// ═══════════════════════════════════════════════════════════════════════════════════════════
// ¿QUÉ FORMAS DE GEX EXISTEN DE VERDAD, Y SORTEAN ALGO?
// ═══════════════════════════════════════════════════════════════════════════════════════════
//
// En vez de partir del día de Eduardo (que es UN día, y ajustarse a un día es la forma más
// barata de engañarse), aquí hablan los datos: se cogen los 1.119 días con interés abierto, se
// agrupan por la FORMA de su GEX —la silueta de 48 números: dónde está el bulto de calls y el
// de puts alrededor del precio, cada casilla dividida por el total del día para que el TAMAÑO
// de la cadena no mande— y se mira qué hacen esos días por dentro y qué paga operarlos.
//
// La pregunta es la grande: ¿la forma del GEX SORTEA los días, o todos los grupos hacen lo
// mismo? Y si sortea algo, ¿sortea MÁS que agrupar por azar, por tamaño de cadena, o por
// volatilidad del propio día?
//
// CÓMO SE MIDE EL «SORTEAR»
//   Para cada resultado (recorrido del día, cierre contra apertura, dinero de la call, dinero
//   del cóndor) se calcula la F de Fisher entre grupos: cuánta de la variación total explica la
//   partición. Y esa F se compara contra TRES controles con LOS MISMOS TAMAÑOS de grupo:
//     (a) 200 particiones al AZAR (generador determinista propio, NUNCA Math.random)
//     (b) partición por TAMAÑO de la cadena (bloques ordenando por totalContratos)
//     (c) partición por VOLATILIDAD del día (cuna al dinero a las 09:35 en % del índice)
//   Si la F de la forma no destaca sobre las tres, la forma no aporta nada propio.
//
// DOS ARRANQUES, A PROPÓSITO
//   El arranque pedido («los K días más separados entre sí») elige OUTLIERS y deja grupos de
//   n=1 y n=2: eso no es sortear días, es señalar rarezas. Así que se corren los DOS:
//     · extremos  — el arranque pedido, tal cual
//     · cuantiles — semillas en los cuantiles de la proyección principal de las siluetas
//                   (potencia iterada, determinista), que da grupos con tamaños de verdad
//   Se enseñan las dos tablas. Si el veredicto cambia según el arranque, hay que decirlo.
//
// REGLAS DE LA CASA
//   · precios reales: se compra al ask y se vende al bid (lo hace lib0dte, no se toca)
//   · sólo el pasado: OI del arranque del día, silueta con el spot de las 09:35, entradas a
//     las 10:00 y las 11:00
//   · un hueco no es un cero: si falta un precio la operación se descarta y se cuenta aparte
//   · nada de modelos de precios
//   · dólares al año con 244 días de mercado y con la FRECUENCIA real de cada grupo
//   · media, mediana, peor día, año a año, y qué queda al quitar los 5 mejores días
//
// CONTROL TEMPORAL: los grupos se reconstruyen SÓLO con días anteriores a 2025-01-01 y se
// comprueba si siguen sorteando en 2025-2026.
// ═══════════════════════════════════════════════════════════════════════════════════════════

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  diasDisponibles, cargarDia, cargarDia21, perfilGex, distanciaSilueta,
  estructura, operar, condor, hayHora, rejilla, compraEn, CACHE,
} from "./lib0dte.mjs";

const DIAS_ANO = 244;
const KS = [3, 4, 5, 6, 8];
const CACHE_P5 = join(CACHE, "p5-formas-dias.json");

const f2 = (x) => (x == null || Number.isNaN(x) ? "n/d" : x.toFixed(2));
const f3 = (x) => (x == null || Number.isNaN(x) ? "n/d" : x.toFixed(3));
const d0 = (x) => (x == null || Number.isNaN(x) ? "n/d" : (x < 0 ? "-" : "") + "$" + Math.abs(Math.round(x)));
const media = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const mediana = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };

// ═══ 1. CARGA: una pasada, y se guarda lo compacto para poder repetir sin esperar 58s ══════
console.log("═".repeat(100));
console.log("CARGANDO Y MIDIENDO LOS DÍAS");
console.log("═".repeat(100));
const t0 = Date.now();

let D, meta;
if (existsSync(CACHE_P5)) {
  const j = JSON.parse(readFileSync(CACHE_P5, "utf8"));
  D = j.D; meta = j.meta;
  console.log("(leído del resumen ya calculado — el cálculo crudo es idéntico, sólo se ahorra la relectura)");
} else {
  D = [];
  const dias = diasDisponibles();
  let sinOi = 0, sinPerfil = 0, huecosCall = 0, huecosCondor = 0, sinHora = 0;
  const costes = [];
  for (const d of dias) {
    const dia = cargarDia(d);
    if (!dia) continue;
    if (!dia.oi) { sinOi++; continue; }
    const b0 = dia.barras[0];                        // 09:35 — la de las 09:30 no existe
    const perfil = perfilGex(dia.oi, b0.spot);
    if (!perfil) { sinPerfil++; continue; }

    const spots = dia.barras.map((b) => b.spot);
    const apertura = spots[0], cierre = spots[spots.length - 1];
    let iMax = 0, iMin = 0;
    for (let i = 1; i < spots.length; i++) {
      if (spots[i] > spots[iMax]) iMax = i;
      if (spots[i] < spots[iMin]) iMin = i;
    }
    const recorridoPct = ((spots[iMax] - spots[iMin]) / apertura) * 100;
    const retPct = ((cierre - apertura) / apertura) * 100;

    // volatilidad del día vista a las 09:35: cuna al dinero en % del índice (precios REALES)
    const Katm0 = rejilla(apertura);
    const cC = compraEn(b0, Katm0, "C"), cP = compraEn(b0, Katm0, "P");
    const cuna = cC != null && cP != null ? ((cC + cP) / apertura) * 100 : null;

    // dinero A: call cerca del dinero a las 10:00, vendida a las 12:00
    let call1012 = null, costeCall = null;
    const i10 = hayHora(dia, "10:00"), i12 = hayHora(dia, "12:00");
    if (i10 < 0 || i12 < 0) sinHora++;
    else {
      const op = operar(dia, i10, i12, rejilla(dia.barras[i10].spot), "C");
      if (op) { call1012 = op.dolares; costeCall = op.coste; costes.push(op.coste); } else huecosCall++;
    }

    // dinero B: cóndor ±45 alas 50 a las 11:00 hasta vencimiento
    let cond = null;
    const i11 = hayHora(dia, "11:00");
    if (i11 >= 0) {
      const r = estructura(dia, i11, "vencimiento", condor(rejilla(dia.barras[i11].spot), 45, 50));
      if (r) cond = r.dolares; else huecosCondor++;
    }

    D.push({
      dia: d, ano: +d.slice(0, 4), silueta: perfil.silueta,
      imanPct: perfil.imanPct, giroPct: perfil.giroPct,
      muroCPct: perfil.muroCallCercaPct, muroPPct: perfil.muroPutCercaPct,
      pasilloPct: perfil.pasilloCercaPct, desb05: perfil.desbalance05,
      desb1: perfil.desbalance1, desb2: perfil.desbalance2,
      conc: perfil.concentracion, total: perfil.totalContratos,
      apertura, cierre, recorridoPct, retPct, maxAntesMin: iMax < iMin,
      cuna, call1012, costeCall, cond,
    });
  }
  const ok = costes.filter((x) => x > 0).sort((a, b) => a - b);
  meta = {
    nCadena: dias.length, sinOi, sinPerfil, huecosCall, huecosCondor, sinHora,
    costeMin: ok[0], costeMed: ok[Math.floor(ok.length / 2)], costeMax: ok[ok.length - 1], nCostes: ok.length,
  };
  mkdirSync(CACHE, { recursive: true });
  writeFileSync(CACHE_P5, JSON.stringify({ D, meta }));
}

console.log(`días con cadena: ${meta.nCadena} · usados: ${D.length} · sin OI: ${meta.sinOi} · sin perfil: ${meta.sinPerfil}`);
console.log(`huecos descartados — call 10:00→12:00: ${meta.huecosCall} · cóndor 11:00: ${meta.huecosCondor} · sin la hora: ${meta.sinHora}`);
console.log(`rango: ${D[0].dia} … ${D[D.length - 1].dia} = ${(D.length / DIAS_ANO).toFixed(2)} años de mercado`);
console.log(`SANIDAD coste de la call ATM a las 10:00: mín $${meta.costeMin.toFixed(2)} · mediana $${meta.costeMed.toFixed(2)} · máx $${meta.costeMax.toFixed(2)} (n=${meta.nCostes}) — dentro del rango esperado`);
console.log(`operaciones válidas — call: ${D.filter((x) => x.call1012 != null).length} · cóndor: ${D.filter((x) => x.cond != null).length}`);
console.log(`LÍNEA BASE (todos los días juntos): call 10→12 media ${d0(media(D.map((x) => x.call1012).filter((x) => x != null)))} · cóndor media ${d0(media(D.map((x) => x.cond).filter((x) => x != null)))}`);

// ═══ 2. K-MEDIAS DETERMINISTA, CON DOS ARRANQUES ═══════════════════════════════════════════
const dist2 = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2; return s; };

/** Proyección sobre la dirección principal (potencia iterada). Determinista, sin azar. */
function proyeccionPrincipal(P) {
  const n = P.length, dim = P[0].length;
  const mu = new Array(dim).fill(0);
  for (const p of P) for (let i = 0; i < dim; i++) mu[i] += p[i] / n;
  const C = P.map((p) => p.map((x, i) => x - mu[i]));
  let v = new Array(dim).fill(0).map((_, i) => (i % 2 ? 1 : -1) / Math.sqrt(dim));  // arranque fijo
  for (let it = 0; it < 200; it++) {
    const w = new Array(dim).fill(0);
    for (const c of C) { let d = 0; for (let i = 0; i < dim; i++) d += c[i] * v[i]; for (let i = 0; i < dim; i++) w[i] += c[i] * d; }
    const nor = Math.sqrt(w.reduce((a, x) => a + x * x, 0)) || 1;
    for (let i = 0; i < dim; i++) w[i] /= nor;
    v = w;
  }
  return C.map((c) => c.reduce((a, x, i) => a + x * v[i], 0));
}

function semillas(P, K, modo) {
  const n = P.length;
  if (modo === "cuantiles") {
    const pr = proyeccionPrincipal(P);
    const orden = [...Array(n).keys()].sort((a, b) => pr[a] - pr[b]);
    return Array.from({ length: K }, (_, k) => orden[Math.floor(((k + 0.5) / K) * n)]);
  }
  // "extremos": el más lejano de la media, y luego el que más lejos esté de lo ya elegido
  const dim = P[0].length;
  const mu = new Array(dim).fill(0);
  for (const p of P) for (let i = 0; i < dim; i++) mu[i] += p[i] / n;
  let primero = 0, mejor = -1;
  for (let i = 0; i < n; i++) { const d = dist2(P[i], mu); if (d > mejor) { mejor = d; primero = i; } }
  const s = [primero];
  const minD = P.map((p) => dist2(p, P[primero]));
  while (s.length < K) {
    let idx = 0, m = -1;
    for (let i = 0; i < n; i++) if (minD[i] > m) { m = minD[i]; idx = i; }
    s.push(idx);
    for (let i = 0; i < n; i++) minD[i] = Math.min(minD[i], dist2(P[i], P[idx]));
  }
  return s;
}

function kmedias(P, K, modo) {
  const n = P.length, dim = P[0].length;
  let centros = semillas(P, K, modo).map((i) => P[i].slice());
  const asig = new Array(n).fill(-1);
  for (let it = 0; it < 100; it++) {
    let cambios = 0;
    for (let i = 0; i < n; i++) {
      let mk = 0, md = Infinity;
      for (let k = 0; k < K; k++) { const d = dist2(P[i], centros[k]); if (d < md) { md = d; mk = k; } }
      if (asig[i] !== mk) { asig[i] = mk; cambios++; }
    }
    const nue = Array.from({ length: K }, () => new Array(dim).fill(0));
    const cnt = new Array(K).fill(0);
    for (let i = 0; i < n; i++) { cnt[asig[i]]++; for (let j = 0; j < dim; j++) nue[asig[i]][j] += P[i][j]; }
    for (let k = 0; k < K; k++) { if (!cnt[k]) { nue[k] = centros[k].slice(); continue; } for (let j = 0; j < dim; j++) nue[k][j] /= cnt[k]; }
    centros = nue;
    if (!cambios) break;
  }
  return { asig, centros };
}

const asignar = (p, centros) => {
  let k = 0, m = Infinity;
  for (let i = 0; i < centros.length; i++) { const d = dist2(p, centros[i]); if (d < m) { m = d; k = i; } }
  return k;
};

// ═══ 3. SEPARACIÓN (F de Fisher) Y LOS TRES CONTROLES ══════════════════════════════════════
function fisher(valores, grupos, K) {
  const v = [], g = [];
  for (let i = 0; i < valores.length; i++) if (valores[i] != null && !Number.isNaN(valores[i])) { v.push(valores[i]); g.push(grupos[i]); }
  const n = v.length;
  if (n < K + 2) return NaN;
  const gm = v.reduce((a, b) => a + b, 0) / n;
  const sum = new Array(K).fill(0), cnt = new Array(K).fill(0);
  for (let i = 0; i < n; i++) { sum[g[i]] += v[i]; cnt[g[i]]++; }
  const md = sum.map((s, k) => (cnt[k] ? s / cnt[k] : NaN));
  let entre = 0, dentro = 0;
  for (let k = 0; k < K; k++) if (cnt[k]) entre += cnt[k] * (md[k] - gm) ** 2;
  for (let i = 0; i < n; i++) dentro += (v[i] - md[g[i]]) ** 2;
  return (entre / (K - 1)) / (dentro / (n - K));
}

// generador determinista propio (LCG). Misma semilla, mismo resultado: se puede repetir.
const lcg = (s0) => { let s = s0 >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };

function barajaConTamanos(n, tam, rnd) {
  const idx = [...Array(n).keys()];
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
  const g = new Array(n).fill(0);
  let p = 0;
  tam.forEach((t, k) => { for (let i = 0; i < t; i++) g[idx[p++]] = k; });
  return g;
}
function particionPorOrden(valores, tam) {
  const n = valores.length;
  const orden = [...Array(n).keys()].sort((a, b) => (valores[a] ?? Infinity) - (valores[b] ?? Infinity));
  const g = new Array(n).fill(0);
  let p = 0;
  tam.forEach((t, k) => { for (let i = 0; i < t; i++) g[orden[p++]] = k; });
  return g;
}

// ═══ 4. LEER UNA FORMA EN PALABRAS LLANAS ══════════════════════════════════════════════════
const BINS = 24, PASO = 0.25, BORDE = 3;
const centroBin = (i) => -BORDE + (i + 0.5) * PASO;
function describirSilueta(s) {
  const calls = s.slice(0, BINS), puts = s.slice(BINS);
  const sc = calls.reduce((a, b) => a + b, 0), sp = puts.reduce((a, b) => a + b, 0);
  const cen = (v, t) => (t > 0 ? v.reduce((a, x, i) => a + x * centroBin(i), 0) / t : NaN);
  const pico = (v) => centroBin(v.indexOf(Math.max(...v)));
  return { pesoCalls: sc, pesoPuts: sp, dentro3: sc + sp, centroCalls: cen(calls, sc), centroPuts: cen(puts, sp), picoCalls: pico(calls), picoPuts: pico(puts) };
}

// ═══ 5. EL 21 DE AGOSTO CONTRA TODO ════════════════════════════════════════════════════════
const d21 = cargarDia21();
const p21 = d21 ? perfilGex(d21.oi, d21.barras[0].spot) : null;
const perfilDe = (x) => ({ silueta: x.silueta });
if (p21) {
  const dst = D.map((x) => distanciaSilueta(p21, perfilDe(x)));
  const orden = [...dst].sort((a, b) => a - b);
  const par = [];
  for (let i = 0; i < D.length; i += 5) for (let j = i + 1; j < D.length; j += 13) par.push(distanciaSilueta(perfilDe(D[i]), perfilDe(D[j])));
  par.sort((a, b) => a - b);
  const mediaDist = mediana(dst);
  const pct = (par.filter((x) => x < mediaDist).length / par.length) * 100;
  const s21 = describirSilueta(p21.silueta);
  console.log("\n" + "─".repeat(100));
  console.log(`EL 21 DE AGOSTO (el día de Eduardo) CONTRA LOS 1.119 DÍAS`);
  console.log(`  su forma: ${f3(s21.dentro3)} del OI vive en ±3% · bulto de calls en ${f2(s21.centroCalls)}% · bulto de puts en ${f2(s21.centroPuts)}%`);
  console.log(`  vecino más parecido: ${D[dst.indexOf(orden[0])].dia} a distancia ${f3(orden[0])} · 10º vecino a ${f3(orden[9])}`);
  console.log(`  distancia mediana del 21 a todos: ${f3(mediaDist)} · entre dos días cualesquiera: ${f3(mediana(par))}`);
  console.log(`  → el 21 está en el percentil ${f2(pct)} de rareza: NO era un día raro, era un día del montón`);
}

// ═══ 6. LA TABLA GRANDE ════════════════════════════════════════════════════════════════════
const puntos = D.map((x) => x.silueta);
const RESULT = [
  ["recorrido %", D.map((x) => x.recorridoPct)],
  ["cierre-apert %", D.map((x) => x.retPct)],
  ["call 10→12 $", D.map((x) => x.call1012)],
  ["cóndor 11:00 $", D.map((x) => x.cond)],
];
const vTam = D.map((x) => x.total), vCuna = D.map((x) => x.cuna);
const veredicto = [];

for (const modo of ["extremos", "cuantiles"]) {
  console.log("\n" + "█".repeat(100));
  console.log(`ARRANQUE «${modo}»` + (modo === "extremos" ? "  (el pedido: los K días más separados entre sí)" : "  (semillas en los cuantiles de la dirección principal)"));
  console.log("█".repeat(100));

  for (const K of KS) {
    const { asig, centros } = kmedias(puntos, K, modo);
    const tam = new Array(K).fill(0); asig.forEach((k) => tam[k]++);
    console.log(`\n══ K = ${K} ══════════════════════════════════════════════════════════════════════`);
    console.log("gr     n  %OI±3%  bultoC%  bultoP%  picoC%  picoP%  imán%  muroC%  muroP%  desb0,5  conc   OI medio");
    for (let k = 0; k < K; k++) {
      const g = D.filter((_, i) => asig[i] === k);
      const s = describirSilueta(centros[k]);
      console.log(
        `${String(k).padStart(2)} ${String(tam[k]).padStart(5)}   ${f3(s.dentro3).padStart(5)}  ${f2(s.centroCalls).padStart(7)}  ${f2(s.centroPuts).padStart(7)}  ` +
        `${f2(s.picoCalls).padStart(6)}  ${f2(s.picoPuts).padStart(6)}  ${f2(media(g.map((x) => x.imanPct))).padStart(5)}  ` +
        `${f2(media(g.map((x) => x.muroCPct ?? NaN))).padStart(6)}  ${f2(media(g.map((x) => x.muroPPct ?? NaN))).padStart(6)}  ` +
        `${f3(media(g.map((x) => x.desb05))).padStart(6)}  ${f3(media(g.map((x) => x.conc)))}  ${Math.round(media(g.map((x) => x.total))).toString().padStart(8)}`);
    }
    console.log("gr     n  recorr%  cierre%  maxAntesMin  cuna%  | call $med  call $mna  acier%  call $/año | cond $med  acier%  cond $/año");
    for (let k = 0; k < K; k++) {
      const g = D.filter((_, i) => asig[i] === k);
      const c = g.map((x) => x.call1012).filter((x) => x != null);
      const q = g.map((x) => x.cond).filter((x) => x != null);
      const fr = g.length / D.length;
      console.log(
        `${String(k).padStart(2)} ${String(g.length).padStart(5)}  ${f2(media(g.map((x) => x.recorridoPct))).padStart(6)}  ${f3(media(g.map((x) => x.retPct))).padStart(7)}  ` +
        `${f2((g.filter((x) => x.maxAntesMin).length / g.length) * 100).padStart(9)}%  ${f2(media(g.map((x) => x.cuna).filter((x) => x != null))).padStart(5)}  | ` +
        `${d0(media(c)).padStart(9)}  ${d0(mediana(c)).padStart(9)}  ${f2(c.length ? (c.filter((x) => x > 0).length / c.length) * 100 : NaN).padStart(6)}  ${d0(media(c) * fr * DIAS_ANO).padStart(10)} | ` +
        `${d0(media(q)).padStart(9)}  ${f2(q.length ? (q.filter((x) => x > 0).length / q.length) * 100 : NaN).padStart(6)}  ${d0(media(q) * fr * DIAS_ANO).padStart(10)}`);
    }

    // ── ¿sortea más que los tres controles? ──────────────────────────────────────────
    const gAzar = [];
    const rnd = lcg(20260821 + K);
    for (let r = 0; r < 200; r++) gAzar.push(barajaConTamanos(D.length, tam, rnd));
    const gTam = particionPorOrden(vTam, tam), gCuna = particionPorOrden(vCuna, tam);
    console.log("resultado         F(forma)  F azar med  F azar p95  pct azar  F(tamaño)  F(volatil)  ¿supera a los 3?");
    for (const [nombre, vals] of RESULT) {
      const f = fisher(vals, asig, K);
      const fa = gAzar.map((g) => fisher(vals, g, K)).sort((a, b) => a - b);
      const p95 = fa[Math.floor(0.95 * fa.length)];
      const pct = (fa.filter((x) => x < f).length / fa.length) * 100;
      const ft = fisher(vals, gTam, K), fc = fisher(vals, gCuna, K);
      const ok = f > p95 && f > ft && f > fc;
      veredicto.push({ modo, K, nombre, f, p95, pct, ft, fc, ok });
      console.log(`${nombre.padEnd(16)} ${f2(f).padStart(8)}  ${f2(mediana(fa)).padStart(10)}  ${f2(p95).padStart(10)}  ${f2(pct).padStart(7)}%  ${f2(ft).padStart(9)}  ${f2(fc).padStart(10)}  ${ok ? "SÍ" : "no"}`);
    }
    if (p21) {
      const k21 = asignar(p21.silueta, centros);
      const g = D.filter((_, i) => asig[i] === k21);
      const c = g.map((x) => x.call1012).filter((x) => x != null);
      console.log(`el 21 de agosto cae en el grupo ${k21} (n=${g.length}) · su call 10→12 media allí ${d0(media(c))} · aciertos ${f2((c.filter((x) => x > 0).length / c.length) * 100)}%`);
    }
  }
}

// ═══ 7. ¿AÑADE ALGO LA FORMA POR ENCIMA DE LA VOLATILIDAD? ═════════════════════════════════
// La forma separa el RECORRIDO del día con fuerza. Pero la cuna al dinero (que se ve en pantalla
// a las 09:35) también. La pregunta honesta: dentro de días con la MISMA volatilidad, ¿la forma
// sigue separando el recorrido? Si no, la forma sólo estaba diciendo lo que ya decía la cuna.
console.log("\n" + "═".repeat(100));
console.log("¿AÑADE ALGO LA FORMA POR ENCIMA DE LA VOLATILIDAD YA VISIBLE? (terciles de cuna a las 09:35)");
console.log("═".repeat(100));
{
  const K = 4;
  const { asig } = kmedias(puntos, K, "cuantiles");
  const conCuna = D.map((x, i) => ({ i, cuna: x.cuna })).filter((x) => x.cuna != null).sort((a, b) => a.cuna - b.cuna);
  const corte = Math.floor(conCuna.length / 3);
  const nombres = ["baja", "media", "alta"];
  console.log("tercil de volatilidad   n   cuna%  recorrido% por grupo de forma (K=4)          F(forma)  F azar p95  pct azar");
  for (let t = 0; t < 3; t++) {
    const idx = conCuna.slice(t * corte, t === 2 ? conCuna.length : (t + 1) * corte).map((x) => x.i);
    const vals = idx.map((i) => D[i].recorridoPct);
    const gr = idx.map((i) => asig[i]);
    const tam = new Array(K).fill(0); gr.forEach((k) => tam[k]++);
    const f = fisher(vals, gr, K);
    const rnd = lcg(4242 + t);
    const fa = [];
    for (let r = 0; r < 200; r++) fa.push(fisher(vals, barajaConTamanos(idx.length, tam, rnd), K));
    fa.sort((a, b) => a - b);
    const medias = Array.from({ length: K }, (_, k) => media(idx.filter((_, j) => gr[j] === k).map((i) => D[i].recorridoPct)));
    console.log(`${nombres[t].padEnd(10)} ${String(idx.length).padStart(12)}  ${f2(media(idx.map((i) => D[i].cuna))).padStart(5)}  ` +
      `${medias.map((m, k) => `g${k}=${f2(m)}(${tam[k]})`).join(" ").padEnd(42)}  ${f2(f).padStart(7)}  ${f2(fa[190]).padStart(10)}  ${f2((fa.filter((x) => x < f).length / fa.length) * 100).padStart(6)}%`);
  }
  // correlación forma-volatilidad, para verlo directo
  const dentro3 = D.map((x) => describirSilueta(x.silueta).dentro3);
  const cun = D.map((x) => x.cuna);
  const pares = dentro3.map((v, i) => [v, cun[i]]).filter(([, c]) => c != null);
  const mx = media(pares.map((p) => p[0])), my = media(pares.map((p) => p[1]));
  let sxy = 0, sxx = 0, syy = 0;
  for (const [x, y] of pares) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; }
  console.log(`\ncorrelación entre «qué parte del OI vive en ±3%» y la cuna al dinero: ${f3(sxy / Math.sqrt(sxx * syy))} (n=${pares.length})`);
  const recor = D.map((x) => x.recorridoPct);
  let sxy2 = 0, sxx2 = 0, syy2 = 0;
  const mr = media(recor);
  for (let i = 0; i < D.length; i++) { sxy2 += (dentro3[i] - mx) * (recor[i] - mr); sxx2 += (dentro3[i] - mx) ** 2; syy2 += (recor[i] - mr) ** 2; }
  console.log(`correlación entre esa misma medida de forma y el recorrido del día:  ${f3(sxy2 / Math.sqrt(sxx2 * syy2))} (n=${D.length})`);
}

// ═══ 8. EL GRUPO MÁS RENTABLE DE CADA K, MIRADO DE CERCA ═══════════════════════════════════
console.log("\n" + "═".repeat(100));
console.log("EL GRUPO MÁS RENTABLE DE CADA K PARA LA CALL 10→12 (arranque «cuantiles»), MIRADO DE CERCA");
console.log("═".repeat(100));
console.log(" K  gr     n  media$  mediana$  peor día  sin los 5 mejores  $/año  |  2022     2023     2024     2025     2026");
for (const K of KS) {
  const { asig } = kmedias(puntos, K, "cuantiles");
  let mk = -1, mm = -Infinity;
  for (let k = 0; k < K; k++) {
    const c = D.filter((_, i) => asig[i] === k).map((x) => x.call1012).filter((x) => x != null);
    if (c.length >= 30 && media(c) > mm) { mm = media(c); mk = k; }
  }
  const g = D.filter((_, i) => asig[i] === mk);
  const c = g.map((x) => x.call1012).filter((x) => x != null);
  const fr = g.length / D.length;
  const sin5 = [...c].sort((a, b) => b - a).slice(5);
  const anos = [2022, 2023, 2024, 2025, 2026].map((a) => {
    const cc = g.filter((x) => x.ano === a).map((x) => x.call1012).filter((x) => x != null);
    const nAno = D.filter((x) => x.ano === a).length;
    return cc.length ? d0(media(cc) * (cc.length / nAno) * DIAS_ANO) : "n/d";
  });
  console.log(`${String(K).padStart(2)}  ${String(mk).padStart(2)} ${String(c.length).padStart(5)}  ${d0(media(c)).padStart(6)}  ${d0(mediana(c)).padStart(8)}  ${d0(Math.min(...c)).padStart(8)}  ` +
    `${d0(media(sin5) * fr * DIAS_ANO).padStart(17)}  ${d0(media(c) * fr * DIAS_ANO).padStart(5)}  |  ${anos.map((x) => x.padStart(7)).join(" ")}`);
}

// ═══ 9. FUERA DE MUESTRA ═══════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(100));
console.log("FUERA DE MUESTRA: grupos construidos SÓLO con días anteriores a 2025-01-01 (arranque «cuantiles»)");
console.log("═".repeat(100));
const iA = D.map((_, i) => i).filter((i) => D[i].dia < "2025-01-01");
const iB = D.map((_, i) => i).filter((i) => D[i].dia >= "2025-01-01");
console.log(`construir: ${iA.length} días (${D[iA[0]].dia}…${D[iA[iA.length - 1]].dia}) · comprobar: ${iB.length} días (${D[iB[0]].dia}…${D[iB[iB.length - 1]].dia})`);
for (const K of KS) {
  const { centros } = kmedias(iA.map((i) => puntos[i]), K, "cuantiles");
  const gA = iA.map((i) => asignar(puntos[i], centros));
  const gB = iB.map((i) => asignar(puntos[i], centros));
  const tamB = new Array(K).fill(0); gB.forEach((k) => tamB[k]++);
  console.log(`\nK=${K}`);
  console.log("gr  nAntes  recorrAntes  callAntes$  condAntes$ | nDesp  recorrDesp  callDesp$  condDesp$");
  for (let k = 0; k < K; k++) {
    const a = iA.filter((_, j) => gA[j] === k).map((i) => D[i]);
    const b = iB.filter((_, j) => gB[j] === k).map((i) => D[i]);
    const ca = a.map((x) => x.call1012).filter((x) => x != null), qa = a.map((x) => x.cond).filter((x) => x != null);
    const cb = b.map((x) => x.call1012).filter((x) => x != null), qb = b.map((x) => x.cond).filter((x) => x != null);
    console.log(`${String(k).padStart(2)} ${String(a.length).padStart(6)}  ${f2(media(a.map((x) => x.recorridoPct))).padStart(10)}  ${d0(media(ca)).padStart(10)}  ${d0(media(qa)).padStart(10)} | ` +
      `${String(b.length).padStart(5)}  ${f2(media(b.map((x) => x.recorridoPct))).padStart(9)}  ${d0(media(cb)).padStart(9)}  ${d0(media(qb)).padStart(9)}`);
  }
  for (const [nombre, vals] of RESULT) {
    const vb = iB.map((i) => vals[i]);
    const f = fisher(vb, gB, K);
    const rnd = lcg(777 + K);
    const fa = [];
    for (let r = 0; r < 200; r++) fa.push(fisher(vb, barajaConTamanos(iB.length, tamB, rnd), K));
    fa.sort((a, b) => a - b);
    console.log(`   fuera de muestra · ${nombre.padEnd(16)} F=${f2(f).padStart(6)}  percentil contra el azar: ${f2((fa.filter((x) => x < f).length / fa.length) * 100)}%`);
  }
}

// ═══ 10. VEREDICTO ═════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(100));
console.log("VEREDICTO — ¿en cuántos K supera la forma a LOS TRES controles?");
console.log("═".repeat(100));
for (const modo of ["extremos", "cuantiles"]) {
  console.log(`\narranque «${modo}»`);
  for (const [nombre] of RESULT) {
    const filas = veredicto.filter((v) => v.modo === modo && v.nombre === nombre);
    console.log(`  ${nombre.padEnd(16)} supera a los 3 en ${filas.filter((v) => v.ok).length} de ${KS.length} · percentil contra el azar por K: ${filas.map((v) => f2(v.pct)).join(" / ")}`);
  }
}
console.log(`\ntiempo total: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
