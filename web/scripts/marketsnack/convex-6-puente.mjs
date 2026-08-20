// ═══ CONVEXIDAD · PASO 6 — EL PUENTE: ¿QUÉ HABRÍA QUE CAMBIAR? ══════════════════════════
//
// La autopsia encontró DOS fallos que no son de MarketSnack, son MÍOS al construir la señal, y
// hasta arreglarlos el "no" no vale:
//
//   FALLO 1 · LA SEÑAL MIDE TAMAÑO DE MUESTRA, NO CONVICCIÓN.
//     s1 = (compra−venta)/(compra+venta) se satura en ±1 cuando hay POCAS operaciones. Un ticker
//     con 5 calls todas al ask da s1 = +1,00, el máximo posible. Por eso el top-3 eligió
//     JPM/UNH/CSCO/BA/WMT y no NVDA/TSLA, y por eso tenía 132 operaciones de flujo contra 197 de
//     media: la señal estaba seleccionando los tickers TRANQUILOS. Y los tranquilos se mueven
//     menos (|mov| 5,82% contra 8,34%) y tienen la horquilla más ancha.
//
//   FALLO 2 · LA HORQUILLA SE COMÍA LA VENTAJA.
//     A punto medio la elección de MS iba +2,1 puntos MEJOR que el azar. A precios reales iba
//     3,5 puntos PEOR. Los 5,7 puntos de diferencia son horquilla: 21,5% contra 17,5%.
//
// Aquí se arreglan los dos y se vuelve a preguntar. Si con los fallos corregidos MS sigue sin
// ganarle al azar, el "no" ya es del dato y no del que lo midió.
//
// Uso: node --import tsx --max-old-space-size=10240 scripts/marketsnack/convex-6-puente.mjs

import fs from "node:fs";
import path from "node:path";
import { listonT } from "../../lib/barreraHallazgos.ts";

const filas = JSON.parse(fs.readFileSync(path.join("scripts", "marketsnack", "convex-3-tabla.json"), "utf8"));
const CIE = path.join("scripts", "cache-theta", "cierres");
const CAD = path.join("scripts", "cache-theta", "cadenas");
const CUENTA = 56389, SORTEOS = 500;
let semilla = 20260820;
const rnd = () => { semilla = (semilla * 1103515245 + 12345) & 0x7fffffff; return semilla / 0x7fffffff; };
const media = (v) => v.reduce((s, x) => s + x, 0) / v.length;

const porT = new Map();
for (const f of fs.readdirSync(CAD)) { const m = f.match(/^([A-Z]+)_d(2026\d{4})\.json$/); if (!m) continue;
  if (!porT.has(m[1])) porT.set(m[1], []); porT.get(m[1]).push(m[2]); }
for (const v of porT.values()) v.sort();
const CAL = porT.get("SPY"); const idx = new Map(CAL.map((d, i) => [d, i]));
const cierres = {}; for (const t of porT.keys()) cierres[t] = JSON.parse(fs.readFileSync(path.join(CIE, `${t}.json`), "utf8"));
for (const f of filas) for (const H of [5, 10, 20, 40]) {
  const i1 = idx.get(f.dia) + H;
  if (i1 >= CAL.length) { f[`a${H}`] = null; continue; }
  const a = cierres[f.ticker][f.dia], b = cierres[f.ticker][CAL[i1]];
  f[`a${H}`] = (a > 0 && b > 0) ? Math.abs(Math.log(b / a)) : null;
}

function nw(serie, H) {
  const n = serie.length, m = media(serie), dev = serie.map((x) => x - m);
  const g0 = dev.reduce((s, x) => s + x * x, 0) / n;
  if (!(g0 > 0)) return { m, t: 0, nEf: n };
  let S = g0; const L = Math.max(0, H - 1);
  for (let k = 1; k <= L && k < n; k++) { let gk = 0; for (let i = k; i < n; i++) gk += dev[i] * dev[i - k]; S += 2 * (1 - k / (L + 1)) * (gk / n); }
  if (!(S > 0)) S = g0;
  return { m, t: m / Math.sqrt(S / n), nEf: Math.min(n, n * g0 / S) };
}

const C = filas.filter((f) => f.tipo === "C");

// ── ARREGLO 1: la señal encogida por tamaño de muestra ────────────────────────────────────
// s1e = (compra−venta)/(compra+venta+P0), con P0 = la prima MEDIANA de un día-ticker. Un ticker
// con poco flujo queda arrastrado hacia 0 en vez de saturarse en ±1. Es la corrección estándar
// de una proporción con pocos casos, no un parámetro elegido mirando el resultado.
const primas = C.map((f) => f.nCall).sort((a, b) => a - b);
console.log(`\n## nCall: mediana ${primas[Math.floor(primas.length / 2)]} · p10 ${primas[Math.floor(primas.length * .1)]} · p90 ${primas[Math.floor(primas.length * .9)]}`);

// Necesito la prima total por (día,ticker); la reconstruyo desde la tabla: no la guardé, así que
// uso nCall (nº de operaciones) como tamaño de muestra, que es lo que satura el cociente.
const N0 = primas[Math.floor(primas.length / 2)];        // mediana de operaciones
for (const f of filas) {
  f.s1e = f.s1 * (f.nCall / (f.nCall + N0));             // encogido hacia 0 si hay poco flujo
  f.s2e = f.s2 == null ? null : f.s2 * (f.nLargo / (f.nLargo + 20));
}

// ── EL BANCO DE PRUEBAS ──────────────────────────────────────────────────────────────────
function probar({ sen, H, K, campo, filtro, nombre }) {
  const rk = campo;
  const v = C.filter((f) => f[rk] != null && f[sen] != null && (!filtro || filtro(f)));
  const pd = new Map();
  for (const f of v) { if (!pd.has(f.dia)) pd.set(f.dia, []); pd.get(f.dia).push(f); }
  const ds = [...pd.keys()].sort().filter((d) => pd.get(d).length >= K + 2);
  if (ds.length < 20) return null;
  const serie = [], ele = [];
  for (const d of ds) {
    const c = [...pd.get(d)].sort((a, b) => b[sen] - a[sen]);
    const pick = c.slice(0, K); ele.push(...pick);
    serie.push(media(pick.map((x) => x[rk])) - media(c.map((x) => x[rk])));
  }
  const R = media(ele.map((x) => x[rk]));
  const nul = [];
  for (let s = 0; s < SORTEOS; s++) {
    const q = [];
    for (const d of ds) { const c = pd.get(d), is = new Set(); while (is.size < K) is.add(Math.floor(rnd() * c.length)); q.push(media([...is].map((i) => c[i][rk]))); }
    nul.push(media(q));
  }
  nul.sort((a, b) => a - b);
  const st = nw(serie, H);
  return { nombre, sen, H, K, dias: ds.length, bloques: Math.floor(ds.length / H), nEf: st.nEf,
    R, azar: media(nul), t: st.t, pctA: nul.filter((x) => x < R).length / SORTEOS,
    prima: media(ele.map((x) => x.ask * 100)), horq: media(ele.map((x) => x.horquilla)),
    nCall: media(ele.map((x) => x.nCall)), tickers: new Set(ele.map((x) => x.ticker)).size };
}

const pruebas = [];
const linea = (r) => r && console.log(
  `   ${r.nombre.padEnd(34)} | ${String(r.dias).padStart(3)} ${String(r.bloques).padStart(2)} ${r.nEf.toFixed(0).padStart(3)} |` +
  ` ${(r.R * 100).toFixed(1).padStart(7)}% ${(r.azar * 100).toFixed(1).padStart(7)}% ${((r.R - r.azar) * 100).toFixed(1).padStart(6)}% |` +
  ` ${r.t.toFixed(2).padStart(5)} ${(r.pctA * 100).toFixed(0).padStart(3)} | h ${(r.horq * 100).toFixed(0).padStart(2)}% ops ${r.nCall.toFixed(0).padStart(4)}`);

console.log(`\n═══ ARREGLO 1 · SEÑAL ENCOGIDA (deja de premiar al que tiene 5 operaciones) ═══`);
console.log(`   prueba                             | días bl nEf |    MS      azar   exceso |   t   %A | contrato`);
console.log(`   ` + "─".repeat(112));
for (const [sen, nom] of [["s1", "lado crudo"], ["s1e", "lado ENCOGIDO"], ["s2", "lado largo crudo"], ["s2e", "lado largo ENCOGIDO"]]) {
  for (const H of [10, 20]) {
    const r = probar({ sen, H, K: 3, campo: `r${H}`, nombre: `${nom} · H=${H} · retorno` });
    if (r) { pruebas.push(r); linea(r); }
  }
}

console.log(`\n═══ ARREGLO 2 · SÓLO CONTRATOS OPERABLES (horquilla ≤ 15% del ask) ═══`);
const tight = (f) => f.horquilla <= 0.15;
const nTight = C.filter((f) => f.r20 != null && tight(f)).length, nAll = C.filter((f) => f.r20 != null).length;
console.log(`   sobreviven ${nTight} de ${nAll} candidatos (${(100 * nTight / nAll).toFixed(0)}%)`);
console.log(`   prueba                             | días bl nEf |    MS      azar   exceso |   t   %A | contrato`);
console.log(`   ` + "─".repeat(112));
for (const [sen, nom] of [["s1", "lado crudo"], ["s1e", "lado ENCOGIDO"], ["s3", "inusualidad"]]) {
  for (const H of [10, 20]) {
    const r = probar({ sen, H, K: 3, campo: `r${H}`, filtro: tight, nombre: `${nom} + horquilla≤15% · H=${H}` });
    if (r) { pruebas.push(r); linea(r); }
  }
}

console.log(`\n═══ LOS DOS ARREGLOS + AMPLITUD (la pregunta de verdad: ¿movimientos grandes?) ═══`);
console.log(`   prueba                             | días bl nEf |    MS      azar   exceso |   t   %A | contrato`);
console.log(`   ` + "─".repeat(112));
for (const [sen, nom] of [["s1e", "lado ENCOGIDO"], ["s3", "inusualidad"]]) {
  for (const H of [10, 20, 40]) {
    const r = probar({ sen, H, K: 3, campo: `a${H}`, nombre: `${nom} · H=${H} · |movimiento|` });
    if (r) { pruebas.push(r); linea(r); }
  }
}

// ── ¿la inusualidad (s3) marca amplitud? es la única con tercios monótonos ────────────────
console.log(`\n═══ LA ÚNICA QUE QUEDA VIVA: s3 (compra de calls INUSUAL) contra la amplitud ═══`);
console.log(`   tercios dentro del día, todos los candidatos, no sólo el top:`);
for (const H of [5, 10, 20, 40]) {
  const ak = `a${H}`;
  const v = C.filter((f) => f[ak] != null && f.s3 != null);
  const pd = new Map(); for (const f of v) { if (!pd.has(f.dia)) pd.set(f.dia, []); pd.get(f.dia).push(f); }
  const b = [[], [], []];
  for (const [, c] of pd) { if (c.length < 6) continue;
    const s = [...c].sort((x, y) => x.s3 - y.s3), n3 = Math.floor(s.length / 3);
    b[0].push(...s.slice(0, n3)); b[1].push(...s.slice(n3, s.length - n3)); b[2].push(...s.slice(s.length - n3)); }
  if (b.some((x) => !x.length)) continue;
  const m = b.map((x) => media(x.map((y) => y[ak])) * 100);
  console.log(`   H=${String(H).padStart(2)}  bajo ${m[0].toFixed(2)}%  medio ${m[1].toFixed(2)}%  alto ${m[2].toFixed(2)}%  ` +
    `${(m[0] < m[1] && m[1] < m[2]) ? "MONÓTONO ↑" : "no monótono"}  (alto−bajo = ${(m[2] - m[0]).toFixed(2)} pts)`);
}

// ── CUÁNTO FALTA: la muestra que haría falta para resolverlo ─────────────────────────────
console.log(`\n═══ CUÁNTO FALTA PARA PODER RESPONDER ═══`);
const mejor = pruebas.filter((p) => p.pctA > 0.5).sort((a, b) => b.t - a.t)[0];
const LISTON = listonT(56);
console.log(`   listón de t con toda la familia de MS: ${LISTON}`);
if (mejor) {
  console.log(`   la mejor de todas: ${mejor.nombre} → t=${mejor.t.toFixed(2)} con ${mejor.dias} días (${mejor.bloques} bloques)`);
  const factor = (LISTON / Math.max(0.01, mejor.t)) ** 2;
  console.log(`   para llegar al listón haría falta ${factor.toFixed(1)}× la muestra = ${Math.ceil(mejor.dias * factor)} días de flujo`);
  console.log(`   = ${(Math.ceil(mejor.dias * factor) / 252).toFixed(1)} años de datos. MarketSnack sólo guarda una ventana rodante de ~4 meses.`);
} else {
  console.log(`   NINGUNA prueba queda ni por encima del azar: no hay nada que ampliar.`);
}

// ── DINERO ────────────────────────────────────────────────────────────────────────────────
console.log(`\n═══ EN DINERO, SOBRE LA CUENTA DE $${CUENTA.toLocaleString("es")} ═══`);
const base = probar({ sen: "s1", H: 20, K: 3, campo: "r20", nombre: "base" });
const azarSolo = base ? base.azar : 0;
console.log(`   perfil convexo elegido AL AZAR : ${(azarSolo * 100).toFixed(1)}% por operación de 20 días`);
console.log(`   perfil convexo elegido POR MS   : ${(base.R * 100).toFixed(1)}% por operación de 20 días`);
const opsAño = 252 / 20 * 3;
console.log(`   entrando cada día con 3 contratos: ${(252 / 20).toFixed(0)} vueltas/año × 3 = ${opsAño.toFixed(0)} operaciones/año`);
console.log(`   capital vivo a la vez: 3 × 20 × $${Math.round(base.prima)} = $${Math.round(3 * 20 * base.prima).toLocaleString("es")}`);
const anualMS = 252 * base.R / 20, anualAz = 252 * azarSolo / 20;
console.log(`   → MS   : ${(anualMS * 100).toFixed(0)}%/año = $${Math.round(anualMS * Math.min(3 * 20 * base.prima, CUENTA)).toLocaleString("es")}/año`);
console.log(`   → azar : ${(anualAz * 100).toFixed(0)}%/año = $${Math.round(anualAz * Math.min(3 * 20 * base.prima, CUENTA)).toLocaleString("es")}/año`);
console.log(`   (las dos pierden: el perfil convexo comprado y revendido cada mes paga el peaje`);
console.log(`    de la horquilla ~21 puntos por vuelta. Elegir mejor no arregla eso.)`);

fs.writeFileSync(path.join("scripts", "marketsnack", "convex-6-salida.json"), JSON.stringify({ pruebas, base }), "utf8");
console.log(`\n## guardado en scripts/marketsnack/convex-6-salida.json`);
