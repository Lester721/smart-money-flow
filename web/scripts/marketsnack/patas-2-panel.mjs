// PATAS SUELTAS · PASO 2 — PANEL TICKER-DÍA
//
// Extrae del flujo SÓLO los 27 roots que tienen cierres reales y construye, por ticker y día:
//   · desequilibrio DIRECCIONAL  = Σ prima × lado × (call?+1:−1) / Σ prima clasificada
//     (lado: compran con prisa +1 · venden con prisa −1 · MIDMKT no cuenta)
//   · el mismo, calculado TRES veces: con TODAS las operaciones, sólo con las SUELTAS
//     (single leg) y sólo con las MULTI-PATA. Así se puede comparar separar vs no separar.
//   · dos definiciones de "multi-pata": ESTRICTA (la de MarketSnack: MLET/MLAT/MLCT/MLFT/
//     CBMO/MCTP) y ANCHA (además MESL/MFSL/MASL, los "against single leg(s)").
//
// Se descartan las condiciones CANCELADAS.
//
// Uso: node --import tsx scripts/marketsnack/patas-2-panel.mjs [1000k|100k]

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import rl from "node:readline";
import { TRADE_CONDITIONS, MULTI_LEG_CODES, CANCELED_CODES } from "../../lib/conditions.ts";
import { radiografia } from "../../lib/radiografia.ts";

const NIVEL = process.argv[2] || "100k";
const DIR = path.resolve(`scripts/cache-theta/marketsnack/flujo-${NIVEL}`);
const CIERRES = path.resolve("scripts/cache-theta/cierres");
const SALIDA = path.resolve(`scripts/marketsnack/patas-2-panel-${NIVEL}.json`);

const CODE = new Map(TRADE_CONDITIONS.map((c) => [c.id, c.code]));
const ANCHA = new Set([...MULTI_LEG_CODES, "MESL", "MFSL", "MASL"]);

const COMPRA = new Set(["ASKSIDE", "ABOVE_ASK", "AT_ASK"]);
const VENTA = new Set(["BIDSIDE", "BELOW_BID", "AT_BID"]);

// tickers con cierres reales en la ventana
const cierres = new Map();
for (const f of fs.readdirSync(CIERRES)) {
  const t = f.replace(".json", "");
  const j = JSON.parse(fs.readFileSync(path.join(CIERRES, f), "utf8"));
  if (Object.keys(j).some((d) => d >= "20260422")) cierres.set(t, j);
}
console.log(`═══ PANEL TICKER-DÍA · nivel ${NIVEL} ═══`);
console.log(`   tickers con cierre en la ventana: ${cierres.size}\n`);

const P = /^([A-Z]+)(\d{6})([CP])(\d{8})$/;
const dias = fs.readdirSync(DIR).filter((f) => f.endsWith(".jsonl.gz")).sort();

const panel = new Map();   // "TICK|dia" -> acumuladores
const muestraCampos = [];  // para radiografia()
let leidas = 0, nuestras = 0, canceladas = 0, sinLado = 0, sinPrima = 0, tarde = 0;

// CORTE HORARIO. Los ficheros llegan hasta las 20:58Z (16:58 ET), o sea DESPUÉS del cierre de
// las 16:00 ET. Si se decide al cierre con el día entero, una hora de flujo posterior al cierre
// entra en la decisión. Se corta a las 19:55Z (15:55 ET): se decide 5 minutos antes y se entra
// al cierre. El ISO viene en Z, así que se compara por trozo de texto — nada de zonas horarias.
const CORTE = "19:55";

const nuevo = (t, d) => ({
  t, d,
  // [todas, sueltasEstricta, multiEstricta, sueltasAncha, multiAncha]
  num: [0, 0, 0, 0, 0],      // Σ prima × lado × signoTipo
  den: [0, 0, 0, 0, 0],      // Σ prima clasificada (|lado|=1)
  n: [0, 0, 0, 0, 0],        // nº de operaciones clasificadas
  primaTotal: 0, nTotal: 0,
  nulosAsset: 0,
});

for (const f of dias) {
  const dia = f.replace(".jsonl.gz", "");
  const inp = fs.createReadStream(path.join(DIR, f)).pipe(zlib.createGunzip());
  for await (const l of rl.createInterface({ input: inp })) {
    if (!l.trim()) continue;
    let x; try { x = JSON.parse(l); } catch { continue; }
    leidas++;
    const code = CODE.get(x.trade_condition_id);
    if (code && CANCELED_CODES.has(code)) { canceladas++; continue; }
    const m = P.exec(x.symbol ?? "");
    if (!m) continue;
    const root = m[1];
    if (!cierres.has(root)) continue;
    const hhmm = (x.timestamp ?? "").slice(11, 16);
    if (!hhmm || hhmm > CORTE) { tarde++; continue; }
    nuestras++;
    if (muestraCampos.length < 80000 && nuestras % 5 === 0) {
      muestraCampos.push({ premium: x.premium, size: x.size, delta: x.delta, asset_price: x.asset_price, trade_condition_id: x.trade_condition_id, price: x.price });
    }
    const k = `${root}|${dia}`;
    let e = panel.get(k);
    if (!e) { e = nuevo(root, dia); panel.set(k, e); }
    e.nTotal++;
    e.primaTotal += x.premium ?? 0;
    if (x.asset_price == null) e.nulosAsset++;

    const prima = x.premium;
    if (!(prima > 0)) { sinPrima++; continue; }
    const lado = COMPRA.has(x.side) ? 1 : VENTA.has(x.side) ? -1 : 0;
    if (lado === 0) { sinLado++; continue; }
    const signo = m[3] === "C" ? 1 : -1;
    const aporte = prima * lado * signo;

    const esMultiE = !!(code && MULTI_LEG_CODES.has(code));
    const esMultiA = !!(code && ANCHA.has(code));
    const idx = [0, esMultiE ? -1 : 1, esMultiE ? 2 : -1, esMultiA ? -1 : 3, esMultiA ? 4 : -1];
    for (const i of idx) {
      if (i < 0) continue;
      e.num[i] += aporte; e.den[i] += prima; e.n[i]++;
    }
  }
}

console.log(`   filas leídas: ${leidas.toLocaleString("es-ES")}`);
console.log(`   canceladas descartadas: ${canceladas.toLocaleString("es-ES")}`);
console.log(`   descartadas por posteriores a las ${CORTE}Z: ${tarde.toLocaleString("es-ES")} (de nuestros tickers)`);
console.log(`   filas de nuestros 27 tickers: ${nuestras.toLocaleString("es-ES")} (${((nuestras / leidas) * 100).toFixed(1)}%)`);
console.log(`   sin prima > 0: ${sinPrima}  ·  MIDMKT (sin lado): ${sinLado} (${((sinLado / nuestras) * 100).toFixed(1)}%)`);
console.log(`   celdas ticker-día: ${panel.size.toLocaleString("es-ES")}\n`);

// Los campos que ESTA medición usa de verdad. asset_price y delta NO se usan (asset_price está
// roto antes del 16-jul y por eso se mide aparte, no aquí).
radiografia(muestraCampos, ["premium", "size", "trade_condition_id", "price"], `campos usados (muestra ${muestraCampos.length})`);
const nulosDelta = muestraCampos.filter((f) => f.delta == null).length;
const nulosAsset = muestraCampos.filter((f) => f.asset_price == null).length;
console.log(`  (no se usan) delta nulo ${((nulosDelta / muestraCampos.length) * 100).toFixed(1)}% · asset_price nulo ${((nulosAsset / muestraCampos.length) * 100).toFixed(1)}%`);

// ── nulos de asset_price antes/después de la ruptura (trampa 1 verificada) ──
let aA = 0, aN = 0, dA = 0, dN = 0;
for (const e of panel.values()) {
  if (e.d < "2026-07-16") { aA += e.nTotal; aN += e.nulosAsset; } else { dA += e.nTotal; dN += e.nulosAsset; }
}
console.log(`\n── RUPTURA 2026-07-16 (control) ──`);
console.log(`   asset_price nulo ANTES: ${((aN / aA) * 100).toFixed(1)}%  ·  DESPUÉS: ${((dN / dA) * 100).toFixed(1)}%`);
console.log(`   (esta medición NO usa asset_price; se comprueba sólo para confirmar que el corte es el correcto)`);

const filas = [...panel.values()].map((e) => ({
  t: e.t, d: e.d,
  desTodas: e.den[0] > 0 ? e.num[0] / e.den[0] : null,
  desSueltaE: e.den[1] > 0 ? e.num[1] / e.den[1] : null,
  desMultiE: e.den[2] > 0 ? e.num[2] / e.den[2] : null,
  desSueltaA: e.den[3] > 0 ? e.num[3] / e.den[3] : null,
  desMultiA: e.den[4] > 0 ? e.num[4] / e.den[4] : null,
  nTodas: e.n[0], nSueltaE: e.n[1], nMultiE: e.n[2], nSueltaA: e.n[3], nMultiA: e.n[4],
  primaTotal: e.primaTotal, nTotal: e.nTotal,
}));

fs.writeFileSync(SALIDA, JSON.stringify(filas));
console.log(`\n   escrito: ${SALIDA}  (${filas.length} filas)`);

// ── validación: abrir el fichero y contar ceros / nulos, no fiarse del recuento ──
const rel = JSON.parse(fs.readFileSync(SALIDA, "utf8"));
const cta = (k) => rel.filter((f) => f[k] == null).length;
console.log(`\n── VALIDACIÓN del fichero escrito ──`);
console.log(`   filas: ${rel.length}  ·  días distintos: ${new Set(rel.map((f) => f.d)).size}  ·  tickers: ${new Set(rel.map((f) => f.t)).size}`);
for (const k of ["desTodas", "desSueltaE", "desMultiE", "desSueltaA", "desMultiA"]) {
  const v = rel.map((f) => f[k]).filter((x) => x != null);
  const ceros = v.filter((x) => x === 0).length;
  console.log(`   ${k.padEnd(11)} nulos=${String(cta(k)).padStart(5)}  ceros=${String(ceros).padStart(5)}  ` +
    `min=${Math.min(...v).toFixed(3)}  max=${Math.max(...v).toFixed(3)}  media=${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(4)}`);
}
const nMed = rel.map((f) => f.nSueltaE).sort((a, b) => a - b);
console.log(`   nSueltaE por celda: mediana=${nMed[Math.floor(nMed.length / 2)]}  p10=${nMed[Math.floor(nMed.length * 0.1)]}  p90=${nMed[Math.floor(nMed.length * 0.9)]}`);
