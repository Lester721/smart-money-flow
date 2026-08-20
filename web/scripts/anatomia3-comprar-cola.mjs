// ANATOMÍA 3 · ESTRUCTURA 3 — COMPRAR LA COLA
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/anatomia3-comprar-cola.mjs
//
// ═══ QUÉ ES Y EN QUÉ SE DIFERENCIA DE LO YA MEDIDO ════════════════════════════════════════════
// Los 17 filtros de régimen y las 30 reglas de gestión decidían SI SE OPERA o CUÁNDO SE SALE.
// Todos fallaron. Esto no decide nada: **paga por adelantado**. Al cóndor de siempre (short a
// ±25, alas a ±75) se le añade una pata larga MÁS LEJOS, que sólo cobra el día del desastre.
//
//   · put comprada a  −75 / −100 / −150 / −200 puntos del dinero  (se paga el ASK)
//   · call comprada a +75 / +100 / +150 / +200 puntos del dinero  (se paga el ASK)
//   · y las dos a la vez
//
// A 75 puntos el strike CAE ENCIMA DEL ALA (short 25 + ancho 50 = 75): comprar ahí es DUPLICAR
// el ala, y por debajo de ella la posición deja de ser plana y empieza a ganar. Se dice aquí
// porque no es un detalle: a 75 no se compra "más lejos que el ala", se compra EN el ala.
//
// ═══ REGLAS QUE SE CUMPLEN ════════════════════════════════════════════════════════════════════
// 1. NADA DE FUTURO. Todo se decide con la cadena de las 11:00. La única señal condicional que se
//    usa (fin de mes) es de calendario: se sabe el día anterior.
// 2. PRECIOS REALES. La pata larga se paga a su ASK de las 11:00, la del fichero, sin modelo.
//    Comisión $0,03 por pata añadida.
// 3. SI UN DATO NO EXISTE SE DICE. Un ask de 0,00 en la cola NO se rellena con 0,05: ese día se
//    cuenta aparte y se informa.
// 4. radiografia() sobre las filas ANTES de medir.
// 5. PRUEBAS DECLARADAS: 24 (ver LISTA_PRUEBAS). El listón se calcula con 24 para esta familia y
//    con 204 para el proyecto entero (las 180 ya declaradas en anatomia3-reglas.mjs + estas 24).
//
// ═══ EL LISTÓN QUE HAY QUE BATIR ══════════════════════════════════════════════════════════════
// Bajar el TAMAÑO reduce el ingreso y la caída en la misma proporción, sin hipótesis ninguna:
//     $18.696/año ÷ $15.176 de racha = $1,232 de ingreso perdido por cada $1 de caída quitado.
// Una estructura sólo merece la pena si su coste por dólar de caída es MENOR que 1,232.

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";
import { radiografia } from "../lib/radiografia";
import { cargar, resumen, drawdown, media, sd, pct, eur } from "./anatomia3-lib.mjs";

const DIR = "scripts/cache-theta/gex-2026";
const CACHE = "scripts/anatomia3-cola-filas.json";
const HORA = "11:00", SEP = 25, ALA = 50, COMM = 0.03;
const DIST = [75, 100, 150, 200];
const SORTEOS = 5000;

const PRUEBAS = 24;
const LISTA_PRUEBAS = [
  " 1-4.  put comprada a 75/100/150/200, todos los días",
  " 5-8.  call comprada a 75/100/150/200, todos los días",
  " 9-12. put + call a 75/100/150/200, todos los días",
  "13-16. put comprada a 75/100/150/200, SÓLO el último día del mes",
  "17-20. put + call a 75/100/150/200, SÓLO el último día del mes",
  "21.    DOS puts a la mejor distancia, todos los días",
  "22.    put a la mejor distancia sólo los días de movMañana bajo (R1)",
  "23-24. margen: reservadas para el barrido que dio la mejor distancia",
];
const LISTON = listonT(PRUEBAS);
const LISTON_PROY = listonT(204);

const pcts = (x) => (x * 100).toFixed(1) + "%";
const cvar = (pl, q = 0.05) => { const p = [...pl].sort((a, b) => a - b); return media(p.slice(0, Math.max(1, Math.floor(p.length * q)))); };
const suma20 = (pl) => [...pl].sort((a, b) => a - b).slice(0, 20).reduce((a, b) => a + b, 0);

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 1. LECTOR DE CADENAS — copiado de scripts/desde-2024.mjs, no reinventado.
// ══════════════════════════════════════════════════════════════════════════════════════════════
function leerDia(fecha, right) {
  const f = `${DIR}/iv_${fecha}_${right}.csv`;
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const [iK, iT, iB, iA, iU] = ["strike", "timestamp", "bid", "ask", "underlying_price"].map((c) => cab.indexOf(c));
  if ([iK, iT, iB, iA, iU].some((x) => x < 0)) throw new Error(`${f}: faltan columnas`);
  const enHora = []; let spotFin = 0, hFin = "";
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(","), hora = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0 && hora >= hFin) { hFin = hora; spotFin = sp; }
    if (hora !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]);
    // OJO: aquí NO se filtra por ask>0 como en desde-2024.mjs. En la cola el ask puede venir a
    // 0,00 (sin cotización) y eso hay que CONTARLO, no esconderlo detrás de un filtro.
    if (K > 0) enHora.push({ K, bid, ask, spot: sp });
  }
  return enHora.length ? { filas: enHora, cierre: spotFin } : null;
}
const cerca = (fs, o) => fs.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 2. CONSTRUIR LAS FILAS (con caché) — cóndor base + precio real de cada pata de cola
// ══════════════════════════════════════════════════════════════════════════════════════════════
function construir() {
  const fechas = [...new Set(readdirSync(DIR).map((f) => f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/)?.[1]).filter(Boolean))].sort();
  const out = [], problemas = [];
  let hecho = 0;
  for (const fecha of fechas) {
    const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
    if (!C || !P || !(C.cierre > 0)) { problemas.push({ fecha, que: "sin cadena o sin cierre" }); continue; }
    const conSpot = C.filas.filter((r) => r.spot > 0);
    if (!conSpot.length) { problemas.push({ fecha, que: "ninguna fila de las 11:00 trae underlying_price" }); continue; }
    const spot = conSpot[0].spot;

    // — el cóndor de siempre: se exige ask>0 en las patas que se compran, como en desde-2024 —
    const vend = (fs, o) => cerca(fs.filter((r) => r.bid >= 0), o);
    const comp = (fs, o) => cerca(fs.filter((r) => r.ask > 0), o);
    const cC = vend(C.filas, spot + SEP), pC = vend(P.filas, spot - SEP);
    const cL = comp(C.filas, cC.K + ALA), pL = comp(P.filas, pC.K - ALA);
    if (cL.K <= cC.K || pL.K >= pC.K) { problemas.push({ fecha, que: "alas mal ordenadas" }); continue; }
    const cred = cC.bid + pC.bid - cL.ask - pL.ask;
    if (!(cred > 0)) { problemas.push({ fecha, que: "crédito no positivo" }); continue; }
    const S = C.cierre;
    const pl = (cred - Math.min(Math.max(S - cC.K, 0), cL.K - cC.K)
                     - Math.min(Math.max(pC.K - S, 0), pC.K - pL.K)) * 100 - 8 * COMM;

    // — las patas de COLA: el strike más cercano a la distancia pedida, con su ASK real —
    const fila = { fecha, spot, cierre: S, cred, pl, Kc: cC.K, KcL: cL.K, Kp: pC.K, KpL: pL.K, mov: S - spot };
    for (const D of DIST) {
      const tp = cerca(P.filas, spot - D), tc = cerca(C.filas, spot + D);
      fila[`KpT${D}`] = tp.K; fila[`askP${D}`] = tp.ask; fila[`bidP${D}`] = tp.bid;
      fila[`KcT${D}`] = tc.K; fila[`askC${D}`] = tc.ask; fila[`bidC${D}`] = tc.bid;
    }
    out.push(fila);
    if (++hecho % 100 === 0) process.stdout.write(`  ...${hecho} días leídos\r`);
  }
  return { out, problemas };
}

let FILAS, PROBLEMAS;
if (existsSync(CACHE)) {
  const c = JSON.parse(readFileSync(CACHE, "utf8"));
  FILAS = c.filas; PROBLEMAS = c.problemas;
  console.log(`  (filas leídas de la caché ${CACHE}: ${FILAS.length} días)`);
} else {
  console.log("  leyendo 653×2 ficheros de cadena (~3,4 GB)... esto tarda unos minutos");
  const r = construir();
  FILAS = r.out; PROBLEMAS = r.problemas;
  writeFileSync(CACHE, JSON.stringify({ filas: FILAS, problemas: PROBLEMAS }));
  console.log(`\n  construidas ${FILAS.length} filas → ${CACHE}`);
}
FILAS.sort((a, b) => a.fecha.localeCompare(b.fecha));

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 3. VERIFICACIÓN — ¿mi lector reproduce el P&L que ya estaba calculado?
// ══════════════════════════════════════════════════════════════════════════════════════════════
const { filas: SEN } = cargar();                       // filas con señales (finMes, movManana…)
const senPorFecha = new Map(SEN.map((f) => [f.fecha, f]));
let desc = 0, peorDesc = 0;
for (const f of FILAS) {
  const s = senPorFecha.get(f.fecha);
  if (!s) { desc++; continue; }
  const d = Math.abs(f.pl - s.pl);
  if (d > 0.02) { desc++; peorDesc = Math.max(peorDesc, d); }
}
console.log("\n" + "═".repeat(104));
console.log("  VERIFICACIÓN CONTRA scripts/regimen-filas.json");
console.log("═".repeat(104));
console.log(`  días reconstruidos: ${FILAS.length} · días en la caché vieja: ${SEN.length}`);
console.log(`  días donde el P&L base NO coincide: ${desc} (mayor discrepancia $${peorDesc.toFixed(2)})`);
if (PROBLEMAS.length) {
  console.log(`  días descartados al construir: ${PROBLEMAS.length}`);
  for (const p of PROBLEMAS.slice(0, 10)) console.log(`     ${p.fecha}: ${p.que}`);
}
if (desc > FILAS.length * 0.02) throw new Error(`${desc} días no cuadran con regimen-filas.json — no se mide con esto`);

// ── ASKS QUE NO EXISTEN — se cuentan, no se rellenan ──
console.log("\n  COTIZACIONES DE LA COLA QUE NO EXISTEN (ask = 0,00 a las 11:00):");
const sinCotiz = {};
for (const D of DIST) for (const lado of ["P", "C"]) {
  const n = FILAS.filter((f) => !(f[`ask${lado}${D}`] > 0)).length;
  sinCotiz[`${lado}${D}`] = n;
  console.log(`     ${lado === "P" ? "put " : "call"} a ${String(D).padStart(3)} pts: ${n} de ${FILAS.length} días sin ask`);
}

// ── ¿el strike de la cola cae donde se pidió? ──
console.log("\n  DISTANCIA REAL DEL STRIKE ENCONTRADO (el grid no siempre tiene el punto exacto):");
for (const D of DIST) {
  const dp = FILAS.map((f) => Math.abs(f.spot - f[`KpT${D}`]));
  const dc = FILAS.map((f) => Math.abs(f[`KcT${D}`] - f.spot));
  const igualAla = FILAS.filter((f) => f[`KpT${D}`] === f.KpL).length;
  console.log(`     ${String(D).padStart(3)} pts → put: mediana ${pct(dp, 0.5).toFixed(1)} pts (p95 ${pct(dp, 0.95).toFixed(1)}) · call: mediana ${pct(dc, 0.5).toFixed(1)} pts (p95 ${pct(dc, 0.95).toFixed(1)}) · coincide con el ala en ${igualAla} días`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 4. RADIOGRAFÍA — antes de medir nada
// ══════════════════════════════════════════════════════════════════════════════════════════════
radiografia(FILAS, ["pl", "cred", "mov", "spot", "askP75", "askP100", "askP150", "askP200",
                    "askC75", "askC100", "askC150", "askC200"], "cóndor + patas de cola");

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 5. LAS VARIANTES
// ══════════════════════════════════════════════════════════════════════════════════════════════
const ANOS = FILAS.length / 251;
const BASE = resumen(FILAS, ANOS);
const PL0 = FILAS.map((f) => f.pl);

/** P&L del día con las patas de cola indicadas. `nP`/`nC` = cuántos contratos de cada una. */
function plCon(f, D, nP, nC, compra = true) {
  let p = f.pl;
  if (!compra) return p;
  const S = f.cierre;
  if (nP) {
    if (!(f[`askP${D}`] > 0)) return null;               // sin cotización: el día NO se inventa
    p += nP * (Math.max(f[`KpT${D}`] - S, 0) * 100 - f[`askP${D}`] * 100 - COMM);
  }
  if (nC) {
    if (!(f[`askC${D}`] > 0)) return null;
    p += nC * (Math.max(S - f[`KcT${D}`], 0) * 100 - f[`askC${D}`] * 100 - COMM);
  }
  return p;
}

/** Serie de P&L de una variante. `cuando` decide en qué días SE COMPRA el seguro. */
function serie(D, nP, nC, cuando = () => true) {
  const pl = [], sinDato = [];
  let costeTotal = 0, pagoTotal = 0, diasCompra = 0;
  for (const f of FILAS) {
    const compra = cuando(f);
    const v = plCon(f, D, nP, nC, compra);
    if (v == null) { sinDato.push(f.fecha); pl.push(f.pl); continue; }   // sin ask: ese día no se compra
    if (compra) {
      diasCompra++;
      costeTotal += (nP ? nP * (f[`askP${D}`] * 100 + COMM) : 0) + (nC ? nC * (f[`askC${D}`] * 100 + COMM) : 0);
      pagoTotal += (nP ? nP * Math.max(f[`KpT${D}`] - f.cierre, 0) * 100 : 0) + (nC ? nC * Math.max(f.cierre - f[`KcT${D}`], 0) * 100 : 0);
    }
    pl.push(v);
  }
  return { pl, sinDato, costeTotal, pagoTotal, diasCompra };
}

/** t pareado de la diferencia diaria contra la base. */
function tPareado(pl) {
  const d = pl.map((x, i) => x - PL0[i]);
  const m = media(d), s = sd(d);
  return s > 0 ? m / (s / Math.sqrt(d.length)) : 0;
}

/** ¿La mejora de racha aguanta si el mismo conjunto de días viene en otro orden? */
function robustezDD(pl) {
  const idx = FILAS.map((_, i) => i);
  let mejorBase = 0;
  for (let s = 0; s < 1000; s++) {
    for (let i = idx.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; const t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
    const a = drawdown(idx.map((i) => PL0[i])), b = drawdown(idx.map((i) => pl[i]));
    if (b > a) mejorBase++;                       // > porque el dd es negativo: menos profundo = mejor
  }
  return mejorBase / 1000;
}

function evaluar(nom, desc2, D, nP, nC, cuando) {
  const { pl, sinDato, costeTotal, pagoTotal, diasCompra } = serie(D, nP, nC, cuando);
  const fs = pl.map((p, i) => ({ ...FILAS[i], pl: p }));
  const r = resumen(fs, ANOS);
  const ddElim = r.dd - BASE.dd;                      // >0 = racha menos profunda
  const peorElim = r.peor - BASE.peor;                // >0 = peor día menos malo
  const ingresoPerdido = BASE.alAno - r.alAno;
  const coste = ddElim > 0 ? ingresoPerdido / ddElim : null;
  const costePeor = peorElim > 0 ? ingresoPerdido / peorElim : null;

  // tercios de tiempo
  const k = Math.floor(FILAS.length / 3), terc = [];
  for (let i = 0; i < 3; i++) {
    const a = i * k, b = i < 2 ? (i + 1) * k : FILAS.length;
    const p0 = PL0.slice(a, b), p1 = pl.slice(a, b);
    terc.push({
      periodo: `${FILAS[a].fecha}→${FILAS[b - 1].fecha}`,
      ddElim: drawdown(p1) - drawdown(p0),
      peorElim: Math.min(...p1) - Math.min(...p0),
      neto: p1.reduce((x, y) => x + y, 0) - p0.reduce((x, y) => x + y, 0),
    });
  }
  const signoDD = terc.map((t) => (t.ddElim > 1 ? "+" : t.ddElim < -1 ? "−" : "0")).join("");
  const signoPeor = terc.map((t) => (t.peorElim > 1 ? "+" : t.peorElim < -1 ? "−" : "0")).join("");

  return {
    nom, desc: desc2, D, nP, nC, diasCompra, sinDato: sinDato.length,
    n: r.n, alAno: r.alAno, retenido: r.alAno / BASE.alAno, media: r.media, acierto: r.acierto,
    peor: r.peor, p1: r.p1, p5: r.p5, cvar5: cvar(pl), suma20: suma20(pl), dd: r.dd,
    ddElim, peorElim, ingresoPerdido, coste, costePeor,
    costeSeguroAno: costeTotal / ANOS, pagoSeguroAno: pagoTotal / ANOS, netoSeguroAno: (pagoTotal - costeTotal) / ANOS,
    t: tPareado(pl), signoDD, signoPeor, terc, pl,
  };
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 6. CABECERA
// ══════════════════════════════════════════════════════════════════════════════════════════════
const LISTON_TAMANO = BASE.alAno / -BASE.dd;
console.log("\n" + "═".repeat(104));
console.log(`  LÍNEA BASE · ${BASE.n} días · ${ANOS.toFixed(2)} años · ${eur(BASE.alAno)}/año · media ${eur(BASE.media)}/op · acierto ${pcts(BASE.acierto)}`);
console.log(`  PEOR DÍA ${eur(BASE.peor)} · p1 ${eur(BASE.p1)} · p5 ${eur(BASE.p5)} · CVaR5 ${eur(cvar(PL0))} · PEOR RACHA ${eur(BASE.dd)}`);
console.log(`  Listón de tamaño: $${LISTON_TAMANO.toFixed(3)} de ingreso perdido por cada $1 de caída quitada. HAY QUE BAJAR DE AHÍ.`);
console.log(`  Listón |t|: ${LISTON} (${PRUEBAS} pruebas de esta familia) · ${LISTON_PROY} (204 del proyecto entero)`);
console.log("═".repeat(104));
console.log("\n  PRUEBAS DECLARADAS:");
for (const l of LISTA_PRUEBAS) console.log("    " + l);

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 7. BARRIDO A — COMPRAR TODOS LOS DÍAS
// ══════════════════════════════════════════════════════════════════════════════════════════════
const RES = [];
console.log("\n" + "═".repeat(104));
console.log("  A · COMPRAR LA COLA TODOS LOS DÍAS");
console.log("═".repeat(104));
console.log("| variante | cuesta/año | paga/año | neto/año | $/año | % retenido | peor día | p1 | p5 | CVaR5 | peor racha | coste $/$dd |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const [lado, nP, nC] of [["put", 1, 0], ["call", 0, 1], ["put+call", 1, 1]]) {
  for (const D of DIST) {
    const r = evaluar(`${lado}@${D}`, `${lado} comprada a ${D} pts, todos los días`, D, nP, nC);
    RES.push(r);
    console.log(`| ${r.nom} | ${eur(r.costeSeguroAno)} | ${eur(r.pagoSeguroAno)} | ${eur(r.netoSeguroAno)} | ${eur(r.alAno)} | ${pcts(r.retenido)} | ${eur(r.peor)} | ${eur(r.p1)} | ${eur(r.p5)} | ${eur(r.cvar5)} | ${eur(r.dd)} | ${r.coste != null ? "$" + r.coste.toFixed(2) : "no reduce"} |`);
  }
}

console.log("\n  DETALLE — ¿aguanta en los tres tercios? ¿y el orden de los días?");
for (const r of RES) {
  console.log(`\n  ── ${r.nom} · ${r.desc}`);
  console.log(`     peor día ${eur(BASE.peor)} → ${eur(r.peor)} (quita ${eur(r.peorElim)}) · peor racha ${eur(BASE.dd)} → ${eur(r.dd)} (quita ${eur(r.ddElim)})`);
  console.log(`     ingreso ${eur(BASE.alAno)}/año → ${eur(r.alAno)}/año (pierde ${eur(r.ingresoPerdido)}/año) · t pareado ${r.t.toFixed(2)}`);
  console.log(`     coste por $ de racha ${r.coste != null ? "$" + r.coste.toFixed(2) : "—"} · por $ de peor día ${r.costePeor != null ? "$" + r.costePeor.toFixed(2) : "—"} · listón de tamaño $${LISTON_TAMANO.toFixed(3)}`);
  console.log(`     signo por tercios — racha ${r.signoDD} · peor día ${r.signoPeor}`);
  for (const t of r.terc) console.log(`        ${t.periodo}  racha ${eur(t.ddElim)}  peor día ${eur(t.peorElim)}  neto del seguro ${eur(t.neto)}`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 8. BARRIDO B — COMPRAR SÓLO LOS DÍAS QUE UN PREDICTOR MARCA
// ══════════════════════════════════════════════════════════════════════════════════════════════
// De la fase anterior sólo sobrevivió UNO: el último día de negociación del mes (n=31, t=2,41,
// mismo signo en los tres tercios). R1 (movMañana bajo) NO sobrevivió —signos +−+— y se mide
// aquí sólo como control negativo, dicho en claro.
const finMes = (f) => senPorFecha.get(f.fecha)?.finMes === 1;
const UMBRAL_R1 = (() => { const o = [...SEN].sort((a, b) => a.movManana - b.movManana); return o[Math.floor(o.length / 3)].movManana; })();
const r1 = (f) => (senPorFecha.get(f.fecha)?.movManana ?? 0) < UMBRAL_R1;

console.log("\n" + "═".repeat(104));
console.log("  B · COMPRAR LA COLA SÓLO LOS DÍAS PELIGROSOS");
console.log(`      · fin de mes: ${FILAS.filter(finMes).length} días — ÚNICO predictor que sobrevivió la fase anterior`);
console.log(`      · R1 (movMañana < ${UMBRAL_R1.toFixed(3)}%): ${FILAS.filter(r1).length} días — NO sobrevivió (signos +−+), va como control`);
console.log("═".repeat(104));
console.log("| variante | días compra | cuesta/año | paga/año | $/año | % retenido | peor día | CVaR5 | peor racha | coste $/$dd |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
const RESB = [];
for (const [etq, cuando] of [["finMes", finMes], ["R1", r1]]) {
  for (const [lado, nP, nC] of [["put", 1, 0], ["put+call", 1, 1]]) {
    for (const D of DIST) {
      if (etq === "R1" && lado === "put+call") continue;               // el control va sólo con put
      const r = evaluar(`${lado}@${D}·${etq}`, `${lado} a ${D} pts sólo en ${etq}`, D, nP, nC, cuando);
      RESB.push(r);
      console.log(`| ${r.nom} | ${r.diasCompra} | ${eur(r.costeSeguroAno)} | ${eur(r.pagoSeguroAno)} | ${eur(r.alAno)} | ${pcts(r.retenido)} | ${eur(r.peor)} | ${eur(r.cvar5)} | ${eur(r.dd)} | ${r.coste != null ? "$" + r.coste.toFixed(2) : "no reduce"} |`);
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 9. DOBLAR LA COLA a la mejor distancia
// ══════════════════════════════════════════════════════════════════════════════════════════════
const mejorA = RES.filter((r) => r.coste != null).sort((a, b) => a.coste - b.coste)[0];
console.log("\n" + "═".repeat(104));
console.log(`  C · DOBLAR LA PATA — la mejor del barrido A por coste fue ${mejorA ? mejorA.nom : "ninguna"}`);
console.log("═".repeat(104));
const RESC = [];
if (mejorA) {
  for (const n of [2, 3]) {
    const r = evaluar(`${mejorA.nP ? "put" : "call"}×${n}@${mejorA.D}`, `${n} contratos a ${mejorA.D} pts`, mejorA.D, mejorA.nP * n, mejorA.nC * n);
    RESC.push(r);
    console.log(`  ${r.nom}: cuesta ${eur(r.costeSeguroAno)}/año · paga ${eur(r.pagoSeguroAno)}/año · ${eur(r.alAno)}/año (${pcts(r.retenido)}) · peor día ${eur(r.peor)} · racha ${eur(r.dd)} · coste $/$dd ${r.coste != null ? "$" + r.coste.toFixed(2) : "—"}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 10. CONTROL DE AZAR para la versión condicional: comprar 31 días AL AZAR
// ══════════════════════════════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(104));
console.log("  D · CONTROL DE AZAR — comprar el seguro los MISMOS días pero elegidos al azar");
console.log("═".repeat(104));
const controles = [];
for (const r of RESB.filter((x) => x.nom.includes("finMes"))) {
  const nDias = r.diasCompra;
  let mejorPeor = 0, mejorDD = 0, mejorAlAno = 0;
  for (let s = 0; s < SORTEOS; s++) {
    const idx = new Set();
    while (idx.size < nDias) idx.add((Math.random() * FILAS.length) | 0);
    const pl = FILAS.map((f, i) => { const v = plCon(f, r.D, r.nP, r.nC, idx.has(i)); return v == null ? f.pl : v; });
    if (Math.min(...pl) >= r.peor) mejorPeor++;
    if (drawdown(pl) >= r.dd) mejorDD++;
    if (pl.reduce((a, b) => a + b, 0) / ANOS >= r.alAno) mejorAlAno++;
  }
  controles.push({ nom: r.nom, pPeor: mejorPeor / SORTEOS, pDD: mejorDD / SORTEOS, pAlAno: mejorAlAno / SORTEOS });
  console.log(`  ${r.nom}: el azar iguala el peor día el ${pcts(mejorPeor / SORTEOS)} de ${SORTEOS} sorteos · la racha el ${pcts(mejorDD / SORTEOS)} · el ingreso el ${pcts(mejorAlAno / SORTEOS)}`);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// 11. VEREDICTO
// ══════════════════════════════════════════════════════════════════════════════════════════════
const TODO = [...RES, ...RESB, ...RESC];
const baten = TODO.filter((r) => r.coste != null && r.coste < LISTON_TAMANO && r.ddElim > 0);
console.log("\n" + "═".repeat(104));
console.log("  VEREDICTO");
console.log("═".repeat(104));
console.log(`  Variantes medidas: ${TODO.length}. Las que reducen la racha Y cuestan menos de $${LISTON_TAMANO.toFixed(3)} por dólar de caída: ${baten.length}`);
for (const r of baten.sort((a, b) => a.coste - b.coste)) {
  console.log(`    ✓ ${r.nom.padEnd(20)} coste $${r.coste.toFixed(3)}/$dd · retiene ${pcts(r.retenido)} del ingreso · peor día ${eur(BASE.peor)}→${eur(r.peor)} · racha ${eur(BASE.dd)}→${eur(r.dd)} · tercios ${r.signoDD}`);
}
const mejorPeorDia = [...TODO].sort((a, b) => b.peor - a.peor)[0];
console.log(`\n  El que MÁS corta el peor día: ${mejorPeorDia.nom} → ${eur(mejorPeorDia.peor)} (base ${eur(BASE.peor)}), y cuesta ${eur(mejorPeorDia.ingresoPerdido)}/año`);
const mejorDD = [...TODO].sort((a, b) => b.dd - a.dd)[0];
console.log(`  El que MÁS corta la racha:  ${mejorDD.nom} → ${eur(mejorDD.dd)} (base ${eur(BASE.dd)}), y cuesta ${eur(mejorDD.ingresoPerdido)}/año`);

writeFileSync("scripts/anatomia3-comprar-cola.json", JSON.stringify({
  BASE: { ...BASE, cvar5: cvar(PL0), suma20: suma20(PL0) }, ANOS, LISTON, LISTON_PROY, LISTON_TAMANO,
  sinCotiz, problemas: PROBLEMAS, verificacion: { descuadres: desc, peorDescuadre: peorDesc },
  A: RES.map(({ pl, ...r }) => r), B: RESB.map(({ pl, ...r }) => r), C: RESC.map(({ pl, ...r }) => r), controles,
}, null, 1));
console.log("\n  → scripts/anatomia3-comprar-cola.json");
