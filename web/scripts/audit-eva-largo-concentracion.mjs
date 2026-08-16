// AUDITORÍA ADVERSARIA (solo lectura) del test scripts/eva-comprar-largo.mjs
//
// Uso: node --max-old-space-size=6144 scripts/audit-eva-largo-concentracion.mjs
//
// NO modifica nada. Lee scripts/eva-largo-filas.json y scripts/cache-theta/SPY_bars_*.json.
//
// Ataques:
//   1. Concentración: cuota por ticker en CADA horizonte; qué queda al quitar NVDA y TSLA;
//      leave-one-ticker-out completo.
//   2. Reparto de la diferencia por ticker y por año (¿vive en un activo o en un período?).
//   3. Régimen: partir por meses en que SPY bajó (mes de entrada) y por el signo del SPY
//      DURANTE la ventana de tenencia.
//   4. Independencia: t agrupado (cluster-robust) por ticker×día y por ticker×mes, porque el
//      t=17,55 declarado asume 32.415 observaciones independientes.

import { readFileSync } from "node:fs";

const ENTRADA = "scripts/eva-largo-filas.json";
const SPYBARS = "scripts/cache-theta/SPY_bars_20151122_20270308.json";
const HORIZONTES = [30, 90, 180, 365];

const filas = JSON.parse(readFileSync(ENTRADA, "utf8"));
const spy = JSON.parse(readFileSync(SPYBARS, "utf8"));   // [{time:"YYYY-MM-DD", close}]

// ── utilidades ──────────────────────────────────────────────────────────────
const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN);
const sd = (v) => {
  if (v.length < 2) return NaN;
  const m = media(v);
  return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1));
};
const tCero = (v) => (v.length < 2 ? NaN : media(v) / (sd(v) / Math.sqrt(v.length)));
const pct = (x) => (Number.isFinite(x) ? `${x >= 0 ? "+" : "-"}${Math.abs(x * 100).toFixed(2)}%` : "   n/a");
const iso = (ymd) => `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;

/** t agrupado: media de las medias por grupo, error estándar entre grupos (cluster-robust simple). */
function tAgrupado(pares) {   // pares = [[clave, valor], ...]
  const g = new Map();
  for (const [k, v] of pares) (g.get(k) ?? g.set(k, []).get(k)).push(v);
  const medias = [...g.values()].map(media);
  return { t: tCero(medias), grupos: medias.length, mediaDeMedias: media(medias) };
}

// ── SPY: cierre diario, retorno mensual y retorno de ventana ────────────────
const cierre = new Map(spy.map((b) => [b.time, b.close]));
const diasSpy = spy.map((b) => b.time).sort();
const ultimoDelMes = new Map();
for (const b of spy) ultimoDelMes.set(b.time.slice(0, 7), b.close);   // recorrido en orden -> queda el último
const mesesOrd = [...ultimoDelMes.keys()].sort();
const retMes = new Map();
for (let i = 1; i < mesesOrd.length; i++)
  retMes.set(mesesOrd[i], ultimoDelMes.get(mesesOrd[i]) / ultimoDelMes.get(mesesOrd[i - 1]) - 1);

/** Cierre de SPY en la fecha, o el primero anterior/igual disponible. */
function cierreEnOAntes(fecha) {
  if (cierre.has(fecha)) return cierre.get(fecha);
  let lo = 0, hi = diasSpy.length - 1, res = null;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (diasSpy[m] <= fecha) { res = diasSpy[m]; lo = m + 1; } else hi = m - 1; }
  return res ? cierre.get(res) : null;
}

// ═══════════════════════════════════════════════════════════════════════════
console.log(`filas: ${filas.length.toLocaleString("es-ES")}`);
console.log(`SPY bars: ${spy.length} (${spy[0].time} -> ${spy[spy.length - 1].time})\n`);

// Recolector: por horizonte, lista de {ticker, dia, d, ...}
const porH = new Map();
for (const H of HORIZONTES) {
  const l = [];
  for (const f of filas) {
    const m = f.h[H];
    if (!m) continue;
    l.push({ ticker: f.ticker, dia: f.dia, d: m.d, t: m.t, c: m.c, diaSal: m.diaSal, right: f.right });
  }
  porH.set(H, l);
}

// ── 0. LÍNEA BASE: reproducir los números declarados ────────────────────────
console.log("═══ 0 · LÍNEA BASE (reproducción de lo declarado) ═══");
console.log("horiz       n   ret flujo    ret cubo   DIFERENCIA        t");
for (const H of HORIZONTES) {
  const l = porH.get(H);
  const d = l.map((x) => x.d);
  console.log(`${String(H).padStart(4)} d ${String(l.length).padStart(7)}  ${pct(media(l.map((x) => x.t))).padStart(9)}  ` +
    `${pct(media(l.map((x) => x.c))).padStart(9)}  ${pct(media(d)).padStart(10)}  ${tCero(d).toFixed(2).padStart(7)}`);
}

// ── 1. CONCENTRACIÓN POR TICKER EN CADA HORIZONTE ───────────────────────────
console.log("\n═══ 1 · CUOTA POR TICKER EN CADA HORIZONTE (tope que este repo se impuso: 20%) ═══");
for (const H of HORIZONTES) {
  const l = porH.get(H);
  const c = new Map();
  for (const x of l) c.set(x.ticker, (c.get(x.ticker) ?? 0) + 1);
  const orden = [...c].sort((a, b) => b[1] - a[1]);
  console.log(`\n  ${H} d  (n=${l.length}):`);
  for (const [t, n] of orden) {
    const p = n / l.length;
    console.log(`    ${t.padEnd(6)} ${String(n).padStart(6)}  ${(p * 100).toFixed(1).padStart(5)}%${p > 0.2 ? "   <<< PASA DEL 20%" : ""}`);
  }
}

// ── 2. QUITAR NVDA Y TSLA ───────────────────────────────────────────────────
console.log("\n═══ 2 · QUÉ QUEDA AL QUITAR NVDA Y TSLA ═══");
console.log("horiz   n(todos)  dif(todos)   t   |  n(sin NVDA/TSLA)  dif    t    | dif solo NVDA+TSLA");
for (const H of HORIZONTES) {
  const l = porH.get(H);
  const todos = l.map((x) => x.d);
  const sin = l.filter((x) => x.ticker !== "NVDA" && x.ticker !== "TSLA").map((x) => x.d);
  const solo = l.filter((x) => x.ticker === "NVDA" || x.ticker === "TSLA").map((x) => x.d);
  console.log(`${String(H).padStart(4)} d ${String(todos.length).padStart(8)} ${pct(media(todos)).padStart(10)} ${tCero(todos).toFixed(2).padStart(6)}  | ` +
    `${String(sin.length).padStart(8)} ${pct(media(sin)).padStart(10)} ${tCero(sin).toFixed(2).padStart(6)}  | ` +
    `${String(solo.length).padStart(7)} ${pct(media(solo)).padStart(10)} ${tCero(solo).toFixed(2).padStart(6)}`);
}

// ── 3. LEAVE-ONE-TICKER-OUT ─────────────────────────────────────────────────
console.log("\n═══ 3 · LEAVE-ONE-TICKER-OUT (¿aguanta la diferencia sin cada activo?) ═══");
for (const H of HORIZONTES) {
  const l = porH.get(H);
  const tickers = [...new Set(l.map((x) => x.ticker))].sort();
  console.log(`\n  ${H} d  base = ${pct(media(l.map((x) => x.d)))} (t=${tCero(l.map((x) => x.d)).toFixed(2)})`);
  for (const T of tickers) {
    const sin = l.filter((x) => x.ticker !== T).map((x) => x.d);
    console.log(`    sin ${T.padEnd(6)} n=${String(sin.length).padStart(6)}  dif=${pct(media(sin)).padStart(9)}  t=${tCero(sin).toFixed(2).padStart(6)}`);
  }
}

// ── 4. REPARTO POR TICKER (contribución a la diferencia) ────────────────────
console.log("\n═══ 4 · LA DIFERENCIA, POR TICKER (contribución = cuota x diferencia del ticker) ═══");
for (const H of HORIZONTES) {
  const l = porH.get(H);
  const g = new Map();
  for (const x of l) (g.get(x.ticker) ?? g.set(x.ticker, []).get(x.ticker)).push(x.d);
  const total = media(l.map((x) => x.d));
  console.log(`\n  ${H} d  ·  diferencia total ${pct(total)}`);
  console.log("    ticker      n   cuota    dif ticker      t      contribución   % del total");
  const filasT = [...g].map(([t, v]) => ({ t, n: v.length, cuota: v.length / l.length, dif: media(v), tt: tCero(v) }));
  filasT.sort((a, b) => b.cuota * b.dif - a.cuota * a.dif);
  for (const r of filasT) {
    const contrib = r.cuota * r.dif;
    console.log(`    ${r.t.padEnd(6)} ${String(r.n).padStart(6)} ${(r.cuota * 100).toFixed(1).padStart(6)}%  ${pct(r.dif).padStart(10)} ${r.tt.toFixed(2).padStart(7)}  ` +
      `${pct(contrib).padStart(11)}   ${((contrib / total) * 100).toFixed(1).padStart(6)}%`);
  }
}

// ── 5. POR AÑO Y POR TICKERxAÑO ─────────────────────────────────────────────
console.log("\n═══ 5 · POR AÑO DE ENTRADA ═══");
for (const H of HORIZONTES) {
  const l = porH.get(H);
  const g = new Map();
  for (const x of l) { const a = x.dia.slice(0, 4); (g.get(a) ?? g.set(a, []).get(a)).push(x.d); }
  console.log(`\n  ${H} d:`);
  for (const [a, v] of [...g].sort()) console.log(`    ${a}  n=${String(v.length).padStart(6)}  dif=${pct(media(v)).padStart(9)}  t=${tCero(v).toFixed(2).padStart(7)}`);
}

console.log("\n═══ 5b · TICKER x AÑO a 180 d (¿vive en una celda?) ═══");
{
  const l = porH.get(180);
  const g = new Map();
  for (const x of l) { const k = `${x.ticker}|${x.dia.slice(0, 4)}`; (g.get(k) ?? g.set(k, []).get(k)).push(x.d); }
  const total = media(l.map((x) => x.d));
  const rs = [...g].map(([k, v]) => ({ k, n: v.length, contrib: (v.length / l.length) * media(v), dif: media(v) }));
  rs.sort((a, b) => b.contrib - a.contrib);
  console.log(`  total ${pct(total)}   ·   celdas ordenadas por contribución`);
  for (const r of rs) console.log(`    ${r.k.padEnd(12)} n=${String(r.n).padStart(5)}  dif=${pct(r.dif).padStart(9)}  contrib=${pct(r.contrib).padStart(9)}  (${((r.contrib / total) * 100).toFixed(0)}% del total)`);
}

// ── 6. POR MES DE ENTRADA (¿un puñado de meses?) ────────────────────────────
console.log("\n═══ 6 · POR MES DE ENTRADA, con el retorno de SPY de ese mes ═══");
for (const H of [30, 180]) {
  const l = porH.get(H);
  const g = new Map();
  for (const x of l) { const k = iso(x.dia).slice(0, 7); (g.get(k) ?? g.set(k, []).get(k)).push(x.d); }
  const total = media(l.map((x) => x.d));
  console.log(`\n  ${H} d · total ${pct(total)}`);
  console.log("    mes      SPY mes      n     dif      t     contrib   % del total");
  for (const [m, v] of [...g].sort()) {
    const contrib = (v.length / l.length) * media(v);
    console.log(`    ${m}  ${pct(retMes.get(m) ?? NaN).padStart(8)} ${String(v.length).padStart(6)} ${pct(media(v)).padStart(9)} ${tCero(v).toFixed(2).padStart(7)} ${pct(contrib).padStart(9)}  ${((contrib / total) * 100).toFixed(0).padStart(5)}%`);
  }
}

// ── 7. RÉGIMEN: meses en que SPY BAJÓ ───────────────────────────────────────
console.log("\n═══ 7 · RÉGIMEN A · mes de ENTRADA en que SPY bajó vs subió ═══");
console.log("horiz  |  SPY mes ABAJO: n / dif / t   |  SPY mes ARRIBA: n / dif / t");
for (const H of HORIZONTES) {
  const l = porH.get(H);
  const ab = [], ar = [];
  for (const x of l) {
    const r = retMes.get(iso(x.dia).slice(0, 7));
    if (r == null || !Number.isFinite(r)) continue;
    (r < 0 ? ab : ar).push(x.d);
  }
  console.log(`${String(H).padStart(4)} d  | ${String(ab.length).padStart(6)} ${pct(media(ab)).padStart(9)} ${tCero(ab).toFixed(2).padStart(7)}  | ` +
    `${String(ar.length).padStart(6)} ${pct(media(ar)).padStart(9)} ${tCero(ar).toFixed(2).padStart(7)}`);
}

console.log("\n═══ 7b · RÉGIMEN B · signo de SPY DURANTE la ventana (entrada -> salida) ═══");
console.log("horiz  |  SPY bajó en la ventana: n / dif / t   |  SPY subió: n / dif / t   |  sin dato SPY");
for (const H of HORIZONTES) {
  const l = porH.get(H);
  const ab = [], ar = [];
  let sinDato = 0;
  for (const x of l) {
    const c0 = cierreEnOAntes(iso(x.dia)), c1 = x.diaSal ? cierreEnOAntes(iso(x.diaSal)) : null;
    if (!c0 || !c1) { sinDato++; continue; }
    (c1 < c0 ? ab : ar).push(x.d);
  }
  console.log(`${String(H).padStart(4)} d  | ${String(ab.length).padStart(6)} ${pct(media(ab)).padStart(9)} ${tCero(ab).toFixed(2).padStart(7)}  | ` +
    `${String(ar.length).padStart(6)} ${pct(media(ar)).padStart(9)} ${tCero(ar).toFixed(2).padStart(7)}  | ${sinDato}`);
}

// ── 8. INDEPENDENCIA: t agrupado ────────────────────────────────────────────
console.log("\n═══ 8 · ¿SON 32.415 OBSERVACIONES INDEPENDIENTES? · t agrupado ═══");
console.log("(el t declarado trata cada fila como independiente; muchas filas comparten ticker, día");
console.log(" y hasta contrato, y las ventanas de 180/365 d se solapan casi enteras)\n");
console.log("horiz     t crudo   | t por ticker-dia (grupos) | t por ticker-mes (grupos) | t por ticker (grupos)");
for (const H of HORIZONTES) {
  const l = porH.get(H);
  const crudo = tCero(l.map((x) => x.d));
  const gd = tAgrupado(l.map((x) => [`${x.ticker}|${x.dia}`, x.d]));
  const gm = tAgrupado(l.map((x) => [`${x.ticker}|${x.dia.slice(0, 6)}`, x.d]));
  const gt = tAgrupado(l.map((x) => [x.ticker, x.d]));
  console.log(`${String(H).padStart(4)} d ${crudo.toFixed(2).padStart(10)}   | ` +
    `${gd.t.toFixed(2).padStart(6)} (${String(gd.grupos).padStart(5)})            | ` +
    `${gm.t.toFixed(2).padStart(6)} (${String(gm.grupos).padStart(3)})              | ` +
    `${gt.t.toFixed(2).padStart(6)} (${gt.grupos})`);
}

// ── 9. CUÁNTAS FILAS SON EL MISMO CONTRATO ──────────────────────────────────
console.log("\n═══ 9 · FILAS DUPLICADAS POR CONTRATO (mismo ticker/dia/exp/strike/tipo) ═══");
for (const H of HORIZONTES) {
  const l = filas.filter((f) => f.h[H]);
  const c = new Map();
  for (const f of l) { const k = `${f.ticker}|${f.dia}|${f.exp}|${f.strike}|${f.right}`; c.set(k, (c.get(k) ?? 0) + 1); }
  const unicos = c.size;
  const max = Math.max(...c.values());
  // media por contrato único
  const g = new Map();
  for (const f of l) { const k = `${f.ticker}|${f.dia}|${f.exp}|${f.strike}|${f.right}`; (g.get(k) ?? g.set(k, []).get(k)).push(f.h[H].d); }
  const medias = [...g.values()].map(media);
  console.log(`${String(H).padStart(4)} d  filas=${String(l.length).padStart(6)}  contratos unicos=${String(unicos).padStart(6)} ` +
    `(${((unicos / l.length) * 100).toFixed(1)}%)  max repeticiones=${max}  ·  dif por contrato unico=${pct(media(medias))} t=${tCero(medias).toFixed(2)}`);
}
