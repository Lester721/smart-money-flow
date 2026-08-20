// ¿QUIÉN ESTÁ EN LOS TERCIOS? — la cartera larga-corta hay que EJECUTARLA, y el peaje depende
// de en qué nombres cae. Si los tercios están llenos de microcaps, la horquilla se lo come todo.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const DIR_FLUJO = "scripts/cache-theta/marketsnack/flujo-100k";
const DIR_CHART = "scripts/cache-theta/marketsnack/aux/chart-all";
const RE = /^([A-Z]+)(\d{6})([CP])(\d{8})$/;
const COMPRA = new Set(["ASKSIDE", "ABOVE_ASK", "AT_ASK"]), VENTA = new Set(["BIDSIDE", "BELOW_BID", "AT_BID"]);
const media = (a) => a.reduce((s, x) => s + x, 0) / a.length;

const cierres = new Map(), idxF = new Map();
for (const f of fs.readdirSync(DIR_CHART)) {
  const T = f.replace(".json.gz", "");
  const j = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(DIR_CHART, f))).toString("utf8"));
  const s = (j.data || []).map((p) => ({ f: p.t.slice(0, 10), c: p.v })).filter((p) => p.c > 0).sort((a, b) => a.f.localeCompare(b.f)).filter((p) => p.f < "2026-08-19");
  if (s.length < 30) continue;
  cierres.set(T, s); idxF.set(T, new Map(s.map((p, i) => [p.f, i])));
}
const dias = fs.readdirSync(DIR_FLUJO).filter((f) => f.endsWith(".jsonl.gz")).map((f) => f.slice(0, 10)).sort();
const agg = new Map(), primaTot = new Map();
for (const d of dias) {
  for (const l of zlib.gunzipSync(fs.readFileSync(path.join(DIR_FLUJO, `${d}.jsonl.gz`))).toString("utf8").split("\n")) {
    if (!l) continue;
    let t; try { t = JSON.parse(l); } catch { continue; }
    if (!t.timestamp || t.timestamp.slice(11, 16) >= "19:00") continue;
    const m = RE.exec(t.symbol || ""); if (!m) continue;
    const raiz = m[1], ser = cierres.get(raiz); if (!ser) continue;
    const k = `${raiz}|${d}`;
    primaTot.set(k, (primaTot.get(k) ?? 0) + (t.premium > 0 ? t.premium : 0));
    if (!Number.isFinite(t.delta) || !(t.size > 0)) continue;
    const sgn = COMPRA.has(t.side) ? -1 : VENTA.has(t.side) ? 1 : 0; if (!sgn) continue;
    if (!(t.ask_price > 0) || t.bid_price > t.ask_price) continue;
    const i = idxF.get(raiz).get(d); if (i == null || i < 1) continue;
    const S = ser[i - 1].c, ct = t.size * 100;
    let a = agg.get(k);
    if (!a) { a = { raiz, dia: d, dd: 0, absd: 0, n: 0, prima: 0, precio: ser[i].c }; agg.set(k, a); }
    a.dd += sgn * t.delta * ct * S; a.absd += Math.abs(t.delta) * ct * S; a.n++; a.prima += t.premium > 0 ? t.premium : 0;
  }
}
const sd = [...agg.values()].filter((a) => a.n >= 8 && a.prima / (primaTot.get(`${a.raiz}|${a.dia}`) || 1) >= 0.6);
for (const a of sd) a.iDelta = a.absd > 0 ? a.dd / a.absd : null;
const porDia = new Map();
for (const a of sd) { if (!porDia.has(a.dia)) porDia.set(a.dia, []); porDia.get(a.dia).push(a); }

const cuenta = new Map();
let plazas = 0;
const precios = new Map();
for (const [, arr] of porDia) {
  const con = arr.filter((a) => a.iDelta != null); if (con.length < 15) continue;
  con.sort((x, y) => x.iDelta - y.iDelta);
  const k = Math.floor(con.length / 3);
  for (const a of [...con.slice(0, k), ...con.slice(-k)]) {
    cuenta.set(a.raiz, (cuenta.get(a.raiz) ?? 0) + 1); plazas++;
    if (!precios.has(a.raiz)) precios.set(a.raiz, []);
    precios.get(a.raiz).push(a.precio);
  }
}
const orden = [...cuenta].sort((a, b) => b[1] - a[1]);
console.log(`plazas de cartera repartidas: ${plazas}  ·  nombres distintos que aparecen: ${orden.length}`);
let acum = 0; const top = [];
for (const [T, c] of orden) { acum += c; top.push([T, c, acum / plazas]); if (top.length <= 40) console.log(`  ${String(top.length).padStart(3)}. ${T.padEnd(6)} ${String(c).padStart(4)} plazas (${((100 * c) / plazas).toFixed(2)}%)  acumulado ${(100 * acum / plazas).toFixed(1)}%  precio medio $${media(precios.get(T)).toFixed(2)}`); }
for (const q of [0.5, 0.8, 0.9]) {
  const i = top.findIndex((x) => x[2] >= q);
  console.log(`  el ${(100 * q).toFixed(0)}% de las plazas lo copan ${i + 1} nombres`);
}
const baratos = orden.filter(([T]) => media(precios.get(T)) < 20);
console.log(`\nnombres con precio medio <$20 (horquilla relativa cara): ${baratos.length}, ${((100 * baratos.reduce((a, [, c]) => a + c, 0)) / plazas).toFixed(1)}% de las plazas`);
console.log(`ejemplos: ${baratos.slice(0, 20).map(([T]) => T).join(" ")}`);
fs.writeFileSync("scripts/marketsnack/universo-tercios.json", JSON.stringify(orden.map(([T, c]) => ({ T, plazas: c, precioMedio: media(precios.get(T)) })), null, 1));
