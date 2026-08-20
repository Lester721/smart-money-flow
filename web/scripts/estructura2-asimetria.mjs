// ESTRUCTURA 2 · ASIMETRÍA — el mercado no cae como sube. ¿Y si el cóndor tampoco?
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/estructura2-asimetria.mjs
//
// ═══ EN QUÉ SE DIFERENCIA DE LO YA MEDIDO ═════════════════════════════════════════════════
//
// Ya se midieron 17 filtros de régimen y 30 reglas de gestión: todos contra la MEDIA, todos
// fallaron. Y ya se midió (anatomia-lados.mjs) mover el strike CORTO de un lado, con las alas
// SIEMPRE de 50 puntos en los dos.
//
// Lo que NO se ha medido nunca: **alas de anchos DISTINTOS en cada lado**. Y es justo la palanca
// que importa para la cola, porque el ala es un tope ARITMÉTICO:
//
//     pérdida máxima de un día = ancho del lado tocado × 100 − crédito
//
// Eso no es una regresión ni un filtro: es una identidad. Un ala de 20 puntos NO PUEDE perder
// más de $2.000 pase lo que pase, ni en 2024 ni en 2030 ni en un lunes negro. Por eso este barrido
// se separa de todo lo anterior: la reducción de cola no hay que validarla estadísticamente
// —está garantizada—, lo único que hay que validar es **cuánto ingreso cuesta comprarla**, y el
// ingreso es una media sobre 650 días, que sí se estima bien.
//
// ═══ QUÉ DICE LA ANATOMÍA (de dónde sale la hipótesis) ════════════════════════════════════
//
// Del reparto del daño medido en anatomia-lados-salida.json, sobre estos mismos días:
//   · la CALL rompe 116 días (17,8%) y cuesta $1.579 el día que rompe
//   · la PUT  rompe 107 días (16,5%) y cuesta $1.999 el día que rompe   ← el 27% más cara
//   · el signo aguanta en los TRES tercios (put > call siempre)
//
// La put rompe menos veces y hace más daño cada vez. Eso es la cola. La hipótesis a probar:
// **alejar y estrechar el lado put, y financiarlo acercando/ensanchando el lado call.**
//
// ═══ CÓMO SE MIDE ═════════════════════════════════════════════════════════════════════════
//
// Precios REALES: bid de lo que se vende, ask de lo que se compra, las cuatro patas con su
// horquilla entera. Entrada 11:00 ET (spot de las 11:00 — nada de futuro), liquidación contra el
// precio real de cierre. Comisión $0,03 por pata, 8 patas el cóndor (abrir y cerrar), 4 la media.
//
// COLATERAL: la convención VERIFICADA en pantalla por Lester el 2026-08-17 — Robinhood retiene
// UNA vertical al ancho COMPLETO y NO descuenta el crédito. Con alas distintas, la más ancha.
// (anatomia-lados.mjs restaba el crédito; aquí se usa lo comprobado.)
//
// ⚠️ EL SESGO QUE HAY QUE TENER DELANTE: 2024-01 → 2026-08 es un mercado alcista. Cualquier
// resultado que dependa de "el lado call pierde más" es sospechoso de ser "el índice subió".
// Por eso todo se parte en TRES TERCIOS y el peor día de cada tercio se mira por separado.

import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { radiografia } from "../lib/radiografia";
import { listonT } from "../lib/barreraHallazgos";

const DIR = "scripts/cache-theta/gex-2026";
const HORA = "11:00";
const COMM = 0.03;

// ─────────────────────────────────────────────────────────────────────────────────────────
// LECTOR — copiado de scripts/desde-2024.mjs sin tocar, para que la línea base reproduzca
// exactamente los $48.638 / 653 días ya publicados.
// ─────────────────────────────────────────────────────────────────────────────────────────
function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const [iK, iT, iB, iA, iU] = ["strike", "timestamp", "bid", "ask", "underlying_price"].map((c) => cab.indexOf(c));
  if ([iK, iT, iB, iA, iU].some((x) => x < 0)) return null;
  const enHora = []; let spotFin = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(","), hora = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && hora >= hFin) { hFin = hora; spotFin = sp; }
    if (hora !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask, spot: sp });
  }
  return enHora.length ? { filas: enHora, cierre: spotFin } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

// ─────────────────────────────────────────────────────────────────────────────────────────
// EL BARRIDO. Cuatro mandos independientes:
//   dC = puntos por encima del spot donde se vende la call    (null = sin lado call)
//   aC = ancho del ala de call, en puntos
//   dP = puntos por debajo del spot donde se vende la put     (null = sin lado put)
//   aP = ancho del ala de put, en puntos
// La de hoy es 25 / 50 / 25 / 50.
// ─────────────────────────────────────────────────────────────────────────────────────────
const D_CALL = [20, 25, 35];
const A_CALL = [20, 30, 50];
const D_PUT = [25, 35, 50];
const A_PUT = [20, 30, 50];

const VARIANTES = [];
for (const dC of D_CALL) for (const aC of A_CALL) for (const dP of D_PUT) for (const aP of A_PUT) {
  VARIANTES.push({ id: `C${dC}/${aC}·P${dP}/${aP}`, dC, aC, dP, aP, tipo: "condor" });
}
// MEDIAS ESTRUCTURAS — sólo una vertical. El colateral es su propio ancho.
for (const dC of D_CALL) for (const aC of [30, 50]) VARIANTES.push({ id: `sólo CALL ${dC}/${aC}`, dC, aC, dP: null, aP: null, tipo: "media" });
for (const dP of D_PUT) for (const aP of [30, 50]) VARIANTES.push({ id: `sólo PUT ${dP}/${aP}`, dC: null, aC: null, dP, aP, tipo: "media" });

const ID_BASE = "C25/50·P25/50";
const PRUEBAS = VARIANTES.length;                 // este script
const PRUEBAS_FAMILIA = 17 + 30 + 11 + PRUEBAS;   // régimen + gestión + lados + esto, mismos días

// ─────────────────────────────────────────────────────────────────────────────────────────
// CONSTRUCCIÓN DÍA A DÍA — una sola pasada por fichero, todas las variantes a la vez.
// ─────────────────────────────────────────────────────────────────────────────────────────
/** Vertical de call: vende en spot+d, compra a +a. Devuelve null si no se puede armar. */
function verticalCall(filas, spot, d, a) {
  const corta = cerca(filas, spot + d), larga = cerca(filas, corta.K + a);
  if (larga.K <= corta.K) return null;
  return { Kc: corta.K, Kl: larga.K, credito: corta.bid - larga.ask, ancho: larga.K - corta.K };
}
function verticalPut(filas, spot, d, a) {
  const corta = cerca(filas, spot - d), larga = cerca(filas, corta.K - a);
  if (larga.K >= corta.K) return null;
  return { Kc: corta.K, Kl: larga.K, credito: corta.bid - larga.ask, ancho: corta.K - larga.K };
}

const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();
const porFecha = new Map();
let sinCadena = 0, sinSpot = 0, sinBase = 0, noArmable = 0;

for (const fecha of fechas) {
  const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
  if (!C || !P || !(C.cierre > 0)) { sinCadena++; continue; }
  const spot = C.filas[0].spot;
  if (!(spot > 0)) { sinSpot++; continue; }
  const S = C.cierre;

  const dia = {}; let armable = true;
  for (const v of VARIANTES) {
    const vc = v.dC == null ? null : verticalCall(C.filas, spot, v.dC, v.aC);
    const vp = v.dP == null ? null : verticalPut(P.filas, spot, v.dP, v.aP);
    if ((v.dC != null && !vc) || (v.dP != null && !vp)) { armable = false; break; }
    const credito = (vc?.credito ?? 0) + (vp?.credito ?? 0);
    const danoCall = vc ? Math.min(Math.max(S - vc.Kc, 0), vc.ancho) : 0;
    const danoPut = vp ? Math.min(Math.max(vp.Kc - S, 0), vp.ancho) : 0;
    const patas = ((vc ? 2 : 0) + (vp ? 2 : 0)) * 2;
    const anchoMax = Math.max(vc?.ancho ?? 0, vp?.ancho ?? 0);
    dia[v.id] = {
      // CRÉDITO ≤ 0 = NO SE OPERA. No se cobra nada por armar una estructura que no paga:
      // ese día la variante se queda en $0, no se borra el día (borrarlo cambiaría el
      // denominador de una variante y no el de otra, y ya no serían comparables).
      opera: credito > 0,
      pl: credito > 0 ? (credito - danoCall - danoPut) * 100 - patas * COMM : 0,
      credito: credito * 100,
      danoCall: danoCall * 100, danoPut: danoPut * 100,
      // COLATERAL comprobado en pantalla: la vertical más ancha, al ancho COMPLETO, sin
      // descontar el crédito (2026-08-17, SPXW alas 50 → $5.000).
      colateral: anchoMax * 100,
      // Lo que de verdad puede perder ese día: el tope aritmético.
      topePerdida: anchoMax * 100 - Math.max(0, credito) * 100,
      anchoC: vc?.ancho ?? 0, anchoP: vp?.ancho ?? 0,
    };
  }
  if (!armable) { noArmable++; continue; }
  if (!dia[ID_BASE].opera) { sinBase++; continue; }   // misma criba que la línea base publicada
  porFecha.set(fecha, { spot, cierre: S, dia });
}

const dias = [...porFecha.keys()].sort();
console.log(`\n═══ ESTRUCTURA 2 · ASIMETRÍA · SPXW 0DTE · entrada ${HORA} ET · 1 contrato ═══\n`);
console.log(`Días medidos: ${dias.length}   (${dias[0]} → ${dias[dias.length - 1]})`);
console.log(`Descartados: ${sinCadena} sin cadena/cierre · ${sinSpot} sin spot a las ${HORA} · ${noArmable} con alguna variante no armable · ${sinBase} con crédito ≤ 0 en la base`);
console.log(`Variantes barridas: ${VARIANTES.length}  (${D_CALL.length}×${A_CALL.length}×${D_PUT.length}×${A_PUT.length} = ${D_CALL.length * A_CALL.length * D_PUT.length * A_PUT.length} cóndores + ${VARIANTES.length - 81} medias estructuras)`);
console.log(`Listón de Bonferroni: |t| > ${listonT(PRUEBAS)} para las ${PRUEBAS} pruebas de este script · |t| > ${listonT(PRUEBAS_FAMILIA)} para las ${PRUEBAS_FAMILIA} de la familia entera sobre estos mismos días`);

// ── RADIOGRAFÍA antes de medir nada ──
// Sólo los campos MEDIDOS. `colateral`, `anchoC` y `anchoP` son constantes por construcción en la
// base (siempre 50 puntos): la radiografía los mató —con razón, es su trabajo— porque un campo con
// dos valores no ordena nada. No son predictores, son los mandos del experimento, y se auditan
// aparte justo debajo: lo que hay que comprobar de ellos no es que varíen, es que valgan LO PEDIDO.
const filasBase = dias.map((f) => ({ fecha: f, ...porFecha.get(f).dia[ID_BASE], cierre: porFecha.get(f).cierre }));
radiografia(filasBase, ["pl", "credito", "danoCall", "danoPut", "cierre", "topePerdida"],
  "cóndor base C25/50·P25/50", { cerosLegitimos: ["danoCall", "danoPut"] });

// ── AUDITORÍA DE ANCHOS — la trampa concreta de este barrido ──
// `cerca()` elige el strike MÁS PRÓXIMO al objetivo. Si la rejilla tiene un hueco, un ala "de 20"
// puede salir de 25 o de 40, y entonces la tabla estaría comparando cosas que no son las que dice
// la etiqueta. Aquí se comprueba una por una antes de creerse ninguna cifra.
console.log(`\n── auditoría de anchos: lo pedido contra lo que salió de la rejilla de strikes ──`);
console.log("| lado | ala pedida | ala real mediana | mín | máx | % de días exacto |");
console.log("|---|---|---|---|---|---|");
let anchosMal = 0;
for (const lado of ["C", "P"]) for (const a of lado === "C" ? A_CALL : A_PUT) {
  const id = lado === "C" ? `C25/${a}·P25/50` : `C25/50·P25/${a}`;
  const w = dias.map((f) => porFecha.get(f).dia[id][lado === "C" ? "anchoC" : "anchoP"]).sort((x, y) => x - y);
  const exacto = w.filter((x) => x === a).length / w.length;
  if (exacto < 0.9) anchosMal++;
  console.log(`| ${lado === "C" ? "call" : "put"} | ${a} | ${w[w.length >> 1]} | ${w[0]} | ${w[w.length - 1]} | ${(exacto * 100).toFixed(1)}% |`);
}
if (anchosMal) console.log(`\n⚠️ ${anchosMal} ala(s) salen del ancho pedido en más del 10% de los días: la etiqueta MIENTE en esos casos.`);
else console.log(`\n  Todas las alas caen en el ancho pedido en ≥90% de los días. La etiqueta dice la verdad.`);

// ─────────────────────────────────────────────────────────────────────────────────────────
// UTILIDADES
// ─────────────────────────────────────────────────────────────────────────────────────────
const suma = (v) => v.reduce((a, b) => a + b, 0);
const media = (v) => (v.length ? suma(v) / v.length : NaN);
const pct = (v, q) => { const s = [...v].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.max(0, Math.floor(q * s.length)))]; };
const mediana = (v) => pct(v, 0.5);
const eur = (x) => (x < 0 ? "−$" : "$") + Math.round(Math.abs(x)).toLocaleString("es-ES");
const sd = (v) => { const m = media(v); return Math.sqrt(suma(v.map((x) => (x - m) ** 2)) / (v.length - 1)); };
function caidaPicoValle(pls) { let a = 0, p = 0, peor = 0; for (const x of pls) { a += x; p = Math.max(p, a); peor = Math.min(peor, a - p); } return peor; }
function caidaDesdeCero(pls) { let peor = 0, cur = 0; for (const x of pls) { cur = Math.min(0, cur + x); peor = Math.min(peor, cur); } return peor; }

function resumen(id, idx = null) {
  const ds = idx ?? dias;
  const D = ds.map((f) => porFecha.get(f).dia[id]);
  const pls = D.map((x) => x.pl);
  const total = suma(pls);
  return {
    n: pls.length, noOpera: D.filter((x) => !x.opera).length,
    total, alAno: total / (pls.length / 252), medio: media(pls),
    acierto: pls.filter((x) => x > 0).length / pls.length,
    peorDia: Math.min(...pls), p1: pct(pls, 0.01), p5: pct(pls, 0.05),
    ddPico: caidaPicoValle(pls), ddCero: caidaDesdeCero(pls),
    credito: mediana(D.map((x) => x.credito)),
    colateral: mediana(D.map((x) => x.colateral)),
    topePerdida: Math.max(...D.map((x) => x.topePerdida)),
    t: media(pls) / (sd(pls) / Math.sqrt(pls.length)),
  };
}

const R = new Map(VARIANTES.map((v) => [v.id, resumen(v.id)]));
const base = R.get(ID_BASE);

// ═════════════════════════════════════════════════════════════════════════════════════════
// PARTE 0 · LA LÍNEA BASE Y EL TOPE ARITMÉTICO
// ═════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n═══ 0 · LÍNEA BASE — y por qué el ala es un tope, no una apuesta ═══\n`);
console.log(`Base ${ID_BASE}: ${eur(base.total)} en ${base.n} días · ${eur(base.alAno)}/año · ${(base.acierto * 100).toFixed(0)}% acierto`);
console.log(`  peor día ${eur(base.peorDia)} · p1 ${eur(base.p1)} · p5 ${eur(base.p5)} · caída pico-valle ${eur(base.ddPico)} · caída desde 0 ${eur(base.ddCero)}`);
console.log(`  colateral ${eur(base.colateral)} · tope aritmético de pérdida de un día: ${eur(-base.topePerdida)}`);
console.log(`\n  El peor día observado (${eur(base.peorDia)}) es el ${((Math.abs(base.peorDia) / base.topePerdida) * 100).toFixed(0)}% del tope.`);
console.log(`  → la cola YA está pegada al tope: la única forma de bajarla es BAJAR EL TOPE, y el tope`);
console.log(`    lo pone el ala MÁS ANCHA. Estrechar sólo el ala barata no toca el peor día.`);

// ═════════════════════════════════════════════════════════════════════════════════════════
// PARTE 1 · EL BARRIDO COMPLETO — la superficie, no el ganador
// ═════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n═══ 1 · LOS ${VARIANTES.length - (VARIANTES.length - 81)} CÓNDORES ASIMÉTRICOS ═══`);
console.log(`\nOrdenados por $/año. "coste" = $/año perdidos por cada $ de caída (pico-valle) eliminada;`);
console.log(`por debajo de 0,30 el cambio se paga solo, por encima de 1,00 es mal negocio. "—" = no elimina caída.\n`);
console.log("| estructura (call d/ala · put d/ala) | $/año | % ingr. | acierto | créd.med | PEOR día | p1 | p5 | caída | colateral | $/año por $ caída | coste dd | coste peor día |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");

const condores = VARIANTES.filter((v) => v.tipo === "condor");
const filaTabla = (v) => {
  const r = R.get(v.id);
  const perdido = base.alAno - r.alAno;
  const ddElim = Math.abs(base.ddPico) - Math.abs(r.ddPico);
  const pdElim = Math.abs(base.peorDia) - Math.abs(r.peorDia);
  return {
    v, r, perdido, ddElim, pdElim,
    costeDD: ddElim > 0 ? perdido / ddElim : null,
    costePD: pdElim > 0 ? perdido / pdElim : null,
    calmar: r.alAno / Math.abs(r.ddPico),          // $/año por $ de caída — invariante de escala
  };
};
const tabla = VARIANTES.map(filaTabla);
const porId = new Map(tabla.map((x) => [x.v.id, x]));

for (const x of tabla.filter((y) => y.v.tipo === "condor").sort((a, b) => b.r.alAno - a.r.alAno)) {
  const r = x.r;
  console.log(`| ${x.v.id} | ${eur(r.alAno)} | ${((r.alAno / base.alAno) * 100).toFixed(0)}% | ${(r.acierto * 100).toFixed(0)}% | ${eur(r.credito)} | ${eur(r.peorDia)} | ${eur(r.p1)} | ${eur(r.p5)} | ${eur(r.ddPico)} | ${eur(r.colateral)} | ${x.calmar.toFixed(2)} | ${x.costeDD == null ? "—" : x.costeDD.toFixed(2)} | ${x.costePD == null ? "—" : x.costePD.toFixed(2)} |`);
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// PARTE 2 · LAS MEDIAS ESTRUCTURAS
// ═════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n═══ 2 · MEDIAS ESTRUCTURAS — una sola vertical ═══\n`);
console.log("| estructura | $/año | % ingr. | acierto | créd.med | PEOR día | p1 | p5 | caída | colateral | $/año por $ caída | coste dd |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const x of tabla.filter((y) => y.v.tipo === "media").sort((a, b) => b.r.alAno - a.r.alAno)) {
  const r = x.r;
  console.log(`| ${x.v.id} | ${eur(r.alAno)} | ${((r.alAno / base.alAno) * 100).toFixed(0)}% | ${(r.acierto * 100).toFixed(0)}% | ${eur(r.credito)} | ${eur(r.peorDia)} | ${eur(r.p1)} | ${eur(r.p5)} | ${eur(r.ddPico)} | ${eur(r.colateral)} | ${x.calmar.toFixed(2)} | ${x.costeDD == null ? "—" : x.costeDD.toFixed(2)} |`);
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// PARTE 3 · ¿IMPORTA DE QUÉ LADO SE ESTRECHA EL ALA? — el par simétrico
// Se compara, a igual distancia de los cortos, estrechar el ala de la CALL contra estrechar
// la de la PUT. Si el mercado "no cae como sube", los dos no pueden dar lo mismo.
// ═════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n═══ 3 · ¿DE QUÉ LADO SE ESTRECHA? — pares espejo, misma distancia, alas cruzadas ═══\n`);
console.log("| distancias | ala estrecha en CALL | ala estrecha en PUT | quién gana en $/año | quién gana en peor día | quién gana en caída |");
console.log("|---|---|---|---|---|---|");
for (const d of [20, 25, 35]) for (const aEstrecha of [20, 30]) {
  const dP = d === 20 ? 25 : d;                       // dP sólo existe en {25,35,50}
  const idC = `C${d}/${aEstrecha}·P${dP}/50`, idP = `C${d}/50·P${dP}/${aEstrecha}`;
  if (!R.has(idC) || !R.has(idP)) continue;
  const a = R.get(idC), b = R.get(idP);
  console.log(`| corta call +${d} / put −${dP}, ala estrecha ${aEstrecha} | ${eur(a.alAno)}/año, peor ${eur(a.peorDia)}, caída ${eur(a.ddPico)} | ${eur(b.alAno)}/año, peor ${eur(b.peorDia)}, caída ${eur(b.ddPico)} | ${a.alAno > b.alAno ? "estrechar CALL" : "estrechar PUT"} | ${a.peorDia > b.peorDia ? "estrechar CALL" : "estrechar PUT"} | ${Math.abs(a.ddPico) < Math.abs(b.ddPico) ? "estrechar CALL" : "estrechar PUT"} |`);
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// PARTE 4 · A IGUAL DOLOR — lo que de verdad puede permitirse
// El colateral sale del poder de compra ($73.874, sobra). LAS PÉRDIDAS SALEN DE EFECTIVO, y hay
// $7.977. Así que la restricción real no es el colateral: es la CAÍDA. Se escala cada estructura
// al número de contratos cuya peor racha cabe en $7.977 y se mira quién gana más dinero.
// ═════════════════════════════════════════════════════════════════════════════════════════
const EFECTIVO = 7977;
console.log(`\n\n═══ 4 · A IGUAL DOLOR — contratos que caben en los ${eur(EFECTIVO)} de efectivo ═══\n`);
console.log(`(la caída se paga en EFECTIVO, no en poder de compra: por eso el listón es la caída, no el colateral)\n`);
console.log("| estructura | caída 1 contrato | contratos que caben | colateral total | $/año a ese tamaño | peor día a ese tamaño |");
console.log("|---|---|---|---|---|---|");
const aIgualDolor = tabla.map((x) => {
  const nCon = Math.floor(EFECTIVO / Math.abs(x.r.ddPico));
  return { ...x, nCon, alAnoEsc: x.r.alAno * nCon, peorEsc: x.r.peorDia * nCon, colTotal: x.r.colateral * nCon };
}).filter((x) => x.nCon >= 1).sort((a, b) => b.alAnoEsc - a.alAnoEsc);
for (const x of aIgualDolor.slice(0, 15)) {
  console.log(`| ${x.v.id} | ${eur(x.r.ddPico)} | ${x.nCon} | ${eur(x.colTotal)} | ${eur(x.alAnoEsc)} | ${eur(x.peorEsc)} |`);
}
console.log(`\n  base ${ID_BASE}: ${Math.floor(EFECTIVO / Math.abs(base.ddPico))} contratos · ${eur(base.alAno * Math.floor(EFECTIVO / Math.abs(base.ddPico)))}/año`);

// ═════════════════════════════════════════════════════════════════════════════════════════
// PARTE 5 · LOS TRES TERCIOS — ¿la mejora de cola aguanta, o vive en un tramo?
// ═════════════════════════════════════════════════════════════════════════════════════════
const k = Math.floor(dias.length / 3);
const TERCIOS = [0, 1, 2].map((i) => (i < 2 ? dias.slice(i * k, (i + 1) * k) : dias.slice(2 * k)));

// Candidatos: los que eliminan caída Y retienen ≥60% del ingreso, más los que más ingreso dan.
const CAND = [...new Set([
  ID_BASE,
  ...tabla.filter((x) => x.ddElim > 0 && x.r.alAno >= 0.6 * base.alAno).sort((a, b) => a.costeDD - b.costeDD).slice(0, 6).map((x) => x.v.id),
  ...tabla.filter((x) => x.v.tipo === "condor").sort((a, b) => b.calmar - a.calmar).slice(0, 4).map((x) => x.v.id),
  ...aIgualDolor.slice(0, 3).map((x) => x.v.id),
])];

console.log(`\n\n═══ 5 · LOS TRES TERCIOS — ${CAND.length} candidatas ═══\n`);
console.log(`tercios: ${TERCIOS.map((t) => `${t[0]}→${t[t.length - 1]} (${t.length}d)`).join(" · ")}\n`);
console.log("| estructura | $/año T1 | T2 | T3 | peor día T1 | T2 | T3 | caída T1 | T2 | T3 | signo vs base (caída) |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|");
const tercios = {};
for (const id of CAND) {
  const rs = TERCIOS.map((t) => resumen(id, t));
  const bs = TERCIOS.map((t) => resumen(ID_BASE, t));
  const signo = rs.map((r, i) => (Math.abs(r.ddPico) < Math.abs(bs[i].ddPico) ? "+" : "−")).join("");
  tercios[id] = { alAno: rs.map((r) => r.alAno), peorDia: rs.map((r) => r.peorDia), ddPico: rs.map((r) => r.ddPico), signo };
  console.log(`| ${id} | ${rs.map((r) => eur(r.alAno)).join(" | ")} | ${rs.map((r) => eur(r.peorDia)).join(" | ")} | ${rs.map((r) => eur(r.ddPico)).join(" | ")} | ${id === ID_BASE ? "—" : signo} |`);
}
console.log(`\n(+ = caída MENOR que la base en ese tercio. Se exige "+++": tres de tres.)`);

// ═════════════════════════════════════════════════════════════════════════════════════════
// PARTE 6 · BOOTSTRAP POR BLOQUES — ¿o es suerte de este orden de días?
// Bloques de 10 días porque la volatilidad viene en rachas. Mismo orden de bloques en las dos
// series: la comparación es pareada.
// ═════════════════════════════════════════════════════════════════════════════════════════
function bootstrapPareado(A, B, iter = 4000, bloque = 10) {
  const n = A.length, nb = Math.ceil(n / bloque);
  let mejorDD = 0, mejorPeor = 0, mejorTotal = 0; const ddA = [], ddB = [];
  for (let it = 0; it < iter; it++) {
    const ia = [], ib = [];
    for (let b = 0; b < nb; b++) {
      const ini = Math.floor(Math.random() * n);
      for (let j = 0; j < bloque && ia.length < n; j++) { const i = (ini + j) % n; ia.push(A[i]); ib.push(B[i]); }
    }
    const dA = caidaPicoValle(ia), dB = caidaPicoValle(ib);
    ddA.push(dA); ddB.push(dB);
    if (Math.abs(dB) < Math.abs(dA)) mejorDD++;
    if (Math.min(...ib) > Math.min(...ia)) mejorPeor++;
    if (suma(ib) > suma(ia)) mejorTotal++;
  }
  return { pMejorDD: mejorDD / iter, pMejorPeor: mejorPeor / iter, pMejorTotal: mejorTotal / iter, ddMedioA: media(ddA), ddMedioB: media(ddB), ddP95A: pct(ddA, 0.05), ddP95B: pct(ddB, 0.05) };
}
console.log(`\n\n═══ 6 · BOOTSTRAP POR BLOQUES (4.000 remuestreos de bloques de 10 días, pareado contra la base) ═══\n`);
console.log("| estructura | P(caída menor) | P(peor día menos malo) | P(gana más dinero) | caída media base → variante | caída al 5% peor: base → variante |");
console.log("|---|---|---|---|---|---|");
const plsBase = dias.map((f) => porFecha.get(f).dia[ID_BASE].pl);
const boot = {};
for (const id of CAND) {
  if (id === ID_BASE) continue;
  const b = bootstrapPareado(plsBase, dias.map((f) => porFecha.get(f).dia[id].pl));
  boot[id] = b;
  console.log(`| ${id} | ${(b.pMejorDD * 100).toFixed(0)}% | ${(b.pMejorPeor * 100).toFixed(0)}% | ${(b.pMejorTotal * 100).toFixed(0)}% | ${eur(b.ddMedioA)} → ${eur(b.ddMedioB)} | ${eur(b.ddP95A)} → ${eur(b.ddP95B)} |`);
}

// ═════════════════════════════════════════════════════════════════════════════════════════
// VEREDICTO
// ═════════════════════════════════════════════════════════════════════════════════════════
console.log(`\n\n═══ VEREDICTO — quién corta cola de verdad y conserva ingreso ═══\n`);
const sobreviven = CAND.filter((id) => id !== ID_BASE)
  .map((id) => ({ id, x: porId.get(id), t3: tercios[id], b: boot[id] }))
  .filter((o) => o.x.ddElim > 0 && o.t3.signo === "+++" && o.b.pMejorDD >= 0.75)
  .sort((a, b) => a.x.costeDD - b.x.costeDD);
if (!sobreviven.length) {
  console.log("  NINGUNA candidata pasa las tres cribas a la vez (elimina caída · +++ en tercios · P(caída menor) ≥ 75%).");
} else {
  for (const o of sobreviven) {
    console.log(`  ${o.id}  coste ${o.x.costeDD.toFixed(2)} $/año por $ de caída · retiene ${((o.x.r.alAno / base.alAno) * 100).toFixed(0)}% del ingreso (${eur(o.x.r.alAno)}/año)`);
    console.log(`     caída ${eur(base.ddPico)} → ${eur(o.x.r.ddPico)} · peor día ${eur(base.peorDia)} → ${eur(o.x.r.peorDia)} · tercios ${o.t3.signo} · P(caída menor)=${(o.b.pMejorDD * 100).toFixed(0)}% · colateral ${eur(o.x.r.colateral)}`);
  }
}

writeFileSync("scripts/estructura2-asimetria.json", JSON.stringify({
  dias: dias.length, periodo: [dias[0], dias[dias.length - 1]],
  pruebas: PRUEBAS, pruebasFamilia: PRUEBAS_FAMILIA, listonT: listonT(PRUEBAS_FAMILIA),
  base: { id: ID_BASE, ...base },
  variantes: Object.fromEntries(tabla.map((x) => [x.v.id, { ...x.v, ...x.r, costeDD: x.costeDD, costePD: x.costePD, calmar: x.calmar }])),
  aIgualDolor: aIgualDolor.slice(0, 20).map((x) => ({ id: x.v.id, nCon: x.nCon, alAnoEsc: x.alAnoEsc, peorEsc: x.peorEsc, colTotal: x.colTotal })),
  tercios, boot,
  sobreviven: sobreviven.map((o) => o.id),
}, null, 2));
console.log(`\n(detalle en scripts/estructura2-asimetria.json)`);
