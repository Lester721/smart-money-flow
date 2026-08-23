// ══════════════════════════════════════════════════════════════════════════════════════════
// «VENDER CUANDO EL ÍNDICE YA SE HA MOVIDO» — el espejo de comprar puts en el desplome
// ══════════════════════════════════════════════════════════════════════════════════════════
//
// QUÉ MIDE, en palabras llanas
// ----------------------------
// El cóndor cobra una prima y a cambio se queda con el riesgo de que el índice se mueva mucho
// más de lo previsto. La pregunta de este encargo es una sola:
//
//     los días en que el índice YA se ha movido mucho antes de la hora de entrar,
//     ¿el cóndor cobra MÁS de lo que le cuesta ese riesgo extra?
//
// Dos termómetros del propio día, los dos SIN MODELOS (nada de Black-Scholes, prohibido):
//
//   1. EL MOVIMIENTO YA OCURRIDO. El recorrido del SPX desde las 09:35 hasta la hora de entrada,
//      DIVIDIDO POR EL NIVEL DEL ÍNDICE. En por ciento y no en puntos: 25 puntos eran el 0,62 %
//      en 2022 y el 0,35 % en 2026, y esa confusión ya infló un hallazgo del encargo anterior.
//      Se miden las dos formas del "recorrido":
//         · RANGO   = (máximo − mínimo del tramo) / nivel      → cuánto se ha agitado
//         · DESPLAZ = |spot(entrada) − spot(09:35)| / nivel     → cuánto se ha ido de sitio
//
//   2. LA CUÑA AL DINERO A LAS 09:35 = call ATM al ask + put ATM al ask, dividida por el nivel.
//      Es lo que el mercado PAGA por el movimiento del día, dicho por los precios y no por un
//      modelo. Cuña cara = el mercado espera jaleo.
//
// Los días se parten en CINCO MONTONES por cada termómetro y se enseña la escalera completa
// del cóndor en cada montón: dinero al año, mediana, peor día, días tocados, días de pérdida
// total y año a año.
//
// POR QUÉ AHORA Y NO ANTES
// ------------------------
// La memoria dice que 16 regímenes medidos NO filtran al cóndor porque el crédito compensa el
// riesgo extra (por eso el VIX sale plano). Pero todo eso se midió con entrada a las 11:00.
// Lo que NO se había mirado es la TARDE, y el mapa de las 12.780 parejas de horas dice que el
// reloj de la tarde es una máquina de moler para el que COMPRA. Aquí se mira el otro lado:
// entradas a las 11:00, 12:00, 13:00, 14:00, 14:30 y 15:00.
//
// REGLAS DE LA CASA QUE SE CUMPLEN AQUÍ
// -------------------------------------
//   · Precios REALES con el peaje de las cuatro patas y dos veces (lo hace estructura()).
//   · Sólo el pasado: en la barra i sólo se miran barras 0..i. Las medias de 5 y 50 días usan
//     CIERRES DE DÍAS ANTERIORES, nunca el cierre de hoy (a las 11:00 nadie lo conoce).
//   · Un hueco no es un cero: estructura() devuelve null y se cuenta aparte.
//   · Calendario real: 1.123 días de 2022-01-03 a 2026-08-10 = 4,60 años. Se divide entre 4,60.
//   · Nada de medias solas: mediana, peor día, pérdidas totales, caja acumulada, caída máxima,
//     año a año, y qué pasa al quitar los 5 mejores y los 5 peores días.
//
// EL LISTÓN: «LOS TRES SÍES» medido POR MÍ sobre estos mismos días, para comparar manzanas con
// manzanas (11:00 · SPX sobre su MA5 y su MA50 · cóndor ±45 alas 50 · sólo si paga ≥ $100).
// ══════════════════════════════════════════════════════════════════════════════════════════

import {
  diasDisponibles, cargarDia, estructura, condor, idxHora, hayHora, rejilla,
} from "./lib0dte.mjs";

const ANCHO = 45;      // el cóndor de la casa: vende a ±45
const ALA   = 50;      // y compra 50 puntos más lejos
const ANOS  = 4.60;    // calendario REAL, 244 días de mercado al año
const HORAS = ["11:00", "12:00", "13:00", "14:00", "14:30", "15:00"];

// ─── utilidades de estadística, sin griegas ────────────────────────────────────────────────
const suma    = (v) => v.reduce((a, b) => a + b, 0);
const media   = (v) => (v.length ? suma(v) / v.length : NaN);
const mediana = (v) => {
  if (!v.length) return NaN;
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const tDe = (v) => {
  if (v.length < 2) return NaN;
  const m = media(v);
  const sd = Math.sqrt(suma(v.map((x) => (x - m) ** 2)) / (v.length - 1));
  return sd ? (m * Math.sqrt(v.length)) / sd : NaN;
};
/** caja acumulada y su caída máxima desde el máximo anterior (en dólares) */
function caja(v) {
  let acc = 0, pico = 0, caida = 0, minCaja = 0;
  for (const x of v) {
    acc += x;
    if (acc > pico) pico = acc;
    if (pico - acc > caida) caida = pico - acc;
    if (acc < minCaja) minCaja = acc;
  }
  return { final: acc, caidaMax: caida, minCaja };
}
const f0 = (x) => (Number.isFinite(x) ? x.toLocaleString("es-ES", { maximumFractionDigits: 0 }) : "—");
const f2 = (x) => (Number.isFinite(x) ? x.toFixed(2) : "—");

// ══════════════════════════════════════════════════════════════════════════════════════════
// PASADA ÚNICA sobre los 1.123 días. Cargar todos los días a memoria a la vez no cabe
// (26 millones de precios), así que cada día se carga, se exprime y se tira; sólo se guarda
// una fila compacta por día.
// ══════════════════════════════════════════════════════════════════════════════════════════
const dias = diasDisponibles();
console.log(`Días con cadena 0DTE: ${dias.length}  (${dias[0]} → ${dias[dias.length - 1]})`);

const filas = [];
const cierres = [];          // cierres de días ANTERIORES, para las medias
let sinBarra = 0, huecosTot = 0, sinCuna = 0;
const t0 = Date.now();

for (const d of dias) {
  const dia = cargarDia(d);
  if (!dia) { sinBarra++; continue; }
  const B = dia.barras;
  if (B.length !== 78 || B[0].t !== "09:35" || B[77].t !== "16:00") { sinBarra++; continue; }

  const spot0 = B[0].spot;
  const cierreHoy = B[77].spot;

  // ── medias móviles con cierres de días ANTERIORES (nunca el de hoy) ──────────────────────
  const ma = (k) => (cierres.length >= k ? media(cierres.slice(-k)) : null);
  const ma5 = ma(5), ma50 = ma(50);

  // ── la cuña al dinero a las 09:35: call ATM al ask + put ATM al ask ──────────────────────
  const Katm = rejilla(spot0);
  const cA = B[0].o.get(Katm + "C")?.[1] ?? null;
  const pA = B[0].o.get(Katm + "P")?.[1] ?? null;
  const cunaPct = cA != null && pA != null && cA > 0 && pA > 0 ? ((cA + pA) / spot0) * 100 : null;
  if (cunaPct == null) sinCuna++;

  const fila = { dia: d, ano: +d.slice(0, 4), spot0, cierre: cierreHoy, cunaPct, ma5, ma50, h: {} };

  for (const hh of HORAS) {
    if (hayHora(dia, hh) < 0) { fila.h[hh] = null; continue; }
    const i = idxHora(dia, hh);
    const S = B[i].spot;

    // movimiento YA OCURRIDO desde las 09:35 hasta esta hora, en % del nivel
    let mx = -Infinity, mn = Infinity;
    for (let j = 0; j <= i; j++) { const s = B[j].spot; if (s > mx) mx = s; if (s < mn) mn = s; }
    const rangoPct = ((mx - mn) / S) * 100;
    const despPct  = (Math.abs(S - spot0) / S) * 100;

    const centro = rejilla(S);
    const r = estructura(dia, i, "vencimiento", condor(centro, ANCHO, ALA));
    if (!r) { huecosTot++; fila.h[hh] = { rangoPct, despPct, hueco: true }; continue; }

    // ¿el índice acabó fuera de los strikes vendidos? ¿y los tocó en algún momento tras entrar?
    const tocadoCierre = Math.abs(cierreHoy - centro) > ANCHO;
    let tocadoIntra = false;
    for (let j = i; j < 78; j++) if (Math.abs(B[j].spot - centro) > ANCHO) { tocadoIntra = true; break; }
    const perdidaTotal = r.dolares <= -r.riesgoMax + 0.5;

    fila.h[hh] = {
      rangoPct, despPct, centro, spotEntrada: S,
      creditoUSD: r.credito * 100,
      dolares: r.dolares,
      riesgoMax: r.riesgoMax,
      tocadoCierre, tocadoIntra, perdidaTotal, hueco: false,
    };
  }

  filas.push(fila);
  cierres.push(cierreHoy);
}

console.log(`Pasada completa en ${((Date.now() - t0) / 1000).toFixed(0)} s`);
console.log(`Días usados: ${filas.length} · días descartados por barras: ${sinBarra} · ` +
            `huecos de estructura (día×hora): ${huecosTot} · días sin cuña ATM: ${sinCuna}`);

// ─── SANIDAD: rango de créditos del cóndor ±45/50, que debe caer entre ~$20 y ~$600 ────────
console.log("\n═══ SANIDAD — crédito del cóndor ±45 alas 50 (USD por contrato) ═══");
for (const hh of HORAS) {
  const c = filas.map((f) => f.h[hh]).filter((x) => x && !x.hueco).map((x) => x.creditoUSD).sort((a, b) => a - b);
  if (!c.length) { console.log(`${hh}  sin datos`); continue; }
  const q = (p) => c[Math.min(c.length - 1, Math.floor(p * c.length))];
  console.log(`${hh}  n=${c.length}  min $${f0(c[0])}  p10 $${f0(q(0.10))}  mediana $${f0(q(0.50))}  ` +
              `p90 $${f0(q(0.90))}  max $${f0(c[c.length - 1])}`);
}
const cun = filas.map((f) => f.cunaPct).filter((x) => x != null).sort((a, b) => a - b);
console.log(`Cuña ATM 09:35 (% del nivel): n=${cun.length}  min ${f2(cun[0])}%  ` +
            `mediana ${f2(cun[cun.length >> 1])}%  max ${f2(cun[cun.length - 1])}%`);

// ══════════════════════════════════════════════════════════════════════════════════════════
// EL LISTÓN — «LOS TRES SÍES» medido por mí sobre estos mismos días
// ══════════════════════════════════════════════════════════════════════════════════════════
const LISTON = [];
for (const f of filas) {
  const x = f.h["11:00"];
  if (!x || x.hueco) continue;
  if (f.ma5 == null || f.ma50 == null) continue;
  // los dos síes de tendencia: el SPX a las 11:00 por encima de sus medias de 5 y 50 cierres
  if (!(x.spotEntrada > f.ma5 && x.spotEntrada > f.ma50)) continue;
  if (!(x.creditoUSD >= 100)) continue;                      // el tercer sí: paga ≥ $100
  LISTON.push({ ...x, ano: f.ano, dia: f.dia });
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// INFORME de un conjunto de operaciones
// ══════════════════════════════════════════════════════════════════════════════════════════
function escalera(ops, etiqueta) {
  const v = ops.map((o) => o.dolares);
  const c = caja(v);
  const porAno = {};
  for (const o of ops) (porAno[o.ano] ??= []).push(o.dolares);
  const anos = Object.keys(porAno).sort();
  return {
    etiqueta,
    n: v.length,
    total: suma(v),
    porAnoDolares: suma(v) / ANOS,
    mediaOp: media(v),
    medianaOp: mediana(v),
    peorDia: v.length ? Math.min(...v) : NaN,
    mejorDia: v.length ? Math.max(...v) : NaN,
    aciertos: v.length ? v.filter((x) => x > 0).length / v.length : NaN,
    t: tDe(v),
    tocadosCierre: ops.filter((o) => o.tocadoCierre).length,
    tocadosIntra: ops.filter((o) => o.tocadoIntra).length,
    perdidasTotales: ops.filter((o) => o.perdidaTotal).length,
    cajaFinal: c.final,
    caidaMax: c.caidaMax,
    creditoMedio: media(ops.map((o) => o.creditoUSD)),
    anos: anos.map((a) => ({ ano: a, n: porAno[a].length, total: suma(porAno[a]) })),
    v,
  };
}
function pinta(e) {
  console.log(
    `${e.etiqueta.padEnd(26)} n=${String(e.n).padStart(4)}  ` +
    `$/año ${String(f0(e.porAnoDolares)).padStart(8)}  ` +
    `med $${String(f0(e.medianaOp)).padStart(5)}  ` +
    `media $${String(f0(e.mediaOp)).padStart(6)}  ` +
    `peor $${String(f0(e.peorDia)).padStart(7)}  ` +
    `acierto ${(e.aciertos * 100).toFixed(0)}%  ` +
    `tocados ${String(e.tocadosCierre).padStart(3)}  ` +
    `totales ${String(e.perdidasTotales).padStart(3)}  ` +
    `caída $${String(f0(e.caidaMax)).padStart(7)}  ` +
    `t ${f2(e.t)}  créd $${f0(e.creditoMedio)}`
  );
}

const L = escalera(LISTON, "LOS TRES SÍES (11:00)");
console.log("\n═══ EL LISTÓN, medido por mí sobre estos mismos días ═══");
pinta(L);
console.log("  año a año: " + L.anos.map((a) => `${a.ano}: $${f0(a.total)} (n=${a.n})`).join(" · "));

// ── ¿por qué mi listón no da los $11.552 de la ficha? el calentamiento de la MA50 ──────────
// La MA de 50 cierres necesita 50 días previos, así que los ~50 primeros días de 2022 (año de
// créditos altos) se caen de mi medición. Variante con calentamiento tolerante: se usa la
// media de los cierres DISPONIBLES desde el día 10, para ver cuánto de la diferencia es eso.
const LISTON_CAL = [];
{
  const cs = [];
  for (const f of filas) {
    const x = f.h["11:00"];
    const ma = (k) => (cs.length >= 10 ? media(cs.slice(-Math.min(k, cs.length))) : null);
    const m5 = ma(5), m50 = ma(50);
    if (x && !x.hueco && m5 != null && m50 != null &&
        x.spotEntrada > m5 && x.spotEntrada > m50 && x.creditoUSD >= 100) {
      LISTON_CAL.push({ ...x, ano: f.ano, dia: f.dia });
    }
    cs.push(f.cierre);
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// LA ESCALERA POR MONTONES — cinco montones por cada termómetro, hora a hora
// ══════════════════════════════════════════════════════════════════════════════════════════
/** parte en 5 montones por el valor de `clave`, de menor a mayor */
function quintiles(ops, clave) {
  const s = [...ops].sort((a, b) => a[clave] - b[clave]);
  const out = [];
  for (let q = 0; q < 5; q++) {
    const a = Math.floor((q * s.length) / 5), b = Math.floor(((q + 1) * s.length) / 5);
    const trozo = s.slice(a, b);
    out.push({ q: q + 1, trozo, lo: trozo[0]?.[clave], hi: trozo[trozo.length - 1]?.[clave] });
  }
  return out;
}

const opsDe = (hh, extra = {}) =>
  filas
    .map((f) => (f.h[hh] && !f.h[hh].hueco ? { ...f.h[hh], ano: f.ano, dia: f.dia, cunaPct: f.cunaPct } : null))
    .filter((o) => o && (extra.cuna ? o.cunaPct != null : true));

const resultados = {};

for (const termometro of ["rangoPct", "despPct", "cunaPct"]) {
  console.log(`\n\n████ MONTONES POR ${
    termometro === "rangoPct" ? "MOVIMIENTO YA OCURRIDO — RANGO (máx−mín desde 09:35) / nivel"
    : termometro === "despPct" ? "MOVIMIENTO YA OCURRIDO — DESPLAZAMIENTO |S−S(09:35)| / nivel"
    : "CUÑA AL DINERO DE LAS 09:35 (call ask + put ask) / nivel"} ████`);

  for (const hh of HORAS) {
    const ops = opsDe(hh, { cuna: termometro === "cunaPct" });
    if (ops.length < 100) continue;
    console.log(`\n── entrada ${hh} ────────────────────────────────────────────────────────────`);
    const todo = escalera(ops, `TODOS los días ${hh}`);
    pinta(todo);
    resultados[`${hh}|todos`] = todo;
    for (const g of quintiles(ops, termometro)) {
      const e = escalera(g.trozo, `Q${g.q} [${f2(g.lo)}%–${f2(g.hi)}%]`);
      pinta(e);
      resultados[`${hh}|${termometro}|Q${g.q}`] = e;
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════
// LA CRIBA — se aplica a la mejor variante que salga
// ══════════════════════════════════════════════════════════════════════════════════════════
function criba(e, nombre) {
  const v = e.v;
  const s = [...v].sort((a, b) => a - b);
  const sinMejores = s.slice(0, Math.max(0, s.length - 5));
  const sinPeores  = s.slice(Math.min(5, s.length));
  const mitad = Math.floor(v.length / 2);
  const m1 = suma(v.slice(0, mitad)) / (ANOS / 2);
  const m2 = suma(v.slice(mitad)) / (ANOS / 2);
  const t3 = Math.floor(v.length / 3);
  const tercios = [
    suma(v.slice(0, t3)), suma(v.slice(t3, 2 * t3)), suma(v.slice(2 * t3)),
  ];
  console.log(`\n═══ CRIBA de «${nombre}» ═══`);
  console.log(`  n=${e.n} · $/año ${f0(e.porAnoDolares)} · t ${f2(e.t)} · acierto ${(e.aciertos * 100).toFixed(0)}%`);
  console.log(`  mediana $${f0(e.medianaOp)} · peor día $${f0(e.peorDia)} · mejor día $${f0(e.mejorDia)}`);
  console.log(`  días tocados al cierre ${e.tocadosCierre} (${(100 * e.tocadosCierre / e.n).toFixed(1)}%) · ` +
              `tocados en algún momento ${e.tocadosIntra} · pérdidas del riesgo entero ${e.perdidasTotales}`);
  console.log(`  caja final $${f0(e.cajaFinal)} · caída máxima $${f0(e.caidaMax)}`);
  console.log(`  sin los 5 MEJORES días: $${f0(suma(sinMejores) / ANOS)}/año`);
  console.log(`  sin los 5 PEORES  días: $${f0(suma(sinPeores) / ANOS)}/año`);
  console.log(`  mitad 1: $${f0(m1)}/año · mitad 2: $${f0(m2)}/año`);
  console.log(`  tercios: ${tercios.map((x) => "$" + f0(x)).join(" · ")}`);
  console.log(`  año a año: ` + e.anos.map((a) => `${a.ano}: $${f0(a.total)} (n=${a.n})`).join(" · "));
  return {
    sinCinco: suma(sinMejores) / ANOS,
    sinCincoPeores: suma(sinPeores) / ANOS,
    mitad1: m1, mitad2: m2,
    tercios: tercios.map((x) => "$" + f0(x)).join(" · "),
  };
}

criba(L, "LOS TRES SÍES (el listón)");

// diagnóstico: qué filtro poda cuántos días (mi listón dispara 47 veces/año — la ficha da
// $11.552, así que o dispara más veces o el filtro está definido de otra manera)
{
  let base = 0, pasaMA = 0, pasaCred = 0, pasaAmbos = 0;
  for (const f of filas) {
    const x = f.h["11:00"];
    if (!x || x.hueco || f.ma5 == null || f.ma50 == null) continue;
    base++;
    const ma = x.spotEntrada > f.ma5 && x.spotEntrada > f.ma50;
    const cr = x.creditoUSD >= 100;
    if (ma) pasaMA++;
    if (cr) pasaCred++;
    if (ma && cr) pasaAmbos++;
  }
  console.log(`\n  [diagnóstico del listón] días con dato: ${base} · pasan las DOS medias: ${pasaMA} ` +
              `(${(100 * pasaMA / base).toFixed(0)}%) · pagan ≥$100: ${pasaCred} ` +
              `(${(100 * pasaCred / base).toFixed(0)}%) · pasan los TRES: ${pasaAmbos} ` +
              `(${(100 * pasaAmbos / base).toFixed(0)}%) = ${(pasaAmbos / ANOS).toFixed(0)} operaciones/año`);
}

const LC = escalera(LISTON_CAL, "TRES SÍES (MA tolerante)");
console.log("\n═══ EL LISTÓN con calentamiento tolerante de la MA50 ═══");
pinta(LC);
console.log("  año a año: " + LC.anos.map((a) => `${a.ano}: $${f0(a.total)} (n=${a.n})`).join(" · "));

// ── LA PREGUNTA ÚTIL: ¿mejora el listón si le AÑADO un filtro de movimiento? ──────────────
console.log("\n\n═══ ¿MEJORA «LOS TRES SÍES» SI LE AÑADO UN TERMÓMETRO? (tercios, n≈72) ═══");
for (const clave of ["rangoPct", "despPct", "cunaPct"]) {
  const base = LISTON.map((o) => ({ ...o, cunaPct: filas.find((f) => f.dia === o.dia)?.cunaPct }))
                     .filter((o) => o[clave] != null);
  const s = [...base].sort((a, b) => a[clave] - b[clave]);
  console.log(`\n  · por ${clave} (n=${s.length})`);
  for (let q = 0; q < 3; q++) {
    const a = Math.floor((q * s.length) / 3), b = Math.floor(((q + 1) * s.length) / 3);
    const tr = s.slice(a, b);
    const e = escalera(tr, `    T${q + 1} [${f2(tr[0][clave])}%–${f2(tr[tr.length - 1][clave])}%]`);
    pinta(e);
  }
}

// las candidatas: cada quintil de cada termómetro de cada hora, ordenadas por $/año
const cand = Object.entries(resultados)
  .filter(([k]) => !k.endsWith("|todos"))
  .map(([k, e]) => ({ k, e }))
  .sort((a, b) => b.e.porAnoDolares - a.e.porAnoDolares);

console.log("\n\n═══ LAS 10 MEJORES CASILLAS por $/año ═══");
for (const { k, e } of cand.slice(0, 10)) {
  console.log(`${k.padEnd(30)} $/año ${String(f0(e.porAnoDolares)).padStart(8)}  n=${e.n}  ` +
              `t ${f2(e.t)}  caída $${f0(e.caidaMax)}  peor $${f0(e.peorDia)}  ` +
              `años negativos: ${e.anos.filter((a) => a.total < 0).map((a) => a.ano).join(",") || "ninguno"}`);
}
console.log("\n═══ LAS 5 PEORES CASILLAS ═══");
for (const { k, e } of cand.slice(-5)) {
  console.log(`${k.padEnd(30)} $/año ${String(f0(e.porAnoDolares)).padStart(8)}  n=${e.n}  t ${f2(e.t)}`);
}

// criba completa a las tres mejores
for (const { k, e } of cand.slice(0, 3)) criba(e, k);

// ── ¿el crédito compensa el riesgo? la comprobación directa ────────────────────────────────
console.log("\n\n═══ ¿EL CRÉDITO COMPENSA EL RIESGO? crédito medio y % tocados por montón ═══");
for (const hh of HORAS) {
  const ops = opsDe(hh);
  if (ops.length < 100) continue;
  const qs = quintiles(ops, "rangoPct");
  console.log(`${hh}  ` + qs.map((g) => {
    const cr = media(g.trozo.map((o) => o.creditoUSD));
    const to = 100 * g.trozo.filter((o) => o.tocadoCierre).length / g.trozo.length;
    return `Q${g.q}: créd $${f0(cr)} / tocados ${to.toFixed(0)}%`;
  }).join("  ·  "));
}

// ── volcado compacto para el informe ───────────────────────────────────────────────────────
console.log("\n\n═══ RESUMEN MÁQUINA ═══");
console.log(JSON.stringify({
  dias: filas.length, huecos: huecosTot, sinBarra,
  liston: { n: L.n, porAno: L.porAnoDolares, caida: L.caidaMax, t: L.t },
  top: cand.slice(0, 5).map(({ k, e }) => ({ k, n: e.n, porAno: e.porAnoDolares, t: e.t, caida: e.caidaMax })),
}, null, 1));
