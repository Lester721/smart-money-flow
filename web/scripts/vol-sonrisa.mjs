// VOLATILIDAD · PASO 1 — sacar la SONRISA de la cadena a las 11:00, día a día, 1.123 días.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/vol-sonrisa.mjs
//
// camino-1123-filas.json ya trae la IV del DINERO en cada marca de 5 minutos, pero no trae la
// forma de la curva. Y la forma es media hipótesis del encargo: "cuando el mercado paga poco por
// vender, el riesgo está mal pagado" se mide comparando lo que cuesta la cola contra el centro.
//
// SE GUARDA LA CURVA EN DOS UNIDADES, a propósito:
//   · en PUNTOS FIJOS (±25 y ±75) — que es donde de verdad se vende y se compra
//   · en MONEYNESS (±0,5% y ±1,5%) — adimensional, la única que se puede comparar entre 2022,
//     cuando el índice estaba en 4.000, y 2026, con el índice en 6.900
//
// La anatomía ya enseñó que ésta es LA trampa: los ±25 puntos eran el 0,61% del índice en 2022-23
// y el 0,41% en 2024-26 (t=36,6). Un umbral escrito en puntos se endurece solo con el tiempo, y
// eso se disfraza de hallazgo. Por eso las dos unidades viajan juntas hasta el final.
//
// Lado OTM únicamente: la IV de una call por debajo del dinero (o una put por encima) es ruido
// numérico sobre una opción que es casi todo valor intrínseco. Calls para strikes ≥ spot, puts
// para strikes ≤ spot, y en el dinero se promedian las dos.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";

const DIR = "scripts/cache-theta/gex-2026";
const OUT = "scripts/vol-sonrisa.json";
const MARCA = "T11:00:00";

const C_STRIKE = 2, C_BID = 5, C_IV = 8, C_ASK = 9;

/** Campo n-ésimo (0-based) de una línea CSV. */
function campo(L, n) {
  let ini = 0;
  for (let k = 0; k < n; k++) { ini = L.indexOf(",", ini) + 1; if (ini === 0) return ""; }
  const fin = L.indexOf(",", ini);
  return fin < 0 ? L.slice(ini) : L.slice(ini, fin);
}

/**
 * Saca SÓLO las filas de las 11:00 de un fichero, sin partir el resto en líneas.
 * Busca la marca de tiempo y retrocede al salto de línea anterior: 5,2 GB no se pueden
 * trocear entero 2.246 veces.
 */
function filas1100(path) {
  const txt = readFileSync(path, "utf8");
  const out = [];
  const vistas = new Set();
  let i = 0;
  for (;;) {
    const p = txt.indexOf(MARCA, i);
    if (p < 0) break;
    i = p + MARCA.length;
    const a = txt.lastIndexOf("\n", p) + 1;
    if (vistas.has(a)) continue;                 // la marca sale 2 veces por fila (opción + subyacente)
    vistas.add(a);
    let b = txt.indexOf("\n", p);
    if (b < 0) b = txt.length;
    out.push(txt.slice(a, b).trim());
  }
  return out;
}

/** Curva de IV del lado fuera del dinero de un fichero. */
function curva(path, esCall) {
  const lin = filas1100(path);
  if (!lin.length) return null;
  let spot = 0;
  const pts = [];
  for (const L of lin) {
    const up = Number(L.slice(L.lastIndexOf(",") + 1));
    if (up > 0) spot = up;
    const K = Number(campo(L, C_STRIKE));
    const iv = Number(campo(L, C_IV));
    const bid = Number(campo(L, C_BID)), ask = Number(campo(L, C_ASK));
    // una opción sin ask no se puede comprar y su IV no representa un precio de mercado
    if (K > 0 && iv > 0 && ask > 0 && bid >= 0) pts.push({ K, iv, bid, ask });
  }
  if (!(spot > 0) || !pts.length) return null;
  // sólo el lado fuera del dinero, y sólo lo que está a menos de un 6% (más allá la IV se dispara
  // por el tick mínimo: una opción que vale $0,05 tiene la IV que quiera)
  const lado = pts.filter((p) => (esCall ? p.K >= spot * 0.999 : p.K <= spot * 1.001)
                                 && Math.abs(p.K / spot - 1) <= 0.06);
  return { spot, lado, n: pts.length };
}

/** IV interpolada del strike más cercano a un objetivo; null si el más cercano queda lejos. */
function ivEn(lado, objetivo, tolPts) {
  if (!lado.length) return null;
  const m = lado.reduce((a, b) => (Math.abs(b.K - objetivo) < Math.abs(a.K - objetivo) ? b : a));
  return Math.abs(m.K - objetivo) <= tolPts ? m : null;
}

const fechas = [...new Set(
  readdirSync(DIR).map((f) => (f.match(/^iv_(\d{4}-\d{2}-\d{2})_C\.csv$/) || [])[1]).filter(Boolean),
)].sort();
console.log(`## ${fechas.length} días de cadena`);

const res = {};
const motivos = {};
const t0 = Date.now();
for (let i = 0; i < fechas.length; i++) {
  const fecha = fechas[i];
  if (i % 50 === 0) console.log(`   ${i}/${fechas.length} · ${fecha} · ${((Date.now() - t0) / 1000).toFixed(0)}s · ${Object.keys(res).length} ok`);
  const fC = `${DIR}/iv_${fecha}_C.csv`, fP = `${DIR}/iv_${fecha}_P.csv`;
  const falla = (m) => { motivos[m] = (motivos[m] ?? 0) + 1; };
  if (!existsSync(fC) || !existsSync(fP)) { falla("falta fichero"); continue; }
  const C = curva(fC, true), P = curva(fP, false);
  if (!C || !P) { falla("sin cadena a las 11:00"); continue; }
  const spot = C.spot;

  // tolerancia: la rejilla de SPXW es de 5 puntos cerca del dinero, así que 3 puntos basta
  const TOL = 6;
  const atmC = ivEn(C.lado, spot, TOL), atmP = ivEn(P.lado, spot, TOL);
  const c25 = ivEn(C.lado, spot + 25, TOL), p25 = ivEn(P.lado, spot - 25, TOL);
  const c75 = ivEn(C.lado, spot + 75, TOL), p75 = ivEn(P.lado, spot - 75, TOL);
  // en moneyness — la unidad que sí se puede comparar entre 2022 y 2026
  const cM05 = ivEn(C.lado, spot * 1.005, TOL), pM05 = ivEn(P.lado, spot * 0.995, TOL);
  const cM15 = ivEn(C.lado, spot * 1.015, TOL), pM15 = ivEn(P.lado, spot * 0.985, TOL);

  if (!atmC || !atmP) { falla("sin IV en el dinero"); continue; }

  res[fecha] = {
    spot: Number(spot.toFixed(2)),
    nStrikes: C.lado.length + P.lado.length,
    ivAtmC: atmC.iv, ivAtmP: atmP.iv,
    // el STRADDLE del dinero: el movimiento esperado que el mercado cotiza, en puntos y sin
    // modelo ninguno. Se guardan bid y ask por separado para no tener que usar el punto medio.
    kAtm: atmC.K, kAtmP: atmP.K,
    strBid: Number((atmC.bid + atmP.bid).toFixed(2)),
    strAsk: Number((atmC.ask + atmP.ask).toFixed(2)),
    ivC25: c25?.iv ?? null, ivP25: p25?.iv ?? null,
    ivC75: c75?.iv ?? null, ivP75: p75?.iv ?? null,
    ivC05: cM05?.iv ?? null, ivP05: pM05?.iv ?? null,
    ivC15: cM15?.iv ?? null, ivP15: pM15?.iv ?? null,
    kC25: c25?.K ?? null, kP25: p25?.K ?? null,
  };
}

writeFileSync(OUT, JSON.stringify(res), "utf8");
const dias = Object.keys(res).sort();
console.log(`\n## guardado ${OUT}`);
console.log(`   ${dias.length} días · motivos de descarte ${JSON.stringify(motivos)} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
const porAno = {};
for (const d of dias) porAno[d.slice(0, 4)] = (porAno[d.slice(0, 4)] ?? 0) + 1;
console.log("   por año:", JSON.stringify(porAno));
for (const c of ["ivC25", "ivP25", "ivC75", "ivP75", "ivC05", "ivP05", "ivC15", "ivP15"]) {
  const v = dias.filter((d) => res[d][c] != null).length;
  console.log(`   ${c.padEnd(7)} presente en ${v}/${dias.length} (${((v / dias.length) * 100).toFixed(1)}%)`);
}
const nk = dias.map((d) => res[d].nStrikes).sort((a, b) => a - b);
console.log(`   strikes usados por día: mín ${nk[0]} · mediana ${nk[nk.length >> 1]} · máx ${nk.at(-1)}`);
