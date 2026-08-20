// ═══════════════════════════════════════════════════════════════════════════════════════════════
// COLA · ESTRUCTURA 1 — EL ANCHO DE LAS ALAS, MEDIDO CONTRA LA COLA (no contra la media)
// ═══════════════════════════════════════════════════════════════════════════════════════════════
//
// POR QUÉ ESTE Y NO OTRO. Se han medido 17 filtros de régimen y 30 reglas de gestión. Los 30 + 17
// se midieron contra la MEDIA (tercio alto vs tercio bajo del P&L). Todos fallaron. Este script no
// mide la media: mide la COLA. Y no prueba un filtro —"hoy no opero"— sino la ESPECIFICACIÓN: el
// ancho del ala es lo ÚNICO del cóndor que acota la pérdida máxima por diseño. Pérdida máxima =
// (ancho × 100 − crédito). No hay que acertar nada para que funcione: es aritmética del contrato.
//
// QUÉ CAMBIA respecto a scripts/anatomia-2-ala.mjs (que barrió 10..50):
//   · añade 60 y 75 puntos — el lado ANCHO, que nadie había medido
//   · añade COLATERAL exigido por ancho (Robinhood retiene el ancho completo de UNA vertical)
//   · añade la comparación A IGUALDAD DE COLATERAL (nº de contratos que caben en $7.977 de efectivo)
//   · da la métrica del encargo en su dirección: $ DE INGRESO ANUAL PERDIDOS POR $ DE CAÍDA ELIMINADO
//   · vigila que el ala PEDIDA exista en la cadena — `cerca()` devuelve el strike más próximo y
//     puede darte un ala de 40 cuando pediste 75 sin decir nada. Se cuenta y se declara.
//
// PRECIOS REALES. Bid de lo vendido, ask de lo comprado, las cuatro patas. $0,03 por pata (8 patas
// contando apertura y liquidación). Cierre real de las 16:00. Nada de modelo, nada de punto medio.
//
// NADA DE FUTURO. Todo lo que decide la entrada se lee a las 11:00 ET del mismo día.
//
// PRUEBAS DECLARADAS: 9 anchos aquí + 12 ya declarados en anatomia-2-ala.mjs = 21. El listón de |t|
// se calcula con 21, no con 9.
// ═══════════════════════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { listonT } from "../lib/barreraHallazgos";
import { radiografia } from "../lib/radiografia";

const DIR = "scripts/cache-theta/gex-2026";
const CACHE = "scripts/cola-1-ala-filas.json";
const HORA = "11:00", SEP = 25, COMM = 0.03, DIAS_ANO = 252;
const ALAS = [10, 15, 20, 25, 30, 40, 50, 60, 75];
// "75t" = ala de 75 TOPADA: el largo es el strike más lejano que NO pasa de +75. Existe porque
// `cerca()` a veces devuelve 80 (la rejilla de 5 pts se rompe lejos del dinero) y 80×100 = $8.000
// NO cabe en los $7.977 de efectivo. Topada, el colateral es $7.500 EXACTOS todos los días.
const TOPADA = 75;
const BASE = 50;                       // la especificación de hoy
const PRUEBAS = 22;                    // 9 anchos + 1 variante topada + 12 ya declarados
const LISTON = listonT(PRUEBAS);

// La cuenta real de Lester (memoria verificada 2026-08-17)
const CUENTA = 56389, EFECTIVO = 7977;

const eur = (x) => (x < 0 ? "−" : "") + "$" + Math.abs(Math.round(x)).toLocaleString("es-ES");
const pct = (x) => (x * 100).toFixed(1) + "%";
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const dt = (v) => {
  if (v.length < 2) return NaN;
  const m = media(v);
  return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1));
};

// ── LECTOR DE CADENAS — copiado de anatomia-2-ala.mjs / desde-2024.mjs, no reinventado ──────────
function leerDia(fecha, right) {
  const f = DIR + "/iv_" + fecha + "_" + right + ".csv";
  if (!existsSync(f)) return null;
  const lin = readFileSync(f, "utf8").trim().split("\n");
  if (lin.length < 2) return null;
  const cab = lin[0].split(",").map((x) => x.replace(/"/g, "").trim());
  const idx = ["strike", "timestamp", "bid", "ask", "midpoint", "underlying_price"].map((c) => cab.indexOf(c));
  if (idx.some((x) => x < 0)) throw new Error("faltan columnas en " + f);   // un campo que no existe se lee como 0
  const [iK, iT, iB, iA, iMid, iU] = idx;
  const enHora = [], camino = new Map();
  for (let j = 1; j < lin.length; j++) {
    const c = lin[j].split(",");
    const h = String(c[iT]).slice(11, 16), sp = Number(c[iU]);
    if (sp > 0) camino.set(h, sp);
    if (h !== HORA) continue;
    const K = Number(c[iK]), bid = Number(c[iB]), ask = Number(c[iA]), mid = Number(c[iMid]);
    if (K > 0 && bid >= 0 && ask > 0) enHora.push({ K, bid, ask, mid });
  }
  return enHora.length ? { filas: enHora, camino } : null;
}
const cerca = (f, o) => f.reduce((a, b) => (Math.abs(b.K - o) < Math.abs(a.K - o) ? b : a));

// ── CONSTRUCCIÓN DÍA A DÍA ──────────────────────────────────────────────────────────────────────
let filas;
if (existsSync(CACHE)) {
  filas = JSON.parse(readFileSync(CACHE, "utf8"));
  console.log("## " + filas.length + " días leídos de caché (" + CACHE + ")");
} else {
  const fechas = [...new Set(readdirSync(DIR).map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean))].sort();
  console.log("## leyendo " + fechas.length + " días de cadenas crudas…");
  filas = [];
  for (let i = 0; i < fechas.length; i++) {
    const fecha = fechas[i];
    if (i % 150 === 0) console.log("   " + i + "/" + fechas.length + " · " + fecha);
    const C = leerDia(fecha, "C"), P = leerDia(fecha, "P");
    if (!C || !P) continue;
    const horas = [...C.camino.keys()].sort();
    const cierre = C.camino.get(horas[horas.length - 1]), sp11 = C.camino.get(HORA);
    if (!(cierre > 0) || !(sp11 > 0)) continue;
    const cC = cerca(C.filas, sp11 + SEP), pC = cerca(P.filas, sp11 - SEP);
    const fila = { fecha, cierre, sp11, kC: cC.K, kP: pC.K, credCorto: (cC.bid + pC.bid) * 100 };
    const armar = (cL, pL) => {
      if (!cL || !pL || cL.K <= cC.K || pL.K >= pC.K) return null;   // no se rellena: se dice
      const anchoC = cL.K - cC.K, anchoP = pC.K - pL.K;
      const cred = cC.bid + pC.bid - cL.ask - pL.ask;
      const pl = (cred - Math.min(Math.max(cierre - cC.K, 0), anchoC)
                       - Math.min(Math.max(pC.K - cierre, 0), anchoP)) * 100 - 8 * COMM;
      return { pl, cred: cred * 100, anchoC, anchoP,
               costeAlas: (cL.ask + pL.ask) * 100,
               costeAlasMid: (cL.mid + pL.mid) * 100 };   // sólo para el ESCENARIO de la tabla 10
    };
    for (const A of ALAS) fila["a" + A] = armar(cerca(C.filas, cC.K + A), cerca(P.filas, pC.K - A));
    // variante TOPADA: el largo más lejano SIN pasar del tope (colateral acotado por diseño)
    const dentroC = C.filas.filter((x) => x.K > cC.K && x.K <= cC.K + TOPADA);
    const dentroP = P.filas.filter((x) => x.K < pC.K && x.K >= pC.K - TOPADA);
    fila["a" + TOPADA + "t"] = armar(
      dentroC.length ? dentroC.reduce((a, b) => (b.K > a.K ? b : a)) : null,
      dentroP.length ? dentroP.reduce((a, b) => (b.K < a.K ? b : a)) : null);
    filas.push(fila);
  }
  writeFileSync(CACHE, JSON.stringify(filas), "utf8");
  console.log("   guardado: " + filas.length + " días en " + CACHE);
}

// ── EL GUARDIÁN — radiografía antes de medir nada ───────────────────────────────────────────────
const planas = filas.map((f) => ({
  cierre: f.cierre, sp11: f.sp11, kC: f.kC, kP: f.kP, credCorto: f.credCorto,
  pl10: f.a10 ? f.a10.pl : null, cred10: f.a10 ? f.a10.cred : null,
  pl50: f.a50 ? f.a50.pl : null, cred50: f.a50 ? f.a50.cred : null,
  pl75: f.a75 ? f.a75.pl : null, cred75: f.a75 ? f.a75.cred : null,
}));
// Los ANCHOS no entran aquí a propósito: son una constante de diseño (75 debe ser 75), no un
// predictor. radiografia() los mataría por "sólo 1 valor distinto" y ese 1 valor es justo el
// resultado que se busca. Se comprueban abajo, en su propia tabla, contra el ancho PEDIDO.
radiografia(planas, ["cierre", "sp11", "kC", "kP", "credCorto", "pl10", "cred10", "pl50", "cred50",
                     "pl75", "cred75"], "cóndor 0DTE por ancho de ala", { maxCeros: 0.2 });

// ── PARIDAD con la medición base (regimen-filas.json, ala 50) ───────────────────────────────────
const base = JSON.parse(readFileSync("scripts/regimen-filas.json", "utf8"));
const porFecha = new Map(base.map((f) => [f.fecha, f]));
let maxD = 0, comparados = 0;
for (const f of filas) {
  const b = porFecha.get(f.fecha);
  if (!b || !f.a50) continue;
  maxD = Math.max(maxD, Math.abs(f.a50.pl - b.pl)); comparados++;
}
console.log("\n## PARIDAD con regimen-filas.json (ala 50): " + comparados + " días, Δ máximo " + maxD.toFixed(6));
if (maxD > 0.01) throw new Error("el ala 50 NO reproduce la medición original (Δ=" + maxD + "). Se para aquí.");

// ── ¿EXISTE EL ALA QUE PIDO? — `cerca()` miente en silencio si la cadena no llega ───────────────
console.log("\n## ¿LA CADENA TIENE EL ALA QUE PIDO? — cerca() devuelve el strike más próximo, no el pedido\n");
console.log("| ala pedida | días con dato | ancho REAL medio (call / put) | días con desvío >2,5 pts | ancho real mín / MÁX |");
console.log("|---|---|---|---|---|");
const VARIANTES = [...ALAS.map((A) => ({ k: "a" + A, lab: A + " pts", obj: A })),
                   { k: "a" + TOPADA + "t", lab: TOPADA + " topada", obj: TOPADA }];
const desvios = {};
for (const V of VARIANTES) {
  const v = filas.map((f) => f[V.k]).filter(Boolean);
  const aC = v.map((x) => x.anchoC), aP = v.map((x) => x.anchoP);
  const mal = v.filter((x) => Math.abs(x.anchoC - V.obj) > 2.5 || Math.abs(x.anchoP - V.obj) > 2.5).length;
  desvios[V.lab] = mal;
  console.log("| " + V.lab + " | " + v.length + "/" + filas.length + " | " + media(aC).toFixed(1) + " / " + media(aP).toFixed(1) +
    " | " + mal + " (" + pct(mal / v.length) + ") | " + Math.min(...aC, ...aP) + " / " + Math.max(...aC, ...aP) + " |");
}

// ── MÉTRICAS POR ANCHO ──────────────────────────────────────────────────────────────────────────
const ANOS = filas.length / DIAS_ANO;     // el año se cuenta sobre el CALENDARIO, no sobre los días operados
function metricas(campo, A) {
  const ops = [], saltados = { sinAla: 0, credNegativo: 0 };
  for (const f of filas) {
    const x = f[campo];
    if (!x) { saltados.sinAla++; continue; }
    if (!(x.cred > 0)) { saltados.credNegativo++; continue; }   // no se abre un cóndor por crédito ≤0
    ops.push({ fecha: f.fecha, pl: x.pl, cred: x.cred, ancho: Math.max(x.anchoC, x.anchoP),
               costeAlas: x.costeAlas, credCorto: f.credCorto });
  }
  const v = ops.map((o) => o.pl);
  const total = v.reduce((a, b) => a + b, 0);
  const ord = [...v].sort((a, b) => a - b);
  const q = (p) => ord[Math.max(0, Math.min(ord.length - 1, Math.floor(ord.length * p)))];
  // racha: sobre el calendario completo; los días sin operación suman 0
  const m = new Map(ops.map((o) => [o.fecha, o.pl]));
  let acc = 0, pico = 0, peor = 0, picoF = filas[0].fecha, ddIni = null, ddFin = null;
  for (const f of filas) {
    acc += m.get(f.fecha) ?? 0;
    if (acc > pico) { pico = acc; picoF = f.fecha; }
    if (acc - pico < peor) { peor = acc - pico; ddIni = picoF; ddFin = f.fecha; }
  }
  const anchos = ops.map((o) => o.ancho).sort((a, b) => a - b);
  const col = anchos.map((a) => a * 100);                        // Robinhood: ancho completo de UNA vertical
  const credMedio = media(ops.map((o) => o.cred));
  return {
    A, n: ops.length, saltados, total, alAno: total / ANOS, media: total / ops.length,
    peorDia: ord[0], p1: q(0.01), p5: q(0.05), p10: q(0.10), dd: peor, ddIni, ddFin,
    acierto: v.filter((x) => x > 0).length / v.length, credMedio, sd: dt(v),
    colMediano: col[col.length >> 1], colMax: col[col.length - 1],
    perdMaxTeorica: -(anchos[anchos.length - 1] * 100 - credMedio),
    costeAlas: media(ops.map((o) => o.costeAlas)), credCorto: media(ops.map((o) => o.credCorto)),
    ops, mapa: m,
  };
}
const M = {}; for (const V of VARIANTES) M[V.lab] = metricas(V.k, V.obj);
const B = M[BASE + " pts"];

console.log("\n" + "═".repeat(120));
console.log("  EL ANCHO DEL ALA · " + filas.length + " días (" + filas[0].fecha + " → " + filas[filas.length - 1].fecha +
            ") · entrada 11:00 · precios reales · 1 contrato");
console.log("  listón |t| = " + LISTON + " (Bonferroni, " + PRUEBAS + " pruebas declaradas)");
console.log("═".repeat(120));

console.log("\n## TABLA 1 · LO QUE PIDE EL ENCARGO\n");
console.log("| ala | días op. | días sin abrir | crédito medio | acierto | **$/año** | peor día | **p1** | **p5** | **peor racha** | colateral (mediano/máx) | **$/año por $ de racha** |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const V of VARIANTES) {
  const m = M[V.lab];
  console.log("| " + V.lab + " | " + m.n + " | " + (m.saltados.sinAla + m.saltados.credNegativo) +
    " | " + eur(m.credMedio) + " | " + pct(m.acierto) + " | **" + eur(m.alAno) + "** | " + eur(m.peorDia) +
    " | " + eur(m.p1) + " | " + eur(m.p5) + " | **" + eur(m.dd) + "** | " + eur(m.colMediano) + " / " + eur(m.colMax) +
    " | **" + (m.alAno / -m.dd).toFixed(2) + "** |");
}

console.log("\n## TABLA 2 · LA CIFRA QUE DECIDE — $ DE INGRESO ANUAL PERDIDOS POR CADA $ DE CAÍDA ELIMINADO");
console.log("   (base = ala " + BASE + ", la especificación de hoy. Menos es mejor: seguro más barato.)\n");
console.log("| ala | $/año | Δ ingreso/año | Δ peor día | Δ peor racha | **$/año perdidos por $ de RACHA cortada** | **$/año perdidos por $ de PEOR DÍA cortado** | ingreso total cedido en los " + ANOS.toFixed(2) + " años ÷ caída evitada |");
console.log("|---|---|---|---|---|---|---|---|");
const precio = {};
for (const V of VARIANTES) {
  const m = M[V.lab];
  const dIng = m.alAno - B.alAno;              // <0 = pierde ingreso
  const dDD  = m.dd - B.dd;                    // >0 = racha menos honda (cortada)
  const dPD  = m.peorDia - B.peorDia;          // >0 = peor día menos malo
  const pRacha = dIng < 0 && dDD > 0 ? (-dIng) / dDD : null;
  const pDia   = dIng < 0 && dPD > 0 ? (-dIng) / dPD : null;
  precio[V.lab] = { dIng, dDD, dPD, pRacha, pDia };
  // Un corte de caída por debajo del 5% de la caída base es EMPATE, no una mejora. Con una sola
  // trayectoria, $97 sobre $15.176 es ruido y llamarlo "gratis" sería venderle humo.
  const f = (x, d, ref) => V.lab === BASE + " pts" ? "— (base)"
    : x != null ? x.toFixed(2) + " $/$"
    : d > Math.abs(ref) * 0.05 ? "**GRATIS** (corta caída y gana ingreso)"
    : d > 0 ? "empate (" + eur(d) + " = " + pct(d / Math.abs(ref)) + " de la caída: ruido)"
    : "**no corta caída**";
  console.log("| " + V.lab + " | " + eur(m.alAno) + " | " + (dIng >= 0 ? "+" : "") + eur(dIng) +
    " | " + (dPD >= 0 ? "+" : "") + eur(dPD) + " | " + (dDD >= 0 ? "+" : "") + eur(dDD) +
    " | " + f(pRacha, dDD, B.dd) + " | " + f(pDia, dPD, B.peorDia) +
    " | " + (pRacha != null ? "**" + (pRacha * ANOS).toFixed(2) + "×** — pagó " + eur(-dIng * ANOS) + " para ahorrarse " + eur(dDD) : "—") + " |");
}

console.log("\n## TABLA 3 · EL CAMBIO PASO A PASO — cada escalón contra el anterior");
console.log("   (leído de arriba abajo: qué cuesta ENSANCHAR un escalón, o qué se ahorra ESTRECHARLO)\n");
console.log("| escalón | Δ $/año | Δ peor día | Δ peor racha | $/año ganados por $ de racha AÑADIDA |");
console.log("|---|---|---|---|---|");
for (let i = 1; i < ALAS.length; i++) {
  const a = M[ALAS[i - 1] + " pts"], b = M[ALAS[i] + " pts"];
  const dIng = b.alAno - a.alAno, dDD = b.dd - a.dd;
  console.log("| " + ALAS[i - 1] + " → " + ALAS[i] + " pts | " + (dIng >= 0 ? "+" : "") + eur(dIng) +
    " | " + eur(b.peorDia - a.peorDia) + " | " + eur(dDD) +
    " | " + (dDD < 0 ? (dIng / -dDD).toFixed(3) + " $/$" : "—") + " |");
}

// ── A IGUALDAD DE COLATERAL — lo que de verdad puede poner en la mesa ───────────────────────────
console.log("\n## TABLA 4 · A IGUALDAD DE DINERO — cuántos contratos caben en $" + EFECTIVO.toLocaleString("es-ES") + " de efectivo");
console.log("   (Robinhood retiene el ancho COMPLETO de una vertical por contrato. Colateral = ancho máx × 100 × contratos.)\n");
console.log("| ala | colateral/contrato (máx) | contratos que caben | colateral usado | **$/año** | peor día | **peor racha** | racha / efectivo |");
console.log("|---|---|---|---|---|---|---|---|");
const escalado = {};
for (const V of VARIANTES) {
  const m = M[V.lab];
  const nc = Math.floor(EFECTIVO / m.colMax);
  escalado[V.lab] = { nc, alAno: m.alAno * nc, peorDia: m.peorDia * nc, dd: m.dd * nc, usado: m.colMax * nc };
  const e = escalado[V.lab];
  console.log("| " + V.lab + " | " + eur(m.colMax) + " | **" + nc + "** | " + eur(e.usado) + " | **" + eur(e.alAno) +
    "** | " + eur(e.peorDia) + " | **" + eur(e.dd) + "** | " + (nc ? (-e.dd / EFECTIVO).toFixed(2) + "×" : "—") + " |");
}

// ── A IGUALDAD DE INGRESO — la comparación que de verdad contesta el encargo ────────────────────
//
// El encargo pide "$/año retenidos por cada dólar de caída eliminado". La trampa de compararlo así
// contra la base es que el ala estrecha baja el ingreso Y la caída a la vez: no es que la proteja,
// es que opera MENOS. La comparación limpia es al revés: se escala cada ancho hasta que TODOS
// rinden lo mismo ($18.770/año, lo que rinde hoy) y se mira cuál lo hace con la caída más corta.
// Si el ala fuera un freno de verdad, la columna de la derecha bajaría al estrechar. Se mira.
console.log("\n## TABLA 4b · A IGUALDAD DE INGRESO — todos escalados a " + eur(B.alAno) + "/año. ¿Cuál lo consigue con menos caída?\n");
console.log("| ala | contratos para igualar el ingreso | colateral necesario | peor día | **peor racha a igual ingreso** | ¿mejor o peor que el ala 50? |");
console.log("|---|---|---|---|---|---|");
const igualIngreso = {};
for (const V of VARIANTES) {
  const m = M[V.lab];
  if (!(m.alAno > 0)) { console.log("| " + V.lab + " | — (pierde dinero, no hay escala que lo iguale) | — | — | — | — |"); igualIngreso[V.lab] = null; continue; }
  const esc = B.alAno / m.alAno;
  const dd = m.dd * esc, pd = m.peorDia * esc, col = m.colMax * esc;
  igualIngreso[V.lab] = { esc, dd, peorDia: pd, colateral: col };
  console.log("| " + V.lab + " | " + esc.toFixed(2) + "× | " + eur(col) + " | " + eur(pd) +
    " | **" + eur(dd) + "** | " + (V.lab === BASE + " pts" ? "— (base)"
      : dd > B.dd ? "**mejor " + eur(dd - B.dd) + "**" : "peor " + eur(B.dd - dd)) + " |");
}

// ── PRUEBA ESTADÍSTICA — t pareado sobre la diferencia diaria contra la base ────────────────────
console.log("\n## TABLA 5 · ¿ES REAL LA DIFERENCIA DE MEDIA? — t PAREADO día a día contra el ala " + BASE);
console.log("   (mismos días, misma entrada: la comparación pareada es la correcta. Listón |t| = " + LISTON + ")\n");
console.log("| ala | n pares | Δ media/día | t pareado | ¿pasa el listón? |");
console.log("|---|---|---|---|---|");
for (const V of VARIANTES) {
  if (V.lab === BASE + " pts") { console.log("| " + V.lab + " | — | — | — | — (base) |"); continue; }
  const d = [];
  for (const f of filas) {
    const x = f[V.k], y = f["a" + BASE];
    if (!x || !y || !(x.cred > 0) || !(y.cred > 0)) continue;
    d.push(x.pl - y.pl);
  }
  const t = media(d) / (dt(d) / Math.sqrt(d.length));
  console.log("| " + V.lab + " | " + d.length + " | " + eur(media(d)) + " | " + t.toFixed(2) +
    " | " + (Math.abs(t) >= LISTON ? "**SÍ**" : "no") + " |");
}

// ── TERCIOS — el signo tiene que repetirse en los tres ──────────────────────────────────────────
const k = Math.floor(filas.length / 3);
const tercios = [filas.slice(0, k), filas.slice(k, 2 * k), filas.slice(2 * k)];
console.log("\n## TABLA 6 · LOS TRES TERCIOS — ¿el ancho aguanta el signo en los tres?\n");
console.log("| ala | " + tercios.map((t) => t[0].fecha.slice(0, 7) + "→" + t[t.length - 1].fecha.slice(0, 7)).join(" | ") + " | signo | peor racha por tercio |");
console.log("|---|---|---|---|---|---|");
const signos = {};
for (const V of VARIANTES) {
  const cel = tercios.map((T) => {
    const v = T.map((f) => f[V.k]).filter((x) => x && x.cred > 0).map((x) => x.pl);
    let acc = 0, pico = 0, peor = 0;
    for (const p of v) { acc += p; if (acc > pico) pico = acc; peor = Math.min(peor, acc - pico); }
    return { s: v.reduce((a, b) => a + b, 0), n: v.length, dd: peor };
  });
  signos[V.lab] = cel.map((c) => (c.s >= 0 ? "+" : "−")).join("");
  console.log("| " + V.lab + " | " + cel.map((c) => eur(c.s) + " (n=" + c.n + ")").join(" | ") +
    " | **" + signos[V.lab] + "** | " + cel.map((c) => eur(c.dd)).join(" / ") + " |");
}

// ── DÓNDE ESTÁ LA COLA — días que rompen el ala entera ──────────────────────────────────────────
console.log("\n## TABLA 7 · EL TOPE MECÁNICO — días que se comen el ala completa\n");
console.log("| ala | días al TOPE | % de días | pérdida de esos días | % de toda la pérdida bruta | pérdida bruta total |");
console.log("|---|---|---|---|---|---|");
for (const V of VARIANTES) {
  const m = M[V.lab];
  const tope = m.ops.filter((o) => o.pl <= o.cred - o.ancho * 100 - 0.24 + 1);
  const bruta = m.ops.filter((o) => o.pl < 0).reduce((a, o) => a + o.pl, 0);
  const st = tope.reduce((a, o) => a + o.pl, 0);
  console.log("| " + V.lab + " | " + tope.length + " | " + pct(tope.length / m.n) + " | " + eur(st) +
    " | " + pct(st / bruta) + " | " + eur(bruta) + " |");
}

// ── EL MECANISMO — por qué estrechar el ala sale caro ───────────────────────────────────────────
console.log("\n## TABLA 8 · EL PORQUÉ — lo que CUESTA el ala (ask de los dos largos) contra lo que cobran los cortos");
console.log("   El crédito de los CORTOS es el mismo en las 10 filas (±25 pts, no cambia). Lo único que cambia");
console.log("   es lo que se paga por las alas. Estrechar no reduce el riesgo gratis: compra un seguro más caro.\n");
console.log("| ala | crédito cortos | coste de las alas | **% del crédito que se come el ala** | crédito neto | riesgo máx | crédito neto / riesgo máx |");
console.log("|---|---|---|---|---|---|---|");
for (const V of VARIANTES) {
  const m = M[V.lab];
  const riesgo = V.obj * 100 - m.credMedio;
  console.log("| " + V.lab + " | " + eur(m.credCorto) + " | " + eur(m.costeAlas) + " | **" + pct(m.costeAlas / m.credCorto) +
    "** | " + eur(m.credMedio) + " | " + eur(riesgo) + " | " + (m.credMedio / riesgo).toFixed(3) + " |");
}

// ── BOOTSTRAP POR BLOQUES — la peor racha es UNA trayectoria, y una trayectoria miente ─────────
//
// La "peor racha" del período es un solo número salido de un solo orden de los días. Si 2025-04-07
// hubiera caído tres semanas antes, la racha sería otra. Se remuestrea en BLOQUES de 21 días
// (≈ un mes) para no romper el agrupamiento de la volatilidad, 2.000 veces, y se mira si la
// ORDENACIÓN entre anchos aguanta o es de la suerte del calendario.
console.log("\n## TABLA 9 · BOOTSTRAP POR BLOQUES (21 días, 2.000 remuestreos) — ¿aguanta la ordenación?\n");
const BLOQUE = 21, REPS = 2000;
let semilla = 20260819;
const rnd = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; };
const serie = {};
for (const V of VARIANTES) serie[V.lab] = filas.map((f) => M[V.lab].mapa.get(f.fecha) ?? 0);
const nB = Math.ceil(filas.length / BLOQUE);
const boot = Object.fromEntries(VARIANTES.map((V) => [V.lab, { alAno: [], dd: [], ratio: [] }]));
for (let r = 0; r < REPS; r++) {
  const ini = Array.from({ length: nB }, () => Math.floor(rnd() * (filas.length - BLOQUE)));
  for (const V of VARIANTES) {
    const s = serie[V.lab];
    let acc = 0, pico = 0, peor = 0, total = 0, cuenta = 0;
    for (const i0 of ini) for (let j = 0; j < BLOQUE && cuenta < filas.length; j++, cuenta++) {
      const p = s[i0 + j]; total += p; acc += p;
      if (acc > pico) pico = acc;
      if (acc - pico < peor) peor = acc - pico;
    }
    const alAno = total / ANOS;
    boot[V.lab].alAno.push(alAno); boot[V.lab].dd.push(peor);
    boot[V.lab].ratio.push(peor < 0 ? alAno / -peor : NaN);
  }
}
const q = (v, p) => { const s = [...v].filter(Number.isFinite).sort((a, b) => a - b); return s[Math.floor(s.length * p)]; };
console.log("| ala | peor racha p5 / mediana / p95 | $/año mediano | **$/año por $ de racha: p5 / mediana / p95** | % de remuestreos que BATEN al ala 50 |");
console.log("|---|---|---|---|---|");
const bat = {};
for (const V of VARIANTES) {
  const b = boot[V.lab], b50 = boot[BASE + " pts"];
  let gana = 0;
  for (let r = 0; r < REPS; r++) if (b.ratio[r] > b50.ratio[r]) gana++;
  bat[V.lab] = gana / REPS;
  console.log("| " + V.lab + " | " + eur(q(b.dd, 0.05)) + " / " + eur(q(b.dd, 0.5)) + " / " + eur(q(b.dd, 0.95)) +
    " | " + eur(q(b.alAno, 0.5)) + " | **" + q(b.ratio, 0.05).toFixed(2) + " / " + q(b.ratio, 0.5).toFixed(2) + " / " + q(b.ratio, 0.95).toFixed(2) +
    "** | " + (V.lab === BASE + " pts" ? "— (base)" : pct(bat[V.lab])) + " |");
}

// ── TABLA 10 · QUÉ LE FALTARÍA AL ALA ESTRECHA PARA SERVIR ─────────────────────────────────────
//
// ⚠️ ESTO NO ES UN RESULTADO. Es la medida de un SUPUESTO DE EJECUCIÓN que aún no está probado.
// Todo lo anterior paga el ASK del ala, que es lo que se cobra de verdad. Aquí se pregunta una
// sola cosa: si el largo se comprase al PUNTO MEDIO en vez de al ask — con una orden límite que
// puede no ejecutarse — ¿resucitaría el ala estrecha? El ala de 10 pts se come el 70,3% del
// crédito de los cortos; ahí es donde vive todo el daño. El pago al vencimiento no cambia: sólo
// cambia el crédito, así que P&L(mid) = P&L(ask) + (coste_ask − coste_mid).
console.log("\n## TABLA 10 · EL PUENTE QUE HABRÍA QUE PROBAR — ¿y si el ALA se comprase al punto medio?");
console.log("   ⚠️ SUPUESTO NO PROBADO. Una orden límite al medio puede no ejecutarse; sin ejecución no hay cóndor.");
console.log("   Sirve sólo para saber si el ala estrecha está muerta o sólo mal ejecutada.\n");
console.log("| ala | $/año pagando ASK (real) | $/año al MEDIO (supuesto) | ahorro/año | peor racha al medio | **peor racha a IGUAL ingreso** | ¿bate al ala 50 real (−" + eur(-B.dd).slice(1) + ")? |");
console.log("|---|---|---|---|---|---|---|");
const puente = {};
for (const V of VARIANTES) {
  const m = M[V.lab];
  const ops = [];
  for (const f of filas) {
    const x = f[V.k];
    if (!x || !(x.cred > 0)) continue;
    ops.push({ fecha: f.fecha, pl: x.pl + (x.costeAlas - x.costeAlasMid) });
  }
  const mm = new Map(ops.map((o) => [o.fecha, o.pl]));
  let acc = 0, pico = 0, peor = 0, total = 0;
  for (const f of filas) { const p = mm.get(f.fecha) ?? 0; total += p; acc += p; if (acc > pico) pico = acc; if (acc - pico < peor) peor = acc - pico; }
  const alAno = total / ANOS;
  const ddIgual = alAno > 0 ? peor * (B.alAno / alAno) : NaN;
  puente[V.lab] = { alAnoMid: alAno, ddMid: peor, ddIgualIngreso: ddIgual };
  console.log("| " + V.lab + " | " + eur(m.alAno) + " | " + eur(alAno) + " | +" + eur(alAno - m.alAno) +
    " | " + eur(peor) + " | **" + (Number.isFinite(ddIgual) ? eur(ddIgual) : "—") + "** | " +
    (Number.isFinite(ddIgual) && ddIgual > B.dd ? "**SÍ, por " + eur(ddIgual - B.dd) + "**" : "no") + " |");
}

// ── CUÁL CABE EN LA CUENTA ─────────────────────────────────────────────────────────────────────
console.log("\n## LA CUENTA · $" + CUENTA.toLocaleString("es-ES") + " total, $" + EFECTIVO.toLocaleString("es-ES") + " de efectivo libre\n");
const cabe = VARIANTES.filter((V) => M[V.lab].colMax <= EFECTIVO);
const masAncha = cabe.length ? cabe[cabe.length - 1] : null;
for (const V of VARIANTES) {
  const m = M[V.lab];
  console.log("  ala " + V.lab.padStart(10) + " → colateral máx " + eur(m.colMax).padStart(8) +
    "  ·  " + (m.colMax <= EFECTIVO ? "CABE (sobran " + eur(EFECTIVO - m.colMax) + ")" : "NO CABE (faltan " + eur(m.colMax - EFECTIVO) + ")") +
    "  ·  peor racha 1 contrato " + eur(m.dd).padStart(9) + " = " + (-m.dd / EFECTIVO).toFixed(1) + "× el efectivo, " +
    (-m.dd / CUENTA * 100).toFixed(1) + "% de la cuenta");
}
console.log("\n  → LA MÁS ANCHA QUE CABE CON 1 CONTRATO: **ala de " + masAncha.lab + "** (colateral " + eur(M[masAncha.lab].colMax) +
            " TODOS los días, " + eur(M[masAncha.lab].alAno) + "/año).");
console.log("     El ala de 75 SIN topar NO cabe: " + desvios["75 pts"] + " días de " + filas.length +
            " la rejilla de strikes obliga a un ala de 80 → $8.000 de colateral, $23 por encima del efectivo.");
console.log("\n  AVISO que ninguna tabla puede tapar: la peor racha de CUALQUIER ancho supera el efectivo libre.");
console.log("  Con " + eur(EFECTIVO) + " en caja, una racha de " + eur(B.dd) + " (ala 50) no se financia sola:");
console.log("  hay que vender acciones a mitad de la racha o el margen la cierra. Eso NO está en el backtest.");

// ── VEREDICTO ──────────────────────────────────────────────────────────────────────────────────
const T = M[TOPADA + " topada"], C25 = M["25 pts"];
console.log("\n" + "═".repeat(120));
console.log("  VEREDICTO");
console.log("═".repeat(120));
console.log(`
  1. EL ALA NO ES UN FRENO. Es un mando de TAMAÑO. Estrecharla no cambia la FORMA de la
     distribución: la encoge entera. A igualdad de ingreso (tabla 4b) el ala estrecha sale
     PEOR y de forma monótona — ala 25 necesita ${(B.alAno / C25.alAno).toFixed(2)} contratos para ganar lo mismo y su
     racha pasa de ${eur(B.dd)} a ${eur(C25.dd * (B.alAno / C25.alAno))}. El mando gira al revés de lo que se esperaba.

  2. EL PRECIO DEL SEGURO, en la unidad del encargo: el corte más barato de todos los medidos
     es el ala 25, a ${precio["25 pts"].pRacha.toFixed(2)} $/año por cada $1 de racha cortada. En los ${ANOS.toFixed(2)} años medidos eso son
     ${eur(-precio["25 pts"].dIng * ANOS)} de ingreso cedido para ahorrarse ${eur(precio["25 pts"].dDD)} de caída: se paga ${(precio["25 pts"].pRacha * ANOS).toFixed(1)} veces
     lo que se evita. NINGÚN ancho corta la cola conservando el ingreso. La estructura 1 NO sirve.

  3. EL PORQUÉ (tabla 8, y es aritmética, no correlación): los cortos cobran ${eur(B.credCorto)} en las diez
     filas — no cambian. Lo único que cambia es lo que se PAGA por el ala, y ese pago no baja
     en proporción al riesgo que quita: a 10 pts el ala se lleva el ${pct(M["10 pts"].costeAlas / M["10 pts"].credCorto)} del crédito de los
     cortos y a 75 pts sólo el ${pct(T.costeAlas / T.credCorto)}. Comprar más cerca del dinero es pagar el mismo peaje
     de horquilla por un billete mucho más caro.

  4. Y NO ES LA EJECUCIÓN (tabla 10). Regalando el ala al punto medio —que no se va a
     conseguir— el ala estrecha SIGUE perdiendo a igualdad de ingreso. El ala estrecha no está
     mal ejecutada: está dominada.

  5. LO ÚNICO QUE MEJORA ALGO es ir al otro lado: ala de ${TOPADA} TOPADA da ${eur(T.alAno)}/año
     (${eur(T.alAno - B.alAno)} más que hoy) con la racha PLANA (${eur(T.dd)} contra ${eur(B.dd)}: ${pct(Math.abs((T.dd - B.dd) / B.dd))} de
     diferencia, ruido). Pero el PEOR DÍA empeora de ${eur(B.peorDia)} a ${eur(T.peorDia)}. Es más
     ingreso al mismo riesgo agregado, NO menos cola. No es lo que se pedía.

  6. LA MÁS ANCHA QUE CABE: ${TOPADA} puntos TOPADA — colateral ${eur(T.colMax)} exactos todos los días,
     dentro de los ${eur(EFECTIVO)} de efectivo con ${eur(EFECTIVO - T.colMax)} de margen. Topar importa: sin topar,
     ${desvios["75 pts"]} días de ${filas.length} la rejilla obliga a un ala de 80 = $8.000, y esos días NO se puede abrir.

  7. EL LÍMITE REAL NO ES EL ANCHO, ES LA CAJA. El bootstrap por bloques dice que la racha
     de ${eur(B.dd)} es una trayectoria afortunada: la MEDIANA remuestreada es ${eur(q(boot[BASE + " pts"].dd, 0.5))} y el
     5% peor llega a ${eur(q(boot[BASE + " pts"].dd, 0.05))}. Con ${eur(EFECTIVO)} en caja NINGÚN ancho se financia a sí mismo
     en su propia cola. Ese es el problema a resolver antes que el ancho.
`);

console.log("\n## RESUMEN-JSON\n");
const salida = {
  periodo: [filas[0].fecha, filas[filas.length - 1].fecha], dias: filas.length, anos: ANOS,
  pruebas: PRUEBAS, listonT: LISTON, cuenta: CUENTA, efectivo: EFECTIVO, masAnchaQueCabe: masAncha.lab,
  porAla: Object.fromEntries(VARIANTES.map((V) => { const m = M[V.lab]; return [V.lab, {
    n: m.n, saltados: m.saltados, desviosAncho: desvios[V.lab],
    alAno: m.alAno, total: m.total, media: m.media, acierto: m.acierto, credMedio: m.credMedio,
    credCortos: m.credCorto, costeAlas: m.costeAlas,
    peorDia: m.peorDia, p1: m.p1, p5: m.p5, p10: m.p10,
    dd: m.dd, ddIni: m.ddIni, ddFin: m.ddFin, retornoPorRacha: m.alAno / -m.dd,
    colMediano: m.colMediano, colMax: m.colMax, signos: signos[V.lab],
    precioVsBase: precio[V.lab], escalado: escalado[V.lab], aIgualIngreso: igualIngreso[V.lab],
    bootstrap: { ddP5: q(boot[V.lab].dd, 0.05), ddMediana: q(boot[V.lab].dd, 0.5), ddP95: q(boot[V.lab].dd, 0.95),
                 ratioP5: q(boot[V.lab].ratio, 0.05), ratioMediana: q(boot[V.lab].ratio, 0.5),
                 ratioP95: q(boot[V.lab].ratio, 0.95), bateAlaBase: bat[V.lab] },
  }]; })),
};
writeFileSync("scripts/cola-1-ala-salida.json", JSON.stringify(salida, null, 1), "utf8");
console.log(JSON.stringify(salida.porAla, null, 1));
console.log("\n   guardado en scripts/cola-1-ala-salida.json");
