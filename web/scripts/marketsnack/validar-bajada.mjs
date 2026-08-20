// VALIDAR LA BAJADA — abriendo los ficheros, no contándolos.
//
// El recuento MIENTE. Un fichero puede existir, pesar, tener el número de líneas esperado y
// estar lleno de nulos; un campo que no existe se lee como 0 y 45 minutos después sigues
// midiendo cero. Aquí se descomprime CADA fichero y se mira dentro:
//
//   · cuántos días, cuántas operaciones, qué rango de fechas
//   · HUECOS en el calendario (días de mercado sin fichero) — y si el hueco es festivo o pérdida
//   · por CAMPO: % nulo, % cero, nº de valores distintos  → campos muertos a la vista
//   · la ruptura del 2026-07-16 medida en el disco, no supuesta
//   · concentración por ticker: si SPX es el 34%, cualquier medición mide SPX
//
// Uso: node scripts/marketsnack/validar-bajada.mjs [--piso 1000000]

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const PISO = Number(arg("--piso", 1000000));
const ETIQUETA = PISO >= 1000 ? `${Math.round(PISO / 1000)}k` : String(PISO);
const RAIZ = path.join("scripts", "cache-theta", "marketsnack");
const DIR = path.join(RAIZ, `flujo-${ETIQUETA}`);
const finde = (s) => { const g = new Date(s + "T12:00:00Z").getUTCDay(); return g === 0 || g === 6; };

if (!fs.existsSync(DIR)) { console.log(`✗ no existe ${DIR}`); process.exit(1); }

const ficheros = fs.readdirSync(DIR).filter((f) => f.endsWith(".jsonl.gz")).sort();
const parciales = fs.readdirSync(DIR).filter((f) => f.endsWith(".parcial"));
console.log(`\n╔═══ VALIDACIÓN · flujo piso $${PISO.toLocaleString("es-ES")} ═══╗`);
console.log(`   ${ficheros.length} ficheros cerrados · ${parciales.length} parciales a medias\n`);

// ── se abre CADA fichero ────────────────────────────────────────────────────────────────
const CAMPOS = ["id", "timestamp", "symbol", "asset_price", "price", "bid_price", "ask_price",
  "bid_size", "ask_size", "size", "premium", "volume", "open_interest", "side", "sentiment",
  "score", "delta", "gamma", "theta", "vega", "implied_volatility", "break_even",
  "break_even_percentage", "exchange_id", "trade_condition_id", "sequence_number"];

const acc = Object.fromEntries(CAMPOS.map((c) => [c, { nulo: 0, cero: 0, distintos: new Set() }]));
const porDia = [];
const tickers = new Map();
let totalOps = 0, bytesDisco = 0, rotos = [];

for (const f of ficheros) {
  const dia = f.slice(0, 10);
  const p = path.join(DIR, f);
  bytesDisco += fs.statSync(p).size;
  let lineas;
  try { lineas = zlib.gunzipSync(fs.readFileSync(p)).toString("utf8").split("\n").filter(Boolean); }
  catch (e) { rotos.push({ f, error: String(e.message).slice(0, 60) }); continue; }

  let n = 0, nulosPrecio = 0, score0 = 0, fuera = 0, tmin = null, tmax = null;
  const ids = new Set();
  for (const ln of lineas) {
    let o; try { o = JSON.parse(ln); } catch { continue; }
    n++; totalOps++;
    ids.add(o.id);
    const ts = o.timestamp;
    if (ts) { if (!tmin || ts < tmin) tmin = ts; if (!tmax || ts > tmax) tmax = ts; if (ts.slice(0, 10) !== dia) fuera++; }
    if (o.asset_price == null) nulosPrecio++;
    if (o.score === 0) score0++;
    const raiz = /^([A-Z]+)\d{6}[CP]\d{8}$/.exec(o.symbol ?? "")?.[1] ?? o.symbol;
    tickers.set(raiz, (tickers.get(raiz) ?? 0) + 1);
    for (const c of CAMPOS) {
      const v = o[c];
      const a = acc[c];
      if (v == null || (typeof v === "number" && !Number.isFinite(v))) a.nulo++;
      else { if (v === 0) a.cero++; if (a.distintos.size < 5000) a.distintos.add(typeof v === "number" ? Math.round(v * 1e6) : v); }
    }
  }
  porDia.push({ dia, n, unicos: ids.size, nulosPrecio, score0, fuera, tmin, tmax, kb: Math.round(fs.statSync(p).size / 1024) });
}

if (rotos.length) { console.log(`   ✗ ${rotos.length} ficheros ILEGIBLES: ${rotos.map((r) => r.f).join(", ")}\n`); }

// ── 1 · cobertura y huecos del calendario ───────────────────────────────────────────────
const dias = porDia.map((d) => d.dia).sort();
const primero = dias[0], ultimo = dias[dias.length - 1];
console.log(`═══ 1 · COBERTURA ═══`);
console.log(`   rango          : ${primero}  →  ${ultimo}`);
console.log(`   días con datos : ${dias.length}`);
console.log(`   operaciones    : ${totalOps.toLocaleString("es-ES")}`);
console.log(`   en disco       : ${(bytesDisco / 1e6).toFixed(1)} MB comprimidos`);

const tengo = new Set(dias);
const huecos = [];
for (let t = Date.parse(primero + "T12:00:00Z"); t <= Date.parse(ultimo + "T12:00:00Z"); t += 86400000) {
  const d = new Date(t).toISOString().slice(0, 10);
  if (!finde(d) && !tengo.has(d)) huecos.push(d);
}
console.log(`   huecos         : ${huecos.length ? huecos.join(", ") : "NINGUNO (todos los días de mercado del rango)"}`);
if (huecos.length) console.log(`      ⚠ hay que mirar uno a uno si son festivos de mercado o pérdida de datos.`);

const vacios = porDia.filter((d) => d.n === 0).map((d) => d.dia);
if (vacios.length) console.log(`   ⚠ ficheros con CERO operaciones: ${vacios.join(", ")}`);
const conDup = porDia.filter((d) => d.n !== d.unicos);
if (conDup.length) console.log(`   ⚠ días con ids repetidos: ${conDup.map((d) => `${d.dia}(${d.n - d.unicos})`).join(", ")}`);
const conFuera = porDia.filter((d) => d.fuera > 0);
console.log(`   filas fuera de su día: ${conFuera.length ? conFuera.map((d) => `${d.dia}=${d.fuera}`).join(", ") : "0 (el filtro por fecha se respeta en TODAS)"}`);

// ── 2 · campos: nulos, ceros, variedad ──────────────────────────────────────────────────
console.log(`\n═══ 2 · CAMPOS (sobre ${totalOps.toLocaleString("es-ES")} operaciones) ═══`);
console.log(`   ${"campo".padEnd(24)} ${"% nulo".padStart(8)} ${"% cero".padStart(8)} ${"distintos".padStart(10)}   estado`);
for (const c of CAMPOS) {
  const a = acc[c];
  const pn = totalOps ? (100 * a.nulo / totalOps) : 0;
  const pc = totalOps ? (100 * a.cero / totalOps) : 0;
  const nd = a.distintos.size;
  const muerto = pn > 95 || pc > 95 || nd < 2;
  const flojo = pn > 30 || nd < 10;
  console.log(`   ${c.padEnd(24)} ${pn.toFixed(1).padStart(8)} ${pc.toFixed(1).padStart(8)} ${String(nd >= 5000 ? "≥5000" : nd).padStart(10)}   ` +
    (muerto ? "✗ MUERTO — no se puede medir con él" : flojo ? "⚠ flojo" : "ok"));
}

// ── 3 · la ruptura del 2026-07-16, medida en disco ──────────────────────────────────────
console.log(`\n═══ 3 · LA RUPTURA DEL 2026-07-16 (medida aquí, no supuesta) ═══`);
const antes = porDia.filter((d) => d.dia < "2026-07-16");
const desde = porDia.filter((d) => d.dia >= "2026-07-16");
const pct = (g, k) => { const n = g.reduce((a, x) => a + x.n, 0); return n ? (100 * g.reduce((a, x) => a + x[k], 0) / n) : 0; };
console.log(`   ANTES  (${antes.length} días, ${antes.reduce((a, x) => a + x.n, 0).toLocaleString("es-ES")} ops): asset_price nulo ${pct(antes, "nulosPrecio").toFixed(1)}% · score=0 ${pct(antes, "score0").toFixed(1)}%`);
console.log(`   DESDE  (${desde.length} días, ${desde.reduce((a, x) => a + x.n, 0).toLocaleString("es-ES")} ops): asset_price nulo ${pct(desde, "nulosPrecio").toFixed(1)}% · score=0 ${pct(desde, "score0").toFixed(1)}%`);
console.log(`   → los dos tramos son POBLACIONES DISTINTAS. Cualquier medición se parte por esa fecha.`);

// ── 4 · concentración ───────────────────────────────────────────────────────────────────
const orden = [...tickers.entries()].sort((a, b) => b[1] - a[1]);
console.log(`\n═══ 4 · CONCENTRACIÓN ═══`);
console.log(`   tickers distintos: ${tickers.size}`);
console.log(`   top: ${orden.slice(0, 10).map(([k, v]) => `${k}=${(100 * v / totalOps).toFixed(1)}%`).join("  ")}`);
const may = 100 * (orden[0]?.[1] ?? 0) / (totalOps || 1);
console.log(`   el mayor se lleva ${may.toFixed(1)}%` + (may > 20 ? `  ⚠ POR ENCIMA del 20% de pasarBarrera(): sin tope por ticker se mide ${orden[0][0]} y se llama "el mercado"` : ""));

// ── 5 · día a día ───────────────────────────────────────────────────────────────────────
console.log(`\n═══ 5 · DÍA A DÍA ═══`);
console.log(`   ${"día".padEnd(12)} ${"ops".padStart(7)} ${"kB".padStart(6)}  ${"primera".padEnd(9)} ${"última".padEnd(9)} ${"a_price nulo".padStart(13)}`);
for (const d of porDia) {
  console.log(`   ${d.dia.padEnd(12)} ${String(d.n).padStart(7)} ${String(d.kb).padStart(6)}  ${(d.tmin ?? "").slice(11, 19).padEnd(9)} ${(d.tmax ?? "").slice(11, 19).padEnd(9)} ${(d.n ? (100 * d.nulosPrecio / d.n).toFixed(0) + "%" : "—").padStart(13)}`);
}

// ── 6 · lo auxiliar ─────────────────────────────────────────────────────────────────────
const AUX = path.join(RAIZ, "aux");
if (fs.existsSync(AUX)) {
  console.log(`\n═══ 6 · AUXILIARES (abiertos, no contados) ═══`);
  const ch = path.join(AUX, "chart-all");
  if (fs.existsSync(ch)) {
    const fs2 = fs.readdirSync(ch);
    let pts = 0, min = null, max = null, vacios2 = 0;
    for (const f of fs2) {
      const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(ch, f))).toString("utf8"));
      const d = j?.data ?? [];
      if (!d.length) { vacios2++; continue; }
      pts += d.length;
      const t0 = d[0].t, t1 = d[d.length - 1].t;
      if (!min || t0 < min) min = t0; if (!max || t1 > max) max = t1;
    }
    console.log(`   chart-all   ${fs2.length} tickers · ${pts.toLocaleString("es-ES")} barras · ${(min ?? "").slice(0, 10)} → ${(max ?? "").slice(0, 10)}` + (vacios2 ? ` · ⚠ ${vacios2} vacíos` : ""));
  }
  for (const sub of ["gex", "cadenas"]) {
    const d0 = path.join(AUX, sub);
    if (!fs.existsSync(d0)) continue;
    for (const fecha of fs.readdirSync(d0)) {
      const fss = fs.readdirSync(path.join(d0, fecha));
      let filas = 0;
      for (const f of fss.slice(0, 400)) {
        const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(d0, fecha, f))).toString("utf8"));
        filas += Array.isArray(j) ? j.length : (j?.data?.length ?? Object.values(j).reduce((a, x) => a + (x?.data?.length ?? 0), 0));
      }
      console.log(`   ${sub.padEnd(10)} ${fecha} · ${fss.length} ficheros · ${filas.toLocaleString("es-ES")} filas dentro`);
    }
  }
}

console.log(`\n╚═══ FIN ═══╝\n`);
