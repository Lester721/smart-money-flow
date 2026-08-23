// LOS GEMELOS POR LO QUE UN OPERADOR VE EN PANTALLA
//
// ═══ DE DÓNDE VIENE ESTE ENCARGO ════════════════════════════════════════════════════════════
//
// Eduardo ganó cuatro calls 0DTE de SPXW el viernes 21 de agosto de 2026 y dijo que las eligió
// por el GEX. La medición anterior probó la FORMA de su operación (comprar una call X puntos
// por encima a la hora E y venderla a la hora S) repetida A CIEGAS los 1.123 días: pierde.
// Lester tenía razón al decir que eso no es lo que hace Eduardo: «algo tuvo que haber visto el
// GEX… cuando veas los mismos patrones, entonces te metes».
//
// La familia de siluetas compara los 48 números del perfil de interés abierto. Pero esa silueta
// NADIE la mira. Un operador mira CUATRO cosas en la pantalla:
//
//     1. dónde está el IMÁN (el strike con más interés abierto) respecto al precio
//     2. dónde está el PUNTO DE GIRO de la gamma respecto al precio
//     3. cómo de ancho es el PASILLO entre el muro de calls y el de puts (los de ±2%,
//        que son los que se ven; los globales de una 0DTE caen a +6,9% y −20,2%)
//     4. si pegado al dinero (±0,5%) hay más CALLS o más PUTS
//
// El 21 de agosto esos cuatro números eran:
//     imán +0,336%   ·   giro +0,275%   ·   pasillo cerca 2,606%   ·   desbalance ±0,5% −0,157
//
// ═══ QUÉ HACE ESTE FICHERO ══════════════════════════════════════════════════════════════════
//
//  1. Recalcula la huella del 21 desde su fichero, para no fiarse de números copiados.
//  2. Dice en qué PERCENTIL de los 1.119 días históricos cae cada uno de los cuatro. Si el 21
//     era un día del montón, ya sabemos que «el patrón» no era raro.
//  3. Busca los días gemelos con TRES tolerancias (estrecha / media / ancha), definidas como
//     una fracción de la desviación típica de cada variable — así se calibran solas y no las
//     elijo yo a dedo en puntos porcentuales.
//  4. Mide primero EL HECHO INTRADÍA (qué hizo el precio, sin opciones de por medio) y luego
//     LA OPERACIÓN DE EDUARDO (call 15 puntos por encima, entra 10:05, sale 12:00).
//  5. Todo contra los TRES controles del mismo tamaño: días al azar, días emparejados por
//     TAMAÑO de la cadena, y días emparejados por VOLATILIDAD (la cuna al dinero a las 09:35).
//  6. Prueba las combinaciones sueltas — sólo imán, sólo giro, imán+giro, los cuatro — con
//     grupos del MISMO tamaño, para ver cuál de los cuatro números, si alguno, hace el trabajo.
//  7. Y el corte temporal: calibrado sólo con días anteriores a 2025-01-01, comprobado en
//     2025-2026.
//
// ═══ REGLAS DE LA CASA QUE SE CUMPLEN AQUÍ ══════════════════════════════════════════════════
//
//  · Precios reales: se compra al ASK y se vende al BID (lo hace operar()).
//  · Sólo el pasado: el OI es el del arranque del día, y el strike se elige con el spot de la
//    barra de entrada. Nada mira una barra posterior.
//  · Un hueco no es un cero: si falta un precio la operación se descarta y se cuenta aparte.
//  · Ningún modelo de precios.
//  · Los sorteos NO usan Math.random: usan un generador determinista (xorshift con semilla
//    fija), para que la misma corrida dé lo mismo dos veces.
//  · Dólares al año con 244 días de mercado por año.
//
//   node --import tsx scripts/p3-gemelos-por-lo-que-se-ve.mjs

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  diasDisponibles, cargarDia, cargarDia21, perfilGex,
  operar, idxHora, hayHora, rejilla, compraEn, resumen, CACHE,
} from "./lib0dte.mjs";

const CACHE_P3 = join(CACHE, "p3-gemelos-cache.json");
const DIAS_ANO = 244;

// ─── generador determinista (NO Math.random) ────────────────────────────────────────────────
function xorshift(semilla) {
  let x = semilla >>> 0;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    return x / 4294967296;
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// PASO 1 — una pasada por los 1.123 días, guardando lo que hace falta
// ═══════════════════════════════════════════════════════════════════════════════════════════

const HORAS_E = ["09:55", "10:05"];
const HORAS_S = ["11:00", "12:00", "13:00"];
const DS = [10, 15, 20];

function fotoDelDia(d) {
  const p = perfilGex(d.oi, d.barras[0].spot);
  if (!p) return null;

  const spot0 = d.barras[0].spot;
  const spots = d.barras.map((b) => b.spot);
  const iCierre = d.barras.length - 1;

  // volatilidad del propio día: la cuna al dinero a las 09:35, al ASK, sobre el nivel del índice
  const K0 = rejilla(spot0);
  const cAsk = compraEn(d.barras[0], K0, "C");
  const pAsk = compraEn(d.barras[0], K0, "P");
  const cuna = cAsk != null && pAsk != null ? ((cAsk + pAsk) / spot0) * 100 : null;

  const i1005 = hayHora(d, "10:05");
  const i1200 = hayHora(d, "12:00");
  const i1100 = hayHora(d, "11:00");
  const i1400 = hayHora(d, "14:00");

  const pct = (a, b) => ((b - a) / a) * 100;

  // el hecho intradía, sin opciones de por medio
  const maxD = Math.max(...spots), minD = Math.min(...spots);
  const intradia = {
    retDia: pct(spot0, spots[iCierre]),
    rango: ((maxD - minD) / spot0) * 100,
    ret1005a1200: i1005 >= 0 && i1200 >= 0 ? pct(spots[i1005], spots[i1200]) : null,
    // la subida máxima que hubo DESPUÉS de las 10:05 — es lo que puede cobrar un comprador de calls
    subidaMax1005: i1005 >= 0 ? pct(spots[i1005], Math.max(...spots.slice(i1005))) : null,
    bajadaMax1005: i1005 >= 0 ? pct(spots[i1005], Math.min(...spots.slice(i1005))) : null,
    // la «V» del 21: mínimo antes de las 11:00 y máximo entre 11:00 y 14:00
    vShape:
      i1100 >= 0 && i1400 >= 0
        ? ((Math.max(...spots.slice(i1100, i1400 + 1)) - Math.min(...spots.slice(0, i1100 + 1))) / spot0) * 100
        : null,
    tocaIman: p.imanK != null ? (minD <= p.imanK && maxD >= p.imanK ? 1 : 0) : null,
  };

  // la operación de Eduardo, en una rejilla pequeña alrededor de lo que hizo
  const ops = {};
  let huecos = 0;
  for (const D of DS)
    for (const E of HORAS_E)
      for (const S of HORAS_S) {
        const iE = hayHora(d, E), iS = hayHora(d, S);
        if (iE < 0 || iS < 0) { huecos++; continue; }
        const K = rejilla(spots[iE]) + D;
        const r = operar(d, iE, iS, K, "C");
        if (!r) { huecos++; continue; }
        ops[`${D}|${E}|${S}`] = { ret: r.ret, dol: r.dolares, coste: r.coste };
      }

  return {
    dia: d.dia,
    spot0,
    imanPct: p.imanPct, giroPct: p.giroPct, pasilloCercaPct: p.pasilloCercaPct,
    desbalance05: p.desbalance05, desbalance1: p.desbalance1, desbalance2: p.desbalance2,
    muroCallCercaPct: p.muroCallCercaPct, muroPutCercaPct: p.muroPutCercaPct,
    concentracion: p.concentracion, totalContratos: p.totalContratos,
    cuna, intradia, ops, huecos,
  };
}

let fotos, meta;
if (existsSync(CACHE_P3)) {
  const c = JSON.parse(readFileSync(CACHE_P3, "utf8"));
  fotos = c.fotos; meta = c.meta;
  console.log(`(caché leída: ${fotos.length} días ya procesados)`);
} else {
  const dias = diasDisponibles();
  console.log(`días con cadena 0DTE: ${dias.length}  (${dias[0]} … ${dias[dias.length - 1]})`);
  fotos = [];
  let nulos = 0, sinOI = 0, sinBarras = 0;
  const t0 = Date.now();
  for (let i = 0; i < dias.length; i++) {
    const d = cargarDia(dias[i]);
    if (!d) { nulos++; continue; }
    if (!d.oi) { sinOI++; continue; }
    if (d.barras.length !== 78) sinBarras++;
    const f = fotoDelDia(d);
    if (!f) { sinOI++; continue; }
    fotos.push(f);
    if (fotos.length % 200 === 0)
      console.log(`  … ${fotos.length} días (${((Date.now() - t0) / 1000) | 0}s)`);
  }
  meta = { total: dias.length, nulos, sinOI, sinBarras, primero: dias[0], ultimo: dias[dias.length - 1] };
  writeFileSync(CACHE_P3, JSON.stringify({ fotos, meta }));
  console.log(`procesados en ${((Date.now() - t0) / 1000) | 0}s`);
}

const N = fotos.length;
const ANOS = N / DIAS_ANO;

// ═══════════════════════════════════════════════════════════════════════════════════════════
// PASO 2 — la huella del 21, recalculada desde su fichero
// ═══════════════════════════════════════════════════════════════════════════════════════════

const d21 = cargarDia21();
if (!d21) throw new Error("no está el día 21 en cache-theta/dia-21/");
const p21 = perfilGex(d21.oi, d21.barras[0].spot);

console.log("\n═══ SANIDAD ══════════════════════════════════════════════════════════════");
console.log(`días en la serie: ${meta.total}  ·  usados (con OI y perfil): ${N}  ·  sin OI/perfil: ${meta.sinOI}  ·  incompletos: ${meta.nulos}`);
console.log(`días con un número de barras distinto de 78: ${meta.sinBarras}`);
console.log(`rango: ${fotos[0].dia} … ${fotos[N - 1].dia}   →  ${ANOS.toFixed(2)} años (${DIAS_ANO} días/año)`);
{
  const hu = fotos.reduce((a, f) => a + f.huecos, 0);
  console.log(`huecos de precio en la rejilla de operaciones: ${hu} de ${N * DS.length * HORAS_E.length * HORAS_S.length}`);
  const costes = fotos.map((f) => f.ops["15|10:05|12:00"]?.coste).filter((x) => x != null).sort((a, b) => a - b);
  console.log(`coste de la call de Eduardo (15 pts arriba, 10:05): mín $${costes[0].toFixed(2)} · mediana $${costes[costes.length >> 1].toFixed(2)} · máx $${costes[costes.length - 1].toFixed(2)}  (n=${costes.length})`);
  const cunas = fotos.map((f) => f.cuna).filter((x) => x != null);
  console.log(`cuna al dinero a las 09:35: ${cunas.length} días con dato, mediana ${(cunas.slice().sort((a, b) => a - b)[cunas.length >> 1]).toFixed(3)}% del índice`);
}

console.log("\n═══ LA HUELLA DEL 21, RECALCULADA ════════════════════════════════════════");
console.log(`spot de referencia (primera barra ${d21.barras[0].t}): ${d21.barras[0].spot.toFixed(2)}   ·  barras: ${d21.barras.length}`);
const CUATRO = [
  ["imán %", "imanPct", p21.imanPct],
  ["giro %", "giroPct", p21.giroPct],
  ["pasillo cerca %", "pasilloCercaPct", p21.pasilloCercaPct],
  ["desbalance ±0,5%", "desbalance05", p21.desbalance05],
];
for (const [nom, campo, val] of CUATRO) {
  const serie = fotos.map((f) => f[campo]).filter((x) => x != null);
  const orden = serie.slice().sort((a, b) => a - b);
  const pct = (orden.filter((x) => x < val).length / orden.length) * 100;
  const med = orden[orden.length >> 1];
  const sd = Math.sqrt(serie.reduce((a, b) => a + (b - serie.reduce((c, d2) => c + d2, 0) / serie.length) ** 2, 0) / (serie.length - 1));
  console.log(
    `${nom.padEnd(18)} 21-ago ${val.toFixed(3).padStart(8)}   percentil ${pct.toFixed(1).padStart(5)}%   ` +
    `mediana histórica ${med.toFixed(3).padStart(8)}   σ ${sd.toFixed(3)}`
  );
}
console.log(`muro calls cerca ${p21.muroCallCercaPct?.toFixed(3)}%  ·  muro puts cerca ${p21.muroPutCercaPct?.toFixed(3)}%  ·  concentración ${p21.concentracion.toFixed(3)}  ·  contratos ${p21.totalContratos}`);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// PASO 3 — las tolerancias
// ═══════════════════════════════════════════════════════════════════════════════════════════

const campos = CUATRO.map(([, c]) => c);
const sigma = {};
const media = {};
for (const c of campos) {
  const v = fotos.map((f) => f[c]).filter((x) => x != null);
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  media[c] = m;
  sigma[c] = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
}

const TOLS = [["estrecha", 0.20], ["media", 0.40], ["ancha", 0.70]];

/** días dentro de una caja de ±k·σ del 21 en TODOS los campos de la lista */
function dentroDeCaja(k, lista) {
  const out = [];
  for (let i = 0; i < N; i++) {
    let ok = true;
    for (const c of lista) {
      const v = fotos[i][c];
      if (v == null) { ok = false; break; }
      if (Math.abs(v - p21[c]) > k * sigma[c]) { ok = false; break; }
    }
    if (ok) out.push(i);
  }
  return out;
}

console.log("\n═══ CUÁNTOS DÍAS SE PARECEN AL 21 EN LOS CUATRO NÚMEROS A LA VEZ ═════════");
console.log("tolerancia = ±k·σ de cada variable, con σ de la propia muestra histórica");
for (const [nom, k] of TOLS) {
  const g = dentroDeCaja(k, campos);
  const anchos = campos.map((c) => `${c.replace("Pct", "").replace("desbalance05", "desb")} ±${(k * sigma[c]).toFixed(3)}`);
  console.log(`  ${nom.padEnd(9)} k=${k.toFixed(2)}  →  ${String(g.length).padStart(4)} días  (${((g.length / N) * 100).toFixed(1)}%)   [${anchos.join(" · ")}]`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// PASO 4 — los tres controles
// ═══════════════════════════════════════════════════════════════════════════════════════════

/** distancia normalizada (en σ) del día i al 21, sobre la lista de campos dada */
function distZ(i, lista) {
  let s = 0;
  for (const c of lista) {
    const v = fotos[i][c];
    if (v == null) return Infinity;
    s += ((v - p21[c]) / sigma[c]) ** 2;
  }
  return Math.sqrt(s / lista.length);
}

/** los G días más parecidos al 21 según esos campos */
function vecinos(G, lista) {
  return fotos.map((_, i) => [i, distZ(i, lista)])
    .filter(([, d]) => Number.isFinite(d))
    .sort((a, b) => a[1] - b[1]).slice(0, G).map(([i]) => i);
}

/** control por TAMAÑO o por VOLATILIDAD: los G días con el escalar más parecido al 21,
 *  EXCLUYENDO los que además se le parecen en la forma (los de la caja ancha). */
function controlPorEscalar(G, valor21, campo, excluidos) {
  return fotos.map((f, i) => [i, f[campo] == null ? Infinity : Math.abs(Math.log((f[campo] || 1e-9) / valor21))])
    .filter(([i, d]) => Number.isFinite(d) && !excluidos.has(i))
    .sort((a, b) => a[1] - b[1]).slice(0, G).map(([i]) => i);
}

// la volatilidad del 21: la cuna al dinero en su primera barra
const K21 = rejilla(d21.barras[0].spot);
const c21 = compraEn(d21.barras[0], K21, "C"), pu21 = compraEn(d21.barras[0], K21, "P");
const cuna21 = c21 != null && pu21 != null ? ((c21 + pu21) / d21.barras[0].spot) * 100 : null;
console.log(`\ncuna al dinero del 21 (strike ${K21}, ${d21.barras[0].t}): call $${c21?.toFixed(2)} + put $${pu21?.toFixed(2)} = ${cuna21?.toFixed(3)}% del índice`);

// ═══════════════════════════════════════════════════════════════════════════════════════════
// PASO 5 — la ficha de un grupo de días
// ═══════════════════════════════════════════════════════════════════════════════════════════

const OP_EDU = "15|10:05|12:00";

function stats(v) {
  const s = v.filter((x) => x != null);
  if (!s.length) return { n: 0, media: NaN, t: NaN, pos: NaN };
  const r = resumen(s);
  return { n: r.n, media: r.media, t: r.t, pos: r.aciertos };
}

function fichaGrupo(idx, opKey = OP_EDU) {
  const g = idx.map((i) => fotos[i]);
  const rets = [], dols = [], dias = [];
  let huecos = 0;
  for (const f of g) {
    const o = f.ops[opKey];
    if (!o) { huecos++; continue; }
    rets.push(o.ret); dols.push(o.dol); dias.push(f.dia);
  }
  const r = stats(rets);
  const sumaDol = dols.reduce((a, b) => a + b, 0);
  const ordenD = dols.slice().sort((a, b) => a - b);
  const sinTop5 = ordenD.slice(0, Math.max(0, ordenD.length - 5)).reduce((a, b) => a + b, 0);
  return {
    n: idx.length, nOps: r.n, huecos,
    ret: r.media, t: r.t, aciertos: r.pos,
    dolMedio: r.n ? sumaDol / r.n : NaN,
    dolAno: sumaDol / ANOS,
    dolAnoSin5: sinTop5 / ANOS,
    dolMediana: ordenD.length ? ordenD[ordenD.length >> 1] : NaN,
    peorDia: ordenD.length ? ordenD[0] : NaN,
    mejorDia: ordenD.length ? ordenD[ordenD.length - 1] : NaN,
    dols, dias,
    // el hecho intradía
    ret1005a1200: stats(g.map((f) => f.intradia.ret1005a1200)),
    subidaMax: stats(g.map((f) => f.intradia.subidaMax1005)),
    bajadaMax: stats(g.map((f) => f.intradia.bajadaMax1005)),
    rango: stats(g.map((f) => f.intradia.rango)),
    retDia: stats(g.map((f) => f.intradia.retDia)),
    vShape: stats(g.map((f) => f.intradia.vShape)),
    tocaIman: stats(g.map((f) => f.intradia.tocaIman)),
  };
}

/** percentil de un valor entre R grupos al azar del mismo tamaño (sorteo determinista) */
function percentilAzar(G, valor, extractor, R = 500, semilla = 20260821) {
  const rnd = xorshift(semilla);
  const muestras = [];
  for (let r = 0; r < R; r++) {
    const set = new Set();
    while (set.size < G) set.add(Math.floor(rnd() * N));
    muestras.push(extractor([...set]));
  }
  muestras.sort((a, b) => a - b);
  const menores = muestras.filter((x) => x < valor).length;
  return {
    pct: (menores / R) * 100,
    p5: muestras[Math.floor(R * 0.05)],
    p50: muestras[Math.floor(R * 0.5)],
    p95: muestras[Math.floor(R * 0.95)],
    mediaControl: muestras.reduce((a, b) => a + b, 0) / R,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// PASO 6 — el grupo principal: la caja MEDIA con los cuatro números
// ═══════════════════════════════════════════════════════════════════════════════════════════

const cajas = {};
for (const [nom, k] of TOLS) cajas[nom] = dentroDeCaja(k, campos);
const excluidos = new Set(cajas["ancha"]);

console.log("\n═══════════════════════════════════════════════════════════════════════════");
console.log("  EL HECHO INTRADÍA — ¿los gemelos hacen algo distinto con el precio?");
console.log("═══════════════════════════════════════════════════════════════════════════");

function lineaIntradia(nombre, fi) {
  console.log(
    `${nombre.padEnd(24)} n=${String(fi.n).padStart(4)}  ` +
    `10:05→12:00 ${(fi.ret1005a1200.media * 1).toFixed(3).padStart(7)}%  (+${(fi.ret1005a1200.pos * 100).toFixed(0)}% días)   ` +
    `subida máx ${fi.subidaMax.media.toFixed(3).padStart(6)}%   bajada máx ${fi.bajadaMax.media.toFixed(3).padStart(7)}%   ` +
    `rango ${fi.rango.media.toFixed(3)}%   día ${fi.retDia.media.toFixed(3).padStart(7)}%   toca imán ${(fi.tocaIman.media * 100).toFixed(0)}%`
  );
}

for (const [nom] of TOLS) {
  const g = cajas[nom];
  if (g.length < 10) { console.log(`caja ${nom}: sólo ${g.length} días — no hay nada que medir.`); continue; }
  const fi = fichaGrupo(g);
  const G = g.length;
  console.log(`\n── caja ${nom} (${G} días) ──`);
  lineaIntradia("GEMELOS", fi);
  const cTam = controlPorEscalar(G, p21.totalContratos, "totalContratos", excluidos);
  const cVol = controlPorEscalar(G, cuna21, "cuna", excluidos);
  lineaIntradia("control TAMAÑO", fichaGrupo(cTam));
  lineaIntradia("control VOLATILIDAD", fichaGrupo(cVol));
  const pz = percentilAzar(G, fi.ret1005a1200.media, (idx) => fichaGrupo(idx).ret1005a1200.media);
  console.log(
    `control AZAR (500 grupos de ${G}): mediana ${pz.p50.toFixed(3)}%  ·  banda 5–95% [${pz.p5.toFixed(3)}%, ${pz.p95.toFixed(3)}%]  ` +
    `→ los gemelos caen en el percentil ${pz.pct.toFixed(1)}%`
  );
}

console.log("\n═══════════════════════════════════════════════════════════════════════════");
console.log("  LA OPERACIÓN DE EDUARDO — call 15 pts por encima, entra 10:05, sale 12:00");
console.log("═══════════════════════════════════════════════════════════════════════════");

function lineaOp(nombre, fi) {
  console.log(
    `${nombre.padEnd(24)} n=${String(fi.nOps).padStart(4)}  ret ${(fi.ret * 100).toFixed(2).padStart(7)}%  ` +
    `t=${fi.t.toFixed(2).padStart(6)}  aciertos ${(fi.aciertos * 100).toFixed(1).padStart(5)}%  ` +
    `$/op ${fi.dolMedio.toFixed(0).padStart(6)}  $/año ${fi.dolAno.toFixed(0).padStart(7)}  ` +
    `mediana $${fi.dolMediana.toFixed(0).padStart(5)}  peor $${fi.peorDia.toFixed(0)}  huecos ${fi.huecos}`
  );
}

const TODOS = fotos.map((_, i) => i);
console.log("\n── el listón: los 1.119 días, sin filtro ──");
lineaOp("TODOS LOS DÍAS", fichaGrupo(TODOS));

for (const [nom] of TOLS) {
  const g = cajas[nom];
  if (g.length < 10) { console.log(`\ncaja ${nom}: sólo ${g.length} días — no hay nada que medir.`); continue; }
  const G = g.length;
  const fi = fichaGrupo(g);
  console.log(`\n── caja ${nom} (${G} días) ──`);
  lineaOp("GEMELOS", fi);
  lineaOp("control TAMAÑO", fichaGrupo(controlPorEscalar(G, p21.totalContratos, "totalContratos", excluidos)));
  lineaOp("control VOLATILIDAD", fichaGrupo(controlPorEscalar(G, cuna21, "cuna", excluidos)));
  const pz = percentilAzar(G, fi.ret, (idx) => fichaGrupo(idx).ret);
  console.log(
    `control AZAR (500 grupos de ${G}): mediana ${(pz.p50 * 100).toFixed(2)}%  ·  banda 5–95% ` +
    `[${(pz.p5 * 100).toFixed(2)}%, ${(pz.p95 * 100).toFixed(2)}%]  → gemelos en el percentil ${pz.pct.toFixed(1)}%`
  );
  console.log(`  sin los 5 mejores días: $${fi.dolAnoSin5.toFixed(0)}/año (contra $${fi.dolAno.toFixed(0)})   mejor día $${fi.mejorDia.toFixed(0)}`);
  // año a año
  const porAno = {};
  for (let j = 0; j < fi.dias.length; j++) {
    const a = fi.dias[j].slice(0, 4);
    (porAno[a] ??= []).push(fi.dols[j]);
  }
  console.log("  año a año: " + Object.keys(porAno).sort().map((a) =>
    `${a} n=${porAno[a].length} $${porAno[a].reduce((x, y) => x + y, 0).toFixed(0)}`).join("  ·  "));
  // mitades y tercios por tiempo, en retorno medio (los días ya vienen en orden cronológico)
  const rr = g.map((i) => fotos[i].ops[OP_EDU]).filter(Boolean).map((o) => o.ret);
  const h = Math.floor(rr.length / 2);
  const t3 = [[], [], []];
  rr.forEach((x, j) => t3[Math.min(2, Math.floor((j * 3) / rr.length))].push(x));
  console.log(
    `  mitades: ${(resumen(rr.slice(0, h)).media * 100).toFixed(2)}% / ${(resumen(rr.slice(h)).media * 100).toFixed(2)}%   ` +
    `tercios: ${t3.map((x) => (resumen(x).media * 100).toFixed(2) + "%").join(" / ")}`);
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// PASO 7 — ¿cuál de los cuatro números hace el trabajo?
// ═══════════════════════════════════════════════════════════════════════════════════════════

console.log("\n═══════════════════════════════════════════════════════════════════════════");
console.log("  LAS COMBINACIONES SUELTAS — grupos del MISMO tamaño, por vecinos más cercanos");
console.log("═══════════════════════════════════════════════════════════════════════════");

const COMBIS = [
  ["sólo imán", ["imanPct"]],
  ["sólo giro", ["giroPct"]],
  ["sólo pasillo", ["pasilloCercaPct"]],
  ["sólo desbalance", ["desbalance05"]],
  ["imán + giro", ["imanPct", "giroPct"]],
  ["imán + desbal.", ["imanPct", "desbalance05"]],
  ["los CUATRO", campos],
];

for (const G of [40, 100, 200]) {
  console.log(`\n── grupos de ${G} días ──`);
  const azarOp = percentilAzar(G, 0, (idx) => fichaGrupo(idx).ret);
  const azarIntra = percentilAzar(G, 0, (idx) => fichaGrupo(idx).ret1005a1200.media);
  console.log(`   (azar: operación ${(azarOp.p50 * 100).toFixed(2)}% [${(azarOp.p5 * 100).toFixed(2)}, ${(azarOp.p95 * 100).toFixed(2)}]  ·  intradía ${azarIntra.p50.toFixed(3)}% [${azarIntra.p5.toFixed(3)}, ${azarIntra.p95.toFixed(3)}])`);
  for (const [nom, lista] of COMBIS) {
    const g = vecinos(G, lista);
    const fi = fichaGrupo(g);
    const pOp = ((azarOp.p50 !== undefined) && percentilAzar(G, fi.ret, (idx) => fichaGrupo(idx).ret, 200).pct);
    console.log(
      `${nom.padEnd(17)} intradía 10:05→12:00 ${fi.ret1005a1200.media.toFixed(3).padStart(7)}%  ` +
      `·  operación ${(fi.ret * 100).toFixed(2).padStart(7)}%  t=${fi.t.toFixed(2).padStart(6)}  ` +
      `aciertos ${(fi.aciertos * 100).toFixed(1).padStart(5)}%  $/año ${fi.dolAno.toFixed(0).padStart(7)}  ` +
      `percentil vs azar ${pOp.toFixed(0)}%`
    );
  }
}

// ─── PASO 7b — a las combinaciones que parecen ganar se les mira por dentro ──────────────────
//
// Una celda con percentil alto contra el azar no vale nada si el dinero sale de cuatro días o
// si cambia de signo al cambiar el tamaño del grupo. Aquí se le mira eso a TODAS.

console.log("\n── por dentro: ¿de dónde sale el dinero de cada combinación? (grupos de 100) ──");
for (const [nom, lista] of COMBIS) {
  const g = vecinos(100, lista);
  const fi = fichaGrupo(g);
  const mitad = Math.floor(fi.dias.length / 2);
  const ordenTiempo = fi.dias.map((d, j) => [d, fi.dols[j]]).sort((a, b) => a[0].localeCompare(b[0]));
  const m1 = ordenTiempo.slice(0, mitad).reduce((a, b) => a + b[1], 0);
  const m2 = ordenTiempo.slice(mitad).reduce((a, b) => a + b[1], 0);
  const porAno = {};
  for (const [d, x] of ordenTiempo) (porAno[d.slice(0, 4)] ??= []).push(x);
  console.log(
    `${nom.padEnd(17)} $/año ${fi.dolAno.toFixed(0).padStart(6)}  ·  sin los 5 mejores ${fi.dolAnoSin5.toFixed(0).padStart(6)}  ·  ` +
    `mitad1 $${m1.toFixed(0).padStart(6)} / mitad2 $${m2.toFixed(0).padStart(6)}  ·  ` +
    Object.keys(porAno).sort().map((a) => `${a.slice(2)}:${porAno[a].reduce((x, y) => x + y, 0).toFixed(0)}`).join(" ")
  );
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// PASO 8 — el corte temporal: calibrado con <2025, comprobado en 2025-2026
// ═══════════════════════════════════════════════════════════════════════════════════════════

console.log("\n═══════════════════════════════════════════════════════════════════════════");
console.log("  FUERA DE MUESTRA — σ y umbral SÓLO con días anteriores a 2025-01-01");
console.log("═══════════════════════════════════════════════════════════════════════════");

const iAntes = [], iDespues = [];
for (let i = 0; i < N; i++) (fotos[i].dia < "2025-01-01" ? iAntes : iDespues).push(i);
console.log(`días antes de 2025: ${iAntes.length}  ·  2025-2026: ${iDespues.length}`);

// σ recalculada SÓLO con el pasado
const sigmaAntes = {};
for (const c of campos) {
  const v = iAntes.map((i) => fotos[i][c]).filter((x) => x != null);
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  sigmaAntes[c] = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
}
function dentroDeCajaAntes(k, lista, universo) {
  return universo.filter((i) => lista.every((c) => {
    const v = fotos[i][c];
    return v != null && Math.abs(v - p21[c]) <= k * sigmaAntes[c];
  }));
}
for (const [nom, k] of TOLS) {
  const gA = dentroDeCajaAntes(k, campos, iAntes);
  const gD = dentroDeCajaAntes(k, campos, iDespues);
  const fA = gA.length >= 5 ? fichaGrupo(gA) : null;
  const fD = gD.length >= 5 ? fichaGrupo(gD) : null;
  console.log(
    `  ${nom.padEnd(9)}  <2025: n=${String(gA.length).padStart(3)} ` +
    (fA ? `intradía ${fA.ret1005a1200.media.toFixed(3)}%  op ${(fA.ret * 100).toFixed(2)}%  $/año ${(fA.dols.reduce((a, b) => a + b, 0) / (iAntes.length / DIAS_ANO)).toFixed(0)}` : "—") +
    `   ‖  2025-26: n=${String(gD.length).padStart(3)} ` +
    (fD ? `intradía ${fD.ret1005a1200.media.toFixed(3)}%  op ${(fD.ret * 100).toFixed(2)}%  $/año ${(fD.dols.reduce((a, b) => a + b, 0) / (iDespues.length / DIAS_ANO)).toFixed(0)}` : "—")
  );
  // el listón de cada tramo, para comparar contra su propio período
  if (nom === "media") {
    const bA = fichaGrupo(iAntes), bD = fichaGrupo(iDespues);
    console.log(`             listón <2025: intradía ${bA.ret1005a1200.media.toFixed(3)}%  op ${(bA.ret * 100).toFixed(2)}%   ‖  listón 2025-26: intradía ${bD.ret1005a1200.media.toFixed(3)}%  op ${(bD.ret * 100).toFixed(2)}%`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════
// PASO 9 — el día 21 visto desde la operación: ¿qué habría dado la regla ESE día?
// ═══════════════════════════════════════════════════════════════════════════════════════════

console.log("\n═══ EL PROPIO 21, MEDIDO CON LA MISMA VARA ═══════════════════════════════");
{
  const iE = hayHora(d21, "10:05"), iS = hayHora(d21, "12:00");
  if (iE >= 0 && iS >= 0) {
    const K = rejilla(d21.barras[iE].spot) + 15;
    const r = operar(d21, iE, iS, K, "C");
    console.log(r
      ? `call ${K} (spot ${d21.barras[iE].spot.toFixed(2)} a las 10:05) → compra $${r.coste.toFixed(2)} · venta $${r.ingreso.toFixed(2)} · ${(r.ret * 100).toFixed(1)}% · $${r.dolares.toFixed(0)}`
      : "faltaba un precio: hueco, no cero");
    const s = d21.barras.map((b) => b.spot);
    console.log(`intradía del 21: 10:05→12:00 ${(((s[iS] - s[iE]) / s[iE]) * 100).toFixed(3)}%  ·  rango ${(((Math.max(...s) - Math.min(...s)) / s[0]) * 100).toFixed(3)}%  ·  día ${(((s[s.length - 1] - s[0]) / s[0]) * 100).toFixed(3)}%`);
  }
}

// ─── PASO 10 — ¿cambia algo si el 21 se mide con la barra de las 09:35, como los históricos? ──
//
// El 21 tiene 79 barras (incluye las 09:30) y los 1.119 históricos tienen 78 (empiezan a las
// 09:35). Su huella se calcula con la primera barra, o sea con el spot de las 09:30. Si el
// resultado dependiera de esos cinco minutos, el hallazgo sería del reloj y no del GEX.

console.log("\n═══ COMPROBACIÓN: la huella del 21 medida a las 09:35 en vez de 09:30 ════");
{
  const i35 = hayHora(d21, "09:35");
  const alt = perfilGex(d21.oi, d21.barras[i35].spot);
  console.log(`spot 09:30 ${d21.barras[0].spot.toFixed(2)}  →  spot 09:35 ${d21.barras[i35].spot.toFixed(2)}`);
  for (const [nom, campo] of CUATRO.map(([n, c]) => [n, c]))
    console.log(`  ${nom.padEnd(18)} 09:30 ${p21[campo].toFixed(3).padStart(8)}   09:35 ${alt[campo].toFixed(3).padStart(8)}   (σ histórica ${sigma[campo].toFixed(3)})`);
  const g30 = dentroDeCaja(0.70, campos);
  const guardar = { ...p21 };
  for (const c of campos) p21[c] = alt[c];
  const g35 = dentroDeCaja(0.70, campos);
  for (const c of campos) p21[c] = guardar[c];
  const f30 = fichaGrupo(g30), f35 = fichaGrupo(g35);
  console.log(`  caja ancha con 09:30: n=${g30.length} op ${(f30.ret * 100).toFixed(2)}%   ‖   con 09:35: n=${g35.length} op ${(f35.ret * 100).toFixed(2)}%`);

  // POR QUÉ se mueve tanto el imán: la ventana de ±2% le corta por debajo.
  console.log("\n  el imán, por dentro — OI total por strike alrededor del dinero del 21:");
  const porK = new Map();
  for (const [k, n] of Object.entries(d21.oi)) { const K = +k.split("|")[0]; porK.set(K, (porK.get(K) ?? 0) + n); }
  const s30 = d21.barras[0].spot, s35 = d21.barras[i35].spot;
  console.log(`    ventana ±2% con 09:30: [${(s30 * 0.98).toFixed(1)}, ${(s30 * 1.02).toFixed(1)}]   con 09:35: [${(s35 * 0.98).toFixed(1)}, ${(s35 * 1.02).toFixed(1)}]`);
  for (const [K, n] of [...porK.entries()].filter(([K]) => Math.abs(K - s30) / s30 < 0.025).sort((a, b) => b[1] - a[1]).slice(0, 6))
    console.log(
      `    ${K}  OI ${String(n).padStart(6)}   ${(((K - s30) / s30) * 100).toFixed(3).padStart(7)}% del spot 09:30` +
      `   dentro de la ventana: 09:30 ${Math.abs(K - s30) / s30 < 0.02 ? "SÍ" : "NO"} · 09:35 ${Math.abs(K - s35) / s35 < 0.02 ? "SÍ" : "NO"}`);
}

console.log("\n(fin)");
